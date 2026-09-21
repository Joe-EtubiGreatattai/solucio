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

## Deployment

The backend runs on a VPS at **https://solucio.techtree.lifestyle** (API under `/api`). It uses the MongoDB Atlas database named in the `MONGODB_URI` setting.

| Piece | Where |
|---|---|
| App files | `/var/www/solucio-backend` (owned by the unprivileged `solucio` user) |
| Service | `systemctl status solucio-api` (unit copy in `deploy/solucio-api.service`), limited to 350 MB of memory |
| Settings | `/var/www/solucio-backend/.env`, mode 600, never in git |
| Web server | nginx site `/etc/nginx/conf.d/solucio-backend.conf`, HTTPS by certbot (auto-renews) |
| Logs | `journalctl -u solucio-api -f` |

Server settings: `NODE_ENV=production`, `PORT=5001`, `HOST=127.0.0.1` (only nginx can reach it), `TRUST_PROXY=1`, `MONGODB_URI`, `JWT_SECRET`, `HOSPITAL_NAME`, and `CLIENT_ORIGIN`, the web address(es) of the app allowed to call the API (comma separated).

**Redeploy:** `deploy/deploy.sh` runs the tests, uploads the code, installs dependencies and restarts the service.

**Web app:** `client/.env.production` holds `VITE_API_URL=https://solucio.techtree.lifestyle`. It is not a secret, it is committed, and Vite uses it automatically for every production build (`npm run build`, and builds on Vercel). To use a different API, change that file. Add the web app's address to `CLIENT_ORIGIN` on the server.

**Careful:** the server and your laptop can point at the same Atlas database. Give local development its own database name (for example `.../solucio_dev`) so tests and `seed:demo --reset` can never touch live data.
