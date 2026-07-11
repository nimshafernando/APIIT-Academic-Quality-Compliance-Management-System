import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { databases, DB_ID, COL, listAll, Query, fmtDateTime } from '../lib/appwrite'
import { ROLES, ROLE_LABELS } from '../lib/roles'
import { useAuth } from '../context/AuthContext'
import { Spinner, StatCard, EmptyState, ErrorBanner, StatusBadge, ProgressBar, Ring, Avatar } from '../components/UI'
import Icon from '../components/Icons'
import InstanceTable from './workflows/InstanceTable'
import { loadApprovalsQueue } from './workflows/ApprovalsQueue'
import { dueLabel, daysUntil } from '../lib/tasks'

const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const firstName = (name = '') => name.replace(/\(.*?\)/g, '').trim().split(' ')[0]

function Section({ title, subtitle, children, action, className = '' }) {
  return (
    <section className={`mb-8 animate-fadeUp ${className}`}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-gray-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/* ------------------------------------------------------------------ HOD --- */

function HodHero({ user, allInstances }) {
  const approved = allInstances.filter((i) => i.status === 'approved').length
  const pct = allInstances.length ? (approved / allInstances.length) * 100 : 0
  const pendingMe = allInstances.filter((i) => i.status === 'in_progress' && i.currentStageRole === ROLES.HOD).length
  const atRisk = allInstances.filter((i) => i.status === 'returned').length
  return (
    <div className="hero-dark mb-8 animate-fadeUp p-7 sm:p-8">
      <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-teal">Head of School · Command View</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Good day, {firstName(user.name)}</h1>
          <p className="mt-1.5 text-sm text-white/50">{today}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="chip bg-white/10 text-white ring-1 ring-white/15">
              <Icon name="clipboard" className="h-3.5 w-3.5 text-brand-teal" />
              {pendingMe} awaiting your sign-off
            </span>
            <span className={`chip ${atRisk ? 'bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30' : 'bg-white/10 text-white/70 ring-1 ring-white/15'}`}>
              <Icon name="alert" className="h-3.5 w-3.5" />
              {atRisk} returned / at risk
            </span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <Ring value={pct} label="approved" />
          <div className="hidden text-sm sm:block">
            <p className="font-bold text-white">School-wide compliance</p>
            <p className="mt-1 max-w-[180px] text-[13px] leading-snug text-white/50">
              {approved} of {allInstances.length} tracked submissions fully signed off.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ComplianceGrid({ instances }) {
  const byLevel = {}
  for (const inst of instances) {
    const key = inst.levelName || 'Unassigned'
    byLevel[key] ||= { in_progress: 0, returned: 0, approved: 0, total: 0 }
    byLevel[key][inst.status] = (byLevel[key][inst.status] || 0) + 1
    byLevel[key].total++
  }
  const levels = Object.entries(byLevel).sort(([a], [b]) => a.localeCompare(b))
  if (!levels.length) return <EmptyState title="No submissions yet" message="School-wide compliance will appear here once workflows begin." icon="chart" />
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {levels.map(([level, c]) => {
        const pct = c.total ? Math.round((c.approved / c.total) * 100) : 0
        return (
          <div key={level} className="card-hover p-5">
            <div className="flex items-center justify-between">
              <p className="font-extrabold tracking-tight text-gray-900">{level}</p>
              <span className={`chip ${c.returned ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' : 'bg-brand-tealLight text-brand-tealDeep ring-1 ring-brand-teal/20'}`}>
                {c.returned ? 'At risk' : 'On track'}
              </span>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <p className="text-2xl font-extrabold text-brand-tealDark">{pct}%</p>
              <p className="text-[11px] font-semibold text-gray-400">{c.approved}/{c.total} approved</p>
            </div>
            <ProgressBar value={pct} className="mt-2" />
            <div className="mt-3 flex gap-3 text-[11px] font-semibold text-gray-400">
              <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-blue-500" />{c.in_progress} in review</span>
              <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{c.returned} returned</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ActivityFeed({ actions }) {
  const verbs = { submit: 'submitted', approve: 'approved', return: 'returned', resubmit: 'resubmitted' }
  const colors = { approve: 'text-emerald-600', return: 'text-amber-600', submit: 'text-blue-600', resubmit: 'text-blue-600' }
  if (!actions.length) return <EmptyState title="No activity yet" icon="clock" />
  return (
    <div className="card divide-y divide-gray-50">
      {actions.map((a) => (
        <div key={a.$id} className="flex items-center gap-3 px-5 py-3.5">
          <Avatar name={a.userName} className="h-8 w-8 text-[10px]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-gray-700">
              <span className="font-bold text-gray-900">{a.userName?.replace(/\(.*?\)/g, '').trim()}</span>{' '}
              <span className={colors[a.action] || 'text-gray-500'}>{verbs[a.action] || a.action}</span>
              {a.stageLabel && <span className="text-gray-400"> · {a.stageLabel}</span>}
            </p>
            {a.comment && <p className="truncate text-xs text-gray-400">“{a.comment}”</p>}
          </div>
          <p className="flex-shrink-0 text-[11px] font-medium text-gray-400">{fmtDateTime(a.$createdAt)}</p>
        </div>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------- Super Admin --- */

function SuperAdminHero({ user, profiles, templates }) {
  const navigate = useNavigate()
  return (
    <div className="hero-dark mb-8 animate-fadeUp p-7 sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-teal">System Control Centre</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Hello, {firstName(user.name)}</h1>
          <p className="mt-1.5 text-sm text-white/50">
            {today} · {profiles.filter((p) => p.status === 'active').length} active accounts · {templates.length} workflow templates
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button onClick={() => navigate('/admin/users')} className="btn bg-brand-teal text-white shadow-glow hover:bg-brand-tealDark">
            <Icon name="plus" className="h-4 w-4" /> Create Account
          </button>
          <button onClick={() => navigate('/workflows/templates')} className="btn bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15">
            <Icon name="cog" className="h-4 w-4" /> Templates
          </button>
          <button onClick={() => navigate('/structure/academic-years')} className="btn bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15">
            <Icon name="layers" className="h-4 w-4" /> Structure
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfigChecklist({ counts }) {
  const items = [
    { label: 'Academic years', to: '/structure/academic-years', count: counts.years, icon: 'calendar' },
    { label: 'Programmes', to: '/structure/programmes', count: counts.programmes, icon: 'gradCap' },
    { label: 'Modules', to: '/structure/modules', count: counts.modules, icon: 'briefcase' },
    { label: 'Module offerings', to: '/structure/offerings', count: counts.offerings, icon: 'book' },
    { label: 'Intakes / batches', to: '/structure/intakes', count: counts.intakes, icon: 'users' },
    { label: 'Workflow templates', to: '/workflows/templates', count: counts.templates, icon: 'cog' },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => (
        <Link key={it.label} to={it.to} className="card-hover group flex items-center gap-4 p-4">
          <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${it.count ? 'bg-brand-tealLight text-brand-teal' : 'bg-amber-50 text-amber-500'}`}>
            <Icon name={it.count ? it.icon : 'alert'} className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-bold text-gray-800">{it.label}</p>
            <p className="text-xs text-gray-400">{it.count ? `${it.count} configured` : 'Not configured yet'}</p>
          </div>
          <Icon name="arrowRight" className="h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-teal" />
        </Link>
      ))}
    </div>
  )
}

/* ------------------------------------------------- Generic role heroes ---- */

function RoleHero({ user, kicker, headline, chips = [], cta }) {
  return (
    <div className="hero-dark mb-8 animate-fadeUp p-7 sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-teal">{kicker}</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Hi, {firstName(user.name)}</h1>
          <p className="mt-1.5 text-sm text-white/50">{today}</p>
          {headline && <p className="mt-3 max-w-lg text-sm text-white/60">{headline}</p>}
          {chips.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {chips.map((c) => (
                <span key={c} className="chip bg-white/10 text-white/80 ring-1 ring-white/15">{c}</span>
              ))}
            </div>
          )}
        </div>
        {cta}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ Dashboard --- */

export default function Dashboard() {
  const { user, roles, assignments } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const is = (r) => roles.includes(r)
  const seesSchoolWide = is(ROLES.HOD) || is(ROLES.SUPER_ADMIN)

  useEffect(() => {
    ;(async () => {
      try {
        const wantsStructure = is(ROLES.SUPER_ADMIN) || is(ROLES.ACADEMIC_ADMIN)
        const [mine, queue, unread, allInstances, profiles, templates, intakes, offerings, myOfferings, recentActions, years, programmes, modules, myTasks, hodCases, hodRisks, hodAppraisals] =
          await Promise.all([
            listAll(COL.WORKFLOW_INSTANCES, [Query.equal('submittedBy', user.$id), Query.orderDesc('$updatedAt')]),
            loadApprovalsQueue(user, roles, assignments),
            listAll(COL.NOTIFICATIONS, [Query.equal('userId', user.$id), Query.equal('read', false)]),
            seesSchoolWide || is(ROLES.LEVEL_COORDINATOR) ? listAll(COL.WORKFLOW_INSTANCES, [Query.orderDesc('$updatedAt')]) : Promise.resolve([]),
            is(ROLES.SUPER_ADMIN) ? listAll(COL.PROFILES) : Promise.resolve([]),
            is(ROLES.SUPER_ADMIN) ? listAll(COL.WORKFLOW_TEMPLATES) : Promise.resolve([]),
            wantsStructure ? listAll(COL.INTAKES) : Promise.resolve([]),
            wantsStructure ? listAll(COL.MODULE_OFFERINGS) : Promise.resolve([]),
            is(ROLES.MODULE_LEADER) ? listAll(COL.MODULE_OFFERINGS, [Query.equal('moduleLeaderId', user.$id)]) : Promise.resolve([]),
            is(ROLES.HOD)
              ? databases.listDocuments(DB_ID, COL.WORKFLOW_ACTIONS, [Query.orderDesc('$createdAt'), Query.limit(7)]).then((r) => r.documents)
              : Promise.resolve([]),
            is(ROLES.SUPER_ADMIN) ? listAll(COL.ACADEMIC_YEARS) : Promise.resolve([]),
            is(ROLES.SUPER_ADMIN) ? listAll(COL.PROGRAMMES) : Promise.resolve([]),
            is(ROLES.SUPER_ADMIN) ? listAll(COL.MODULES) : Promise.resolve([]),
            listAll(COL.TASKS, [Query.equal('ownerUserId', user.$id), Query.equal('status', 'open'), Query.orderAsc('dueDate')]).catch(() => []),
            is(ROLES.HOD) ? listAll(COL.CASES).catch(() => []) : Promise.resolve([]),
            is(ROLES.HOD) ? listAll(COL.RISK_REGISTER).catch(() => []) : Promise.resolve([]),
            is(ROLES.HOD) ? listAll(COL.APPRAISALS).catch(() => []) : Promise.resolve([]),
          ])
        const hodEscalated = is(ROLES.HOD)
          ? await listAll(COL.TASKS, [Query.equal('status', 'open'), Query.equal('escalated', true)]).catch(() => [])
          : []
        setData({ mine, queue, unread, allInstances, profiles, templates, intakes, offerings, myOfferings, recentActions, years, programmes, modules, myTasks, hodCases, hodRisks, hodAppraisals, hodEscalated })
      } catch (err) {
        setError(err?.message || 'Failed to load dashboard.')
        setData({})
      }
    })()
  }, [user.$id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <Spinner />

  const {
    mine = [], queue = [], unread = [], allInstances = [], profiles = [], templates = [],
    intakes = [], offerings = [], myOfferings = [], recentActions = [], years = [], programmes = [], modules = [],
    myTasks = [], hodCases = [], hodRisks = [], hodAppraisals = [], hodEscalated = [],
  } = data
  const overdueTasks = myTasks.filter((t) => daysUntil(t.dueDate) < 0)
  const returnedToMe = mine.filter((i) => i.status === 'returned')
  const hodQueue = allInstances.filter((i) => i.status === 'in_progress' && i.currentStageRole === ROLES.HOD)

  // Level Coordinator scope
  const myLevelIds = new Set(assignments.filter((a) => a.role === ROLES.LEVEL_COORDINATOR && a.scopeId).map((a) => a.scopeId))
  const myLevelInstances = allInstances.filter((i) => myLevelIds.has(i.levelId))
  const levelChips = assignments.filter((a) => a.role === ROLES.LEVEL_COORDINATOR).map((a) => a.scopeLabel || 'School-wide')
  const verifierChips = assignments.filter((a) => a.role === ROLES.INTERNAL_VERIFIER).map((a) => a.scopeLabel)
  const moderatorChips = assignments.filter((a) => a.role === ROLES.MODERATOR).map((a) => a.scopeLabel)
  const acadChips = assignments.filter((a) => a.role === ROLES.ACADEMIC_ADMIN).map((a) => a.scopeLabel || 'School-wide')

  /* ---- pick the hero for the user's highest-precedence role ---- */
  let hero
  if (is(ROLES.HOD)) hero = <HodHero user={user} allInstances={allInstances} />
  else if (is(ROLES.SUPER_ADMIN)) hero = <SuperAdminHero user={user} profiles={profiles} templates={templates} />
  else if (is(ROLES.LEVEL_COORDINATOR))
    hero = <RoleHero user={user} kicker="Level Coordinator" headline="Review submissions across every module in your levels once Module Leaders have signed off." chips={levelChips} />
  else if (is(ROLES.MODULE_LEADER))
    hero = <RoleHero user={user} kicker="Module Leader" headline="First-line approval for the modules you lead — keep your lecturers unblocked." chips={myOfferings.map((o) => `${o.moduleCode} · ${o.batchCode}`)} />
  else if (is(ROLES.INTERNAL_VERIFIER))
    hero = <RoleHero user={user} kicker="Internal Verifier" headline="Complete the Internal Verification Form (IVF) for assessments assigned to you." chips={verifierChips} />
  else if (is(ROLES.MODERATOR))
    hero = <RoleHero user={user} kicker="Moderator · Current Cycle" headline="Conduct internal moderation and complete the IMF for your assigned modules." chips={moderatorChips} />
  else if (is(ROLES.ACADEMIC_ADMIN))
    hero = <RoleHero user={user} kicker="Academic Administrator" headline="Maintain intakes, batches and module offerings for your delegated areas." chips={acadChips} />
  else
    hero = (
      <RoleHero
        user={user}
        kicker="Lecturer Workspace"
        headline="Upload evidence for your subjects and track every approval in real time."
        cta={
          <button onClick={() => navigate('/workflows/new')} className="btn bg-brand-teal text-white shadow-glow hover:bg-brand-tealDark">
            <Icon name="plus" className="h-4 w-4" /> New Submission
          </button>
        }
      />
    )

  return (
    <div>
      {hero}
      <ErrorBanner error={error} onDismiss={() => setError('')} />

      {/* Stat row — everyone */}
      <div className="mb-8 grid animate-fadeUp grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Open Tasks" value={myTasks.length} tone={overdueTasks.length ? 'red' : myTasks.length ? 'teal' : 'default'} icon="checkCircle" onClick={() => navigate('/tasks')} />
        <StatCard label="Awaiting My Approval" value={queue.length} tone={queue.length ? 'teal' : 'default'} icon="clipboard" onClick={() => navigate('/workflows/approvals')} />
        <StatCard label="My Submissions" value={mine.length} tone="blue" icon="send" onClick={() => navigate('/workflows/mine')} />
        <StatCard label="Returned to Me" value={returnedToMe.length} tone={returnedToMe.length ? 'amber' : 'default'} icon="return" onClick={() => navigate('/workflows/mine')} />
        <StatCard label="Unread Notifications" value={unread.length} tone={unread.length ? 'red' : 'default'} icon="bell" onClick={() => navigate('/notifications')} />
      </div>

      {/* My deadlines — everyone with tasks */}
      {myTasks.length > 0 && (
        <Section
          title="My Deadlines"
          subtitle={overdueTasks.length ? `${overdueTasks.length} overdue — these escalate to the HOD after 3 days.` : 'Auto-generated from the procedure manual timelines.'}
          action={<Link to="/tasks" className="flex items-center gap-1 text-sm font-bold text-brand-tealDark hover:underline">All tasks <Icon name="arrowRight" className="h-3.5 w-3.5" /></Link>}
        >
          <div className="card divide-y divide-gray-50">
            {myTasks.slice(0, 5).map((t) => {
              const due = dueLabel(t.dueDate)
              return (
                <Link key={t.$id} to="/tasks" className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-brand-tealLight/30">
                  <span className={`h-2 w-2 flex-shrink-0 rounded-full ${due.tone === 'overdue' ? 'bg-red-500' : due.tone === 'today' || due.tone === 'soon' ? 'bg-amber-400' : 'bg-gray-300'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-gray-900">{t.title}</p>
                    <p className="text-xs text-gray-400">{t.relatedLabel}{t.semesterName && ` · ${t.semesterName}`}</p>
                  </div>
                  <span className={`chip flex-shrink-0 ${due.tone === 'overdue' ? 'bg-red-50 text-red-700 ring-1 ring-red-200' : due.tone === 'later' ? 'bg-gray-100 text-gray-500' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'}`}>
                    {due.text}
                  </span>
                </Link>
              )
            })}
          </div>
        </Section>
      )}

      {/* Returned items — urgent, shown first for submitters */}
      {returnedToMe.length > 0 && (
        <Section title="Needs Your Attention" subtitle="Returned for revision — fix and resubmit.">
          <InstanceTable instances={returnedToMe} />
        </Section>
      )}

      {/* Approver queue */}
      {queue.length > 0 && (
        <Section
          title="Waiting on You"
          subtitle="Submissions at your approval stage."
          action={<Link to="/workflows/approvals" className="flex items-center gap-1 text-sm font-bold text-brand-tealDark hover:underline">View all <Icon name="arrowRight" className="h-3.5 w-3.5" /></Link>}
        >
          <InstanceTable instances={queue.slice(0, 5)} showSubmitter />
        </Section>
      )}

      {/* HOD-specific sections */}
      {is(ROLES.HOD) && (
        <>
          <Section title="Governance Snapshot" subtitle="Open items across cases, risks and appraisals.">
            <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
              <StatCard label="Open Cases" value={hodCases.filter((c) => c.status !== 'resolved').length} tone={hodCases.some((c) => c.status !== 'resolved') ? 'amber' : 'default'} icon="users" onClick={() => navigate('/cases')} />
              <StatCard label="Open Risks" value={hodRisks.filter((r) => r.status !== 'closed').length} tone={hodRisks.some((r) => r.status === 'open' && r.severity === 'high') ? 'red' : 'default'} icon="alert" onClick={() => navigate('/governance')} />
              <StatCard label="Appraisals Done" value={`${hodAppraisals.filter((a) => a.status === 'completed').length}/${hodAppraisals.length}`} tone="teal" icon="briefcase" onClick={() => navigate('/appraisals')} />
              <StatCard label="Escalated Tasks" value={hodEscalated.length} tone={hodEscalated.length ? 'red' : 'default'} icon="clock" onClick={() => navigate('/tasks')} />
            </div>
          </Section>
          <Section title="School-wide Compliance" subtitle="Live status by level — replaces the Subject File Tracker spreadsheet.">
            <ComplianceGrid instances={allInstances} />
          </Section>
          <div className="grid gap-8 lg:grid-cols-2">
            <Section title="Pending Final Sign-off" className="!mb-0">
              {hodQueue.length ? <InstanceTable instances={hodQueue} showSubmitter compact /> : <EmptyState title="Nothing awaiting sign-off" icon="checkCircle" />}
            </Section>
            <Section title="Recent Activity" subtitle="Latest actions across the school." className="!mb-0">
              <ActivityFeed actions={recentActions} />
            </Section>
          </div>
          <div className="mb-8" />
        </>
      )}

      {/* Super Admin sections */}
      {is(ROLES.SUPER_ADMIN) && (
        <>
          <Section title="System Configuration" subtitle="Everything the school needs before a semester begins.">
            <ConfigChecklist counts={{ years: years.length, programmes: programmes.length, modules: modules.length, offerings: offerings.length, intakes: intakes.length, templates: templates.length }} />
          </Section>
          <Section title="Accounts Overview">
            <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
              <StatCard label="Staff Accounts" value={profiles.length} icon="users" onClick={() => navigate('/admin/users')} />
              <StatCard label="Active" value={profiles.filter((p) => p.status === 'active').length} tone="green" icon="checkCircle" onClick={() => navigate('/admin/users')} />
              <StatCard label="Inactive" value={profiles.filter((p) => p.status !== 'active').length} tone="amber" icon="alert" onClick={() => navigate('/admin/users')} />
              <StatCard label="Templates" value={templates.length} tone="teal" icon="cog" onClick={() => navigate('/workflows/templates')} />
            </div>
          </Section>
        </>
      )}

      {/* Module Leader — my modules */}
      {is(ROLES.MODULE_LEADER) && myOfferings.length > 0 && (
        <Section title="My Modules" subtitle="Offerings you lead this semester.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myOfferings.map((o) => {
              const modInstances = mine.concat(queue).filter((i) => i.moduleId === o.moduleId)
              return (
                <div key={o.$id} className="card-hover p-5">
                  <div className="flex items-start justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-tealLight font-extrabold text-brand-tealDark">
                      {o.moduleCode?.slice(0, 3)}
                    </span>
                    <span className="chip bg-gray-100 text-gray-500">{o.semesterName}</span>
                  </div>
                  <p className="mt-3 font-extrabold tracking-tight text-gray-900">{o.moduleCode}</p>
                  <p className="text-[13px] text-gray-500">{o.moduleName}</p>
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
                    <Icon name="users" className="h-3.5 w-3.5" />
                    {(o.lecturerNames || []).join(', ') || 'No lecturers assigned'}
                  </p>
                  {modInstances.length > 0 && <p className="mt-1 text-xs font-semibold text-brand-tealDark">{modInstances.length} related submission(s)</p>}
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* Level Coordinator — module compliance within my levels */}
      {is(ROLES.LEVEL_COORDINATOR) && myLevelInstances.length > 0 && (
        <Section title="My Levels — Module Status" subtitle="All tracked submissions within your assigned levels.">
          <ComplianceGrid instances={myLevelInstances} />
        </Section>
      )}

      {/* Academic Administrator */}
      {is(ROLES.ACADEMIC_ADMIN) && !is(ROLES.SUPER_ADMIN) && (
        <Section title="Structure Data Entry" subtitle="Your delegated areas — intakes, batches and module offerings.">
          <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            <StatCard label="Intakes / Batches" value={intakes.length} icon="users" onClick={() => navigate('/structure/intakes')} />
            <StatCard label="Module Offerings" value={offerings.length} tone="teal" icon="book" onClick={() => navigate('/structure/offerings')} />
          </div>
        </Section>
      )}

      {/* My recent submissions (submitting roles, or anyone with history) */}
      {(mine.length > 0 || (!is(ROLES.HOD) && !is(ROLES.SUPER_ADMIN))) && (
        <Section
          title="My Recent Submissions"
          action={<Link to="/workflows/mine" className="flex items-center gap-1 text-sm font-bold text-brand-tealDark hover:underline">View all <Icon name="arrowRight" className="h-3.5 w-3.5" /></Link>}
        >
          {mine.length === 0 ? (
            <EmptyState title="No submissions yet" message="Submit evidence into a workflow from “New Submission”." icon="send" />
          ) : (
            <InstanceTable instances={mine.slice(0, 5)} />
          )}
        </Section>
      )}
    </div>
  )
}
