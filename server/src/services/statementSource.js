const mongoose = require('mongoose');
const StatementSource = require('../models/StatementSource');

// One-time (idempotent) move of the raw PDF that older statements stored inline as `sourcePdf` into the
// StatementSource collection, then $unset it from the statement. This is what shrinks the existing bloated
// statement documents — the inline multi-MB blob was being re-read and rewritten on every review action.
// Safe to run on every startup: once a statement's sourcePdf is removed it is skipped, and the copy upserts.
async function migrateStatementSources() {
  const statements = mongoose.connection.db.collection('statements');
  const cursor = statements.find({ sourcePdf: { $exists: true } }, { projection: { sourcePdf: 1, mimeType: 1 } });
  let moved = 0;
  // eslint-disable-next-line no-await-in-loop
  for (let doc = await cursor.next(); doc; doc = await cursor.next()) {
    // eslint-disable-next-line no-await-in-loop
    await StatementSource.updateOne(
      { statement: doc._id },
      { $setOnInsert: { statement: doc._id, mimeType: doc.mimeType || 'application/pdf', data: doc.sourcePdf } },
      { upsert: true },
    );
    // eslint-disable-next-line no-await-in-loop
    await statements.updateOne({ _id: doc._id }, { $unset: { sourcePdf: '' } });
    moved += 1;
  }
  if (moved) console.log(`Moved ${moved} statement PDF${moved === 1 ? '' : 's'} out of the statement documents.`);
  return { moved };
}

module.exports = { migrateStatementSources };
