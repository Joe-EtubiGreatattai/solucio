// Fills the database with realistic demo data (six months of income and spending).
//   npm run seed:demo             seed an empty database
//   npm run seed:demo -- --reset  wipe accounts, income, expenses, audit log and counters first
// Users are upserted by email and never deleted.
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');
const { ensureBuiltInRoles } = require('../src/services/roles');
const { ensureDefaultCategories } = require('../src/services/categories');
const Account = require('../src/models/Account');
const Income = require('../src/models/Income');
const Expense = require('../src/models/Expense');
const AuditLog = require('../src/models/AuditLog');
const Counter = require('../src/models/Counter');
const { parseLagosDate, lagosToday } = require('../src/utils/dates');

const DEMO_PASSWORD = 'Demo12345!';
const naira = (n) => Math.round(n * 100);

// Deterministic PRNG so every run of a fresh seed looks the same.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260921);
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
const roundTo = (n, step) => Math.round(n / step) * step;
const weighted = (items) => {
  let r = rand() * items.reduce((s, i) => s + i.w, 0);
  for (const i of items) { r -= i.w; if (r <= 0) return i; }
  return items[items.length - 1];
};

function* eachDay(from, to) {
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) yield d.toISOString().slice(0, 10);
}
const pad = (n) => String(n).padStart(2, '0');

// What patients pay for: weight, min and max in naira, rounding step.
const INCOME_KINDS = [
  { w: 30, min: 5000, max: 15000, step: 500 },     // consultation
  { w: 22, min: 8000, max: 60000, step: 500 },     // laboratory
  { w: 12, min: 15000, max: 120000, step: 1000 },  // radiology
  { w: 28, min: 2500, max: 70000, step: 250 },     // pharmacy
  { w: 6, min: 80000, max: 450000, step: 5000 },   // admission
  { w: 2, min: 250000, max: 900000, step: 10000 }, // theatre / procedure
];
const INCOME_VOID_REASONS = ['Wrong amount entered', 'Duplicate entry', 'Payment reversed by bank', 'Wrong account selected'];
const EXPENSE_VOID_REASONS = ['Duplicate entry', 'Wrong category', 'Wrong amount entered'];

async function upsertUser({ name, email, role, password }) {
  const passwordHash = await bcrypt.hash(password, 10);
  return User.findOneAndUpdate(
    { email: email.toLowerCase() },
    { name, passwordHash, role, active: true },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function main() {
  const reset = process.argv.includes('--reset');
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI (see .env.example)');
  await mongoose.connect(process.env.MONGODB_URI);
  await ensureBuiltInRoles();
  await ensureDefaultCategories();

  if (!reset && (await Income.countDocuments()) > 0) {
    console.error('The database already has income records. Run with --reset to wipe accounts, income, expenses and audit log first.');
    process.exitCode = 1;
    return;
  }
  if (reset) {
    await Promise.all([Income, Expense, AuditLog, Counter, Account].map((M) => M.deleteMany({})));
    console.log('Wiped accounts, income, expenses, audit log and counters.');
  }

  // Users
  const admin = await upsertUser({
    name: process.env.ADMIN_NAME || 'Administrator',
    email: process.env.ADMIN_EMAIL || 'admin@solucio.demo',
    role: 'admin',
    password: process.env.ADMIN_PASSWORD || DEMO_PASSWORD,
  });
  const cashiers = [];
  for (const [name, email] of [['Chioma Okafor', 'chioma@solucio.demo'], ['Tunde Bello', 'tunde@solucio.demo']]) {
    cashiers.push(await upsertUser({ name, email, role: 'cashier', password: DEMO_PASSWORD }));
  }
  const accountant = await upsertUser({ name: 'Ngozi Eze', email: 'ngozi@solucio.demo', role: 'accountant', password: DEMO_PASSWORD });

  // Accounts
  const [main, pharmacy, petty, oldSavings] = await Account.insertMany([
    { name: 'Main Operations', type: 'bank', bankName: 'GTBank', accountNumber: '0123456789', openingBalance: naira(15000000) },
    { name: 'Pharmacy POS', type: 'bank', bankName: 'Zenith Bank', accountNumber: '2034567891', openingBalance: naira(1200000) },
    { name: 'Petty Cash', type: 'cash', openingBalance: naira(300000) },
    { name: 'Old Savings', type: 'bank', bankName: 'First Bank', accountNumber: '3011223344', openingBalance: naira(400000), active: false },
  ]);

  // Six calendar months ending today.
  const today = lagosToday();
  const [ty, tm] = today.split('-').map(Number);
  const startMonthIndex = ty * 12 + (tm - 1) - 5;
  const start = `${Math.floor(startMonthIndex / 12)}-${pad((startMonthIndex % 12) + 1)}-01`;

  // Income
  const incomes = [];
  const seqByYear = {};
  for (const day of eachDay(start, today)) {
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    const monthIdx = (Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1) - startMonthIndex;
    const growth = 1 + monthIdx * 0.04;
    const count = Math.round((dow === 0 ? between(1, 3) : dow === 6 ? between(3, 6) : between(6, 12)) * growth);
    for (let i = 0; i < count; i += 1) {
      const kind = weighted(INCOME_KINDS);
      const method = chance(0.55) ? 'pos' : 'transfer';
      const account = method === 'pos' ? (chance(0.4) ? pharmacy : main) : (chance(0.85) ? main : pharmacy);
      const year = day.slice(0, 4);
      seqByYear[year] = (seqByYear[year] || 0) + 1;
      const recordedBy = pick(cashiers);
      const date = parseLagosDate(day);
      const doc = {
        amount: naira(roundTo(between(kind.min, kind.max), kind.step)),
        date,
        method,
        account: account._id,
        receiptNumber: `RCP-${year}-${String(seqByYear[year]).padStart(4, '0')}`,
        recordedBy: recordedBy._id,
        createdAt: new Date(date.getTime() + between(8, 17) * 3600000 + between(0, 59) * 60000),
      };
      if (chance(0.02)) {
        Object.assign(doc, {
          voided: true, voidReason: pick(INCOME_VOID_REASONS), voidedBy: recordedBy._id,
          voidedAt: new Date(doc.createdAt.getTime() + between(10, 180) * 60000),
        });
      }
      incomes.push(doc);
    }
  }

  // Expenses
  const expenses = [];
  const addExpense = (day, type, group, item, amount, account = main, note) => {
    if (day > today) return;
    const date = parseLagosDate(day);
    const doc = {
      amount: naira(amount), date, account: account._id, type, group, item, note,
      recordedBy: accountant._id,
      createdAt: new Date(date.getTime() + between(9, 16) * 3600000 + between(0, 59) * 60000),
    };
    if (chance(0.03)) {
      Object.assign(doc, {
        voided: true, voidReason: pick(EXPENSE_VOID_REASONS), voidedBy: accountant._id,
        voidedAt: new Date(doc.createdAt.getTime() + between(20, 300) * 60000),
      });
    }
    expenses.push(doc);
  };
  const ref = () => (chance(0.5) ? `Invoice ${between(1000, 9999)}` : undefined);
  const R = 'Recurrent';
  const C = 'Capital';
  const ONE_OFFS = {
    1: [[C, 'Equipment', 'Radiology', 3850000, 'Digital X-ray unit']],
    2: [[C, 'Equipment', 'Laboratory', 1450000, 'Haematology analyser'], [C, 'Structural', 'Plumbing', 240000, 'Ward block pipework']],
    3: [[C, 'Equipment', 'Theatre', 920000, 'Theatre lights'], [C, 'Structural', 'Building', 2300000, 'Outpatient wing roofing']],
    4: [[C, 'Equipment', 'Nursing', 340000, 'Patient monitors'], [C, 'Structural', 'Furniture', 410000, 'Waiting area seating']],
    5: [[C, 'Equipment', 'Ophthalmology', 760000, 'Slit lamp'], [C, 'Structural', 'Electricals', 180000, 'Backup wiring']],
  };
  for (let m = 0; m < 6; m += 1) {
    const idx = startMonthIndex + m;
    const ym = `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
    const d = (n) => `${ym}-${pad(n)}`;
    const drugAccount = () => (chance(0.6) ? pharmacy : main);

    addExpense(d(1), R, 'Rents', null, 800000, main, 'Monthly rent');
    addExpense(d(between(25, 27)), R, 'Staff Wages', null, roundTo(between(4200000, 4900000), 10000), main, 'Monthly payroll');
    addExpense(d(10), R, 'Tax and Dues', 'PAYE', roundTo(between(380000, 470000), 1000), main);
    addExpense(d(21), R, 'Tax and Dues', 'WHT', roundTo(between(45000, 90000), 500), main);
    if (chance(0.3)) addExpense(d(between(12, 20)), R, 'Tax and Dues', 'Others', between(15000, 50000), main);

    addExpense(d(between(5, 8)), R, 'Servicing & Maintenance', 'Electricity', roundTo(between(280000, 420000), 1000), main, 'Grid bill');
    addExpense(d(between(3, 6)), R, 'Servicing & Maintenance', 'Data & Airtime', roundTo(between(60000, 110000), 500), main);
    for (let i = 0; i < 4; i += 1) addExpense(d(between(2, 28)), R, 'Servicing & Maintenance', 'Fuel', roundTo(between(60000, 140000), 500), main, 'Generator diesel');
    for (let i = 0; i < 2; i += 1) addExpense(d(between(2, 28)), R, 'Servicing & Maintenance', 'Gas', roundTo(between(25000, 60000), 500), main);
    if (chance(0.2)) addExpense(d(between(2, 28)), R, 'Servicing & Maintenance', 'Plumbing', between(30000, 90000), main);
    if (chance(0.15)) addExpense(d(between(2, 28)), R, 'Servicing & Maintenance', 'Electrical', between(25000, 120000), main);
    if (chance(0.1)) addExpense(d(between(2, 28)), R, 'Servicing & Maintenance', 'Other T.P', between(20000, 80000), main);
    if (chance(0.1)) addExpense(d(between(2, 28)), R, 'Servicing & Maintenance', 'Others', between(10000, 45000), main);

    for (let i = 0; i < 3; i += 1) addExpense(d(between(2, 28)), R, 'Hospital Consumables', 'Oxygen', roundTo(between(70000, 190000), 500), main, ref());
    for (let i = 0; i < 5; i += 1) addExpense(d(between(2, 28)), R, 'Hospital Consumables', 'Drugs', roundTo(between(150000, 950000), 1000), drugAccount(), ref());
    for (let i = 0; i < 3; i += 1) addExpense(d(between(2, 28)), R, 'Hospital Consumables', 'Laboratory Consumables', roundTo(between(120000, 480000), 1000), main, ref());
    for (let i = 0; i < 2; i += 1) addExpense(d(between(2, 28)), R, 'Hospital Consumables', 'Theatre Consumables', roundTo(between(150000, 600000), 1000), main, ref());
    for (let i = 0; i < 3; i += 1) addExpense(d(between(2, 28)), R, 'Hospital Consumables', 'Toiletries & Stationeries', roundTo(between(25000, 110000), 500), main);
    addExpense(d(between(2, 28)), R, 'Hospital Consumables', 'Others', between(15000, 60000), main);

    for (let i = 0; i < 2; i += 1) addExpense(d(between(2, 28)), R, 'Outsource Services', 'Specialist Consultation', roundTo(between(80000, 250000), 1000), main);
    addExpense(d(between(2, 28)), R, 'Outsource Services', 'Laboratory', roundTo(between(60000, 200000), 1000), main);
    addExpense(d(between(2, 28)), R, 'Outsource Services', 'Opticals', roundTo(between(40000, 150000), 1000), main);
    if (chance(0.2)) addExpense(d(between(2, 28)), R, 'Outsource Services', 'Others', between(20000, 70000), main);

    if (chance(0.6)) addExpense(d(between(5, 25)), R, 'Charity', null, roundTo(between(50000, 150000), 5000), main, 'Community outreach');
    for (let i = 0; i < 2; i += 1) addExpense(d(between(2, 28)), R, 'Hospital Consumables', 'Toiletries & Stationeries', between(8000, 20000), petty, 'Petty cash purchase');

    for (const [type, group, item, amount, note] of ONE_OFFS[m] || []) addExpense(d(between(6, 22)), type, group, item, amount, main, note);
  }

  const savedIncomes = await Income.insertMany(incomes);
  const savedExpenses = await Expense.insertMany(expenses);

  const audit = [];
  for (const i of savedIncomes) {
    audit.push({ actor: i.recordedBy, action: 'income.create', targetModel: 'Income', targetId: i._id, details: { receiptNumber: i.receiptNumber, amount: i.amount }, createdAt: i.createdAt });
    if (i.voided) audit.push({ actor: i.voidedBy, action: 'income.void', targetModel: 'Income', targetId: i._id, details: { reason: i.voidReason, amount: i.amount, receiptNumber: i.receiptNumber }, createdAt: i.voidedAt });
  }
  for (const e of savedExpenses) {
    audit.push({ actor: e.recordedBy, action: 'expense.create', targetModel: 'Expense', targetId: e._id, details: { amount: e.amount, type: e.type, group: e.group, item: e.item }, createdAt: e.createdAt });
    if (e.voided) audit.push({ actor: e.voidedBy, action: 'expense.void', targetModel: 'Expense', targetId: e._id, details: { reason: e.voidReason, amount: e.amount, type: e.type, group: e.group, item: e.item }, createdAt: e.voidedAt });
  }
  await AuditLog.insertMany(audit);
  for (const [year, seq] of Object.entries(seqByYear)) {
    await Counter.findOneAndUpdate({ key: `receipt-${year}` }, { $set: { seq } }, { upsert: true });
  }

  const voidedIncome = incomes.filter((i) => i.voided).length;
  const voidedExpense = expenses.filter((e) => e.voided).length;
  console.log(`Seeded ${start} to ${today}:`);
  console.log(`  ${incomes.length} income entries (${voidedIncome} void), ${expenses.length} expenses (${voidedExpense} void), 4 accounts, ${audit.length} audit entries`);
  console.log('Sign-in accounts:');
  console.log(`  admin       ${admin.email}   (password from ADMIN_PASSWORD in .env${process.env.ADMIN_PASSWORD ? '' : `, else ${DEMO_PASSWORD}`})`);
  console.log(`  accountant  ${accountant.email}   ${DEMO_PASSWORD}`);
  for (const c of cashiers) console.log(`  cashier     ${c.email}   ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => { console.error(`Could not seed demo data: ${err.message}`); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
