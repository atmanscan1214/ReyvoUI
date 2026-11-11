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

The API should answer on <http://localhost:8000>, and its CORS config already allows
`http://localhost:5173`.

### Production build

```bash
npm run build     # writes dist/
npm run preview   # serve the build locally
```

## Configuration

Copy `.env.example` to `.env` if you need to override the defaults.

| Variable                 | Default     | Purpose                                                              |
| ------------------------ | ----------- | -------------------------------------------------------------------- |
| `VITE_API_URL`           | `/api/v1`   | Base URL used by the API client. Use a full URL for a deployed API.  |
| `VITE_API_PROXY_TARGET`  | `http://localhost:8000` | Dev-only proxy target for `/api`.                       |

## Routes

| Path        | Page                | Notes                                                        |
| ----------- | ------------------- | ------------------------------------------------------------ |
| `/`         | Home                | Marketing page: hero, product mock, features, personas, process, security, pricing, FAQ, CTA |
| `/register` | Create workspace    | Validated registration form wired to `POST /auth/register`   |
| `/login`    | Sign in             | `POST /auth/login`, optional workspace slug; challenges MFA-enrolled accounts |
| `/forgot-password` | Forgot password | Neutral reset request; single-use 30-minute links (provisional; see below) |
| `/reset-password` | Reset password   | New-password form from `?token=` with success, expired, invalid, and already-used states |
| `/invite/:token` | Invitation accept | Join a workspace with a name, password, and terms (provisional; see below) |
| `/mfa/challenge` | Two-factor challenge | Finish an MFA-protected sign-in (provisional; see below) |
| `/welcome`  | Setup checklist     | Live onboarding checklist: five steps derived from the API, with readiness and progress |
| `/welcome/address` | Mailing address | Required physical address form wired to `PATCH /tenants/current` |
| `/verify-email` | Verify email    | Verification status, auto-verify from a token, and resend (provisional; see below) |
| `/app`      | Dashboard           | Authenticated shell; placeholder overview until T38           |
| `/app/settings/security` | Security | Two-factor enrollment, disable, and the password-reset entry point |
| `/app/settings/account` | Account | Profile, email change, password change, and active sessions |
| `/app/companies` | Companies | Live company list with search, industry filter, pagination, and create |
| `/app/companies/:companyId` | Company detail | Overview, notes, custom fields, attached people, edit, and delete |
| `/app/contacts` | Contacts | Live list with filters, export, bulk archive/update, duplicate merge, tags column, and create |
| `/app/contacts/:contactId` | Contact detail | Overview, notes, tags, custom fields, company context, email health, edit, and delete |
| `/app/imports` | Imports | CSV template, upload, mapping, duplicate modes, preview counts, progress, explained report, and 24-hour rollback |
| `/app/*`    | App areas           | Replies, campaigns, pipeline, lists, mailboxes, settings, admin, and the rest of `APP_AREAS` |
| `/app/ui-kit` | Component kit     | Dev-only gallery for the shared UI kit; not part of the production route table |
| `/terms`    | Terms of Service    | Static legal copy                                            |
| `/privacy`  | Privacy Policy      | Static legal copy                                            |
| `*`         | Not found           | Friendly 404 with links back                                  |

The `/app` shell owns the sidebar, top bar, notification and account menus, mobile drawer, skip
link, and profile loading/error states. Every backlog area has a routed placeholder, so navigation
never leads to a dead end. Role-restricted links (billing, team, security, platform admin) appear
only when `/auth/me` reports the matching role or platform-admin flag.

Restricted routes are also guarded. Opening one directly shows a shared access-denied screen with the
current workspace, role, and required role instead of rendering the page. The guard waits for the
profile request, shows a retry state if it fails, and never assumes denial while access is unknown.

## Folder layout

Each page owns a folder, including its stylesheet:

```text
src/
  components/        Shared UI: header, footer, logo, form fields, icons
    ui/              Product UI kit + ui.css (table, filters, dialogs, toasts, …)
  lib/               API client, session storage, validation, timezone data
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
      security/      SecurityPage.jsx + security.css
      companies/     CompaniesPage, CompanyDetailPage, CompanyFormModal + companies.css
      contacts/      ContactsPage, ContactDetailPage, ContactFormModal, CompanyPicker, BulkUpdateModal, MergeDuplicatesModal + contacts.css
      imports/       ImportsPage + imports.css (CSV upload, mapping, duplicate modes, report, rollback)
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
  openapi.json       Captured OpenAPI 3.1 schema (62 paths)
scripts/
  sync-openapi.mjs   Refreshes docs/openapi.json from a running API
```

## API integration

`src/lib/api.js` is the single place that talks to the backend. It:

- reads the base URL from `VITE_API_URL`;
- sends and parses JSON;
- unwraps the backend error envelope
  `{ error: { code, message, details: { errors }, request_id } }`;
- maps FastAPI validation errors (`details.errors[].loc`) onto form fields;
- turns network failures and 502/504 responses into a human message instead of "Failed to fetch";
- refreshes the access token before expiry and once on a `401`, shares one refresh across
  concurrent requests, and clears the session only when the refresh token itself is rejected;
- exposes `api.get`, `api.post`, `api.postForm`, `api.patch`, and `api.delete` so product screens never
  call `fetch` directly. `postForm` sends `FormData` without forcing a JSON content type, so the
  browser can set the multipart boundary for CSV upload.

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

**Backend gap:** this API build has no email-verification or resend endpoints. `api.verifyEmail()` and
`api.resendVerification()` point at provisional `/auth/verify-email` and `/auth/resend-verification`
paths. In development, a `404`/`405` falls back to a single-use, 24-hour challenge in
`reyvo.onboarding.v1` and the email screen shows the link in a clearly labelled “Development only”
panel. Production builds never fake verification: they surface an “unavailable on this API build”
error instead. See [`docs/API_CONTRACT.md`](./docs/API_CONTRACT.md#email-verification-not-implemented).

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

The API build has none of these endpoints. Development builds call the provisional paths first,
then fall back to single-use, correctly time-boxed records in `reyvo.passwordResets.v1`,
`reyvo.mfa.v1`, and `reyvo.invites.v1`; each screen labels its “Development only” tools (valid,
expired, invalid, and already-used links) so every state can be exercised without a mail server or
an authenticator app. Production builds never fake these flows: they surface an
“unavailable on this API build” error instead. See
[`docs/API_CONTRACT.md`](./docs/API_CONTRACT.md#password-reset-mfa-and-invitations-not-implemented).

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

The API build exposes only `GET /auth/me`, so profile, email, password, and session actions use
provisional paths plus development-only records in `reyvo.account.v1` and `reyvo.sessions.v1`.
Development verifies the current password against the live login route and keeps changes in this
browser; production reports the action as unavailable instead of faking an API write. The email note
explains that the server still holds the original address until the endpoint ships. See
[`docs/API_CONTRACT.md`](./docs/API_CONTRACT.md#account-settings-not-implemented).

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
  edit, or delete affordances. The API build has no RBAC on `/companies`, so this is a UI policy plus
  graceful 403 handling for when it is enforced server-side.

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
  edit, or delete affordances. The API has no RBAC on `/contacts`, so this is a UI policy plus graceful
  403 handling for reads and writes.
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
