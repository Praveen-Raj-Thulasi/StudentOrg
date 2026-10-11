import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { certificatesAPI, eventsAPI } from '../../services/api';
import { toast } from 'react-toastify';
import Spinner from '../../components/common/Spinner';
import { FiSave, FiArrowLeft } from 'react-icons/fi';

export default function EditEvent() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const qc         = useQueryClient();
  const [certificateTemplateFile, setCertificateTemplateFile] = useState(null);
  const [signatureFile, setSignatureFile] = useState(null);

  const { data: event, isLoading } = useQuery(
    ['event-edit', id],
    () => eventsAPI.getById(id).then(r => r.data.data)
  );

  const { register, handleSubmit, formState: { errors } } = useForm({
    values: event ? {
      eventName:    event.eventName,
      description:  event.description,
      category:     event.category,
      eventType:    event.eventType,
      eventDate:    event.eventDate,
      eventTime:    event.eventTime,
      endDate:      event.endDate,
      endTime:      event.endTime,
      venueName:    event.venueName,
      location:     event.location,
      googleMapsUrl:event.googleMapsUrl,
      ticketPrice:  event.ticketPrice,
      memberTicketPrice: event.memberTicketPrice,
      totalSeats:   event.totalSeats,
      volunteerCapacity: event.volunteerCapacity,
      volunteerCategoriesStr: Array.isArray(event.volunteerCategories) ? event.volunteerCategories.join(', ') : '',
      tags:         event.tags,
      status:       event.status,
      visibility:   event.visibility,
      whatsappGroupLink: event.whatsappGroupLink,
      whatsappContactNumber: event.whatsappContactNumber,
      nearestBusStop: event.nearestBusStop,
      distanceFromBusStop: event.distanceFromBusStop,
      busNumbers: event.busNumbers,
      nearestRailwayStation: event.nearestRailwayStation,
      distanceFromRailwayStation: event.distanceFromRailwayStation,
      nearestAirport: event.nearestAirport,
      metroInformation: event.metroInformation,
      parkingAvailable: event.parkingAvailable,
      landmarks: event.landmarks,
      travelGuide: event.travelGuide,
      foodProvided: event.foodProvided,
      foodMeals: event.foodMeals,
      foodType: event.foodType,
      accommodationProvided: event.accommodationProvided,
      accommodationType: event.accommodationType,
      accommodationCharges: event.accommodationCharges,
      accommodationBedsAvailable: event.accommodationBedsAvailable,
      accommodationDetails: event.accommodationDetails,
      reportingTime: event.reportingTime,
      dressCode: event.dressCode,
      itemsToBring: event.itemsToBring,
      laptopRequired: event.laptopRequired,
      idCardRequired: event.idCardRequired,
      teamSize: event.teamSize,
      rules: event.rules,
      refundPolicy: event.refundPolicy,
      cancellationPolicy: event.cancellationPolicy,
      certificateEligibility: event.certificateEligibility,
      wifiAvailable: event.wifiAvailable,
      wheelchairAccessible: false,
      restRoomsAvailable: false,
      drinkingWaterAvailable: false,
      medicalSupportAvailable: event.medicalSupportAvailable,
      networkingEnabled: false,
      hasCertificate: event.hasCertificate,
      certificateAutomaticGeneration: event.certificateSettings?.automaticGeneration,
      minimumAttendanceRequired: event.certificateSettings?.minimumAttendanceRequired ?? true,
      certificateReleaseMode: event.certificateSettings?.releaseMode || 'MANUAL',
      certificateReleaseDate: event.certificateSettings?.releaseDate,
      certificateType: event.certificateSettings?.certificateType || 'PARTICIPATION',
      certificateTheme: event.certificateSettings?.theme || 'MODERN_BLUE',
      certificateOrganizerName: event.certificateSettings?.organizerName,
      certificateOrganizationName: event.certificateSettings?.organizationName,
      certificateVerificationBaseUrl: event.certificateSettings?.verificationBaseUrl,
      certificateExpiry: event.certificateSettings?.certificateExpiry,
    } : {},
  });

  const mutation = useMutation(
    async (data) => {
      const response = await eventsAPI.update(id, data);
      if (certificateTemplateFile) {
        const upload = new FormData();
        upload.append('file', certificateTemplateFile);
        await certificatesAPI.uploadTemplate(id, upload, data.certificateSettings?.organizerName || '');
      }
      if (signatureFile) {
        const upload = new FormData();
        upload.append('file', signatureFile);
        await certificatesAPI.uploadSignature(id, upload);
      }
      return response;
    },
    {
      onSuccess: () => {
        toast.success('Event updated!');
        qc.invalidateQueries(['event', id]);
        qc.invalidateQueries(['event-edit', id]);
        qc.invalidateQueries('org-events');
        qc.invalidateQueries('org-events-dash');
        qc.invalidateQueries('org-dash');
        qc.invalidateQueries('events');
        navigate('/organizer/events');
      },
    }
  );

  if (isLoading) return <Spinner full />;
  const publishedLocked = ['PUBLISHED', 'UPCOMING', 'LIVE', 'ONGOING'].includes(event?.status);
  const lockedClass = publishedLocked ? ' opacity-70 cursor-not-allowed bg-slate-100 dark:bg-slate-800' : '';

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 animate-fade-in">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-dark-border transition-colors">
          <FiArrowLeft />
        </button>
        <h1 className="section-title">Edit Event</h1>
      </div>

      <form onSubmit={handleSubmit(d => {
        const cleaned = Object.fromEntries(Object.entries(d).map(([key, value]) => [key, value === '' ? null : value]));
        mutation.mutate({
          ...cleaned,
          eventName: publishedLocked ? event.eventName : cleaned.eventName,
          category: publishedLocked ? event.category : cleaned.category,
          eventType: publishedLocked ? event.eventType : cleaned.eventType,
          eventDate: publishedLocked ? event.eventDate : cleaned.eventDate,
          eventTime: publishedLocked ? event.eventTime : cleaned.eventTime,
          location: publishedLocked ? event.location : cleaned.location,
          visibility: publishedLocked ? event.visibility : cleaned.visibility,
          status: publishedLocked ? event.status : cleaned.status,
          ticketPrice: publishedLocked ? Number(event.ticketPrice) : Number(d.ticketPrice),
          memberTicketPrice: publishedLocked ? (event.memberTicketPrice ? Number(event.memberTicketPrice) : null) : (d.memberTicketPrice ? Number(d.memberTicketPrice) : null),
          totalSeats: publishedLocked ? Number(event.totalSeats) : Number(d.totalSeats),
          volunteerCapacity: publishedLocked ? Number(event.volunteerCapacity || 0) : Number(d.volunteerCapacity || 0),
          volunteerCategories: publishedLocked ? (event.volunteerCategories || []) : (d.volunteerCategoriesStr ? d.volunteerCategoriesStr.split(',').map(s => s.trim()).filter(Boolean) : []),
          foodProvided: Boolean(d.foodProvided),
          accommodationProvided: Boolean(d.accommodationProvided),
          laptopRequired: Boolean(d.laptopRequired),
          idCardRequired: Boolean(d.idCardRequired),
          wifiAvailable: Boolean(d.wifiAvailable),
          wheelchairAccessible: false,
          restRoomsAvailable: false,
          drinkingWaterAvailable: false,
          medicalSupportAvailable: Boolean(d.medicalSupportAvailable),
          networkingEnabled: false,
          hasCertificate: Boolean(d.hasCertificate),
          certificateSettings: {
            certificateAvailable: Boolean(d.hasCertificate),
            automaticGeneration: Boolean(d.certificateAutomaticGeneration),
            releaseMode: d.certificateReleaseMode || 'MANUAL',
            releaseDate: d.certificateReleaseDate || null,
            minimumAttendanceRequired: d.minimumAttendanceRequired !== false,
            certificateType: d.certificateType || 'PARTICIPATION',
            organizerName: d.certificateOrganizerName || null,
            organizationName: d.certificateOrganizationName || null,
            verificationBaseUrl: d.certificateVerificationBaseUrl || null,
            certificateExpiry: d.certificateExpiry || null,
            theme: d.certificateTheme || 'MODERN_BLUE',
          },
          accommodationCharges: d.accommodationCharges ? Number(d.accommodationCharges) : null,
          accommodationBedsAvailable: d.accommodationBedsAvailable ? Number(d.accommodationBedsAvailable) : null,
        });
      })}
        className="space-y-6">

        <div className="card p-6 space-y-4">
          <h2 className="font-bold text-gray-900 dark:text-white">Basic Info</h2>
          {publishedLocked && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              This event is already published. Core booking fields are locked; update operational details like description, contact, food, accommodation, travel, and certificate settings here.
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Event Name</label>
            <input {...register('eventName', { required: true })} disabled={publishedLocked} className={`input-field${lockedClass}`} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
            <textarea {...register('description')} rows={4} className="input-field resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Event Date</label>
              <input {...register('eventDate')} type="date" disabled={publishedLocked} className={`input-field${lockedClass}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Event Time</label>
              <input {...register('eventTime')} type="time" disabled={publishedLocked} className={`input-field${lockedClass}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Location</label>
              <input {...register('location')} disabled={publishedLocked} className={`input-field${lockedClass}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Ticket Price (₹)</label>
              <input {...register('ticketPrice')} type="number" min="0" step="0.01" disabled={publishedLocked} className={`input-field${lockedClass}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Member Ticket Price (₹)</label>
              <input {...register('memberTicketPrice')} type="number" min="0" step="0.01" disabled={publishedLocked} className={`input-field${lockedClass}`} placeholder="Discounted for members" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Volunteer Capacity</label>
              <input {...register('volunteerCapacity')} type="number" min="0" disabled={publishedLocked} className={`input-field${lockedClass}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Volunteer Categories</label>
              <input {...register('volunteerCategoriesStr')} disabled={publishedLocked} className={`input-field${lockedClass}`} placeholder="Registration, Logistics..." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Status</label>
              <select {...register('status')} disabled={publishedLocked} className={`input-field${lockedClass}`}>
                {['DRAFT','PUBLISHED','CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Visibility</label>
              <select {...register('visibility')} disabled={publishedLocked} className={`input-field${lockedClass}`}>
                <option value="PUBLIC">Public</option>
                <option value="PRIVATE">Private</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <h2 className="font-bold text-gray-900 dark:text-white">Travel & Contact</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="WhatsApp Contact"><input {...register('whatsappContactNumber')} className="input-field" /></Field>
            <Field label="WhatsApp Group Link"><input {...register('whatsappGroupLink')} className="input-field" /></Field>
            <Field label="Nearest Bus Stop"><input {...register('nearestBusStop')} className="input-field" /></Field>
            <Field label="Distance from Bus Stop"><input {...register('distanceFromBusStop')} className="input-field" /></Field>
            <Field label="Bus Numbers"><input {...register('busNumbers')} className="input-field" /></Field>
            <Field label="Nearest Railway Station"><input {...register('nearestRailwayStation')} className="input-field" /></Field>
            <Field label="Distance from Railway Station"><input {...register('distanceFromRailwayStation')} className="input-field" /></Field>
            <Field label="Nearest Airport"><input {...register('nearestAirport')} className="input-field" /></Field>
            <Field label="Metro Availability"><input {...register('metroInformation')} className="input-field" /></Field>
            <Field label="Parking Availability">
              <select {...register('parkingAvailable')} className="input-field">
                <option value="">Select</option>
                <option value="FREE">Free Parking</option>
                <option value="PAID">Paid Parking</option>
                <option value="NONE">No Parking</option>
                <option value="LIMITED">Limited Parking</option>
              </select>
            </Field>
          </div>
          <Field label="Landmarks"><textarea {...register('landmarks')} rows={2} className="input-field resize-none" /></Field>
          <Field label="Travel Guide"><textarea {...register('travelGuide')} rows={3} className="input-field resize-none" /></Field>
        </div>

        <div className="card p-6 space-y-4">
          <h2 className="font-bold text-gray-900 dark:text-white">Food & Accommodation</h2>
          <div className="grid grid-cols-2 gap-4">
            <Check register={register} name="foodProvided" label="Food available" />
            <Field label="Meals"><input {...register('foodMeals')} className="input-field" placeholder="BREAKFAST,LUNCH,DINNER,SNACKS" /></Field>
            <Field label="Food Type">
              <select {...register('foodType')} className="input-field">
                <option value="">Select</option>
                <option value="VEG">Veg</option>
                <option value="NON_VEG">Non-Veg</option>
                <option value="BOTH">Both</option>
              </select>
            </Field>
            <Check register={register} name="accommodationProvided" label="Accommodation available" />
            <Field label="Accommodation Type"><input {...register('accommodationType')} className="input-field" placeholder="HOSTEL, HOTEL, DORMITORY" /></Field>
            <Field label="Limited Seats"><input {...register('accommodationBedsAvailable')} type="number" min="0" className="input-field" /></Field>
            <Field label="Charges"><input {...register('accommodationCharges')} type="number" min="0" className="input-field" /></Field>
          </div>
          <Field label="Accommodation Details"><textarea {...register('accommodationDetails')} rows={2} className="input-field resize-none" /></Field>
        </div>

        <div className="card p-6 space-y-4">
          <h2 className="font-bold text-gray-900 dark:text-white">Certificate Settings</h2>
          <div className="grid grid-cols-2 gap-4">
            <Check register={register} name="hasCertificate" label="Certificate available" />
            <Check register={register} name="certificateAutomaticGeneration" label="Automatic generation" />
            <Check register={register} name="minimumAttendanceRequired" label="Attendance required" />
            <Field label="Release Mode">
              <select {...register('certificateReleaseMode')} className="input-field">
                <option value="IMMEDIATE_AFTER_EVENT">Immediately after event ends</option>
                <option value="MANUAL">Manual release by organizer</option>
                <option value="SCHEDULED">Scheduled release</option>
              </select>
            </Field>
            <Field label="Release Date"><input {...register('certificateReleaseDate')} type="date" className="input-field" /></Field>
            <Field label="Certificate Type">
              <select {...register('certificateType')} className="input-field">
                {['PARTICIPATION','WINNER','RUNNER_UP','VOLUNTEER','ORGANIZER','SPEAKER'].map(type => (
                  <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </Field>
            <Field label="Theme">
              <select {...register('certificateTheme')} className="input-field">
                <option value="MODERN_BLUE">Modern Blue</option>
                <option value="CLASSIC_GOLD">Classic Gold</option>
                <option value="MINIMAL_TEAL">Minimal Teal</option>
              </select>
            </Field>
            <Field label="Organizer Name"><input {...register('certificateOrganizerName')} className="input-field" /></Field>
            <Field label="Organization Name"><input {...register('certificateOrganizationName')} className="input-field" /></Field>
            <Field label="Verification Base URL"><input {...register('certificateVerificationBaseUrl')} type="url" className="input-field" /></Field>
            <Field label="Certificate Expiry"><input {...register('certificateExpiry')} type="date" className="input-field" /></Field>
            <Field label="Custom Template"><input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => setCertificateTemplateFile(e.target.files?.[0] || null)} className="input-field" /></Field>
            <Field label="Organizer Signature"><input type="file" accept=".png,.jpg,.jpeg" onChange={e => setSignatureFile(e.target.files?.[0] || null)} className="input-field" /></Field>
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <h2 className="font-bold text-gray-900 dark:text-white">Important Information & Facilities</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Reporting Time"><input {...register('reportingTime')} type="time" className="input-field" /></Field>
            <Field label="Dress Code"><input {...register('dressCode')} className="input-field" /></Field>
            <Field label="Team Size"><input {...register('teamSize')} className="input-field" /></Field>
            <Field label="Certificate Eligibility"><input {...register('certificateEligibility')} className="input-field" /></Field>
            <Check register={register} name="laptopRequired" label="Laptop required" />
            <Check register={register} name="idCardRequired" label="ID card required" />
            <Check register={register} name="wifiAvailable" label="Wi-Fi" />
            <Check register={register} name="medicalSupportAvailable" label="Medical support" />
          </div>
          <Field label="Items to Bring"><textarea {...register('itemsToBring')} rows={2} className="input-field resize-none" /></Field>
          <Field label="Rules"><textarea {...register('rules')} rows={2} className="input-field resize-none" /></Field>
          <Field label="Refund Policy"><textarea {...register('refundPolicy')} rows={2} className="input-field resize-none" /></Field>
          <Field label="Cancellation Policy"><textarea {...register('cancellationPolicy')} rows={2} className="input-field resize-none" /></Field>
        </div>

        <div className="flex gap-4">
          <button type="submit" disabled={mutation.isLoading}
            className="btn-primary flex items-center gap-2 disabled:opacity-60">
            <FiSave /> {mutation.isLoading ? 'Saving…' : 'Save Changes'}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="btn-outline">Cancel</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Check({ register, name, label }) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 text-sm font-semibold text-gray-700">
      <input {...register(name)} type="checkbox" className="accent-blue-600" />
      {label}
    </label>
  );
}
