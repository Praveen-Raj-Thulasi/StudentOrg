import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const accommodationSchema = new mongoose.Schema(
  {
    checkIn: { type: String, default: null },
    checkOut: { type: String, default: null },
    contactPerson: { type: String, default: null },
  },
  { _id: false }
);

const venueCoordinatesSchema = new mongoose.Schema(
  {
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
  },
  { _id: false }
);

const certificateSettingsSchema = new mongoose.Schema(
  {
    certificateAvailable: { type: Boolean, default: false },
    automaticGeneration: { type: Boolean, default: false },
    releaseMode: {
      type: String,
      enum: ['MANUAL', 'AUTOMATIC', 'SCHEDULED'],
      default: 'MANUAL',
    },
    releaseDate: { type: Date, default: null },
    minimumAttendanceRequired: { type: Boolean, default: true },
    certificateType: { type: String, default: 'PARTICIPATION' },
    organizerSignatureUrl: { type: String, default: null },
    organizerName: { type: String, default: null },
    organizationName: { type: String, default: null },
    verificationBaseUrl: { type: String, default: null },
    certificateExpiry: { type: Date, default: null },
    theme: { type: String, default: 'MODERN_BLUE' },
    released: { type: Boolean, default: false },
    releasedAt: { type: Date, default: null },
  },
  { _id: false }
);

const eventSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    organizerId: { type: Number, required: true, index: true },
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'Organizer' },
    eventName: { type: String, required: true, trim: true, maxlength: 200, index: true },
    description: { type: String, default: null },
    category: { type: String, required: true, index: true },
    eventType: { type: String, required: true, index: true },
    eventBanner: { type: String, default: null },
    eventImages: [{ type: String }],
    eventDate: { type: Date, required: true, index: true },
    eventTime: { type: String, required: true },
    endDate: { type: Date, default: null },
    endTime: { type: String, default: null },
    venueName: { type: String, default: null },
    location: { type: String, index: true, default: null },
    googleMapsUrl: { type: String, default: null },
    ticketPrice: { type: Number, required: true, min: 0, default: 0.0 },
    memberTicketPrice: { type: Number, default: null },
    totalSeats: { type: Number, required: true, min: 1 },
    availableSeats: { type: Number, required: true, min: 0 },
    volunteerCapacity: { type: Number, default: 0 },
    volunteerCategories: [{ type: String }],
    status: {
      type: String,
      enum: [
        'DRAFT',
        'PENDING_APPROVAL',
        'APPROVED',
        'REJECTED',
        'PUBLISHED',
        'UPCOMING',
        'LIVE',
        'ONGOING',
        'COMPLETED',
        'CANCELLED',
        'EXPIRED',
      ],
      default: 'DRAFT',
      index: true,
    },
    visibility: {
      type: String,
      enum: ['PUBLIC', 'PRIVATE'],
      default: 'PUBLIC',
    },
    isFeatured: { type: Boolean, default: false, index: true },
    tags: [{ type: String }],
    organizerDetails: { type: String, default: null },
    collegeName: { type: String, index: true, default: null },
    departmentName: { type: String, index: true, default: null },
    hasCertificate: { type: Boolean, default: false },
    registrationDeadline: { type: Date, default: null },
    authorizedDocumentUrl: { type: String, default: null },
    certificateTemplateUrl: { type: String, default: null },
    certificateSignatureName: { type: String, default: null },

    // Hospitality & Logistics
    foodProvided: { type: Boolean, default: false },
    foodMeals: { type: String, default: null },
    foodType: { type: String, default: null },
    teaCoffeeProvided: { type: Boolean, default: false },
    specialDiet: { type: String, default: null },
    accommodationProvided: { type: Boolean, default: false },
    boysHostelAvailable: { type: Boolean, default: false },
    girlsHostelAvailable: { type: Boolean, default: false },
    hotelTieupAvailable: { type: Boolean, default: false },
    accommodationDetails: { type: accommodationSchema, default: () => ({}) },

    // Travel & Venue Context
    nearestBusStop: { type: String, default: null },
    distanceFromBusStop: { type: String, default: null },
    busNumbers: { type: String, default: null },
    nearestRailwayStation: { type: String, default: null },
    distanceFromRailwayStation: { type: String, default: null },
    nearestAirport: { type: String, default: null },
    metroInformation: { type: String, default: null },
    landmarks: { type: String, default: null },
    parkingAvailable: { type: String, default: null },
    travelGuide: { type: String, default: null },
    venueCoordinates: { type: venueCoordinatesSchema, default: () => ({}) },
    estimatedTravelTime: { type: String, default: null },
    cabEstimate: { type: String, default: null },
    nearbyHotels: { type: String, default: null },
    nearbyRestaurants: { type: String, default: null },
    emergencyContacts: { type: String, default: null },
    whatsappGroupLink: { type: String, default: null },
    whatsappContactNumber: { type: String, default: null },

    // Schedule & Announcements
    sessionSchedule: { type: String, default: null },
    speakerList: { type: String, default: null },
    liveAnnouncements: { type: String, default: null },

    // Embedded Certificate Settings
    certificateSettings: { type: certificateSettingsSchema, default: () => ({}) },
  },
  {
    collection: 'events',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

// High-throughput query compound indexes
eventSchema.index({ status: 1, eventDate: 1 });
eventSchema.index({ category: 1, status: 1 });
eventSchema.index({ organizerId: 1, status: 1 });
eventSchema.index({ eventName: 'text', description: 'text', collegeName: 'text', category: 'text' });

// Pre-save hook: auto-assign sequential numeric id
eventSchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('events');
  }
  next();
});

/**
 * Concurrency Control: Atomically reserve seats using optimistic condition.
 * Guarantees availableSeats never drops below 0 even under massive concurrent load.
 *
 * @param {number|string} eventId Either integer id or ObjectId
 * @param {number} quantity Number of seats to hold
 * @returns {Promise<Document>} Updated event
 */
eventSchema.statics.reserveSeats = async function (eventId, quantity) {
  const query = {
    availableSeats: { $gte: quantity },
    status: { $in: ['PUBLISHED', 'UPCOMING', 'LIVE', 'APPROVED'] },
  };

  if (typeof eventId === 'number' || !isNaN(Number(eventId))) {
    query.id = Number(eventId);
  } else {
    query._id = eventId;
  }

  const updatedEvent = await this.findOneAndUpdate(
    query,
    { $inc: { availableSeats: -quantity } },
    { new: true }
  );

  if (!updatedEvent) {
    const error = new Error('Seats unavailable or event is not open for booking');
    error.name = 'CapacityError';
    error.code = 'SEATS_UNAVAILABLE';
    throw error;
  }

  return updatedEvent;
};

/**
 * Concurrency Control: Atomically release reserved seats upon cancellation or timeout.
 *
 * @param {number|string} eventId Either integer id or ObjectId
 * @param {number} quantity Number of seats to release
 * @returns {Promise<Document>} Updated event
 */
eventSchema.statics.releaseSeats = async function (eventId, quantity) {
  const query = {};
  if (typeof eventId === 'number' || !isNaN(Number(eventId))) {
    query.id = Number(eventId);
  } else {
    query._id = eventId;
  }

  return this.findOneAndUpdate(
    query,
    { $inc: { availableSeats: quantity } },
    { new: true }
  );
};

export const Event = mongoose.model('Event', eventSchema);
export default Event;
