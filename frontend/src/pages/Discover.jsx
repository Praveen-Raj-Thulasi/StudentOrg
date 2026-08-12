import { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { recommendationsAPI, aiAPI, eventsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  FiZap, FiTrendingUp, FiStar, FiMapPin, FiCalendar,
  FiAward, FiGift, FiSearch, FiX,
} from 'react-icons/fi';
import { MdSchool } from 'react-icons/md';

const SECTIONS = [
  { key: 'RECENTLY_ADDED',        label: '🆕 Recently Added',    icon: FiZap,        color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { key: 'ALL_LIVE_EVENTS',       label: 'Open Events',           icon: FiCalendar,   color: 'text-blue-600',   bg: 'bg-blue-50' },
  { key: 'RECOMMENDED_FOR_YOU',   label: 'Recommended For You',   icon: FiZap,        color: 'text-blue-600',   bg: 'bg-blue-50' },
  { key: 'AI_PICKS',              label: '✨ Smart Picks',         icon: FiStar,       color: 'text-purple-600', bg: 'bg-purple-50' },
  { key: 'TRENDING',              label: '🔥 Trending',            icon: FiTrendingUp, color: 'text-rose-600',   bg: 'bg-rose-50' },
  { key: 'UPCOMING_THIS_WEEK',    label: 'This Week',              icon: FiCalendar,   color: 'text-green-600',  bg: 'bg-green-50' },
  { key: 'HIGHEST_RATED',         label: '⭐ Highest Rated',       icon: FiAward,      color: 'text-amber-600',  bg: 'bg-amber-50' },
  { key: 'FREE_EVENTS',           label: '🎁 Free Events',         icon: FiGift,       color: 'text-teal-600',   bg: 'bg-teal-50' },
  { key: 'NEAR_YOU',              label: '📍 Near You',            icon: FiMapPin,     color: 'text-orange-600', bg: 'bg-orange-50' },
  { key: 'POPULAR_IN_DEPARTMENT', label: 'Your Department',        icon: FiStar,       color: 'text-violet-600', bg: 'bg-violet-50' },
  { key: 'POPULAR_IN_COLLEGE',    label: 'Your College',           icon: FiAward,      color: 'text-sky-600',    bg: 'bg-sky-50' },
  { key: 'POPULAR',               label: '📈 Popular',             icon: FiTrendingUp, color: 'text-pink-600',   bg: 'bg-pink-50' },
];

function SkeletonCard() {
  return (
    <div className="w-60 shrink-0 rounded-xl border border-slate-200 bg-white overflow-hidden animate-pulse">
      <div className="h-36 bg-slate-200" />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-slate-200 rounded w-3/4" />
        <div className="h-2.5 bg-slate-100 rounded w-1/2" />
        <div className="h-2.5 bg-slate-100 rounded w-2/3" />
      </div>
    </div>
  );
}

function MiniEventCard({ event }) {
  const isFree = !event.ticketPrice || parseFloat(event.ticketPrice) === 0;
  const [bannerError, setBannerError] = useState(false);
  const showImage = event.eventBanner && !bannerError;

  const CAT_POSTER = {
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
  const poster = CAT_POSTER[event.category] ?? '/event-posters/college-event.svg';

  return (
    <motion.div whileHover={{ y: -3, boxShadow: '0 12px 32px rgba(15,23,42,0.12)' }}
      className="w-60 shrink-0 rounded-xl border border-slate-200 bg-white overflow-hidden transition-shadow">
      <Link to={`/events/${event.id}`} className="block">
        <div className="relative h-36 overflow-hidden">
          {showImage
            ? <img src={event.eventBanner} alt={event.eventName} onError={() => setBannerError(true)} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
            : <img src={poster} alt={event.category} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
          }
          {isFree && <div className="absolute top-2 left-2 rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold text-white">FREE</div>}
        </div>
        <div className="p-3">
          <p className="text-xs text-slate-400 truncate">{event.category?.replace(/_/g, ' ')}</p>
          <h3 className="mt-0.5 text-sm font-semibold text-slate-900 line-clamp-2 leading-tight">{event.eventName}</h3>
          {event.reason && (
            <p className="mt-1.5 text-[10px] text-blue-600 bg-blue-50 rounded px-1.5 py-0.5 line-clamp-1">
              <FiZap className="inline h-2.5 w-2.5 mr-0.5" />{event.reason}
            </p>
          )}
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-slate-400">{event.eventDate}</span>
            <span className="font-bold text-slate-800">{isFree ? 'Free' : `₹${event.ticketPrice}`}</span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function EventRow({ section, events, isLoading }) {
  const Icon = section.icon;
  if (!isLoading && (!events || events.length === 0)) return null;
  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
          <Icon className={`h-4 w-4 ${section.color}`} />
          {section.label}
          {events?.length > 0 && <span className="text-xs font-normal text-slate-400">({events.length})</span>}
        </h2>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : events.map((ev, i) => <MiniEventCard key={ev.id || i} event={ev} />)}
      </div>
    </section>
  );
}

export default function Discover() {
  const { user } = useAuth();
  const [nlpQuery, setNlpQuery] = useState('');
  const [nlpInput, setNlpInput] = useState('');
  const [userLoc, setUserLoc] = useState({ lat: null, lon: null });

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      p => setUserLoc({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => {}
    );
  }, []);

  const { data: discoverData, isLoading } = useQuery(
    ['discover', userLoc, user?.id],
    () => recommendationsAPI.discover(userLoc.lat, userLoc.lon).then(r => r.data?.data || {}),
    { staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true }
  );

  const { data: liveFallback } = useQuery(
    ['discover-live-fallback'],
    () => eventsAPI.search({ page: 0, size: 24, sortBy: 'date_asc' }).then(r => r.data?.data?.content || []),
    { staleTime: 0, refetchOnMount: 'always' }
  );

  const { data: nlpResults, isLoading: nlpLoading } = useQuery(
    ['nlp-search', nlpQuery],
    () => aiAPI.nlpSearch(nlpQuery).then(r => r.data?.data || []),
    { enabled: !!nlpQuery, staleTime: 30_000 }
  );

  const handleSearch = e => { e.preventDefault(); if (nlpInput.trim()) setNlpQuery(nlpInput.trim()); };

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* Hero */}
      <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 px-4 py-12 text-white">
        <div className="mx-auto max-w-3xl text-center">
          <motion.h1 initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
            className="text-3xl font-bold md:text-4xl">Smart Event Discovery</motion.h1>
          <p className="mt-2 text-blue-200 text-sm">Find events tailored just for you</p>

          <form onSubmit={handleSearch} className="relative mt-6 mx-auto max-w-2xl">
            <div className="flex items-center gap-2 rounded-xl bg-white/10 backdrop-blur border border-white/20 px-4 py-3">
              <FiSearch className="shrink-0 text-blue-200" />
              <input value={nlpInput} onChange={e => setNlpInput(e.target.value)}
                placeholder="e.g. workshops this weekend under ₹500 near Chennai…"
                className="flex-1 bg-transparent text-white placeholder:text-blue-300 outline-none text-sm" />
              {nlpInput && <button type="button" onClick={() => setNlpInput('')}><FiX className="text-blue-300" /></button>}
              <button type="submit" className="shrink-0 rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-50">
                Search
              </button>
            </div>
          </form>

          {nlpQuery && (
            <div className="mt-2 flex items-center justify-center gap-2 text-sm text-blue-200">
              <span>Search results for: <strong className="text-white">"{nlpQuery}"</strong></span>
              <button onClick={() => { setNlpQuery(''); setNlpInput(''); }} className="underline text-blue-300 hover:text-white">Clear</button>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pt-8">
        {nlpQuery ? (
          <section>
            <h2 className="text-base font-bold text-slate-900 mb-4">
              {nlpLoading ? 'Searching…' : `${nlpResults?.length || 0} results for "${nlpQuery}"`}
            </h2>
            {nlpLoading
              ? <div className="flex gap-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
              : nlpResults?.length === 0
                ? <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center text-slate-500">No events matched your search.</div>
                : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {nlpResults.map((ev, i) => <MiniEventCard key={ev.id || i} event={ev} />)}
                  </div>}
          </section>
        ) : (
          SECTIONS.map(sec => (
            <EventRow key={sec.key} section={sec}
              events={sec.key === 'ALL_LIVE_EVENTS' && (!discoverData?.[sec.key]?.length)
                ? liveFallback
                : discoverData?.[sec.key]}
              isLoading={isLoading} />
          ))
        )}

        {!user && !isLoading && !nlpQuery && (
          <div className="mt-4 rounded-xl bg-blue-50 border border-blue-200 px-6 py-8 text-center">
            <FiZap className="mx-auto mb-3 h-8 w-8 text-blue-600" />
            <h3 className="text-lg font-bold text-blue-900">Get Personalized Recommendations</h3>
            <p className="mt-1 text-sm text-blue-700">Log in to see personalized picks based on your department, skills, and interests.</p>
            <Link to="/login" className="mt-4 inline-block rounded-lg bg-blue-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
              Log In
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
