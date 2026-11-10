import {
  Ban,
  Bell,
  Building,
  Chart,
  CheckSquare,
  CreditCard,
  Database,
  Grid,
  Inbox,
  List,
  Lock,
  Mail,
  Send,
  Settings,
  Shield,
  TrendUp,
  UserCircle,
  UserPlus,
  Users,
} from '../../components/icons'

/**
 * Single source of truth for authenticated areas. Routes, sidebar links, and
 * breadcrumbs are all generated from this map so navigation cannot drift.
 *
 * `roles` limits an area to tenant roles. `platformAdmin` limits it to platform
 * staff. Both are enforced in the shell now and will be enforced by route guards
 * in T05.
 */
export const APP_AREAS = {
  dashboard: {
    path: '',
    label: 'Dashboard',
    title: 'Dashboard',
    icon: Grid,
    task: 'T38',
    description:
      'One honest view of the workspace: sends, replies, meetings, opt-outs, active campaigns, and mailbox health.',
    bullets: [
      'Sends today and this week, with the tenant timezone shown next to every range.',
      'Replies, positive replies, meetings, and opt-outs — labelled by what is actually observable.',
      'Active campaigns and inbox health, with a link to the exact record that needs attention.',
      'Pipeline value and open tasks, grouped by stage and owner.',
    ],
  },
  replies: {
    path: 'replies',
    label: 'Replies',
    title: 'Replies inbox',
    icon: Inbox,
    task: 'T32',
    description:
      'Every reply, classified and ready to act on. Positive conversations become pipeline instead of disappearing into a shared mailbox.',
    bullets: [
      'List and thread views with campaign, mailbox, category, assignee, and status filters.',
      'Conversation view with contact and company context, plus assign, note, task, and suppress actions.',
      'Classification badges, confidence, and a needs-review queue for uncertain replies.',
      'Unmatched and test replies separated from the main inbox.',
    ],
  },
  campaigns: {
    path: 'campaigns',
    label: 'Campaigns',
    title: 'Campaigns',
    icon: Send,
    task: 'T20',
    description:
      'Build multi-step sequences, approve the copy, and send from healthy mailboxes at a conservative pace.',
    bullets: [
      'Lifecycle states from draft through approval, sending, pause, completion, and archive.',
      'Audience and mailbox selection with included and excluded counts.',
      'Sequence editor with business-day delays and merge fields.',
      'Preflight checks that block launch with a specific, fixable reason.',
    ],
  },
  pipeline: {
    path: 'pipeline',
    label: 'Pipeline',
    title: 'Pipeline',
    icon: TrendUp,
    task: 'T36',
    description:
      'A simple, fixed-stage pipeline that turns interested employers into visible, forecastable opportunity.',
    bullets: [
      'Board and table views across New, Contacted, Replied, Meeting, Won, and Not interested.',
      'Value, owner, source campaign, and aging on every opportunity.',
      'Stage changes that are confirmed, audited, and recoverable after an error.',
      'Opportunity detail with a combined send, reply, task, and meeting timeline.',
    ],
  },
  tasks: {
    path: 'tasks',
    label: 'Tasks',
    title: 'Tasks',
    icon: CheckSquare,
    task: 'T35',
    description:
      'Follow-ups that do not depend on memory. Tasks can be linked to a contact or an opportunity.',
    bullets: [
      'List, create, assign, and complete tasks with due dates and priority.',
      'Overdue work separated clearly from today and later.',
      'Links back to the contact, conversation, and opportunity that created the task.',
    ],
  },
  reports: {
    path: 'reports',
    label: 'Reports',
    title: 'Reports',
    icon: Chart,
    task: 'T39',
    description:
      'Campaign, mailbox, and pipeline reporting with documented metric definitions and CSV export.',
    bullets: [
      'Per-step performance, audience size, exclusions, progress, and errors.',
      'Mailbox health: cap usage, warm-up, bounce rate, and authentication status.',
      'Pipeline by stage, owner, source campaign, and age.',
      'CSV export with the same spreadsheet-injection protection as contact export.',
    ],
  },
  companies: {
    path: 'companies',
    label: 'Companies',
    title: 'Companies',
    icon: Building,
    task: 'T11',
    description:
      'The employer accounts you are targeting, with the contacts, notes, and activity attached to each one.',
    bullets: [
      'Search and filter by industry, location, and status.',
      'Create, edit, and archive companies with custom fields.',
      'See related contacts, campaigns, replies, and open opportunities.',
      'Duplicate warnings before a second record is created.',
    ],
  },
  contacts: {
    path: 'contacts',
    label: 'Contacts',
    title: 'Contacts',
    icon: Users,
    task: 'T12',
    description:
      'The people behind each company, with consent and suppression history kept in one place.',
    bullets: [
      'Search by name, email, company, status, tag, or list.',
      'Contact detail with company context, last contacted, and last replied dates.',
      'Manual create and edit, plus bulk archive and duplicate merge.',
      'Suppression and email-health state visible before a campaign is built.',
    ],
  },
  lists: {
    path: 'lists',
    label: 'Lists & segments',
    title: 'Lists & segments',
    icon: List,
    task: 'T16',
    description:
      'Static lists for imports and one-off sends, plus saved segments with live preview counts.',
    bullets: [
      'Create static lists and add or remove contacts.',
      'Build AND/OR segment rules with all supported operators.',
      'Preview the audience count before saving.',
      'Select a saved list or segment directly in the campaign wizard.',
    ],
  },
  imports: {
    path: 'imports',
    label: 'Imports',
    title: 'Imports',
    icon: Database,
    task: 'T13',
    description:
      'CSV imports with column mapping, duplicate review, suppression checks, and a downloadable report.',
    bullets: [
      'Download a template and validate the file before upload.',
      'Map detected columns to contact and company fields.',
      'Review duplicates, suppressions, and row-level errors before committing.',
      'Background progress, an import report, and a 24-hour rollback window.',
    ],
  },
  suppressions: {
    path: 'suppressions',
    label: 'Suppressions',
    title: 'Suppressions',
    icon: Ban,
    task: 'T17',
    description:
      'The tenant-wide do-not-contact list. Suppressed contacts are excluded from every audience automatically.',
    bullets: [
      'View the reason and source for every suppression.',
      'Manually block an address when a prospect asks to be left alone.',
      'Removal follows owner override rules and is audited.',
      'Suppressed contacts are called out during import and campaign review.',
    ],
  },
  mailboxes: {
    path: 'mailboxes',
    label: 'Mailboxes',
    title: 'Mailboxes',
    icon: Mail,
    task: 'T18',
    description:
      'Connect the agency’s own Google or Microsoft mailboxes and keep their sending health visible.',
    bullets: [
      'OAuth connect flow with clear success, denial, and expired-state handling.',
      'Health badges for connected, needs reauthentication, degraded, error, and disconnected.',
      'From name, reply-to, signature, caps, and warm-up configuration.',
      'Test send before a mailbox is used by a campaign.',
    ],
  },
  notifications: {
    path: 'notifications',
    label: 'Notifications',
    title: 'Notifications',
    icon: Bell,
    task: 'T44',
    description:
      'In-app alerts for the events that need a human, with per-user preferences and a weekly digest option.',
    bullets: [
      'Positive replies, new replies, bounce spikes, and inbox authentication failures.',
      'Quota warnings, completed campaigns, finished imports, and billing issues.',
      'Per-user preferences layered on top of tenant defaults.',
      'No email notification includes the full content of a message.',
    ],
  },
  billing: {
    path: 'billing',
    label: 'Billing',
    title: 'Billing & plan',
    icon: CreditCard,
    task: 'T40',
    roles: ['owner'],
    description:
      'Plan, seats, usage, invoices, and the Stripe customer portal for the workspace.',
    bullets: [
      'Current plan and usage against every included limit.',
      'Upgrade, downgrade, and seat changes with the effective date explained.',
      'Stripe Checkout and Customer Portal, with return states handled.',
      'Past-due, grace-period, canceled, and downgrade-blocked states.',
    ],
  },
  settings: {
    path: 'settings',
    label: 'Workspace settings',
    title: 'Workspace settings',
    icon: Settings,
    task: 'T41',
    roles: ['owner', 'admin'],
    description:
      'Agency identity, mailing address, timezone, and the sending defaults every campaign inherits.',
    bullets: [
      'Agency name and the physical address required before launch.',
      'Tenant timezone and default sending window.',
      'Default daily cap, signature, and data-retention preference.',
      'Tenant-wide AI drafting toggle.',
    ],
  },
  team: {
    path: 'settings/team',
    label: 'Team',
    title: 'Team',
    icon: UserPlus,
    task: 'T42',
    roles: ['owner', 'admin'],
    description:
      'Invite teammates, assign roles, and keep at least one owner on the workspace.',
    bullets: [
      'Invite, resend, revoke, change role, and remove members.',
      'Role explanations for owner, admin, and member.',
      'Last-owner protection on removal and demotion.',
      'Every role change written to the tenant audit log.',
    ],
  },
  security: {
    path: 'settings/security',
    label: 'Security',
    title: 'Security',
    icon: Lock,
    task: 'T43',
    roles: ['owner', 'admin'],
    description:
      'Password, MFA, active sessions, and the tenant audit log for security-sensitive changes.',
    bullets: [
      'Password change and MFA enrollment.',
      'Active sessions with individual and global sign-out.',
      'Auditable support and admin access visible to the owner.',
      'Searchable, exportable tenant audit log.',
    ],
  },
  account: {
    path: 'settings/account',
    label: 'Account',
    title: 'Account',
    icon: UserCircle,
    task: 'T10',
    description:
      'Your profile, email address, password, and the devices currently signed into your account.',
    bullets: [
      'Display name and email address, including the verification step.',
      'Password change with confirmation.',
      'Active sessions and sign-out-all.',
      'Personal notification preferences.',
    ],
  },
  admin: {
    path: 'admin',
    label: 'Platform admin',
    title: 'Platform admin',
    icon: Shield,
    task: 'T46',
    platformAdmin: true,
    description:
      'The platform team’s tenant console. Visible only to accounts with the platform-admin flag.',
    bullets: [
      'Search tenants by name, slug, owner, plan, and status.',
      'Tenant profile, usage, mailboxes, campaigns, health, and MRR.',
      'Suspend, reactivate, extend a trial, change plan, or apply a credit.',
      'Time-boxed support access that requires a reason and is visible to the tenant.',
    ],
  },
}

export const NAV_GROUPS = [
  {
    label: 'Workspace',
    items: ['dashboard', 'replies', 'campaigns', 'pipeline', 'tasks', 'reports'],
  },
  {
    label: 'Audience',
    items: ['companies', 'contacts', 'lists', 'imports', 'suppressions'],
  },
  {
    label: 'Sending',
    items: ['mailboxes'],
  },
  {
    label: 'Account',
    items: ['notifications', 'billing', 'settings', 'team', 'security', 'account'],
  },
  {
    label: 'Platform',
    items: ['admin'],
  },
]

export function areaPath(area) {
  return area.path ? `/app/${area.path}` : '/app'
}

export function areaFromPath(pathname) {
  let match = null
  let matchLength = -1

  for (const area of Object.values(APP_AREAS)) {
    const path = areaPath(area)
    const isMatch =
      area.path === ''
        ? pathname === path
        : pathname === path || pathname.startsWith(`${path}/`)
    if (isMatch && path.length > matchLength) {
      match = area
      matchLength = path.length
    }
  }

  return match
}

export function canAccessArea(area, { role, isPlatformAdmin } = {}) {
  if (area.platformAdmin) return Boolean(isPlatformAdmin)
  if (!area.roles) return true
  return Boolean(role) && area.roles.includes(role)
}

/** True when the area has a role or platform-staff requirement. */
export function isRestrictedArea(area) {
  return Boolean(area?.platformAdmin || area?.roles?.length)
}

const ROLE_LABELS = {
  owner: 'owners',
  admin: 'admins',
  member: 'members',
}

/**
 * Human-readable description of who can open an area. Used by the access-denied
 * screen so the requirement is explicit instead of a generic "permission denied".
 */
export function areaRequirement(area) {
  if (area.platformAdmin) return 'Reyvo platform staff'
  if (!area.roles?.length) return null

  const labels = area.roles.map((role) => ROLE_LABELS[role] ?? `${role}s`)
  if (labels.length === 1) return `workspace ${labels[0]}`
  return `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`
}
