import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const organizerLocationSchema = new mongoose.Schema(
  {
    address: { type: String, trim: true, default: null },
    street: { type: String, trim: true, default: null },
    area: { type: String, trim: true, default: null },
    city: { type: String, trim: true, default: null },
    district: { type: String, trim: true, default: null },
    state: { type: String, trim: true, default: null },
    country: { type: String, trim: true, default: null },
    pinCode: { type: String, trim: true, default: null },
    coordinates: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
    },
  },
  { _id: false }
);

const organizerSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    organizerCode: { type: String, unique: true, sparse: true, index: true },
    organizerName: { type: String, required: true, trim: true, maxlength: 120 },
    organizationName: { type: String, required: true, trim: true, maxlength: 160 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 160,
      index: true,
    },
    passwordHash: { type: String, required: true },
    phone: { type: String, trim: true, default: null },
    address: { type: String, trim: true, default: null },
    pinCode: { type: String, trim: true, default: null },
    city: { type: String, trim: true, default: null },
    state: { type: String, trim: true, default: null },
    country: { type: String, trim: true, default: null },
    organizationLogo: { type: String, default: null },
    website: { type: String, trim: true, default: null },
    description: { type: String, default: null },
    emailVerified: { type: Boolean, default: false, index: true },
    verificationToken: { type: String, default: null },
    resetPasswordToken: { type: String, default: null },
    resetTokenExpiry: { type: Date, default: null },
    isApproved: { type: Boolean, default: true, index: true },
    role: { type: String, default: 'ORGANIZER', index: true },
    location: { type: organizerLocationSchema, default: () => ({}) },
  },
  {
    collection: 'organizers',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.passwordHash;
        delete ret.verificationToken;
        delete ret.resetPasswordToken;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Pre-save hook: auto-assign sequential numeric id and organizerCode
organizerSchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('organizers');
  }
  if (!this.organizerCode && this.id) {
    this.organizerCode = `ORG${String(this.id).padStart(4, '0')}`;
  }
  next();
});

export const Organizer = mongoose.model('Organizer', organizerSchema);
export default Organizer;
