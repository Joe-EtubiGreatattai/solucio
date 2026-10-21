require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');
const app = require('./app');
const origins = require('./config/origins');
const { initRealtime } = require('./realtime');
const { ensureBuiltInRoles } = require('./services/roles');
const { ensureDefaultCategories } = require('./services/categories');
const { ensureMaintenanceAccount } = require('./services/maintenanceAccount');
const { migrateStatementSources } = require('./services/statementSource');

if (!process.env.JWT_SECRET || !process.env.MONGODB_URI) {
  console.error('JWT_SECRET and MONGODB_URI must be set (see .env.example)');
  process.exit(1);
}
const port = process.env.PORT || 5001;
// HOST=127.0.0.1 keeps the API reachable only through nginx on the same machine.
const host = process.env.HOST || undefined;
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => ensureBuiltInRoles())
  .then(() => ensureDefaultCategories())
  .then(() => {
    const server = http.createServer(app);
    initRealtime(server, { origins }); // live updates share the API's port and sign-in
    server.listen(port, host, () => console.log(`Solucio Payment and Receipt API on ${host || ''}:${port} (live updates on)`));
    // Shrink any statements that still store their PDF inline. Runs in the background so it never delays
    // startup, and is idempotent — once a statement's PDF has moved it is skipped on later restarts.
    migrateStatementSources().catch((err) => console.error('statement source migration failed', err));
  })
  .catch((err) => { console.error(err); process.exit(1); });
