/* MoBites admin: the third point of view (staff only), at #/admin.
   Same theme, same Notepad database. An admin from data/admins.txt can:
   - run orders: change status, assign riders, take phone orders
   - manage restaurants, their menus, and food categories
   - hire riders and office staff, change their status, let them go
   - look up customers and their orders */

/* ---------- session (separate from the customer login) ---------- */
function currentAdmin() {
  const email = store.get("admin", memory.admin);
  return email ? rows("admins").find((a) => a.email.toLowerCase() === email.toLowerCase()) || null : null;
}
function setAdmin(email) { memory.admin = email; if (email) store.set("admin", email); else store.del("admin"); }

/* ---------- lookups ---------- */
const STAFF_ROLES = { rider: "Rider", dispatcher: "Dispatcher", support: "Customer support", operations: "Operations" };
const STAFF_STATUS = { active: ["Active", "delivered"], "off-duty": ["Off duty", "pending"], "on-leave": ["On leave", "preparing"], inactive: ["Let go", "cancelled"] };
const VEHICLES = { motorcycle: "Motorcycle", bicycle: "Bicycle", car: "Car" };
const PAYMENTS = { cod: "Cash on delivery", gcash: "GCash", maya: "Maya" };   // for phone orders (cards are only added by the customer)
const PRICE_LEVELS = { "₱": "₱ (budget)", "₱₱": "₱₱ (mid)", "₱₱₱": "₱₱₱ (premium)" };
const CATEGORY_ICONS = ["rice", "drumstick", "burger", "pizza", "utensils", "soup", "coffee", "cake", "leaf", "fish"];
const AREAS = ["Caloocan", "Las Piñas", "Makati", "Malabon", "Mandaluyong", "Manila", "Marikina", "Muntinlupa", "Navotas", "Parañaque", "Pasay", "Pasig", "Pateros", "Quezon City", "San Juan", "Taguig", "Valenzuela"];
const ACTIVE = ["pending", "preparing", "on-the-way"];

const staffPill = (st) => { const [l, c] = STAFF_STATUS[st] || [st, "pending"]; return `<span class="status status--${c}">${esc(l)}</span>`; };
const staff = () => rows("staff");
const riders = () => staff().filter((s) => s.role === "rider");
const staffById = (id) => staff().find((s) => s.id === id);
const userByEmail = (e) => rows("users").find((u) => u.email.toLowerCase() === String(e).toLowerCase());
const busyRider = (id) => rows("orders").some((o) => o.rider === id && ACTIVE.includes(orderStatus(o)));
const prettyPhone = (p) => String(p || "").replace(/^(\d{4})(\d{3})(\d{4})$/, "$1 $2 $3");
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const nextId = (list, prefix, width) => prefix + String(list.reduce((m, x) => Math.max(m, parseInt(String(x.id).replace(/\D/g, ""), 10) || 0), 0) + 1).padStart(width, "0");
const itemsText = (o) => parseItems(o.items).map(([m, q]) => `${q}× ${esc(itemById(m)?.name || "Item " + m)}`).join(", ");
function allOrders() {
  return rows("orders").map((o) => ({ ...o, st: orderStatus(o) }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || (Number(b.placed_at) || 0) - (Number(a.placed_at) || 0) || String(b.id).localeCompare(String(a.id)));
}

/* ---------- extra validation rules for admin forms ---------- */
Object.assign(RULES, {
  label: (v) => v.trim().length >= 2 || "Use at least 2 characters.",
  money: (v) => (/^\d{1,5}(\.\d{1,2})?$/.test(v.trim()) && +v > 0) || "Enter a price in pesos, like 149.",
  fee: (v) => (/^\d{1,3}$/.test(v.trim()) && +v <= 300) || "Enter a fee from ₱0 to ₱300.",
  lat: (v) => (v.trim() !== "" && +v >= 4.5 && +v <= 21.5) || "Pin the restaurant on the map.",
  lng: (v) => (v.trim() !== "" && +v >= 116 && +v <= 127) || "Pin the restaurant on the map.",
  range: (v) => { const m = v.trim().match(/^(\d{1,3})\s*-\s*(\d{1,3})$/); return (m && +m[1] < +m[2]) || "Use a range in minutes, like 20-30."; },
  plate: (v) => /^([A-Z]{3}\s?\d{3,4}|\d{3}\s?[A-Z]{3}|[A-Z]{2}\s?\d{4,5})$/i.test(v.trim()) || "Use a PH plate number, like NAB 1234 or 123 ABC.",
  address: (v) => v.trim().length >= 8 || "Enter the full address (street, barangay, city).",
  startDate: (v) => { const d = new Date(v + "T12:00"), days = (d - new Date()) / 864e5; return (!isNaN(d) && days > -31 && days < 61) || "Pick a start date within the next 60 days."; },
});

/* ---------- small building blocks ---------- */
const selectField = (o) => `
  <div class="field">
    <label for="${o.id}">${o.label}</label>
    <select id="${o.id}" name="${o.id}" ${o.rules ? `data-rules="${o.rules}"` : ""} aria-describedby="${o.id}-err">
      ${o.blank ? `<option value="">${esc(o.blank)}</option>` : ""}
      ${Object.entries(o.options).map(([v, l]) => `<option value="${esc(v)}" ${String(o.value ?? "") === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}
    </select>
    ${o.hint ? `<span class="hint">${o.hint}</span>` : ""}
    <span class="err" id="${o.id}-err"></span>
  </div>`;
const td = (label, html, cls = "") => `<td data-label="${label}"${cls ? ` class="${cls}"` : ""}><div class="cell">${html}</div></td>`;
const tableShell = (id, head) => `<div class="atable-wrap"><table class="atable"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody id="${id}"></tbody></table></div>`;
const emptyRow = (cols, ic, text) => `<tr class="is-empty"><td colspan="${cols}"><div class="empty">${icon(ic, 34)}<p>${text}</p></div></td></tr>`;
const adminHead = (eyebrow, title, sub, actions = "") => `
  <div class="admin-head"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1>${sub ? `<p class="muted">${sub}</p>` : ""}</div>${actions ? `<div class="admin-actions">${actions}</div>` : ""}</div>`;
const statCard = (ic, label, value, sub = "") => `<div class="card stat a-stat"><span class="a-ic">${icon(ic, 20)}</span><span class="muted small">${label}</span><b>${value}</b>${sub ? `<span class="small muted">${sub}</span>` : ""}</div>`;
const person = (name, sub) => `<div class="order-cell"><span class="avatar sm">${initials(name)}</span><div><b>${esc(name)}</b>${sub ? `<br><span class="muted small">${sub}</span>` : ""}</div></div>`;
const searchBox = (id, ph, value = "") => `<label class="search a-search">${icon("search", 18)}<input id="${id}" type="search" placeholder="${esc(ph)}" value="${esc(value)}" aria-label="${esc(ph)}"></label>`;

/** Where the change went: a .txt file (server running) or this browser (GitHub Pages). */
function dbNote(tables) {
  const list = [].concat(tables);
  return `<div class="db-note">${icon("file", 18)}<span style="flex:1">${DB.server
    ? `Changes are saved straight to ${list.map((t) => `<b>data/${t}.txt</b>`).join(" and ")}. Open it in Notepad to see them.`
    : `No server running, so changes are saved in this browser only. Download them as Notepad files:`}</span>
    ${list.map((t) => `<button class="btn btn-ghost btn-sm" data-export="${t}">${icon("download", 16)} ${t}.txt</button>`).join("")}</div>`;
}
function bindExports(root) { $$("[data-export]", root).forEach((b) => b.onclick = () => exportTable(b.dataset.export)); }

function barChart(points, label) {
  const W = 560, H = 200, n = points.length, bw = Math.min(52, (W / n) * 0.6), gap = (W - bw * n) / (n + 1);
  const max = Math.max(...points.map((p) => p.v), 1);
  const bars = points.map((p, i) => {
    const h = Math.round((p.v / max) * 130), x = gap + i * (bw + gap);
    return `<rect class="bar ${p.v && p.v === max ? "is-max" : ""}" x="${x}" y="${160 - h}" width="${bw}" height="${h}" rx="8"><title>${esc(p.label)}: ${peso(p.v)}</title></rect>
      <text class="val" x="${x + bw / 2}" y="${152 - h}" text-anchor="middle">${p.v ? peso(Math.round(p.v)) : ""}</text>
      <text x="${x + bw / 2}" y="182" text-anchor="middle">${esc(p.label)}</text>`;
  }).join("");
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}"><line x1="0" x2="${W}" y1="160" y2="160" stroke="var(--line)" stroke-width="2"/>${bars}</svg></div>`;
}

/** Email the customer about their order (real email when EmailJS is set up, demo inbox otherwise). */
function notifyCustomer(o, subject, text) {
  const c = userByEmail(o.email);
  return sendMail({ to: o.email, name: c?.name || "", subject, message: `Hi ${firstName(c?.name || "there")},\n\n${text}\n\nMoBites` });
}
const refundText = (o) => `We're refunding ${peso(o.total)} to your ${payLabel(o.payment)}. It usually shows up in 3 to 5 banking days.`;

/** Photo upload: shows a preview, shrinks the photo, saves it, and keeps the file name in a hidden form field. */
const photoPicker = (id, label) => `
  <div class="field"><label>${label} <span class="muted">(optional)</span></label>
    <div class="photo-pick"><div class="photo-prev" id="${id}Prev"></div>
      <div class="photo-btns"><input type="file" id="${id}File" accept="image/jpeg,image/png,image/webp" hidden data-nodraft>
        <button type="button" class="btn btn-ghost btn-sm" id="${id}Btn">${icon("image", 16)} Upload photo</button>
        <button type="button" class="btn btn-danger btn-sm" id="${id}Rm">Remove</button>
        <span class="hint" id="${id}Hint"></span></div></div>
    <input type="hidden" name="${id}"></div>`;
function bindPhotoPicker(root, form, id, folder, nameFn, value, onChange) {
  const input = form[id], file = $(`#${id}File`, root);
  input.value = value || "";
  const draw = () => {
    const v = input.value;
    $(`#${id}Prev`, root).innerHTML = pic(v, folder, "Photo preview", "image", 2);
    $(`#${id}Rm`, root).hidden = !v;
    $(`#${id}Hint`, root).textContent = !v ? "JPG, PNG or WEBP. We'll resize it for you." : /^data:/.test(v) ? "Saved in this browser (server.py isn't running)." : `Saved as assets/img/${folder}/${v}`;
  };
  $(`#${id}Btn`, root).onclick = () => file.click();
  $(`#${id}Rm`, root).onclick = async () => {
    if (!await confirmBox({ ic: "image", title: "Remove this photo?", text: "A placeholder will show until you upload a new one.", yes: "Remove", danger: true })) return;
    input.value = ""; draw(); onChange?.();
  };
  file.onchange = async () => {
    const f = file.files[0];
    file.value = "";
    if (!f) return;
    if (f.size > 15e6) return toast("That photo is too big. Pick one under 15 MB.", "alert");
    $(`#${id}Hint`, root).textContent = "Uploading…";
    try { input.value = await uploadPhoto(f, folder, nameFn()); toast("Photo uploaded. Save to keep it.", "image"); }
    catch (e) { toast(e.message, "alert"); }
    draw(); onChange?.();
  };
  draw();
  return { set(v) { input.value = v || ""; draw(); } };
}

/* ---------- order controls (shared by the dashboard and the Orders page) ---------- */
function statusControl(o) {
  if (o.st === "delivered" || o.st === "cancelled") return statusPill(o.st);
  return `<select class="mini-select st-${o.st}" data-status="${o.id}" aria-label="Status of ${o.id}">${Object.entries(STATUSES).map(([k, l]) => `<option value="${k}" ${k === o.st ? "selected" : ""}>${l}</option>`).join("")}</select>`;
}
function riderControl(o) {
  const cur = o.rider ? staffById(o.rider) : null;
  if (o.st === "delivered" || o.st === "cancelled") return cur ? esc(cur.name) : `<span class="muted small">None</span>`;
  const options = riders().filter((r) => r.status === "active" || r.id === o.rider)
    .map((r) => `<option value="${r.id}" ${r.id === o.rider ? "selected" : ""}>${esc(r.name)}${r.id !== o.rider && busyRider(r.id) ? " (on a delivery)" : ""}</option>`).join("");
  return `<select class="mini-select ${o.rider ? "" : "is-missing"}" data-rider="${o.id}" aria-label="Rider for ${o.id}"><option value="">No rider yet</option>${options}</select>`;
}
function bindOrderControls(root, redraw) {
  $$("[data-status]", root).forEach((s) => s.onchange = async () => {
    const o = allOrders().find((x) => x.id === s.dataset.status);
    const v = s.value;
    if (v === "on-the-way" && !o.rider) { s.value = o.st; return toast("Assign a rider before sending the order out", "alert"); }
    if (v === "cancelled" && !await confirmBox({ title: `Cancel order ${o.id}?`, yes: "Yes, cancel order", no: "Keep it", danger: true,
      text: `${esc(userByEmail(o.email)?.name || o.email)} ${isPaid(o) ? `will get a ${peso(o.total)} refund to ${esc(payLabel(o.payment))}` : `won't be charged ${peso(o.total)}`}. We'll email them. This can't be undone.` })) { s.value = o.st; return; }
    if (v === "delivered" && !await confirmBox({ ic: "checkCircle", title: `Mark ${o.id} as delivered?`, text: "Do this only when the rider has handed over the food.", yes: "Mark delivered" })) { s.value = o.st; return; }
    const changes = { status: v, placed_at: "" };   // placed_at blank = the admin controls the status now, not the demo clock
    if (v === "cancelled" && isPaid(o)) changes.refund = "processing";
    try { await updateRow("orders", o.id, changes); }
    catch { s.value = o.st; return toast("Couldn't save. Is server.py still running?", "alert"); }
    if (v === "cancelled") notifyCustomer(o, `Order ${o.id} cancelled`, `We're sorry, your order ${o.id} was cancelled by MoBites.\n${isPaid(o) ? refundText(o) : "It was cash on delivery, so you weren't charged."}`);
    toast(`${o.id} is now ${STATUSES[v]}${changes.refund ? ". Refund started." : ""}`);
    redraw();
  });
  $$("[data-rider]", root).forEach((s) => s.onchange = async () => {
    const o = allOrders().find((x) => x.id === s.dataset.rider);
    try { await updateRow("orders", o.id, { rider: s.value }); }
    catch { s.value = o.rider || ""; return toast("Couldn't save. Is server.py still running?", "alert"); }
    toast(s.value ? `${staffById(s.value).name} will deliver ${o.id}` : `Rider removed from ${o.id}`, "bike");
    redraw();
  });
}
function orderModal(o, after) {
  const r = restaurantById(o.restaurant_id) || { name: "Removed restaurant" };
  const c = userByEmail(o.email);
  const rider = staffById(o.rider);
  const chat = rows("messages").filter((m) => m.order_id === o.id).sort((a, b) => a.sent_at - b.sent_at);
  modal(`
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2 style="font-size:22px">Order ${esc(o.id)}</h2><button class="icon-btn" data-close aria-label="Close">${icon("x", 18)}</button></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${statusPill(o.st)}<span class="muted small">${fmtDate(o.date)}${o.placed_at ? " · " + fmtTime(Number(o.placed_at)) : ""}</span></div>
    <div class="kv">
      <span>Customer</span><b>${esc(c?.name || o.email)}${c?.phone ? `<br><span class="muted small">${prettyPhone(c.phone)}</span>` : ""}</b>
      <span>Restaurant</span><b>${esc(r.name)}</b>
      <span>Deliver to</span><b>${esc(o.address)}</b>
      <span>Rider</span><b>${rider ? `${esc(rider.name)}<br><span class="muted small">${prettyPhone(rider.phone)}${rider.plate ? " · " + esc(rider.plate) : ""}</span>` : "None yet"}</b>
      <span>Payment</span><b>${esc(payLabel(o.payment))}</b>
      ${o.note ? `<span>Note</span><b class="${/allerg/i.test(o.note) ? "text-alert" : ""}">${esc(o.note)}</b>` : ""}
      ${o.refund ? `<span>Refund</span><b>${o.refund === "refunded" ? "Refunded" : "Processing"} · ${peso(o.total)} to ${esc(payLabel(o.payment))}</b>` : ""}
    </div>
    <div class="summary">${parseItems(o.items).map(([m, q]) => { const it = itemById(m); return `<div class="line"><span>${q}× ${esc(it?.name || "Item " + m)}</span><span>${it ? peso(it.price * q) : ""}</span></div>`; }).join("")}
      <div class="line total"><span>Total</span><span>${peso(o.total)}</span></div></div>
    ${chat.length ? `<details class="mail"><summary><b>${icon("chat", 16)} Rider–customer chat (${chat.length})</b></summary><div class="chat-log small-log">${chat.map((m) => `<div class="msg ${m.sender === "rider" ? "me" : ""}"><span>${esc(m.text)}</span><small>${m.sender === "rider" ? "Rider" : "Customer"} · ${fmtTime(m.sent_at)}</small></div>`).join("")}</div></details>` : ""}
    <div class="form-actions">
      ${ACTIVE.includes(o.st) ? `<a class="btn btn-primary btn-sm" href="#/admin/orders/${esc(o.id)}/edit">${icon("pencil", 14)} Edit order</a>` : ""}
      ${o.refund === "processing" ? `<button class="btn btn-primary btn-sm" id="refundDone">${icon("checkCircle", 14)} Mark refund as done</button>` : ""}
    </div>`, "wide");
  const rd = $("#refundDone");
  if (rd) rd.onclick = async () => {
    if (!await confirmBox({ ic: "wallet", title: `Refund ${peso(o.total)} done?`, text: `Only confirm once the money is back in the customer's ${esc(payLabel(o.payment))}. We'll email them.`, yes: "Yes, it's refunded" })) return;
    try { await updateRow("orders", o.id, { refund: "refunded" }); } catch { return toast("Couldn't save. Is server.py still running?", "alert"); }
    notifyCustomer(o, `Refund for ${o.id} completed`, `Your refund of ${peso(o.total)} for order ${o.id} is done. It's back in your ${payLabel(o.payment)}.`);
    toast("Refund marked as done", "wallet");
    after?.();
  };
}

/* ---------- chrome ---------- */
const ADMIN_TABS = [["admin", "Dashboard", "chart"], ["admin/live", "Live orders", "bike"], ["admin/orders", "Orders", "receipt"], ["admin/restaurants", "Restaurants", "store"], ["admin/staff", "Riders & staff", "badge"], ["admin/customers", "Customers", "users"], ["admin/categories", "Categories", "tag"], ["admin/feedback", "Feedback", "chat"]];
function renderAdminChrome(path) {
  const a = currentAdmin();
  const on = (p) => (p === "admin" ? path === "admin" : path === p || path.startsWith(p + "/"));
  $("#topbar").innerHTML = `<div class="wrap">
      <a class="brand" href="#/admin" aria-label="MoBites admin home">${icon("bike", 28)}MoBites<span class="admin-tag">Admin</span></a>
      <div class="top-actions">
        ${a ? `<span class="pov is-admin" title="Presentation: current point of view">${icon("shield", 14)} Admin view</span>` : ""}
        <a class="btn btn-ghost btn-sm" href="#/explore" title="Open the customer site">${icon("home", 16)}<span class="hide-sm">Customer site</span></a>
        ${a ? `<span class="avatar" title="${esc(a.name)} · ${esc(a.role)}">${initials(a.name)}</span>
        <button class="icon-btn" id="adminOut" aria-label="Log out of admin" title="Log out">${icon("logout", 18)}</button>` : ""}
      </div></div>
    ${a ? `<nav class="wrap admin-tabs" aria-label="Admin sections"><div class="chips">${ADMIN_TABS.map(([p, l, ic]) => `<a class="chip ${on(p) ? "is-active" : ""}" href="#/${p}" ${on(p) ? 'aria-current="page"' : ""}>${icon(ic, 18)}${l}</a>`).join("")}</div></nav>` : ""}`;
  $("#bottombar").innerHTML = "";
  $("#footer").innerHTML = `<div class="wrap">
    <span><strong>MoBites Admin</strong> · For the MoBites team only.</span>
    <nav aria-label="Footer"><a href="#/explore">Customer site</a><a href="#/about">About us</a><a href="#/privacy">Privacy Policy</a><a href="#/terms">Terms of Service</a></nav>
    <span>© 2026 MoBites</span></div>`;
  const out = $("#adminOut");
  if (out) out.onclick = async () => {
    if (!await confirmBox({ ic: "logout", title: "Log out of admin?", text: "You'll go back to the customer site.", yes: "Log out", danger: true })) return;
    setAdmin(null); toast("Logged out of admin", "logout"); location.hash = "#/";
  };
}

/* ---------- log in ---------- */
function pageAdminLogin(_, query) {
  const next = query.get("next") || "admin";
  return {
    html: `<div class="wrap auth">
      <div class="auth-story">
        <span class="eyebrow">${icon("shield", 16)} MoBites Admin</span>
        <h1>Para sa team lang.</h1>
        <p class="muted" style="margin-top:10px;font-size:18px">Run the kitchen-to-door operation from one place. Every change is saved to the Notepad database.</p>
        <ul>
          <li>${icon("receipt", 18)} Update orders and assign riders</li>
          <li>${icon("store", 18)} Add restaurants, menus and categories</li>
          <li>${icon("badge", 18)} Hire riders and office staff</li>
          <li>${icon("users", 18)} Look up customers and their orders</li>
        </ul>
      </div>
      <div class="panel" style="padding:28px">
        <h2 style="font-size:24px;margin-bottom:18px">Admin log in</h2>
        <form class="form" id="form" novalidate>
          <div class="form-alert" id="alert">${icon("alert", 18)}<span></span></div>
          ${field({ id: "email", label: "Work email", type: "email", ph: "name@mobites.ph", rules: "required email", attrs: 'autocomplete="username"' })}
          ${field({ id: "password", label: "Password", type: "password", ph: "Your password", rules: "required", password: true, attrs: 'autocomplete="current-password"' })}
          <button class="btn btn-primary btn-block">Open dashboard ${icon("arrowRight", 16)}</button>
          <p class="small muted" style="text-align:center">Not on the team? <a href="#/">Back to MoBites</a></p>
        </form>
      </div>
    </div>`,
    after(root) {
      const form = $("#form", root), alertBox = $("#alert", root);
      bindPasswordToggles(root);
      liveValidate(form);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        alertBox.classList.remove("show");
        if (!validateForm(form)) return;
        const a = rows("admins").find((x) => x.email.toLowerCase() === form.email.value.trim().toLowerCase());
        if (!a || a.password_sha256 !== await sha256(form.password.value)) {
          alertBox.querySelector("span").textContent = "That email and password don't match an admin account.";
          alertBox.classList.add("show"); form.password.focus(); return;
        }
        setAdmin(a.email);
        toast(`Welcome, ${firstName(a.name)}! You're now in Admin view.`, "shield");
        location.hash = "#/" + next;
      });
    },
  };
}

/* ---------- dashboard ---------- */
function pageAdminHome() {
  const a = currentAdmin();
  const orders = allOrders();
  const today = ymd(new Date());
  const paid = (list) => list.filter((o) => o.st !== "cancelled").reduce((s, o) => s + Number(o.total), 0);
  const todays = orders.filter((o) => o.date === today);
  const active = orders.filter((o) => ACTIVE.includes(o.st));
  const onDuty = riders().filter((r) => r.status === "active");
  const free = onDuty.filter((r) => !busyRider(r.id));
  const counts = Object.keys(STATUSES).map((k) => [k, orders.filter((o) => o.st === k).length]);
  const maxCount = Math.max(1, ...counts.map((c) => c[1]));
  // last 7 days; if the newest order is older than that (sample data), end the chart on that day instead
  const latest = orders.reduce((m, o) => (String(o.date) > m ? String(o.date) : m), "");
  const recent = latest && (new Date() - new Date(latest + "T12:00")) / 864e5 < 7;
  const end = recent || !latest ? new Date() : new Date(latest + "T12:00");
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(end); d.setDate(d.getDate() - i); const key = ymd(d); days.push({ label: d.toLocaleDateString("en-PH", { weekday: "short" }), v: paid(orders.filter((o) => o.date === key)) }); }
  const chartTitle = recent || !latest ? "Sales, last 7 days" : `Sales, 7 days up to ${fmtDate(latest)}`;
  const byR = {};
  orders.filter((o) => o.st !== "cancelled").forEach((o) => (byR[o.restaurant_id] = (byR[o.restaurant_id] || 0) + Number(o.total)));
  const top = Object.entries(byR).sort((x, y) => y[1] - x[1]).slice(0, 5);
  const topMax = top[0]?.[1] || 1;
  return {
    html: `<div class="wrap">
      ${adminHead(new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" }), `Magandang araw, ${esc(firstName(a.name))}!`, "Here's how MoBites is doing today.",
        `<a class="btn btn-primary btn-sm" href="#/admin/orders/new">${icon("plus", 16)} New order</a><a class="btn btn-ghost btn-sm" href="#/admin/staff/hire">${icon("badge", 16)} Hire</a><a class="btn btn-ghost btn-sm" href="#/admin/restaurants/new">${icon("store", 16)} Add restaurant</a>`)}
      <div class="stats" style="margin-bottom:20px">
        ${statCard("receipt", "Orders today", todays.length, `${active.length} still active`)}
        ${statCard("wallet", "Sales today", peso(paid(todays)), `${peso(paid(orders))} all time`)}
        ${statCard("bike", "Riders free now", `${free.length} / ${onDuty.length}`, `${onDuty.length - free.length} on a delivery`)}
        ${statCard("store", "Restaurants", restaurants().length, `${menuItems().length} dishes · ${rows("users").length} customers`)}
      </div>
      <div class="two-col" style="margin-bottom:20px">
        <section class="panel">
          <div class="section-head" style="margin-bottom:6px"><h3 style="margin:0">Needs attention</h3><a class="link-arrow" href="#/admin/orders?f=active">All active orders ${icon("arrowRight", 14)}</a></div>
          <p class="muted small" style="margin-bottom:6px">Pending orders and orders without a rider.</p>
          <div id="attention"></div>
        </section>
        <section class="panel"><h3>Orders by status</h3><p class="muted small">All ${orders.length} orders in orders.txt.</p>
          <div class="hbars">${counts.map(([k, n]) => `<div class="hbar"><span>${statusPill(k)}</span><div class="track" role="progressbar" aria-label="${STATUSES[k]}" aria-valuemin="0" aria-valuemax="${orders.length}" aria-valuenow="${n}"><i class="fill-${k}" style="width:${(n / maxCount) * 100}%"></i></div><b>${n}</b></div>`).join("")}</div>
        </section>
      </div>
      <div class="two-col">
        <section class="panel"><h3>${chartTitle}</h3><p class="muted small">Not counting cancelled orders.</p>${barChart(days, chartTitle)}</section>
        <section class="panel"><h3>Top restaurants</h3><p class="muted small">By total sales.</p>
          <div class="hbars">${top.map(([rid, v]) => `<div class="hbar wide"><span class="small"><b>${esc(restaurantById(rid)?.name || "Removed restaurant")}</b></span><div class="track"><i style="width:${(v / topMax) * 100}%"></i></div><b>${peso(v)}</b></div>`).join("") || `<p class="muted">No sales yet.</p>`}</div>
        </section>
      </div>
    </div>`,
    after(root) {
      const draw = () => {
        const list = allOrders().filter((o) => ACTIVE.includes(o.st) && (!o.rider || o.st === "pending"));
        $("#attention", root).innerHTML = list.length ? `<div class="mini-list">${list.map((o) => `
          <div class="mini-row"><div><b>${esc(o.id)}</b> · ${esc(restaurantById(o.restaurant_id)?.name || "Removed restaurant")}<br><span class="muted small">${esc(userByEmail(o.email)?.name || o.email)} · ${peso(o.total)}</span></div>
          <div class="mini-ctrls">${statusControl(o)}${riderControl(o)}</div></div>`).join("")}</div>`
          : `<div class="empty" style="padding:24px">${icon("checkCircle", 34)}<p>All caught up. Every active order has a rider.</p></div>`;
        bindOrderControls(root, () => render());
      };
      draw();
    },
  };
}

/* ---------- orders ---------- */
function pageAdminOrders(_, query) {
  let filter = query.get("f") || "all";
  let q = query.get("q") || "";
  const FILTERS = [["all", "All"], ["active", "Active"], ["pending", "Pending"], ["no-rider", "No rider"], ["delivered", "Delivered"], ["cancelled", "Cancelled"], ["refund", "Refunds to do"]];
  const match = (o, f) => f === "all" || (f === "active" ? ACTIVE.includes(o.st) : f === "no-rider" ? ACTIVE.includes(o.st) && !o.rider : f === "refund" ? o.refund === "processing" : o.st === f);
  return {
    html: `<div class="wrap">
      ${adminHead("Orders", "Every order, one place.", "Change a status or assign a rider right in the table.",
        `<a class="btn btn-primary btn-sm" href="#/admin/orders/new">${icon("plus", 16)} New order</a>`)}
      <section class="panel">
        <div class="toolbar">${searchBox("q", "Search order no., customer or restaurant", q)}</div>
        <div class="filters" id="filters"></div>
        ${tableShell("rows", ["Order", "Customer", "Restaurant", "Status", "Rider", "Total", ""])}
        <div style="margin-top:16px">${dbNote("orders")}</div>
      </section>
    </div>`,
    after(root) {
      const draw = () => {
        const all = allOrders();
        const term = q.trim().toLowerCase();
        const found = all.filter((o) => !term || [o.id, o.email, userByEmail(o.email)?.name, restaurantById(o.restaurant_id)?.name].some((x) => String(x || "").toLowerCase().includes(term)));
        $("#filters", root).innerHTML = FILTERS.map(([k, l]) => `<button class="chip ${k === filter ? "is-active" : ""}" data-f="${k}">${l} <span class="count">${found.filter((o) => match(o, k)).length}</span></button>`).join("");
        $$("[data-f]", root).forEach((b) => b.onclick = () => { filter = b.dataset.f; draw(); });
        const list = found.filter((o) => match(o, filter));
        $("#rows", root).innerHTML = list.length ? list.map((o) => {
          const r = restaurantById(o.restaurant_id);
          return `<tr>
            ${td("Order", `<b>${esc(o.id)}</b><br><span class="muted small">${fmtDate(o.date)}${o.placed_at ? " · " + fmtTime(Number(o.placed_at)) : ""}</span>${o.note ? `<br><span class="small ${/allerg/i.test(o.note) ? "text-alert" : "muted"}" title="${esc(o.note)}">${icon(/allerg/i.test(o.note) ? "alert" : "file", 13)} ${/allerg/i.test(o.note) ? "Allergies" : "Has a note"}</span>` : ""}`)}
            ${td("Customer", `${esc(userByEmail(o.email)?.name || o.email)}<br><span class="muted small">${esc(payLabel(o.payment))}</span>`)}
            ${td("Restaurant", `${esc(r?.name || "Removed restaurant")}<br><span class="muted small">${itemsText(o)}</span>`, "wrap-cell")}
            ${td("Status", statusControl(o) + (o.refund ? `<br><span class="refund-tag is-${o.refund}">${o.refund === "refunded" ? "Refunded" : "Refund to do"}</span>` : ""))}
            ${td("Rider", riderControl(o))}
            ${td("Total", `<b>${peso(o.total)}</b>`)}
            ${td("", `<button class="btn btn-ghost btn-sm" data-view="${esc(o.id)}">View</button>`, "act")}</tr>`;
        }).join("") : emptyRow(7, "receipt", term ? `No orders match "${esc(q)}".` : "No orders here yet.");
        $$("[data-view]", root).forEach((b) => b.onclick = () => orderModal(allOrders().find((o) => o.id === b.dataset.view), draw));
        bindOrderControls(root, draw);
      };
      $("#q", root).addEventListener("input", (e) => { q = e.target.value; draw(); });
      bindExports(root);
      draw();
      everyFew(5000, ["orders"], () => {   // new orders from customers and riders show up on their own
        if ($("#modal").hidden && (document.activeElement === document.body || !root.contains(document.activeElement) || document.activeElement.id === "q")) draw();
      });
    },
  };
}

function pageAdminNewOrder([editId] = []) {
  const edit = editId ? allOrders().find((o) => o.id === editId) : null;
  if (editId && !edit) return pageNotFound();
  if (edit && !ACTIVE.includes(edit.st)) return { html: `<div class="wrap"><div class="empty" style="padding:80px 16px">${icon("lock", 40)}<h2>${esc(edit.id)} can't be edited</h2><p style="margin:8px 0 20px">It's already ${STATUSES[edit.st].toLowerCase()}.</p><a class="btn btn-primary" href="#/admin/orders?q=${esc(edit.id)}">Back to orders</a></div></div>` };
  const users = Object.fromEntries(rows("users").map((u) => [u.email, `${u.name} (${u.email})`]));
  if (edit && !users[edit.email]) users[edit.email] = edit.email;
  const rests = Object.fromEntries(restaurants().map((r) => [r.id, r.name]));
  const freeRiders = Object.fromEntries(riders().filter((r) => r.status === "active" || r.id === edit?.rider).map((r) => [r.id, r.name + (r.id !== edit?.rider && busyRider(r.id) ? " (on a delivery)" : "")]));
  const pays = edit && !PAYMENTS[edit.payment] ? { ...PAYMENTS, [edit.payment]: payLabel(edit.payment) } : PAYMENTS;
  const oldItems = edit ? Object.fromEntries(parseItems(edit.items).map(([m, q]) => [String(m), q])) : {};
  const oldSub = Object.entries(oldItems).reduce((s, [m, q]) => s + (itemById(m)?.price || 0) * q, 0);
  const extraFees = edit ? Number(edit.total) - oldSub - Number(restaurantById(edit.restaurant_id)?.fee || 0) - SERVICE_FEE : 0;   // the customer's tip minus any promo
  return {
    html: `<div class="wrap">
      <div class="crumbs"><a href="#/admin/orders">Orders</a> / ${edit ? esc(edit.id) + " / Edit" : "New order"}</div>
      ${edit ? adminHead("Edit order", `Edit ${esc(edit.id)}`, "Change items, address, payment, rider or note. The customer gets an email about the change.")
        : adminHead("New order", "Take an order by phone.", "For customers who call or message instead of using the app.")}
      <form class="checkout" id="form" novalidate>
        <div style="display:grid;gap:20px">
          <section class="panel"><h3>1 · Customer</h3>
            <div class="form">
              ${selectField({ id: "email", label: "Customer", options: users, blank: "Choose a customer", rules: "required", value: edit?.email })}
              ${field({ id: "address", label: "Deliver to", ph: "Street, barangay, city", rules: "required address", hint: "Filled in from the customer's saved address. You can change it." })}
            </div>
          </section>
          <section class="panel"><h3>2 · Food</h3>
            <div class="form">
              ${selectField({ id: "restaurant", label: "Restaurant", options: rests, blank: "Choose a restaurant", rules: "required", value: edit?.restaurant_id })}
              <div class="field" id="itemsField"><label>Items</label><div id="items" class="pick-list"><p class="muted small">Choose a restaurant to see its menu.</p></div><span class="err" id="items-err"></span></div>
            </div>
          </section>
          <section class="panel"><h3>3 · Payment and rider</h3>
            <div class="form row-2">
              ${selectField({ id: "payment", label: "Payment", options: pays, value: edit?.payment || "cod" })}
              ${selectField({ id: "rider", label: "Rider", options: freeRiders, blank: "Assign later", hint: "Only active riders are listed.", value: edit?.rider })}
            </div>
            <div class="field" style="margin-top:16px"><label for="note">Note for the restaurant and rider <span class="muted">(optional)</span></label><textarea id="note" name="note" maxlength="200" placeholder="e.g. Allergies: Peanuts · Call when outside">${esc(edit?.note || "")}</textarea></div>
          </section>
        </div>
        <aside class="panel summary-panel"><h3>Order summary</h3><div id="sum"></div>
          <button class="btn btn-primary btn-block" style="margin-top:14px">${edit ? "Save changes" : `Save order ${icon("arrowRight", 16)}`}</button>
          <a class="btn btn-ghost btn-block" href="#/admin/orders" style="margin-top:10px">Cancel</a></aside>
      </form>
    </div>`,
    after(root) {
      const form = $("#form", root);
      const qty = { ...oldItems };
      if (edit) { form.email.disabled = true; form.restaurant.disabled = true; form.address.value = edit.address; }
      const subtotal = () => Object.entries(qty).reduce((s, [id, n]) => s + (itemById(id)?.price || 0) * n, 0);
      const count = () => Object.values(qty).reduce((a, b) => a + b, 0);
      const drawSum = () => {
        const r = restaurantById(form.restaurant.value);
        const fee = r ? Number(r.fee) : 0, sub = subtotal();
        $("#sum", root).innerHTML = `<div class="summary">
          ${Object.entries(qty).filter(([, n]) => n).map(([id, n]) => `<div class="line"><span>${n}× ${esc(itemById(id).name)}</span><span>${peso(itemById(id).price * n)}</span></div>`).join("") || `<p class="muted small">No items yet.</p>`}
          <div class="line"><span>Subtotal</span><span>${peso(sub)}</span></div>
          <div class="line"><span>Delivery fee</span><span>${peso(fee)}</span></div>
          <div class="line"><span>Service fee</span><span>${peso(SERVICE_FEE)}</span></div>
          ${extraFees ? `<div class="line"><span>Tip and promo</span><span>${extraFees < 0 ? "−" : ""}${peso(Math.abs(extraFees))}</span></div>` : ""}
          <div class="line total"><span>Total</span><span>${peso(sub ? sub + fee + SERVICE_FEE + extraFees : 0)}</span></div>
          ${edit && sub ? `<p class="small muted">Was ${peso(edit.total)}.</p>` : ""}</div>`;
      };
      const checkItems = () => {
        const ok = count() > 0;
        $("#itemsField", root).classList.toggle("has-error", !ok && !!form.dataset.touched);
        $("#items-err", root).innerHTML = ok ? "" : icon("alert", 14) + "Add at least one item.";
        return ok;
      };
      const drawItems = () => {
        const list = menuItems().filter((m) => m.restaurant_id === form.restaurant.value);
        $("#items", root).innerHTML = list.length ? list.map((m) => `
          <div class="pick-row"><div><b>${esc(m.name)}</b><br><span class="muted small">${peso(m.price)}</span></div>
            <div class="qty"><button type="button" data-minus="${m.id}" aria-label="Remove one ${esc(m.name)}">${icon("minus", 16)}</button><b aria-live="polite">${qty[m.id] || 0}</b><button type="button" data-plus="${m.id}" aria-label="Add one ${esc(m.name)}">${icon("plus", 16)}</button></div></div>`).join("")
          : `<p class="muted small">${form.restaurant.value ? "This restaurant has no dishes yet." : "Choose a restaurant to see its menu."}</p>`;
        $$("[data-plus],[data-minus]", root).forEach((b) => b.onclick = () => {
          const id = b.dataset.plus || b.dataset.minus;
          qty[id] = Math.max(0, Math.min(20, (qty[id] || 0) + (b.dataset.plus ? 1 : -1)));
          drawItems(); drawSum(); if (form.dataset.touched) checkItems();
        });
      };
      form.email.onchange = () => { const u = userByEmail(form.email.value); if (u) { form.address.value = u.address; checkField(form.address); } };
      form.restaurant.onchange = () => { Object.keys(qty).forEach((k) => delete qty[k]); drawItems(); drawSum(); };
      liveValidate(form);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const ok = validateForm(form);
        if (!checkItems() || !ok) return toast("Check the highlighted fields", "alert");
        const r = restaurantById(form.restaurant.value);
        const total = subtotal() + Number(r.fee) + SERVICE_FEE + extraFees;
        const c = userByEmail(form.email.value) || { name: form.email.value, email: form.email.value };
        const items = Object.entries(qty).filter(([, n]) => n).map(([id, n]) => `${id}x${n}`).join(";");
        if (edit) {
          const diff = total - Number(edit.total);
          if (!await confirmBox({ ic: "pencil", title: `Save changes to ${esc(edit.id)}?`, yes: "Save changes", no: "Keep editing",
            text: `New total <b>${peso(total)}</b>${diff ? ` (${diff > 0 ? "+" : "−"}${peso(Math.abs(diff))})` : ""}<br>${esc(payLabel(form.payment.value))} · ${form.rider.value ? "Rider: " + esc(staffById(form.rider.value).name) : "No rider yet"}<br>We'll email ${esc(c.name)} about the change.` })) return;
          try { await updateRow("orders", edit.id, { items, total, address: form.address.value.trim(), payment: form.payment.value, rider: form.rider.value, note: form.note.value.trim() }); }
          catch { return toast("Couldn't save. Is server.py still running?", "alert"); }
          notifyCustomer(edit, `Your order ${edit.id} was updated`, `We made a change to your order ${edit.id} from ${r.name}.\nNew total: ${peso(total)}${diff ? ` (${diff > 0 ? "+" : "−"}${peso(Math.abs(diff))})` : ""}.\nDeliver to: ${form.address.value.trim()}\n\nQuestions? Reply to this email or message your rider in the app.`);
          sess.del(draftKey(form));
          toast(`${edit.id} updated`, "pencil");
          location.hash = "#/admin/orders?q=" + edit.id;
          return;
        }
        if (!await confirmBox({ ic: "receipt", title: "Save this order?", yes: `Save order · ${peso(total)}`, no: "Not yet",
          text: `<b>${esc(c.name)}</b> · ${count()} item${count() > 1 ? "s" : ""} from ${esc(r.name)}<br>${esc(payLabel(form.payment.value))} · ${form.rider.value ? "Rider: " + esc(staffById(form.rider.value).name) : "No rider yet"}` })) return;
        const order = {
          id: "MB-" + String(Date.now()).slice(-6), email: c.email, restaurant_id: r.id,
          items: Object.entries(qty).filter(([, n]) => n).map(([id, n]) => `${id}x${n}`).join(";"), total, date: ymd(new Date()),
          placed_at: "", status: "pending", address: form.address.value.trim(), payment: form.payment.value, rider: form.rider.value,
          note: form.note.value.trim(), refund: "", pin: makePin(),
        };
        try { await appendRow("orders", order); } catch { return toast("Couldn't save the order. Is server.py still running?", "alert"); }
        sess.del(draftKey(form));
        toast(`Order ${order.id} saved`, "receipt");
        location.hash = "#/admin/orders?q=" + order.id;
      });
      drawItems(); drawSum();
    },
  };
}

/* ---------- restaurants + menus ---------- */
function pageAdminRestaurants(_, query) {
  let q = query.get("q") || "";
  return {
    html: `<div class="wrap">
      ${adminHead("Restaurants", "Partner restaurants", "Add new partners, edit their details and manage their menus.",
        `<a class="btn btn-primary btn-sm" href="#/admin/restaurants/new">${icon("plus", 16)} Add restaurant</a>`)}
      <section class="panel">
        <div class="toolbar">${searchBox("q", "Search name, area or category", q)}</div>
        ${tableShell("rows", ["Restaurant", "Category", "Area", "Menu", "Orders", "Delivery fee", ""])}
        <div style="margin-top:16px">${dbNote(["restaurants", "menu"])}</div>
      </section>
    </div>`,
    after(root) {
      const draw = () => {
        const term = q.trim().toLowerCase();
        const list = restaurants().filter((r) => !term || [r.name, r.area, r.tags, categoryById(r.category).label].some((x) => String(x).toLowerCase().includes(term)));
        const orders = rows("orders");
        $("#rows", root).innerHTML = list.length ? list.map((r) => `<tr>
          ${td("Restaurant", `<div class="order-cell"><div class="thumb">${restaurantPic(r)}</div><div><a href="#/admin/restaurants/${r.id}"><b>${esc(r.name)}</b></a><br><span class="muted small">${esc(r.tags)} · ${esc(r.id)}</span></div></div>`, "wrap-cell")}
          ${td("Category", `${icon(categoryById(r.category).icon, 16)} ${esc(categoryById(r.category).label)}`)}
          ${td("Area", esc(r.area), "wrap-cell")}
          ${td("Menu", `${menuItems().filter((m) => m.restaurant_id === r.id).length} dishes`)}
          ${td("Orders", orders.filter((o) => o.restaurant_id === r.id).length)}
          ${td("Delivery fee", peso(r.fee))}
          ${td("", `<a class="btn btn-ghost btn-sm" href="#/admin/restaurants/${r.id}">${icon("pencil", 14)} Edit</a><button class="btn btn-danger btn-sm" data-del="${r.id}" aria-label="Remove ${esc(r.name)}">${icon("trash", 14)}</button>`, "act")}</tr>`).join("")
          : emptyRow(7, "store", term ? `No restaurants match "${esc(q)}".` : "No restaurants yet. Add your first partner.");
        $$("[data-del]", root).forEach((b) => b.onclick = () => removeRestaurant(b.dataset.del, draw));
      };
      $("#q", root).addEventListener("input", (e) => { q = e.target.value; draw(); });
      bindExports(root);
      draw();
    },
  };
}

async function removeRestaurant(id, after) {
  const r = restaurantById(id);
  const dishes = menuItems().filter((m) => m.restaurant_id === id);
  if (allOrders().some((o) => o.restaurant_id === id && ACTIVE.includes(o.st))) return toast(`${r.name} has active orders. Finish or cancel them first.`, "alert");
  if (!await confirmBox({ ic: "trash", title: `Remove ${esc(r.name)}?`, yes: "Yes, remove", danger: true,
    text: `This deletes it from restaurants.txt, along with its ${dishes.length} dish${dishes.length === 1 ? "" : "es"} in menu.txt. Past orders stay and show "Removed restaurant".` })) return;
  try {
    for (const m of dishes) await deleteRow("menu", m.id);
    await deleteRow("restaurants", id);
  } catch { return toast("Couldn't delete. Is server.py still running?", "alert"); }
  toast(`${r.name} removed`, "trash");
  after();
}

function pageAdminRestaurant([id]) {
  const isNew = id === "new";
  const r = isNew ? { name: "", category: categories()[0]?.id, tags: "", area: "", lat: "", lng: "", time: "20-30", fee: 39, price: "₱", badge: "", image: "", rating: 0, reviews: 0 } : restaurantById(id);
  if (!r) return pageNotFound();
  return {
    html: `<div class="wrap">
      <div class="crumbs"><a href="#/admin/restaurants">Restaurants</a> / ${isNew ? "New" : esc(r.name)}</div>
      ${adminHead(isNew ? "New restaurant" : "Edit restaurant", isNew ? "Add a partner restaurant" : esc(r.name), isNew ? "Fill in the details, then add the menu on the next step." : `ID ${esc(r.id)} · Saved in restaurants.txt`,
        isNew ? "" : `<a class="btn btn-ghost btn-sm" href="#/r/${r.id}">${icon("eye", 16)} See it on the site</a><button class="btn btn-danger btn-sm" id="del">${icon("trash", 16)} Remove</button>`)}
      <div class="admin-split">
        <section class="panel"><h3>Details</h3>
          <form class="form" id="form" novalidate>
            ${field({ id: "name", label: "Restaurant name", value: r.name, ph: "e.g. Aling Nena's Carinderia", rules: "required label", attrs: 'maxlength="40"' })}
            <div class="row-2">
              ${selectField({ id: "category", label: "Category", options: Object.fromEntries(categories().map((c) => [c.id, c.label])), value: r.category, rules: "required" })}
              ${selectField({ id: "price", label: "Price level", options: PRICE_LEVELS, value: r.price })}
            </div>
            ${field({ id: "tags", label: "Short description", value: r.tags, ph: "e.g. Silog · Rice bowls", rules: "required label", hint: "Shown under the name. Separate with ·", attrs: 'maxlength="40"' })}
            <div class="field"><label>Location</label>
              <div class="addr-card"><span class="pin">${icon("pin", 20)}</span><span class="grow"><b id="coords">${r.lat !== "" ? `${r.lat}, ${r.lng}` : "Not pinned yet"}</b><br><span class="small muted">Customers see how far it is from them.</span></span><button type="button" class="btn btn-ghost btn-sm" id="pinBtn">${r.lat !== "" ? "Move pin" : "Pin on map"}</button></div>
            </div>
            <div class="row-2">
              ${field({ id: "lat", label: "Latitude", value: r.lat, rules: "lat", hint: "Or paste from Google Maps", attrs: 'inputmode="decimal"' })}
              ${field({ id: "lng", label: "Longitude", value: r.lng, rules: "lng", attrs: 'inputmode="decimal"' })}
            </div>
            ${field({ id: "area", label: "Area", value: r.area, ph: "e.g. Diliman, Quezon City", rules: "required label", hint: "Barangay or district, then city." })}
            <div class="row-2">
              ${field({ id: "time", label: "Delivery time (minutes)", value: r.time, ph: "20-30", rules: "required range" })}
              ${field({ id: "fee", label: "Delivery fee (₱)", value: r.fee, ph: "39", rules: "required fee", attrs: 'inputmode="numeric"' })}
            </div>
            <div class="row-2">
              ${field({ id: "badge", label: 'Badge <span class="muted">(optional)</span>', value: r.badge, ph: "e.g. New, Bestseller", attrs: 'maxlength="16"' })}
            </div>
            ${photoPicker("image", "Restaurant photo")}
            <div class="form-actions"><button class="btn btn-primary">${isNew ? `Add restaurant ${icon("arrowRight", 16)}` : "Save changes"}</button><a class="btn btn-ghost" href="#/admin/restaurants">Cancel</a></div>
          </form>
        </section>
        <aside class="preview-side"><span class="eyebrow">Preview</span><div id="preview" class="preview-card"></div><p class="small muted">This is how customers see it in the restaurant list.</p></aside>
      </div>
      ${isNew ? "" : `
      <section class="panel" style="margin-top:24px">
        <div class="section-head" style="margin-bottom:10px"><div><h3 style="margin:0">Menu</h3><p class="muted small">Dishes in menu.txt for ${esc(r.name)}.</p></div></div>
        <div class="admin-split menu-split">
          <div>${tableShell("dishes", ["Dish", "Price", "Bestseller", ""])}</div>
          <form class="form dish-form" id="dishForm" novalidate>
            <h3 id="dishTitle" style="margin:0">Add a dish</h3>
            <input type="hidden" name="dishId">
            ${field({ id: "dname", label: "Dish name", ph: "e.g. Pork Sisig", rules: "required label", attrs: 'maxlength="40"' })}
            ${field({ id: "ddesc", label: "Description", ph: "e.g. Sizzling, with egg and calamansi", rules: "required label", attrs: 'maxlength="80"' })}
            ${field({ id: "dprice", label: "Price (₱)", ph: "149", rules: "required money", attrs: 'inputmode="decimal"' })}
            ${photoPicker("dimage", "Dish photo")}
            <label class="check"><input type="checkbox" name="dpopular"> Mark as bestseller</label>
            <div class="form-actions"><button class="btn btn-primary" id="dishSave">${icon("plus", 16)} Add dish</button><button type="button" class="btn btn-ghost" id="dishCancel" hidden>Cancel edit</button></div>
          </form>
        </div>
        <div style="margin-top:16px">${dbNote(["restaurants", "menu"])}</div>
      </section>`}
    </div>`,
    after(root) {
      const form = $("#form", root);
      const values = () => ({ ...r, name: form.name.value.trim(), category: form.category.value, tags: form.tags.value.trim(), area: form.area.value.trim(),
        lat: form.lat.value === "" ? "" : +form.lat.value, lng: form.lng.value === "" ? "" : +form.lng.value, time: form.time.value.replace(/\s/g, ""), fee: +form.fee.value || 0,
        price: form.price.value, badge: form.badge.value.trim(), image: form.image.value.trim() });
      const preview = () => {
        const v = values();
        $("#preview", root).innerHTML = restaurantCard({ ...v, name: v.name || "Restaurant name", tags: v.tags || "Short description", id: v.id || "preview" }, null);
        $("#preview a", root)?.addEventListener("click", (e) => e.preventDefault());
      };
      const newId = isNew ? nextId(restaurants(), "r", 2) : r.id;
      bindPhotoPicker(root, form, "image", "restaurants", () => newId, r.image, () => preview());
      const extra = { name: (el) => !restaurants().some((x) => x.id !== r.id && x.name.toLowerCase() === el.value.trim().toLowerCase()) || "Another restaurant already has this name." };
      liveValidate(form, extra);
      form.addEventListener("input", preview);
      form.addEventListener("change", preview);
      $("#pinBtn", root).onclick = () => openMapPicker({
        start: form.lat.value ? { lat: +form.lat.value, lng: +form.lng.value, label: form.area.value } : null,
        title: "Where is the restaurant?", cta: "Use this spot",
        onPick: (p) => {
          form.lat.value = p.lat; form.lng.value = p.lng;
          if (!form.area.value.trim() && p.label) form.area.value = p.label.split(",").slice(-2).join(",").trim();
          $("#coords", root).textContent = `${p.lat}, ${p.lng}`; $("#pinBtn", root).textContent = "Move pin";
          checkField(form.lat); checkField(form.lng); if (form.area.value) checkField(form.area); preview();
          toast("Restaurant pinned", "pin");
        },
      });
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!validateForm(form, extra)) return toast("Check the highlighted fields", "alert");
        const v = values();
        try {
          if (isNew) {
            v.id = newId;
            await appendRow("restaurants", v);
            toast(`${v.name} added. Now add its menu.`, "store");
            location.hash = "#/admin/restaurants/" + v.id;
          } else {
            const { id: _, ...changes } = v;
            await updateRow("restaurants", r.id, changes);
            toast("Changes saved");
            render();
          }
        } catch { toast("Couldn't save. Is server.py still running?", "alert"); }
      });
      preview();
      bindExports(root);
      if (isNew) return;

      $("#del", root).onclick = () => removeRestaurant(r.id, () => (location.hash = "#/admin/restaurants"));
      const dform = $("#dishForm", root);
      const dishPhoto = bindPhotoPicker(root, dform, "dimage", "menu", () => "dish-" + (dform.dishId.value || nextId(menuItems(), "", 0)), "");
      const resetDish = () => {
        dform.reset(); dform.dishId.value = ""; dishPhoto.set(""); delete dform.dataset.touched;
        $$(".field", dform).forEach((f) => f.classList.remove("has-error", "is-valid"));
        $("#dishTitle", root).textContent = "Add a dish";
        $("#dishSave", root).innerHTML = icon("plus", 16) + " Add dish";
        $("#dishCancel", root).hidden = true;
      };
      const drawDishes = () => {
        const list = menuItems().filter((m) => m.restaurant_id === r.id);
        $("#dishes", root).innerHTML = list.length ? list.map((m) => `<tr>
          ${td("Dish", `<div class="order-cell"><div class="thumb">${dishPic(m)}</div><div><b>${esc(m.name)}</b><br><span class="muted small">${esc(m.description)}</span></div></div>`, "wrap-cell")}
          ${td("Price", `<b>${peso(m.price)}</b>`)}
          ${td("Bestseller", `<label class="switch"><input type="checkbox" data-pop="${m.id}" ${m.popular === "yes" ? "checked" : ""} aria-label="Bestseller: ${esc(m.name)}"><span></span></label>`)}
          ${td("", `<button class="btn btn-ghost btn-sm" data-edit="${m.id}">${icon("pencil", 14)} Edit</button><button class="btn btn-danger btn-sm" data-deldish="${m.id}" aria-label="Delete ${esc(m.name)}">${icon("trash", 14)}</button>`, "act")}</tr>`).join("")
          : emptyRow(4, "utensils", "No dishes yet. Add the first one.");
        $$("[data-pop]", root).forEach((c) => c.onchange = async () => {
          try { await updateRow("menu", c.dataset.pop, { popular: c.checked ? "yes" : "no" }); toast(c.checked ? "Marked as bestseller" : "Bestseller tag removed", "star"); }
          catch { c.checked = !c.checked; toast("Couldn't save. Is server.py still running?", "alert"); }
        });
        $$("[data-edit]", root).forEach((b) => b.onclick = () => {
          const m = itemById(b.dataset.edit);
          resetDish();
          dform.dishId.value = m.id; dform.dname.value = m.name; dform.ddesc.value = m.description;
          dform.dprice.value = m.price; dishPhoto.set(m.image); dform.dpopular.checked = m.popular === "yes";
          $("#dishTitle", root).textContent = "Edit " + m.name;
          $("#dishSave", root).textContent = "Save dish";
          $("#dishCancel", root).hidden = false;
          dform.dname.focus();
        });
        $$("[data-deldish]", root).forEach((b) => b.onclick = async () => {
          const m = itemById(b.dataset.deldish);
          if (!await confirmBox({ ic: "trash", title: `Delete ${esc(m.name)}?`, text: "It disappears from the menu. Past orders keep their totals.", yes: "Delete dish", danger: true })) return;
          try { await deleteRow("menu", m.id); } catch { return toast("Couldn't delete. Is server.py still running?", "alert"); }
          if (dform.dishId.value === m.id) resetDish();
          toast(`${m.name} deleted`, "trash"); drawDishes();
        });
      };
      liveValidate(dform);
      $("#dishCancel", root).onclick = resetDish;
      dform.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!validateForm(dform)) return;
        const dish = { name: dform.dname.value.trim(), description: dform.ddesc.value.trim(), price: +dform.dprice.value, image: dform.dimage.value.trim(), popular: dform.dpopular.checked ? "yes" : "no" };
        try {
          if (dform.dishId.value) { await updateRow("menu", dform.dishId.value, dish); toast(`${dish.name} saved`); }
          else { await appendRow("menu", { id: nextId(menuItems(), "", 0), restaurant_id: r.id, ...dish }); toast(`${dish.name} added to the menu`, "utensils"); }
        } catch { return toast("Couldn't save. Is server.py still running?", "alert"); }
        resetDish(); drawDishes();
      });
      drawDishes();
    },
  };
}

/* ---------- riders & staff ---------- */
function pageAdminStaff(_, query) {
  let filter = query.get("f") || "all";
  let q = "";
  const FILTERS = [["all", "Everyone"], ["rider", "Riders"], ["office", "Office staff"], ["inactive", "Let go"]];
  const match = (s, f) => (f === "inactive" ? s.status === "inactive" : s.status !== "inactive" && (f === "all" || (f === "rider" ? s.role === "rider" : s.role !== "rider")));
  const working = riders().filter((r) => r.status === "active");
  const onTrip = working.filter((r) => busyRider(r.id));
  return {
    html: `<div class="wrap">
      ${adminHead("Riders & staff", "Ang MoBites team", "Hire people, set who's on duty, and see each rider's deliveries.",
        `<a class="btn btn-primary btn-sm" href="#/admin/staff/hire">${icon("plus", 16)} Hire someone</a>`)}
      <div class="stats" style="margin-bottom:20px">
        ${statCard("bike", "Riders on duty", working.length, `${riders().filter((r) => r.status !== "inactive").length} riders in total`)}
        ${statCard("checkCircle", "Free right now", working.length - onTrip.length, "Ready for the next order")}
        ${statCard("clock", "On a delivery", onTrip.length, "Carrying an order now")}
        ${statCard("users", "Office staff", staff().filter((s) => s.role !== "rider" && s.status !== "inactive").length, "Dispatch, support and ops")}
      </div>
      <section class="panel">
        <div class="toolbar">${searchBox("q", "Search name, phone or area")}</div>
        <div class="filters" id="filters"></div>
        ${tableShell("rows", ["Name", "Role", "Contact", "Vehicle", "Deliveries", "Status", ""])}
        <div style="margin-top:16px">${dbNote("staff")}</div>
      </section>
    </div>`,
    after(root) {
      const draw = () => {
        const term = q.trim().toLowerCase();
        const found = staff().filter((s) => !term || [s.name, s.phone, s.area, s.email, s.plate].some((x) => String(x).toLowerCase().includes(term)));
        $("#filters", root).innerHTML = FILTERS.map(([k, l]) => `<button class="chip ${k === filter ? "is-active" : ""}" data-f="${k}">${l} <span class="count">${found.filter((s) => match(s, k)).length}</span></button>`).join("");
        $$("[data-f]", root).forEach((b) => b.onclick = () => { filter = b.dataset.f; draw(); });
        const orders = rows("orders");
        const list = found.filter((s) => match(s, filter));
        $("#rows", root).innerHTML = list.length ? list.map((s) => {
          const trips = orders.filter((o) => o.rider === s.id && orderStatus(o) === "delivered").length;
          const busy = s.role === "rider" && busyRider(s.id);
          return `<tr>
            ${td("Name", person(s.name, `${esc(s.id)} · Hired ${fmtDate(s.hired)}`))}
            ${td("Role", esc(STAFF_ROLES[s.role] || s.role))}
            ${td("Contact", `${prettyPhone(s.phone)}<br><span class="muted small">${esc(s.area)}</span>`)}
            ${td("Vehicle", s.role === "rider" ? `${esc(VEHICLES[s.vehicle] || s.vehicle)}${s.plate ? `<br><span class="muted small">${esc(s.plate)}</span>` : ""}` : `<span class="muted small">Not a rider</span>`)}
            ${td("Deliveries", s.role === "rider" ? `<b>${trips}</b>${busy ? `<br><span class="small" style="color:var(--st-way)">On a delivery</span>` : ""}` : `<span class="muted small">-</span>`)}
            ${td("Status", s.status === "inactive" ? staffPill("inactive") : `<select class="mini-select st-${STAFF_STATUS[s.status]?.[1]}" data-st="${s.id}" aria-label="Status of ${esc(s.name)}">${["active", "off-duty", "on-leave"].map((k) => `<option value="${k}" ${k === s.status ? "selected" : ""}>${STAFF_STATUS[k][0]}</option>`).join("")}</select>`)}
            ${td("", s.status === "inactive" ? `<button class="btn btn-ghost btn-sm" data-rehire="${s.id}">${icon("repeat", 14)} Rehire</button>` : `<button class="btn btn-danger btn-sm" data-letgo="${s.id}">Let go</button>`, "act")}</tr>`;
        }).join("") : emptyRow(7, "users", term ? `No one matches "${esc(q)}".` : "No one here.");
        const save = async (s, status, msg) => {
          try { await updateRow("staff", s.id, { status }); } catch { toast("Couldn't save. Is server.py still running?", "alert"); return draw(); }
          toast(msg, "badge"); draw();
        };
        $$("[data-st]", root).forEach((sel) => sel.onchange = () => {
          const s = staffById(sel.dataset.st);
          if (sel.value !== "active" && busyRider(s.id)) { sel.value = s.status; return toast(`${firstName(s.name)} is on a delivery. Wait until it's done.`, "alert"); }
          save(s, sel.value, `${s.name} is now ${STAFF_STATUS[sel.value][0].toLowerCase()}`);
        });
        $$("[data-letgo]", root).forEach((b) => b.onclick = async () => {
          const s = staffById(b.dataset.letgo);
          if (busyRider(s.id)) return toast(`${firstName(s.name)} is on a delivery. Wait until it's done.`, "alert");
          if (!await confirmBox({ title: `Let ${esc(s.name)} go?`, text: `${esc(STAFF_ROLES[s.role])} since ${fmtDate(s.hired)}. They'll be removed from rider lists, but their past deliveries stay on record.`, yes: "Yes, let go", danger: true })) return;
          save(s, "inactive", `${s.name} has been let go`);
        });
        $$("[data-rehire]", root).forEach((b) => b.onclick = async () => {
          const s = staffById(b.dataset.rehire);
          if (!await confirmBox({ ic: "badge", title: `Rehire ${esc(s.name)}?`, text: `They'll be back as an active ${esc(STAFF_ROLES[s.role]).toLowerCase()}.`, yes: "Rehire" })) return;
          save(s, "active", `Welcome back, ${firstName(s.name)}!`);
        });
      };
      $("#q", root).addEventListener("input", (e) => { q = e.target.value; draw(); });
      bindExports(root);
      draw();
    },
  };
}

function pageAdminHire() {
  return {
    html: `<div class="wrap">
      <div class="crumbs"><a href="#/admin/staff">Riders & staff</a> / Hire</div>
      ${adminHead("Hire", "Welcome someone to the team", "Riders need a vehicle. Motorcycles and cars need a plate number.")}
      <section class="panel" style="max-width:760px">
        <form class="form" id="form" novalidate>
          <fieldset class="role-pick"><legend>Role</legend>
            ${Object.entries(STAFF_ROLES).map(([k, l], i) => `<label class="role-opt"><input type="radio" name="role" value="${k}" ${i === 0 ? "checked" : ""}><span>${icon(k === "rider" ? "bike" : k === "dispatcher" ? "pin" : k === "support" ? "phone" : "chart", 22)}<b>${l}</b></span></label>`).join("")}
          </fieldset>
          <div class="row-2">
            ${field({ id: "name", label: "Full name", ph: "Juan Dela Cruz", rules: "required name", attrs: 'autocomplete="off"' })}
            ${field({ id: "email", label: "Email", type: "email", ph: "juan@mobites.ph", rules: "required email", attrs: 'autocomplete="off"' })}
          </div>
          <div class="row-2">
            ${phoneField("phone", "Mobile number")}
            ${selectField({ id: "area", label: "Home base", options: Object.fromEntries(AREAS.map((a) => [a, a])), blank: "Choose a city", rules: "required" })}
          </div>
          <div class="row-2" id="vehicleRow">
            ${selectField({ id: "vehicle", label: "Vehicle", options: VEHICLES, value: "motorcycle" })}
            <div id="plateWrap">${field({ id: "plate", label: "Plate number", ph: "NAB 1234", rules: "required plate", attrs: 'maxlength="9" style="text-transform:uppercase"' })}</div>
          </div>
          ${field({ id: "hired", label: "Start date", type: "date", value: ymd(new Date()), rules: "required startDate" })}
          <div class="check field"><input type="checkbox" id="docs" name="docs" data-rules="checked"><label for="docs" style="font-weight:600" id="docsLabel"></label><span class="err" style="flex-basis:100%"></span></div>
          <div class="form-actions"><button class="btn btn-primary">${icon("badge", 16)} Hire</button><a class="btn btn-ghost" href="#/admin/staff">Cancel</a></div>
        </form>
      </section>
    </div>`,
    after(root) {
      const form = $("#form", root);
      const role = () => form.role.value;
      const sync = () => {
        $("#vehicleRow", root).hidden = role() !== "rider";
        $("#plateWrap", root).hidden = role() !== "rider" || form.vehicle.value === "bicycle";
        $("#docsLabel", root).textContent = role() === "rider" ? "I checked their valid ID, NBI clearance, and driver's license (OR/CR for the vehicle)." : "I checked their valid ID and NBI clearance.";
      };
      $$("input[name=role]", form).forEach((x) => x.onchange = sync);
      form.vehicle.onchange = sync;
      form.plate.addEventListener("input", () => (form.plate.value = form.plate.value.toUpperCase()));
      maskPhone(form.phone);
      const extra = {
        email: (el) => !staff().some((s) => s.email.toLowerCase() === el.value.trim().toLowerCase()) || "Someone on the team already uses this email.",
        phone: (el) => !staff().some((s) => s.phone === normalizePhone(el.value)) || "Someone on the team already uses this number.",
      };
      liveValidate(form, extra);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!validateForm(form, extra)) return toast("Check the highlighted fields", "alert");
        const rider = role() === "rider";
        const s = { id: nextId(staff(), "S", 2), name: form.name.value.trim(), role: role(), phone: normalizePhone(form.phone.value), email: form.email.value.trim().toLowerCase(),
          area: form.area.value, vehicle: rider ? form.vehicle.value : "", plate: rider && form.vehicle.value !== "bicycle" ? form.plate.value.trim().toUpperCase().replace(/\s+/, " ") : "",
          status: "active", hired: form.hired.value, password_sha256: "" };
        const temp = rider ? "Rider#" + makePin() : "";
        if (!await confirmBox({ ic: "badge", title: `Hire ${esc(s.name)}?`, yes: "Yes, hire", no: "Not yet",
          text: `${STAFF_ROLES[s.role]} · ${esc(s.area)}${rider ? ` · ${VEHICLES[s.vehicle]}${s.plate ? " " + esc(s.plate) : ""}` : ""}<br>Starts ${fmtDate(s.hired)}` })) return;
        if (temp) s.password_sha256 = await sha256(temp);
        try { await appendRow("staff", s); } catch { return toast("Couldn't save. Is server.py still running?", "alert"); }
        sess.del(draftKey(form));
        const done = () => (location.hash = "#/admin/staff?f=" + (rider ? "rider" : "office"));
        if (!temp) { toast(`Welcome to the team, ${firstName(s.name)}!`, "badge"); return done(); }
        const real = await sendMail({ to: s.email, name: s.name, subject: "Welcome to MoBites! Your rider login",
          message: `Hi ${firstName(s.name)},\n\nWelcome to the MoBites rider team! Log in to the rider app at ${location.origin + location.pathname}#/rider\n\nEmail: ${s.email}\nTemporary password: ${temp}\n\nIngat sa daan!\nMoBites Operations` });
        modal(`<div class="ring">${icon("badge", 28)}</div><h2 style="font-size:24px">${esc(firstName(s.name))} is hired!</h2>
          <p class="muted">${real ? "We emailed their rider login." : "Their rider login went to the demo inbox."} Give them this temporary password too:</p>
          <div class="code-pill big">${esc(temp)}</div>
          <p class="small muted">They log in at <b>#/rider</b> with ${esc(s.email)}.</p>
          <div class="actions"><button class="btn btn-primary" data-close>Done</button></div>`, "", done);
      });
      sync();
    },
  };
}

/* ---------- customers ---------- */
function pageAdminCustomers() {
  let q = "";
  const users = rows("users");
  const orders = allOrders();
  const spentBy = (u) => orders.filter((o) => o.email.toLowerCase() === u.email.toLowerCase() && o.st !== "cancelled").reduce((s, o) => s + Number(o.total), 0);
  const year = String(new Date().getFullYear());
  const totalSpent = users.reduce((s, u) => s + spentBy(u), 0);
  return {
    html: `<div class="wrap">
      ${adminHead("Customers", "Mga suki ng MoBites", "Everyone who signed up. Passwords are never shown.")}
      <div class="stats" style="margin-bottom:20px">
        ${statCard("users", "Customers", users.length)}
        ${statCard("sparkle", `Joined in ${year}`, users.filter((u) => String(u.since) === year).length)}
        ${statCard("wallet", "Average spent", peso(users.length ? Math.round(totalSpent / users.length) : 0), "Per customer, all time")}
        ${statCard("gift", "Points to redeem", users.reduce((s, u) => s + (Number(u.points) || 0), 0).toLocaleString())}
      </div>
      <section class="panel">
        <div class="toolbar">${searchBox("q", "Search name, email, phone or address")}</div>
        ${tableShell("rows", ["Customer", "Phone", "Address", "Orders", "Spent", "Points", ""])}
      </section>
    </div>`,
    after(root) {
      const draw = () => {
        const term = q.trim().toLowerCase();
        const list = users.filter((u) => !term || [u.name, u.email, u.phone, u.address].some((x) => String(x).toLowerCase().includes(term)));
        $("#rows", root).innerHTML = list.length ? list.map((u) => `<tr>
          ${td("Customer", person(u.name, `${esc(u.email)} · since ${esc(u.since)}`))}
          ${td("Phone", prettyPhone(u.phone))}
          ${td("Address", esc(u.address || "-"), "wrap-cell")}
          ${td("Orders", `<b>${orders.filter((o) => o.email.toLowerCase() === u.email.toLowerCase()).length}</b>`)}
          ${td("Spent", peso(spentBy(u)))}
          ${td("Points", (Number(u.points) || 0).toLocaleString())}
          ${td("", `<a class="btn btn-ghost btn-sm" href="#/admin/orders?q=${encodeURIComponent(u.email)}">${icon("receipt", 14)} Orders</a>`, "act")}</tr>`).join("")
          : emptyRow(7, "users", `No customers match "${esc(q)}".`);
      };
      $("#q", root).addEventListener("input", (e) => { q = e.target.value; draw(); });
      draw();
    },
  };
}

/* ---------- categories ---------- */
function pageAdminCategories() {
  return {
    html: `<div class="wrap">
      ${adminHead("Categories", "Food categories", "The tiles customers tap on the home and Explore pages.")}
      <div class="admin-split">
        <section class="panel"><h3>All categories</h3><div class="cat-admin" id="cats"></div></section>
        <section class="panel"><h3>Add a category</h3>
          <form class="form" id="form" novalidate>
            ${field({ id: "label", label: "Name", ph: "e.g. Seafood", rules: "required label", attrs: 'maxlength="20"', hint: 'ID: <b id="slug">-</b>' })}
            <fieldset class="icon-pick"><legend>Icon</legend>
              ${CATEGORY_ICONS.map((ic, i) => `<label title="${ic}"><input type="radio" name="icon" value="${ic}" ${i === 0 ? "checked" : ""}><span>${icon(ic, 24)}</span></label>`).join("")}
            </fieldset>
            <button class="btn btn-primary">${icon("plus", 16)} Add category</button>
          </form>
          <div style="margin-top:16px">${dbNote("categories")}</div>
        </section>
      </div>
    </div>`,
    after(root) {
      const form = $("#form", root);
      const draw = () => {
        $("#cats", root).innerHTML = categories().map((c) => {
          const used = restaurants().filter((r) => r.category === c.id).length;
          return `<div class="cat-row"><span class="bubble">${icon(c.icon, 24)}</span><div class="grow"><b>${esc(c.label)}</b><br><span class="muted small">${esc(c.id)} · ${used} restaurant${used === 1 ? "" : "s"}</span></div>
            <button class="btn btn-danger btn-sm" data-del="${esc(c.id)}" ${used ? `disabled title="Move its restaurants to another category first"` : ""} aria-label="Delete ${esc(c.label)}">${icon("trash", 14)}</button></div>`;
        }).join("");
        $$("[data-del]", root).forEach((b) => b.onclick = async () => {
          const c = categoryById(b.dataset.del);
          if (!await confirmBox({ ic: "trash", title: `Delete ${esc(c.label)}?`, text: "It disappears from the category tiles.", yes: "Delete", danger: true })) return;
          try { await deleteRow("categories", c.id); } catch { return toast("Couldn't delete. Is server.py still running?", "alert"); }
          toast(`${c.label} deleted`, "trash"); draw();
        });
      };
      const extra = { label: (el) => (slug(el.value) && !categories().some((c) => c.id === slug(el.value))) || "That category already exists." };
      form.label.addEventListener("input", () => ($("#slug", root).textContent = slug(form.label.value) || "-"));
      liveValidate(form, extra);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!validateForm(form, extra)) return;
        const c = { id: slug(form.label.value), label: form.label.value.trim(), icon: form.icon.value };
        try { await appendRow("categories", c); } catch { return toast("Couldn't save. Is server.py still running?", "alert"); }
        toast(`${c.label} added`, "tag");
        form.reset(); delete form.dataset.touched; $("#slug", root).textContent = "-";
        $$(".field", form).forEach((f) => f.classList.remove("has-error", "is-valid"));
        draw();
      });
      bindExports(root);
      draw();
    },
  };
}

/* ---------- live order monitor ---------- */
function beep() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)();
    const o = a.createOscillator(), g = a.createGain();
    o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.2);
  } catch { /* no sound available */ }
}
function pageAdminLive() {
  let known = null;
  const fresh = new Map();   // order id -> time it first showed up
  return {
    html: `<div class="wrap">
      ${adminHead("Live orders", "Order monitor", "Updates every few seconds. New orders flash yellow, and late ones turn red.",
        `<label class="check" style="align-items:center"><input type="checkbox" id="sound" ${store.get("admin_sound", true) ? "checked" : ""}> ${icon("sparkle", 16)} Sound for new orders</label>`)}
      <div class="live-bar" id="liveBar"></div>
      <div class="kanban" id="board"></div>
    </div>`,
    after(root) {
      $("#sound", root).onchange = (e) => store.set("admin_sound", e.target.checked);
      const COLS = [["pending", "New"], ["preparing", "Preparing"], ["on-the-way", "On the way"], ["delivered", "Delivered today"]];
      const draw = () => {
        const today = ymd(new Date());
        const list = allOrders().filter((o) => ACTIVE.includes(o.st) || (o.st === "delivered" && o.date === today));
        const ids = new Set(list.filter((o) => o.st === "pending").map((o) => o.id));
        if (known) {
          const added = [...ids].filter((x) => !known.has(x));
          added.forEach((x) => fresh.set(x, Date.now()));
          if (added.length) { toast(`New order${added.length > 1 ? "s" : ""}: ${added.join(", ")}`, "receipt"); if ($("#sound", root).checked) beep(); }
        }
        known = new Set([...(known || []), ...ids]);
        const mins = (o) => (o.placed_at ? Math.floor((Date.now() - o.placed_at) / 60000) : null);
        const late = (o) => ACTIVE.includes(o.st) && mins(o) !== null && mins(o) >= 40;
        const noRider = list.filter((o) => ACTIVE.includes(o.st) && !o.rider).length;
        $("#liveBar", root).innerHTML = `<span>${icon("receipt", 16)} <b>${list.filter((o) => ACTIVE.includes(o.st)).length}</b> active</span>
          <span class="${noRider ? "text-alert" : ""}">${icon("bike", 16)} <b>${noRider}</b> without a rider</span>
          <span class="${list.some(late) ? "text-alert" : ""}">${icon("clock", 16)} <b>${list.filter(late).length}</b> late (40+ min)</span>
          <span class="muted small">Last update ${fmtTime(Date.now())}</span>`;
        $("#board", root).innerHTML = COLS.map(([k, label]) => {
          const col = list.filter((o) => o.st === k);
          return `<section class="k-col k-${k}"><h3>${statusPill(k).replace(STATUSES[k], label)} <span class="count">${col.length}</span></h3>
            ${col.map((o) => {
              const r = restaurantById(o.restaurant_id), rider = staffById(o.rider), m = mins(o);
              return `<button type="button" class="k-card ${late(o) ? "is-late" : ""} ${fresh.has(o.id) && Date.now() - fresh.get(o.id) < 15000 ? "is-new" : ""}" data-view="${esc(o.id)}">
                <span class="k-top"><b>${esc(o.id)}</b><span class="small muted">${m !== null ? (m < 1 ? "just now" : m + " min") : fmtDate(o.date)}</span></span>
                <span class="small">${esc(r?.name || "Removed restaurant")} → ${esc(userByEmail(o.email)?.name || o.email)}</span>
                <span class="small ${o.rider || k === "delivered" ? "muted" : "text-alert"}">${icon("bike", 13)} ${rider ? esc(rider.name) : "No rider yet"}</span>
                <span class="k-foot"><b>${peso(o.total)}</b><span class="small muted">${esc(payLabel(o.payment))}</span>${o.note ? `<span class="small ${/allerg/i.test(o.note) ? "text-alert" : "muted"}" title="${esc(o.note)}">${icon(/allerg/i.test(o.note) ? "alert" : "file", 13)}</span>` : ""}${rows("messages").some((x) => x.order_id === o.id) ? `<span class="small muted" title="Has chat messages">${icon("chat", 13)}</span>` : ""}</span>
              </button>`;
            }).join("") || `<p class="small muted k-empty">None</p>`}</section>`;
        }).join("");
        $$("[data-view]", root).forEach((b) => b.onclick = () => orderModal(allOrders().find((o) => o.id === b.dataset.view), draw));
      };
      draw();
      everyFew(4000, ["orders", "messages", "staff"], () => { if ($("#modal").hidden) draw(); });
    },
  };
}

/* ---------- feedback inbox ---------- */
function pageAdminFeedback() {
  let filter = "all";
  return {
    html: `<div class="wrap">
      ${adminHead("Feedback", "What customers are saying", "From the Feedback page. Mark each one as read once the team has seen it.")}
      <div class="stats" id="fbStats" style="margin-bottom:20px"></div>
      <section class="panel"><div class="filters" id="filters"></div><div id="list"></div><div style="margin-top:16px">${dbNote("feedback")}</div></section>
    </div>`,
    after(root) {
      const draw = () => {
        const all = rows("feedback").sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));
        const avg = all.length ? all.reduce((s, f) => s + Number(f.rating), 0) / all.length : 0;
        $("#fbStats", root).innerHTML = statCard("star", "Average rating", avg ? avg.toFixed(1) + " / 5" : "-", `${all.length} messages`) + statCard("mail", "Unread", all.filter((f) => f.status === "new").length)
          + statCard("checkCircle", "4–5 stars", all.filter((f) => f.rating >= 4).length) + statCard("alert", "1–2 stars", all.filter((f) => f.rating <= 2).length, "Follow these up");
        const F = [["all", "All"], ["new", "Unread"], ...Object.entries(FEEDBACK_TOPICS)];
        $("#filters", root).innerHTML = F.map(([k, l]) => `<button class="chip ${k === filter ? "is-active" : ""}" data-f="${k}">${l}</button>`).join("");
        $$("[data-f]", root).forEach((b) => b.onclick = () => { filter = b.dataset.f; draw(); });
        const list = all.filter((f) => filter === "all" || (filter === "new" ? f.status === "new" : f.topic === filter));
        $("#list", root).innerHTML = list.length ? list.map((f) => `<article class="fb-item ${f.status === "new" ? "is-new" : ""}">
            <div class="fb-top"><span class="fb-stars" aria-label="${f.rating} out of 5 stars">${[1, 2, 3, 4, 5].map((n) => `<span class="${n <= f.rating ? "on" : ""}">${icon("star", 16)}</span>`).join("")}</span>
              <span class="badge">${esc(FEEDBACK_TOPICS[f.topic] || f.topic)}</span>${f.status === "new" ? `<span class="status status--pending">New</span>` : ""}<span class="small muted" style="margin-left:auto">${fmtDate(f.date)}</span></div>
            <p>${esc(f.message)}</p>
            <div class="fb-foot small muted">${esc(userByEmail(f.email)?.name || f.email)}${f.order_id ? ` · <a href="#/admin/orders?q=${esc(f.order_id)}">${esc(f.order_id)}</a>` : ""}
              ${f.status === "new" ? `<button class="btn btn-ghost btn-sm" data-read="${esc(f.id)}">${icon("check", 14)} Mark as read</button>` : ""}</div></article>`).join("")
          : `<div class="empty">${icon("chat", 34)}<p>No feedback here.</p></div>`;
        $$("[data-read]", root).forEach((b) => b.onclick = async () => {
          try { await updateRow("feedback", b.dataset.read, { status: "read" }); } catch { return toast("Couldn't save. Is server.py still running?", "alert"); }
          toast("Marked as read", "check"); draw();
        });
      };
      bindExports(root);
      draw();
    },
  };
}

ROUTES.push(
  { re: /^admin\/login$/, page: pageAdminLogin, adminGuest: true, title: "Admin log in" },
  { re: /^admin$/, page: pageAdminHome, admin: true, title: "Admin dashboard" },
  { re: /^admin\/orders$/, page: pageAdminOrders, admin: true, title: "Admin · Orders" },
  { re: /^admin\/orders\/new$/, page: () => pageAdminNewOrder(), admin: true, title: "Admin · New order" },
  { re: /^admin\/orders\/(MB-[\w-]+)\/edit$/, page: pageAdminNewOrder, admin: true, title: "Admin · Edit order" },
  { re: /^admin\/live$/, page: pageAdminLive, admin: true, title: "Admin · Live orders" },
  { re: /^admin\/feedback$/, page: pageAdminFeedback, admin: true, title: "Admin · Feedback" },
  { re: /^admin\/restaurants$/, page: pageAdminRestaurants, admin: true, title: "Admin · Restaurants" },
  { re: /^admin\/restaurants\/([\w-]+)$/, page: pageAdminRestaurant, admin: true, title: "Admin · Restaurant" },
  { re: /^admin\/staff$/, page: pageAdminStaff, admin: true, title: "Admin · Riders & staff" },
  { re: /^admin\/staff\/hire$/, page: pageAdminHire, admin: true, title: "Admin · Hire" },
  { re: /^admin\/customers$/, page: pageAdminCustomers, admin: true, title: "Admin · Customers" },
  { re: /^admin\/categories$/, page: pageAdminCategories, admin: true, title: "Admin · Categories" },
);
