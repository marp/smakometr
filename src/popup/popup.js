"use strict";

const STORAGE_PREFIX = "pysznepl_notes";
const META_SUFFIX = "::meta";

const $ = (sel) => document.querySelector(sel);

const RATING_LABELS = {
  red: "Słaba",
  orange: "Średnia",
  green: "Dobra",
};

function ratingLabel(value) {
  return RATING_LABELS[value] || "";
}

function isNoteKey(key) {
  return key.startsWith(STORAGE_PREFIX + "::") && !key.endsWith(META_SUFFIX);
}

function hasContent(group) {
  return Boolean(
    group.restaurantNote || group.dishes.length > 0 || group.rating
  );
}

async function loadAll() {
  const all = await browser.storage.local.get(null);
  const groups = new Map();

  function getGroup(restaurantId, meta) {
    if (!groups.has(restaurantId)) {
      groups.set(restaurantId, {
        restaurantId,
        restaurantName: meta.restaurantName || "",
        url: meta.url || "",
        restaurantNote: null,
        restaurantNoteKey: null,
        restaurantUpdatedAt: 0,
        rating: "",
        ratingKey: null,
        dishMap: new Map(),
      });
    }
    const g = groups.get(restaurantId);
    if (meta.url && !g.url) g.url = meta.url;
    if (meta.restaurantName && !g.restaurantName) g.restaurantName = meta.restaurantName;
    return g;
  }

  function getDish(group, dishSlug, meta) {
    if (!group.dishMap.has(dishSlug)) {
      group.dishMap.set(dishSlug, {
        key: null,
        thumbKey: null,
        name: meta.dishName || dishSlug,
        body: null,
        updatedAt: 0,
        thumbRating: "",
      });
    }
    return group.dishMap.get(dishSlug);
  }

  for (const [key, value] of Object.entries(all)) {
    if (!isNoteKey(key)) continue;
    const meta = all[key + META_SUFFIX] || {};
    const parts = key.split("::");
    const type = parts[1];
    const restaurantId = parts[2] || meta.restaurantId || "(nieznana)";
    const group = getGroup(restaurantId, meta);

    if (type === "restaurant") {
      group.restaurantNote = value;
      group.restaurantNoteKey = key;
      group.restaurantUpdatedAt = meta.updatedAt || 0;
    } else if (type === "dish") {
      const dishSlug = parts.slice(3).join("::");
      const dish = getDish(group, dishSlug, meta);
      dish.key = key;
      dish.name = meta.dishName || dishSlug;
      dish.body = value;
      dish.updatedAt = meta.updatedAt || 0;
    } else if (type === "dish-rating") {
      const dishSlug = parts.slice(3).join("::");
      const dish = getDish(group, dishSlug, meta);
      dish.thumbKey = key;
      dish.thumbRating = value;
      if (!dish.name && meta.dishName) dish.name = meta.dishName;
    } else if (type === "rating") {
      group.rating = value;
      group.ratingKey = key;
    }
  }

  const list = Array.from(groups.values());
  for (const g of list) {
    g.dishes = Array.from(g.dishMap.values())
      .filter((d) => d.body || d.thumbRating)
      .sort((a, b) => a.name.localeCompare(b.name, "pl"));
    delete g.dishMap;
  }
  list.sort((a, b) =>
    (a.restaurantName || a.restaurantId).localeCompare(
      b.restaurantName || b.restaurantId,
      "pl"
    )
  );
  return list;
}

function matchesQuery(group, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  if ((group.restaurantName || "").toLowerCase().includes(q)) return true;
  if ((group.restaurantId || "").toLowerCase().includes(q)) return true;
  if ((group.restaurantNote || "").toLowerCase().includes(q)) return true;
  return group.dishes.some(
    (d) =>
      (d.name || "").toLowerCase().includes(q) ||
      (d.body || "").toLowerCase().includes(q)
  );
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

async function deleteNote(key) {
  await browser.storage.local.remove([key, key + META_SUFFIX]);
}

function buildRestaurantNode(group) {
  const node = el("section", {
    class:
      "restaurant" + (group.rating ? " restaurant--rated-" + group.rating : ""),
  });

  const nameContent = group.url
    ? el("a", {
        href: group.url,
        target: "_blank",
        rel: "noopener",
        text: group.restaurantName || group.restaurantId,
      })
    : document.createTextNode(group.restaurantName || group.restaurantId);

  const allRestaurantKeys = [
    group.restaurantNoteKey,
    group.ratingKey,
    ...group.dishes.flatMap((d) => [d.key, d.thumbKey]),
  ].filter(Boolean);

  const nameRow = el("div", { class: "restaurant__name" }, [
    el("span", { class: "restaurant__title" }, [nameContent]),
    el("button", {
      class: "note__delete",
      type: "button",
      text: "Usuń",
      onclick: async () => {
        for (const k of allRestaurantKeys) await deleteNote(k);
        render();
      },
    }),
  ]);

  if (group.rating) {
    nameRow.insertBefore(
      el("span", {
        class: "restaurant__dot restaurant__dot--" + group.rating,
        title: ratingLabel(group.rating),
      }),
      nameRow.firstChild
    );
  }

  const header = el("header", { class: "restaurant__header" }, [nameRow]);
  node.appendChild(header);

  if (group.restaurantNote) {
    node.appendChild(
      el("div", { class: "note" }, [
        el("div", { class: "note__label" }, [
          document.createTextNode("Restauracja"),
          el("button", {
            class: "note__delete",
            type: "button",
            text: "Usuń",
            onclick: async () => {
              await deleteNote(group.restaurantNoteKey);
              render();
            },
          }),
        ]),
        el("div", { class: "note__body", text: group.restaurantNote }),
      ])
    );
  }

  if (group.dishes.length > 0) {
    node.appendChild(
      el("div", { class: "note" }, [
        el("div", { class: "note__label" }, [document.createTextNode("Dania")]),
        el(
          "div",
          { class: "dish-list" },
          group.dishes.map((dish) => {
            const thumbIcon =
              dish.thumbRating === "up" ? "👍" : dish.thumbRating === "down" ? "👎" : null;
            const deletableKeys = [dish.key, dish.thumbKey].filter(Boolean);
            return el("div", { class: "dish-item" }, [
              el("div", { class: "dish-row" }, [
                thumbIcon ? el("span", { class: "dish-row__thumb" }, [thumbIcon]) : null,
                el("span", { class: "dish-row__name", text: dish.name }),
                deletableKeys.length
                  ? el("button", {
                      class: "note__delete",
                      type: "button",
                      text: "Usuń",
                      onclick: async () => {
                        for (const k of deletableKeys) await deleteNote(k);
                        render();
                      },
                    })
                  : null,
              ]),
              dish.body ? el("div", { class: "dish-row__body", text: dish.body }) : null,
            ]);
          })
        ),
      ])
    );
  }

  return node;
}

async function render() {
  const groups = await loadAll();
  const query = ($("#search").value || "").trim();
  const filtered = groups.filter(
    (g) => hasContent(g) && matchesQuery(g, query)
  );

  const container = $("#restaurants");
  container.replaceChildren();

  if (filtered.length === 0) {
    $("#empty").hidden = false;
    $("#empty").textContent = query
      ? "Brak notatek pasujących do zapytania."
      : "Brak zapisanych notatek.";
  } else {
    $("#empty").hidden = true;
    for (const g of filtered) container.appendChild(buildRestaurantNode(g));
  }
}

async function rollGreen() {
  const groups = await loadAll();
  const green = groups.filter((g) => g.rating === "green");
  if (!green.length) {
    alert("Brak restauracji z zieloną oceną.");
    return;
  }
  const pick = green[Math.floor(Math.random() * green.length)];
  const url = pick.url || `https://www.pyszne.pl/menu/${pick.restaurantId}`;
  await browser.tabs.create({ url });
  window.close();
}

async function exportNotes() {
  const all = await browser.storage.local.get(null);
  const data = {};
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(STORAGE_PREFIX + "::")) data[k] = v;
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  a.download = `pysznepl-notatki-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importNotes(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      alert("Nieprawidłowy format pliku.");
      return;
    }
    const toSet = {};
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith(STORAGE_PREFIX + "::")) toSet[k] = v;
    }
    if (Object.keys(toSet).length === 0) {
      alert("Plik nie zawiera notatek pyszne.pl.");
      return;
    }
    await browser.storage.local.set(toSet);
    await render();
    alert(`Wczytano ${Object.keys(toSet).length} wpisów.`);
  } catch (e) {
    alert("Nie udało się wczytać pliku: " + e.message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  $("#search").addEventListener("input", render);
  $("#roll-btn").addEventListener("click", rollGreen);
  $("#export-btn").addEventListener("click", exportNotes);
  $("#import-btn").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) importNotes(file);
    e.target.value = "";
  });

  browser.storage.onChanged.addListener((_, area) => {
    if (area === "local") render();
  });

  render();
});
