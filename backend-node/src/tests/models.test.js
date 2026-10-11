import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import {
  Counter,
  User,
  Organizer,
  Event,
  Booking,
  Payment,
  Certificate,
  EventCommunityMessage,
  DirectMessage,
  NetworkingConnection,
  ChatSession,
  AiVectorDocument,
} from '../models/index.js';

const TEST_DB_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/event_booking_models_test';

describe('MongoDB Data Model Layer Tests', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_DB_URI, {
        serverSelectionTimeoutMS: 5000,
      });
    }
    // Ensure unique indexes are built on the test collection
    await User.init();
    await Booking.init();
    await Payment.init();
    await Certificate.init();
    await NetworkingConnection.init();
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
    }
  });

  beforeEach(async () => {
    // Clean collections before each test run
    const collections = Object.keys(mongoose.connection.collections);
    for (const name of collections) {
      await mongoose.connection.collections[name].deleteMany({});
    }
  });

  describe('User Model', () => {
    it('should auto-assign sequential numeric id and userCode, and strip sensitive fields on toJSON', async () => {
      const user = new User({
        name: 'Alice Johnson',
        email: 'alice@example.com',
        passwordHash: '$2a$12$hashedpasswordexample',
        verificationToken: 'secret-verify-token',
        location: {
          city: 'Bangalore',
          state: 'Karnataka',
          coordinates: { latitude: 12.9716, longitude: 77.5946 },
        },
      });

      await user.save();

      expect(user.id).toBeGreaterThan(0);
      expect(user.userCode).toBe(`USR${String(user.id).padStart(4, '0')}`);
      expect(user.location.city).toBe('Bangalore');

      // Security validation: toJSON must never expose passwordHash or tokens
      const json = user.toJSON();
      expect(json.passwordHash).toBeUndefined();
      expect(json.verificationToken).toBeUndefined();
      expect(json.resetPasswordToken).toBeUndefined();
      expect(json.name).toBe('Alice Johnson');
    });

    it('should reject duplicate email addresses', async () => {
      const user1 = new User({
        name: 'User One',
        email: 'duplicate@example.com',
        passwordHash: 'hash1',
      });
      await user1.save();

      const user2 = new User({
        name: 'User Two',
        email: 'duplicate@example.com',
        passwordHash: 'hash2',
      });

      await expect(user2.save()).rejects.toThrow();
    });
  });

  describe('Organizer Model', () => {
    it('should auto-assign sequential numeric id and organizerCode', async () => {
      const organizer = new Organizer({
        organizerName: 'Dr. Smith',
        organizationName: 'MIT Tech Club',
        email: 'mitclub@example.com',
        passwordHash: '$2a$12$hashedpassword',
      });

      await organizer.save();

      expect(organizer.id).toBeGreaterThan(0);
      expect(organizer.organizerCode).toBe(`ORG${String(organizer.id).padStart(4, '0')}`);
      expect(organizer.role).toBe('ORGANIZER');
    });
  });

  describe('Event Model & Atomic Concurrency Control', () => {
    it('should save event with embedded certificate settings and logistics', async () => {
      const event = new Event({
        organizerId: 1,
        eventName: 'AI Hackathon 2026',
        category: 'WORKSHOP',
        eventType: 'OFFLINE',
        eventDate: new Date('2026-11-15'),
        eventTime: '09:00',
        totalSeats: 100,
        availableSeats: 100,
        ticketPrice: 250,
        status: 'PUBLISHED',
        certificateSettings: {
          certificateAvailable: true,
          releaseMode: 'AUTOMATIC',
          theme: 'MODERN_BLUE',
        },
        accommodationDetails: {
          checkIn: '08:00',
          contactPerson: 'Manager Dave',
        },
      });

      await event.save();

      expect(event.id).toBeGreaterThan(0);
      expect(event.certificateSettings.certificateAvailable).toBe(true);
      expect(event.accommodationDetails.contactPerson).toBe('Manager Dave');
    });

    it('should atomically reserve seats and prevent overselling', async () => {
      const event = await Event.create({
        organizerId: 1,
        eventName: 'Exclusive Masterclass',
        category: 'SEMINAR',
        eventType: 'ONLINE',
        eventDate: new Date('2026-11-20'),
        eventTime: '10:00',
        totalSeats: 5,
        availableSeats: 5,
        status: 'PUBLISHED',
      });

      // Reserve 3 seats
      const updated = await Event.reserveSeats(event.id, 3);
      expect(updated.availableSeats).toBe(2);

      // Attempt to reserve 3 more when only 2 remain -> must fail atomically
      await expect(Event.reserveSeats(event.id, 3)).rejects.toThrow(
        /Seats unavailable or event is not open for booking/
      );

      // Release 2 seats
      const released = await Event.releaseSeats(event.id, 2);
      expect(released.availableSeats).toBe(4);
    });
  });

  describe('Booking & Participants Model', () => {
    it('should create booking with bounded participants and prevent duplicate ticketId', async () => {
      const booking = new Booking({
        ticketId: 'EVT-20261010-ABCD1234',
        userId: 1,
        eventId: 10,
        quantity: 2,
        totalAmount: 500,
        bookingStatus: 'CONFIRMED',
        ticketStatus: 'ACTIVE',
        participants: [
          { name: 'John Doe', email: 'john@example.com', department: 'CSE' },
          { name: 'Jane Smith', email: 'jane@example.com', department: 'ECE' },
        ],
      });

      await booking.save();

      expect(booking.id).toBeGreaterThan(0);
      expect(booking.participants).toHaveLength(2);
      expect(booking.participants[0].name).toBe('John Doe');

      // Duplicate ticketId must be rejected
      const duplicateBooking = new Booking({
        ticketId: 'EVT-20261010-ABCD1234',
        userId: 2,
        eventId: 10,
        quantity: 1,
        totalAmount: 250,
      });

      await expect(duplicateBooking.save()).rejects.toThrow();
    });
  });

  describe('Payment & Razorpay Gateway References', () => {
    it('should store payment with transactionId and gatewayOrderId', async () => {
      const payment = await Payment.create({
        transactionId: 'TXN-9876543210',
        bookingId: 101,
        amount: 500,
        paymentStatus: 'SUCCESSFUL',
        gatewayReference: 'pay_ABC123XYZ',
        gatewayOrderId: 'order_ORD9876',
        paidAt: new Date(),
      });

      expect(payment.id).toBeGreaterThan(0);
      expect(payment.gatewayReference).toBe('pay_ABC123XYZ');
      expect(payment.gatewayOrderId).toBe('order_ORD9876');
    });
  });

  describe('Certificate Model & Unique Constraint', () => {
    it('should enforce unique certificate per user and event', async () => {
      await Certificate.create({
        certificateId: 'CRT-2026-0001',
        eventId: 50,
        userId: 10,
        recipientName: 'Alice Green',
        eventName: 'Web Dev Workshop',
        status: 'ISSUED',
      });

      // Attempt to issue another certificate for the same event and user
      const duplicateCert = new Certificate({
        certificateId: 'CRT-2026-0002',
        eventId: 50,
        userId: 10,
        recipientName: 'Alice Green',
        eventName: 'Web Dev Workshop',
      });

      await expect(duplicateCert.save()).rejects.toThrow();
    });
  });

  describe('Social & Networking Models', () => {
    it('should create community messages and 1-on-1 direct messages', async () => {
      const commMsg = await EventCommunityMessage.create({
        eventId: 10,
        senderId: 1,
        senderRole: 'USER',
        senderName: 'John',
        message: 'Hello everyone!',
      });
      expect(commMsg.id).toBeGreaterThan(0);
      expect(commMsg.content).toBe('Hello everyone!');

      const directMsg = await DirectMessage.create({
        senderId: 1,
        receiverId: 2,
        content: 'Hi Jane, let us collaborate!',
      });
      expect(directMsg.id).toBeGreaterThan(0);
      expect(directMsg.read).toBe(false);

      const connection = await NetworkingConnection.create({
        requesterId: 1,
        receiverId: 2,
        status: 'ACCEPTED',
        matchScore: 92.5,
      });
      expect(connection.status).toBe('ACCEPTED');
    });
  });

  describe('AI Copilot & Vector Document Models', () => {
    it('should persist chat session with embedded messages array', async () => {
      const session = await ChatSession.create({
        sessionId: 'session-uuid-1234',
        userId: 1,
        title: 'Event Query',
        messages: [
          { role: 'user', content: 'What time does the hackathon start?' },
          { role: 'assistant', content: 'It starts at 09:00 AM on Nov 15.' },
        ],
      });

      expect(session.id).toBeGreaterThan(0);
      expect(session.messages).toHaveLength(2);
      expect(session.messages[1].role).toBe('assistant');
    });

    it('should persist RAG vector document with float array embeddings', async () => {
      const vectorDoc = await AiVectorDocument.create({
        sourceType: 'EVENT',
        sourceId: 'EVT-10',
        chunkIndex: 0,
        title: 'Event Schedule Chunk',
        content: 'Schedule begins with breakfast at 8am followed by keynote.',
        contentHash: 'hash-abc-123',
        embedding: [0.1234, -0.5678, 0.9012],
      });

      expect(vectorDoc.id).toBeGreaterThan(0);
      expect(vectorDoc.embedding).toHaveLength(3);
    });
  });
});
