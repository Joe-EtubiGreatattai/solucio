const router = require('express').Router();
const { z } = require('zod');
const { authenticate, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { isoDate, objectId } = require('../utils/schemas');
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

router.get('/cash-flow', requirePermission('reports.view'), validate(rangeQuery, 'query'), asyncHandler(async (req, res) => {
  const { from, to } = req.validated.query;
  res.json(await reports.cashFlow(from, to));
}));

const exportQuery = z
  .object({
    type: z.enum(['income', 'expenses', 'summary']),
    format: z.enum(['xlsx', 'pdf']),
    from: isoDate.optional(),
    to: isoDate.optional(),
    status: z.enum(['all', 'active', 'voided']).optional(),
    accountId: objectId.optional(),
    method: z.enum(['transfer', 'pos', 'cash']).optional(),
    categoryType: z.string().optional(),
    group: z.string().optional(),
    item: z.string().optional(),
  })
  .refine((d) => !(d.from && d.to) || ordered(d), orderedMsg)
  .refine((d) => d.type !== 'summary' || (d.from && d.to), { message: 'From and To are required', path: ['from'] });

// Exporting income/expenses only needs the same permission as viewing that list; the summary export stays behind reports.export.
const canExport = (req, res, next) => {
  const type = req.query.type;
  const perms = req.permissions;
  const ok = type === 'income' ? perms.has('income.view')
    : type === 'expenses' ? perms.has('expenses.view')
      : perms.has('reports.view') && perms.has('reports.export');
  ok ? next() : next(new AppError(403, 'You are not allowed to do that'));
};

router.get('/export', canExport, validate(exportQuery, 'query'), asyncHandler(async (req, res) => {
  const { type, format, from, to, status, accountId, method, categoryType, group, item } = req.validated.query;
  const table = await buildTable(type, from, to, { status, accountId, method, type: categoryType, group, item });
  const buffer = format === 'xlsx' ? await renderXlsx(table) : await renderTablePdf(table);
  const range = from && to ? `${from}_to_${to}` : from ? `from_${from}` : to ? `to_${to}` : 'all';
  res.set({
    'Content-Type': format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf',
    'Content-Disposition': `attachment; filename="solucio-${type}-${range}.${format}"`,
  });
  res.send(buffer);
}));

module.exports = router;
