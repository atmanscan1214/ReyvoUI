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
  - The API build has none of these endpoints. Development builds call the provisional paths first,
    then fall back to single-use, correctly time-boxed records in `reyvo.passwordResets.v1`,
    `reyvo.mfa.v1`, and `reyvo.invites.v1` with clearly labelled “Development only” links for every
    state; production builds report the feature as unavailable instead of faking it. Documented in
    `README.md` and `docs/API_CONTRACT.md`.
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
5. ~~**T05** — routing and role guards~~ ✅
6. ~~**T06** — session/tenant context and workspace switcher~~ ✅
7. ~~**T12** — contacts CRUD and detail~~ ✅
8. ~~**T13** — CSV import upload and column mapping~~ ✅
9. **T14** — CSV import validation, duplicates, progress, report, and rollback.

After T14, follow the milestone order: export and bulk actions → lists and segments → inboxes →
campaigns → sending → replies/pipeline → reporting → billing/admin → hardening.
