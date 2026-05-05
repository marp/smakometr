"use strict";

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
  'li[class*="item-list_list-item"]',
  '[data-qa="item"]',
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
  '[data-qa="item-name"]',
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

const LISTING_NAME_SELECTORS = [
  '[data-qa*="restaurant-name" i]',
  '[data-testid*="restaurant-name" i]',
  '[class*="RestaurantName"]',
  '[class*="restaurant-name" i]',
  "h2",
  "h3",
];

const RESTAURANT_CARD_SELECTOR = '[class*="restaurant-card" i]';

// ---------- page helpers ----------

function getRestaurantId() {
  const match = location.pathname.match(/\/menu\/([^\/?#]+)/i);
  if (match) return decodeURIComponent(match[1]).toLowerCase();
  return location.pathname.replace(/\/+$/, "").toLowerCase() || "/";
}

function isRestaurantPage() {
  return /\/menu\//i.test(location.pathname);
}

function findAll(selectors, root = document) {
  const seen = new Set();
  const results = [];
  for (const sel of selectors) {
    root.querySelectorAll(sel).forEach((el) => {
      if (!seen.has(el)) { seen.add(el); results.push(el); }
    });
  }
  return results;
}

function isVisibleElement(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none";
}

function findBestRestaurantHeading() {
  const candidates = findAll(RESTAURANT_NAME_SELECTORS)
    .filter((el) => el.textContent?.trim() && !el.closest(".pysznepl-toolbar"))
    .filter(isVisibleElement);
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const fa = parseFloat(getComputedStyle(a).fontSize) || 0;
    const fb = parseFloat(getComputedStyle(b).fontSize) || 0;
    return fb !== fa
      ? fb - fa
      : a.getBoundingClientRect().top - b.getBoundingClientRect().top;
  });
  return candidates[0] || null;
}

function findRestaurantHeaderContainer(heading) {
  if (!heading) return null;
  return (
    heading.closest('[data-qa="page-section"] [data-qa="util"]') ||
    heading.closest('[data-qa="util"]') ||
    heading.closest('[data-qa="flex"]') ||
    heading.parentElement
  );
}

function findDishNameElement(dishEl) {
  for (const sel of DISH_NAME_SELECTORS) {
    const el = dishEl.querySelector(sel);
    if (el?.textContent?.trim()) return el;
  }
  return null;
}

function isRestaurantCardEl(el) {
  if (!el?.classList) return false;
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
  try { return new URL(href, location.href).href; }
  catch (_) { return href || ""; }
}

function extractRestaurantName(scope, anchor) {
  for (const sel of LISTING_NAME_SELECTORS) {
    const el = scope.querySelector(sel);
    if (el?.textContent?.trim()) return el.textContent.trim();
  }
  return (anchor?.getAttribute("aria-label") || "").trim();
}

function findCardContainer(anchor) {
  let largestNonAnchor = null;
  let largestCardLike = null;
  let el = anchor.parentElement;
  let depth = 0;
  while (el && depth < 15) {
    if (el === document.body || el === document.documentElement || el.tagName === "MAIN") break;
    if (el.querySelectorAll('a[href*="/menu/"]').length !== 1) break;
    if (el.tagName !== "A") {
      largestNonAnchor = el;
      if (el.matches('article, li, [role="article"], [data-qa*="restaurant" i], [data-testid*="restaurant" i], [class*="RestaurantCard"], [class*="restaurant-card" i], [class*="restaurant-tile" i], [class*="card" i]')) {
        largestCardLike = el;
      }
    }
    el = el.parentElement;
    depth++;
  }
  return largestCardLike || largestNonAnchor;
}

// ---------- restaurant page ----------

async function attachRestaurantWidget() {
  if (!isRestaurantPage()) return;
  const heading = findBestRestaurantHeading();
  if (!heading) return;

  const anchorEl = heading.closest('[data-qa="flex"]') || heading;
  const headerContainer = findRestaurantHeaderContainer(heading);
  const adjacent = anchorEl.nextElementSibling;

  if (
    heading.hasAttribute(MARKER_ATTR) &&
    adjacent?.matches('.pysznepl-toolbar[data-pysznepl-toolbar="page"]')
  ) {
    document.querySelectorAll('.pysznepl-toolbar[data-pysznepl-toolbar="page"]').forEach((el) => {
      if (el !== adjacent) el.remove();
    });
    return;
  }

  if (heading.hasAttribute(MARKER_ATTR)) heading.removeAttribute(MARKER_ATTR);

  const restaurantId = getRestaurantId();
  const restaurantName = heading.textContent.trim();

  const existingToolbars = Array.from(
    document.querySelectorAll('.pysznepl-toolbar[data-pysznepl-toolbar="page"]')
  );
  const reusable = existingToolbars.find(
    (el) => el.dataset.pyszneplRestaurantId === restaurantId
  );

  if (reusable) {
    existingToolbars.forEach((el) => { if (el !== reusable) el.remove(); });
    anchorEl.parentElement
      ? anchorEl.parentElement.insertBefore(reusable, anchorEl.nextSibling)
      : anchorEl.after(reusable);
    setupToolbarStretch(reusable, headerContainer);
    heading.setAttribute(MARKER_ATTR, "1");
    return;
  }

  existingToolbars.forEach((el) => el.remove());

  const toolbar = await buildToolbar({
    restaurantId,
    restaurantName,
    url: location.href,
    compact: false,
    collapsible: false,
  });

  anchorEl.parentElement
    ? anchorEl.parentElement.insertBefore(toolbar, anchorEl.nextSibling)
    : anchorEl.after(toolbar);

  setupToolbarStretch(toolbar, headerContainer);
  heading.setAttribute(MARKER_ATTR, "1");
}

let bodyRestaurantId = null;

function setBodyRestaurant(id) {
  if (bodyRestaurantId === id) return;
  if (bodyRestaurantId) RATING_TARGETS.get(bodyRestaurantId)?.delete(document.body);
  bodyRestaurantId = id;
  if (id) registerRatingTarget(id, document.body);
}

async function syncBodyRating() {
  if (isRestaurantPage()) {
    const id = getRestaurantId();
    setBodyRestaurant(id);
    applyRatingClass(document.body, await getRating(id));
  } else {
    setBodyRestaurant(null);
    applyRatingClass(document.body, "");
  }
}

async function attachDishWidgets() {
  if (!isRestaurantPage()) return;
  const restaurantId = getRestaurantId();

  for (const dish of findAll(DISH_CONTAINER_SELECTORS)) {
    if (dish.closest(`[${MARKER_ATTR}]`)) continue;
    const nameEl = findDishNameElement(dish);
    if (!nameEl) continue;
    const dishName = nameEl.textContent.trim();
    if (!dishName) continue;

    dish.setAttribute(MARKER_ATTR, "1");

    const lower = dishName.toLowerCase();
    const meta = { type: "dish", restaurantId, dishName, url: location.href };

    const dishTarget = Array.from(dish.children).find(el => el.contains(nameEl)) || dish;
    const thumbs = buildThumbButtons({
      key: storageKey("dish-rating", restaurantId, lower),
      meta: { ...meta, type: "dish-rating" },
      target: dishTarget,
    });

    const noteBtn = await buildNoteButton({
      key: storageKey("dish", restaurantId, lower),
      label: `Notatka o daniu: ${dishName}`,
      meta,
      hoverTarget: dishTarget,
    });
    thumbs.appendChild(noteBtn);

    if (nameEl.parentElement) {
      nameEl.parentElement.insertBefore(thumbs, nameEl.nextSibling);
    } else {
      dish.append(thumbs);
    }
  }
}

// ---------- listing cards ----------

async function mountCardWidget(card, slug, restaurantName, url) {
  registerRatingTarget(slug, card);

  const hasToolbar = !!card.querySelector(":scope > .pysznepl-toolbar");
  if (card.hasAttribute(MARKER_ATTR) && hasToolbar) {
    getRating(slug).then((v) => applyRatingClass(card, v));
    return;
  }

  card.setAttribute(MARKER_ATTR, "1");
  if (getComputedStyle(card).position === "static") card.style.position = "relative";

  const toolbar = await buildToolbar({
    restaurantId: slug,
    restaurantName,
    url,
    compact: true,
    collapsible: true,
  });

  card.firstChild ? card.insertBefore(toolbar, card.firstChild) : card.appendChild(toolbar);
  getRating(slug).then((v) => applyRatingClass(card, v));
  attachCardTooltip(card, slug, toolbar);
}

async function attachListingCards() {
  if (isRestaurantPage()) return;

  const seenSlugs = new Set();
  const handledCards = new WeakSet();

  for (const card of document.querySelectorAll(RESTAURANT_CARD_SELECTOR)) {
    if (!isRestaurantCardEl(card)) continue;
    if (card.parentElement?.closest(RESTAURANT_CARD_SELECTOR)) continue;

    const anchor = card.querySelector('a[href*="/menu/"]');
    if (!anchor) continue;
    const slug = slugFromMenuHref(anchor.getAttribute("href"));
    if (!slug || seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    handledCards.add(card);

    await mountCardWidget(
      card, slug,
      extractRestaurantName(card, anchor),
      absoluteUrl(anchor.getAttribute("href"))
    );
  }

  for (const a of document.querySelectorAll('a[href*="/menu/"]')) {
    const slug = slugFromMenuHref(a.getAttribute("href"));
    if (!slug || seenSlugs.has(slug) || a.closest(RESTAURANT_CARD_SELECTOR)) continue;

    const card = findCardContainer(a);
    if (!card || handledCards.has(card)) continue;
    seenSlugs.add(slug);
    handledCards.add(card);

    await mountCardWidget(
      card, slug,
      extractRestaurantName(card, a),
      absoluteUrl(a.getAttribute("href"))
    );
  }
}

// ---------- refresh loop ----------

async function refresh() {
  await attachRestaurantWidget();
  await attachDishWidgets();
  await attachListingCards();
  await syncBodyRating();
}

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
  requestAnimationFrame(() => { scheduled = false; enqueueRefresh(); });
}

new MutationObserver(scheduleRefresh).observe(document.documentElement, {
  childList: true,
  subtree: true,
});

browser.storage?.onChanged?.addListener((changes, area) => {
  if (area !== "local") return;
  for (const key of Object.keys(changes)) {
    const m = key.match(/^pysznepl_notes::rating::([^:]+)$/);
    if (m) applyRatingToTargets(m[1], changes[key].newValue || "");
  }
});

let lastHref = location.href;
setInterval(() => {
  if (location.href !== lastHref) {
    lastHref = location.href;
    scheduleRefresh();
  }
}, 750);

enqueueRefresh();
