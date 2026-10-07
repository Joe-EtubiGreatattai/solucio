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
    name: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    groups: { type: [groupSchema], default: [] },
  },
  { timestamps: true, optimisticConcurrency: true }
);
categorySchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = mongoose.model('Category', categorySchema);
