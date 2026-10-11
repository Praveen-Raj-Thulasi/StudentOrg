import { z } from 'zod';

export const attendanceScanSchema = z.object({
  eventId: z.number().int().positive('Event ID is required'),
  ticketId: z.string().trim().min(1, 'Ticket ID is required'),
  scanMethod: z.enum(['QR_CAMERA', 'BARCODE_SCANNER', 'MANUAL']).default('MANUAL').optional(),
});

export const scannerRelaySchema = z.object({
  ticketId: z.string().trim().min(1, 'Ticket ID is required'),
  device: z.string().trim().default('External Scanner').optional(),
});
