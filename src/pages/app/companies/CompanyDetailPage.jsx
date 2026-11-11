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
  ExternalLink,
  Globe,
  Lock,
  Refresh,
  Users,
} from '../../../components/icons'
import {
  companyLocation,
  companyWebsite,
  deleteCompany,
  getCompany,
  listCompanyContacts,
  withScheme,
} from '../../../lib/companies'
import { useSession } from '../../../lib/session'
import { usePageTitle } from '../../../lib/usePageTitle'
import { CompanyFormModal } from './CompanyFormModal'
import './companies.css'

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
    <div className="company-facts__row">
      <dt>{label}</dt>
      <dd>{children || <span className="companies__muted">—</span>}</dd>
    </div>
  )
}

function ExternalLinkRow({ href, children }) {
  return (
    <a className="company-facts__link" href={href} target="_blank" rel="noreferrer">
      {children}
      <ExternalLink size={13} aria-hidden="true" />
    </a>
  )
}

function DetailSkeleton() {
  return (
    <div className="company-detail" aria-busy="true">
      <div className="company-detail__main">
        <section className="app-card">
          <Skeleton variant="text" width="30%" height={16} />
          <div className="company-detail__skeleton-lines">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} variant="text" width={`${60 + (index % 3) * 12}%`} />
            ))}
          </div>
        </section>
        <section className="app-card">
          <Skeleton variant="text" width="24%" height={16} />
          <div className="company-detail__skeleton-lines">
            <Skeleton variant="text" width="92%" />
            <Skeleton variant="text" width="76%" />
          </div>
        </section>
      </div>
      <aside className="company-detail__aside">
        <section className="app-card">
          <Skeleton variant="text" width="40%" height={16} />
          <div className="company-detail__skeleton-lines">
            <Skeleton variant="text" width="88%" />
            <Skeleton variant="text" width="70%" />
          </div>
        </section>
      </aside>
    </div>
  )
}

export function CompanyDetailPage() {
  const { companyId } = useParams()
  const navigate = useNavigate()
  const { role, profileStatus } = useSession()
  const { toast } = useToast()

  const [company, setCompany] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [contacts, setContacts] = useState({ items: [], total: 0 })
  const [contactsStatus, setContactsStatus] = useState('loading')
  const [contactsError, setContactsError] = useState(null)
  const [contactsRefresh, setContactsRefresh] = useState(0)

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  usePageTitle(company?.name || 'Company')

  // Wait for the profile before calling the role read-only.
  const roleKnown = profileStatus === 'ready'
  const canWrite = roleKnown && (role === 'owner' || role === 'admin')

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    setError(null)

    getCompany(companyId, controller.signal)
      .then((data) => {
        setCompany(data)
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
  }, [companyId, refreshKey])

  useEffect(() => {
    const controller = new AbortController()
    setContactsStatus('loading')
    setContactsError(null)

    listCompanyContacts(companyId, { limit: 5 }, controller.signal)
      .then((data) => {
        setContacts(data)
        setContactsStatus('ready')
      })
      .catch((caught) => {
        if (caught?.name === 'AbortError') return
        setContactsError(caught)
        setContactsStatus('error')
      })

    return () => controller.abort()
  }, [companyId, contactsRefresh])

  async function handleDelete() {
    setDeleting(true)
    setDeleteError(null)

    try {
      await deleteCompany(company.id)
      toast.success('Company deleted.')
      navigate('/app/companies', { replace: true })
    } catch (caught) {
      setDeleteError(
        caught?.status === 403
          ? 'Your role does not allow deleting company records.'
          : caught?.message || 'We could not delete this company. Try again.',
      )
    } finally {
      setDeleting(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="app-page companies-page">
        <PageHeader
          eyebrow="Companies"
          title="Company"
          backTo="/app/companies"
          backLabel="Companies"
          description="Loading this company record…"
        />
        <DetailSkeleton />
      </div>
    )
  }

  if (status === 'missing') {
    return (
      <div className="app-page companies-page">
        <PageHeader
          eyebrow="Companies"
          title="Company not found"
          backTo="/app/companies"
          backLabel="Companies"
          description="The record may have been deleted, or the link may be out of date."
        />
        <section className="app-card">
          <EmptyState
            icon={Building}
            title="That company isn’t here"
            description="It may belong to another workspace, or someone may have deleted it."
            actions={
              <Link to="/app/companies" className="btn btn--primary btn--sm">
                Back to companies
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
      <div className="app-page companies-page">
        <PageHeader
          eyebrow="Companies"
          title="Company access restricted"
          backTo="/app/companies"
          backLabel="Companies"
        />
        <section className="app-card companies__denied">
          <span className="companies__denied-icon" aria-hidden="true">
            <Lock size={22} />
          </span>
          <h2>You don’t have access to this record</h2>
          <p>
            {error?.message ||
              'Your role does not allow access to company records. Ask an owner or admin for access.'}
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
      <div className="app-page companies-page">
        <PageHeader
          eyebrow="Companies"
          title="Company"
          backTo="/app/companies"
          backLabel="Companies"
        />
        <section className="app-card">
          <ErrorPanel
            title="Couldn’t load this company"
            description={error?.message}
            requestId={error?.requestId}
            onRetry={() => setRefreshKey((key) => key + 1)}
          />
        </section>
      </div>
    )
  }

  const location = companyLocation(company)
  const website = companyWebsite(company)
  const customFields = Object.entries(company.customFields ?? {})
  const initials = company.name.slice(0, 2).toUpperCase()

  return (
    <div className="app-page companies-page">
      <PageHeader
        eyebrow={`Companies${company.industry ? ` · ${company.industry}` : ''}`}
        title={company.name}
        backTo="/app/companies"
        backLabel="Companies"
        description={
          location || company.domain
            ? [location, company.domain].filter(Boolean).join(' · ')
            : 'Company record'
        }
        meta={
          <>
            <StatusBadge status={company.status} />
            {company.industry ? (
              <Badge tone="outline" dot>
                {company.industry}
              </Badge>
            ) : null}
            {company.employeeCount != null ? (
              <span className="companies__meta">
                {company.employeeCount.toLocaleString()} employees
              </span>
            ) : null}
          </>
        }
        actions={
          canWrite ? (
            <Button variant="primary" onClick={() => setEditOpen(true)}>
              Edit company
            </Button>
          ) : null
        }
      />

      {roleKnown && !canWrite ? (
        <div className="companies__notice" role="status">
          <span className="companies__notice-icon" aria-hidden="true">
            <Lock size={17} />
          </span>
          <p>
            Your role can view this company but not change it. Ask an owner or admin when a record
            needs an update.
          </p>
        </div>
      ) : null}

      <div className="company-detail">
        <div className="company-detail__main">
          <section className="app-card company-detail__card" aria-labelledby="company-overview">
            <header className="company-detail__head">
              <span className="company-detail__avatar" aria-hidden="true">
                {initials}
              </span>
              <div>
                <h2 id="company-overview">Overview</h2>
                <p>The facts your team uses before the first conversation.</p>
              </div>
            </header>

            <dl className="company-facts">
              <Fact label="Domain">
                {company.domain ? (
                  <ExternalLinkRow href={`https://${company.domain}`}>
                    {company.domain}
                  </ExternalLinkRow>
                ) : null}
              </Fact>
              <Fact label="Industry">{company.industry}</Fact>
              <Fact label="Employees">
                {company.employeeCount == null
                  ? null
                  : company.employeeCount.toLocaleString()}
              </Fact>
              <Fact label="Location">{location}</Fact>
              <Fact label="Website">
                {website ? <ExternalLinkRow href={website}>{company.website || website}</ExternalLinkRow> : null}
              </Fact>
              <Fact label="LinkedIn">
                {company.linkedinUrl ? (
                  <ExternalLinkRow href={withScheme(company.linkedinUrl)}>
                    {company.linkedinUrl.replace(/^https?:\/\//, '')}
                  </ExternalLinkRow>
                ) : null}
              </Fact>
              <Fact label="Source">{company.source}</Fact>
              <Fact label="Added">{formatDate(company.createdAt)}</Fact>
              <Fact label="Updated">{formatDate(company.updatedAt)}</Fact>
            </dl>
          </section>

          <section className="app-card company-detail__card" aria-labelledby="company-notes">
            <header className="company-detail__head">
              <span className="company-detail__icon" aria-hidden="true">
                <Clock size={18} />
              </span>
              <div>
                <h2 id="company-notes">Notes</h2>
                <p>Shared context for anyone working this account.</p>
              </div>
            </header>

            {company.notes ? (
              <p className="company-detail__notes">{company.notes}</p>
            ) : (
              <p className="company-detail__empty">
                No notes yet. {canWrite ? 'Edit the company to add context.' : ''}
              </p>
            )}
          </section>

          <section className="app-card company-detail__card" aria-labelledby="company-custom">
            <header className="company-detail__head">
              <span className="company-detail__icon" aria-hidden="true">
                <Globe size={18} />
              </span>
              <div>
                <h2 id="company-custom">Custom fields</h2>
                <p>Team-defined labels stored with this record.</p>
              </div>
            </header>

            {customFields.length > 0 ? (
              <dl className="company-facts company-facts--compact">
                {customFields.map(([key, value]) => (
                  <Fact key={key} label={key}>
                    {value === '' || value == null ? null : String(value)}
                  </Fact>
                ))}
              </dl>
            ) : (
              <p className="company-detail__empty">
                No custom fields. {canWrite ? 'Add them when you edit this company.' : ''}
              </p>
            )}
          </section>
        </div>

        <aside className="company-detail__aside">
          <section className="app-card company-detail__card" aria-labelledby="company-people">
            <header className="company-detail__head">
              <span className="company-detail__icon" aria-hidden="true">
                <Users size={18} />
              </span>
              <div>
                <h2 id="company-people">People</h2>
                <p>Contacts attached to this company.</p>
              </div>
              {contactsStatus === 'ready' ? (
                <Badge tone="neutral" size="sm">
                  {contacts.total}
                </Badge>
              ) : null}
            </header>

            {contactsStatus === 'loading' ? (
              <div className="company-detail__skeleton-lines">
                <Skeleton variant="text" width="80%" />
                <Skeleton variant="text" width="62%" />
              </div>
            ) : contactsStatus === 'error' ? (
              <div className="company-detail__inline-error" role="alert">
                <AlertCircle size={15} aria-hidden="true" />
                <span>
                  {contactsError?.message || 'We could not load contacts for this company.'}
                </span>
                <button
                  type="button"
                  className="company-detail__inline-retry"
                  onClick={() => setContactsRefresh((key) => key + 1)}
                >
                  Retry
                </button>
              </div>
            ) : contacts.items.length === 0 ? (
              <p className="company-detail__empty">
                No contacts attached yet. Contacts are added manually or by import.
              </p>
            ) : (
              <ul className="company-people">
                {contacts.items.map((contact) => (
                  <li key={contact.id} className="company-people__item">
                    <div className="company-people__main">
                      <p className="company-people__name">{contact.fullName}</p>
                      <p className="company-people__meta">
                        {[contact.title, contact.email].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <StatusBadge status={contact.emailStatus} size="sm" dot={false} />
                  </li>
                ))}
              </ul>
            )}

            <Link to={`/app/contacts?company_id=${company.id}`} className="company-detail__link">
              View all contacts
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </section>

          {canWrite ? (
            <section className="app-card company-detail__danger" aria-labelledby="company-danger">
              <h2 id="company-danger">Delete company</h2>
              <p>
                The record is removed and its contacts stay in the workspace, unattached. This
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
                Delete company
              </Button>
            </section>
          ) : null}
        </aside>
      </div>

      <CompanyFormModal
        open={editOpen}
        company={company}
        onClose={() => setEditOpen(false)}
        onSaved={(saved) => {
          setCompany(saved)
          setEditOpen(false)
          setRefreshKey((key) => key + 1)
        }}
      />

      {deleteOpen ? (
        <ConfirmDialog
          open
          title={`Delete ${company.name}?`}
          description={
            contacts.total > 0
              ? `${contacts.total} ${contacts.total === 1 ? 'contact stays' : 'contacts stay'} in the workspace and will be detached from this company.`
              : 'This removes the company record. Contacts are never deleted with a company.'
          }
          confirmLabel="Delete company"
          loading={deleting}
          onCancel={() => {
            if (deleting) return
            setDeleteOpen(false)
            setDeleteError(null)
          }}
          onConfirm={handleDelete}
        >
          {deleteError ? (
            <p className="company-detail__dialog-error" role="alert">
              <AlertCircle size={15} aria-hidden="true" />
              <span>{deleteError}</span>
            </p>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </div>
  )
}
