// Shared UI primitives used across all pages.
import Icon from './Icons'

export function Spinner({ className = 'h-9 w-9' }) {
  return (
    <div className="flex w-full items-center justify-center py-16">
      <div className={`${className} animate-spin rounded-full border-[3px] border-brand-teal/20 border-t-brand-teal`} />
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex animate-fadeUp flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

const STATUS_STYLES = {
  draft: 'bg-gray-100 text-gray-600',
  not_started: 'bg-gray-100 text-gray-500',
  submitted: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  under_review: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  open: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  in_review: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  resolved: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  mitigating: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  closed: 'bg-gray-100 text-gray-500',
  completed: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  done: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  in_progress: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  returned: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  active: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  inactive: 'bg-gray-100 text-gray-500',
  overdue: 'bg-red-50 text-red-700 ring-1 ring-red-200',
}

const STATUS_TEXT = {
  draft: 'Draft',
  not_started: 'Not Started',
  submitted: 'Submitted',
  under_review: 'Under Review',
  open: 'Open',
  in_review: 'In Review',
  resolved: 'Resolved',
  mitigating: 'Mitigating',
  closed: 'Closed',
  completed: 'Completed',
  done: 'Done',
  in_progress: 'In Progress',
  returned: 'Returned for Revision',
  approved: 'Approved',
  active: 'Active',
  inactive: 'Inactive',
  overdue: 'Overdue',
}

const STATUS_DOT = {
  in_progress: 'bg-blue-500',
  not_started: 'bg-gray-400',
  submitted: 'bg-blue-500',
  under_review: 'bg-purple-500',
  open: 'bg-blue-500',
  in_review: 'bg-purple-500',
  resolved: 'bg-emerald-500',
  mitigating: 'bg-amber-500',
  closed: 'bg-gray-400',
  completed: 'bg-emerald-500',
  done: 'bg-emerald-500',
  returned: 'bg-amber-500',
  approved: 'bg-emerald-500',
  active: 'bg-emerald-500',
  inactive: 'bg-gray-400',
  overdue: 'bg-red-500',
  draft: 'bg-gray-400',
}

export function StatusBadge({ status }) {
  return (
    <span className={`chip ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-600'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status] || 'bg-gray-400'}`} />
      {STATUS_TEXT[status] || status}
    </span>
  )
}

export function RoleChip({ role, label }) {
  return <span className="chip bg-brand-tealLight text-brand-tealDeep ring-1 ring-brand-teal/20">{label || role}</span>
}

export function EmptyState({ title, message, icon = 'doc' }) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-tealLight text-brand-teal">
        <Icon name={icon} className="h-7 w-7" />
      </div>
      <p className="font-bold text-gray-800">{title}</p>
      {message && <p className="mt-1.5 max-w-sm text-sm text-gray-500">{message}</p>}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide = false }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-brand-ink/50 p-4 backdrop-blur-sm sm:items-center">
      <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} my-8 animate-fadeUp shadow-lift`}>
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-extrabold tracking-tight text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

export function ErrorBanner({ error, onDismiss }) {
  if (!error) return null
  return (
    <div className="mb-4 flex animate-fadeUp items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <span className="flex items-start gap-2">
        <Icon name="alert" className="mt-0.5 h-4 w-4 flex-shrink-0" />
        {String(error)}
      </span>
      {onDismiss && (
        <button onClick={onDismiss} className="font-bold">
          <Icon name="x" className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export function Table({ headers, children }) {
  return (
    <div className="card overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-100">
        <thead className="bg-gray-50/70">
          <tr>
            {headers.map((h) => (
              <th key={h} className="th">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 bg-white">{children}</tbody>
      </table>
    </div>
  )
}

const STAT_TONES = {
  default: { text: 'text-gray-900', iconBg: 'bg-gray-100 text-gray-500' },
  teal: { text: 'text-brand-tealDark', iconBg: 'bg-brand-tealLight text-brand-teal' },
  red: { text: 'text-red-600', iconBg: 'bg-red-50 text-red-500' },
  amber: { text: 'text-amber-600', iconBg: 'bg-amber-50 text-amber-500' },
  green: { text: 'text-emerald-600', iconBg: 'bg-emerald-50 text-emerald-500' },
  blue: { text: 'text-blue-600', iconBg: 'bg-blue-50 text-blue-500' },
}

export function StatCard({ label, value, tone = 'default', icon, onClick }) {
  const t = STAT_TONES[tone] || STAT_TONES.default
  return (
    <button
      onClick={onClick}
      className={`card group px-5 py-4 text-left transition-all duration-200 ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lift' : 'cursor-default'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
          <p className={`mt-1.5 text-3xl font-extrabold tracking-tight ${t.text}`}>{value}</p>
        </div>
        {icon && (
          <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${t.iconBg}`}>
            <Icon name={icon} className="h-5 w-5" />
          </span>
        )}
      </div>
    </button>
  )
}

export function ProgressBar({ value, className = '' }) {
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-gray-100 ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand-teal to-emerald-400 transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

// Circular progress ring (used on the HOD hero)
export function Ring({ value, size = 110, stroke = 10, label }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const filled = (Math.min(100, Math.max(0, value)) / 100) * c
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.15)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#1FCABF"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${filled} ${c - filled}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold text-white">{Math.round(value)}%</span>
        {label && <span className="text-[10px] font-semibold uppercase tracking-wider text-white/60">{label}</span>}
      </div>
    </div>
  )
}

export function Avatar({ name = '?', className = 'h-9 w-9 text-sm' }) {
  const initials = name
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-teal to-brand-tealDeep font-bold text-white ${className}`}
    >
      {initials || '?'}
    </span>
  )
}
