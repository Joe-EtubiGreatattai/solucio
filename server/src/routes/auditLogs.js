const router = require('express').Router();
const { z } = require('zod');
const AuditLog = require('../models/AuditLog');
const { authenticate, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const { parseLagosDate, dayAfter } = require('../utils/dates');
const { isoDate, objectId } = require('../utils/schemas');

const listQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  action: z.string().trim().min(1).max(50).optional(),
  actorId: objectId.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

router.use(authenticate, requirePermission('activity.view'));

router.get('/', validate(listQuery, 'query'), asyncHandler(async (req, res) => {
  const q = req.validated.query;
  const filter = {};
  if (q.from || q.to) {
    filter.createdAt = {};
    if (q.from) filter.createdAt.$gte = parseLagosDate(q.from);
    if (q.to) filter.createdAt.$lt = dayAfter(parseLagosDate(q.to));
  }
  if (q.action) filter.action = q.action;
  if (q.actorId) filter.actor = q.actorId;
  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate('actor', 'name email role'),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ items, total, page: q.page, limit: q.limit });
}));

module.exports = router;
