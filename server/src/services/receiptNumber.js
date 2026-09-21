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

module.exports = { nextReceiptNumber };
