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
let NOTE_WIDGET_EL = null;

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

async function getNoteWidgetTemplate() {
  if (!NOTE_WIDGET_EL) {
    NOTE_WIDGET_EL = templateToElement(await loadTemplate("note-widget.html"));
    if (!NOTE_WIDGET_EL) throw new Error("Invalid note widget template");
  }
  return NOTE_WIDGET_EL;
}

// ---------- thumb buttons ----------

function buildThumbButtons({ key, meta }) {
  const wrapper = document.createElement("div");
  wrapper.className = "pysznepl-thumb";
  wrapper.setAttribute(MARKER_ATTR, "1");
  stopPropOn(wrapper, ["click", "mousedown", "mouseup", "keydown", "keyup"]);

  const upBtn = document.createElement("button");
  upBtn.type = "button";
  upBtn.className = "pysznepl-thumb__btn pysznepl-thumb__btn--up";
  upBtn.title = "Dobre danie";
  upBtn.textContent = "👍";

  const downBtn = document.createElement("button");
  downBtn.type = "button";
  downBtn.className = "pysznepl-thumb__btn pysznepl-thumb__btn--down";
  downBtn.title = "Słabe danie";
  downBtn.textContent = "👎";

  wrapper.append(upBtn, downBtn);

  let current = "";

  function applyState(v) {
    current = v;
    upBtn.classList.toggle("pysznepl-thumb__btn--active", v === "up");
    downBtn.classList.toggle("pysznepl-thumb__btn--active", v === "down");
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

// ---------- note widget ----------

async function buildWidget({ key, label, meta, compact = false, onValueChange = null }) {
  const wrapper = (await getNoteWidgetTemplate()).cloneNode(true);
  wrapper.classList.toggle("pysznepl-note--compact", !!compact);
  wrapper.setAttribute(MARKER_ATTR, "1");
  stopPropOn(wrapper, ["click", "mousedown", "mouseup", "keydown", "keyup", "keypress"]);

  const toggle      = wrapper.querySelector('[data-role="toggle"]');
  const indicator   = wrapper.querySelector('[data-role="indicator"]');
  const toggleLabel = wrapper.querySelector('[data-role="toggle-label"]');
  const panel       = wrapper.querySelector('[data-role="panel"]');
  if (compact) panel.classList.add("pysznepl-note__panel--compact");
  const title       = wrapper.querySelector('[data-role="title"]');
  const textarea    = wrapper.querySelector('[data-role="textarea"]');
  const status      = wrapper.querySelector('[data-role="status"]');

  if (!toggle || !indicator || !toggleLabel || !panel || !title || !textarea || !status) {
    throw new Error("Note widget template is missing required elements");
  }

  toggle.title = label;
  toggleLabel.textContent = compact ? "📝" : "📝 Notatka";
  title.textContent = label;
  textarea.rows = compact ? 3 : 4;

  function applyIndicator(value) {
    const has = !!(value && value.trim());
    indicator.classList.toggle("pysznepl-note__indicator--filled", has);
    toggle.classList.toggle("pysznepl-note__toggle--has-note", has);
  }

  let onDocClick = null;
  let onScroll = null;

  function closePanel() {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    if (onDocClick) { document.removeEventListener("click", onDocClick); onDocClick = null; }
    if (onScroll) { window.removeEventListener("scroll", onScroll, true); onScroll = null; }
  }

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!panel.hidden) { closePanel(); return; }

    // Move panel to body once so it escapes overflow/stacking contexts
    if (panel.parentElement !== document.body) {
      document.body.appendChild(panel);
      stopPropOn(panel, ["click", "mousedown", "mouseup", "keydown", "keyup"]);
    }

    const rect = toggle.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    let left = rect.left;
    if (left + 320 > vw - 8) left = vw - 320 - 8;
    if (left < 8) left = 8;
    panel.style.top = (rect.bottom + 4) + "px";
    panel.style.left = left + "px";

    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    textarea.focus();

    onDocClick = (ev) => {
      if (!panel.contains(ev.target) && !wrapper.contains(ev.target)) closePanel();
    };
    onScroll = () => closePanel();
    setTimeout(() => {
      document.addEventListener("click", onDocClick);
      window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    }, 0);
  });

  let saveTimer = null;
  textarea.addEventListener("input", () => {
    status.textContent = "Zapisywanie…";
    applyIndicator(textarea.value);
    try { onValueChange?.(textarea.value || ""); } catch (_) {}
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await setNote(key, textarea.value, meta);
      status.textContent = textarea.value.trim() ? "Zapisano ✓" : "Notatka usunięta";
      setTimeout(() => { status.textContent = ""; }, 1500);
    }, 350);
  });

  getNote(key).then((value) => {
    textarea.value = value;
    applyIndicator(value);
    try { onValueChange?.(value || ""); } catch (_) {}
  });

  return wrapper;
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

  const noteWidget = await buildWidget({
    key: storageKey("restaurant", restaurantId),
    label: `Notatka o restauracji: ${restaurantName || restaurantId}`,
    meta: { type: "restaurant", restaurantId, restaurantName, url },
    compact,
    onValueChange: notePreviewEl ? setNotePreview : null,
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
