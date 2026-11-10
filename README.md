# Reyvo UI

React frontend for **Reyvo**, an outbound growth platform for staffing agencies. This repo covers
the marketing site and the account flows that lead into the product: registration, sign in, and the
post-registration welcome/setup page.

The backend lives in the separate `ReyvoAPI` repository and is expected at `http://localhost:8000`.

## Stack

| Concern    | Choice                                                   |
| ---------- | -------------------------------------------------------- |
| Framework  | React 19 (JavaScript, no TypeScript)                     |
| Build tool | Vite 8                                                   |
| Routing    | React Router 7 (`BrowserRouter`)                         |
| Styling    | Hand-written CSS with design tokens, one stylesheet per page |
| Fonts      | Instrument Serif (display) + Inter (body), loaded from Google Fonts |

No UI kit or CSS framework is used. Global tokens and base styles live in `src/index.css`; each
page owns its layout and responsive rules in its own folder.

## Getting started

```bash
npm install
npm run dev
```

The dev server runs at <http://localhost:5173>. Vite proxies any request starting with `/api` to
the backend, so the browser never makes a cross-origin call in development.

To run against a different backend:

```bash
# Windows PowerShell
$env:VITE_API_PROXY_TARGET = "http://localhost:9000"; npm run dev

# macOS / Linux
VITE_API_PROXY_TARGET=http://localhost:9000 npm run dev
```

### Start the API

From the `ReyvoAPI` repository:

```bash
uv run uvicorn reyvo.main:app --reload --loop reyvo.dev:selector_loop_factory
```

The API should answer on <http://localhost:8000>, and its CORS config already allows
`http://localhost:5173`.

### Production build

```bash
npm run build     # writes dist/
npm run preview   # serve the build locally
```

## Configuration

Copy `.env.example` to `.env` if you need to override the defaults.

| Variable                 | Default     | Purpose                                                              |
| ------------------------ | ----------- | -------------------------------------------------------------------- |
| `VITE_API_URL`           | `/api/v1`   | Base URL used by the API client. Use a full URL for a deployed API.  |
| `VITE_API_PROXY_TARGET`  | `http://localhost:8000` | Dev-only proxy target for `/api`.                       |

## Routes

| Path        | Page                | Notes                                                        |
| ----------- | ------------------- | ------------------------------------------------------------ |
| `/`         | Home                | Marketing page: hero, product mock, features, personas, process, security, pricing, FAQ, CTA |
| `/register` | Create workspace    | Validated registration form wired to `POST /auth/register`   |
| `/login`    | Sign in             | `POST /auth/login`, optional workspace slug                  |
| `/welcome`  | Workspace ready     | Post-registration checklist; refreshes the profile via `GET /auth/me` |
| `/terms`    | Terms of Service    | Static legal copy                                            |
| `/privacy`  | Privacy Policy      | Static legal copy                                            |
| `*`         | Not found           | Friendly 404 with links back                                  |

## Folder layout

Each page owns a folder, including its stylesheet:

```text
src/
  components/        Shared UI: header, footer, logo, form fields, icons
  lib/               API client, session storage, validation, timezone data
  pages/
    home/            HomePage.jsx + home.css
    register/        RegisterPage.jsx
    login/           LoginPage.jsx + login.css
    welcome/         WelcomePage.jsx + welcome.css
    legal/           LegalPage.jsx + legal.css (terms + privacy)
    not-found/       NotFoundPage.jsx + not-found.css
  styles/
    auth.css         Shared split layout for register and login
  App.jsx            Route table
  index.css          Design tokens, resets, buttons, utilities
  main.jsx           Entry point
```

## API integration

`src/lib/api.js` is the single place that talks to the backend. It:

- reads the base URL from `VITE_API_URL`;
- sends and parses JSON;
- unwraps the backend error envelope
  `{ error: { code, message, details: { errors }, request_id } }`;
- maps FastAPI validation errors (`details.errors[].loc`) onto form fields;
- turns network failures and 502/504 responses into a human message instead of "Failed to fetch".

Endpoints used:

| Method | Path              | Purpose                            |
| ------ | ----------------- | ---------------------------------- |
| `POST` | `/auth/register`  | Create a tenant and owner account  |
| `POST` | `/auth/login`     | Sign in, optionally with `tenant_slug` |
| `POST` | `/auth/refresh`   | Exchange a refresh token (helper is available) |
| `GET`  | `/auth/me`        | Refresh the profile on `/welcome`  |

Registration sends exactly the fields the API expects:

```json
{
  "email": "dana@youragency.com",
  "password": "at-least-12-characters",
  "full_name": "Dana Kim",
  "agency_name": "Northline Talent",
  "timezone": "America/New_York"
}
```

`physical_address` is optional on the API and is intentionally omitted; the backend defaults it.
A successful response is the `TokenPair` shape (`access_token`, `refresh_token`, `expires_in`,
`tenant`), which is stored in `localStorage` under `reyvo.session` by `src/lib/auth.js`.

## Validation and UX details

- Required fields are validated client-side before the request; the first invalid field is focused
  and scrolled into view.
- Passwords require 12+ characters, matching the backend rule. The strength meter is a guide, not a
  security guarantee.
- Timezone is auto-detected with `Intl` and grouped by region in the select.
- Server-side field errors replace the matching client error. A `409` is shown on the email field as
  "An account with this email already exists."
- The submit button shows a spinner and is disabled while a request is in flight.
- Auth pages collapse to a single column below 1024 px; the brand panel hides and a compact header
  takes its place.
- Short desktop viewports (`max-height: 860px`) drop the trial card on the brand panel so the form
  stays visible without scrolling.

## Notes

- The remaining in-product build is tracked task-by-task in [`TASKS.md`](./TASKS.md).
- The repo currently contains only the frontend. Registration and sign-in need the API running to
  complete; without it the form shows a clear "could not reach the Reyvo API" message with the
  backend start command.
- `/welcome` is resilient: if the profile refresh fails it falls back to the tenant stored in the
  session and shows a non-blocking notice.
- The dashboard is not part of this scope. `/welcome` links back to the marketing site and states
  that the dashboard is next.
