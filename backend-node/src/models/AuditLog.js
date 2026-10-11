import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const auditLogSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    actorId: { type: Number, index: true, default: null },
    actorType: { type: String, index: true, default: 'SYSTEM' },
    action: { type: String, required: true, index: true },
    targetType: { type: String, default: null },
    targetId: { type: String, default: null },
    details: { type: String, default: null },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  {
    collection: 'audit_logs',
    timestamps: false,
    toJSON: { virtuals: true },
  }
);

auditLogSchema.index({ actorId: 1, actorType: 1 });

auditLogSchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('audit_logs');
  }
  next();
});

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
