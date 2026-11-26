import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button, Modal, PageHeader, useToast } from '../../../components/ui'
import { api } from '../../../lib/api'

/**
 * Public unsubscribe page (T48, §5.12).
 *
 * The link in a campaign email carries a signed, time-limited token
 * (`/u/{token}`) that encodes the tenant and contact. The page works signed out:
 *
 * - `GET /u/{token}` returns the agency name and the masked recipient address.
 * - `POST /u/{token}` records the opt-out, creates a suppression, and marks the
 *   contact `unsubscribed`. It is idempotent, so a second click is harmless.
 * - An expired or invalid token renders an explanatory error instead.
 */
/**
 * Token problems come back as 4xx from `/u/{token}`; those mean the link
 * itself is unusable, so the page explains that instead of echoing a generic
 * auth or validation message.
 */
function linkErrorMessage(caught) {
  if ([400, 401, 403, 404, 410, 422].includes(caught?.status)) {
    return 'This unsubscribe link is not valid or has expired.'
  }
  return caught?.message || 'This unsubscribe link is not valid or has expired.'
}

export function UnsubscribePage() {
  const { token } = useParams()
  const { toast } = useToast()

  const [view, setView] = useState('loading')
  const [error, setError] = useState(null)
  const [tenantName, setTenantName] = useState('')
  const [maskedEmail, setMaskedEmail] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('No unsubscribe token was provided.')
      setView('error')
      return undefined
    }

    let cancelled = false
    setView('loading')

    api
      .get(`/u/${encodeURIComponent(token)}`)
      .then((data) => {
        if (cancelled) return
        setTenantName(data?.tenant_name ?? '')
        setMaskedEmail(data?.masked_email ?? '')
        setView('ready')
      })
      .catch((caught) => {
        if (cancelled) return
        setError(linkErrorMessage(caught))
        setView('error')
      })

    return () => {
      cancelled = true
    }
  }, [token])

  async function handleUnsubscribe() {
    if (!token || submitting) return
    setSubmitting(true)
    try {
      const data = await api.post(`/u/${encodeURIComponent(token)}`)
      setConfirmOpen(false)
      setView('done')
      toast.success(data?.message || 'You have been unsubscribed.')
    } catch (caught) {
      setConfirmOpen(false)
      setError(linkErrorMessage(caught))
      setView('error')
    } finally {
      setSubmitting(false)
    }
  }

  if (view === 'loading') {
    return (
      <div className="app-page unsubscribe-page">
        <PageHeader
          eyebrow="Unsubscribe"
          title="Checking your link…"
          description="Verifying your unsubscribe link."
        />
      </div>
    )
  }

  if (view === 'error') {
    return (
      <div className="app-page unsubscribe-page">
        <PageHeader eyebrow="Unsubscribe" title="This link cannot be used" description={error} />
        <Button variant="primary" onClick={() => (window.location.href = '/')}>
          Return to homepage
        </Button>
      </div>
    )
  }

  if (view === 'done') {
    return (
      <div className="app-page unsubscribe-page">
        <PageHeader
          eyebrow="Unsubscribe"
          title="You are unsubscribed"
          description={
            tenantName
              ? `You will not receive further commercial emails from ${tenantName}.`
              : 'You will not receive further commercial emails from this agency.'
          }
        />
        <Button variant="primary" onClick={() => (window.location.href = '/')}>
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
        description={
          tenantName
            ? `You are about to unsubscribe from emails sent by ${tenantName}.`
            : 'You are about to unsubscribe from this agency’s emails.'
        }
      />

      <div className="unsubscribe-page__details">
        {tenantName ? (
          <p>
            <strong>Agency:</strong> {tenantName}
          </p>
        ) : null}
        {maskedEmail ? (
          <p>
            <strong>Email:</strong> {maskedEmail}
          </p>
        ) : null}
      </div>

      <Button variant="primary" onClick={() => setConfirmOpen(true)}>
        Unsubscribe
      </Button>

      <Modal
        open={confirmOpen}
        title="Confirm unsubscribe"
        description={
          tenantName
            ? `This stops all future commercial emails from ${tenantName}.`
            : 'This stops all future commercial emails from this agency.'
        }
        size="md"
        onClose={submitting ? undefined : () => setConfirmOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleUnsubscribe} loading={submitting}>
              {submitting ? 'Unsubscribing…' : 'Unsubscribe'}
            </Button>
          </>
        }
      >
        <p>
          A suppression record will be created and your contact status will be set to
          unsubscribed. You will not receive further commercial emails from this agency. If you
          were already unsubscribed, nothing changes.
        </p>
      </Modal>
    </div>
  )
}
