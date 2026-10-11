import { useState } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { motion } from 'framer-motion';
import { eventsAPI, bookingsAPI, paymentsAPI, membershipAPI, getApiErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/common/Spinner';
import QueryError from '../components/common/QueryError';
import { toast } from 'react-toastify';
import { QRCodeSVG } from 'qrcode.react';
import RatingsPanel from '../components/common/RatingsPanel';
import EventCard from '../components/common/EventCard';
import EventCommunityChat from '../components/common/EventCommunityChat';
import { FiCalendar, FiMapPin, FiUsers, FiMinus, FiPlus, FiShare2, FiExternalLink, FiClock, FiPhone, FiMail, FiMessageCircle, FiCheckCircle, FiLock } from 'react-icons/fi';
import { MdSchool } from 'react-icons/md';
import { format } from 'date-fns';
import TravelDashboard from '../components/common/TravelDashboard';

const CAT_LABELS = { HACKATHON:'🚀 Hackathon',WORKSHOP:'🔧 Workshop',TECHNICAL_SYMPOSIUM:'⚡ Symposium',
  CODING_COMPETITION:'💻 Coding Comp',SEMINAR:'📋 Seminar',PROJECT_EXHIBITION:'🏆 Exhibition',
  PLACEMENT_PREP:'💼 Placement Prep',TECHNICAL_TRAINING:'📚 Training',CULTURAL:'🎭 Cultural',SPORTS:'⚽ Sports' };

const POSTER_MAP = {
  HACKATHON:           '/event-posters/hackathon.svg',
  TECHNICAL_SYMPOSIUM: '/event-posters/technical-symposium.svg',
  CODING_COMPETITION:  '/event-posters/coding-contest.svg',
  WORKSHOP:            '/event-posters/workshop.svg',
  SEMINAR:             '/event-posters/college-event.svg',
  PROJECT_EXHIBITION:  '/event-posters/iot-expo.svg',
  PLACEMENT_PREP:      '/event-posters/career-fair.svg',
  TECHNICAL_TRAINING:  '/event-posters/devops.svg',
  CULTURAL:            '/event-posters/cultural-fest.svg',
  SPORTS:              '/event-posters/sports-meet.svg',
  INTER_COLLEGE:       '/event-posters/technical-symposium.svg',
  INTRA_COLLEGE:       '/event-posters/college-event.svg',
  CLUB_ACTIVITY:       '/event-posters/entrepreneurship.svg',
  OTHER:               '/event-posters/college-event.svg',
};

export default function EventDetail() {
  const { id }       = useParams();
  const [searchParams] = useSearchParams();
  const { user }     = useAuth();
  const navigate     = useNavigate();
  const qc           = useQueryClient();
  const [qty, setQty] = useState(1);
  const [bannerError, setBannerError] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState('');
  const [assistantAnswer, setAssistantAnswer] = useState('');
  const initialTab = ['details', 'travel', 'community'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'details';
  const [activeTab, setActiveTab] = useState(initialTab);
  const emptyParticipant = { name:'', email:'', department:'', college:'' };
  const [participants, setParticipants] = useState([emptyParticipant]);

  const { data, isLoading, isError, error, refetch } = useQuery(['event', id], () => eventsAPI.getById(id).then(r => r.data?.data));
  const { data: relatedData } = useQuery(
    ['related-events', id, data?.category, data?.location],
    () => eventsAPI.search({ category: data.category, location: data.location, size: 4 }).then(r => r.data?.data),
    { enabled: !!data?.category, staleTime: 60_000 }
  );
  const { data: membershipData } = useQuery(
    ['my-membership', user?.id],
    () => membershipAPI.getMy().then((response) => response.data?.data),
    { enabled: Boolean(user && ['USER', 'STUDENT'].includes(String(user.role).toUpperCase())), staleTime: 60_000 }
  );

  // Check if logged-in user has a confirmed booking for this event
  const { data: myBookingsData } = useQuery(
    ['my-bookings-for-event', id, user?.id],
    () => bookingsAPI.myBookings({ page: 0, size: 50 }).then(r => r.data?.data),
    { enabled: !!user && user.role === 'USER', staleTime: 30_000 }
  );
  const hasConfirmedBooking = myBookingsData?.content?.some(
    b => String(b.event?.id) === String(id) && b.bookingStatus === 'CONFIRMED'
  ) ?? false;
  const isOrganizer = user?.role === 'ORGANIZER';
  const isAdmin = user?.role === 'ADMIN';
  // Organizer can always access chat for events they own; admin can access all; users need a booking
  const canAccessChat = isAdmin || hasConfirmedBooking ||
    (isOrganizer && data?.organizer?.id != null && String(data?.organizer?.id) === String(user?.id));

  const aiMutation = useMutation(
    (question) => eventsAPI.eventQa(id, question).then(r => r.data?.data),
    {
      onSuccess: (res) => setAssistantAnswer(res?.answer || 'No event-specific answer is available yet.'),
      onError: () => setAssistantAnswer('I could not answer that from the stored event details right now.'),
    }
  );

  const bookMutation = useMutation(
    () => bookingsAPI.book({
      eventId: Number(id),
      quantity: qty,
      participants,
    }).then(r => r.data),
    {
      onSuccess: async (res) => {
        const booking = res.data;
        qc.invalidateQueries(['event', id]);
        qc.invalidateQueries('events');
        qc.invalidateQueries('dash-bookings');
        qc.invalidateQueries('my-bookings');
        qc.invalidateQueries(['my-bookings-for-event', id, user?.id]);
        qc.invalidateQueries('notifs');
        if (!booking?.id) {
          toast.error('Booking was created, but checkout could not be opened.');
          navigate('/bookings');
          return;
        }

        if (!booking.totalAmount || Number(booking.totalAmount) === 0) {
          try {
            await paymentsAPI.createRazorpayOrder(booking.id);
            toast.success(`Free booking confirmed! Ticket: ${booking.ticketId}`);
            navigate(`/bookings/${booking.id}`);
          } catch (err) {
            toast.error(getApiErrorMessage(err, 'Could not confirm free booking.'));
            navigate(`/checkout/${booking.id}`);
          }
          return;
        }

        toast.success('Seats reserved. Complete payment to confirm your ticket.');
        navigate(`/checkout/${booking.id}`);
      },
      onError: (err) => {
        toast.error(getApiErrorMessage(err, 'Could not reserve tickets. Please try again.'));
      },
    }
  );

  if (isLoading) return <Spinner full />;
  if (isError) return (
    <div className="max-w-lg mx-auto py-20 px-4">
      <QueryError message={error?.response?.data?.message} onRetry={refetch} />
    </div>
  );
  if (!data) return (
    <div className="text-center py-20 text-blue-900">
      <div className="text-5xl mb-4">😕</div>
      <h2 className="text-2xl font-bold">Event not found</h2>
      <Link to="/events" className="btn-primary inline-block mt-4">Browse Events</Link>
    </div>
  );

  const ev       = data;
  const hasActiveMembership = membershipData?.status === 'ACTIVE';
  const ticketUnitPrice = hasActiveMembership && ev.memberTicketPrice != null
    ? Number(ev.memberTicketPrice)
    : Number(ev.ticketPrice || 0);
  const isFree   = ticketUnitPrice === 0;
  const total    = ticketUnitPrice * qty;
  const registrationDeadline = ev.registrationDeadline ? new Date(`${ev.registrationDeadline}T23:59:59`) : null;
  const canBook  = ev.availableSeats > 0
    && ['PUBLISHED', 'UPCOMING', 'LIVE', 'ONGOING'].includes(ev.status)
    && (!registrationDeadline || new Date() <= registrationDeadline);
  const catLabel = CAT_LABELS[ev.category] || '📅 Event';
  const computedStatus = getLiveStatus(ev);
  const relatedEvents = (relatedData?.content || []).filter(item => item.id !== ev.id).slice(0, 3);
  const eventUrl = window.location.href;

  return (
    <div style={{ background:'#F0F4FF', minHeight:'100vh' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid lg:grid-cols-3 gap-10">

          {/* Left */}
          <div className="lg:col-span-2 space-y-7">
            {/* Banner */}
            <div className="rounded-3xl overflow-hidden h-72 md:h-96 shadow-card" style={{
              background: {
                HACKATHON:'linear-gradient(135deg,#1e3a5f,#0f766e)',
                WORKSHOP:'linear-gradient(135deg,#78350f,#92400e)',
                SEMINAR:'linear-gradient(135deg,#1e3a5f,#1e40af)',
                CULTURAL:'linear-gradient(135deg,#86198f,#a21caf)',
                SPORTS:'linear-gradient(135deg,#14532d,#15803d)',
                CODING_COMPETITION:'linear-gradient(135deg,#064e3b,#065f46)',
                TECHNICAL_SYMPOSIUM:'linear-gradient(135deg,#312e81,#1e40af)',
              }[ev.category] || 'linear-gradient(135deg,#1e293b,#334155)'
            }}>
              {ev.eventBanner && !bannerError
                ? <img src={ev.eventBanner} alt={ev.eventName} onError={() => setBannerError(true)} className="w-full h-full object-cover" />
                : <img src={POSTER_MAP[ev.category] || '/event-posters/college-event.svg'} alt={ev.eventName} className="w-full h-full object-cover" />}
            </div>

            {/* Title */}
            <div>
              <div className="flex flex-wrap gap-2 mb-3">
                <span className="badge badge-blue">{catLabel}</span>
                {ev.hasCertificate && <span className="badge badge-yellow">🏅 Certificate</span>}
              </div>
              <h1 className="text-3xl font-extrabold text-blue-900 mb-5" style={{ fontFamily:'Space Grotesk,sans-serif' }}>
                {ev.eventName}
              </h1>

              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { icon:<FiCalendar className="text-blue-500" />, label:ev.eventDate ? format(new Date(ev.eventDate), 'EEEE, MMMM d yyyy') : '—' },
                  { icon:<FiClock className="text-blue-500" />,    label:ev.eventTime || '—' },
                  { icon:<FiMapPin className="text-red-400" />,    label:[ev.venueName,ev.location].filter(Boolean).join(', ') || '—' },
                  { icon:<FiUsers className="text-blue-500" />,    label:`${ev.availableSeats} / ${ev.totalSeats} seats available` },
                  ev.collegeName && { icon:<MdSchool className="text-blue-400" />, label:ev.collegeName },
                  ev.departmentName && { icon:<MdSchool className="text-indigo-400" />, label:ev.departmentName },
                ].filter(Boolean).map((item,i) => (
                  <div key={i} className="flex items-start gap-3 bg-white rounded-2xl px-4 py-3 border border-blue-100">
                    <span className="mt-0.5 text-lg">{item.icon}</span>
                    <span className="text-sm text-gray-700">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 rounded-2xl border border-blue-100 bg-white p-2 shadow-card">
              {[
                ['details', 'Event Details'],
                ['travel', '🗺️ Travel'],
                ['community', 'Community Chat'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`flex-1 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${activeTab === key ? 'bg-blue-600 text-white' : 'text-blue-800 hover:bg-blue-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {activeTab === 'travel' ? (
              <TravelDashboard ev={ev} canAccessDetails={canAccessChat} user={user} id={id} />
            ) : activeTab === 'community' ? (
              canAccessChat ? (
                <EventCommunityChat eventId={ev.id} event={ev} organizer={ev.organizer} />
              ) : (
                <div className="rounded-2xl border border-blue-100 bg-white p-10 text-center shadow-card">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
                    <FiLock className="h-8 w-8 text-blue-400" />
                  </div>
                  <h3 className="text-lg font-bold text-blue-900 mb-2">Community Chat</h3>
                  <p className="text-sm text-slate-500 mb-5 max-w-xs mx-auto">
                    {!user
                      ? 'Sign in and register for this event to join the community discussion.'
                      : 'Register for this event to join the community discussion.'}
                  </p>
                  {!user ? (
                    <Link to={`/login?redirect=/events/${id}`} className="btn-primary inline-flex items-center gap-2">
                      Sign In to Register
                    </Link>
                  ) : canBook ? (
                    <button
                      onClick={() => setActiveTab('details')}
                      className="btn-primary inline-flex items-center gap-2"
                    >
                      Register for This Event
                    </button>
                  ) : (
                    <p className="text-xs text-slate-400">Registration is currently closed for this event.</p>
                  )}
                </div>
              )
            ) : (
              <>
            {/* Description */}
            {ev.description && (
              <div className="bg-white rounded-2xl p-6 border border-blue-100 shadow-card">
                <h2 className="text-lg font-bold text-blue-900 mb-3">About this Event</h2>
                <p className="text-gray-600 leading-relaxed text-sm whitespace-pre-line">{ev.description}</p>
              </div>
            )}

            {/* Organizer */}
            {ev.organizer && (
              <div className="bg-white rounded-2xl p-5 flex items-center gap-4 border border-blue-100 shadow-card">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl overflow-hidden"
                  style={{ background:'linear-gradient(135deg,#1565C0,#D32F2F)' }}>
                  {ev.organizer.organizationLogo
                    ? <img src={ev.organizer.organizationLogo} alt="" className="w-full h-full object-cover" />
                    : ev.organizer.organizerName?.charAt(0)}
                </div>
                <div>
                  <p className="font-bold text-blue-900">{ev.organizer.organizerName}</p>
                  <p className="text-sm text-gray-500">{ev.organizer.organizationName}</p>
                </div>
              </div>
            )}

            {ev.googleMapsUrl && (
              <a href={ev.googleMapsUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm font-medium">
                <FiExternalLink /> View on Google Maps
              </a>
            )}

            <InfoCard title="Contact Organizer">
              <div className="space-y-2 text-sm text-gray-700">
                <p className="font-bold text-blue-900">{ev.organizer?.organizerName || 'Organizer'}</p>
                {(ev.whatsappContactNumber || ev.organizer?.phone) && (
                  <a className="flex items-center gap-2 text-blue-700" href={`tel:${cleanPhone(ev.whatsappContactNumber || ev.organizer.phone)}`}>
                    <FiPhone /> {ev.whatsappContactNumber || ev.organizer.phone}
                  </a>
                )}
                {ev.whatsappContactNumber && (
                  <a className="flex items-center gap-2 text-green-700" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${cleanPhone(ev.whatsappContactNumber)}`}>
                    <FiMessageCircle /> Chat on WhatsApp
                  </a>
                )}
                {ev.whatsappGroupLink ? (
                  <a className="flex items-center gap-2 text-green-700" target="_blank" rel="noopener noreferrer" href={ev.whatsappGroupLink}>
                    <FiUsers /> Join WhatsApp Group
                  </a>
                ) : (
                  <p className="flex items-center gap-2 text-gray-500">
                    <FiUsers /> WhatsApp group link not provided
                  </p>
                )}
                {ev.organizer?.email && <a className="flex items-center gap-2 text-blue-700" href={`mailto:${ev.organizer.email}`}><FiMail /> {ev.organizer.email}</a>}
              </div>
            </InfoCard>

            <InfoCard title="Event Facilities">
              <div className="flex flex-wrap gap-2">
                {facilityBadges(ev).map(label => <span key={label} className="badge badge-blue">✓ {label}</span>)}
                {facilityBadges(ev).length === 0 && <p className="text-sm text-gray-500">No facilities have been listed by the organizer.</p>}
              </div>
            </InfoCard>

            <div className="grid md:grid-cols-2 gap-5">
              <InfoCard title="Food & Accommodation">
                <DetailRows rows={[
                  ['Food Available', ev.foodProvided ? 'Yes' : 'No'],
                  ['Meals', ev.foodMeals || 'Not provided'],
                  ['Food Type', foodTypeLabel(ev.foodType)],
                  ['Accommodation', ev.accommodationProvided ? 'Available' : 'Not Available'],
                  ['Type', accommodationTypeLabel(ev)],
                  ['Charges', ev.accommodationCharges != null ? `₹${ev.accommodationCharges}` : 'Not provided'],
                ]} />
              </InfoCard>
              <InfoCard title="Live Event Status">
                <div className="flex items-center gap-2 text-blue-900 font-bold"><FiCheckCircle /> {computedStatus}</div>
                <DetailRows rows={[
                  ['Registration Deadline', formatDate(ev.registrationDeadline)],
                  ['Start', formatDateTime(ev.eventDate, ev.eventTime)],
                  ['End', formatDateTime(ev.endDate || ev.eventDate, ev.endTime)],
                ]} />
              </InfoCard>
            </div>

            <InfoCard title="Travel Guide">
              <DetailRows rows={[
                ['Venue Address', ev.location],
                ['Nearest Bus Stop', ev.nearestBusStop],
                ['Distance from Bus Stop', ev.distanceFromBusStop],
                ['Bus Numbers', ev.busNumbers],
                ['Nearest Railway Station', ev.nearestRailwayStation],
                ['Distance from Railway Station', ev.distanceFromRailwayStation],
                ['Nearest Airport', ev.nearestAirport],
                ['Metro Availability', ev.metroInformation],
                ['Landmarks', ev.landmarks],
                ['Parking Availability', ev.parkingAvailable],
              ]} />
            </InfoCard>

            <InfoCard title="Important Information">
              <DetailRows rows={[
                ['Reporting Time', ev.reportingTime],
                ['Dress Code', ev.dressCode],
                ['Items to Bring', ev.itemsToBring],
                ['Laptop Required', ev.laptopRequired ? 'Yes' : 'No'],
                ['ID Card Required', ev.idCardRequired ? 'Yes' : 'No'],
                ['Team Size', ev.teamSize],
                ['Rules', ev.rules],
                ['Refund Policy', ev.refundPolicy],
                ['Cancellation Policy', ev.cancellationPolicy],
                ['Certificate Eligibility', ev.certificateEligibility],
              ]} />
            </InfoCard>

            <InfoCard title="AI Event Assistant">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input value={assistantQuestion} onChange={e => setAssistantQuestion(e.target.value)} className="input-field text-sm" placeholder="Ask about this event" />
                  <button type="button" className="btn-primary px-4" disabled={aiMutation.isLoading || !assistantQuestion.trim()} onClick={() => aiMutation.mutate(assistantQuestion)}>
                    Ask
                  </button>
                </div>
                {assistantAnswer && <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900 whitespace-pre-line">{assistantAnswer}</p>}
              </div>
            </InfoCard>

            <InfoCard title="Event Timeline">
              <div className="grid gap-2 sm:grid-cols-2">
                {timelineSteps(ev).map(step => (
                  <div key={step.label} className={`rounded-xl border px-3 py-2 text-sm ${step.done ? 'border-green-200 bg-green-50 text-green-800' : 'border-blue-100 bg-white text-gray-600'}`}>
                    {step.done ? '✓' : '○'} {step.label}
                  </div>
                ))}
              </div>
            </InfoCard>

            <InfoCard title="Feedback">
              {isEventCompleted(ev) ? <RatingsPanel eventId={ev.id} /> : <p className="text-sm text-gray-500">Feedback opens after the event ends.</p>}
            </InfoCard>

            <InfoCard title="Certificate">
              <DetailRows rows={[
                ['Certificate Available', ev.hasCertificate ? 'Yes' : 'No'],
                ['Status', ev.hasCertificate ? (isEventCompleted(ev) ? 'Eligible after organizer release' : 'Pending') : 'Not Eligible'],
                ['Release Date', formatDate(ev.certificateDeadline) || (isEventCompleted(ev) ? 'Available after organizer publishes' : 'After event completion')],
              ]} />
            </InfoCard>

            <InfoCard title="Related Events">
              {relatedEvents.length > 0 ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {relatedEvents.map(item => <EventCard key={item.id} event={item} />)}
                </div>
              ) : <p className="text-sm text-gray-500">No related events found yet.</p>}
            </InfoCard>
              </>
            )}
          </div>

          {/* Right — booking card */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-3xl p-6 sticky top-24 space-y-5 border border-blue-100 shadow-blue">
              <div>
                <p className="text-xs text-gray-500 mb-1 font-medium">Ticket Price</p>
                {isFree
                  ? <p className="text-3xl font-extrabold text-green-600">Free</p>
                  : <p className="text-3xl font-extrabold text-blue-900">₹{ticketUnitPrice.toLocaleString()}<span className="text-sm font-normal text-gray-400"> / ticket</span></p>}
                {hasActiveMembership && ev.memberTicketPrice != null && Number(ev.memberTicketPrice) < Number(ev.ticketPrice) && (
                  <p className="mt-1 text-xs font-semibold text-emerald-700">Active member price applied · regular price ₹{Number(ev.ticketPrice).toLocaleString()}</p>
                )}
              </div>

              {canBook && (
                <div>
                  <p className="text-sm font-semibold text-blue-900 mb-3">Quantity</p>
                  <div className="flex items-center gap-4">
                    <button onClick={() => {
                      setQty(q => {
                        const next = Math.max(1, q - 1);
                        setParticipants(ps => ps.slice(0, next));
                        return next;
                      });
                    }}
                      className="w-10 h-10 rounded-xl border border-blue-200 flex items-center justify-center hover:bg-blue-50 transition-colors text-blue-700">
                      <FiMinus />
                    </button>
                    <span className="text-xl font-bold text-blue-900 w-8 text-center">{qty}</span>
                    <button onClick={() => {
                      setQty(q => {
                        const next = Math.min(10, q + 1, ev.availableSeats);
                        setParticipants(ps => [...ps, ...Array.from({ length: next - ps.length }, () => ({ ...emptyParticipant }))]);
                        return next;
                      });
                    }}
                      className="w-10 h-10 rounded-xl border border-blue-200 flex items-center justify-center hover:bg-blue-50 transition-colors text-blue-700">
                      <FiPlus />
                    </button>
                  </div>
                </div>
              )}

              {canBook && (
                <div className="space-y-3 max-h-[26rem] overflow-y-auto pr-1">
                  <p className="text-sm font-semibold text-blue-900">Participant Details</p>
                  {participants.map((p, index) => (
                    <div key={index} className="border border-blue-100 rounded-2xl p-3 bg-blue-50/40 space-y-2">
                      <div className="text-xs font-bold text-blue-700">Participant {index + 1}</div>
                      <input className="input-field text-sm bg-white" placeholder="Name" value={p.name}
                        onChange={e => setParticipants(ps => ps.map((x, i) => i === index ? { ...x, name:e.target.value } : x))} />
                      <input className="input-field text-sm bg-white" placeholder="Email" type="email" value={p.email}
                        onChange={e => setParticipants(ps => ps.map((x, i) => i === index ? { ...x, email:e.target.value } : x))} />
                      <div className="grid grid-cols-2 gap-2">
                        <input className="input-field text-sm bg-white" placeholder="Department" value={p.department}
                          onChange={e => setParticipants(ps => ps.map((x, i) => i === index ? { ...x, department:e.target.value } : x))} />
                        <input className="input-field text-sm bg-white" placeholder="College" value={p.college}
                          onChange={e => setParticipants(ps => ps.map((x, i) => i === index ? { ...x, college:e.target.value } : x))} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!isFree && canBook && (
                <div className="flex items-center justify-between pt-3 border-t border-blue-100">
                  <span className="font-semibold text-gray-700">Total</span>
                  <span className="text-2xl font-extrabold text-blue-900">₹{total.toLocaleString()}</span>
                </div>
              )}

              {canBook ? (
                <motion.button onClick={() => {
                  if (!user) return navigate('/login');
                  if (user.role !== 'USER') return toast.error('Only students can book tickets');
                  if (participants.some(p => !p.name.trim() || !p.email.trim())) return toast.error('Enter name and email for every participant');
                  bookMutation.mutate();
                }} disabled={bookMutation.isLoading}
                  whileHover={{ scale:1.02 }} whileTap={{ scale:0.98 }}
                  className="btn-primary w-full py-4 text-base font-bold disabled:opacity-60">
                  {bookMutation.isLoading ? '⏳ Processing…' : '🎫 Register Now'}
                </motion.button>
              ) : (
                <div className="bg-red-50 border border-red-200 text-red-700 text-center py-4 rounded-2xl font-semibold text-sm">
                  {ev.status === 'CANCELLED' ? '❌ Event Cancelled' : ev.status === 'COMPLETED' ? '✅ Event Completed' : '⚠️ No seats available'}
                </div>
              )}

              <button onClick={() => navigator.clipboard.writeText(window.location.href).then(() => toast.success('Link copied!'))}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl border border-blue-200 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors">
                <FiShare2 /> Share Event
              </button>

              <div className="rounded-2xl border border-blue-100 p-4 space-y-3">
                <p className="text-sm font-semibold text-blue-900">Share</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <a className="btn-outline py-2 px-3" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(ev.eventName + ' ' + eventUrl)}`}>WhatsApp</a>
                  <a className="btn-outline py-2 px-3" target="_blank" rel="noopener noreferrer" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(eventUrl)}`}>LinkedIn</a>
                  <a className="btn-outline py-2 px-3" href={`mailto:?subject=${encodeURIComponent(ev.eventName)}&body=${encodeURIComponent(eventUrl)}`}>Email</a>
                </div>
                <div className="flex justify-center bg-white p-2 rounded-xl">
                  <QRCodeSVG value={eventUrl} size={112} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ title, children }) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-blue-100 shadow-card">
      <h2 className="text-lg font-bold text-blue-900 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function DetailRows({ rows }) {
  const visible = rows.filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (!visible.length) return <p className="text-sm text-gray-500">Not provided by organizer.</p>;
  return (
    <div className="grid gap-2 text-sm">
      {visible.map(([label, value]) => (
        <div key={label} className="grid sm:grid-cols-[180px_1fr] gap-1 border-b border-blue-50 pb-2 last:border-0">
          <span className="font-semibold text-blue-900">{label}</span>
          <span className="text-gray-600 whitespace-pre-line">{value}</span>
        </div>
      ))}
    </div>
  );
}

function cleanPhone(value = '') {
  return String(value).replace(/[^\d+]/g, '');
}

function foodTypeLabel(type) {
  if (type === 'VEG') return 'Veg';
  if (type === 'NON_VEG') return 'Non-Veg';
  if (type === 'BOTH') return 'Veg and Non-Veg';
  return 'Not provided';
}

function accommodationTypeLabel(ev) {
  const parts = [];
  if (ev.accommodationType) parts.push(ev.accommodationType.replace(/_/g, ' '));
  if (ev.boysHostelAvailable || ev.girlsHostelAvailable) parts.push('Hostel');
  if (ev.hotelTieupAvailable) parts.push('Hotel');
  if (ev.accommodationBedsAvailable) parts.push(`${ev.accommodationBedsAvailable} seats`);
  return [...new Set(parts)].join(', ') || 'Not provided';
}

function facilityBadges(ev) {
  return [
    [ev.foodProvided, 'Food'],
    [ev.accommodationProvided, 'Accommodation'],
    [ev.parkingAvailable && ev.parkingAvailable !== 'NONE', 'Parking'],
    [ev.wifiAvailable, 'Wi-Fi'],
    [ev.medicalSupportAvailable, 'Medical Support'],
    [ev.hasCertificate, 'Certificate'],
    [ev.category === 'HACKATHON', 'Hackathon'],
    [ev.category === 'WORKSHOP', 'Workshop'],
    [ev.category === 'CODING_COMPETITION', 'Competition'],
  ].filter(([enabled]) => Boolean(enabled)).map(([, label]) => label);
}

function eventStart(ev) {
  return ev.eventDate ? new Date(`${ev.eventDate}T${ev.eventTime || '00:00:00'}`) : null;
}

function eventEnd(ev) {
  const date = ev.endDate || ev.eventDate;
  return date ? new Date(`${date}T${ev.endTime || '23:59:59'}`) : null;
}

function isEventCompleted(ev) {
  const end = eventEnd(ev);
  return ev.status === 'COMPLETED' || ev.status === 'EXPIRED' || (end && new Date() > end);
}

function getLiveStatus(ev) {
  if (ev.status === 'CANCELLED') return 'Cancelled';
  const now = new Date();
  const start = eventStart(ev);
  const end = eventEnd(ev);
  const deadline = ev.registrationDeadline ? new Date(`${ev.registrationDeadline}T23:59:59`) : null;
  if (end && now > end) return ev.status === 'EXPIRED' ? 'Expired' : 'Completed';
  if (start && end && now >= start && now <= end) return 'Live Now';
  if (deadline && now > deadline) return 'Registration Closed';
  if (ev.availableSeats <= 0) return 'Registration Closed';
  if (start && now < start) return 'Registration Open';
  return 'Upcoming';
}

function timelineSteps(ev) {
  const registered = ev.availableSeats < ev.totalSeats;
  const paid = registered && Number(ev.ticketPrice || 0) >= 0;
  const completed = isEventCompleted(ev);
  return [
    ['Registration', registered || getLiveStatus(ev) === 'Registration Open'],
    ['Approval', ['APPROVED', 'PUBLISHED', 'LIVE', 'ONGOING', 'COMPLETED', 'EXPIRED'].includes(ev.status)],
    ['Payment', paid],
    ['Ticket Generated', registered],
    ['Attend Event', completed],
    ['Certificate Released', completed && ev.hasCertificate],
    ['Feedback', completed],
  ].map(([label, done]) => ({ label, done }));
}

function formatDate(value) {
  if (!value) return '';
  return format(new Date(value), 'MMM d, yyyy');
}

function formatDateTime(date, time) {
  if (!date) return '';
  return `${formatDate(date)}${time ? `, ${time}` : ''}`;
}
