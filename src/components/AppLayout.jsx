import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ROLES, ROLE_LABELS } from '../lib/roles'
import { client, DB_ID, COL, listAll, Query } from '../lib/appwrite'
import Icon from './Icons'
import { Avatar } from './UI'

const NAV_SECTIONS = [
  {
    title: null,
    items: [
      { to: '/', label: 'Dashboard', icon: 'home', end: true },
      { to: '/tasks', label: 'My Tasks', icon: 'checkCircle' },
      { to: '/notifications', label: 'Notifications', icon: 'bell' },
    ],
  },
  {
    title: 'Workflows',
    items: [
      { to: '/workflows/mine', label: 'My Submissions', icon: 'send' },
      { to: '/workflows/new', label: 'New Submission', icon: 'plus', roles: [ROLES.LECTURER, ROLES.MODULE_LEADER, ROLES.SUPER_ADMIN] },
      { to: '/workflows/approvals', label: 'Approvals Queue', icon: 'clipboard', approverOnly: true },
      { to: '/workflows/templates', label: 'Workflow Templates', icon: 'cog', roles: [ROLES.SUPER_ADMIN] },
    ],
  },
  {
    title: 'Compliance',
    items: [
      { to: '/subject-files', label: 'Subject Files', icon: 'doc' },
      { to: '/cases', label: 'Support & Cases', icon: 'users', roles: [ROLES.LECTURER, ROLES.MODULE_LEADER, ROLES.LEVEL_COORDINATOR, ROLES.HOD] },
      { to: '/appraisals', label: 'Appraisals', icon: 'briefcase' },
      { to: '/governance', label: 'Governance', icon: 'shield', roles: [ROLES.HOD] },
      { to: '/reports', label: 'Reports & Audit', icon: 'chart', roles: [ROLES.HOD, ROLES.SUPER_ADMIN] },
    ],
  },
  {
    title: 'Academic Structure',
    roles: [ROLES.SUPER_ADMIN, ROLES.ACADEMIC_ADMIN, ROLES.HOD],
    items: [
      { to: '/structure/academic-years', label: 'Academic Years', icon: 'calendar' },
      { to: '/structure/programmes', label: 'Programmes', icon: 'gradCap' },
      { to: '/structure/levels', label: 'Levels', icon: 'layers' },
      { to: '/structure/semesters', label: 'Semesters', icon: 'clock' },
      { to: '/structure/intakes', label: 'Intakes / Batches', icon: 'users' },
      { to: '/structure/modules', label: 'Modules', icon: 'briefcase' },
      { to: '/structure/offerings', label: 'Module Offerings', icon: 'book' },
      { to: '/structure/subjects', label: 'Subjects', icon: 'doc' },
    ],
  },
  {
    title: 'Administration',
    roles: [ROLES.SUPER_ADMIN, ROLES.HOD],
    items: [
      { to: '/admin/users', label: 'Users & Roles', icon: 'shield', roles: [ROLES.SUPER_ADMIN] },
      { to: '/admin/deadline-rules', label: 'Deadline Rules', icon: 'clock', roles: [ROLES.SUPER_ADMIN, ROLES.HOD] },
    ],
  },
]

function SidebarContent({ onNavigate }) {
  const { hasRole, isApprover } = useAuth()

  const visibleSections = NAV_SECTIONS.map((section) => {
    if (section.roles && !hasRole(...section.roles)) return null
    const items = section.items.filter((item) => {
      if (item.approverOnly) return isApprover
      if (item.roles) return hasRole(...item.roles)
      return true
    })
    if (!items.length) return null
    return { ...section, items }
  }).filter(Boolean)

  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
      {visibleSections.map((section, i) => (
        <div key={i}>
          {section.title && (
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">{section.title}</p>
          )}
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all duration-150 ${
                      isActive
                        ? 'bg-brand-teal/15 text-white shadow-[inset_0_0_0_1px_rgba(25,185,175,0.25)]'
                        : 'text-white/55 hover:bg-white/5 hover:text-white'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-teal" />}
                      <Icon name={item.icon} className={`h-[18px] w-[18px] ${isActive ? 'text-brand-teal' : 'text-white/40 group-hover:text-white/80'}`} />
                      {item.label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function SidebarShell({ children }) {
  return (
    <div
      className="flex h-full flex-col"
      style={{
        background:
          'radial-gradient(500px 240px at 100% 0%, rgba(25,185,175,0.14), transparent 60%), linear-gradient(180deg, #0C1D1B 0%, #102825 100%)',
      }}
    >
      {children}
    </div>
  )
}

function SidebarBrand() {
  return (
    <div className="flex h-16 flex-shrink-0 items-center gap-3 border-b border-white/[0.06] px-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white p-1.5">
        <img src="/apiitlogo.png" alt="APIIT" className="h-full w-full object-contain" />
      </span>
      <div>
        <p className="text-sm font-extrabold tracking-wide text-white">AQCMS</p>
        <p className="text-[10px] font-medium tracking-wide text-white/40">APIIT</p>
      </div>
    </div>
  )
}

export default function AppLayout() {
  const { user, roles, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [toast, setToast] = useState(null) // most recent live notification

  const refreshUnread = useCallback(() => {
    if (!user) return
    listAll(COL.NOTIFICATIONS, [Query.equal('userId', user.$id), Query.equal('read', false)])
      .then((docs) => setUnread(docs.length))
      .catch(() => {})
  }, [user])

  useEffect(() => {
    refreshUnread()
  }, [refreshUnread, location.pathname])

  // Realtime: no manual refresh needed — Appwrite pushes notification events
  // over WebSocket (permission-scoped, so users only receive their own).
  useEffect(() => {
    if (!user) return
    const unsubscribe = client.subscribe(
      `databases.${DB_ID}.collections.${COL.NOTIFICATIONS}.documents`,
      (event) => {
        const doc = event.payload
        if (doc?.userId !== user.$id) return
        const isCreate = event.events.some((e) => e.endsWith('.create'))
        const isUpdate = event.events.some((e) => e.endsWith('.update'))
        if (isCreate && !doc.read) {
          // Server-created notification (permissions present at create)
          setUnread((u) => u + 1)
          setToast(doc)
        } else if (isUpdate && !doc.read) {
          // Client-created notification becomes visible when the function
          // stamps recipient permissions (arrives as an update event)
          setToast(doc)
          refreshUnread()
        } else {
          refreshUnread() // marked read / deleted elsewhere
        }
      },
    )
    return () => {
      try { unsubscribe() } catch { /* socket already closed */ }
    }
  }, [user, refreshUnread])

  // Auto-dismiss the toast
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6500)
    return () => clearTimeout(t)
  }, [toast])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] lg:block">
        <SidebarShell>
          <SidebarBrand />
          <SidebarContent />
          <div className="border-t border-white/[0.06] p-3">
            <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
              <Avatar name={user?.name} className="h-8 w-8 text-xs" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-white">{user?.name}</p>
                <p className="truncate text-[10px] text-white/40">{(roles[0] && ROLE_LABELS[roles[0]]) || 'Staff'}</p>
              </div>
              <button onClick={handleLogout} title="Logout" className="text-white/40 transition-colors hover:text-brand-teal">
                <Icon name="logout" className="h-[18px] w-[18px]" />
              </button>
            </div>
          </div>
        </SidebarShell>
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-brand-ink/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-[268px] shadow-lift">
            <SidebarShell>
              <div className="flex items-center justify-between pr-3">
                <SidebarBrand />
                <button onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-white/50 hover:text-white">
                  <Icon name="x" className="h-5 w-5" />
                </button>
              </div>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </SidebarShell>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[248px]">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200/70 bg-white/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="rounded-xl p-2 text-gray-500 hover:bg-gray-100 lg:hidden">
              <Icon name="menu" className="h-6 w-6" />
            </button>
            <img src="/apiitlogo.png" alt="APIIT" className="h-7 lg:hidden" />
            <p className="hidden text-[13px] font-semibold text-gray-400 lg:block">
              Academic Quality &amp; Compliance Management System
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              to="/notifications"
              className="relative rounded-xl p-2 text-gray-500 transition-colors hover:bg-brand-tealLight hover:text-brand-tealDark"
              title="Notifications"
            >
              <Icon name="bell" className="h-[22px] w-[22px]" />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-teal px-1 text-[10px] font-bold text-white shadow-glow">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
            <div className="hidden items-center gap-3 sm:flex">
              <div className="text-right">
                <p className="text-sm font-bold leading-tight text-gray-900">{user?.name?.replace(/\(.*?\)/g, '').trim()}</p>
                <p className="text-[11px] text-gray-400">{roles.map((r) => ROLE_LABELS[r] || r).join(' · ') || 'No role assigned'}</p>
              </div>
              <Avatar name={user?.name} />
            </div>
            <button onClick={handleLogout} className="btn-ghost !px-2 sm:hidden" title="Logout">
              <Icon name="logout" className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Live notification toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-[60] w-[min(380px,calc(100vw-2rem))] animate-fadeUp">
          <div className="card flex items-start gap-3 border-l-4 border-l-brand-teal p-4 shadow-lift">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-tealLight text-brand-teal">
              <Icon name="bell" className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wider text-brand-tealDark">New notification</p>
              <p className="mt-0.5 line-clamp-3 text-sm text-gray-700">{toast.message}</p>
              <button
                onClick={() => {
                  setToast(null)
                  navigate(toast.relatedId ? `/workflows/${toast.relatedId}` : '/notifications')
                }}
                className="mt-1.5 text-xs font-bold text-brand-tealDark hover:underline"
              >
                Open →
              </button>
            </div>
            <button onClick={() => setToast(null)} className="flex-shrink-0 rounded-lg p-1 text-gray-300 hover:text-gray-500">
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
