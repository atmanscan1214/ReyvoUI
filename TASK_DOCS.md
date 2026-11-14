# Reyvo — Task Documentation

Generated: 12 November 2026
Based on: `TASKS.md` backlog v2 (milestone/schedule plan)

---

## Overview

This document provides a detailed index and quick-reference guide for all tasks in the Reyvo MVP backlog (T01–T53), organized by milestone. Each task includes its current status, dependencies, size estimate, and "Done when" condition.

> **Project status:** pre-approval / demo-ready development (build can be shown to the client at any time).
> **Verification snapshot (12 Nov 2026):** T01–T16 verified against live stack; T16 pending audience is browser-staged until T21; `npm run build` passes for `ReyvoUI`.

---

## Milestone Map

| Milestone | Target Dates | Weekly Update | Tasks |
|-----------|-------------|---------------|-------|
| **M0 — Demo & foundation handoff** | Mon 16 Nov – Fri 20 Nov 2026 | Fri 20 Nov 2026 | T01–T16 verification/handoff |
| **M1 — Audience complete** | Mon 23 Nov – Fri 27 Nov 2026 | Fri 27 Nov 2026 | T16, T17 |
| **M2 — Inboxes** | Mon 30 Nov – Fri 4 Dec 2026 | Fri 4 Dec 2026 | T18, T19 |
| **M3 — Campaign core** | Mon 8 Dec – Fri 18 Dec 2026 | Fri 11 Dec, Fri 18 Dec | T20–T24 |
| **M4 — Campaign launch, AI & sending** | Mon 21 Dec – Wed 30 Dec 2026 | Mon 22 Dec, Wed 30 Dec | T25–T31 |
| **M5 — Replies, tasks & pipeline** | Mon 5 Jan – Fri 9 Jan 2027 | Fri 9 Jan | T32–T37 |
| **M6 — Reporting, billing, settings & public** | Mon 5 Jan – Tue 13 Jan 2027 | Fri 9 Jan, Thu 15 Jan | T38–T45, T48–T49 |
| **M7 — Platform admin, hardening & closeout** | Mon 12 Jan – Thu 15 Jan 2027 | Thu 15 Jan | T46–T47, T50–T53 |

---

## Task Index (T01–T53)

### Foundation (M0)

| Task | Size | Deps | Done when |
|------|------|------|-----------|
| **T01 — Auth transport and endpoint names** ✅ | S | none | Decision recorded in README; API client matches |
| **T02 — Restore backend sources or approve mock-first** ✅ | blocker | §11.2 | API responds on `:8000` **or** mock-first approved and T03 starts |
| **T03 — API contract map and client baseline** ✅ | M | T01, T02 | Contract doc exists; client handles auth refresh and error envelope |
| **T04 — Authenticated app shell** ✅ | M | T03 | Shell renders at all four breakpoints (375/768/1024/1440) with focus, keyboard, skip-link |
| **T05 — App routing, guards, and role placeholders** ✅ | M | T04 | Direct visits to each route resolve correctly for signed-out, member, admin, owner |
| **T06 — Session, tenant context, refresh, workspace switcher** ✅ | M | T01, T05 | Tenant switch updates shell, data queries, and permissions without a reload |

### Leads and Audience

| Task | Size | Deps | Done when |
|------|------|------|-----------|
| **T11 — Companies** ✅ | L | T07 | Empty, loading, duplicate-warning, and permission states covered |
| **T12 — Contacts** ✅ | L | T07 | A contact can be created manually and viewed with company context |
| **T13 — CSV import: upload and column mapping** ✅ | L | T12 | A valid CSV reaches a review step and an invalid file shows row-level errors |
| **T14 — CSV import: validation, duplicates, progress, report, rollback** ✅ | L | T13 | A 100-row fixture can be imported and its skipped/suppressed/error rows are explained |
| **T15 — Export, bulk actions, duplicate merge** ✅ | M | T12 | Export and merge are audited and reflected in the contact list |
| **T16 — Lists, tags, and segment builder** ✅ | L | T12 | A saved segment previews its count and can be selected by the campaign wizard. *Caveat: wizard-selection completion gated by T21.* |
| **T17 — Suppression management** ⬜ | M | T12 | Suppressed contacts are visibly excluded at import and campaign audience steps |

### Inboxes (M2)

| Task | Size | Deps | Done when |
|------|------|------|-----------|
| **T18 — Inbox list, health, and OAuth connect** ⬜ | M | T07 | Connected, needs-reauth, degraded, and disconnected accounts all render correctly |
| **T19 — Inbox detail and configuration** ⬜ | M | T18 | Caps are validated against plan/provider limits and test-send feedback is visible |

### Campaigns (M3–M4)

| Task | Size | Deps | Done when |
|------|------|------|-----------|
| **T20 — Campaign list** ⬜ | M | T07 | Every lifecycle state has a clear next action |
| **T21 — Campaign wizard: audience and mailboxes** ⬜ | M | T16, T18 | Estimated send count updates with exclusions and mailbox caps |
| **T22 — Sequence editor and merge fields** ⬜ | L | T21 | Unknown fields block progress and fallbacks are visible in preview |
| **T23 — Schedule step** ⬜ | M | T22 | Preview shows a correct local send time across DST-safe IANA zones |
| **T24 — Review, preflight, preview, and test send** ⬜ | L | T23 | Launch is blocked with a specific reason until every preflight item passes |
| **T25 — Approval workflow** ⬜ | M | T24 | Role restrictions and audit entries are visible for each transition |
| **T26 — Campaign detail, controls, and stats** ⬜ | L | T25 | Pause takes effect through the API and UI shows held vs sent messages |

### AI Drafting (M4)

| Task | Size | Deps | Done when |
|------|------|------|-----------|
| **T27 — AI generate and regenerate panel** ⬜ | M | T22 | Failures and refusals offer retry and manual writing without losing the draft |
| **T28 — AI approval, quota, and toggle** ⬜ | M | T27 | AI copy cannot launch without the configured approval mode |

### Sending Controls (M4)

| Task | Size | Deps | Done when |
|------|------|------|-----------|
| **T29 — Sending health page** ⬜ | M | T19 | Every health state explains what happened and what the user should do |
| **T30 — Pause, resume, and kill-switch controls** ⬜ | M | T26 | Controls are audited and the affected scope is obvious before confirming |
| **T31 — Usage and quota warnings** ⬜ | S | T06 | The limit that blocks an action is named and linked to the upgrade path |

### Replies, Tasks, and Pipeline (M5)

| Task | Size | Deps | Done when |
|------|------|------|-----------|
| **T32 — Unified inbox list and filters** ⬜ | L | T07 | Unmatched replies and test replies are clearly separated |
| **T33 — Conversation view and actions** ⬜ | L | T32 | HTML is sanitized and remote content is blocked by default |
| **T34 — Classification and assignment** ⬜ | M | T33 | Corrections are saved and reflected in reporting |
| **T35 — Tasks** ⬜ | M | T33 | Overdue and completed tasks are distinguishable |
| **T36 — Pipeline board and table** ⬜ | L | T33 | Stage changes are confirmed, audited, and recoverable from an error |
| **T37 — Opportunity detail and activity timeline** ⬜ | M | T36 | Timeline is chronological and links back to source records |

### Reporting (M6)

| Task | Size | Deps | Done when |
|------|------|------|-----------|
| **T38 — Dashboard overview** ⬜ | L | T12, T26 | Date range and timezone are explicit; "delivered" labelled not observable |
| **T39 — Campaign, inbox, and pipeline reports + export** ⬜ | L | T38 | CSV export uses same injection protection as contact export |

### Billing (M6)

| Task | Size | Deps | Done when |
|------|------|------|-----------|
| **T40 — Subscription, usage, checkout, and portal** ⬜ | L | T06 | Past-due, grace-period, canceled, and downgrade-blocked states all represented |

### Settings and Notifications (M6)

| Task | Size | Deps | Done when |
|------|------|------|-----------|
| **T41 — Workspace settings and sending defaults** ⬜ | M | T06 | Physical address is enforced before campaign launch |
| **T42 — Team management** ⬜ | M | T06 | Every role change is audited; last owner cannot be removed or demoted |
| **T43 — Security settings and audit log** ⬜ | M | T10 | Support/admin actions are visible to the tenant owner |
| **T44 — Notifications** ⬜ | M | T04 | Bell dropdown, unread state, per-user preferences, tenant defaults, digest opt-in |
| **T45 — Data export, workspace deletion, import reports** ⬜ | M | T14 | Destructive actions require owner confirmation and offer an export first |

### Platform Admin (M7)

| Task | Size | Deps | Done when |
|------|------|------|-----------|
| **T46 — Tenant management console** ⬜ | L | T07 | Suspend, reactivate, trial extension, plan change, credit, MFA reset, force logout, flags work |
| **T47 — Platform usage, health, audit, support, abuse** ⬜ | L | T46 | Usage and limits; queue/provider/API health; audit search; time-boxed support access; abuse signals and kill switches |

### Cross-Cutting Quality (M7 / ongoing)

| Task | Size | Deps | Done when |
|------|------|------|-----------|
| **T50 — API client and data/form layer** ⬜ | M | T03 | No screen hand-rolls fetch or duplicates error parsing |
| **T51 — Test setup and critical E2E flows** ⬜ | L | T03 | `npm test` and the E2E suite run in CI |
| **T52 — Accessibility and responsive audit** ⬜ | M | T04–T47 | App routes pass Lighthouse accessibility and manual keyboard checks |
| **T53 — Documentation, env, and seed data** ⬜ | S | T03 | A new developer can run and demo the app from a clean checkout |

---

## Status Legend

- ✅ **Done** — task verified and checked off in TASKS.md
- ⬜ **Pending** — task not yet started
- 🟡 **In progress** — work has begun on this task

---

## Branching Strategy (Summary)

All branches are created from `dev`:

| Branch | Purpose |
|--------|---------|
| `dev` | Integration branch for ongoing MVP development |
| `demo` | Demo-ready branch for client walkthroughs |
| `milestone/m0-demo-foundation` | M0: demo baseline, branch/process setup |
| `milestone/m1-audience-complete` | M1: audience, lists/segments, suppressions |
| `milestone/m2-inboxes` | M2: inbox connect/health/config |
| `milestone/m3-campaign-core` | M3: campaign list, wizard, sequence, schedule, preflight |
| `milestone/m4-campaign-launch-ai-sending` | M4: approval, launch/controls, AI drafting, sending health/quotas |
| `milestone/m5-replies-tasks-pipeline` | M5: unified inbox, conversation actions, tasks, pipeline |
| `milestone/m6-reporting-billing-settings-public` | M6: dashboard/reports, billing, settings/team/notifications, public pages |
| `milestone/m7-admin-hardening-buffer` | M7: platform admin, cross-cutting quality, stabilization and buffer completion |

**Working rule:** branch milestone work from `dev`, open PRs back to `dev` frequently; promote reviewed/demo-ready states to `demo` for client walkthroughs.

---

## Project Schedule (Proposed)

| Item | Date / detail |
|------|-------------|
| **Project start** | Mon 16 Nov 2026 |
| **Planned duration** | 2 months (through Fri 15 Jan 2027) |
| **MVP feature-complete target** | Wed 30 Dec 2026 (2+ weeks before deadline; adjusted for holidays) |
| **Stabilization / polish / demo hardening buffer** | Mon 5 Jan – Thu 15 Jan 2027 |
| **Client updates** | Weekly (end-of-week written/demo update each Friday, except holiday-shortened weeks) |
| **Holidays (no planned development)** | Wed 23 Dec, Thu 24 Dec, Fri 25 Dec, Sat 26 Dec, Thu 31 Dec, Fri 1 Jan, Sat 2 Jan |
| **Team** | 2 developers + AI-assisted implementation/support |

---

## Weekly Cadence & Client Update Checkpoints

| Week | Dates | Working notes | Client update (Fri) |
|------|-------|---------------|---------------------|
| Week 1 | Mon 16 Nov – Fri 20 Nov 2026 | Project kickoff, Demo baseline, milestone setup | **Fri 20 Nov 2026** |
| Week 2 | Mon 23 Nov – Fri 27 Nov 2026 | Full week | **Fri 27 Nov 2026** |
| Week 3 | Mon 30 Nov – Fri 4 Dec 2026 | Full week | **Fri 4 Dec 2026** |
| Week 4 | Mon 7 Dec – Fri 11 Dec 2026 | Full week | **Fri 11 Dec 2026** |
| Week 5 | Mon 14 Dec – Fri 18 Dec 2026 | Full week | **Fri 18 Dec 2026** |
| Week 6 | Mon 21 Dec – Fri 25 Dec 2026 | Holiday-shortened (23–25 off) | **Mon 22 Dec 2026** (pre-holiday update) |
| Week 7 | Mon 28 Dec – Fri 1 Jan 2027 | Holiday-shortened (31, 1 off); MVP wrap-up | **Wed 30 Dec 2026** (MVP feature-complete checkpoint) |
| Week 8 | Mon 5 Jan – Fri 9 Jan 2027 | Buffer: stabilization, bug fixes, polish | **Fri 9 Jan 2027** |
| Week 9 | Mon 12 Jan – Thu 15 Jan 2027 | Buffer: final QA, demo hardening, release prep | **Thu 15 Jan 2027** (final pre-deadline update) |

---

## Quick Access Links (by priority)

| Priority | Tasks | For demo |
|----------|-------|----------|
| **High** | T01–T10 | Auth, shell, routing, onboarding, account settings — core flows a client can test immediately |
| **Medium** | T11–T17 | Companies, contacts, CSV import, lists/segments, suppression — demo-ready with mock data |
| **Medium** | T18–T24 | Inboxes, campaign list/wizard — upcoming milestones |
| **Low** | T25–T53 | Approval, AI, sending, replies, reporting, admin — longer-term roadmap |

---

## Verification Summary (12 Nov 2026)

- **102/103 checks PASS**, 1 FAIL (T06 sign-out-everywhere in full run — confirmed script/timing issue, not app bug; targeted recheck shows app behavior correct)
- **T01–T05, T08–T15, T16** all PASS in full coverage
- **T16** pending audience browser-staged until T21
- **`npm run build`** passes for `ReyvoUI` (Vite production build: 126 modules transformed, ✓ built in 575ms)
- **Breakpoints/console:** no horizontal overflow at 375/768/1024/1440 px; no unexpected console errors
- **OpenAPI:** 62 paths `/api/v1`-prefixed; bearer auth confirmed; `/health/ready` ok

---

## Recommended Next Steps (from TASKS.md)

1. **M0 (16–20 Nov 2026):** finalize demo baseline, confirm branch/process setup, keep `demo` ready for client walkthroughs
2. **M1 (23–27 Nov 2026):** complete **T17** (suppression management) and close T16 wizard-selection dependency at **T21**
3. **M2 (30 Nov–4 Dec 2026):** **T18–T19** inboxes
4. **M3 (8–18 Dec 2026):** **T20–T24** campaign authoring and preflight
5. **M4 (21–30 Dec 2026, holiday-shortened):** **T25–T31** approval/launch/AI/sending controls — target MVP feature-complete by **30 Dec 2026**
6. **Buffer (5–15 Jan 2027):** execute/finish **M5–M7** priorities, integration fixes, QA, polish, and demo hardening ahead of **15 Jan 2027** deadline

---

*This document is auto-generated from `TASKS.md` and the project verification snapshot. Last updated: 12 November 2026.*