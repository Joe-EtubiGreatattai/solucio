const router = require('express').Router();
const { z } = require('zod');
const { authenticate, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const { isoDate } = require('../utils/schemas');
const reports = require('../services/reports');

const rangeShape = { from: isoDate, to: isoDate };
const ordered = (d) => d.from <= d.to;
const orderedMsg = { message: 'From must be on or before To', path: ['from'] };
const rangeQuery = z.object(rangeShape).refine(ordered, orderedMsg);
const balancesQuery = z.object({ asOf: isoDate.optional() });

router.use(authenticate, requireRole('accountant', 'admin'));

router.get('/summary', validate(rangeQuery, 'query'), asyncHandler(async (req, res) => {
  const { from, to } = req.validated.query;
  res.json(await reports.summary(from, to));
}));

router.get('/spending-by-category', validate(rangeQuery, 'query'), asyncHandler(async (req, res) => {
  const { from, to } = req.validated.query;
  res.json(await reports.spendingByCategory(from, to));
}));

router.get('/account-balances', validate(balancesQuery, 'query'), asyncHandler(async (req, res) => {
  res.json(await reports.accountBalances(req.validated.query.asOf));
}));

module.exports = router;
module.exports.rangeShape = rangeShape;
module.exports.ordered = ordered;
module.exports.orderedMsg = orderedMsg;
