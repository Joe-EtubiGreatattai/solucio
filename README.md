# Solucio Payment and Receipt

Hospital payments, receipts and spending tracker (MongoDB, Express, React, Node).

## Setup

Requires Node 20+ and a MongoDB instance.

    cd server && cp .env.example .env    # set MONGODB_URI, JWT_SECRET, HOSPITAL_NAME, ADMIN_*
    npm install && npm run seed:admin    # creates the first admin
    npm run dev                          # API on :5001

    cd client && npm install && npm run dev   # app on :5173 (proxies /api to :5001)

## Tests

    cd server && npm test
    cd client && npm test

## Rules worth knowing

- Money is stored as integer kobo. Dates are Africa/Lagos days.
- Income and expenses can never be edited or deleted, only voided with a reason. Voided entries stay listed and never count in totals or balances.
- Receipt numbers are `RCP-YYYY-NNNN`, per year, and are never reused.
- Access is by permission, not by role name. The admin decides what each role can do in **Admin → Roles**: view, record and void income and expenses; view and export reports; view the activity log; manage accounts; manage users. Cashier, Accountant and Admin come ready-made (Cashier and Accountant can be edited; Admin is locked and always has everything). New roles can be created and deleted when no user holds them.
- Only an admin can create or edit roles, make someone an admin, or change an admin. A role given "Manage users" can add and edit ordinary users but never admins. Changes to a role apply on the person's next request.
- Expense categories (category, group, item) live in the database. The list in `server/src/config/categories.js` is only the starting set, copied in the first time the server runs. An admin (or any role given "Manage expense categories") adds categories, groups and items in **Admin → Categories**. They can be hidden but never deleted or renamed, so past expenses and reports keep making sense.
# solucio
