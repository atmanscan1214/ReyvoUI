import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Badge,
  Button,
  EmptyState,
  ErrorPanel,
  PageHeader,
  Skeleton,
  StatusBadge,
  useToast,
} from '../../../components/ui'
import {
  ArrowRight,
  Clock,
  Copy,
  Info,
  Lock,
  Pause,
  Refresh,
  Send,
  Users,
} from '../../../components/icons'
import {
  archiveCampaign,
  campaignStatusMeta,
  deleteCampaign,
  duplicateCampaign,
  getCampaign,
  getCampaignStats,
  launchCampaign,
  pauseCampaign,
  readAiDraftSettings,
  resumeCampaign,
} from '../../../lib/campaigns'
import { useSession } from '../../../lib/session'
import { usePageTitle } from '../../../lib/usePageTitle'

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

function audienceLabel(campaign) {
  if (campaign.audienceType === 'list') return 'List'
  if (campaign.audienceType === 'segment') return 'Segment'
  if (campaign.audienceSize > 0) return `${campaign.audienceSize.toLocaleString()} contacts`
  return 'No audience yet'
}

function DetailSkeleton() {
  return (
    <div className="camp-detail" aria-busy="true">
      <div className="camp-detail__main">
        <section className="app-card">
          <Skeleton variant="text" width="30%" height={18} />
          <div className="camp-detail__skeleton-lines">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton key={index} variant="text" width={`${58 + (index % 3) * 14}%`} />
            ))}
          </div>
        </section>
        <section className="app-card">
          <Skeleton variant="text" width="24%" height={16} />
          <div className="camp-detail__skeleton-lines">
            <Skeleton variant="text" width="90%" />
            <Skeleton variant="text" width="72%" />
          </div>
        </section>
      </div>
      <aside className="camp-detail__aside">
        <section className="app-card">
          <Skeleton variant="text" width="35%" height={16} />
          <div className="camp-detail__skeleton-lines">
            <Skeleton variant="text" width="88%" />
            <Skeleton variant="text" width="64%" />
          </div>
        </section>
      </aside>
    </div>
  )
}

export function CampaignDetailPage() {
  const { campaignId } = useParams()
  const navigate = useNavigate()
  const { role, profileStatus } = useSession()
  const { toast } = useToast()

  const [campaign, setCampaign] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [busyAction, setBusyAction] = useState(null)

  const [stats, setStats] = useState({
    enrolled: 0,
    active: 0,
    stopped: 0,
    completed: 0,
    sent: 0,
    replies: 0,
  })

  const roleKnown = profileStatus === 'ready'
  const canWrite = roleKnown && (role === 'owner' || role === 'admin')
  const statusMeta = useMemo(() => campaignStatusMeta(campaign?.status), [campaign?.status])
  const aiLaunchBlocked = Boolean(
    campaign &&
      readAiDraftSettings().enabled &&
      (readAiDraftSettings().approvalMode ?? 'edit_then_approve') === 'edit_then_approve' &&
      campaign.steps?.some((step) => Boolean(step.aiGenerated || step.ai_generated)),
  )

  usePageTitle(campaign?.name || 'Campaign')

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    setError(null)

    getCampaign(campaignId, controller.signal)
      .then((data) => {
        setCampaign(data)
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
  }, [campaignId, refreshKey])

  useEffect(() => {
    if (!campaignId) return undefined

    const controller = new AbortController()
    getCampaignStats(campaignId, controller.signal)
      .then((data) => setStats(data))
      .catch(() => {
        setStats({
          enrolled: 0,
          active: 0,
          stopped: 0,
          completed: 0,
          sent: 0,
          replies: 0,
        })
      })

    return () => controller.abort()
  }, [campaignId, refreshKey])

  async function handleAction(action) {
    if (!campaign) return
    setBusyAction(action)
    try {
      if (action === 'launch') {
        const settings = readAiDraftSettings()
        const aiReviewRequired = settings.enabled && (settings.approvalMode ?? 'edit_then_approve') === 'edit_then_approve'
        const hasAiGeneratedCopy = campaign.steps?.some((step) => Boolean(step.aiGenerated || step.ai_generated))

        if (aiReviewRequired && hasAiGeneratedCopy) {
          toast.error('AI-generated copy is set to edit-then-approve. Review and approve the draft before launching.')
          return
        }

        await launchCampaign(campaign.id)
        toast.success(`${campaign.name} is now active.`)
      } else if (action === 'pause') {
        await pauseCampaign(campaign.id)
        toast.success(`${campaign.name} has been paused.`)
      } else if (action === 'resume') {
        await resumeCampaign(campaign.id)
        toast.success(`${campaign.name} is sending again.`)
      } else if (action === 'duplicate') {
        const copy = await duplicateCampaign(campaign.id)
        toast.success(`A copy of ${campaign.name} was created as "${copy.name}".`)
      } else if (action === 'archive') {
        await archiveCampaign(campaign.id)
        toast.success(`${campaign.name} was archived.`)
      } else if (action === 'delete') {
        await deleteCampaign(campaign.id)
        toast.success(`${campaign.name} was deleted.`)
        navigate('/app/campaigns', { replace: true })
        return
      }
      setRefreshKey((value) => value + 1)
    } catch (caught) {
      toast.error(caught?.message || 'The action could not be completed.')
    } finally {
      setBusyAction(null)
    }
  }

  if (status === 'loading') {
    return (
      <div className="app-page camp-page">
        <PageHeader
          eyebrow="Campaigns"
          title="Campaign"
          backTo="/app/campaigns"
          backLabel="Campaigns"
          description="Loading this campaign…"
        />
        <DetailSkeleton />
      </div>
    )
  }

  if (status === 'missing') {
    return (
      <div className="app-page camp-page">
        <PageHeader
          eyebrow="Campaigns"
          title="Campaign not found"
          backTo="/app/campaigns"
          backLabel="Campaigns"
          description="This campaign may have been deleted or the link may be outdated."
        />
        <section className="app-card">
          <EmptyState
            icon={Info}
            title="That campaign isn’t here"
            description="It may belong to another workspace or may have been archived and removed."
            actions={
              <Link to="/app/campaigns" className="btn btn--primary btn--sm">
                Back to campaigns
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
      <div className="app-page camp-page">
        <PageHeader
          eyebrow="Campaigns"
          title="Campaign access restricted"
          backTo="/app/campaigns"
          backLabel="Campaigns"
        />
        <section className="app-card camp-detail__denied">
          <span className="camp-detail__denied-icon" aria-hidden="true">
            <Lock size={22} />
          </span>
          <h2>You don’t have access to this campaign</h2>
          <p>
            {error?.message || 'Your role does not allow access to campaigns. Ask an owner or admin for access.'}
          </p>
          <Button variant="ghost" leadingIcon={Refresh} onClick={() => setRefreshKey((value) => value + 1)}>
            Try again
          </Button>
        </section>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="app-page camp-page">
        <PageHeader
          eyebrow="Campaigns"
          title="Campaign could not load"
          backTo="/app/campaigns"
          backLabel="Campaigns"
        />
        <ErrorPanel
          title="Couldn’t load this campaign"
          description={error?.message || undefined}
          requestId={error?.requestId}
          onRetry={() => setRefreshKey((value) => value + 1)}
        />
      </div>
    )
  }

  const primaryAction =
    campaign.status === 'approved'
      ? { label: 'Launch campaign', action: 'launch', icon: Send, variant: 'primary' }
      : campaign.status === 'active'
        ? { label: 'Pause campaign', action: 'pause', icon: Pause, variant: 'ghost' }
        : campaign.status === 'paused'
          ? { label: 'Resume campaign', action: 'resume', icon: Send, variant: 'primary' }
          : null

  return (
    <div className="app-page camp-page camp-detail-page">
      <PageHeader
        eyebrow="Campaigns"
        title={campaign.name}
        backTo="/app/campaigns"
        backLabel="Campaigns"
        description={statusMeta.description || 'Review the sequence, schedule, and lifecycle state.'}
        meta={
          <>
            <StatusBadge status={campaign.status} />
            <Badge tone="neutral" dot>
              {campaign.timezone}
            </Badge>
          </>
        }
        actions={
          canWrite && primaryAction ? (
            <Button
              variant={primaryAction.variant}
              leadingIcon={primaryAction.icon}
              loading={busyAction === primaryAction.action}
              disabled={aiLaunchBlocked && primaryAction.action === 'launch'}
              onClick={() => handleAction(primaryAction.action)}
            >
              {primaryAction.label}
            </Button>
          ) : null
        }
      />

      {!canWrite && roleKnown ? (
        <p className="camp__read-only">Your role can view this campaign, but launch and approval actions are locked to owners and admins.</p>
      ) : null}

      {aiLaunchBlocked ? (
        <p className="camp__read-only camp__read-only--warning">
          AI-generated copy is set to edit-then-approve. Review and approve the draft before the campaign can launch.
        </p>
      ) : null}

      <div className="camp-detail__grid">
        <main className="camp-detail__main">
          <section className="app-card">
            <div className="camp-detail__header-row">
              <div>
                <p className="camp-detail__eyebrow">Overview</p>
                <h2>{campaign.name}</h2>
              </div>
              <StatusBadge status={campaign.status} />
            </div>

            <div className="camp-detail__stats">
              <div className="camp-detail__stat">
                <span>Audience</span>
                <strong>{audienceLabel(campaign)}</strong>
              </div>
              <div className="camp-detail__stat">
                <span>Daily cap</span>
                <strong>{campaign.dailyCap.toLocaleString()}/day</strong>
              </div>
              <div className="camp-detail__stat">
                <span>Timezone</span>
                <strong>{campaign.timezone}</strong>
              </div>
              <div className="camp-detail__stat">
                <span>Updated</span>
                <strong>{formatDate(campaign.updatedAt)}</strong>
              </div>
            </div>

            <dl className="camp-detail__facts">
              <div className="camp-detail__fact">
                <dt>Approval</dt>
                <dd>{statusMeta.label}</dd>
              </div>
              <div className="camp-detail__fact">
                <dt>Mailboxes</dt>
                <dd>{campaign.emailAccountIds.length}</dd>
              </div>
              <div className="camp-detail__fact">
                <dt>Started</dt>
                <dd>{formatDate(campaign.createdAt)}</dd>
              </div>
              <div className="camp-detail__fact">
                <dt>Stop on reply</dt>
                <dd>{campaign.stopOnReply ? 'Yes' : 'No'}</dd>
              </div>
            </dl>
          </section>

          <section className="app-card">
            <div className="camp-detail__section-head">
              <h3>Sequence</h3>
              <Badge tone="outline">{campaign.steps.length} step{campaign.steps.length === 1 ? '' : 's'}</Badge>
            </div>

            {campaign.steps.length > 0 ? (
              <ol className="camp-detail__steps">
                {campaign.steps.map((step, index) => (
                  <li key={step.id || `${campaign.id}-step-${index}`} className="camp-detail__step">
                    <div className="camp-detail__step-chip">Step {index + 1}</div>
                    <div className="camp-detail__step-copy">
                      <strong>{step.subjectTemplate || 'Untitled step'}</strong>
                      <span>
                        {step.delayBusinessDays > 0
                          ? `Wait ${step.delayBusinessDays} business day${step.delayBusinessDays === 1 ? '' : 's'}`
                          : 'Send immediately'}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="camp-detail__empty">This campaign does not have any steps yet.</p>
            )}
          </section>
        </main>

        <aside className="camp-detail__aside">
          <section className="app-card">
            <div className="camp-detail__section-head">
              <h3>Lifecycle</h3>
            </div>
            <div className="camp-detail__action-list">
              {campaign.status === 'approved' ? (
                <Button variant="primary" leadingIcon={Send} loading={busyAction === 'launch'} onClick={() => handleAction('launch')}>
                  Launch campaign
                </Button>
              ) : null}

              {campaign.status === 'active' ? (
                <Button variant="ghost" leadingIcon={Pause} loading={busyAction === 'pause'} onClick={() => handleAction('pause')}>
                  Pause campaign
                </Button>
              ) : null}

              {campaign.status === 'paused' ? (
                <Button variant="primary" leadingIcon={Send} loading={busyAction === 'resume'} onClick={() => handleAction('resume')}>
                  Resume campaign
                </Button>
              ) : null}

              {campaign.status === 'completed' ? (
                <Button variant="ghost" leadingIcon={Copy} loading={busyAction === 'duplicate'} onClick={() => handleAction('duplicate')}>
                  Duplicate campaign
                </Button>
              ) : null}

              {campaign.status === 'archived' ? (
                <Button variant="ghost" leadingIcon={Copy} loading={busyAction === 'duplicate'} onClick={() => handleAction('duplicate')}>
                  Duplicate campaign
                </Button>
              ) : null}

              {canWrite && campaign.status !== 'archived' ? (
                <Button variant="ghost" leadingIcon={Info} loading={busyAction === 'archive'} onClick={() => handleAction('archive')}>
                  Archive campaign
                </Button>
              ) : null}

              {canWrite && campaign.status === 'draft' ? (
                <Button variant="ghost" leadingIcon={Copy} loading={busyAction === 'duplicate'} onClick={() => handleAction('duplicate')}>
                  Duplicate draft
                </Button>
              ) : null}

              {canWrite && (campaign.status === 'draft' || campaign.status === 'archived') ? (
                <Button variant="danger" leadingIcon={Lock} loading={busyAction === 'delete'} onClick={() => handleAction('delete')}>
                  Delete campaign
                </Button>
              ) : null}
            </div>
            {!canWrite ? <p className="camp__read-only">Read-only access</p> : null}
          </section>

          <section className="app-card">
            <div className="camp-detail__section-head">
              <h3>Live stats</h3>
              <Clock size={15} aria-hidden="true" />
            </div>
            <div className="camp-detail__mini-grid">
              <div>
                <span>Enrolled</span>
                <strong>{stats.enrolled.toLocaleString()}</strong>
              </div>
              <div>
                <span>Active</span>
                <strong>{stats.active.toLocaleString()}</strong>
              </div>
              <div>
                <span>Paused</span>
                <strong>{stats.stopped.toLocaleString()}</strong>
              </div>
              <div>
                <span>Sent</span>
                <strong>{stats.sent.toLocaleString()}</strong>
              </div>
              <div>
                <span>Replies</span>
                <strong>{stats.replies.toLocaleString()}</strong>
              </div>
            </div>
          </section>

          <section className="app-card">
            <div className="camp-detail__section-head">
              <h3>Audience</h3>
              <Users size={15} aria-hidden="true" />
            </div>
            <p className="camp-detail__muted">{audienceLabel(campaign)}</p>
            <p className="camp-detail__muted">{campaign.emailAccountIds.length} mailbox connection{campaign.emailAccountIds.length === 1 ? '' : 's'}</p>
          </section>
        </aside>
      </div>
    </div>
  )
}
