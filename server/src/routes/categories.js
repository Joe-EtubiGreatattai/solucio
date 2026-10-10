const router = require('express').Router();
const { z } = require('zod');
const { authenticate, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const { logAudit } = require('../services/audit');
const categories = require('../services/categories');

const name = z.string().trim().min(1, 'Enter a name').max(60, 'Keep the name under 60 characters');
const parent = z.string().trim().min(1, 'Choose where this goes');
const kind = z.enum(['income', 'expense']).default('expense');
const kindQuery = z.object({ kind });
const typeBody = z.object({ kind, name });
const groupBody = z.object({ kind, type: parent, name });
const itemBody = z.object({ kind, type: parent, group: parent, name });
const activeBody = z
  .object({ kind, type: parent, group: parent.optional(), item: parent.optional(), active: z.boolean() })
  .refine((d) => !d.item || d.group, { message: 'Choose the group the item belongs to', path: ['group'] });

// Forms read this: what can be used right now. kind=income returns the income tree; default is expense.
router.get('/', authenticate, validate(kindQuery, 'query'), asyncHandler(async (req, res) => res.json(await categories.publicTree(req.validated.query.kind))));

const manage = [authenticate, requirePermission('categories.manage')];

// The admin screen reads this: everything, including what is hidden.
router.get('/all', ...manage, validate(kindQuery, 'query'), asyncHandler(async (req, res) => res.json(await categories.getTree({ kind: req.validated.query.kind, includeInactive: true }))));

async function added(req, res, kind, level, path, category) {
  await logAudit({ actor: req.user._id, action: 'category.add', targetModel: 'Category', targetId: category._id, details: { kind, level, path } });
  res.status(201).json(await categories.getTree({ kind, includeInactive: true }));
}

router.post('/types', ...manage, validate(typeBody), asyncHandler(async (req, res) => {
  const { kind: k, name: n } = req.validated.body;
  await added(req, res, k, 'category', [n], await categories.addType(n, k));
}));
router.post('/groups', ...manage, validate(groupBody), asyncHandler(async (req, res) => {
  const { kind: k, type, name: n } = req.validated.body;
  await added(req, res, k, 'group', [type, n], await categories.addGroup(type, n, k));
}));
router.post('/items', ...manage, validate(itemBody), asyncHandler(async (req, res) => {
  const { kind: k, type, group, name: n } = req.validated.body;
  await added(req, res, k, 'item', [type, group, n], await categories.addItem(type, group, n, k));
}));

// Hide (or show again) a category, group or item. Nothing is ever deleted, so past expenses keep making sense.
router.patch('/active', ...manage, validate(activeBody), asyncHandler(async (req, res) => {
  const b = req.validated.body;
  const category = await categories.setActive(b);
  await logAudit({
    actor: req.user._id, action: 'category.update', targetModel: 'Category', targetId: category._id,
    details: { kind: b.kind, path: [b.type, b.group, b.item].filter(Boolean), active: b.active },
  });
  res.json(await categories.getTree({ kind: b.kind, includeInactive: true }));
}));

const removeBody = z
  .object({ kind, type: parent, group: parent.optional(), item: parent.optional() })
  .refine((d) => !d.item || d.group, { message: 'Choose the group the item belongs to', path: ['group'] });

// Delete a category, group or item that nothing uses yet (typos, test entries). Anything in use must be hidden.
router.post('/remove', ...manage, validate(removeBody), asyncHandler(async (req, res) => {
  const b = req.validated.body;
  const category = await categories.removeNode(b);
  await logAudit({
    actor: req.user._id, action: 'category.remove', targetModel: 'Category', targetId: category._id,
    details: { kind: b.kind, level: b.item ? 'item' : b.group ? 'group' : 'category', path: [b.type, b.group, b.item].filter(Boolean) },
  });
  res.json(await categories.getTree({ kind: b.kind, includeInactive: true }));
}));

const renameBody = z
  .object({ kind, type: parent, group: parent.optional(), item: parent.optional(), name })
  .refine((d) => !d.item || d.group, { message: 'Choose the group the item belongs to', path: ['group'] });

// Rename a category, group or item; the new name is cascaded to the records that used the old one.
router.post('/rename', ...manage, validate(renameBody), asyncHandler(async (req, res) => {
  const b = req.validated.body;
  const category = await categories.renameNode(b);
  await logAudit({
    actor: req.user._id, action: 'category.rename', targetModel: 'Category', targetId: category._id,
    details: { kind: b.kind, level: b.item ? 'item' : b.group ? 'group' : 'category', path: [b.type, b.group, b.item].filter(Boolean), name: b.name.trim() },
  });
  res.json(await categories.getTree({ kind: b.kind, includeInactive: true }));
}));

module.exports = router;
