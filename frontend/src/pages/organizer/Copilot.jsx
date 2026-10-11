import { toast } from 'react-toastify';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { aiAPI, analyticsAPI, chatbotAPI } from '../../services/api';
import Spinner from '../../components/common/Spinner';
import {
  FiActivity, FiClock, FiFileText, FiSend, FiZap,
  FiPlus, FiRefreshCw, FiAlertTriangle, FiMic, FiMicOff, FiVolume2, FiVolumeX,
} from 'react-icons/fi';
import { MdOutlineAutoAwesome } from 'react-icons/md';

// ── Voice hook — Speech Recognition + Speech Synthesis ───────────────────────
function useVoice({ onTranscript, enabled }) {
  const [listening, setListening]   = useState(false);
  const [speaking,  setSpeaking]    = useState(false);
  const [voiceOut,  setVoiceOut]    = useState(false); // user toggle for TTS
  const recognitionRef = useRef(null);

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { toast.warning('Speech recognition is not supported in this browser.', { toastId: 'speech-rec' }); return; }
    const rec = new SpeechRecognition();
    rec.lang = 'en-IN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setListening(false);
      onTranscript(text);
    };
    rec.onerror = () => setListening(false);
    rec.onend   = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [onTranscript]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const speak = useCallback((text) => {
    if (!voiceOut || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      text.replace(/[#*_`]/g, '').replace(/\n+/g, '. ').slice(0, 600)
    );
    utterance.lang  = 'en-IN';
    utterance.rate  = 1.0;
    utterance.pitch = 1.0;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend   = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [voiceOut]);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  return { listening, speaking, voiceOut, setVoiceOut, startListening, stopListening, speak, stopSpeaking };
}

// ── Lightweight markdown renderer (no extra dependency) ───────────────────────
function Markdown({ text }) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={i} className="my-2 overflow-x-auto rounded-lg bg-slate-900 px-4 py-3 text-xs text-emerald-300 font-mono">
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      i++; continue;
    }

    // H2
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="mt-4 mb-2 text-sm font-bold text-slate-900 border-b border-slate-100 pb-1">
          {inline(line.slice(3))}
        </h2>
      );
      i++; continue;
    }
    // H3
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="mt-3 mb-1 text-sm font-semibold text-slate-800">
          {inline(line.slice(4))}
        </h3>
      );
      i++; continue;
    }

    // Numbered list — collect all consecutive numbered items
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        const content = lines[i].replace(/^\d+\.\s/, '');
        items.push(
          <li key={i} className="text-sm leading-relaxed">
            {inline(content)}
          </li>
        );
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="my-2 ml-5 list-decimal space-y-1">
          {items}
        </ol>
      );
      continue;
    }

    // Bullet list — collect all consecutive bullet items
    if (line.startsWith('- ') || line.startsWith('• ')) {
      const items = [];
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('• '))) {
        const content = lines[i].slice(2);
        items.push(
          <li key={i} className="text-sm leading-relaxed">
            {inline(content)}
          </li>
        );
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="my-2 ml-5 list-disc space-y-1">
          {items}
        </ul>
      );
      continue;
    }

    // Horizontal rule
    if (line === '---' || line === '___') {
      elements.push(<hr key={i} className="my-3 border-slate-200" />);
      i++; continue;
    }

    // Empty line → breathing space
    if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
      i++; continue;
    }

    // Normal paragraph
    elements.push(
      <p key={i} className="text-sm leading-relaxed text-slate-800">
        {inline(line)}
      </p>
    );
    i++;
  }

  return <div className="space-y-1">{elements}</div>;
}

/** Inline formatting: **bold**, *italic*, `code` */
function inline(text) {
  const parts = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let last = 0, match, key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[2]) parts.push(<strong key={key++} className="font-semibold text-slate-900">{match[2]}</strong>);
    else if (match[3]) parts.push(<em key={key++} className="italic">{match[3]}</em>);
    else if (match[4]) parts.push(<code key={key++} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-teal-700">{match[4]}</code>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : parts;
}

// ── Suggested prompts ─────────────────────────────────────────────────────────
const PROMPTS = [
  { label: 'Analytics overview',      msg: 'Give me a full analytics overview of all my events.' },
  { label: 'Registration trend',      msg: 'How are my registrations trending this month?' },
  { label: 'Why are my registrations low?', msg: 'My registrations seem low. What could be the reason and how do I fix it?' },
  { label: 'Plan a hackathon',         msg: 'Help me plan a hackathon event from scratch.' },
  { label: 'Write event description',  msg: 'Write a compelling event description for a web development workshop.' },
  { label: 'Predict attendance',       msg: 'Predict the expected attendance and revenue for my next event.' },
  { label: 'Feedback summary',         msg: 'Summarize the feedback from my completed events and suggest improvements.' },
  { label: 'Export participants',      msg: 'How do I export the participant list for my event?' },
  { label: 'Certificate generation',   msg: 'When and how are certificates generated for my events?' },
  { label: 'Marketing tips',           msg: 'How can I improve registrations and promote my next event better?' },
];

// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      {[0, 1, 2].map(i => (
        <div key={i} className="h-1.5 w-1.5 rounded-full bg-slate-400"
          style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
      ))}
      <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }`}</style>
    </div>
  );
}

// ── Confirmation dialog ────────────────────────────────────────────────────────
function ConfirmBanner({ message, onConfirm, onDismiss }) {
  return (
    <div className="mx-4 mb-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <div className="flex items-start gap-2">
        <FiAlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="flex-1">
          <p className="text-xs font-semibold text-amber-800">{message}</p>
          <div className="mt-2 flex gap-2">
            <button onClick={onConfirm} className="rounded-md bg-amber-600 px-3 py-1 text-xs font-bold text-white hover:bg-amber-700">Confirm</button>
            <button onClick={onDismiss} className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} px-1`}>
      {!isUser && (
        <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white shadow-sm">
          <MdOutlineAutoAwesome className="h-4 w-4" />
        </div>
      )}
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
        isUser
          ? 'bg-teal-600 text-white rounded-br-none'
          : msg.error
            ? 'border border-red-200 bg-red-50 text-red-700 rounded-bl-none'
            : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
      }`}>
        {isUser
          ? <p className="text-sm leading-relaxed">{msg.text}</p>
          : <Markdown text={msg.text} />
        }
        {msg.requiresConfirmation && (
          <div className="mt-2 flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-1.5 text-xs font-semibold text-amber-800">
            <FiAlertTriangle className="h-3 w-3" />
            Review required before this action is applied.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OrganizerCopilot() {
  const [input, setInput]         = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [confirm, setConfirm]     = useState(null);
  const [messages, setMessages]   = useState([
    {
      role: 'assistant',
      text: `## Welcome to EventCopilot 👋

I'm your AI-powered event management assistant. I can help you with:

- **Analytics** — understand your registration trends, revenue, and performance
- **Event Planning** — create, edit, and manage your events
- **Participants** — view attendee lists and export data
- **Predictions** — forecast attendance and revenue
- **Feedback** — sentiment analysis and improvement suggestions
- **Certificates** — generation and distribution

What would you like to work on today?`,
    },
  ]);

  const scrollRef  = useRef(null);
  const inputRef   = useRef(null);
  const abortRef   = useRef(null);
  const qc         = useQueryClient();

  const voice = useVoice({
    onTranscript: (text) => { setInput(text); setTimeout(() => sendStreaming(text), 100); },
    enabled: true,
  });

  const history = useMemo(() =>
    messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-20)
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text })),
    [messages]
  );

  const { data: analytics } = useQuery(
    'organizer-analytics',
    () => analyticsAPI.organizer().then(r => r.data?.data),
    { staleTime: 5 * 60 * 1000 }
  );

  const { data: sessions, refetch: refetchSessions } = useQuery(
    'eventgpt-sessions',
    () => chatbotAPI.sessions().then(r => r.data?.data ?? []),
    { staleTime: 60 * 1000, retry: false }
  );

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming, streamText]);

  // ── Streaming send ──────────────────────────────────────────────────────────
  const sendStreaming = useCallback(async (text) => {
    if (!text.trim() || streaming) return;

    setMessages(prev => [...prev, { role: 'user', text }]);
    setInput('');
    setStreaming(true);
    setStreamText('');

    const params = new URLSearchParams({ message: text });
    if (sessionId) params.append('sessionId', sessionId);

    try {
      const token = localStorage.getItem('eb_token');
      const evtSource = new EventSource(
        `/api/ai/copilot/stream?${params}`,
        // EventSource doesn't support headers; token is read from cookie or intercepted below
      );

      // Fallback: use fetch-based SSE for auth header support
      evtSource.close();

      const resp = await fetch(`/api/ai/copilot/stream?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!resp.ok) throw new Error('Stream failed');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let newSessionId = sessionId;
      let currentEventType = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEventType = line.slice(6).trim();
            continue;
          }
          if (line.trim() === '') { currentEventType = ''; continue; }
          if (!line.startsWith('data:')) continue;

          const data = line.slice(5).trim();

          if (data === '[DONE]') {
            const finalText = accumulated || 'Sorry, I could not generate a response. Please try again.';
            setMessages(prev => [...prev, { role: 'assistant', text: finalText }]);
            setStreamText('');
            setStreaming(false);
            setSessionId(newSessionId);
            refetchSessions();
            voice.speak(finalText);
            return;
          }

          if (currentEventType === 'error') throw new Error(data);

          // Session UUID — store but NEVER display in chat
          if (currentEventType === 'session') { newSessionId = data; currentEventType = ''; continue; }

          // Only accumulate actual AI text tokens
          if (currentEventType === 'token' || currentEventType === 'message' || currentEventType === '') {
            accumulated += data;
            setStreamText(accumulated);
          }
          currentEventType = '';
        }
      }

    } catch (err) {
      // Fallback to non-streaming if SSE fails
      console.warn('[Copilot] Stream failed, falling back to POST:', err.message);
      try {
        const res = await chatbotAPI.ask(text, history, sessionId);
        const answer = res.data?.data;
        if (answer?.sessionId) setSessionId(answer.sessionId);
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            text: answer?.answer || "I don't have enough information to answer that.",
          }
        ]);
        refetchSessions();
      } catch {
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: 'Something went wrong. Please try again.',
          error: true,
        }]);
      }
    } finally {
      setStreamText('');
      setStreaming(false);
    }
  }, [streaming, sessionId, history, refetchSessions]);

  // ── Tool invocation ─────────────────────────────────────────────────────────
  const toolMut = useMutation(
    ({ toolName, args }) =>
      aiAPI.invokeAgent({ toolName, arguments: args, prompt: input || toolName }).then(r => r.data?.data),
    {
      onSuccess: tool => {
        if (!tool) return;
        let text = tool.message || 'Done.';
        if (tool.data?.participants?.length > 0) {
          const rows = tool.data.participants.slice(0, 10)
            .map(p => `- **${p.name}** (${p.email}) — ${p.department || '—'} · ${p.college || '—'}`).join('\n');
          text = `Found **${tool.data.participants.length}** participant(s):\n\n${rows}`;
        }
        setMessages(prev => [...prev, {
          role: 'assistant', text,
          requiresConfirmation: tool.requiresConfirmation,
        }]);
      },
      onError: () => setMessages(prev => [...prev, { role: 'assistant', text: 'Tool action failed. Please try again.', error: true }]),
    }
  );

  const send = () => sendStreaming(input.trim());

  const newChat = () => {
    setSessionId(null);
    setMessages([{
      role: 'assistant',
      text: '## New conversation started\n\nHow can I help you today?',
    }]);
  };

  const loadSession = async (sid) => {
    setSessionId(sid);
    setMessages([{ role: 'assistant', text: '_Loading conversation…_' }]);
    // Re-trigger with a silent ping so history loads
    try {
      const res = await chatbotAPI.ask('continue', [], sid);
      const answer = res.data?.data;
      setMessages([{ role: 'assistant', text: answer?.answer || 'Session loaded. What would you like to do?' }]);
    } catch {
      setMessages([{ role: 'assistant', text: 'Session loaded. Continue your conversation below.' }]);
    }
  };

  const score = analytics?.performanceScore;

  return (
    <div className="min-h-screen bg-slate-50 px-3 pb-8 pt-6">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[260px_1fr_280px]">

        {/* ── Left sidebar ───────────────────────────────────────────────── */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-3">

            {/* New chat */}
            <button onClick={newChat}
              className="flex w-full items-center gap-2 rounded-xl border border-dashed border-teal-300 bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-700 transition hover:bg-teal-100">
              <FiPlus className="h-4 w-4" /> New conversation
            </button>

            {/* Recent chats */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <FiClock className="text-teal-500" /> Recent Chats
                </span>
                <button onClick={() => refetchSessions()} className="text-slate-400 hover:text-teal-600">
                  <FiRefreshCw className="h-3 w-3" />
                </button>
              </div>
              <div className="space-y-1">
                {(sessions || []).slice(0, 8).map(chat => (
                  <button key={chat.sessionId} onClick={() => loadSession(chat.sessionId)}
                    className={`w-full truncate rounded-lg px-3 py-2 text-left text-xs font-medium transition ${
                      sessionId === chat.sessionId
                        ? 'bg-teal-100 text-teal-800 font-semibold'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                    }`}>
                    {chat.title || 'Untitled'}
                  </button>
                ))}
                {(!sessions || sessions.length === 0) && (
                  <p className="text-xs text-slate-400 italic">No previous chats yet.</p>
                )}
              </div>
            </div>

            {/* Analytics snapshot */}
            {analytics && (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-700">
                  <FiActivity className="text-teal-500" /> Quick Stats
                </div>
                {[
                  ['Total Events',   analytics.totalEvents],
                  ['Registrations',  analytics.totalRegistrations],
                  ['Attendance',     analytics.totalAttendance],
                  ['Completed',      analytics.completedEvents],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between py-1.5 text-xs border-b border-slate-100 last:border-0">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-bold text-slate-900">{value ?? 0}</span>
                  </div>
                ))}
                {score && (
                  <div className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-center">
                    <p className="text-xs text-slate-500">Performance</p>
                    <p className="text-xl font-extrabold text-teal-700">{score.overallScore ?? 0}<span className="text-xs font-normal">/100</span></p>
                    <p className="text-xs font-bold text-teal-600">{score.badge || 'NONE'}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* ── Chat window ────────────────────────────────────────────────── */}
        <main className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" style={{ height: 'calc(100vh - 7rem)', minHeight: '500px' }}>

          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-600 text-white shadow">
                <MdOutlineAutoAwesome className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-base font-extrabold text-slate-900">EventCopilot</h1>
                <p className="text-xs text-slate-400">AI-powered organizer assistant · Gemini 2.5 Flash</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
              </span>
              <button onClick={newChat} title="New chat"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-teal-600">
                <FiPlus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-5">
            {messages.map((msg, idx) => (
              <MessageBubble key={idx} msg={msg} />
            ))}

            {/* Streaming token preview */}
            {streaming && streamText && (
              <div className="flex justify-start px-1">
                <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white">
                  <MdOutlineAutoAwesome className="h-4 w-4" />
                </div>
                <div className="max-w-[85%] rounded-2xl rounded-bl-none border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <Markdown text={streamText} />
                  <span className="inline-block h-4 w-0.5 animate-pulse bg-teal-500 align-middle ml-0.5" />
                </div>
              </div>
            )}

            {/* Typing indicator (before first token) */}
            {streaming && !streamText && (
              <div className="flex justify-start px-1">
                <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white">
                  <MdOutlineAutoAwesome className="h-4 w-4" />
                </div>
                <div className="rounded-2xl rounded-bl-none border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <TypingDots />
                </div>
              </div>
            )}
          </div>

          {/* Confirmation banner */}
          {confirm && (
            <ConfirmBanner
              message={confirm.message}
              onConfirm={() => { toolMut.mutate({ toolName: confirm.toolName, args: confirm.args }); setConfirm(null); }}
              onDismiss={() => setConfirm(null)}
            />
          )}

          {/* Input */}
          <div className="border-t border-slate-200 p-4">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                rows={1}
                placeholder="Ask anything about your events, analytics, participants, or planning…"
                className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100"
                style={{ minHeight: '44px', maxHeight: '120px' }}
              />
              <button onClick={send} disabled={!input.trim() || streaming}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow transition hover:bg-teal-700 disabled:opacity-40"
                aria-label="Send">
                <FiSend className="h-4 w-4" />
              </button>
              {/* Mic button */}
              <button
                onClick={voice.listening ? voice.stopListening : voice.startListening}
                title={voice.listening ? 'Stop recording' : 'Speak your message'}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition ${
                  voice.listening
                    ? 'bg-red-500 border-red-500 text-white animate-pulse'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-teal-400 hover:text-teal-600'
                }`}>
                {voice.listening ? <FiMicOff className="h-4 w-4" /> : <FiMic className="h-4 w-4" />}
              </button>
              {/* TTS toggle */}
              <button
                onClick={() => { voice.setVoiceOut(v => !v); if (voice.speaking) voice.stopSpeaking(); }}
                title={voice.voiceOut ? 'Disable voice output' : 'Enable voice output'}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition ${
                  voice.voiceOut
                    ? 'bg-teal-600 border-teal-600 text-white'
                    : 'bg-white border-slate-200 text-slate-400 hover:border-teal-400 hover:text-teal-600'
                }`}>
                {voice.voiceOut ? <FiVolume2 className="h-4 w-4" /> : <FiVolumeX className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-slate-400 text-center">
              EventCopilot can make mistakes. Verify important decisions independently.
            </p>
          </div>
        </main>

        {/* ── Right sidebar ───────────────────────────────────────────────── */}
        <aside>
          <div className="sticky top-20 space-y-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-700">
                <FiZap className="text-teal-500" /> Quick Prompts
              </div>
              <div className="grid gap-1.5">
                {PROMPTS.map(p => (
                  <button key={p.label} onClick={() => { setInput(p.msg); inputRef.current?.focus(); }}
                    className="flex items-start gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-600 transition hover:bg-teal-50 hover:text-teal-700">
                    <FiFileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            </div>


          </div>
        </aside>

      </div>
    </div>
  );
}
