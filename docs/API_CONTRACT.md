# Reyvo API contract

Baseline for the frontend. Captured from the running backend on **10 November 2026**.

| | |
|---|---|
| Source | `GET http://localhost:8000/openapi.json` |
| Snapshot | [`docs/openapi.json`](./openapi.json) |
| OpenAPI | 3.1.0 |
| API title / version | Reyvo API `0.1.0` |
| Paths / schemas | 62 / 97 |
| Base URL | `http://localhost:8000` |
| Prefix | `/api/v1` (except `/health`, `/health/ready`) |

Refresh the snapshot whenever the backend changes:

```powershell
npm run sync:openapi
# or against another origin
$env:REYVO_API_ORIGIN = 'http://localhost:8001'; npm run sync:openapi
```

The snapshot is the source of truth for request and response shapes. This document explains the
conventions the frontend must follow; it does not repeat every generated schema.

---

## 1. Authentication

- Transport is **Bearer JWT**, confirmed from `components.securitySchemes.HTTPBearer`.
  This overrides the HttpOnly-session-cookie idea in the design document (§9.2).
- The frontend stores the token pair in `localStorage` under `reyvo.session.v1`
  (`src/lib/auth.js`). See [`README.md`](../README.md#authentication-decision) for the trade-offs.
- Send `Authorization: Bearer <access_token>` on every endpoint except register, login, refresh,
  health, public unsubscribe, and webhooks.

### Token pair

`POST /auth/register` and `POST /auth/login` return `TokenPair`:

```json
{
  "access_token": "…",
  "refresh_token": "…",
  "token_type": "bearer",
  "expires_in": 1800,
  "tenant": { "id": "uuid", "name": "Reyvo Demo Agency", "slug": "reyvo-demo-agency-261b02" }
}
```

Access tokens live 30 minutes. Refresh before expiry, or on a `401`:

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{ "refresh_token": "…" }
```

`src/lib/api.js` does this automatically for authenticated calls:

1. Refresh proactively when the stored token is within 30 seconds of expiry.
2. On `401`, refresh once (concurrent requests share a single refresh), then retry the request.
3. If the refresh is rejected, clear the session and notify the app shell.
4. If the refresh fails for network reasons, keep the session and surface the error.

### Login request

```json
{ "email": "demo@reyvo.com", "password": "ReyvoDemo123!", "tenant_slug": null }
```

`tenant_slug` is required only when the email belongs to multiple tenants.

### Register request

```json
{
  "email": "dana@agency.com",
  "password": "at-least-12-characters",
  "full_name": "Dana Reed",
  "agency_name": "Northline Talent",
  "timezone": "America/New_York",
  "physical_address": {}
}
```

Required: `email`, `password` (12–256 chars), `full_name`, `agency_name`. `timezone` defaults to
`UTC`; `physical_address` is an optional object.

### Current session

`GET /auth/me` returns:

```json
{
  "user": {
    "id": "uuid",
    "email": "demo@reyvo.com",
    "full_name": "Demo Owner",
    "is_platform_admin": false,
    "status": "active",
    "email_verified_at": null,
    "created_at": "2026-11-10T15:20:40+08:00"
  },
  "tenant": { "id": "uuid", "name": "Reyvo Demo Agency", "slug": "reyvo-demo-agency-261b02" },
  "role": "owner"
}
```

`role` is `owner`, `admin`, or `member`. `is_platform_admin` gates the platform admin console and is
independent of the tenant role.

---

## 2. Errors

Every application error uses one envelope:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Please check the highlighted fields and try again.",
    "details": {
      "errors": [{ "loc": ["body", "email"], "msg": "Value error, Enter a valid email.", "type": "value_error" }]
    },
    "request_id": "…"
  }
}
```

- `code` is a stable machine identifier; branch on it, not on `message`.
- `message` is safe to show to the user.
- `details.errors[].loc` is a FastAPI location array; the last element is the form field.
- `request_id` should be shown in support/debug surfaces and attached to client logs.

`src/lib/api.js` maps this into `ApiError` with `status`, `code`, `details`, `fieldErrors`,
`requestId`, and a network-specific fallback when the API is unreachable.

FastAPI validation failures may also arrive as `422` with the standard `HTTPValidationError` body
when the error originates outside the application envelope. Treat a missing envelope as
`code: "http_error"` and fall back to a status-based message.

---

## 3. Pagination and filtering

Paginated collections return `Page[T]`:

```json
{ "items": [], "total": 0, "limit": 50, "offset": 0 }
```

- `limit`: 1–100, default 50.
- `offset`: 0-based.
- `total` is the filtered count before pagination.
- Paginated today: contacts, companies, campaigns, replies, tasks, opportunities, suppressions,
  enrollments, audit logs, admin tenants.
- `GET /lists`, `GET /email-accounts`, and `GET /tenants/current/members` return plain arrays; do not
  assume `items`/`total` for them.

| Collection | Supported filters |
|---|---|
| `GET /contacts` | `search`, `status`, `company_id`, `list_id` |
| `GET /companies` | `search`, `industry` |
| `GET /campaigns` | `search`, `status` |
| `GET /replies` | `category`, `needs_review`, `campaign_id` |
| `GET /tasks` | `status`, `assignee_id` |
| `GET /opportunities` | `stage`, `owner_id`, `contact_id` |
| `GET /suppressions` | `reason` |
| `GET /admin/tenants` | `search`, `status` |
| `GET /tenants/current/audit-logs` | `action` |

Search is a case-insensitive substring match on the server; it is not full-text search.

---

## 4. Endpoint map

All paths below are relative to `/api/v1` and require a Bearer token unless marked public.

### Auth

| Endpoint | Purpose | Auth |
|---|---|---|
| `POST /auth/register` | Create user, tenant, owner membership, trial | public |
| `POST /auth/login` | Password login | public |
| `POST /auth/refresh` | Exchange refresh token for a new pair | public |
| `GET /auth/me` | Current user, tenant, role | required |
| `GET /auth/sso/authorize` | Start SSO | required |
| `GET/POST /auth/sso/callback` | Finish SSO | public |

### Email verification (not implemented)

The OpenAPI snapshot contains **no** verification or resend route. `src/lib/api.js` defines two
provisional paths so the UI can be wired now and switched on when the backend lands:

| Provisional endpoint | Body | Expected behaviour |
|---|---|---|
| `POST /auth/verify-email` | `{ token }` | Mark the current user verified, or report expired / invalid |
| `POST /auth/resend-verification` | `{ email }` | Send a fresh 24-hour signed link |

`src/lib/emailVerification.js` calls them first. A `404`/`405` in a **development build** falls back to
a local single-use challenge stored under `reyvo.onboarding.v1`; the UI labels the link
“Development only”. A production build surfaces an honest unavailable error instead of pretending the
address was verified. When the real endpoints ship, only the adapter needs to change.

### Password reset, MFA, and invitations (not implemented)

The snapshot contains **no** endpoint for any of the three account-recovery flows. `src/lib/` defines
provisional paths so the UI can be wired now and switched on when the backend lands:

| Flow | Provisional endpoints | Body | Expected behaviour |
|---|---|---|---|
| Password reset | `POST /auth/password/forgot` | `{ email }` | Email a single-use link that expires in 30 minutes; neutral response either way |
| Password reset | `POST /auth/password/reset` | `{ token, password }` | Set the new password, invalidate every session, or report expired / invalid / used |
| MFA | `POST /auth/mfa/enroll` | — | Return a TOTP secret for the current user |
| MFA | `POST /auth/mfa/verify` | `{ code }` | Accept a rotating code (with clock drift), or report locked |
| Invitations | `POST /invites` | `{ email, role }` | Send a 7-day single-use invitation |
| Invitations | `POST /invites/{token}/accept` | `{ full_name, password }` | Create the member, or report expired / invalid / already accepted |

`src/lib/passwordReset.js`, `src/lib/mfa.js`, and `src/lib/invites.js` call these first. A `404`/`405`
in a **development build** falls back to single-use, time-boxed records under
`reyvo.passwordResets.v1` (30-minute links), `reyvo.mfa.v1` (10-minute enrollment, 5-minute
challenges, 5-attempt lock), and `reyvo.invites.v1` (7-day invitations). The screens label every
state-switching link “Development only”. Production builds surface an honest unavailable error
instead of faking success. When the real endpoints ship, only the adapters need to change.

### Tenant, team, usage, audit

| Endpoint | Purpose |
|---|---|
| `GET /tenants/current` | Tenant profile (`status`, `plan_code`, `timezone`, `physical_address`, `settings`) |
| `PATCH /tenants/current` | Update tenant profile and sending defaults |
| `GET /tenants/current/members` | Membership list |
| `PATCH /tenants/current/members/{membership_id}` | Change role / status |
| `GET /tenants/current/usage` | Contacts, companies, campaigns, messages, replies, seats, daily cap |
| `GET /tenants/current/audit-logs` | Paginated tenant audit log |
| `GET/PATCH/DELETE /tenants/current/sso` | Read, update, disable SSO |

### Companies

| Endpoint | Purpose |
|---|---|
| `GET /companies` | Paginated list with `search`, `industry` |
| `POST /companies` | Create |
| `GET /companies/{id}` | Detail |
| `PATCH /companies/{id}` | Update |
| `DELETE /companies/{id}` | Delete |

### Contacts, import, export

| Endpoint | Purpose |
|---|---|
| `GET /contacts` | Paginated list with `search`, `status`, `company_id`, `list_id` |
| `POST /contacts` | Create |
| `GET /contacts/{id}` | Detail |
| `PATCH /contacts/{id}` | Update |
| `DELETE /contacts/{id}` | Delete |
| `POST /contacts/import` | Multipart CSV import; returns `ImportReport` |
| `GET /contacts/export` | CSV download (`text/csv`) |

`ContactRead` includes `full_name`, `email_normalized`, `email_status`, `status`, `custom_fields`,
`last_contacted_at`, and `last_replied_at`.

### Lists

| Endpoint | Purpose |
|---|---|
| `GET /lists` | Array of list summaries with `contact_count` |
| `POST /lists` | Create, optionally with `contact_ids` |
| `GET /lists/{id}/contacts` | Paginated list membership |
| `POST /lists/{id}/contacts` | Add `contact_ids` (min 1) |
| `DELETE /lists/{id}/contacts/{contact_id}` | Remove one contact |
| `DELETE /lists/{id}` | Delete list |

### Suppressions

| Endpoint | Purpose |
|---|---|
| `GET /suppressions` | Paginated list with `reason` |
| `POST /suppressions` | Add a manual or imported suppression |
| `DELETE /suppressions/{id}` | Remove (owner override rules apply) |

Reasons: `unsubscribe`, `hard_bounce`, `complaint`, `manual`, `legal`.

### Email accounts (mailboxes)

| Endpoint | Purpose |
|---|---|
| `GET /email-accounts` | Array of connected mailboxes and health |
| `POST /email-accounts/oauth/{provider}/start` | Begin Google/Microsoft OAuth; returns `authorization_url` |
| `GET /email-accounts/oauth/{provider}/callback` | OAuth callback |
| `PATCH /email-accounts/{id}` | Update from name, reply-to, caps |
| `DELETE /email-accounts/{id}` | Disconnect |
| `POST /email-accounts/{id}/test` | Send a test message |

`status`: `connected`, `needs_reauth`, `degraded`, `error`, `disconnected`.
`provider`: `google`, `microsoft`.

### Campaigns

| Endpoint | Purpose |
|---|---|
| `GET /campaigns` | Paginated list with `search`, `status` |
| `POST /campaigns` | Create a draft with steps |
| `GET /campaigns/{id}` | Detail, including `steps` |
| `PATCH /campaigns/{id}` | Update |
| `DELETE /campaigns/{id}` | Delete |
| `POST /campaigns/{id}/submit` | Submit for approval |
| `POST /campaigns/{id}/approve` | Approve |
| `POST /campaigns/{id}/reject` | Reject with reason |
| `POST /campaigns/{id}/launch` | Launch |
| `POST /campaigns/{id}/pause` | Pause |
| `POST /campaigns/{id}/resume` | Resume |
| `POST /campaigns/{id}/archive` | Archive |
| `GET /campaigns/{id}/preflight` | Blocking checks before launch |
| `POST /campaigns/{id}/preview` | Render a contact-specific preview |
| `GET /campaigns/{id}/stats` | Per-step performance |
| `GET /campaigns/{id}/enrollments` | Paginated enrollment list |

`status`: `draft`, `pending_approval`, `approved`, `active`, `paused`, `completed`, `archived`.
`approval_status`: `pending`, `approved`, `rejected`.

### Replies, tasks, pipeline

| Endpoint | Purpose |
|---|---|
| `GET /replies` | Paginated list with `category`, `needs_review`, `campaign_id` |
| `PATCH /replies/{id}` | Reclassify, assign, or mark reviewed |
| `GET /tasks` | Paginated list with `status`, `assignee_id` |
| `POST /tasks` | Create |
| `PATCH /tasks/{id}` | Update status, due date, priority, assignee |
| `GET /opportunities` | Paginated list with `stage`, `owner_id`, `contact_id` |
| `POST /opportunities` | Create |
| `GET /opportunities/pipeline` | Count and value by stage |
| `GET /opportunities/{id}` | Detail |
| `PATCH /opportunities/{id}` | Update stage, value, owner, close date |
| `DELETE /opportunities/{id}` | Delete |

`ReplyCategory`: `positive`, `negative`, `question`, `out_of_office`, `unsubscribe`, `bounce`,
`neutral`, `other`.
`TaskStatus`: `open`, `in_progress`, `completed`, `canceled`.
`OpportunityStage`: `new`, `contacted`, `replied`, `meeting`, `won`, `not_interested`.

### Dashboard, AI

| Endpoint | Purpose |
|---|---|
| `GET /dashboard/summary` | Counts for sends, replies, meetings, pipeline, tasks, caps, top campaigns |
| `POST /ai/draft` | Draft subject and body from a prompt plus campaign/contact context |

`DashboardSummary` includes `as_of` (date) and per-stage `pipeline` totals. Daily boundaries use the
tenant timezone; display it next to the date range.

### Billing

| Endpoint | Purpose |
|---|---|
| `GET /billing/plans` | Public plan catalogue |
| `GET /billing/subscription` | Current subscription and trial state |
| `POST /billing/checkout` | Stripe Checkout session (`checkout_url`) |
| `POST /billing/portal` | Stripe Customer Portal session (`url`) |

### Admin (platform admins only)

| Endpoint | Purpose |
|---|---|
| `GET /admin/tenants` | Paginated tenant search with `search`, `status` |
| `PATCH /admin/tenants/{id}` | Suspend, reactivate, change plan, extend trial, flags |
| `GET /admin/audit-logs` | Paginated platform audit log |

`TenantStatus`: `trial`, `active`, `past_due`, `suspended`, `canceled`, `deleted`.

### Public and webhooks

| Endpoint | Purpose | Auth |
|---|---|---|
| `GET /u/{token}` | Unsubscribe page info (`agency_name`, contact state) | public |
| `POST /u/{token}` | Record opt-out; idempotent | public |
| `POST /webhooks/stripe` | Stripe webhook receiver | signature |
| `GET /health` | Liveness (no prefix) | public |
| `GET /health/ready` | Database readiness (no prefix) | public |

---

## 5. Frontend module mapping

| UI area | Primary endpoints |
|---|---|
| App shell | `/auth/me`, `/tenants/current` |
| Onboarding | `/auth/me`, `/tenants/current`, `/tenants/current/usage`, `/email-accounts` (verification: provisional) |
| Password reset | provisional `/auth/password/*` |
| MFA | provisional `/auth/mfa/*` |
| Invitations | provisional `/invites` |
| Companies | `/companies` |
| Contacts | `/contacts`, `/contacts/{id}` |
| Import | `/contacts/import`, `/lists` |
| Lists and segments | `/lists`, `/lists/{id}/contacts` |
| Suppressions | `/suppressions` |
| Mailboxes | `/email-accounts`, OAuth start/callback |
| Campaigns | `/campaigns` plus lifecycle actions |
| AI drafting | `/ai/draft` |
| Replies inbox | `/replies`, `/contacts/{id}`, `/campaigns/{id}` |
| Tasks | `/tasks` |
| Pipeline | `/opportunities`, `/opportunities/pipeline` |
| Dashboard and reports | `/dashboard/summary`, `/campaigns/{id}/stats` |
| Billing | `/billing/plans`, `/billing/subscription` |
| Workspace settings | `/tenants/current` |
| Team | `/tenants/current/members` |
| Security and audit | `/tenants/current/audit-logs` |
| Platform admin | `/admin/tenants`, `/admin/audit-logs` |
| Unsubscribe | `/u/{token}` |

---

## 6. Known gaps

These are backend extension points per `DEVELOPER_GUIDE.md`; the UI must not imply they are live:

- Bulk send loop and scheduler are a skeleton — campaign progress may not advance.
- Reply-sync webhooks are not wired, so new replies may never appear.
- The AI classification pipeline is not implemented; `classified_by` and `confidence` may be manual.
- Rate limiting is not enforced yet; the client should still debounce and abort in-flight requests.
- Bulk contact import and export are synchronous.
- There is no global search endpoint; search is per collection.
- There is no endpoint that lists the tenants a user belongs to or switches the active tenant.
  `/auth/login` accepts an optional `tenant_slug`, and each token pair is scoped to one tenant. The
  UI keeps tenant-scoped sessions on the device (`reyvo.workspaces.v1`) and revalidates expired ones
  through `/auth/refresh`, but a real workspace list/switch endpoint is still needed.
- There is no email-verification or resend endpoint. `POST /auth/verify-email` and
  `POST /auth/resend-verification` are provisional client paths; development builds use a local
  single-use challenge (`reyvo.onboarding.v1`) and production builds report the feature as
  unavailable. `users.email_verified_at` is returned by `/auth/me` but nothing sets it yet.
- There are no password-reset, MFA, or invitation endpoints. The provisional paths in the table
  above are client-side conventions; development builds keep single-use, time-boxed records in
  `reyvo.passwordResets.v1`, `reyvo.mfa.v1`, and `reyvo.invites.v1` and production builds report the
  feature as unavailable.
- Sources under `ReyvoAPI/ReyvoApi/src/reyvo/*.py` were missing at capture time. The API was
  reachable from a running process, but restarting it may require restoring the sources.
