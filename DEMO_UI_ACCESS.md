# Reyvo — Demo UI Access Guide

Generated: 12 November 2026
Based on: `TASKS.md` v2 + verified live stack (12 Nov 2026)
Purpose: Show how to access each task/feature in the running application for client demos.

---

## Prerequisites for Demo

| Item | Detail |
|------|--------|
| **Live URL** | `http://localhost:5173` (ReyvoUI) |
| **API URL** | `http://127.0.0.1:8000` (ReyvoApi) |
| **Health check** | `GET /health/ready` → `ok` |
| **OpenAPI spec** | `GET /openapi.json` → 62 paths, 97 schemas |
| **Demo credentials** | `demo@reyvo.com` / `ReyvoDemo123!` |
| **Tenant slug** | `reyvo-demo-agency-dbfe26` |

> **Note:** The app restores baseline state automatically. Latest end state: 7 contacts, 3 companies, active sessions in `reyvo.sessions.v1` / `reyvo.workspaces.v1`.

---

## Authentication — Login Flow

All task access begins with login. Use the credentials above.

### Step 1: Open Login Page

| Method | URL |
|--------|-----|
| Browser | `http://localhost:5173/login` |
| Direct (with slug) | `http://localhost:5173/login?slug=reyvo-demo-agency-dbfe26` |

### Step 2: Enter Credentials

| Field | Value |
|-------|-------|
| Email | `demo@reyvo.com` |
| Password | `ReyvoDemo123!` |

### Step 3: Redirect

- After successful login → `/app` (main workspace)
- If workspace slug is prefilled → signs in to the demo agency tenant
- First-time login may open **Welcome** onboarding flow (5 steps)

### Step 4: Skip Welcome (if already completed)

- If onboarding already done, app lands directly on `/app` dashboard
- If onboarding not done, sees `/welcome` checklist (2 of 5 complete baseline)

---

## Task Navigation Index

Each task has a dedicated page in the app. Use the table below to navigate.

| Task | URL | Milestone | UI Entry Point | Status (12 Nov 2026) |
|------|-----|-----------|----------------|----------------------|
| **T01 — Auth transport** | N/A (checked in code/readme) | M0 | — | ✅ Done |
| **T02 — Backend/mock-first** | N/A | M0 | — | ✅ Done |
| **T03 — API contract** | N/A | M0 | — | ✅ Done |
| **T04 — App shell** | `/app` | M0 | Sidebar → navigation | ✅ Done |
| **T05 — Routing & guards** | `/app/*` | M0 | Breadcrumbs, top bar | ✅ Done |
| **T06 — Session/tenant context** | `/app/settings/account` → **Sessions** tab | M0 | Account → Sessions panel | ✅ Done |
| **T07 — Shared UI kit** | `/app/ui-kit` (dev-only) | M0 | Account menu → **Component kit** | ✅ Done |
| **T08 — Onboarding** | `/welcome` → `/welcome/address` | M0 | Welcome checklist → address form | ✅ Done |
| **T09 — Auth completion** | `/app/settings/security` | M0 | Security & MFA page | ✅ Done |
| **T10 — Account settings** | `/app/settings/account` | M0 | Account tab switcher (Profile/Email/Password/Sessions) | ✅ Done |
| **T11 — Companies** | `/app/companies` | M0 | Sidebar → **Leads · Companies** | ✅ Done |
| **T12 — Contacts** | `/app/contacts` | M0 | Sidebar → **Leads · Contacts** | ✅ Done |
| **T13 — CSV import** | `/app/imports` | M0 | Sidebar → **Imports** | ✅ Done |
| **T14 — CSV import full** | `/app/imports` (review step) | M0 | Upload → map → review → report | ✅ Done |
| **T15 — Export/bulk/merge** | `/app/contacts` (select rows) | M0 | Checkbox → bulk bar → Archive/Update/Merge | ✅ Done |
| **T16 — Lists/tags/segments** | `/app/lists` | M1 | Sidebar → **Lists & segments** | ✅ Done *(wizard selection gated by T21)* |
| **T17 — Suppression mgmt** | `/app/supplisions` *(if available)* | M1 | Pending — not yet implemented in demo |
| **T18 — Inbox list** | Pending (M2) | M2 | — | ⬜ Pending |
| **T19 — Inbox detail** | Pending (M2) | M2 | — | ⬜ Pending |
| **T20 — Campaign list** | Pending (M3) | M3 | — | ⬜ Pending |
| **T21 — Campaign wizard** | Pending (M3) | M3 | — | ⬜ Pending |
| **T25–T31** | Pending (M4–M5) | M4–M5 | — | ⬜ Pending |
| **T32–T53** | Pending (M5–M7) | M5–M7 | — | ⬜ Pending |

> **Key:** ✅ Done (verified in live stack) | ⬜ Pending (not yet implemented in demo) | M# = milestone number

---

## Milestone-Specific Navigation

### M0 — Demo & Foundation (Tasks T01–T16)

All core pages are accessible from the **sidebar** and **top bar**:

| Navigation | Destination |
|------------|-------------|
| **Sidebar** | ` /app/` (dashboard), `/app/companies`, `/app/contacts`, `/app/imports`, `/app/lists`, `/app/settings/account` |
| **Top bar** | `/app`, `/app/companies`, `/app/contacts`, `/app/imports` |
| **Account menu** (user dropdown) | `/app/settings/account`, `/app/settings/security`, `/welcome`, `/logout` |
| **Skip link** | `#app-main` (focus return on every page) |

**Key demo pages to show a client:**

1. **Login** → `http://localhost:5173/login`
2. **Welcome/onboarding** → `http://localhost:5173/welcome` (then `/welcome/address`)
3. **Companies list** → `http://localhost:5173/app/companies` (search, industry filter, create)
4. **Contacts list** → `http://localhost:5173/app/contacts` (search, status filter, company filter)
5. **Account settings** → `http://localhost:5173/app/settings/account` (Profile/Email/Password/Sessions tabs)
6. **Sessions / sign-out-everywhere** → Within Account → **Sessions** tab → **Sign out everywhere**
7. **UI kit gallery** → Account menu → **Component kit** → `/app/ui-kit`

### M1 — Audience Complete (Tasks T16–T17)

| Navigation | Destination |
|------------|-------------|
| **Sidebar** | `/app/lists` (lists, tags, segment builder) |
| **Segment builder** | Within `/app/lists` — create/ edit AND/OR rules, live count preview, save segment |

**Demo note:** Saved segments can preview counts and be staged for campaign selection, but full wizard selection requires **T21** (Campaign wizard).

### M2 — Inboxes (Tasks T18–T19)

*Not yet implemented in demo. When ready, expected at:*
- `/app/inboxes` — inbox list with health badges
- `/app/inboxes/:id` — inbox detail/configuration

### M3–M7 — Campaigns, Reporting, Admin

*Not yet in demo. Roadmap from T20 onward.*

---

## Key UI Flows for Demo

### Flow 1: Onboard → Companies → Contacts

1. `http://localhost:5173/login` → creds → `/app`
2. Click **Welcome** → complete address form → `/app`
3. Click **Leads · Companies** → search "Acme" → create new company
4. Click **Leads · Contacts** → create contact, assign to company
5. Verify email health badges, status tags

### Flow 2: Account → Sessions → Sign Out Everywhere

1. `http://localhost:5173/app/settings/account`
2. Click **Sessions** tab
3. Review active sessions (device icons, last active)
4. Click **Sign out everywhere** → confirm dialog
5. Observe navigation to `/login` and session/workspace clearance (confirmed in targeted recheck)

### Flow 3: Profile → Email → Password → Sessions

1. `http://localhost:5173/app/settings/account`
2. Click **Profile** tab → edit display name → save
3. Click **Email** tab → start email change (enter current password) → verify pending state
4. Click **Password** tab → change password (wrong then correct password) → success banner
5. Click **Sessions** tab → revoke one session → revoke other sessions → revoke all (sign out everywhere)

### Flow 4: CSV Import → Export → Merge

1. `http://localhost:5173/app/imports` → upload mixed CSV (valid + invalid emails + duplicates)
2. Review step → see 4 rows, 2 ready, 1 duplicate, 1 to fix
3. Import → 2 imported, 1 duplicate skipped, 1 not imported
4. Click **Export** (filtered view) → CSV with BOM, injection protection
5. Click **Merge duplicates** → select two contacts by name + company → survivor + delete

---

## Breakpoint / Responsive Testing

All pages should be verified at these viewport widths (F12 DevTools → Toggle device toolbar):

| Width | Purpose |
|-------|---------|
| **375 px** | iPhone SE / small mobile — check sidebar drawer, table scroll, stepper stack |
| **768 px** | iPad / small tablet — check filter bar wrapping, two-column layouts |
| **1024 px** | Laptop default — full UI, no horizontal overflow |
| **1440 px** | Desktop large — confirm no overflow, sidebars visible |

**Console check:** Open DevTools → Console. Expected: only expected 401/409 errors from provisional API endpoints. No unexpected errors.

---

## Demo Checklist (Per Session)

| ✅ Item | How to Verify |
|---------|---------------|
| Login with demo creds | `demo@reyvo.com` / `ReyvoDemo123!` → lands on `/app` |
| No horizontal overflow | Resize browser to 375/768/1024/1440 px → no horizontal scroll |
| Sessions tab works | Account → Sessions → Sign out others/all → navigates to `/login` |
| Sign out everywhere clears session | LocalStorage `reyvo.session.v1` → `null` after confirm |
| Profile name persists | Edit display name → reload page → name holds in header |
| CSV import review step | `/app/imports` → upload fixture CSV → review shows row-level counts |
| Export has BOM + injection protection | Export filtered view → open CSV → see `EF BB BF` prefix, `=`/`@` protected cells |
| No unexpected console errors | DevTools Console → filter by "error" → only expected 404/409 from provisional endpoints |

---

## Deprecated / Removed Pages

| Page | Reason |
|------|--------|
| `/verify-email` | Provisional endpoint; development fallback in `reyvo.onboarding.v1` |
| `/mfa/challenge` | MFA challenge flow; development-only in demo |
| `/forgot-password` / `/reset-password` | Provisional; `reyvo.passwordResets.v1` fallback |
| `/invite/:token` | Invitations flow; `reyvo.invites.v1` not yet in demo |

---

## Quick Access Shortcuts

| Action | URL (with login already) |
|--------|-------------------------|
| Dashboard | `/app` |
| Companies | `/app/companies` |
| Contacts | `/app/contacts` |
| Imports | `/app/imports` |
| Lists & segments | `/app/lists` |
| Account settings | `/app/settings/account` |
| Security & MFA | `/app/settings/security` |
| Welcome onboarding | `/welcome` |
| UI kit gallery | Account menu → **Component kit** |

---

## Known Limitations (Demo Stack)

| Limitation | Explanation |
|------------|-------------|
| **T16 wizard selection** | Saved segments can preview counts, but cannot be fully selected/consumed by campaign wizard until **T21** is implemented |
| **T17 suppression management** | Not yet implemented in demo UI |
| **T18–T20 inboxes/campaigns** | Roadmap items; not yet built |
| **T21–T53** | Future milestones; beyond current demo scope |
| **API provisional endpoints** | Some `/auth/sessions*`, `/auth/email-change*`, `/auth/password/change` return 404/405 by design; UI falls back to `reyvo.*v1` stores |
| **Read-only member role** | Demo tenant is owner; member role actions not testable without multi-tenant setup |

---

*This guide is based on the verified live stack (12 Nov 2026) and the `TASKS.md` backlog. Last updated: 12 November 2026.*