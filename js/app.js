/* MoBites: single-page app.
   Data comes from the Notepad database in /data (see js/db.js).
   Two points of view share one theme and one navigation system:
   - Guest: landing, pin a location, browse restaurants and menus; ordering/saving asks you to log in.
   - Member: greeting, bag + checkout, live order tracking, history, favorites, rewards, profile. */

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const peso = (n) => "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: Number.isInteger(+n) ? 0 : 2, maximumFractionDigits: 2 });
const initials = (name) => { const w = name.split(/\s+/).filter((p) => /^[A-Za-zÀ-ÿ]/.test(p)); return ((w[0]?.[0] || "") + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase(); };
const firstName = (name) => name.split(/\s+/)[0];
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; // local date, not UTC
const fmtDate = (d) => new Date(d + "T12:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
const fmtTime = (ms) => new Date(ms).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });

const SERVICE_FEE = 15;
const PESOS_PER_POINT = 10;          // 1 point for every ₱10
const REWARD_STEP = 1500;            // 1,500 points = ₱100 off
const PROMO = { code: "MOBICNE", off: 50, min: 300 };
const MANILA = { lat: 14.5995, lng: 120.9842 };

/* ---------- table accessors (Notepad DB) ---------- */
const categories = () => rows("categories");
const restaurants = () => rows("restaurants");
const menuItems = () => rows("menu");
const restaurantById = (id) => restaurants().find((r) => String(r.id) === String(id));
const itemById = (id) => menuItems().find((m) => String(m.id) === String(id));
const categoryById = (id) => categories().find((c) => c.id === id) || { label: "Food", icon: "utensils" };
const parseItems = (s) => String(s).split(";").filter(Boolean).map((p) => p.split("x").map(Number));
const toneOf = (r) => restaurants().indexOf(r) % 4;

/* ---------- browser storage (sessions, bag, favorites, location) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem("mb_" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("mb_" + k, JSON.stringify(v)); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem("mb_" + k); } catch { /* ignore */ } },
};
const memory = {};

function currentUser() {
  const email = store.get("session", memory.session);
  if (!email) return null;
  const u = rows("users").find((x) => x.email.toLowerCase() === email.toLowerCase());
  return u ? { ...u, ...store.get("profile_" + u.email, {}) } : null;
}
function setSession(email, remember) { memory.session = email; if (remember !== false) store.set("session", email); else store.del("session"); }
function logout() { memory.session = null; store.del("session"); store.del("cart"); }

function getCart() { return store.get("cart", memory.cart || { r: null, items: {} }); }
function setCart(c) { memory.cart = c; store.set("cart", c); }
function cartCount() { return Object.values(getCart().items).reduce((a, b) => a + b, 0); }
function cartSubtotal(c = getCart()) { return Object.entries(c.items).reduce((s, [id, q]) => s + (itemById(id)?.price || 0) * q, 0); }

const userOrders = (u) => rows("orders").filter((o) => o.email.toLowerCase() === u.email.toLowerCase());
function favorites(u) { return store.get("favs_" + u.email, ["r01", "r05", "r07"]); }
function toggleFavorite(u, rid) {
  const f = favorites(u);
  const next = f.includes(rid) ? f.filter((x) => x !== rid) : f.concat(rid);
  store.set("favs_" + u.email, next);
  return next.includes(rid);
}
const userPoints = (u) => (Number(u.points) || 0) + store.get("earned_" + u.email, 0);

const getLoc = () => store.get("loc", memory.loc || null);
function setLoc(l) { memory.loc = l; store.set("loc", l); }
function distanceKm(a, b) {
  if (!a || !b || a.lat == null || b.lat === "" || b.lat == null) return null;
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Placed orders move through the status system on a short demo clock.
const STATUSES = { pending: "Pending", preparing: "Preparing", "on-the-way": "On the way", delivered: "Delivered", cancelled: "Cancelled" };
const STAGES = ["pending", "preparing", "on-the-way", "delivered"];
function orderStatus(o) {
  if (o.status === "cancelled" || !o.placed_at) return o.status;
  const s = (Date.now() - o.placed_at) / 1000;
  return s < 20 ? "pending" : s < 50 ? "preparing" : s < 100 ? "on-the-way" : "delivered";
}
const statusPill = (st) => `<span class="status status--${st}">${STATUSES[st] || esc(st)}</span>`;

/* ---------- images: real photo if the .txt names one, else a placeholder ---------- */
const ph = (ic, tone, text = "Add photo") => `<div class="ph" data-tone="${tone}">${icon(ic, 48)}<span>${text}</span></div>`;
function pic(file, folder, alt, ic, tone) {
  return file ? `<img src="assets/img/${folder}/${esc(file)}" alt="${esc(alt)}" loading="lazy" data-icon="${ic}" data-tone="${tone}" onerror="phSwap(this)">` : ph(ic, tone);
}
window.phSwap = (el) => { el.outerHTML = ph(el.dataset.icon, el.dataset.tone); };
const restaurantPic = (r) => pic(r.image, "restaurants", r.name, categoryById(r.category).icon, toneOf(r));
const dishPic = (m) => { const r = restaurantById(m.restaurant_id); return pic(m.image, "menu", m.name, categoryById(r?.category).icon, r ? toneOf(r) : 0); };

/* ---------- ui bits ---------- */
let toastTimer;
function toast(msg, ic = "checkCircle") {
  const t = $("#toast");
  t.innerHTML = icon(ic, 18) + `<span>${esc(msg)}</span>`;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
}
function modal(html, cls = "") {
  const m = $("#modal");
  m.innerHTML = `<div class="dialog ${cls}" role="dialog" aria-modal="true">${html}</div>`;
  m.hidden = false;
  const close = () => { m.hidden = true; m.innerHTML = ""; document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  m.onclick = (e) => { if (e.target === m || e.target.closest("[data-close]")) close(); };
  m.querySelector("input, button, a")?.focus();
  return close;
}
function askToLogin(reason, next) {
  const q = "?next=" + encodeURIComponent(next || currentPath());
  modal(`
    <div class="ring">${icon("lock", 28)}</div>
    <h2 style="font-size:24px">${esc(reason)}</h2>
    <p class="muted">Log in or sign up for free to order, save favorites and track your delivery.</p>
    <div class="actions">
      <a class="btn btn-primary" href="#/login${q}" data-close>Log in</a>
      <a class="btn btn-ghost" href="#/signup${q}" data-close>Sign up, it's free</a>
      <button class="btn btn-ghost" style="border:0" data-close>Browse muna</button>
    </div>`);
}

/** Yes/No pop-up. Resolves true only when the user confirms (closing it does nothing). */
function confirmBox({ ic = "alert", title, text = "", yes, no = "Cancel", danger = false }) {
  return new Promise((resolve) => {
    const close = modal(`<div class="ring">${icon(ic, 28)}</div><h2 style="font-size:24px">${esc(title)}</h2>${text ? `<p class="muted">${text}</p>` : ""}
      <div class="actions"><button class="btn ${danger ? "btn-danger" : "btn-primary"}" id="cfYes">${esc(yes)}</button><button class="btn btn-ghost" data-close>${esc(no)}</button></div>`);
    $("#cfYes").onclick = () => { close(); resolve(true); };
  });
}

function restaurantCard(r, u) {
  const fav = u && favorites(u).includes(r.id);
  const km = distanceKm(getLoc(), r);
  return `
  <a class="card r-card" href="#/r/${r.id}">
    <div class="media">${restaurantPic(r)}${r.badge ? `<span class="badge">${esc(r.badge)}</span>` : ""}</div>
    <button class="icon-btn fav ${fav ? "is-on" : ""}" data-fav="${r.id}" aria-label="${fav ? "Remove from" : "Save to"} favorites" aria-pressed="${!!fav}">${icon("heart", 18)}</button>
    <div class="body">
      <div class="row"><h3>${esc(r.name)}</h3><span class="rating">${icon("star", 15)} ${Number(r.rating).toFixed(1)}</span></div>
      <p class="muted small">${esc(r.tags)} · ${esc(r.price)}</p>
      <div class="meta"><span>${icon("clock", 15)} ${esc(r.time)} min</span>${km != null ? `<span>${icon("pin", 15)} ${km.toFixed(1)} km</span>` : `<span>${icon("pin", 15)} ${esc(r.area)}</span>`}<span>${icon("bike", 15)} ${peso(r.fee)}</span></div>
      <span class="cta">View menu ${icon("arrowRight", 14)}</span>
    </div>
  </a>`;
}
function bindFavButtons(root) {
  $$("[data-fav]", root).forEach((b) => b.addEventListener("click", async (e) => {
    e.preventDefault(); e.stopPropagation();
    const u = currentUser();
    if (!u) return askToLogin("Save your favorite spots");
    if (currentPath() === "favorites" && favorites(u).includes(b.dataset.fav) &&
      !await confirmBox({ ic: "heart", title: "Remove from favorites?", text: `${esc(restaurantById(b.dataset.fav)?.name)} will be removed from your saved list.`, yes: "Remove", danger: true })) return;
    const on = toggleFavorite(u, b.dataset.fav);
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-pressed", on);
    toast(on ? "Saved to favorites" : "Removed from favorites", "heart");
    if (currentPath() === "favorites") render();
  }));
}

/* ---------- location picker: Leaflet + OpenStreetMap + Nominatim (all free, open source) ---------- */
let lastGeoCall = 0;
async function nominatim(path) {
  const wait = 1100 - (Date.now() - lastGeoCall);           // usage policy: max 1 request per second
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeoCall = Date.now();
  const res = await fetch(`https://nominatim.openstreetmap.org/${path}&accept-language=en`);
  if (!res.ok) throw new Error("lookup failed");
  return res.json();
}
function shortAddress(a = {}, fallback = "") {
  const street = a.road ? (a.house_number ? `${a.house_number} ${a.road}` : a.road) : a.amenity || a.building;
  const brgy = a.quarter || a.neighbourhood || a.suburb || a.village;
  const city = a.city || a.town || a.municipality || a.county;
  return [street, brgy, city].filter(Boolean).join(", ") || fallback.split(",").slice(0, 3).join(",");
}

function openMapPicker({ locate = false, onDone } = {}) {
  const cur = getLoc();
  const close = modal(`
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
      <h2 style="font-size:22px">${icon("pin", 22)} Where should we deliver?</h2>
      <button class="icon-btn" data-close aria-label="Close">${icon("x", 18)}</button>
    </div>
    <form class="map-search" id="mapSearch"><input id="mapQ" placeholder="Search street, barangay or building" aria-label="Search address" autocomplete="off"><button class="btn btn-primary btn-sm">${icon("search", 16)}</button></form>
    <div class="map-results" id="mapResults"></div>
    <div class="map-box" id="mapBox">
      <div id="map" aria-label="Map. Drag to move the pin."></div>
      <div class="map-pin"><svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M20 10c0 5-5.5 10.2-7.4 11.8a1 1 0 0 1-1.2 0C9.5 20.2 4 15 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3" fill="#fff"/></svg></div>
      <button type="button" class="btn btn-ghost btn-sm map-locate" id="locate">${icon("locate", 16)} Use my location</button>
    </div>
    <p class="small muted" style="margin-top:-6px">Drag the map so the pin sits on your door.</p>
    <div class="map-addr" aria-live="polite">${icon("pin", 20)}<div><b id="addrLabel">${esc(cur?.label || "Move the map to pick a spot")}</b><br><span class="small muted" id="addrHint">${cur ? "Saved location" : "We'll fill in the address for you"}</span></div></div>
    <div class="field"><label for="detail">House no., unit, landmark <span class="muted">(optional)</span></label><input id="detail" value="${esc(cur?.detail || "")}" placeholder="e.g. Unit 4B, beside the sari-sari store" maxlength="80"></div>
    <button class="btn btn-primary btn-block" id="confirmLoc">Deliver here ${icon("arrowRight", 16)}</button>`, "map-dialog");

  const label = $("#addrLabel"), hint = $("#addrHint"), box = $("#mapBox");
  let picked = cur ? { ...cur } : null;
  let skipReverse = false, timer;

  if (!window.L) {
    box.innerHTML = `<div class="ph" data-tone="2">${icon("pin", 48)}<span>Map couldn't load (offline?). Type your address below.</span></div>`;
    $("#detail").previousElementSibling.textContent = "Full delivery address";
    $("#confirmLoc").onclick = () => {
      const d = $("#detail").value.trim();
      if (d.length < 5) return toast("Type your full address first", "alert");
      setLoc({ label: d, lat: null, lng: null, detail: "" }); close(); toast("Delivery location saved", "pin"); onDone ? onDone() : render();
    };
    return;
  }

  const start = cur?.lat != null ? cur : MANILA;
  const map = L.map("map", { zoomControl: true, attributionControl: true }).setView([start.lat, start.lng], cur?.lat != null ? 17 : 12);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>' }).addTo(map);
  setTimeout(() => map.invalidateSize(), 50);

  const lookup = async () => {
    const c = map.getCenter();
    picked = { lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6), label: picked?.label };
    if (skipReverse) { skipReverse = false; return; }
    label.textContent = "Finding address…"; hint.textContent = `${picked.lat}, ${picked.lng}`;
    try {
      const j = await nominatim(`reverse?format=jsonv2&lat=${picked.lat}&lon=${picked.lng}&zoom=18&addressdetails=1`);
      picked.label = shortAddress(j.address, j.display_name || "");
      label.textContent = picked.label || "Pinned location";
      hint.textContent = j.address?.postcode ? `${j.address.postcode} · Metro Manila` : "Pinned on the map";
    } catch {
      picked.label = `Pinned location (${picked.lat}, ${picked.lng})`;
      label.textContent = picked.label; hint.textContent = "Couldn't look up the street name. You can add details below.";
    }
  };
  map.on("movestart", () => box.classList.add("is-moving"));
  map.on("moveend", () => { box.classList.remove("is-moving"); clearTimeout(timer); timer = setTimeout(lookup, 500); });

  $("#mapSearch").onsubmit = async (e) => {
    e.preventDefault();
    const q = $("#mapQ").value.trim();
    const out = $("#mapResults");
    if (q.length < 3) { out.innerHTML = `<span class="small muted">Type at least 3 letters.</span>`; return; }
    out.innerHTML = `<span class="small muted">Searching…</span>`;
    try {
      const list = await nominatim(`search?format=jsonv2&q=${encodeURIComponent(q)}&countrycodes=ph&limit=5&addressdetails=1`);
      out.innerHTML = list.length ? list.map((x, i) => `<button type="button" data-i="${i}">${icon("pin", 16)}<span>${esc(x.display_name)}</span></button>`).join("") : `<span class="small muted">No matches. Try a nearby street or landmark.</span>`;
      $$("[data-i]", out).forEach((b) => b.onclick = () => {
        const x = list[+b.dataset.i];
        picked = { lat: +(+x.lat).toFixed(6), lng: +(+x.lon).toFixed(6), label: shortAddress(x.address, x.display_name) };
        label.textContent = picked.label; hint.textContent = "From search";
        skipReverse = true; map.setView([picked.lat, picked.lng], 17); out.innerHTML = "";
      });
    } catch { out.innerHTML = `<span class="small muted">Search is unavailable right now. Drag the map instead.</span>`; }
  };

  const geolocate = () => {
    if (!navigator.geolocation) return toast("Your browser can't share location. Search instead.", "alert");
    label.textContent = "Getting your location…";
    navigator.geolocation.getCurrentPosition(
      (p) => map.setView([p.coords.latitude, p.coords.longitude], 18),
      () => { label.textContent = picked?.label || "Move the map to pick a spot"; toast("Location permission was blocked. Search or drag the map instead.", "alert"); },
      { enableHighAccuracy: true, timeout: 10000 });
  };
  $("#locate").onclick = geolocate;
  if (locate) geolocate();

  $("#confirmLoc").onclick = () => {
    if (!picked?.label) { const c = map.getCenter(); picked = { lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6), label: "Pinned location" }; }
    setLoc({ ...picked, detail: $("#detail").value.trim() });
    close();
    toast("Delivering to " + picked.label, "pin");
    onDone ? onDone() : render();
  };
}

/* ---------- form validation ---------- */
const normalizePhone = (v) => { let d = v.replace(/\D/g, ""); if (d.startsWith("63") && d.length === 12) d = "0" + d.slice(2); return d; };
const RULES = {
  required: (v) => v.trim() !== "" || "This field is required.",
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || "Enter a valid email, like juan@email.com.",
  name: (v) => v.trim().length >= 2 || "Enter your full name.",
  password: (v) => (v.length >= 8 && /\d/.test(v) && /[^A-Za-z0-9]/.test(v)) || "Use 8+ characters with a number and a symbol.",
  phone: (v) => /^09\d{9}$/.test(normalizePhone(v)) || "Enter an 11-digit PH mobile number, like 0917 123 4567.",
  card: (v) => luhn(v) || "That card number doesn't look right.",
  expiry: (v) => validExpiry(v) || "Use MM/YY and a date in the future.",
  cvc: (v) => /^\d{3,4}$/.test(v.trim()) || "3 or 4 digits on the back of the card.",
  checked: (_, el) => el.checked || "Please accept to continue.",
};
function luhn(v) {
  const d = v.replace(/\s/g, "");
  if (!/^\d{16}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 16; i++) { let n = +d[15 - i]; if (i % 2) { n *= 2; if (n > 9) n -= 9; } sum += n; }
  return sum % 10 === 0;
}
function validExpiry(v) {
  const m = v.trim().match(/^(\d{2})\/(\d{2})$/);
  if (!m || +m[1] < 1 || +m[1] > 12) return false;
  return new Date(2000 + +m[2], +m[1], 1) > new Date();
}
function checkField(el, extra) {
  const f = el.closest(".field") || el.closest(".check");
  if (!f || el.disabled || el.closest("[hidden]")) return true;
  let msg = true;
  for (const rule of (el.dataset.rules || "").split(" ").filter(Boolean)) {
    msg = RULES[rule](el.type === "checkbox" ? "" : el.value, el);
    if (msg !== true) break;
  }
  if (msg === true && extra) msg = extra(el);
  f.classList.toggle("has-error", msg !== true);
  f.classList.toggle("is-valid", msg === true && el.value !== "" && el.type !== "checkbox");
  const err = f.querySelector(".err");
  if (err) err.innerHTML = msg === true ? "" : icon("alert", 14) + esc(msg);
  el.setAttribute("aria-invalid", msg !== true);
  return msg === true;
}
function validateForm(form, extra = {}) {
  let ok = true, first = null;
  $$("[data-rules]", form).forEach((el) => { const good = checkField(el, extra[el.name]); if (!good && !first) first = el; ok = ok && good; });
  first?.focus();
  form.dataset.touched = "1";
  return ok;
}
function liveValidate(form, extra = {}) {
  $$("[data-rules]", form).forEach((el) => {
    el.addEventListener("blur", () => el.value && checkField(el, extra[el.name]));
    el.addEventListener("input", () => form.dataset.touched && checkField(el, extra[el.name]));
    el.addEventListener("change", () => form.dataset.touched && checkField(el, extra[el.name]));
  });
}
function maskPhone(input) {
  input.addEventListener("input", () => {
    const d = normalizePhone(input.value).slice(0, 11);
    input.value = [d.slice(0, 4), d.slice(4, 7), d.slice(7)].filter(Boolean).join(" ");
  });
}
const field = (o) => `
  <div class="field">
    <label for="${o.id}">${o.label}</label>
    ${o.password ? `<div class="pw-wrap">` : ""}
    <input id="${o.id}" name="${o.name || o.id}" type="${o.type || "text"}" value="${esc(o.value || "")}" placeholder="${esc(o.ph || "")}" ${o.rules ? `data-rules="${o.rules}"` : ""} ${o.attrs || ""} aria-describedby="${o.id}-err">
    ${o.password ? `<button type="button" data-toggle-pw aria-label="Show password">${icon("eye", 18)}</button></div>` : ""}
    ${o.hint ? `<span class="hint">${o.hint}</span>` : ""}
    <span class="err" id="${o.id}-err"></span>
  </div>`;
const phoneField = (id, label, value = "") => field({ id, label, type: "tel", value, ph: "0917 123 4567", rules: "required phone", hint: "11 digits, starts with 09", attrs: 'inputmode="tel" autocomplete="tel" maxlength="16"' });
function bindPasswordToggles(root) {
  $$("[data-toggle-pw]", root).forEach((b) => b.addEventListener("click", () => {
    const i = b.previousElementSibling;
    i.type = i.type === "password" ? "text" : "password";
    b.setAttribute("aria-label", i.type === "password" ? "Show password" : "Hide password");
  }));
}

/* ---------- chrome: top bar, bottom bar, footer ---------- */
function renderChrome(path, u) {
  const active = (p) => (path === p || path.startsWith(p + "/") ? "is-active" : "");
  const count = cartCount();
  const loc = getLoc();
  const locBtn = `<button class="loc-btn ${loc ? "" : "is-empty"}" data-loc aria-label="Change delivery location">
      <span class="pin">${icon("pin", 18)}</span><span><small>Deliver to</small><b>${esc(loc?.label || "Set your location")}</b></span>${icon("chevronDown", 16)}</button>`;
  const brand = `<a class="brand" href="#/" aria-label="MoBites home">${icon("bike", 28)}MoBites</a>`;
  if (!u) {
    $("#topbar").innerHTML = `<div class="wrap">
      ${brand}
      <nav class="nav-links" aria-label="Primary">
        <a href="#/explore" class="${active("explore") || active("r")}">Restaurants</a>
        <a href="#/how">How it works</a>
      </nav>
      <div class="top-actions">
        ${locBtn}
        <span class="pov" title="Presentation: current point of view">${icon("user", 14)} Guest view</span>
        <a class="btn btn-ghost btn-sm hide-sm" href="#/login">Log in</a>
        <a class="btn btn-primary btn-sm" href="#/signup">Sign up</a>
      </div></div><div class="mobile-loc">${locBtn}</div>`;
    $("#bottombar").innerHTML = `
      <a href="#/" class="${path === "" || path === "how" ? "is-active" : ""}">${icon("home", 22)}Home</a>
      <a href="#/explore" class="${active("explore") || active("r")}">${icon("compass", 22)}Food</a>
      <a href="#/orders">${icon("receipt", 22)}<span class="lock">${icon("lock", 11)}</span>Orders</a>
      <a href="#/login" class="${active("login") || active("signup")}">${icon("user", 22)}Log in</a>`;
  } else {
    $("#topbar").innerHTML = `<div class="wrap">
      ${brand}
      <nav class="nav-links" aria-label="Primary">
        <a href="#/explore" class="${active("explore") || active("r")}">Food</a>
        <a href="#/orders" class="${active("orders")}">Orders</a>
        <a href="#/favorites" class="${active("favorites")}">Favorites</a>
        <a href="#/rewards" class="${active("rewards")}">Rewards</a>
      </nav>
      <div class="top-actions">
        ${locBtn}
        <span class="pov is-member" title="Presentation: current point of view">${icon("checkCircle", 14)} Member view</span>
        <a class="cart-pill" href="#/cart" aria-label="Bag, ${count} items">${icon("bag", 16)} ${count}</a>
        <a class="avatar" href="#/profile" aria-label="Profile">${initials(u.name)}</a>
      </div></div><div class="mobile-loc">${locBtn}</div>`;
    $("#bottombar").innerHTML = `
      <a href="#/explore" class="${active("explore") || active("r")}">${icon("compass", 22)}Food</a>
      <a href="#/orders" class="${active("orders")}">${icon("receipt", 22)}Orders</a>
      <a href="#/cart" class="${active("cart")}">${icon("bag", 22)}${count ? `<span class="dot">${count}</span>` : ""}Bag</a>
      <a href="#/favorites" class="${active("favorites")}">${icon("heart", 22)}Saved</a>
      <a href="#/profile" class="${active("profile") || active("rewards")}">${icon("user", 22)}Me</a>`;
  }
  $$("[data-loc]").forEach((b) => b.onclick = () => openMapPicker());
  $("#footer").innerHTML = `<div class="wrap">
    <span><strong>MoBites</strong> · Your bites, on the move. Made in the Philippines.</span>
    <nav aria-label="Footer"><a href="#/about">About us</a><a href="#/how">Help</a><a href="#/privacy">Privacy Policy</a><a href="#/terms">Terms of Service</a></nav>
    <span>© 2026 MoBites</span></div>`;
}

/* ---------- pages ---------- */
function pageHome() {
  const loc = getLoc();
  let popular = [...restaurants()];
  popular = loc ? popular.sort((a, b) => (distanceKm(loc, a) ?? 99) - (distanceKm(loc, b) ?? 99)) : popular.sort((a, b) => b.rating - a.rating);
  popular = popular.slice(0, 6);
  return {
    html: `
    <section class="hero"><div class="wrap">
      <div>
        <span class="eyebrow">${icon("bike", 16)} Food delivery, Pinoy style</span>
        <h1>Gutom ka na?<br><span class="hl">Kain na!</span></h1>
        <p class="lead">Order from your favorite local spots and get it delivered hot to your door. Three taps lang.</p>
        <div class="where">
          <label for="whereBtn">${icon("pin", 20)} Where should we deliver?</label>
          <div class="where-row">
            <button class="where-input ${loc ? "has-value" : ""}" id="whereBtn" type="button">${icon("search", 18)}<span>${esc(loc?.label || "Enter your street, barangay or building")}</span></button>
            <a class="btn btn-primary" href="#/explore">Find food ${icon("arrowRight", 16)}</a>
          </div>
          <button class="geo" id="geoBtn" type="button">${icon("locate", 16)} Use my current location</button>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="blob"></div>
        <img src="assets/img/hero.jpg" alt="">
        <span class="sticker s1">${icon("clock", 18)} Hot in 30 mins</span>
        <span class="sticker s2">${icon("gift", 18)} ${PROMO.code}: ${peso(PROMO.off)} off</span>
      </div>
    </div></section>

    <section class="section" style="padding-top:8px"><div class="wrap">
      <div class="section-head"><div><h2>Ano'ng gusto mo today?</h2><p class="muted">Tap a category to start.</p></div></div>
      <div class="cat-grid">${categories().map((c) => `<a class="cat" href="#/explore?cat=${c.id}"><span class="bubble">${icon(c.icon, 28)}</span>${esc(c.label)}</a>`).join("")}</div>
    </div></section>

    <section class="section" style="padding-top:0"><div class="wrap">
      <div class="section-head"><div><h2>${loc ? "Malapit sa'yo" : "Popular right now"}</h2><p class="muted">${loc ? "Closest to " + esc(loc.label) : "Loved by hungry neighbors all over Metro Manila."}</p></div>
        <a class="link-arrow" href="#/explore">See all restaurants ${icon("arrowRight", 16)}</a></div>
      <div class="grid">${popular.map((r) => restaurantCard(r, null)).join("")}</div>
    </div></section>

    <section class="section steps" id="how"><div class="wrap">
      <div class="section-head"><h2>Ordering is as easy as 1-2-3</h2></div>
      <div class="steps-grid">
        <div class="step"><div class="num">1</div><h3>Pin your location</h3><p>Search your address or use your phone's GPS. Drag the pin to your exact door.</p></div>
        <div class="step"><div class="num">2</div><h3>Pick your food</h3><p>Browse local favorites, add to your bag, and pay by cash, GCash or card.</p></div>
        <div class="step"><div class="num">3</div><h3>Kain na!</h3><p>Track your rider live from the kitchen to your door. Enjoy it while it's hot.</p></div>
      </div>
    </div></section>

    <section class="section"><div class="wrap">
      <div class="promo">
        <div>
          <span class="eyebrow">First order treat</span>
          <h2 style="margin:8px 0 10px">${peso(PROMO.off)} off your first order!</h2>
          <p>Use this code on orders of ${peso(PROMO.min)} or more. Tap it to copy.</p>
        </div>
        <button class="code" id="copyCode" type="button" title="Copy promo code">${icon("gift", 24)} ${PROMO.code}</button>
      </div>
    </div></section>

    <section class="section faq" style="padding-top:0"><div class="wrap" style="max-width:820px">
      <h2 style="margin-bottom:18px;text-align:center">May tanong? We've got answers.</h2>
      <details open><summary>Do I need an account to look around?</summary><p>Hindi! Browse every restaurant and menu as a guest. You only need to log in when you're ready to order.</p></details>
      <details><summary>How do I set my delivery address?</summary><p>Tap "Deliver to" at the top, then search your address, use your current location, or drag the map so the pin is on your door.</p></details>
      <details><summary>How can I pay?</summary><p>Cash on delivery, GCash, or debit/credit card. A small ${peso(SERVICE_FEE)} service fee applies to each order.</p></details>
      <details><summary>Can I track my order?</summary><p>Yes. You'll see every step live: Pending, Preparing, On the way and Delivered.</p></details>
    </div></section>`,
    after(root) {
      bindFavButtons(root);
      $("#whereBtn", root).onclick = () => openMapPicker();
      $("#geoBtn", root).onclick = () => openMapPicker({ locate: true });
      $("#copyCode", root).onclick = async () => {
        try { await navigator.clipboard.writeText(PROMO.code); } catch { /* clipboard blocked */ }
        toast(`Copied ${PROMO.code}! Use it at checkout.`, "gift");
      };
    },
  };
}

function pageExplore(_, query) {
  const u = currentUser();
  const loc = getLoc();
  let cat = query.get("cat") || "all";
  let q = query.get("q") || "";
  let sort = loc ? "nearest" : "recommended";
  const sorts = [["recommended", "Recommended"], ...(loc ? [["nearest", "Nearest"]] : []), ["rating", "Top rated"], ["fastest", "Fastest"], ["fee", "Lowest delivery fee"]];
  return {
    html: `<div class="wrap">
      <div class="page-head">
        <h1>${u ? `Hi ${esc(firstName(u.name))}! Ano'ng kakainin natin?` : "What are you craving?"}</h1>
        <p class="muted">${loc ? `Delivering to <b>${esc(loc.label)}</b>` : "Set your location to see how far each restaurant is."}</p>
      </div>
      ${u ? "" : `<div class="guest-strip">${icon("user", 20)}<span class="grow"><b>You're browsing as a guest.</b> Log in to order, save favorites and track deliveries.</span><a class="btn btn-primary btn-sm" href="#/login?next=explore">Log in</a><a class="btn btn-ghost btn-sm" href="#/signup?next=explore">Sign up</a></div>`}
      ${loc ? "" : `<div class="addr-card" style="margin-bottom:20px"><span class="pin">${icon("pin", 20)}</span><span class="grow"><b>Where are you?</b><br><span class="small muted">Pin your address so we can show restaurants near you.</span></span><button class="btn btn-primary btn-sm" data-loc>Set location</button></div>`}
      <div class="searchbar"><label class="search">${icon("search", 18)}<input id="q" type="search" placeholder="Search restaurants or dishes (e.g. sisig, milk tea)" value="${esc(q)}" aria-label="Search"></label></div>
      <div class="chips" id="cats" role="tablist" aria-label="Categories">
        <button class="chip ${cat === "all" ? "is-active" : ""}" data-cat="all" role="tab" aria-selected="${cat === "all"}">${icon("grid", 18)}All</button>
        ${categories().map((c) => `<button class="chip ${c.id === cat ? "is-active" : ""}" data-cat="${c.id}" role="tab" aria-selected="${c.id === cat}">${icon(c.icon, 18)}${esc(c.label)}</button>`).join("")}
      </div>
      <div class="section-head" style="margin-top:20px"><h2 id="count" style="font-size:22px"></h2>
        <div class="chips" style="padding:0" aria-label="Sort">${sorts.map(([k, l]) => `<button class="chip ${k === sort ? "is-active" : ""}" data-sort="${k}" style="min-height:36px;font-size:14px">${l}</button>`).join("")}</div></div>
      <div class="grid" id="results"></div>
    </div>`,
    after(root) {
      $$("[data-loc]", root).forEach((b) => b.onclick = () => openMapPicker());
      const draw = () => {
        const term = q.trim().toLowerCase();
        let list = restaurants().filter((r) => (cat === "all" || r.category === cat) &&
          (!term || r.name.toLowerCase().includes(term) || r.tags.toLowerCase().includes(term) || r.area.toLowerCase().includes(term) ||
            menuItems().some((m) => m.restaurant_id === r.id && m.name.toLowerCase().includes(term))));
        const by = {
          nearest: (a, b) => (distanceKm(loc, a) ?? 99) - (distanceKm(loc, b) ?? 99),
          rating: (a, b) => b.rating - a.rating,
          fastest: (a, b) => parseInt(a.time) - parseInt(b.time),
          fee: (a, b) => a.fee - b.fee,
        };
        if (by[sort]) list = [...list].sort(by[sort]);
        $("#count", root).textContent = list.length ? `${list.length} ${list.length === 1 ? "restaurant" : "restaurants"}${cat === "all" ? "" : " · " + categoryById(cat).label}` : "";
        $("#results", root).innerHTML = list.length ? list.map((r) => restaurantCard(r, u)).join("")
          : `<div class="empty" style="grid-column:1/-1">${icon("search", 36)}<h3>Wala pa, sorry!</h3><p>Try another dish or category.</p></div>`;
        bindFavButtons($("#results", root));
      };
      $("#q", root).addEventListener("input", (e) => { q = e.target.value; draw(); });
      $$("[data-sort]", root).forEach((b) => b.onclick = () => { sort = b.dataset.sort; $$("[data-sort]", root).forEach((x) => x.classList.toggle("is-active", x === b)); draw(); });
      $$("[data-cat]", root).forEach((b) => b.addEventListener("click", () => {
        cat = b.dataset.cat;
        $$("[data-cat]", root).forEach((x) => { x.classList.toggle("is-active", x === b); x.setAttribute("aria-selected", x === b); });
        draw();
      }));
      draw();
    },
  };
}

function pageRestaurant([id]) {
  const r = restaurantById(id);
  if (!r) return pageNotFound();
  const u = currentUser();
  const items = menuItems().filter((m) => m.restaurant_id === r.id);
  const km = distanceKm(getLoc(), r);
  const fav = u && favorites(u).includes(r.id);
  const dish = (m) => `
    <article class="card dish">
      <div>
        ${m.popular === "yes" ? `<span class="badge" style="margin-bottom:6px">Bestseller</span>` : ""}
        <h3>${esc(m.name)}</h3>
        <p class="muted small">${esc(m.description)}</p>
        <div class="price">${peso(m.price)}</div>
      </div>
      <div class="thumb">${dishPic(m)}<button class="add ${u ? "" : "locked"}" data-add="${m.id}" aria-label="Add ${esc(m.name)} to bag">${icon(u ? "plus" : "lock", 18)}</button></div>
    </article>`;
  return {
    html: `<div class="wrap">
      <div class="crumbs"><a href="#/explore">Restaurants</a> / ${esc(categoryById(r.category).label)} / ${esc(r.name)}</div>
      <div class="r-hero">
        <div class="media">${restaurantPic(r)}</div>
        <div>
          ${r.badge ? `<span class="badge">${esc(r.badge)}</span>` : ""}
          <h1 style="font-size:clamp(28px,4vw,42px);margin-top:8px">${esc(r.name)}</h1>
          <p class="muted">${esc(r.tags)} · ${esc(r.price)} · ${esc(r.area)}</p>
          <div class="facts"><span class="rating">${icon("star", 15)} ${r.rating} (${r.reviews})</span><span>${icon("clock", 16)} ${esc(r.time)} min</span>${km != null ? `<span>${icon("pin", 16)} ${km.toFixed(1)} km away</span>` : ""}<span>${icon("bike", 16)} ${peso(r.fee)} delivery</span></div>
        </div>
        <button class="btn btn-ghost" data-fav="${r.id}" aria-pressed="${!!fav}">${icon("heart", 18)} ${fav ? "Saved" : "Save"}</button>
      </div>
      <div class="offer"><span>${icon("gift", 18)} <b>${peso(PROMO.off)} off</b> on orders of ${peso(PROMO.min)} or more</span><b>Code: ${PROMO.code}</b></div>
      <div class="menu-layout">
        <div><h2 style="font-size:24px;margin-bottom:14px">Menu</h2><div class="menu-list">${items.map(dish).join("") || `<div class="empty">${icon("utensils", 32)}<p>No dishes yet. Add some in data/menu.txt.</p></div>`}</div></div>
        <aside class="panel mini-cart" id="mini" aria-live="polite"></aside>
      </div>
    </div>`,
    after(root) {
      const drawMini = () => {
        const box = $("#mini", root);
        if (!u) {
          box.innerHTML = `<div class="locked-box">${icon("lock", 30)}<h3>Ready to order?</h3><p class="muted small">Log in to add food to your bag, check out and track your rider.</p>
            <a class="btn btn-primary" href="#/login?next=${encodeURIComponent("r/" + r.id)}">Log in to order</a><a class="btn btn-ghost" href="#/signup?next=${encodeURIComponent("r/" + r.id)}">Sign up</a></div>`;
          return;
        }
        const c = getCart();
        const lines = c.r === r.id ? Object.entries(c.items) : [];
        box.innerHTML = `<h3>${icon("bag", 18)} Your bag</h3>` + (lines.length
          ? lines.map(([mid, qty]) => { const m = itemById(mid); return `<div class="line"><span><b>${esc(m.name)}</b><br><span class="muted small">${peso(m.price)}</span></span>
              <span class="qty"><button data-dec="${mid}" aria-label="Remove one">${icon("minus", 14)}</button><span>${qty}</span><button data-inc="${mid}" aria-label="Add one">${icon("plus", 14)}</button></span></div>`; }).join("") +
            `<div class="line" style="border:0;font-weight:900"><span>Subtotal</span><span>${peso(cartSubtotal(c))}</span></div><a class="btn btn-primary btn-block" href="#/cart">Checkout ${icon("arrowRight", 16)}</a>`
          : `<p class="muted small">Your bag is empty. Tap + on any dish to add it.</p>`);
        $$("[data-inc]", box).forEach((b) => b.onclick = () => changeQty(b.dataset.inc, 1));
        $$("[data-dec]", box).forEach((b) => b.onclick = () => changeQty(b.dataset.dec, -1));
      };
      const changeQty = (mid, d) => {
        const c = getCart();
        c.items[mid] = (c.items[mid] || 0) + d;
        if (c.items[mid] <= 0) delete c.items[mid];
        if (!Object.keys(c.items).length) c.r = null;
        setCart(c); drawMini(); renderChrome(currentPath(), u);
      };
      const add = (mid) => {
        const c = getCart();
        if (c.r && c.r !== r.id && Object.keys(c.items).length) {
          const close = modal(`<div class="ring">${icon("bag", 28)}</div><h2 style="font-size:24px">Start a new bag?</h2>
            <p class="muted">Your bag has food from ${esc(restaurantById(c.r)?.name)}. You can order from one restaurant at a time.</p>
            <div class="actions"><button class="btn btn-primary" id="newbag">Start new bag</button><button class="btn btn-ghost" data-close>Keep my bag</button></div>`);
          $("#newbag").onclick = () => { setCart({ r: null, items: {} }); close(); add(mid); };
          return;
        }
        c.r = r.id;
        c.items[mid] = (c.items[mid] || 0) + 1;
        setCart(c); drawMini(); renderChrome(currentPath(), u);
        toast(`${itemById(mid).name} added to your bag`, "bag");
      };
      $$("[data-add]", root).forEach((b) => b.addEventListener("click", () => u ? add(b.dataset.add) : askToLogin("Log in to start your order")));
      $$("[data-fav]", root).forEach((b) => b.addEventListener("click", () => {
        if (!u) return askToLogin("Save your favorite spots");
        const on = toggleFavorite(u, r.id);
        b.innerHTML = icon("heart", 18) + (on ? " Saved" : " Save");
        b.setAttribute("aria-pressed", on);
        toast(on ? "Saved to favorites" : "Removed from favorites", "heart");
      }));
      drawMini();
    },
  };
}

function pageAuth(_, query, mode) {
  const next = query.get("next") || "explore";
  const nq = "?next=" + encodeURIComponent(next);
  const login = mode === "login";
  return {
    html: `<div class="wrap auth">
      <div class="auth-story">
        <span class="eyebrow">${login ? "Welcome back" : "Join MoBites"}</span>
        <h1>${login ? "Uy, nandito ka ulit!" : "Tara, kain tayo!"}</h1>
        <p class="muted" style="margin-top:10px;font-size:18px">${login ? "Your favorites are right where you left them." : "Sign up in less than a minute. Free forever."}</p>
        <ul>
          <li>${icon("bag", 18)} Order from local favorites near you</li>
          <li>${icon("bike", 18)} Track your rider, step by step</li>
          <li>${icon("heart", 18)} Save favorites and reorder in one tap</li>
          <li>${icon("gift", 18)} Earn 1 point for every ${peso(PESOS_PER_POINT)} you spend</li>
        </ul>
      </div>
      <div class="panel" style="padding:28px">
        <div class="seg" role="tablist" style="margin-bottom:22px">
          <button class="${login ? "is-active" : ""}" data-go="#/login${nq}" role="tab" aria-selected="${login}">Log in</button>
          <button class="${login ? "" : "is-active"}" data-go="#/signup${nq}" role="tab" aria-selected="${!login}">Sign up</button>
        </div>
        ${login ? `
        <form class="form" id="form" novalidate>
          <div class="form-alert" id="alert">${icon("alert", 18)}<span></span></div>
          ${field({ id: "email", label: "Email address", type: "email", ph: "juan@email.com", rules: "required email", attrs: 'autocomplete="email"' })}
          ${field({ id: "password", label: "Password", type: "password", ph: "Your password", rules: "required", password: true, attrs: 'autocomplete="current-password"' })}
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
            <label class="check"><input type="checkbox" name="remember" checked> Keep me logged in</label>
            <a href="#/login${nq}" class="small" id="forgot">Forgot password?</a>
          </div>
          <button class="btn btn-primary btn-block">Log in ${icon("arrowRight", 16)}</button>
          <p class="small muted" style="text-align:center">New here? <a href="#/signup${nq}">Create an account</a></p>
        </form>` : `
        <form class="form" id="form" novalidate>
          <div class="form-alert" id="alert">${icon("alert", 18)}<span></span></div>
          ${field({ id: "name", label: "Full name", ph: "Juan Dela Cruz", rules: "required name", attrs: 'autocomplete="name"' })}
          ${field({ id: "email", label: "Email address", type: "email", ph: "juan@email.com", rules: "required email", attrs: 'autocomplete="email"' })}
          ${phoneField("phone", "Mobile number")}
          ${field({ id: "password", label: "Password", type: "password", ph: "Create a password", rules: "required password", password: true, hint: "At least 8 characters, with a number and a symbol.", attrs: 'autocomplete="new-password"' })}
          <div class="strength" aria-hidden="true"><i id="meter"></i></div>
          ${field({ id: "confirm", label: "Confirm password", type: "password", ph: "Type it again", rules: "required", password: true, attrs: 'autocomplete="new-password"' })}
          <div class="check field"><input type="checkbox" id="terms" name="terms" data-rules="checked"><label for="terms" style="font-weight:600">I agree to the <a href="#/terms" target="_blank">Terms of Service</a> and <a href="#/privacy" target="_blank">Privacy Policy</a>.</label><span class="err" style="flex-basis:100%"></span></div>
          <button class="btn btn-primary btn-block">Create account ${icon("arrowRight", 16)}</button>
          <p class="small muted" style="text-align:center">Welcome gift: use <b>${PROMO.code}</b> for ${peso(PROMO.off)} off your first ${peso(PROMO.min)} order.</p>
        </form>`}
      </div>
    </div>`,
    after(root) {
      $$("[data-go]", root).forEach((b) => b.onclick = () => (location.hash = b.dataset.go));
      bindPasswordToggles(root);
      const form = $("#form", root);
      const alertBox = $("#alert", root);
      const showAlert = (msg) => { alertBox.querySelector("span").textContent = msg; alertBox.classList.add("show"); };
      const finish = (name) => { toast(`${login ? "Welcome back" : "Welcome"}, ${firstName(name)}! You're now in Member view.`); location.hash = "#/" + next; };
      if (login) {
        $("#forgot", root).onclick = (e) => { e.preventDefault(); toast("If that email has an account, we sent a reset link.", "checkCircle"); };
        liveValidate(form);
        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          alertBox.classList.remove("show");
          if (!validateForm(form)) return;
          const u = rows("users").find((x) => x.email.toLowerCase() === form.email.value.trim().toLowerCase());
          if (!u) return showAlert("We couldn't find an account with that email. Check it, or sign up.");
          if (u.password_sha256 !== await sha256(form.password.value)) { showAlert("Wrong password. Try again."); form.password.focus(); return; }
          setSession(u.email, form.remember.checked);
          finish(u.name);
        });
      } else {
        maskPhone(form.phone);
        const extra = {
          email: (el) => !rows("users").some((x) => x.email.toLowerCase() === el.value.trim().toLowerCase()) || "This email already has an account. Log in instead.",
          confirm: (el) => el.value === form.password.value || "Passwords don't match.",
        };
        liveValidate(form, extra);
        form.password.addEventListener("input", () => {
          const v = form.password.value;
          const score = [v.length >= 8, /\d/.test(v), /[^A-Za-z0-9]/.test(v), /[A-Z]/.test(v), v.length >= 12].filter(Boolean).length;
          const m = $("#meter", root);
          m.style.width = score * 20 + "%";
          m.style.background = score <= 2 ? "var(--st-cancelled)" : score === 3 ? "#d99a00" : "var(--primary)";
        });
        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          if (!validateForm(form, extra)) return;
          const row = { name: form.name.value.trim(), email: form.email.value.trim().toLowerCase(), password_sha256: await sha256(form.password.value),
            phone: normalizePhone(form.phone.value), address: getLoc()?.label || "", points: 0, since: String(new Date().getFullYear()) };
          try { await appendRow("users", row); } catch { return showAlert("We couldn't save your account. Is server.py still running?"); }
          setSession(row.email);
          finish(row.name);
        });
      }
    },
  };
}

function pageCheckout() {
  const u = currentUser();
  const c = getCart();
  const r = c.r && restaurantById(c.r);
  if (!r || !Object.keys(c.items).length) {
    return { html: `<div class="wrap"><div class="empty" style="padding:80px 16px">${icon("bag", 44)}<h2>Your bag is empty</h2><p style="margin:8px 0 20px">Find something masarap and it'll show up here.</p><a class="btn btn-primary" href="#/explore">Browse restaurants</a></div></div>` };
  }
  let tip = 20, promo = null;
  const phone = u.phone ? String(u.phone).replace(/^(\d{4})(\d{3})(\d{4})$/, "$1 $2 $3") : "";
  return {
    html: `<div class="wrap">
      <div class="page-head" style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:end">
        <div><span class="eyebrow">Checkout</span><h1 style="margin-top:6px">Almost there!</h1></div>
        <a class="link-arrow" href="#/r/${r.id}">${icon("chevronLeft", 16)} Add more food</a>
      </div>
      <div class="stepper"><span class="is-done">${icon("check", 14)} 1. Bag</span><span class="is-done">${icon("pin", 14)} 2. Address & payment</span><span>${icon("bike", 14)} 3. Track</span></div>
      <form class="checkout" id="form" novalidate>
        <div style="display:grid;gap:20px">
          <section class="panel"><h3>${icon("pin", 20)} Deliver to</h3>
            <div id="addrBox"></div>
            <div class="form" style="margin-top:16px">
              ${phoneField("phone", "Mobile number for the rider", phone)}
              <div class="field"><label for="notes">Note for the rider <span class="muted">(optional)</span></label><textarea id="notes" name="notes" placeholder="e.g. Pakiiwan po sa guard" maxlength="140"></textarea></div>
            </div>
          </section>
          <section class="panel"><h3>${icon("wallet", 20)} How will you pay?</h3>
            <div class="radio-cards" style="margin-bottom:16px">
              <label><input type="radio" name="pay" value="cod" checked> ${icon("cash", 18)} Cash on delivery</label>
              <label><input type="radio" name="pay" value="gcash"> ${icon("wallet", 18)} GCash</label>
              <label><input type="radio" name="pay" value="card"> ${icon("card", 18)} Card</label>
            </div>
            <div class="form" id="gcashFields" hidden>${phoneField("gcash", "GCash number")}</div>
            <div class="form" id="cardFields" hidden>
              ${field({ id: "cardName", label: "Name on card", value: u.name, rules: "required name", attrs: 'autocomplete="cc-name"' })}
              ${field({ id: "cardNum", label: "Card number", ph: "4242 4242 4242 4242", rules: "required card", hint: "Demo only. Use the test number 4242 4242 4242 4242.", attrs: 'inputmode="numeric" autocomplete="cc-number" maxlength="19"' })}
              <div class="row-2">
                ${field({ id: "exp", label: "Expiry", ph: "MM/YY", rules: "required expiry", attrs: 'inputmode="numeric" autocomplete="cc-exp" maxlength="5"' })}
                ${field({ id: "cvc", label: "CVC", ph: "123", rules: "required cvc", attrs: 'inputmode="numeric" autocomplete="cc-csc" maxlength="4"' })}
              </div>
            </div>
            <p class="small muted" id="codNote">Please prepare the exact amount for the rider.</p>
          </section>
          <section class="panel"><h3>${icon("heart", 20)} Tip your rider</h3>
            <div class="chips" id="tips">${[0, 20, 30, 50].map((t) => `<button type="button" class="chip ${t === tip ? "is-active" : ""}" data-tip="${t}">${t ? peso(t) : "No tip"}</button>`).join("")}</div>
            <p class="small muted" style="margin-top:8px">100% of your tip goes to your rider. Salamat po!</p>
          </section>
        </div>
        <aside class="panel summary" style="position:sticky;top:96px">
          <h3>Order from ${esc(r.name)}</h3>
          <div id="bag"></div>
          <div class="field" style="margin:16px 0 8px"><label for="promo">Promo code</label>
            <div style="display:flex;gap:8px"><input id="promo" name="promo" placeholder="${PROMO.code}" style="text-transform:uppercase"><button type="button" class="btn btn-ghost btn-sm" id="applyPromo">Apply</button></div>
            <span class="err" id="promo-err"></span><span class="hint" id="promo-ok" style="color:var(--st-delivered);font-weight:800"></span></div>
          <div id="totals"></div>
          <button class="btn btn-primary btn-block" style="margin-top:16px" id="placeBtn">Place order</button>
          <p class="small muted" style="margin-top:10px">By placing your order you agree to our <a href="#/terms" target="_blank">Terms</a>.</p>
        </aside>
      </form>
    </div>`,
    after(root) {
      const form = $("#form", root);
      const drawAddr = () => {
        const loc = getLoc();
        $("#addrBox", root).innerHTML = loc
          ? `<div class="addr-card"><span class="pin">${icon("pin", 20)}</span><span class="grow"><b>${esc(loc.label)}</b>${loc.detail ? `<br><span class="small muted">${esc(loc.detail)}</span>` : ""}</span><button type="button" class="btn btn-ghost btn-sm" data-pick>Change</button></div>`
          : `<div class="addr-card" style="border-color:var(--st-cancelled)"><span class="pin">${icon("pin", 20)}</span><span class="grow"><b>Pin your delivery address</b><br><span class="small muted">We need to know where to bring your food.</span></span><button type="button" class="btn btn-primary btn-sm" data-pick>Set location</button></div>`;
        $("[data-pick]", root).onclick = () => openMapPicker({ onDone: () => { drawAddr(); renderChrome(currentPath(), u); } });
      };
      const totals = () => {
        const sub = cartSubtotal();
        const disc = promo ? PROMO.off : 0;
        return { sub, disc, total: Math.max(0, sub + r.fee + SERVICE_FEE + tip - disc) };
      };
      const drawSummary = () => {
        const cart = getCart();
        $("#bag", root).innerHTML = Object.entries(cart.items).map(([mid, q]) => { const m = itemById(mid); return `
          <div class="bag-item"><div class="thumb">${dishPic(m)}</div><div><b style="font-size:15px">${esc(m.name)}</b><br><span class="qty" style="margin-top:4px"><button type="button" data-dec="${mid}" aria-label="Remove one">${icon("minus", 14)}</button><span>${q}</span><button type="button" data-inc="${mid}" aria-label="Add one">${icon("plus", 14)}</button></span></div><b>${peso(m.price * q)}</b></div>`; }).join("");
        const t = totals();
        $("#totals", root).innerHTML = `
          <div class="line"><span>Subtotal</span><span>${peso(t.sub)}</span></div>
          <div class="line"><span>Delivery fee</span><span>${peso(r.fee)}</span></div>
          <div class="line"><span>Service fee</span><span>${peso(SERVICE_FEE)}</span></div>
          <div class="line"><span>Rider tip</span><span>${peso(tip)}</span></div>
          ${t.disc ? `<div class="line" style="color:var(--st-delivered);font-weight:800"><span>${PROMO.code}</span><span>−${peso(t.disc)}</span></div>` : ""}
          <div class="line total"><span>Total</span><span>${peso(t.total)}</span></div>`;
        $("#placeBtn", root).textContent = `Place order · ${peso(t.total)}`;
        $$("[data-inc]", root).forEach((b) => b.onclick = () => qty(b.dataset.inc, 1));
        $$("[data-dec]", root).forEach((b) => b.onclick = () => qty(b.dataset.dec, -1));
      };
      const qty = async (mid, d) => {
        const cart = getCart();
        const emptying = d < 0 && cart.items[mid] === 1 && Object.keys(cart.items).length === 1;
        if (emptying && !await confirmBox({ ic: "bag", title: "Empty your bag?", text: `Removing ${esc(itemById(mid).name)} will leave your bag empty.`, yes: "Remove item", danger: true })) return;
        cart.items[mid] = (cart.items[mid] || 0) + d;
        if (cart.items[mid] <= 0) delete cart.items[mid];
        if (!Object.keys(cart.items).length) { setCart({ r: null, items: {} }); render(); return; }
        setCart(cart);
        if (promo && cartSubtotal() < PROMO.min) { promo = null; $("#promo-ok", root).textContent = ""; toast(`${PROMO.code} removed: subtotal is under ${peso(PROMO.min)}`, "alert"); }
        drawSummary(); renderChrome(currentPath(), u);
      };
      $$("[data-tip]", root).forEach((b) => b.onclick = () => { tip = +b.dataset.tip; $$("[data-tip]", root).forEach((x) => x.classList.toggle("is-active", x === b)); drawSummary(); });
      const syncPay = () => {
        $("#cardFields", root).hidden = form.pay.value !== "card";
        $("#gcashFields", root).hidden = form.pay.value !== "gcash";
        $("#codNote", root).hidden = form.pay.value !== "cod";
      };
      $$("input[name=pay]", form).forEach((x) => x.onchange = syncPay);
      maskPhone(form.phone); maskPhone(form.gcash);
      form.cardNum.addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 "); });
      form.exp.addEventListener("input", (e) => { const d = e.target.value.replace(/\D/g, "").slice(0, 4); e.target.value = d.length > 2 ? d.slice(0, 2) + "/" + d.slice(2) : d; });
      $("#applyPromo", root).onclick = () => {
        const f = $("#promo", root).closest(".field");
        const code = $("#promo", root).value.trim().toUpperCase();
        let msg = true;
        if (!code) msg = "Enter a promo code.";
        else if (code !== PROMO.code) msg = "That code isn't valid.";
        else if (cartSubtotal() < PROMO.min) msg = `${PROMO.code} works on orders of ${peso(PROMO.min)} or more.`;
        f.classList.toggle("has-error", msg !== true);
        $("#promo-err", root).innerHTML = msg === true ? "" : icon("alert", 14) + esc(msg);
        promo = msg === true ? code : null;
        $("#promo-ok", root).textContent = promo ? `Applied! ${peso(PROMO.off)} off` : "";
        drawSummary();
      };
      liveValidate(form);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const loc = getLoc();
        if (!loc) { toast("Pin your delivery address first", "pin"); $("[data-pick]", root).focus(); return; }
        if (!validateForm(form)) { toast("Check the highlighted fields", "alert"); return; }
        const t = totals();
        const payLabel = { cod: "Cash on delivery", gcash: "GCash", card: "Card" }[form.pay.value];
        if (!await confirmBox({ ic: "bag", title: "Place your order?", yes: `Yes, place order · ${peso(t.total)}`, no: "Not yet",
          text: `<b>${esc(r.name)}</b> · ${cartCount()} item${cartCount() > 1 ? "s" : ""}<br>${payLabel} · ${peso(t.total)}<br>Deliver to ${esc(loc.label)}` })) return;
        const cart = getCart();
        const order = {
          id: "MB-" + String(Date.now()).slice(-6), email: u.email, restaurant_id: r.id,
          items: Object.entries(cart.items).map(([mid, q]) => `${mid}x${q}`).join(";"), total: t.total, date: ymd(new Date()),
          placed_at: Date.now(), status: "pending", address: [loc.detail, loc.label].filter(Boolean).join(", "), payment: form.pay.value,
        };
        $("#placeBtn", root).disabled = true;
        try { await appendRow("orders", order); }
        catch { $("#placeBtn", root).disabled = false; toast("Couldn't save your order. Is server.py still running?", "alert"); return; }
        const pts = Math.floor(t.total / PESOS_PER_POINT);
        store.set("earned_" + u.email, store.get("earned_" + u.email, 0) + pts);
        store.set("profile_" + u.email, { ...store.get("profile_" + u.email, {}), phone: normalizePhone(form.phone.value) });
        setCart({ r: null, items: {} });
        toast(`Order placed! +${pts} points`, "checkCircle");
        location.hash = "#/orders/" + order.id;
      });
      syncPay(); drawAddr(); drawSummary();
    },
  };
}

function trackingBits(o) {
  const st = orderStatus(o);
  const idx = st === "cancelled" ? -1 : STAGES.indexOf(st);
  const pct = st === "cancelled" ? 0 : [12, 40, 75, 100][idx];
  const steps = [["Order received", "The restaurant got your order."], ["Preparing", "Niluluto na! Your food is being made."], ["On the way", "Your rider is heading to you."], ["Delivered", "Enjoy your meal. Kain na!"]];
  const timeline = `<ol class="timeline">${steps.map(([t, d], i) => {
    const done = i < idx || st === "delivered";
    return `<li class="${done ? "done" : i === idx ? "current" : ""}"><span class="dot">${done ? icon("check", 14) : i === idx ? icon("clock", 14) : ""}</span>
      <div><b>${t}</b><small>${d}${o.placed_at && i <= idx ? " · " + fmtTime(o.placed_at + [0, 20, 50, 100][i] * 1000) : ""}</small></div></li>`;
  }).join("")}</ol>`;
  return { st, idx, pct, timeline };
}

function pageOrderDetail([id]) {
  const u = currentUser();
  const o = userOrders(u).find((x) => x.id === id);
  if (!o) return pageNotFound();
  const r = restaurantById(o.restaurant_id) || { name: "Restaurant", id: "" };
  return {
    html: `<div class="wrap">
      <div class="crumbs"><a href="#/orders">Orders</a> / ${esc(o.id)}</div>
      <div class="page-head"><span class="eyebrow">Order ${esc(o.id)}</span><h1 style="margin-top:6px" id="headline"></h1></div>
      <div class="track">
        <div style="display:grid;gap:20px">
          <section class="track-hero" id="hero"></section>
          <section class="panel"><h3>${esc(r.name)}</h3>
            ${parseItems(o.items).map(([mid, q]) => { const m = itemById(mid); return m ? `<div class="bag-item"><div class="thumb">${dishPic(m)}</div><div><b>${esc(m.name)}</b><br><span class="muted small">Qty ${q}</span></div><b>${peso(m.price * q)}</b></div>` : ""; }).join("")}
            <div class="summary"><div class="line total"><span>Total (${{ cod: "Cash on delivery", gcash: "GCash", card: "Card" }[o.payment] || esc(o.payment)})</span><span>${peso(o.total)}</span></div></div>
          </section>
        </div>
        <section class="panel"><h3>Live status</h3><div id="timeline"></div><div id="actions" style="display:grid;gap:10px;margin-top:8px"></div></section>
      </div>
    </div>`,
    after(root) {
      const draw = () => {
        const fresh = userOrders(u).find((x) => x.id === id);
        const t = trackingBits(fresh);
        if (t.st !== fresh.status) updateRow("orders", id, { status: t.st }).catch(() => {}); // keep orders.txt in sync
        $("#headline", root).textContent = { pending: "Got your order!", preparing: "Niluluto na!", "on-the-way": "Malapit na! Your rider is on the way.", delivered: "Delivered. Kain na!", cancelled: "This order was cancelled." }[t.st];
        $("#hero", root).innerHTML = `
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><span class="eyebrow">${t.st === "delivered" ? "Delivered" : t.st === "cancelled" ? "Cancelled" : "Arriving"}</span>${statusPill(t.st)}</div>
          <div class="eta">${t.st === "cancelled" ? "No charge" : fresh.placed_at ? (t.st === "delivered" ? fmtTime(fresh.placed_at + 100000) : fmtTime(fresh.placed_at + 25 * 60000) + " – " + fmtTime(fresh.placed_at + 35 * 60000)) : fmtDate(fresh.date)}</div>
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${t.pct}" aria-label="Delivery progress"><i style="width:${t.pct}%"></i></div>
          <span class="small" style="color:#e3d4ee">${t.st === "cancelled" ? "You haven't been charged." : `${t.pct}% of the way · ${esc(fresh.address)}`}</span>`;
        $("#timeline", root).innerHTML = t.timeline;
        $("#actions", root).innerHTML = (t.st === "pending" ? `<button class="btn btn-danger" id="cancel">${icon("x", 16)} Cancel order</button><span class="small muted">You can cancel while the order is Pending.</span>` : "") +
          (t.st === "delivered" || t.st === "cancelled" ? `<button class="btn btn-primary" id="reorder">${icon("repeat", 16)} Order again</button>` : "");
        const cb = $("#cancel", root);
        if (cb) cb.onclick = () => {
          const close = modal(`<div class="ring">${icon("alert", 28)}</div><h2 style="font-size:24px">Cancel this order?</h2><p class="muted">${esc(r.name)} hasn't started cooking yet, so you won't be charged.</p>
            <div class="actions"><button class="btn btn-danger" id="yes">Yes, cancel it</button><button class="btn btn-ghost" data-close>Keep my order</button></div>`);
          $("#yes").onclick = async () => { await updateRow("orders", id, { status: "cancelled" }); close(); toast("Order cancelled", "x"); draw(); };
        };
        const rb = $("#reorder", root);
        if (rb) rb.onclick = () => reorder(fresh);
        return t.st;
      };
      const st = draw();
      if (st !== "delivered" && st !== "cancelled") {
        timers.push(setInterval(() => { const s = draw(); if (s === "delivered") toast("Delivered! Kain na!", "checkCircle"); }, 2000));
      }
    },
  };
}

function reorder(o) {
  setCart({ r: o.restaurant_id, items: Object.fromEntries(parseItems(o.items).filter(([m]) => itemById(m))) });
  toast(`Added your ${restaurantById(o.restaurant_id)?.name} order to the bag`, "bag");
  location.hash = "#/cart";
}

function spendingChart(orders) {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ key: ymd(d).slice(0, 7), label: d.toLocaleDateString("en-PH", { month: "short" }), v: 0 }); }
  orders.filter((o) => orderStatus(o) !== "cancelled").forEach((o) => { const m = months.find((x) => x.key === String(o.date).slice(0, 7)); if (m) m.v += Number(o.total); });
  const max = Math.max(...months.map((m) => m.v), 1);
  const W = 520, H = 200, bw = 48, gap = (W - bw * 6) / 7;
  const bars = months.map((m, i) => {
    const h = Math.round((m.v / max) * 130);
    const x = gap + i * (bw + gap);
    return `<rect class="bar ${m.v === max ? "is-max" : ""}" x="${x}" y="${160 - h}" width="${bw}" height="${h}" rx="8"><title>${m.label}: ${peso(m.v)}</title></rect>
      <text class="val" x="${x + bw / 2}" y="${152 - h}" text-anchor="middle">${m.v ? peso(Math.round(m.v)) : ""}</text>
      <text x="${x + bw / 2}" y="182" text-anchor="middle">${m.label}</text>`;
  }).join("");
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly spending, last 6 months"><line x1="0" x2="${W}" y1="160" y2="160" stroke="var(--line)" stroke-width="2"/>${bars}</svg></div>`;
}

function pageOrders(_, query) {
  const u = currentUser();
  const orders = userOrders(u);
  let filter = query.get("f") || "all";
  const active = orders.filter((o) => ["pending", "preparing", "on-the-way"].includes(orderStatus(o)));
  const done = orders.filter((o) => orderStatus(o) !== "cancelled");
  const spent = done.reduce((s, o) => s + Number(o.total), 0);
  const counts = {};
  done.forEach((o) => (counts[o.restaurant_id] = (counts[o.restaurant_id] || 0) + 1));
  const topR = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return {
    html: `<div class="wrap">
      <div class="page-head"><span class="eyebrow">My orders</span><h1 style="margin-top:6px">Lahat ng kinain mo, nandito.</h1></div>
      ${active.map((o) => { const t = trackingBits(o); return `
        <a class="track-hero" href="#/orders/${o.id}" style="margin-bottom:20px">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><span class="eyebrow">Live order · ${esc(restaurantById(o.restaurant_id)?.name)}</span>${statusPill(t.st)}</div>
          <div class="progress"><i style="width:${t.pct}%"></i></div><span class="small" style="color:#e3d4ee">Tap to track your rider ${icon("arrowRight", 14)}</span></a>`; }).join("")}
      <div class="stats" style="margin-bottom:20px">
        <div class="card stat"><span class="muted small">Orders</span><b>${orders.length}</b></div>
        <div class="card stat"><span class="muted small">Total spent</span><b>${peso(spent)}</b></div>
        <div class="card stat"><span class="muted small">Average order</span><b>${peso(done.length ? Math.round(spent / done.length) : 0)}</b></div>
        <div class="card stat"><span class="muted small">Your suki</span><b style="font-size:18px">${topR ? esc(restaurantById(topR[0])?.name) : "None yet"}</b></div>
      </div>
      <div class="two-col" style="margin-bottom:24px">
        <section class="panel"><h3>Monthly spending</h3><p class="muted small">Last 6 months, not counting cancelled orders.</p>${spendingChart(orders)}</section>
        <section class="panel"><h3>What the colors mean</h3>
          <div style="display:grid;gap:12px;margin-top:6px">${Object.keys(STATUSES).map((k) => `<div style="display:flex;justify-content:space-between;gap:12px;align-items:center">${statusPill(k)}<span class="small muted" style="text-align:right">${{ pending: "Waiting for the restaurant", preparing: "Being cooked", "on-the-way": "With your rider", delivered: "At your door", cancelled: "Stopped, no charge" }[k]}</span></div>`).join("")}</div></section>
      </div>
      <section class="panel">
        <div class="section-head" style="margin-bottom:10px"><h3 style="margin:0">Order history</h3></div>
        <div class="filters">${[["all", "All"], ["active", "Active"], ["delivered", "Delivered"], ["cancelled", "Cancelled"]].map(([k, l]) => `<button class="chip ${k === filter ? "is-active" : ""}" data-f="${k}">${l}</button>`).join("")}</div>
        <table class="table"><thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Total</th><th></th></tr></thead><tbody id="rows"></tbody></table>
        <div class="db-note" style="margin-top:16px">${icon("file", 18)}<span style="flex:1">${DB.server ? "Your orders are saved in <b>data/orders.txt</b>. Open it in Notepad to see them." : "Your new orders are saved in this browser. Download them as a Notepad file:"}</span><button class="btn btn-ghost btn-sm" id="export">${icon("download", 16)} orders.txt</button></div>
      </section>
    </div>`,
    after(root) {
      const draw = () => {
        const list = orders.filter((o) => { const s = orderStatus(o); return filter === "all" || (filter === "active" ? ["pending", "preparing", "on-the-way"].includes(s) : s === filter); });
        $("#rows", root).innerHTML = list.length ? list.map((o) => {
          const r = restaurantById(o.restaurant_id) || { name: "Removed restaurant", category: "", id: "" };
          const s = orderStatus(o);
          return `<tr>
          <td><div class="order-cell"><div class="thumb">${r.id ? restaurantPic(r) : ph("utensils", 2)}</div><div><a href="#/orders/${o.id}">${esc(r.name)}</a><br><span class="muted small">${parseItems(o.items).map(([m, q]) => `${q}× ${esc(itemById(m)?.name || "Item " + m)}`).join(", ")}</span></div></div></td>
          <td class="hide-mobile">${fmtDate(o.date)}</td><td>${statusPill(s)}</td><td><b>${peso(o.total)}</b></td>
          <td style="text-align:right">${["delivered", "cancelled"].includes(s) ? `<button class="btn btn-ghost btn-sm" data-re="${o.id}">${icon("repeat", 14)} Again</button>` : `<a class="btn btn-primary btn-sm" href="#/orders/${o.id}">Track</a>`}</td></tr>`;
        }).join("")
          : `<tr><td colspan="5"><div class="empty">${icon("receipt", 34)}<p>No ${filter === "all" ? "" : filter + " "}orders yet.</p><a class="btn btn-primary btn-sm" href="#/explore" style="margin-top:12px">Find something to eat</a></div></td></tr>`;
        $$("[data-re]", root).forEach((b) => b.onclick = () => reorder(orders.find((o) => o.id === b.dataset.re)));
      };
      $$("[data-f]", root).forEach((b) => b.onclick = () => { filter = b.dataset.f; $$("[data-f]", root).forEach((x) => x.classList.toggle("is-active", x === b)); draw(); });
      $("#export", root).onclick = () => exportTable("orders", (o) => o.email.toLowerCase() === u.email.toLowerCase());
      draw();
    },
  };
}

function pageFavorites() {
  const u = currentUser();
  const favs = favorites(u).map(restaurantById).filter(Boolean);
  const dishes = menuItems().filter((m) => favs.some((r) => r.id === m.restaurant_id) && m.popular === "yes");
  const last = userOrders(u).find((o) => orderStatus(o) === "delivered");
  const lr = last && restaurantById(last.restaurant_id);
  return {
    html: `<div class="wrap">
      <div class="page-head"><span class="eyebrow">Saved</span><h1 style="margin-top:6px">Your favorites, isang tap lang.</h1></div>
      ${lr ? `<div class="banner usual"><div class="thumb">${restaurantPic(lr)}</div><div><span class="eyebrow">Your usual</span><h3 style="margin-top:4px">${esc(lr.name)}</h3><p class="small">${parseItems(last.items).map(([m, q]) => `${q}× ${esc(itemById(m)?.name || "")}`).join(", ")}</p></div><button class="btn btn-primary" id="usual">${icon("repeat", 16)} Order again · ${peso(last.total)}</button></div>` : ""}
      <div class="section-head"><h2 style="font-size:24px">Saved restaurants</h2><a class="link-arrow" href="#/explore">Find more ${icon("arrowRight", 16)}</a></div>
      <div class="grid">${favs.length ? favs.map((r) => restaurantCard(r, u)).join("") : `<div class="empty" style="grid-column:1/-1">${icon("heart", 34)}<h3>Nothing saved yet</h3><p>Tap the heart on any restaurant to keep it here.</p></div>`}</div>
      ${dishes.length ? `<div class="section-head" style="margin-top:36px"><h2 style="font-size:24px">Bestsellers from your favorites</h2></div>
      <div class="grid">${dishes.map((m) => `<a class="card r-card" href="#/r/${m.restaurant_id}"><div class="media">${dishPic(m)}</div><div class="body"><h3>${esc(m.name)}</h3><p class="muted small">${esc(restaurantById(m.restaurant_id).name)}</p><div class="meta"><b style="color:var(--primary)">${peso(m.price)}</b><span class="cta" style="opacity:1;transform:none">View menu ${icon("chevronRight", 14)}</span></div></div></a>`).join("")}</div>` : ""}
    </div>`,
    after(root) {
      bindFavButtons(root);
      const b = $("#usual", root);
      if (b) b.onclick = () => reorder(last);
    },
  };
}

function pageRewards() {
  const u = currentUser();
  const pts = userPoints(u);
  const into = pts % REWARD_STEP;
  const pct = Math.round((into / REWARD_STEP) * 100);
  const ready = Math.floor(pts / REWARD_STEP);
  const delivered = userOrders(u).filter((o) => orderStatus(o) === "delivered").length;
  const R = 44, C = 2 * Math.PI * R;
  const tried = new Set(userOrders(u).map((o) => o.restaurant_id)).size;
  const badges = [["rice", "Silog Lover", "Order 5 rice meals", 60], ["compass", "Food Explorer", "Try 8 different restaurants", Math.min(100, Math.round((tried / 8) * 100))], ["coffee", "Merienda Master", "3 orders between 3 and 5pm", 33]];
  return {
    html: `<div class="wrap">
      <div class="page-head"><span class="eyebrow">MoBites Rewards</span><h1 style="margin-top:6px">Every bite earns points.</h1></div>
      <div class="two-col">
        <section class="points-card">
          <span class="eyebrow" style="color:#fff">Your points</span>
          <div class="big">${pts.toLocaleString()}</div>
          <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Progress to next reward"><i style="width:${pct}%"></i></div>
          <span class="muted small">${(REWARD_STEP - into).toLocaleString()} more points to your next ${peso(100)} reward (${pct}%)</span>
          <div><button class="btn btn-accent btn-sm" id="redeem" ${ready ? "" : "disabled"}>${ready ? `Redeem ${peso(ready * 100)} off` : "Keep ordering to unlock"}</button></div>
        </section>
        <section class="panel"><h3>Your level</h3>
          <div class="ring-wrap">
            <svg width="112" height="112" viewBox="0 0 110 110" role="img" aria-label="${delivered} of 15 orders to Gold level">
              <circle cx="55" cy="55" r="${R}" fill="none" stroke="var(--cream)" stroke-width="12"/>
              <circle cx="55" cy="55" r="${R}" fill="none" stroke="var(--primary)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - Math.min(delivered, 15) / 15)}" transform="rotate(-90 55 55)"/>
              <text x="55" y="61" text-anchor="middle" font-size="20" font-weight="900" fill="var(--primary)" font-family="Nunito, sans-serif">${Math.min(delivered, 15)}/15</text>
            </svg>
            <div><b>${delivered >= 15 ? "Gold Suki" : "Silver Suki"}</b><p class="muted small">${delivered >= 15 ? "Free delivery on every order!" : `${15 - delivered} more delivered orders to reach Gold Suki and get free delivery.`}</p></div>
          </div>
        </section>
      </div>
      <div class="section-head" style="margin-top:32px"><h2 style="font-size:24px">Badges</h2></div>
      <div class="offers">${badges.map(([ic, t, d, p]) => `<div class="card offer-card">${icon(ic, 26)}<b>${t}</b><span class="muted small">${d}</span><div class="progress light"><i style="width:${p}%"></i></div><span class="small muted">${p}%</span></div>`).join("")}</div>
      <div class="section-head" style="margin-top:32px"><h2 style="font-size:24px">Member deals</h2></div>
      <div class="offers">
        <div class="card offer-card">${icon("gift", 26)}<b>Double points Fridays</b><span class="muted small">Earn 2× points on every Friday order.</span></div>
        <div class="card offer-card">${icon("bike", 26)}<b>Libreng delivery</b><span class="muted small">Free delivery on orders of ${peso(500)} or more, weekdays 2 to 5pm.</span></div>
        <div class="card offer-card">${icon("coffee", 26)}<b>Merienda deals</b><span class="muted small">Milk tea and desserts under ${peso(150)}.</span><a class="link-arrow" href="#/explore?cat=milk-tea">Browse ${icon("arrowRight", 14)}</a></div>
      </div>
    </div>`,
    after(root) {
      $("#redeem", root).onclick = async () => {
        if (await confirmBox({ ic: "gift", title: `Redeem ${peso(ready * 100)} off?`, text: `This uses ${(ready * REWARD_STEP).toLocaleString()} of your points.`, yes: "Redeem" }))
          toast(`${peso(ready * 100)} reward added. It'll apply at checkout.`, "gift");
      };
    },
  };
}

function pageProfile() {
  const u = currentUser();
  const loc = getLoc();
  const saved = store.get("notif_" + u.email, {});
  return {
    html: `<div class="wrap">
      <div class="page-head"><span class="eyebrow">My account</span><h1 style="margin-top:6px">Hi, ${esc(firstName(u.name))}!</h1></div>
      <div class="profile">
        <aside class="panel profile-side">
          <span class="avatar lg">${initials(u.name)}</span>
          <div><h3 style="margin:0">${esc(u.name)}</h3><p class="muted small">Member since ${esc(u.since)}</p></div>
          <span class="badge">${userPoints(u).toLocaleString()} points</span>
          <a class="link-arrow" href="#/rewards">Rewards ${icon("arrowRight", 14)}</a>
          <a class="link-arrow" href="#/orders">Order history ${icon("arrowRight", 14)}</a>
          <a class="link-arrow" href="#/privacy">Privacy Policy ${icon("arrowRight", 14)}</a>
          <a class="link-arrow" href="#/terms">Terms of Service ${icon("arrowRight", 14)}</a>
          <button class="btn btn-danger btn-block" id="logout" style="margin-top:8px">${icon("logout", 16)} Log out</button>
        </aside>
        <div style="display:grid;gap:20px">
          <section class="panel"><h3>Personal info</h3>
            <form class="form" id="form" novalidate>
              <div class="row-2">
                ${field({ id: "name", label: "Full name", value: u.name, rules: "required name" })}
                ${field({ id: "email", label: "Email address", type: "email", value: u.email, attrs: "disabled", hint: "Your email is your login and can't be changed." })}
              </div>
              ${phoneField("phone", "Mobile number", String(u.phone || "").replace(/^(\d{4})(\d{3})(\d{4})$/, "$1 $2 $3"))}
              <div><button class="btn btn-primary">Save changes</button></div>
            </form>
          </section>
          <section class="panel"><h3>Delivery address</h3>
            <div class="addr-card"><span class="pin">${icon("pin", 20)}</span><span class="grow"><b>${esc(loc?.label || "No location pinned yet")}</b>${loc?.detail ? `<br><span class="small muted">${esc(loc.detail)}</span>` : ""}</span><button class="btn btn-ghost btn-sm" data-loc>${loc ? "Change" : "Set location"}</button></div>
          </section>
          <section class="panel"><h3>Notifications</h3>
            ${[["n1", "Order updates", "Rider status and delivery messages", true], ["n2", "Promos & rewards", "Deals, points and member perks", true], ["n3", "New restaurants", "When a new spot opens near you", false]].map(([id, t, d, on]) =>
              `<label class="toggle" for="${id}"><span><b>${t}</b><br><span class="muted small">${d}</span></span><input type="checkbox" id="${id}" ${(id in saved ? saved[id] : on) ? "checked" : ""}></label>`).join("")}
          </section>
        </div>
      </div>
    </div>`,
    after(root) {
      const form = $("#form", root);
      maskPhone(form.phone);
      liveValidate(form);
      $$("[data-loc]", root).forEach((b) => b.onclick = () => openMapPicker());
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!validateForm(form)) return;
        store.set("profile_" + u.email, { ...store.get("profile_" + u.email, {}), name: form.name.value.trim(), phone: normalizePhone(form.phone.value) });
        toast("Profile saved");
        render();
      });
      $$(".toggle input", root).forEach((t) => t.onchange = () => {
        store.set("notif_" + u.email, { ...store.get("notif_" + u.email, {}), [t.id]: t.checked });
        toast(`${t.closest(".toggle").querySelector("b").textContent} ${t.checked ? "on" : "off"}`);
      });
      $("#logout", root).onclick = async () => {
        if (!await confirmBox({ ic: "logout", title: "Log out of MoBites?", text: cartCount() ? "Your bag will be emptied." : "You can log back in anytime.", yes: "Log out", danger: true })) return;
        logout(); toast("You've logged out. You're now in Guest view.", "logout"); location.hash = "#/";
      };
    },
  };
}

function pagePrivacy() {
  return { html: `<div class="wrap legal">
    <span class="eyebrow">${icon("shield", 16)} Privacy Policy</span>
    <h1 style="margin-top:8px">Your privacy matters to us.</h1>
    <p class="muted" style="margin-top:8px">Last updated: October 2026</p>
    <div class="note">Live Laugh Love ICT201</div>
    <div class="toc"><a class="chip" href="#/privacy" data-jump="p1">What we collect</a><a class="chip" href="#/privacy" data-jump="p2">How we use it</a><a class="chip" href="#/privacy" data-jump="p3">Your rights</a><a class="chip" href="#/privacy" data-jump="p4">Contact</a></div>
    <p style="margin-top:20px">MoBites follows the <b>Data Privacy Act of 2012 (Republic Act No. 10173)</b>. We only collect what we need to bring your food to you, and we never sell your personal information.</p>
    <h2 id="p1">1. What we collect</h2>
    <ul><li><b>Account details:</b> your name, email address and mobile number.</li><li><b>Delivery location:</b> the address and map pin you choose. We only use your GPS location when you tap "Use my current location".</li><li><b>Orders:</b> what you ordered, when, how you paid, and the total.</li><li><b>Payment:</b> we do not store full card numbers or your GCash PIN.</li></ul>
    <h2 id="p2">2. How we use it</h2>
    <ul><li>To prepare and deliver your orders and contact you about them.</li><li>To show restaurants near you and estimate delivery time.</li><li>To give you points, rewards and (if you allow it) promos.</li><li>We share your name, number and address only with the restaurant and rider handling your order.</li></ul>
    <h2 id="p3">3. Your rights</h2>
    <p>Under RA 10173 you have the right to be informed, to access, to correct, to object, and to have your data erased. You can update your info anytime in <a href="#/profile">My account</a>, or ask us to delete your account.</p>
    <h2>4. How long we keep it</h2>
    <p>We keep order records for as long as your account is active, or as required by law. Location pins are only stored on your device.</p>
    <h2 id="p4">5. Contact us</h2>
    <p>Data Protection Officer: <a href="mailto:privacy@mobites.example">privacy@mobites.example</a></p>
    <p style="margin-top:28px"><a class="btn btn-primary" href="#/">Back to MoBites</a></p>
  </div>`, after: bindJump };
}

function pageTerms() {
  return { html: `<div class="wrap legal">
    <span class="eyebrow">${icon("file", 16)} Terms of Service</span>
    <h1 style="margin-top:8px">The simple rules of MoBites.</h1>
    <p class="muted" style="margin-top:8px">Last updated: October 2026</p>
    <div class="note">Live Laugh Love ICT201</div>
    <div class="toc"><a class="chip" href="#/terms" data-jump="t1">Your account</a><a class="chip" href="#/terms" data-jump="t2">Orders & payment</a><a class="chip" href="#/terms" data-jump="t3">Cancellations</a><a class="chip" href="#/terms" data-jump="t4">Promos</a></div>
    <h2 id="t1">1. Your account</h2>
    <ul><li>You must be at least 18 years old, or have a parent's permission, to create an account.</li><li>Keep your password safe. You're responsible for orders made with your account.</li><li>Give us a real name, a working PH mobile number and an accurate address.</li></ul>
    <h2 id="t2">2. Orders & payment</h2>
    <ul><li>Prices are in Philippine Pesos (₱) and are set by each restaurant.</li><li>Each order has a delivery fee (shown on the restaurant) and a ${peso(SERVICE_FEE)} service fee.</li><li>You can pay by cash on delivery, GCash or card. For cash, please prepare the exact amount.</li></ul>
    <h2 id="t3">3. Cancellations & refunds</h2>
    <ul><li>You can cancel for free while your order is <b>Pending</b>.</li><li>Once the restaurant starts <b>Preparing</b>, the order can't be cancelled.</li><li>Wrong or missing items? Report it within 24 hours and we'll make it right.</li></ul>
    <h2 id="t4">4. Promos & points</h2>
    <ul><li><b>${PROMO.code}</b>: ${peso(PROMO.off)} off one order of ${peso(PROMO.min)} or more. One use per account.</li><li>You earn 1 point for every ${peso(PESOS_PER_POINT)}. ${REWARD_STEP.toLocaleString()} points = ${peso(100)} off. Points have no cash value.</li></ul>
    <h2>5. Be kind</h2>
    <p>Treat riders and restaurant staff with respect. Abusive behavior can get your account suspended.</p>
    <p style="margin-top:28px"><a class="btn btn-primary" href="#/">Back to MoBites</a></p>
  </div>`, after: bindJump };
}
function pageAbout() {
  const team = rows("team");
  const photo = (m, i) => m.image
    ? `<img src="assets/img/team/${esc(m.image)}" alt="${esc(m.name)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'initials',textContent:'${initials(m.name)}'}))">`
    : `<span class="initials">${initials(m.name)}</span>`;
  return { html: `<div class="wrap about">
    <section class="about-hero">
      <div>
        <span class="eyebrow">${icon("sparkle", 16)} About us</span>
        <h1>We're <span class="hl">SERVDLabs</span>.</h1>
        <p class="lead">A small product studio that designs simple, friendly services for everyday Filipinos. We believe good technology should feel like your favorite carinderia: familiar, quick, and made with care.</p>
        <p class="muted" style="margin-top:12px">MoBites is our first project: food delivery built around how Pinoys actually order, from pinning your exact address on a map to paying with cash or GCash.</p>
      </div>
      <div class="about-values">
        <div class="card offer-card">${icon("heart", 26)}<b>Made for locals</b><span class="muted small">Local food, local language, local ways to pay.</span></div>
        <div class="card offer-card">${icon("checkCircle", 26)}<b>Simple by design</b><span class="muted small">Fewer taps, clear steps, no confusion.</span></div>
        <div class="card offer-card">${icon("bike", 26)}<b>Fair to everyone</b><span class="muted small">Good for customers, kitchens and riders.</span></div>
      </div>
    </section>
    <section class="section" style="padding-top:24px">
      <div class="section-head"><div><h2>Meet the team</h2><p class="muted">The people behind MoBites.</p></div></div>
      <div class="team-grid">${team.map((m, i) => `
        <article class="card member">
          <div class="photo" data-tone="${i % 4}">${photo(m, i)}</div>
          <h3>${esc(m.name)}</h3>
          <p class="role">${esc(m.role)}</p>
        </article>`).join("") || `<p class="muted">Add your team in data/team.txt.</p>`}</div>
    </section>
  </div>` };
}

function bindJump(root) {
  $$("[data-jump]", root).forEach((a) => a.onclick = (e) => { e.preventDefault(); document.getElementById(a.dataset.jump)?.scrollIntoView({ behavior: "smooth" }); });
}

function pageNotFound() {
  return { html: `<div class="wrap"><div class="empty" style="padding:80px 16px">${icon("compass", 44)}<h2>Naligaw ka yata!</h2><p style="margin:8px 0 20px">We couldn't find that page.</p><a class="btn btn-primary" href="#/">Back home</a></div></div>` };
}

/* ---------- router ---------- */
const ROUTES = [
  { re: /^$/, page: pageHome },
  { re: /^how$/, page: pageHome, scroll: true },
  { re: /^explore$/, page: pageExplore },
  { re: /^r\/([\w-]+)$/, page: pageRestaurant },
  { re: /^login$/, page: (m, q) => pageAuth(m, q, "login"), guestOnly: true },
  { re: /^signup$/, page: (m, q) => pageAuth(m, q, "signup"), guestOnly: true },
  { re: /^privacy$/, page: pagePrivacy },
  { re: /^terms$/, page: pageTerms },
  { re: /^about$/, page: pageAbout },
  { re: /^cart$/, page: pageCheckout, member: "Log in to see your bag" },
  { re: /^orders$/, page: pageOrders, member: "Log in to see your orders" },
  { re: /^orders\/([\w-]+)$/, page: pageOrderDetail, member: "Log in to track your order" },
  { re: /^favorites$/, page: pageFavorites, member: "Log in to see your favorites" },
  { re: /^rewards$/, page: pageRewards, member: "Log in to see your rewards" },
  { re: /^profile$/, page: pageProfile, member: "Log in to see your account" },
];
let timers = [];
let lastPath = null;

function currentPath() { return location.hash.replace(/^#\/?/, "").split("?")[0]; }

function render() {
  timers.forEach(clearInterval); timers = [];
  const m = $("#modal"); m.hidden = true; m.innerHTML = "";
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, qs] = [raw.split("?")[0], new URLSearchParams(raw.split("?")[1] || "")];
  const u = currentUser();
  const route = ROUTES.find((r) => r.re.test(path));
  if (route?.member && !u) { location.replace("#/login?next=" + encodeURIComponent(path)); toast(route.member, "lock"); return; }
  if (route?.guestOnly && u) { location.replace("#/explore"); return; }
  if (path === "" && u) { location.replace("#/explore"); return; }

  renderChrome(path, u);
  const view = route ? route.page(path.match(route.re).slice(1), qs) : pageNotFound();
  const app = $("#app");
  app.innerHTML = view.html;
  view.after?.(app);
  const titles = { "": "Food delivery", explore: "Restaurants", r: "Menu", login: "Log in", signup: "Sign up", cart: "Checkout", orders: "Orders", favorites: "Favorites", rewards: "Rewards", profile: "My account", privacy: "Privacy Policy", terms: "Terms of Service", about: "About us", how: "How it works" };
  document.title = `MoBites · ${titles[path.split("/")[0]] || "Food delivery"}`;
  if (route?.scroll) requestAnimationFrame(() => document.getElementById(path)?.scrollIntoView({ behavior: "smooth" }));
  else if (path !== lastPath) window.scrollTo(0, 0);
  lastPath = path;
}

(async function boot() {
  $("#app").innerHTML = `<div class="boot"><div>${icon("bike", 40)}<p style="margin-top:10px">Loading the menu…</p></div></div>`;
  try {
    await loadDB();
  } catch (e) {
    $("#app").innerHTML = `<div class="boot"><div style="max-width:520px">${icon("alert", 40)}<h2 style="margin:10px 0">Couldn't open the Notepad database</h2>
      <p>Browsers block reading the <code>data/*.txt</code> files when you double-click <code>index.html</code>. Start the site with <code>python server.py</code> and open <b>http://127.0.0.1:5173</b>, or use the GitHub Pages link.</p>
      <p class="small" style="margin-top:10px">${esc(e.message)}</p></div></div>`;
    return;
  }
  window.addEventListener("hashchange", render);
  window.addEventListener("storage", render);
  render();
})();
