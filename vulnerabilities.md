# Reyvo UI — API Integration Audit & Code Review

**Generated:** 21 November 2026
**Live API tested:** `http://127.0.0.1:8000`
**Scope:** every endpoint exposed by the running backend vs. every endpoint referenced in `src/`
**Build:** `npm run build` ✓ (170 modules, 344 ms) · **Unit tests:** 5/5 ✓

---

## 1. Verdict

**No — not every API endpoint is integrated.** The app connects to most of the API, but the
live server now exposes **109 paths / 137 operations / 147 schemas**, while the frontend wires up
**~101 operations (74%)**. The remaining **36 operations are not called at all**. Most are real
missing screens, not backend limitations.

Three of those gaps are serious because the corresponding tasks are marked `[x]` in `TASKS.md`:

| Task | Marked | Reality |
|------|--------|---------|
| **T11 / T12 — Companies & Contacts list** | `[x]` | Both list pages render **hard-coded mock arrays** and never call `/companies` or `/contacts`. The CRUD adapters and detail pages are live; only the list views are demos. |
| **T45 — Workspace export & deletion** | `[x]` | No UI at all. `GET /tenants/current/export` and `DELETE /tenants/current` are never called. (The export endpoint also returns **500** on the live server.) |
| **T46 — Tenant management console** | `[x]` | No UI at all. All nine `/admin/tenants*` operations are unused; only `/app/admin` sending controls exists. |
| **T47 — Platform usage/health/audit** | `[x]` | No UI at all. `GET /admin/audit-logs` is unused, and `/app/status` calls a non-existent `/api/v1/status`. |

The README already says demo screens should stay unchecked until they consume live data. That
rule was not followed for T11, T12, T45, T46 and T47.

---

## 2. How this was verified

1. Pulled the live schema from `GET http://127.0.0.1:8000/openapi.json` → 109 paths, 137 operations.
2. Parsed every `api.get/post/postForm/patch/put/delete/download/list/search`,
   `request(...)` and `authedRequest(...)` call in `src/**/*.{js,jsx}` (134 call sites) and
   normalised template-literal paths to `{param}`.
3. Diffed the two sets in both directions, including method-level gaps.
4. Logged in to the live API with the seeded demo account
   (`demo@reyvo.com` / `ReyvoDemo123!`, tenant `reyvo-demo-agency-261b02`) and probed read-only
   endpoints to confirm status codes and response shapes.
5. Exercised the full chain through the Vite dev proxy:
   `POST /auth/login` → `GET /auth/me` → `GET /dashboard/summary` all succeeded via
   `http://localhost:5173/api/v1/...`.

**Live smoke-test results (demo owner):**

- `GET /health` → 200, `GET /health/ready` → 200
- `POST /auth/login` → 200, `GET /auth/me` → 200
- All tenant, contact, company, campaign, list, suppression, reply, task, opportunity,
  notification, billing and dashboard reads → 200 with the expected shapes
  (`{ items, total, limit, offset }` for collections; plain arrays for `/lists`, `/email-accounts`,
  `/tenants/current/members`, `/billing/plans`, `/opportunities/pipeline`)
- `/admin/*` and `/ai/chat|knowledge` → **403** for a tenant owner (platform-staff only — expected)
- `POST /ai/draft` → **503** `service_unavailable` (AI provider not configured)
- `GET /tenants/current/export` → **500** `internal_error` ← backend defect
- `GET /replies/{id}` → **405** ← endpoint does not exist
- `PATCH /auth/me` → **405**; `POST /auth/verify-email|resend-verification|password/forgot` → **404**

---

## 3. Endpoint integration matrix

Legend: ✅ called from `src/` · ❌ not called · ⚠️ called but the server rejects it

### admin

| Method | Path | Frontend |
|---|---|---|
| GET | `/admin/audit-logs` | ❌ not called |
| GET | `/admin/sending-controls` | ✅ called |
| POST | `/admin/sending-controls/kill-switch` | ✅ called |
| GET | `/admin/tenants` | ❌ not called |
| DELETE | `/admin/tenants/{tenant_id}` | ❌ not called |
| PATCH | `/admin/tenants/{tenant_id}` | ❌ not called |
| PATCH | `/admin/tenants/{tenant_id}/apply-credit` | ❌ not called |
| POST | `/admin/tenants/{tenant_id}/force-logout` | ❌ not called |
| PATCH | `/admin/tenants/{tenant_id}/plan-change` | ❌ not called |
| POST | `/admin/tenants/{tenant_id}/reset-mfa` | ❌ not called |
| PATCH | `/admin/tenants/{tenant_id}/suspend` | ❌ not called |
| PATCH | `/admin/tenants/{tenant_id}/trial-extend` | ❌ not called |

### ai

| Method | Path | Frontend |
|---|---|---|
| POST | `/ai/chat` | ❌ not called |
| GET | `/ai/conversations` | ❌ not called |
| GET | `/ai/conversations/{conversation_id}` | ❌ not called |
| DELETE | `/ai/conversations/{conversation_id}` | ❌ not called |
| POST | `/ai/draft` | ✅ called |
| POST | `/ai/knowledge/reindex` | ❌ not called |
| POST | `/ai/knowledge/search` | ❌ not called |
| GET | `/ai/knowledge/status` | ❌ not called |

### auth

| Method | Path | Frontend |
|---|---|---|
| POST | `/auth/login` | ✅ called |
| GET | `/auth/me` | ✅ called |
| POST | `/auth/register` | ✅ called |
| POST | `/auth/refresh` | ✅ called |
| POST | `/auth/password/change` | ✅ called |
| GET | `/auth/mfa/status` | ✅ called |
| POST | `/auth/mfa/setup` | ✅ called |
| POST | `/auth/mfa/enroll` | ✅ called |
| POST | `/auth/mfa/enroll/cancel` | ✅ called |
| POST | `/auth/mfa/verify` | ✅ called |
| POST | `/auth/mfa/disable` | ✅ called |
| POST | `/auth/mfa/challenge` | ✅ called |
| GET | `/auth/sessions` | ✅ called |
| DELETE | `/auth/sessions/{session_id}` | ✅ called |
| POST | `/auth/sessions/revoke-all` | ✅ called |
| GET | `/auth/sso/authorize` | ❌ not called |
| GET | `/auth/sso/callback` | ❌ not called |
| POST | `/auth/sso/callback` | ❌ not called |
| POST | `/auth/verify-email` | ⚠️ 404 (provisional fallback) |
| POST | `/auth/resend-verification` | ⚠️ 404 (provisional fallback) |
| POST | `/auth/password/forgot` | ⚠️ 404 (provisional fallback) |
| POST | `/auth/password/reset` | ⚠️ 404 (provisional fallback) |
| POST | `/auth/email-change` | ⚠️ 404 (provisional fallback) |
| POST | `/auth/email-change/confirm` | ⚠️ 404 (provisional fallback) |
| PATCH | `/auth/me` | ⚠️ 405 (provisional fallback) |

### billing

| Method | Path | Frontend |
|---|---|---|
| GET | `/billing/plans` | ✅ called |
| GET | `/billing/subscription` | ✅ called |
| GET | `/billing/invoices` | ✅ called |
| POST | `/billing/checkout` | ✅ called |
| POST | `/billing/plan-change` | ✅ called |
| POST | `/billing/portal` | ✅ called |

### campaigns

| Method | Path | Frontend |
|---|---|---|
| GET | `/campaigns` | ✅ called |
| POST | `/campaigns` | ✅ called |
| GET | `/campaigns/{campaign_id}` | ✅ called |
| PATCH | `/campaigns/{campaign_id}` | ❌ not called |
| DELETE | `/campaigns/{campaign_id}` | ✅ called |
| POST | `/campaigns/{campaign_id}/submit` | ✅ called |
| POST | `/campaigns/{campaign_id}/approve` | ✅ called |
| POST | `/campaigns/{campaign_id}/reject` | ✅ called |
| POST | `/campaigns/{campaign_id}/steps/{step_order}/approve` | ❌ not called |
| POST | `/campaigns/{campaign_id}/steps/{step_order}/reject` | ❌ not called |
| POST | `/campaigns/{campaign_id}/launch` | ✅ called |
| POST | `/campaigns/{campaign_id}/pause` | ✅ called |
| POST | `/campaigns/{campaign_id}/resume` | ✅ called |
| POST | `/campaigns/{campaign_id}/complete` | ❌ not called |
| POST | `/campaigns/{campaign_id}/archive` | ✅ called |
| GET | `/campaigns/{campaign_id}/preflight` | ✅ called |
| POST | `/campaigns/{campaign_id}/preview` | ✅ called |
| GET | `/campaigns/{campaign_id}/stats` | ✅ called |
| GET | `/campaigns/{campaign_id}/enrollments` | ✅ called |

### companies

| Method | Path | Frontend |
|---|---|---|
| GET | `/companies` | ✅ called (adapter only — list page is mock) |
| POST | `/companies` | ✅ called |
| GET | `/companies/{company_id}` | ✅ called |
| PATCH | `/companies/{company_id}` | ✅ called |
| DELETE | `/companies/{company_id}` | ✅ called |

### contacts

| Method | Path | Frontend |
|---|---|---|
| GET | `/contacts` | ✅ called (adapter only — list page is mock) |
| POST | `/contacts` | ✅ called |
| GET | `/contacts/{contact_id}` | ✅ called |
| PATCH | `/contacts/{contact_id}` | ✅ called |
| DELETE | `/contacts/{contact_id}` | ✅ called |
| POST | `/contacts/import` | ✅ called |
| GET | `/contacts/export` | ❌ not called |

### dashboard / email-accounts / health

| Method | Path | Frontend |
|---|---|---|
| GET | `/dashboard/summary` | ✅ called |
| GET | `/email-accounts` | ✅ called |
| POST | `/email-accounts/oauth/{provider}/start` | ✅ called |
| GET | `/email-accounts/oauth/{provider}/callback` | ❌ not called (provider redirects server-side) |
| POST | `/email-accounts/smtp` | ❌ not called |
| PATCH | `/email-accounts/{account_id}` | ✅ called |
| DELETE | `/email-accounts/{account_id}` | ✅ called |
| POST | `/email-accounts/{account_id}/test` | ✅ called |
| GET | `/health` | ❌ not called |
| GET | `/health/ready` | ❌ not called |

### invites / lists / notifications

| Method | Path | Frontend |
|---|---|---|
| GET | `/invites/{token}` | ✅ called |
| POST | `/invites/{token}/accept` | ✅ called |
| GET | `/lists` | ✅ called |
| POST | `/lists` | ✅ called |
| DELETE | `/lists/{list_id}` | ✅ called |
| GET | `/lists/{list_id}/contacts` | ✅ called |
| POST | `/lists/{list_id}/contacts` | ✅ called |
| DELETE | `/lists/{list_id}/contacts/{contact_id}` | ✅ called |
| GET | `/notifications` | ✅ called |
| GET | `/notifications/unread-count` | ✅ called |
| POST | `/notifications/{notification_id}/read` | ✅ called |
| POST | `/notifications/read-all` | ✅ called |
| DELETE | `/notifications/{notification_id}` | ❌ not called |
| GET | `/notifications/preferences` | ✅ called |
| PUT | `/notifications/preferences` | ✅ called |
| GET | `/notifications/defaults` | ✅ called |
| PUT | `/notifications/defaults` | ✅ called |

### opportunities / replies / suppressions / tasks

| Method | Path | Frontend |
|---|---|---|
| GET | `/opportunities` | ✅ called |
| POST | `/opportunities` | ✅ called |
| GET | `/opportunities/pipeline` | ✅ called |
| GET | `/opportunities/{opportunity_id}` | ✅ called |
| PATCH | `/opportunities/{opportunity_id}` | ✅ called |
| DELETE | `/opportunities/{opportunity_id}` | ✅ called |
| GET | `/replies` | ✅ called |
| PATCH | `/replies/{reply_id}` | ✅ called |
| GET | `/replies/{reply_id}` | ⚠️ 405 (does not exist; frontend calls it) |
| GET | `/suppressions` | ✅ called |
| POST | `/suppressions` | ✅ called |
| DELETE | `/suppressions/{suppression_id}` | ✅ called |
| GET | `/tasks` | ✅ called |
| POST | `/tasks` | ✅ called |
| PATCH | `/tasks/{task_id}` | ✅ called |

### tenants

| Method | Path | Frontend |
|---|---|---|
| GET | `/tenants/current` | ✅ called |
| PATCH | `/tenants/current` | ✅ called |
| DELETE | `/tenants/current` | ❌ not called |
| POST | `/tenants/current/sending-pause` | ✅ called |
| GET | `/tenants/current/members` | ✅ called |
| PATCH | `/tenants/current/members/{membership_id}` | ✅ called |
| DELETE | `/tenants/current/members/{membership_id}` | ✅ called |
| GET | `/tenants/current/invitations` | ✅ called |
| POST | `/tenants/current/invitations` | ✅ called |
| POST | `/tenants/current/invitations/{invitation_id}/resend` | ✅ called |
| DELETE | `/tenants/current/invitations/{invitation_id}` | ✅ called |
| GET | `/tenants/current/usage` | ✅ called |
| GET | `/tenants/current/audit-logs` | ✅ called |
| GET | `/tenants/current/audit-logs/export` | ✅ called |
| GET | `/tenants/current/export` | ❌ not called (server also returns 500) |
| GET | `/tenants/current/sso` | ❌ not called |
| PATCH | `/tenants/current/sso` | ❌ not called |

### public / webhooks

| Method | Path | Frontend |
|---|---|---|
| GET | `/u/{token}` | ✅ called |
| POST | `/u/{token}` | ✅ called |
| POST | `/webhooks/email` | ❌ not called (server-to-server) |
| POST | `/webhooks/stripe` | ❌ not called (server-to-server) |

---

## 4. Frontend calls with no server endpoint

| Method | Path | Where | Status |
|---|---|---|---|
| POST | `/auth/verify-email` | `lib/api.js` | 404 — dev fallback documented |
| POST | `/auth/resend-verification` | `lib/api.js` | 404 — dev fallback documented |
| POST | `/auth/password/forgot` | `lib/api.js` | 404 — dev fallback documented |
| POST | `/auth/password/reset` | `lib/api.js` | 404 — dev fallback documented |
| POST | `/auth/email-change` | `lib/api.js` | 404 — dev fallback documented |
| POST | `/auth/email-change/confirm` | `lib/api.js` | 404 — dev fallback documented |
| PATCH | `/auth/me` | `lib/api.js` | 405 — dev fallback documented |
| GET | `/replies/{reply_id}` | `lib/replies.js` | 405 — **no fallback; reply detail pages will break** |

`/replies/{id}` is the only one of these without an explicit fallback: `ReplyDetailPage` calls
`api.get('/replies/:id')`, the server answers **405**, and the page shows its generic error state
instead of the reply.

---

## 5. Confirmed code defects (fixed in this pass)

These were real bugs in `src/lib/api.js`, not backend gaps:

| # | Defect | Impact | Fix |
|---|--------|--------|-----|
| 1 | **Abort signals were silently dropped.** `signal: { ...signal, ...new AbortController().signal }?.signal` always evaluated to `undefined`. | Every `controller.abort()` on unmount was a no-op; stale responses could overwrite fresh state. | Pass `signal` straight to `fetch`. |
| 2 | **`api.list()` and `api.search()` bypassed auth.** They called `request()` instead of `authedRequest()`, so they never attached the bearer token. | Any screen adopting the helpers would instantly 401. | Rewired both to `authedRequest()`; `api.list` now maps `page` → live `limit`/`offset`. |
| 3 | **Pagination shape was wrong.** `PaginatedResponse` expected `{ data, meta }`; the live API returns `{ items, total, limit, offset }`. | `api.list()` would have returned an empty wrapper. | Added live-shape mapping (kept `{ data, meta }` support). |
| 4 | **Expired sessions never signed the user out.** `triggerSessionExpired()` was never called, so 401s left the shell stuck in `loading`. | Dead session = blank app until manual reload. | `authedRequest` now fires the session-expired handler on 401; the handler clears stored sessions and redirects to `/login`. |

Verified after the fix: `npm run build` ✓ 344 ms, `npx vitest run` 5/5 ✓.

### Remaining (not fixed — needs a product decision)

- `cacheQuery`, `queryCache`, `api.invalidateCache`, `api.clearCache` are **dead code**: nothing
  calls them. Either adopt them in list screens or remove them.
- `authedRequest` still has a no-op "proactive refresh" block (comment: *"For now, proceed with
  current token"*). The API does expose `POST /auth/refresh`; it is only used at login.
- No retry/backoff is implemented even though `RetryConfig`, `isRetryableStatus()` and
  `isRetryableError()` are exported. They are unused.
- `generateIdempotencyKey()` is exported but `request()` uses its own private copy; the exported
  one is unused.
- `STATUS_MESSAGES[401]` says "Your email or password is incorrect" — wrong for an expired token.
  Now partially masked by the session-expired redirect.

---

## 6. Backend defects found in the live run

| # | Endpoint | Observed | Impact |
|---|----------|----------|--------|
| 1 | `GET /tenants/current/export` | **500** `internal_error` | Blocks T45 workspace export even if the UI is built. Needs backend fix. |
| 2 | `GET /replies/{reply_id}` | **405** Method Not Allowed | Frontend calls it; reply detail cannot deep-link reliably. |
| 3 | `PATCH /auth/me` | **405** | Profile editing only works through the dev fallback. |
| 4 | `POST /auth/verify-email`, `/auth/resend-verification`, `/auth/password/forgot`, `/auth/password/reset` | **404** | Email verification and password reset are browser-local in dev. |
| 5 | `POST /ai/draft` | **503** `service_unavailable` | AI drafting is unavailable until the provider key is configured (handled by the UI). |
| 6 | `/admin/*`, `/ai/chat`, `/ai/knowledge/*` | **403** for tenant owner | Expected RBAC, but it means a platform-staff account is required to exercise T46/T47. |

---

## 7. Documentation drift

| Item | Was | Now |
|------|-----|-----|
| `docs/openapi.json` | 79 paths / 114 schemas | **Synced to 109 paths / 147 schemas** (`npm run sync:openapi`) |
| `API_DOCS.md` | Says 62 paths | Stale — regenerate or delete |
| `README.md` | Claims demo screens are "flagged in `TASKS.md` and the routes table" | Routes table has no demo flags; `TASKS.md` marks T11/T12/T45/T46/T47 `[x]` |
| Dev proxy | `http://localhost:8000` | Changed to `http://127.0.0.1:8000` (matches the running API; avoids Windows `::1` resolution) |
| `scripts/sync-openapi.mjs` | Defaults to `localhost:8000` | Defaults to `127.0.0.1:8000` |

---

## 8. Prioritised remediation plan

### P0 — correct the record and fix broken flows

1. **Reopen T11, T12** — wire `ContactsPage` and `CompaniesPage` to the existing
   `lib/contacts.js` / `lib/companies.js` adapters (list, search, filters, pagination).
   Libraries are already built; only the two pages are mock.
2. **Reopen T45** — add workspace export + 30-day deletion to `WorkspaceSettingsPage`;
   block export until the backend 500 on `/tenants/current/export` is fixed.
3. **Reopen T46 / T47** — build the platform-staff console and `/admin/audit-logs` view, or
   explicitly descope them in `TASKS.md`.
4. **Fix `/replies/{id}` handling** — either add the backend endpoint or have `ReplyDetailPage`
   resolve the reply from the list response (frontend-only workaround).

### P1 — endpoints that already work but are unused

5. `GET /contacts/export` — the Contacts export button says *"coming soon"*; point it at the
   endpoint (`api.download('/contacts/export?...')`).
6. `DELETE /notifications/{id}` — add per-notification dismiss in the bell menu / notifications page.
7. `POST /campaigns/{id}/complete` — add the "Mark complete" action on campaign detail.
8. `PATCH /campaigns/{id}` — add edit-after-create (currently only create/duplicate).
9. `POST /campaigns/{id}/steps/{order}/approve|reject` — per-step approval in the approval workflow.
10. `POST /email-accounts/smtp` — add SMTP mailbox connect alongside OAuth.

### P2 — larger feature areas

11. SSO: `GET /auth/sso/authorize`, `/auth/sso/callback`, `GET/PATCH /tenants/current/sso`.
12. AI assistant: `/ai/chat`, `/ai/conversations*`, `/ai/knowledge/*` (needs a platform-staff
    account; `/ai/chat` returns 403 for tenant owners).
13. Health/status: point `/status` at `GET /health` + `GET /health/ready` instead of the
    non-existent `/api/v1/status`.

### P3 — cleanup

14. Remove or adopt the unused cache/retry/idempotency helpers in `api.js`.
15. Refresh `API_DOCS.md` (or replace it with a pointer to `docs/openapi.json`).
16. Add an integration test that fails when a live endpoint has no frontend call site — the diff
    script used for this audit can become `scripts/api-coverage.mjs`.

---

## 9. Summary

- **137 live operations; 101 integrated; 36 not wired.** 5 of the 36 are server-to-server/ops
  endpoints that should stay unwired (2 webhooks, 2 health probes, 1 OAuth callback).
- **31 user-facing operations are missing**, concentrated in five areas: platform admin (T46/T47),
  workspace export/delete (T45), AI assistant, SSO, and campaign editing/step approval.
- **Two core list pages are still mock** (Contacts, Companies) despite their tasks being checked.
- **The live smoke test otherwise passes**: auth, tenant, contacts, companies, campaigns, lists,
  suppressions, replies, tasks, opportunities, notifications, billing and dashboard all return
  correct shapes through the Vite proxy.
- **Four API-client bugs were found and fixed** (abort signals, unauthenticated `api.list/search`,
  pagination shape, session expiry), and the schema snapshot was re-synced to 109 paths.
