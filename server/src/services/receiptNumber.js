const Counter = require('../models/Counter');

async function nextReceiptNumber(year) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const c = await Counter.findOneAndUpdate(
        { key: `receipt-${year}` },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );
      return `RCP-${year}-${String(c.seq).padStart(4, '0')}`;
    } catch (err) {
      // Two first-ever requests can race on the upsert; retry picks up the existing document.
      if (err.code !== 11000 || attempt === 2) throw err;
    }
  }
}

// Reserve a whole block of receipt numbers for a year in one atomic counter bump, then format them
// locally. Approving a bank statement can post hundreds of income rows at once; reserving the block in
// a single round-trip (instead of one per row) is what keeps approval from timing out.
async function reserveReceipts(year, count) {
  if (count <= 0) return [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const c = await Counter.findOneAndUpdate(
        { key: `receipt-${year}` },
        { $inc: { seq: count } },
        { upsert: true, new: true }
      );
      const start = c.seq - count + 1;
      return Array.from({ length: count }, (_, i) => `RCP-${year}-${String(start + i).padStart(4, '0')}`);
    } catch (err) {
      // Two first-ever requests can race on the upsert; retry picks up the existing document.
      if (err.code !== 11000 || attempt === 2) throw err;
    }
  }
}

module.exports = { nextReceiptNumber, reserveReceipts };
