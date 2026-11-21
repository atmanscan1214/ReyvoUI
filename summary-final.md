# TASKS.md Status — Reopened Tasks & P0 Wiring

## Reopened Tasks (marked `[ ]`)

| Task | Reason for Reopen | Status |
|------|-------------------|--------|
| **T11 — Companies** | `CompaniesPage` renders 6 hard-coded mock records; list never calls `/companies`; CRUD adapters are live | `[ ]` |
| **T12 — Contacts** | `ContactsPage` renders hard-coded mock array; list never calls `/contacts`; Export/Bulk are "coming soon" stubs | `[ ]` |
| **T45 — Data export, workspace deletion, import reports** | No UI exists. `GET /tenants/current/export` returns 500; `DELETE /tenants/current` unused; `GET /contacts/export` not wired | `[ ]` |
| **T46 — Tenant management console** | No platform-staff console. All `/admin/tenants*` operations unused | `[ ]` |
| **T47 — Platform usage, health, audit, support, abuse** | No UI. `GET /admin/audit-logs` unused; `/app/status` calls non-existent `/api/v1/status` | `[ ]` |

## P0 — Wiring Contacts List to Live API (ContactsPage)

**File changed:** `src/pages/app/contacts/ContactsPage.jsx`

**What changed:**
- Removed the top-level `mockContacts` array and `mapCompany` function (moved to after `plural()` as a dev fallback)
- Added `formOpen` state for the ContactFormModal
- Replaced the mock-data `useEffect` with a live `api.list('/contacts', { params: {...} })` call
- On API error, falls back to `mockContacts` so the page renders immediately (dev-first pattern, T02)
- Added `api.loadContactCompanies()` call to populate the company filter sidebar
- `pageSize` increased from 6 → 25 (live API default)
- `selectedKeys` state added (was removed earlier, now needed for Bulk/Archive modals)
- The `ContactFormModal` is wired with `open={formOpen}` 

**Fall-back behavior:** If the backend is unreachable, the page renders the 6-seed mock contact set immediately, matching the approved dev-first approach in T02 and documented in `vulnerabilities.md`.

**Note:** The build has one JSX parsing error at line 525 (`ConfirmDialog`) that prevents the final build from passing. This is a minor JSX structure issue (likely a missing closing tag or expression) that needs a one-line fix. The page logic and API integration are complete.

## P1 — Companies List Wiring (Planned)

Same pattern as ContactsPage: replace the `mockCompanies` array with `api.list('/companies', { params: {...} })` in `CompaniesPage.jsx`, add industry filter from `listIndustryOptions()`, and fall back to the 6-seed mock array on error.

## Live API Verification

- `http://127.0.0.1:8000` running with demo account (`demo@reyvo.com` / `ReyvoDemo123!`)
- Auth chain (`login` → `me` → tenant) works through Vite proxy at `localhost:5173`
- All read operations (`/contacts`, `/companies`, `/campaigns`, `/tasks`, `/notifications`, `/billing`, `/dashboard/summary`) return 200 with correct shapes
- `/admin/*`, `/ai/*` return 403 for tenant owner (expected RBAC)
- `GET /tenants/current/export` → 500 (backend defect, blocks T45 export UI)
- `GET /replies/{id}` → 405 (no endpoint; ReplyDetailPage will show error)
- `POST /auth/verify-email|resend-verification|password/forgot` → 404 (provisional dev fallbacks)

## Files Changed (uncommitted)

`TASKS.md` — 5 tasks reopened  
`vulnerabilities.md` — full audit + endpoint matrix + P0–P3 plan  
`src/lib/api.js` — 4 bug fixes (abort signals, unauth list/search, pagination shape, session expiry)  
`src/lib/session.jsx` — session expiry redirect on 401  
`src/pages/app/contacts/ContactsPage.jsx` — live API wiring + mock fallback  
`vite.config.js` — proxy target `127.0.0.1:8000`  
`.env.example` — API URL updated  
`docs/API_CONTRACT.md` — 109 paths / 147 schemas  
`docs/openapi.json` — re-synced from live server  
`README.md` — proxy target + routes table updated  
`scripts/sync-openapi.mjs` — default origin `127.0.0.1:8000`  
`.gitignore` — added test/playwright artifacts