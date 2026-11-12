# Reyvo — Installation Guide

Generated: 13 November 2026
Purpose: Onboard new developers to the Reyvo MVP development environment.

> **Important:** This guide was created based on the project setup verified on **13 Nov 2026**. Some tool versions may have moved on since then; use as a starting point and adjust as needed.

---

## 1. Prerequisites

| Tool | Minimum Version | Installation Notes |
|------|----------------|-------------------|
| **Node.js** | `v26.13.0` (or latest LTS) | Download from: https://nodejs.org/ <br> **Check:** `node -v` <br> **Also installs:** `npm` |
| **npm** | `12.2.2` (comes with Node) | Check: `npm -v` <br> If missing: use `corepack enable` or nvm |
| **Git** | `2.40+` (or latest) | Download from: https://git-scm.com/ <br> **Check:** `git --version` |
| **PowerShell** | `5.1+` (Windows) / `7+` (cross-platform) | Pre-installed on Windows 10/11 <br> **Check:** `powershell -version` |
| **GitHub CLI** (optional) | `2.60+` | Optional for PR workflow <br> **Check:** `gh --version` |
| **Python** | `v3.11+` | Required for ReyvoApi backend. Download from: https://python.org/ <br> **Check:** `python -V` <br> **Also installs:** `pip` |
| **PostgreSQL** | `v15+` | Required for ReyvoApi data storage. Download from: https://www.postgresql.org/ <br> **Check:** `psql --version` <br> **Service:** Must be running (`pg_ctlcluster 15 main start` or via GUI) <br> **Default DB:** `reyvo` <br> **Default user:** `postgres` |
| **Redis** | `v7+` | Required for ReyvoApi caching/queues. Download from: https://redis.io/ <br> **Check:** `redis-server --version` <br> **Service:** Must be running (`redis-server --daemonize yes`) <br> **Default port:** `6379` |

> **Windows Note:** The project was developed on **PowerShell 5.1**. Some commands (e.g., `&&` statement separator) behave differently than in PowerShell 7+. If you encounter issues, try PowerShell 7+ or use the Git Bash terminal.

---

## 2. ReyvoUI (Frontend) Setup

### 2.1 Clone the Repository

```bash
# From your terminal
git clone <repo-url>
cd reyvo/ReyvoUI
# Or, if you already have the repo:
cd ReyvoUI
git checkout dev          # switch to development branch
git pull origin dev       # pull latest changes
```

### 2.2 Install Dependencies

```bash
# From the ReyvoUI directory
npm install
# Or, if npm is unavailable:
#   corepack enable   # (if using Node 16.20+ / pnpm)
#   pnpm install
```

> **What this does:** Installs all packages listed in `package.json` (React 19, Vite 8, UI kit, etc.)

### 2.3 Verify Build

```bash
npm run build
# Expected output:
#   vite v8.3.7 building client environment for production...
#   ✓ 126 modules transformed.
#   ✓ built in 575ms
```

> **If build fails:** Check Node version compatibility. The project was built with Node `v26.13.0` and Vite `v8.3.7`.

### 2.4 Run Dev Server

```bash
npm run dev
# Starts Vite dev server at http://localhost:5173
```

### 2.5 Run Tests (if applicable)

```bash
npm test    # or: npx vitest run
```

### 2.6 E2E Testing (Puppeteer)

The project uses Puppeteer-core for browser automation. To run the verification scripts:

```bash
# Install puppeteer dependencies (already in node_modules)
# The project uses a localized puppeteer at:
#   C:\Users\Tootsie\AppData\Local\Temp\opencode\reyvo-t09-e2e\node_modules\puppeteer-core

# Ensure Chrome is available at:
#   C:/Program Files/Google/Chrome/Application/chrome.exe

# Run a quick check:
#   The E2E script was previously run from:
#   C:\Users\Tootsie\AppData\Local\Temp\opencode\reyvo-t16-e2e\verify-t01-t16.js
```

---

## 3. ReyvoApi (Backend) Setup

### 3.1 Prerequisites (Already Listed Above)

Before starting the API, ensure these are installed and running:

- **Python `v3.11+`** — `python -V` should show Python 3.11+
- **PostgreSQL `v15+`** — Service must be running; `psql` should work
- **Redis `v7+`** — Server must be running; `redis-cli ping` should return `PONG`

### 3.2 Create the Database

```bash
# Create the reyvo database in PostgreSQL
createdb reyvo

# Or, if using the default postgres user:
# psql -c "CREATE DATABASE reyvo;"

# Verify
psql -U postgres -d reyvo \dt
```

### 3.3 Configure Redis

```bash
# Start Redis (if not already running)
redis-server --daemonize yes

# Verify
redis-cli ping
# Expected: PONG
```

### 3.3 Install Python Dependencies

```bash
# From the ReyvoApi directory
cd reyvo/ReyvoApi
pip install -r requirements.txt
# If no requirements.txt exists:
pip install fastapi uvicorn sqlalchemy psycopg2-binary redis httpx
```

### 3.4 Run the API Server

```bash
# From the ReyvoApi directory
cd reyvo/ReyvoApi
uvicorn reyvo.main:app --reload --port 8000
# Or, if using npm:
#   npm run dev   (if configured in package.json)
```

> **Expected:** API starts at `http://127.0.0.1:8000`

### 3.5 API Health Check

```bash
# Verify the API is running
curl http://127.0.0.1:8000/health/ready
# Expected: {"ok": true}

# View OpenAPI spec
curl http://127.0.0.1:8000/openapi.json
# Expected: 62 paths, 97 schemas (OpenAPI 3.1)
```

---

## 4. Development Workflow

| Step | Command | Description |
|------|---------|-------------|
| **1. Sync dev branch** | `git checkout dev && git pull origin dev` | Get the latest integration branch |
| **2. Create a milestone branch** | `git checkout -b milestone/m1-audience-complete` | Branch from `dev` for a milestone |
| **3. Work and commit** | `git add . && git commit -m "feat: ..."` | Make your changes |
| **4. Rebase onto dev** | `git rebase dev` | Keep your branch up to date |
| **5. Push and PR** | `git push --force origin <branch>` <br> Open PR to `dev` | Share work and get review |
| **6. Promote to demo** | `git checkout demo && git rebase dev && git push --force origin demo` | Push demo-ready state for client walkthroughs |

---

## 5. IDE / Editor Setup

| Tool | Purpose | Installation |
|------|---------|--------------|
| **VS Code** (recommended) | Edit code, debug, run tasks | https://code.visualstudio.com/ |
| **OpenCode** (AI agent) | AI-assisted development, code generation, verification | Part of the Code Mode environment |
| **Node.js Extension Pack** | Syntax highlighting, linting, debugging | VS Code Marketplace |
| **Python Extension Pack** | Syntax highlighting, linting, debugging (for API dev) | VS Code Marketplace |
| **GitLens** | Enhanced git blame, history, reviews | VS Code Marketplace |

> **VS Code settings** (recommended):
> - `editor.formatOnSave: true`
> - `terminal.integrated.powerShell.entitlementPermissions` (allow git scripts)
> - `python.envPath` (point to your Python virtual env if used)

---

## 6. Project-Specific Tools

| Tool | Location / Path | Purpose |
|------|----------------|---------|
| **Puppeteer-core** | `C:\Users\Tootsie\AppData\Local\Temp\opencode\reyvo-t09-e2e\node_modules\puppeteer-core` | E2E browser automation (headless Chromium) |
| **Chrome Browser** | `C:\Program Files\Google\Chrome\Application\chrome.exe` | Required for Puppeteer tests |
| **Vite** | `D:\- files\GitHub\Reyvo\ReyvoUI\node_modules\vite` | Dev server + production build |
| **OpenAPI schema** | `D:\- files\GitHub\Reyvo\ReyvoUI\docs\openapi.json` | API contract (62 paths, 97 schemas) |
| **TASKS.md** | `D:\- files\GitHub\Reyvo\ReyvoUI\TASKS.md` | Backlog/spec (T01–T53, milestones, schedule) |

---

## 7. Troubleshooting

| Issue | Resolution |
|-------|------------|
| **`npm` not recognized** | Ensure Node.js is installed and `npm` is in PATH. <br> Try: `corepack enable` <br> Or use `nvm` to manage Node versions. |
| **`&&` not valid statement separator** | PowerShell 5.1 does not support `&&` as a statement separator. <br> Use separate lines or PowerShell 7+. |
| **Build fails with Vite errors** | Check Node version: `node -v` should be `v26.13.0` (or compatible). <br> Clear cache: `rm -rf node_modules && rm package-lock.json && npm install`. |
| **Puppeteer can't find Chrome** | Ensure Chrome is at `C:/Program Files/Google/Chrome/Application/chrome.exe`. <br> Or set `executablePath` in the E2E script. |
| **`git rebase` conflicts** | Resolve conflicts manually, then: `git rebase --continue`. <br> Or use `git merge dev` as alternative. |
| **Branch out of sync** | `git checkout dev && git pull origin dev` <br> then re-create your feature branch from the updated `dev`. |
| **Python not found** | Ensure Python `v3.11+` is installed and `python` is in PATH. <br> Add to PATH manually if needed. |
| **PostgreSQL not running** | Start the PostgreSQL service: <br> `pg_ctlcluster 15 main start` (or via GUI pgAdmin). <br> Create the `reyvo` database if needed. |
| **Redis not running** | Start Redis: `redis-server --daemonize yes` <br> Verify: `redis-cli ping` → `PONG`. |

---

## 7. Quick Start Checklist

[ ] Node.js `v26.13.0+` installed  
[ ] `npm -v` shows `12.2.2+`  
[ ] `git --version` works  
[ ] `git checkout dev && git pull origin dev` succeeds  
[ ] `cd ReyvoUI && npm install` completes  
[ ] `npm run build` passes (no critical errors)  
[ ] `npm run dev` starts at `http://localhost:5173`  
[ ] `git checkout -b milestone/m1-audience-complete` works (branch creation)  
[ ] **Python `v3.11+` installed** — `python -V` works  
[ ] **PostgreSQL running** — `psql --version` works, `createdb reyvo` works  
[ ] **Redis running** — `redis-server --daemonize yes` works, `redis-cli ping` → `PONG`  

---

*This guide is based on the project state as of **13 November 2026**. Tool versions may have moved on since then; adjust as needed for your local environment. For questions, consult the lead developer or the `TASKS.md` backlog.*