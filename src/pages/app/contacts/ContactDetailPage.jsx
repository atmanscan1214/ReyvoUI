import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorPanel,
  PageHeader,
  Skeleton,
  StatusBadge,
  formatStatus,
  useToast,
} from '../../../components/ui'
import {
  AlertCircle,
  ArrowRight,
  Building,
  Clock,
  ExternalLink,
  Lock,
  Refresh,
  UserCircle,
} from '../../../components/icons'
import { companyLocation, getCompany } from '../../../lib/companies'
import { contactDisplayName, deleteContact, getContact } from '../../../lib/contacts'
import { useSession } from '../../../lib/session'
import { usePageTitle } from '../../../lib/usePageTitle'
import { ContactFormModal } from './ContactFormModal'
import './contacts.css'

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return '—'
  }
}

function Fact({ label, children }) {
  return (
    <div className="contact-facts__row">
      <dt>{label}</dt>
      <dd>{children || <span className="contacts__muted">—</span>}</dd>
    </div>
  )
}

function ExternalLinkRow({ href, children }) {
  return (
    <a className="contact-facts__link" href={href} target="_blank" rel="noreferrer">
      {children}
      <ExternalLink size={13} aria-hidden="true" />
    </a>
  )
}

function DetailSkeleton() {
  return (
    <div className="contact-detail" aria-busy="true">
      <div className="contact-detail__main">
        <section className="app-card">
          <Skeleton variant="text" width="30%" height={16} />
          <div className="contact-detail__skeleton-lines">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} variant="text" width={`${60 + (index % 3) * 12}%`} />
            ))}
          </div>
        </section>
        <section className="app-card">
          <Skeleton variant="text" width="24%" height={16} />
          <div className="contact-detail__skeleton-lines">
            <Skeleton variant="text" width="92%" />
            <Skeleton variant="text" width="76%" />
          </div>
        </section>
      </div>
      <aside className="contact-detail__aside">
        <section className="app-card">
          <Skeleton variant="text" width="40%" height={16} />
          <div className="contact-detail__skeleton-lines">
            <Skeleton variant="text" width="88%" />
            <Skeleton variant="text" width="70%" />
          </div>
        </section>
      </aside>
    </div>
  )
}

export function ContactDetailPage() {
  const { contactId } = useParams()
  const navigate = useNavigate()
  const { role, profileStatus } = useSession()
  const { toast } = useToast()

  const [contact, setContact] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Company context. Contact records only carry company_id, so the linked
  // company is fetched exactly once the contact is ready.
  const [company, setCompany] = useState(null)
  const [companyStatus, setCompanyStatus] = useState('idle')
  const [companyError, setCompanyError] = useState(null)
  const [companyRefresh, setCompanyRefresh] = useState(0)

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  usePageTitle(contact ? contactDisplayName(contact) : 'Contact')

  // Wait for the profile before calling the role read-only.
  const roleKnown = profileStatus === 'ready'
  const canWrite = roleKnown && (role === 'owner' || role === 'admin')

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    setError(null)

    getContact(contactId, controller.signal)
      .then((data) => {
        setContact(data)
        setStatus('ready')
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setError(caught)
        if (caught?.status === 404) setStatus('missing')
        else if (caught?.status === 403) setStatus('denied')
        else setStatus('error')
      })

    return () => controller.abort()
  }, [contactId, refreshKey])

  useEffect(() => {
    if (!contact?.companyId) {
      setCompany(null)
      setCompanyStatus(contact ? 'none' : 'idle')
      return undefined
    }

    const controller = new AbortController()
    setCompanyStatus('loading')
    setCompanyError(null)

    getCompany(contact.companyId, controller.signal)
      .then((data) => {
        setCompany(data)
        setCompanyStatus('ready')
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setCompanyError(caught)
        setCompanyStatus(caught?.status === 404 ? 'missing' : 'error')
      })

    return () => controller.abort()
    // The company follows the contact's link; edits that keep the same
    // company do not need a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.companyId, companyRefresh])

  async function handleDelete() {
    setDeleting(true)
    setDeleteError(null)

    try {
      await deleteContact(contact.id)
      toast.success('Contact deleted.')
      navigate('/app/contacts', { replace: true })
    } catch (caught) {
      setDeleteError(
        caught?.status === 403
          ? 'Your role does not allow deleting contact records.'
          : caught?.message || 'We could not delete this contact. Try again.',
      )
    } finally {
      setDeleting(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="app-page contacts-page">
        <PageHeader
          eyebrow="Contacts"
          title="Contact"
          backTo="/app/contacts"
          backLabel="Contacts"
          description="Loading this contact record…"
        />
        <DetailSkeleton />
      </div>
    )
  }

  if (status === 'missing') {
    return (
      <div className="app-page contacts-page">
        <PageHeader
          eyebrow="Contacts"
          title="Contact not found"
          backTo="/app/contacts"
          backLabel="Contacts"
          description="The record may have been deleted, or the link may be out of date."
        />
        <section className="app-card">
          <EmptyState
            icon={UserCircle}
            title="That contact isn’t here"
            description="It may belong to another workspace, or someone may have deleted it."
            actions={
              <Link to="/app/contacts" className="btn btn--primary btn--sm">
                Back to contacts
                <ArrowRight size={15} />
              </Link>
            }
          />
        </section>
      </div>
    )
  }

  if (status === 'denied') {
    return (
      <div className="app-page contacts-page">
        <PageHeader
          eyebrow="Contacts"
          title="Contact access restricted"
          backTo="/app/contacts"
          backLabel="Contacts"
        />
        <section className="app-card contacts__denied">
          <span className="contacts__denied-icon" aria-hidden="true">
            <Lock size={22} />
          </span>
          <h2>You don’t have access to this record</h2>
          <p>
            {error?.message ||
              'Your role does not allow access to contact records. Ask an owner or admin for access.'}
          </p>
          <Button variant="ghost" leadingIcon={Refresh} onClick={() => setRefreshKey((k) => k + 1)}>
            Try again
          </Button>
        </section>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="app-page contacts-page">
        <PageHeader
          eyebrow="Contacts"
          title="Contact"
          backTo="/app/contacts"
          backLabel="Contacts"
        />
        <section className="app-card">
          <ErrorPanel
            title="Couldn’t load this contact"
            description={error?.message}
            requestId={error?.requestId}
            onRetry={() => setRefreshKey((key) => key + 1)}
          />
        </section>
      </div>
    )
  }

  const customFields = Object.entries(contact.customFields ?? {})
  const initials =
    contact.fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase() || contact.email.slice(0, 2).toUpperCase()

  return (
    <div className="app-page contacts-page">
      <PageHeader
        eyebrow="Contacts"
        title={contactDisplayName(contact)}
        backTo="/app/contacts"
        backLabel="Contacts"
        description={[contact.title, contact.email].filter(Boolean).join(' · ') || 'Contact record'}
        meta={
          <>
            <StatusBadge status={contact.status} />
            <StatusBadge
              status={contact.emailStatus}
              label={`Email ${formatStatus(contact.emailStatus)}`}
            />
          </>
        }
        actions={
          canWrite ? (
            <Button variant="primary" onClick={() => setEditOpen(true)}>
              Edit contact
            </Button>
          ) : null
        }
      />

      {roleKnown && !canWrite ? (
        <div className="contacts__notice" role="status">
          <span className="contacts__notice-icon" aria-hidden="true">
            <Lock size={17} />
          </span>
          <p>
            Your role can view this contact but not change it. Ask an owner or admin when a record
            needs an update.
          </p>
        </div>
      ) : null}

      <div className="contact-detail">
        <div className="contact-detail__main">
          <section className="app-card contact-detail__card" aria-labelledby="contact-overview">
            <header className="contact-detail__head">
              <span className="contact-detail__avatar" aria-hidden="true">
                {initials}
              </span>
              <div>
                <h2 id="contact-overview">Overview</h2>
                <p>The facts your team uses before the first conversation.</p>
              </div>
            </header>

            <dl className="contact-facts">
              <Fact label="Email">
                {contact.email ? (
                  <a className="contact-facts__link" href={`mailto:${contact.email}`}>
                    {contact.email}
                  </a>
                ) : null}
              </Fact>
              <Fact label="Title">{contact.title}</Fact>
              <Fact label="Phone">{contact.phone}</Fact>
              <Fact label="First name">{contact.firstName}</Fact>
              <Fact label="Last name">{contact.lastName}</Fact>
              <Fact label="LinkedIn">
                {contact.linkedinUrl ? (
                  <ExternalLinkRow href={/^https?:\/\//i.test(contact.linkedinUrl)
                    ? contact.linkedinUrl
                    : `https://${contact.linkedinUrl}`}>
                    {contact.linkedinUrl.replace(/^https?:\/\//, '')}
                  </ExternalLinkRow>
                ) : null}
              </Fact>
              <Fact label="Source">{contact.source}</Fact>
              <Fact label="Added">{formatDate(contact.createdAt)}</Fact>
              <Fact label="Updated">{formatDate(contact.updatedAt)}</Fact>
            </dl>
          </section>

          <section className="app-card contact-detail__card" aria-labelledby="contact-notes">
            <header className="contact-detail__head">
              <span className="contact-detail__icon" aria-hidden="true">
                <Clock size={18} />
              </span>
              <div>
                <h2 id="contact-notes">Notes</h2>
                <p>Shared context for anyone working this contact.</p>
              </div>
            </header>

            {contact.notes ? (
              <p className="contact-detail__notes">{contact.notes}</p>
            ) : (
              <p className="contact-detail__empty">
                No notes yet. {canWrite ? 'Edit the contact to add context.' : ''}
              </p>
            )}
          </section>

          <section className="app-card contact-detail__card" aria-labelledby="contact-custom">
            <header className="contact-detail__head">
              <span className="contact-detail__icon" aria-hidden="true">
                <UserCircle size={18} />
              </span>
              <div>
                <h2 id="contact-custom">Custom fields</h2>
                <p>Team-defined labels stored with this record.</p>
              </div>
            </header>

            {customFields.length > 0 ? (
              <dl className="contact-facts contact-facts--compact">
                {customFields.map(([key, value]) => (
                  <Fact key={key} label={key}>
                    {value === '' || value == null ? null : String(value)}
                  </Fact>
                ))}
              </dl>
            ) : (
              <p className="contact-detail__empty">
                No custom fields. {canWrite ? 'Add them when you edit this contact.' : ''}
              </p>
            )}
          </section>
        </div>

        <aside className="contact-detail__aside">
          <section className="app-card contact-detail__card" aria-labelledby="contact-company">
            <header className="contact-detail__head">
              <span className="contact-detail__icon" aria-hidden="true">
                <Building size={18} />
              </span>
              <div>
                <h2 id="contact-company">Company</h2>
                <p>The employer this contact belongs to.</p>
              </div>
              {companyStatus === 'ready' ? (
                <Badge tone="neutral" size="sm">
                  {company.name}
                </Badge>
              ) : null}
            </header>

            {(companyStatus === 'loading' || companyStatus === 'idle') ? (
              <div className="contact-detail__skeleton-lines">
                <Skeleton variant="text" width="80%" />
                <Skeleton variant="text" width="62%" />
              </div>
            ) : companyStatus === 'none' ? (
              <p className="contact-detail__empty">
                No company attached. {canWrite ? 'Edit the contact to link one.' : ''}
              </p>
            ) : companyStatus === 'missing' ? (
              <p className="contact-detail__empty">
                The linked company is no longer available in this workspace.
              </p>
            ) : companyStatus === 'error' ? (
              <div className="contact-detail__inline-error" role="alert">
                <AlertCircle size={15} aria-hidden="true" />
                <span>
                  {companyError?.message || 'We could not load the company for this contact.'}
                </span>
                <button
                  type="button"
                  className="contact-detail__inline-retry"
                  onClick={() => setCompanyRefresh((key) => key + 1)}
                >
                  Retry
                </button>
              </div>
            ) : (
              <>
                <dl className="contact-facts">
                  <div className="contact-facts__row">
                    <dt>Name</dt>
                    <dd>
                      <Link to={`/app/companies/${company.id}`} className="contact-facts__link">
                        {company.name}
                        <ArrowRight size={13} aria-hidden="true" />
                      </Link>
                    </dd>
                  </div>
                  <Fact label="Domain">
                    {company.domain ? (
                      <ExternalLinkRow href={`https://${company.domain}`}>
                        {company.domain}
                      </ExternalLinkRow>
                    ) : null}
                  </Fact>
                  <Fact label="Industry">{company.industry}</Fact>
                  <Fact label="Employees">
                    {company.employeeCount == null ? null : company.employeeCount.toLocaleString()}
                  </Fact>
                  <Fact label="Location">{companyLocation(company)}</Fact>
                  <div className="contact-facts__row">
                    <dt>Status</dt>
                    <dd>
                      <StatusBadge status={company.status} size="sm" />
                    </dd>
                  </div>
                </dl>

                <Link
                  to={`/app/contacts?company_id=${company.id}`}
                  className="contact-detail__link"
                >
                  All contacts at {company.name}
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </>
            )}
          </section>

          <section className="app-card contact-detail__card" aria-labelledby="contact-activity">
            <header className="contact-detail__head">
              <span className="contact-detail__icon" aria-hidden="true">
                <Clock size={18} />
              </span>
              <div>
                <h2 id="contact-activity">Activity</h2>
                <p>Outreach history for this contact.</p>
              </div>
            </header>

            <dl className="contact-facts">
              <div className="contact-facts__row">
                <dt>Last contacted</dt>
                <dd>
                  {contact.lastContactedAt ? (
                    formatDate(contact.lastContactedAt)
                  ) : (
                    <span className="contacts__muted">Not yet contacted</span>
                  )}
                </dd>
              </div>
              <div className="contact-facts__row">
                <dt>Last replied</dt>
                <dd>
                  {contact.lastRepliedAt ? (
                    formatDate(contact.lastRepliedAt)
                  ) : (
                    <span className="contacts__muted">No replies yet</span>
                  )}
                </dd>
              </div>
            </dl>

            <p className="contact-detail__footnote">
              Updated automatically as campaigns send and replies arrive.
            </p>
          </section>

          {canWrite ? (
            <section className="app-card contact-detail__danger" aria-labelledby="contact-danger">
              <h2 id="contact-danger">Delete contact</h2>
              <p>
                The contact is removed from the workspace and from every list it belongs to. This
                cannot be undone.
              </p>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setDeleteError(null)
                  setDeleteOpen(true)
                }}
              >
                Delete contact
              </Button>
            </section>
          ) : null}
        </aside>
      </div>

      <ContactFormModal
        open={editOpen}
        contact={contact}
        onClose={() => setEditOpen(false)}
        onSaved={(saved) => {
          setContact(saved)
          setEditOpen(false)
        }}
      />

      {deleteOpen ? (
        <ConfirmDialog
          open
          title={`Delete ${contactDisplayName(contact)}?`}
          description="This removes the contact record and its list memberships. The email address stays in suppression history if it was suppressed."
          confirmLabel="Delete contact"
          loading={deleting}
          onCancel={() => {
            if (deleting) return
            setDeleteOpen(false)
            setDeleteError(null)
          }}
          onConfirm={handleDelete}
        >
          {deleteError ? (
            <p className="contact-detail__dialog-error" role="alert">
              <AlertCircle size={15} aria-hidden="true" />
              <span>{deleteError}</span>
            </p>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </div>
  )
}
