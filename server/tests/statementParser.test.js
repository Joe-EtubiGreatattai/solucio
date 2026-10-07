const { parseStatementText } = require('../src/services/statementParser');

test('assembles wrapped named-date rows with adjacent debit, credit and balance columns', () => {
  const transactions = parseStatementText(`
Posted DateValue DateDescriptionDebit (NGN)Credit (NGN)Balance (NGN)
02-JAN-2631-DEC-25
MOBILE BILLS PYMT/ AIRTEL DATA/09113677105
1,500.00-8,780.01
08-JAN-2608-JAN-26NIP TFR FROM PATIENT ACCOUNT-80,000.0083,869.26
`);
  expect(transactions).toEqual([
    expect.objectContaining({ narration: 'MOBILE BILLS PYMT/ AIRTEL DATA/09113677105', direction: 'expense', amount: 150000 }),
    expect.objectContaining({ narration: 'NIP TFR FROM PATIENT ACCOUNT', direction: 'income', amount: 8000000 }),
  ]);
});

describe('Zenith Bank layout', () => {
  const zenith = `
Account NameAccount NoOpening Balance DateLedger Balance
SOLUCIO CLINICS101514958801/01/2026NGN 266,913.58
Create DateEffective DateCheck NoDescription/Payee/MemoDebit AmountCredit AmountBalance
CLEARED ITEMS
01/01/202601/01/2026VAT on Commission 2057KO000001215-
01-01-2026
NGN 74.96NGN 266,838.62
01/01/202601/01/2026 POS Settlement for 2057KO000001215-
01-01-2026
NGN 199,880.00NGN 466,718.62
01/01/202601/01/2026NIP/FAIR/Shehu Bin Ebaiya/NGN 310,000.00NGN 776,718.62
02/01/202602/01/2026NIP/FCMB/BANHAZ ENTERPRISES
LIMITED/webAppMedical bill 4 Ismaila
Create DateEffective DateCheck NoDescription/Payee/MemoDebit AmountCredit AmountBalance
Abubakar To Zenith Bank SOLUCI
NGN 37,500.00NGN 814,218.62
04/01/202605/01/2026MC Loc POS Prch-018447639081--
SAHAD STORES LIMITED  SLAGOS
NG-
NGN 62,300.00NGN 751,918.62
Total Debits: 2     Total Credits: 3NGN 62,374.96NGN 547,380.00Cleared Balance: NGN
750,769.22
UNCLEARED ITEMS
No uncleared items
Total DebitTotal CreditLedger Balance
NGN 62,374.96NGN 547,380.00NGN 750,769.22
`;

  test('reads every row, ignoring wrapped dates, repeated headers and the closing summary', () => {
    const rows = parseStatementText(zenith);
    expect(rows.map((r) => [r.direction, r.amount])).toEqual([
      ['expense', 7496], ['income', 19988000], ['income', 31000000], ['income', 3750000], ['expense', 6230000],
    ]);
  });

  test('joins wrapped descriptions and uses the posting date', () => {
    const rows = parseStatementText(zenith);
    expect(rows[0]).toMatchObject({ narration: 'VAT on Commission 2057KO000001215- 01-01-2026', date: new Date('2026-01-01T00:00:00.000Z') });
    expect(rows[3].narration).toBe('NIP/FCMB/BANHAZ ENTERPRISES LIMITED/webAppMedical bill 4 Ismaila Abubakar To Zenith Bank SOLUCI');
    expect(rows[4]).toMatchObject({ narration: 'MC Loc POS Prch-018447639081-- SAHAD STORES LIMITED SLAGOS NG-', date: new Date('2026-01-04T00:00:00.000Z') });
  });

  test('works out money in or out from the running balance, not keywords', () => {
    // "VAT on Commission" lowers the balance, "POS Settlement" raises it; the text alone would not say.
    const [vat, settlement] = parseStatementText(zenith);
    expect(vat.direction).toBe('expense');
    expect(settlement.direction).toBe('income');
  });
});

test('reads the account holder\'s name from a Zenith statement header', () => {
  const { accountHolderOf } = require('../src/services/statementParser');
  expect(accountHolderOf('Account NameAccount NoOpening Balance DateLedger Balance\nSOLUCIO CLINICS101514958801/01/2026NGN 266,913.58\nCreate DateEffective Date')).toBe('SOLUCIO CLINICS');
  expect(accountHolderOf('no header here')).toBe('');
});
