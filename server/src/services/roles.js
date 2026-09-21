const Role = require('../models/Role');
const { BUILT_IN_ROLES, ADMIN_KEY, PERMISSION_KEYS } = require('../config/permissions');

// Creates any missing built-in role, never overwrites edits to Cashier or Accountant,
// and keeps Admin complete when new permissions are added later.
async function ensureBuiltInRoles() {
  for (const r of BUILT_IN_ROLES) {
    try {
      await Role.updateOne(
        { key: r.key },
        { $setOnInsert: { key: r.key, name: r.name, description: r.description, permissions: r.permissions, builtIn: true } },
        { upsert: true }
      );
    } catch (err) {
      if (err.code !== 11000) throw err; // another process created it first
    }
  }
  await Role.updateOne({ key: ADMIN_KEY }, { $set: { permissions: PERMISSION_KEYS, builtIn: true } });
}

module.exports = { ensureBuiltInRoles };
