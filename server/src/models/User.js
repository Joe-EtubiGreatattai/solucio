const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    // The key of a Role document (see models/Role.js); the users routes check that it exists.
    role: { type: String, required: true, trim: true, lowercase: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
