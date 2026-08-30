# AGENTS.md

## What this is

Static site — schedule viewer for NTU "DP" group G7.
HTML shell in `index.html`, CSS in `css/`, JS in `js/`. No build step.

## Quick start

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

No `npm install`, no build commands.

## Directory structure

```
index.html              HTML shell (structure + link/script tags only)
css/                    13 CSS files, one per UI section
js/                     14 JS files, one per functional module
supabase/
  functions/            Edge Functions (Deno)
    _shared/            Shared utilities (verify-admin)
    validate-telegram/  Telegram auth → JWT
    admin-delete-post/  Admin: delete single post
    admin-delete-comment/ Admin: delete single comment
    admin-clear-board/  Admin: clear all posts
  migrations/           SQL migration scripts
  config.toml           Supabase project config
.github/workflows/      GitHub Pages deployment
```

## CSS architecture

Each CSS file maps to a UI section. Load order in `index.html`:

| File | Covers |
|---|---|
| `base.css` | CSS variables, reset, body, floating BG |
| `app-container.css` | `.app-container` |
| `header.css` | Header, badges, title |
| `controls.css` | `.btn-brutal` and view-toggle buttons |
| `schedule.css` | Day cards, pair blocks, weekend card |
| `calendar.css` | Legend, month grid, calendar cells, today pulse |
| `shame.css` | Shame board grid, cards, champion ribbons |
| `reactions.css` | Reaction buttons, picker, animations |
| `comments.css` | Comment section, form, items |
| `modal.css` | Modal backdrop, form, file input, spinner |
| `confetti.css` | `#confettiCanvas` positioning |
| `footer.css` | Footer tags, clock badge |
| `auth.css` | Auth overlay, login prompt |

## JavaScript architecture

All scripts use global scope (no ES modules). Load order matters.

| File | Role | Depends on |
|---|---|---|
| `config.js` | Supabase URL, anon key, Edge Function URL, client init | Supabase CDN |
| `data.js` | `timeSlots`, `scheduleData`, `monthsData`, demo entries | — |
| `state.js` | All mutable globals (`currentUser`, `currentView`, caches, etc.) | — |
| `utils.js` | `escapeHtml`, `initHoverZIndexFix`, `initFloatingBackground` | — |
| `confetti.js` | Canvas setup, `spawnConfettiBurst` | `state.js` |
| `schedule.js` | `renderSchedule`, `createDayCard` | `data.js`, `state.js`, `utils.js` |
| `calendar.js` | `renderCalendar`, `toggleMonth`, `toggleAllMonths` | `data.js`, `state.js`, `utils.js`, `confetti.js` |
| `clock.js` | `getCurrentPairNum`, `updateClockAndCountdown` | `data.js` |
| `reactions.js` | Reaction UI, `upsert_reaction` RPC | `state.js`, `config.js` |
| `comments.js` | Comment load/render/submit, admin delete | `state.js`, `config.js`, `utils.js`, `auth.js` |
| `shame-board.js` | Shame board core, `clearBoard`, admin delete post | `state.js`, `config.js`, `reactions.js`, `utils.js`, `confetti.js`, `auth.js` |
| `shame-form.js` | Modal, file validation, `handleShameSubmit` | `config.js`, `state.js`, `shame-board.js`, `confetti.js`, `utils.js`, `auth.js` |
| `auth.js` | Telegram auth, session management, admin UI | `config.js`, `state.js` |
| `app.js` | `setViewMode`, `DOMContentLoaded` bootstrap | all above |

## Script load order

```
Supabase CDN → config → data → state → utils → confetti →
schedule → calendar → clock → reactions → comments →
shame-board → shame-form → auth → app
```

Changing this order will break the app.

## Authentication & authorization

### Telegram Mini App auth flow

1. User opens site via Telegram bot
2. `auth.js` calls `restoreSession()` — checks localStorage for saved token
3. If no session: shows login prompt overlay
4. User clicks "УВІЙТИ ЧЕРЕЗ TELEGRAM"
5. `auth.js` calls `authenticateWithTelegram()`:
   - Gets `initData` from Telegram WebApp SDK
   - POSTs to `validate-telegram` Edge Function
   - Edge Function validates HMAC-SHA256 signature with bot token
   - Edge Function upserts `telegram_users`, creates auth user, returns JWT
   - Frontend stores JWT in localStorage, sets `currentUser`

### User roles

| Role | Capabilities |
|---|---|
| Unauthenticated | View schedule, calendar, shame board (read-only) |
| Authenticated user | + React, comment, submit shame posts |
| Administrator | + Delete any post, delete any comment, clear entire board |

### Admin identification

- Admin is identified by Telegram numeric user ID
- `ADMIN_TELEGRAM_ID` stored as Supabase Edge Function secret (not in frontend)
- Server-side check: Edge Function decodes JWT → looks up `telegram_users.telegram_id` → compares to `ADMIN_TELEGRAM_ID`
- Frontend `currentUser.is_admin` flag is computed server-side and returned with auth response
- **Hiding buttons is NOT security** — all admin operations are enforced server-side

### Security model

| Operation | Enforcement |
|---|---|
| Reactions | `upsert_reaction` RPC requires `auth.uid()` |
| Comments insert | RLS: `user_id = auth.uid()` |
| Post insert | RLS: `creator_id = auth.uid()` |
| Post delete | Admin Edge Function only (no RLS DELETE policy) |
| Comment delete | Admin Edge Function only (no RLS DELETE policy) |
| Clear board | Admin Edge Function only (no RLS DELETE policy) |

## Supabase integration

- **Credentials**: hardcoded in `js/config.js` (not env vars)
- **Edge Functions**: deployed via `supabase functions deploy`
- **Edge Function secrets**: `TELEGRAM_BOT_TOKEN`, `ADMIN_TELEGRAM_ID`, `SUPABASE_SERVICE_ROLE_KEY`
- **Tables**: `board_entries`, `comments`, `reactions`, `telegram_users`
- **Storage**: `board-photos` bucket
- **RPC**: `upsert_reaction` (add/toggle/remove reaction)
- **Views**: `reaction_counts` (aggregate emojis per entry)
- **Schema**: see `supabase/migrations/001_telegram_auth.sql`

## Deploy

Push to `main` → GitHub Pages auto-deploys via `.github/workflows/static.yml`. No build step.

## Gotchas

- **Language is Ukrainian** — UI text, code comments, variable names
- **No tests, no lint, no typecheck** — no verification commands exist
- **Schedule data is hardcoded** in `js/data.js` — edit `scheduleData` and `monthsData` to update
- **Global scope** — all JS variables and functions live on `window`. No modules, no bundler.
- **Inline `onclick` handlers** in HTML call globally-scoped functions defined in JS files
- **Auth required for interactive features** — reactions, comments, shame submission require login
- **Admin UI is cosmetic only** — server enforces authorization regardless of button visibility

## Constraints

- No build system, no bundler, no transpiler
- No ES modules — all scripts are classic `<script src>` tags
- GitHub Pages serves static files only
- Local dev: `python3 -m http.server 8000` (not `file://` — Supabase and some features require HTTP)
