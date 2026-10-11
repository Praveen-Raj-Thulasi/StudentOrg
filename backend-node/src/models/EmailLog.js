import mongoose from 'mongoose';

const emailLogSchema = new mongoose.Schema(
  {
    recipient: { type: String, required: true, index: true },
    subject: { type: String, required: true },
    emailType: { type: String, index: true, default: 'GENERAL' },
    sentAt: { type: Date, default: Date.now, index: true },
    status: { type: String, default: 'SENT' },
    errorMessage: { type: String, default: null },
  },
  {
    collection: 'email_logs',
    timestamps: false,
    toJSON: { virtuals: true },
  }
);

export const EmailLog = mongoose.model('EmailLog', emailLogSchema);
export default EmailLog;
