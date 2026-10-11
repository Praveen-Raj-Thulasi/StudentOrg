import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import {
  Booking, Budget, Event, Expense, FundraisingCampaign, FundraisingContribution,
  Membership, MembershipDues, Notification, Organizer, Product,
  Reimbursement, User, VolunteerTask,
} from '../src/models/index.js';

const ensure = async (Model, filter, values) => {
  let record = await Model.findOne(filter);
  if (!record) record = await Model.create(values);
  return record;
};

async function seedDemoData() {
  await mongoose.connect(env.MONGODB_URI);
  try {
    const [student, volunteer, treasurer, president, organizer] = await Promise.all([
      User.findOne({ email: 'student@skyline.edu' }),
      User.findOne({ email: 'volunteer@skyline.edu' }),
      User.findOne({ email: 'treasurer@skyline.edu' }),
      User.findOne({ email: 'president@skyline.edu' }),
      Organizer.findOne({ email: 'organizer@skyline.edu' }),
    ]);
    if (![student, volunteer, treasurer, president, organizer].every(Boolean)) {
      throw new Error('Demo portal accounts are missing. Run the existing seed_mock_accounts.js script first.');
    }

    const eventSpecs = [
      ['[DEMO] Campus Innovation Fair', 'Technology', 'IN_PERSON', 0, 180, 42],
      ['[DEMO] Student Leadership Workshop', 'Education', 'IN_PERSON', 150, 80, 24],
      ['[DEMO] Cultural Night', 'Cultural', 'IN_PERSON', 250, 320, 67],
    ];
    const events = [];
    for (let index = 0; index < eventSpecs.length; index += 1) {
      const [eventName, category, eventType, ticketPrice, totalSeats, volunteerCapacity] = eventSpecs[index];
      events.push(await ensure(Event, { eventName }, {
        organizerId: organizer.id, organizer: organizer._id, eventName,
        description: 'Sample event record for demonstrating event discovery, booking, and volunteer workflows.',
        category, eventType, eventDate: new Date(Date.now() + (index + 3) * 86400000),
        eventTime: '10:00', venueName: 'Skyline College Auditorium', location: 'Chennai',
        ticketPrice, memberTicketPrice: Math.max(0, ticketPrice - 50), totalSeats,
        availableSeats: totalSeats - 18, volunteerCapacity, status: 'PUBLISHED', visibility: 'PUBLIC',
        isFeatured: index === 0, tags: ['demo', 'campus'], collegeName: 'Skyline College',
      }));
    }

    for (const [index, event] of events.entries()) {
      await ensure(Booking, { ticketId: `DEMO-TKT-${index + 1}` }, {
        ticketId: `DEMO-TKT-${index + 1}`, userId: student.id, user: student._id,
        eventId: event.id, event: event._id, quantity: 1, totalAmount: event.ticketPrice,
        ticketUnitPrice: event.ticketPrice, bookingStatus: 'CONFIRMED', ticketStatus: 'ACTIVE',
        attendanceStatus: 'NOT_ATTENDED', participants: [{ name: student.name, email: student.email }],
      });
      await ensure(VolunteerTask, { title: `[DEMO] ${['Prepare welcome desk', 'Guide event attendees', 'Pack volunteer kits'][index]}`, volunteerId: volunteer.id }, {
        title: `[DEMO] ${['Prepare welcome desk', 'Guide event attendees', 'Pack volunteer kits'][index]}`,
        description: 'Sample volunteer assignment linked to a published campus event.', eventId: event.id,
        event: event._id, volunteerId: volunteer.id, volunteer: volunteer._id,
        assignedBy: president.id, status: ['PENDING', 'IN_PROGRESS', 'COMPLETED'][index],
        priority: ['HIGH', 'MEDIUM', 'LOW'][index], dueDate: event.eventDate,
        ...(index === 2 ? { completedAt: new Date(), completionNotes: 'Demo completion record', pointsAwarded: 25, verifiedBy: president.id, verifiedAt: new Date() } : {}),
      });
    }

    const activeMembership = await ensure(Membership, { userId: student.id, memberNumber: student.memberNumber }, {
      userId: student.id, user: student._id, memberNumber: student.memberNumber,
      status: 'ACTIVE', department: 'Computer Science', yearOfStudy: '2',
      statement: 'Demo active student membership', activatedAt: new Date(),
      validUntil: new Date(Date.now() + 180 * 86400000),
    });
    await ensure(MembershipDues, { userId: student.id, academicTerm: '2026-2027' }, {
      membershipId: activeMembership.id, membership: activeMembership._id, userId: student.id, user: student._id,
      title: 'Annual Student Association Membership Dues', academicTerm: '2026-2027', amount: 500,
      dueDate: new Date(Date.now() + 30 * 86400000), status: 'PENDING', assessedBy: treasurer.id,
    });

    for (const [category, allocatedAmount] of [['SUPPLIES', 25000], ['MARKETING', 18000], ['REFRESHMENTS', 12000], ['EQUIPMENT', 40000]]) {
      await ensure(Budget, { academicTerm: '2026-2027', category }, {
        academicTerm: '2026-2027', category, allocatedAmount, description: `Demo ${category.toLowerCase()} allocation`, createdBy: treasurer.id,
      });
    }

    const campaign = await ensure(FundraisingCampaign, { title: '[DEMO] Campus Access Fund' }, {
      title: '[DEMO] Campus Access Fund', description: 'Demo fundraising campaign supporting accessible student events.',
      targetAmount: 100000, currency: 'INR', startDate: new Date(), endDate: new Date(Date.now() + 45 * 86400000),
      status: 'ACTIVE', ownerId: president.id, category: 'STUDENT_SUPPORT',
    });
    await ensure(FundraisingContribution, { transactionId: 'DEMO-DONATION-001' }, {
      campaignId: campaign.id, donorUserId: student.id, donorName: student.name, donorEmail: student.email,
      amount: 2500, currency: 'INR', status: 'SUCCESSFUL', transactionId: 'DEMO-DONATION-001',
      receiptNumber: 'DEMO-REC-001', message: 'Demo contribution',
    });

    await ensure(Product, { sku: 'DEMO-CAMPUS-TEE-M' }, {
      sku: 'DEMO-CAMPUS-TEE-M', name: 'Campus Spirit T-shirt', description: 'Demo merchandise item',
      category: 'APPAREL', size: 'M', price: 450, stockQuantity: 32, reservedQuantity: 0, isActive: true,
    });

    const demoClaims = [
      { description: '[DEMO] Event welcome desk supplies', amount: 680, status: 'SUBMITTED' },
      { description: '[DEMO] Attendee wayfinding materials', amount: 420, status: 'APPROVED', reviewerId: treasurer.id, reviewedAt: new Date() },
      { description: '[DEMO] Volunteer travel to venue', amount: 350, status: 'PAID', reviewerId: treasurer.id, reviewedAt: new Date(), paymentStatus: 'PAID', paidAt: new Date(), paidBy: treasurer.id, paymentReference: 'DEMO-UPI-001' },
    ];
    for (const claim of demoClaims) {
      await ensure(Reimbursement, { claimantId: volunteer.id, description: claim.description }, {
        claimantId: volunteer.id, category: claim.amount === 350 ? 'TRAVEL' : 'SUPPLIES',
        academicTerm: '2026-2027', amount: claim.amount, currency: 'INR', ...claim,
        paymentStatus: claim.paymentStatus || 'UNPAID',
      });
    }
    for (const [reference, title, category, amount, approvalStatus, paymentStatus] of [
      ['DEMO-EXP-001', 'Demo event print materials', 'MARKETING', 3200, 'APPROVED', 'PAID'],
      ['DEMO-EXP-002', 'Demo venue equipment rental', 'EQUIPMENT', 8400, 'PENDING', 'UNPAID'],
    ]) {
      await ensure(Expense, { reference }, {
        reference, title, payee: 'Skyline Demo Services', description: 'Sample expense for treasury dashboard preview.',
        category, academicTerm: '2026-2027', amount, currency: 'INR', createdBy: president.id,
        approvedBy: approvalStatus === 'APPROVED' ? treasurer.id : null,
        approvedAt: approvalStatus === 'APPROVED' ? new Date() : null,
        approvalStatus, paymentStatus,
        paidAt: paymentStatus === 'PAID' ? new Date() : null,
        paymentReference: paymentStatus === 'PAID' ? 'DEMO-EXP-PAY-001' : null,
        paidBy: paymentStatus === 'PAID' ? treasurer.id : null,
      });
    }
    await ensure(Notification, { recipientId: student.id, title: '[DEMO] New campus events are live' }, {
      recipientId: student.id, recipientType: 'USER', notificationType: 'EVENT_UPDATE',
      title: '[DEMO] New campus events are live', message: 'Explore the Innovation Fair, Leadership Workshop, and Cultural Night.',
      actionUrl: '/events', read: false,
    });
    await ensure(Notification, { recipientId: volunteer.id, title: '[DEMO] Volunteer assignment ready' }, {
      recipientId: volunteer.id, recipientType: 'USER', notificationType: 'VOLUNTEER_TASK',
      title: '[DEMO] Volunteer assignment ready', message: 'Your sample event tasks are available in the volunteer portal.',
      actionUrl: '/volunteer', read: false,
    });

    console.log('Demo data is ready across student, organizer, volunteer, president, and treasurer portals. Re-running this script does not duplicate its records.');
  } finally {
    await mongoose.disconnect();
  }
}

seedDemoData().catch((error) => {
  console.error(`Demo data seeding failed: ${error.message}`);
  process.exitCode = 1;
});
