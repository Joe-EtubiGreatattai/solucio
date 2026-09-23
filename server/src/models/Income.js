const mongoose = require('mongoose');
const { Schema } = mongoose;

const incomeSchema = new Schema(
  {
    amount: { type: Number, required: true, min: 1 },
    date: { type: Date, required: true },
    method: { type: String, enum: ['transfer', 'pos', 'cash'], required: true },
    account: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    receiptNumber: { type: String, required: true, unique: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    voided: { type: Boolean, default: false },
    voidReason: String,
    voidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    voidedAt: Date,
  },
  { timestamps: true }
);
incomeSchema.index({ date: -1 });
incomeSchema.index({ account: 1 });

module.exports = mongoose.model('Income', incomeSchema);
