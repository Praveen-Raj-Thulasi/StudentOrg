import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { toast } from 'react-toastify';
import jsQR from 'jsqr';
import { attendanceAPI } from '../../services/api';
import Spinner from '../../components/common/Spinner';
import QueryError from '../../components/common/QueryError';
import TicketScanner from '../../components/organizer/TicketScanner';
import {
  FiCamera, FiUpload, FiCheckCircle, FiAlertCircle, FiUsers,
  FiWifi, FiWifiOff, FiLink, FiCopy, FiSmartphone, FiRefreshCw,
} from 'react-icons/fi';

// ── External Scanner WebSocket URL ──────────────────────────────────────────
// Any mobile device on the same LAN can open:
//   http://<organizer-ip>:3000/scanner-relay?event=<eventId>&token=<token>
// and send scanned ticket IDs via WebSocket to this page.
function buildScannerRelayWsUrl(eventId) {
  const base = window.location.origin.replace(/^http/, 'ws');
  return `${base}/api/ws-native`;
}

export default function AttendanceScanner() {
  const { id } = useParams();
  const eventId = Number(id);
  const qc = useQueryClient();

  // ── camera / scan state ──────────────────────────────────────────────────
  const videoRef     = useRef(null);
  const streamRef    = useRef(null);
  const scanLoopRef  = useRef(null);
  const lastScanned  = useRef('');           // debounce — avoid re-scanning same code
  const scanCooldown = useRef(false);
  const keyboardBufferRef = useRef('');
  const keyboardTimerRef = useRef(null);

  const [ticketId,     setTicketId]     = useState('');
  const [scanResult,   setScanResult]   = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError,  setCameraError]  = useState('');

  // ── external scanner state ───────────────────────────────────────────────
  const extWsRef          = useRef(null);
  const [extConnected,    setExtConnected]    = useState(false);
  const [extSessionId,    setExtSessionId]    = useState(() => Math.random().toString(36).slice(2, 10).toUpperCase());
  const [extShowPanel,    setExtShowPanel]    = useState(false);
  const [extLastDevice,   setExtLastDevice]   = useState('');

  // ── queries ──────────────────────────────────────────────────────────────
  const statsQuery = useQuery(
    ['attendance-stats', eventId],
    () => attendanceAPI.stats(eventId).then(r => r.data?.data),
    { enabled: Boolean(eventId), refetchInterval: 8000 }
  );
  const attendeesQuery = useQuery(
    ['attendance-event', eventId],
    () => attendanceAPI.forEvent(eventId).then(r => r.data?.data ?? []),
    { enabled: Boolean(eventId), refetchInterval: 8000 }
  );

  // ── scan & auto-mark mutation ─────────────────────────────────────────────
  const scanMutation = useMutation(
    (tid) => attendanceAPI.scan(eventId, tid.trim()).then(r => r.data),
    {
      onSuccess: (res) => {
        const data = res?.data;
        setScanResult(data);
        setTicketId(data?.ticketId || '');
        toast.success(res?.message || 'Attendance recorded ✓', { autoClose: 2500 });
        qc.invalidateQueries(['attendance-stats', eventId]);
        qc.invalidateQueries(['attendance-event', eventId]);
        // resume scanning after 2 s cooldown
        setTimeout(() => { scanCooldown.current = false; }, 2000);
      },
      onError: (err) => {
        const data = err?.response?.data?.data;
        if (data) setScanResult(data);
        const msg = err?.response?.data?.message || 'Invalid ticket.';
        toast.error(msg, { autoClose: 2500 });
        // shorter cooldown on error so organizer can retry quickly
        setTimeout(() => { scanCooldown.current = false; }, 1000);
      },
    }
  );

  const markPresentMutation = useMutation(
    (bookingId) => attendanceAPI.markPresent(eventId, bookingId).then(r => r.data),
    {
      onSuccess: (res) => {
        setScanResult(res?.data || null);
        toast.success(res?.message || 'Participant marked present');
        qc.invalidateQueries(['attendance-stats', eventId]);
        qc.invalidateQueries(['attendance-event', eventId]);
      },
      onError: (err) => toast.error(err?.response?.data?.message || 'Could not mark participant present'),
    }
  );

  // ── auto-mark helper (called by camera loop, upload, external scanner) ───
  const autoMark = useCallback((tid) => {
    const clean = normalizeScanValue(tid);
    if (!clean) return;
    if (scanCooldown.current) return;           // still in cooldown
    if (clean === lastScanned.current) return;  // same code, skip
    lastScanned.current = clean;
    scanCooldown.current = true;
    setTicketId(clean);
    setScanResult(null);
    scanMutation.mutate(clean);
  }, [scanMutation]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.target;
      const isFormField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName);
      if (event.key === 'Enter') {
        const buffered = keyboardBufferRef.current.trim();
        keyboardBufferRef.current = '';
        if (buffered && !isFormField) {
          event.preventDefault();
          autoMark(buffered);
        }
        return;
      }
      if (event.key.length !== 1 || isFormField) return;
      keyboardBufferRef.current += event.key;
      clearTimeout(keyboardTimerRef.current);
      keyboardTimerRef.current = setTimeout(() => {
        const buffered = keyboardBufferRef.current.trim();
        keyboardBufferRef.current = '';
        if (buffered.length >= 6) autoMark(buffered);
      }, 120);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      clearTimeout(keyboardTimerRef.current);
    };
  }, [autoMark]);

  // ── camera ────────────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current);
    streamRef.current?.getTracks?.().forEach(t => t.stop());
    scanLoopRef.current = null;
    streamRef.current   = null;
    setCameraActive(false);
  }, []);

  const startCamera = async () => {
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera not supported. Upload a QR image or enter the ticket ID manually.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraActive(true);
      lastScanned.current = '';

      const canvas = document.createElement('canvas');
      const ctx    = canvas.getContext('2d');

      const tick = () => {
        const video = videoRef.current;
        if (!video || video.readyState < 2) {
          scanLoopRef.current = requestAnimationFrame(tick);
          return;
        }
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code?.data) {
          // Flash green border on video
          if (videoRef.current) videoRef.current.style.outline = '3px solid #22c55e';
          setTimeout(() => { if (videoRef.current) videoRef.current.style.outline = 'none'; }, 400);
          autoMark(code.data);
          // Keep camera running so organizer can scan the next ticket
          scanLoopRef.current = requestAnimationFrame(tick);
        } else {
          scanLoopRef.current = requestAnimationFrame(tick);
        }
      };
      scanLoopRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setCameraError(err?.message || 'Could not open camera.');
    }
  };

  useEffect(() => () => stopCamera(), [stopCamera]);

  // ── image upload ──────────────────────────────────────────────────────────
  const decodeUpload = async (file) => {
    if (!file) return;
    try {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Could not load image')); });
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (!code?.data) { toast.error('No QR code found in image.'); return; }
      autoMark(code.data);
    } catch (err) {
      toast.error(err?.message || 'Could not decode QR image.');
    }
  };

  // ── manual ticket input ───────────────────────────────────────────────────
  const markManual = () => {
    if (!ticketId.trim()) { toast.error('Enter a ticket ID first.'); return; }
    autoMark(ticketId);
  };

  // ── keyboard shortcut: Enter in input box ────────────────────────────────
  const onTicketKeyDown = (e) => {
    if (e.key === 'Enter') markManual();
  };

  // ── External Scanner WebSocket (receive scanned tickets from mobile) ──────
  const connectExternalScanner = useCallback(() => {
    if (extWsRef.current) {
      extWsRef.current.close();
      extWsRef.current = null;
    }

    const ws = new WebSocket(buildScannerRelayWsUrl(eventId));
    extWsRef.current = ws;

    ws.onopen = () => {
      // Subscribe to the scanner relay topic for this session
      ws.send(stompFrame('CONNECT', {
        Authorization: `Bearer ${localStorage.getItem('eb_token') || ''}`,
        'accept-version': '1.2',
        'heart-beat': '10000,10000',
      }));
    };

    ws.onmessage = (event) => {
      parseFrames(event.data).forEach(frame => {
        if (frame.command === 'CONNECTED') {
          setExtConnected(true);
          // Subscribe to the scanner relay topic keyed by our session ID
          ws.send(stompFrame('SUBSCRIBE', {
            id: `ext-scanner-${extSessionId}`,
            destination: `/topic/scanner-relay/${eventId}/${extSessionId}`,
            ack: 'auto',
          }));
          toast.info('📱 External scanner relay connected', { autoClose: 2000 });
        }
        if (frame.command === 'MESSAGE' && frame.body) {
          try {
            const payload = JSON.parse(frame.body);
            if (payload.ticketId) {
              setExtLastDevice(payload.device || 'Mobile Device');
              autoMark(payload.ticketId);
            }
          } catch {}
        }
        if (frame.command === 'ERROR') {
          setExtConnected(false);
          toast.warn('External scanner connection error');
        }
      });
    };

    ws.onclose = () => setExtConnected(false);
    ws.onerror = () => { setExtConnected(false); toast.warn('External scanner disconnected'); };
  }, [eventId, extSessionId, autoMark]);

  const disconnectExternalScanner = () => {
    if (extWsRef.current) {
      try { extWsRef.current.close(); } catch {}
      extWsRef.current = null;
    }
    setExtConnected(false);
  };

  useEffect(() => () => disconnectExternalScanner(), []);

  // ── Scanner relay URL for mobile device ──────────────────────────────────
  const relayUrl = `${window.location.origin}/scanner-relay?event=${eventId}&session=${extSessionId}&token=${encodeURIComponent(localStorage.getItem('eb_token') || '')}`;

  // ── render ────────────────────────────────────────────────────────────────
  if (statsQuery.isLoading || attendeesQuery.isLoading) return <Spinner />;
  if (statsQuery.isError || attendeesQuery.isError) return (
    <div className="px-4 py-10 max-w-4xl mx-auto">
      <QueryError message="Could not load attendance data" onRetry={() => { statsQuery.refetch(); attendeesQuery.refetch(); }} />
    </div>
  );

  const stats      = statsQuery.data || {};
  const attendees  = attendeesQuery.data || [];
  const isPresent  = scanResult?.attendanceStatus === 'PRESENT';

  return (
    <div style={{ background: '#F0F4FF', minHeight: '100vh' }} className="px-4 sm:px-6 py-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900" style={{ fontFamily: 'Space Grotesk,sans-serif' }}>
              Attendance Scanner
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              QR codes are marked automatically on scan — no button click needed.
            </p>
          </div>
          {/* External Scanner toggle */}
          <button
            onClick={() => setExtShowPanel(v => !v)}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition-all ${extConnected ? 'border-green-300 bg-green-50 text-green-700' : 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50'}`}
          >
            {extConnected ? <FiWifi className="w-4 h-4" /> : <FiSmartphone className="w-4 h-4" />}
            {extConnected ? 'Scanner Connected' : 'Connect External Scanner'}
          </button>
        </div>

        {/* External scanner panel */}
        {extShowPanel && (
          <div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-card space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900 flex items-center gap-2">
                  <FiSmartphone className="text-blue-600" /> Connect Mobile / External Scanner
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Open this link on any mobile device on the same network to relay scanned tickets to this page automatically.
                </p>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${extConnected ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-slate-100 text-slate-500'}`}>
                <span className={`h-2 w-2 rounded-full ${extConnected ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
                {extConnected ? `Connected · ${extLastDevice || 'Device'}` : 'Disconnected'}
              </span>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 flex items-center gap-2">
              <FiLink className="shrink-0 text-slate-400" />
              <span className="text-xs text-slate-700 font-mono truncate flex-1">{relayUrl}</span>
              <button
                onClick={() => { navigator.clipboard.writeText(relayUrl); toast.success('Scanner URL copied!'); }}
                className="shrink-0 p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                title="Copy link"
              >
                <FiCopy className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {!extConnected ? (
                <button onClick={connectExternalScanner} className="btn-primary inline-flex items-center gap-2 text-sm">
                  <FiWifi /> Start Listening for External Scanner
                </button>
              ) : (
                <button onClick={disconnectExternalScanner} className="btn-outline inline-flex items-center gap-2 text-sm text-red-600 border-red-300 hover:bg-red-50">
                  <FiWifiOff /> Disconnect
                </button>
              )}
              <button
                onClick={() => { setExtSessionId(Math.random().toString(36).slice(2, 10).toUpperCase()); setExtConnected(false); }}
                className="btn-outline inline-flex items-center gap-2 text-sm"
                title="Generate a new session ID"
              >
                <FiRefreshCw className="w-3.5 h-3.5" /> New Session
              </button>
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
              <p className="font-bold">How to use:</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Click "Start Listening for External Scanner"</li>
                <li>Copy the link above and open it on your mobile or barcode scanner device</li>
                <li>Scan any ticket QR on the mobile — attendance is marked here automatically</li>
                <li>Session ID: <code className="font-mono font-bold">{extSessionId}</code></li>
              </ol>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ['Registered', stats.registeredParticipants ?? 0],
            ['Present',    stats.checkedInParticipants  ?? 0],
            ['Absent',     stats.absentParticipants     ?? 0],
            ['Attendance', `${stats.attendancePercentage ?? 0}%`],
          ].map(([label, value]) => (
            <div key={label} className="bg-white border border-blue-100 rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400 font-bold">{label}</p>
              <p className="text-2xl font-extrabold text-blue-900 mt-1">{value}</p>
            </div>
          ))}
        </div>

        {/* ── Multi-Mode Ticket Scanner ─────────────────────────── */}
        <TicketScanner eventId={eventId} />

        <div className="grid lg:grid-cols-[1fr_1.2fr] gap-5">
          {/* Camera & Input */}
          <div className="bg-white rounded-2xl border border-blue-100 p-5 space-y-4">
            <div className="relative aspect-video rounded-xl bg-slate-950 overflow-hidden flex items-center justify-center">
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
              {!cameraActive && <FiCamera className="absolute w-10 h-10 text-white/50" />}
              {/* Live scanning badge */}
              {cameraActive && (
                <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-black/60 rounded-full px-2 py-1">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-[10px] font-bold text-white">AUTO SCANNING</span>
                </div>
              )}
            </div>

            {cameraError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{cameraError}</p>
            )}

            <div className="flex flex-wrap gap-2">
              <button onClick={cameraActive ? stopCamera : startCamera} className="btn-primary inline-flex items-center gap-2">
                <FiCamera /> {cameraActive ? 'Stop Camera' : 'Open Camera'}
              </button>
              <label className="btn-outline inline-flex items-center gap-2 cursor-pointer">
                <FiUpload /> Upload QR Image
                <input type="file" accept="image/*" className="hidden" onChange={e => decodeUpload(e.target.files?.[0])} />
              </label>
            </div>

            {/* Manual entry — press Enter or click Mark */}
            <div className="flex gap-2">
              <input
                value={ticketId}
                onChange={e => setTicketId(e.target.value)}
                onKeyDown={onTicketKeyDown}
                placeholder="Ticket ID / QR / attendance code - press Enter"
                className="input-field font-mono text-sm flex-1"
              />
              <button
                onClick={markManual}
                disabled={scanMutation.isLoading || !ticketId.trim()}
                className="btn-primary px-4 disabled:opacity-50 whitespace-nowrap"
              >
                {scanMutation.isLoading ? '…' : 'Mark'}
              </button>
            </div>

            <p className="text-xs text-slate-400 text-center">
              ✦ Tickets are marked <strong>automatically</strong> when scanned by the camera or external scanner
            </p>
          </div>

          {/* Scan Result */}
          <div className="bg-white rounded-2xl border border-blue-100 p-5">
            <h2 className="font-bold text-slate-900 mb-4">Live Scan Result</h2>
            {scanResult ? (
              <div className="space-y-3 text-sm">
                <Row label="Participant Name" value={scanResult.participantName || '-'} />
                <Row label="Booking ID"       value={scanResult.bookingId       || '-'} />
                <Row label="Ticket ID"        value={scanResult.ticketId        || ticketId} mono />
                <Row label="Event Name"       value={scanResult.eventName       || '-'} />
                <Row label="Check-in Time"    value={scanResult.checkInTime ? new Date(scanResult.checkInTime).toLocaleString() : '-'} />
                <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${isPresent ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                  {isPresent ? <FiCheckCircle /> : <FiAlertCircle />}
                  {scanResult.attendanceStatus || 'NOT_ATTENDED'}
                </div>
                {extLastDevice && isPresent && (
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <FiSmartphone className="w-3 h-3" /> via {extLastDevice}
                  </p>
                )}
              </div>
            ) : (
              <div className="py-16 text-center text-slate-400">
                <FiUsers className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-semibold">No ticket scanned yet</p>
                <p className="text-xs mt-1">Camera will mark attendance automatically</p>
              </div>
            )}
          </div>
        </div>

        {/* Attendees table */}
        <div className="bg-white rounded-2xl border border-blue-100 overflow-hidden">
          <div className="hidden md:grid grid-cols-[1.4fr_1.7fr_1.2fr_1fr_1.2fr_1fr] px-5 py-3 bg-slate-50 text-[11px] font-bold uppercase tracking-widest text-slate-500">
            <div>Participant</div><div>Email</div><div>Ticket</div><div>Status</div><div>Check-in Time</div><div>Action</div>
          </div>
          {attendees.length === 0 && (
            <p className="px-5 py-8 text-sm text-slate-400 text-center">No participants checked in yet.</p>
          )}
          {attendees.map(row => (
            <div key={row.bookingId} className="grid gap-2 md:grid-cols-[1.4fr_1.7fr_1.2fr_1fr_1.2fr_1fr] px-5 py-4 border-t border-slate-100 text-sm">
              <div className="font-semibold text-slate-900">{row.participantName}</div>
              <div className="text-slate-500 truncate">{row.participantEmail}</div>
              <code className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-lg w-fit">{row.ticketId}</code>
              <div className={row.attendanceStatus === 'PRESENT' ? 'text-green-700 font-bold' : 'text-slate-500'}>
                {row.attendanceStatus}
              </div>
              <div className="text-slate-500">
                {row.checkInTime ? new Date(row.checkInTime).toLocaleString() : '-'}
              </div>
              <div>
                {row.attendanceStatus === 'PRESENT' ? (
                  <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-bold text-green-700">Feedback enabled</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => markPresentMutation.mutate(row.bookingId)}
                    disabled={markPresentMutation.isLoading}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Mark Present
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2">
      <span className="text-slate-500">{label}</span>
      <span className={`font-semibold text-slate-900 text-right ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

// ── STOMP helpers (raw WebSocket) ──────────────────────────────────────────
function stompFrame(command, headers = {}, body = '') {
  const headerLines = Object.entries(headers).map(([k, v]) => `${k}:${v}`).join('\n');
  return `${command}\n${headerLines}\n\n${body}\0`;
}

function parseFrames(raw) {
  return String(raw).split('\0').filter(Boolean).map(part => {
    const [head, ...bodyParts] = part.split('\n\n');
    const lines = head.split('\n').filter(Boolean);
    return {
      command: lines[0],
      headers: Object.fromEntries(lines.slice(1).map(line => {
        const idx = line.indexOf(':');
        return idx === -1 ? [line, ''] : [line.slice(0, idx), line.slice(idx + 1)];
      })),
      body: bodyParts.join('\n\n'),
    };
  });
}

function normalizeScanValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.searchParams.get('ticketId')
      || url.searchParams.get('ticket')
      || url.searchParams.get('code')
      || url.pathname.split('/').filter(Boolean).pop()
      || raw;
  } catch {
    const match = raw.match(/(?:ticketId|ticket|code)=([^&\s]+)/i);
    return decodeURIComponent(match?.[1] || raw).trim();
  }
}
