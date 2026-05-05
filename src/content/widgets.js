"use strict";

const MARKER_ATTR = "data-pysznepl-note-attached";

const RATING_LABELS = {
  red: "Słaba (czerwony)",
  orange: "Średnia (pomarańczowy)",
  green: "Dobra (zielony)",
  none: "Bez oceny",
};

// ---------- rating targets ----------

const RATING_TARGETS = new Map(); // restaurantId -> Set<HTMLElement>

function registerRatingTarget(restaurantId, el) {
  if (!RATING_TARGETS.has(restaurantId)) RATING_TARGETS.set(restaurantId, new Set());
  RATING_TARGETS.get(restaurantId).add(el);
}

function applyRatingClass(el, value) {
  if (!el) return;
  for (const c of RATING_VALUES) el.classList.remove(`pysznepl-rated--${c}`);
  el.classList.remove("pysznepl-rated");
  if (value) el.classList.add("pysznepl-rated", `pysznepl-rated--${value}`);
}

function applyRatingToTargets(restaurantId, value) {
  const set = RATING_TARGETS.get(restaurantId);
  if (set) for (const el of set) applyRatingClass(el, value);
}

// ---------- helpers ----------

function stopPropOn(el, events) {
  events.forEach((evt) => el.addEventListener(evt, (e) => e.stopPropagation()));
}

// ---------- template loading ----------

const TEMPLATE_CACHE = new Map();

async function loadTemplate(name) {
  if (!TEMPLATE_CACHE.has(name)) {
    const url = browser.runtime.getURL(`content/${name}`);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Failed to load template: ${name}`);
    TEMPLATE_CACHE.set(name, await r.text());
  }
  return TEMPLATE_CACHE.get(name);
}

function templateToElement(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ---------- thumb buttons ----------

function buildThumbButtons({ key, meta, target = null }) {
  const wrapper = document.createElement("div");
  wrapper.className = "pysznepl-thumb";
  wrapper.setAttribute(MARKER_ATTR, "1");
  stopPropOn(wrapper, ["click", "mousedown", "mouseup", "keydown", "keyup"]);

  const upBtn = document.createElement("button");
  upBtn.type = "button";
  upBtn.className = "pysznepl-btn pysznepl-btn--up";
  upBtn.title = "Dobre danie";
  upBtn.textContent = "👍";

  const downBtn = document.createElement("button");
  downBtn.type = "button";
  downBtn.className = "pysznepl-btn pysznepl-btn--down";
  downBtn.title = "Słabe danie";
  downBtn.textContent = "👎";

  wrapper.append(upBtn, downBtn);

  let current = "";

  function applyState(v) {
    current = v;
    upBtn.classList.toggle("pysznepl-btn--active", v === "up");
    downBtn.classList.toggle("pysznepl-btn--active", v === "down");
    if (target) {
      target.classList.toggle("pysznepl-dish--up", v === "up");
      target.classList.toggle("pysznepl-dish--down", v === "down");
    }
  }

  async function handleClick(v) {
    const next = current === v ? "" : v;
    await setDishThumb(key, next, meta);
    applyState(next);
  }

  upBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleClick("up");
  });
  downBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleClick("down");
  });

  getDishThumb(key).then(applyState);

  return wrapper;
}

// ---------- note button ----------

async function buildNoteButton({ key, label, meta, onValueChange = null, hoverTarget = null, buttonText = "📝", extraClass = "" }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = extraClass ? `pysznepl-btn ${extraClass}` : "pysznepl-btn";
  btn.textContent = buttonText;
  btn.setAttribute(MARKER_ATTR, "1");
  stopPropOn(btn, ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "keydown", "keyup"]);

  let cached = "";

  function apply(value) {
    cached = value || "";
    const has = !!(value && value.trim());
    btn.classList.toggle("pysznepl-btn--active", has);
    btn.title = has ? value.trim() : label;
    try { onValueChange?.(cached); } catch (_) {}
  }

  const tooltipEl = hoverTarget || btn;
  tooltipEl.addEventListener("mouseenter", () => {
    if (!cached.trim()) return;
    const t = ensureTooltip();
    t.textContent = cached;
    t.hidden = false;
    positionTooltipNear(tooltipEl.getBoundingClientRect());
  });
  tooltipEl.addEventListener("mouseleave", hideTooltip);

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideTooltip();
    const result = window.prompt(label, cached);
    if (result === null) return;
    apply(result);
    setNote(key, result, meta);
  });

  getNote(key).then(apply);
  return btn;
}

// ---------- rating control ----------

function buildRatingControl({ restaurantId, restaurantName, url }) {
  const wrapper = document.createElement("div");
  wrapper.className = "pysznepl-rating";
  wrapper.setAttribute(MARKER_ATTR, "1");
  wrapper.setAttribute("role", "group");
  wrapper.setAttribute("aria-label", "Ocena restauracji");
  stopPropOn(wrapper, ["click", "mousedown", "mouseup", "keydown", "keyup"]);

  const meta = { restaurantName, url };
  const buttons = {};

  function updateActive(value) {
    for (const [c, b] of Object.entries(buttons)) {
      const active = c === "none" ? !value : c === value;
      b.classList.toggle("pysznepl-rating__swatch--active", active);
      b.setAttribute("aria-pressed", String(active));
    }
  }

  for (const color of [...RATING_VALUES, "none"]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pysznepl-rating__swatch pysznepl-rating__swatch--" + color;
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

  getRating(restaurantId).then((value) => {
    updateActive(value);
    applyRatingToTargets(restaurantId, value);
  });

  return wrapper;
}

// ---------- toolbar ----------

async function buildToolbar({ restaurantId, restaurantName, url, compact, collapsible }) {
  const html = await loadTemplate(
    collapsible ? "toolbar-card.html" : "toolbar-restaurant.html"
  );
  const toolbar = templateToElement(html);
  if (!toolbar) throw new Error("Invalid toolbar template");

  toolbar.dataset.pyszneplRestaurantId = restaurantId;
  toolbar.classList.toggle("pysznepl-toolbar--compact", !!compact);
  toolbar.classList.toggle("pysznepl-toolbar--collapsible", !!collapsible);
  toolbar.setAttribute(MARKER_ATTR, "1");
  stopPropOn(toolbar, ["click", "mousedown", "mouseup"]);

  const ratingControl = buildRatingControl({ restaurantId, restaurantName, url });
  const notePreviewEl = toolbar.querySelector('[data-slot="note-preview"]');

  function setNotePreview(value) {
    if (!notePreviewEl) return;
    const raw = (value || "").trim();
    const empty = !raw;
    notePreviewEl.textContent = empty ? "Brak notatki" : (raw.length > 500 ? raw.slice(0, 499) + "…" : raw);
    notePreviewEl.title = raw;
    notePreviewEl.classList.toggle("pysznepl-toolbar__note-preview--empty", empty);
  }

  if (notePreviewEl) setNotePreview("");

  const noteWidget = await buildNoteButton({
    key: storageKey("restaurant", restaurantId),
    label: `Notatka o restauracji: ${restaurantName || restaurantId}`,
    meta: { type: "restaurant", restaurantId, restaurantName, url },
    onValueChange: notePreviewEl ? setNotePreview : null,
    buttonText: "📝 Notatka",
    extraClass: "pysznepl-btn--action",
  });

  toolbar.querySelector('[data-slot="rating"]')?.appendChild(ratingControl);
  toolbar.querySelector('[data-slot="note"]')?.appendChild(noteWidget);

  if (collapsible) {
    const gear = toolbar.querySelector(".pysznepl-toolbar__gear");
    gear?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const open = !toolbar.classList.contains("pysznepl-toolbar--open");
      toolbar.classList.toggle("pysznepl-toolbar--open", open);
      gear.setAttribute("aria-expanded", String(open));
      toolbar.dataset.pyszneplEditing = open ? "1" : "0";
    });
  }

  return toolbar;
}

// ---------- toolbar stretch ----------

function stretchToolbarToContainer(toolbar, container) {
  if (!toolbar || !container) return;
  const cr = container.getBoundingClientRect();
  const tr = toolbar.getBoundingClientRect();
  if (!cr.width || !tr.width) return;
  toolbar.style.marginLeft = `${cr.left - tr.left}px`;
  toolbar.style.width = `${cr.width}px`;
  toolbar.style.maxWidth = `${cr.width}px`;
}

function setupToolbarStretch(toolbar, container) {
  if (!toolbar || !container) return;
  if (toolbar._pyszneplStretchContainer === container) {
    requestAnimationFrame(() => stretchToolbarToContainer(toolbar, container));
    return;
  }
  toolbar._pyszneplStretchObserver?.disconnect();
  if (toolbar._pyszneplStretchResizeHandler) {
    window.removeEventListener("resize", toolbar._pyszneplStretchResizeHandler);
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

// ---------- card tooltip ----------

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
  let left = rect.right + margin;
  let top = rect.top + rect.height / 2 - t.offsetHeight / 2;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  if (left + t.offsetWidth > vw - 4) left = rect.left - t.offsetWidth - margin;
  left = Math.max(4, left);
  top = Math.max(4, Math.min(top, vh - t.offsetHeight - 4));
  t.style.left = left + "px";
  t.style.top = top + "px";
}

function attachCardTooltip(card, slug, toolbar) {
  const noteKey = storageKey("restaurant", slug);
  card.addEventListener("mouseenter", async () => {
    if (toolbar?.dataset.pyszneplEditing === "1") return;
    const note = await getNote(noteKey);
    if (!note?.trim()) return;
    const t = ensureTooltip();
    t.textContent = note;
    t.hidden = false;
    positionTooltipNear(card.getBoundingClientRect());
  });
  card.addEventListener("mouseleave", hideTooltip);
  card.addEventListener("focusout", hideTooltip);
}
