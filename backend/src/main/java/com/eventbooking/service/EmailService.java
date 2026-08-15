package com.eventbooking.service;

import com.eventbooking.entity.Booking;
import com.eventbooking.entity.Event;
import com.eventbooking.entity.User;
import com.eventbooking.entity.mongo.EmailLog;
import com.eventbooking.repository.UserRepository;
import com.eventbooking.repository.mongo.EmailLogRepository;
import jakarta.annotation.PostConstruct;
import jakarta.mail.internet.MimeMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Optional;

/**
 * Sends HTML emails for OTP verification, password reset, and booking confirmation.
 *
 * Configuration required in application.yml:
 *   spring.mail.host, spring.mail.port, spring.mail.username, spring.mail.password
 *
 * For Gmail: use an App Password (Google Account → Security → App Passwords).
 */
@Service
@Slf4j
public class EmailService {

    /**
     * Required injection — will throw at startup if spring.mail.* is not configured.
     * Use @Autowired(required=false) only if you want silent dev mode.
     */
    @Autowired
    private JavaMailSender mailSender;

    @Autowired
    private UserRepository userRepository;

    @Autowired(required = false)
    private EmailLogRepository emailLogRepository;

    @Value("${app.frontend.url:http://localhost:3000}")
    private String frontendUrl;

    @Value("${spring.mail.username:NOT_CONFIGURED}")
    private String mailUsername;

    @Value("${spring.mail.password:}")
    private String mailPassword;

    @Value("${spring.mail.host:smtp.gmail.com}")
    private String mailHost;

    @Value("${spring.mail.port:587}")
    private int mailPort;

    /** Startup validation — confirms JavaMailSender is wired and logs SMTP config (no secrets). */
    @PostConstruct
    public void validateMailConfig() {
        // ── Safe diagnostics — NEVER log the actual password ──────────────────
        boolean usernamePresent = mailUsername != null
                && !mailUsername.isBlank()
                && !mailUsername.equals("NOT_CONFIGURED")
                && !mailUsername.contains("REPLACE_WITH");
        boolean passwordPresent = mailPassword != null && !mailPassword.isBlank();
        // Detect common mistake: App Password copied with spaces (Google shows "xxxx xxxx xxxx xxxx")
        boolean passwordHasSpaces = passwordPresent && mailPassword.contains(" ");
        // Detect CRLF contamination from Windows .env files (\r appended to value)
        boolean passwordHasCR = passwordPresent && mailPassword.contains("\r");
        int passwordLength = passwordPresent ? mailPassword.trim().replaceAll("\\s", "").length() : 0;

        log.info("──────────────────────────────────────────────────────");
        log.info("📧 SMTP Configuration Diagnostic");
        log.info("   Host     : {}", mailHost);
        log.info("   Port     : {}", mailPort);
        log.info("   Username : {}", usernamePresent ? mailUsername : "❌ NOT SET");
        log.info("   Password : {}", passwordPresent ? "[SET, length=" + passwordLength + "]" : "❌ NOT SET");
        if (passwordHasSpaces)
            log.warn("⚠️  MAIL_PASSWORD contains spaces — Google App Passwords must have spaces removed. " +
                     "Copy the 16-character password WITHOUT spaces from myaccount.google.com/apppasswords");
        if (passwordHasCR)
            log.warn("⚠️  MAIL_PASSWORD contains a carriage-return (\\r) character — likely caused by " +
                     "Windows CRLF line endings in your .env file. This will cause 535 auth failure. " +
                     "Save your .env file with LF (Unix) line endings.");
        if (passwordPresent && passwordLength != 16)
            log.warn("⚠️  MAIL_PASSWORD effective length is {} (expected 16 for a Google App Password). " +
                     "Verify you are using a Google App Password, not your regular Gmail password.", passwordLength);
        if (!usernamePresent)
            log.warn("⚠️  MAIL_USERNAME is not set. Emails will fail. Set MAIL_USERNAME=your@gmail.com in .env");
        if (!passwordPresent)
            log.warn("⚠️  MAIL_PASSWORD is not set. Emails will fail. Set MAIL_PASSWORD=<16-char App Password> in .env");
        // Warn if a Windows environment variable might be overriding the .env file value
        String winEnvPass = System.getenv("MAIL_PASSWORD");
        if (winEnvPass != null && !winEnvPass.isBlank()) {
            log.warn("⚠️  MAIL_PASSWORD is also set as a Windows/OS environment variable (length={}). " +
                     "OS environment variables take precedence over .env file — if SMTP auth fails after " +
                     "updating .env, also update the Windows User environment variable via: " +
                     "System Properties -> Environment Variables -> User variables -> MAIL_PASSWORD",
                     winEnvPass.replaceAll(".", "*").length());
        }
        log.info("──────────────────────────────────────────────────────");

        if (mailSender instanceof JavaMailSenderImpl impl) {
            log.info("✅ JavaMailSender initialized — SMTP {}:{}", impl.getHost(), impl.getPort());
        } else {
            log.info("✅ JavaMailSender initialized (custom implementation)");
        }
    }

    // ── OTP Verification ──────────────────────────────────────────────────

    public void sendOtpEmail(String to, String name, String otp) {
        log.info("📧 Sending OTP email to: {}", to);
        String html = """
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#f9f9f9">
              <div style="background:#1565C0;padding:20px;border-radius:8px 8px 0 0;text-align:center">
                <h1 style="color:white;margin:0">🎓 CollegeEvents</h1>
              </div>
              <div style="background:white;padding:32px;border-radius:0 0 8px 8px;text-align:center">
                <h2 style="color:#1565C0">Hi %s,</h2>
                <p style="color:#555">Use the OTP below to verify your account.<br>
                   It expires in <strong>10 minutes</strong>.</p>
                <div style="display:inline-block;background:#F0F4FF;border:2px dashed #1565C0;
                            padding:18px 40px;border-radius:12px;margin:20px 0">
                  <span style="font-size:36px;font-weight:900;letter-spacing:10px;color:#1565C0">%s</span>
                </div>
                <p style="color:#999;font-size:12px;margin-top:16px">
                  Never share this OTP. If you did not request this, please ignore this email.
                </p>
              </div>
            </div>
            """.formatted(name, otp);
        sendHtmlEmail(to, "Your Verification OTP – CollegeEvents", html);
    }

    // ── Email Verification ────────────────────────────────────────────────

    @Async
    public void sendVerificationEmail(String to, String name, String token, String role) {
        String link = frontendUrl + "/verify-email?token=" + token + "&role=" + role;
        String html = """
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#f9f9f9">
              <div style="background:#1565C0;padding:20px;border-radius:8px 8px 0 0;text-align:center">
                <h1 style="color:white;margin:0">🎓 CollegeEvents</h1>
              </div>
              <div style="background:white;padding:32px;border-radius:0 0 8px 8px">
                <h2>Hello %s!</h2>
                <p>Thank you for registering. Please verify your email address.</p>
                <a href="%s" style="display:inline-block;background:#1565C0;color:white;padding:14px 28px;
                   border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">
                  Verify Email Address
                </a>
                <p style="color:#666;font-size:13px">Link expires in 24 hours.</p>
              </div>
            </div>
            """.formatted(name, link);
        sendHtmlEmail(to, "Verify Your Email – CollegeEvents", html);
    }

    // ── Password Reset ────────────────────────────────────────────────────

    @Async
    public void sendPasswordResetEmail(String to, String name, String token) {
        String link = frontendUrl + "/reset-password?token=" + token;
        String html = """
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#f9f9f9">
              <div style="background:#1565C0;padding:20px;border-radius:8px 8px 0 0;text-align:center">
                <h1 style="color:white;margin:0">🎓 CollegeEvents</h1>
              </div>
              <div style="background:white;padding:32px;border-radius:0 0 8px 8px">
                <h2>Hi %s,</h2>
                <p>We received a request to reset your password.</p>
                <a href="%s" style="display:inline-block;background:#D32F2F;color:white;padding:14px 28px;
                   border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">
                  Reset Password
                </a>
                <p style="color:#666;font-size:13px">This link expires in 1 hour.</p>
              </div>
            </div>
            """.formatted(name, link);
        sendHtmlEmail(to, "Reset Your Password – CollegeEvents", html);
    }

    // ── Account Locked ────────────────────────────────────────────────────

    @Async
    public void sendAccountLockedEmail(String to, String name) {
        String html = """
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#f9f9f9">
              <div style="background:#D32F2F;padding:20px;border-radius:8px 8px 0 0;text-align:center">
                <h1 style="color:white;margin:0">🔒 Account Locked</h1>
              </div>
              <div style="background:white;padding:32px;border-radius:0 0 8px 8px">
                <h2>Hi %s,</h2>
                <p>Your account has been <strong>locked</strong> due to 5 consecutive failed login attempts.</p>
                <p>Use the password reset flow to regain access.</p>
              </div>
            </div>
            """.formatted(name);
        sendHtmlEmail(to, "Account Locked – CollegeEvents", html);
    }

    // ── Booking Confirmation ──────────────────────────────────────────────

    /**
     * Legacy overload — accepts JPA entities.
     * Do NOT call this from inside a @Transactional method; use sendBookingConfirmationDetached instead.
     */
    @Async
    public void sendBookingConfirmation(String to, String name, Booking booking, Event event) {
        sendBookingConfirmationDetached(to, name,
                booking.getTicketId(), booking.getQuantity(), booking.getTotalAmount().doubleValue(),
                event.getEventName(),
                event.getEventDate() != null ? event.getEventDate().toString() : "",
                event.getEventTime() != null ? event.getEventTime().toString() : "",
                event.getVenueName() != null ? event.getVenueName() : (event.getLocation() != null ? event.getLocation() : ""));
    }

    /**
     * Safe async overload — accepts only plain strings so no JPA entity is held
     * across thread boundaries, preventing Hibernate session corruption.
     * Always use this when called from inside a @Transactional method.
     */
    @Async
    public void sendBookingConfirmationDetached(String to, String name,
                                                String ticketId, int quantity, double totalAmount,
                                                String eventName, String eventDate,
                                                String eventTime, String venue) {
        String html = """
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#f9f9f9">
              <div style="background:#1565C0;padding:20px;border-radius:8px 8px 0 0;text-align:center">
                <h1 style="color:white;margin:0">🎫 Booking Confirmed!</h1>
              </div>
              <div style="background:white;padding:32px;border-radius:0 0 8px 8px">
                <h2>Hello %s!</h2>
                <div style="background:#f0f4ff;padding:20px;border-radius:8px;margin:16px 0">
                  <p><strong>Event:</strong> %s</p>
                  <p><strong>Date:</strong> %s at %s</p>
                  <p><strong>Venue:</strong> %s</p>
                  <p><strong>Ticket ID:</strong>
                    <code style="background:#1565C0;color:white;padding:4px 8px;border-radius:4px">%s</code>
                  </p>
                  <p><strong>Tickets:</strong> %d</p>
                  <p><strong>Total:</strong> ₹%.2f</p>
                </div>
              </div>
            </div>
            """.formatted(name, eventName, eventDate, eventTime, venue, ticketId, quantity, totalAmount);
        sendHtmlEmail(to, "Booking Confirmed – " + eventName, html);
    }

    // ── Internal ──────────────────────────────────────────────────────────

    @Async
    public void sendNewEventNotification(Event event) {
        Optional<EmailLogRepository> emailLogs = Optional.ofNullable(emailLogRepository);
        if (emailLogs.isEmpty()) {
            log.warn("MongoDB is disabled or unavailable; email delivery will continue without EmailLog persistence");
        }
        for (User user : userRepository.findAll()) {
            EmailLog logEntry = EmailLog.builder()
                    .to(user.getEmail())
                    .subject("New College Event Available")
                    .status("QUEUED")
                    .eventId(event.getId())
                    .createdAt(LocalDateTime.now())
                    .build();
            if (emailLogs.isPresent()) {
                logEntry = emailLogs.get().save(logEntry);
            }
            try {
                String link = frontendUrl + "/events/" + event.getId();
                String html = """
                    <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px;background:#f9f9f9">
                      <div style="background:#1565C0;padding:20px;border-radius:8px 8px 0 0;text-align:center">
                        <h1 style="color:white;margin:0">New College Event Available</h1>
                      </div>
                      <div style="background:white;padding:28px;border-radius:0 0 8px 8px">
                        <h2 style="color:#1565C0">%s</h2>
                        <p><strong>Date:</strong> %s</p>
                        <p><strong>Time:</strong> %s</p>
                        <p><strong>Venue:</strong> %s</p>
                        <p><strong>Category:</strong> %s</p>
                        <p style="color:#555">%s</p>
                        <a href="%s" style="display:inline-block;background:#1565C0;color:white;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Register Now</a>
                      </div>
                    </div>
                    """.formatted(
                        event.getEventName(),
                        event.getEventDate(),
                        event.getEventTime(),
                        event.getVenueName() != null ? event.getVenueName() : event.getLocation(),
                        event.getCategory(),
                        event.getDescription() != null ? event.getDescription() : "",
                        link);
                sendHtmlEmail(user.getEmail(), "New College Event Available", html);
                logEntry.setStatus("SENT");
                logEntry.setSentAt(LocalDateTime.now());
            } catch (Exception ex) {
                logEntry.setStatus("FAILED");
                logEntry.setErrorMessage(ex.getMessage());
                logEntry.setAttempts(logEntry.getAttempts() + 1);
            }
            if (emailLogs.isPresent()) {
                emailLogs.get().save(logEntry);
            }
        }
    }

    /**
     * Send a plain-text email (used by certificate notifications, AI recommendations, etc.).
     */
    @Async
    public void sendSimpleEmail(String to, String subject, String text) {
        String html = "<div style='font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px'>" +
                text.replace("\n", "<br/>") + "</div>";
        sendHtmlEmail(to, subject, html);
    }

    private void sendHtmlEmail(String to, String subject, String html) {
        if (mailUsername == null || mailUsername.isBlank() || mailUsername.equals("NOT_CONFIGURED")) {
            String msg = "MAIL_USERNAME is not configured — cannot send email to " + to;
            log.error("❌ {}", msg);
            throw new RuntimeException(msg);
        }
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(html, true);
            helper.setFrom(mailUsername);
            mailSender.send(message);
            log.info("✅ Email sent to {}: {}", to, subject);
        } catch (org.springframework.mail.MailAuthenticationException authEx) {
            // 535 / authentication failure — safe log, no password exposed
            log.error("❌ SMTP authentication failed for {} — " +
                      "verify MAIL_PASSWORD is a valid Google App Password (not your Gmail password). " +
                      "Generate one at myaccount.google.com/apppasswords. SMTP error: {}",
                      to, authEx.getMessage());
            throw new RuntimeException("SMTP authentication failed. Check MAIL_PASSWORD in .env.", authEx);
        } catch (org.springframework.mail.MailSendException sendEx) {
            log.error("❌ SMTP send failed to {}: {}", to, sendEx.getMessage());
            throw new RuntimeException("Email delivery failed (SMTP send error): " + sendEx.getMessage(), sendEx);
        } catch (Exception ex) {
            log.error("❌ Email delivery FAILED to {}: {} — cause: {}",
                    to, subject, ex.getMessage());
            throw new RuntimeException("Email delivery failed: " + ex.getMessage(), ex);
        }
    }
}
