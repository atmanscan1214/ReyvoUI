import { useEffect, useMemo, useState } from 'react'
import { SelectField, TextField } from '../../../components/Field'
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorPanel,
  PageHeader,
  Skeleton,
  useToast,
} from '../../../components/ui'
import { api } from '../../../lib/api'
import { useSession } from '../../../lib/session'
import { usePageTitle } from '../../../lib/usePageTitle'
import './team.css'

const ROLES = ['owner', 'admin', 'member']
const TEAM_AUDIT_ACTIONS = [
  'membership.role_changed',
  'membership.removed',
  'membership.created',
  'membership.reactivated',
  'invitation.created',
  'invitation.resent',
  'invitation.revoked',
  'invitation.accepted',
]

function roleLabel(role) {
  return role ? `${role[0].toUpperCase()}${role.slice(1)}` : 'Unknown'
}

function formatDate(value) {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function auditDescription(entry, membersByMembership) {
  const before = entry?.before_data ?? {}
  const after = entry?.after_data ?? {}

  if (entry.action === 'membership.role_changed') {
    const name = membersByMembership.get(String(entry.entity_id))
    return `${name ? `${name}: ` : ''}role changed from ${roleLabel(before.role)} to ${roleLabel(after.role)}.`
  }
  if (entry.action === 'membership.removed') {
    return `${membersByMembership.get(String(entry.entity_id)) || 'A member'} was removed from the workspace.`
  }
  if (entry.action === 'membership.created') {
    return `${after.email || 'A new member'} joined as ${roleLabel(after.role)}.`
  }
  if (entry.action === 'membership.reactivated') {
    return `${after.email || 'A member'} regained workspace access as ${roleLabel(after.role)}.`
  }
  if (entry.action === 'invitation.created') {
    return `${after.email || 'A teammate'} was invited as ${roleLabel(after.role)}.`
  }
  if (entry.action === 'invitation.resent') {
    return `A fresh invitation link was created for ${after.email || 'a teammate'}.`
  }
  if (entry.action === 'invitation.revoked') {
    return `The invitation for ${after.email || 'a teammate'} was revoked.`
  }
  if (entry.action === 'invitation.accepted') {
    return `${after.email || 'A teammate'} accepted an invitation.`
  }
  return 'A team access change was recorded.'
}

function actionLabel(action) {
  return action?.type === 'remove-member' ? 'Remove member' : 'Revoke invitation'
}

export function TeamPage() {
  usePageTitle('Team')
  const { role: currentRole } = useSession()
  const { toast } = useToast()
  const [members, setMembers] = useState([])
  const [memberState, setMemberState] = useState('loading')
  const [memberError, setMemberError] = useState(null)
  const [invitations, setInvitations] = useState([])
  const [invitationState, setInvitationState] = useState('loading')
  const [invitationError, setInvitationError] = useState(null)
  const [auditEntries, setAuditEntries] = useState([])
  const [auditState, setAuditState] = useState('loading')
  const [auditError, setAuditError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [pendingRole, setPendingRole] = useState(null)
  const [roleError, setRoleError] = useState(null)
  const [savingMembershipId, setSavingMembershipId] = useState(null)
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'member' })
  const [inviteError, setInviteError] = useState(null)
  const [creatingInvite, setCreatingInvite] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [deliveryStatus, setDeliveryStatus] = useState('')
  const [copyState, setCopyState] = useState('')
  const [busyInvitationId, setBusyInvitationId] = useState(null)
  const [invitationActionError, setInvitationActionError] = useState(null)
  const [pendingAccessAction, setPendingAccessAction] = useState(null)
  const [accessActionError, setAccessActionError] = useState(null)
  const [savingAccessAction, setSavingAccessAction] = useState(false)

  const canChangeRoles = currentRole === 'owner'
  const canManageInvitations = currentRole === 'owner' || currentRole === 'admin'
  const activeOwnerCount = useMemo(
    () => members.filter((member) => member.role === 'owner' && member.status === 'active').length,
    [members],
  )
  const activeMemberCount = useMemo(
    () => members.filter((member) => member.status === 'active').length,
    [members],
  )
  const membersByUser = useMemo(
    () =>
      new Map(
        members.map((member) => [
          String(member.user_id),
          member.full_name?.trim() || member.email,
        ]),
      ),
    [members],
  )
  const membersByMembership = useMemo(
    () =>
      new Map(
        members.map((member) => [
          String(member.membership_id),
          member.full_name?.trim() || member.email,
        ]),
      ),
    [members],
  )
  const assignableRoles = currentRole === 'owner' ? ROLES : ['member']

  useEffect(() => {
    const controller = new AbortController()
    setMemberState('loading')
    setMemberError(null)
    setInvitationState('loading')
    setInvitationError(null)
    setAuditState('loading')
    setAuditError(null)

    api.get('/tenants/current/members', { signal: controller.signal })
      .then((data) => {
        if (!Array.isArray(data)) {
          throw new Error('The member endpoint returned an unexpected response.')
        }
        setMembers(data)
        setMemberState('ready')
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return
        setMemberError(error)
        setMemberState('error')
      })

    api.get('/tenants/current/invitations', { signal: controller.signal })
      .then((data) => {
        if (!Array.isArray(data)) {
          throw new Error('The invitations endpoint returned an unexpected response.')
        }
        setInvitations(data)
        setInvitationState('ready')
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return
        setInvitationError(error)
        setInvitationState('error')
      })

    Promise.all(
      TEAM_AUDIT_ACTIONS.map((action) =>
        api.get(
          `/tenants/current/audit-logs?action=${encodeURIComponent(action)}&limit=10`,
          { signal: controller.signal },
        ),
      ),
    )
      .then((pages) => {
        const entries = pages.flatMap((page) => {
          if (!Array.isArray(page?.items)) {
            throw new Error('The audit endpoint returned an unexpected response.')
          }
          return page.items
        })
        const uniqueEntries = [...new Map(entries.map((entry) => [entry.id, entry])).values()]
        uniqueEntries.sort(
          (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
        )
        setAuditEntries(uniqueEntries.slice(0, 10))
        setAuditState('ready')
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return
        setAuditError(error)
        setAuditState('error')
      })

    return () => controller.abort()
  }, [refreshKey])

  function requestRoleChange(member, nextRole) {
    if (
      !canChangeRoles ||
      member.status !== 'active' ||
      nextRole === member.role
    ) return
    setRoleError(null)
    setPendingRole({ member, nextRole })
  }

  async function confirmRoleChange() {
    if (!pendingRole) return
    if (demotingLastOwner) {
      setRoleError('A workspace must retain at least one active owner.')
      return
    }

    setSavingMembershipId(pendingRole.member.membership_id)
    setRoleError(null)
    try {
      const updated = await api.patch(
        `/tenants/current/members/${encodeURIComponent(pendingRole.member.membership_id)}`,
        { role: pendingRole.nextRole },
      )
      if (
        updated?.membership_id !== pendingRole.member.membership_id ||
        !ROLES.includes(updated?.role)
      ) {
        throw new Error('The API returned an unexpected member update.')
      }
      setMembers((current) =>
        current.map((member) =>
          member.membership_id === updated.membership_id ? updated : member,
        ),
      )
      setPendingRole(null)
      setRefreshKey((current) => current + 1)
      toast.success(`${updated.full_name || updated.email}'s role was updated.`)
    } catch (error) {
      setRoleError(error?.message || 'The member role could not be updated.')
    } finally {
      setSavingMembershipId(null)
    }
  }

  async function createInvitation(event) {
    event.preventDefault()
    setInviteError(null)
    setInvitationActionError(null)
    setCreatingInvite(true)
    try {
      const created = await api.post('/tenants/current/invitations', {
        email: inviteForm.email.trim(),
        role: inviteForm.role,
      })
      if (
        !created?.id ||
        !created?.invite_url ||
        !['sent', 'failed', 'not_configured'].includes(created?.delivery_status)
      ) {
        throw new Error('The API did not return the invitation link.')
      }
      setInvitations((current) => [created, ...current.filter((item) => item.id !== created.id)])
      setInviteLink(created.invite_url)
      setDeliveryStatus(created.delivery_status)
      setCopyState('')
      setInviteForm((current) => ({ ...current, email: '' }))
      setRefreshKey((current) => current + 1)
      if (created.delivery_status === 'sent') {
        toast.success('Invitation email sent.')
      } else if (created.delivery_status === 'failed') {
        toast.error('The invitation exists, but its email could not be sent. Share the link manually.')
      } else {
        toast.success('Invitation link created. Email delivery is not configured.')
      }
    } catch (error) {
      setInviteError(error?.message || 'The invitation could not be created.')
    } finally {
      setCreatingInvite(false)
    }
  }

  async function resendInvitation(invitation) {
    setBusyInvitationId(invitation.id)
    setInvitationActionError(null)
    try {
      const resent = await api.post(
        `/tenants/current/invitations/${encodeURIComponent(invitation.id)}/resend`,
        {},
      )
      if (
        !resent?.invite_url ||
        !['sent', 'failed', 'not_configured'].includes(resent?.delivery_status)
      ) {
        throw new Error('The API did not return a refreshed invitation link.')
      }
      setInvitations((current) =>
        current.map((item) => item.id === resent.id ? resent : item),
      )
      setInviteLink(resent.invite_url)
      setDeliveryStatus(resent.delivery_status)
      setCopyState('')
      setRefreshKey((current) => current + 1)
      if (resent.delivery_status === 'sent') {
        toast.success('A new invitation email was sent.')
      } else if (resent.delivery_status === 'failed') {
        toast.error('A new link was created, but its email could not be sent.')
      } else {
        toast.success('A new invitation link was created. Email delivery is not configured.')
      }
    } catch (error) {
      setInvitationActionError(error?.message || 'The invitation could not be resent.')
    } finally {
      setBusyInvitationId(null)
    }
  }

  async function copyInvitationLink() {
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopyState('Invitation link copied.')
    } catch {
      setCopyState('Copy was blocked by the browser. Select and copy the link above.')
    }
  }

  async function confirmAccessAction() {
    if (!pendingAccessAction) return
    setSavingAccessAction(true)
    setAccessActionError(null)
    try {
      if (pendingAccessAction.type === 'remove-member') {
        const removed = await api.delete(
          `/tenants/current/members/${encodeURIComponent(pendingAccessAction.item.membership_id)}`,
        )
        setMembers((current) =>
          current.map((member) =>
            member.membership_id === removed.membership_id ? removed : member,
          ),
        )
        toast.success(`${removed.full_name || removed.email} no longer has workspace access.`)
      } else {
        const revoked = await api.delete(
          `/tenants/current/invitations/${encodeURIComponent(pendingAccessAction.item.id)}`,
        )
        setInvitations((current) =>
          current.map((item) => item.id === revoked.id ? revoked : item),
        )
        setInviteLink('')
        setDeliveryStatus('')
        setCopyState('')
        toast.success('Invitation link revoked.')
      }
      setPendingAccessAction(null)
      setRefreshKey((current) => current + 1)
    } catch (error) {
      setAccessActionError(error?.message || 'The access change could not be completed.')
    } finally {
      setSavingAccessAction(false)
    }
  }

  const demotingLastOwner =
    pendingRole?.member.role === 'owner' &&
    pendingRole.nextRole !== 'owner' &&
    activeOwnerCount <= 1

  return (
    <div className="app-page team-page">
      <PageHeader
        eyebrow="Workspace"
        title="Team"
        description="Invite teammates, manage workspace access, and review audited role changes."
        meta={<Badge tone="outline">{activeMemberCount} active {activeMemberCount === 1 ? 'member' : 'members'}</Badge>}
      />

      <section className="app-card team-page__section" aria-labelledby="team-members-title">
        <div className="team-page__section-head">
          <div>
            <p className="eyebrow">People</p>
            <h2 id="team-members-title">Workspace members</h2>
            <p>Roles determine which workspace settings and actions each person can access.</p>
          </div>
        </div>

        {!canChangeRoles ? (
          <p className="team-page__notice" role="status">
            You can invite members, but only workspace owners can change roles or remove members.
          </p>
        ) : null}

        {memberState === 'loading' ? (
          <Skeleton lines={5} />
        ) : memberState === 'error' ? (
          <ErrorPanel
            title="Couldn't load workspace members"
            description={memberError?.message || 'The member list could not be loaded.'}
            requestId={memberError?.requestId}
            onRetry={() => setRefreshKey((current) => current + 1)}
          />
        ) : members.length === 0 ? (
          <EmptyState
            title="No workspace members found"
            description="When members are available, they will appear here."
          />
        ) : (
          <div className="team-page__member-list">
            {members.map((member) => {
              const isLastOwner =
                member.role === 'owner' &&
                member.status === 'active' &&
                activeOwnerCount <= 1
              const isActive = member.status === 'active'

              return (
                <article className="team-page__member" key={member.membership_id}>
                  <div className="team-page__member-main">
                    <div className="team-page__member-identity">
                      <strong>{member.full_name || 'Name unavailable'}</strong>
                      <span>{member.email}</span>
                    </div>
                    <div className="team-page__member-meta">
                      <Badge
                        tone={
                          isActive
                            ? 'success'
                            : member.status === 'removed'
                              ? 'danger'
                              : 'outline'
                        }
                      >
                        {roleLabel(member.status)}
                      </Badge>
                      <span>Joined {formatDate(member.created_at)}</span>
                    </div>
                  </div>
                  <div className="team-page__member-actions">
                    <div className="team-page__member-role">
                      <label htmlFor={`member-role-${member.membership_id}`}>Role</label>
                      <select
                        id={`member-role-${member.membership_id}`}
                        value={member.role}
                        disabled={!canChangeRoles || !isActive || savingMembershipId === member.membership_id || isLastOwner}
                        onChange={(event) => requestRoleChange(member, event.target.value)}
                        aria-describedby={`member-role-hint-${member.membership_id}`}
                      >
                        {ROLES.map((option) => (
                          <option key={option} value={option}>{roleLabel(option)}</option>
                        ))}
                      </select>
                      <span id={`member-role-hint-${member.membership_id}`} className="team-page__role-hint">
                        {isLastOwner
                          ? 'The last active owner cannot be demoted or removed.'
                          : !isActive
                            ? 'Only active members can have their role changed.'
                            : canChangeRoles
                              ? 'Role changes are recorded in the audit log.'
                              : 'Only owners can change member roles.'}
                      </span>
                    </div>
                    {canChangeRoles && isActive ? (
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={isLastOwner}
                        onClick={() => {
                          setAccessActionError(null)
                          setPendingAccessAction({ type: 'remove-member', item: member })
                        }}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="app-card team-page__section" aria-labelledby="team-invitations-title">
        <div className="team-page__section-head">
          <div>
            <p className="eyebrow">Invitations</p>
            <h2 id="team-invitations-title">Invite a teammate</h2>
            <p>Links are single-use and expire after seven days. Email delivery uses the workspace service SMTP configuration.</p>
          </div>
        </div>

        {canManageInvitations ? (
          <form className="team-page__invite-form" onSubmit={createInvitation}>
            <TextField
              id="team-invite-email"
              label="Work email"
              type="email"
              autoComplete="email"
              value={inviteForm.email}
              onChange={(event) =>
                setInviteForm((current) => ({ ...current, email: event.target.value }))
              }
              error={inviteError}
              maxLength={320}
              required
            />
            <SelectField
              id="team-invite-role"
              label="Role"
              value={inviteForm.role}
              onChange={(event) =>
                setInviteForm((current) => ({ ...current, role: event.target.value }))
              }
              disabled={assignableRoles.length === 1}
            >
              {assignableRoles.map((option) => (
                <option key={option} value={option}>{roleLabel(option)}</option>
              ))}
            </SelectField>
            <Button type="submit" loading={creatingInvite} disabled={!inviteForm.email.trim()}>
              Create invitation link
            </Button>
          </form>
        ) : (
          <p className="team-page__notice" role="status">
            Only workspace owners and admins can create or manage invitations.
          </p>
        )}

        <p className="team-page__notice">
          If email delivery is unavailable, copy and share the generated link. Resending rotates the
          token and immediately invalidates the previous link.
        </p>

        {inviteLink ? (
          <div className="team-page__invite-link">
            <TextField
              id="team-invite-link"
              label="Single-use invitation link"
              value={inviteLink}
              readOnly
              onFocus={(event) => event.target.select()}
            />
            <Button variant="ghost" onClick={copyInvitationLink}>Copy link</Button>
            <span className={`team-page__delivery team-page__delivery--${deliveryStatus}`} role="status">
              {deliveryStatus === 'sent'
                ? 'Invitation email sent.'
                : deliveryStatus === 'failed'
                  ? 'Email delivery failed. Share this link manually.'
                  : 'SMTP is not configured. Share this link manually.'}
            </span>
            {copyState ? <span role="status">{copyState}</span> : null}
          </div>
        ) : null}

        {invitationActionError ? (
          <p className="team-page__inline-error" role="alert">{invitationActionError}</p>
        ) : null}

        <div className="team-page__invitation-list">
          <h3>Invitation history</h3>
          {invitationState === 'loading' ? (
            <Skeleton lines={3} />
          ) : invitationState === 'error' ? (
            <ErrorPanel
              title="Couldn't load invitations"
              description={invitationError?.message || 'The invitation list could not be loaded.'}
              requestId={invitationError?.requestId}
              onRetry={() => setRefreshKey((current) => current + 1)}
            />
          ) : invitations.length === 0 ? (
            <EmptyState
              title="No invitations yet"
              description="Created invitations will appear here."
              compact
            />
          ) : (
            <ul className="team-page__invitation-list-items">
              {invitations.map((invitation) => {
                const canManageThisInvite =
                  canManageInvitations &&
                  (currentRole === 'owner' || invitation.role === 'member')
                const canResend = invitation.status === 'pending' || invitation.status === 'expired'
                const canRevoke = invitation.status === 'pending' || invitation.status === 'expired'

                return (
                  <li className="team-page__invitation" key={invitation.id}>
                    <div className="team-page__invitation-details">
                      <strong>{invitation.email}</strong>
                      <span>{roleLabel(invitation.role)} · Created {formatDate(invitation.created_at)}</span>
                    </div>
                    <Badge
                      tone={
                        invitation.status === 'pending'
                          ? 'warning'
                          : invitation.status === 'accepted'
                            ? 'success'
                            : invitation.status === 'revoked'
                              ? 'danger'
                              : 'outline'
                      }
                    >
                      {roleLabel(invitation.status)}
                    </Badge>
                    <div className="team-page__invitation-actions">
                      {canResend && canManageThisInvite ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={busyInvitationId === invitation.id}
                          onClick={() => resendInvitation(invitation)}
                        >
                          Resend
                        </Button>
                      ) : null}
                      {canRevoke && canManageThisInvite ? (
                        <Button
                          variant="quiet"
                          size="sm"
                          disabled={busyInvitationId === invitation.id}
                          onClick={() => {
                            setAccessActionError(null)
                            setPendingAccessAction({ type: 'revoke-invitation', item: invitation })
                          }}
                        >
                          Revoke
                        </Button>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="app-card team-page__section" aria-labelledby="team-audit-title">
        <div className="team-page__section-head">
          <div>
            <p className="eyebrow">Audit</p>
            <h2 id="team-audit-title">Recent team access changes</h2>
            <p>Role, invitation, acceptance, and removal actions are recorded by the API.</p>
          </div>
        </div>

        {auditState === 'loading' ? (
          <Skeleton lines={3} />
        ) : auditState === 'error' ? (
          <ErrorPanel
            title="Couldn't load team audit history"
            description={auditError?.message || 'The audit log could not be loaded.'}
            requestId={auditError?.requestId}
            onRetry={() => setRefreshKey((current) => current + 1)}
          />
        ) : auditEntries.length === 0 ? (
          <EmptyState
            title="No team access changes recorded"
            description="Role and invitation activity will appear here."
            compact
          />
        ) : (
          <ol className="team-page__audit-list">
            {auditEntries.map((entry) => (
              <li className="team-page__audit-entry" key={entry.id}>
                <div>
                  <strong>{auditDescription(entry, membersByMembership)}</strong>
                  <span>
                    {membersByUser.get(String(entry.actor_id)) || 'Workspace member'}
                    {' · '}
                    {formatDate(entry.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {pendingRole ? (
        <ConfirmDialog
          open
          title="Change this member's role?"
          description={`Change ${pendingRole.member.full_name || pendingRole.member.email} from ${roleLabel(pendingRole.member.role)} to ${roleLabel(pendingRole.nextRole)}?`}
          confirmLabel="Save role"
          loading={savingMembershipId === pendingRole.member.membership_id}
          onCancel={() => {
            if (savingMembershipId) return
            setPendingRole(null)
            setRoleError(null)
          }}
          onConfirm={confirmRoleChange}
        >
          <p className="team-page__dialog-note">
            This change is recorded in the workspace audit log.
          </p>
          {demotingLastOwner ? (
            <p className="team-page__dialog-error" role="alert">
              A workspace must retain at least one active owner.
            </p>
          ) : null}
          {roleError ? (
            <p className="team-page__dialog-error" role="alert">{roleError}</p>
          ) : null}
        </ConfirmDialog>
      ) : null}

      {pendingAccessAction ? (
        <ConfirmDialog
          open
          title={`${actionLabel(pendingAccessAction)}?`}
          description={
            pendingAccessAction.type === 'remove-member'
              ? `${pendingAccessAction.item.full_name || pendingAccessAction.item.email} will immediately lose access to this workspace. Their historical activity is retained.`
              : `The invitation for ${pendingAccessAction.item.email} will be invalidated.`
          }
          confirmLabel={actionLabel(pendingAccessAction)}
          loading={savingAccessAction}
          onCancel={() => {
            if (savingAccessAction) return
            setPendingAccessAction(null)
            setAccessActionError(null)
          }}
          onConfirm={confirmAccessAction}
        >
          {accessActionError ? (
            <p className="team-page__dialog-error" role="alert">{accessActionError}</p>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </div>
  )
}
