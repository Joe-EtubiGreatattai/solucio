const mongoose = require('mongoose');
const { Schema } = mongoose;

const transactionSchema = new Schema(
  {
    date: { type: Date, required: true },
    narration: { type: String, required: true, trim: true },
    reference: { type: String, trim: true },
    amount: { type: Number, required: true, min: 1 },
    direction: { type: String, enum: ['income', 'expense'], required: true },
    type: { type: String, trim: true },
    group: { type: String, trim: true },
    item: { type: String, trim: true, default: null },
    confidence: { type: String, enum: ['high', 'medium', 'needs-review'], default: 'needs-review' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    // Whether this row is brought into the books when the statement is approved. Lets someone
    // import only the income rows from a statement, or only the expenses, and leave the rest out.
    included: { type: Boolean, default: true },
    // Which real record this row became once the statement was approved (for traceability only).
    postedModel: { type: String, enum: ['Income', 'Expense'] },
    postedId: { type: Schema.Types.ObjectId },
  },
  { timestamps: false }
);

const statementSchema = new Schema(
  {
    account: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    fileName: { type: String, required: true, trim: true },
    mimeType: { type: String, default: 'application/pdf' },
    sourcePdf: { type: Buffer, select: false },
    status: { type: String, enum: ['review', 'approved'], default: 'review' },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    transactions: { type: [transactionSchema], default: [] },
  },
  { timestamps: true }
);

statementSchema.index({ account: 1, createdAt: -1 });

module.exports = mongoose.model('Statement', statementSchema);
