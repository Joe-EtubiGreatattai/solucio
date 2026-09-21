const mongoose = require('mongoose');

module.exports = mongoose.model(
  'Counter',
  new mongoose.Schema({ key: { type: String, required: true, unique: true }, seq: { type: Number, default: 0 } })
);
