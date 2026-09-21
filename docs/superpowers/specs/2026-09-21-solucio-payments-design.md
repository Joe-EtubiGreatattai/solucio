# Solucio: Hospital Payments, Receipts and Spending Tracker: Design

Date: 2026-09-21
Stack: MERN (MongoDB, Express, React, Node)

## 1. Purpose

Solucio lets a hospital record money received (with printable receipts) and money spent, and see where the money went. It holds no patient information. It tracks payments and spending only.

## 2. Scope

### In scope (version 1)
- Recording income (payments received) by bank transfer or POS terminal, entered manually
- Auto-numbered, printable PDF receipts (no payer name)
- Recording expenses under a fixed two-level category tree
- Managing accounts (bank or cash); every income and expense names the account it was paid into or out of
- Reports: dashboard totals, spending by category, balance per account, Excel/PDF export
- Roles: cashier, accountant, admin
- Void-and-re-enter corrections with an audit trail

### Out of scope (version 1)
Patient records, online payment gateways, expense approval workflows, receipt categories, multi-hospital support, email/SMS receipts.

## 3. Roles

| Role | Can do |
|---|---|
| Cashier | Record income, print receipts, void income entries (see 6.4), view income lists |
| Accountant | Everything a cashier can, plus record expenses and view reports/exports |
| Admin | Everything, plus manage users and accounts |

The server enforces roles on every route. The client hides menu items by role but is not the security boundary.

## 4. Architecture

Single repository with two separate apps:

```
solucio/
  server/   Express API, Mongoose models, JWT auth
  client/   React app (Vite)
```

### 4.1 Server structure
- `models/`: User, Account, Income, Expense, AuditLog, Counter
- `routes/`, `controllers/`: auth, accounts, incomes, expenses, reports, users, categories
- `middleware/`: JWT verification, role guard, request validation (Zod), central error handler
- `config/categories.js`: the expense category tree; the single source of truth (see section 5)
- `services/`: receipt PDF (PDFKit), Excel export (ExcelJS), report aggregation

### 4.2 Data model

- **users**: name, email, passwordHash (bcrypt), role (`cashier` | `accountant` | `admin`), active
- **accounts**: name, bankName, accountNumber, type (`bank` | `cash`), openingBalance (minor units), active
- **incomes**: amount (integer minor units), date, method (`transfer` | `pos`), account, receiptNumber, recordedBy, voided (bool), voidReason, voidedBy, voidedAt
- **expenses**: amount (integer minor units), date, category path (`type`, `group`, `item`), account, note (optional), recordedBy, voided, voidReason, voidedBy, voidedAt
- **auditLog**: actor, action, target collection and id, timestamp, details
- **counters**: key (e.g. `receipt-2026`), sequence value

## 5. Expense categories

Fixed tree, served by `GET /categories` and validated server-side.

**Recurrent**
1. Hospital Consumables: Oxygen; Toiletries & Stationeries; Laboratory Consumables; Theatre Consumables; Drugs; Others
2. Servicing & Maintenance: Electricity; Data & Airtime; Plumbing; Electrical; Fuel; Gas; Other T.P; Others
3. Outsource Services: Specialist Consultation; Laboratory; Opticals; Others
4. Staff Wages (no sub-items)
5. Tax and Dues: PAYE; WHT; Others
6. Rents (no sub-items)
7. Charity (no sub-items)

**Capital**
1. Structural: Furniture; Electricals; Plumbing; Building
2. Equipment: Nursing; Laboratory; Radiology; Theatre; Ophthalmology

Notes from the source sheet: "Nursing" under Structural was crossed out and is omitted. The meaning of "Other T.P" is unconfirmed and it is treated as an ordinary item. Groups with no sub-items (Staff Wages, Rents, Charity) are valid leaf categories.

Income has no categories.

## 6. Behaviour

### 6.1 Money handling
Amounts are stored as integer minor units (kobo), never floats. Display currency is Naira (₦), dates are day-first.

### 6.2 Receipt numbering
Format `RCP-YYYY-NNNN`, sequential per year, generated atomically from the `counters` collection so concurrent cashiers never get duplicates. Numbers are never reused, including for voided receipts.

### 6.3 Receipts (PDF)
Generated on demand from the stored income record (nothing saved as a file). One A5 page:
- Hospital name from configuration, optional logo
- Receipt number, date, amount in figures and words, method (Bank transfer or POS)
- Account paid into (bank name, last 4 digits of the account number)
- Recorded by (user name)
- No payer name
- If voided: diagonal VOID watermark and the void reason
Reprints produce the same document and number.

### 6.4 Voiding
Money records cannot be edited or deleted. A mistake is corrected by voiding with a required reason and entering a new record. Voided entries remain in lists, marked as void, and are excluded from all totals. Each void records who and when, and writes an audit log entry. Voiding an already-voided entry returns 409. Permissions: cashiers, accountants and admins may void income; only accountants and admins may void expenses.

### 6.5 Accounts
- Admin creates accounts with an opening balance.
- Balance = opening balance + non-voided income - non-voided expenses.
- Accounts with entries cannot be deleted, only deactivated. Inactive accounts are hidden from record forms but appear in history and reports.

### 6.6 Auth
JWT login, bcrypt password hashes, rate-limited login. Deactivated users are rejected even with a valid token.

## 7. API

| Area | Endpoints | Roles |
|---|---|---|
| Auth | `POST /auth/login`, `GET /auth/me` | all |
| Accounts | list, create, edit | list: all; write: admin (opening balance admin-only) |
| Income | `POST /incomes`, `GET /incomes`, `GET /incomes/:id/receipt`, `POST /incomes/:id/void` | cashier, accountant, admin |
| Expenses | `POST /expenses`, `GET /expenses`, `POST /expenses/:id/void` | accountant, admin |
| Reports | `/reports/summary`, `/reports/spending-by-category`, `/reports/account-balances`, `/reports/export` | accountant, admin |
| Users | CRUD, deactivate | admin |
| Categories | `GET /categories` | all |

There are no delete or update endpoints for income or expense records.

## 8. Reports

- **Summary** (`?from&to`): total income, total spending, net, entry counts, over non-voided entries. Date ranges are inclusive and use the Africa/Lagos timezone.
- **Spending by category** (`?from&to`): totals grouped Recurrent/Capital, then group, then item, with percentage of total at each level. Unused categories hidden.
- **Account balances** (optional as-of date): per account opening balance, total in, total out, current balance, plus a grand total.
- **Export** (`?type=income|expenses|summary&format=xlsx|pdf&from&to`): filtered data. Voided rows are included and clearly marked; totals exclude them.

## 9. Frontend (client)

Screens: Login; Dashboard (income, spending and net cards with a date-range picker, balance-per-account panel); Income (record form that opens the receipt PDF after saving, filterable list with void); Expenses (cascading category dropdowns, amount, date, account, optional note, filterable list with void); Reports (spending-by-category chart and table, export buttons); Admin (users, roles, accounts).

## 10. Error handling

- Zod validation on every write: amount is a positive integer, date not in the future, account exists and is active, category path exists in the tree. Failures return 400 with per-field messages.
- 401 sends the user to login; 403 shows a "not allowed" message.
- A void without a reason returns 400; a void of an already-voided record returns 409.
- One central error handler returns generic messages to clients and logs detail; stack traces never reach the browser.
- Failed saves keep the form contents and offer retry; the save button is disabled while a request is in flight to prevent duplicate payments.

## 11. Testing

- **Server** (Jest, Supertest, in-memory MongoDB): concurrent receipt numbering (no duplicates or gaps); void behaviour (excluded from totals, kept in lists, audit entry written); balance and summary maths including voided entries and Lagos midnight boundaries; role guards for every route (table-driven); category validation.
- **Client** (Vitest, React Testing Library): cascading category dropdowns, role-based menu visibility, form validation messages.
- **PDF/Excel**: smoke tests (generates, non-empty, contains the receipt number, contains VOID when voided).
- **Manual end-to-end pass** before handover: record income, print receipt, record expense, void one of each, verify dashboard and account balances by hand.

## 12. Open items

- Meaning of "Other T.P" in Servicing & Maintenance (treated as a plain item until confirmed).
- Hospital name and logo for the receipt header.
