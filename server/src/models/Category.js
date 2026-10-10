const mongoose = require('mongoose');

// Names are what expenses store, so nothing is ever renamed, and anything in use can only be hidden from new
// expenses. Only a name nothing uses yet (a typo, a test entry) can be removed for good.
const itemSchema = new mongoose.Schema({ name: { type: String, required: true, trim: true }, active: { type: Boolean, default: true } }, { _id: false });
const groupSchema = new mongoose.Schema(
  { name: { type: String, required: true, trim: true }, active: { type: Boolean, default: true }, items: { type: [itemSchema], default: [] } },
  { _id: false }
);
const categorySchema = new mongoose.Schema(
  {
    // Which ledger this category belongs to. Income and expense keep separate trees.
    kind: { type: String, enum: ['expense', 'income'], default: 'expense', required: true },
    name: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    groups: { type: [groupSchema], default: [] },
  },
  { timestamps: true, optimisticConcurrency: true }
);
categorySchema.index({ kind: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = mongoose.model('Category', categorySchema);
