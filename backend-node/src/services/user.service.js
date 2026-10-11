import { User } from '../models/User.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { AppError, NotFoundError } from '../utils/errors.js';

class UserService {
  async getProfile(userId) {
    const user = await User.findOne({ id: userId });
    if (!user) throw new NotFoundError('User not found');

    return {
      id: user.id,
      userCode: user.userCode,
      memberNumber: user.memberNumber,
      roles: user.roles || (user.role === 'ADMIN' ? ['STUDENT', 'PRESIDENT'] : ['STUDENT']),
      name: user.name,
      email: user.email,
      phone: user.phone,
      address: user.address,
      pinCode: user.pinCode,
      organizationName: user.organizationName,
      city: user.city,
      state: user.state,
      country: user.country,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      profilePicture: user.profilePicture,
      emailVerified: user.emailVerified,
      role: user.role,
      createdAt: user.createdAt,
    };
  }

  async updateProfile(userId, updates) {
    const user = await User.findOne({ id: userId });
    if (!user) throw new NotFoundError('User not found');

    const allowed = [
      'name',
      'phone',
      'address',
      'pinCode',
      'organizationName',
      'city',
      'state',
      'country',
      'dateOfBirth',
      'gender',
    ];

    for (const key of allowed) {
      if (updates[key] !== undefined) {
        user[key] = updates[key];
      }
    }

    await user.save();
    return this.getProfile(userId);
  }

  async getLocation(userId) {
    const user = await User.findOne({ id: userId });
    if (!user) throw new NotFoundError('User not found');

    return user.location || {};
  }

  async updateLocation(userId, locationData) {
    const user = await User.findOne({ id: userId });
    if (!user) throw new NotFoundError('User not found');

    user.location = {
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

    await user.save();
    return user.location;
  }

  async changePassword(userId, currentPassword, newPassword) {
    const user = await User.findOne({ id: userId });
    if (!user) throw new NotFoundError('User not found');

    const isMatch = await verifyPassword(currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new AppError('Current password does not match', 400, 'INVALID_CREDENTIALS');
    }

    user.passwordHash = await hashPassword(newPassword);
    await user.save();
  }

  async uploadPicture(userId, picturePath) {
    const user = await User.findOne({ id: userId });
    if (!user) throw new NotFoundError('User not found');

    user.profilePicture = picturePath;
    await user.save();
    return picturePath;
  }
}

export const userService = new UserService();
export default userService;
