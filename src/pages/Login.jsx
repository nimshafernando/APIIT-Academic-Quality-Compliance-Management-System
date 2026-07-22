import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ErrorBanner } from '../components/UI'
import Icon from '../components/Icons'

const HIGHLIGHTS = [
  { icon: 'clipboard', title: 'Multi-stage approvals', text: 'Lecturer → Verifier → Module Leader → Level Coordinator → HOD, fully tracked.' },
  { icon: 'chart', title: 'Live compliance view', text: 'School-wide status at a glance — no more tracker spreadsheets.' },
  { icon: 'shield', title: 'ISO 21001:2018 ready', text: 'Tamper-evident audit trail on every upload, approval and return.' },
]

export default function Login() {
  const { user, login, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to="/" replace />

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(email.trim(), password)
      navigate('/')
    } catch (err) {
      setError(err?.message || 'Login failed. Check your email and password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6"
      style={{
        background:
          'radial-gradient(1000px 600px at 85% -10%, rgba(25,185,175,0.28), transparent 55%), radial-gradient(800px 600px at -5% 110%, rgba(25,185,175,0.18), transparent 55%), linear-gradient(140deg, #0A1817 0%, #0F2826 45%, #123A36 100%)',
      }}
    >
      {/* decorative grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '42px 42px',
        }}
      />
      {/* glow blobs */}
      <div className="pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-brand-teal/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-10 h-80 w-80 rounded-full bg-brand-teal/15 blur-3xl" />

      <div className="relative w-full max-w-[420px] animate-fadeUp lg:max-w-[900px]">
        <div className="grid overflow-hidden rounded-3xl bg-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] lg:grid-cols-[1.05fr_1fr]">
          {/* ---- Brand panel (desktop only) ---- */}
          <div
            className="relative hidden flex-col justify-between p-10 text-white lg:flex"
            style={{
              background:
                'radial-gradient(500px 300px at 90% 0%, rgba(25,185,175,0.35), transparent 60%), radial-gradient(400px 300px at 0% 100%, rgba(25,185,175,0.18), transparent 55%), linear-gradient(150deg, #0C1D1B 0%, #113230 55%, #14443F 100%)',
            }}
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.06]"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)',
                backgroundSize: '38px 38px',
              }}
            />
            <div className="relative">
              <span className="chip bg-white/10 text-white/80 ring-1 ring-white/15">
                <Icon name="sparkles" className="h-3.5 w-3.5 text-brand-teal" />
                APIITEMS · ISO 21001:2018
              </span>
              <h1 className="mt-7 text-[27px] font-extrabold leading-[1.2] tracking-tight">
                Academic Quality &amp; Compliance,
                <span className="text-brand-teal"> in one place.</span>
              </h1>
              <p className="mt-3.5 text-[13.5px] leading-relaxed text-white/55">
                Role-based dashboards, digitised subject files and automated approval chains for the School of
                Computing.
              </p>
            </div>

            <div className="relative mt-10 space-y-4">
              {HIGHLIGHTS.map((h) => (
                <div key={h.title} className="flex items-start gap-3.5 rounded-2xl bg-white/[0.05] p-3.5 ring-1 ring-white/10">
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-teal/15 text-brand-teal ring-1 ring-brand-teal/25">
                    <Icon name={h.icon} className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-[13px] font-bold">{h.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-white/45">{h.text}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="relative mt-10 text-[11px] font-medium tracking-wide text-white/30">
              © {new Date().getFullYear()} APIIT
            </p>
          </div>

          {/* ---- Form panel ---- */}
          <div className="px-6 py-9 sm:px-10 sm:py-11">
            {/* Logo — prominent on a clean white field on every screen size */}
            <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
              <img src="/apiitlogo.png" alt="APIIT — Inspire love for learning" className="h-14 w-auto sm:h-16" />
              <span className="mt-4 chip bg-brand-tealLight text-brand-tealDeep ring-1 ring-brand-teal/20 lg:hidden">
                <Icon name="shield" className="h-3.5 w-3.5" />
                AQCMS
              </span>
              <h2 className="mt-5 text-[22px] font-extrabold tracking-tight text-gray-900 sm:text-2xl">Welcome back</h2>
              <p className="mt-1 text-sm text-gray-500">Sign in with your institutional account.</p>
            </div>

            <div className="mt-7">
              <ErrorBanner error={error} onDismiss={() => setError('')} />
              <form onSubmit={submit} className="space-y-5">
                <div>
                  <label className="label">Email</label>
                  <div className="relative">
                    <Icon name="mail" className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      className="input !pl-10"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@apiit.lk"
                      required
                      autoFocus
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Password</label>
                  <div className="relative">
                    <Icon name="lock" className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-400" />
                    <input
                      type={showPw ? 'text' : 'password'}
                      className="input !pl-10 pr-11"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-brand-tealDark"
                      tabIndex={-1}
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                    >
                      <Icon name="eye" className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={busy} className="btn-primary w-full !py-3 text-[15px]">
                  {busy ? 'Signing in…' : 'Sign In'}
                  {!busy && <Icon name="arrowRight" className="h-4 w-4" />}
                </button>
              </form>

              <div className="mt-7 flex items-start gap-2.5 rounded-2xl bg-brand-grey px-4 py-3.5">
                <Icon name="key" className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-teal" />
                <p className="text-xs leading-relaxed text-gray-500">
                  Accounts are created by the Super Admin. Contact the school office if you cannot sign in.
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] font-medium tracking-wide text-white/35 lg:hidden">
          © {new Date().getFullYear()} APIIT
        </p>
      </div>
    </div>
  )
}
