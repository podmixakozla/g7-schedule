# AGENTS.md

## What this is

Single-file static site (`index.html`) — schedule viewer for NTU "DP" group G7.
All HTML, CSS, JS, and data are inline in one file. No build step.

## Quick start

Open `index.html` in a browser. No `npm install`, no build commands.

## Architecture

- `index.html` — entire app (CSS, JS, schedule data, calendar data)
- `.github/workflows/static.yml` — deploys to GitHub Pages on push to `main`
- Supabase (hardcoded keys) — backend for the "Shame Board" feature only

## Gotchas

- **Language is Ukrainian** — UI text, code comments, variable names
- **Supabase credentials are hardcoded** in the HTML (not env vars)
- **No tests, no lint, no typecheck** — no verification commands exist
- **Schedule data is hardcoded** in JS arrays — to update the schedule, edit the `scheduleData` and `monthsData` objects in the script
- **Supabase schema is not in this repo** — database schema, RLS policies, cron jobs (auto-cleanup, champion rotation), and `increment_reaction` function live only in the Supabase dashboard/SQL Editor. Changes must be made manually there.

## Deploy

Push to `main` → GitHub Pages auto-deploys. No build step.
