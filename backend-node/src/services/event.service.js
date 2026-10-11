import mongoose from 'mongoose';
import { Event, Organizer, ApprovalRequest, Booking, VolunteerTask, AuditLog } from '../models/index.js';
import { notificationService } from './notification.service.js';
import { NotFoundError, UnauthorizedError, ForbiddenError, BadRequestError } from '../utils/errors.js';

export class EventService {
  /**
   * Transforms an Event document to the standard EventResponse shape expected by React frontend.
   */
  static toEventResponse(event, viewerId = null, role = null) {
    if (!event) return null;
    const doc = event.toObject ? event.toObject() : event;

    const organizerDoc = doc.organizer && typeof doc.organizer === 'object' ? doc.organizer : null;

    let organizerInfo = null;
    if (organizerDoc) {
      organizerInfo = {
        id: organizerDoc.id,
        organizerName: organizerDoc.organizerName,
        organizationName: organizerDoc.organizationName,
        organizationLogo: organizerDoc.organizationLogo,
        email: organizerDoc.email,
        phone: organizerDoc.phone,
        organizerCode: organizerDoc.organizerCode,
      };
    }

    // Format dates to ISO strings / YYYY-MM-DD
    const eventDateStr = doc.eventDate instanceof Date
      ? doc.eventDate.toISOString().split('T')[0]
      : (doc.eventDate ? String(doc.eventDate).split('T')[0] : null);

    const endDateStr = doc.endDate instanceof Date
      ? doc.endDate.toISOString().split('T')[0]
      : (doc.endDate ? String(doc.endDate).split('T')[0] : null);

    const registrationDeadlineStr = doc.registrationDeadline instanceof Date
      ? doc.registrationDeadline.toISOString().split('T')[0]
      : (doc.registrationDeadline ? String(doc.registrationDeadline).split('T')[0] : null);

    return {
      id: doc.id,
      eventName: doc.eventName,
      description: doc.description,
      category: doc.category,
      eventType: doc.eventType,
      collegeName: doc.collegeName,
      departmentName: doc.departmentName,
      eventBanner: doc.eventBanner,
      eventDate: eventDateStr,
      eventTime: doc.eventTime,
      endDate: endDateStr,
      endTime: doc.endTime,
      registrationDeadline: registrationDeadlineStr,
      venueName: doc.venueName,
      location: doc.location,
      googleMapsUrl: doc.googleMapsUrl,
      whatsappGroupLink: doc.whatsappGroupLink,
      whatsappContactNumber: doc.whatsappContactNumber,
      venueLatitude: doc.venueCoordinates?.latitude || null,
      venueLongitude: doc.venueCoordinates?.longitude || null,
      ticketPrice: doc.ticketPrice,
      memberTicketPrice: doc.memberTicketPrice || null,
      totalSeats: doc.totalSeats,
      availableSeats: doc.availableSeats,
      volunteerCapacity: doc.volunteerCapacity || 0,
      volunteerCategories: Array.isArray(doc.volunteerCategories) ? doc.volunteerCategories : [],
      status: doc.status,
      visibility: doc.visibility,
      featured: Boolean(doc.isFeatured),
      hasCertificate: Boolean(doc.hasCertificate),
      certificateSettings: doc.certificateSettings || null,
      tags: Array.isArray(doc.tags) ? doc.tags.join(', ') : (doc.tags || null),
      organizerDetails: doc.organizerDetails,
      authorizedDocumentUrl: doc.authorizedDocumentUrl,
      organizer: organizerInfo,
      createdAt: doc.createdAt,

      // Hospitality & Logistics
      foodProvided: Boolean(doc.foodProvided),
      foodMeals: doc.foodMeals || null,
      foodType: doc.foodType || null,
      teaCoffeeProvided: Boolean(doc.teaCoffeeProvided),
      specialDiet: doc.specialDiet || null,
      accommodationProvided: Boolean(doc.accommodationProvided),
      accommodationType: doc.accommodationType || null,
      accommodationCharges: doc.accommodationCharges || null,
      accommodationBedsAvailable: doc.accommodationBedsAvailable || null,
      accommodationDetails: doc.accommodationDetails || null,
      boysHostelAvailable: Boolean(doc.boysHostelAvailable),
      girlsHostelAvailable: Boolean(doc.girlsHostelAvailable),
      hotelTieupAvailable: Boolean(doc.hotelTieupAvailable),
      accommodationCheckIn: doc.accommodationDetails?.checkIn || null,
      accommodationCheckOut: doc.accommodationDetails?.checkOut || null,
      accommodationContactPerson: doc.accommodationDetails?.contactPerson || null,

      // Transportation & Facilities
      nearestBusStop: doc.nearestBusStop || null,
      distanceFromBusStop: doc.distanceFromBusStop || null,
      busNumbers: doc.busNumbers || null,
      nearestRailwayStation: doc.nearestRailwayStation || null,
      distanceFromRailwayStation: doc.distanceFromRailwayStation || null,
      nearestAirport: doc.nearestAirport || null,
      metroInformation: doc.metroInformation || null,
      landmarks: doc.landmarks || null,
      parkingAvailable: doc.parkingAvailable || null,
      travelGuide: doc.travelGuide || null,
      estimatedTravelTime: doc.estimatedTravelTime || null,
      cabEstimate: doc.cabEstimate || null,
      nearbyHotels: doc.nearbyHotels || null,
      nearbyRestaurants: doc.nearbyRestaurants || null,
      emergencyContacts: doc.emergencyContacts || null,
      sessionSchedule: doc.sessionSchedule || null,
      speakerList: doc.speakerList || null,
      liveAnnouncements: doc.liveAnnouncements || null,
      reportingTime: doc.reportingTime || null,
      dressCode: doc.dressCode || null,
      itemsToBring: doc.itemsToBring || null,
      laptopRequired: Boolean(doc.laptopRequired),
      idCardRequired: Boolean(doc.idCardRequired),
      teamSize: doc.teamSize || null,
      rules: doc.rules || null,
      refundPolicy: doc.refundPolicy || null,
      cancellationPolicy: doc.cancellationPolicy || null,
      certificateEligibility: doc.certificateEligibility || null,
      wifiAvailable: Boolean(doc.wifiAvailable),
      wheelchairAccessible: false,
      restRoomsAvailable: false,
      drinkingWaterAvailable: false,
      medicalSupportAvailable: Boolean(doc.medicalSupportAvailable),
      networkingEnabled: false,
    };
  }

  /**
   * Search, filter, and paginate events with full query parameters.
   */
  static async searchEvents(query = {}) {
    const page = Math.max(0, parseInt(query.page || 0, 10));
    const size = Math.min(100, Math.max(1, parseInt(query.size || 12, 10)));
    const filter = { visibility: 'PUBLIC' };

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const isPast = query.past === true || query.past === 'true';
    if (isPast) {
      filter.status = { $in: ['PUBLISHED', 'LIVE', 'ONGOING', 'COMPLETED', 'EXPIRED'] };
      filter.$or = [
        { eventDate: { $lt: todayStart } },
        { status: { $in: ['COMPLETED', 'EXPIRED'] } },
      ];
    } else {
      filter.status = { $in: ['PUBLISHED', 'LIVE', 'ONGOING', 'UPCOMING', 'APPROVED'] };
      filter.eventDate = { $gte: todayStart };
    }

    if (query.keyword) {
      const keywordRegex = new RegExp(query.keyword.trim(), 'i');
      filter.$or = [
        { eventName: keywordRegex },
        { description: keywordRegex },
        { tags: keywordRegex },
        { location: keywordRegex },
        { collegeName: keywordRegex },
        { departmentName: keywordRegex },
      ];
    }

    if (query.category) {
      filter.category = new RegExp(`^${query.category.trim()}$`, 'i');
    }
    if (query.eventType) {
      filter.eventType = new RegExp(`^${query.eventType.trim()}$`, 'i');
    }
    if (query.location) {
      filter.location = new RegExp(query.location.trim(), 'i');
    }
    if (query.venueName) {
      filter.venueName = new RegExp(query.venueName.trim(), 'i');
    }
    if (query.collegeName) {
      filter.collegeName = new RegExp(query.collegeName.trim(), 'i');
    }
    if (query.departmentName) {
      filter.departmentName = new RegExp(query.departmentName.trim(), 'i');
    }

    if (query.dateFrom || query.dateTo) {
      filter.eventDate = filter.eventDate || {};
      if (query.dateFrom) {
        filter.eventDate.$gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        const to = new Date(query.dateTo);
        to.setHours(23, 59, 59, 999);
        filter.eventDate.$lte = to;
      }
    }

    if (query.priceMin !== undefined || query.priceMax !== undefined) {
      filter.ticketPrice = {};
      if (query.priceMin !== undefined) filter.ticketPrice.$gte = Number(query.priceMin);
      if (query.priceMax !== undefined) filter.ticketPrice.$lte = Number(query.priceMax);
    }

    if (query.freeOnly === true || query.freeOnly === 'true') {
      filter.ticketPrice = 0;
    }
    if (query.paidOnly === true || query.paidOnly === 'true') {
      filter.ticketPrice = { $gt: 0 };
    }

    if (query.interCollege === true || query.interCollege === 'true') {
      filter.category = new RegExp('^inter_college$', 'i');
    }
    if (query.intraCollege === true || query.intraCollege === 'true') {
      filter.category = new RegExp('^intra_college$', 'i');
    }

    // Build sort
    let sort = { eventDate: 1 };
    const sortBy = (query.sortBy || 'date_asc').toLowerCase();
    switch (sortBy) {
      case 'newest':
      case 'latest':
        sort = { createdAt: -1 };
        break;
      case 'oldest':
        sort = { createdAt: 1 };
        break;
      case 'price_asc':
        sort = { ticketPrice: 1 };
        break;
      case 'price_desc':
        sort = { ticketPrice: -1 };
        break;
      case 'date_desc':
        sort = { eventDate: -1 };
        break;
      case 'popular':
      case 'most_registered':
        sort = { availableSeats: 1 };
        break;
      default:
        sort = { eventDate: 1 };
    }

    const totalElements = await Event.countDocuments(filter);
    const totalPages = Math.ceil(totalElements / size) || 0;
    const events = await Event.find(filter)
      .populate('organizer')
      .sort(sort)
      .skip(page * size)
      .limit(size);

    return {
      content: events.map((e) => EventService.toEventResponse(e)),
      page,
      size,
      totalElements,
      totalPages,
      first: page === 0,
      last: page >= totalPages - 1,
    };
  }

  /**
   * Featured upcoming events.
   */
  static async getFeaturedEvents() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const events = await Event.find({
      visibility: 'PUBLIC',
      status: { $in: ['PUBLISHED', 'UPCOMING', 'LIVE', 'APPROVED'] },
      eventDate: { $gte: today },
    })
      .populate('organizer')
      .sort({ eventDate: 1 })
      .limit(6);

    return events.map((e) => EventService.toEventResponse(e));
  }

  /**
   * Retrieve event details viewer-aware.
   */
  static async getEventForViewer(eventId, viewerId = null, role = null) {
    const numericId = Number(eventId);
    const event = await Event.findOne({ id: numericId }).populate('organizer');
    if (!event) {
      throw new NotFoundError(`Event not found: ${eventId}`);
    }

    const isOwner = viewerId && event.organizerId === viewerId && role === 'ORGANIZER';
    const isAdmin = role === 'ADMIN';

    if (!isOwner && !isAdmin && (event.visibility !== 'PUBLIC' || event.status === 'DRAFT')) {
      throw new NotFoundError(`Event not found: ${eventId}`);
    }

    return EventService.toEventResponse(event, viewerId, role);
  }

  /**
   * Filter events by status.
   */
  static async getEventsByStatus(statuses) {
    const events = await Event.find({ status: { $in: statuses } })
      .populate('organizer')
      .sort({ eventDate: -1 });
    return events.map((e) => EventService.toEventResponse(e));
  }

  /**
   * Create an event by an Organizer. Auto-approves creation like the Java service.
   */
  static async createEvent(organizerId, data) {
    const organizer = await Organizer.findOne({ id: organizerId });
    if (!organizer) {
      throw new NotFoundError('Organizer not found');
    }

    const eventDate = new Date(data.eventDate);
    const endDate = data.endDate ? new Date(data.endDate) : null;
    const registrationDeadline = data.registrationDeadline ? new Date(data.registrationDeadline) : null;

    const tagsArray = Array.isArray(data.tags)
      ? data.tags
      : (typeof data.tags === 'string' ? data.tags.split(',').map((t) => t.trim()).filter(Boolean) : []);

    const event = new Event({
      organizerId,
      organizer: organizer._id,
      eventName: data.eventName,
      description: data.description || null,
      category: data.category,
      eventType: data.eventType,
      collegeName: data.collegeName || null,
      departmentName: data.departmentName || null,
      eventDate,
      eventTime: data.eventTime,
      endDate,
      endTime: data.endTime || null,
      registrationDeadline,
      venueName: data.venueName || null,
      location: data.location || null,
      googleMapsUrl: data.googleMapsUrl || null,
      whatsappGroupLink: data.whatsappGroupLink || null,
      whatsappContactNumber: data.whatsappContactNumber || null,
      venueCoordinates: {
        latitude: data.venueLatitude || null,
        longitude: data.venueLongitude || null,
      },
      ticketPrice: data.ticketPrice || 0,
      memberTicketPrice: data.memberTicketPrice !== undefined ? data.memberTicketPrice : null,
      totalSeats: data.totalSeats,
      availableSeats: data.totalSeats,
      volunteerCapacity: data.volunteerCapacity !== undefined ? Number(data.volunteerCapacity) : 0,
      volunteerCategories: Array.isArray(data.volunteerCategories)
        ? data.volunteerCategories
        : (typeof data.volunteerCategories === 'string' ? data.volunteerCategories.split(',').map((c) => c.trim()).filter(Boolean) : []),
      status: data.status || 'PUBLISHED',
      visibility: data.visibility || 'PUBLIC',
      tags: tagsArray,
      organizerDetails: data.organizerDetails || null,
      authorizedDocumentUrl: data.authorizedDocumentUrl || null,
      hasCertificate: Boolean(data.hasCertificate),
      certificateSettings: {
        certificateAvailable: Boolean(data.hasCertificate),
        organizerName: data.certificateSettings?.organizerName || organizer.organizerName,
        organizationName: data.certificateSettings?.organizationName || organizer.organizationName,
        ...data.certificateSettings,
      },

      // Hospitality & Logistics
      foodProvided: Boolean(data.foodProvided),
      foodMeals: data.foodMeals || null,
      foodType: data.foodType || null,
      teaCoffeeProvided: Boolean(data.teaCoffeeProvided),
      specialDiet: data.specialDiet || null,
      accommodationProvided: Boolean(data.accommodationProvided),
      accommodationType: data.accommodationType || null,
      accommodationCharges: data.accommodationCharges || null,
      accommodationBedsAvailable: data.accommodationBedsAvailable || null,
      accommodationDetails: data.accommodationDetails || {},
      boysHostelAvailable: Boolean(data.boysHostelAvailable),
      girlsHostelAvailable: Boolean(data.girlsHostelAvailable),
      hotelTieupAvailable: Boolean(data.hotelTieupAvailable),

      // Transportation & Facilities
      nearestBusStop: data.nearestBusStop || null,
      distanceFromBusStop: data.distanceFromBusStop || null,
      busNumbers: data.busNumbers || null,
      nearestRailwayStation: data.nearestRailwayStation || null,
      distanceFromRailwayStation: data.distanceFromRailwayStation || null,
      nearestAirport: data.nearestAirport || null,
      metroInformation: data.metroInformation || null,
      landmarks: data.landmarks || null,
      parkingAvailable: data.parkingAvailable || null,
      travelGuide: data.travelGuide || null,
      estimatedTravelTime: data.estimatedTravelTime || null,
      cabEstimate: data.cabEstimate || null,
      nearbyHotels: data.nearbyHotels || null,
      nearbyRestaurants: data.nearbyRestaurants || null,
      emergencyContacts: data.emergencyContacts || null,
      sessionSchedule: data.sessionSchedule || null,
      speakerList: data.speakerList || null,
      liveAnnouncements: data.liveAnnouncements || null,
      reportingTime: data.reportingTime || null,
      dressCode: data.dressCode || null,
      itemsToBring: data.itemsToBring || null,
      laptopRequired: Boolean(data.laptopRequired),
      idCardRequired: Boolean(data.idCardRequired),
      teamSize: data.teamSize || null,
      rules: data.rules || null,
      refundPolicy: data.refundPolicy || null,
      cancellationPolicy: data.cancellationPolicy || null,
      certificateEligibility: data.certificateEligibility || null,
      wifiAvailable: Boolean(data.wifiAvailable),
      medicalSupportAvailable: Boolean(data.medicalSupportAvailable),
    });

    const savedEvent = await event.save();

    // Auto-approve: create an approved ApprovalRequest so no admin action is needed
    const autoApproval = new ApprovalRequest({
      eventId: savedEvent.id,
      event: savedEvent._id,
      organizerId,
      organizer: organizer._id,
      status: 'APPROVED',
      reviewNote: 'Auto-approved on creation',
      reviewedAt: new Date(),
    });
    await autoApproval.save();

    return EventService.toEventResponse(savedEvent);
  }

  /**
   * Update an existing event with ownership check and registration lock.
   */
  static async updateEvent(eventId, organizerId, data) {
    const numericId = Number(eventId);
    const event = await Event.findOne({ id: numericId });
    if (!event) throw new NotFoundError(`Event not found: ${eventId}`);
    if (event.organizerId !== organizerId) {
      throw new ForbiddenError('Unauthorized Access: you do not own this event');
    }

    const confirmedBookings = await Booking.countDocuments({
      eventId: numericId,
      bookingStatus: 'CONFIRMED',
    });
    const hasRegistrations = confirmedBookings > 0 || event.availableSeats < event.totalSeats;
    const isPublished = ['PUBLISHED', 'UPCOMING', 'LIVE', 'ONGOING'].includes(event.status);

    if (hasRegistrations) {
      if (data.totalSeats !== undefined && data.totalSeats !== event.totalSeats) {
        throw new BadRequestError('Cannot modify total event capacity once bookings exist');
      }
      if (data.ticketPrice !== undefined && data.ticketPrice !== event.ticketPrice) {
        throw new BadRequestError('Cannot modify ticket pricing once bookings exist');
      }
      if (data.memberTicketPrice !== undefined && data.memberTicketPrice !== event.memberTicketPrice) {
        throw new BadRequestError('Cannot modify member ticket pricing once bookings exist');
      }
    }

    if (!isPublished) {
      if (data.eventName) event.eventName = data.eventName;
      if (data.category) event.category = data.category;
      if (data.eventType) event.eventType = data.eventType;
      if (data.collegeName !== undefined) event.collegeName = data.collegeName;
      if (data.departmentName !== undefined) event.departmentName = data.departmentName;
      if (data.eventDate) event.eventDate = new Date(data.eventDate);
      if (data.eventTime) event.eventTime = data.eventTime;
      if (data.endDate !== undefined) event.endDate = data.endDate ? new Date(data.endDate) : null;
      if (data.endTime !== undefined) event.endTime = data.endTime;
      if (data.registrationDeadline !== undefined) {
        event.registrationDeadline = data.registrationDeadline ? new Date(data.registrationDeadline) : null;
      }
      if (data.venueName !== undefined) event.venueName = data.venueName;
      if (data.location !== undefined) event.location = data.location;
      if (data.googleMapsUrl !== undefined) event.googleMapsUrl = data.googleMapsUrl;
      if (data.ticketPrice !== undefined) event.ticketPrice = data.ticketPrice;
      if (data.memberTicketPrice !== undefined) event.memberTicketPrice = data.memberTicketPrice;
      if (data.visibility) event.visibility = data.visibility;
      if (data.totalSeats !== undefined) {
        event.totalSeats = data.totalSeats;
        event.availableSeats = data.totalSeats;
      }
      if (data.volunteerCapacity !== undefined) event.volunteerCapacity = Number(data.volunteerCapacity);
      if (data.volunteerCategories !== undefined) {
        event.volunteerCategories = Array.isArray(data.volunteerCategories)
          ? data.volunteerCategories
          : (typeof data.volunteerCategories === 'string' ? data.volunteerCategories.split(',').map((c) => c.trim()).filter(Boolean) : []);
      }
      if (data.hasCertificate !== undefined) event.hasCertificate = Boolean(data.hasCertificate);
    } else if (!hasRegistrations && data.eventDate) {
      event.eventDate = new Date(data.eventDate);
      if (data.eventTime) event.eventTime = data.eventTime;
      if (data.endDate !== undefined) event.endDate = data.endDate ? new Date(data.endDate) : null;
      if (data.endTime !== undefined) event.endTime = data.endTime;
      if (data.registrationDeadline !== undefined) {
        event.registrationDeadline = data.registrationDeadline ? new Date(data.registrationDeadline) : null;
      }
    }

    // Editable fields at any time
    if (data.description !== undefined) event.description = data.description;
    if (data.whatsappGroupLink !== undefined) event.whatsappGroupLink = data.whatsappGroupLink;
    if (data.whatsappContactNumber !== undefined) event.whatsappContactNumber = data.whatsappContactNumber;
    if (data.tags !== undefined) {
      event.tags = Array.isArray(data.tags)
        ? data.tags
        : (typeof data.tags === 'string' ? data.tags.split(',').map((t) => t.trim()).filter(Boolean) : []);
    }
    if (data.organizerDetails !== undefined) event.organizerDetails = data.organizerDetails;
    if (data.authorizedDocumentUrl !== undefined) event.authorizedDocumentUrl = data.authorizedDocumentUrl;
    if (data.venueLatitude !== undefined) event.venueCoordinates.latitude = data.venueLatitude;
    if (data.venueLongitude !== undefined) event.venueCoordinates.longitude = data.venueLongitude;

    // Auto-approve on re-edit after rejection
    if (event.status === 'REJECTED') {
      event.status = 'PUBLISHED';
      await ApprovalRequest.findOneAndUpdate(
        { eventId: numericId },
        { status: 'APPROVED', reviewNote: 'Auto-approved after organizer re-submission', reviewedAt: new Date() },
        { sort: { requestedAt: -1 } }
      );
    }

    const saved = await event.save();
    return EventService.toEventResponse(saved);
  }

  /**
   * Delete an event: marks status as CANCELLED per Spring Boot logic.
   */
  static async deleteEvent(eventId, organizerId) {
    const numericId = Number(eventId);
    const event = await Event.findOne({ id: numericId });
    if (!event) throw new NotFoundError(`Event not found: ${eventId}`);
    if (event.organizerId !== organizerId) {
      throw new ForbiddenError('Unauthorized Access: you do not own this event');
    }

    event.status = 'CANCELLED';
    await event.save();
  }

  /**
   * Cancel an event.
   */
  static async cancelEvent(eventId, organizerId) {
    const numericId = Number(eventId);
    const event = await Event.findOne({ id: numericId });
    if (!event) throw new NotFoundError(`Event not found: ${eventId}`);
    if (event.organizerId !== organizerId) {
      throw new ForbiddenError('Unauthorized Access: you do not own this event');
    }

    event.status = 'CANCELLED';
    const saved = await event.save();
    return EventService.toEventResponse(saved);
  }

  /**
   * Publish an approved event.
   */
  static async publishEvent(eventId, organizerId) {
    let event = null;
    if (typeof eventId === 'string' && /^[0-9a-fA-F]{24}$/.test(eventId)) {
      event = await Event.findById(eventId);
    } else if (!isNaN(Number(eventId))) {
      event = await Event.findOne({ id: Number(eventId) });
    }
    if (!event) throw new NotFoundError(`Event not found: ${eventId}`);
    if (event.organizerId !== Number(organizerId) && String(event.organizer) !== String(organizerId)) {
      throw new ForbiddenError('Unauthorized Access: you do not own this event');
    }

    if (['CANCELLED', 'EXPIRED'].includes(event.status)) {
      throw new BadRequestError(`Cannot publish an event with status ${event.status}`);
    }

    event.status = 'PUBLISHED';
    const saved = await event.save();
    return EventService.toEventResponse(saved);
  }

  /**
   * Admin reviews event approval.
   */
  static async reviewEvent(eventId, adminId, decision, reason = null) {
    const numericId = Number(eventId);
    const event = await Event.findOne({ id: numericId }).populate('organizer');
    if (!event) throw new NotFoundError(`Event not found: ${eventId}`);

    let approval = await ApprovalRequest.findOne({ eventId: numericId }).sort({ requestedAt: -1 });
    if (!approval) {
      approval = new ApprovalRequest({
        eventId: numericId,
        event: event._id,
        organizerId: event.organizerId,
        organizer: event.organizer?._id,
      });
    }

    switch (decision.toUpperCase()) {
      case 'APPROVE':
        event.status = 'APPROVED';
        approval.status = 'APPROVED';
        break;
      case 'REJECT':
        event.status = 'REJECTED';
        approval.status = 'REJECTED';
        approval.reviewNote = reason;
        break;
      case 'REQUEST_MODIFICATIONS':
        event.status = 'REJECTED';
        approval.status = 'MODIFICATION_REQUESTED';
        approval.reviewNote = reason;
        break;
      default:
        throw new BadRequestError('Unsupported approval decision');
    }

    approval.reviewedBy = adminId;
    approval.reviewedAt = new Date();
    await approval.save();

    const saved = await event.save();
    return EventService.toEventResponse(saved);
  }

  /**
   * Force expire event (Admin).
   */
  static async forceExpireEvent(eventId, adminId) {
    const numericId = Number(eventId);
    const event = await Event.findOne({ id: numericId });
    if (!event) throw new NotFoundError(`Event not found: ${eventId}`);

    event.status = 'EXPIRED';
    const saved = await event.save();
    return EventService.toEventResponse(saved);
  }

  /**
   * Force complete event (Organizer or Admin).
   */
  static async forceCompleteEvent(eventId, userId) {
    const numericId = Number(eventId);
    const event = await Event.findOne({ id: numericId });
    if (!event) throw new NotFoundError(`Event not found: ${eventId}`);

    event.status = 'COMPLETED';
    const saved = await event.save();
    return EventService.toEventResponse(saved);
  }

  /**
   * Get events belonging to an organizer with optional status filter and pagination.
   */
  static async getOrganizerEvents(organizerId, status = null, page = 0, size = 12) {
    const filter = { organizerId };
    if (status) {
      filter.status = status.toUpperCase();
    }

    const totalElements = await Event.countDocuments(filter);
    const totalPages = Math.ceil(totalElements / size) || 0;
    const events = await Event.find(filter)
      .populate('organizer')
      .sort({ createdAt: -1 })
      .skip(page * size)
      .limit(size);

    return {
      content: events.map((e) => EventService.toEventResponse(e)),
      page,
      size,
      totalElements,
      totalPages,
      first: page === 0,
      last: page >= totalPages - 1,
    };
  }

  static async uploadBanner(eventId, organizerId, bannerUrl) {
    const event = await Event.findOne({ id: Number(eventId) });
    if (!event) throw new NotFoundError('Event not found');
    if (event.organizerId !== Number(organizerId)) throw new ForbiddenError('Access denied');

    event.eventBanner = bannerUrl;
    event.eventImages = bannerUrl;
    await event.save();
    return bannerUrl;
  }

  static async uploadAuthorizedDocument(eventId, organizerId, documentUrl) {
    const event = await Event.findOne({ id: Number(eventId) });
    if (!event) throw new NotFoundError('Event not found');
    if (event.organizerId !== Number(organizerId)) throw new ForbiddenError('Access denied');

    event.organizerDetails = event.organizerDetails
      ? `${event.organizerDetails} | Doc: ${documentUrl}`
      : `Doc: ${documentUrl}`;
    await event.save();
    return documentUrl;
  }

  /**
   * Publish an announcement for an event: updates liveAnnouncements, notifies attendees and optional volunteers.
   */
  static async publishAnnouncement(eventId, organizerId, { title, message, notifyVolunteers = false }) {
    let event = null;
    if (typeof eventId === 'string' && /^[0-9a-fA-F]{24}$/.test(eventId)) {
      event = await Event.findById(eventId);
    } else if (!isNaN(Number(eventId))) {
      event = await Event.findOne({ id: Number(eventId) });
    }
    if (!event) throw new NotFoundError(`Event not found: ${eventId}`);
    if (event.organizerId !== Number(organizerId) && String(event.organizer) !== String(organizerId)) {
      throw new ForbiddenError('Unauthorized Access: you do not own this event');
    }

    const timestampStr = new Date().toLocaleString();
    const formattedAnnouncement = `[${timestampStr}] ${title}: ${message}`;
    event.liveAnnouncements = event.liveAnnouncements
      ? `${formattedAnnouncement}\n\n${event.liveAnnouncements}`
      : formattedAnnouncement;
    await event.save();

    // 1. Notify confirmed attendees
    const bookings = await Booking.find({
      $or: [{ eventId: event.id }, { event: event._id }],
      bookingStatus: 'CONFIRMED',
    }).select('userId user').lean();

    const recipientUserIds = new Set();
    bookings.forEach((b) => {
      if (b.userId) recipientUserIds.add(b.userId);
      else if (b.user) recipientUserIds.add(b.user);
    });

    // 2. Notify volunteers if requested
    if (notifyVolunteers) {
      const tasks = await VolunteerTask.find({
        $or: [{ eventId: event.id }, { event: event._id }],
      }).select('volunteerId volunteer').lean();
      tasks.forEach((t) => {
        if (t.volunteerId) recipientUserIds.add(t.volunteerId);
        else if (t.volunteer) recipientUserIds.add(t.volunteer);
      });
    }

    for (const userId of recipientUserIds) {
      await notificationService.sendNotification(
        userId,
        'USER',
        'EVENT_ANNOUNCEMENT',
        title,
        message,
        `/events/${event.id}`
      );
    }

    await AuditLog.create({
      actorId: Number(organizerId),
      actorType: 'ORGANIZER',
      action: 'EVENT_ANNOUNCEMENT_PUBLISHED',
      targetType: 'EVENT',
      targetId: String(event.id),
      details: `Organizer ${organizerId} published announcement for ${event.eventName}. Notified ${recipientUserIds.size} recipients.`,
    }).catch(() => {});

    return {
      title,
      message,
      success: true,
      recipientsNotified: recipientUserIds.size,
      announcement: formattedAnnouncement,
    };
  }
}

export default EventService;
