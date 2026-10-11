/**
 * TicketScanner — Multi-mode ticket scanner embedded in the Attendees page.
 *
 * Two independent modes (neither is default; organizer chooses):
 *   📱 CAMERA  — continuous jsQR camera loop, rear camera preferred
 *   🔵 BLUETOOTH — focused hidden input; any HID/Bluetooth barcode scanner
 *                  behaves like a keyboard; Enter key triggers validation
 *
 * Both modes call the same POST /attendance/scan endpoint and pass scanMethod.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import { toast } from 'react-toastify';
import jsQR from 'jsqr';
import { attendanceAPI } from '../../services/api';
import {
  FiCamera, FiCheckCircle, FiAlertCircle, FiUsers,
  FiZap, FiX, FiPlay, FiStopCircle,
} from 'react-icons/fi';
import { MdBluetooth, MdBluetoothSearching } from 'react-icons/md';

// ── helpers ────────────────────────────────────────────────────────────────
function normalizeScan(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return (
      url.searchParams.get('ticketId') ||
      url.searchParams.get('ticket') ||
      url.searchParams.get('code') ||
      url.pathname.split('/').filter(Boolean).pop() ||
      raw
    );
  } catch {
    const match = raw.match(/(?:ticketId|ticket|code)=([^&\s]+)/i);
    return decodeURIComponent(match?.[1] || raw).trim();
  }
}

// ── component ──────────────────────────────────────────────────────────────
export default function TicketScanner({ eventId }) {
  const qc = useQueryClient();

  // active mode: null | 'CAMERA' | 'BLUETOOTH'
  const [mode, setMode] = useState(null);

  // scan state
  const [lastResult, setLastResult] = useState(null); // AttendanceResponse
  const [recentScans, setRecentScans] = useState([]);

  // camera refs
  const videoRef    = useRef(null);
  const streamRef   = useRef(null);
  const loopRef     = useRef(null);
  const [cameraOn,  setCameraOn]  = useState(false);
  const [camError,  setCamError]  = useState('');

  // BT / HID refs
  const btInputRef  = useRef(null);
  const btBuffer    = useRef('');
  const btTimer     = useRef(null);
  const [btStatus,  setBtStatus]  = useState('waiting'); // waiting | scanning | ok | error
  const [btLastRaw, setBtLastRaw] = useState('');

  // cooldown / dedup
  const cooldown    = useRef(false);
  const lastTicket  = useRef('');

  // ── mutation ───────────────────────────────────────────────────────────
  const scanMutation = useMutation(
    ({ ticketId, scanMethod }) =>
      attendanceAPI.scan(eventId, ticketId, scanMethod).then(r => r.data),
    {
      onSuccess: (res) => {
        const data = res?.data;
        setLastResult(data);
        if (data) {
          setRecentScans(prev => [
            { ...data, ts: new Date().toLocaleTimeString(), ok: true },
            ...prev.slice(0, 9),
          ]);
        }
        toast.success(res?.message || '✓ Attendance recorded', { autoClose: 2000 });
        qc.invalidateQueries(['attendance-stats', eventId]);
        qc.invalidateQueries(['attendance-event', eventId]);
        setTimeout(() => { cooldown.current = false; }, 2000);
        setBtStatus('ok');
      },
      onError: (err) => {
        const data = err?.response?.data?.data;
        if (data) {
          setLastResult(data);
          setRecentScans(prev => [
            { ...data, ts: new Date().toLocaleTimeString(), ok: false, msg: err?.response?.data?.message },
            ...prev.slice(0, 9),
          ]);
        }
        const msg = err?.response?.data?.message || 'Invalid ticket';
        toast.error(msg, { autoClose: 2500 });
        setTimeout(() => { cooldown.current = false; }, 1200);
        setBtStatus('error');
      },
    }
  );

  // ── fire scan ─────────────────────────────────────────────────────────
  const doScan = useCallback((raw, scanMethod) => {
    const ticketId = normalizeScan(raw);
    if (!ticketId) return;
    if (cooldown.current) return;
    if (ticketId === lastTicket.current) return;
    cooldown.current   = true;
    lastTicket.current = ticketId;
    setLastResult(null);
    scanMutation.mutate({ ticketId, scanMethod });
  }, [scanMutation]);

  // ── CAMERA ────────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (loopRef.current) cancelAnimationFrame(loopRef.current);
    streamRef.current?.getTracks?.().forEach(t => t.stop());
    loopRef.current = null;
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  const startCamera = async () => {
    setCamError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError('Camera not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraOn(true);
      lastTicket.current = '';

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const tick = () => {
        const v = videoRef.current;
        if (!v || v.readyState < 2) { loopRef.current = requestAnimationFrame(tick); return; }
        canvas.width  = v.videoWidth;
        canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height);
        if (code?.data) {
          if (videoRef.current) {
            videoRef.current.style.outline = '3px solid #22c55e';
            setTimeout(() => { if (videoRef.current) videoRef.current.style.outline = 'none'; }, 400);
          }
          doScan(code.data, 'CAMERA');
        }
        loopRef.current = requestAnimationFrame(tick);
      };
      loopRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setCamError(err?.message || 'Could not open camera.');
    }
  };

  // stop camera on unmount or mode switch
  useEffect(() => {
    if (mode !== 'CAMERA') stopCamera();
  }, [mode, stopCamera]);
  useEffect(() => () => stopCamera(), [stopCamera]);

  // ── BLUETOOTH / HID ───────────────────────────────────────────────────
  // Focus the hidden input when BT mode is active, refocus on click-away
  useEffect(() => {
    if (mode === 'BLUETOOTH') {
      btInputRef.current?.focus();
    }
  }, [mode]);

  const onBtInput = (e) => {
    // handled via keydown buffer; clear the visible value so it stays hidden
    e.currentTarget.value = '';
  };

  const onBtKeyDown = useCallback((e) => {
    if (mode !== 'BLUETOOTH') return;
    if (e.key === 'Enter') {
      const val = btBuffer.current.trim();
      btBuffer.current = '';
      clearTimeout(btTimer.current);
      if (val.length >= 4) {
        setBtLastRaw(val);
        setBtStatus('scanning');
        doScan(val, 'BLUETOOTH');
      }
      return;
    }
    if (e.key.length === 1) {
      btBuffer.current += e.key;
      clearTimeout(btTimer.current);
      // auto-fire after 120 ms silence (some scanners don't send Enter)
      btTimer.current = setTimeout(() => {
        const val = btBuffer.current.trim();
        btBuffer.current = '';
        if (val.length >= 6) {
          setBtLastRaw(val);
          setBtStatus('scanning');
          doScan(val, 'BLUETOOTH');
        }
      }, 120);
    }
  }, [mode, doScan]);

  // attach global keydown for BT mode (captures scanner output anywhere on page)
  useEffect(() => {
    if (mode !== 'BLUETOOTH') return;
    window.addEventListener('keydown', onBtKeyDown);
    return () => window.removeEventListener('keydown', onBtKeyDown);
  }, [mode, onBtKeyDown]);

  // refocus BT input on page click
  const refocusBt = () => {
    if (mode === 'BLUETOOTH') btInputRef.current?.focus();
  };

  // ── switch mode ────────────────────────────────────────────────────────
  const activateMode = (m) => {
    setMode(prev => {
      if (prev === m) return null; // toggle off
      return m;
    });
    setLastResult(null);
    setBtStatus('waiting');
    setBtLastRaw('');
    lastTicket.current = '';
    cooldown.current = false;
  };

  const isPresent = lastResult?.attendanceStatus === 'PRESENT';

  // ── render ─────────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Section header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-2">
          <FiZap className="w-4 h-4 text-teal-600" />
          <h2 className="font-extrabold text-slate-900 text-base" style={{ fontFamily: 'Space Grotesk,sans-serif' }}>
            Ticket Scanner
          </h2>
        </div>
        <p className="text-xs text-slate-400">Choose a scanning mode below</p>
      </div>

      <div className="p-5 space-y-5">
        {/* Mode selector buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Camera option */}
          <button
            onClick={() => activateMode('CAMERA')}
            className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-4 text-left transition-all ${
              mode === 'CAMERA'
                ? 'border-teal-500 bg-teal-50'
                : 'border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50/40'
            }`}
          >
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${mode === 'CAMERA' ? 'bg-teal-500' : 'bg-slate-100'}`}>
              <FiCamera className={`w-5 h-5 ${mode === 'CAMERA' ? 'text-white' : 'text-slate-500'}`} />
            </div>
            <div>
              <p className={`font-bold text-sm ${mode === 'CAMERA' ? 'text-teal-700' : 'text-slate-900'}`}>📱 Mobile Camera Scanner</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Use device camera to scan QR codes continuously</p>
            </div>
            {mode === 'CAMERA' && (
              <span className="ml-auto text-[10px] font-bold text-teal-600 bg-teal-100 px-2 py-0.5 rounded-full">ACTIVE</span>
            )}
          </button>

          {/* Bluetooth / HID option */}
          <button
            onClick={() => activateMode('BLUETOOTH')}
            className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-4 text-left transition-all ${
              mode === 'BLUETOOTH'
                ? 'border-blue-500 bg-blue-50'
                : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40'
            }`}
          >
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${mode === 'BLUETOOTH' ? 'bg-blue-500' : 'bg-slate-100'}`}>
              <MdBluetooth className={`w-5 h-5 ${mode === 'BLUETOOTH' ? 'text-white' : 'text-slate-500'}`} />
            </div>
            <div>
              <p className={`font-bold text-sm ${mode === 'BLUETOOTH' ? 'text-blue-700' : 'text-slate-900'}`}>🔵 Bluetooth QR Scanner</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Any HID/Bluetooth barcode scanner — no drivers needed</p>
            </div>
            {mode === 'BLUETOOTH' && (
              <span className="ml-auto text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">ACTIVE</span>
            )}
          </button>
        </div>

        {/* ── CAMERA panel ─────────────────────────────────────────── */}
        {mode === 'CAMERA' && (
          <div className="space-y-3">
            <div className="relative aspect-video max-h-72 rounded-2xl bg-slate-950 overflow-hidden flex items-center justify-center">
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
              {!cameraOn && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
                  <FiCamera className="w-12 h-12" />
                  <p className="text-sm font-semibold">Camera off</p>
                </div>
              )}
              {cameraOn && (
                <>
                  {/* scan crosshair */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-44 h-44 border-2 border-white/60 rounded-2xl"
                      style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }} />
                  </div>
                  <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-black/60 rounded-full px-2 py-1">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[10px] font-bold text-white">AUTO SCANNING</span>
                  </div>
                </>
              )}
            </div>

            {camError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{camError}</p>
            )}

            <div className="flex gap-2">
              {!cameraOn ? (
                <button
                  onClick={startCamera}
                  className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition-colors"
                >
                  <FiPlay className="w-4 h-4" /> Start Scanner
                </button>
              ) : (
                <button
                  onClick={stopCamera}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-600 transition-colors"
                >
                  <FiStopCircle className="w-4 h-4" /> Stop Scanner
                </button>
              )}
              <button
                onClick={() => activateMode('CAMERA')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <FiX className="w-3.5 h-3.5" /> Close
              </button>
            </div>
          </div>
        )}

        {/* ── BLUETOOTH panel ──────────────────────────────────────── */}
        {mode === 'BLUETOOTH' && (
          <div onClick={refocusBt} className="space-y-3 cursor-default">
            {/* Hidden input that receives HID scanner keystrokes */}
            <input
              ref={btInputRef}
              type="text"
              className="sr-only"
              aria-label="Bluetooth scanner input"
              autoComplete="off"
              onChange={onBtInput}
              onBlur={() => { if (mode === 'BLUETOOTH') setTimeout(() => btInputRef.current?.focus(), 100); }}
            />

            {/* Status card */}
            <div className={`flex items-center gap-4 rounded-2xl border-2 p-4 transition-colors ${
              btStatus === 'ok'       ? 'border-green-300 bg-green-50'
              : btStatus === 'error'  ? 'border-red-300 bg-red-50'
              : btStatus === 'scanning' ? 'border-amber-300 bg-amber-50'
              : 'border-blue-200 bg-blue-50'
            }`}>
              <MdBluetoothSearching className={`w-8 h-8 shrink-0 ${
                btStatus === 'ok'       ? 'text-green-600'
                : btStatus === 'error'  ? 'text-red-500'
                : btStatus === 'scanning' ? 'text-amber-500 animate-pulse'
                : 'text-blue-500 animate-pulse'
              }`} />
              <div className="flex-1 min-w-0">
                <p className={`font-bold text-sm ${
                  btStatus === 'ok'     ? 'text-green-700'
                  : btStatus === 'error' ? 'text-red-700'
                  : 'text-blue-700'
                }`}>
                  {btStatus === 'ok'       ? '✓ Ticket Validated'
                   : btStatus === 'error'  ? '✗ Invalid Ticket'
                   : btStatus === 'scanning' ? '⟳ Validating...'
                   : 'Waiting for scan...'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {btStatus === 'waiting'
                    ? 'Scanner ready — point your Bluetooth scanner at a ticket QR/barcode'
                    : btLastRaw
                    ? `Last scan: ${btLastRaw.length > 30 ? btLastRaw.slice(0, 30) + '…' : btLastRaw}`
                    : 'Scanning…'}
                </p>
              </div>
              <div className={`h-3 w-3 rounded-full ${
                btStatus === 'ok'       ? 'bg-green-500'
                : btStatus === 'error'  ? 'bg-red-500'
                : btStatus === 'scanning' ? 'bg-amber-400 animate-pulse'
                : 'bg-blue-400 animate-pulse'
              }`} />
            </div>

            {/* Instructions */}
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500 space-y-1">
              <p className="font-bold text-slate-700">How to use:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Pair your Bluetooth/USB barcode scanner with this device</li>
                <li>Keep this page focused (click anywhere here if needed)</li>
                <li>Scan any ticket QR code — attendance marks automatically</li>
                <li>Works with any HID scanner — no drivers or apps required</li>
              </ul>
            </div>

            <button
              onClick={() => activateMode('BLUETOOTH')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <FiX className="w-3.5 h-3.5" /> Disable Scanner
            </button>
          </div>
        )}

        {/* ── Scan result ──────────────────────────────────────────── */}
        {mode && lastResult && (
          <div className={`rounded-2xl border p-4 ${isPresent ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
            <div className="flex items-start gap-3">
              {isPresent
                ? <FiCheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                : <FiAlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0 space-y-1 text-sm">
                <p className={`font-bold ${isPresent ? 'text-green-800' : 'text-amber-800'}`}>
                  {isPresent ? 'Check-in Successful' : lastResult.attendanceStatus ?? 'Already recorded'}
                </p>
                {lastResult.participantName && <p className="text-slate-700 font-semibold">{lastResult.participantName}</p>}
                {lastResult.participantEmail && <p className="text-slate-500 text-xs">{lastResult.participantEmail}</p>}
                {lastResult.isActiveMember !== undefined && (
                  <p className={`text-xs font-bold ${lastResult.isActiveMember ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {lastResult.isActiveMember ? `Active member · ${lastResult.memberNumber}` : 'No active membership on file'}
                  </p>
                )}
                {lastResult.ticketId && (
                  <code className="text-[11px] font-mono bg-white/60 border border-slate-200 px-2 py-0.5 rounded-lg">
                    {lastResult.ticketId}
                  </code>
                )}
                {lastResult.checkInTime && (
                  <p className="text-xs text-slate-400">{new Date(lastResult.checkInTime).toLocaleString()}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Recent scans ─────────────────────────────────────────── */}
        {recentScans.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Recent Scans</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {recentScans.map((s, i) => (
                <div key={i} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-xs ${s.ok ? 'bg-green-50' : 'bg-red-50'}`}>
                  {s.ok
                    ? <FiCheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" />
                    : <FiAlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                  <span className="font-semibold text-slate-800 truncate flex-1">
                    {s.participantName || s.ticketId || 'Unknown'}
                  </span>
                  <code className="font-mono text-[10px] text-slate-400 shrink-0">{s.ticketId?.slice(-8)}</code>
                  <span className="text-slate-400 shrink-0">{s.ts}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* placeholder when no mode is selected */}
        {!mode && (
          <div className="flex flex-col items-center py-8 text-slate-400 gap-3">
            <FiUsers className="w-10 h-10 opacity-30" />
            <p className="text-sm font-semibold">Select a scanner mode above to begin</p>
            <p className="text-xs">Camera for QR codes · Bluetooth for any barcode/QR scanner</p>
          </div>
        )}
      </div>
    </div>
  );
}
