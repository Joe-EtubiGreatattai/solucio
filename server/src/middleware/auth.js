const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Role = require('../models/Role');
const AppError = require('../utils/AppError');
const { ADMIN_KEY, MAINTENANCE_KEY } = require('../config/permissions');
const { accessForUser } = require('../services/roleAccess');

async function authenticate(req, res, next) {
  try {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new AppError(401, 'Authentication required');
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      throw new AppError(401, 'Invalid or expired token');
    }
    const user = await User.findById(payload.sub);
    if (!user || !user.active) throw new AppError(401, 'Account not available');
    // Read the role fresh on every request so a change to a role applies straight away.
    const { roleName, permissions } = await accessForUser(user);
    req.user = user;
    req.roleName = roleName;
    req.permissions = new Set(permissions);
    next();
  } catch (err) {
    next(err);
  }
}

// Allows the request only if the person's role holds every listed permission.
const requirePermission = (...permissions) => (req, res, next) =>
  permissions.every((p) => req.permissions.has(p))
    ? next()
    : next(new AppError(403, 'You are not allowed to do that'));

// Only people who hold the built-in Admin role. Used for changing roles, which can't be delegated.
const requireAdminRole = (req, res, next) =>
  (req.user.role === ADMIN_KEY || req.user.role === MAINTENANCE_KEY) ? next() : next(new AppError(403, 'Only an admin can do that'));

module.exports = { authenticate, requirePermission, requireAdminRole };
