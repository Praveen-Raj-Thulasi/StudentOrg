import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { FiBell, FiSend } from 'react-icons/fi';
import { organizationAnnouncementsAPI } from '../../services/api';

export default function AdminAnnouncements() {
  const [announcements, setAnnouncements] = useState([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    try {
      const response = await organizationAnnouncementsAPI.list({ limit: 50 });
      setAnnouncements(response.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not load announcements');
    }
  };

  useEffect(() => { refresh(); }, []);

  const publish = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await organizationAnnouncementsAPI.publish({ title, message });
      toast.success(response.data?.message || 'Announcement published');
      setTitle('');
      setMessage('');
      await refresh();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not publish announcement');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-700">Student Association</p>
        <h1 className="mt-1 text-3xl font-extrabold text-slate-950">Member announcements</h1>
        <p className="mt-2 text-sm text-slate-600">Publish one message to every active member’s notification inbox and email.</p>
      </header>

      <form onSubmit={publish} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="block text-sm font-semibold text-slate-700">
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required className="input-field mt-1 w-full" />
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          Message
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={5000} rows={5} required className="input-field mt-1 w-full resize-y" />
        </label>
        <button disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60">
          <FiSend /> {loading ? 'Publishing…' : 'Publish to active members'}
        </button>
      </form>

      <section className="mt-8 space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><FiBell /> Recent announcements</h2>
        {announcements.map((item) => (
          <article key={item._id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-bold text-slate-900">{item.title}</h3>
              <time className="text-xs text-slate-500">{new Date(item.publishedAt).toLocaleString()}</time>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.message}</p>
            <p className="mt-3 text-xs text-slate-500">Inbox: {item.recipientCount} · Email sent: {item.emailRecipientCount ?? 0}</p>
          </article>
        ))}
        {announcements.length === 0 && <p className="rounded-xl bg-white p-5 text-sm text-slate-500">No announcements yet.</p>}
      </section>
    </main>
  );
}
