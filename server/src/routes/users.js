const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const User = require('../models/User');
const Role = require('../models/Role');
const { ADMIN_KEY } = require('../config/permissions');
const { authenticate, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { logAudit } = require('../services/audit');

const password = z.string().min(8, 'Password must be at least 8 characters');
const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password,
  role: z.string().trim().toLowerCase().min(1, 'Choose a role'),
});
const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  role: z.string().trim().toLowerCase().min(1).optional(),
  active: z.boolean().optional(),
  password: password.optional(),
});

router.use(authenticate, requirePermission('users.manage'));

const isAdmin = (req) => req.user.role === ADMIN_KEY;

// Roles are data now, so check the role exists. Only an admin may hand out the Admin role.
async function checkRole(req, key) {
  if (!(await Role.exists({ key }))) throw new AppError(400, 'That role does not exist', { role: 'Choose an existing role' });
  if (key === ADMIN_KEY && !isAdmin(req)) throw new AppError(403, 'Only an admin can make someone an admin');
}

router.get('/', asyncHandler(async (req, res) => res.json(await User.find().sort('name'))));

router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
  const { password: plain, ...rest } = req.validated.body;
  await checkRole(req, rest.role);
  let user;
  try {
    user = await User.create({ ...rest, passwordHash: await bcrypt.hash(plain, 10) });
  } catch (err) {
    if (err.code === 11000) throw new AppError(409, 'A user with that email already exists', { email: 'Already in use' });
    throw err;
  }
  await logAudit({ actor: req.user._id, action: 'user.create', targetModel: 'User', targetId: user._id, details: rest });
  res.status(201).json(user);
}));

router.patch('/:id', validate(updateSchema), asyncHandler(async (req, res) => {
  const { password: plain, ...changes } = req.validated.body;
  const target = await User.findById(req.params.id);
  if (!target) throw new AppError(404, 'User not found');
  if (target.role === ADMIN_KEY && !isAdmin(req)) throw new AppError(403, 'Only an admin can change an admin');
  if (changes.role) await checkRole(req, changes.role);
  if (req.params.id === req.user.id && ((changes.role && changes.role !== req.user.role) || changes.active === false)) {
    throw new AppError(400, 'You cannot change your own role or deactivate yourself');
  }
  const set = { ...changes };
  if (plain) set.passwordHash = await bcrypt.hash(plain, 10);
  const user = await User.findByIdAndUpdate(req.params.id, { $set: set }, { new: true });
  if (!user) throw new AppError(404, 'User not found');
  // Log what changed, never the password or its hash.
  await logAudit({
    actor: req.user._id, action: 'user.update', targetModel: 'User', targetId: user._id,
    details: { name: user.name, email: user.email, changes, passwordReset: !!plain },
  });
  res.json(user);
}));

module.exports = router;
