# Reyvo UI

React frontend for **Reyvo**, an outbound growth platform for staffing agencies. This repo covers
the marketing site, the account flows that lead into the product, and the authenticated app shell.

The backend lives in the separate `ReyvoAPI` repository and is expected at `http://localhost:8000`.

## Stack

| Concern    | Choice                                                   |
| ---------- | -------------------------------------------------------- |
| Framework  | React 19 (JavaScript, no TypeScript)                     |
| Build tool | Vite 8                                                   |
| Routing    | React Router 7 (`BrowserRouter`)                         |
| Styling    | Hand-written CSS with design tokens, one stylesheet per page, plus a shared product UI kit |
| Fonts      | Instrument Serif (display) + Inter (body), loaded from Google Fonts |

No third-party UI kit or CSS framework is used. Global tokens and base styles live in
`src/index.css`; the product primitives live in `src/components/ui/`; each page owns its layout and
responsive rules in its own folder.

## Getting started

```bash
npm install
npm run dev
```

The dev server runs at <http://localhost:5173>. Vite proxies any request starting with `/api` to
the backend, so the browser never makes a cross-origin call in development.

To run against a different backend:

```bash
# Windows PowerShell
$env:VITE_API_PROXY_TARGET = "http://localhost:9000"; npm run dev

# macOS / Linux
VITE_API_PROXY_TARGET=http://localhost:9000 npm run dev
```

### Start the API

From the `ReyvoAPI` repository:

```bash
uv run uvicorn reyvo.main:app --reload --loop reyvo.dev:selector_loop_factory
```

The API should answer on <http://127.0.0.1:8000>, and its CORS config already allows
`http://localhost:5173`.

### Production build

```bash
npm run build     # writes dist/
npm run preview   # serve the build locally
```

### Tests

```bash
npm test          # Vitest unit tests (src/**/*.{test,spec}.{js,jsx,ts,tsx})
npm run test:e2e  # Playwright: public smoke checks + signed-in flows
```

- `npm test` runs unit tests only; Playwright specs in `e2e/` are excluded in `vitest.config.ts`.
- `npm run test:e2e` starts Vite itself (`webServer` in `playwright.config.ts`) and reuses an
  already-running server outside CI. Set `PLAYWRIGHT_BASE_URL` to point at another origin.
- The signed-in E2E flows need the API on `http://127.0.0.1:8000` and skip themselves with a clear
  message when `/health` is unreachable. Defaults target the seeded demo workspace; override with
  `E2E_EMAIL`, `E2E_PASSWORD`, and `E2E_API_URL`.

## Configuration

Copy `.env.example` to `.env` if you need to override the defaults.

| Variable                 | Default     | Purpose                                                              |
| ------------------------ | ----------- | -------------------------------------------------------------------- |
| `VITE_API_URL`           | `/api/v1`   | Base URL used by the API client. Use a full URL for a deployed API.  |
| `VITE_API_PROXY_TARGET`  | `http://127.0.0.1:8000` | Dev-only proxy target for `/api`.                  |

## Routes

| Path        | Page                | Notes                                                        |
| ----------- | ------------------- | ------------------------------------------------------------ |
| `/`         | Home                | Marketing page: hero, product mock, features, personas, process, security, pricing, FAQ, CTA |
| `/register` | Create workspace    | Validated registration form wired to `POST /auth/register`   |
| `/login`    | Sign in             | `POST /auth/login`, optional workspace slug; challenges MFA-enrolled accounts |
| `/forgot-password` | Forgot password | Neutral reset request; server-backed single-use 30-minute links |
| `/reset-password` | Reset password   | New-password form from `?token=` with success, expired, invalid, and already-used states |
| `/invite/:token` | Invitation accept | Join a workspace with a name, password, and terms |
| `/mfa/challenge` | Two-factor challenge | Finish an MFA-protected sign-in |
| `/welcome`  | Setup checklist     | Live onboarding checklist: five steps derived from the API, with readiness and progress |
| `/welcome/address` | Mailing address | Required physical address form wired to `PATCH /tenants/current` |
| `/verify-email` | Verify email    | Server-backed verification status, token confirmation, and resend |
| `/app`      | Dashboard           | Live `GET /dashboard/summary` metrics, pipeline-by-stage, server-computed top campaigns, live inbox health + suppression count; windows are server-side (no range/timezone param), delivered is not observable |
| `/app/settings/security` | Security | Two-factor enrollment/disable, password reset, active sessions, tenant audit search/export, and the workspace-visible platform support-access card |
| `/app/settings/account` | Account | Profile, email change, password change, and active sessions |
| `/app/settings/data` | Data & privacy | Owner-only ZIP export of six CSV sections and 30-day workspace deletion with typed-name confirmation |
| `/app/companies` | Companies | Live company list with search, industry filter, pagination, and create |
| `/app/companies/:companyId` | Company detail | Overview, notes, custom fields, attached people, edit, and delete |
| `/app/contacts` | Contacts | Live list with filters, export, bulk archive/update, duplicate merge, tags column, and create |
| `/app/contacts/:contactId` | Contact detail | Overview, notes, tags, custom fields, company context, email health, edit, and delete |
| `/app/imports` | Imports | CSV template, upload, mapping, duplicate modes, preview counts, progress, explained report, and 24-hour rollback |
| `/app/lists` | Lists & segments | Live static lists, browser-side AND/OR segments with a live count preview, dev-only tags, and a campaign-audience handoff |
| `/app/suppressions` | Suppressions | Live suppression list with reason filter, manual blocking, override rules, and import exclusion |
| `/app/mailboxes` | Mailboxes | Live mailbox list with health badges, reconnect prompts, and the OAuth connect flow |
| `/app/mailboxes/health` | Sending health | Live account states/caps/warm-up with per-state guidance and provider errors; no per-inbox telemetry exists in this API build (named on the page) |
| `/app/mailboxes/:mailboxId` | Mailbox detail | Sending identity, configuration modal with cap validation, warm-up panel, test send, and disconnect |
| `/app/campaigns` | Campaigns | Live campaign list with lifecycle badges, search/status filters, create, submit, duplicate, archive, delete, approve, and reject |
| `/app/campaigns/new` | Campaign wizard | Full 5-step creation wizard: audience, mailboxes, sequence, schedule, review/preflight |
| `/app/campaigns/:campaignId` | Campaign detail | Live detail with launch/pause/resume, archive/duplicate/delete, approval gating, and stats |
| `/app/replies` | Replies inbox | Live `GET /replies` list with server-side category/review/campaign filters, unmatched separation, pagination, a sanitized reader, one-click review approval, and an inline correction form (`PATCH`) with a corrections counter |
| `/app/replies/:replyId` | Reply detail | Live reply with working actions — reclassify/flag/assign (`PATCH`), contact note (via contact update), follow-up task (`POST /tasks`), suppress (`POST /suppressions`); no thread bodies exist in this build, and stop-sequence/open-in-provider are blocked |
| `/app/tasks` | Task queue | Live `GET /tasks` list with server-side status filter, real status badges plus derived Overdue/Due-today, working create (`POST`) and status changes (`PATCH`), live contact/opportunity links; no delete exists in the API |
| `/app/pipeline` | Pipeline | Live stage board and table over `GET /opportunities` + `/opportunities/pipeline`; stage moves PATCH, confirm, audit, undo |
| `/app/pipeline/:opportunityId` | Opportunity detail | Live `GET /opportunities/{id}` facts + confirm-guarded stage moves and notes PATCH; activity timeline from audit entries, replies, and tasks (sends/meetings not recorded in this API build) |
| `/app/reports` | Reports | Live report tables (campaign stats, replies, mailbox health, pipeline) plus a real client-side CSV export with injection protection |
| `/app/billing` | Billing | Live usage vs plan limits with 80%/100% banners, real checkout/portal/plan-change posts, and paginated invoices; without Stripe, checkout/plan-change answer 503 and portal 400 (surfaced as-is), and billing history is an empty-state note |
| `/app/admin` | Sending controls | Owner/admin: workspace pause, campaign and mailbox pause/resume on audited API endpoints; kill switch is platform-staff only (403 panel for tenant roles) |
| `/app/platform` | Platform tenants | Platform staff only: searchable tenant list with plan, MRR, usage, abuse risk, and support-access state |
| `/app/platform/:tenantId` | Tenant profile | Platform staff only: profile, usage, deliverability, support grants, and suspend/reactivate, trial, plan, credit, MFA, force-logout, and delete actions |
| `/app/platform/ops` | Platform operations | Platform staff only: overview, health, audit search, support access, and abuse tabs |
| `/app/*`    | App areas           | Team, settings, notifications, and the rest of `APP_AREAS` |
| `/app/ui-kit` | Component kit     | Dev-only gallery for the shared UI kit; not part of the production route table |
| `/terms`    | Terms of Service    | Static legal copy                                            |
| `/privacy`  | Privacy Policy      | Static legal copy                                            |
| `/app/status` | Service status    | Live `GET /health` + `GET /health/ready` probes (proxied); shows operational, degraded, or unavailable |
| `/u/:token` | Unsubscribe         | Public, signed-out opt-out: token check, agency and masked address, single idempotent confirm; invalid/expired tokens get a clear message |
| `*`         | Not found           | Friendly 404 with links back                                  |

The `/app` shell owns the sidebar, top bar, notification and account menus, mobile drawer, skip
link, and profile loading/error states. Every backlog area has a routed placeholder, so navigation
never leads to a dead end. Role-restricted links (billing, team, security, sending controls) appear
only when `/auth/me` reports the matching role.

Restricted routes are also guarded. Opening one directly shows a shared access-denied screen with the
current workspace, role, and required role instead of rendering the page. The guard waits for the
profile request, shows a retry state if it fails, and never assumes denial while access is unknown.

### Browser-local and provider-dependent screens

Most screens now read and write the live API. These remaining boundaries are deliberate and named in
the UI rather than simulated:

- **Segments and contact tags** are stored per browser (`reyvo.segments.v1`,
  `reyvo.contactTags.v1`) because this API build has no `/segments` or tag routes. The lists page
  labels the storage, and campaign audiences resolve segments client-side.
- **Import rollback** is browser-local (`reyvo.importRollbacks.v1`) for the same reason: the API has
  no rollback endpoint, so the 24-hour window is device-scoped.
- **AI approval mode and quota** are browser-local (`localStorage`), while the generate call itself
  hits the live `POST /ai/draft`.
- **Billing** reads live usage, plans, subscription, and paginated invoices and posts real
  checkout/portal/plan-change requests. Without a configured Stripe key or plan price, checkout and
  plan-change answer 503 and the portal answers 400 — each surfaced as-is from the API, never
  simulated. Only the provider round-trips (real Checkout, Customer Portal session, invoice list
  from Stripe) await credentials — flagged in `TASKS.md`.
- **SMTP mailbox registration** (`POST /email-accounts/smtp`) is not surfaced yet; the UI covers the
  OAuth providers and the live test-send endpoint.
- **Platform staff** see the tenant and operations consoles at `/app/platform` and
  `/app/platform/ops`. Tenant members never see the nav group, and the routes are guarded by the
  `is_platform_admin` flag. The global kill switch remains on `/app/admin` and answers 403 for
  tenant roles.

## Folder layout

Each page owns a folder, including its stylesheet:

```text
src/
  components/        Shared UI: header, footer, logo, form fields, icons
    ui/              Product UI kit + ui.css (table, filters, dialogs, toasts, …)
  lib/               API client, session storage, validation, timezone data, wizard estimates, sending controls, tasks/opportunities adapters
  pages/
    home/            HomePage.jsx + home.css
    register/        RegisterPage.jsx
    login/           LoginPage.jsx + login.css
    forgot-password/ ForgotPasswordPage.jsx
    reset-password/  ResetPasswordPage.jsx
    invite/          InvitePage.jsx
    mfa/             MfaChallengePage.jsx
    welcome/         WelcomeLayout, checklist, address form, verify-email + welcome.css
    app/             AppLayout, AreaGuard, placeholder screens, navigation model, app.css
      settings/      WorkspaceSettingsPage, DataPrivacyPage (ZIP export + 30-day delete) + settings.css
      security/      SecurityPage.jsx + security.css
      companies/     CompaniesPage, CompanyDetailPage, CompanyFormModal + companies.css
      contacts/      ContactsPage, ContactDetailPage, ContactFormModal, CompanyPicker, BulkUpdateModal, MergeDuplicatesModal + contacts.css
      imports/       ImportsPage + imports.css (CSV upload, mapping, duplicate modes, report, rollback)
      lists/         ListsPage, SegmentBuilder, ListDetailView, TagManager, ListFormModal, ContactSelectionModal + lists.css
      suppressions/  SuppressionsPage + suppressions.css (block modal, override rules, reason filter)
      mailboxes/     MailboxesPage, MailboxDetailPage, MailboxHealthPage + mailboxes.css (health cards, connect modal, config form, test send, sending-health summary)
      campaigns/     CampaignsPage + campaigns.css (lifecycle table, per-state actions, approve/reject), CampaignWizardPage + wizard.css (full 5-step wizard), CampaignDetailPage (launch/pause/resume, stats)
      dashboard/     DashboardPage + dashboard.css (live summary, pipeline by stage, inbox health; server-side windows)
      replies/       RepliesPage, ReplyDetailPage + replies.css (live list, server filters, unmatched split, sanitized snippets, working actions)
      tasks/         TasksPage + tasks.css (live task queue: server status filter, create, status PATCH, overdue/completed split)
      pipeline/      PipelinePage, OpportunityDetailPage + pipeline.css (live board/table and detail; confirm + audited + undoable stage moves, timeline from audit/replies/tasks)
      reports/       ReportsPage + reports.css (live reports, real CSV export)
      billing/       BillingPage + billing.css (live usage vs plan limits; checkout/portal blocked without Stripe)
      admin/         AdminPage + admin.css (live lists + audited pause/kill-switch controls)
      platform/      PlatformTenantsPage, PlatformTenantDetailPage, PlatformOpsPage + platform.css (T46/T47 staff consoles)
      ui-kit/        Dev-only component gallery + ui-kit.css
    legal/           LegalPage.jsx + legal.css (terms + privacy)
    not-found/       NotFoundPage.jsx + not-found.css
  styles/
    auth.css         Shared split layout for register and login
  App.jsx            Route table
  index.css          Design tokens, resets, buttons, utilities
  main.jsx           Entry point
docs/
  API_CONTRACT.md    Auth, errors, pagination, endpoint map
  openapi.json       Captured OpenAPI 3.1 schema (109 paths)
scripts/
  sync-openapi.mjs   Refreshes docs/openapi.json from a running API
```

## API integration

`src/lib/api.js` is the single place that talks to the backend. It:

- reads the base URL from `VITE_API_URL`; sends and parses JSON;
- unwraps the backend error envelope `{ error: { code, message, details: { errors }, request_id } }`;
- maps FastAPI validation errors (`details.errors[].loc`) onto form fields;
- turns network failures and 502/504 responses into a human message instead of "Failed to fetch";
- refreshes the access token before expiry and once on a `401`, shares one refresh across concurrent requests,
  and clears the session only when the refresh token itself is rejected;
- exposes `api.get`, `api.post`, `api.postForm`, `api.patch`, and `api.delete` so product screens never
  call `fetch` directly. `postForm` sends `FormData` without forcing a JSON content type, so the
  browser can set the multipart boundary for CSV upload;
- provides pagination helpers: `api.list(path, options)` and `api.search(path, filter, options)`;
- provides query caching via `cacheQuery(key, fn)`, with `api.invalidateCache(key)` and `api.clearCache()`;
- generates idempotency keys via `generateIdempotencyKey()` for safe retries;
- exports `ApiError`, `ErrorCodes`, `PaginationOptions`, `RetryConfig`, `isRetryableStatus`, `isRetryableError`,
  `PaginatedResponse`, and `onSessionExpired()` for use in product code.

`onSessionExpired()` lets the app shell send the user to `/login` with a clear "session expired"
notice when a refresh is rejected.

### Session and workspaces

`src/lib/session.jsx` provides one `SessionProvider` for the signed-in app. It owns the session,
profile (`/auth/me`), tenant details (`/tenants/current`), plan, role, platform-admin flag, retry
actions, workspace switching, and sign-out. Guards and pages read that snapshot through
`useSession()` instead of fetching independently.

The API issues tenant-scoped token pairs and has no endpoint that lists a user's tenants or switches
between them. Until one exists, the sidebar switcher remembers the tenant-scoped sessions this device
has signed into under `reyvo.workspaces.v1`:

- selecting a saved workspace activates its stored pair without a reload;
- an expired pair is refreshed through `POST /auth/refresh` and rejected if the returned tenant does
  not match the workspace that was selected;
- the shell, navigation permissions, and plan summary update from the new tenant immediately;
- **Add another workspace** reopens `/login` with the slug field and the signed-in email prefilled;
- sign-out clears both `reyvo.session.v1` and `reyvo.workspaces.v1`, so every remembered token is
  removed from the device.

The full contract — auth, error envelope, pagination, filter parameters, enums, and the endpoint map
— lives in [`docs/API_CONTRACT.md`](./docs/API_CONTRACT.md). The captured OpenAPI schema is
`docs/openapi.json`; refresh it with:

```bash
npm run sync:openapi
```

### Onboarding and verification

The onboarding group (`/welcome`, `/welcome/address`, `/verify-email`) shares one `SessionProvider`
and `WelcomeLayout`. Step state comes from live data, not a local flag:

| Step | Source |
|---|---|
| Verify email | `user.email_verified_at` from `GET /auth/me` |
| Mailing address | `tenant.physical_address` from `GET /tenants/current` |
| Connect a mailbox | `GET /email-accounts` |
| Import contacts | `contacts > 0` from `GET /tenants/current/usage` |
| Launch a campaign | `campaigns > 0` from the same usage response |

The checklist links each row to its real screen, shows required/checking/done states, and drives a
readiness banner: “Two required steps to go” → “One required step to go” → “Ready to import” → “Ready
to send”. The app sidebar’s setup widget reads the same model through `useSetupData()`, so it updates
without a reload. Saving the address calls `PATCH /tenants/current` and applies the response through
`updateTenant()`.

**Verification is server-backed:** registration issues a 24-hour verification email. `/verify-email?token=`
confirms the address, `POST /auth/resend-verification` re-sends with a cooldown, and a confirmed
address does not lock sign-in — `UserStatus.ACTIVE` and `VERIFIED` both allow it, while only
`DISABLED` blocks. The screen still degrades gracefully against an older API that answers `404`/`405`
for these paths, but no local verification record is created on the current backend. See
[`docs/API_CONTRACT.md`](./docs/API_CONTRACT.md).

### Password reset, invitations, and two-factor authentication

Three account flows share the `AuthFlowShell` layout used by sign-in: a brand panel, a status panel,
and clearly labelled development tools.

- **Password reset** — `/forgot-password` always answers with the same neutral “if that email is
  registered” response, whether or not the account exists. `/reset-password?token=` checks the link
  first and renders one of: the new-password form (with strength meter and confirmation), an
  **expired** state, an **invalid** state, or an **already used** state after a successful reset.
  A completed reset clears every stored session, matching the “sign out every device” promise.
- **Invitations** — `/invite/:token` shows the invited email, workspace, role, and inviter before
  asking for a name, password, and terms acceptance. It renders checking, success,
  **expired**, **invalid**, and **already accepted** states; `/invite` without a token explains the
  flow and points to sign-in.
- **Two-factor authentication** — `/app/settings/security` (owner/admin) enrolls TOTP: it shows the
  secret, a current-code helper, and a confirm step, and allows disabling with a valid code. Sign-in
  redirects enrolled accounts to `/mfa/challenge`, which accepts one code with clock-drift
  tolerance, locks after five wrong codes, and renders **expired**, **invalid**, **already used**,
  locked, and signed-out states.

All three flows are server-backed on the current API: password reset uses
`POST /auth/password/forgot` and `POST /auth/password/reset`, MFA uses the `/auth/mfa/*` routes, and
invitations use the workspace invitation endpoints. Reset and email-change tokens are single-use and
time-boxed; completing a reset or email change revokes the other sessions, and MFA setup is required
before a platform administrator can use the staff console. Development fallbacks in
`reyvo.passwordResets.v1`, `reyvo.mfa.v1`, and `reyvo.invites.v1` are retained only for an older API
that answers `404`/`405`, and each screen labels those tools as development-only. See
[`docs/API_CONTRACT.md`](./docs/API_CONTRACT.md).

### Account settings

`/app/settings/account` holds four tabs, each backed by the live profile where possible:

- **Profile** — display-name edit, member-since date, role, and the sign-in address. Saving applies
  the new name to the session immediately.
- **Email** — changing the sign-in address requires the current password and renders a 24-hour
  verification-pending state with cancel and confirm actions. Confirming revokes the other sessions.
- **Password** — current password, new password with the shared strength meter, confirmation, and a
  success banner. A successful change revokes every other session.
- **Sessions** — active browsers and devices with location, IP, last activity, and a “this device”
  marker. Individual sign-out, “sign out other sessions”, and “sign out everywhere” all require
  confirmation; the global action returns to `/login`.

The account actions are server-backed: `PATCH /auth/me` and `PUT /auth/profile` update the display
name, `POST /auth/email-change` starts a 24-hour pending change (confirmed signed-out through
`POST /auth/email-change/confirm`, cancelled with `DELETE /auth/email-change`), and the password and
session routes live with the security endpoints. `UserRead` exposes the pending address and its
expiry, so the UI can restore the pending state after reload. Development fallbacks in
`reyvo.account.v1` and `reyvo.sessions.v1` remain only for an older API that answers `404`/`405`;
production never fakes an API write. See [`docs/API_CONTRACT.md`](./docs/API_CONTRACT.md).

### Companies

`/app/companies` is the first screen on the real leads API, with no fallbacks:

- **List** — debounced search on name and domain (300 ms), an exact industry filter sampled from
  `GET /companies?limit=100`, and pagination. Search, industry, and page live in the URL, so a
  filtered view is shareable and survives reload.
- **Detail** — overview facts, notes, custom fields, and a People card fed by
  `GET /contacts?company_id=`. Missing, restricted, and failed loads each get their own state.
- **Create and edit** — one modal covers both, including repeatable custom-field rows. Server field
  errors map back onto the form, and a 403 stays on the form with a role-specific banner instead of
  losing the typed values.
- **Duplicate warning** — the API does not enforce company uniqueness, so the form probes
  `/companies?search=` first and warns when a record shares the normalized domain, or the normalized
  name when neither side has a domain and the locations do not conflict. “Save anyway” is an
  explicit second step.
- **Delete** — confirmation explains that contacts stay in the workspace and are detached, matching
  `DELETE /companies/{id}`.
- **Permissions** — owner and admin get write controls; members get a read-only notice and no create,
  edit, or delete affordances. The API enforces the same rule on `/companies` writes, and the UI
  still handles a `403` gracefully on reads and writes.

`src/lib/companies.js` owns normalization, validation, payload mapping, and duplicate detection.

### Contacts

`/app/contacts` is built on the live `/contacts` CRUD API:

- **List** — debounced search on name and email (300 ms), a status filter, a company filter sampled
  from `GET /companies?limit=100`, and pagination. Search, status, company, and page live in the URL.
  The company column links back to the company record, and `/app/contacts?company_id=…` is the link
  used by a company's People card.
- **Detail** — overview facts including last contacted and last replied, notes, tags, custom fields,
  and a company card with industry, location, employees, and website. The email-health card explains
  what the status means. Missing, restricted, and failed loads each get their own state.
- **Create and edit** — one modal covers both, with a searchable company picker backed by
  `/companies?search=`, repeatable custom-field rows, server field errors mapped onto the form, and a
  403 banner that keeps typed values. A duplicate email returns `409`; the form marks the email field
  and explains that the existing record should be opened instead.
- **Status** — `ContactCreate` deliberately ignores `status` and starts every contact at `new` (or
  `unsubscribed` when the address is suppressed), so the create form explains that status follows
  sends and replies. Status is editable only on the edit form, through `PATCH`.
- **Email health** — accepted only on create, because `ContactUpdate` has no `email_status` field. The
  edit form shows the current value read-only, and the detail card says so.
- **Tags** — the design lists tags on a contact, but this API build has no tags endpoint. Development
  builds store them per browser under `reyvo.contactTags.v1` and label the feature as browser-only;
  production reports tags as unavailable rather than pretending they reached the server.
- **Permissions** — owner and admin get write controls; members get a read-only notice and no create,
  edit, or delete affordances. The API enforces read-only membership on `/contacts` writes, import,
  and export, and the UI handles `403`s gracefully on reads and writes.
- **Export** — **Export view** downloads the current filtered list (search, status, and company), not
  just the visible page. The browser pages through `GET /contacts`, adds `status` and `created_at`,
  writes a UTF-8 BOM, and prefixes any cell that begins with `=`, `+`, `-`, or `@` with a single quote
  so spreadsheets never evaluate a contact as a formula. `GET /contacts/export` ignores filters and
  does not sanitize, so the file is built client-side. This API build has no export-audit endpoint, so
  downloads are not written to the audit log.
- **Bulk archive and update** — owner/admin can select rows on the current page and either archive
  them or set status, company, and source in one pass. Each selected record is sent as its own
  `PATCH /contacts/{id}`, so one failure does not block the rest; the result reports how many
  succeeded, and the selection stays so a failed batch can be retried. Every change is audited as
  `contact.updated`.
- **Merge duplicates** — the merge dialog scans up to 1,000 contacts and groups them by normalized
  name plus company, because emails are unique in the API. Pick the record to keep, confirm, and the
  survivor is `PATCH`ed while each duplicate is `DELETE`d; blank fields (including company and
  LinkedIn URL) are filled from the duplicates and browser-side tags are combined. Deletion is
  permanent in this build — there is no merge endpoint, 30-day undo, or related-record transfer — and
  the survivor update plus each deletion appear in the audit log as `contact.updated` and
  `contact.deleted`.

`src/lib/contacts.js` owns normalization, validation, payload mapping, the dev-only tag store, and
date formatting. `src/lib/contactBulk.js` owns filtered export, injection-safe CSV cells, sequential
bulk patching, duplicate grouping, merge planning, and merge execution. `CompanyPicker` and the
company filters share `/companies` sampling.

### Lists & segments

`/app/lists` has three tabs — static lists, segments, and tags — plus a campaign-audience handoff:

- **Static lists** are live `/lists` API records: create with a name and optional description, a
  detail view with paged members, an add-contacts picker (the API skips contacts already in the list),
  per-row remove, and delete with a confirm dialog. The API has no rename/update route, so name and
  description are fixed after creation and the header says so. Server audit entries cover
  `list.created`, `list.contacts_added`, and `list.deleted`; member removal is not audited in this
  build.
- **Segments** have no `/segments` endpoint in this build (the table exists but no router exposes it),
  so they are stored per browser in `reyvo.segments.v1`. The builder combines rule groups with AND and
  offers a "match any group" OR toggle. Fields cover status, company, title, source, created dates,
  tag presence, and list membership (`in_list`, hydrated from list members). The estimated count is
  computed client-side over a 5,000-contact scan (2,000 members per list lookup), labelled
  "estimated", and saved segments are capped at 50. Saved rows support edit, duplicate, delete, and
  "Use" for the campaign handoff.
- **Tags** stay dev-only in `reyvo.contactTags.v1`, consistent with the contact tags: aggregate cards,
  bulk apply to selected contacts (8 tags per contact, 24 characters), rename, delete, and search. A
  storage note marks the tab as development-only.
- **Campaign handoff** — "Use in campaign" on a list or segment writes the pending audience to
  `reyvo.campaignAudience.v1` via `src/lib/audience.js` and shows a persistent "Next campaign
  audience" card. The T21 campaign wizard will read this contract; server-side segment selection is
  not viable in this build because campaign resolution only understands `status` and `company_id`.
- **Permissions** — owner/admin write lists, segments, and tags; members get read-only notices and no
  write affordances, but "Use in campaign" stays available to any role that can view the tab.

`src/lib/lists.js` owns the live list API, `src/lib/segments.js` owns segment definitions, storage,
evaluation, and the contact snapshot, `src/lib/tags.js` owns tag aggregation and bulk apply, and
`src/lib/audience.js` owns the campaign-audience contract.

### Suppressions

`/app/suppressions` is built on the live `/suppressions` API:

- **List** — paged read (25 per page) with a reason filter and page synced to the URL. Rows show the
  address, a tone-coded reason badge, prettified source, optional note, and the blocked date. A
  policy card explains that a send is blocked when the address is on the tenant list or the
  platform-wide list.
- **Block an address** — owner/admin modal with email validation, an optional note, and the 409
  duplicate mapped to an inline banner. The reason is always `manual`: unsubscribes, bounces, and
  complaints arrive automatically from sends, replies, and imports, so hand-entering them would
  create false compliance records. A manual block marks a matching contact `unsubscribed` (the
  server does this).
- **Override rules** — `complaint` and `legal` rows are locked (no Remove control); `unsubscribe`,
  `hard_bounce`, and `manual` rows can be removed by an owner or admin with a confirm dialog, and
  every removal is audited server-side. The read model cannot distinguish tenant rows from platform
  rows, so the rules are applied by reason.
- **Import exclusion** — the import review step (T14) reads the suppression list and visibly marks
  suppressed rows as "Suppressed · never uploaded", both in the counts and per row. The campaign
  wizard (T21) counts suppressed contacts in its audience exclusions; the server already blocks
  sends to suppressed addresses.
- **Permissions** — owner/admin write; members view everything with a Read-only badge, a notice
  banner, and no write controls. The API has no RBAC on this route, so this is UI policy.

`src/lib/suppressions.js` owns the suppression API adapter, reason metadata, and override flags.

### Mailboxes

`/app/mailboxes` is built on the live `/email-accounts` API:

- **Health list** — every account renders as a card with the provider chip, a tone-coded status
  badge (`connected` success, `degraded` warning, `needs reauth`/`error` danger, `disconnected`
  neutral), the address, last health check as relative time (or "No health check recorded yet"),
  the `last_error` banner when present, and the daily/hourly caps with warm-up stage. The page
  header shows connected and needs-attention counts.
- **Reconnect prompts** — `needs_reauth`, `error`, and `disconnected` cards show a reconnect
  button that opens the connect modal preset to that provider (an explicit Continue click starts
  the flow, nothing auto-starts). Connected and degraded cards offer no action in T18.
- **OAuth connect** — the modal lists Google and Microsoft providers with their scopes. Continue
  calls `POST /oauth/{provider}/start`, opens the consent screen in a popup, and polls the
  accounts list every 2.5 s (max 3 min) because the callback is a backend URL the UI cannot
  intercept; a new account id means success. A popup closed without a new account shows an
  info toast, and a 503 start response (provider OAuth app not configured on this API build)
  maps to a friendly not-configured error. No mailbox passwords are ever collected.
- **Permissions** — owner/admin write; members view the list with a Read-only badge, a notice
  banner, and no connect/reconnect controls. The API has no RBAC on this route, so this is UI
  policy.
- **T19 boundary** — inbox detail (`/app/mailboxes/:mailboxId`) adds the sending-identity facts
  (the from address is always the connected mailbox address per §5.3.5), a configuration modal
  (from name, reply-to, HTML signature, daily cap 1–2,000, hourly cap 1–500 with an hourly ≤
  daily cross-check and server field errors mapped inline), a warm-up/health panel (stage and
  last check are worker-managed, read-only), a test-send dialog that posts a real recipient and
  shows the API's success or failure feedback, and disconnect behind a confirm dialog. Timezone
  is a workspace-level setting in this API build, so the page shows it as context rather than a
  per-inbox field, and `signature_html` is accepted by PATCH but not returned on read — the page
  keeps the saved value for display.

`src/lib/emailAccounts.js` owns the email-accounts API adapter, provider metadata, status tone
mapping, and the update/disconnect/test helpers. The API also accepts `smtp` as a provider and
exposes `POST /email-accounts/smtp` registration plus `POST /{id}/test` with
`{to_email, subject, message}`; the UI covers the OAuth providers and the test endpoint, while
SMTP registration (a Phase 2 option per §5.3.1) is not surfaced yet.

### Campaigns

`/app/campaigns` is built on the live paged `/campaigns` API (`Page` envelope):

- **Lifecycle table** — every row carries the status badge (`draft` neutral, `pending_approval`
  warning, `approved` info, `active` success, `paused` warning, `completed` success, `archived`
  neutral), the step count and timezone, audience summary, daily cap, and last update. Search and
  the lifecycle filter sync to the URL (`?search=…&status=…`) with a debounced input and a
  FilterBar reset.
- **Clear next step per state** — each row shows exactly what can move it forward: draft rows
  offer Submit for approval and Delete (behind a confirm dialog), pending/approved/active/paused
  rows show a muted hint pointing at the approval workflow (T25) and the campaign detail (T26),
  completed rows offer Archive and Duplicate, and archived rows offer Duplicate. Approve and
  reject live on this page for `pending_approval` rows — reject asks for a reason and returns
  the campaign to draft. Launching, pausing, and resuming stay on the detail page per §5.4.1.
- **Create** — "New campaign" opens the wizard at `/app/campaigns/new` (T21), which owns the
  audience, mailboxes, and draft creation; see the next section. The seed modal from T20 is gone.
- **Duplicate** — the API has no duplicate endpoint, so the page composes one from
  `GET /campaigns/{id}` + `POST /campaigns`, copying the name with " (copy)", steps, audience
  ids, mailboxes, timezone, sending window, caps, and stop-on-reply. The copy lands as a draft.
- **Archive and delete** — archive posts the transition behind a confirm dialog; delete (draft
  rows only, per §5.4.1) removes the campaign, steps, and enrollments and also asks for
  confirmation. Server refusals surface as error toasts.
- **Permissions** — owner/admin write; members see a Read-only badge, a notice, and per-state
  hints with no action buttons. The API has no RBAC on this route, so this is UI policy.

`src/lib/campaigns.js` owns the campaign API adapter: the lifecycle status metadata (labels,
tones, next-action verbs), normalization, list/create/get/duplicate/submit/approve/reject/
launch/pause/resume/archive/delete, preflight, preview, per-step stats, AI-draft helpers, and
the create payload shape.

### Campaign detail

`/app/campaigns/:campaignId` (`CampaignDetailPage.jsx`) is the lifecycle action surface from
§5.4.7: launch, pause, and resume post the live transitions (launch is blocked while the draft
has preflight errors or when AI copy is set to edit-then-approve), archive, duplicate, and
delete sit behind confirm dialogs, and the stats panel reads `GET /campaigns/{id}/stats` with a
per-step overview. The API's bulk send loop is still a skeleton, so enrollment progress may not
advance in this build.

### Campaign wizard

`/app/campaigns/new` (`CampaignWizardPage.jsx` + `src/lib/wizard.js`) is the full creation wizard
from §5.4.2: five steps — Audience, Mailboxes, Sequence, Schedule, Review.

- **Audience** — one static list or one saved segment per campaign. Lists come from the API with
  their contact counts; segments come from the browser store (`reyvo.segments.v1`, written by the
  lists page) and evaluate client-side over the contact snapshot. The pending pick handed over
  from Lists & segments (`reyvo.campaignAudience.v1`) appears as a banner and pre-selects itself.
  There is no audience/exclusion endpoint in this build, so the wizard composes the numbers in the
  browser: exclusions combine the suppression list, cross-campaign enrollments (walks every
  campaign's `/enrollments`, capped 2,000), and contact fields, counted per contact by priority
  (suppressed → no email → already enrolled → recently contacted, 30-day window) so the breakdown
  sums to the total. Estimate = included − excluded; counts are labelled as estimates when capped.
- **Mailboxes** — connected inboxes are selectable, degraded ones selectable with a warning, and
  other health states are blocked with their reason; at least one inbox is required before the
  draft can be created. The send plan shows daily capacity (Σ selected inbox caps), first-day
  sends, and ≈ days for the first pass, and it recomputes live as inboxes are toggled or the
  audience changes.
- **Sequence** — 1–8 steps with business-day delays. Subjects and bodies are HTML with a
  merge-field picker (`{{first_name}}`, `{{company_name}}`, …); unknown merge fields are listed
  as blocking issues before the draft can be created, and a plain-text fallback preview renders
  under the editor. An AI helper panel drafts subject/body through the live `POST /ai/draft`.
- **Schedule** — sending days, a local start/end window, a timezone strategy, and optional
  holiday skip. The next-send preview computes real IANA-zone times with DST math
  (`toTimeZoneParts`/`zonedTimeToUtc` in the page), and the whole schedule posts as
  `sending_window`.
- **Review** — creates the draft (`POST /campaigns` with the audience, mailboxes, steps, and
  schedule), then reads `GET /campaigns/{id}/preflight`, renders blocking reasons, previews a
  sample contact per step through `POST /preview`, and offers a test send through the mailbox
  test endpoint. The launch button stays blocked until preflight clears.
- **Permissions** — owner/admin build; members get the "Ask an owner or admin" notice and no
  wizard, matching the campaigns list policy. AI approval mode and quota usage are browser-local
  (`localStorage`), not tenant settings.

### Imports

`/app/imports` is a four-step CSV import built on the live synchronous `POST /contacts/import`:

- **Upload** — download a client-generated template with the canonical headers, or drop a CSV up to
  10 MB. Files with the wrong type, an unusable encoding, no header row, no contact rows, or more
  than 5,000 rows are rejected with a clear message before anything is sent. Recent imports with an
  open rollback window stay on this step.
- **Map columns** — the browser parses comma, semicolon, and tab delimited files (quoted fields and
  CRLF included), detects the headers, and auto-maps common spellings such as `Work Email`,
  `First Name`, and `Lead Source`. Only email is required; a column can be used by one field at a
  time, and the review button stays disabled until an email column is mapped.
- **Review** — validation runs locally, then the browser reads up to 1,000 contacts and 1,000
  suppressions to explain what already exists. Six counts cover rows in file, new contacts,
  existing, suppressed, in-file duplicate rows, and rows to fix; a filterable preview explains each
  row. Choose **Skip duplicates**, **Update existing**, or **Build a review queue**. Suppressed
  addresses are always skipped. Update mode applies names, title, phone, LinkedIn, and source to
  matching contacts; review mode holds existing, suppressed, and role-based rows without importing.
- **Import and report** — the canonical CSV is posted as `multipart/form-data` (field name `file`)
  with a staged progress panel. Update mode then PATCHes each existing contact and reports per-row
  failures. The report shows imported, updated, skipped, suppressed, review, and error totals, tabs
  with row-level detail and whether the browser or API caught each row, a downloadable CSV report,
  and a 24-hour rollback card.

Rollback records live in this browser (`reyvo.importRollbacks.v1`, 10 most recent, kept 7 days).
Rolling back deletes only contacts created by that import, keeps contacts that have since been
contacted or replied, and never reverts updates or removes companies. The window closes after 24
hours and is not shared across browsers.

The API matches only canonical headers and has no upload-preview, mapping, progress, update-mode, or
rollback endpoints, so `src/lib/imports.js` owns parsing, header aliases, validation, canonical CSV
serialization, the template, the multipart adapter, the capped workspace index, mode planning,
update calls, report assembly, and rollback execution. Tenant-wide duplicate and suppression checks
still run server-side; rows beyond the 1,000-record index cap are reported as server summary counts.

### Shared UI kit

`src/components/ui/` holds the product primitives that leads, campaigns, inbox, reporting, and admin
screens build from. Import them through the barrel so every screen shares the same markup, states, and
status vocabulary:

```jsx
import {
  PageHeader,
  FilterBar,
  FilterSelect,
  DataTable,
  Pagination,
  Modal,
  useToast,
} from '../../components/ui'
```

- **Layout and lists:** `PageHeader`, `FilterBar` / `FilterSelect`, `DataTable`, `Pagination`,
  `EmptyState`, `Skeleton`, `ErrorPanel`.
- **Overlays and flows:** `Modal`, `Drawer`, `ConfirmDialog`, `Tabs`, `Stepper`, `UploadDropzone`.
- **Feedback:** `ToastProvider` / `useToast`, `Badge` / `StatusBadge`, `Button`.
- `DataTable` owns loading, empty, and error presentation; callers own rows, sorting, selection, and
  pagination state so URL/search state stays in sync.
- Dialogs share one focus trap (`useDialogFocus`): scroll lock, Tab containment, Escape to close, and
  focus restoration. Confirmations start on Cancel.
- `statusTone()` maps backend status strings to one colour vocabulary, so `active`, `past_due`, and
  `unsubscribed` read the same in a filter, table, and detail drawer.

`ToastProvider` is mounted once in `App.jsx`. The live gallery at **`/app/ui-kit`** (account menu →
**Component kit**) exercises every primitive with real state; the route is only registered in dev
builds. Its layout styles are in `src/pages/app/ui-kit/ui-kit.css`; the components themselves are
styled by `src/components/ui/ui.css`.

### Workspace data and deletion

`/app/settings/data` is owner-only. It packages the workspace archive in the browser from
`GET /tenants/current/export`, which returns six CSVs (contacts, companies, campaigns, imports,
suppressions, audit logs) as a JSON map; `src/lib/zip.js` writes them into one ZIP with no server-side
ZIP dependency. The page lists the included files and reports API failures inline. Workspace deletion
calls `DELETE /tenants/current` only after the owner types the workspace name, offers the export
first, explains the 30-day purge window, and signs the owner out. The API blocks sign-in once the
tenant is marked deleted.

### Platform admin

Platform staff are identified by `User.is_platform_admin`. The flag gates a dedicated **PLATFORM** nav
group and three routes; tenant members never see the links, and direct visits are blocked by
`AreaGuard` (`platformAdmin: true`).

- **`/app/platform`** — paged tenant list with search over name, slug, owner email, and plan; a
  status filter; and summary cards for tenants, MRR, contacts/companies, and abuse risk. Rows show
  owner, plan and list-price MRR, usage, abuse risk, and active support access.
- **`/app/platform/:tenantId`** — profile (owner, slug, plan, subscription, trial end, period end,
  credit balance, timezone), usage, deliverability and abuse signals, and support grants. Actions:
  suspend with a required reason and reactivate, extend trial 30 days, change plan
  (`trial`/`starter`/`growth`/`scale`, with MRR from `PLAN_MRR_CENTS` in `admin.py`), apply a credit
  with a reason, reset MFA for owners/admins, force logout, and delete with the workspace name typed
  to confirm. Every action refreshes the profile and writes an audit event.
- **`/app/platform/ops`** — five tabs: **Overview** (platform counts and a risk/size-sorted tenant
  table), **Health** (`/health` + `/health/ready`, inbox states, high-risk tenants, kill-switch
  state), **Audit log** (free-text search plus actor, tenant, and exact-action filters with
  pagination and clear-filters), **Support access** (active or all grants with revoke), and **Abuse**
  (high/medium/low counts against documented thresholds).

Support access is a first-class server model: every grant requires a reason, expires automatically,
is revocable, and is visible to the tenant on `/app/settings/security` through
`GET /tenants/current/support-access`. Platform admins bypass the tenant-usable check when signing
in, refreshing, or verifying MFA so they can enter and reactivate their own suspended workspace;
tenant members remain blocked. The global sending kill switch stays on `/app/admin` and is
platform-staff only.

### Authentication decision

The live API uses `HTTPBearer` JWTs, confirmed from `GET /openapi.json`. This overrides the
HttpOnly-session-cookie approach suggested in §9.2 of the design document.

- Access tokens live 30 minutes; refresh tokens are exchanged at `POST /auth/refresh`.
- The pair is stored in `localStorage` under `reyvo.session.v1` by `src/lib/auth.js`.
- Trade-off: `localStorage` is readable by any script that achieves XSS, so it must be paired with a
  strict Content-Security-Policy, output escaping, and no `dangerouslySetInnerHTML` on untrusted
  content. Cookies would need their own CSRF protection, so this is not strictly less safe — just a
  different boundary.
- Revisit before production: move the refresh token to an `HttpOnly`, `SameSite=Strict` cookie (or
  add a small backend-for-frontend that sets it), keeping short-lived access tokens in memory.

Endpoints used directly by the current pages:

| Method | Path              | Purpose                            |
| ------ | ----------------- | ---------------------------------- |
| `POST` | `/auth/register`  | Create a tenant and owner account  |
| `POST` | `/auth/login`     | Sign in, optionally with `tenant_slug` |
| `POST` | `/auth/refresh`   | Exchange a refresh token for a new pair |
| `GET`  | `/auth/me`        | Refresh the profile on `/welcome` and `/app` |

Registration sends exactly the fields the API expects:

```json
{
  "email": "dana@youragency.com",
  "password": "at-least-12-characters",
  "full_name": "Dana Kim",
  "agency_name": "Northline Talent",
  "timezone": "America/New_York"
}
```

`physical_address` is optional on the API and is intentionally omitted; the backend defaults it.
A successful response is the `TokenPair` shape (`access_token`, `refresh_token`, `expires_in`,
`tenant`), which is stored in `localStorage` under `reyvo.session.v1` by `src/lib/auth.js`.

## Validation and UX details

- Required fields are validated client-side before the request; the first invalid field is focused
  and scrolled into view.
- Passwords require 12+ characters, matching the backend rule. The strength meter is a guide, not a
  security guarantee.
- Timezone is auto-detected with `Intl` and grouped by region in the select.
- Server-side field errors replace the matching client error. A `409` is shown on the email field as
  "An account with this email already exists."
- The submit button shows a spinner and is disabled while a request is in flight.
- Auth pages collapse to a single column below 1024 px; the brand panel hides and a compact header
  takes its place.
- Short desktop viewports (`max-height: 860px`) drop the trial card on the brand panel so the form
  stays visible without scrolling.

## Notes

- The remaining in-product build is tracked task-by-task in [`TASKS.md`](./TASKS.md).
- The repo currently contains only the frontend. Registration and sign-in need the API running to
  complete; without it the form shows a clear "could not reach the Reyvo API" message with the
  backend start command.
- `/welcome` is resilient: profile, tenant, and usage failures do not block the checklist. Steps show
  “Checking…” until their request lands, a compact error panel offers a retry, and the tenant stored
  in the session stays visible.
- `/app` is the authenticated shell. Its area screens are placeholders linked to their backlog task;
  the shell, navigation, responsive drawer, and session handling are real.
- Signing in navigates to `/app`. `/welcome` remains available as the setup checklist.
