import mongoose from 'mongoose';
import { getNextSequenceValue, getNextMemberNumber } from '../utils/sequenceHelper.js';

const userLocationSchema = new mongoose.Schema(
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

const userSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    userCode: { type: String, unique: true, sparse: true, index: true },
    memberNumber: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      trim: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
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
    organizationName: { type: String, trim: true, default: null },
    city: { type: String, trim: true, default: null },
    state: { type: String, trim: true, default: null },
    country: { type: String, trim: true, default: null },
    dateOfBirth: { type: Date, default: null },
    gender: { type: String, trim: true, default: null },
    profilePicture: { type: String, default: null },
    emailVerified: { type: Boolean, default: false, index: true },
    verificationToken: { type: String, default: null },
    resetPasswordToken: { type: String, default: null },
    resetTokenExpiry: { type: Date, default: null },
    accountLocked: { type: Boolean, default: false },
    failedLoginAttempts: { type: Number, default: 0 },
    roles: {
      type: [String],
      enum: ['STUDENT', 'ORGANIZER', 'PRESIDENT', 'TREASURER', 'VOLUNTEER'],
      default: ['STUDENT'],
      index: true,
    },
    role: {
      type: String,
      enum: ['USER', 'ADMIN', 'STUDENT', 'ORGANIZER', 'PRESIDENT', 'TREASURER', 'VOLUNTEER'],
      default: 'USER',
      index: true,
    },
    location: { type: userLocationSchema, default: () => ({}) },
  },
  {
    collection: 'users',
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

// Pre-save hook: auto-assign sequential numeric id, userCode, memberNumber, and roles
userSchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    let nextId = await getNextSequenceValue('users');
    while (await mongoose.model('User').exists({ id: nextId })) {
      nextId = await getNextSequenceValue('users');
    }
    this.id = nextId;
  }
  if (!this.userCode && this.id) {
    this.userCode = `USR${String(this.id).padStart(4, '0')}`;
  }
  if (!this.memberNumber) {
    this.memberNumber = await getNextMemberNumber();
  }
  if (!this.roles || this.roles.length === 0) {
    if (this.role === 'ADMIN' || this.role === 'PRESIDENT') {
      this.roles = ['STUDENT', 'PRESIDENT'];
    } else if (this.role === 'ORGANIZER') {
      this.roles = ['STUDENT', 'ORGANIZER'];
    } else {
      this.roles = ['STUDENT'];
    }
  }
  next();
});

export const User = mongoose.model('User', userSchema);
export default User;
