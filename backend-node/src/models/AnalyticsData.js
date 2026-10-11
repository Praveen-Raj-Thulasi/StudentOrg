import mongoose from 'mongoose';

const analyticsDataSchema = new mongoose.Schema(
  {
    metricKey: { type: String, required: true, index: true },
    scope: { type: String, required: true, index: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    recordedAt: { type: Date, default: Date.now, index: true },
  },
  {
    collection: 'analytics_data',
    timestamps: false,
    toJSON: { virtuals: true },
  }
);

analyticsDataSchema.index({ metricKey: 1, scope: 1, recordedAt: -1 });

export const AnalyticsData = mongoose.model('AnalyticsData', analyticsDataSchema);
export default AnalyticsData;
