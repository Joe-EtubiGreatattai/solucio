const router = require('express').Router();
const { z } = require('zod');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const { MAINTENANCE_KEY } = require('../config/permissions');
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
  // Keep maintenance work out of the clinic's activity view (the records still exist in the database).
  const hiddenActors = await User.find({ role: MAINTENANCE_KEY }).distinct('_id');
  if (q.actorId) {
    if (hiddenActors.some((id) => id.equals(q.actorId))) return res.json({ items: [], total: 0, page: q.page, limit: q.limit });
    filter.actor = q.actorId;
  } else if (hiddenActors.length) {
    filter.actor = { $nin: hiddenActors };
  }
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
