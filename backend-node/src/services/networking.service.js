import NetworkingConnection from '../models/NetworkingConnection.js';
import User from '../models/User.js';
import UserInterest from '../models/UserInterest.js';
import Booking from '../models/Booking.js';
import { NotFoundError, AppError } from '../utils/errors.js';

export class NetworkingService {
  static async suggestConnections(userId) {
    const numUserId = Number(userId);

    const [myInterest, myBookings, connections] = await Promise.all([
      UserInterest.findOne({ userId: numUserId }).lean(),
      Booking.find({ userId: numUserId, bookingStatus: 'CONFIRMED' }).select('eventId').lean(),
      NetworkingConnection.find({
        $or: [{ requesterId: numUserId }, { receiverId: numUserId }],
      }).lean(),
    ]);

    const myEventIds = new Set(myBookings.map((b) => b.eventId));
    const excludedUserIds = new Set([numUserId]);
    for (const c of connections) {
      excludedUserIds.add(c.requesterId);
      excludedUserIds.add(c.receiverId);
    }

    // Find candidate users
    const candidates = await User.find({
      id: { $nin: Array.from(excludedUserIds) },
      role: 'USER',
    })
      .limit(30)
      .lean();

    const suggestions = [];

    for (const other of candidates) {
      const otherInterest = await UserInterest.findOne({ userId: other.id }).lean();
      let score = 50;
      let reasons = [];

      if (myInterest && otherInterest) {
        if (myInterest.department && otherInterest.department && myInterest.department.toLowerCase() === otherInterest.department.toLowerCase()) {
          score += 25;
          reasons.push(`Same department (${myInterest.department})`);
        }
        if (myInterest.college && otherInterest.college && myInterest.college.toLowerCase() === otherInterest.college.toLowerCase()) {
          score += 20;
          reasons.push('Same college');
        }
      }

      const matchReason = reasons.length > 0 ? reasons.join(' • ') : 'Peer campus attendee';

      suggestions.push({
        id: other.id,
        name: other.name,
        department: other.department || otherInterest?.department || null,
        college: other.organizationName || otherInterest?.college || null,
        profilePicture: other.profilePicture || null,
        matchScore: Math.min(score, 99),
        matchReason,
      });
    }

    suggestions.sort((a, b) => b.matchScore - a.matchScore);
    return suggestions.slice(0, 10);
  }

  static async sendConnectionRequest(requesterId, receiverId) {
    const numReq = Number(requesterId);
    const numRec = Number(receiverId);

    if (numReq === numRec) {
      throw new AppError('Cannot connect with yourself', 400);
    }

    const receiver = await User.findOne({ id: numRec });
    if (!receiver) throw new NotFoundError('User not found');

    const existing = await NetworkingConnection.findOne({
      $or: [
        { requesterId: numReq, receiverId: numRec },
        { requesterId: numRec, receiverId: numReq },
      ],
    });

    if (existing) {
      return { id: existing.id, status: existing.status };
    }

    const requester = await User.findOne({ id: numReq });

    const conn = new NetworkingConnection({
      requesterId: numReq,
      requester: requester?._id,
      receiverId: numRec,
      receiver: receiver._id,
      status: 'PENDING',
      matchReason: 'Direct connection request',
    });

    await conn.save();
    return { id: conn.id, status: conn.status };
  }

  static async respondToConnection(connectionId, userId, status) {
    const conn = await NetworkingConnection.findOne({ id: Number(connectionId) });
    if (!conn) throw new NotFoundError('Connection request not found');

    if (conn.receiverId !== Number(userId)) {
      throw new AppError('Only the recipient can respond to this connection request', 403);
    }

    conn.status = status;
    await conn.save();
    return { id: conn.id, status: conn.status };
  }

  static async getMyConnections(userId) {
    const numUserId = Number(userId);
    const conns = await NetworkingConnection.find({
      $or: [{ requesterId: numUserId }, { receiverId: numUserId }],
      status: 'ACCEPTED',
    })
      .populate('requester', 'id name email department organizationName profilePicture')
      .populate('receiver', 'id name email department organizationName profilePicture')
      .lean();

    return conns.map((c) => {
      const isReq = c.requesterId === numUserId;
      const peer = isReq ? c.receiver : c.requester;
      return {
        connectionId: c.id,
        user: {
          id: peer?.id || (isReq ? c.receiverId : c.requesterId),
          name: peer?.name || 'Peer',
          email: peer?.email,
          department: peer?.department,
          college: peer?.organizationName,
          profilePicture: peer?.profilePicture,
        },
        since: c.updatedAt || c.createdAt,
      };
    });
  }

  static async getPendingRequests(userId) {
    const numUserId = Number(userId);
    const conns = await NetworkingConnection.find({
      receiverId: numUserId,
      status: 'PENDING',
    })
      .populate('requester', 'id name email department organizationName profilePicture')
      .lean();

    return conns.map((c) => ({
      connectionId: c.id,
      requester: {
        id: c.requester?.id || c.requesterId,
        name: c.requester?.name || 'Peer',
        email: c.requester?.email,
        department: c.requester?.department,
        college: c.requester?.organizationName,
        profilePicture: c.requester?.profilePicture,
      },
      matchReason: c.matchReason,
      createdAt: c.createdAt,
    }));
  }
}

export default NetworkingService;
