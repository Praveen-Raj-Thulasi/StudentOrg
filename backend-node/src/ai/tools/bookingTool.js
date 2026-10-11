import { AgentTool } from './agentTool.interface.js';
import { Booking } from '../../models/Booking.js';

export class BookingTool extends AgentTool {
  name() {
    return 'bookingTool';
  }

  description() {
    return 'Retrieves user bookings, booking status, ticket info, and QR code availability.';
  }

  async execute(input = {}, principal = null) {
    if (!principal || !principal.id) {
      return { error: 'Authentication required to view bookings.' };
    }

    try {
      const bookings = await Booking.find({ userId: principal.id })
        .populate('event', 'eventName eventDate')
        .sort({ bookedAt: -1 })
        .limit(10)
        .lean();

      const bookingList = bookings.map((b) => ({
        bookingId: b.id,
        ticketId: b.ticketId,
        eventName: b.event?.eventName || 'N/A',
        eventDate: b.event?.eventDate || null,
        bookingStatus: b.bookingStatus,
        ticketStatus: b.ticketStatus,
        quantity: b.quantity,
        totalAmount: b.totalAmount,
        hasQr: Boolean(b.qrCode || b.qrCodePath),
        bookedAt: b.bookedAt,
      }));

      const confirmedCount = bookings.filter(
        (b) => b.bookingStatus === 'CONFIRMED'
      ).length;

      return {
        bookings: bookingList,
        count: bookingList.length,
        confirmedCount,
      };
    } catch (err) {
      return { error: `Could not fetch bookings: ${err.message}` };
    }
  }
}

export const bookingTool = new BookingTool();
export default bookingTool;
