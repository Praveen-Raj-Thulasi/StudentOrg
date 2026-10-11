import mongoose from 'mongoose';

const userLevelSchema = new mongoose.Schema(
  {
    userId: { type: Number, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    totalXp: { type: Number, default: 0 },
    currentLevel: { type: Number, default: 1 },
    eventsAttended: { type: Number, default: 0 },
    eventsRegistered: { type: Number, default: 0 },
    certificatesEarned: { type: Number, default: 0 },
    reviewsGiven: { type: Number, default: 0 },
    totalHoursCompleted: { type: Number, default: 0 },
  },
  {
    collection: 'user_levels',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

export const UserLevel = mongoose.model('UserLevel', userLevelSchema);
export default UserLevel;
