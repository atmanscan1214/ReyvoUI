import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Building,
  Chart,
  CheckCircle,
  Inbox,
  MoreHorizontal,
  Plus,
  Refresh,
  Users,
} from '../../../components/icons'
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Drawer,
  EmptyState,
  ErrorPanel,
  FilterBar,
  FilterSelect,
  Modal,
  PageHeader,
  Pagination,
  Skeleton,
  StatusBadge,
  Stepper,
  Tabs,
  UploadDropzone,
  useToast,
} from '../../../components/ui'
import { usePageTitle } from '../../../lib/usePageTitle'
import './ui-kit.css'

const COMPANIES = [
  { id: 'c1', name: 'Northline Talent', domain: 'northline.test', contact: 'Dana Reed', status: 'active', employees: 84, owner: 'Dana Reed', lastActivity: '2 hours ago' },
  { id: 'c2', name: 'Brightpath Staffing', domain: 'brightpath.test', contact: 'Milo Grant', status: 'trial', employees: 32, owner: 'Dana Reed', lastActivity: 'Yesterday' },
  { id: 'c3', name: 'Harbor & Field', domain: 'harborfield.test', contact: 'Priya Shah', status: 'paused', employees: 210, owner: 'Alex Kim', lastActivity: '3 days ago' },
  { id: 'c4', name: 'Summit Works', domain: 'summitworks.test', contact: 'Owen Bell', status: 'active', employees: 64, owner: 'Alex Kim', lastActivity: '4 days ago' },
  { id: 'c5', name: 'Cedar Lane Group', domain: 'cedarlane.test', contact: 'Rae Lin', status: 'needs_review', employees: 18, owner: 'Dana Reed', lastActivity: '5 days ago' },
  { id: 'c6', name: 'Atlas Recruiting', domain: 'atlasrecruiting.test', contact: 'Theo Marsh', status: 'active', employees: 145, owner: 'Sam Ortiz', lastActivity: '1 week ago' },
  { id: 'c7', name: 'Juniper People', domain: 'juniperpeople.test', contact: 'Iris Cole', status: 'suspended', employees: 9, owner: 'Sam Ortiz', lastActivity: '1 week ago' },
  { id: 'c8', name: 'Kestrel Partners', domain: 'kestrelpartners.test', contact: 'Noah West', status: 'trial', employees: 51, owner: 'Dana Reed', lastActivity: '2 weeks ago' },
  { id: 'c9', name: 'Willow & Co', domain: 'willowco.test', contact: 'Mina Park', status: 'active', employees: 76, owner: 'Alex Kim', lastActivity: '2 weeks ago' },
  { id: 'c10', name: 'Pinecrest Search', domain: 'pinecrest.test', contact: 'Luca Grey', status: 'paused', employees: 27, owner: 'Sam Ortiz', lastActivity: '3 weeks ago' },
  { id: 'c11', name: 'Rivet Talent', domain: 'rivettalent.test', contact: 'Zoe Hart', status: 'active', employees: 118, owner: 'Dana Reed', lastActivity: '3 weeks ago' },
  { id: 'c12', name: 'Golden Hour Group', domain: 'goldenhour.test', contact: 'Ira Fox', status: 'needs_review', employees: 41, owner: 'Alex Kim', lastActivity: '4 weeks ago' },
  { id: 'c13', name: 'Meridian Staffing', domain: 'meridianstaffing.test', contact: 'June Ellis', status: 'active', employees: 93, owner: 'Sam Ortiz', lastActivity: '1 month ago' },
  { id: 'c14', name: 'Foxglove Talent', domain: 'foxglove.test', contact: 'Remy Dale', status: 'trial', employees: 22, owner: 'Dana Reed', lastActivity: '1 month ago' },
  { id: 'c15', name: 'Orchard Row', domain: 'orchardrow.test', contact: 'Nina Frost', status: 'active', employees: 57, owner: 'Alex Kim', lastActivity: '1 month ago' },
  { id: 'c16', name: 'Bluebird Search', domain: 'bluebirdsearch.test', contact: 'Cody Lane', status: 'paused', employees: 36, owner: 'Sam Ortiz', lastActivity: '2 months ago' },
  { id: 'c17', name: 'Stonebridge People', domain: 'stonebridge.test', contact: 'Elle Moss', status: 'suspended', employees: 13, owner: 'Dana Reed', lastActivity: '2 months ago' },
  { id: 'c18', name: 'Larchmont Group', domain: 'larchmont.test', contact: 'Ash Reed', status: 'active', employees: 102, owner: 'Alex Kim', lastActivity: '2 months ago' },
]

const STEPS = [
  { id: 'map', label: 'Map columns', description: 'Match your CSV headers' },
  { id: 'review', label: 'Review rows', description: 'Check duplicates and suppressions' },
  { id: 'fix', label: 'Fix errors', description: 'Resolve rejected rows' },
  { id: 'import', label: 'Import', description: 'Start the background job' },
]

const TABS = [
  {
    id: 'all',
    label: 'All companies',
    count: 18,
    content: (
      <p className="kit-copy">
        The default tab lists every company in the workspace. Counts come from the same filtered
        query, so tabs and list results stay in sync.
      </p>
    ),
  },
  {
    id: 'engaged',
    label: 'Engaged',
    count: 6,
    content: (
      <p className="kit-copy">
        Engaged companies have at least one reply, meeting, or open opportunity in the current
        reporting window.
      </p>
    ),
  },
  {
    id: 'review',
    label: 'Needs review',
    count: 2,
    content: (
      <p className="kit-copy">
        Rows with missing domains or an unverified status land here instead of disappearing into
        the list.
      </p>
    ),
  },
]

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function UiKitPage() {
  usePageTitle('Component kit')
  const { toast } = useToast()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [owner, setOwner] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)
  const [sort, setSort] = useState({ key: 'name', direction: 'asc' })
  const [selected, setSelected] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const [tableError, setTableError] = useState(false)

  const [activeTab, setActiveTab] = useState('all')
  const [step, setStep] = useState(1)

  const [modalOpen, setModalOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmLoading, setConfirmLoading] = useState(false)

  const [uploads, setUploads] = useState([])

  const activeFilters = (search ? 1 : 0) + (status ? 1 : 0) + (owner ? 1 : 0)

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return COMPANIES.filter((company) => {
      if (status && company.status !== status) return false
      if (owner && company.owner !== owner) return false
      if (!needle) return true
      return [company.name, company.domain, company.contact, company.owner]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [search, status, owner])

  const sorted = useMemo(() => {
    if (!sort) return filtered
    const direction = sort.direction === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (sort.key === 'employees') return (a.employees - b.employees) * direction
      return String(a[sort.key]).localeCompare(String(b[sort.key])) * direction
    })
  }, [filtered, sort])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  function resetFilters() {
    setSearch('')
    setStatus('')
    setOwner('')
    setPage(1)
  }

  function reloadTable() {
    setTableError(false)
    setLoading(true)
    window.setTimeout(() => {
      setLoading(false)
      toast.success('Company list refreshed')
    }, 700)
  }

  function handleConfirmArchive() {
    if (confirmLoading) return
    setConfirmLoading(true)
    window.setTimeout(() => {
      setConfirmLoading(false)
      setConfirmOpen(false)
      toast.success('Northline Talent archived')
    }, 700)
  }

  const columns = [
    {
      key: 'name',
      header: 'Company',
      sortable: true,
      render: (row) => (
        <div className="kit-company">
          <span className="kit-avatar" aria-hidden="true">
            {row.name.slice(0, 1)}
          </span>
          <span>
            <strong>{row.name}</strong>
            <span>{row.domain}</span>
          </span>
        </div>
      ),
    },
    { key: 'contact', header: 'Primary contact' },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'employees',
      header: 'Employees',
      sortable: true,
      align: 'right',
      render: (row) => row.employees.toLocaleString(),
    },
    {
      key: 'owner',
      header: 'Owner',
      render: (row) => <span className="kit-muted">{row.owner}</span>,
    },
    {
      key: 'lastActivity',
      header: 'Last activity',
      render: (row) => <span className="kit-muted">{row.lastActivity}</span>,
    },
    {
      key: 'actions',
      header: <span className="visually-hidden">Actions</span>,
      align: 'right',
      render: (row) => (
        <button
          type="button"
          className="kit-icon-btn"
          aria-label={`More actions for ${row.name}`}
          onClick={(event) => {
            event.stopPropagation()
            toast.info(`Actions for ${row.name}`)
          }}
        >
          <MoreHorizontal size={16} />
        </button>
      ),
    },
  ]

  return (
    <div className="app-page kit-page">
      <PageHeader
        eyebrow="Internal · design system"
        title="Component kit"
        description="The shared pieces behind every product screen. This page is a live harness: it exercises loading, empty, error, selection, sorting, and dialog states instead of showing static screenshots."
        meta={
          <>
            <Badge tone="lime">Draft</Badge>
            <Badge tone="outline">15 components</Badge>
            <Badge tone="neutral">React + CSS</Badge>
          </>
        }
        actions={
          <>
            <Button
              variant="ghost"
              leadingIcon={Refresh}
              onClick={reloadTable}
              loading={loading}
            >
              Reload data
            </Button>
            <Button leadingIcon={Plus} onClick={() => setModalOpen(true)}>
              New company
            </Button>
          </>
        }
      />

      <section className="app-card kit-section" aria-labelledby="kit-buttons">
        <div className="kit-section__head">
          <div>
            <p className="kit-section__label">Actions</p>
            <h2 id="kit-buttons">Buttons and badges</h2>
          </div>
          <p className="kit-section__note">One vocabulary for actions, statuses, and counts.</p>
        </div>

        <div className="kit-row" aria-label="Button variants">
          <Button>Primary</Button>
          <Button variant="lime">Lime</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger" leadingIcon={Plus}>
            Archive
          </Button>
          <Button variant="quiet">Quiet</Button>
          <Button leadingIcon={ArrowRight} trailingIcon={ArrowRight} loading>
            Saving
          </Button>
          <Button variant="ghost" disabled>
            Disabled
          </Button>
          <Button size="sm" variant="ghost" leadingIcon={Refresh}>
            Small
          </Button>
        </div>

        <div className="kit-row kit-row--spaced" aria-label="Badge tones">
          <Badge>Neutral</Badge>
          <Badge tone="lime">Trial</Badge>
          <Badge tone="success">Active</Badge>
          <Badge tone="warning">Past due</Badge>
          <Badge tone="danger">Suspended</Badge>
          <Badge tone="info">Scheduled</Badge>
          <Badge tone="outline">Outline</Badge>
          <Badge tone="success" size="sm" dot>
            Connected
          </Badge>
        </div>

        <div className="kit-row kit-row--spaced" aria-label="Status badges">
          <StatusBadge status="active" />
          <StatusBadge status="trial" />
          <StatusBadge status="past_due" />
          <StatusBadge status="needs_review" />
          <StatusBadge status="failed" />
          <StatusBadge status="not_interested" />
          <StatusBadge status="unsubscribed" />
        </div>
      </section>

      <section className="app-card kit-section" aria-labelledby="kit-table">
        <div className="kit-section__head">
          <div>
            <p className="kit-section__label">Lists</p>
            <h2 id="kit-table">Companies</h2>
          </div>
          <div className="kit-row">
            <Button
              size="sm"
              variant={tableError ? 'lime' : 'ghost'}
              onClick={() => {
                setTableError((current) => !current)
                setLoading(false)
              }}
            >
              {tableError ? 'Show data' : 'Simulate error'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={Plus}
              onClick={() => toast.info('Company creation is a T11 screen.')}
            >
              Add company
            </Button>
          </div>
        </div>

        <FilterBar
          search={search}
          onSearchChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
          searchPlaceholder="Search companies, contacts, or domains…"
          activeCount={activeFilters}
          onReset={resetFilters}
          actions={
            <Button variant="quiet" size="sm" leadingIcon={ArrowRight}>
              Export
            </Button>
          }
        >
          <FilterSelect
            label="Status"
            value={status}
            onChange={(value) => {
              setStatus(value)
              setPage(1)
            }}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'trial', label: 'Trial' },
              { value: 'paused', label: 'Paused' },
              { value: 'needs_review', label: 'Needs review' },
              { value: 'suspended', label: 'Suspended' },
            ]}
          />
          <FilterSelect
            label="Owner"
            value={owner}
            onChange={(value) => {
              setOwner(value)
              setPage(1)
            }}
            options={[
              { value: 'Dana Reed', label: 'Dana Reed' },
              { value: 'Alex Kim', label: 'Alex Kim' },
              { value: 'Sam Ortiz', label: 'Sam Ortiz' },
            ]}
          />
        </FilterBar>

        {selected.size > 0 ? (
          <div className="kit-bulk" role="status">
            <strong>{selected.size} selected</strong>
            <span>Bulk actions stay above the table.</span>
            <Button size="sm" variant="ghost" onClick={() => toast.success('Selected companies archived')}>
              Archive
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        ) : null}

        <DataTable
          columns={columns}
          rows={pageRows}
          caption="Companies"
          getRowKey={(row) => row.id}
          selectable
          selectedKeys={selected}
          onSelectionChange={setSelected}
          rowLabel={(row) => `Select ${row.name}`}
          onRowClick={(row) => setDrawerOpen(row.id)}
          sort={sort}
          onSortChange={(next) => {
            setSort(next)
            setPage(1)
          }}
          loading={loading}
          error={
            tableError
              ? { message: 'The company list could not be loaded.', requestId: 'req_8f12a3' }
              : null
          }
          onRetry={() => {
            setTableError(false)
            reloadTable()
          }}
          empty={
            <EmptyState
              compact
              icon={Building}
              title="No companies match"
              description="Try a different search term or clear the filters to see the full list."
              actions={
                <Button size="sm" variant="ghost" onClick={resetFilters}>
                  Clear filters
                </Button>
              }
            />
          }
        />

        <Pagination
          page={currentPage}
          pageSize={pageSize}
          total={sorted.length}
          pageSizeOptions={[5, 10, 25]}
          itemLabel="companies"
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
        />
      </section>

      <div className="kit-grid">
        <section className="app-card kit-section" aria-labelledby="kit-tabs">
          <div className="kit-section__head">
            <div>
              <p className="kit-section__label">Navigation</p>
              <h2 id="kit-tabs">Tabs</h2>
            </div>
            <p className="kit-section__note">Controlled or uncontrolled.</p>
          </div>
          <Tabs
            items={TABS}
            value={activeTab}
            onChange={setActiveTab}
            label="Company views"
            panelClassName="kit-tabs-panel"
          />
        </section>

        <section className="app-card kit-section" aria-labelledby="kit-stepper">
          <div className="kit-section__head">
            <div>
              <p className="kit-section__label">Flow</p>
              <h2 id="kit-stepper">Stepper</h2>
            </div>
            <p className="kit-section__note">Click a completed step.</p>
          </div>
          <Stepper
            steps={STEPS}
            current={step}
            onStepChange={(index) => setStep(index)}
          />
          <div className="kit-stepper-actions">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              disabled={step === 0}
            >
              Back
            </Button>
            <span className="kit-muted">
              Step {step + 1} of {STEPS.length}
            </span>
            <Button
              size="sm"
              onClick={() => setStep((current) => Math.min(STEPS.length - 1, current + 1))}
              disabled={step === STEPS.length - 1}
            >
              Continue
            </Button>
          </div>
        </section>
      </div>

      <section className="app-card kit-section" aria-labelledby="kit-overlays">
        <div className="kit-section__head">
          <div>
            <p className="kit-section__label">Overlays</p>
            <h2 id="kit-overlays">Modal, drawer, and confirmation</h2>
          </div>
          <p className="kit-section__note">Focus is trapped; Escape closes; focus returns.</p>
        </div>

        <div className="kit-row">
          <Button variant="ghost" onClick={() => setModalOpen(true)}>
            Open modal
          </Button>
          <Button variant="ghost" onClick={() => setDrawerOpen(true)}>
            Open drawer
          </Button>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            Archive company
          </Button>
        </div>
      </section>

      <div className="kit-grid">
        <section className="app-card kit-section" aria-labelledby="kit-toasts">
          <div className="kit-section__head">
            <div>
              <p className="kit-section__label">Feedback</p>
              <h2 id="kit-toasts">Toasts</h2>
            </div>
            <p className="kit-section__note">Auto-dismiss, stack, and announce.</p>
          </div>
          <div className="kit-row">
            <Button size="sm" variant="ghost" onClick={() => toast.success('Import finished. 248 rows added.')}>
              Success
            </Button>
            <Button size="sm" variant="ghost" onClick={() => toast.error('The mailbox could not be connected.')}>
              Error
            </Button>
            <Button size="sm" variant="ghost" onClick={() => toast.warning('3 contacts were skipped as duplicates.')}>
              Warning
            </Button>
            <Button size="sm" variant="ghost" onClick={() => toast.info('Report is being prepared.')}>
              Info
            </Button>
          </div>
        </section>

        <section className="app-card kit-section" aria-labelledby="kit-upload">
          <div className="kit-section__head">
            <div>
              <p className="kit-section__label">Import</p>
              <h2 id="kit-upload">Upload dropzone</h2>
            </div>
            <p className="kit-section__note">Type and size checked before upload.</p>
          </div>
          <UploadDropzone
            label="Drop your contacts CSV here"
            hint="CSV up to 10 MB · first row should contain headers"
            onFiles={(accepted, rejected) => {
              if (accepted.length > 0) {
                setUploads(
                  accepted.map((file) => ({
                    name: file.name,
                    size: file.size,
                    status: 'ready',
                  })),
                )
                toast.success(`${accepted.length} file ready for mapping`)
              }
              if (rejected.length > 0) {
                setUploads(
                  rejected.map((item) => ({
                    name: item.file.name,
                    size: item.file.size,
                    status: 'failed',
                    reason:
                      item.reason === 'size'
                        ? 'Larger than 10 MB'
                        : 'Not a CSV file',
                  })),
                )
                toast.error('Some files were rejected before upload.')
              }
            }}
          />
          {uploads.length > 0 ? (
            <ul className="kit-file-list">
              {uploads.map((file) => (
                <li key={file.name} className="kit-file">
                  <span>
                    <strong>{file.name}</strong>
                    <span>
                      {formatBytes(file.size)}
                      {file.reason ? ` · ${file.reason}` : null}
                    </span>
                  </span>
                  <StatusBadge status={file.status} label={file.status === 'ready' ? 'Ready' : 'Rejected'} />
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>

      <section className="app-card kit-section" aria-labelledby="kit-states">
        <div className="kit-section__head">
          <div>
            <p className="kit-section__label">Resilience</p>
            <h2 id="kit-states">Skeleton, empty, and error states</h2>
          </div>
          <p className="kit-section__note">Every list gets all three without a page-specific design.</p>
        </div>

        <div className="kit-state-grid">
          <div className="kit-state">
            <p className="kit-subhead">Skeleton</p>
            <div className="kit-skeleton-card">
              <Skeleton variant="circle" />
              <div>
                <Skeleton variant="text" width="46%" />
                <Skeleton variant="text" lines={3} />
              </div>
            </div>
          </div>

          <div className="kit-state">
            <p className="kit-subhead">Empty</p>
            <EmptyState
              compact
              icon={Inbox}
              title="No campaigns yet"
              description="Build a sequence, pick an audience, and Reyvo will keep the follow-ups on schedule."
              actions={<Button size="sm">New campaign</Button>}
            />
          </div>

          <div className="kit-state">
            <p className="kit-subhead">Error</p>
            <ErrorPanel
              compact
              title="Couldn’t load the inbox"
              description="The connection timed out. Your messages are still safe."
              requestId="req_91bc02"
              onRetry={() => toast.info('Retrying the inbox request…')}
            />
          </div>

          <div className="kit-state">
            <p className="kit-subhead">Status language</p>
            <div className="kit-row">
              <Badge tone="success" dot>
                Delivered
              </Badge>
              <Badge tone="info" dot>
                Sending
              </Badge>
              <Badge tone="warning" dot>
                Paused
              </Badge>
              <Badge tone="danger" dot>
                Bounced
              </Badge>
            </div>
            <p className="kit-copy">
              The same tones appear in filters, tables, and detail summaries, so a status never
              changes colour between screens.
            </p>
            <div className="kit-row kit-row--spaced">
              <span className="kit-inline-meta">
                <CheckCircle size={15} aria-hidden="true" />
                12 delivered today
              </span>
              <span className="kit-inline-meta">
                <Chart size={15} aria-hidden="true" />
                41% open rate
              </span>
              <span className="kit-inline-meta">
                <Users size={15} aria-hidden="true" />
                1,204 contacts
              </span>
            </div>
          </div>
        </div>
      </section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New company"
        description="Add a company by hand. Domain and owner can be changed later."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setModalOpen(false)
                toast.success('Company draft saved')
              }}
            >
              Save company
            </Button>
          </>
        }
      >
        <div className="kit-form">
          <div className="ui-field">
            <label htmlFor="kit-company-name">Company name</label>
            <input id="kit-company-name" className="ui-input" placeholder="Northline Talent" />
          </div>
          <div className="ui-field">
            <label htmlFor="kit-company-domain">Domain</label>
            <input id="kit-company-domain" className="ui-input" placeholder="northline.com" />
          </div>
          <div className="ui-field">
            <label htmlFor="kit-company-owner">Owner</label>
            <select id="kit-company-owner" className="ui-select" defaultValue="dana">
              <option value="dana">Dana Reed</option>
              <option value="alex">Alex Kim</option>
              <option value="sam">Sam Ortiz</option>
            </select>
          </div>
        </div>
      </Modal>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Northline Talent"
        description="Record details live in a drawer so the list keeps its scroll and filters."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDrawerOpen(false)}>
              Close
            </Button>
            <Button onClick={() => toast.info('Opening the full company record…')}>
              Open record
            </Button>
          </>
        }
      >
        <dl className="kit-detail">
          <div>
            <dt>Status</dt>
            <dd>
              <StatusBadge status="active" />
            </dd>
          </div>
          <div>
            <dt>Domain</dt>
            <dd>northline.test</dd>
          </div>
          <div>
            <dt>Primary contact</dt>
            <dd>Dana Reed · dana@northline.test</dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd>Dana Reed</dd>
          </div>
          <div>
            <dt>Employees</dt>
            <dd>84</dd>
          </div>
          <div>
            <dt>Last activity</dt>
            <dd>2 hours ago</dd>
          </div>
        </dl>
      </Drawer>

      <ConfirmDialog
        open={confirmOpen}
        title="Archive this company?"
        description="Northline Talent and its 84 contacts will be removed from active lists. You can restore it for 30 days."
        confirmLabel="Archive company"
        loading={confirmLoading}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmArchive}
      />
    </div>
  )
}
