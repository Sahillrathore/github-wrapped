const mongoose = require('mongoose');

const userStatsSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    user: Object,
    stats: Object,
    characterInfo : Object,
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('UserStats', userStatsSchema);
