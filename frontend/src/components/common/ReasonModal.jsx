import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiAlertTriangle, FiX } from 'react-icons/fi';

export default function ReasonModal({
  isOpen,
  title = 'Provide Justification',
  subtitle = 'Please provide details for this action.',
  label = 'Reason',
  placeholder = 'Type the reason or instructions here...',
  confirmText = 'Submit',
  cancelText = 'Cancel',
  confirmVariant = 'danger', // 'danger' | 'warning' | 'primary'
  required = true,
  loading = false,
  apiError = '',
  initialValue = '',
  onSubmit,
  onClose,
}) {
  const [reason, setReason] = useState(initialValue);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setReason(initialValue);
      setValidationError('');
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (required && !trimmed) {
      setValidationError('A reason must be provided before submitting.');
      return;
    }
    setValidationError('');
    onSubmit(trimmed);
  };

  const btnStyle = {
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-red-500/20',
    warning: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-500/20',
    primary: 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-500/20',
  }[confirmVariant] || 'bg-red-600 hover:bg-red-700 text-white';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">{title}</h3>
              {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                {label} {required && <span className="text-red-500">*</span>}
              </label>
              <textarea
                rows={4}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (validationError) setValidationError('');
                }}
                placeholder={placeholder}
                disabled={loading}
                className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all disabled:bg-slate-50"
              />
              {validationError && (
                <p className="mt-1.5 text-xs font-medium text-red-600 flex items-center gap-1">
                  <FiAlertTriangle className="w-3.5 h-3.5" /> {validationError}
                </p>
              )}
            </div>

            {apiError && (
              <div className="rounded-xl bg-red-50 p-3 text-xs font-medium text-red-700 border border-red-200">
                ⚠️ {apiError}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                {cancelText}
              </button>
              <button
                type="submit"
                disabled={loading}
                className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all shadow-md disabled:opacity-50 flex items-center gap-2 ${btnStyle}`}
              >
                {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {confirmText}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
