import { AgentTool } from './agentTool.interface.js';

export class EmailTool extends AgentTool {
  name() {
    return 'emailTool';
  }

  description() {
    return 'Provides information about automated email notifications (booking confirmation, event reminders, certificate ready). Can initiate email reminder requests that require organizer confirmation.';
  }

  async execute(input = {}, principal = null) {
    const isOrganizer = principal?.role?.toUpperCase() === 'ORGANIZER';

    if (isOrganizer) {
      return {
        automatedEmails: [
          'Booking confirmation — sent immediately after successful payment',
          'Event day reminder — sent at 6 AM on event day to all confirmed attendees',
          'Certificate ready — sent after certificates are generated',
          'Payment reminder — sent for pending bookings',
        ],
        customEmail: {
          available: true,
          note: 'Custom email broadcasts to attendees require explicit confirmation and admin approval via Notifications panel.',
          path: '/organizer/notifications',
        },
        requiresConfirmation: false,
      };
    }

    return {
      automatedEmails: [
        'You receive a booking confirmation email after every successful payment',
        'Event-day reminders are sent automatically at 6 AM',
        'Certificate emails are sent when your certificate is ready to download',
      ],
      note: "Check your inbox or spam folder. All emails come from the platform's SMTP address.",
      requiresConfirmation: false,
    };
  }
}

export const emailTool = new EmailTool();
export default emailTool;
