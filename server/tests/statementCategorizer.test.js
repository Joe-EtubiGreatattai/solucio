const { categorizeTransactions, payeeOf, buildMemory } = require('../src/services/statementCategorizer');
const { DEFAULT_CATEGORIES } = require('../src/config/categories');

const tree = Object.entries(DEFAULT_CATEGORIES).map(([type, groups]) => ({
  type,
  groups: Object.entries(groups).map(([name, items]) => ({ name, items })),
}));

let seq = 0;
const row = (narration, direction = 'expense', amount = 100000) => ({ _id: `t${(seq += 1)}`, date: new Date('2026-07-01'), narration, direction, amount });
const one = (narration, direction, options = {}) => categorizeTransactions([row(narration, direction)], { tree, ...options })[0];

describe('expense keywords', () => {
  test.each([
    ['MOBILE BILLS PYMT/ AIRTEL DATA/09113677105', 'Servicing & Maintenance', 'Data & Airtime'],
    ['IBEDC PREPAID METER 4501234', 'Servicing & Maintenance', 'Electricity'],
    ['MOBILE TRF TO GTB/ TOTALENERGIES DIESEL SUPPLY', 'Servicing & Maintenance', 'Fuel'],
    ['MOBILE TRF TO PAY/ OXYGEN CYLINDER REFILL', 'Hospital Consumables', 'Oxygen'],
    ['NIP TRANSFER TO EMZOR PHARMACEUTICALS', 'Hospital Consumables', 'Drugs'],
    ['MOBILE TRF TO PAY/ LAB REAGENTS SUPPLY', 'Hospital Consumables', 'Laboratory Consumables'],
    ['JULY SALARY STAFF', 'Staff Wages', null],
    ['MOBILE TRF TO GTB/ LANDLORD RENT FOR QUARTER', 'Rents', null],
    ['FIRS WHT REMITTANCE', 'Tax and Dues', 'WHT'],
    ['NIP CR/MOB/SUNDAY MOSES JATTO/GTB /Consul 21stDec- 8thJan', 'Outsource Services', 'Specialist Consultation'],
    ['NIP CR/MOB/OYEDEJI ADEDAYO STEPHEN AKANNI/GTB /Consultancy', 'Outsource Services', 'Specialist Consultation'],
    ['NIP CR/MOB/NJIOLE, EMOLE JAMES/UBA /OUTSOURCED LAB 10JAN', 'Outsource Services', 'Laboratory'],
    ['NIP CR/MOB/FADAHUNSIOLATUNJI OLUWASEYI/GTB /3-Histopathology', 'Outsource Services', 'Laboratory'],
    ['NIP CR/MOB/SUPREME CARE MEDICALS/FCMB /2 biopsy gun', 'Hospital Consumables', 'Theatre Consumables'],
  ])('%s', (narration, group, item) => {
    expect(one(narration)).toMatchObject({ group, item, categorySource: 'rule' });
  });

  test('matches whole words only', () => {
    // "pos" inside "purpose" and "rent" inside "current" must not trigger anything.
    const result = one('TRANSFER FOR CURRENT PURPOSE');
    expect(result.group).toBeFalsy();
    expect(result.confidence).toBe('needs-review');
  });

  test('two different categories in one narration lowers confidence and says so', () => {
    const result = one('FUEL AND DRUGS FOR CLINIC');
    expect(result.confidence).toBe('medium');
    expect(result.reason).toMatch(/also/i);
  });

  test('only suggests categories that exist in the live tree', () => {
    const smallTree = [{ type: 'Recurrent', groups: [{ name: 'Servicing & Maintenance', items: ['Others'] }] }];
    const result = one('IBEDC PREPAID METER', 'expense', { tree: smallTree });
    // Electricity is gone, so it falls back to the group's Others item at lower confidence.
    expect(result).toMatchObject({ group: 'Servicing & Maintenance', item: 'Others', confidence: 'medium' });

    const empty = one('IBEDC PREPAID METER', 'expense', { tree: [] });
    expect(empty).toMatchObject({ group: null, confidence: 'needs-review' });
  });

  test('an item an admin added to the tree is matched by name', () => {
    const custom = [{ type: 'Recurrent', groups: [{ name: 'Servicing & Maintenance', items: ['Generator Servicing', 'Others'] }] }];
    expect(one('PAYMENT FOR GENERATOR SERVICING', 'expense', { tree: custom })).toMatchObject({ item: 'Generator Servicing', confidence: 'medium' });
  });
});

describe('bank charges', () => {
  test.each([
    'COMMISSION MOBILE TRF TO PAY/ /ZAINAB LADIDI SHAIBU',
    'VAT MOBILE TRF TO PAY/ /ZAINAB LADIDI SHAIBU',
    'SMS ALERT FEE-29/06-28/07/2026 + VAT',
    'FGN STAMP DUTY FOR 4 TXNS 01/03--07/03/',
    '22-JAN-261ST QUARTER 2026 CARD MAINT FEE-VISA/VAT',
    'COMMISSION E-STATEMENT REQUEST',
  ])('%s is a high-confidence bank charge', (narration) => {
    expect(one(narration)).toMatchObject({ group: 'Tax and Dues', item: 'Others', confidence: 'high', reason: expect.stringMatching(/bank charge/i) });
  });

  test('a charge on a transfer is never given the payee\'s learned category', () => {
    const memory = buildMemory([{ status: 'review', transactions: [
      { narration: 'MOBILE TRF TO PAY/ /ZAINAB LADIDI SHAIBU', direction: 'expense', type: 'Recurrent', group: 'Staff Wages', item: null, categorySource: 'reviewer' },
    ] }]);
    expect(one('COMMISSION MOBILE TRF TO PAY/ /ZAINAB LADIDI SHAIBU', 'expense', { memory })).toMatchObject({ group: 'Tax and Dues' });
  });
});

describe('payees', () => {
  test('pulls the payee out of the channel wording', () => {
    expect(payeeOf('MOBILE TRF TO PAY/ /ZAINAB LADIDI SHAIBU').label).toBe('ZAINAB LADIDI SHAIBU');
    expect(payeeOf('MOBILE TRF TO MMF/ /POS TRANSFER- ABDULRAHMAN ONIMISI ABU').label).toBe('ABDULRAHMAN ONIMISI ABU');
    expect(payeeOf('POS PYMT ESSENCE PLACE ESSENCE LAGOS LANG').label).toBe('ESSENCE PLACE ESSENCE LAGOS');
  });

  test('the same payee matches despite line-wrap hyphens and name order', () => {
    const a = payeeOf('MOBILE TRF TO PAY/ /GIFT ENYO-OJO JOE-ETUBI').key;
    expect(payeeOf('MOBILE TRF TO ZIB/ /GIFT ENYO- OJO JOE- ETUBI').key).toBe(a);
    expect(payeeOf('MOBILE TRF TO KMF/ /UMORU, OJOAJOGWU ANTHONY').key).toBe(payeeOf('MOBILE TRF TO PAY/ ANTHONY OJOAJOGWU UMORU').key);
  });
});

describe('learning from reviewers', () => {
  const reviewed = (narration, group, item = null, extra = {}) => ({ narration, direction: 'expense', type: 'Recurrent', group, item, categorySource: 'reviewer', ...extra });

  test('a payee a reviewer has categorized before gets that category', () => {
    const memory = buildMemory([{ status: 'review', transactions: [reviewed('MOBILE TRF TO PAY/ /ZAINAB LADIDI SHAIBU', 'Staff Wages')] }]);
    expect(one('MOBILE TRF TO GTB/ ZAINAB LADIDI SHAIBU', 'expense', { memory })).toMatchObject({
      group: 'Staff Wages', confidence: 'high', categorySource: 'memory', reason: expect.stringMatching(/same payee/i),
    });
  });

  test('a reviewer\'s choice beats a keyword guess', () => {
    const memory = buildMemory([{ status: 'review', transactions: [reviewed('MOBILE TRF TO PAY/ SAMESTY FUEL', 'Hospital Consumables', 'Others')] }]);
    expect(one('MOBILE TRF TO PAY/ SAMESTY FUEL', 'expense', { memory })).toMatchObject({ group: 'Hospital Consumables', categorySource: 'memory' });
  });

  test('conflicting past choices use the majority at medium confidence', () => {
    const memory = buildMemory([{ status: 'review', transactions: [
      reviewed('MOBILE TRF TO PAY/ ADA OKON', 'Staff Wages'),
      reviewed('MOBILE TRF TO PAY/ ADA OKON', 'Staff Wages'),
      reviewed('MOBILE TRF TO PAY/ ADA OKON', 'Charity'),
    ] }]);
    expect(one('MOBILE TRF TO PAY/ ADA OKON', 'expense', { memory })).toMatchObject({ group: 'Staff Wages', confidence: 'medium' });
  });

  test('rows nobody reviewed are not learned from, unless the statement was approved', () => {
    const unreviewed = buildMemory([{ status: 'review', transactions: [{ ...reviewed('MOBILE TRF TO PAY/ ADA OKON', 'Charity'), categorySource: 'rule' }] }]);
    expect(one('MOBILE TRF TO PAY/ ADA OKON', 'expense', { memory: unreviewed }).categorySource).not.toBe('memory');

    const approved = buildMemory([{ status: 'approved', transactions: [{ ...reviewed('MOBILE TRF TO PAY/ ADA OKON', 'Charity'), categorySource: 'rule' }] }]);
    expect(one('MOBILE TRF TO PAY/ ADA OKON', 'expense', { memory: approved }).group).toBe('Charity');
  });

  test('a learned category that has since been removed from the tree is ignored', () => {
    const memory = buildMemory([{ status: 'review', transactions: [reviewed('MOBILE TRF TO PAY/ ADA OKON', 'Old Group')] }]);
    expect(one('MOBILE TRF TO PAY/ ADA OKON', 'expense', { memory }).categorySource).not.toBe('memory');
  });

  test('an unknown transfer explains what to do next', () => {
    expect(one('MOBILE TRF TO PAY/ /ZAINAB LADIDI SHAIBU')).toMatchObject({
      confidence: 'needs-review', reason: expect.stringMatching(/Transfer to ZAINAB LADIDI SHAIBU/),
    });
  });
});

describe('income', () => {
  test('payment processor and HMO settlements are high confidence', () => {
    expect(one('PAYSTACK/KOBO WITHDRAWAL DORMCOMNG', 'income')).toMatchObject({ confidence: 'high' });
    expect(one('HYGEIA HMO CLAIMS SETTLEMENT', 'income')).toMatchObject({ confidence: 'high', reason: expect.stringMatching(/HMO/) });
  });

  test('ordinary transfers in are accepted at medium confidence', () => {
    expect(one('NIP TFR FROM ANTHONYOJOAJOGWU UMORU', 'income')).toMatchObject({ confidence: 'medium' });
    expect(one('TRANSFER FROM EMMANUEL BOLARINWA,', 'income')).toMatchObject({ confidence: 'medium' });
  });

  test.each([
    'MOBILE TRF FROM ACCESS//SAMUEL EKUNDAYO IBITOYE',
    'COB TRF TO GREAT ATTA **6190 ABN AGMAS TRANSPORT APP',
    'UMORU, OJOAJOGWU ANTHONY/transport',
    'TRANSBORDER AXIS LIMITED/ONEMAI PAYOUT TRANS- WITHDRAW- 6A39',
  ])('recognises the inbound transfer format %s', (narration) => {
    expect(one(narration, 'income')).toMatchObject({ confidence: 'medium', reason: 'Money received by transfer' });
  });

  test('income never carries an expense category', () => {
    expect(one('NIP TFR FROM PATIENT ACCOUNT', 'income')).toMatchObject({ type: null, group: null, item: null });
  });

  test('loans and transfers from the account holder need review', () => {
    expect(one('UMORU, OJOAJOGWU ANTHONY/LEND', 'income')).toMatchObject({ confidence: 'needs-review', reason: expect.stringMatching(/loan/i) });
    expect(one('NIP TFR FROM GREATATTAI JOE-ETUBI', 'income', { ownerName: 'Great Attai Joe-Etubi' }))
      .toMatchObject({ confidence: 'needs-review', reason: expect.stringMatching(/own account/i) });
    // A relative who shares a surname is not the account holder.
    expect(one('TRANSFER FROM GIFT ENYO-OJO JOE-ETUBI', 'income', { ownerName: 'Great Attai Joe-Etubi' }).confidence).toBe('medium');
  });

  test('a transfer to the account holder is flagged rather than guessed', () => {
    expect(one('MOBILE TRF TO PAY/ /GREAT ATTAI JOE-ETUBI', 'expense', { ownerName: 'Great Attai Joe-Etubi' }))
      .toMatchObject({ confidence: 'needs-review', reason: expect.stringMatching(/own account/i) });
  });
});

describe('reversals', () => {
  test('a reversal and the debit it undoes are both left out', () => {
    const debit = { ...row('MOBILE TRF TO GTB/ IBITOYE SAMUEL EKUNDAYO', 'expense', 500000) };
    const fee = { ...row('COMMISSION MOBILE TRF TO GTB/ IBITOYE SAMUEL EKUNDAYO', 'expense', 1000) };
    const back = { ...row('REVERSAL OF-MOBILE TRF TO GTB/ IBITOYE SAMUEL EKUNDAYO', 'income', 500000) };
    const feeBack = { ...row('REVERSAL OF-HANDLING CHARGE MOBILE TRF TO GTB/ IBITOYE SAMUEL EKUNDAYO', 'income', 1000) };
    const [d, f, b, fb] = categorizeTransactions([debit, fee, back, feeBack], { tree });
    for (const r of [d, f, b, fb]) expect(r).toMatchObject({ included: false, reason: expect.stringMatching(/revers/i) });
  });

  test('a reversal with no matching debit in the statement needs review', () => {
    expect(one('REVERSAL OF-MOBILE TRF TO GTB/ SOMEONE ELSE', 'income')).toMatchObject({ confidence: 'needs-review', reason: expect.stringMatching(/reversal/i) });
  });

  test('a reversal only pairs with a debit of the same amount', () => {
    const [d, b] = categorizeTransactions([
      row('MOBILE TRF TO GTB/ IBITOYE SAMUEL EKUNDAYO', 'expense', 500000),
      row('REVERSAL OF-MOBILE TRF TO GTB/ IBITOYE SAMUEL EKUNDAYO', 'income', 400000),
    ], { tree });
    expect(d.included).not.toBe(false);
    expect(b.confidence).toBe('needs-review');
  });
});

describe('Zenith Bank wording', () => {
  test.each([
    'POS Comm Settlement for 2057KO000001215 - 01-01-2026',
    'SMS CHARGE 24DEC TO 22JAN 2026',
    'POS: PAY WITH TRANSFER CHARGE + VAT (20/04/2026)',
    'NIP CHARGE + VAT',
  ])('%s is a bank charge', (narration) => {
    expect(one(narration)).toMatchObject({ group: 'Tax and Dues', confidence: 'high', reason: 'Bank charge' });
  });

  test.each([
    ['NIP CR/MOB/KAYODE D TOYIN/KBL /Cons 21st-8th K', 'KAYODE D TOYIN'],
    ['NIP/FCMB/BANHAZ ENTERPRISES LIMITED/webAppMedical bill 4 Ismaila', 'BANHAZ ENTERPRISES LIMITED'],
    ['TRF TO JOLLY-TECH GROUP NIG/Hospital Equipments', 'JOLLY TECH GROUP NIG'],
    ['TRF FROM OMIDAU ENTERPRISES//TRF TO SOLUCIO CLINICS//Hospital bill', 'OMIDAU ENTERPRISES'],
    ['MC Loc POS Prch-018447639081-- SAHAD STORES LIMITED SLAGOS NG-', 'SAHAD STORES LIMITED SLAGOS'],
    ['MC Agency CashOut-1234567- OPay ANAYO JOHN OCHUBA Lokoja A KONG', 'OPAY ANAYO JOHN OCHUBA LOKOJA A KONG'],
  ])('the payee of %s is %s', (narration, payee) => {
    expect(payeeOf(narration).label).toBe(payee);
  });

  test('the memo after the payee does not split one payee into many', () => {
    expect(payeeOf('TRF TO DR. ARMIYAU ABOLORE ADEWALE/11-31st March _123456').key)
      .toBe(payeeOf('TRF TO DR. ARMIYAU ABOLORE ADEWALE/20TH - 31ST JULY_654321').key);
  });

  test('a card purchase and an agent cash-out are described plainly', () => {
    expect(one('MC Loc POS Prch-018447639081-- SAHAD STORES LIMITED SLAGOS NG-').reason).toMatch(/^Card payment at SAHAD STORES/);
    expect(one('MC Agency CashOut-1234567- OPay ANAYO JOHN OCHUBA Lokoja A KONG').reason).toMatch(/^Cash withdrawal/);
  });

  test('words stuck to numbers still match', () => {
    expect(one('NIP CR/MOB/IHEONYE HENRY ONYEKWERE/UBA /2consultation and echo')).toMatchObject({ item: 'Specialist Consultation' });
  });

  describe('own account is judged by the sender, not the recipient', () => {
    const owner = { ownerName: 'SOLUCIO CLINICS' };
    test.each([
      'TRF FROM OMIDAU ENTERPRISES//TRF TO SOLUCIO CLINICS//Hospital bill',
      'NIP/FCMB/LOUNGE ONE ENTERPRISE/webTB1cMedicare SamuelSOLUCIO CLINICS',
    ])('%s is ordinary income', (narration) => {
      expect(one(narration, 'income', owner).reason).not.toMatch(/own account/);
    });
    test.each([
      'NIP CR/MOB/SOLUCIO CLINICS LIMITED/ROLEZ/Moniepoint active',
      'TRF FRM SOLUCIO CLINICS - NHIS COLLECTION TO SOLUCIO CLINICS',
    ])('%s is from the clinic\'s own account', (narration) => {
      expect(one(narration, 'income', owner)).toMatchObject({ confidence: 'needs-review', reason: expect.stringMatching(/own account/) });
    });
  });

  test.each([
    'ZENITH BANK STAFF MED BILL DEC 2025',
    'ZENITHBANK STAFF MEDICAL BILL FOR AUG 26',
    'MEDICAL BILL FOR SOLUCIO CLINICS/ FRANCIS MOSES',
    'ETI Hospital bills FRM IBRAHIM ADINOYI ALIU',
  ])('%s is a payment for medical bills', (narration) => {
    expect(one(narration, 'income', { ownerName: 'SOLUCIO CLINICS' })).toMatchObject({ confidence: 'high', reason: 'Payment for medical bills' });
  });
});

describe('income categorization', () => {
  const incomeTree = [{ type: 'Diagnostics', groups: [{ name: 'Laboratory', items: [] }, { name: 'Radiology', items: ['X-ray'] }] }];
  const incRow = (narration) => ({ _id: `i${(seq += 1)}`, date: new Date('2026-07-01'), narration, direction: 'income', amount: 100000 });
  const cat = (narration, opts = {}) => categorizeTransactions([incRow(narration)], { incomeTree, ...opts })[0];

  test('a reviewer\'s income category for a payee is reused on later income from that payee', () => {
    const incomeMemory = buildMemory([{ status: 'review', transactions: [
      { narration: 'NIP CR/MOB/LABATTENDANT ADA/GTB /lab tests', direction: 'income', type: 'Diagnostics', group: 'Laboratory', item: null, categorySource: 'reviewer' },
    ] }], 'income');
    expect(cat('NIP CR/MOB/LABATTENDANT ADA/GTB /more tests', { incomeMemory })).toMatchObject({
      type: 'Diagnostics', group: 'Laboratory', categorySource: 'memory', confidence: 'high',
    });
  });

  test('income learning is kept separate from expense learning', () => {
    const statements = [{ status: 'approved', transactions: [
      { narration: 'TRF TO PAY/ ADA SUPPLIER', direction: 'expense', type: 'Recurrent', group: 'Rents', item: null, included: true },
      { narration: 'NIP CR/MOB/ADA SUPPLIER/GTB', direction: 'income', type: 'Diagnostics', group: 'Laboratory', item: null, included: true },
    ] }];
    expect(buildMemory(statements, 'expense').size).toBe(1);
    expect(buildMemory(statements, 'income').size).toBe(1);
    // the income suggestion for this payee is the income category, not the expense one
    expect(cat('NIP CR/MOB/ADA SUPPLIER/GTB', { incomeMemory: buildMemory(statements, 'income') })).toMatchObject({ group: 'Laboratory' });
  });

  test('without a learned category, income still gets its plain-English reason and no category', () => {
    expect(cat('HYGEIA HMO CLAIMS SETTLEMENT')).toMatchObject({ confidence: 'high', type: null, reason: expect.stringMatching(/HMO/) });
    expect(cat('NIP TFR FROM ANTHONY UMORU')).toMatchObject({ confidence: 'medium', type: null });
  });

  test('a learned income category that was removed from the income tree is ignored', () => {
    const incomeMemory = buildMemory([{ status: 'review', transactions: [
      { narration: 'NIP CR/MOB/ADA/GTB', direction: 'income', type: 'Gone', group: 'Removed', item: null, categorySource: 'reviewer' },
    ] }], 'income');
    expect(cat('NIP CR/MOB/ADA/GTB', { incomeMemory }).categorySource).not.toBe('memory');
  });
});
