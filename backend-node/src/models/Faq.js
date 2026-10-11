import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const faqSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    category: { type: String, required: true, maxlength: 120, index: true },
    question: { type: String, required: true, maxlength: 240 },
    answer: { type: String, required: true },
    active: { type: Boolean, default: true, index: true },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: 'faq',
    timestamps: false,
    toJSON: { virtuals: true },
  }
);

faqSchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('faq');
  }
  next();
});

export const Faq = mongoose.model('Faq', faqSchema);
export default Faq;
