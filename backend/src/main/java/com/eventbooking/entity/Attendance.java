package com.eventbooking.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "attendance", indexes = {
        @Index(name = "idx_attendance_ticket", columnList = "ticket_id", unique = true)
})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Attendance {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "ticket_id", nullable = false, unique = true, length = 50)
    private String ticketId;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "booking_id", nullable = false)
    private Booking booking;

    @Column(name = "checked_in_at", nullable = false)
    private LocalDateTime checkedInAt;

    @Column(name = "scanned_by_organizer_id")
    private Long scannedByOrganizerId;

    @Enumerated(EnumType.STRING)
    @Column(name = "scan_method", length = 20)
    private ScanMethod scanMethod;

    public enum ScanMethod {
        CAMERA, BLUETOOTH, MANUAL
    }
}
