import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const userAchievementSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    userId: { type: Number, required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    badgeType: { type: String, required: true, index: true },
    badgeName: { type: String, required: true },
    badgeDescription: { type: String, default: null },
    xpAwarded: { type: Number, default: 0 },
    iconUrl: { type: String, default: null },
    earnedAt: { type: Date, default: Date.now },
  },
  {
    collection: 'user_achievements',
    timestamps: false,
    toJSON: { virtuals: true },
  }
);

userAchievementSchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('user_achievements');
  }
  next();
});

export const UserAchievement = mongoose.model('UserAchievement', userAchievementSchema);
export default UserAchievement;
