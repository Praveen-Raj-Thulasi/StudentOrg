import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const tutorialVideoSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    title: { type: String, required: true, maxlength: 160 },
    description: { type: String, default: null },
    videoUrl: { type: String, required: true, maxlength: 500 },
    category: { type: String, default: 'ORGANIZER', index: true },
    active: { type: Boolean, default: true, index: true },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: 'tutorial_videos',
    timestamps: false,
    toJSON: { virtuals: true },
  }
);

tutorialVideoSchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('tutorial_videos');
  }
  next();
});

export const TutorialVideo = mongoose.model('TutorialVideo', tutorialVideoSchema);
export default TutorialVideo;
