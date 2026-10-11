import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { toast } from 'react-toastify';
import { certificatesAPI, eventsAPI } from '../../services/api';
import {
  FiArrowLeft,
  FiCalendar,
  FiCheckCircle,
  FiImage,
  FiMapPin,
  FiSave,
  FiSettings,
  FiUploadCloud,
  FiUsers,
} from 'react-icons/fi';

const ORG_TYPES = ['College', 'Department', 'Club', 'Company', 'Community', 'Other'];

export default function CreateEvent() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [posterFile, setPosterFile] = useState(null);
  const [posterPreview, setPosterPreview] = useState('');
  const [authorizedFile, setAuthorizedFile] = useState(null);
  const [certificateTemplateFile, setCertificateTemplateFile] = useState(null);
  const [signatureFile, setSignatureFile] = useState(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      status: 'DRAFT',
      visibility: 'PUBLIC',
      eventType: 'OFFLINE',
      organizationType: 'College',
      hasCertificate: false,
    },
  });

  const organizationType = watch('organizationType');
  const isCollege = organizationType === 'College';

  const { data: categories } = useQuery('categories', () => eventsAPI.categories().then((r) => r.data.data));

  const posterName = useMemo(() => posterFile?.name ?? 'Upload event poster image', [posterFile]);
  const authorizedName = useMemo(() => authorizedFile?.name ?? 'Upload authorized organization document', [authorizedFile]);

  const mutation = useMutation(
    async (formData) => {
      const { organizationType: orgType, foodMealsArr, ...eventData } = formData;
      const cleanedEventData = Object.fromEntries(
        Object.entries(eventData).map(([key, value]) => [key, value === '' ? null : value])
      );
      const created = await eventsAPI.create({
        ...cleanedEventData,
        ticketPrice: Number(eventData.ticketPrice),
        memberTicketPrice: eventData.memberTicketPrice ? Number(eventData.memberTicketPrice) : null,
        volunteerCapacity: eventData.volunteerCapacity ? Number(eventData.volunteerCapacity) : 0,
        volunteerCategories: eventData.volunteerCategoriesStr ? eventData.volunteerCategoriesStr.split(',').map(s => s.trim()).filter(Boolean) : [],
        totalSeats: Number(eventData.totalSeats),
        hasCertificate: Boolean(eventData.hasCertificate),
        certificateSettings: {
          certificateAvailable: Boolean(eventData.hasCertificate),
          automaticGeneration: Boolean(eventData.certificateAutomaticGeneration),
          releaseMode: eventData.certificateReleaseMode || 'MANUAL',
          releaseDate: eventData.certificateReleaseDate || null,
          minimumAttendanceRequired: true,
          certificateType: eventData.certificateType || 'PARTICIPATION',
          organizerName: eventData.certificateOrganizerName || null,
          organizationName: eventData.certificateOrganizationName || null,
          verificationBaseUrl: null,
          certificateExpiry: null,
          theme: eventData.certificateTheme || 'MODERN_BLUE',
        },
        foodProvided: Boolean(eventData.foodProvided),
        teaCoffeeProvided: Boolean(eventData.teaCoffeeProvided),
        accommodationProvided: Boolean(eventData.accommodationProvided),
        boysHostelAvailable: Boolean(eventData.boysHostelAvailable),
        girlsHostelAvailable: Boolean(eventData.girlsHostelAvailable),
        hotelTieupAvailable: Boolean(eventData.hotelTieupAvailable),
        accommodationCharges: eventData.accommodationCharges ? Number(eventData.accommodationCharges) : null,
        accommodationBedsAvailable: eventData.accommodationBedsAvailable ? Number(eventData.accommodationBedsAvailable) : null,
        foodMeals: foodMealsArr?.length ? foodMealsArr.join(',') : null,
        laptopRequired: Boolean(eventData.laptopRequired),
        idCardRequired: Boolean(eventData.idCardRequired),
        wifiAvailable: Boolean(eventData.wifiAvailable),
        wheelchairAccessible: false,
        restRoomsAvailable: false,
        drinkingWaterAvailable: false,
        medicalSupportAvailable: Boolean(eventData.medicalSupportAvailable),
        networkingEnabled: false,
        organizerDetails: [
          `Organization type: ${orgType}`,
          eventData.organizerDetails ? `Details: ${eventData.organizerDetails}` : '',
        ].filter(Boolean).join('\n'),
      });

      const eventId = created.data?.data?.id ?? created.data?.id;
      if (posterFile && eventId) {
        const upload = new FormData();
        upload.append('file', posterFile);
        await eventsAPI.uploadBanner(eventId, upload);
      }
      if (authorizedFile && eventId) {
        const upload = new FormData();
        upload.append('file', authorizedFile);
        await eventsAPI.uploadAuthorizedDocument(eventId, upload);
      }
      if (certificateTemplateFile && eventId) {
        const upload = new FormData();
        upload.append('file', certificateTemplateFile);
        await certificatesAPI.uploadTemplate(eventId, upload, eventData.certificateOrganizerName || '');
      }
      if (signatureFile && eventId) {
        const upload = new FormData();
        upload.append('file', signatureFile);
        await certificatesAPI.uploadSignature(eventId, upload);
      }
      return created;
    },
    {
      onSuccess: () => {
        toast.success('Event created successfully!');
        qc.invalidateQueries('org-events');
        qc.invalidateQueries('org-events-dash');
        qc.invalidateQueries('org-dash');
        qc.invalidateQueries('events');
        qc.invalidateQueries('notifs');
        navigate('/organizer/events');
      },
    }
  );

  const onPosterChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file.');
      return;
    }
    setPosterFile(file);
    setPosterPreview(URL.createObjectURL(file));
  };

  const onAuthorizedDocumentChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const allowed = ['application/pdf', 'image/png', 'image/jpeg'];
    if (!allowed.includes(file.type)) {
      toast.error('Authorized document must be PDF, PNG, JPG, or JPEG.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Authorized document must be 5MB or smaller.');
      return;
    }
    setAuthorizedFile(file);
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-100">
              <FiArrowLeft />
            </button>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-teal-700">Organizer Workspace</p>
              <h1 className="section-title">Create New Event</h1>
            </div>
          </div>
          <button type="submit" form="create-event-form" disabled={mutation.isLoading} className="btn-primary flex items-center gap-2 disabled:opacity-60">
            <FiSave /> {mutation.isLoading ? 'Creating...' : 'Create Event'}
          </button>
        </div>

        <form id="create-event-form" onSubmit={handleSubmit((data) => mutation.mutate(data))} className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <Section icon={<FiSettings />} title="Basic Information" text="Give participants the clearest possible event summary.">
              <FormField label="Event Name" error={errors.eventName?.message}>
                <input {...register('eventName', { required: 'Event name is required' })} className="input-field" placeholder="e.g. National Tech Summit 2026" />
              </FormField>

              <FormField label="Description">
                <textarea {...register('description')} rows={5} className="input-field resize-none" placeholder="Describe the event, agenda, eligibility, and expected outcomes." />
              </FormField>

              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Category" error={errors.category?.message}>
                  <select {...register('category', { required: 'Category is required' })} className="input-field">
                    <option value="">Select category</option>
                    {(categories || []).map((category) => <option key={category} value={category}>{category.replace(/_/g, ' ')}</option>)}
                  </select>
                </FormField>
                <FormField label="Event Type">
                  <select {...register('eventType')} className="input-field">
                    <option value="OFFLINE">In-Person</option>
                    <option value="ONLINE">Online</option>
                    <option value="HYBRID">Hybrid</option>
                  </select>
                </FormField>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Organization Type">
                  <select {...register('organizationType')} className="input-field">
                    {ORG_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </FormField>
              </div>

              {isCollege && (
                <div className="grid gap-4 rounded-xl border border-teal-100 bg-teal-50/60 p-4 md:grid-cols-2">
                  <FormField label="College Name" error={errors.collegeName?.message}>
                    <input {...register('collegeName', { required: isCollege ? 'College name is required' : false })} className="input-field" placeholder="e.g. ABC Engineering College" />
                  </FormField>
                  <FormField label="Department Where It Will Be Held" error={errors.departmentName?.message}>
                    <input {...register('departmentName', { required: isCollege ? 'Department is required' : false })} className="input-field" placeholder="e.g. Computer Science Department" />
                  </FormField>
                </div>
              )}

              {!isCollege && (
                <FormField label="Organization Details">
                  <input {...register('organizerDetails')} className="input-field" placeholder="Club, company, or community name" />
                </FormField>
              )}

              <FormField label="Tags">
                <input {...register('tags')} className="input-field" placeholder="React, AI, Java, Workshop" />
              </FormField>
            </Section>

            <Section icon={<FiCalendar />} title="Date & Time" text="Add the full schedule so attendees can plan ahead.">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Start Date" error={errors.eventDate?.message}>
                  <input {...register('eventDate', { required: 'Start date is required' })} type="date" className="input-field" />
                </FormField>
                <FormField label="Start Time" error={errors.eventTime?.message}>
                  <input {...register('eventTime', { required: 'Start time is required' })} type="time" className="input-field" />
                </FormField>
                <FormField label="End Date">
                  <input {...register('endDate')} type="date" className="input-field" />
                </FormField>
                <FormField label="End Time">
                  <input {...register('endTime')} type="time" className="input-field" />
                </FormField>
                <FormField label="Registration Deadline">
                  <input {...register('registrationDeadline')} type="date" className="input-field" />
                </FormField>
              </div>
            </Section>

            <Section icon={<FiMapPin />} title="Location & Transportation" text="Help attendees find the venue and plan their travel.">
              <FormField label="Venue Name">
                <input {...register('venueName')} className="input-field" placeholder="Auditorium, Seminar Hall, Online Room" />
              </FormField>
              <FormField label="Full Address / Location" error={errors.location?.message}>
                <input {...register('location', { required: 'Location is required' })} className="input-field" placeholder="Campus address, city, state" />
              </FormField>
              <FormField label="Google Maps URL">
                <input {...register('googleMapsUrl')} type="url" className="input-field" placeholder="https://maps.google.com/..." />
              </FormField>
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="WhatsApp Group Link">
                  <input {...register('whatsappGroupLink')} type="url" className="input-field" placeholder="https://chat.whatsapp.com/..." />
                </FormField>
                <FormField label="WhatsApp Contact Number">
                  <input {...register('whatsappContactNumber')} className="input-field" placeholder="+91 98765 43210" />
                </FormField>
              </div>
              <div className="border-t border-slate-100 pt-4 mt-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Transportation Guidance</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <FormField label="Nearest Bus Stop">
                    <input {...register('nearestBusStop')} className="input-field" placeholder="e.g. Gandhi Nagar Bus Stand" />
                  </FormField>
                  <FormField label="Distance from Bus Stop">
                    <input {...register('distanceFromBusStop')} className="input-field" placeholder="e.g. 200 meters" />
                  </FormField>
                  <FormField label="Bus Numbers">
                    <input {...register('busNumbers')} className="input-field" placeholder="e.g. 21G, 45A" />
                  </FormField>
                  <FormField label="Nearest Railway Station">
                    <input {...register('nearestRailwayStation')} className="input-field" placeholder="e.g. Chennai Central — 3 km" />
                  </FormField>
                  <FormField label="Distance from Railway Station">
                    <input {...register('distanceFromRailwayStation')} className="input-field" placeholder="e.g. 3 km" />
                  </FormField>
                  <FormField label="Parking Available">
                    <select {...register('parkingAvailable')} className="input-field">
                      <option value="">Select</option>
                      <option value="FREE">Free Parking</option>
                      <option value="PAID">Paid Parking</option>
                      <option value="NONE">No Parking</option>
                      <option value="LIMITED">Limited Parking</option>
                    </select>
                  </FormField>
                  <FormField label="Estimated Travel Time">
                    <input {...register('estimatedTravelTime')} className="input-field" placeholder="25 minutes from central bus stand" />
                  </FormField>
                  <FormField label="Cab Estimate">
                    <input {...register('cabEstimate')} className="input-field" placeholder="Rs. 250-350 from railway station" />
                  </FormField>
                </div>
                <FormField label="Travel / Route Details">
                  <textarea {...register('travelGuide')} rows={3} className="input-field resize-none"
                    placeholder="How to reach the venue — bus routes, directions from landmark, cab booking tip…" />
                </FormField>
                <FormField label="Landmarks">
                  <textarea {...register('landmarks')} rows={2} className="input-field resize-none" placeholder="Main gate, nearby building, signal, or recognizable landmark" />
                </FormField>
                <FormField label="Nearby Hotels">
                  <textarea {...register('nearbyHotels')} rows={2} className="input-field resize-none" placeholder="Hotel names, distance, contact details" />
                </FormField>
                <FormField label="Nearby Restaurants">
                  <textarea {...register('nearbyRestaurants')} rows={2} className="input-field resize-none" placeholder="Restaurant names, cuisine, distance" />
                </FormField>
              </div>
            </Section>

            <Section icon={<FiCalendar />} title="Schedule & Live Mode" text="Optional details shown on event day.">
              <FormField label="Session Schedule">
                <textarea {...register('sessionSchedule')} rows={3} className="input-field resize-none" placeholder="10:00 AM Inauguration&#10;11:00 AM Workshop" />
              </FormField>
              <FormField label="Speaker List">
                <textarea {...register('speakerList')} rows={2} className="input-field resize-none" placeholder="Speaker name - role/topic" />
              </FormField>
              <FormField label="Live Announcements">
                <textarea {...register('liveAnnouncements')} rows={2} className="input-field resize-none" placeholder="Check-in gate, help desk, room changes" />
              </FormField>
            </Section>

            <Section icon={<FiCheckCircle />} title="Important Information" text="Add participant requirements, rules, and policies.">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Reporting Time">
                  <input {...register('reportingTime')} type="time" className="input-field" />
                </FormField>
                <FormField label="Dress Code">
                  <input {...register('dressCode')} className="input-field" placeholder="Formal, college uniform, sportswear" />
                </FormField>
                <FormField label="Team Size">
                  <input {...register('teamSize')} className="input-field" placeholder="Solo, 2-4 members, maximum 5" />
                </FormField>
                <FormField label="Certificate Eligibility">
                  <input {...register('certificateEligibility')} className="input-field" placeholder="Attend full event, submit project, etc." />
                </FormField>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700">
                  <input {...register('laptopRequired')} type="checkbox" className="accent-teal-600" />
                  Laptop required
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700">
                  <input {...register('idCardRequired')} type="checkbox" className="accent-teal-600" />
                  ID card required
                </label>
              </div>
              <FormField label="Items to Bring">
                <textarea {...register('itemsToBring')} rows={2} className="input-field resize-none" placeholder="Laptop, charger, ID card, notebook" />
              </FormField>
              <FormField label="Rules">
                <textarea {...register('rules')} rows={3} className="input-field resize-none" placeholder="Participation rules and conduct guidelines" />
              </FormField>
              <FormField label="Refund Policy">
                <textarea {...register('refundPolicy')} rows={2} className="input-field resize-none" placeholder="Refund terms, cutoff dates, non-refundable fees" />
              </FormField>
              <FormField label="Cancellation Policy">
                <textarea {...register('cancellationPolicy')} rows={2} className="input-field resize-none" placeholder="Cancellation terms and organizer contact path" />
              </FormField>
            </Section>
          </div>

          <aside className="space-y-6">
            <Section icon={<FiImage />} title="Event Poster" text="Upload a poster that will appear as the event banner.">
              <label className="poster-drop">
                {posterPreview ? (
                  <img src={posterPreview} alt="Event poster preview" />
                ) : (
                  <div className="grid place-items-center gap-3 text-center">
                    <FiUploadCloud className="h-9 w-9 text-teal-600" />
                    <span>{posterName}</span>
                    <small>PNG, JPG, or WebP works best</small>
                  </div>
                )}
                <input type="file" accept="image/*" onChange={onPosterChange} />
              </label>
              {posterPreview && (
                <button type="button" onClick={() => { setPosterFile(null); setPosterPreview(''); }} className="btn-outline w-full">
                  Remove Poster
                </button>
              )}
            </Section>

            <Section icon={<FiUploadCloud />} title="Authorized Organization Document" text="Upload the approval letter, permission note, or official event authorization.">
              <label className="poster-drop">
                <div className="grid place-items-center gap-3 text-center">
                  <FiUploadCloud className="h-9 w-9 text-teal-600" />
                  <span>{authorizedName}</span>
                  <small>PDF, PNG, JPG, or JPEG up to 5MB</small>
                </div>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={onAuthorizedDocumentChange} />
              </label>
              {authorizedFile && (
                <button type="button" onClick={() => setAuthorizedFile(null)} className="btn-outline w-full">
                  Remove Document
                </button>
              )}
            </Section>

            <Section icon={<FiUsers />} title="Tickets & Seats" text="Set capacity, pricing, and volunteer recruitment.">
              <FormField label="Standard Ticket Price (Rs.)" error={errors.ticketPrice?.message}>
                <input {...register('ticketPrice', { required: 'Ticket price is required', min: 0 })} type="number" min="0" step="0.01" className="input-field" placeholder="0 for free" />
              </FormField>
              <FormField label="Member Ticket Price (Rs.) (Optional)">
                <input {...register('memberTicketPrice', { min: 0 })} type="number" min="0" step="0.01" className="input-field" placeholder="Discounted price for members" />
              </FormField>
              <FormField label="Total Seats" error={errors.totalSeats?.message}>
                <input {...register('totalSeats', { required: 'Total seats is required', min: 1 })} type="number" min="1" className="input-field" placeholder="100" />
              </FormField>
              <FormField label="Volunteer Capacity Headcount">
                <input {...register('volunteerCapacity', { min: 0 })} type="number" min="0" className="input-field" placeholder="0 if not recruiting volunteers" />
              </FormField>
              <FormField label="Volunteer Categories (comma separated)">
                <input {...register('volunteerCategoriesStr')} className="input-field" placeholder="Registration, Logistics, Technical" />
              </FormField>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700">
                <input {...register('hasCertificate')} type="checkbox" className="accent-teal-600" />
                Certificate provided
              </label>
            </Section>

            <Section icon={<FiCheckCircle />} title="Certificate Settings" text="Configure certificate generation and release.">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700">
                <input {...register('certificateAutomaticGeneration')} type="checkbox" className="accent-teal-600" />
                Automatic certificate generation
              </label>
              <FormField label="Release Mode">
                <select {...register('certificateReleaseMode')} className="input-field">
                  <option value="IMMEDIATE_AFTER_EVENT">Immediately after event ends</option>
                  <option value="MANUAL">Manual release by organizer</option>
                  <option value="SCHEDULED">Scheduled release</option>
                </select>
              </FormField>
              <FormField label="Release Date">
                <input {...register('certificateReleaseDate')} type="date" className="input-field" />
              </FormField>
              <FormField label="Certificate Type">
                <select {...register('certificateType')} className="input-field">
                  {['PARTICIPATION','WINNER','RUNNER_UP','VOLUNTEER','ORGANIZER','SPEAKER'].map(type => (
                    <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Built-in Theme">
                <select {...register('certificateTheme')} className="input-field">
                  <option value="MODERN_BLUE">Modern Blue</option>
                  <option value="CLASSIC_GOLD">Classic Gold</option>
                  <option value="MINIMAL_TEAL">Minimal Teal</option>
                </select>
              </FormField>
              <FormField label="Organizer Name">
                <input {...register('certificateOrganizerName')} className="input-field" placeholder="Name shown on certificate" />
              </FormField>
              <FormField label="Organization Name">
                <input {...register('certificateOrganizationName')} className="input-field" placeholder="Organization shown on certificate" />
              </FormField>
            </Section>

            <Section icon={<FiCheckCircle />} title="Food & Accommodation" text="Specify meals and lodging for participants.">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700">
                <input {...register('foodProvided')} type="checkbox" className="accent-teal-600" />
                Food will be provided
              </label>
              {watch('foodProvided') && (
                <>
                  <FormField label="Meals Provided">
                    <div className="flex flex-wrap gap-2">
                      {['BREAKFAST','LUNCH','DINNER','SNACKS'].map(m => (
                        <label key={m} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold cursor-pointer hover:bg-teal-50">
                          <input type="checkbox" value={m} {...register('foodMealsArr')} className="accent-teal-600" />
                          {m}
                        </label>
                      ))}
                    </div>
                  </FormField>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700">
                    <input {...register('teaCoffeeProvided')} type="checkbox" className="accent-teal-600" />
                    Tea / Coffee provided
                  </label>
                  <FormField label="Food Type">
                    <select {...register('foodType')} className="input-field">
                      <option value="">Select</option>
                      <option value="VEG">Veg Only</option>
                      <option value="NON_VEG">Non-Veg Only</option>
                      <option value="BOTH">Both Veg & Non-Veg</option>
                    </select>
                  </FormField>
                  <FormField label="Special Diet Notes">
                    <input {...register('specialDiet')} className="input-field" placeholder="Jain, vegan, allergies, gluten-free" />
                  </FormField>
                </>
              )}
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700">
                <input {...register('accommodationProvided')} type="checkbox" className="accent-teal-600" />
                Accommodation available
              </label>
              {watch('accommodationProvided') && (
                <>
                  <FormField label="Accommodation Type">
                    <select {...register('accommodationType')} className="input-field">
                      <option value="">Select</option>
                      <option value="HOSTEL">Hostel</option>
                      <option value="HOTEL">Hotel</option>
                      <option value="BOTH">Hostel + Hotel</option>
                    </select>
                  </FormField>
                  <div className="grid gap-2">
                    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700">
                      <input {...register('boysHostelAvailable')} type="checkbox" className="accent-teal-600" />
                      Boys hostel available
                    </label>
                    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700">
                      <input {...register('girlsHostelAvailable')} type="checkbox" className="accent-teal-600" />
                      Girls hostel available
                    </label>
                    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700">
                      <input {...register('hotelTieupAvailable')} type="checkbox" className="accent-teal-600" />
                      Hotel tie-up available
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Beds Available">
                      <input {...register('accommodationBedsAvailable')} type="number" min="0" className="input-field" placeholder="50" />
                    </FormField>
                    <FormField label="Charges (Rs. 0 = Free)">
                      <input {...register('accommodationCharges')} type="number" min="0" className="input-field" placeholder="0" />
                    </FormField>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Check-in">
                      <input {...register('accommodationCheckIn')} className="input-field" placeholder="8:00 AM" />
                    </FormField>
                    <FormField label="Check-out">
                      <input {...register('accommodationCheckOut')} className="input-field" placeholder="6:00 PM" />
                    </FormField>
                  </div>
                  <FormField label="Contact Person">
                    <input {...register('accommodationContactPerson')} className="input-field" placeholder="Name and phone number" />
                  </FormField>
                  <FormField label="Accommodation Details">
                    <textarea {...register('accommodationDetails')} rows={2} className="input-field resize-none" placeholder="Address, contact, check-in time…" />
                  </FormField>
                </>
              )}
            </Section>

            <Section icon={<FiCheckCircle />} title="Facilities" text="Enable only the facilities available at the event.">
              {[
                ['wifiAvailable', 'Wi-Fi'],
                ['medicalSupportAvailable', 'Medical support'],
              ].map(([name, label]) => (
                <label key={name} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700">
                  <input {...register(name)} type="checkbox" className="accent-teal-600" />
                  {label}
                </label>
              ))}
            </Section>

            <Section icon={<FiCheckCircle />} title="Publish Settings" text="Save as a draft or publish immediately.">              <FormField label="Status">
                <select {...register('status')} className="input-field">
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Publish Now</option>
                </select>
              </FormField>
              <div className="flex gap-3">
                <button type="submit" disabled={mutation.isLoading} className="btn-primary flex-1 disabled:opacity-60">
                  {mutation.isLoading ? 'Creating...' : 'Create'}
                </button>
                <button type="button" onClick={() => navigate(-1)} className="btn-outline flex-1">
                  Cancel
                </button>
              </div>
            </Section>
          </aside>
        </form>
      </div>
    </div>
  );
}

function Section({ icon, title, text, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-card">
      <div className="mb-5 flex items-start gap-3">
        <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">{icon}</div>
        <div>
          <h2 className="font-bold text-slate-950">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{text}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function FormField({ label, error, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
