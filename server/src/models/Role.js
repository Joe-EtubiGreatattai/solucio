const mongoose = require('mongoose');
const { PERMISSION_KEYS } = require('../config/permissions');

const roleSchema = new mongoose.Schema(
  {
    // key never changes (users point at it); name is what people see and can be renamed.
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    permissions: {
      type: [String],
      default: [],
      validate: { validator: (list) => list.every((k) => PERMISSION_KEYS.includes(k)), message: 'Unknown permission' },
    },
    builtIn: { type: Boolean, default: false },
  },
  { timestamps: true }
);
roleSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = mongoose.model('Role', roleSchema);
