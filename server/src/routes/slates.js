const router = require('express').Router();
const { z } = require('zod');
const { authenticate, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { Slate, SlateArchive } = require('../models/Slate');
const { performNewSlate } = require('../services/slate');
const { logAudit } = require('../services/audit');

// Every slate action requires the strong, admin-level permission.
router.use(authenticate, requirePermission('slate.manage'));

// Past slates (closed years), newest first.
router.get('/', asyncHandler(async (req, res) => {
  const slates = await Slate.find({}).populate('createdBy', 'name').sort({ createdAt: -1 }).lean();
  res.json(slates);
}));

const createBody = z.object({
  label: z.string().trim().min(1).max(60),
  confirm: z.string(),
});

// Close the year into a slate and clear the system. Guarded: the caller must re-type the exact label.
router.post('/', validate(createBody), asyncHandler(async (req, res) => {
  const { label, confirm } = req.validated.body;
  if (confirm.trim() !== label) throw new AppError(400, `Type "${label}" exactly to confirm starting a new slate.`);
  const slate = await performNewSlate({ label, by: req.user._id });
  await logAudit({
    actor: req.user._id,
    action: 'slate.create',
    targetModel: 'Slate',
    targetId: slate._id,
    details: { label, ...slate.summary },
  });
  res.status(201).json(slate);
}));

// Download a slate's full archived data as JSON (an off-system backup of that year).
router.get('/:id/export', asyncHandler(async (req, res) => {
  const slate = await Slate.findById(req.params.id).lean();
  if (!slate) throw new AppError(404, 'Slate not found');
  const archive = await SlateArchive.find({ slate: slate._id }).lean();
  const data = {};
  for (const row of archive) { (data[row.kind] = data[row.kind] || []).push(row.data); }
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="slate-${String(slate.label).replace(/[^\w.-]/g, '_')}.json"`);
  res.json({ slate, data });
}));

module.exports = router;
