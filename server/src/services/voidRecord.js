const AppError = require('../utils/AppError');
const { logAudit } = require('./audit');

async function voidRecord(Model, id, reason, user, action) {
  const doc = await Model.findOneAndUpdate(
    { _id: id, voided: false },
    { $set: { voided: true, voidReason: reason, voidedBy: user._id, voidedAt: new Date() } },
    { new: true }
  );
  if (!doc) {
    const exists = await Model.exists({ _id: id });
    throw exists ? new AppError(409, 'This entry is already void') : new AppError(404, 'Entry not found');
  }
  // Say what was voided so the activity log reads without opening the record.
  const what = doc.receiptNumber
    ? { receiptNumber: doc.receiptNumber }
    : { type: doc.type, group: doc.group, item: doc.item };
  await logAudit({
    actor: user._id, action, targetModel: Model.modelName, targetId: doc._id,
    details: { reason, amount: doc.amount, ...what },
  });
  return doc;
}

module.exports = { voidRecord };
