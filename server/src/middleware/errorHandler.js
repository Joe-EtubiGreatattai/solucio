const { ZodError } = require('zod');
const AppError = require('../utils/AppError');

function notFound(req, res) {
  res.status(404).json({ message: 'Not found' });
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof ZodError) {
    const fields = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      if (!(key in fields)) fields[key] = issue.message;
    }
    return res.status(400).json({ message: 'Please fix the highlighted fields', fields });
  }
  if (err instanceof AppError) return res.status(err.status).json({ message: err.message, fields: err.fields });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON' });
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid id' });
  console.error(err);
  res.status(500).json({ message: 'Something went wrong' });
}

module.exports = { notFound, errorHandler };
