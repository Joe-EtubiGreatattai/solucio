const mongoose = require('mongoose');
const { Schema } = mongoose;

module.exports = mongoose.model(
  'AuditLog',
  new Schema(
    {
      actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      action: { type: String, required: true },
      targetModel: { type: String, required: true },
      targetId: { type: Schema.Types.ObjectId, required: true },
      details: Schema.Types.Mixed,
    },
    { timestamps: { createdAt: true, updatedAt: false } }
  )
);
