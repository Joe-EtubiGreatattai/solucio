const { z } = require('zod');
const { parseLagosDate, isFuture } = require('./dates');

const validDate = (s) => {
  try { parseLagosDate(s); return true; } catch { return false; }
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD').refine(validDate, 'Invalid date');
const recordDate = isoDate.refine((s) => !isFuture(s), 'Date cannot be in the future');
const amount = z
  .number({ invalid_type_error: 'Amount must be a number', required_error: 'Amount is required' })
  .int('Amount must be in whole kobo')
  .positive('Amount must be greater than zero')
  .max(10_000_000_000_000, 'Amount is too large');
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const voidBody = z.object({ reason: z.string().trim().min(3, 'Give a reason for voiding') });
const listQueryShape = {
  from: isoDate.optional(),
  to: isoDate.optional(),
  accountId: objectId.optional(),
  status: z.enum(['all', 'active', 'voided']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
};

module.exports = { isoDate, recordDate, amount, objectId, voidBody, listQueryShape };
