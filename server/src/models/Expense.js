const mongoose = require('mongoose');
const { Schema } = mongoose;

const expenseSchema = new Schema(
  {
    amount: { type: Number, required: true, min: 1 },
    date: { type: Date, required: true },
    account: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    type: { type: String, required: true },
    group: { type: String, default: null },
    item: { type: String, default: null },
    note: { type: String, trim: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    voided: { type: Boolean, default: false },
    voidReason: String,
    voidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    voidedAt: Date,
  },
  { timestamps: true }
);
// Matches the list page's exact sort ({ date: -1, createdAt: -1 }), so deep pages don't need an
// in-memory sort.
expenseSchema.index({ date: -1, createdAt: -1 });
// Account-filtered lists, and the reports aggregation that matches { voided, date } over a range.
expenseSchema.index({ account: 1, date: -1 });
expenseSchema.index({ voided: 1, date: -1 });
// Account-scoped report aggregations match { account, voided, date-range }; this lets them use an index
// instead of scanning, and the opening-balance scan (date < asOf) rides it too.
expenseSchema.index({ account: 1, voided: 1, date: 1 });

module.exports = mongoose.model('Expense', expenseSchema);
