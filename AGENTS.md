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
css/                    12 CSS files, one per UI section
js/                     13 JS files, one per functional module
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

## JavaScript architecture

All scripts use global scope (no ES modules). Load order matters.

| File | Role | Depends on |
|---|---|---|
| `config.js` | Supabase URL, anon key, client init | Supabase CDN |
| `data.js` | `timeSlots`, `scheduleData`, `monthsData`, demo entries | — |
| `state.js` | All mutable globals (`currentView`, caches, etc.) | — |
| `utils.js` | `escapeHtml`, `initHoverZIndexFix`, `initFloatingBackground` | — |
| `confetti.js` | Canvas setup, `spawnConfettiBurst` | `state.js` |
| `schedule.js` | `renderSchedule`, `createDayCard` | `data.js`, `state.js`, `utils.js` |
| `calendar.js` | `renderCalendar`, `toggleMonth`, `toggleAllMonths` | `data.js`, `state.js`, `utils.js`, `confetti.js` |
| `clock.js` | `getCurrentPairNum`, `updateClockAndCountdown` | `data.js` |
| `reactions.js` | Reaction UI, localStorage, Supabase RPC | `state.js`, `config.js` |
| `comments.js` | Comment load/render/submit | `state.js`, `config.js`, `utils.js` |
| `shame-board.js` | Shame board core, `clearBoard` | `state.js`, `config.js`, `reactions.js`, `utils.js`, `confetti.js` |
| `shame-form.js` | Modal, file validation, `handleShameSubmit` | `config.js`, `state.js`, `shame-board.js`, `confetti.js`, `utils.js` |
| `app.js` | `setViewMode`, `DOMContentLoaded` bootstrap | all above |

## Script load order

```
Supabase CDN → config → data → state → utils → confetti →
schedule → calendar → clock → reactions → comments →
shame-board → shame-form → app
```

Changing this order will break the app.

## Supabase integration

- **Credentials**: hardcoded in `js/config.js` (not env vars)
- **Tables**: `board_entries`, `comments`
- **Storage**: `board-photos` bucket
- **RPC**: `increment_reaction`
- **Schema is not in this repo** — RLS policies, cron jobs (auto-cleanup, champion rotation), and the `increment_reaction` function live only in the Supabase dashboard. Changes must be made manually there.

## Deploy

Push to `main` → GitHub Pages auto-deploys via `.github/workflows/static.yml`. No build step.

## Gotchas

- **Language is Ukrainian** — UI text, code comments, variable names
- **No tests, no lint, no typecheck** — no verification commands exist
- **Schedule data is hardcoded** in `js/data.js` — edit `scheduleData` and `monthsData` to update
- **Global scope** — all JS variables and functions live on `window`. No modules, no bundler.
- **Inline `onclick` handlers** in HTML call globally-scoped functions defined in JS files

## Constraints

- No build system, no bundler, no transpiler
- No ES modules — all scripts are classic `<script src>` tags
- GitHub Pages serves static files only
- Local dev: `python3 -m http.server 8000` (not `file://` — Supabase and some features require HTTP)
