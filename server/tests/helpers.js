const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');

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

module.exports = { createUser, auth };
