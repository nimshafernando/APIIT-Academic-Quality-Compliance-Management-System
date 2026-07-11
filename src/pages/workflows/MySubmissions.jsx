import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { COL, listAll, Query } from '../../lib/appwrite'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Spinner, EmptyState, ErrorBanner } from '../../components/UI'
import InstanceTable from './InstanceTable'

export default function MySubmissions() {
  const { user } = useAuth()
  const [instances, setInstances] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        setInstances(
          await listAll(COL.WORKFLOW_INSTANCES, [Query.equal('submittedBy', user.$id), Query.orderDesc('$updatedAt')]),
        )
      } catch (err) {
        setError(err?.message || 'Failed to load submissions.')
      } finally {
        setLoading(false)
      }
    })()
  }, [user.$id])

  return (
    <div>
      <PageHeader
        title="My Submissions"
        subtitle="Everything you have submitted into an approval workflow, with live status."
        actions={
          <Link to="/workflows/new" className="btn-primary">
            + New Submission
          </Link>
        }
      />
      <ErrorBanner error={error} onDismiss={() => setError('')} />
      {loading ? (
        <Spinner />
      ) : instances.length === 0 ? (
        <EmptyState title="No submissions yet" message="Use “New Submission” to submit evidence into an approval workflow." />
      ) : (
        <InstanceTable instances={instances} />
      )}
    </div>
  )
}
