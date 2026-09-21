const router = require('express').Router();
const { z } = require('zod');
const { authenticate, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const { isoDate } = require('../utils/schemas');
const reports = require('../services/reports');
const { buildTable } = require('../services/exportTables');
const { renderXlsx, renderTablePdf } = require('../services/exporters');

const rangeShape = { from: isoDate, to: isoDate };
const ordered = (d) => d.from <= d.to;
const orderedMsg = { message: 'From must be on or before To', path: ['from'] };
const rangeQuery = z.object(rangeShape).refine(ordered, orderedMsg);
const balancesQuery = z.object({ asOf: isoDate.optional() });

router.use(authenticate);

router.get('/summary', requirePermission('reports.view'), validate(rangeQuery, 'query'), asyncHandler(async (req, res) => {
  const { from, to } = req.validated.query;
  res.json(await reports.summary(from, to));
}));

router.get('/spending-by-category', requirePermission('reports.view'), validate(rangeQuery, 'query'), asyncHandler(async (req, res) => {
  const { from, to } = req.validated.query;
  res.json(await reports.spendingByCategory(from, to));
}));

router.get('/account-balances', requirePermission('reports.view'), validate(balancesQuery, 'query'), asyncHandler(async (req, res) => {
  res.json(await reports.accountBalances(req.validated.query.asOf));
}));

const exportQuery = z
  .object({ ...rangeShape, type: z.enum(['income', 'expenses', 'summary']), format: z.enum(['xlsx', 'pdf']) })
  .refine(ordered, orderedMsg);

router.get('/export', requirePermission('reports.view', 'reports.export'), validate(exportQuery, 'query'), asyncHandler(async (req, res) => {
  const { type, format, from, to } = req.validated.query;
  const table = await buildTable(type, from, to);
  const buffer = format === 'xlsx' ? await renderXlsx(table) : await renderTablePdf(table);
  res.set({
    'Content-Type': format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf',
    'Content-Disposition': `attachment; filename="solucio-${type}-${from}_to_${to}.${format}"`,
  });
  res.send(buffer);
}));

module.exports = router;
