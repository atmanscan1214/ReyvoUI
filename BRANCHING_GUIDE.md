# Reyvo — Branching Guide

Generated: 12 November 2026
Based on: `TASKS.md` milestone/schedule plan v2

---

## Overview

This guide documents the branching strategy for the Reyvo MVP development across both `ReyvoUI` and `ReyvoApi` repositories. All branches are created from the **`dev`** integration branch.

> **Team:** 2 developers working in parallel on milestone branches.
> **Strategy:** Branch milestone work from `dev`, open PRs back to `dev` frequently; promote reviewed/demo-ready states to `demo` for client walkthroughs.

---

## Branch Architecture

| Branch | Purpose | When to Create |
|--------|---------|----------------|
| `dev` | Integration branch for ongoing MVP development (source of truth for active work). | Default; always exists. |
| `demo` | Demo-ready branch containing the pages/flows needed to show the client how the application will be developed and used (kept stable for demos). | Create once M0 baseline is stable; keep updated as milestones complete. |
| `milestone/m0-demo-foundation` | M0: demo baseline, branch/process setup, verified foundation handoff. | After M0 kickoff (Mon 16 Nov 2026). |
| `milestone/m1-audience-complete` | M1: audience, lists/segments, suppressions. | After M0 completes; work starts Mon 23 Nov 2026. |
| `milestone/m2-inboxes` | M2: inbox connect/health/config. | After M1 completes; work starts Mon 30 Nov 2026. |
| `milestone/m3-campaign-core` | M3: campaign list, wizard, sequence, schedule, preflight. | After M2 completes; work starts Mon 8 Dec 2026. |
| `milestone/m4-campaign-launch-ai-sending` | M4: approval, launch/controls, AI drafting, sending health/quotas. | After M3 completes; work starts Mon 21 Dec 2026. |
| `milestone/m5-replies-tasks-pipeline` | M5: unified inbox, conversation actions, tasks, pipeline. | After M4 buffer starts (Mon 5 Jan 2027) or when M4 slips. |
| `milestone/m6-reporting-billing-settings-public` | M6: dashboard/reports, billing, settings/team/notifications, public pages. | After M5 starts or when M4 buffer frees capacity. |
| `milestone/m7-admin-hardening-buffer` | M7: platform admin, cross-cutting quality, stabilization and buffer closeout. | After M6 starts or when M5/M6 buffer capacity available. |

---

## Working Rules

### 1. Branch Creation

```
# From local dev branch
git checkout dev
git pull origin dev    # always start with latest dev
git branch <branch-name>
git checkout <branch-name>
# ... start work ...
# When ready to integrate:
git rebase dev         # rebase onto latest dev (handles conflicts early)
git push --force origin <branch-name>
# Open PR from <branch-name> → dev
# After PR approval:
git checkout dev
git pull origin dev    # merge or fast-forward
```

### 2. Branch Naming Convention

- **Root branches:** `dev`, `demo` (no prefix)
- **Milestone branches:** `milestone/m<NUM>-<slug>` (lowercase, hyphen-separated)
  - `milestone/m0-demo-foundation`
  - `milestone/m1-audience-complete`
  - `milestone/m2-inboxes`
  - `milestone/m3-campaign-core`
  - `milestone/m4-campaign-launch-ai-sending`
  - `milestone/m5-replies-tasks-pipeline`
  - `milestone/m6-reporting-billing-settings-public`
  - `milestone/m7-admin-hardening-buffer`

### 3. Parallel Workflow (2 developers)

| Scenario | Action |
|----------|--------|
| **Both work on same milestone** | Branch from `dev`, each developer takes separate sub-tasks. Merge PRs back to `dev` frequently (at least daily). |
| **Different milestones** | Each developer works on their own milestone branch (e.g., one on M3, one on M4). Periodically rebase onto `dev` to stay current. |
| **Hotfix needed** | Create `hotfix/<issue>` from `dev`, fix, merge to `dev`, then rebase all active milestone branches onto new `dev`. |
| **Demo preparation** | Ensure `demo` branch is up-to-date with reviewed/demo-ready states from `dev`. Promote selected PRs to `demo` for client walkthroughs. |

### 4. Pull Request Process

1. **Work in topic branch** (milestone/<NUM>-<slug>)
2. **Commit frequently** with descriptive messages
3. **Open PR to `dev`** (not directly to `main`)
4. **PR template** should include:
   - Milestone alignment (e.g., "Part of M3: Campaign core")
   - Tasks addressed (e.g., "Implements T20, T21, T22")
   - Demo checklist (screens tested, breakpoints checked)
   - Known issues / open questions
5. **Code review** by the other developer
6. **Merge approved** → squash or fast-forward into `dev`
7. **Update `demo`** if PR contains demo-critical flows

### 5. Keeping Branches In-Sync

```
# Regular routine (daily or before starting work)
git checkout my-milestone-branch
git rebase dev       # pull in dev changes, resolve conflicts
git push --force origin my-milestone-branch

# At end of day or before PR
git checkout dev
git pull origin dev  # update local dev
# PR workflow as above
```

---

## Branch Status (as of 12 Nov 2026)

All branches are currently rebased onto the same commit (`99df1ed...`), meaning they contain identical base content. Changes on each branch will diverge as work progresses.

| Branch | Target Start | Target End | Status |
|--------|-------------|------------|--------|
| `dev` | — | — | Active integration branch |
| `demo` | Mon 16 Nov 2026 | Fri 20 Nov 2026 | Ready for client demos (M0 baseline) |
| `milestone/m0-demo-foundation` | Mon 16 Nov 2026 | Fri 20 Nov 2026 | M0: demo/foundation handoff |
| `milestone/m1-audience-complete` | Mon 23 Nov 2026 | Fri 27 Nov 2026 | Pending start (after M0) |
| `milestone/m2-inboxes` | Mon 30 Nov 2026 | Fri 4 Dec 2026 | Pending start (after M1) |
| `milestone/m3-campaign-core` | Mon 8 Dec 2026 | Fri 18 Dec 2026 | Pending start (after M2) |
| `milestone/m4-campaign-launch-ai-sending` | Mon 21 Dec 2026 | Wed 30 Dec 2026 | Pending start (after M3) |
| `milestone/m5-replies-tasks-pipeline` | Mon 5 Jan 2027 | Fri 9 Jan 2027 | Pending start (after M4 buffer) |
| `milestone/m6-reporting-billing-settings-public` | Mon 5 Jan 2027 | Tue 13 Jan 2027 | Pending start (overlaps M5 buffer) |
| `milestone/m7-admin-hardening-buffer` | Mon 12 Jan 2027 | Thu 15 Jan 2027 | Pending start (final buffer closeout) |

---

## Repository-Specific Notes

### ReyvoUI (frontend)

- All branches listed above exist in `ReyvoUI` remote
- Created from `dev`; all rebased to same commit on 12 Nov 2026
- Demo pages (Companies, Contacts, Onboarding Address) are on `dev` and merged into `demo`
- `npm run build` must pass on each branch before PR merge
- Breakpoint checks at 375/768/1024/1440 px are required for each "Done when" condition

### ReyvoApi (backend)

- Same branching structure should be maintained in `ReyvoApi` repo
- Branches created from `dev` (same names)
- API endpoints and mock fallbacks should align with `TASKS.md` dependencies
- `npm run sync:openapi` should be run when API contract changes

### Cross-Repository Coordination

- When a milestone completes in `ReyvoUI`, the corresponding milestone in `ReyvoApi` should be at a similar state
- PRs to `dev` in one repo should be coordinated with the other (especially for auth/session/tenant endpoints)
- Use the `demo` branch as the shared demo point — both repos should have demo-ready states aligned

---

## Troubleshooting

| Issue | Resolution |
|-------|------------|
| **Branch diverged from `dev` too much** | `git rebase dev` → resolve conflicts → `git push --force origin <branch>` |
| **Merge conflict on PR to `dev`** | `git checkout dev` → `git pull origin dev` → `git checkout <branch>` → `git rebase dev` → resolve → PR |
| **`demo` branch stale** | Rebase from `dev`: `git checkout demo` → `git rebase dev` → `git push --force origin demo` |
| **Two developers on same branch** | Each should have their own feature/milestone branch; merge to `dev` via PR, not direct commit |
| **Build fails on branch** | Fix failing tests/lint, then `npm run build` must pass before PR merge |

---

## Quick Commands Reference

```bash
# 1. Create a new milestone branch
git checkout dev
git pull origin dev
git checkout -b milestone/m2-inboxes
# ... work ...

# 2. Update branch with latest dev changes
git rebase dev
git push --force origin milestone/m2-inboxes

# 3. Open PR and merge
# (via GitHub/GitLab UI or git merge --no-ff dev)

# 3b. After PR merged, update dev
git checkout dev
git pull origin dev

# 4. Promote demo-ready PRs to demo branch
git checkout demo
git rebase dev
git push --force origin demo

# 5. Stale branch cleanup (rare)
git checkout dev
git branch -D <old-branch-name>
```

---

## Milestone-to-Branch Mapping (Quick Reference)

| Milestone | Primary Branch | Secondary/Demo |
|-----------|---------------|----------------|
| **M0** | `milestone/m0-demo-foundation` | `demo` |
| **M1** | `milestone/m1-audience-complete` | (update `demo` as M1 completes) |
| **M2** | `milestone/m2-inboxes` | (update `demo`) |
| **M3** | `milestone/m3-campaign-core` | (update `demo`) |
| **M4** | `milestone/m4-campaign-launch-ai-sending` | (update `demo`) |
| **M5** | `milestone/m5-replies-tasks-pipeline` | (update `demo`) |
| **M6** | `milestone/m6-reporting-billing-settings-public` | (update `demo`) |
| **M7** | `milestone/m7-admin-hardening-buffer` | (update `demo` for final closeout) |

---

*This guide is auto-generated from `TASKS.md` and the project branching strategy. Last updated: 12 November 2026.*