# Reyvo — Remaining Build Backlog

Source of truth: `ReyvoAPI/ReyvoApi/Reyvo_Detailed_Design_Document.md`
Last updated: 10 November 2026

This backlog covers the **in-product application** described in §5 of the design document. The
marketing site and auth entry pages already exist and are not repeated here.

## Working agreement

- Work **one task at a time**, top to bottom unless a dependency says otherwise.
- Each task ends with `npm run build`, a browser check at 375 / 768 / 1024 / 1440 px, and an updated
  checkbox in this file.
- Every screen needs loading, empty, error, and permission-denied states.
- Use mock fixtures until the backend sources are restored; do not hard-code tenant data in components.
- Mark the task `[x]` only after the "Done when" condition is met.

**Sizes:** `S` ≈ half a day · `M` ≈ 1–2 days · `L` ≈ 3–5 days.

## Current baseline (done)

- [x] Marketing home page, responsive header/footer, pricing, FAQ, security, CTA.
- [x] Registration page wired to `POST /auth/register`; validation, strength meter, API errors.
- [x] Login page with optional workspace slug.
- [x] Static welcome/setup checklist page.
- [x] Terms, privacy, 404.
- [x] Page titles, baseline accessibility, `robots.txt`.
- [x] Production build and Lighthouse 100/100/100 on home and registration.

## Decisions and blockers

- [x] **T01 — Confirm auth transport and endpoint names** · S · deps: none · §5.1.2, §9.2
  - Confirmed against live `GET /openapi.json`: `HTTPBearer` JWT, not a session cookie.
  - Confirmed `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`.
  - Confirmed request/response schemas (`RegisterRequest`, `LoginRequest`, `TokenPair`, `MeResponse`)
    match `src/lib/api.js` and `src/lib/auth.js`.
  - Done when: the decision is recorded in the README and the API client matches it.

- [x] **T02 — Restore backend sources or approve mock-first development** · blocker · §11.2
  - Backend is running on `:8000`; `/health` and `/health/ready` both return `ok`.
  - Live login with the seeded demo account works; `/auth/me` returns the expected user/tenant/role.
  - Login was also exercised through the real UI: `/login` → `/welcome`, real tenant rendered.
  - Done when: the API responds on `:8000` **or** mock-first is approved and T03 starts.

## Foundation

- [x] **T03 — API contract map and client baseline** · M · deps: T01, T02 · §9
  - Captured the live OpenAPI 3.1 schema (62 paths, 97 schemas) to `docs/openapi.json`.
  - Documented auth, error envelope, pagination, filters, enums, endpoint map, and known gaps in
    `docs/API_CONTRACT.md`; added `npm run sync:openapi`.
  - Hardened `src/lib/api.js`: proactive refresh, refresh-on-401 with a shared in-flight refresh and
    one retry, session expiry notification, abort handling, and `api.get/post/patch/delete`.
  - Verified in the browser: a corrupted access token triggers one `/auth/refresh` then a `200`
    retry; a rejected refresh clears the session and lands on `/login` with an explanatory notice.
  - Done when: the contract doc exists and the client handles auth refresh and the error envelope.

- [x] **T04 — Authenticated app shell** · M · deps: T03 · §5.8.3, §5.11
  - Built `src/pages/app/`: sticky dark sidebar, top bar with breadcrumb, notification and account
    menus, mobile drawer with scrim, skip link, and profile loading/error states.
  - Added a placeholder route for every area in `APP_AREAS`, plus an in-app not-found screen, so no
    navigation is a dead end. Role-restricted links follow `/auth/me`.
  - Signing in and the welcome CTA now open `/app`.
  - Verified at 375 / 768 / 1024 / 1440 px with headless Chrome; Lighthouse accessibility 100 on
    `/app`; keyboard-checked the skip link, drawer Escape/focus return, and menu toggles.
  - Done when: the shell renders at all four breakpoints with focus, keyboard, and skip-link support.

- [x] **T05 — App routing, guards, and role placeholders** · M · deps: T04 · §4.2
  - Added `AreaGuard` around every restricted route, so direct URL visits are blocked as well as
    hidden links. Billing is owner-only; workspace settings, team, and security are owner/admin;
    platform admin requires the `is_platform_admin` flag.
  - Added shared pending, unverified, and access-denied states. The denied screen shows the current
    workspace, role, and the exact requirement, plus a route back to the dashboard.
  - The guard waits for `/auth/me` before deciding, and offers a retry when the profile request fails
    instead of wrongly claiming the area is restricted.
  - Verified with mocked profiles: signed-out redirects to `/login`; member and admin are blocked
    from the right areas while shared routes still open; owner reaches billing and settings but not
    platform admin; the platform-admin flag opens `/app/admin` without bypassing tenant roles;
    profile failure recovers after retry. Responsive at 375 / 768 / 1024 / 1440 px; Lighthouse 100
    for accessibility, best practices, and SEO; no console errors.
  - Done when: direct visits to each route resolve correctly for signed-out, member, admin, and owner.

- [x] **T06 — Session, tenant context, refresh, workspace switcher** · M · deps: T01, T05 · §5.1.3
  - Added a single `SessionProvider` for the signed-in app. It owns the session, `/auth/me` profile,
    `/tenants/current` plan and tenant state, role, platform-admin flag, retry actions, workspace
    switching, and sign-out. Guards and the shell read the same snapshot through `useSession()`.
  - Added a sidebar workspace switcher with the current workspace, plan badge, trial-end note,
    workspace list, a direct settings link, and **Add another workspace**. The sign-in page reopens in
    add-workspace mode with the email prefilled and the slug field visible.
  - The API has no tenant-list or switch endpoint, so the switcher remembers tenant-scoped sessions
    this device has signed into under `reyvo.workspaces.v1`. A saved token is activated directly;
    an expired one is revalidated through `/auth/refresh` and verified against the selected tenant.
  - A switch updates the shell, navigation permissions, route guard, and plan without a reload.
    Sign-out clears every remembered workspace token and returns to `/login`.
  - Verified with the live demo workspace and a mocked second workspace (admin role):
    the tenant name, role, navigation, billing denial, and plan changed without a reload, and
    switching back restored owner permissions. Profile and plan failures show retry controls that
    recover. Add-workspace sign-in returns to the shell and keeps only the current workspace saved.
    Responsive at 375 / 768 / 1024 / 1440 px with the switcher inside the mobile drawer; no horizontal
    overflow; Lighthouse 100 for accessibility, best practices, and SEO; no console errors.
  - Done when: a tenant switch updates the shell, data queries, and permissions without a reload.

- [x] **T07 — Shared UI kit** · L · deps: T04
  - Built `src/components/ui/` with every required primitive: `PageHeader`, `DataTable`, `FilterBar` +
    `FilterSelect`, `Pagination`, `Modal`, `Drawer`, `ConfirmDialog`, `Tabs`, `Stepper`, `ToastProvider` /
    `useToast`, `UploadDropzone`, `Badge` / `StatusBadge`, `Skeleton`, `EmptyState`, `ErrorPanel`, plus a
    shared `Button`. Components are generic: callers pass columns, rows, filters, steps, tabs, and file
    handlers; no tenant or page-specific data lives in the kit.
  - `DataTable` covers loading skeletons, empty and error states with request ids, sortable headers
    (`aria-sort`), select-all with an indeterminate state, and keyboard row activation. `useDialogFocus`
    locks scroll, traps Tab, closes on Escape, and returns focus to the trigger for modals, drawers, and
    confirmations. `ConfirmDialog` starts focus on Cancel.
  - `ToastProvider` is mounted once at the route root; toasts stack, auto-dismiss, use `status` / `alert`
    roles, and can be dismissed by hand. `Tabs` supports arrow / Home / End keys. `Stepper` exposes
    completed and current steps only. `UploadDropzone` validates type and size before calling back with
    accepted and rejected files.
  - The token-based `ui.css` includes responsive filter/pagination wrapping, an internal table scroller,
    a stepper that stacks at 640 px, mobile dialogs, and reduced-motion rules. Status colours are shared
    through `statusTone()` so the same state reads the same in tables, filters, and details.
  - Added a dev-only live gallery at `/app/ui-kit` (account menu → **Component kit**) that exercises every
    component with real state: sort/select/filter/pagination, loading/empty/error, tabs and stepper,
    dialogs with focus return, toasts, and upload accept/reject. The route is excluded from production.
  - Verified at 375 / 768 / 1024 / 1440 px with headless Chrome: no horizontal overflow, the table scrolls
    inside its wrapper, filter and pagination controls stay inside the viewport, and the stepper stacks
    at 375. Keyboard-checked tabs, drawer/modal/confirm Escape and focus return. Lighthouse 100 for
    accessibility, best practices, and SEO on both `/app/ui-kit` and `/app`; no console errors;
    `npm run build` passes.
  - Done when: leads, campaigns, inbox, and admin screens can be built without page-specific one-offs.

- [x] **T08 — Onboarding completion** · M · deps: T04 · §5.1.1
  - Email-verification page and resend; physical-address form; interactive checklist linking to each step.
  - Added a shared `WelcomeLayout` and `SessionProvider` route group for `/welcome`,
    `/welcome/address`, and `/verify-email`, so all three steps share sign-out and
    back-to-checklist actions.
  - Checklist state comes from the API: `/auth/me` (email verification), `/tenants/current`
    (`physical_address`), `/tenants/current/usage` (contacts and campaigns), and `/email-accounts`
    (connected mailboxes). Rows show required, checking, and done states; a progress bar and
    readiness banner move from “Two required steps” to “One required step”, then “Ready to import”,
    then “Ready to send”. Every row links to its real screen.
  - The mailing-address form validates street, city, postal code, and country, sends
    `PATCH /tenants/current`, applies the response through `updateTenant()`, shows a toast, and
    returns to the checklist. Invalid submits focus the first bad field; API field errors map back
    into the form.
  - `VerifyEmailPage` auto-verifies a `?token=`, distinguishes success, expired, and invalid links,
    offers resend with a 30-second cooldown, and explains the signed-out state.
  - The API has no verification or resend route. `api.verifyEmail()` and
    `api.resendVerification()` are provisional paths; development falls back to a single-use,
    24-hour challenge in `reyvo.onboarding.v1` with a clearly labelled “Development only” link,
    while production reports the feature as unavailable instead of faking verification. Documented
    in `README.md` and `docs/API_CONTRACT.md`.
  - The app sidebar setup widget now reads the same live model through `useSetupData()` and shows
    `2 of 5 done` instead of a hardcoded count.
  - Verified with the demo workspace: saved and updated the address, completed the dev verification,
    and watched `/welcome` move to “You’re ready to import contacts” (2 of 5) with the sidebar
    matching. Checked signed-out states on all three routes, invalid and successful token states,
    and empty-field validation. No horizontal overflow at 375 / 768 / 1024 / 1440 px; Lighthouse 100
    for accessibility, best practices, and SEO on `/welcome`, `/welcome/address`, `/verify-email`,
    and `/app`; no unexpected console errors (the provisional verification requests log 404s by
    design); `npm run build` passes.
  - Done when: a new workspace can move from "just registered" to "ready to import" in the UI.

- [ ] **T09 — Auth completion: reset, MFA, invite acceptance** · M · deps: T01 · §5.1.2
  - Forgot/reset password, MFA enroll/challenge, invite accept page.
  - Done when: each flow has success, expired-token, and invalid-token states.

- [ ] **T10 — Account settings** · M · deps: T06 · §5.11
  - Profile, email change, password change, active sessions, sign-out-all.
  - Done when: changes persist through the API and security actions require confirmation.

## Leads and audience

- [ ] **T11 — Companies** · L · deps: T07 · §5.2.1
  - List, filters, detail, create/edit/delete, notes, custom fields.
  - Done when: empty, loading, duplicate-warning, and permission states are covered.

- [ ] **T12 — Contacts** · L · deps: T07 · §5.2.1
  - List, filters, detail, create/edit/delete, statuses, tags, last contacted/replied.
  - Done when: a contact can be created manually and viewed with company context.

- [ ] **T13 — CSV import: upload and column mapping** · L · deps: T12 · §5.2.2
  - Template download, file validation, upload, detected columns, mapping to contact/company fields.
  - Done when: a valid CSV reaches a review step and an invalid file shows row-level errors.

- [ ] **T14 — CSV import: validation, duplicates, progress, report, rollback** · L · deps: T13 · §5.2.2
  - Preview counts, skip/update/review choices, suppression warnings, background progress, report, 24h rollback.
  - Done when: a 100-row fixture can be imported and its skipped/suppressed/error rows are explained.

- [ ] **T15 — Export, bulk actions, duplicate merge** · M · deps: T12 · §5.2.2, §5.2.3
  - Export the filtered view with CSV-injection protection; bulk archive/update; merge duplicates.
  - Done when: export and merge are audited and reflected in the contact list.

- [ ] **T16 — Lists, tags, and segment builder** · L · deps: T12 · §5.2.4
  - Static lists, tags, AND/OR segment rules, operators, live count preview, save/edit.
  - Done when: a saved segment previews its count and can be selected by the campaign wizard.

- [ ] **T17 — Suppression management** · M · deps: T12 · §5.2.5
  - Tenant suppression list, reasons, manual block, remove with owner override rules.
  - Done when: suppressed contacts are visibly excluded at import and campaign audience steps.

## Inboxes

- [ ] **T18 — Inbox list, health, and OAuth connect** · M · deps: T07 · §5.3
  - Provider choice, OAuth start/callback states, health badges, last check, reconnect prompts.
  - Done when: connected, needs-reauth, degraded, and disconnected accounts all render correctly.

- [ ] **T19 — Inbox detail and configuration** · M · deps: T18 · §5.3.5
  - From name, reply-to, signature, timezone, daily cap, warm-up, test send, disconnect.
  - Done when: caps are validated against plan/provider limits and test-send feedback is visible.

## Campaigns

- [ ] **T20 — Campaign list** · M · deps: T07 · §5.4.1
  - Lifecycle badges, filters, empty state, create/duplicate/archive actions.
  - Done when: every lifecycle state has a clear next action.

- [ ] **T21 — Campaign wizard: audience and mailboxes** · M · deps: T16, T18 · §5.4.2
  - Wizard shell, list/segment audience, included/excluded counts, healthy-inbox selection.
  - Done when: the estimated send count updates with exclusions and mailbox caps.

- [ ] **T22 — Sequence editor and merge fields** · L · deps: T21 · §5.4.3, §5.4.4
  - 1–8 steps, business-day delays, subject/body, rich text + plain-text fallback, merge-field picker.
  - Done when: unknown fields block progress and fallbacks are visible in preview.

- [ ] **T23 — Schedule step** · M · deps: T22 · §5.4.5
  - Sending days, local window, timezone strategy, holiday skip, next-send preview.
  - Done when: the preview shows a correct local send time across DST-safe IANA zones.

- [ ] **T24 — Review, preflight, preview, and test send** · L · deps: T23 · §5.4.9
  - Preflight checklist with blocking explanations, per-contact preview, test-send action.
  - Done when: launch is blocked with a specific reason until every preflight item passes.

- [ ] **T25 — Approval workflow** · M · deps: T24 · §5.4.1
  - Submit, approve, reject with reason, return to draft, immutable approved copy view.
  - Done when: role restrictions and audit entries are visible for each transition.

- [ ] **T26 — Campaign detail, controls, and stats** · L · deps: T25 · §5.4.7, §5.8.3
  - Launch, pause, resume, archive, duplicate; progress, per-step stats, replies, bounces, opt-outs, errors.
  - Done when: pause takes effect through the API and the UI shows held vs sent messages.

## AI drafting

- [ ] **T27 — AI generate and regenerate panel** · M · deps: T22 · §5.5
  - Generate subject/body, instruction input, used fields, assumptions, warnings, banned-claim errors.
  - Done when: failures and refusals offer retry and manual writing without losing the draft.

- [ ] **T28 — AI approval, quota, and toggle** · M · deps: T27 · §5.5.5, §5.5.6
  - Edit-then-approve, reject-with-reason, usage meter, 80% warning, tenant AI on/off.
  - Done when: AI copy cannot launch without the configured approval mode.

## Sending controls

- [ ] **T29 — Sending health page** · M · deps: T19 · §5.3.4, §5.6.8
  - Per-inbox cap usage, warm-up, bounce/error rate, last successful send, auth status, reason codes.
  - Done when: every health state explains what happened and what the user should do.

- [ ] **T30 — Pause, resume, and kill-switch controls** · M · deps: T26 · §5.6.12
  - Tenant, campaign, and inbox pause/resume; admin global kill switch; confirmation for resume.
  - Done when: controls are audited and the affected scope is obvious before confirming.

- [ ] **T31 — Usage and quota warnings** · S · deps: T06 · §5.9.2
  - Usage vs limits for sends, contacts, seats, inboxes, AI; banners at 80% and 100%.
  - Done when: the limit that blocks an action is named and linked to the upgrade path.

## Replies, tasks, and pipeline

- [ ] **T32 — Unified inbox list and filters** · L · deps: T07 · §5.7.4
  - List/thread views; campaign, inbox, category, assignee, date, and status filters.
  - Done when: unmatched replies and test replies are clearly separated.

- [ ] **T33 — Conversation view and actions** · L · deps: T32 · §5.7.4
  - Thread, contact/company context, campaign, assign, note, task, suppress, stop sequence, open in provider.
  - Done when: HTML is sanitized and remote content is blocked by default.

- [ ] **T34 — Classification and assignment** · M · deps: T33 · §5.7.3
  - Category badges, confidence, needs-review, manual correction, assignee.
  - Done when: corrections are saved and reflected in reporting.

- [ ] **T35 — Tasks** · M · deps: T33 · §5.7.5
  - List, create, assign, due date, priority, status, contact/opportunity links.
  - Done when: overdue and completed tasks are distinguishable.

- [ ] **T36 — Pipeline board and table** · L · deps: T33 · §5.7.5
  - Fixed stages, drag-and-drop, value/owner/source/aging, won/lost reason.
  - Done when: stage changes are confirmed, audited, and recoverable from an error.

- [ ] **T37 — Opportunity detail and activity timeline** · M · deps: T36 · §5.7.5
  - Company, contact, stage, value, owner, close date, notes; combined send/reply/task/meeting timeline.
  - Done when: the timeline is chronological and links back to source records.

## Reporting

- [ ] **T38 — Dashboard overview** · L · deps: T12, T26 · §5.8.3
  - Sends, replies, positive replies, meetings, opt-outs, active campaigns, inbox health.
  - Done when: date range and timezone are explicit and "delivered" is labelled not observable.

- [ ] **T39 — Campaign, inbox, and pipeline reports + export** · L · deps: T38 · §5.8.3, §5.8.4
  - Per-step performance, audience/exclusions, progress, errors; inbox health; pipeline by stage/owner.
  - Done when: CSV export uses the same injection protection as contact export.

## Billing

- [ ] **T40 — Subscription, usage, checkout, and portal** · L · deps: T06 · §5.10
  - Current plan, seats, usage, upgrade/downgrade, Checkout, Customer Portal, invoices.
  - Done when: past-due, grace-period, canceled, and downgrade-blocked states are all represented.

## Settings and notifications

- [ ] **T41 — Workspace settings and sending defaults** · M · deps: T06 · §5.11
  - Agency name, physical address, timezone, default window, caps, signature, retention, AI toggle.
  - Done when: the physical address is enforced before campaign launch.

- [ ] **T42 — Team management** · M · deps: T06 · §5.11
  - Invite, resend, revoke, change role, remove; last-owner protection.
  - Done when: every role change is audited and the last owner cannot be removed or demoted.

- [ ] **T43 — Security settings and audit log** · M · deps: T10 · §5.9.4
  - Password, MFA, active sessions, tenant audit search and export.
  - Done when: support/admin actions are visible to the tenant owner.

- [ ] **T44 — Notifications** · M · deps: T04 · §5.7.6
  - Bell dropdown, unread state, per-user preferences, tenant defaults, digest opt-in.
  - Done when: no email notification includes full message content.

- [ ] **T45 — Data export, workspace deletion, import reports** · M · deps: T14 · §5.11
  - Export workspace, 30-day delete confirmation, download completed import reports.
  - Done when: destructive actions require owner confirmation and offer an export first.

## Platform admin

- [ ] **T46 — Tenant management console** · L · deps: T07 · §5.9.1
  - Search by name/slug/owner/plan/status; tenant profile, usage, inboxes, campaigns, health, MRR.
  - Done when: suspend, reactivate, trial extension, plan change, credit, MFA reset, force logout, flags work.

- [ ] **T47 — Platform usage, health, audit, support, abuse** · L · deps: T46 · §5.9.2–§5.9.6
  - Usage and limits; queue/provider/API health; audit search; time-boxed support access; abuse signals and kill switches.
  - Done when: support access requires a reason, expires automatically, and is visible to the tenant.

## Public pages

- [ ] **T48 — Unsubscribe page** · M · deps: T03 · §5.12
  - Signed-token validation, agency name, GET confirmation, idempotent POST, expired/invalid states.
  - Done when: the page works signed out and records the opt-out exactly once.

- [ ] **T49 — Status page and security.txt** · S · deps: none · §5.12
  - Public status page (Phase 2 style placeholder is fine) and `/.well-known/security.txt`.
  - Done when: both are reachable and linked from the footer where appropriate.

## Cross-cutting quality

- [ ] **T50 — API client and data/form layer** · M · deps: T03
  - Pagination, filtering, retries, idempotency keys, abort handling, query cache, form state.
  - Done when: no screen hand-rolls fetch or duplicates error parsing.

- [ ] **T51 — Test setup and critical E2E flows** · L · deps: T03
  - Unit tests for validation/API mapping; E2E for register → onboarding → import → campaign → reply.
  - Done when: `npm test` and the E2E suite run in CI.

- [ ] **T52 — Accessibility and responsive audit** · M · deps: T04–T47
  - Keyboard, focus, contrast, landmarks, labels, table semantics, mobile tables/kanban.
  - Done when: app routes pass Lighthouse accessibility and manual keyboard checks.

- [ ] **T53 — Documentation, env, and seed data** · S · deps: T03
  - Update README with app routes, mock mode, env vars, seed fixtures, and test commands.
  - Done when: a new developer can run and demo the app from a clean checkout.

## Recommended next steps

1. ~~**T01** — auth transport and endpoint names~~ ✅
2. ~~**T02** — backend restore / mock-first approval~~ ✅
3. ~~**T03** — API contract map and client baseline~~ ✅
4. ~~**T04** — app shell~~ ✅
5. **T05** — routing and role guards (the signed-out redirect already exists).
6. **T06** — session/tenant context and workspace switcher.

After those, follow the milestone order: onboarding → leads/import → inboxes → campaigns → sending →
replies/pipeline → reporting → billing/admin → hardening.
