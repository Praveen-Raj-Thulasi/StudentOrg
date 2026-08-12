package com.eventbooking.dto.response;

import com.eventbooking.entity.Booking;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class BookingResponse {
    private Long id;
    private String ticketId;
    private int quantity;
    private BigDecimal totalAmount;
    private Booking.BookingStatus bookingStatus;
    private Booking.TicketStatus ticketStatus;
    private Booking.AttendanceStatus attendanceStatus;
    private LocalDateTime checkInTime;
    private Long checkedInBy;
    private boolean certificateEligible;
    private String certificateId;
    private String certificateStatus;
    private String qrCodePath;
    private LocalDateTime bookedAt;
    private LocalDateTime cancelledAt;
    private LocalDateTime expiredAt;
    private String cancellationReason;
    private boolean actionable;
    @Builder.Default
    private List<ParticipantInfo> participants = new ArrayList<>();
    private EventInfo event;
    private UserInfo user;

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class EventInfo {
        private Long id;
        private String eventName;
        private String category;
        private String status;
        private String eventDate;
        private String eventTime;
        private String location;
        private String venueName;
        private String eventBanner;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class UserInfo {
        private Long id;
        private String name;
        private String email;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class ParticipantInfo {
        private Long id;
        private String name;
        private String email;
        private String department;
        private String college;
    }
}
