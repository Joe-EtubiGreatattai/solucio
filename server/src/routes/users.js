const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const User = require('../models/User');
const { authenticate, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');

const password = z.string().min(8, 'Password must be at least 8 characters');
const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password,
  role: z.enum(User.ROLES),
});
const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  role: z.enum(User.ROLES).optional(),
  active: z.boolean().optional(),
  password: password.optional(),
});

router.use(authenticate, requireRole('admin'));

router.get('/', asyncHandler(async (req, res) => res.json(await User.find().sort('name'))));

router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
  const { password: plain, ...rest } = req.validated.body;
  try {
    res.status(201).json(await User.create({ ...rest, passwordHash: await bcrypt.hash(plain, 10) }));
  } catch (err) {
    if (err.code === 11000) throw new AppError(409, 'A user with that email already exists', { email: 'Already in use' });
    throw err;
  }
}));

router.patch('/:id', validate(updateSchema), asyncHandler(async (req, res) => {
  const { password: plain, ...changes } = req.validated.body;
  if (req.params.id === req.user.id && ((changes.role && changes.role !== req.user.role) || changes.active === false)) {
    throw new AppError(400, 'You cannot change your own role or deactivate yourself');
  }
  if (plain) changes.passwordHash = await bcrypt.hash(plain, 10);
  const user = await User.findByIdAndUpdate(req.params.id, { $set: changes }, { new: true });
  if (!user) throw new AppError(404, 'User not found');
  res.json(user);
}));

module.exports = router;
