const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');
const Account = require('../src/models/Account');

let n = 0;
async function createUser(role = 'admin', overrides = {}) {
  n += 1;
  const user = await User.create({
    name: `${role} ${n}`,
    email: `${role}${n}@test.com`,
    passwordHash: await bcrypt.hash('password123', 4),
    role,
    ...overrides,
  });
  const token = jwt.sign({ sub: user.id, role }, process.env.JWT_SECRET);
  return { user, token };
}
const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function makeAccount(overrides = {}) {
  return Account.create({
    name: 'Main Account', type: 'bank', bankName: 'GTBank', accountNumber: '0123456789', openingBalance: 0, ...overrides,
  });
}

module.exports = { createUser, auth, makeAccount };
