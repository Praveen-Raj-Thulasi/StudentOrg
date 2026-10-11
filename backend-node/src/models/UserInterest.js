import mongoose from 'mongoose';

const userInterestSchema = new mongoose.Schema(
  {
    userId: { type: Number, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    skills: { type: String, default: null },
    interests: { type: String, default: null },
    department: { type: String, default: null },
    college: { type: String, default: null },
    yearOfStudy: { type: String, default: null },
    favoriteCategories: { type: String, default: null },
    preferredEventType: { type: String, default: null },
    careerGoal: { type: String, default: null },
    availability: { type: String, default: null },
    experience: { type: String, default: null },
  },
  {
    collection: 'user_interests',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

export const UserInterest = mongoose.model('UserInterest', userInterestSchema);
export default UserInterest;
