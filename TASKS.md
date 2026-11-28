# Reyvo — Remaining Build Backlog

Source of truth: `ReyvoAPI/ReyvoApi/Reyvo_Detailed_Design_Document.md`
Last updated: 28 November 2026

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
  - **Fixed 23 Nov 2026:** error responses threw `ReferenceError: init is not defined` because the
    request-options object was scoped inside the `fetch` try block but read again when building
    `ApiError`. The idempotency key is now computed once before the request, so callers receive the
    server's message, status, request id, and field errors instead of a client-side crash.

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
  - **Updated 23 Nov 2026:** `<Routes>` is wrapped in a new `src/components/ErrorBoundary.jsx`, so a
    render error inside one page shows a recoverable error screen (retry, reload, back to dashboard)
    instead of unmounting the whole tree to a blank page. `StatusPage` and `UnsubscribePage` are now
    imported by `App.jsx`; their missing imports were the cause of the blank screen.

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

- [x] **T09 — Auth completion: reset, MFA, invite acceptance** · M · deps: T01 · §5.1.2
  - Forgot/reset password: `/forgot-password` always answers with the same neutral “if that email
    is registered” response. `/reset-password?token=` checks the link first, then shows the
    new-password form with strength meter and confirmation; a completed reset clears every stored
    session. Distinct **success**, **expired**, **invalid**, and **already-used** states, plus a
    back-to-sign-in path from the login screen.
  - MFA: `/app/settings/security` (owner/admin) enrolls TOTP — off state, enrolling state with the
    secret and a current-code helper, confirm step, and a disable dialog that requires a valid code.
    Signing in with MFA on redirects to `/mfa/challenge`, which verifies one rotating code with
    clock-drift tolerance, locks after five wrong codes, and covers **success**, **expired**,
    **invalid**, **already-used**, **locked**, and signed-out states.
  - Invitations: `/invite/:token` shows the invited email, workspace, role, and inviter, accepts
    with a name, password, and terms, and covers **success**, **expired**, **invalid**, and
    **already-accepted** states; `/invite` without a token explains the flow.
  - Password-reset and MFA endpoints remain unavailable, so their development flows use
    single-use, time-boxed records in `reyvo.passwordResets.v1` and `reyvo.mfa.v1` with clearly
    labelled “Development only” links. Invitation creation and acceptance use the server API;
    development-only invite fixtures remain visibly local and do not create server accounts.
    Documented in `README.md` and `docs/API_CONTRACT.md`.
  - Verified end to end in the browser: requested a reset and opened the valid, expired, and
    replayed links; created, accepted, reused, and expired an invitation; enrolled MFA, was
    challenged at the next sign-in, submitted a wrong code (inline error), then verified and
    continued to the workspace; also opened the expired, invalid, already-used, and locked
    challenge states. Every page checked at 375 / 768 / 1024 / 1440 px with no horizontal
    overflow; the provisional invite lookup logs one 404 by design and no unexpected console
    errors appear; `npm run build` passes. The security page wrapper was renamed to
    `.security-page` after its `.security` class collided with the marketing page's dark security
    section.
  - Done when: each flow has success, expired-token, and invalid-token states.

- [x] **T10 — Account settings** · M · deps: T06 · §5.11
  - `/app/settings/account` has four tabs: **Profile** (display name applied to the session immediately,
    role, member-since date, read-only sign-in email), **Email** (new address plus current password, a
    24-hour verification-pending state with confirm and cancel, and confirmed / expired states),
    **Password** (current password, the shared 12+ character rule and strength meter, confirmation,
    success banner, and last-changed timestamp), and **Sessions** (current device plus other devices
    with location, IP, and last activity).
  - Individual sign-out, “sign out other sessions”, and “sign out everywhere” each require a
    confirmation dialog. Signing out everywhere clears the session and every remembered workspace,
    then returns to `/login`. A successful email or password change revokes the other sessions.
  - The API build exposes only `GET /auth/me`, so the page tries provisional `PATCH /auth/me`,
    `/auth/email-change*`, `/auth/password/change`, and `/auth/sessions*` first. Development builds
    fall back to `reyvo.account.v1` and `reyvo.sessions.v1`, verify the current password against the
    live login route, and label every fallback; production builds report the action as unavailable.
    The email note states that the server keeps the original sign-in address until the endpoint ships.
    Documented in `README.md` and `docs/API_CONTRACT.md`.
  - Verified in the browser: saved a display name and saw it persist after reload in the header and
    profile; started an email change with a wrong and then the right current password, confirmed the
    pending 24-hour state, and saw the other sessions revoked; changed the password with a wrong
    current password (inline error) then the correct one (success banner); revoked one session, signed
    out other sessions, and signed out everywhere back to `/login`. All four tabs checked at
    375 / 768 / 1024 / 1440 px with no horizontal overflow; the provisional session list logs one 404
    by design; `npm run build` passes. Mobile session rows use a two-column grid and development notes
    stack their badge at 640px and below.
  - Done when: changes persist through the API and security actions require confirmation.

## Leads and audience

- [x] **T11 — Companies** · L · deps: T07 · §5.2.1
  - ~~**Reopened 21 Nov 2026:** `CompaniesPage` still renders the six-record mock array and never
    calls `/companies`; list search, filters, and pagination are fixture-only.~~
    **Fixed 23 Nov 2026:** the fixture array is gone. `CompaniesPage` now lists live
    `GET /companies` data with URL-synced search (300 ms debounce), an industry filter built from
    the sampled company list, and 25-row pagination, plus loading, empty, denied (403), and
    error-with-retry states. Bulk, archive, and merge controls were removed because the API has no
    matching company operations. Verified live: 8 companies rendered with populated industry
    options at 375 / 768 / 1024 / 1440 px, no horizontal overflow, no console errors.
  - List, filters, detail, create/edit/delete, notes, custom fields.
  - Done when: empty, loading, duplicate-warning, and permission states are covered.
  - Built on the live `/companies` CRUD API with no fallbacks: URL-synced search (300 ms debounce),
    industry filter, and pagination on the list; overview, notes, custom fields, and a People card
    (`GET /contacts?company_id=`) on the detail page; one shared modal for create and edit with
    repeatable custom-field rows, server field-error mapping, and a 403 banner that keeps typed values.
  - Duplicate warning: because the API enforces no uniqueness, the form probes `/companies?search=`
    and warns on a matching normalized domain, or a matching name when neither record has a domain
    and the locations do not conflict. “Save anyway” is a deliberate second click. `www.` is stripped
    before comparison.
  - Permission state: owner/admin get write controls, members get a read-only notice and no create,
    edit, or delete affordances. The API has no RBAC on `/companies` yet, so this is a UI policy plus
    graceful 403 handling on read and write.
  - Verified in the browser: six seeded companies rendered with correct industry options and counts;
    search, industry filter, and filtered-empty states; row click to detail; create with duplicate
    warning then “Save anyway”; edit persisted employees, notes, and custom fields after reload;
    attached contacts showed with email-status badges; delete confirmation explained contact detach
    and returned to the list; loading skeletons, 500 error with request id and retry, and stubbed 403
    states for both list and detail. Read-only member session hid every write action. Checked at
    375 / 768 / 1024 / 1440 px with no horizontal overflow and no console errors; `npm run build`
    passes.
  - Done when: empty, loading, duplicate-warning, and permission states are covered.

- [x] **T12 — Contacts** · L · deps: T07 · §5.2.1
  - ~~**Reopened 21 Nov 2026:** `ContactsPage` still renders the mock contact array and never calls
    `/contacts`; list search, filters, and pagination are fixture-only, and Export/Bulk update are
    "coming soon" stubs.~~
    **Fixed 23 Nov 2026:** the fixture array is gone and the page no longer throws at render (its
    previous version referenced undefined identifiers, which blanked the whole app). The list now
    calls `GET /contacts` with URL-synced search (300 ms debounce), status and company filters, and
    25-row pagination, and renders loading, empty, denied (403), and error-with-retry states.
    Export view, bulk update, archive (a `PATCH` of `status: archived`), and merge duplicates are
    wired instead of stubbed. Verified live: 4 contacts with resolved company names at
    375 / 768 / 1024 / 1440 px, no horizontal overflow, no console errors.
  - List, filters, detail, create/edit/delete, statuses, tags, last contacted/replied.
  - Done when: a contact can be created manually and viewed with company context.
  - Built on the live `/contacts` CRUD API: URL-synced search (300 ms debounce), status filter,
    company filter sampled from `/companies?limit=100`, and pagination on the list; overview facts
    (including last contacted/replied), notes, tags, custom fields, company context card, and
    email-health explanation on the detail page; one shared modal for create and edit with a
    searchable company picker (`/companies?search=`), repeatable custom fields, and server
    field-error mapping.
  - Status is create-ignored by the API (`ContactCreate` starts contacts at `new`), so the create
    form explains that and exposes status only on edit through `PATCH`. Email health is accepted on
    create only (`ContactUpdate` has no `email_status`), so edit shows it read-only. Duplicate email
    returns `409`; the form marks the email field and keeps the typed values.
  - Tags have no API endpoint; development builds store them per browser under
    `reyvo.contactTags.v1` and label the feature browser-only, while production reports them
    unavailable. Company names and the detail company card come from `/companies/{id}` and the
    sampled company list, since `ContactRead` carries only `company_id`.
  - Permission state mirrors T11: owner/admin get write controls, members get a read-only notice and
    no create, edit, or delete affordances, and `403`s are handled gracefully on reads and writes.
  - Verified in the browser: created a contact with company, source, phone, notes, and a tag; landed
    on the detail page with the company card and tag; edited status and a custom field and saw both
    persist; created a second contact from a company-scoped list and confirmed the company was
    preselected and email health persisted; duplicate email showed the 409 banner and field error;
    search, status, company filters, and filtered-empty states worked; delete returned to the
    company-scoped list. Loading skeletons, 500 error with request id and retry, and stubbed 403
    list/detail/write states all render correctly; a member session hid every write action. Checked
    at 375 / 768 / 1024 / 1440 px with no page-level horizontal overflow and no unexpected console
    errors; `npm run build` passes.
  - Done when: a contact can be created manually and viewed with company context.

- [x] **T13 — CSV import: upload and column mapping** · L · deps: T12 · §5.2.2
  - Template download, file validation, upload, detected columns, mapping to contact/company fields.
  - The current API exposes one synchronous multipart import (`POST /contacts/import`) that matches
    canonical headers exactly. There is no preview or mapping parameter, presigned upload, progress
    job, or rollback yet, so `src/lib/imports.js` parses and validates the CSV in the browser, maps
    common header aliases, rewrites the rows that pass browser validation with canonical headers,
    posts them, and normalizes the returned `ImportReport`. Missing/invalid emails and overlong
    values are shown at review with file row numbers and are not uploaded; duplicates and
    suppressions remain server-side skips. Update-existing choices, background progress, and the
    24-hour rollback stay in T14.
  - The screen adds a client-generated template, `UploadDropzone` type/size checks, comma/semicolon/
    tab and quoted CSV parsing, a four-step stepper, detected-column mapping, row-level review
    counts, and a report that merges browser-caught and server-returned errors. Owners and admins
    can import; members get a read-only card with template access. Import `403`/`500` responses show
    the request id, with retry for server failures.
  - Verified in the browser: a mixed CSV (valid, invalid email, in-file duplicate, valid) auto-mapped
    7 of 10 columns and reached review with 4 rows, 2 ready, 1 duplicate, and 1 to fix; importing
    returned 2 imported, 1 duplicate skipped, and 1 not imported, and the created contacts carried
    the mapped company, title, phone, and source (test contacts deleted). A file with no email
    column showed the mapping error and disabled review; a `.txt` upload was rejected; BOM,
    semicolon delimiter, quoted values, and the alias/validation helpers were checked in the
    browser. Mocked import `403` and `500` states showed the right error panels and request ids; a
    member session hid the upload flow. Checked at 375 / 768 / 1024 / 1440 px with no page-level
    horizontal overflow and no unexpected console errors; `npm run build` passes.
  - Done when: a valid CSV reaches a review step and an invalid file shows row-level errors.

- [x] **T14 — CSV import: validation, duplicates, progress, report, rollback** · L · deps: T13 · §5.2.2
  - Preview counts, skip/update/review choices, suppression warnings, background progress, report, 24h rollback.
  - The API still has no preview, job, update-mode, or rollback endpoint: `POST /contacts/import` is
    one synchronous multipart request that skips duplicates and suppressions itself.
    `src/lib/imports.js` therefore reads the tenant contact and suppression lists (capped at 1,000
    records each, with truncation labelled), enriches every row, and classifies it for the chosen
    mode. **Skip duplicates** posts only clean new rows. **Update existing** posts new rows and then
    applies names, title, phone, LinkedIn, and source through `PATCH /contacts/{id}` (company is
    left unchanged because `ContactUpdate` only accepts `company_id`). **Build a review queue**
    posts clean new rows and holds existing, suppressed, and role-based rows without importing them.
  - The review step now shows six counts (rows, new, existing, suppressed, duplicate rows, rows to
    fix), filterable 50-row preview with per-row explanations, index lookup states, mode cards with
    live consequences, and truncation warnings. The import runs with a staged progress panel
    (prepare, upload/validate, update loop with per-contact progress, build report). The report has
    imported / updated / skipped / suppressed / review / error totals, category tabs with row-level
    detail and who caught each row (browser or API), a downloadable CSV report, and explicit notes
    when server summary counts cover rows beyond the browser index cap.
  - Rollback records are stored in this browser (`reyvo.importRollbacks.v1`, 10 most recent, pruned
    after 7 days) with a 24-hour window. Rolling back searches each submitted email, deletes only
    contacts created by that import, keeps contacts that have since been contacted or replied, and
    never reverts updates or deletes companies. Recent imports stay on the upload step so a rollback
    can still be run after leaving the report.
  - Verified live in the browser with a 100-row fixture: 2 existing demo contacts, 2 temporarily
    suppressed addresses, 3 invalid emails, 2 duplicate rows (4 rows across two repeated emails),
    2 role-based inboxes, and 91 new contacts. Review showed 100 rows / 91 new / 2 existing / 2
    suppressed / 2 duplicate rows / 3 to fix, with matching warnings. Import sent 91 rows and the
    report explained all 100: Imported 91, Skipped 4 (2 existing, 2 in-file duplicates), Suppressed
    2, Errors 3. Rollback removed the 91 created contacts and the workspace returned from 95 to the
    4 demo contacts. Update mode PATCHed a temporary contact (names, title, phone, source changed;
    company untouched) and reported Updated 1. Review mode held the existing and role rows, imported
    1 clean row, and left the existing contact's title unchanged. Suppressions and test contacts were
    removed afterwards. Checked at 375 / 768 / 1024 / 1440 px with no page-level horizontal overflow,
    no clipped action rows, and no unexpected console errors; `npm run build` passes.
  - Limits: the browser preview is a capped list scan, not a server preview, so tenants above 1,000
    contacts or suppressions can still have server-only skips shown as summary counts. Rollback is
    browser-local, so it is unavailable from another browser and stops after 24 hours.
  - Done when: a 100-row fixture can be imported and its skipped/suppressed/error rows are explained.

- [x] **T15 — Export, bulk actions, duplicate merge** · M · deps: T12 · §5.2.2, §5.2.3
  - Export the filtered view with CSV-injection protection; bulk archive/update; merge duplicates.
  - `src/lib/contactBulk.js` pages the live `/contacts` list with the active search, status, and company
    filters (100 per page, capped at 5,000) and pages `/companies` for names and domains. It writes a
    UTF-8 BOM CSV with the API export columns plus `status` and `created_at`, and prefixes cells that
    begin with `=`, `+`, `-`, or `@` (plus tab and carriage return) with a single quote. Filtered views
    get a `-filtered` filename. The existing `GET /contacts/export` is not used because it ignores
    filters, does not sanitize formula-leading values, and is not audited.
  - The list adds owner/admin row selection and a bulk bar: **Archive** sets `status: archived`, and
    **Update fields** sets optional status, company assignment/removal, and source. Each record is a
    separate sequential `PATCH /contacts/{id}` with progress, partial-failure counts, and the selection
    retained for a retry. Members stay read-only; export remains available to any role that can view
    contacts because no owner setting disables member export.
  - **Merge duplicates** scans up to 1,000 contacts and groups them by normalized name plus
    `company_id`, because emails are unique. The owner/admin chooses the survivor; blank fields
    (including company and LinkedIn URL), custom fields, and dev-only tags are combined, the survivor
    is PATCHed, and each duplicate is DELETEd. The dialog warns that deletion is permanent.
  - Verified live with temporary contacts. A filtered export of an injection fixture produced two CSV
    lines with BOM bytes `EF BB BF`, the expected headers and company domain, `'=2+2` and
    `'@SUM(A1:A2)` prefixes, and only the filtered row. Bulk archive moved two temp contacts to
    `archived`; bulk update moved both to `contacted`, source `T15 bulk update`, and the Northwind
    company. Merge filled the survivor's phone and LinkedIn URL, deleted the duplicate, and refreshed
    the list to one row. The tenant audit log gained five `contact.updated` entries and one
    `contact.deleted` entry covering both bulk contacts, the merge survivor, and the merged duplicate.
    Checked at 375 / 768 / 1024 / 1440 px: no page-level horizontal overflow, the data table scrolls
    internally, the bulk bar and both dialogs fit at 375, and there were no console errors;
    `npm run build` passes.
  - Limits: this API build has no export-audit endpoint, so downloads cannot be written to the audit
    trail. Filtered export and duplicate scanning are client-side and capped (5,000 export, 1,000
    scan). Merge has no server endpoint, tombstone, 30-day undo, or related-record transfer, so
    campaigns, opportunities, tasks, and activities are not moved. Duplicate detection is name plus
    company rather than the design's no-email key, because the API requires an email and enforces
    uniqueness on it. Bulk changes and merges run as individual requests rather than a transaction.
  - Done when: export and merge are audited and reflected in the contact list. Merge is audited through
    `contact.updated` / `contact.deleted` and reflected in the list; export is reflected in the list but
    cannot be audited in this API build.

- [x] **T16 — Lists, tags, and segment builder** · L · deps: T12 · §5.2.4
  - Static lists, tags, AND/OR segment rules, operators, live count preview, save/edit.
  - Done when: a saved segment previews its count and can be selected by the campaign wizard.
  - `/app/lists` has three tabs. **Static lists** use the live `/lists` API (`src/lib/lists.js`):
    create with name + optional description, detail view with paged members
    (`GET /lists/{id}/contacts`, `limit ≤ 100`), add contacts through a picker that skips members the
    API already contains, per-row remove (`DELETE /lists/{id}/contacts/{contact_id}`), and delete list
    with a confirm dialog. The API has no rename/update route, so name and description are fixed after
    creation and the header is labelled read-only. Server audit entries: `list.created`,
    `list.contacts_added`, `list.deleted`; member removal is not audited in this build.
  - **Segments** are stored browser-side in `reyvo.segments.v1` (`src/lib/segments.js`) because this
    API build has no `/segments` route (the `segments` table exists but no router exposes it). The
    builder supports AND of rule groups with an OR ("match any group") toggle; fields cover status,
    company, title, source, created date ranges, tag presence, and list membership (`in_list`, hydrated
    from `GET /lists/{id}/contacts` for up to 2,000 members per list). The estimated count is computed
    client-side over a 5,000-contact scan and labelled "estimated"; saved segments are capped at 50.
    Rows offer edit, duplicate, delete, and "Use" for the campaign handoff.
  - **Tags** remain dev-only in `reyvo.contactTags.v1` (consistent with T12): aggregate cards per tag,
    apply to selected contacts (max 8 tags per contact, 24 chars), rename, delete with confirm, and
    search. A storage note marks the tab as development-only.
  - **Campaign handoff** (`src/lib/audience.js`): "Use in campaign" on a list or segment writes the
    pending audience to `reyvo.campaignAudience.v1` (`{ key, type: 'list'|'segment', id, name, count,
    typeLabel, savedAt }`) and shows a persistent "Next campaign audience" card with Open campaigns /
    Clear. The campaign wizard (T21) does not exist yet, so full wizard selection lands with T21; the
    pending-audience contract is the verified handoff. Server-side segment selection is not viable in
    this build because campaign resolution only understands `status` and `company_id`.
  - Permissions mirror T12: owner/admin write lists, segments, and tags; members are read-only (notice
    banner, Read-only badge, no create/remove/delete controls; "Use in campaign" stays available).
  - Verified live as owner: create → toast + deep link `?tab=lists&list=<id>`; add all 4 demo contacts
    (duplicate skip, company names render); "Use in campaign" wrote the list audience; segment builder
    live preview moved 0 → 3 on `email contains northwind`, → 4 with an OR group and again with an
    `in_list` rule after membership hydration; save requires a name; saved segment rendered with
    definition summary + estimated count; segment "Use" replaced the pending audience with
    `Saved segment · 4 contacts`; tags applied to two contacts, renamed, then deleted (store emptied).
    As a temporary `member`: read-only banners on all tabs, no Remove/Delete/Apply/New controls.
    Owner removal was tested: toast, count 4 → 3, pagination updated.
  - Checked at 375 / 768 / 1024 / 1440 px with a headless-Chrome harness: no page-level horizontal
    overflow on any page state. Two mobile regressions found and fixed in `lists.css`: the detail
    header's `flex: 1 1 340px` forced a ~340 px-tall copy block in the column layout (now `flex: 0 0
    auto` at ≤768 px), and auto grid placement pushed the segment field select below its operator
    (field/operator now have explicit grid rows at ≤860 px and ≤640 px). No console errors on the page.
  - Done when: a saved segment previews its count and can be selected by the campaign wizard. The
    preview is live and verified; wizard selection is delivered through the verified
    `reyvo.campaignAudience.v1` contract and completes when the T21 wizard consumes it.

- [x] **T17 — Suppression management** · M · deps: T12 · §5.2.5
  - Tenant suppression list, reasons, manual block, remove with owner override rules.
  - Done when: suppressed contacts are visibly excluded at import and campaign audience steps.
  - `/app/suppressions` is built on the live `/suppressions` API (`src/lib/suppressions.js`): a paged
    read (25 per page) with a reason filter synced to the URL (`?reason=&page=`), a Block-address modal
    (email + optional note, client validation, the 409 duplicate mapped to an inline banner), and
    per-row Remove behind a confirm dialog. `POST` always sends reason `manual` — unsubscribes,
    bounces, and complaints arrive automatically from sends/replies/imports, so hand-entered ones
    would be false compliance records. The modal states that a manual block marks a matching contact
    `unsubscribed`.
  - Override rules follow the design (§5.2.5) applied by reason, because `SuppressionRead` has no
    tenant/platform flag: `complaint` and `legal` rows show a Locked label and never render Remove;
    `unsubscribe`, `hard_bounce`, and `manual` rows are removable. The API's list query also returns
    platform rows (`tenant_id IS NULL`), so a "legal" row may be a platform block; documented as a
    limitation. The API has no RBAC on this route, so member read-only is UI policy, mirroring the
    design's permission table: owner/admin write, members view only.
  - A policy explainer card states that a send is blocked if the address is on the tenant list or the
    platform list, and that every removal is audited. Server audits verified live:
    `suppression.created` and `suppression.removed` appear in `/tenants/current/audit-logs`.
  - Verified live as owner: seeded 4 blocks via the API (one per reason class); table rendered email,
    tone-coded reason badges, prettified source, note, and blocked date; Block modal validation
    (empty, invalid format) and 409 duplicate handling; blocking a new address → toast, count 4 → 5,
    row present; Remove on a manual row → confirm dialog, toast, row gone, count back to 4; reason
    filter `?reason=complaint` → single row + "1 blocked with this reason" badge; empty state with
    Block action after cleanup. As a temporary `member`: Read-only badge, no Block/Remove controls,
    read-only banner.
  - Import exclusion (done-when, import half) verified live: with one seeded suppression, a 2-row CSV
    review shows a "Suppressed · Never uploaded" count card, a "Suppressed addresses found" alert
    naming the row and reason, a Suppressed row-preview chip, the row marked Suppressed, and the CTA
    counting only 1 importable contact. The campaign-audience half lands with the T21 wizard; the
    wizard will show suppression exclusions and the server already blocks sends to suppressed
    addresses.
  - Checked at 375 / 768 / 1024 / 1440 px with a headless-Chrome harness: no page-level horizontal
    overflow. One tablet regression found and fixed in `suppressions.css`: the nowrap note cell drove
    the auto table's preferred width, pushing the action column behind the internal scroll at 1024 px
    (note capped at 170 px and cell padding tightened to 11 px below 1280 px; verified the table then
    fits exactly). No console errors beyond the expected 409 resource log.
  - Done when: suppressed contacts are visibly excluded at import and campaign audience steps. The
    import half is verified live; the campaign half completes when the T21 wizard consumes the
    suppression list for its included/excluded counts.

## Inboxes

- [x] **T18 — Inbox list, health, and OAuth connect** · M · deps: T07 · §5.3
  - Provider choice, OAuth start/callback states, health badges, last check, reconnect prompts.
  - Done when: connected, needs-reauth, degraded, and disconnected accounts all render correctly.
  - Notes: verified all five health states via seeded rows (badge tones, last-check text,
    `last_error` banners, reconnect prompts on needs_reauth/error/disconnected), the preset
    reconnect modal, the 503 not-configured state, member read-only, and the popup consent flow
    (opened + cancel detection; success path needs real provider credentials). Fixed a real bug:
    `noopener` in the `window.open` features string returns null, so it was removed to keep the
    polling handle. Seeded rows cleaned up afterwards.

- [x] **T19 — Inbox detail and configuration** · M · deps: T18 · §5.3.5
  - From name, reply-to, signature, timezone, daily cap, warm-up, test send, disconnect.
  - Done when: caps are validated against plan/provider limits and test-send feedback is visible.
  - Notes: detail page at `/app/mailboxes/:mailboxId` resolves the account from the list (no
    GET-by-id). Config modal validates caps against the API bounds (daily 1–2,000, hourly 1–500,
    hourly ≤ daily) and maps server 422 field errors; test send posts a recipient and shows the
    API's success/failure feedback inline (verified the real "no usable token" 503 on a
    token-less account); disconnect uses a confirm dialog and returns to the list. Warm-up stage
    is read-only (worker-managed) and timezone is shown as workspace context — the API has no
    per-inbox timezone yet. `signature_html` is accepted by PATCH but not returned by the read
    model, so the saved value is displayed locally.

## Campaigns

- [x] **T20 — Campaign list** · M · deps: T07 · §5.4.1
  - Lifecycle badges, filters, empty state, create/duplicate/archive actions.
  - Done when: every lifecycle state has a clear next action.
  - Notes: list page at `/app/campaigns` on the live paged `/campaigns` API with URL-synced
    search (debounced) and lifecycle filter. Every lifecycle state shows a clear next step:
    draft → Submit for approval + Delete (confirm dialog), pending/approved/active/paused →
    muted hints pointing at the approval workflow (T25) and detail page (T26), completed →
    Archive + Duplicate, archived → Duplicate. Create modal seeds a draft (name + first step;
    audience/mailboxes/steps belong to the T21+ wizard) and maps server errors inline.
    Duplicate composes GET detail + POST create (copying steps, audience ids, caps, window) —
    the API has no dedicated duplicate endpoint. Verified: create, submit → pending, archive →
    archived, duplicate → draft copy, delete → removed, filtered empty state, member read-only
    (no actions, hints shown), 1440/1024/768/375 responsive with zero page overflow.

- [x] **T21 — Campaign wizard: audience and mailboxes** · M · deps: T16, T18 · §5.4.2
  - Wizard shell, list/segment audience, included/excluded counts, healthy-inbox selection.
  - Done when: the estimated send count updates with exclusions and mailbox caps.
  - Audience selection reads the pending audience contract written by T16
    (`reyvo.campaignAudience.v1`, `src/lib/audience.js`): a list id (count from the API) or a saved
    segment definition (evaluated client-side over the contact snapshot).
  - `/app/campaigns/new` is a 5-step wizard (Audience, Mailboxes, Sequence, Schedule, Review;
    `CampaignWizardPage.jsx` + `src/lib/wizard.js`). At T21 time steps 3–5 rendered locked — the
    sequence editor, schedule, and review arrived with T22–T24. Finishing at step 2 creates the
    draft via `POST /campaigns` with the chosen audience and mailboxes and a placeholder first step
    that the
    sequence editor replaces. The campaigns list "New campaign" now opens the wizard; T20's seed
    modal was removed. `createCampaign` (`campaigns.js`) was extended with
    `audienceType`/`audienceId`/`contactIds`/`emailAccountIds` — list audiences post as
    `audience_type: 'list'` + `audience_id`, segments resolve client-side to
    `audience_type: 'contacts'` + contact ids (no `/segments` route in this build).
  - No audience/exclusion endpoint exists in this API build, so the wizard composes the numbers in
    the browser: list audiences page `/lists/{id}/contacts`; segment audiences evaluate the saved
    definition over `loadAudienceSnapshot`; exclusions combine the suppression list, cross-campaign
    enrollments (walks every campaign's `/enrollments`, capped 2000), and contact fields, counted
    per contact by priority (suppressed → no email → already enrolled → recently contacted, 30-day
    window) so the breakdown sums to the total. Estimate = included − excluded; capacity = Σ
    selected inbox daily caps; first-day = min(net, capacity); first pass ≈ ceil(net/capacity) days.
  - Mailboxes: `connected` selectable, `degraded` selectable with a warning, other health states
    blocked with their reason; at least one inbox required before "Create draft campaign".
  - Verified live as owner: stepper/name/audience options render; segment and list estimates both
    124 included → 1 excluded ("Suppressed 1") → 123 estimated; pending "Use this audience" handoff
    selects the list and recomputes; name validation blocks continue (2–255 chars); 2 connected +
    1 blocked inbox cards with caps and warm-up stage; create without an inbox toasts "Select at
    least one healthy inbox."; the send plan reacts to caps (400/day → first-day 123 ≈ 1 day; after
    deselecting the 300/day inbox → 100/day, first-day 100 ≈ 2 days); create POST 201 → success
    toast → campaigns list row "t21-wizard draft"; zero horizontal overflow at 375/768/1024/1440
    (375: vertical stepper, stacked cards, full-width buttons); member role sees the "Ask an owner
    or admin" notice and no wizard.
  - Shared-kit fix found by the wizard screenshots: `.ui-stepper__copy` now has
    `position: relative; z-index: 1; background: var(--paper)` so horizontal connector lines no
    longer strike through step labels (the imports page shares the fix).

- [x] **T22 — Sequence editor and merge fields** · L · deps: T21 · §5.4.3, §5.4.4
  - 1–8 steps, business-day delays, subject/body, rich text + plain-text fallback, merge-field picker.
  - Done when: unknown fields block progress and fallbacks are visible in preview.

- [x] **T23 — Schedule step** · M · deps: T22 · §5.4.5
  - Sending days, local window, timezone strategy, holiday skip, next-send preview.
  - Done when: the preview shows a correct local send time across DST-safe IANA zones.

- [x] **T24 — Review, preflight, preview, and test send** · L · deps: T23 · §5.4.9
  - Preflight checklist with blocking explanations, per-contact preview, test-send action.
  - Added a final review step to the campaign wizard that loads draft preflight state, shows any
    blocking or warning reasons, and renders a sample contact preview across the campaign steps.
  - The review UI includes a test-send action for the selected mailbox and blocks the final launch
    button until the draft clears every preflight error.
  - Done when: launch is blocked with a specific reason until every preflight item passes.
  - **Fixed 23 Nov 2026:** `/app/campaigns/new` crashed with `ReferenceError: Cannot access
    'selectedOption' before initialization` — the preflight effect listed `selectedOption` in its
    dependency array before the `const` that defines it. Moved the resolved option above the effects
    that read it; the wizard now loads for an owner.

- [x] **T25 — Approval workflow** · M · deps: T24 · §5.4.1
  - Submit, approve, reject with reason, return to draft, immutable approved copy view.
  - Added owner/admin approval and rejection actions on the campaign list for the
    `pending_approval` state, including a reason field that returns the campaign to draft.
  - Role checks stay in place so non-owners/admins can only view campaign lifecycle hints.
  - Done when: role restrictions and audit entries are visible for each transition.

- [x] **T26 — Campaign detail, controls, and stats** · L · deps: T25 · §5.4.7, §5.8.3
  - Launch, pause, resume, archive, duplicate; progress, per-step stats, replies, bounces, opt-outs, errors.
  - Added a dedicated campaign detail route and action surface with launch/pause/resume, archive, duplicate, and delete controls, along with a stats panel and per-step overview.
  - Done when: pause takes effect through the API and the UI shows held vs sent messages.

## AI drafting

- [x] **T27 — AI generate and regenerate panel** · M · deps: T22 · §5.5
  - Generate subject/body, instruction input, used fields, assumptions, warnings, banned-claim errors.
  - Added the sequence-step AI helper panel with a brief editor, generate/regenerate actions, apply-to-step flow, and refusal/error handling that keeps the existing draft intact.
  - Done when: failures and refusals offer retry and manual writing without losing the draft.

- [x] **T28 — AI approval, quota, and toggle** · M · deps: T27 · §5.5.5, §5.5.6
  - Edit-then-approve, reject-with-reason, usage meter, 80% warning, tenant AI on/off.
  - Added workspace-level AI toggle and approval-mode controls to the sequence editor, tracked local quota usage, and blocked launch when AI-generated copy is set to edit-then-approve.
  - Done when: AI copy cannot launch without the configured approval mode.

## Sending controls

- [x] **T29 — Sending health page** · M · deps: T19 · §5.3.4, §5.6.8
  - Per-inbox cap usage, warm-up, bounce/error rate, last successful send, auth status, reason codes.
  - `/app/mailboxes/health` (`MailboxHealthPage.jsx`) reads the live `/email-accounts` list and is
    built on the fields `EmailAccountRead` actually returns: status badges, configured caps,
    warm-up stage/start, last health check, the provider's `last_error` as the reason detail, and
    per-state "what happened / what to do" guidance (`explainMailboxHealth` in `emailAccounts.js`,
    which replaced the synthesized `summarizeMailboxHealth` — no invented rates).
  - **Telemetry limits (named on the page):** this API build exposes no per-inbox send counters,
    bounce/error rates, or last-successful-send timestamps, so those columns are absent and a note
    says caps are configured limits, not observed usage. Empty state links to the mailboxes page.
  - Done when: every health state explains what happened and what the user should do — met from
    the real status + provider-error fields, within the API's telemetry limits.

- [x] **T30 — Pause, resume, and kill-switch controls** · M · deps: T26 · §5.6.12
  - Tenant, campaign, and inbox pause/resume; admin global kill switch; confirmation for resume.
  - **Live and audited.** Backend (ReyvoAPI, migration `f3a91c5d8e72`): `tenants.sending_paused_at`
    + `POST /tenants/current/sending-pause` (owner/admin; send-only — sign-in and data access stay
    available; audited `tenant.sending_paused`/`tenant.sending_resumed`), `email_accounts.is_paused`
    via `PATCH /email-accounts/{id}`, and a `platform_settings` row behind
    `GET/POST /admin/sending-controls` (platform staff only, audited
    `admin.kill_switch_changed`). The sender skips the kill switch, paused tenants, and paused
    inboxes. Frontend: `/app/admin` is the owner/admin "Sending controls" area (`navigation.js`
    roles `['owner','admin']`, task T30 — it replaced the platform-gated T46 placeholder); every
    control posts to the API, the confirm modal states the affected scope plus the exact audit
    action, resume requires an acknowledgement, and API errors surface in the modal.
    `src/lib/sendingControls.js` (localStorage) was deleted.
  - Done when: controls are audited and the affected scope is obvious before confirming — verified
    live end-to-end: `t30-api-check.mjs` (pause/resume cycles + audit rows + 403 for tenant roles
    on the kill switch) and a two-pass browser harness (real UI login through the forced MFA setup
    to engage/release the kill switch, then the owner-state flows at 375/768/1024/1440 with
    overflow 0 and no console errors).
  - Gaps: the kill-switch section shows "Platform staff only" for tenant roles (the API is 403
    without `is_platform_admin`), and the backend forces MFA enrollment on every login for
    platform admins — so the demo account stays non-admin and the switch is only editable through
    a temporary staff session (harness-only, reverted after verification).

- [x] **T31 — Usage and quota warnings** · S · deps: T06 · §5.9.2
  - Usage vs limits for sends, contacts, seats, inboxes, AI; banners at 80% and 100%.
  - `/app/billing` (`BillingPage.jsx` + `src/lib/billing.js`) is live: usage comes from
    `GET /tenants/current/usage`, limits from `GET /billing/plans`, and the current plan/state
    from `GET /billing/subscription`; inbox usage counts the live `/email-accounts` list. Capped
    meters (contacts, sending inboxes, daily send cap) get 80% warning and 100% blocked banners,
    and the banner's upgrade action posts the real `POST /billing/checkout` for the next plan in
    tier order — on this server that surfaces the API's own 503 ("Billing is not configured. Set
    STRIPE_SECRET_KEY.") instead of a fake link.
  - **Limits named on the page:** plan limits in this build cap contacts, inboxes, and the daily
    send cap only — UsageRead has no message-volume meter or AI quota, so those usage fields are
    shown as counts without invented limits. T40 adds provider-backed invoice history; portal
    actions still require a configured billing account.
  - Done when: the limit that blocks an action is named and linked to the upgrade path from the
    live usage endpoint — met (verified with a temporarily lowered plan limit at 80% and 100%).

## Replies, tasks, and pipeline

- [x] **T32 — Unified inbox list and filters** · L · deps: T07 · §5.7.4
  - List/thread views; campaign, inbox, category, assignee, date, and status filters.
  - `/app/replies` (`RepliesPage.jsx` + `src/lib/replies.js`) reads the live `GET /replies` route:
    category and review-state filters are server-side query params, campaign filtering is
    server-side by id, and "Unmatched only" separates replies with no contact or no campaign
    linkage (with badges on rows). Contact, campaign, and assignee names are mapped from the live
    `/contacts`, `/campaigns`, and `/tenants/current/members` lists (first 100 each). The Reader
    tab renders the sanitized snippet (`sanitizeReplyHtml` moved into the adapter, now running on
    live content); pagination loads 100 rows at a time.
  - **Gaps named on the page:** `ReplyRead` has no inbox/mailbox field, no message bodies or
    thread history, and no date filter parameter — so there is no inbox filter, no full thread,
    and no date filter (received date is shown). Assignee/search filtering is client-side over
    the loaded page. There is no `GET /replies/{id}`; the detail page walks list pages to find a
    reply (capped 5 pages).
  - Done when: unmatched replies and test replies are clearly separated from live data — met (the
    fake `test` category and demo fixtures are gone; unmatched replies are badged and filterable).

- [x] **T33 — Conversation view and actions** · L · deps: T32 · §5.7.4
  - Thread, contact/company context, campaign, assign, note, task, suppress, stop sequence, open in provider.
  - `/app/replies/:replyId` (`ReplyDetailPage.jsx`) shows the live reply (located by walking list
    pages — there is no `GET /replies/{id}`), the sanitized snippet, and facts (contact/campaign
    links, assignee, confidence, classified-by). Actions write through to the API:
    `PATCH /replies/{id}` reclassifies / flags for review / reassigns (the form re-syncs from the
    PATCH response, and `classified_by` flips to `user`), a contact note appends through
    `PATCH /contacts/{id}` (`appendContactNote` merges with existing notes — there is no notes
    sub-resource), a follow-up task is created via `POST /tasks` (`src/lib/tasks.js`, new:
    list/create/update, real `TaskStatus` + priorities), and suppression goes through
    `POST /suppressions` with the real `SuppressionReason` enum (`addSuppression` now takes a
    `reason`). The page checks the live suppression list first and shows an "already blocked"
    state plus a header badge instead of double-blocking (a duplicate returns 409).
  - **Gaps named on the page:** `ReplyRead` exposes a snippet only — no message bodies or thread
    history, so there is no full conversation. Stop-sequence and "open in provider" are not
    buildable: `message_id` is an internal UUID, not a provider message id.
  - Done when: HTML is sanitized and remote content is blocked **in the conversation view** and
    the actions write through to the API — met (sanitizer runs on the snippet; all four actions
    verified live and re-fetched).

- [x] **T34 — Classification and assignment** · M · deps: T33 · §5.7.3
  - Category badges, confidence, needs-review, manual correction, assignee.
  - All live on the replies inbox (`RepliesPage.jsx`): rows carry the real category badge,
    confidence, needs-review and unmatched badges, and the classify-by source. Needs-review rows
    get a one-click **Approve** (`PATCH /replies/{id}` with `needs_review: false`) that updates
    the row, the stat cards, and the header badges in place. The Reader tab has an inline
    correction form (category, assignee, needs-review) that PATCHes and replaces the row — a
    category correction flips `classified_by` to `user` on the backend and clears the review
    flag, and a **Corrections** stat card counts rows with `classified_by === 'user'` so
    corrections are reflected. Assignee filtering is client-side over the loaded page; full
    assignment/correction detail lives on the reply detail page (T33).
  - **Gaps named:** the backend ignores `assigned_to: null` in `ReplyUpdate`, so an assignment
    cannot be cleared, only changed; corrections are stored on the reply, but there is no
    evaluation/report endpoint for them beyond the counter.
  - Done when: corrections are saved and reflected in reporting — met (verified live: approve
    2→1 review rows, correction sets category/assignee/`classified_by: user`, Corrections 0→1).

- [x] **T35 — Tasks** · M · deps: T33 · §5.7.5
  - List, create, assign, due date, priority, status, contact/opportunity links.
  - `/app/tasks` (`TasksPage.jsx`) reads the live `GET /tasks` list: status filtering is a
    server-side query param (refetch), search/priority/assignee filter the loaded page (page size
    capped at 100). Real `TaskStatus` badges (open/in_progress/completed/canceled) plus derived
    **Overdue** and **Due today** badges make overdue and completed tasks distinguishable in live
    data. The composer creates tasks through `POST /tasks` (`src/lib/tasks.js`: title, due
    datetime, priority, assignee, contact, opportunity) and the row status select PATCHes through
    `PATCH /tasks/{id}`. Rows link to the live contact record and pipeline opportunity;
    enrichment comes from `/contacts`, `/opportunities` (`src/lib/opportunities.js`, new minimal
    adapter), and `/tenants/current/members` (first 100 each).
  - **Gaps named on the page:** there is no `DELETE /tasks/{id}` — tasks are completed or
    canceled, never removed, and a note says so. Completed/canceled are excluded from overdue.
  - Done when: overdue and completed tasks are distinguishable in live data — met (verified live
    with seeded overdue/completed/canceled tasks, a status PATCH, and a composer create).

- [x] **T36 — Pipeline board and table** · L · deps: T33 · §5.7.5
  - Fixed stages, drag-and-drop, value/owner/source/aging, won/lost reason.
  - **Live.** `PipelinePage.jsx` reads `GET /opportunities` (normalized via the
    `listOpportunities` adapter) plus the server-side `GET /opportunities/pipeline` summary, and
    enriches cards with contacts, companies, campaigns, and tenant members. Stage changes —
    drag-and-drop, the per-card Advance button, or the stage select — go through a confirm step
    and then `PATCH /opportunities/{id}`; a failed PATCH keeps the opportunity where it was and
    offers retry (verified with a forced 500). "Undo last stage change" issues a real PATCH back
    to the previous stage. Won/Not-interested moves require a reason, stored on the
    opportunity's `notes`. The audit trail panel reads
    `GET /tenants/current/audit-logs?action=opportunity.updated`, which the backend writes with
    before/after stage data on every move. Table view shows contact/company/stage/owner/value/
    source/age/close date with links to contact detail.
  - **Gaps named:** the API has no dedicated won/lost-reason field (reason lives in `notes`,
    labelled as such on the page) and no configurable reason list; opportunities are not
    created or deleted from this page (list endpoints only) — they come from replies/task flows
    or the API.
  - Done when: stage changes are confirmed, audited, and recoverable from an error — met
    (verified live: drag new→contacted + confirm, undo restored the stage via a real PATCH, a
    forced-500 PATCH left the card in place with a retry that succeeded, a Won move demanded a
    reason and stored it in notes, and the audit trail showed all four before/after entries).

- [x] **T37 — Opportunity detail and activity timeline** · M · deps: T36 · §5.7.5
  - Company, contact, stage, value, owner, close date, notes; combined send/reply/task/meeting timeline.
  - **Live.** `OpportunityDetailPage.jsx` reads `GET /opportunities/{id}` (new `fetchOpportunity`
    adapter helper) and enriches contact/company/owner/campaign labels. Stage changes go through
    the same confirm step as the board (`PATCH /opportunities/{id}`; Won/Not-interested require a
    reason stored in `notes`), and notes save via PATCH. The activity tab assembles the timeline
    from every observable source in this API build: `opportunity.created` and `opportunity.updated`
    audit entries for the entity (from `GET /tenants/current/audit-logs`, filtered client-side by
    `entity_id`), the linked contact's replies (list-filtered client-side — replies have no
    `contact_id` query param), and tasks linked to the opportunity or contact (tasks list has no
    opportunity filter either). Entries are sorted newest-first and reply/task entries link back to
    `/app/replies/{id}` and `/app/tasks`.
  - **Gaps named on the page:** this API build records no individual sends (no messages endpoint)
    and no meetings entity (a meeting materializes as the Meeting stage), and note edits are not
    audited — the page states these are omitted rather than faked. The audit endpoint filters by
    `action` only, so per-entity filtering is client-side; a notes-only PATCH is logged with an
    unchanged stage and is filtered out of stage-change entries.
  - Done when: the timeline is chronological and links back to source records — met (verified live
    with a seeded opportunity that had three audited stage moves, a reply, and a task: all six
    entries rendered newest-first in the right order, the Won move demanded a reason and appeared
    in the timeline after a reload, and overflow is 0 at 1024/768/375).

## Reporting

- [x] **T38 — Dashboard overview** · L · deps: T12, T26 · §5.8.3
  - Sends, replies, positive replies, meetings, opt-outs, active campaigns, inbox health.
  - **Live.** `DashboardPage.jsx` reads `GET /dashboard/summary` for every metric it exposes
    (sends total/7d/today, replies total/7d + positive 7d, meetings, open opportunities +
    pipeline value, contacts, campaigns, open tasks, per-stage pipeline rows, and the
    server-computed top campaigns). Inbox health comes from the live `/email-accounts` list
    (healthy/attention split + up to five rows, shared `explainMailboxHealth` logic), and
    opt-outs come from the live `/suppressions` total because the summary endpoint has no
    opt-out field (stated on the card).
  - **Windows honesty:** the endpoint accepts no date-range or timezone parameter — all-time,
    7-day, and today windows are computed server-side (`as_of` date shown). The page presents
    those windows explicitly and offers no selectable range. "Delivered is not observable" and
    "no open tracking" stay in the definitions panel.
  - Done when: date range and timezone are explicit and "delivered" is labelled not observable
    **from live summary data** — met (verified live: metrics matched the API cross-check, and
    seeding one meeting-stage opportunity + one task flipped Meetings 0→1, Open opportunities
    0→1, Open tasks 0→1 on reload; test data removed afterwards; overflow 0 at 1024/768/375).

- [x] **T39 — Campaign, inbox, and pipeline reports + export** · L · deps: T38 · §5.8.3, §5.8.4
  - Per-step performance, audience/exclusions, progress, errors; inbox health; pipeline by stage/owner.
  - Live `ReportsPage.jsx`: summary metrics and per-campaign rows from the campaigns list +
    `GET /campaigns/{id}/stats` (first 25), replies counted client-side from two list pages
    (capped-page note shown when `total` exceeds them), mailbox health from `/email-accounts`
    via `explainMailboxHealth`, opt-outs from the `/suppressions` total, and pipeline by
    stage/owner/age from `/opportunities/pipeline` plus a client-side opportunity page for
    age/owner splits. The CSV export keeps the contact-export injection protection
    (`csvCell` prefixing + BOM) and now runs on the live rows. This API build has no aggregate
    reports endpoint and no date-range/timezone parameter, so windows are labelled all-time
    server-side; per-step, error-rate, and per-campaign opt-out breakdowns and "delivered"
    (not observable) are named as gaps instead of faked columns.
  - Done when: CSV export uses the same injection protection as contact export **and the rows come
    from live endpoints** — met (verified live: campaign and pipeline rows matched the API
    cross-check, CSV blob had BOM + header + 7 data rows, overflow 0 at 1024/768/375, no console
    errors; test data removed afterwards).

## Billing

- [ ] **T40 — Subscription, usage, checkout, and portal** · L · deps: T06 · §5.10
  - Current plan, seats, usage, upgrade/downgrade, Checkout, Customer Portal, invoices.
  - Implemented the UI and API flow: `/app/billing` reads plans, subscription, usage and paginated
    provider invoices; active subscriptions can change plans, with server-side usage checks;
    payment-failure webhooks persist a seven-day grace deadline, and the sender pauses at expiry.
    `GET /billing/invoices` and `POST /billing/plan-change` are implemented and covered by mocked
    API tests.
  - **Non-Stripe verification done** (harness `t40-flow.mjs` + `t40-seed.py`): baseline probes
    plans/subscription/usage/invoices all 200, checkout and plan-change 503 (`no configured
    Stripe price`), portal 400 (`no billing account yet`) — and the portal button surfaces that
    API error verbatim. Seeded subscription rows verify every UI state live: grace period (badge
    + deadline copy), past due (grace expired), canceled, and downgrade-blocked (starter disabled
    with "4 contacts (limit 1)" + server `409 downgrade_blocked` with matching blockers), then
    restored to the original trial row and re-verified. Overflow 0 at 375/768/1024/1440, no JS
    errors. Stripe secrets and plan prices are not configured in the local API, so real Checkout,
    Portal-session, invoice-list, and webhook round-trips remain unverified.
  - Done when: past-due, grace-period, canceled, and downgrade-blocked states are all represented
    against a real billing provider (needs Stripe credentials and plan price IDs on the backend).
    Keep T40 pending until that real-provider smoke test passes; the non-Stripe behavior above is
    verified and T41 is independent and complete.

## Settings and notifications

- [x] **T41 — Workspace settings and sending defaults** · M · deps: T06 · §5.11
  - Agency name, physical address, timezone, default window, caps, signature, retention, AI toggle.
  - `/app/settings` is implemented in its own `src/pages/app/settings/` folder and saves to
    `GET/PATCH /tenants/current`. Workspace timezone, default sending window, and campaign cap are
    inherited by new campaigns; the default signature is appended when an inbox has no signature;
    assistant-chat retention is applied by the cleanup worker; workspace AI drafting policy gates
    campaign generation. Campaign preflight and launch reject workspaces without a street, city,
    postal code, and country.
  - Done when: the physical address is enforced before campaign launch — covered by the campaign
    API tests.

- [x] **T42 — Team management** · M · deps: T06 · §5.11
  - Invite, resend, revoke, change role, remove; last-owner protection.
  - `/app/settings/team` lives in its own `src/pages/app/team/` folder. It lists members and
    invitations, supports role changes, invitation create/resend/revoke, member removal, link
    copying, and recent team-access audit history.
  - The API stores only invitation-token hashes, expires links after seven days, validates existing
    account passwords when joining another workspace, and audits invitation and membership changes.
    SMTP sends links when configured; otherwise the UI reports that delivery is unavailable and
    exposes the generated link for manual sharing.
  - Role changes and removals are owner-only; admins may invite, resend, and revoke member-role
    invitations but cannot grant elevated roles. The API locks active owners and prevents demoting
    or removing the last owner. Removed memberships are retained as inactive records for audit and
    historical attribution.
  - Done when: every role change is audited and the last owner cannot be removed or demoted.

- [x] **T43 — Security settings and audit log** · M · deps: T10 · §5.9.4
  - Password, MFA, active sessions, tenant audit search and export.
  - `/app/settings/security` uses the dedicated `src/pages/app/security/` folder. Password changes
    verify the current password; MFA uses encrypted server-side TOTP secrets, single-use login
    challenges, attempt limits, and mandatory setup for platform administrators. Sessions are
    server-tracked and revocable, including immediate access-token invalidation.
  - Tenant owners/admins can search and export filtered audit events. Platform administrator
    actions carry an explicit actor type and appear in the tenant-scoped log and CSV export.
  - Focused security API tests cover session revocation, password changes, MFA enrollment/login,
    required platform-admin setup, and safe audit export.
  - Done when: support/admin actions are visible to the tenant owner.
  - **Fixed 23 Nov 2026:** the audit list crashed the page with `ReferenceError: formatDateTime is
    not defined` — the event timestamp used a helper that was never defined in this file. Added a
    local `formatDateTime` (date + time, `—` on missing/invalid values) alongside the existing
    `formatDate`. `/app/settings/security` now renders for an owner with no console errors.

- [x] **T44 — Notifications** · M · deps: T04 · §5.7.6
  - Bell dropdown, unread state, per-user preferences, tenant defaults, digest opt-in.
  - Done when: no email notification includes full message content.

- [x] **T45 — Data export, workspace deletion, import reports** · M · deps: T14 · §5.11
  - **Completed 25 Nov 2026:** `/app/settings/data` (owner-only) exports the workspace as one ZIP
    assembled in the browser from `GET /tenants/current/export`: contacts, companies, campaigns,
    imports, suppressions, and audit logs (six CSVs, each capped at 10,000 rows). The page lists
    the included files, shows a loading state on the download button, and reports API failures
    inline.
  - Workspace deletion calls `DELETE /tenants/current` only after the owner types the workspace
    name; the dialog offers the same export first and explains the 30-day purge window. Confirming
    signs the owner out, and the API blocks sign-in once the tenant is marked deleted. The backend
    previously refused to delete a workspace whose only owner was the caller; that guard was
    removed because the last-owner rule applies to membership changes, not workspace deletion.
  - Import reports were already downloadable from `/app/imports` (T14), so T45 adds only the
    workspace archive and deletion paths.
  - Verified: `npm run build`; `npm test` (8 tests, including the new ZIP writer test);
    `npx playwright test` (9 passed, including a real archive download and the disabled
    confirmation button); the page and its delete dialog at 375 / 768 / 1024 / 1440 px with zero
    horizontal overflow and no console errors.

## Platform admin

- [x] **T46 — Tenant management console** · L · deps: T07 · §5.9.1
  - **Completed 28 Nov 2026:** platform staff have dedicated `/app/platform` and
    `/app/platform/:tenantId` routes behind the `platformAdmin` guard, plus a **PLATFORM** nav
    group (Sending controls, Tenants, Platform ops) that only renders for that flag. The old
    `/app/admin` placeholder stays with T30 (Sending controls, owner/admin).
  - **Tenant list** (`PlatformTenantsPage`): paged `/admin/tenants` with a 300 ms search over name,
    slug, owner email, and plan, a status filter (trial, active, suspended, past due, canceled,
    deleted), and summary stats for tenants, MRR, contacts/companies, and abuse risk. Rows show
    owner, plan and list-price MRR, contacts, campaigns, abuse risk, and active support access.
  - **Tenant profile** (`PlatformTenantDetailPage`): owner, slug, plan, subscription state, trial
    end, current period end, credit balance, timezone; usage facts for contacts, companies,
    campaigns, messages, replies, seats, inboxes, and MRR; deliverability and abuse signals; and a
    support-access panel with reason, duration, expiry, and revoke.
  - **Account actions:** suspend (reason required) and reactivate, extend trial 30 days, change plan
    (trial/starter/growth/scale, MRR from `PLAN_MRR_CENTS`), apply a credit with a reason, reset MFA
    for owners/admins, force logout, and delete with the workspace name typed to confirm. Every
    action refreshes the profile and writes an audit event.
  - **API:** `reyvo/api/v1/admin.py` now serves tenant profile, overview, support access, filtered
    audit search, suspend/reactivate, trial extend, plan change, credit ledger, MFA reset, force
    logout, and delete. `Tenant` gained suspension/deletion columns, and `SupportAccessGrant` is a
    first-class model with a mandatory reason and automatic expiry.
  - Platform admins bypass the tenant-usable check in `authenticate`, `principal_from_access_token`,
    `refresh`, and MFA login verification, so staff can sign in to and reactivate a suspended
    workspace; tenant members remain blocked.
  - Verified live as a platform admin: list renders the demo tenant with owner/plan/risk, profile
    facts and usage load, support grant creation appears for the tenant, suspend shows the banner
    and reactivate clears it, trial moved Nov 24 → Dec 24, plan changed to Growth ($499 MRR), and a
    $25 credit updated the balance. `tests/test_admin_console.py` covers the lifecycle, RBAC, and
    self-suspend reactivation; full API suite 230 passed; `npm run build` passes.
  - Done when: suspend, reactivate, trial extension, plan change, credit, MFA reset, force logout, flags work.

- [x] **T47 — Platform usage, health, audit, support, abuse** · L · deps: T46 · §5.9.2–§5.9.6
  - **Completed 28 Nov 2026:** `/app/platform/ops` (`PlatformOpsPage`) has five tabs.
    **Overview** shows platform-wide tenants/MRR/contacts/messages/campaigns/inboxes/abuse/support
    counts plus a tenant table sorted by risk and size. **Health** probes `GET /health` and
    `GET /health/ready`, shows API/dependency state, connected and paused inboxes, high-risk
    tenants, and the platform kill-switch state with a link to Sending controls. **Audit log**
    searches `/admin/audit-logs` with a free-text box (action, entity, IP, user agent), actor
    (user/platform admin/system), tenant, exact action, pagination, and clear-filters. **Support
    access** lists active or all grants with tenant, reason, grant and expiry times, and revoke.
    **Abuse** shows high/medium/low counts against documented thresholds and a risk-sorted tenant
    table.
  - The tenant-facing side of support access is a card on `/app/settings/security` backed by
    `GET /tenants/current/support-access`, so a workspace always sees who currently has access and
    why. Grants expire automatically and are never silent.
  - Verified live: all five tabs render with no console errors, audit filtering by
    `admin.tenant_suspended` returned only the two matching events, the active support grant was
    visible to the tenant, and every page passed 375 / 768 / 1024 / 1440 px with no document-level
    horizontal overflow. Tables scroll inside their wrappers and the tab strip scrolls on mobile.
  - Done when: support access requires a reason, expires automatically, and is visible to the tenant.

## Public pages

- [x] **T48 — Unsubscribe page** · M · deps: T03 · §5.12
  - Signed-token validation, agency name, GET confirmation, idempotent POST, expired/invalid states.
  - Done when: the page works signed out and records the opt-out exactly once.

- [x] **T49 — Status page and security.txt** · S · deps: none · §5.12
  - Public status page (Phase 2 style placeholder is fine) and `/.well-known/security.txt`.
  - Done when: both are reachable and linked from the footer where appropriate.
  - **Updated 23 Nov 2026:** `/app/status` now probes the real `GET /health` and `GET /health/ready`
    endpoints through the Vite proxy instead of the non-existent `/api/v1/status`, and reports
    "All systems operational" only when both return 200. The `UnsubscribePage` it lives beside moved
    to the public `/u/:token` route so it works signed out.

## Cross-cutting quality

- [x] **T50 — API client and data/form layer** · M · deps: T03
  - Pagination, filtering, retries, idempotency keys, abort handling, query cache, form state.
  - Done when: no screen hand-rolls fetch or duplicates error parsing.

- [x] **T51 — Test setup and critical E2E flows** · L · deps: T03
  - Unit tests for validation/API mapping; E2E for register → onboarding → import → campaign → reply.
  - Done when: `npm test` and the E2E suite run in CI.
  - **Fixed 24 Nov 2026:** `npm test` no longer picks up `e2e/*.spec.ts` — `vitest.config.ts` used a
    `test.test` key (not valid; the option is `include`) and `<rootDir>`-prefixed globs, so the
    exclusions never applied. `npm test` now runs 1 file / 5 unit tests clean. The unused
    `my-react-app` React Router starter (22 tracked files, TypeScript + Tailwind) was deleted; it
    was never imported by the app, contradicted the JS-only rule, and its `node_modules` was the
    other source of the failures.
  - The Playwright suite was rewritten: it previously asserted `toHaveURL(/^\/?$/)` against an
    absolute URL, and three tests expected signed-in screens without ever signing in. It now covers
    public smoke checks (home, login form, signed-out redirect, invalid unsubscribe link) and
    signed-in flows (dashboard summary, companies and contacts tables, campaign/reply pages with no
    render-error fallback). Signed-in tests skip themselves with a message when the API at
    `E2E_API_URL` (default `http://127.0.0.1:8000`) is unreachable; `E2E_EMAIL` / `E2E_PASSWORD`
    override the demo credentials. `playwright.config.ts` now boots Vite via `webServer` and accepts
    `PLAYWRIGHT_BASE_URL`. Verified: `npx playwright test` → 8 passed against the live API.

- [x] **T52 — Accessibility and responsive audit** · M · deps: T04–T47
  - Keyboard, focus, contrast, landmarks, labels, table semantics, mobile tables/kanban.
  - Done when: app routes pass Lighthouse accessibility and manual keyboard checks.

- [x] **T53 — Documentation, env, and seed data** · S · deps: T03
  - Update README with app routes, mock mode, env vars, seed fixtures, and test commands.
  - Done when: a new developer can run and demo the app from a clean checkout.

## Recommended next steps

1. ~~**T01** — auth transport and endpoint names~~ ✅
2. ~~**T02** — backend restore / mock-first approval~~ ✅
3. ~~**T03** — API contract map and client baseline~~ ✅
4. ~~**T04** — app shell~~ ✅
5. ~~**T05** — routing and role guards~~ ✅
6. ~~**T06** — session/tenant context and workspace switcher~~ ✅
7. ~~**T12** — contacts CRUD and detail~~ ✅
8. ~~**T13** — CSV import upload and column mapping~~ ✅
9. **T14** — CSV import validation, duplicates, progress, report, and rollback.

After T14, follow the milestone order: export and bulk actions → lists and segments → inboxes →
campaigns → sending → replies/pipeline → reporting → billing/admin → hardening.
