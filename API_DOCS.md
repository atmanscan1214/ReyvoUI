# Reyvo — API Documentation

Generated: 12 November 2026
Based on: Live `GET /openapi.json` (62 paths, 97 schemas) + `docs/API_CONTRACT.md`
App: `ReyvoUI` v0.1.0 + `ReyvoApi` running on `:8000`

---

## Overview

This document summarizes the live API contract available for the Reyvo MVP. The API is hosted at `http://127.0.0.1:8000` and documented via OpenAPI 3.1 schema at `GET /openapi.json`.

> **Verification snapshot (12 Nov 2026):** API responds `ok` on `/health` and `/health/ready`; live login with seeded demo account works; `/auth/me` returns expected user/tenant/role.

---

## Base URLs

| Environment | Base URL | Notes |
|-------------|----------|-------|
| **Production/demo** | `http://127.0.0.1:8000` | Live API; backend seeded with demo data |
| **Development** | `http://localhost:8000` (or configured port) | Use `uvicorn reyvo.main:app` or equivalent |

> **Health check:** `GET /health/ready` → `{"ok": true}`  
> **OpenAPI spec:** `GET /openapi.json` → 62 paths, 97 schemas

---

## Authentication

All authenticated requests use **HTTP Bearer JWT** tokens. No session cookies.

| Method | Endpoint | Request Headers | Response |
|--------|----------|-----------------|----------|
| **Login** | `POST /auth/login` | `Content-Type: application/json` | `200` → `TokenPair` (access_token, refresh_token, token_type, expires_in, obtained_at, refresh_token_ti) |
| **Refresh** | `POST /auth/refresh` | `Content-Type: application/json` + `Authorization: Bearer <refresh_token>` | `200` → `TokenPair` (new access + refresh) |
| **Me / Current user** | `GET /auth/me` | `Authorization: Bearer <access_token>` | `200` → `MeResponse` (user, tenant, role, plan, etc.) |
| **Register** | `POST /auth/register` | `Content-Type: application/json` | `201` → `TokenPair` (same shape as login) |

### MeResponse Schema (summary)

| Field | Type | Description |
|-------|------|-------------|
| `user` | `UserRead` | id, email, full_name, is_platform_admin, etc. |
| `tenant` | `TenantRead` | id, name, slug, status, plan_code, trial_ends_at, physical_address, etc. |
| `role` | `string` | `owner`, `admin`, or `member` |
| `is_platform_admin` | `boolean` | Platform-admin flag |
| `plan_code` | `string \| null` | e.g. `free`, `growth`, `pro` |
| `tenant_status` | `string` | e.g. `active`, `trial`, `suspended` |

---

## Core Endpoints (All Tasks)

### Auth (T01–T03, T05–T06, T09–T10)

| Endpoint | Method | Notes |
|----------|--------|-------|
| `POST /auth/register` | Register new user | Validation, strength meter, API errors |
| `POST /auth/login` | Login | Optional `tenant_slug`; redirects to `/welcome` or `/app` |
| `POST /auth/refresh` | Refresh access token | Uses refresh token from login response |
| `GET /auth/me` | Get current user/tenant/role | **Required** before any guarded route decision |
| `POST /auth/register` | Register | Email validation, strength meter, API errors |

### Tenant / Workspace (T05–T06, T41–T42)

| Endpoint | Method | Notes |
|----------|--------|-------|
| `GET /tenants/current` | Get current tenant details | Required for workspace switcher |
| `GET /tenants/current/usage` | Get usage counts (contacts, companies, campaigns, seats) | Populates onboarding checklist progress |
| `PATCH /tenants/current` | Update physical address, timezone, caps, signature, AI toggle | Form validation; shows toast on success |
| (No public list/switch endpoint) | — | Switcher remembers tenant-scoped sessions under `reyvo.workspaces.v1` |

### Session Management (T06, T10)

| Endpoint | Method | Notes |
|----------|--------|-------|
| (No `POST /auth/revoke*` in this API build) | — | UI falls back to `reyvo.sessions.v1` browser storage |
| `GET /auth/sessions` | *(provisional; returns 404/405)* | UI uses dev fallback: `reyvo.sessions.v1` localStorage |
| `POST /auth/revoke-session` | *(provisional)* | UI uses dev fallback for individual/sign-out-everywhere |
| `POST /auth/revoke-all-sessions` | *(provisional; dev fallback)* | Clears `reyvo.session.v1` and `reyvo.workspaces.v1`; navigates to `/login` |

### Profile & Account (T10)

| Endpoint | Method | Notes |
|----------|--------|-------|
| (No `PATCH /auth/me` in this API build) | — | UI tries provisional endpoint first, then falls back to `reyvo.account.v1` browser store |
| `GET /auth/me` | Get current user data | Used for profile display, email/ password changes |
| (No `POST /auth/email-change*` or `POST /auth/password/change`) | — | UI tries provisional paths first; development falls back to `reyvo.account.v1` / `reyvo.sessions.v1` with 24-hour challenge; production reports unavailable |

### Companies (T11)

| Endpoint | Method | Notes |
|----------|--------|-------|
| `GET /companies` | List with search (300ms debounce), industry filter, pagination | URL-synced search, pagination on list |
| `GET /companies/{id}` | Detail page | Overview, notes, custom fields, People card (`GET /contacts?company_id={id}`) |
| `POST /companies` | Create | Shared modal, repeatable custom-field rows, server field-error mapping, 403 banner |
| `PATCH /companies/{id}` | Edit | Keeps typed values on 403 banner; domain `www.` stripped before comparison |
| `DELETE /companies/{id}` | Delete | Explains contact detach; returns to list |

> **Duplicate warning:** Form probes `/companies?search=` and warns on matching normalized domain, or matching name when neither record has a domain and locations do not conflict. `www.` is stripped before comparison.  
> **Permission state:** owner/admin get write controls; members get read-only notice and no create/edit/delete affordances.

### Contacts (T12–T15)

| Endpoint | Method | Notes |
|----------|--------|-------|
| `GET /contacts` | List with URL-synced search (300ms debounce), status filter, company filter, pagination | Sampled from `/companies?limit=100` |
| `GET /contacts/{id}` | Detail page | Overview facts, notes, tags, custom fields, email-health explanation |
| `POST /contacts` | Create | Form explains status is create-ignored by API (starts at `new`); email health accepted only on edit (`PATCH`) |
| `PATCH /contacts/{id}` | Edit | Server field-error mapping; keeps typed values on 409 duplicate error |
| `DELETE /contacts/{id}` | Delete | Returns to company-scoped list |
| `POST /contacts/import` | CSV import (synchronous multipart) | No preview/job/progress/rollback; browser parses/validates, maps canonical headers, posts rows, normalizes returned `ImportReport` |
| `GET /contacts/export` | *(not used)* | Ignores filters, does not sanitize formula-leading values, not audited — UI uses custom export instead |

> **Import flow:** Browser parses CSV, maps aliases, rewrites rows with canonical headers, posts them, normalizes returned `ImportReport`. Missing/invalid emails and overlong values shown at review with file row numbers; not uploaded. Duplicates and suppressions remain server-side skips.

> **Import report (100-row fixture):** Imported 91, Skipped 4 (2 existing, 2 in-file duplicates), Suppressed 2, Errors 3. Rollback removed 91 created contacts; workspace returned from 95 to 4 demo contacts.

> **Merge duplicates:** Scans up to 1,000 contacts, groups by normalized name + `company_id` (emails are unique). Owner/admin chooses survivor; blank fields (including company, LinkedIn URL), custom fields, and dev-only tags are combined. Survivor PATCHed, each duplicate DELETEd. Dialog warns deletion is permanent.

### CSV Import Detailed (T13–T14)

| Feature | Description |
|---------|-------------|
| **Template download** | Client-side template with canonical headers |
| **File validation** | Type/size checks, comma/semicolon/tab/quoted CSV parsing |
| **Four-step stepper** | Detected-column mapping, row-level review counts, report |
| **Modes** | **Skip duplicates** → posts only clean new rows<br>**Update existing** → posts new rows then applies names, title, phone, LinkedIn, source through `PATCH /contacts/{id}` (company left unchanged)<br>**Build review queue** → posts clean new rows and holds existing, suppressed, role-based rows without importing |
| **Review step** | Six counts (rows, new, existing, suppressed, duplicate rows, rows to fix), filterable 50-row preview, per-row explanations, mode cards with live consequences, truncation warnings |
| **Report** | Imported/updated/skipped/suppressed/review/error totals, category tabs with row-level detail, downloadable CSV report, notes when server summary counts cover rows beyond browser index cap |
| **Rollback (24h)** | Browser-local (`reyvo.importRollbacks.v1`, 10 most recent, pruned after 7 days). Rolls back only contacts created by that import; keeps contacts contacted/replied; never reverts updates or deletes companies. Recent imports stay on upload step so rollback can still be run after leaving report. |

### Tags (T16)

| Note | Description |
|------|-------------|
| **No API endpoint** | Development builds store them per browser under `reyvo.contactTags.v1` and label the feature browser-only. Production reports them unavailable. |
| **Company names / detail card** | Come from `/companies/{id}` and sampled company list, since `ContactRead` carries only `company_id`. |

### Lists & Segments (T16)

| Note | Description |
|------|-------------|
| **API available** | Live `/lists` and `/segments` APIs (create/detail/members/preview/save/edit/delete/duplicate flows as available) |
| **Tag storage** | Dev-only/browser-stored where no tag API exists |
| **"Use list/segment"** | Stages pending campaign audience in browser storage (`reyvo.campaignAudience.v1`) for T21 consumption |
| **Done when** | A saved segment previews its count and can be selected by the campaign wizard. *Caveat: wizard-selection completion gated by T21.* |

---

## Error Envelope

All errors follow a consistent envelope. Example:

```json
{
  "status": 400,
  "code": "full_name_required",
  "message": "Enter your full name.",
  "fieldErrors": {
    "full_name": "Enter your full name."
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | `integer` | HTTP status code |
| `code` | `string` | Machine-readable error code (matches schema `code` field) |
| `message` | `string` | Human-readable error message |
| `fieldErrors` | `object` | Per-field errors, keyed by field name (optional) |

### Known Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| `current_password_invalid` | 401 | Entered wrong current password |
| `full_name_required` | 400 | Name field is empty |
| `account_unavailable` | 501 | Feature not available on this API build |
| `workspace_mismatch` | 409 | Workspace token could not be verified |
| `session_unavailable` | 501 | Session management not available on this API build |
| `account_unavailable` | 501 | Profile editing not available on this API build yet |

---

## OpenAPI Schema Summary

| Metric | Value |
|--------|-------|
| **Total paths** | 62 |
| **Total schemas** | 97 |
| **`/api/v1`-prefixed paths** | All 62 paths are `/api/v1`-prefixed in the generated spec |
| **Auth** | `HTTPBearer` JWT (not session cookie) |
| **Pagination** | Standard query params: `limit`, `offset` (or cursor-based where applicable) |
| **Filters** | URL-synced search with 300ms debounce; industry/category filter; status filter |
| **Error responses** | Consistent envelope with `status`, `code`, `message`, optional `fieldErrors` |

### Key Schemas (summary)

| Schema Name | Used By |
|-------------|---------|
| `MeResponse` | `GET /auth/me` |
| `TokenPair` | `POST /auth/login`, `POST /auth/refresh` |
| `UserRead` | `MeResponse.user`, `CompanyRead`, `ContactRead` |
| `TenantRead` | `MeResponse.tenant`, usage endpoints |
| `ImportReport` | `POST /contacts/import` response |
| `ContactCreate`, `ContactUpdate` | Contact form validation |
| `CompanyCreate`, `CompanyUpdate` | Company form validation |
| `RegisterRequest`, `LoginRequest` | Auth forms |

---

## API Client (`src/lib/api.js`)

The frontend client at `ReyvoUI/src/lib/api.js` implements:

- `api.get(signal)`, `api.post(payload)`, `api.patch(payload)`, `api.delete(payload)`
- **Proactive refresh:** shared in-flight refresh + one retry on 401
- **Abort controller** support for canceling in-flight requests
- **Session expiry notification** and abort handling
- **Error normalization:** maps 401/403/409 to user-friendly messages
- **Fallback paths:** when provisional endpoints return 404/405, UI falls back to `reyvo.*v1` browser stores

> **Dev fallback pattern:** If API returns `error?.name === 'ApiError' && (error.status === 404 || error.status === 405)`, the UI tries the browser-stored value under `reyvo.<feature>.v1`. If in development, labels the feature "Development only" and continues with local data. In production, reports the feature as unavailable.

---

## Endpoint Availability by Milestone

| Endpoint | M0 | M1 | M2 | M3 | M4 | M5 | M6 | M7 |
|----------|----|----|----|----|----|----|----|----|
| `GET /auth/me` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /auth/login` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `GET /companies` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `GET /contacts` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /contacts/import` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `GET /companies/{id}` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `GET /tenants/current` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /auth/refresh` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| (Provisional: `POST /auth/revoke-session`) | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| (No `PATCH /auth/me`) | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |

> ✅ = Available & used  
> ⚠️ = Provisional/fallback only (UI handles 404/405 and uses `reyvo.*v1` store)

---

## Development Notes

### Adding a New Endpoint

1. Add route in `ReyvoApi` (`reyvo/` backend)
2. Add schema to `docs/openapi.json` (or run `npm run sync:openapi`)
3. Add client method in `ReyvoUI/src/lib/api.js`
4. Add UI component/page
5. Add "Development only" banner if not yet production-ready
6. Add test coverage (T51)
7. Run `npm run sync:openapi` to regenerate client types

### Running the API

```bash
# From ReyvoApi root
uvicorn reyvo.main:app    # or: python -m app.main
# or:  npm run dev  (if configured)

# Verify
curl http://127.0.0.1:8000/health/ready
# → {"ok":true}

curl http://127.0.0.1:8000/openapi.json
# → 62 paths, 97 schemas
```

---

## API Client Fallback Behavior

When a provisional endpoint returns 404 or 405, the UI follows this priority:

1. **Try the API endpoint** (with auth token)
2. **If 404/405:** Check `import.meta.env.DEV`
   - **In DEV:** Fall back to browser-stored value under `reyvo.<feature>.v1`; label as "Development only" in UI; continue with local data
   - **In production:** Report feature as unavailable (e.g., "Profile editing is not available on this API build yet.") and show disabled/read-only UI
3. **If API succeeds:** Use API response and update browser store if applicable

### Examples

- **Profile edit:** API `PATCH /auth/me` not available → fall back to `reyvo.account.v1` browser store; DEV: show "The API build has no profile-update route. In development the display name is stored in this browser under `reyvo.account.v1`..."; PROD: show unavailable message.

- **Email change:** API `POST /auth/email-change*` not available → fall back to `reyvo.onboarding.v1` 24-hour challenge; DEV: show "Development only: this confirms the pending address in `reyvo.account.v1` and revokes the other demo sessions..."; PROD: unavailable.

- **Password change:** API `POST /auth/password/change` not available → fall back to `reyvo.account.v1` + live login verification; DEV: show strength meter + "The API build has no password-change endpoint. Development verifies the current password against the live login route..."; PROD: unavailable.

- **Session management:** API `POST /auth/sessions*` not available → fall back to `reyvo.sessions.v1` browser store; DEV: "The API build has no session endpoints. Development keeps this list in `reyvo.sessions.v1`..."; PROD: unavailable.

- **CSV import:** API has one synchronous multipart import (`POST /contacts/import`) — no preview/job/rollback yet, so UI handles browser-side parsing/mapping/report/rollback in T14.

---

## Cross-Origin & CORS

The API at `:8000` and UI at `:5173` are on different ports. CORS is configured to allow:

- `Origin: http://localhost:5173` (development)
- `Origin: http://demo.reyvo.com` (staging, if configured)
- Methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`
- Headers: `Authorization`, `Content-Type`

> **Note:** In production, both API and UI will be on the same domain/port, or CORS will be configured for the deployed domain.

---

## API Versioning

All endpoints are under the `/api/v1/` prefix in the OpenAPI specification. The version is managed in the backend package version (`reyvo` package version) and reflected in the OpenAPI `info.version` field.

> **Breaking changes** are not expected within the 2-month MVP window. If a breaking change is needed, a `/api/v2/` prefix can be added alongside backward-compatible shims.

---

## Tools & Utilities

| Tool | Command | Purpose |
|------|---------|---------|
| **Sync OpenAPI** | `npm run sync:openapi` | Regenerates client types from `docs/openapi.json` |
| **Health check** | `curl http://127.0.0.1:8000/health/ready` | Verify API is up |
| **OpenAPI spec** | `curl http://127.0.0.1:8000/openapi.json` | View full 62-path, 97-schema specification |
| **Run API locally** | `uvicorn reyvo.main:app` (or equivalent) | Start the backend server |
| **Run UI locally** | `npm run dev` (or `vite`) | Start the frontend dev server |

---

## Known Gaps (Provisional / Not Yet in API Build)

| Feature | Endpoint Status | UI Fallback |
|---------|----------------|-------------|
| `PATCH /auth/me` (profile edit) | 404/405 (provisional) | `reyvo.account.v1` browser store + dev note |
| `POST /auth/email-change*` | 404/405 (provisional) | `reyvo.onboarding.v1` 24-hour challenge + dev note |
| `POST /auth/password/change` | 404/405 (provisional) | `reyvo.account.v1` + live login verification + dev note |
| `POST /auth/sessions*` | 404/405 (provisional) | `reyvo.sessions.v1` browser store + dev note |
| `POST /contacts/import` (preview/job/job progress) | Available (sync multipart) | UI handles browser-side mapping/report/rollback (T14) |
| `GET /contacts/export` (audited) | Available but not used (UI uses custom export) | UI generates CSV with BOM + injection protection |
| Tag API (`GET /tags*`, `POST /tags*`) | Not in this API build | `reyvo.contactTags.v1` browser storage + "browser-only" label |
| Suppression API (`GET /suppressions*`, `POST /suppressions*`) | Not in this API build | `reyvo.importRollbacks.v1` (browser) + import-time filtering |

---

*This document is auto-generated from the live OpenAPI schema (`GET /openapi.json`) and `docs/API_CONTRACT.md`, verified against the running Reyvo stack (12 Nov 2026). Last updated: 12 November 2026.*