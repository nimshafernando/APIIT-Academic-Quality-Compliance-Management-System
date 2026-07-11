import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { account, databases, DB_ID, COL } from '../lib/appwrite'
import { useAuth } from '../context/AuthContext'
import { ErrorBanner } from '../components/UI'

export default function ChangePassword() {
  const { profile, refresh } = useAuth()
  const navigate = useNavigate()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const forced = !!profile?.mustChangePassword

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (newPassword !== confirm) {
      setError('New passwords do not match.')
      return
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setBusy(true)
    try {
      await account.updatePassword(newPassword, oldPassword)
      if (forced && profile) {
        await databases.updateDocument(DB_ID, COL.PROFILES, profile.$id, { mustChangePassword: false })
      }
      await refresh()
      navigate('/')
    } catch (err) {
      setError(err?.message || 'Could not update password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6 flex animate-fadeUp items-center gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-tealLight text-brand-teal">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
          </svg>
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Change Password</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {forced ? 'You must set a new password before continuing (first login).' : 'Update your account password.'}
          </p>
        </div>
      </div>
      <div className="card px-6 py-6">
        <ErrorBanner error={error} onDismiss={() => setError('')} />
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Current password</label>
            <input type="password" className="input" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required />
          </div>
          <div>
            <label className="label">New password</label>
            <input type="password" className="input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <input type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
