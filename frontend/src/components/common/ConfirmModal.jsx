import { motion, AnimatePresence } from 'framer-motion';
import { FiAlertTriangle, FiInfo, FiTrash2, FiX } from 'react-icons/fi';

export default function ConfirmModal({
  isOpen,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger', // 'danger' | 'warning' | 'primary'
  loading = false,
  onConfirm,
  onClose,
}) {
  if (!isOpen) return null;

  const btnStyle = {
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-red-500/20',
    warning: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-500/20',
    primary: 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-500/20',
  }[variant] || 'bg-blue-600 hover:bg-blue-700 text-white';

  const icon = {
    danger: <FiTrash2 className="w-6 h-6 text-red-600" />,
    warning: <FiAlertTriangle className="w-6 h-6 text-amber-600" />,
    primary: <FiInfo className="w-6 h-6 text-teal-600" />,
  }[variant] || <FiAlertTriangle className="w-6 h-6 text-amber-600" />;

  const bgTone = {
    danger: 'bg-red-50',
    warning: 'bg-amber-50',
    primary: 'bg-teal-50',
  }[variant] || 'bg-amber-50';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-xl shrink-0 ${bgTone}`}>
              {icon}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-slate-900">{title}</h3>
              <p className="mt-1 text-sm text-slate-600 leading-relaxed">{message}</p>
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all shadow-md disabled:opacity-50 flex items-center gap-2 ${btnStyle}`}
            >
              {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {confirmText}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
