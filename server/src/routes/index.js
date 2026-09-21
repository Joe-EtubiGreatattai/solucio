const router = require('express').Router();

router.get('/health', (req, res) => res.json({ ok: true }));

router.use('/auth', require('./auth'));
router.use('/categories', require('./categories'));
router.use('/accounts', require('./accounts'));
router.use('/incomes', require('./incomes'));

module.exports = router;
