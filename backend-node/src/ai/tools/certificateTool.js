import { AgentTool } from './agentTool.interface.js';
import { Certificate } from '../../models/Certificate.js';

export class CertificateTool extends AgentTool {
  name() {
    return 'certificateTool';
  }

  description() {
    return 'Fetches user certificates, certificate status, and triggers certificate generation for completed events.';
  }

  async execute(input = {}, principal = null) {
    if (!principal || !principal.id) {
      return { error: 'Authentication required to view certificates.' };
    }

    try {
      const isOrganizer = principal.role?.toUpperCase() === 'ORGANIZER';

      if (isOrganizer) {
        const eventId = input.eventId ? Number(input.eventId) : null;
        if (eventId) {
          const certs = await Certificate.find({ eventId })
            .sort({ issuedAt: -1 })
            .lean();

          return {
            certificates: certs.map(this._mapCert),
            count: certs.length,
            eventId,
          };
        }
        return {
          message: 'Provide eventId to list certificates for a specific event.',
        };
      }

      // Student: own certificates
      const certs = await Certificate.find({ userId: principal.id })
        .sort({ issuedAt: -1 })
        .limit(20)
        .lean();

      const readyToDownload = certs.filter((c) => c.status === 'GENERATED').length;

      return {
        certificates: certs.map(this._mapCert),
        count: certs.length,
        readyToDownload,
      };
    } catch (err) {
      return { error: `Could not fetch certificates: ${err.message}` };
    }
  }

  _mapCert(c) {
    return {
      certificateId: c.certificateId,
      eventName: c.eventName,
      issuedAt: c.issuedAt,
      status: c.status,
      pdfUrl: c.pdfUrl,
      emailSent: Boolean(c.emailSent),
    };
  }
}

export const certificateTool = new CertificateTool();
export default certificateTool;
