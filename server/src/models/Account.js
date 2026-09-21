const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['bank', 'cash'], required: true },
    bankName: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    openingBalance: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Account', accountSchema);
