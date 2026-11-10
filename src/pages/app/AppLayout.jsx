import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { Logo } from '../../components/Logo'
import {
  ArrowRight,
  Bell,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Close,
  Grid,
  LogOut,
  Menu,
  Plus,
  Settings,
  Shield,
  UserCircle,
  Users,
} from '../../components/icons'
import { useSession } from '../../lib/session'
import {
  buildOnboardingSteps,
  summarizeOnboarding,
  useSetupData,
} from '../../lib/onboarding'
import {
  APP_AREAS,
  NAV_GROUPS,
  areaFromPath,
  areaPath,
  canAccessArea,
  isRestrictedArea,
} from './navigation'
import './app.css'

function initialsOf(user) {
  const source = user?.full_name?.trim() || user?.email || 'Reyvo'
  const parts = source.split(/\s+/).filter(Boolean)

  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function workspaceInitial(tenant) {
  const source = tenant?.name?.trim() || tenant?.slug || 'W'
  return source.slice(0, 1).toUpperCase()
}

function formatLabel(value) {
  if (!value) return ''
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function planSummary(details) {
  if (!details) return null

  const label = details.plan_code ? `${formatLabel(details.plan_code)} plan` : 'Plan'
  let note = details.status ? formatLabel(details.status) : ''

  if (details.status === 'trial' && details.trial_ends_at) {
    const ends = new Date(details.trial_ends_at)
    if (!Number.isNaN(ends.getTime())) {
      note = `Trial ends ${new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
      }).format(ends)}`
    }
  }

  return { label, note }
}

export function AppLayout() {
  const location = useLocation()
  const {
    session,
    user,
    tenant,
    tenantDetails,
    tenantStatus,
    role,
    isPlatformAdmin,
    profileStatus,
    retryProfile,
    retryTenant,
    workspaces,
    switchingTo,
    switchError,
    switchWorkspace,
    clearSwitchError,
    signOut,
  } = useSession()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [openMenu, setOpenMenu] = useState(null)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)

  const setup = useSetupData()
  const setupSteps = useMemo(
    () =>
      buildOnboardingSteps({
        user,
        tenant: tenantDetails,
        usage: setup.usage,
        emailAccounts: setup.emailAccounts,
        setupStatus: setup.status,
      }),
    [user, tenantDetails, setup.usage, setup.emailAccounts, setup.status],
  )
  const setupProgress = useMemo(() => summarizeOnboarding(setupSteps), [setupSteps])
  const setupMeta = setupProgress.readyToSend
    ? 'All five steps done'
    : setupProgress.allKnown
      ? `${setupProgress.completed} of ${setupProgress.total} done`
      : setup.status === 'error'
        ? 'Open checklist'
        : 'Checking progress…'

  const toggleRef = useRef(null)
  const closeRef = useRef(null)
  const bellRef = useRef(null)
  const userRef = useRef(null)
  const actionsRef = useRef(null)
  const workspaceRef = useRef(null)
  const workspaceToggleRef = useRef(null)

  const area = areaFromPath(location.pathname)
  const isComponentKit = import.meta.env.DEV && location.pathname === '/app/ui-kit'
  const crumbLabel = isComponentKit ? 'Component kit' : area?.label ?? 'Not found'
  const initials = initialsOf(user)
  const plan = planSummary(tenantDetails)

  useEffect(() => {
    setDrawerOpen(false)
    setOpenMenu(null)
    setWorkspaceOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!drawerOpen) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    function handleKeyDown(event) {
      if (event.key !== 'Escape') return
      setDrawerOpen(false)
      window.requestAnimationFrame(() => toggleRef.current?.focus())
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [drawerOpen])

  useEffect(() => {
    if (!openMenu) return undefined

    function handlePointerDown(event) {
      if (actionsRef.current && !actionsRef.current.contains(event.target)) {
        setOpenMenu(null)
      }
    }

    function handleKeyDown(event) {
      if (event.key !== 'Escape') return
      const trigger = openMenu === 'notifications' ? bellRef.current : userRef.current
      setOpenMenu(null)
      window.requestAnimationFrame(() => trigger?.focus())
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openMenu])

  useEffect(() => {
    if (!workspaceOpen) return undefined

    function handlePointerDown(event) {
      if (workspaceRef.current && !workspaceRef.current.contains(event.target)) {
        setWorkspaceOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key !== 'Escape') return
      setWorkspaceOpen(false)
      window.requestAnimationFrame(() => workspaceToggleRef.current?.focus())
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [workspaceOpen])

  function closeDrawer(restoreFocus = false) {
    setDrawerOpen(false)
    if (restoreFocus) {
      window.requestAnimationFrame(() => toggleRef.current?.focus())
    }
  }

  function handleSignOut() {
    setOpenMenu(null)
    setWorkspaceOpen(false)
    signOut()
  }

  async function handleWorkspaceSelect(tenantId) {
    const switched = await switchWorkspace(tenantId)
    if (switched) setWorkspaceOpen(false)
  }

  function toggleWorkspaceMenu() {
    setOpenMenu(null)
    if (!workspaceOpen) clearSwitchError()
    setWorkspaceOpen(!workspaceOpen)
  }

  function toggleMenu(name) {
    setOpenMenu((current) => (current === name ? null : name))
  }

  const access = { role, isPlatformAdmin }
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((key) => canAccessArea(APP_AREAS[key], access)),
  })).filter((group) => group.items.length > 0)

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return (
    <div className="app">
      <a className="skip-link" href="#app-main">
        Skip to content
      </a>

      <div
        className={`app-scrim${drawerOpen ? ' is-visible' : ''}`}
        aria-hidden="true"
        onMouseDown={() => closeDrawer(true)}
      />

      <aside
        id="app-sidebar"
        className={`app-sidebar${drawerOpen ? ' is-open' : ''}`}
        aria-label="Workspace navigation"
      >
        <div className="app-sidebar__brand">
          <Link to="/app" aria-label="Reyvo dashboard">
            <Logo size={26} />
          </Link>
          <button
            ref={closeRef}
            type="button"
            className="app-icon-btn app-sidebar__close"
            onClick={() => closeDrawer(true)}
          >
            <Close size={19} />
            <span className="visually-hidden">Close navigation</span>
          </button>
        </div>

        <div className="app-workspace-wrap" ref={workspaceRef}>
          <button
            ref={workspaceToggleRef}
            type="button"
            className={`app-workspace${workspaceOpen ? ' is-open' : ''}`}
            aria-expanded={workspaceOpen}
            aria-controls="app-workspace-menu"
            onClick={toggleWorkspaceMenu}
          >
            <span className="app-workspace__label">
              {workspaces.length > 1 ? `Workspace · ${workspaces.length}` : 'Workspace'}
            </span>
            <span className="app-workspace__row">
              <span className="app-workspace__name">{tenant?.name ?? 'Your workspace'}</span>
              <ChevronDown size={15} />
            </span>
            {tenant?.slug ? <span className="app-workspace__slug">{tenant.slug}</span> : null}
          </button>

          {workspaceOpen ? (
            <div className="app-workspace-menu" id="app-workspace-menu">
              <div className="app-workspace-menu__head">
                <p>Your workspaces</p>
                <span>{workspaces.length}</span>
              </div>

              <ul className="app-workspace-menu__list">
                {workspaces.map((workspace) => {
                  const current = workspace.tenant.id === tenant?.id
                  const busy = switchingTo === workspace.tenant.id

                  return (
                    <li key={workspace.tenant.id}>
                      <button
                        type="button"
                        className={`app-workspace-option${current ? ' is-current' : ''}`}
                        onClick={() => handleWorkspaceSelect(workspace.tenant.id)}
                        disabled={current || Boolean(switchingTo)}
                        aria-current={current ? 'true' : undefined}
                      >
                        <span className="app-workspace-option__initial" aria-hidden="true">
                          {workspaceInitial(workspace.tenant)}
                        </span>
                        <span className="app-workspace-option__copy">
                          <strong>{workspace.tenant.name}</strong>
                          <span>{workspace.tenant.slug}</span>
                        </span>
                        <span className="app-workspace-option__state" aria-hidden="true">
                          {busy ? (
                            <span className="app-access-state__spinner app-access-state__spinner--sm" />
                          ) : current ? (
                            <Check size={15} />
                          ) : (
                            <ArrowRight size={15} />
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>

              {switchError ? (
                <p className="app-workspace-menu__error" role="alert">
                  {switchError}
                </p>
              ) : null}

              <div className="app-workspace-menu__plan">
                <span className="app-workspace-menu__plan-label">Plan</span>
                {tenantStatus === 'loading' ? (
                  <span className="app-workspace-menu__muted">Loading…</span>
                ) : null}
                {tenantStatus === 'error' ? (
                  <button
                    type="button"
                    className="app-workspace-menu__retry"
                    onClick={retryTenant}
                  >
                    Plan unavailable · Retry
                  </button>
                ) : null}
                {tenantStatus === 'ready' && plan ? (
                  <span className="app-workspace-menu__plan-value">
                    <span className="pill pill--lime">{plan.label}</span>
                    <span className="app-workspace-menu__muted">{plan.note}</span>
                  </span>
                ) : null}
              </div>

              <div className="app-workspace-menu__links">
                {canAccessArea(APP_AREAS.settings, access) ? (
                  <Link to="/app/settings" onClick={() => setWorkspaceOpen(false)}>
                    <Settings size={14} aria-hidden="true" />
                    Workspace settings
                  </Link>
                ) : null}
                <Link
                  to="/login"
                  state={{ mode: 'add-workspace', email: user?.email }}
                  onClick={() => setWorkspaceOpen(false)}
                >
                  <Plus size={14} aria-hidden="true" />
                  Add another workspace
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        <nav className="app-nav" aria-label="Main">
          {groups.map((group) => (
            <div className="app-nav__group" key={group.label}>
              <p className="app-nav__label">{group.label}</p>
              <ul>
                {group.items.map((key) => {
                  const item = APP_AREAS[key]
                  const Icon = item.icon
                  const active = area === item

                  return (
                    <li key={key}>
                      <Link
                        to={areaPath(item)}
                        className={`app-nav__link${active ? ' is-active' : ''}`}
                        aria-current={active ? 'page' : undefined}
                      >
                        <Icon size={18} />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="app-sidebar__foot">
          <Link
            to="/welcome"
            className={`app-setup${setupProgress.readyToSend ? ' is-complete' : ''}`}
          >
            <span className="app-setup__icon" aria-hidden="true">
              {setupProgress.readyToSend ? <Check size={17} /> : <CheckSquare size={17} />}
            </span>
            <span className="app-setup__copy">
              <strong>{setupProgress.readyToSend ? 'Setup complete' : 'Finish setup'}</strong>
              <span>{setupMeta}</span>
            </span>
            <ChevronRight size={15} aria-hidden="true" />
          </Link>
          <p className="app-sidebar__version">Reyvo workspace · v0.1</p>
        </div>
      </aside>

      <div className="app-body">
        <header className="app-topbar">
          <div className="app-topbar__left">
            <button
              ref={toggleRef}
              type="button"
              className="app-icon-btn app-topbar__menu"
              aria-expanded={drawerOpen}
              aria-controls="app-sidebar"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu size={20} />
              <span className="visually-hidden">Open navigation</span>
            </button>

            <div className="app-crumb" aria-label="Breadcrumb">
              <span className="app-crumb__workspace">
                {tenant?.name ?? 'Workspace'}
              </span>
              <ChevronRight size={13} aria-hidden="true" />
              <span className="app-crumb__page" aria-current="page">
                {crumbLabel}
              </span>
            </div>
          </div>

          <div className="app-topbar__actions" ref={actionsRef}>
            <button
              ref={bellRef}
              type="button"
              className={`app-icon-btn${openMenu === 'notifications' ? ' is-open' : ''}`}
              aria-expanded={openMenu === 'notifications'}
              aria-controls="app-notifications"
              onClick={() => toggleMenu('notifications')}
            >
              <Bell size={19} />
              <span className="visually-hidden">Notifications</span>
            </button>

            <button
              ref={userRef}
              type="button"
              className={`app-user${openMenu === 'user' ? ' is-open' : ''}`}
              aria-expanded={openMenu === 'user'}
              aria-controls="app-user-menu"
              onClick={() => toggleMenu('user')}
            >
              <span className="app-avatar" aria-hidden="true">
                {initials}
              </span>
              <span className="visually-hidden">Account menu</span>
              <span className="app-user__copy">
                <span className="app-user__name">{user?.full_name ?? 'Your account'}</span>
                <span className="app-user__meta">{role ?? 'Member'}</span>
              </span>
              <ChevronDown size={15} aria-hidden="true" />
            </button>

            {openMenu === 'notifications' ? (
              <div className="app-menu app-menu--notifications" id="app-notifications">
                <div className="app-menu__head">
                  <p className="app-menu__title">Notifications</p>
                  <Link
                    to="/app/notifications"
                    className="app-menu__head-link"
                    onClick={() => setOpenMenu(null)}
                  >
                    Preferences
                  </Link>
                </div>
                <div className="app-menu__empty">
                  <span className="app-menu__empty-icon" aria-hidden="true">
                    <Bell size={18} />
                  </span>
                  <p>
                    <strong>You’re all caught up.</strong>
                  </p>
                  <p className="app-menu__muted">
                    Reply alerts, bounce spikes, and quota warnings will appear here once those
                    pipelines are live.
                  </p>
                </div>
                <Link
                  to="/app/notifications"
                  className="app-menu__footer"
                  onClick={() => setOpenMenu(null)}
                >
                  View notification settings
                  <ChevronRight size={14} aria-hidden="true" />
                </Link>
              </div>
            ) : null}

            {openMenu === 'user' ? (
              <div className="app-menu app-menu--user" id="app-user-menu">
                <div className="app-menu__identity">
                  <span className="app-avatar app-avatar--lg" aria-hidden="true">
                    {initials}
                  </span>
                  <div>
                    <p className="app-menu__title">{user?.full_name ?? 'Your account'}</p>
                    <p className="app-menu__muted">{user?.email ?? 'Signed in'}</p>
                    <p className="app-menu__role">
                      <Shield size={12} aria-hidden="true" />
                      {role ? `${role} · ${tenant?.name ?? 'workspace'}` : 'Workspace member'}
                    </p>
                  </div>
                </div>

                <nav className="app-menu__links" aria-label="Account">
                  <Link to="/app/settings/account" onClick={() => setOpenMenu(null)}>
                    <UserCircle size={16} aria-hidden="true" />
                    Account settings
                  </Link>
                  {canAccessArea(APP_AREAS.settings, access) ? (
                    <Link to="/app/settings" onClick={() => setOpenMenu(null)}>
                      <Settings size={16} aria-hidden="true" />
                      Workspace settings
                    </Link>
                  ) : null}
                  {canAccessArea(APP_AREAS.team, access) ? (
                    <Link to="/app/settings/team" onClick={() => setOpenMenu(null)}>
                      <Users size={16} aria-hidden="true" />
                      Team
                    </Link>
                  ) : null}
                  {import.meta.env.DEV ? (
                    <Link to="/app/ui-kit" onClick={() => setOpenMenu(null)}>
                      <Grid size={16} aria-hidden="true" />
                      Component kit
                    </Link>
                  ) : null}
                </nav>

                <div className="app-menu__separator" />

                <button type="button" className="app-menu__signout" onClick={handleSignOut}>
                  <LogOut size={16} aria-hidden="true" />
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </header>

        {profileStatus === 'error' && !isRestrictedArea(area) ? (
          <div className="app-banner" role="status">
            <span>
              We couldn’t refresh your profile just now. Your session is still active.
            </span>
            <button type="button" className="app-banner__action" onClick={retryProfile}>
              Retry
            </button>
          </div>
        ) : null}

        <main id="app-main" className="app-main" tabIndex={-1}>
          <Outlet key={tenant?.id ?? 'workspace'} />
        </main>
      </div>
    </div>
  )
}
