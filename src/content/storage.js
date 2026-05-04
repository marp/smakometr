"use strict";

const STORAGE_PREFIX = "pysznepl_notes";
const RATING_VALUES = ["red", "orange", "green"];

function storageKey(...parts) {
  return [STORAGE_PREFIX, ...parts].join("::");
}

async function _sGet(key, validate) {
  try {
    const result = await browser.storage.local.get(key);
    const v = result[key];
    return validate ? (validate(v) ? v : "") : v || "";
  } catch (_) {
    return "";
  }
}

async function _sSet(key, value, meta) {
  try {
    await browser.storage.local.set({
      [key]: value,
      [key + "::meta"]: { ...meta, updatedAt: Date.now() },
    });
  } catch (e) {
    console.warn("[pyszne notatki] storage.set failed", e);
  }
}

async function _sClear(key) {
  try {
    await browser.storage.local.remove([key, key + "::meta"]);
  } catch (e) {
    console.warn("[pyszne notatki] storage.remove failed", e);
  }
}

async function getNote(key) {
  return _sGet(key);
}

async function setNote(key, value, meta) {
  if (value && value.trim()) {
    await _sSet(key, value, meta);
  } else {
    await _sClear(key);
  }
}

async function getRating(restaurantId) {
  return _sGet(
    storageKey("rating", restaurantId),
    (v) => RATING_VALUES.includes(v)
  );
}

async function setRating(restaurantId, value, meta) {
  const key = storageKey("rating", restaurantId);
  if (RATING_VALUES.includes(value)) {
    await _sSet(key, value, { ...meta, type: "rating", restaurantId });
  } else {
    await _sClear(key);
  }
}

async function getDishThumb(key) {
  return _sGet(key, (v) => v === "up" || v === "down");
}

async function setDishThumb(key, value, meta) {
  if (value === "up" || value === "down") {
    await _sSet(key, value, meta);
  } else {
    await _sClear(key);
  }
}
