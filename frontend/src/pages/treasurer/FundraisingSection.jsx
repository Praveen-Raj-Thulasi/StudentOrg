import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { treasurerAPI, fundraisingAPI } from '../../services/api';
import {
  FiPlusCircle,
  FiCheckCircle,
  FiXCircle,
  FiClock,
  FiAlertTriangle,
  FiDollarSign,
  FiFilter,
  FiInfo,
} from 'react-icons/fi';

export default function FundraisingSection() {
  const [subTab, setSubTab] = useState('campaigns'); // 'campaigns' | 'sponsorships' | 'collections'
  const [campaigns, setCampaigns] = useState([]);
  const [sponsorships, setSponsorships] = useState([]);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showSponsorModal, setShowSponsorModal] = useState(false);
  const [sponsorForm, setSponsorForm] = useState({
    campaignId: '',
    sponsorName: '',
    sponsorContact: '',
    sponsorEmail: '',
    tier: 'BRONZE',
    promisedAmount: '',
    notes: '',
  });

  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [collectionForm, setCollectionForm] = useState({
    campaignId: '',
    sponsorshipId: '',
    source: 'DIRECT_DONATION',
    amount: '',
    evidenceUrl: '',
    receiptReference: '',
  });

  const [rejectModalId, setRejectModalId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [campRes, spRes, colRes] = await Promise.all([
        fundraisingAPI.getCampaigns(),
        treasurerAPI.getSponsorships(),
        treasurerAPI.getCollections(),
      ]);
      setCampaigns(campRes.data?.data || []);
      setSponsorships(spRes.data?.data || []);
      setCollections(colRes.data?.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load fundraising data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateSponsorship = async (e) => {
    e.preventDefault();
    try {
      await treasurerAPI.createSponsorship({
        ...sponsorForm,
        promisedAmount: Number(sponsorForm.promisedAmount),
      });
      toast.success('Sponsorship commitment recorded (Promised amount does not count as income until received)');
      setShowSponsorModal(false);
      setSponsorForm({
        campaignId: '',
        sponsorName: '',
        sponsorContact: '',
        sponsorEmail: '',
        tier: 'BRONZE',
        promisedAmount: '',
        notes: '',
      });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record sponsorship');
    }
  };

  const handleRecordCollection = async (e) => {
    e.preventDefault();
    try {
      await treasurerAPI.recordCollection({
        ...collectionForm,
        campaignId: Number(collectionForm.campaignId),
        sponsorshipId: collectionForm.sponsorshipId ? Number(collectionForm.sponsorshipId) : undefined,
        amount: Number(collectionForm.amount),
      });
      toast.success('Collection recorded pending Treasurer verification');
      setShowCollectionModal(false);
      setCollectionForm({
        campaignId: '',
        sponsorshipId: '',
        source: 'DIRECT_DONATION',
        amount: '',
        evidenceUrl: '',
        receiptReference: '',
      });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record collection');
    }
  };

  const handleVerifyCollection = async (id) => {
    try {
      await treasurerAPI.verifyCollection(id, { verificationNotes: 'Verified received by Treasurer' });
      toast.success('Collection verified and posted to authoritative General Ledger');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to verify collection');
    }
  };

  const handleRejectCollection = async (e) => {
    e.preventDefault();
    if (!rejectModalId) return;
    try {
      await treasurerAPI.rejectCollection(rejectModalId, { reason: rejectReason });
      toast.success('Collection rejected');
      setRejectModalId(null);
      setRejectReason('');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject collection');
    }
  };

  return (
    <div className="space-y-6">
      {/* Notice Banner */}
      <div className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-900">
        <FiInfo className="h-5 w-5 shrink-0 text-blue-600" />
        <div>
          <span className="font-bold">Authoritative Accounting Rule:</span> Promised sponsorships are tracked as commitments and strictly{' '}
          <span className="font-bold underline">never count as received income</span> until evidence is verified by the Treasurer and posted to the General Ledger.
        </div>
      </div>

      {/* Sub Tabs and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex rounded-xl bg-slate-100 p-1">
          <button
            onClick={() => setSubTab('campaigns')}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              subTab === 'campaigns' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Campaigns ({campaigns.length})
          </button>
          <button
            onClick={() => setSubTab('sponsorships')}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              subTab === 'sponsorships' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sponsorships ({sponsorships.length})
          </button>
          <button
            onClick={() => setSubTab('collections')}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              subTab === 'collections' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Collections ({collections.length})
          </button>
        </div>

        <div className="flex gap-2">
          {subTab === 'sponsorships' && (
            <button
              onClick={() => setShowSponsorModal(true)}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
            >
              <FiPlusCircle className="h-4 w-4" /> Add Sponsorship Commitment
            </button>
          )}
          {subTab === 'collections' && (
            <button
              onClick={() => setShowCollectionModal(true)}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
            >
              <FiPlusCircle className="h-4 w-4" /> Record Fund Collection
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">Loading fundraising records...</div>
      ) : (
        <>
          {/* CAMPAIGNS SUB-TAB */}
          {subTab === 'campaigns' && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {campaigns.length === 0 ? (
                <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                  No fundraising campaigns created yet.
                </div>
              ) : (
                campaigns.map((camp) => (
                  <div key={camp.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-emerald-600">{camp.campaignCode}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                        {camp.status}
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-900 text-sm">{camp.title}</h4>
                    <p className="text-xs text-slate-500 line-clamp-2">{camp.description}</p>
                    <div>
                      <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                        <span>Target: ₹{camp.targetAmount?.toLocaleString()}</span>
                        <span>Collected: ₹{camp.collectedAmount?.toLocaleString() ?? 0}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-300"
                          style={{ width: `${Math.min(100, camp.progressPercent || 0)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        {camp.progressPercent || 0}% achieved • {camp.donorCount || 0} donors
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* SPONSORSHIPS SUB-TAB */}
          {subTab === 'sponsorships' && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  <tr>
                    <th className="px-4 py-3">Code / Sponsor</th>
                    <th className="px-4 py-3">Tier</th>
                    <th className="px-4 py-3">Promised Amount</th>
                    <th className="px-4 py-3">Verified Received</th>
                    <th className="px-4 py-3">Outstanding</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sponsorships.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-8 text-center text-slate-500">
                        No sponsorships recorded.
                      </td>
                    </tr>
                  ) : (
                    sponsorships.map((sp) => (
                      <tr key={sp.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <p className="font-mono font-bold text-slate-900">{sp.sponsorshipCode}</p>
                          <p className="font-semibold text-slate-800">{sp.sponsorName}</p>
                          {sp.sponsorEmail && <p className="text-[10px] text-slate-400">{sp.sponsorEmail}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                            {sp.tier}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-amber-700">
                          ₹{sp.promisedAmount?.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-bold text-emerald-700">
                          ₹{(sp.receivedAmount || 0)?.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-600">
                          ₹{Math.max(0, (sp.promisedAmount || 0) - (sp.receivedAmount || 0)).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              sp.status === 'VERIFIED_RECEIVED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : sp.status === 'PARTIALLY_RECEIVED'
                                ? 'bg-blue-100 text-blue-800'
                                : sp.status === 'PROMISED'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {sp.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* COLLECTIONS SUB-TAB */}
          {subTab === 'collections' && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  <tr>
                    <th className="px-4 py-3">Collection # / Collector</th>
                    <th className="px-4 py-3">Source & Evidence</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Ledger Link</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {collections.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-8 text-center text-slate-500">
                        No fund collections recorded.
                      </td>
                    </tr>
                  ) : (
                    collections.map((col) => (
                      <tr key={col.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <p className="font-mono font-bold text-slate-900">{col.collectionNumber}</p>
                          <p className="text-[11px] text-slate-500">By {col.collectorName}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                            {col.source}
                          </span>
                          {col.receiptReference && (
                            <p className="text-[10px] text-slate-500 mt-0.5">Ref: {col.receiptReference}</p>
                          )}
                          {col.evidenceUrl && (
                            <a
                              href={col.evidenceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-blue-600 underline block mt-0.5"
                            >
                              Evidence Link
                            </a>
                          )}
                        </td>
                        <td className="px-4 py-3 font-bold text-emerald-700">
                          ₹{col.amount?.toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              col.status === 'VERIFIED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : col.status === 'REJECTED'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {col.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                          {col.ledgerEntryId ? `Ledger #${col.ledgerEntryId}` : 'Pending Post'}
                        </td>
                        <td className="px-4 py-3 text-right space-x-1.5">
                          {col.status === 'RECORDED' && (
                            <>
                              <button
                                onClick={() => handleVerifyCollection(col.id)}
                                className="rounded bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
                              >
                                Verify & Post to Ledger
                              </button>
                              <button
                                onClick={() => setRejectModalId(col.id)}
                                className="rounded bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* CREATE SPONSORSHIP MODAL */}
      {showSponsorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">Add Sponsorship Commitment</h3>
            <p className="text-xs text-slate-500 mt-1">
              Record sponsor commitment. Promised funds will not appear as income until verified.
            </p>
            <form onSubmit={handleCreateSponsorship} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700">Select Campaign</label>
                <select
                  required
                  value={sponsorForm.campaignId}
                  onChange={(e) => setSponsorForm({ ...sponsorForm, campaignId: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">-- Choose Campaign --</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.campaignCode} - {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">Sponsor Name / Company</label>
                <input
                  type="text"
                  required
                  value={sponsorForm.sponsorName}
                  onChange={(e) => setSponsorForm({ ...sponsorForm, sponsorName: e.target.value })}
                  placeholder="e.g. Acme Tech Solutions"
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700">Tier</label>
                  <select
                    value={sponsorForm.tier}
                    onChange={(e) => setSponsorForm({ ...sponsorForm, tier: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="TITLE">TITLE</option>
                    <option value="PLATINUM">PLATINUM</option>
                    <option value="GOLD">GOLD</option>
                    <option value="SILVER">SILVER</option>
                    <option value="BRONZE">BRONZE</option>
                    <option value="PARTNER">PARTNER</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700">Promised Amount (₹)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={sponsorForm.promisedAmount}
                    onChange={(e) => setSponsorForm({ ...sponsorForm, promisedAmount: e.target.value })}
                    placeholder="e.g. 50000"
                    className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">Sponsor Email (Optional)</label>
                <input
                  type="email"
                  value={sponsorForm.sponsorEmail}
                  onChange={(e) => setSponsorForm({ ...sponsorForm, sponsorEmail: e.target.value })}
                  placeholder="contact@sponsor.com"
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSponsorModal(false)}
                  className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  Save Commitment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECORD COLLECTION MODAL */}
      {showCollectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">Record Fund Collection</h3>
            <p className="text-xs text-slate-500 mt-1">
              Submit received funds with evidence. Must be verified by Treasurer before posting to General Ledger.
            </p>
            <form onSubmit={handleRecordCollection} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700">Select Campaign</label>
                <select
                  required
                  value={collectionForm.campaignId}
                  onChange={(e) => setCollectionForm({ ...collectionForm, campaignId: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">-- Choose Campaign --</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.campaignCode} - {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700">Source</label>
                  <select
                    value={collectionForm.source}
                    onChange={(e) => setCollectionForm({ ...collectionForm, source: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="SPONSORSHIP">SPONSORSHIP</option>
                    <option value="DIRECT_DONATION">DIRECT_DONATION</option>
                    <option value="CROWDFUNDING">CROWDFUNDING</option>
                    <option value="EVENT_STALL">EVENT_STALL</option>
                    <option value="ALUMNI_GIFT">ALUMNI_GIFT</option>
                    <option value="OTHER">OTHER</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700">Amount (₹)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={collectionForm.amount}
                    onChange={(e) => setCollectionForm({ ...collectionForm, amount: e.target.value })}
                    placeholder="e.g. 5000"
                    className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {collectionForm.source === 'SPONSORSHIP' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700">Linked Sponsorship (Optional)</label>
                  <select
                    value={collectionForm.sponsorshipId}
                    onChange={(e) => setCollectionForm({ ...collectionForm, sponsorshipId: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="">-- Unlinked / General --</option>
                    {sponsorships.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.sponsorshipCode} - {s.sponsorName} (Promised ₹{s.promisedAmount})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700">Receipt / Transaction Reference</label>
                <input
                  type="text"
                  value={collectionForm.receiptReference}
                  onChange={(e) => setCollectionForm({ ...collectionForm, receiptReference: e.target.value })}
                  placeholder="e.g. UTR-9821382193 / REC-009"
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">Evidence Link / Receipt URL</label>
                <input
                  type="url"
                  value={collectionForm.evidenceUrl}
                  onChange={(e) => setCollectionForm({ ...collectionForm, evidenceUrl: e.target.value })}
                  placeholder="https://example.com/receipt.pdf"
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCollectionModal(false)}
                  className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  Submit Collection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">Reject Fund Collection</h3>
            <form onSubmit={handleRejectCollection} className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700">Rejection Justification</label>
                <textarea
                  rows="3"
                  required
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Unverified bank transfer reference, invalid remittance slip..."
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-rose-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectModalId(null)}
                  className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
                >
                  Confirm Reject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
