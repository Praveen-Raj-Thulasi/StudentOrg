package com.eventbooking.security;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory OTP store with 10-minute TTL.
 * Generates a 6-digit numeric OTP, stores it per email, and evicts expired entries hourly.
 */
@Component
@Slf4j
public class OtpStore {

    private static final long OTP_TTL_MS = 10 * 60 * 1000L; // 10 minutes
    private static final int  OTP_LENGTH = 6;

    private record Entry(String otp, long expiresAt, int attempts) {}

    private final Map<String, Entry> store    = new ConcurrentHashMap<>();
    private final SecureRandom       random   = new SecureRandom();

    /** Generate, store, and return a new OTP for the given email. */
    public String generate(String email) {
        String otp = String.format("%0" + OTP_LENGTH + "d",
                random.nextInt((int) Math.pow(10, OTP_LENGTH)));
        store.put(email.toLowerCase(), new Entry(otp, System.currentTimeMillis() + OTP_TTL_MS, 0));
        log.debug("OTP generated for {}", email);
        return otp;
    }

    /**
     * Verify OTP. Returns true if correct and not expired.
     * Increments attempt counter; invalidates after 5 wrong attempts.
     */
    public boolean verify(String email, String otp) {
        String key = email.toLowerCase();
        Entry entry = store.get(key);
        if (entry == null) return false;
        if (System.currentTimeMillis() > entry.expiresAt()) { store.remove(key); return false; }
        if (entry.attempts() >= 5) { store.remove(key); return false; }

        if (entry.otp().equals(otp)) {
            store.remove(key);
            return true;
        }
        store.put(key, new Entry(entry.otp(), entry.expiresAt(), entry.attempts() + 1));
        return false;
    }

    /** Whether a pending (unexpired) OTP exists for this email. */
    public boolean hasPending(String email) {
        Entry entry = store.get(email.toLowerCase());
        return entry != null && System.currentTimeMillis() <= entry.expiresAt();
    }

    /**
     * Invalidate any stored OTP for this email.
     * Call this when email delivery fails so the user can request a fresh OTP immediately
     * without hitting the "OTP already pending" guard on retry.
     */
    public void invalidate(String email) {
        store.remove(email.toLowerCase());
        log.debug("OTP invalidated for {} due to delivery failure", email);
    }

    @Scheduled(fixedRate = 3_600_000)
    public void evictExpired() {
        long now = System.currentTimeMillis();
        store.entrySet().removeIf(e -> now > e.getValue().expiresAt());
        log.debug("OTP store eviction complete; remaining: {}", store.size());
    }
}
