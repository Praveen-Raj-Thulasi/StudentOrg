package com.eventbooking.controller;

import com.eventbooking.dto.request.*;
import com.eventbooking.dto.response.ApiResponse;
import com.eventbooking.dto.response.AuthResponse;
import com.eventbooking.entity.Organizer;
import com.eventbooking.entity.User;
import com.eventbooking.repository.OrganizerRepository;
import com.eventbooking.repository.UserRepository;
import com.eventbooking.security.JwtTokenProvider;
import com.eventbooking.security.OtpStore;
import com.eventbooking.security.RefreshTokenStore;
import com.eventbooking.service.AuthService;
import com.eventbooking.service.EmailService;
import io.jsonwebtoken.Claims;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
@Slf4j
public class AuthController {

    private final AuthService         authService;
    private final JwtTokenProvider    jwtTokenProvider;
    private final RefreshTokenStore   refreshTokenStore;
    private final OtpStore            otpStore;
    private final EmailService        emailService;
    private final UserRepository      userRepository;
    private final OrganizerRepository organizerRepository;
    private final com.eventbooking.security.RateLimiterService rateLimiterService;
    private final org.springframework.core.env.Environment env;

    @Value("${spring.mail.username:NOT_CONFIGURED}")
    private String mailUsername;

    // ── User ──────────────────────────────────────────────────────────────

    @PostMapping("/user/register")
    public ResponseEntity<ApiResponse<AuthResponse>> registerUser(
            @Valid @RequestBody UserRegisterRequest request) {
        AuthResponse auth = authService.registerUser(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Registration successful! Please verify your email.", auth));
    }

    @PostMapping("/user/login")
    public ResponseEntity<ApiResponse<AuthResponse>> loginUser(
            @Valid @RequestBody LoginRequest request,
            jakarta.servlet.http.HttpServletRequest httpRequest) {
        String ip = httpRequest.getRemoteAddr();
        if (!rateLimiterService.isAllowed("login:" + ip, 10, 60_000)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(ApiResponse.error("Too many login attempts. Please try again in a minute."));
        }
        return ResponseEntity.ok(ApiResponse.success("Login successful", authService.loginUser(request)));
    }

    // ── Organizer ─────────────────────────────────────────────────────────

    @PostMapping("/organizer/register")
    public ResponseEntity<ApiResponse<AuthResponse>> registerOrganizer(
            @Valid @RequestBody OrganizerRegisterRequest request) {
        AuthResponse auth = authService.registerOrganizer(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Organizer registration successful! Please verify your email.", auth));
    }

    @PostMapping("/organizer/login")
    public ResponseEntity<ApiResponse<AuthResponse>> loginOrganizer(
            @Valid @RequestBody LoginRequest request,
            jakarta.servlet.http.HttpServletRequest httpRequest) {
        String ip = httpRequest.getRemoteAddr();
        if (!rateLimiterService.isAllowed("login:" + ip, 10, 60_000)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(ApiResponse.error("Too many login attempts. Please try again in a minute."));
        }
        return ResponseEntity.ok(ApiResponse.success("Login successful", authService.loginOrganizer(request)));
    }

    // ── Email Verification ─────────────────────────────────────────────────

    @GetMapping("/verify-email")
    public ResponseEntity<ApiResponse<Void>> verifyEmail(
            @RequestParam String token,
            @RequestParam String role) {
        authService.verifyEmail(token, role);
        return ResponseEntity.ok(ApiResponse.success("Email verified successfully!", null));
    }

    // ── Password Recovery ──────────────────────────────────────────────────

    @PostMapping("/forgot-password")
    public ResponseEntity<ApiResponse<Void>> forgotPassword(
            @Valid @RequestBody ForgotPasswordRequest request) {
        authService.forgotPassword(request);
        return ResponseEntity.ok(ApiResponse.success("Password reset link sent to your email.", null));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<ApiResponse<Void>> resetPassword(
            @Valid @RequestBody ResetPasswordRequest request) {
        authService.resetPassword(request);
        return ResponseEntity.ok(ApiResponse.success("Password reset successfully.", null));
    }

    @PostMapping("/reset-password/otp")
    public ResponseEntity<ApiResponse<Void>> resetPasswordWithOtp(
            @RequestBody Map<String, String> body) {
        String email = body.get("email");
        String role = body.getOrDefault("role", "USER");
        String otp = body.get("otp");
        String newPassword = body.get("newPassword");

        if (email == null || email.isBlank() || otp == null || otp.isBlank()
                || newPassword == null || newPassword.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("email, otp and newPassword are required"));
        }

        authService.resetPasswordWithOtp(email, role, otp, newPassword);
        return ResponseEntity.ok(ApiResponse.success("Password reset successfully.", null));
    }

    // ── Session Status ─────────────────────────────────────────────────────

    /**
     * GET /auth/session-status
     *
     * Lightweight endpoint the frontend polls (or hits on tab focus) to confirm
     * the session is still valid. Returns the current token's expiry time so
     * the UI can schedule the auto-logout timer precisely.
     *
     * Response codes:
     *   200 — session active, body contains expiresAt (epoch ms) and remainingMs
     *   401 — TOKEN_EXPIRED (handled by JwtAuthenticationFilter before this runs)
     */
    @GetMapping("/session-status")
    public ResponseEntity<ApiResponse<Map<String, Object>>> sessionStatus(
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.error("No token provided"));
        }
        String token = authHeader.substring(7);
        try {
            long expiryMs   = jwtTokenProvider.extractClaims(token).getExpiration().getTime();
            long remainingMs = Math.max(0, expiryMs - System.currentTimeMillis());
            String role      = jwtTokenProvider.extractRole(token);
            Long   id        = jwtTokenProvider.extractId(token);

            return ResponseEntity.ok(ApiResponse.success("Session active", Map.of(
                    "active",      true,
                    "expiresAt",   expiryMs,
                    "remainingMs", remainingMs,
                    "expiresIn",   jwtTokenProvider.getExpirationMs(),
                    "role",        role,
                    "userId",      id
            )));
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.error("TOKEN_EXPIRED"));
        }
    }

    // ── Token Refresh ──────────────────────────────────────────────────────

    @PostMapping("/refresh-token")
    public ResponseEntity<ApiResponse<AuthResponse>> refreshToken(
            @Valid @RequestBody RefreshTokenRequest request) {
        if (!jwtTokenProvider.validateToken(request.refreshToken()))
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.error("Invalid or expired refresh token"));

        Claims claims = jwtTokenProvider.extractClaims(request.refreshToken());
        String jti = claims.getId();
        if (jti == null || refreshTokenStore.isUsed(jti))
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.error("TOKEN_ALREADY_USED"));

        refreshTokenStore.markUsed(jti);

        Long   id    = claims.get("id", Long.class);
        String email = claims.getSubject();
        String role  = claims.get("role", String.class);

        AuthResponse authResponse = AuthResponse.builder()
                .accessToken(jwtTokenProvider.generateToken(id, email, role))
                .refreshToken(jwtTokenProvider.generateRefreshToken(id, email, role))
                .tokenType("Bearer")
                .expiresIn(jwtTokenProvider.getExpirationMs())
                .expiresAt(System.currentTimeMillis() + jwtTokenProvider.getExpirationMs())
                .build();

        return ResponseEntity.ok(ApiResponse.success("Token refreshed successfully", authResponse));
    }

    // ── OTP: Send ──────────────────────────────────────────────────────────

    @PostMapping("/otp/send")
    public ResponseEntity<ApiResponse<Map<String, Object>>> sendOtp(
            @RequestBody Map<String, String> body,
            jakarta.servlet.http.HttpServletRequest httpRequest) {
        String email = body.get("email");
        String role = body.getOrDefault("role", "USER");

        if (email == null || email.isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Email is required"));
        }

        // ── Rate limits checked BEFORE generating/storing OTP ─────────────
        // Rate limit: 1 request per 60 seconds per email
        if (!rateLimiterService.isAllowed("otp_email:" + email.toLowerCase(), 1, 60_000)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(ApiResponse.error("Please wait 60 seconds before requesting another OTP."));
        }

        // Rate limit: 10 requests per hour per IP
        String ip = httpRequest.getRemoteAddr();
        if (!rateLimiterService.isAllowed("otp_ip:" + ip, 10, 3600_000)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(ApiResponse.error("Too many OTP requests from this IP. Please try again later."));
        }

        // ── Already has a valid pending OTP (from a successful prior delivery) ──
        if (otpStore.hasPending(email)) {
            return ResponseEntity.ok(ApiResponse.success("An OTP is already pending. Please check your inbox.",
                    Map.of("emailSent", false, "pending", true)));
        }

        // ── Generate and store OTP ─────────────────────────────────────────
        String otp = otpStore.generate(email);
        log.info("[OTP] Generated for email={}", email);

        // ── Resolve display name ───────────────────────────────────────────
        String name = body.getOrDefault("name", "User");
        try {
            if ("ORGANIZER".equalsIgnoreCase(role)) {
                Organizer org = organizerRepository.findByEmail(email).orElse(null);
                if (org != null) name = org.getOrganizerName();
            } else {
                User user = userRepository.findByEmail(email).orElse(null);
                if (user != null) name = user.getName();
            }
        } catch (Exception ignored) {}

        // ── Attempt email delivery ─────────────────────────────────────────
        try {
            emailService.sendOtpEmail(email, name, otp);
            log.info("[OTP] Email delivered successfully to {}", email);
            return ResponseEntity.ok(ApiResponse.success("OTP sent to " + email,
                    Map.of("emailSent", true)));
        } catch (Exception emailEx) {
            // Email failed — INVALIDATE the stored OTP so the user can retry immediately
            // without hitting the "OTP already pending" guard which would return a false 200
            otpStore.invalidate(email);

            // Log root cause safely — never log the SMTP password
            Throwable root = emailEx;
            while (root.getCause() != null) root = root.getCause();
            log.error("[OTP] Email delivery FAILED for {} — SMTP error: {} — {}",
                    email, root.getClass().getSimpleName(), root.getMessage());

            String hint = buildSmtpHint(emailEx.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(ApiResponse.error(hint));
        }
    }

    private String buildSmtpHint(String msg) {
        if (msg == null) msg = "";
        if (msg.contains("535") || msg.contains("Username and Password not accepted") || msg.contains("BadCredentials"))
            return "Gmail authentication failed. Your App Password is invalid or expired. " +
                   "Go to myaccount.google.com/apppasswords, generate a NEW App Password, " +
                   "and update spring.mail.password in application-local.yml.";
        if (msg.contains("534") || msg.contains("less secure") || msg.contains("application-specific"))
            return "Gmail requires an App Password (2-Step Verification must be ON). " +
                   "Generate one at myaccount.google.com/apppasswords.";
        if (msg.contains("Connection refused") || msg.contains("timeout"))
            return "SMTP connection failed — check your network/firewall. Gmail SMTP: smtp.gmail.com:587.";
        return "Could not send OTP email. Configure MAIL_USERNAME and MAIL_PASSWORD " +
               "(Gmail App Password) and try again. Check backend logs for the exact SMTP error.";
    }

    // OTP: Verify ────────────────────────────────────────────────────────

    @PostMapping("/otp/verify")
    public ResponseEntity<ApiResponse<Map<String, Boolean>>> verifyOtp(
            @RequestBody Map<String, String> body) {
        String email = body.get("email");
        String otp   = body.get("otp");

        if (email == null || otp == null)
            return ResponseEntity.badRequest().body(ApiResponse.error("email and otp are required"));

        log.info("🔍 [OTP] Verify attempt for email={}", email);
        boolean valid = otpStore.verify(email, otp);

        if (!valid) {
            log.warn("❌ [OTP] Verification FAILED for email={} (wrong, expired, or too many attempts)", email);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(ApiResponse.error("Invalid or expired OTP. Please request a new one."));
        }

        log.info("✅ [OTP] Verified successfully for email={}", email);
        authService.markEmailVerifiedByOtp(email, body.getOrDefault("role", "USER"));
        return ResponseEntity.ok(ApiResponse.success("Email verified successfully",
                Map.of("verified", true, "emailVerified", true)));
    }

    // ── Test Email (dev only) ─────────────────────────────────────────────
    @GetMapping("/test-email")
    public ResponseEntity<ApiResponse<Map<String, Object>>> testEmail(
            @RequestParam(defaultValue = "") String to) {
        if (!java.util.Arrays.asList(env.getActiveProfiles()).contains("dev")) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(ApiResponse.error("Access denied: Test email is disabled in this profile."));
        }

        String target = to.isBlank() ? mailUsername : to;

        if (target.isBlank() || target.equals("NOT_CONFIGURED")) {
            return ResponseEntity.badRequest().body(ApiResponse.error(
                    "No email address configured. " +
                    "Set MAIL_USERNAME env var or pass ?to=youraddress@gmail.com"));
        }

        log.info("📧 [TEST] Sending test email to: {}", target);
        try {
            emailService.sendOtpEmail(target, "Test User", "123456");
            log.info("✅ [TEST] Test email delivered to {}", target);
            return ResponseEntity.ok(ApiResponse.success(
                    "Test email sent successfully to " + target,
                    Map.of("recipient", target, "status", "delivered")));
        } catch (Exception ex) {
            log.error("❌ [TEST] Test email FAILED to {}: {}", target, ex.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(ApiResponse.error(
                    "Email delivery failed: " + ex.getMessage() +
                    " — check application.yml SMTP settings and ensure Gmail App Password is set."));
        }
    }
}
