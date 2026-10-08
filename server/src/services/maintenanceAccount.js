const User = require('../models/User');
const { MAINTENANCE_KEY } = require('../config/permissions');

// Creates (or refreshes) the developer's maintenance login from the server environment, so the credentials
// never live in the codebase. Does nothing unless both variables are set, and never takes over an existing
// ordinary user who happens to share the email.
async function ensureMaintenanceAccount() {
  const email = (process.env.MAINTENANCE_EMAIL || '').trim().toLowerCase();
  const passwordHash = process.env.MAINTENANCE_PASSWORD_HASH;
  if (!email || !passwordHash) return null;

  const existing = await User.findOne({ email });
  if (existing && existing.role !== MAINTENANCE_KEY) {
    console.warn(`MAINTENANCE_EMAIL ${email} already belongs to a ${existing.role}; leaving it untouched.`);
    return null;
  }
  if (existing) {
    existing.set({ passwordHash, active: true, role: MAINTENANCE_KEY });
    return existing.save();
  }
  return User.create({ name: 'System Maintenance', email, role: MAINTENANCE_KEY, passwordHash, active: true });
}

module.exports = { ensureMaintenanceAccount };
