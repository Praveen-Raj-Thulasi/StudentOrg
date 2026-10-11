import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
      description: 'Name of the sequence, e.g. "users", "events", "bookings"',
    },
    seq: {
      type: Number,
      default: 0,
      description: 'Current highest allocated sequential integer ID',
    },
  },
  {
    collection: 'counters',
    versionKey: false,
    timestamps: true,
  }
);

export const Counter = mongoose.model('Counter', counterSchema);
export default Counter;
