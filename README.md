# Solucio

Hospital payments, receipts and spending tracker (MongoDB, Express, React, Node).

## Setup

Requires Node 20+ and a MongoDB instance.

    cd server && cp .env.example .env    # set MONGODB_URI, JWT_SECRET, HOSPITAL_NAME, ADMIN_*
    npm install && npm run seed:admin    # creates the first admin
    npm run dev                          # API on :5000

    cd client && npm install && npm run dev   # app on :5173 (proxies /api to :5000)

## Tests

    cd server && npm test
    cd client && npm test

## Rules worth knowing

- Money is stored as integer kobo. Dates are Africa/Lagos days.
- Income and expenses can never be edited or deleted, only voided with a reason. Voided entries stay listed and never count in totals or balances.
- Receipt numbers are `RCP-YYYY-NNNN`, per year, and are never reused.
- Roles: cashier (income), accountant (income, expenses, reports), admin (everything plus users and accounts).
- Expense categories live in `server/src/config/categories.js`.
