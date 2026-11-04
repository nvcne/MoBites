/* Notepad database layer.
   Every table is a .txt file in /data: one record per line, columns separated by "|",
   the first non-# line is the header, lines starting with "#" are notes.

   READ  : fetch the .txt file -> split lines -> split by "|" -> objects.
   WRITE : if server.py is running, POST to it and it appends/rewrites the .txt file.
           Otherwise (GitHub Pages) rows are kept in this browser (localStorage) and can be
           downloaded as a .txt file with DB.exportTable(). */

const DB = {
  tables: {},   // name -> { header: [...], rows: [...] }
  server: false,
  warnings: [],
};

const TABLES = ["categories", "restaurants", "menu", "users", "orders", "team", "staff", "admins", "messages", "feedback"];
const NUMERIC = new Set(["lat", "lng", "rating", "reviews", "fee", "price", "total", "points", "placed_at", "sent_at"]);

function parseTable(text, name) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);   // strip Notepad BOM, handle CRLF
  let header = null;
  const rows = [];
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const cells = line.split("|").map((c) => c.trim());
    if (!header) { header = cells; return; }
    if (cells.length !== header.length) {
      DB.warnings.push(`${name}.txt line ${i + 1}: expected ${header.length} columns, found ${cells.length}. Skipped.`);
      return;
    }
    const row = {};
    header.forEach((col, j) => {
      const v = cells[j];
      row[col] = NUMERIC.has(col) && v !== "" && !isNaN(Number(v)) ? Number(v) : v;
    });
    rows.push(row);
  });
  return { header: header || [], rows };
}

const localKey = (t) => "mb_db_" + t;
function localRows(t) { try { return JSON.parse(localStorage.getItem(localKey(t)) || "[]"); } catch { return []; } }
function saveLocalRows(t, rows) { try { localStorage.setItem(localKey(t), JSON.stringify(rows)); } catch { /* storage blocked */ } }
// ids deleted while there's no server (the .txt file still has them, so hide them)
function deletedIds(t) { try { return JSON.parse(localStorage.getItem(localKey(t) + "_deleted") || "[]"); } catch { return []; } }
function saveDeletedIds(t, ids) { try { localStorage.setItem(localKey(t) + "_deleted", JSON.stringify(ids)); } catch { /* storage blocked */ } }

async function loadDB() {
  await Promise.all(TABLES.map(async (t) => {
    const res = await fetch(`data/${t}.txt`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Could not load data/${t}.txt`);
    DB.tables[t] = parseTable(await res.text(), t);
  }));
  try {
    const r = await fetch("api/ping", { cache: "no-store" });
    DB.server = r.ok && (await r.json()).ok === true;
  } catch { DB.server = false; }
  DB.warnings.forEach((w) => console.warn("[Notepad DB]", w));
}

/** Re-read tables from disk so changes made in another browser show up (live orders, chat). */
async function refreshTables(list) {
  if (!DB.server) return false;   // without the server, other tabs' changes arrive through localStorage
  await Promise.all(list.map(async (t) => {
    try {
      const res = await fetch(`data/${t}.txt`, { cache: "no-store" });
      if (res.ok) DB.tables[t] = parseTable(await res.text(), t);
    } catch { /* offline for a moment; keep the old copy */ }
  }));
  return true;
}

/** All rows of a table: rows from the .txt file + rows saved in this browser (browser rows win). */
function rows(t) {
  const local = DB.server ? [] : localRows(t);
  const key = DB.tables[t].header[0];
  const ids = new Set(local.map((r) => String(r[key])));
  const gone = new Set(DB.server ? [] : deletedIds(t));
  return local.concat(DB.tables[t].rows.filter((r) => !ids.has(String(r[key])))).filter((r) => !gone.has(String(r[key])));
}

const cleanCell = (v) => String(v ?? "").replace(/\|/g, "/").replace(/[\r\n]+/g, " ").trim();

async function appendRow(t, row) {
  const clean = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, cleanCell(v)]));
  if (DB.server) {
    const r = await fetch("api/append", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ table: t, row: clean }) });
    if (!r.ok) throw new Error("Could not save to " + t + ".txt");
    DB.tables[t].rows.unshift(row);
  } else {
    saveLocalRows(t, [row, ...localRows(t)]);
    const key = DB.tables[t].header[0];
    saveDeletedIds(t, deletedIds(t).filter((x) => x !== String(row[key])));
  }
}

async function updateRow(t, id, changes) {
  const key = DB.tables[t].header[0];
  if (DB.server) {
    const r = await fetch("api/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ table: t, id, changes }) });
    if (!r.ok) throw new Error("Could not update " + t + ".txt");
    const row = DB.tables[t].rows.find((x) => String(x[key]) === String(id));
    if (row) Object.assign(row, changes);
  } else {
    const local = localRows(t);
    const existing = local.find((x) => String(x[key]) === String(id)) || rows(t).find((x) => String(x[key]) === String(id));
    if (!existing) return;
    const updated = { ...existing, ...changes };
    saveLocalRows(t, [updated, ...local.filter((x) => String(x[key]) !== String(id))]);
  }
}

async function deleteRow(t, id) {
  const key = DB.tables[t].header[0];
  if (DB.server) {
    const r = await fetch("api/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ table: t, id }) });
    if (!r.ok) throw new Error("Could not delete from " + t + ".txt");
  } else {
    saveLocalRows(t, localRows(t).filter((x) => String(x[key]) !== String(id)));
    saveDeletedIds(t, [...new Set([...deletedIds(t), String(id)])]);
  }
  DB.tables[t].rows = DB.tables[t].rows.filter((x) => String(x[key]) !== String(id));
}

/** Download a table as a Notepad-friendly .txt (UTF-8 with BOM, Windows line endings). */
function exportTable(t, filterFn = () => true) {
  const { header } = DB.tables[t];
  const lines = [header.join("|"), ...rows(t).filter(filterFn).map((r) => header.map((h) => cleanCell(r[h])).join("|"))];
  const blob = new Blob(["﻿" + lines.join("\r\n") + "\r\n"], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = t + ".txt";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Shrink a photo in the browser, then save it in assets/img/<folder>/ (server) or keep it in the row itself (no server). */
async function uploadPhoto(file, folder, name) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Use a JPG, PNG or WEBP photo.");
  const img = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error("That photo couldn't be opened.")); i.src = URL.createObjectURL(file); });
  const scale = Math.min(1, (DB.server ? 1200 : 480) / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  const data = c.toDataURL("image/jpeg", DB.server ? 0.85 : 0.7);
  if (!DB.server) return data;   // stored as text in the browser copy of the table
  const r = await fetch("api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder, name, data }) });
  if (!r.ok) throw new Error("Couldn't upload the photo. Is server.py still running?");
  return (await r.json()).file;
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
