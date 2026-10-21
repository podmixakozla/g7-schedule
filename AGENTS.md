# AGENTS.md

## What this is

Static site & Telegram Mini App — schedule viewer, academic calendar, and community board ("Дошка ганьби") for NTU "Dnipro Polytechnic" specialty G7 (`АР-26-1` and `АР-26ск-1`).
HTML shell in `index.html`, CSS in `css/`, JS in `js/`. No build step.

## Quick start

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

No `npm install`, no build commands.

### Useful URL parameters (for testing & deep-linking)

- `?view=today|week|calendar|shame` — open a specific view
- `?group=AR-26-1|AR-26sk-1` — select subgroup
- `?theme=dark|light` — force color scheme
- `?now=2026-10-21T10:00` — simulate a specific date/time for live pair & calendar testing

## Directory structure

```
index.html              HTML shell (structure + link/script tags with ?v= cache-busting)
css/                    14 CSS files, one per UI section
js/                     17 JS files, one per functional module
supabase/
  functions/            Edge Functions (Deno)
    _shared/            Shared utilities (verify-admin)
    validate-telegram/  Telegram auth → JWT (+ visit logging & starosta status)
    admin-visits/       Log visits (7-day rolling retention), list visits & assign/remove starostas (admin only)
    starosta-announcements/ Publish/delete important news from starostas (+ Telegram bot broadcast)
    sync-schedule/      Auto-sync schedule every 1h from nmu.org.ua ЕТФ Excel (.xlsx) + Telegram bot diff notifications
    admin-delete-post/  Admin: delete single post
    admin-delete-comment/ Admin: delete single comment
    admin-clear-board/  Admin: clear all posts
  migrations/           SQL migration scripts (001..009)
  config.toml           Supabase project config
.github/workflows/      GitHub Pages deployment + 1-hour schedule auto-sync cron
```

## Design system

- **Base palette**: `#121212` dark carbon background + blurred olive-green radial glow (`body::before`, `blur(120px)`, `opacity: 0.25`).
- **Accent 1 (Lime `#D4F54A`, dark text `#121212`)**: strictly for active states — selected tab, active subgroup pill, "today" cell/badge, active bottom nav circle, primary CTA button.
- **Accent 2 (Electric Blue `#4558E6`, white text `#FFFFFF`)**: for the featured live/next pair hero card (`#nowCard`) and the current month card in the academic calendar.
- **Cards**: `rgba(255, 255, 255, 0.06)`, `border-radius: 24px`, subtle hairline border, `18–20px` padding, `200ms` transitions.
- **Typography**: `Poppins` + `Urbanist` + `Manrope` (Cyrillic geometric support). Bold `600–700` headings, secondary text `#9A9A9A` at `13px` (`0.8125rem`).
- **Icons**: inline Lucide SVG icons via `icon()` / `hydrateIcons()` in `js/utils.js` (no emojis in UI chrome).

## CSS architecture

Each CSS file maps to a UI section. Load order in `index.html`:

| File | Covers |
|---|---|
| `base.css` | CSS variables (dark/light tokens), reset, `body::before` olive glow, skeletons, toasts |
| `app-container.css` | `.app`, `.content`, `.view`, `.section-head` |
| `header.css` | Sticky `.topbar`, `.brand`, `.group-switch` pill, `.user-slot` profile menu |
| `controls.css` | `.btn`, `.segmented`, `.chip`, mobile circular `.tabbar` dock & desktop pill nav |
| `schedule.css` | `#nowCard` (`#4558E6` hero + `.now-wave`), `.day-strip`, `.day-card`, "Daily Activities" `.pair` timeline |
| `calendar.css` | `.legend`, `.months` grid, `#4558E6` current month card, circular `.cal-cell` dates, `#D4F54A` today |
| `shame.css` | `.shame-grid`, `.shame-card`, champion highlight, `.lightbox-overlay` |
| `visits.css` | Admin-only 5th tab: `.visits-stats`, `.visits-card`, `.visit-row` |
| `reactions.css` | `.reactions-bar`, `.reaction-pill`, portal `.reaction-picker` |
| `comments.css` | `.comment-preview`, expandable `.comments-section`, `.comment-item`, `.comment-form` |
| `modal.css` | `.sheet-backdrop`, `.sheet` bottom-sheet/modal, `.form`, `.input`, `.file-drop`, `.spinner` |
| `confetti.css` | `#confettiCanvas` fixed overlay |
| `footer.css` | `.footer` |
| `auth.css` | `.auth-sheet-body`, `.auth-emblem` |

## JavaScript architecture

All scripts use global scope (no ES modules). Load order matters.

| File | Role | Depends on |
|---|---|---|
| `config.js` | Supabase URL, anon key, Edge Function URL, client init | Supabase CDN |
| `data.js` | `timeSlots`, `GROUP_LABELS`, `fallbackScheduleRows`, `monthsData` | — |
| `state.js` | All mutable globals (`currentUser`, `currentView`, `currentGroup`, caches, URL params) | `data.js` |
| `utils.js` | `escapeHtml`, `plural`, Lucide SVG `icon()`, `toast()`, `uiConfirm()`, `openSheet()`/`closeSheet()` | — |
| `academic.js` | `getIsNumerator`, `getDayType`, `isTeachingDay`, `parsePairParity`, `isPairOnDate` | `data.js` |
| `confetti.js` | Canvas setup, `spawnConfettiBurst` | `state.js` |
| `schedule.js` | `initSchedule`, `renderSchedule`, `renderDayStrip`, `createDayCard`, `createPairRow` | `data.js`, `state.js`, `utils.js`, `academic.js` |
| `schedule-admin.js` | Schedule lesson CRUD modal & `admin-upsert-lesson` / `admin-delete-lesson` calls | `config.js`, `state.js`, `utils.js`, `schedule.js`, `auth.js` |
| `calendar.js` | `renderCalendar`, `toggleMonth`, `toggleAllMonths`, `triggerStudentDayEasterEgg` | `data.js`, `state.js`, `utils.js`, `academic.js`, `confetti.js` |
| `clock.js` | `getCurrentPairNum`, `computeScheduleStatus`, `updateClockAndCountdown`, `buildNowCardHtml` | `data.js`, `academic.js`, `schedule.js` |
| `auth.js` | Telegram auth, session refresh, `callEdgeFunction`, `renderUserSlot` | `config.js`, `state.js`, `utils.js` |
| `reactions.js` | Reaction UI, portal picker, `upsert_reaction` RPC | `state.js`, `config.js`, `auth.js` |
| `comments.js` | Comment load/render/submit, admin delete | `state.js`, `config.js`, `utils.js`, `auth.js` |
| `shame-board.js` | Shame board core, `clearBoard`, admin delete post, photo lightbox | `state.js`, `config.js`, `reactions.js`, `utils.js`, `confetti.js`, `auth.js` |
| `shame-form.js` | Modal, file validation & preview, `handleShameSubmit` | `config.js`, `state.js`, `shame-board.js`, `confetti.js`, `utils.js`, `auth.js` |
| `visits.js` | Visit logging (`logCurrentVisit`) & admin-only 7-day visits viewer (`loadAdminVisits`) | `config.js`, `state.js`, `utils.js`, `auth.js` |
| `app.js` | Theme sync, `setViewMode`, `DOMContentLoaded` bootstrap | all above |

## Script load order

```
Supabase CDN → Telegram SDK → config → data → state → utils → academic →
confetti → schedule → schedule-admin → calendar → clock → auth →
reactions → comments → shame-board → shame-form → app
```

Changing this order will break the app.

## Authentication & authorization

### Telegram Mini App auth flow

1. User opens site via Telegram bot (or browser)
2. `auth.js` calls `restoreSession()` — checks `localStorage` for saved token; if inside Telegram Mini App (`Telegram.WebApp.initData`), auto-authenticates via `validate-telegram`
3. If unauthenticated user triggers a protected action, `showAuthOverlay()` opens the login sheet
4. `authenticateWithTelegram()` POSTs `initData` to `validate-telegram` Edge Function, which validates HMAC-SHA256 signature with bot token, upserts `telegram_users`, and returns a Supabase JWT

### User roles

| Role | Capabilities |
|---|---|
| Unauthenticated | View schedule (`АР-26-1` & `АР-26ск-1`), calendar, shame board (read-only), read/expand/dismiss starosta announcements in `#nowCard` |
| Authenticated user | + React, comment, submit shame posts |
| Starosta (`is_starosta`) | + 5th tab "Важливі новини": publish/remove important news shown in `#nowCard` and broadcast via Telegram bot |
| Administrator | + Starosta by default (6th tab "Важливі новини"), 5th tab "Візити та старости" (7-day rolling visit log + appoint/remove starostas), delete any post/comment, clear entire board |

### Security model

| Operation | Enforcement |
|---|---|
| Reactions | `upsert_reaction` RPC requires `auth.uid()` |
| Comments insert | RLS: `user_id = auth.uid()` |
| Post insert | RLS: `creator_id = auth.uid()` |
| Schedule edit (`AR-26-1`) | `admin-upsert-lesson` / `admin-delete-lesson` Edge Functions (admin only) |
| Schedule edit (`AR-26sk-1`) | `admin-upsert-lesson` / `admin-delete-lesson` Edge Functions (any authenticated user) |
| Post / Comment delete / Clear board | Admin Edge Functions only (no RLS DELETE policy) |

## Supabase integration

- **Credentials**: hardcoded in `js/config.js` (anon key)
- **Edge Functions**: deployed via `supabase functions deploy`
- **Edge Function secrets**: `TELEGRAM_BOT_TOKEN`, `ADMIN_TELEGRAM_ID`, `SUPABASE_SERVICE_ROLE_KEY`
- **Tables**: `schedule_lessons`, `board_entries`, `comments`, `reactions`, `telegram_users`
- **Storage**: `board-photos` bucket
- **RPC**: `upsert_reaction` (add/toggle/remove reaction)
- **Views**: `reaction_counts` (aggregate emojis per entry)
- **Migrations**: `supabase/migrations/001_telegram_auth.sql` .. `004_schedule_lessons.sql`

## Deploy & cache busting

- Push to `main` → GitHub Pages auto-deploys via `.github/workflows/static.yml`.
- When changing CSS or JS files, bump the `?v=...` query parameter on `<link>` and `<script>` tags in `index.html` so mobile browsers and Telegram WebView immediately load fresh assets.
