const router = require('express').Router();
const { z } = require('zod');
const { authenticate, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const { logAudit } = require('../services/audit');
const categories = require('../services/categories');

const name = z.string().trim().min(1, 'Enter a name').max(60, 'Keep the name under 60 characters');
const parent = z.string().trim().min(1, 'Choose where this goes');
const typeBody = z.object({ name });
const groupBody = z.object({ type: parent, name });
const itemBody = z.object({ type: parent, group: parent, name });
const activeBody = z
  .object({ type: parent, group: parent.optional(), item: parent.optional(), active: z.boolean() })
  .refine((d) => !d.item || d.group, { message: 'Choose the group the item belongs to', path: ['group'] });

// Forms read this: what can be used right now.
router.get('/', authenticate, asyncHandler(async (req, res) => res.json(await categories.publicTree())));

const manage = [authenticate, requirePermission('categories.manage')];

// The admin screen reads this: everything, including what is hidden.
router.get('/all', ...manage, asyncHandler(async (req, res) => res.json(await categories.getTree({ includeInactive: true }))));

async function added(req, res, level, path, category) {
  await logAudit({ actor: req.user._id, action: 'category.add', targetModel: 'Category', targetId: category._id, details: { level, path } });
  res.status(201).json(await categories.getTree({ includeInactive: true }));
}

router.post('/types', ...manage, validate(typeBody), asyncHandler(async (req, res) => {
  const { name: n } = req.validated.body;
  await added(req, res, 'category', [n], await categories.addType(n));
}));
router.post('/groups', ...manage, validate(groupBody), asyncHandler(async (req, res) => {
  const { type, name: n } = req.validated.body;
  await added(req, res, 'group', [type, n], await categories.addGroup(type, n));
}));
router.post('/items', ...manage, validate(itemBody), asyncHandler(async (req, res) => {
  const { type, group, name: n } = req.validated.body;
  await added(req, res, 'item', [type, group, n], await categories.addItem(type, group, n));
}));

// Hide (or show again) a category, group or item. Nothing is ever deleted, so past expenses keep making sense.
router.patch('/active', ...manage, validate(activeBody), asyncHandler(async (req, res) => {
  const b = req.validated.body;
  const category = await categories.setActive(b);
  await logAudit({
    actor: req.user._id, action: 'category.update', targetModel: 'Category', targetId: category._id,
    details: { path: [b.type, b.group, b.item].filter(Boolean), active: b.active },
  });
  res.json(await categories.getTree({ includeInactive: true }));
}));

module.exports = router;
