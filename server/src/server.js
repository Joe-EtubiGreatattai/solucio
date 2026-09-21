require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');

if (!process.env.JWT_SECRET || !process.env.MONGODB_URI) {
  console.error('JWT_SECRET and MONGODB_URI must be set (see .env.example)');
  process.exit(1);
}
const port = process.env.PORT || 5000;
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => app.listen(port, () => console.log(`Solucio API on :${port}`)))
  .catch((err) => { console.error(err); process.exit(1); });
