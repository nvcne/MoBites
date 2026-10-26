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

const TABLES = ["categories", "restaurants", "menu", "users", "orders"];
const NUMERIC = new Set(["lat", "lng", "rating", "reviews", "fee", "price", "total", "points", "placed_at"]);

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

/** All rows of a table: rows from the .txt file + rows saved in this browser (browser rows win). */
function rows(t) {
  const local = DB.server ? [] : localRows(t);
  const key = DB.tables[t].header[0];
  const ids = new Set(local.map((r) => String(r[key])));
  return local.concat(DB.tables[t].rows.filter((r) => !ids.has(String(r[key]))));
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

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
