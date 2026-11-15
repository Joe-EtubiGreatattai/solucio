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
    // Set when another Solucio app recorded this line (e.g. Solucio Payroll), so it's never recorded twice
    externalRef: { type: String, trim: true },
    source: { type: String, trim: true },
    // Money moved out to another Solucio-owned account (e.g. to fund salaries). It still counts toward
    // this account's balance, but it is NOT real spending, so reports leave it out of expense totals.
    internalTransfer: { type: Boolean, default: false },
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
// Report aggregations split real spending from internal transfers on { account, voided, internalTransfer, date }.
expenseSchema.index({ account: 1, voided: 1, internalTransfer: 1, date: 1 });

expenseSchema.index({ externalRef: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Expense', expenseSchema);
