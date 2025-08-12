const mongoose = require('mongoose');

const doubtSchema = new mongoose.Schema({
  roomId: String,
  id: String,
  text: String,
  user: String,
  upvotes: Number,
  upvotedBy: [String], // Array of user IDs who upvoted
  answered: { type: Boolean, default: false },
  answeredAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

const Doubt = mongoose.model('Doubt', doubtSchema);

module.exports = Doubt;

