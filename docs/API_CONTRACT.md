# Reyvo API contract

Baseline for the frontend. Captured from the running backend on **21 November 2026**.

| | |
|---|---|
| Source | `GET http://127.0.0.1:8000/openapi.json` |
| Snapshot | [`docs/openapi.json`](./openapi.json) |
| OpenAPI | 3.1.0 |
| API title / version | Reyvo API `0.1.0` |
| Paths / schemas | 109 / 147 |
| Base URL | `http://127.0.0.1:8000` |
| Prefix | `/api/v1` (except `/health`, `/health/ready`) |

Refresh the snapshot whenever the backend changes:

```powershell
npm run sync:openapi
# or against another origin
$env:REYVO_API_ORIGIN = 'http://127.0.0.1:8001'; npm run sync:openapi
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
| `GET /tenants/current/audit-logs` | `action`, `actor_type`, `search`, `since`, `until` |

Search is a case-insensitive substring match on the server; it is not full-text search.

---

## 4. Endpoint map

All paths below are relative to `/api/v1` and require a Bearer token unless marked public.

### Auth

| Endpoint | Purpose | Auth |
|---|---|---|
| `POST /auth/register` | Create user, tenant, owner membership, trial | public |
| `POST /auth/login` | Password login; returns a short-lived MFA challenge when required | public |
| `POST /auth/refresh` | Exchange refresh token for a new pair | public |
| `GET /auth/me` | Current user, tenant, role | required |
| `GET /auth/sso/authorize` | Start SSO | required |
| `GET/POST /auth/sso/callback` | Finish SSO; users with MFA receive a challenge before tokens | public |

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

### Password reset (not implemented)

The API does not expose a password-reset flow yet. `src/lib/passwordReset.js` defines provisional
paths and uses a clearly labelled, development-only local flow until those endpoints ship:

| Provisional endpoint | Body | Expected behaviour |
|---|---|---|
| `POST /auth/password/forgot` | `{ email }` | Email a single-use link that expires in 30 minutes; neutral response either way |
| `POST /auth/password/reset` | `{ token, password }` | Set the new password and invalidate sessions |

### MFA, password, and session security

| Endpoint | Purpose | Auth |
|---|---|---|
| `GET /auth/mfa/status` | Read current MFA and pending-enrollment status | Required |
| `POST /auth/mfa/enroll` | Start a 10-minute TOTP enrollment; returns the setup key once | Required |
| `POST /auth/mfa/enroll/cancel` | Discard pending enrollment | Required |
| `POST /auth/mfa/verify` | Confirm enrollment using a six-digit TOTP | Required |
| `POST /auth/mfa/disable` | Disable MFA after confirming a current TOTP | Required |
| `POST /auth/mfa/setup` | Start mandatory first-time setup for a platform administrator | Public challenge |
| `POST /auth/mfa/challenge` | Verify a login/setup challenge and issue tokens | Public challenge |
| `POST /auth/password/change` | Change password after checking the current password | Required |
| `GET /auth/sessions` | List this user’s active sessions in the current workspace | Required |
| `DELETE /auth/sessions/{id}` | Revoke one session | Required |
| `POST /auth/sessions/revoke-all` | Revoke all sessions, optionally keeping this one | Required |

MFA uses RFC 6238 TOTP (six digits, 30-second step, one-step clock drift), with five attempts per
enrollment or challenge. Login does not issue access or refresh tokens until the challenge succeeds;
challenge identifiers are random bearer values stored only as SHA-256 hashes, expire after five
minutes (ten minutes for required initial setup), and are single-use. MFA secrets are encrypted at
rest. Platform administrators must enroll before receiving a session and cannot disable MFA.
Password changes verify the existing password and revoke every other active session. Sessions are
server-tracked, so revocation invalidates access tokens immediately as well as preventing refresh.
Disabling MFA also revokes every other active session for the account. When deploying session-backed
authentication, users holding pre-deployment tokens must sign in again because those tokens have no
server session record.

### Invitations and team access

| Endpoint | Purpose | Auth |
|---|---|---|
| `GET /tenants/current/invitations` | List tenant-scoped invitation status | Owner/admin |
| `POST /tenants/current/invitations` | Create a 7-day invitation and return its link | Owner/admin |
| `POST /tenants/current/invitations/{id}/resend` | Rotate the single-use token and expiry | Owner/admin |
| `DELETE /tenants/current/invitations/{id}` | Revoke a pending invitation | Owner/admin |
| `GET /invites/{token}` | Inspect an invitation | Public bearer link |
| `POST /invites/{token}/accept` | Accept an invitation and create or attach the membership | Public bearer link |
| `PATCH /tenants/current/members/{id}` | Change a member role | Owner |
| `DELETE /tenants/current/members/{id}` | Remove workspace access while retaining history | Owner |

Invitation tokens are generated randomly, stored only as SHA-256 hashes, single-use, and expire after
seven days. Existing Reyvo accounts must confirm their current password; new invitees create an
account and join the tenant in one transaction. SMTP sends the link when configured. If no SMTP
relay is configured or delivery fails, the authenticated create/resend response explicitly reports
the delivery status and returns the valid link for manual sharing. Role changes, invitation actions,
acceptance, and membership removal are written to the tenant audit log. Removing or demoting an
owner locks active owner records and is rejected if it would leave the tenant without an owner.

### Account settings (partial)

The API exposes `GET /auth/me`; profile editing and email change still use provisional paths:

| Action | Provisional endpoint | Body | Expected behaviour |
|---|---|---|---|
| Profile | `PATCH /auth/me` | `{ full_name }` | Update the current user’s display name |
| Email change | `POST /auth/email-change` | `{ email, current_password }` | Verify the password, then send a signed link to the new address |
| Email confirm | `POST /auth/email-change/confirm` | `{ token }` | Apply the new address and invalidate every session |

Development-only browser fallbacks remain for profile and email changes; password and session
operations are server-backed.

### Tenant, team, usage, audit

| Endpoint | Purpose |
|---|---|
| `GET /tenants/current` | Tenant profile (`status`, `plan_code`, `timezone`, `physical_address`, `settings`) |
| `PATCH /tenants/current` | Update agency identity, IANA timezone, physical address, and validated workspace defaults |
| `GET /tenants/current/members` | Membership list |
| `PATCH /tenants/current/members/{membership_id}` | Change role / status |
| `GET /tenants/current/usage` | Contacts, companies, campaigns, messages, replies, seats, daily cap |
| `GET /tenants/current/audit-logs` | Paginated tenant audit log; supports `action`, `actor_type`, `search`, `since`, and `until` |
| `GET /tenants/current/audit-logs/export` | Filtered CSV export, capped at 10,000 rows |
| `GET/PATCH/DELETE /tenants/current/sso` | Read, update, disable SSO |

Audit reads and exports are restricted to workspace owners/admins. Audit rows include the actor
type; platform administrator actions are recorded as `platform_admin` and remain visible in the
tenant-scoped log and CSV export.

Workspace settings use `settings.default_sending_window` (`local_window.start/end` and
`send_days`), `settings.default_daily_cap` (campaign messages/day), `settings.default_signature`
(plain text), `settings.chat_retention_days` (assistant conversation history), and
`settings.ai_drafting_enabled`. New campaigns inherit the timezone, window, and cap unless they
provide an override. Campaign launch preflight blocks a workspace without street, city, postal code,
and country.

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
  to `reyvo.campaignAudience.v1`; the T21 wizard consumed this contract — the banner pre-selects
  the handed-over audience and segments resolve to contact ids at creation (see the wizard slice
  under Campaigns).

### Suppressions

| Endpoint | Purpose |
|---|---|
| `GET /suppressions` | Paginated list with `reason` |
| `POST /suppressions` | Add a manual or imported suppression |
| `DELETE /suppressions/{id}` | Remove (owner override rules apply) |

Reasons: `unsubscribe`, `hard_bounce`, `complaint`, `manual`, `legal`.

Behavior notes from live verification:

- `GET /suppressions` matches `tenant_id = current OR tenant_id IS NULL`, so platform (global) rows
  are included. `SuppressionRead` has no tenant flag, so the UI cannot tell them apart; the design
  (D-07) would show platform blocks only as a generic "blocked by platform" reason, but this build
  returns the raw reason.
- `POST /suppressions` normalizes the email, returns 409 when it is already suppressed, flips a
  matching contact to `unsubscribed`, and audits `suppression.created`.
- `DELETE /suppressions/{id}` audits `suppression.removed`. The route has no server-side RBAC, so
  owner/admin-only writes are UI policy.
- Override rules (design §5.2.5, applied by reason): `complaint` and `legal` are non-overridable;
  `unsubscribe`, `hard_bounce`, and `manual` can be removed by an owner or admin.
- The import review step reads `GET /suppressions` (all pages, capped) to mark suppressed rows as
  skipped before upload.

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
`provider`: `google`, `microsoft`, `smtp`.

Behavior notes (T18/T19 slice):

- `GET /email-accounts` returns a plain (non-paged) array ordered by `created_at`. The route has
  principal auth but no role check, so member write access is UI policy (read-only there).
- `POST .../oauth/{provider}/start` returns `authorization_url` + `state`; without provider
  credentials configured it raises 503, which the UI maps to a friendly "not configured" state
  rather than a raw message.
- The OAuth callback is a backend URL (`app_public_url`-adjacent), so the UI opens the consent
  screen in a popup and polls the accounts list (2.5 s interval, 3 min cap); a new account id
  means success. A popup closed without a new account is treated as "not completed" (info toast,
  nothing changed).
- Health states are maintained by the backend worker (checks every 15 minutes per design
  §5.3.4); `last_health_check_at` and `last_error` drive the card banners.
- The reconnect flow updates the existing record by tenant + email (no duplicate rows), and
  disconnect sets status `disconnected` and clears tokens; audit actions are
  `email_account.connected` / `email_account.updated` / `email_account.disconnected`.
- There is no GET-by-id endpoint; the detail page resolves the account from the list.
- `PATCH /{id}` accepts `from_name`, `reply_to`, `signature_html` (string), `daily_cap` (1–2,000)
  and `hourly_cap` (1–500); the UI validates the same bounds plus an hourly ≤ daily cross-check
  and maps server 422 field errors inline. `signature_html` is not echoed back by the read model,
  so the UI keeps the saved value locally for display.
- `POST /{id}/test` requires a recipient in the body (`to_email`, optional `subject`, `message`
  capped at 5,000 chars) unless `SMTP_TEST_RECIPIENT` is configured, then attempts a real send:
  success returns `{ok, message}`; failures (for example an unusable token) return 503 and the
  UI shows the provider message inline.
- The newer API build also accepts `smtp` as a provider and exposes
  `POST /email-accounts/smtp` registration. SMTP is a Phase 2 option per design §5.3.1, so the
  UI labels `smtp` accounts but does not surface registration yet.

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

Behavior notes (T20 slice):

- `GET /campaigns` returns the `Page` envelope (`items`, `total`, `limit`, `offset`) and accepts
  `search` (max 255 chars) plus `status` (query alias for the status enum). The list is sorted
  newest-first; the UI pages 20 rows at a time and keeps filters in the URL.
- `POST /campaigns` requires `name` (2–255) and at least one `steps` entry (1–8, unique
  `step_order`, `subject_template` 1–500, non-empty `body_html_template`). `audience_type` can be
  `contacts` with an empty `contact_ids` array for a draft (the wizard fills it in later),
  `timezone` defaults to `UTC`, `daily_cap` defaults to 200. Returns the campaign read model
  including `steps`. Invalid step orders or unknown audience/mailbox ids raise 400.
- Transitions are POST endpoints that return the updated read model; each enforces its source
  state per §5.4.1, so calling them from the wrong state is a 409. `DELETE /campaigns/{id}`
  returns 204 and is refused with 409 for `active` campaigns; deleting other states is accepted
  but the UI only offers it for drafts.
- There is no duplicate endpoint — the UI composes one from `GET /{id}` (which includes `steps`,
  audience ids, caps, sending window) + `POST /campaigns`.
- The T20 page owns list-level actions: create, duplicate, submit, archive, delete, and (since
  T25) approve/reject for `pending_approval` rows — reject sends a note and returns the campaign
  to draft. Launch, pause, resume, preflight, preview, stats, and enrollments belong to the
  campaign detail page (T26) and the wizard's review step.
- No RBAC on this route in this build: member read-only is UI policy, same as the other list pages.

Wizard slice (T21–T24):

- The wizard at `/app/campaigns/new` is the full §5.4.2 flow: audience, mailboxes, sequence
  (1–8 steps, business-day delays, HTML subject/body with a merge-field picker; unknown merge
  fields block creation and a plain-text fallback is previewed), schedule (send days, local
  window, timezone strategy, holiday skip; next-send preview computed with real IANA/DST math in
  the page), and review. "Create draft campaign" posts everything at once via `POST /campaigns`
  with `audience_type`/`audience_id`/`contact_ids`/`email_account_ids`, the full `steps` array
  (`ai_generated` flags included), and `sending_window` (`timezone`, `timezone_strategy`,
  `local_window`, `send_days`, `skip_holidays`). `daily_cap` posts the API default of 200.
- The review step then consumes the live campaign endpoints: `GET /{id}/preflight` for blocking
  reasons (launch stays blocked until they clear), `POST /{id}/preview` for a sample contact per
  step, and the mailbox test-send endpoint.
- **No audience/exclusion endpoint exists in this build**, so the wizard composes audience and
  exclusion counts in the browser (`src/lib/wizard.js`): list audiences page
  `GET /lists/{id}/contacts`; segment audiences evaluate the saved definition (T16's browser store)
  over the contact snapshot; exclusions combine `GET /suppressions`, cross-campaign enrollments
  (`GET /campaigns` → `GET /campaigns/{id}/enrollments` per campaign, capped 2,000), and contact
  fields (no email, contacted within 30 days). The breakdown is counted per contact by priority so
  parts sum to the total, and capped counts are labelled as estimates.
- List audiences post as `audience_type: 'list'` + `audience_id`; segments resolve client-side to
  `audience_type: 'contacts'` + the resolved `contact_ids` because there is no `/segments` route
  for the server to persist a definition into. Mailboxes post as `email_account_ids`.
- Send-plan math is client-side: capacity = Σ selected inbox daily caps (from
  `GET /email-accounts`), first-day = min(net, capacity), first pass ≈ ceil(net/capacity) days.
- AI drafting uses the live `POST /ai/draft` (subject/body from a prompt), but the AI approval
  mode and quota usage are browser-local (`localStorage`), not tenant settings — there is no
  tenant AI-config endpoint in this build.

Browser-local and demo surfaces (not API-backed):

- Sending controls (T30) are API-backed: `POST /tenants/current/sending-pause` (owner/admin,
  send-only flag `sending_paused_at`), `PATCH /email-accounts/{id}` with `is_paused`, and campaign
  `POST /campaigns/{id}/pause|resume` (all audited). The platform kill switch is
  `GET/POST /admin/sending-controls` (platform staff only; audited `admin.kill_switch_changed`);
  tenant roles get 403 and the page shows a "Platform staff only" panel. The backend forces MFA
  enrollment on every login for platform-admin users.
- `MailboxHealthPage` summarizes the live `/email-accounts` list from the fields
  `EmailAccountRead` returns (status, `last_error`, caps, warm-up, `last_health_check_at`); the API
  exposes no per-inbox send counters, bounce/error rates, or last-successful-send timestamps, so
  the page shows no telemetry columns and says so.
- The reports page (T39) reads live data — the campaigns list plus per-campaign
  `/campaigns/{id}/stats`, the replies list (two pages, counted client-side with a capped-page
  note), `/email-accounts`, the `/suppressions` total, and `/opportunities/pipeline` with a
  client-side opportunity page for age/owner splits — and the CSV export runs on those live
  rows. There is no aggregate reports endpoint and no date-range/timezone parameter in this
  build, so windows are presented as all-time; per-step, error-rate, and per-campaign opt-out
  breakdowns and "delivered" (not observable) are named as gaps on the page instead of faked.
  The dashboard (T38), pipeline board (T36), and opportunity detail
  (T37) read live data. The replies
  list/actions (T32–T34) and the task queue (T35) read live data.
- Billing (`src/lib/billing.js`) reads `GET /tenants/current/usage`, `/billing/plans`,
  `/billing/subscription`, and cursor-paginated `GET /billing/invoices`, counts inboxes from
  `/email-accounts`, and posts provider-backed checkout, plan-change, and portal requests. Plan
  changes enforce target usage limits server-side (`409 downgrade_blocked` with per-resource
  blockers, verified live); payment-failure webhooks provide a seven-day sending grace period.
  Without Stripe credentials and plan price IDs, checkout/plan-change answer 503 and portal 400
  (all surfaced verbatim), and invoices returns an empty page — the trial, grace, past-due,
  canceled, and downgrade-blocked UI states were verified against seeded subscription rows on the
  live backend; the provider round-trips remain unverified. Plan limits cap contacts, sending
  inboxes, and the daily send cap only; there is no AI/message-volume meter in `UsageRead`.

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

Replies notes (T32):

- `ReplyRead` carries ids, category, confidence, `classified_by`, `needs_review`, `snippet`,
  `received_at`, and `assigned_to` — no inbox/mailbox field, no message bodies, and no date
  filter parameter. The replies page filters by category/review state/campaign server-side and
  names the rest as gaps instead of faking them.
- Contact, campaign, and assignee names are mapped client-side from `/contacts`,
  `/campaigns`, and `/tenants/current/members` (first 100 each, same sampling trade-off as the
  other pickers).
- There is **no `GET /replies/{id}`** — the detail route supports `PATCH` only. The reply detail
  page locates a single reply by walking list pages (capped 5 pages / 500 rows).
- Unmatched replies (no `contact_id` or no `campaign_id`) are badged and filterable on the page —
  the old demo's fake `test` category does not exist in the API enum.
- The snippet is untrusted provider HTML: `sanitizeReplyHtml` in `src/lib/replies.js` strips
  scripts, remote content blocks, and link attributes before `dangerouslySetInnerHTML`, and it now
  runs on live snippets.
- Reply actions (T33) write through: `PATCH /replies/{id}` reclassifies / flags for review /
  reassigns (the backend then reports `classified_by: "user"`); contact notes are appended through
  `PATCH /contacts/{id}` because there is no notes sub-resource; follow-up tasks go through
  `POST /tasks` (`src/lib/tasks.js` — `TaskCreate` requires only `title`, priority is a free
  string, status is writable only via `PATCH /tasks/{id}`); suppression goes through
  `POST /suppressions` with the `SuppressionReason` enum (duplicates answer 409). There is no
  `DELETE /tasks/{id}` — task cleanup is not possible from the UI.
- Stop-sequence and "open in provider" are not buildable on the reply detail: `message_id` is an
  internal UUID, not a provider message id.
- Classification & assignment (T34) live in the inbox: one-click approval clears `needs_review`,
  and the reader's correction form PATCHes category/assignee/review state. A category correction
  makes the backend set `classified_by: "user"` and clear the review flag automatically. The
  backend ignores `assigned_to: null` — assignments can be changed but not cleared.
- Task queue (T35) notes: status filtering is server-side (`GET /tasks?status=`), while
  search/priority/assignee filtering is client-side over the loaded page (page size cap 100).
  Overdue/Due-today are derived client-side from `due_at` against the start of today —
  completed and canceled tasks are never overdue. There is no `DELETE /tasks/{id}`; the page
  says tasks are completed or canceled, not removed. Contact/opportunity links are enriched
  client-side from `/contacts` and `/opportunities` (first 100 each); `OpportunityRead` has no
  name field, so opportunity labels are derived from the linked contact's name.
- Pipeline board (T36) notes: stage counts and values come from the server
  (`GET /opportunities/pipeline`); list enrichment uses contacts, companies, campaigns, and
  members (first 100 each). Stage moves go through `PATCH /opportunities/{id}` after an
  in-page confirm; a failed PATCH leaves the opportunity in its original stage with a retry
  available, and "undo" is a real PATCH back to the previous stage. Won/Not-interested moves
  require a reason that is stored in the opportunity's `notes` — the API has no dedicated
  reason field and no configurable reason list. Every accepted move is audited server-side as
  `opportunity.updated` with `before_data.stage` / `after_data.stage`; the board's audit trail
  reads those entries back from `GET /tenants/current/audit-logs?action=opportunity.updated`.
  Opportunities are not created or deleted from the board page — `POST /opportunities` and
  `DELETE /opportunities/{id}` exist in the API but no UI flow needs them yet (creation comes
  from replies/task flows).
- Opportunity detail (T37) notes: the page reads `GET /opportunities/{id}` and applies the same
  confirm/reason flow to stage changes as the board. The activity timeline combines
  `opportunity.created` / `opportunity.updated` audit entries (entity-filtered client-side —
  the audit endpoint filters by `action` only), the linked contact's replies (no `contact_id`
  list filter exists, so replies are list-fetched and filtered client-side), and tasks linked
  to the opportunity or contact. Sends and meetings are not observable in this API build (no
  messages endpoint; a meeting is the Meeting stage) and note edits are not audited, so the
  page omits those entries and says so. A notes-only PATCH is audited with an unchanged stage
  and produces no timeline entry.

### Dashboard, AI

| Endpoint | Purpose |
|---|---|
| `GET /dashboard/summary` | Counts for sends, replies, meetings, pipeline, tasks, caps, top campaigns |
| `POST /ai/draft` | Draft subject and body from a prompt plus campaign/contact context |

`DashboardSummary` includes `as_of` (date) and per-stage `pipeline` totals. Daily boundaries use the
tenant timezone; display it next to the date range.

Dashboard notes (T38):

- The endpoint accepts **no date-range or timezone parameter** — the all-time, 7-day, and today
  windows are computed server-side. The page presents those windows as-is (with the `as_of`
  date) and offers no selectable range.
- The summary has **no opt-out field**; the dashboard's Opt-outs card reads the live
  `/suppressions` total instead and says so on the card.
- Inbox health is not in the summary either — the panel counts the live `/email-accounts` list
  (connected vs needing attention, up to five rows) using the same health explanation as the
  mailboxes pages.
- `top_campaigns` is server-computed `CampaignPerformance` rows (`name`, `status`, `sent`,
  `replies`); an empty list shows an explicit empty state rather than fixture rows.
- "Delivered is not observable" (no provider confirmation) and "no open tracking" remain in the
  definitions panel, now on live data.

### Billing

| Endpoint | Purpose |
|---|---|
| `GET /billing/plans` | Public plan catalogue |
| `GET /billing/subscription` | Current subscription, trial, and grace-period state |
| `POST /billing/checkout` | Stripe Checkout session (`checkout_url`) |
| `POST /billing/plan-change` | Change an active paid subscription after usage-limit checks |
| `GET /billing/invoices` | Provider invoice history (owner/admin; cursor pagination) |
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
| Password reset | provisional `/auth/password/forgot`, `/auth/password/reset` |
| MFA and security | `/auth/mfa/*`, `/auth/sessions*`, `/auth/password/change` |
| Invitations | provisional `/invites` |
| Account settings | `/auth/me` (read), provisional profile/email paths, `/auth/password/change`, `/auth/sessions*` |
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
| Dashboard and reports | `/dashboard/summary`, `/campaigns/{id}/stats`, `/replies`, `/email-accounts`, `/suppressions`, `/opportunities/pipeline` |
| Billing | `/billing/plans`, `/billing/subscription`, `/billing/plan-change`, `/billing/invoices` |
| Workspace settings | `/tenants/current` |
| Team | `/tenants/current/members`, `/tenants/current/invitations`, `/invites/{token}` |
| Security and audit | `/tenants/current/audit-logs` |
| Sending controls | `/tenants/current/sending-pause`, `/email-accounts/{id}` (`is_paused`), `/campaigns/{id}/pause\|resume`, `/admin/sending-controls*` (platform staff only) |
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
- Password reset, profile editing, and email-change endpoints remain unavailable and are reported
  honestly in production. MFA, password changes, revocable sessions, invitations, and tenant audit
  search/export use server-backed endpoints.
- There is no `/segments` or `/tags` endpoint. The `segments` table exists in the database but no
  router exposes it, and contacts have no tags field. The lists page keeps segments in
  `reyvo.segments.v1` and tags in `reyvo.contactTags.v1`, evaluated client-side, and hands the pending
  campaign audience to the wizard through `reyvo.campaignAudience.v1` because campaign resolution only
  understands `status` and `company_id` from `segment.definition`.
- `SuppressionRead` has no tenant/platform flag even though the list query returns both tenant rows
  and platform rows (`tenant_id IS NULL`). The UI applies the design's override rules by reason
  (`complaint` and `legal` non-overridable) and cannot label a platform block as
  "blocked by platform".
- Sources under `ReyvoAPI/ReyvoApi/src/reyvo/*.py` were missing at capture time. The API was
  reachable from a running process, but restarting it may require restoring the sources.

## 7. API client utilities

The frontend uses a single `src/lib/api.js` module that provides:

### Error types
- `ApiError` — thrown on every failed API call with `status`, `code`, `details`, `fieldErrors`,
  `requestId`, and `idempotencyKey` properties.
- `ErrorCodes` — constant map: `NETWORK_ERROR`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`,
  `RATE_LIMIT`, `AUTH_ERROR`, `TOKEN_EXPIRED`, `SERVER_ERROR`.
- `PaginatedResponse` — wrapper for paginated `{ data, meta }` responses with `hasMore`,
  `page`, `pageSize`, and `total` getters.
- `PaginationOptions` — `DEFAULT_PAGE: 1`, `DEFAULT_PAGE_SIZE: 20`, `MAX_PAGE_SIZE: 100`.
- `RetryConfig` — `MAX_RETRIES: 3`, `BACKOFF_MS: 500`, `RETRYABLE_STATUSES: [408, 429, 500, 502, 503, 504]`.
- `isRetryableStatus(status)` / `isRetryableError(error)` — utility functions.

### Pagination helpers
- `api.list(path, options)` — fetches a paginated list. Accepts `page` and `pageSize` options.
- `api.search(path, filter, options)` — fetches a filtered list, appending query parameters from the
  filter object (e.g. `?search=foo&status=active`).

### Query cache
- `cacheQuery(key, fn)` — in-memory TTL cache (60s) with LRU eviction (max 50 entries).
- `api.invalidateCache(key)` — removes a specific cached entry.
- `api.clearCache()` — clears the entire cache.

### Idempotency
- `generateIdempotencyKey()` — generates a key of the form `idempotent-<timestamp>-<random>`.

### Session expiry
- `onSessionExpired(handler)` — registers a callback that fires when the session can no longer be
  refreshed; returns an unsubscribe function.
- `triggerSessionExpired()` — invokes the stored session expired handler (typically called when a
  401 cannot be recovered from via refresh).

### Exported constants and types
- `ApiError`, `ErrorCodes`, `PaginationOptions`, `RetryConfig`, `isRetryableStatus`,
  `isRetryableError`, `PaginatedResponse`, `onSessionExpired`
- `request`, `authedRequest`, `api`, `API_BASE`
