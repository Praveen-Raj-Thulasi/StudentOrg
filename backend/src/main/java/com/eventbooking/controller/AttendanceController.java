package com.eventbooking.controller;

import com.eventbooking.dto.request.AttendanceScanRequest;
import com.eventbooking.dto.response.ApiResponse;
import com.eventbooking.dto.response.AttendanceResponse;
import com.eventbooking.dto.response.AttendanceStatsResponse;
import com.eventbooking.entity.Attendance;
import com.eventbooking.entity.Booking;
import com.eventbooking.entity.Participant;
import com.eventbooking.entity.Payment;
import com.eventbooking.exception.BookingException;
import com.eventbooking.exception.ResourceNotFoundException;
import com.eventbooking.repository.AttendanceRepository;
import com.eventbooking.repository.BookingRepository;
import com.eventbooking.security.AuthPrincipal;
import com.eventbooking.service.AuditService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/attendance")
@RequiredArgsConstructor
public class AttendanceController {
    private final AttendanceRepository attendanceRepository;
    private final BookingRepository bookingRepository;
    private final AuditService auditService;
    private final SimpMessagingTemplate messagingTemplate;

    @PostMapping("/scan")
    @PreAuthorize("hasRole('ORGANIZER')")
    @Transactional
    public ResponseEntity<ApiResponse<AttendanceResponse>> scan(
            @Valid @RequestBody AttendanceScanRequest request,
            @AuthenticationPrincipal AuthPrincipal principal) {
        Booking booking = bookingRepository.findByTicketId(request.getTicketId().trim())
                .orElseThrow(() -> new ResourceNotFoundException("Invalid ticket."));
        validateScan(booking, request.getEventId(), principal.getId());

        if (booking.getAttendanceStatus() == Booking.AttendanceStatus.PRESENT
                || attendanceRepository.findByTicketId(booking.getTicketId()).isPresent()) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(ApiResponse.success("Attendance already recorded.", toResponse(booking, "Attendance already recorded.")));
        }

        Attendance saved = markPresent(booking, principal.getId(), request.getScanMethod());

        auditService.record(principal.getId(), "ORGANIZER", "TICKET_CHECK_IN", "ATTENDANCE",
                String.valueOf(saved.getId()), "Ticket " + booking.getTicketId() + " checked in");
        return ResponseEntity.ok(ApiResponse.success("Attendance recorded successfully.", toResponse(booking, "Attendance recorded successfully.")));
    }

    @PatchMapping("/events/{eventId}/bookings/{bookingId}/present")
    @PreAuthorize("hasRole('ORGANIZER')")
    @Transactional
    public ResponseEntity<ApiResponse<AttendanceResponse>> markPresentManually(
            @PathVariable Long eventId,
            @PathVariable Long bookingId,
            @AuthenticationPrincipal AuthPrincipal principal) {
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new ResourceNotFoundException("Booking not found"));
        validateScan(booking, eventId, principal.getId());
        if (booking.getAttendanceStatus() == Booking.AttendanceStatus.PRESENT
                || attendanceRepository.findByTicketId(booking.getTicketId()).isPresent()) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(ApiResponse.success("Attendance already recorded.", toResponse(booking, "Attendance already recorded.")));
        }
        markPresent(booking, principal.getId());
        auditService.record(principal.getId(), "ORGANIZER", "MANUAL_CHECK_IN", "ATTENDANCE",
                String.valueOf(booking.getId()), "Booking " + booking.getId() + " marked present manually");
        return ResponseEntity.ok(ApiResponse.success("Participant marked present. Feedback and certificate are now enabled.",
                toResponse(booking, "Participant marked present.")));
    }

    @PostMapping("/scan/{ticketId}")
    @PreAuthorize("hasRole('ORGANIZER')")
    @Transactional
    public ResponseEntity<ApiResponse<AttendanceResponse>> scanLegacy(
            @PathVariable String ticketId,
            @RequestParam Long eventId,
            @AuthenticationPrincipal AuthPrincipal principal) {
        return scan(AttendanceScanRequest.builder().eventId(eventId).ticketId(ticketId).build(), principal);
    }

    @GetMapping("/events/{eventId}")
    @PreAuthorize("hasRole('ORGANIZER')")
    @Transactional(readOnly = true)
    public ApiResponse<List<AttendanceResponse>> eventAttendance(
            @PathVariable Long eventId,
            @AuthenticationPrincipal AuthPrincipal principal) {
        List<Booking> bookings = bookingRepository.findConfirmedByEventIdAndOrganizerId(eventId, principal.getId());
        return ApiResponse.success(bookings.stream().map(b -> toResponse(b, null)).toList());
    }

    @GetMapping("/events/{eventId}/stats")
    @PreAuthorize("hasRole('ORGANIZER')")
    @Transactional(readOnly = true)
    public ApiResponse<AttendanceStatsResponse> stats(
            @PathVariable Long eventId,
            @AuthenticationPrincipal AuthPrincipal principal) {
        List<Booking> bookings = bookingRepository.findConfirmedByEventIdAndOrganizerId(eventId, principal.getId());
        long registered = bookings.size();
        long present = bookings.stream().filter(b -> b.getAttendanceStatus() == Booking.AttendanceStatus.PRESENT).count();
        long absent = Math.max(registered - present, 0);
        double percentage = registered == 0 ? 0.0 : Math.round((present * 10000.0 / registered)) / 100.0;
        return ApiResponse.success(AttendanceStatsResponse.builder()
                .registeredParticipants(registered)
                .checkedInParticipants(present)
                .absentParticipants(absent)
                .attendancePercentage(percentage)
                .liveAttendanceCount(present)
                .build());
    }

    @GetMapping("/bookings/{bookingId}")
    @PreAuthorize("hasRole('USER')")
    @Transactional(readOnly = true)
    public ApiResponse<AttendanceResponse> bookingAttendance(
            @PathVariable Long bookingId,
            @AuthenticationPrincipal AuthPrincipal principal) {
        Booking booking = bookingRepository.findByIdAndUserId(bookingId, principal.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Booking not found"));
        return ApiResponse.success(toResponse(booking, null));
    }

    private void validateScan(Booking booking, Long eventId, Long organizerId) {
        // Cross-event check: ticket must belong to the scanned event
        if (!booking.getEvent().getId().equals(eventId))
            throw new BookingException("Invalid ticket.");
        // Organizer ownership check: only the event's organizer can scan
        if (!booking.getEvent().getOrganizer().getId().equals(organizerId))
            throw new BookingException("Invalid ticket.");
        // Booking must be confirmed
        if (booking.getBookingStatus() != Booking.BookingStatus.CONFIRMED)
            throw new BookingException("Invalid ticket.");
        // Ticket must be ACTIVE or EXPIRED (scheduler expires after event completes,
        // but organizer may scan during/just after the event before the scheduler runs)
        if (booking.getTicketStatus() == Booking.TicketStatus.CANCELLED)
            throw new BookingException("Invalid ticket.");
        // Payment check: paid events require a successful payment;
        // free events (ticketPrice == 0) are always valid once confirmed
        boolean isFreeEvent = booking.getEvent().getTicketPrice() == null
                || booking.getEvent().getTicketPrice().compareTo(java.math.BigDecimal.ZERO) == 0;
        if (!isFreeEvent) {
            boolean paid = booking.getPayments().stream()
                    .anyMatch(p -> p.getPaymentStatus() == Payment.PaymentStatus.SUCCESSFUL);
            if (!paid) throw new BookingException("Invalid ticket.");
        }
    }

    private Attendance markPresent(Booking booking, Long organizerId) {
        return markPresent(booking, organizerId, null);
    }

    private Attendance markPresent(Booking booking, Long organizerId, String scanMethodStr) {
        LocalDateTime now = LocalDateTime.now();
        Attendance.ScanMethod method = Attendance.ScanMethod.MANUAL;
        if (scanMethodStr != null) {
            try { method = Attendance.ScanMethod.valueOf(scanMethodStr.toUpperCase()); } catch (Exception ignored) {}
        }
        Attendance attendance = Attendance.builder()
                .ticketId(booking.getTicketId())
                .booking(booking)
                .checkedInAt(now)
                .scannedByOrganizerId(organizerId)
                .scanMethod(method)
                .build();
        Attendance saved = attendanceRepository.save(attendance);

        booking.setAttendanceStatus(Booking.AttendanceStatus.PRESENT);
        booking.setCheckInTime(now);
        booking.setCheckedInBy(organizerId);
        booking.setCertificateEligible(true);
        booking.setTicketStatus(Booking.TicketStatus.EXPIRED);
        booking.setExpiredAt(now);
        bookingRepository.save(booking);
        return saved;
    }

    private AttendanceResponse toResponse(Booking booking, String message) {
        Participant participant = booking.getParticipants().isEmpty() ? null : booking.getParticipants().get(0);
        return AttendanceResponse.builder()
                .bookingId(booking.getId())
                .ticketId(booking.getTicketId())
                .eventId(booking.getEvent().getId())
                .eventName(booking.getEvent().getEventName())
                .userId(booking.getUser().getId())
                .participantName(participant != null ? participant.getName() : booking.getUser().getName())
                .participantEmail(participant != null ? participant.getEmail() : booking.getUser().getEmail())
                .attendanceStatus(booking.getAttendanceStatus())
                .checkInTime(booking.getCheckInTime())
                .checkedInBy(booking.getCheckedInBy())
                .certificateEligible(booking.isCertificateEligible())
                .message(message)
                .build();
    }

    // ── External Scanner Relay ──────────────────────────────────────────────
    /**
     * A mobile device / external barcode scanner POSTs a scanned ticket ID here.
     * The server relays it via WebSocket to the organizer's browser tab that is
     * subscribed to /topic/scanner-relay/{eventId}/{sessionId}.
     * The organizer's browser then calls the normal scan endpoint automatically.
     *
     * POST /api/attendance/relay/{eventId}/{sessionId}
     * Body: { "ticketId": "EVT-...", "device": "Naveetha's iPhone" }
     */
    @PostMapping("/relay/{eventId}/{sessionId}")
    @PreAuthorize("hasRole('ORGANIZER')")
    public ResponseEntity<ApiResponse<Void>> relay(
            @PathVariable Long eventId,
            @PathVariable String sessionId,
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal AuthPrincipal principal) {
        String ticketId = body == null ? null : body.get("ticketId");
        if (ticketId == null || ticketId.isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("ticketId is required"));
        }
        messagingTemplate.convertAndSend(
                "/topic/scanner-relay/" + eventId + "/" + sessionId,
                Map.of("ticketId", ticketId.trim(),
                       "device",   body.getOrDefault("device", "External Scanner"),
                       "eventId",  eventId));
        return ResponseEntity.ok(ApiResponse.success(null));
    }
}
