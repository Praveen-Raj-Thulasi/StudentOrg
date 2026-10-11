import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';

/**
 * Generates a QR code PNG image file for ticket check-in.
 * Saves to uploads/qrcodes/qr_<ticketId>.png and returns the public relative path.
 *
 * @param {string} content Ticket ID or payload string
 * @returns {Promise<string>} Public relative path e.g. /uploads/qrcodes/qr_EVT-....png
 */
export async function generateQrCode(content) {
  const uploadDir = path.resolve(process.cwd(), 'uploads', 'qrcodes');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const safeContent = content.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `qr_${safeContent}.png`;
  const filePath = path.join(uploadDir, filename);

  await QRCode.toFile(filePath, content, {
    width: 300,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  });

  return `/uploads/qrcodes/${filename}`;
}

export async function generateQrCodeBuffer(content) {
  return QRCode.toBuffer(content, {
    width: 250,
    margin: 1,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  });
}

export const generateQRCode = generateQrCode;
export default generateQrCode;
