import { useEffect, useState } from 'react'
import { Link, useParams, useRouteError } from 'react-router-dom'
import { Badge, Button, Modal, PageHeader } from '../../../components/ui'
import { useToast } from '../../../lib/useToast'
import { api } from '../../../lib/api'

/**
 * Unsubscribe page (T48, §5.12).
 *
 * The URL contains a signed, time-limited token (`/u/{token}`) that encodes
 * the tenant ID and contact ID.  The token is verified server-side and is
 * valid for 90 days by default.
 *
 * - GET: shows the confirmation page with agency name and masked email
 * - POST: records the unsubscribe, creates a suppression, marks the contact
 *   UNSUBSCRIBED.  Idempotent — if already suppressed, still returns success.
 * - Expired/invalid tokens show an appropriate error message.
 *
 * Design (§5.12):
 *   - signed token includes tenant, contact, message, and expiry (default 90 days)
 *   - the page shows the agency name and a confirmation
 *   - one-click POST is idempotent
 *   - the record is written even if the contact was already suppressed
 *   - done when: the page works signed out and records the opt-out exactly once
 */
export function UnsubscribePage() {
  const { token } = useParams()
  const [showModal, setShowModal] = useState(false)
  const [unsubscribed, setUnsubscribed] = useState(false)
  const [error, setError] = useState(null)
  const [tenantName, setTenantName] = useState('')
  const [maskedEmail, setMaskedEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const { showError, success } = useToast()

  useEffect(() => {
    if (!token) {
      setError('No unsubscribe token provided.')
      setLoading(false)
      return
    }

    api.get(`/u/${token}`)
      .then((res) => {
        setTenantName(res.tenant_name)
        setMaskedEmail(res.masked_email)
        setShowModal(true)
        setLoading(false)
      })
      .catch((caught) => {
        // Handle expired/invalid token
        const msg =
          caught?.message || 'This unsubscribe link is not valid or has expired.'
        setError(msg)
        setLoading(false)
      })
  }, [token])

  function handleUnsubscribe() {
    if (!token) return
    setLoading(true)
    api.post(`/u/${token}`).then(
      (res) => {
        setUnsubscribed(true)
        setLoading(false)
        success(res.message || 'You have been unsubscribed.')
        // Redirect after a brief delay
        setTimeout(() => {
          window.location.href = '/'
        }, 2500)
      },
      (caught) => {
        setError(caught?.message || 'Failed to unsubscribe. Please try again.')
        setLoading(false)
      }
    )
  }

  if (loading) {
    return (
      <div className="app-page unsubscribe-page">
        <PageHeader
          eyebrow="Unsubscribe"
          title="Loading…"
          description="Verifying your unsubscribe link…"
        />
      </div>
    )
  }

  if (error) {
    return (
      <div className="app-page unsubscribe-page">
        <PageHeader
          eyebrow="Unsubscribe"
          title="Unsubscribe link expired"
          description={error}
        />
        <Button
          variant="primary"
          onClick={() => (window.location.href = '/')}
        >
          Return to homepage
        </Button>
      </div>
    )
  }

  if (unsubscribed) {
    return (
      <div className="app-page unsubscribe-page">
        <PageHeader
          eyebrow="Unsubscribe"
          title="Unsubscribed"
          description="You have been unsubscribed and will not receive further emails."
        />
        <Button
          variant="primary"
          onClick={() => (window.location.href = '/')}
        >
          Return to homepage
        </Button>
      </div>
    )
  }

  return (
    <div className="app-page unsubscribe-page">
      <PageHeader
        eyebrow="Unsubscribe"
        title="Unsubscribe confirmation"
        description="You are about to unsubscribe from emails sent by {tenantName}."
      />

      <div className="unsubscribe-page__details">
        <p>
          <strong>Agency:</strong> {tenantName}
        </p>
        <p>
          <strong>Email:</strong> {maskedEmail}
        </p>
      </div>

      <Modal
        open={true}
        title="Unsubscribe"
        description="You are about to unsubscribe from emails sent by {tenantName}. This action cannot be undone. You will not receive further commercial emails from this agency."
        size="lg"
        onClose={() => setShowModal(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleUnsubscribe}
              disabled={loading}
            >
              {loading ? 'Unsubscribing…' : 'Unsubscribe'}
            </Button>
          </>
        }
      >
        <p>
          By clicking Unsubscribe, you will opt-out of all future commercial
          emails from {tenantName}. A suppression record will be created and
          your contact status will be set to UNSUBSCRIBED. This action is
          idempotent — if you were already unsubscribed, the same result will
          occur.
        </p>
      </Modal>
    </div>
  )
}