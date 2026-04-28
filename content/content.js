"use strict";

const STORAGE_PREFIX = "pysznepl_notes";
const MARKER_ATTR = "data-pysznepl-note-attached";

const RATING_VALUES = ["red", "orange", "green"];
const RATING_LABELS = {
  red: "Słaba (czerwony)",
  orange: "Średnia (pomarańczowy)",
  green: "Dobra (zielony)",
  none: "Bez oceny",
};

const RESTAURANT_NAME_SELECTORS = [
  'h1[data-qa="restaurant-info-name"]',
  'h1[data-qa="restaurant-name"]',
  'h1[data-testid="restaurant-name"]',
  '[data-qa="restaurant-info-name"]',
  '[data-testid="restaurant-info-name"]',
  "header h1",
  "main h1",
  "h1",
];

const DISH_CONTAINER_SELECTORS = [
  '[data-qa="menu-item"]',
  '[data-testid="menu-item"]',
  'article[class*="menu-item" i]',
  'li[class*="menu-item" i]',
  'div[class*="MenuItem"]',
  'li[class*="MenuItem"]',
  'article[class*="MenuItem"]',
  'button[class*="MenuItem"]',
];

const DISH_NAME_SELECTORS = [
  '[data-qa="menu-item-name"]',
  '[data-testid="menu-item-name"]',
  '[class*="menu-item__name" i]',
  '[class*="MenuItem__name"]',
  '[class*="MenuItem-name"]',
  '[class*="ItemName"]',
  "h3",
  "h4",
  '[class*="title" i]',
  '[class*="name" i]',
];

function getRestaurantId() {
  const match = location.pathname.match(/\/menu\/([^\/?#]+)/i);
  if (match) return decodeURIComponent(match[1]).toLowerCase();
  return location.pathname.replace(/\/+$/, "").toLowerCase() || "/";
}

function isRestaurantPage() {
  return /\/menu\//i.test(location.pathname);
}

function storageKey(parts) {
  return [STORAGE_PREFIX, ...parts].join("::");
}

async function getNote(key) {
  try {
    const result = await browser.storage.local.get(key);
    return result[key] || "";
  } catch (e) {
    console.warn("[pyszne notatki] storage.get failed", e);
    return "";
  }
}

async function setNote(key, value, meta) {
  try {
    if (value && value.trim()) {
      await browser.storage.local.set({
        [key]: value,
        [key + "::meta"]: { ...meta, updatedAt: Date.now() },
      });
    } else {
      await browser.storage.local.remove([key, key + "::meta"]);
    }
  } catch (e) {
    console.warn("[pyszne notatki] storage.set failed", e);
  }
}

function ratingKey(restaurantId) {
  return storageKey(["rating", restaurantId]);
}

async function getRating(restaurantId) {
  try {
    const key = ratingKey(restaurantId);
    const result = await browser.storage.local.get(key);
    const value = result[key];
    return RATING_VALUES.includes(value) ? value : "";
  } catch (e) {
    return "";
  }
}

async function setRating(restaurantId, value, meta) {
  const key = ratingKey(restaurantId);
  try {
    if (RATING_VALUES.includes(value)) {
      await browser.storage.local.set({
        [key]: value,
        [key + "::meta"]: {
          ...meta,
          type: "rating",
          restaurantId,
          updatedAt: Date.now(),
        },
      });
    } else {
      await browser.storage.local.remove([key, key + "::meta"]);
    }
  } catch (e) {
    console.warn("[pyszne notatki] storage.set rating failed", e);
  }
}

const RATING_TARGETS = new Map(); // restaurantId -> Set<HTMLElement>

function registerRatingTarget(restaurantId, el) {
  if (!RATING_TARGETS.has(restaurantId)) {
    RATING_TARGETS.set(restaurantId, new Set());
  }
  RATING_TARGETS.get(restaurantId).add(el);
}

function applyRatingClass(el, value) {
  if (!el) return;
  for (const c of RATING_VALUES) {
    el.classList.remove(`pysznepl-rated--${c}`);
  }
  el.classList.remove("pysznepl-rated");
  if (value) {
    el.classList.add("pysznepl-rated", `pysznepl-rated--${value}`);
  }
}

function applyRatingToTargets(restaurantId, value) {
  const set = RATING_TARGETS.get(restaurantId);
  if (!set) return;
  for (const el of set) applyRatingClass(el, value);
}

function findAll(selectors, root = document) {
  const seen = new Set();
  const results = [];
  for (const sel of selectors) {
    root.querySelectorAll(sel).forEach((el) => {
      if (!seen.has(el)) {
        seen.add(el);
        results.push(el);
      }
    });
  }
  return results;
}

function isVisibleElement(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = getComputedStyle(el);
  return !(style.visibility === "hidden" || style.display === "none");
}

function parsePx(value) {
  const n = parseFloat(value || "0");
  return Number.isFinite(n) ? n : 0;
}

function findBestRestaurantHeading() {
  const candidates = findAll(RESTAURANT_NAME_SELECTORS)
    .filter((el) => el && el.textContent && el.textContent.trim())
    // Never treat our injected toolbar note preview (<h1>) as the restaurant title.
    .filter((el) => !el.closest(".pysznepl-toolbar"))
    .filter(isVisibleElement);

  if (!candidates.length) return null;

  // Prefer the most prominent (largest font-size). Tie-break by being closer
  // to the top of the page.
  candidates.sort((a, b) => {
    const fa = parsePx(getComputedStyle(a).fontSize);
    const fb = parsePx(getComputedStyle(b).fontSize);
    if (fb !== fa) return fb - fa;
    return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
  });
  return candidates[0] || null;
}

function findRestaurantHeaderContainer(heading) {
  if (!heading) return null;
  // Prefer the section padding container so the toolbar aligns with the whole
  // header area (including actions column on the right).
  return (
    heading.closest('[data-qa="page-section"] [data-qa="util"]') ||
    heading.closest('[data-qa="util"]') ||
    heading.closest('[data-qa="flex"]') ||
    heading.parentElement
  );
}

function stretchToolbarToContainer(toolbar, container) {
  if (!toolbar || !container) return;
  const cr = container.getBoundingClientRect();
  const tr = toolbar.getBoundingClientRect();
  if (!cr.width || !tr.width) return;

  // Shift horizontally so the toolbar aligns with the container's left edge,
  // and expand to the container's full width.
  const deltaLeft = cr.left - tr.left;
  toolbar.style.marginLeft = `${deltaLeft}px`;
  toolbar.style.width = `${cr.width}px`;
  toolbar.style.maxWidth = `${cr.width}px`;
}

function setupToolbarStretch(toolbar, container) {
  if (!toolbar || !container) return;

  // Avoid wiring twice for the same container.
  if (toolbar._pyszneplStretchContainer === container) {
    requestAnimationFrame(() => stretchToolbarToContainer(toolbar, container));
    return;
  }

  // Clean up previous observers.
  if (toolbar._pyszneplStretchObserver) {
    try {
      toolbar._pyszneplStretchObserver.disconnect();
    } catch (_) {}
    toolbar._pyszneplStretchObserver = null;
  }
  if (toolbar._pyszneplStretchResizeHandler) {
    window.removeEventListener("resize", toolbar._pyszneplStretchResizeHandler);
    toolbar._pyszneplStretchResizeHandler = null;
  }

  toolbar._pyszneplStretchContainer = container;

  const apply = () => stretchToolbarToContainer(toolbar, container);
  requestAnimationFrame(apply);

  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => requestAnimationFrame(apply));
    ro.observe(container);
    toolbar._pyszneplStretchObserver = ro;
  }

  const onResize = () => requestAnimationFrame(apply);
  window.addEventListener("resize", onResize);
  toolbar._pyszneplStretchResizeHandler = onResize;
}

const TOOLBAR_TEMPLATE_CACHE = new Map();

async function loadHtmlTemplate(name, kind, cache) {
  if (cache.has(name)) return cache.get(name);
  const url = browser.runtime.getURL(`content/${name}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${kind} template: ${name}`);
  }
  const html = await response.text();
  cache.set(name, html);
  return html;
}

async function loadToolbarTemplate(name) {
  return loadHtmlTemplate(name, "toolbar", TOOLBAR_TEMPLATE_CACHE);
}

function buildToolbarFromTemplate(html) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

const NOTE_WIDGET_TEMPLATE_CACHE = new Map();
let NOTE_WIDGET_TEMPLATE_EL = null; // parsed element, cloned per instance

async function getNoteWidgetTemplate() {
  if (NOTE_WIDGET_TEMPLATE_EL) return NOTE_WIDGET_TEMPLATE_EL;
  const html = await loadHtmlTemplate(
    "note-widget.html",
    "note widget",
    NOTE_WIDGET_TEMPLATE_CACHE
  );
  const el = buildToolbarFromTemplate(html);
  if (!el) throw new Error("Invalid note widget template");
  NOTE_WIDGET_TEMPLATE_EL = el;
  return NOTE_WIDGET_TEMPLATE_EL;
}

async function buildWidget({
  key,
  label,
  meta,
  compact = false,
  onValueChange = null,
}) {
  const base = await getNoteWidgetTemplate();
  const wrapper = base.cloneNode(true);
  wrapper.classList.toggle("pysznepl-note--compact", !!compact);
  wrapper.setAttribute(MARKER_ATTR, "1");
  // Stop the host page from acting on clicks/keystrokes inside the widget.
  ["click", "mousedown", "mouseup", "keydown", "keyup", "keypress"].forEach(
    (evt) => {
      wrapper.addEventListener(evt, (e) => e.stopPropagation());
    }
  );

  const toggle = wrapper.querySelector('[data-role="toggle"]');
  if (!toggle) throw new Error("Note widget template missing toggle");
  toggle.title = label;

  const indicator = wrapper.querySelector('[data-role="indicator"]');
  if (!indicator) throw new Error("Note widget template missing indicator");

  const toggleLabel = wrapper.querySelector('[data-role="toggle-label"]');
  if (!toggleLabel) throw new Error("Note widget template missing toggle label");
  toggleLabel.textContent = compact ? "📝" : "📝 Notatka";

  const panel = wrapper.querySelector('[data-role="panel"]');
  if (!panel) throw new Error("Note widget template missing panel");

  const title = wrapper.querySelector('[data-role="title"]');
  if (!title) throw new Error("Note widget template missing title");
  title.textContent = label;

  const textarea = wrapper.querySelector('[data-role="textarea"]');
  if (!textarea) throw new Error("Note widget template missing textarea");
  textarea.rows = compact ? 3 : 4;

  const status = wrapper.querySelector('[data-role="status"]');
  if (!status) throw new Error("Note widget template missing status");

  function applyIndicator(value) {
    if (value && value.trim()) {
      indicator.classList.add("pysznepl-note__indicator--filled");
      toggle.classList.add("pysznepl-note__toggle--has-note");
    } else {
      indicator.classList.remove("pysznepl-note__indicator--filled");
      toggle.classList.remove("pysznepl-note__toggle--has-note");
    }
  }

  function emitValue(value) {
    if (typeof onValueChange !== "function") return;
    try {
      onValueChange(value || "");
    } catch (e) {
      console.warn("[pyszne notatki] onValueChange failed", e);
    }
  }

  toggle.addEventListener("click", () => {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) textarea.focus();
  });

  let saveTimer = null;
  textarea.addEventListener("input", () => {
    status.textContent = "Zapisywanie…";
    applyIndicator(textarea.value);
    emitValue(textarea.value);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await setNote(key, textarea.value, meta);
      status.textContent = textarea.value.trim()
        ? "Zapisano ✓"
        : "Notatka usunięta";
      setTimeout(() => {
        status.textContent = "";
      }, 1500);
    }, 350);
  });

  // Initial load
  getNote(key).then((value) => {
    textarea.value = value;
    applyIndicator(value);
    emitValue(value);
  });

  return wrapper;
}

function buildRatingControl({ restaurantId, restaurantName, url }) {
  const wrapper = document.createElement("div");
  wrapper.className = "pysznepl-rating";
  wrapper.setAttribute(MARKER_ATTR, "1");
  wrapper.setAttribute("role", "group");
  wrapper.setAttribute("aria-label", "Ocena restauracji");

  ["click", "mousedown", "mouseup", "keydown", "keyup"].forEach((evt) => {
    wrapper.addEventListener(evt, (e) => e.stopPropagation());
  });

  const buttons = {};
  const meta = { restaurantName, url };

  function updateActive(value) {
    for (const [c, b] of Object.entries(buttons)) {
      const isActive = c === "none" ? !value : c === value;
      b.classList.toggle("pysznepl-rating__swatch--active", isActive);
      b.setAttribute("aria-pressed", String(isActive));
    }
  }

  for (const color of [...RATING_VALUES, "none"]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "pysznepl-rating__swatch pysznepl-rating__swatch--" + color;
    btn.title = RATING_LABELS[color];
    btn.setAttribute("aria-label", RATING_LABELS[color]);
    if (color === "none") btn.textContent = "✕";
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const value = color === "none" ? "" : color;
      await setRating(restaurantId, value, meta);
      applyRatingToTargets(restaurantId, value);
      updateActive(value);
    });
    wrapper.appendChild(btn);
    buttons[color] = btn;
  }

  // Initial load
  getRating(restaurantId).then((value) => {
    updateActive(value);
    applyRatingToTargets(restaurantId, value);
  });

  return wrapper;
}

async function buildToolbar({
  restaurantId,
  restaurantName,
  url,
  compact,
  collapsible,
}) {
  const templateName = collapsible
    ? "toolbar-card.html"
    : "toolbar-restaurant.html";
  const toolbarHtml = await loadToolbarTemplate(templateName);
  const toolbar = buildToolbarFromTemplate(toolbarHtml);
  if (!toolbar) {
    throw new Error(`Invalid toolbar template: ${templateName}`);
  }

  // Used to de-duplicate toolbars across SPA re-renders.
  toolbar.dataset.pyszneplRestaurantId = restaurantId;

  toolbar.classList.toggle("pysznepl-toolbar--compact", !!compact);
  toolbar.classList.toggle("pysznepl-toolbar--collapsible", !!collapsible);
  toolbar.setAttribute(MARKER_ATTR, "1");
  ["click", "mousedown", "mouseup"].forEach((evt) => {
    toolbar.addEventListener(evt, (e) => e.stopPropagation());
  });

  const ratingControl = buildRatingControl({
    restaurantId,
    restaurantName,
    url,
  });

  const notePreviewEl = toolbar.querySelector('[data-slot="note-preview"]');

  function formatNotePreview(value) {
    const raw = (value || "").trim();
    if (!raw) return { text: "Brak notatki", empty: true, title: "" };
    // Show full note (with line breaks). If it's extremely long, truncate the
    // preview but keep the full value in the title attribute.
    const maxLen = 500;
    const text = raw.length > maxLen ? raw.slice(0, maxLen - 1) + "…" : raw;
    return { text, empty: false, title: raw };
  }

  function setNotePreview(value) {
    if (!notePreviewEl) return;
    const { text, empty, title } = formatNotePreview(value);
    notePreviewEl.textContent = text;
    notePreviewEl.title = title;
    notePreviewEl.classList.toggle("pysznepl-toolbar__note-preview--empty", empty);
  }

  // Placeholder immediately; overwritten after async load in buildWidget().
  if (notePreviewEl) setNotePreview("");

  const noteWidget = await buildWidget({
    key: storageKey(["restaurant", restaurantId]),
    label: `Notatka o restauracji: ${restaurantName || restaurantId}`,
    meta: {
      type: "restaurant",
      restaurantId,
      restaurantName,
      url,
    },
    compact,
    onValueChange: notePreviewEl ? setNotePreview : null,
  });

  const ratingSlot = toolbar.querySelector('[data-slot="rating"]');
  const noteSlot = toolbar.querySelector('[data-slot="note"]');
  if (ratingSlot) ratingSlot.appendChild(ratingControl);
  if (noteSlot) noteSlot.appendChild(noteWidget);

  if (collapsible) {
    const gear = toolbar.querySelector(".pysznepl-toolbar__gear");
    if (gear) {
      gear.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const open = !toolbar.classList.contains("pysznepl-toolbar--open");
        toolbar.classList.toggle("pysznepl-toolbar--open", open);
        gear.setAttribute("aria-expanded", String(open));
        toolbar.dataset.pyszneplEditing = open ? "1" : "0";
      });
    }
  }
  return toolbar;
}

async function attachRestaurantWidget() {
  if (!isRestaurantPage()) return;
  const heading = findBestRestaurantHeading();
  if (!heading) return;

  // On the restaurant page we want the toolbar right above the "helpful text"
  // block, i.e. after the whole header flex row (title + actions) but before
  // the disclaimer/help text.
  const headerFlexRow = heading.closest('[data-qa="flex"]');
  const anchorEl = headerFlexRow || heading;
  const headerContainer = findRestaurantHeaderContainer(heading);

  // If a toolbar is already adjacent to the current heading, we're done.
  const adjacent = anchorEl.nextElementSibling;
  if (
    heading.hasAttribute(MARKER_ATTR) &&
    adjacent &&
    adjacent.matches('.pysznepl-toolbar[data-pysznepl-toolbar="page"]')
  ) {
    // De-duplicate if multiple page toolbars exist.
    document
      .querySelectorAll('.pysznepl-toolbar[data-pysznepl-toolbar="page"]')
      .forEach((el) => {
        if (el !== adjacent) el.remove();
      });
    return;
  }

  // Marker can survive while the toolbar is wiped by SPA re-renders.
  // If we have a marker but no adjacent toolbar, treat it as stale.
  if (heading.hasAttribute(MARKER_ATTR)) {
    heading.removeAttribute(MARKER_ATTR);
  }

  const restaurantId = getRestaurantId();
  const restaurantName = (heading.textContent || "").trim();

  // If a toolbar exists somewhere else in the DOM for this restaurant,
  // re-use it instead of creating another one.
  const existingToolbars = Array.from(
    document.querySelectorAll('.pysznepl-toolbar[data-pysznepl-toolbar="page"]')
  );
  const reusable = existingToolbars.find(
    (el) => (el.dataset.pyszneplRestaurantId || "") === restaurantId
  );
  if (reusable) {
    // Remove any duplicates.
    existingToolbars.forEach((el) => {
      if (el !== reusable) el.remove();
    });
    if (anchorEl.parentElement) {
      anchorEl.parentElement.insertBefore(reusable, anchorEl.nextSibling);
    } else {
      anchorEl.after(reusable);
    }

    // Make it span the full header width (under actions too).
    setupToolbarStretch(reusable, headerContainer);

    heading.setAttribute(MARKER_ATTR, "1");
    return;
  }

  // Remove stray toolbars from previous renders.
  existingToolbars.forEach((el) => el.remove());

  const toolbar = await buildToolbar({
    restaurantId,
    restaurantName,
    url: location.href,
    compact: false,
    collapsible: false,
  });

  // We deliberately don't register the heading/header as a rating target —
  // tinting only the header looks like coloured strips beside the centred
  // content.
  if (anchorEl.parentElement) {
    anchorEl.parentElement.insertBefore(toolbar, anchorEl.nextSibling);
  } else {
    anchorEl.after(toolbar);
  }

  // Make it span the full header width (under actions too).
  setupToolbarStretch(toolbar, headerContainer);

  heading.setAttribute(MARKER_ATTR, "1");
}

function clearBodyRating() {
  // Older versions tinted the whole restaurant page by applying rating classes
  // to <body>, which then styled body::before. We no longer do that; ensure any
  // leftover classes are removed.
  applyRatingClass(document.body, "");
}

let bodyRestaurantId = null;
function setBodyRestaurant(id) {
  if (bodyRestaurantId === id) return;
  if (bodyRestaurantId) {
    const old = RATING_TARGETS.get(bodyRestaurantId);
    if (old) old.delete(document.body);
  }
  bodyRestaurantId = id;
  if (id) registerRatingTarget(id, document.body);
}

async function syncBodyRating() {
  // Only responsibility: set pysznepl-rated* classes on <body> (no extra ones).
  if (isRestaurantPage()) {
    const id = getRestaurantId();
    setBodyRestaurant(id);
    const v = await getRating(id);
    applyRatingClass(document.body, v);
  } else {
    setBodyRestaurant(null);
    applyRatingClass(document.body, "");
  }
}

function findDishNameElement(dishEl) {
  for (const sel of DISH_NAME_SELECTORS) {
    const el = dishEl.querySelector(sel);
    if (el && el.textContent && el.textContent.trim()) return el;
  }
  return null;
}

async function attachDishWidgets() {
  if (!isRestaurantPage()) return;
  const restaurantId = getRestaurantId();
  const dishes = findAll(DISH_CONTAINER_SELECTORS);

  for (const dish of dishes) {
    if (dish.hasAttribute(MARKER_ATTR)) continue;
    const nameEl = findDishNameElement(dish);
    if (!nameEl) continue;

    const dishName = nameEl.textContent.trim();
    if (!dishName) continue;

    dish.setAttribute(MARKER_ATTR, "1");

    const widget = await buildWidget({
      key: storageKey(["dish", restaurantId, dishName.toLowerCase()]),
      label: `Notatka o daniu: ${dishName}`,
      meta: {
        type: "dish",
        restaurantId,
        dishName,
        url: location.href,
      },
      compact: true,
    });

    // Try to insert next to the dish name; fall back to appending to dish.
    if (nameEl.parentElement) {
      nameEl.parentElement.insertBefore(widget, nameEl.nextSibling);
    } else {
      dish.appendChild(widget);
    }
  }
}

// ---------- hover tooltip for listing cards ----------

let TOOLTIP_EL = null;
function ensureTooltip() {
  if (TOOLTIP_EL && document.body.contains(TOOLTIP_EL)) return TOOLTIP_EL;
  TOOLTIP_EL = document.createElement("div");
  TOOLTIP_EL.className = "pysznepl-card-tooltip";
  TOOLTIP_EL.hidden = true;
  document.body.appendChild(TOOLTIP_EL);
  return TOOLTIP_EL;
}

function hideTooltip() {
  if (TOOLTIP_EL) TOOLTIP_EL.hidden = true;
}

function positionTooltipNear(rect) {
  const t = ensureTooltip();
  const margin = 8;
  // Default: right side of the card, vertically centered.
  let left = rect.right + margin;
  let top = rect.top + rect.height / 2 - t.offsetHeight / 2;

  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;

  // If it would overflow the right edge, place to the left of the card.
  if (left + t.offsetWidth > vw - 4) {
    left = rect.left - t.offsetWidth - margin;
  }
  if (left < 4) left = 4;
  if (top < 4) top = 4;
  if (top + t.offsetHeight > vh - 4) top = vh - t.offsetHeight - 4;

  t.style.left = left + "px";
  t.style.top = top + "px";
}

function attachCardTooltip(card, slug, toolbar) {
  const noteKey = storageKey(["restaurant", slug]);

  card.addEventListener("mouseenter", async () => {
    if (toolbar && toolbar.dataset.pyszneplEditing === "1") return;
    const note = await getNote(noteKey);
    if (!note || !note.trim()) return;
    const t = ensureTooltip();
    t.textContent = note;
    t.hidden = false;
    // Reflow to read proper offsetWidth/Height for positioning.
    positionTooltipNear(card.getBoundingClientRect());
  });
  card.addEventListener("mouseleave", hideTooltip);
  card.addEventListener("focusout", hideTooltip);
}

const LISTING_NAME_SELECTORS = [
  '[data-qa*="restaurant-name" i]',
  '[data-testid*="restaurant-name" i]',
  '[class*="RestaurantName"]',
  '[class*="restaurant-name" i]',
  "h2",
  "h3",
];

function findCardContainer(anchor) {
  // Walk up from the /menu/ link and find the LARGEST single-link, non-anchor
  // ancestor below <main>/<body>. Prefer ancestors that look like a card
  // (matching card-shaped selectors) when multiple qualify — but always
  // pick the outermost one so the rating tint covers the whole tile.
  let largestNonAnchor = null;
  let largestCardLike = null;
  let el = anchor.parentElement;
  let depth = 0;
  while (el && depth < 15) {
    if (
      el === document.body ||
      el === document.documentElement ||
      el.tagName === "MAIN"
    )
      break;
    const linkCount = el.querySelectorAll('a[href*="/menu/"]').length;
    if (linkCount !== 1) break;
    if (el.tagName !== "A") {
      largestNonAnchor = el;
      if (
        el.matches(
          'article, li, [role="article"], [data-qa*="restaurant" i], [data-testid*="restaurant" i], [class*="RestaurantCard"], [class*="restaurant-card" i], [class*="restaurant-tile" i], [class*="card" i]'
        )
      ) {
        largestCardLike = el;
      }
    }
    el = el.parentElement;
    depth++;
  }
  return largestCardLike || largestNonAnchor;
}

const RESTAURANT_CARD_SELECTOR = '[class*="restaurant-card" i]';

function isRestaurantCardEl(el) {
  if (!el || !el.classList) return false;
  for (const cls of el.classList) {
    if (cls.toLowerCase().startsWith("restaurant-card")) return true;
  }
  return false;
}

function slugFromMenuHref(href) {
  const m = (href || "").match(/\/menu\/([^\/?#]+)/i);
  return m ? decodeURIComponent(m[1]).toLowerCase() : null;
}

function absoluteUrl(href) {
  try {
    return new URL(href, location.href).href;
  } catch (_) {
    return href || "";
  }
}

function extractRestaurantName(scope, anchor) {
  for (const sel of LISTING_NAME_SELECTORS) {
    const nameEl = scope.querySelector(sel);
    if (nameEl && nameEl.textContent && nameEl.textContent.trim()) {
      return nameEl.textContent.trim();
    }
  }
  return ((anchor && anchor.getAttribute("aria-label")) || "").trim();
}

async function mountCardWidget(card, slug, restaurantName, url) {
  registerRatingTarget(slug, card);

  // If the marker is set but our toolbar got wiped by an SPA re-render,
  // drop the marker and re-mount.
  const hasToolbar = !!card.querySelector(":scope > .pysznepl-toolbar");
  if (card.hasAttribute(MARKER_ATTR) && hasToolbar) {
    getRating(slug).then((v) => applyRatingClass(card, v));
    return;
  }

  card.setAttribute(MARKER_ATTR, "1");
  if (getComputedStyle(card).position === "static") {
    card.style.position = "relative";
  }

  const toolbar = await buildToolbar({
    restaurantId: slug,
    restaurantName,
    url,
    compact: true,
    collapsible: true,
  });

  if (card.firstChild) {
    card.insertBefore(toolbar, card.firstChild);
  } else {
    card.appendChild(toolbar);
  }

  getRating(slug).then((v) => applyRatingClass(card, v));
  attachCardTooltip(card, slug, toolbar);
}

async function attachListingCards() {
  if (isRestaurantPage()) return;

  const seenSlugs = new Set();
  const handledCards = new WeakSet();

  // Primary: any element whose class list contains a token starting with
  // "restaurant-card" (pyszne.pl uses restaurant-card-default,
  // restaurant-card-promoted, etc. across the different listing sections).
  for (const card of document.querySelectorAll(RESTAURANT_CARD_SELECTOR)) {
    if (!isRestaurantCardEl(card)) continue;

    // Only act on the outermost restaurant-card element when several are
    // nested (e.g. wrapper variant + inner default).
    if (
      card.parentElement &&
      card.parentElement.closest(RESTAURANT_CARD_SELECTOR)
    ) {
      continue;
    }

    const anchor = card.querySelector('a[href*="/menu/"]');
    if (!anchor) continue;
    const slug = slugFromMenuHref(anchor.getAttribute("href"));
    if (!slug || seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    handledCards.add(card);

    await mountCardWidget(
      card,
      slug,
      extractRestaurantName(card, anchor),
      absoluteUrl(anchor.getAttribute("href"))
    );
  }

  // Fallback: any /menu/ link that isn't inside a restaurant-card* element.
  // Uses the legacy heuristic to figure out the surrounding tile.
  for (const a of document.querySelectorAll('a[href*="/menu/"]')) {
    const slug = slugFromMenuHref(a.getAttribute("href"));
    if (!slug || seenSlugs.has(slug)) continue;
    if (a.closest(RESTAURANT_CARD_SELECTOR)) continue;

    const card = findCardContainer(a);
    if (!card || handledCards.has(card)) continue;
    seenSlugs.add(slug);
    handledCards.add(card);

    await mountCardWidget(
      card,
      slug,
      extractRestaurantName(card, a),
      absoluteUrl(a.getAttribute("href"))
    );
  }
}

async function refresh() {
  await attachRestaurantWidget();
  await attachDishWidgets();
  await attachListingCards();
  await syncBodyRating();
}

// Ensure refresh() runs sequentially. With async template loading it's easy to
// trigger overlapping refreshes (MutationObserver + SPA renders), which can
// duplicate injected UI.
let refreshChain = Promise.resolve();
function enqueueRefresh() {
  refreshChain = refreshChain
    .then(() => refresh())
    .catch((e) => console.warn("[pyszne notatki] refresh failed", e));
}

let scheduled = false;
function scheduleRefresh() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    enqueueRefresh();
  });
}

const observer = new MutationObserver(() => scheduleRefresh());
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

// Sync rating colours when storage changes (e.g. another tab or the popup).
if (browser.storage && browser.storage.onChanged) {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const key of Object.keys(changes)) {
      const m = key.match(/^pysznepl_notes::rating::([^:]+)$/);
      if (!m) continue;
      const id = m[1];
      const newValue = changes[key].newValue || "";
      applyRatingToTargets(id, newValue);
    }
  });
}

// Re-run when SPA navigation changes the URL.
let lastHref = location.href;
setInterval(() => {
  if (location.href !== lastHref) {
    lastHref = location.href;
    // Existing markers remain valid for elements still on the page;
    // new ones will be picked up by the observer.
    scheduleRefresh();
  }
}, 750);

enqueueRefresh();
