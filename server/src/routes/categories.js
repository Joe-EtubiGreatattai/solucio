const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { listCategories } = require('../config/categories');

router.get('/', authenticate, (req, res) => res.json(listCategories()));

module.exports = router;
