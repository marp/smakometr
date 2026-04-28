# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A Firefox browser extension (Manifest V2) that adds private notes and colour ratings to restaurants and dishes on pyszne.pl. All data is stored locally in `browser.storage.local` — nothing leaves the browser.

## Installation / development

There is no build step. Load the extension directly in Firefox:

1. Go to `about:debugging#/runtime/this-firefox`
2. Click **"Wczytaj tymczasowy dodatek…"**
3. Select `manifest.json` from this directory

After editing any file, click **Reload** on the debugging page for the extension to pick up changes. The content script is re-injected automatically.

There is no linter, test suite, or bundler configured.

## Architecture

### Storage key schema

All keys share the prefix `pysznepl_notes` and use `::` as a separator:

| Key pattern | Stores |
|---|---|
| `pysznepl_notes::restaurant::<slug>` | Restaurant note text |
| `pysznepl_notes::restaurant::<slug>::meta` | `{type, restaurantId, restaurantName, url, updatedAt}` |
| `pysznepl_notes::dish::<slug>::<dishNameLower>` | Dish note text |
| `pysznepl_notes::dish::<slug>::<dishNameLower>::meta` | `{type, restaurantId, dishName, url, updatedAt}` |
| `pysznepl_notes::rating::<slug>` | `"red"` / `"orange"` / `"green"` |
| `pysznepl_notes::rating::<slug>::meta` | `{type, restaurantId, restaurantName, url, updatedAt}` |

Restaurant ID (`slug`) = lowercase URL segment from `/menu/<slug>`.  
Dish ID = lowercase dish name text (heuristic — no stable public ID exists).

### Content script (`content/content.js`)

Runs on all `*.pyszne.pl` pages at `document_idle`. Main responsibilities:

- **`attachRestaurantWidget()`** — on `/menu/*` pages, locates the restaurant `<h1>` heading, builds a full toolbar (note + rating), and inserts it below the header flex row. Stretches it to match the container width via `ResizeObserver`.
- **`attachDishWidgets()`** — on `/menu/*` pages, iterates dish containers found via `DISH_CONTAINER_SELECTORS`, injects a compact note widget next to each dish name.
- **`attachListingCards()`** — on listing pages, finds restaurant cards (elements with class tokens starting with `restaurant-card`), injects a collapsible toolbar and wires up a hover tooltip showing the existing note.
- **`refresh()`** — calls all three attach functions plus `syncBodyRating()`. Always runs sequentially via a `refreshChain` promise to prevent duplicate injections from overlapping SPA renders.

SPA navigation is handled by a `MutationObserver` (debounced via `requestAnimationFrame`) plus a 750 ms `setInterval` URL-change poll.

Injected elements are marked with `data-pysznepl-note-attached="1"` to prevent double-attachment. Toolbars also store `data-pysznepl-restaurant-id` for deduplication across re-renders.

Rating CSS classes (`pysznepl-rated--red/orange/green`) are tracked via the `RATING_TARGETS` map (`restaurantId → Set<HTMLElement>`) so all visible instances update immediately when a rating changes.

**HTML templates** (`toolbar-card.html`, `toolbar-restaurant.html`, `note-widget.html`) are loaded once via `browser.runtime.getURL` + `fetch`, cached in module-scope `Map`s, and cloned per instance.

### Popup (`popup/popup.js` + `popup.html`)

Reads all `pysznepl_notes::*` keys, groups them by restaurant, and renders a filterable list. Supports:

- Full-text search across restaurant names, IDs, notes, and dish names
- Delete individual notes
- Export all notes as a timestamped JSON file
- Import notes from a previously exported JSON file

Re-renders automatically when `browser.storage.onChanged` fires.

### Selector resilience

`RESTAURANT_NAME_SELECTORS`, `DISH_CONTAINER_SELECTORS`, and `DISH_NAME_SELECTORS` in `content.js` are ordered lists of CSS selectors tried in sequence. If pyszne.pl changes its DOM structure, **add a new selector at the front** of the relevant array — do not remove existing ones, as they may still match older page variants.
