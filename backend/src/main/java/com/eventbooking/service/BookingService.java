package com.eventbooking.service;

import com.eventbooking.dto.request.BookingRequest;
import com.eventbooking.dto.response.BookingResponse;
import com.eventbooking.dto.response.PagedResponse;
import com.eventbooking.exception.*;
import com.eventbooking.entity.Booking;
import com.eventbooking.entity.BookingQueueEntry;
import com.eventbooking.entity.Event;
import com.eventbooking.entity.Payment;
import com.eventbooking.entity.Participant;
import com.eventbooking.entity.Refund;
import com.eventbooking.entity.User;
import com.eventbooking.notification.NotificationService;
import com.eventbooking.repository.*;
import com.eventbooking.util.QrCodeGenerator;
import com.eventbooking.util.TicketIdGenerator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;

/**
 * Handles ticket booking, cancellation, and booking history.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class BookingService {

    private final BookingRepository   bookingRepository;
    private final EventRepository     eventRepository;
    private final UserRepository      userRepository;
    private final PaymentRepository   paymentRepository;
    private final CertificateRepository certificateRepository;
    private final RefundRepository    refundRepository;
    private final ParticipantRepository participantRepository;
    private final BookingQueueRepository bookingQueueRepository;
    private final NotificationService notificationService;
    private final EmailService        emailService;
    private final QrCodeGenerator     qrCodeGenerator;
    private final AuditService auditService;
    private final BookingTransactionHelper bookingTransactionHelper;

    // ─── BOOK TICKETS ─────────────────────────────────────────────────────

    @Transactional
    @org.springframework.cache.annotation.CacheEvict(value = "recommendations", allEntries = true)
    public BookingResponse bookTickets(Long userId, BookingRequest request) {
        LocalDateTime requestTimestamp = LocalDateTime.now();
        BookingQueueEntry queueEntry = bookingQueueRepository.save(BookingQueueEntry.builder()
                .requestId("BR-" + UUID.randomUUID().toString().substring(0, 12).toUpperCase())
                .userId(userId)
                .eventId(request.getEventId())
                .quantity(request.getQuantity())
                .requestTimestamp(requestTimestamp)
                .bookingStatus(BookingQueueEntry.QueueStatus.PROCESSING)
                .build());

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        Event event = eventRepository.findByIdForUpdate(request.getEventId())
                .orElseThrow(() -> new ResourceNotFoundException("Event not found"));

        if (!isBookable(event)) {
            queueEntry.setBookingStatus(BookingQueueEntry.QueueStatus.FAILED);
            queueEntry.setMessage("Booking is not available for this event");
            throw new BookingException("Booking is not available for this event");
        }

        if (bookingRepository.findActiveBooking(userId, event.getId()).isPresent()) {
            queueEntry.setBookingStatus(BookingQueueEntry.QueueStatus.FAILED);
            queueEntry.setMessage("You already have an active booking for this event");
            bookingQueueRepository.save(queueEntry);
            throw new DuplicateResourceException("You already have an active booking for this event");
        }

        if (event.getAvailableSeats() < request.getQuantity()) {
            queueEntry.setBookingStatus(BookingQueueEntry.QueueStatus.TICKETS_SOLD_OUT);
            queueEntry.setMessage("Tickets Sold Out");
            throw new BookingException("Tickets Sold Out");
        }

        List<BookingRequest.ParticipantRequest> participantRequests = normalizeParticipants(request, user);
        validateParticipants(event.getId(), participantRequests);

        String ticketId = TicketIdGenerator.generate();
        BigDecimal total = event.getTicketPrice().multiply(BigDecimal.valueOf(request.getQuantity()));

        Booking booking = Booking.builder()
                .ticketId(ticketId)
                .user(user)
                .event(event)
                .quantity(request.getQuantity())
                .totalAmount(total)
                .bookingStatus(Booking.BookingStatus.PENDING)
                .ticketStatus(Booking.TicketStatus.ACTIVE)
                .build();

        // QR is NOT generated here — generated only after payment succeeds

        Booking savedBooking = bookingRepository.save(booking);
        List<Participant> participants = participantRequests.stream()
                .map(p -> Participant.builder()
                        .booking(savedBooking)
                        .event(event)
                        .name(p.getName().trim())
                        .email(p.getEmail().trim().toLowerCase())
                        .department(p.getDepartment())
                        .college(p.getCollege())
                        .build())
                .toList();
        participantRepository.saveAll(participants);
        booking = savedBooking;
        queueEntry.setBookingId(booking.getId());
        queueEntry.setBookingStatus(BookingQueueEntry.QueueStatus.PAYMENT_PENDING);
        queueEntry.setMessage("Payment Pending");
        bookingQueueRepository.save(queueEntry);

        event.setAvailableSeats(event.getAvailableSeats() - request.getQuantity());
        eventRepository.save(event);

        Payment payment = Payment.builder()
                .transactionId("TXN-" + UUID.randomUUID().toString().substring(0, 12).toUpperCase())
                .booking(booking)
                .amount(total)
                .paymentStatus(Payment.PaymentStatus.PENDING)
                .paymentMethod("ONLINE")
                .build();
        paymentRepository.save(payment);

        notificationService.sendNotification(userId, "USER",
                "PAYMENT_PENDING", "Payment Pending",
                "Your seats are reserved for " + event.getEventName() + ". Complete payment within 10 minutes. Ticket: " + ticketId,
                "/bookings/" + booking.getId());
        auditService.record(userId, "USER", "BOOKING_RESERVED", "BOOKING",
                String.valueOf(booking.getId()), "Payment pending reservation for event " + event.getId());

        log.info("Ticket reserved: {} for user {} event {}", ticketId, userId, event.getId());
        return toResponse(booking);
    }

    // ─── CANCEL BOOKING ───────────────────────────────────────────────────

    @Transactional
    public BookingResponse cancelBooking(Long bookingId, Long userId, String reason) {
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new ResourceNotFoundException("Booking not found"));

        if (!booking.getUser().getId().equals(userId))
            throw new UnauthorizedException("Unauthorized Access");

        if (booking.getBookingStatus() == Booking.BookingStatus.CANCELLED)
            throw new BookingException("Booking is already cancelled");

        booking.setBookingStatus(Booking.BookingStatus.CANCELLED);
        booking.setTicketStatus(Booking.TicketStatus.CANCELLED);
        booking.setCancellationReason(reason);
        booking.setCancelledAt(LocalDateTime.now());
        booking.setQrCodePath(null); // invalidate QR on cancellation
        bookingRepository.save(booking);

        Event event = booking.getEvent();
        event.setAvailableSeats(event.getAvailableSeats() + booking.getQuantity());
        eventRepository.save(event);

        paymentRepository.findByBookingId(bookingId)
                .filter(p -> p.getPaymentStatus() == Payment.PaymentStatus.SUCCESSFUL)
                .ifPresent(p -> {
                    refundRepository.save(Refund.builder()
                            .payment(p)
                            .refundAmount(p.getAmount())
                            .refundStatus(Refund.RefundStatus.REFUND_REQUESTED)
                            .reason(reason)
                            .refundReference("REF-" + UUID.randomUUID().toString().substring(0, 10).toUpperCase())
                            .build());
                    p.setPaymentStatus(Payment.PaymentStatus.REFUNDED);
                    paymentRepository.save(p);
                });

        notificationService.sendNotification(userId, "USER",
                "REFUND_INITIATED", "Your cancellation request has been received successfully.",
                "Refund Status: Refund Requested. Refunds generally take 3-7 working days depending on your payment provider.", "/bookings");
        auditService.record(userId, "USER", "BOOKING_CANCELLED", "BOOKING",
                String.valueOf(bookingId), "Cancellation reason: " + reason);

        return toResponse(booking);
    }

    @Transactional
    public BookingResponse markPaymentSuccessful(Long bookingId, Long userId) {
        Booking booking = bookingRepository.findByIdAndUserId(bookingId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Booking not found"));
        Payment payment = paymentRepository.findByBookingId(bookingId)
                .orElseThrow(() -> new ResourceNotFoundException("Payment not found"));
        booking.setBookingStatus(Booking.BookingStatus.CONFIRMED);
        booking.setTicketStatus(Booking.TicketStatus.ACTIVE);
        // Generate QR only now that payment is confirmed
        try {
            booking.setQrCodePath(qrCodeGenerator.generate(booking.getTicketId()));
        } catch (Exception ex) {
            log.warn("QR generation failed for ticket {}: {}", booking.getTicketId(), ex.getMessage());
        }
        payment.setPaymentStatus(Payment.PaymentStatus.SUCCESSFUL);
        payment.setGatewayReference("GW-" + UUID.randomUUID().toString().substring(0, 12).toUpperCase());
        paymentRepository.save(payment);
        notificationService.sendNotification(userId, "USER", "PAYMENT_SUCCESSFUL", "Payment successful",
                "Your payment is complete and ticket is confirmed.", "/bookings/" + bookingId);
        emailService.sendBookingConfirmation(booking.getUser().getEmail(), booking.getUser().getName(), booking, booking.getEvent());
        auditService.record(userId, "USER", "PAYMENT_SUCCESSFUL", "PAYMENT",
                String.valueOf(payment.getId()), "Payment completed for booking " + bookingId);
        return toResponse(bookingRepository.save(booking));
    }

    // ─── RELEASE EXPIRED RESERVATIONS (called by BookingScheduler) ───────

    /**
     * Runs every 60 seconds to release seat reservations for timed-out payments.
     *
     * Each expired booking is processed in its own REQUIRES_NEW transaction so:
     * - A deadlock on one booking does not roll back all others
     * - Lock duration is minimised (one row at a time)
     * - No SELECT FOR UPDATE on the events table (uses direct UPDATE instead)
     */
    @Transactional
    public void releaseExpiredPaymentReservations() {
        LocalDateTime cutoff = LocalDateTime.now().minusMinutes(10);
        List<Booking> expired = bookingRepository
                .findByBookingStatusAndBookedAtBefore(Booking.BookingStatus.PENDING, cutoff);
        for (Booking booking : expired) {
            try {
                bookingTransactionHelper.releaseOneExpiredBooking(booking.getId());
            } catch (Exception ex) {
                log.warn("[BookingService] Could not release expired booking {}: {}",
                        booking.getId(), ex.getMessage());
            }
        }
    }

    // ─── GET USER BOOKINGS ─────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PagedResponse<BookingResponse> getUserBookings(Long userId, int page, int size) {
        Pageable pageable = PageRequest.of(page, size, Sort.by("bookedAt").descending());
        Page<Booking> result = bookingRepository.findByUserId(userId, pageable);
        return PagedResponse.<BookingResponse>builder()
                .content(result.getContent().stream().map(this::toResponse).toList())
                .page(result.getNumber()).size(result.getSize())
                .totalElements(result.getTotalElements()).totalPages(result.getTotalPages())
                .first(result.isFirst()).last(result.isLast())
                .build();
    }

    // ─── GET BY ID ────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public BookingResponse getBookingById(Long bookingId, Long userId) {
        Booking booking = bookingRepository.findByIdAndUserId(bookingId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Booking not found"));
        return toResponse(booking);
    }

    // ─── GET BY TICKET ID ─────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public BookingResponse getByTicketId(String ticketId, Long userId) {
        Booking booking = bookingRepository.findByTicketId(ticketId)
                .orElseThrow(() -> new ResourceNotFoundException("Ticket not found: " + ticketId));
        if (!booking.getUser().getId().equals(userId))
            throw new UnauthorizedException("Unauthorized Access");
        return toResponse(booking);
    }

    // ─── HELPER ───────────────────────────────────────────────────────────

    public BookingResponse toResponse(Booking b) {
        Event e = b.getEvent();
        return BookingResponse.builder()
                .id(b.getId()).ticketId(b.getTicketId())
                .quantity(b.getQuantity()).totalAmount(b.getTotalAmount())
                .bookingStatus(b.getBookingStatus()).ticketStatus(b.getTicketStatus())
                .attendanceStatus(b.getAttendanceStatus()).checkInTime(b.getCheckInTime())
                .checkedInBy(b.getCheckedInBy()).certificateEligible(b.isCertificateEligible())
                .certificateId(certificateRepository.findByEventIdAndUserId(e.getId(), b.getUser().getId())
                        .map(c -> c.getCertificateId()).orElse(null))
                .certificateStatus(certificateRepository.findByEventIdAndUserId(e.getId(), b.getUser().getId())
                        .map(c -> c.getStatus().name()).orElse(null))
                .qrCodePath(b.getQrCodePath()).bookedAt(b.getBookedAt())
                .cancelledAt(b.getCancelledAt()).expiredAt(b.getExpiredAt())
                .cancellationReason(b.getCancellationReason())
                .actionable(b.getTicketStatus() == Booking.TicketStatus.ACTIVE
                        && b.getBookingStatus() != Booking.BookingStatus.CANCELLED
                        && b.getBookingStatus() != Booking.BookingStatus.EXPIRED)
                .participants(participantRepository.findByBookingId(b.getId()).stream()
                        .map(p -> BookingResponse.ParticipantInfo.builder()
                                .id(p.getId()).name(p.getName()).email(p.getEmail())
                                .department(p.getDepartment()).college(p.getCollege()).build())
                        .toList())
                .event(e != null ? BookingResponse.EventInfo.builder()
                        .id(e.getId()).eventName(e.getEventName())
                        .category(e.getCategory())
                        .status(e.getStatus() != null ? e.getStatus().name() : null)
                        .eventDate(e.getEventDate() != null ? e.getEventDate().toString() : null)
                        .eventTime(e.getEventTime() != null ? e.getEventTime().toString() : null)
                        .location(e.getLocation()).venueName(e.getVenueName())
                        .eventBanner(e.getEventBanner()).build() : null)
                .user(b.getUser() != null ? BookingResponse.UserInfo.builder()
                        .id(b.getUser().getId()).name(b.getUser().getName())
                        .email(b.getUser().getEmail()).build() : null)
                .build();
    }

    private List<BookingRequest.ParticipantRequest> normalizeParticipants(BookingRequest request, User user) {
        List<BookingRequest.ParticipantRequest> supplied = request.getParticipants() == null
                ? List.of()
                : request.getParticipants().stream()
                        .filter(p -> p.getEmail() != null && !p.getEmail().isBlank())
                        .toList();
        if (supplied.isEmpty()) {
            return List.of(BookingRequest.ParticipantRequest.builder()
                    .name(user.getName())
                    .email(user.getEmail())
                    .department(null)
                    .college(user.getOrganizationName())
                    .build());
        }
        if (supplied.size() != request.getQuantity()) {
            throw new BookingException("Participant count must match booking quantity");
        }
        return supplied;
    }

    private void validateParticipants(Long eventId, List<BookingRequest.ParticipantRequest> participants) {
        LinkedHashSet<String> emails = new LinkedHashSet<>();
        for (BookingRequest.ParticipantRequest p : participants) {
            String email = p.getEmail() == null ? "" : p.getEmail().trim().toLowerCase();
            if (email.isBlank()) {
                throw new BookingException("Participant email is required");
            }
            if (!emails.add(email)) {
                throw new DuplicateResourceException("Duplicate participant email in this booking: " + email);
            }
            if (participantRepository.existsByEventIdAndEmailIgnoreCase(eventId, email)) {
                throw new DuplicateResourceException("Participant already registered for this event: " + email);
            }
        }
    }

    private boolean isBookable(Event event) {
        if (event == null || event.getStatus() == null || event.getEventDate() == null) return false;
        if (event.getEventDate().isBefore(java.time.LocalDate.now())) return false;
        if (event.getRegistrationDeadline() != null
                && event.getRegistrationDeadline().isBefore(java.time.LocalDate.now())) return false;
        return event.getStatus() == Event.EventStatus.PUBLISHED
                || event.getStatus() == Event.EventStatus.UPCOMING
                || event.getStatus() == Event.EventStatus.LIVE
                || event.getStatus() == Event.EventStatus.ONGOING;
    }
}
