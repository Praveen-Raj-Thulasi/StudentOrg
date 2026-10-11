import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import organizerRoutes from './organizer.routes.js';
import eventRoutes from './event.routes.js';
import bookingRoutes from './booking.routes.js';
import attendanceRoutes from './attendance.routes.js';
import adminRoutes from './admin.routes.js';
import paymentRoutes from './payment.routes.js';
import certificateRoutes from './certificate.routes.js';
import notificationRoutes from './notification.routes.js';
import aiRoutes from './ai.routes.js';
import communityChatRoutes from './communityChat.routes.js';
import directMessageRoutes from './directMessage.routes.js';
import ratingRoutes from './rating.routes.js';
import recommendationRoutes from './recommendation.routes.js';
import gamificationRoutes from './gamification.routes.js';
import portfolioRoutes from './portfolio.routes.js';
import helpRoutes from './help.routes.js';
import networkingRoutes from './networking.routes.js';
import lookupRoutes from './lookup.routes.js';
import organizerAnalyticsRoutes from './organizerAnalytics.routes.js';
import roleRoutes from './role.routes.js';
import membershipRoutes from './membership.routes.js';
import treasurerRoutes from './treasurer.routes.js';
import volunteerRoutes from './volunteer.routes.js';
import financeRoutes from './finance.routes.js';
import merchandiseRoutes from './merchandise.routes.js';
import fundraisingRoutes from './fundraising.routes.js';
import organizationAnnouncementRoutes from './organizationAnnouncement.routes.js';

const apiRouter = Router();

// Roles & Organization Authorization (/api/roles/*)
apiRouter.use(roleRoutes);

// Membership & Association Dues (/api/memberships/*, /api/dues/*)
apiRouter.use(membershipRoutes);

// Treasurer Overview & Financial Reports (/api/treasurer/*)
apiRouter.use(treasurerRoutes);

// Volunteer Operations & Tasks (/api/volunteer/*)
apiRouter.use(volunteerRoutes);

// Finance & Operations (/api/finance/*)
apiRouter.use(financeRoutes);

// Merchandise & Concurrency-Safe Inventory (/api/merchandise/*)
apiRouter.use(merchandiseRoutes);

// Fundraising Campaigns & Verified Donations (/api/fundraising/*)
apiRouter.use(fundraisingRoutes);
apiRouter.use(organizationAnnouncementRoutes);

// 1. Health & Readiness probes
apiRouter.use(healthRoutes);

// 2. Authentication & Session endpoints (/api/auth/*)
apiRouter.use(authRoutes);

// 3. User profile & location endpoints (/api/user/*)
apiRouter.use(userRoutes);

// 4. Organizer profile & location endpoints (/api/organizer/*)
apiRouter.use(organizerRoutes);
apiRouter.use(organizerAnalyticsRoutes);

// 5. Events catalog, discovery & lifecycle endpoints (/api/events/*)
apiRouter.use(eventRoutes);

// 6. Ticket bookings & reservations (/api/bookings/*)
apiRouter.use(bookingRoutes);

// 7. Attendance check-in & scanner relay (/api/attendance/*)
apiRouter.use(attendanceRoutes);

// 8. Admin oversight & event approvals (/api/admin/*)
apiRouter.use(adminRoutes);

// 9. Payments, Razorpay orders, webhooks & refunds (/api/payments/*)
apiRouter.use(paymentRoutes);

// 10. Certificates generation, verification & downloads (/api/certificates/*)
apiRouter.use(certificateRoutes);

// 11. In-app notifications & SSE real-time stream (/api/notifications/*)
apiRouter.use(notificationRoutes);

// 12. AI Subsystem: EventGPT, Copilot, RAG, Agents & Insights (/api/ai/*)
apiRouter.use(aiRoutes);

// 13. Event Community Chat (/api/events/:eventId/community/*)
apiRouter.use(communityChatRoutes);

// 14. Direct Chat (/api/chat/*)
apiRouter.use(directMessageRoutes);

// 15. Ratings & Reviews (/api/ratings/*)
apiRouter.use(ratingRoutes);

// 16. Recommendations & Discover (/api/recommendations/*)
apiRouter.use(recommendationRoutes);

// 17. Gamification & Portfolio (/api/gamification/*, /api/portfolio/*)
apiRouter.use(gamificationRoutes);
apiRouter.use(portfolioRoutes);

// 18. Help Center & FAQs (/api/help/*)
apiRouter.use(helpRoutes);

// 19. Smart Networking (/api/networking/*)
apiRouter.use(networkingRoutes);

// 20. Public Code Lookup (/api/lookup/*)
apiRouter.use(lookupRoutes);

// Base /api status route
apiRouter.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'CollegeEvents API v2.0 (Node.js/Express Engine)',
    timestamp: new Date().toISOString(),
  });
});

export default apiRouter;
