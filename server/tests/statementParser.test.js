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
    expect.objectContaining({ narration: 'MOBILE BILLS PYMT/ AIRTEL DATA/09113677105', direction: 'expense', amount: 150000, type: 'Recurrent', group: 'Servicing & Maintenance', item: 'Data & Airtime' }),
    expect.objectContaining({ narration: 'NIP TFR FROM PATIENT ACCOUNT', direction: 'income', amount: 8000000, type: 'Income', group: 'Patient payments' }),
  ]);
});
