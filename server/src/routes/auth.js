const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const Role = require('../models/Role');
const { permissionsForRole } = require('../config/permissions');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { logAudit } = require('../services/audit');

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  skipSuccessfulRequests: true,
  skip: () => process.env.NODE_ENV === 'test',
  message: { message: 'Too many login attempts. Try again later.' },
});

router.post('/login', limiter, validate(loginSchema), asyncHandler(async (req, res) => {
  const { email, password } = req.validated.body;
  const user = await User.findOne({ email: email.toLowerCase() });
  const ok = user && user.active && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) throw new AppError(401, 'Invalid email or password');
  await logAudit({ actor: user._id, action: 'auth.login', targetModel: 'User', targetId: user._id, details: { email: user.email } });
  const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '12h' });
  const role = await Role.findOne({ key: user.role }).lean();
  res.json({ token, user, roleName: role ? role.name : user.role, permissions: permissionsForRole(role) });
}));

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
}).refine((d) => d.currentPassword !== d.newPassword, { message: 'Choose a password different from your current one', path: ['newPassword'] });

// Anyone signed in can change their own password, but only by proving they know the current one.
router.post('/password', authenticate, limiter, validate(passwordSchema), asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.validated.body;
  if (!(await bcrypt.compare(currentPassword, req.user.passwordHash))) {
    throw new AppError(400, 'Current password is incorrect', { currentPassword: 'Current password is incorrect' });
  }
  req.user.passwordHash = await bcrypt.hash(newPassword, 10);
  await req.user.save();
  await logAudit({ actor: req.user._id, action: 'user.password-change', targetModel: 'User', targetId: req.user._id, details: { name: req.user.name, email: req.user.email } });
  res.json({ ok: true });
}));

router.get('/me', authenticate, (req, res) =>
  res.json({ user: req.user, roleName: req.roleName, permissions: [...req.permissions] }));

module.exports = router;
