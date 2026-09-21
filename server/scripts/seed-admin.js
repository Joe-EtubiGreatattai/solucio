require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');

(async () => {
  const { ADMIN_NAME = 'Administrator', ADMIN_EMAIL, ADMIN_PASSWORD, MONGODB_URI } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !MONGODB_URI) {
    console.error('Set ADMIN_EMAIL, ADMIN_PASSWORD and MONGODB_URI');
    process.exit(1);
  }
  await mongoose.connect(MONGODB_URI);
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await User.findOneAndUpdate(
    { email: ADMIN_EMAIL.toLowerCase() },
    { name: ADMIN_NAME, passwordHash, role: 'admin', active: true },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log(`Admin ready: ${ADMIN_EMAIL}`);
  await mongoose.disconnect();
})().catch((err) => {
  console.error(`Could not seed admin: ${err.message}`);
  process.exit(1);
});
