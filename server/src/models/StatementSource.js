const mongoose = require('mongoose');
const { Schema } = mongoose;

// The raw uploaded PDF, kept out of the Statement document so the statement stays small and fast to read
// and re-save during review. Nothing in the app reads this on the hot path; it is retained only so the
// original statement can be produced later (audit, a future download) if needed.
const statementSourceSchema = new Schema(
  {
    statement: { type: Schema.Types.ObjectId, ref: 'Statement', required: true, unique: true },
    mimeType: { type: String, default: 'application/pdf' },
    data: { type: Buffer, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StatementSource', statementSourceSchema);
