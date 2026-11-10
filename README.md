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
| `/app/*`    | App areas           | Replies, campaigns, pipeline, contacts, mailboxes, settings, admin, and the rest of `APP_AREAS` |
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
- exposes `api.get`, `api.post`, `api.patch`, and `api.delete` so product screens never call
  `fetch` directly.

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
