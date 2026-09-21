require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');
const { ensureBuiltInRoles } = require('./services/roles');
const { ensureDefaultCategories } = require('./services/categories');

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
  .then(() => app.listen(port, host, () => console.log(`Solucio Payment and Receipt API on ${host || ''}:${port}`)))
  .catch((err) => { console.error(err); process.exit(1); });
