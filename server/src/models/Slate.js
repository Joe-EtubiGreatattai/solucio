const mongoose = require('mongoose');

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

// A snapshot of one account's position at the moment a slate was taken.
const accountSummarySchema = new Schema(
  { name: String, bankName: String, accountNumber: String, closingKobo: Number },
  { _id: false }
);

// A "slate" is a year that was closed: a full archive of everything the system held at that moment,
// taken just before the system was cleared for the next year. Nothing is ever lost — the raw records
// live in SlateArchive, and this document carries the headline figures for the list and reports.
const slateSchema = new Schema(
  {
    label: { type: String, required: true, trim: true }, // the year, e.g. "2026"
    createdBy: { type: ObjectId, ref: 'User' },
    summary: {
      incomeKobo: { type: Number, default: 0 },
      expenseKobo: { type: Number, default: 0 },
      netKobo: { type: Number, default: 0 },
      incomeCount: { type: Number, default: 0 },
      expenseCount: { type: Number, default: 0 },
      statementCount: { type: Number, default: 0 },
      categoryCount: { type: Number, default: 0 },
      accounts: { type: [accountSummarySchema], default: [] },
    },
  },
  { timestamps: true }
);
slateSchema.index({ createdAt: -1 });

// One archived record (an income, expense, statement, raw PDF or category) belonging to a slate. Kept as
// separate documents rather than one big blob so a year with thousands of records never hits the 16MB
// document limit, and so a single year can be read back or exported on demand.
const slateArchiveSchema = new Schema(
  {
    slate: { type: ObjectId, ref: 'Slate', required: true, index: true },
    kind: { type: String, required: true }, // income | expense | statement | statementSource | category
    data: { type: Schema.Types.Mixed },
  },
  { timestamps: false }
);
slateArchiveSchema.index({ slate: 1, kind: 1 });

module.exports = {
  Slate: mongoose.model('Slate', slateSchema),
  SlateArchive: mongoose.model('SlateArchive', slateArchiveSchema),
};
