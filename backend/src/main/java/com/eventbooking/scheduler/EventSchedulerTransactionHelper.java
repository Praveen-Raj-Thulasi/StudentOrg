package com.eventbooking.scheduler;

import com.eventbooking.entity.ApprovalRequest;
import com.eventbooking.entity.Event;
import com.eventbooking.notification.NotificationService;
import com.eventbooking.repository.ApprovalRequestRepository;
import com.eventbooking.repository.BookingRepository;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.service.CertificateService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.retry.annotation.Backoff;
import org.springframework.retry.annotation.Retryable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Holds transactional operations for {@link EventScheduler}.
 *
 * <p>These methods were extracted from EventScheduler because Spring AOP
 * cannot intercept self-invocations within the same class.  Calling
 * {@code this.publishOneApproval()} from another method in EventScheduler
 * bypasses the proxy, so {@code @Transactional} is silently ignored,
 * causing Hibernate sessions to close prematurely and triggering
 * {@code LazyInitializationException} on lazy-loaded associations
 * (e.g. {@code Event.organizer}).
 *
 * <p>By placing the transactional methods in a separate Spring bean,
 * calls go through the proxy and transactions are correctly managed.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class EventSchedulerTransactionHelper {

    private final ApprovalRequestRepository approvalRequestRepository;
    private final EventRepository           eventRepository;
    private final NotificationService       notificationService;
    private final CertificateService        certificateService;
    private final BookingRepository         bookingRepository;

    // ── Publish one approval ──────────────────────────────────────────────

    @Retryable(retryFor = CannotAcquireLockException.class,
               maxAttempts = 3,
               backoff = @Backoff(delay = 200, multiplier = 2))
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void publishOneApproval(Long approvalId) {
        ApprovalRequest approval = approvalRequestRepository
                .findByIdWithEventAndOrganizer(approvalId)
                .orElse(null);
        if (approval == null) {
            log.warn("[EventScheduler] Approval {} not found — skipping", approvalId);
            return;
        }
        log.debug("[EventScheduler] Publishing approval {} for event {}",
                approvalId, approval.getEvent().getId());
        publishEvent(approval.getEvent(), approval);
    }

    // ── Publish one stuck event ───────────────────────────────────────────

    @Retryable(retryFor = CannotAcquireLockException.class,
               maxAttempts = 3,
               backoff = @Backoff(delay = 200, multiplier = 2))
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void publishOneStuckEvent(Long eventId) {
        Event event = eventRepository.findByIdWithOrganizer(eventId).orElse(null);
        if (event == null) {
            log.warn("[EventScheduler] Event {} not found — skipping stuck-event pass", eventId);
            return;
        }
        // Already handled by Pass 1 or a concurrent scheduler run — nothing to do
        if (event.getStatus() == Event.EventStatus.PUBLISHED
                || event.getStatus() == Event.EventStatus.LIVE
                || event.getStatus() == Event.EventStatus.COMPLETED
                || event.getStatus() == Event.EventStatus.EXPIRED) {
            log.debug("[EventScheduler] Event {} already in terminal/published state ({}), skipping Pass2",
                    eventId, event.getStatus());
            return;
        }

        publishEvent(event, null);

        approvalRequestRepository
                .findFirstByEventIdOrderByRequestedAtDesc(eventId)
                .filter(a -> a.getStatus() == ApprovalRequest.ApprovalStatus.PENDING)
                .ifPresent(a -> {
                    a.setStatus(ApprovalRequest.ApprovalStatus.APPROVED);
                    a.setReviewNote("Auto-approved (safety net)");
                    approvalRequestRepository.save(a);
                });
    }

    // ── Lifecycle transitions ─────────────────────────────────────────────

    @Retryable(retryFor = CannotAcquireLockException.class,
               maxAttempts = 3,
               backoff = @Backoff(delay = 200, multiplier = 2))
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean transitionToLive(Long eventId, LocalDate today) {
        Event e = eventRepository.findById(eventId).orElse(null);
        if (e == null) {
            log.warn("[EventScheduler] Event {} not found — skipping LIVE transition", eventId);
            return false;
        }
        boolean ended = e.getEndDate() != null && e.getEndDate().isBefore(today);
        if (ended) return false;
        e.setStatus(Event.EventStatus.LIVE);
        e.setLiveAt(LocalDateTime.now());
        eventRepository.save(e);
        log.debug("[EventScheduler] Event {} transitioned to LIVE", eventId);
        return true;
    }

    @Retryable(retryFor = CannotAcquireLockException.class,
               maxAttempts = 3,
               backoff = @Backoff(delay = 200, multiplier = 2))
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean transitionToCompleted(Long eventId, LocalDate today) {
        Event e = eventRepository.findByIdWithOrganizer(eventId).orElse(null);
        if (e == null) {
            log.warn("[EventScheduler] Event {} not found — skipping COMPLETED transition", eventId);
            return false;
        }
        e.setStatus(Event.EventStatus.COMPLETED);
        e.setCompletedAt(LocalDateTime.now());
        if (e.getCertificateDeadline() == null) e.setCertificateDeadline(today.plusDays(7));
        eventRepository.save(e);

        // Mark all unscanned confirmed tickets expired after the event ends so they no longer show as live.
        try {
            int expired = bookingRepository.expireActiveTicketsForEvent(
                    eventId,
                    com.eventbooking.entity.Booking.BookingStatus.CONFIRMED,
                    com.eventbooking.entity.Booking.TicketStatus.ACTIVE,
                    com.eventbooking.entity.Booking.TicketStatus.EXPIRED,
                    LocalDateTime.now());
            if (expired > 0) log.debug("[EventScheduler] Expired {} active ticket(s) for event {}", expired, eventId);
        } catch (Exception ex) {
            log.warn("[EventScheduler] Could not expire tickets for event {}: {}", eventId, ex.getMessage());
        }
        notificationService.sendNotification(e.getOrganizer().getId(), "ORGANIZER", "EVENT_COMPLETED",
                "Event Completed",
                "Your event \"" + e.getEventName() + "\" has ended. Generate certificates from your dashboard.",
                "/organizer/events");
        try { certificateService.generateCertificatesForEvent(e.getId()); }
        catch (Exception ce) { log.warn("[Lifecycle] Cert gen failed for event {}: {}", eventId, ce.getMessage()); }
        log.debug("[EventScheduler] Event {} transitioned to COMPLETED", eventId);
        return true;
    }

    @Retryable(retryFor = CannotAcquireLockException.class,
               maxAttempts = 3,
               backoff = @Backoff(delay = 200, multiplier = 2))
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean transitionToExpired(Long eventId) {
        Event e = eventRepository.findById(eventId).orElse(null);
        if (e == null) {
            log.warn("[EventScheduler] Event {} not found — skipping EXPIRED transition", eventId);
            return false;
        }
        e.setStatus(Event.EventStatus.EXPIRED);
        e.setExpiredAt(LocalDateTime.now());
        eventRepository.save(e);
        try {
            bookingRepository.expireActiveTicketsForEvent(
                    eventId,
                    com.eventbooking.entity.Booking.BookingStatus.CONFIRMED,
                    com.eventbooking.entity.Booking.TicketStatus.ACTIVE,
                    com.eventbooking.entity.Booking.TicketStatus.EXPIRED,
                    LocalDateTime.now());
        } catch (Exception ex) {
            log.warn("[EventScheduler] Could not expire tickets for expired event {}: {}", eventId, ex.getMessage());
        }
        log.debug("[EventScheduler] Event {} transitioned to EXPIRED", eventId);
        return true;
    }

    // ── Internal helper ───────────────────────────────────────────────────

    /**
     * Publishes an event and optionally marks its approval as APPROVED.
     * Must be called within an active transaction where both {@code event}
     * and {@code event.organizer} are already initialized (via JOIN FETCH).
     */
    private void publishEvent(Event event, ApprovalRequest approval) {
        if (event.getStatus() == Event.EventStatus.PUBLISHED
                || event.getStatus() == Event.EventStatus.LIVE
                || event.getStatus() == Event.EventStatus.COMPLETED) return;

        // Determine correct initial published status
        LocalDate today = LocalDate.now();
        Event.EventStatus newStatus;
        if (event.getEventDate() != null && !event.getEventDate().isAfter(today)) {
            boolean endedAlready = event.getEndDate() != null && event.getEndDate().isBefore(today);
            newStatus = endedAlready ? Event.EventStatus.COMPLETED : Event.EventStatus.LIVE;
        } else {
            newStatus = Event.EventStatus.PUBLISHED;
        }

        event.setStatus(newStatus);
        if (newStatus == Event.EventStatus.COMPLETED) {
            event.setCompletedAt(LocalDateTime.now());
            if (event.getCertificateDeadline() == null) {
                event.setCertificateDeadline(today.plusDays(7));
            }
        }
        eventRepository.save(event);

        if (approval != null) {
            approval.setStatus(ApprovalRequest.ApprovalStatus.APPROVED);
            approval.setReviewNote("Auto-approved and published after 10-minute review window");
            approvalRequestRepository.save(approval);
        }

        // Organizer is eagerly fetched — safe to dereference
        notificationService.sendNotification(
                event.getOrganizer().getId(), "ORGANIZER", "EVENT_APPROVED",
                "Event Approved & Published",
                "Your event \"" + event.getEventName() + "\" has been approved and is now live!",
                "/organizer/events"
        );
        log.info("[EventScheduler] Published event {} as {}", event.getId(), newStatus);
    }
}
