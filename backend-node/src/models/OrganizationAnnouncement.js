import mongoose from 'mongoose';

const organizationAnnouncementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    authorId: { type: Number, required: true, index: true },
    recipientCount: { type: Number, default: 0, min: 0 },
    emailRecipientCount: { type: Number, default: 0, min: 0 },
    publishedAt: { type: Date, default: Date.now, index: true },
  },
  { collection: 'organization_announcements', timestamps: true }
);

export const OrganizationAnnouncement = mongoose.model('OrganizationAnnouncement', organizationAnnouncementSchema);
export default OrganizationAnnouncement;
