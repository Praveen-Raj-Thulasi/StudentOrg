import { Organizer } from '../models/Organizer.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { AppError, NotFoundError } from '../utils/errors.js';

class OrganizerService {
  async getProfile(organizerId) {
    const organizer = await Organizer.findOne({ id: organizerId });
    if (!organizer) throw new NotFoundError('Organizer not found');

    return {
      id: organizer.id,
      organizerCode: organizer.organizerCode,
      organizerName: organizer.organizerName,
      organizationName: organizer.organizationName,
      email: organizer.email,
      phone: organizer.phone,
      address: organizer.address,
      pinCode: organizer.pinCode,
      city: organizer.city,
      state: organizer.state,
      country: organizer.country,
      organizationLogo: organizer.organizationLogo,
      website: organizer.website,
      description: organizer.description,
      emailVerified: organizer.emailVerified,
      role: organizer.role,
    };
  }

  async updateProfile(organizerId, updates) {
    const organizer = await Organizer.findOne({ id: organizerId });
    if (!organizer) throw new NotFoundError('Organizer not found');

    const allowed = [
      'organizerName',
      'organizationName',
      'phone',
      'address',
      'pinCode',
      'city',
      'state',
      'country',
      'website',
      'description',
    ];

    for (const key of allowed) {
      if (updates[key] !== undefined) {
        organizer[key] = updates[key];
      }
    }

    await organizer.save();
    return this.getProfile(organizerId);
  }

  async getLocation(organizerId) {
    const organizer = await Organizer.findOne({ id: organizerId });
    if (!organizer) throw new NotFoundError('Organizer not found');

    return organizer.location || {};
  }

  async updateLocation(organizerId, locationData) {
    const organizer = await Organizer.findOne({ id: organizerId });
    if (!organizer) throw new NotFoundError('Organizer not found');

    organizer.location = {
      address: locationData.address || null,
      street: locationData.street || null,
      area: locationData.area || null,
      city: locationData.city || null,
      district: locationData.district || null,
      state: locationData.state || null,
      country: locationData.country || null,
      pinCode: locationData.pinCode || null,
      coordinates: {
        latitude: locationData.latitude || null,
        longitude: locationData.longitude || null,
      },
    };

    await organizer.save();
    return organizer.location;
  }

  async changePassword(organizerId, currentPassword, newPassword) {
    const organizer = await Organizer.findOne({ id: organizerId });
    if (!organizer) throw new NotFoundError('Organizer not found');

    const isMatch = await verifyPassword(currentPassword, organizer.passwordHash);
    if (!isMatch) {
      throw new AppError('Current password does not match', 400, 'INVALID_CREDENTIALS');
    }

    organizer.passwordHash = await hashPassword(newPassword);
    await organizer.save();
  }

  async uploadLogo(organizerId, logoPath) {
    const organizer = await Organizer.findOne({ id: organizerId });
    if (!organizer) throw new NotFoundError('Organizer not found');

    organizer.organizationLogo = logoPath;
    await organizer.save();
    return logoPath;
  }
}

export const organizerService = new OrganizerService();
export default organizerService;
