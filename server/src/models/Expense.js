const mongoose = require('mongoose');
const { Schema } = mongoose;

const expenseSchema = new Schema(
  {
    amount: { type: Number, required: true, min: 1 },
    date: { type: Date, required: true },
    account: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    type: { type: String, required: true },
    group: { type: String, required: true },
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
expenseSchema.index({ date: -1 });
expenseSchema.index({ account: 1 });

module.exports = mongoose.model('Expense', expenseSchema);
