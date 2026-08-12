package com.eventbooking.mapper;

import com.eventbooking.dto.response.BookingResponse;
import com.eventbooking.entity.Booking;
import com.eventbooking.repository.CertificateRepository;
import com.eventbooking.repository.ParticipantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Maps between Booking entity and BookingResponse DTO.
 */
@Component
@RequiredArgsConstructor
public class BookingMapper {

    private final ParticipantRepository participantRepository;
    private final CertificateRepository certificateRepository;

    public BookingResponse toResponse(Booking b) {
        if (b == null) return null;
        var event = b.getEvent();
        return BookingResponse.builder()
                .id(b.getId())
                .ticketId(b.getTicketId())
                .quantity(b.getQuantity())
                .totalAmount(b.getTotalAmount())
                .bookingStatus(b.getBookingStatus())
                .ticketStatus(b.getTicketStatus())
                .attendanceStatus(b.getAttendanceStatus())
                .checkInTime(b.getCheckInTime())
                .checkedInBy(b.getCheckedInBy())
                .certificateEligible(b.isCertificateEligible())
                .certificateId(event != null && b.getUser() != null
                        ? certificateRepository.findByEventIdAndUserId(event.getId(), b.getUser().getId()).map(c -> c.getCertificateId()).orElse(null)
                        : null)
                .certificateStatus(event != null && b.getUser() != null
                        ? certificateRepository.findByEventIdAndUserId(event.getId(), b.getUser().getId()).map(c -> c.getStatus().name()).orElse(null)
                        : null)
                .qrCodePath(b.getQrCodePath())
                .bookedAt(b.getBookedAt())
                .cancelledAt(b.getCancelledAt())
                .expiredAt(b.getExpiredAt())
                .cancellationReason(b.getCancellationReason())
                .actionable(b.getTicketStatus() == com.eventbooking.entity.Booking.TicketStatus.ACTIVE
                        && b.getBookingStatus() != com.eventbooking.entity.Booking.BookingStatus.CANCELLED
                        && b.getBookingStatus() != com.eventbooking.entity.Booking.BookingStatus.EXPIRED)
                .participants(participantRepository.findByBookingId(b.getId()).stream()
                        .map(p -> BookingResponse.ParticipantInfo.builder()
                                .id(p.getId())
                                .name(p.getName())
                                .email(p.getEmail())
                                .department(p.getDepartment())
                                .college(p.getCollege())
                                .build())
                        .toList())
                .event(event != null ? BookingResponse.EventInfo.builder()
                        .id(event.getId())
                        .eventName(event.getEventName())
                        .category(event.getCategory())
                        .status(event.getStatus() != null ? event.getStatus().name() : null)
                        .eventDate(event.getEventDate() != null ? event.getEventDate().toString() : null)
                        .eventTime(event.getEventTime() != null ? event.getEventTime().toString() : null)
                        .location(event.getLocation())
                        .venueName(event.getVenueName())
                        .eventBanner(event.getEventBanner())
                        .build() : null)
                .user(b.getUser() != null ? BookingResponse.UserInfo.builder()
                        .id(b.getUser().getId())
                        .name(b.getUser().getName())
                        .email(b.getUser().getEmail())
                        .build() : null)
                .build();
    }
}
