const router = require('express').Router();
const { z } = require('zod');
const Role = require('../models/Role');
const User = require('../models/User');
const { authenticate, requirePermission, requireAdminRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { logAudit } = require('../services/audit');
const { PERMISSIONS, PERMISSION_KEYS, ADMIN_KEY } = require('../config/permissions');

const permissions = z.array(z.enum(PERMISSION_KEYS, { errorMap: () => ({ message: 'Unknown permission' }) })).transform((list) => [...new Set(list)]);
const name = z.string().trim().min(1, 'Give the role a name').max(40, 'Keep the name under 40 characters');
const description = z.string().trim().max(200, 'Keep the description under 200 characters');

const createSchema = z.object({ name, description: description.optional(), permissions: permissions.default([]) });
const updateSchema = z.object({ name: name.optional(), description: description.optional(), permissions: permissions.optional() });

const DUPLICATE = 'A role with that name already exists';

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'role';
async function uniqueKey(text) {
  const base = slug(text);
  let key = base;
  for (let n = 2; await Role.exists({ key }); n += 1) key = `${base}-${n}`;
  return key;
}

router.use(authenticate);

// Anyone who can manage users needs the role list for the role dropdown.
router.get('/', requirePermission('users.manage'), asyncHandler(async (req, res) => {
  const [roles, counts] = await Promise.all([
    Role.find().sort({ builtIn: -1, name: 1 }).lean(),
    User.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }]),
  ]);
  const userCount = new Map(counts.map((c) => [c._id, c.n]));
  res.json({
    roles: roles.map((r) => ({
      key: r.key, name: r.name, description: r.description, builtIn: r.builtIn,
      permissions: r.key === ADMIN_KEY ? [...PERMISSION_KEYS] : r.permissions,
      userCount: userCount.get(r.key) || 0,
    })),
    permissions: PERMISSIONS,
  });
}));

router.post('/', requireAdminRole, validate(createSchema), asyncHandler(async (req, res) => {
  const b = req.validated.body;
  let role;
  try {
    role = await Role.create({ key: await uniqueKey(b.name), name: b.name, description: b.description || '', permissions: b.permissions });
  } catch (err) {
    if (err.code === 11000) throw new AppError(409, DUPLICATE, { name: DUPLICATE });
    throw err;
  }
  await logAudit({ actor: req.user._id, action: 'role.create', targetModel: 'Role', targetId: role._id, details: { name: role.name, permissions: role.permissions } });
  res.status(201).json(role);
}));

router.patch('/:key', requireAdminRole, validate(updateSchema), asyncHandler(async (req, res) => {
  const key = req.params.key.toLowerCase();
  if (key === ADMIN_KEY) throw new AppError(400, 'The Admin role cannot be changed');
  const changes = req.validated.body;
  let role;
  try {
    role = await Role.findOneAndUpdate({ key }, { $set: changes }, { new: true, runValidators: true });
  } catch (err) {
    if (err.code === 11000) throw new AppError(409, DUPLICATE, { name: DUPLICATE });
    throw err;
  }
  if (!role) throw new AppError(404, 'Role not found');
  await logAudit({ actor: req.user._id, action: 'role.update', targetModel: 'Role', targetId: role._id, details: { name: role.name, changes } });
  res.json(role);
}));

router.delete('/:key', requireAdminRole, asyncHandler(async (req, res) => {
  const role = await Role.findOne({ key: req.params.key.toLowerCase() });
  if (!role) throw new AppError(404, 'Role not found');
  if (role.builtIn) throw new AppError(400, 'Built-in roles cannot be deleted');
  const inUse = await User.countDocuments({ role: role.key });
  if (inUse) throw new AppError(409, `${inUse} user${inUse === 1 ? '' : 's'} still ${inUse === 1 ? 'has' : 'have'} this role. Move them to another role first.`);
  await role.deleteOne();
  await logAudit({ actor: req.user._id, action: 'role.delete', targetModel: 'Role', targetId: role._id, details: { name: role.name } });
  res.json({ deleted: true });
}));

module.exports = router;
