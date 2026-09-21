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
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => ensureBuiltInRoles())
  .then(() => ensureDefaultCategories())
  .then(() => app.listen(port, () => console.log(`Solucio Payment and Receipt API on :${port}`)))
  .catch((err) => { console.error(err); process.exit(1); });
