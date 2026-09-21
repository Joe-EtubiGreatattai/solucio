const router = require('express').Router();

router.get('/health', (req, res) => res.json({ ok: true }));

router.use('/auth', require('./auth'));
router.use('/categories', require('./categories'));
router.use('/accounts', require('./accounts'));
router.use('/incomes', require('./incomes'));
router.use('/expenses', require('./expenses'));
router.use('/statements', require('./statements'));
router.use('/reports', require('./reports'));
router.use('/audit-logs', require('./auditLogs'));
router.use('/roles', require('./roles'));
router.use('/users', require('./users'));

module.exports = router;
