const mongoose = require('mongoose');
const { Schema } = mongoose;

const incomeSchema = new Schema(
  {
    amount: { type: Number, required: true, min: 1 },
    date: { type: Date, required: true },
    method: { type: String, enum: ['transfer', 'pos', 'cash'], required: true },
    account: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    // Optional income category (income tree). Left null for quick receipts.
    type: { type: String, default: null },
    group: { type: String, default: null },
    item: { type: String, default: null },
    receiptNumber: { type: String, required: true, unique: true },
    // Recorded by another Solucio app (e.g. a patient payment from Solucio EMR): its reference, so it's recorded once
    externalRef: { type: String, trim: true },
    source: { type: String, trim: true },
    // Money moved in from another Solucio-owned account (e.g. to fund salaries). It still counts toward
    // this account's balance, but it is NOT real income, so reports leave it out of income totals.
    internalTransfer: { type: Boolean, default: false },
    note: { type: String, trim: true, maxlength: 500 },
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
incomeSchema.index({ date: -1, createdAt: -1 });
incomeSchema.index({ externalRef: 1 }, { unique: true, sparse: true });
// Account-filtered lists, and the reports aggregation that matches { voided, date } over a range.
incomeSchema.index({ account: 1, date: -1 });
incomeSchema.index({ voided: 1, date: -1 });
// Account-scoped report aggregations match { account, voided, date-range }; this lets them use an index
// instead of scanning, and the opening-balance scan (date < asOf) rides it too.
incomeSchema.index({ account: 1, voided: 1, date: 1 });
// Report aggregations split real income from internal transfers on { account, voided, internalTransfer, date }.
incomeSchema.index({ account: 1, voided: 1, internalTransfer: 1, date: 1 });

module.exports = mongoose.model('Income', incomeSchema);
