import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { client, databases, DB_ID, COL, listAll, Query, fmtDateTime } from '../lib/appwrite'
import { useAuth } from '../context/AuthContext'
import { PageHeader, Spinner, EmptyState, ErrorBanner } from '../components/UI'
import Icon from '../components/Icons'

const TYPE_META = {
  approval_pending: { icon: 'clipboard', bg: 'bg-blue-50 text-blue-500' },
  stage_approved: { icon: 'checkCircle', bg: 'bg-emerald-50 text-emerald-500' },
  approved: { icon: 'sparkles', bg: 'bg-brand-tealLight text-brand-teal' },
  returned: { icon: 'return', bg: 'bg-amber-50 text-amber-500' },
}

export default function Notifications() {
  const { user } = useAuth()
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setItems(await listAll(COL.NOTIFICATIONS, [Query.equal('userId', user.$id), Query.orderDesc('$createdAt')]))
    } catch (err) {
      setError(err?.message || 'Failed to load notifications.')
      setItems([])
    }
  }, [user.$id])

  useEffect(() => {
    load()
  }, [load])

  // Realtime: new notifications appear instantly without a refresh.
  useEffect(() => {
    const unsubscribe = client.subscribe(`databases.${DB_ID}.collections.${COL.NOTIFICATIONS}.documents`, (event) => {
      const doc = event.payload
      if (doc?.userId !== user.$id) return
      // Upsert on both create and update — client-created notifications become
      // visible via the permission-stamp update event. In-place updates keep
      // their position; genuinely new items are prepended.
      setItems((prev) => {
        if (!prev) return [doc]
        return prev.some((x) => x.$id === doc.$id) ? prev.map((x) => (x.$id === doc.$id ? doc : x)) : [doc, ...prev]
      })
    })
    return () => {
      try { unsubscribe() } catch { /* socket already closed */ }
    }
  }, [user.$id])

  const markRead = async (n) => {
    if (n.read) return
    try {
      await databases.updateDocument(DB_ID, COL.NOTIFICATIONS, n.$id, { read: true })
      setItems((prev) => prev.map((x) => (x.$id === n.$id ? { ...x, read: true } : x)))
    } catch {
      /* non-fatal */
    }
  }

  const markAllRead = async () => {
    const unread = (items || []).filter((n) => !n.read)
    await Promise.allSettled(unread.map((n) => databases.updateDocument(DB_ID, COL.NOTIFICATIONS, n.$id, { read: true })))
    load()
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        subtitle="Approvals waiting on you, returned submissions, and sign-off confirmations."
        actions={
          items?.some((n) => !n.read) && (
            <button className="btn-secondary" onClick={markAllRead}>
              <Icon name="checkCircle" className="h-4 w-4" /> Mark all as read
            </button>
          )
        }
      />
      <ErrorBanner error={error} onDismiss={() => setError('')} />

      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="No notifications" message="You'll be notified here when a submission needs your attention." icon="bell" />
      ) : (
        <ul className="space-y-2.5">
          {items.map((n) => {
            const meta = TYPE_META[n.type] || { icon: 'bell', bg: 'bg-gray-100 text-gray-500' }
            return (
              <li
                key={n.$id}
                className={`card flex animate-fadeUp items-start gap-4 px-5 py-4 transition-all ${n.read ? 'opacity-60' : 'shadow-card ring-1 ring-brand-teal/15'}`}
              >
                <span className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${meta.bg}`}>
                  <Icon name={meta.icon} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed text-gray-800">{n.message}</p>
                  <p className="mt-1 text-xs text-gray-400">{fmtDateTime(n.$createdAt)}</p>
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                  {n.relatedId && (
                    <Link
                      to={`/workflows/${n.relatedId}`}
                      onClick={() => markRead(n)}
                      className="flex items-center gap-1 text-xs font-bold text-brand-tealDark hover:underline"
                    >
                      Open <Icon name="arrowRight" className="h-3 w-3" />
                    </Link>
                  )}
                  {!n.read && (
                    <button onClick={() => markRead(n)} className="text-xs font-medium text-gray-400 hover:text-gray-600">
                      Mark read
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
