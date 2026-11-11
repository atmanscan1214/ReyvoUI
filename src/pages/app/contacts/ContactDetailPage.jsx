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
  useToast,
} from '../../../components/ui'
import {
  AlertCircle,
  ArrowRight,
  Building,
  Clock,
  Database,
  ExternalLink,
  Globe,
  List,
  Lock,
  Mail,
  MailCheck,
  Refresh,
  UserCircle,
  Users,
} from '../../../components/icons'
import { getCompany, withScheme } from '../../../lib/companies'
import {
  EMAIL_STATUS_COPY,
  TAG_STORAGE_AVAILABLE,
  deleteContact,
  formatContactDate,
  formatContactDateTime,
  getContact,
  getContactTags,
} from '../../../lib/contacts'
import { useSession } from '../../../lib/session'
import { usePageTitle } from '../../../lib/usePageTitle'
import { ContactFormModal } from './ContactFormModal'
import './contacts.css'

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
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton key={index} variant="text" width={`${58 + (index % 3) * 14}%`} />
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

  const [company, setCompany] = useState(null)
  const [companyStatus, setCompanyStatus] = useState('idle')

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  usePageTitle(contact?.fullName || 'Contact')

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
      setCompanyStatus('idle')
      return undefined
    }

    const controller = new AbortController()
    setCompanyStatus('loading')

    getCompany(contact.companyId, controller.signal)
      .then((data) => {
        setCompany(data)
        setCompanyStatus('ready')
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setCompany(null)
        setCompanyStatus('error')
      })

    return () => controller.abort()
  }, [contact?.companyId])

  async function handleDelete() {
    setDeleting(true)
    setDeleteError(null)

    try {
      await deleteContact(contact.id)
      toast.success('Contact deleted.')
      navigate(
        contact.companyId ? `/app/contacts?company_id=${contact.companyId}` : '/app/contacts',
        { replace: true },
      )
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

  const tags = getContactTags(contact.id)
  const customFields = Object.entries(contact.customFields ?? {})
  const initials = contact.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  const companyLocation = company
    ? [company.city, company.state, company.country].filter(Boolean).join(', ')
    : ''
  // If the company request is still in flight (or failed), keep the edit form
  // showing that a company is attached instead of dropping into search mode.
  const companyForForm =
    company ??
    (contact.companyId ? { id: contact.companyId, name: 'Company on file', domain: null } : null)

  return (
    <div className="app-page contacts-page">
      <PageHeader
        eyebrow={`Contacts${contact.title ? ` · ${contact.title}` : ''}`}
        title={contact.fullName}
        backTo="/app/contacts"
        backLabel="Contacts"
        description={contact.email}
        meta={
          <>
            <StatusBadge status={contact.status} />
            {company ? (
              <Badge tone="outline" dot>
                {company.name}
              </Badge>
            ) : null}
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
                {initials || <UserCircle size={20} />}
              </span>
              <div>
                <h2 id="contact-overview">Overview</h2>
                <p>The facts your team uses before the first conversation.</p>
              </div>
            </header>

            <dl className="contact-facts">
              <Fact label="Email">
                {contact.email ? (
                  <ExternalLinkRow href={`mailto:${contact.email}`}>
                    {contact.email}
                  </ExternalLinkRow>
                ) : null}
              </Fact>
              <Fact label="Phone">
                {contact.phone ? (
                  <a className="contact-facts__link" href={`tel:${contact.phone}`}>
                    {contact.phone}
                  </a>
                ) : null}
              </Fact>
              <Fact label="LinkedIn">
                {contact.linkedinUrl ? (
                  <ExternalLinkRow href={withScheme(contact.linkedinUrl)}>
                    {contact.linkedinUrl.replace(/^https?:\/\//, '')}
                  </ExternalLinkRow>
                ) : null}
              </Fact>
              <Fact label="Company">
                {contact.companyId ? (
                  <Link
                    to={`/app/companies/${contact.companyId}`}
                    className="contact-facts__link"
                  >
                    {company?.name ?? 'View company'}
                    <ArrowRight size={13} aria-hidden="true" />
                  </Link>
                ) : null}
              </Fact>
              <Fact label="Job title">{contact.title}</Fact>
              <Fact label="Status">
                <StatusBadge status={contact.status} size="sm" />
              </Fact>
              <Fact label="Email health">
                <span className="contact-detail__badge-line">
                  <StatusBadge status={contact.emailStatus} size="sm" dot={false} />
                  <span className="contacts__muted">
                    {EMAIL_STATUS_COPY[contact.emailStatus] ?? 'Not verified yet.'}
                  </span>
                </span>
              </Fact>
              <Fact label="Source">{contact.source}</Fact>
              <Fact label="Last contacted">
                {formatContactDateTime(contact.lastContactedAt)}
              </Fact>
              <Fact label="Last replied">{formatContactDateTime(contact.lastRepliedAt)}</Fact>
              <Fact label="Added">{formatContactDate(contact.createdAt)}</Fact>
              <Fact label="Updated">{formatContactDate(contact.updatedAt)}</Fact>
            </dl>
          </section>

          <section className="app-card contact-detail__card" aria-labelledby="contact-notes">
            <header className="contact-detail__head">
              <span className="contact-detail__icon" aria-hidden="true">
                <Clock size={18} />
              </span>
              <div>
                <h2 id="contact-notes">Notes</h2>
                <p>Shared context for anyone working this person.</p>
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

          <section className="app-card contact-detail__card" aria-labelledby="contact-tags">
            <header className="contact-detail__head">
              <span className="contact-detail__icon" aria-hidden="true">
                <List size={18} />
              </span>
              <div>
                <h2 id="contact-tags">Tags</h2>
                <p>Lightweight labels for segments and saved views.</p>
              </div>
              {TAG_STORAGE_AVAILABLE ? (
                <Badge tone="outline" size="sm">
                  Browser only
                </Badge>
              ) : null}
            </header>

            {tags.length > 0 ? (
              <ul className="contact-detail__tags">
                {tags.map((tag) => (
                  <li key={tag}>
                    <Badge tone="outline">{tag}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="contact-detail__empty">
                {TAG_STORAGE_AVAILABLE
                  ? `No tags yet. ${canWrite ? 'Edit the contact to add some.' : ''}`
                  : 'Tags need a tags endpoint, which this API build does not expose.'}
              </p>
            )}

            {TAG_STORAGE_AVAILABLE ? (
              <p className="contact-detail__hint">
                This API build has no tags endpoint, so tags are stored in this browser only.
              </p>
            ) : null}
          </section>

          <section className="app-card contact-detail__card" aria-labelledby="contact-custom">
            <header className="contact-detail__head">
              <span className="contact-detail__icon" aria-hidden="true">
                <Database size={18} />
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
                <p>The employer record this person belongs to.</p>
              </div>
            </header>

            {!contact.companyId ? (
              <p className="contact-detail__empty">
                No company attached. {canWrite ? 'Edit the contact to add one.' : ''}
              </p>
            ) : companyStatus === 'loading' ? (
              <div className="contact-detail__skeleton-lines">
                <Skeleton variant="text" width="80%" />
                <Skeleton variant="text" width="62%" />
              </div>
            ) : companyStatus === 'error' || !company ? (
              <div className="contact-detail__inline-error" role="alert">
                <AlertCircle size={15} aria-hidden="true" />
                <span>We could not load the company for this contact.</span>
              </div>
            ) : (
              <>
                <div className="contact-company-card">
                  <span className="contact-company-card__avatar" aria-hidden="true">
                    {company.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="contact-company-card__main">
                    <Link
                      to={`/app/companies/${company.id}`}
                      className="contact-company-card__name"
                    >
                      {company.name}
                    </Link>
                    <p className="contact-company-card__meta">
                      {[company.domain, company.industry].filter(Boolean).join(' · ') || 'Company'}
                    </p>
                  </div>
                </div>

                <dl className="contact-facts contact-facts--compact contact-facts--card">
                  <Fact label="Industry">{company.industry}</Fact>
                  <Fact label="Location">{companyLocation}</Fact>
                  <Fact label="Employees">
                    {company.employeeCount == null
                      ? null
                      : company.employeeCount.toLocaleString()}
                  </Fact>
                  <Fact label="Website">
                    {company.website ? (
                      <ExternalLinkRow href={withScheme(company.website)}>
                        {company.website.replace(/^https?:\/\//, '')}
                      </ExternalLinkRow>
                    ) : null}
                  </Fact>
                </dl>

                <div className="contact-detail__link-row">
                  <Link to={`/app/companies/${company.id}`} className="contact-detail__link">
                    Open company record
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                  <Link
                    to={`/app/contacts?company_id=${company.id}`}
                    className="contact-detail__link"
                  >
                    <Users size={15} aria-hidden="true" />
                    All people there
                  </Link>
                </div>
              </>
            )}
          </section>

          <section className="app-card contact-detail__card" aria-labelledby="contact-health">
            <header className="contact-detail__head">
              <span className="contact-detail__icon" aria-hidden="true">
                <MailCheck size={18} />
              </span>
              <div>
                <h2 id="contact-health">Email health</h2>
                <p>Whether this address is safe to include in a campaign.</p>
              </div>
            </header>

            <div className="contact-health">
              <StatusBadge status={contact.emailStatus} />
              <p className="contact-health__copy">
                {EMAIL_STATUS_COPY[contact.emailStatus] ?? 'This address has not been verified yet.'}
              </p>
            </div>

            <p className="contact-detail__hint">
              Verification is not connected on this API build, so the status is set when the
              contact is created.
            </p>

            <a className="contact-detail__link" href={`mailto:${contact.email}`}>
              <Mail size={15} aria-hidden="true" />
              Email {contact.email}
            </a>
          </section>

          <section className="app-card contact-detail__card contact-detail__card--quiet">
            <header className="contact-detail__head">
              <span className="contact-detail__icon" aria-hidden="true">
                <Globe size={18} />
              </span>
              <div>
                <h2>Workspace record</h2>
                <p>This contact is private to this workspace.</p>
              </div>
            </header>
            <p className="contact-detail__hint">
              Contact IDs, email normalization, and tenant separation are enforced by the API on
              every read and write.
            </p>
          </section>

          {canWrite ? (
            <section className="app-card contact-detail__danger" aria-labelledby="contact-danger">
              <h2 id="contact-danger">Delete contact</h2>
              <p>
                The person is removed from the workspace. Their company record and other contacts
                stay. This cannot be undone.
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
        defaultCompany={companyForForm}
        onClose={() => setEditOpen(false)}
        onSaved={(saved) => {
          setContact(saved)
          setEditOpen(false)
          setRefreshKey((key) => key + 1)
        }}
      />

      {deleteOpen ? (
        <ConfirmDialog
          open
          title={`Delete ${contact.fullName}?`}
          description="This removes the contact from the workspace. Campaign history keeps its own snapshot of who was contacted."
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
