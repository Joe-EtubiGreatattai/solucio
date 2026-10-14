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

describe('Moniepoint layout', () => {
  // pdf-parse glues each row's reference to its Debit/Credit/Balance amounts with no spaces,
  // splits the timestamp across two lines, and wraps long narrations. One of Debit/Credit is
  // always 0.00, so direction comes from whichever column carries the money.
  const moniepoint = `
Account Statement
Business Name
SOLUCIO CLINICS LIMITED
Account Number
6614549992
Opening
Balance
0.00
Total
Debits
17,833,517.43
DateNarrationReferenceDebitCreditBalance
2026-02-24T19:
28:12
Moniepoint active - FROM SOLUCIO CLINICS000015260224192810000005411418_CREDIT_00.0026,000.0026,000.00
2026-02-24T19:
30:30
TERMINAL_ACTIVATION from *****57535 to *****11200TAC|2MPTkrkck|2026364125348438016_DEBIT_023,500.000.002,500.00
2026-03-17T23:
08:31
Value Added TaxTRF|2MPTmlv8c|2034029136007036928_DEBIT_11.500.001,500,878.00
2026-03-17T23:
08:31
Stamp dutyTRF|2MPTmlv8c|2034029136007036928_DEBIT_250.000.001,500,828.00
2026-04-22T14:
41:59
TRANSFER TO NUCLEAR ASSOCIATE & CONSULTANCY SERVICES LTD - Nuclear Associate 26 Moniepoint MFB *****47972
/TRF|2MPTmlv8c|2046947627141857280
TRF|2MPTmlv8c|2046947627141857280_DEBIT_0120,000.000.004,500,228.00
2026-04-25T08:
14:09
22G, 3-way SILICON CATHETERTRF|2MPTmlv8c|2047936776156545024_DEBIT_0_RVSL0.0035,020.003,924,801.57
2026-02-27T19:
54:41
MOBILE TRF TO MMF Dr Nwafulume Nnaemeka SOLUCIO
CLINICS LIMITED
AP_TRSF|5232302244|2027457375386210304_BUSINESS_CREDIT_00.00499,900.00500,999.50
2026-05-28T14:
35
Periop CONSULTANCY PAUL GOWONTRF|2MPTmlv8c|2059991831430332416_DEBIT_0150,020.000.001,156,443.07
`;

  test('reads every posted row and works out direction from the money column', () => {
    const rows = parseStatementText(moniepoint);
    expect(rows.map((r) => [r.direction, r.amount])).toEqual([
      ['income', 2600000],   // Moniepoint active credit
      ['expense', 2350000],  // terminal activation debit
      ['expense', 150],      // VAT: index digit (_DEBIT_1) must not merge into 1.50
      ['expense', 5000],     // stamp duty is ₦50.00 (_DEBIT_2 is the sub-charge index, not part of the amount)
      ['expense', 12000000], // transfer debit, narration wrapped over two lines
      ['income', 3502000],   // reversal (_RVSL) of a debit returns money
      ['income', 49990000],  // business credit, narration wrapped
      ['expense', 15002000], // consultancy debit with a truncated timestamp line
    ]);
  });

  test('keeps the human narration and drops the glued reference', () => {
    const rows = parseStatementText(moniepoint);
    expect(rows[0]).toMatchObject({ narration: 'Moniepoint active - FROM SOLUCIO CLINICS', date: new Date('2026-02-24T00:00:00.000Z') });
    expect(rows[2].narration).toBe('Value Added Tax');
    expect(rows[4].narration).toBe('TRANSFER TO NUCLEAR ASSOCIATE & CONSULTANCY SERVICES LTD - Nuclear Associate 26 Moniepoint MFB *****47972');
    expect(rows[6].narration).toBe('MOBILE TRF TO MMF Dr Nwafulume Nnaemeka SOLUCIO CLINICS LIMITED');
  });

  test('reads the account holder\'s name from a Moniepoint statement header', () => {
    const { accountHolderOf } = require('../src/services/statementParser');
    expect(accountHolderOf('Account Statement\nBusiness Name\nSOLUCIO CLINICS LIMITED\nAccount Number\n6614549992')).toBe('SOLUCIO CLINICS LIMITED');
  });
});

test('reads the account holder\'s name from a Zenith statement header', () => {
  const { accountHolderOf } = require('../src/services/statementParser');
  expect(accountHolderOf('Account NameAccount NoOpening Balance DateLedger Balance\nSOLUCIO CLINICS101514958801/01/2026NGN 266,913.58\nCreate DateEffective Date')).toBe('SOLUCIO CLINICS');
  expect(accountHolderOf('no header here')).toBe('');
});
