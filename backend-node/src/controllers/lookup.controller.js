import User from '../models/User.js';
import Organizer from '../models/Organizer.js';
import { NotFoundError } from '../utils/errors.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class LookupController {
  static async byPublicId(req, res) {
    const { code } = req.params;

    if (code.startsWith('U')) {
      const user = await User.findOne({
        $or: [{ userCode: code }, { id: Number(code.slice(1)) || -1 }],
      }).lean();
      if (!user) throw new NotFoundError('User ID not found');

      return ApiResponse.success(res, {
        type: 'USER',
        profile: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          department: user.department,
          college: user.organizationName,
          profilePicture: user.profilePicture,
          role: user.role,
        },
      });
    }

    if (code.startsWith('O')) {
      const organizer = await Organizer.findOne({
        $or: [{ organizerCode: code }, { id: Number(code.slice(1)) || -1 }],
      }).lean();
      if (!organizer) throw new NotFoundError('Organizer ID not found');

      return ApiResponse.success(res, {
        type: 'ORGANIZER',
        profile: {
          id: organizer.id,
          organizationName: organizer.organizationName,
          email: organizer.email,
          phone: organizer.phone,
          organizationType: organizer.organizationType,
          organizationLogo: organizer.organizationLogo,
          isVerified: organizer.isVerified,
          role: organizer.role,
        },
      });
    }

    throw new NotFoundError('ID not found');
  }
}

export default LookupController;
