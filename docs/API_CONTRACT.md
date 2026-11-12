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

### Account settings (not implemented)

The snapshot exposes only `GET /auth/me`. `src/lib/account.js` defines provisional paths for the T10
actions:

| Action | Provisional endpoint | Body | Expected behaviour |
|---|---|---|---|
| Profile | `PATCH /auth/me` | `{ full_name }` | Update the current user’s display name |
| Email change | `POST /auth/email-change` | `{ email, current_password }` | Verify the password, then send a signed link to the new address |
| Email confirm | `POST /auth/email-change/confirm` | `{ token }` | Apply the new address and invalidate every session |
| Password change | `POST /auth/password/change` | `{ current_password, new_password }` | Rotate the password and invalidate every other session |
| Sessions | `GET /auth/sessions` | — | List active sessions with device, IP, and last activity |
| Sessions | `DELETE /auth/sessions/{id}` | — | Revoke one session |
| Sessions | `POST /auth/sessions/revoke-all` | `{ keep_current }` | Revoke every session, or every other session |

A `404`/`405` in a **development build** falls back to `reyvo.account.v1` (name override, pending
24-hour email change, password-change timestamp) and `reyvo.sessions.v1` (demo session list).
Development verifies the current password with the live `POST /auth/login` route before recording an
email or password change, and revokes the other demo sessions on success. It cannot rotate the server
password or deliver mail, so the UI states that limitation and production builds report the feature
as unavailable. When the real endpoints ship, only the adapter needs to change.

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

`Company` fields: `name`, `domain`, `industry`, `employee_count`, `city`, `state`, `country`,
`website`, `linkedin_url`, `source`, `status` (read-only, defaults to `active`), `notes`,
`custom_fields`, `created_at`, `updated_at`.

- `search` is a case-insensitive substring match on the normalized name and domain; `industry` is an
  exact match. There is no industries endpoint, so the frontend samples `GET /companies?limit=100` to
  build its filter options.
- The server writes `normalized_name` and `normalized_domain` but enforces no uniqueness, so duplicate
  prevention is a frontend warning (see below).
- `DELETE` detaches the company's contacts (`company_id` set to `null`); contacts are never deleted
  with a company.
- No RBAC is wired up on this router yet: `require_roles` exists in `reyvo/api/deps.py` but is unused,
  so a `member` can still write through the API. The UI treats `owner`/`admin` as writable, `member`
  as read-only, and handles a `403` gracefully.

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

`ContactRead` fields: `company_id`, `first_name`, `last_name`, `full_name`, `title`, `email`,
`email_normalized`, `email_status` (`valid`, `risky`, `invalid`, `unknown`), `phone`,
`linkedin_url`, `source`, `status`, `notes`, `custom_fields`, `last_contacted_at`,
`last_replied_at`, `created_at`, `updated_at`.

- `GET /contacts` is ordered by `created_at desc`. `search` is a case-insensitive substring match on
  the normalized email and full name; `status` and `company_id` are exact filters.
- `ContactRead` carries `company_id` but **not** the company itself. The frontend fetches
  `/companies/{id}` for detail context and samples `/companies?limit=100` for the company filter and
  list-row names.
- `ContactCreate` accepts `company_id`, or `company_name`/`company_domain` to find-or-create a
  company within the tenant. It ignores `status`: new contacts start at `new` (`unsubscribed` when
  the address is suppressed). Status is writable only through `PATCH`.
- `ContactCreate` accepts `email_status`; `ContactUpdate` does not. The UI exposes email health on
  create only and shows it read-only on edit.
- A duplicate normalized email returns `409` with “A contact with this email already exists in this
  workspace.” on create and “Another contact already uses this email address.” on update.
- **Tags are not implemented by this API build.** The design lists tags, but no tags endpoint or
  field exists. Development builds keep tags per browser under `reyvo.contactTags.v1` and label them
  as browser-only; production builds report the feature as unavailable. They are never sent to the
  server.
- No RBAC is wired up on this router yet: a `member` can still write through the API. The UI treats
  `owner`/`admin` as writable and handles `403` gracefully on reads and writes.

#### CSV export, bulk actions, and merge

The design's endpoint catalog also lists `POST /contacts/bulk`, `POST /contacts/merge`, and filtered
exports. This API build exposes none of those variants: only `GET /contacts/export` exists, and it has
no filter parameters, no formula-injection sanitization, and no audit write. T15 therefore composes
the behaviour in `src/lib/contactBulk.js` around the live routes:

- **Export** — `GET /contacts/export` returns every tenant contact in `created_at` order with
  `email`, names, `full_name`, `title`, `company`, `company_domain`, `phone`, `linkedin_url`,
  `source`, `status`, and `created_at`. It ignores `search`, `status`, and `company_id`, and writes
  values as-is. The UI does not use this route for filtered export. It pages `GET /contacts` with the
  active filters (100 per page, capped at 5,000), pages `/companies` for names and domains (capped at
  1,000), and builds the CSV in the browser with a UTF-8 BOM. Cells beginning with `=`, `+`, `-`, or
  `@` (plus tab and carriage return) are prefixed with a single quote. There is no export-audit
  endpoint, so a download cannot be written to the tenant audit log in this build.
- **Bulk archive/update** — there is no bulk route. Each selected row is sent as its own
  `PATCH /contacts/{id}`. Archive sets `status: "archived"`; update accepts optional `status`,
  `company_id` (including `null` to detach), and `source`. Requests run in sequence, failures are
  counted without stopping the batch, and each success is audited as `contact.updated`.
- **Merge** — there is no merge route, tombstone, undo window, or relation-transfer step. The browser
  scans up to 1,000 contacts and groups them by normalized name plus `company_id` (emails are unique,
  so duplicates only coexist under different addresses). The chosen survivor is `PATCH`ed with blank
  fields filled from the duplicates and combined `custom_fields`; each duplicate is then `DELETE`d.
  Development tags are combined in `reyvo.contactTags.v1` before deletion. The survivor update is
  audited as `contact.updated` and each deletion as `contact.deleted`. Deletion is permanent, and
  related campaigns, opportunities, tasks, and activities are not moved.
- **Permissions** — owner/admin see selection, archive, update, and merge controls. Export is
  available to any role that can view contacts, because this build has no owner setting to disable
  member export.

#### CSV import

`POST /contacts/import` is one synchronous multipart request with a `file` part. It returns `201`
with:

```json
{
  "import_id": "uuid",
  "status": "completed",
  "row_count": 4,
  "imported_count": 2,
  "duplicate_count": 1,
  "suppressed_count": 0,
  "error_count": 0,
  "errors": [{ "row": 3, "email": "not-an-email", "reason": "invalid_email" }]
}
```

- Headers are matched by case-insensitive **exact canonical names only**: `email`, `first_name`,
  `last_name`, `full_name`, `title`, `company`, `company_domain`, `phone`, `linkedin_url`, `source`.
  There is no mapping payload, preview request, presigned upload, progress job, update mode, rollback
  endpoint, or server-side report download in this API build.
- An `email` header is required; without one the request fails with `400` “The CSV file must include
  an 'email' column.” Files must decode as UTF-8 (a BOM is accepted).
- Rows with a missing or invalid email are skipped and returned in `errors` with
  `reason: "invalid_email"`. `row` is the 1-based file row number, so the first data row is `2`.
- A normalized email that already exists in the tenant, or repeats earlier in the same file, counts
  as a duplicate and is skipped. A suppressed address counts as suppressed and is skipped. Neither
  case is an error.
- `company` and `company_domain` go through find-or-create, the same as `ContactCreate`. New contacts
  start at `new`; a missing `source` defaults to `csv_import`.
- The endpoint is synchronous and commits before responding. Import jobs and their report are
  audited as `contacts.imported`.

The frontend parses and validates the file locally, maps the user's headers, rewrites the remaining
rows with canonical headers, and posts the file. Rows that fail browser validation are not sent and
are merged into the displayed report with their original row numbers.

**T14 client orchestration.** Because the API has no preview, update, job, or rollback endpoints,
`src/lib/imports.js` composes those behaviours around the live routes:

- Preview scans `GET /contacts` and `GET /suppressions` in 100-record pages, capped at 1,000 records
  per list. Truncation is labelled; the API still skips anything outside the scan, and those rows
  appear as summary duplicate/suppressed counts without row detail.
- Skip mode posts only rows that are new by the browser index. Review mode posts clean new rows and
  holds existing, suppressed, and role-based rows back. Suppressed addresses are never posted.
- Update mode posts clean new rows, then calls `PATCH /contacts/{id}` for each matching contact with
  `first_name`, `last_name`, `full_name`, `title`, `phone`, `linkedin_url`, and `source`. `email` is
  the match key and is not changed, and `company` is not updated because `ContactUpdate` only accepts
  `company_id`.
- Progress is browser-side staging around the synchronous import and the update loop; there is no
  server job to resume. The report merges API errors (`row` is still the canonical CSV row number)
  with browser-caught validation and skip reasons.
- Rollback is browser-local (`reyvo.importRollbacks.v1`, 24-hour window). It searches each submitted
  email, deletes only contacts created after the import started, and keeps any contact whose
  `last_contacted_at` or `last_replied_at` is at or after that time. It does not reverse updates and
  does not delete companies created by the import.

### Lists

| Endpoint | Purpose |
|---|---|
| `GET /lists` | Array of list summaries with `contact_count` |
| `POST /lists` | Create, optionally with `contact_ids` |
| `GET /lists/{id}/contacts` | Paginated list membership (`limit ≤ 100`) |
| `POST /lists/{id}/contacts` | Add `contact_ids` (min 1); duplicates are skipped |
| `DELETE /lists/{id}/contacts/{contact_id}` | Remove one contact |
| `DELETE /lists/{id}` | Delete list |

Behavior notes from live verification:

- There is no rename/update endpoint: list name and description are immutable after creation.
- `GET /lists` returns `contact_count`; membership pages at `limit ≤ 100`.
- Audit actions: `list.created`, `list.contacts_added`, `list.deleted`. Member removal writes no audit
  entry in this build.
- **Segments and tags have no API surface.** The `segments` table exists in the database but no router
  exposes it, and `ContactCreate`/`ContactRead`/`ContactUpdate` have no tags field. The frontend keeps
  segments in `reyvo.segments.v1` (AND/OR rule groups evaluated client-side over a 5,000-contact
  snapshot) and tags in `reyvo.contactTags.v1`, both labelled browser-side in the UI.
- **Campaign audience contract:** because campaign resolution only understands `status` and
  `company_id` from `segment.definition`, segments cannot be resolved server-side. The lists page
  writes the pending audience (`{ key, type: 'list' | 'segment', id, name, count, typeLabel, savedAt }`)
  to `reyvo.campaignAudience.v1` for the campaign wizard (T21) to consume.

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
| Account settings | `/auth/me` (read), provisional `/auth/*` and `/auth/sessions*` |
| Companies | `/companies` |
| Contacts | `/contacts`, `/contacts/{id}` |
| Import | `/contacts/import`, `/lists` |
| Lists and segments | `/lists`, `/lists/{id}/contacts` (segments + tags: browser-side, no API) |
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
- There are no profile, email-change, password-change, or session endpoints. The T10 provisional
  paths above are client-side conventions; development keeps records in `reyvo.account.v1` and
  `reyvo.sessions.v1`, verifies the current password against the live login route, and production
  builds report the features as unavailable.
- There is no `/segments` or `/tags` endpoint. The `segments` table exists in the database but no
  router exposes it, and contacts have no tags field. The lists page keeps segments in
  `reyvo.segments.v1` and tags in `reyvo.contactTags.v1`, evaluated client-side, and hands the pending
  campaign audience to the wizard through `reyvo.campaignAudience.v1` because campaign resolution only
  understands `status` and `company_id` from `segment.definition`.
- Sources under `ReyvoAPI/ReyvoApi/src/reyvo/*.py` were missing at capture time. The API was
  reachable from a running process, but restarting it may require restoring the sources.
