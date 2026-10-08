const Role = require('../models/Role');
const { permissionsForRole, MAINTENANCE_KEY } = require('../config/permissions');

// The one place that turns a user's role into a display name and permission list. Both sign-in and every
// authenticated request use it, so they can never disagree. The maintenance role lives only in code, so it
// has no Role document to look up.
async function accessForUser(user) {
  const role = user.role === MAINTENANCE_KEY
    ? { key: MAINTENANCE_KEY, name: 'Maintenance' }
    : await Role.findOne({ key: user.role }).lean();
  return { roleName: role ? role.name : user.role, permissions: permissionsForRole(role) };
}

module.exports = { accessForUser };
