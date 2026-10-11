import mongoose from 'mongoose';

const searchHistorySchema = new mongoose.Schema(
  {
    userId: { type: Number, index: true, default: null },
    query: { type: String, required: true },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  {
    collection: 'search_history',
    timestamps: false,
    toJSON: { virtuals: true },
  }
);

export const SearchHistory = mongoose.model('SearchHistory', searchHistorySchema);
export default SearchHistory;
