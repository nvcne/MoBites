/* Rider app (#/rider): riders from data/staff.txt log in, go online, accept orders,
   confirm pick-up, finish the delivery with the customer's 4-digit PIN, and chat with the customer.
   The chat box is shared with the customer's order tracking page. */

/* ---------- chat between rider and customer (data/messages.txt) ---------- */
const QUICK_REPLIES = {
  customer: ["Nasaan ka na po?", "Pakiiwan sa guard", "Sige po, salamat!"],
  rider: ["Papunta na po ako", "Nandito na po ako sa labas", "Saan po kayo banda?"],
};
function mountChat(el, orderId, me, title) {
  el.innerHTML = `<h3>${icon("chat", 20)} ${esc(title)}</h3>
    <div class="chat-log" aria-live="polite"></div>
    <form class="chat-form" novalidate>
      <div class="chips chat-quick" style="padding:0">${QUICK_REPLIES[me].map((q) => `<button type="button" class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
      <div class="chat-row"><input name="msg" maxlength="300" placeholder="Type a message" aria-label="Message" autocomplete="off" data-nodraft><button class="btn btn-primary btn-sm">Send</button></div>
    </form>
    <p class="small muted chat-closed" hidden>Chat is closed for this order.</p>`;
  const log = $(".chat-log", el), form = $(".chat-form", el);
  let count = -1;
  const draw = () => {
    const list = rows("messages").filter((m) => m.order_id === orderId).sort((a, b) => a.sent_at - b.sent_at);
    if (list.length === count) return;
    if (count >= 0 && list.length > count && list[list.length - 1].sender !== me) toast(me === "rider" ? "New message from the customer" : "New message from your rider", "chat");
    count = list.length;
    log.innerHTML = list.length ? list.map((m) => `<div class="msg ${m.sender === me ? "me" : ""}"><span>${esc(m.text)}</span><small>${m.sender === me ? "You" : m.sender === "rider" ? "Rider" : "Customer"} · ${fmtTime(m.sent_at)}</small></div>`).join("")
      : `<p class="small muted">No messages yet. Say hi!</p>`;
    log.scrollTop = log.scrollHeight;
  };
  const send = async (text) => {
    text = text.trim();
    if (!text) return;
    try { await appendRow("messages", { id: "M" + Date.now(), order_id: orderId, sender: me, text, sent_at: Date.now() }); }
    catch { return toast("Message not sent. Is server.py still running?", "alert"); }
    form.msg.value = "";
    draw();
  };
  form.onsubmit = (e) => { e.preventDefault(); send(form.msg.value); };
  $$("[data-q]", el).forEach((b) => b.onclick = () => send(b.dataset.q));
  draw();
  everyFew(2500, ["messages"], draw);
  return { setOpen(open) { form.hidden = !open; $(".chat-closed", el).hidden = open; } };
}

/* ---------- rider session ---------- */
function currentRider() {
  const email = store.get("rider");
  return email ? rows("staff").find((s) => s.email.toLowerCase() === email.toLowerCase() && s.role === "rider" && s.status !== "inactive") || null : null;
}
const riderJobs = (r) => rows("orders").filter((o) => o.rider === r.id);
const activeJob = (r) => riderJobs(r).find((o) => ["pending", "preparing", "on-the-way"].includes(orderStatus(o)));
const customerOf = (o) => rows("users").find((u) => u.email.toLowerCase() === String(o.email).toLowerCase());
const osmLink = (q) => `https://www.openstreetmap.org/search?query=${encodeURIComponent(q)}`;

function renderRiderChrome(path) {
  const me = currentRider();
  $("#topbar").innerHTML = `<div class="wrap">
    <a class="brand" href="#/rider" aria-label="MoBites rider home">${icon("bike", 28)}MoBites<span class="admin-tag">Rider</span></a>
    <div class="top-actions">
      ${me ? `<span class="pov is-admin">${icon("bike", 14)} Rider view</span>` : ""}
      <a class="btn btn-ghost btn-sm" href="#/explore" title="Open the customer site">${icon("home", 16)}<span class="hide-sm">Customer site</span></a>
      ${me ? `<span class="avatar" title="${esc(me.name)}">${initials(me.name)}</span><button class="icon-btn" id="riderOut" aria-label="Log out of the rider app" title="Log out">${icon("logout", 18)}</button>` : ""}
    </div></div>`;
  $("#bottombar").innerHTML = "";
  $("#footer").innerHTML = `<div class="wrap"><span><strong>MoBites Rider</strong> · Ingat sa daan!</span>
    <nav aria-label="Footer"><a href="#/explore">Customer site</a><a href="#/privacy">Privacy Policy</a><a href="#/terms">Terms of Service</a></nav><span>© 2026 MoBites</span></div>`;
  const out = $("#riderOut");
  if (out) out.onclick = async () => {
    const job = activeJob(me);
    if (!await confirmBox({ ic: "logout", title: "Log out of the rider app?", yes: "Log out", danger: true,
      text: job ? `You still have order <b>${esc(job.id)}</b>. It stays assigned to you, so finish it after you log back in.` : "You'll be set offline so no new orders come your way." })) return;
    if (!job) await updateRow("staff", me.id, { status: "off-duty" }).catch(() => {});
    store.del("rider"); toast("Logged out. Ingat!", "logout"); location.hash = "#/rider/login";
  };
}

function pageRiderLogin(_, query) {
  const next = query.get("next") || "rider";
  return {
    html: `<div class="wrap auth">
      <div class="auth-story">
        <span class="eyebrow">${icon("bike", 16)} MoBites Rider</span>
        <h1>Tara, byahe na!</h1>
        <p class="muted" style="margin-top:10px;font-size:18px">Accept orders near you, pick up, and deliver. Chat with customers right in the app.</p>
        <ul>
          <li>${icon("power", 18)} Go online when you're ready to work</li>
          <li>${icon("store", 18)} Confirm every pick-up item by item</li>
          <li>${icon("key", 18)} Finish with the customer's 4-digit PIN</li>
          <li>${icon("chat", 18)} Message or call the customer</li>
        </ul>
      </div>
      <div class="panel" style="padding:28px">
        <h2 style="font-size:24px;margin-bottom:18px">Rider log in</h2>
        <form class="form" id="form" novalidate>
          <div class="form-alert" id="alert">${icon("alert", 18)}<span></span></div>
          ${field({ id: "email", label: "Work email", type: "email", ph: "name@mobites.ph", rules: "required email", attrs: 'autocomplete="username"' })}
          ${field({ id: "password", label: "Password", type: "password", ph: "Your password", rules: "required", password: true, attrs: 'autocomplete="current-password"' })}
          <button class="btn btn-primary btn-block">Start riding ${icon("arrowRight", 16)}</button>
          <p class="small muted" style="text-align:center">New rider? Your temporary password was emailed to you when you were hired.</p>
        </form>
      </div>
    </div>`,
    after(root) {
      const form = $("#form", root), alertBox = $("#alert", root);
      const showAlert = (m) => { alertBox.querySelector("span").textContent = m; alertBox.classList.add("show"); };
      bindPasswordToggles(root);
      liveValidate(form);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        alertBox.classList.remove("show");
        if (!validateForm(form)) return;
        const email = form.email.value.trim().toLowerCase();
        const key = "rider:" + email;
        const wait = loginGuard.locked(key);
        if (wait) return showAlert(`Too many wrong tries. Try again in ${wait} seconds.`);
        const s = rows("staff").find((x) => x.email.toLowerCase() === email);
        if (!s || s.password_sha256 !== await sha256(form.password.value)) { showAlert(loginGuard.message(loginGuard.fail(key))); form.password.value = ""; return; }
        if (s.role !== "rider") return showAlert("This app is for riders. Office staff use the admin page.");
        if (s.status === "inactive") return showAlert("This rider account is no longer active. Contact operations.");
        loginGuard.ok(key);
        store.set("rider", s.email);
        toast(`Hi ${firstName(s.name)}! You're in Rider view.`, "bike");
        location.hash = "#/" + next;
      });
    },
  };
}

/* ---------- rider home ---------- */
function pageRiderHome() {
  const me0 = currentRider();
  return {
    html: `<div class="wrap">
      <div class="admin-head"><div><span class="eyebrow">${new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" })}</span><h1>Hi, ${esc(firstName(me0.name))}!</h1><p class="muted">${esc(me0.area)} · ${esc(VEHICLE_LABELS[me0.vehicle] || "Rider")}${me0.plate ? " · " + esc(me0.plate) : ""}</p></div></div>
      <section class="online-card" id="online"></section>
      <div class="stats" id="stats" style="margin:20px 0"></div>
      <section class="panel" id="current" style="margin-bottom:20px"></section>
      <section class="panel" style="margin-bottom:20px"><div class="section-head" style="margin-bottom:6px"><h3 style="margin:0">New orders</h3><span class="small muted">Updates every few seconds</span></div><div id="avail"></div></section>
      <section class="panel"><h3>Recent deliveries</h3><div id="recent"></div></section>
    </div>`,
    after(root) {
      const draw = () => {
        const me = currentRider();
        if (!me) return render();
        const online = me.status === "active";
        const job = activeJob(me);
        const today = ymd(new Date());
        const done = riderJobs(me).filter((o) => orderStatus(o) === "delivered");
        const doneToday = done.filter((o) => o.date === today);
        const fee = (o) => Number(restaurantById(o.restaurant_id)?.fee || 0);
        $("#online", root).innerHTML = `<div class="grow"><b>${online ? "You're online" : me.status === "on-leave" ? "You're on leave" : "You're offline"}</b><br><span class="small">${online ? (job ? "Finish your current order first." : "New orders near you will show below.") : me.status === "on-leave" ? "Operations set you on leave. Contact them to come back." : "Go online to start getting orders."}</span></div>
          ${me.status === "on-leave" ? "" : `<label class="switch big"><input type="checkbox" id="onlineSw" ${online ? "checked" : ""} aria-label="Online"><span></span></label>`}`;
        $("#online", root).classList.toggle("is-on", online);
        const sw = $("#onlineSw", root);
        if (sw) sw.onchange = async () => {
          if (!sw.checked && job) { sw.checked = true; return toast("Finish your current order before going offline.", "alert"); }
          try { await updateRow("staff", me.id, { status: sw.checked ? "active" : "off-duty" }); } catch { sw.checked = !sw.checked; return toast("Couldn't save. Is server.py still running?", "alert"); }
          toast(sw.checked ? "You're online. Ingat!" : "You're offline. Pahinga muna!", "power"); draw();
        };
        $("#stats", root).innerHTML = statCard("checkCircle", "Deliveries today", doneToday.length) + statCard("wallet", "Earned today", peso(doneToday.reduce((s, o) => s + fee(o), 0)), "Delivery fees")
          + statCard("bike", "All deliveries", done.length) + statCard("chat", "Unread", rows("messages").filter((m) => m.sender === "customer" && job && m.order_id === job.id && m.sent_at > (store.get("seen_" + job?.id, 0))).length, "From your customer");
        $("#current", root).innerHTML = job ? `<div class="section-head" style="margin-bottom:8px"><h3 style="margin:0">Current order</h3>${statusPill(orderStatus(job))}</div>
            <a class="job-card is-mine" href="#/rider/o/${esc(job.id)}"><div class="grow"><b>${esc(job.id)} · ${esc(restaurantById(job.restaurant_id)?.name || "Restaurant")}</b><br><span class="small muted">${icon("pin", 14)} ${esc(job.address)}</span></div><span class="btn btn-primary btn-sm">Open ${icon("arrowRight", 14)}</span></a>`
          : `<h3>Current order</h3><p class="muted small">${online ? "None yet. Accept one below." : "Go online to accept orders."}</p>`;
        const avail = rows("orders").filter((o) => !o.rider && ["pending", "preparing"].includes(orderStatus(o)))
          .sort((a, b) => (restaurantById(b.restaurant_id)?.area.includes(me.area) ? 1 : 0) - (restaurantById(a.restaurant_id)?.area.includes(me.area) ? 1 : 0));
        $("#avail", root).innerHTML = avail.length ? avail.map((o) => {
          const r = restaurantById(o.restaurant_id) || { name: "Restaurant", area: "", fee: 0 };
          return `<div class="job-card"><div class="grow"><b>${esc(o.id)} · ${esc(r.name)}</b>${r.area.includes(me.area) ? ` <span class="badge">Near you</span>` : ""}<br>
            <span class="small muted">${icon("store", 14)} ${esc(r.area)} → ${icon("pin", 14)} ${esc(o.address)}</span><br>
            <span class="small">${parseItems(o.items).reduce((s, [, q]) => s + q, 0)} items · Earn ${peso(r.fee)} · ${o.payment === "cod" ? `<b>Collect ${peso(o.total)} cash</b>` : "Paid online"}${o.note ? ` · ${icon("file", 13)} Has a note` : ""}</span></div>
            <button class="btn btn-primary btn-sm" data-accept="${esc(o.id)}" ${!online || job ? "disabled" : ""}>Accept</button></div>`;
        }).join("") : `<div class="empty" style="padding:24px">${icon("bike", 34)}<p>No new orders right now. Hang tight!</p></div>`;
        $$("[data-accept]", root).forEach((b) => b.onclick = async () => {
          const o = rows("orders").find((x) => x.id === b.dataset.accept);
          const r = restaurantById(o.restaurant_id);
          if (!await confirmBox({ ic: "bike", title: `Accept ${esc(o.id)}?`, yes: "Accept order",
            text: `Pick up at <b>${esc(r?.name)}</b> (${esc(r?.area)})<br>Deliver to ${esc(o.address)}<br>${o.payment === "cod" ? `Collect <b>${peso(o.total)}</b> cash` : "Already paid online"} · You earn ${peso(r?.fee || 0)}` })) return;
          await refreshTables(["orders"]);
          const fresh = rows("orders").find((x) => x.id === o.id);
          if (fresh.rider || !["pending", "preparing"].includes(orderStatus(fresh))) { toast("Another rider got this order first.", "alert"); return draw(); }
          try { await updateRow("orders", o.id, { rider: me.id, status: "preparing", placed_at: "" }); }   // the rider now moves the status, not the demo clock
          catch { return toast("Couldn't accept. Is server.py still running?", "alert"); }
          toast(`Order ${o.id} is yours. Head to ${r?.name}!`, "bike");
          location.hash = "#/rider/o/" + o.id;
        });
        $("#recent", root).innerHTML = done.length ? `<div class="mini-list">${done.slice(-5).reverse().map((o) => `<div class="mini-row"><div><b>${esc(o.id)}</b> · ${esc(restaurantById(o.restaurant_id)?.name || "Removed restaurant")}<br><span class="small muted">${fmtDate(o.date)} · ${esc(o.address)}</span></div><b>${peso(fee(o))}</b></div>`).join("")}</div>`
          : `<p class="muted small">Your finished deliveries will show here.</p>`;
      };
      draw();
      everyFew(3000, ["orders", "staff", "messages"], () => { if ($("#modal").hidden) draw(); });
    },
  };
}

/* ---------- one delivery ---------- */
function pageRiderOrder([id]) {
  const me = currentRider();
  const o0 = rows("orders").find((o) => o.id === id);
  if (!o0 || o0.rider !== me.id) return { html: `<div class="wrap"><div class="empty" style="padding:80px 16px">${icon("alert", 40)}<h2>This isn't your order</h2><p style="margin:8px 0 20px">It may have been given to another rider.</p><a class="btn btn-primary" href="#/rider">Back to my orders</a></div></div>` };
  const r = restaurantById(o0.restaurant_id) || { name: "Restaurant", area: "" };
  const c = customerOf(o0) || { name: o0.email, phone: "" };
  return {
    html: `<div class="wrap">
      <div class="crumbs"><a href="#/rider">Rider home</a> / ${esc(id)}</div>
      <div class="admin-head"><div><span class="eyebrow">Order ${esc(id)}</span><h1 id="headline"></h1></div><div id="pill"></div></div>
      <div class="track">
        <div style="display:grid;gap:20px;align-content:start">
          <section class="panel" id="step"></section>
          <section class="panel"><h3>Pick up</h3>
            <div class="addr-card"><span class="pin">${icon("store", 20)}</span><span class="grow"><b>${esc(r.name)}</b><br><span class="small muted">${esc(r.area)}</span></span>
              <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${r.lat ? `https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=17/${r.lat}/${r.lng}` : osmLink(r.name + " " + r.area)}">${icon("compass", 16)} Map</a></div>
            <h3 style="margin-top:18px">Deliver to</h3>
            <div class="addr-card"><span class="avatar" style="width:40px;height:40px;font-size:14px">${initials(c.name)}</span><span class="grow"><b>${esc(c.name)}</b><br><span class="small muted">${esc(o0.address)}</span></span>
              ${c.phone ? `<a class="icon-btn" href="tel:${esc(c.phone)}" aria-label="Call ${esc(c.name)}" title="Call">${icon("phone", 18)}</a>` : ""}
              <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${osmLink(o0.address)}">${icon("compass", 16)} Map</a></div>
            ${o0.note ? `<div class="note-box ${/allerg/i.test(o0.note) ? "is-alert" : ""}">${icon(/allerg/i.test(o0.note) ? "alert" : "file", 18)}<span>${esc(o0.note)}</span></div>` : ""}
          </section>
          <section class="panel"><h3>Items</h3>
            ${parseItems(o0.items).map(([m, q]) => `<div class="pick-row"><span><b>${q}×</b> ${esc(itemById(m)?.name || "Item " + m)}</span></div>`).join("")}
            <div class="summary"><div class="line total"><span>${o0.payment === "cod" ? "Collect in cash" : `Paid with ${esc(payLabel(o0.payment))}`}</span><span>${peso(o0.total)}</span></div></div>
          </section>
        </div>
        <section class="panel" id="chatBox"></section>
      </div>
    </div>`,
    after(root) {
      const chat = mountChat($("#chatBox", root), id, "rider", `Chat with ${firstName(c.name)}`);
      const draw = () => {
        const o = rows("orders").find((x) => x.id === id);
        const st = orderStatus(o);
        store.set("seen_" + id, Date.now());
        chat.setOpen(!["delivered", "cancelled"].includes(st));
        $("#pill", root).innerHTML = statusPill(st);
        $("#headline", root).textContent = { pending: "Head to the restaurant", preparing: "Head to the restaurant", "on-the-way": "Deliver to the customer", delivered: "Delivered. Salamat!", cancelled: "This order was cancelled" }[st];
        const steps = [["Go to the restaurant", "Show the order number to the staff."], ["Pick up the food", "Check every item before you leave."], ["Deliver", "Ask the customer for their 4-digit PIN."]];
        const at = st === "on-the-way" ? 2 : st === "delivered" ? 3 : 0;
        $("#step", root).innerHTML = `<ol class="timeline">${steps.map(([t, d], i) => `<li class="${i < at ? "done" : i === at || (at === 0 && i === 1) ? "current" : ""}"><span class="dot">${i < at ? icon("check", 14) : ""}</span><div><b>${t}</b><small>${d}</small></div></li>`).join("")}</ol>
          ${st === "cancelled" ? `<div class="note-box is-alert">${icon("alert", 18)}<span>The order was cancelled. Don't pick it up. If you already have the food, return it to ${esc(r.name)}.</span></div><a class="btn btn-primary" href="#/rider" style="margin-top:12px">Back to rider home</a>`
            : st === "delivered" ? `<a class="btn btn-primary" href="#/rider">Find the next order ${icon("arrowRight", 16)}</a>`
            : st === "on-the-way" ? `<button class="btn btn-primary btn-block" id="deliver">${icon("checkCircle", 18)} Complete delivery</button>`
            : `<button class="btn btn-primary btn-block" id="pickup">${icon("bag", 18)} I picked up the food</button>`}`;
        const pick = $("#pickup", root);
        if (pick) pick.onclick = () => {
          const items = parseItems(o.items);
          modal(`<div class="ring">${icon("bag", 28)}</div><h2 style="font-size:22px">Check the items</h2><p class="muted">Tick each one as you check the bag from ${esc(r.name)}.</p>
            <form id="pkForm" class="form" novalidate style="text-align:left">
              ${items.map(([m, q], i) => `<label class="check"><input type="checkbox" name="it${i}"> <span><b>${q}×</b> ${esc(itemById(m)?.name || "Item " + m)}</span></label>`).join("")}
              <span class="err" id="pk-err" style="color:var(--st-cancelled);font-weight:700"></span>
              <button class="btn btn-primary btn-block">Confirm pick-up</button>
              <button type="button" class="btn btn-ghost btn-block" data-close>Not yet</button>
            </form>`);
          $("#pkForm").onsubmit = async (e) => {
            e.preventDefault();
            if ($$("#pkForm input[type=checkbox]").some((x) => !x.checked)) { $("#pk-err").innerHTML = icon("alert", 14) + " Check every item first. Missing something? Ask the restaurant."; return; }
            try { await updateRow("orders", id, { status: "on-the-way" }); } catch { return toast("Couldn't save. Is server.py still running?", "alert"); }
            $("#modal").hidden = true; $("#modal").innerHTML = ""; sess.del("openModal");
            toast("Picked up! The customer can see you're on the way.", "bike"); draw();
          };
        };
        const del = $("#deliver", root);
        if (del) del.onclick = () => {
          modal(`<div class="ring">${icon("key", 28)}</div><h2 style="font-size:22px">Complete delivery</h2><p class="muted">Ask ${esc(firstName(c.name))} for the 4-digit PIN on their tracking screen.</p>
            <form id="dlForm" class="form" novalidate style="text-align:left">
              <div class="form-alert" id="dlAlert">${icon("alert", 18)}<span></span></div>
              ${o.pin ? field({ id: "pin", label: "Customer's PIN", ph: "0000", rules: "required", attrs: 'inputmode="numeric" maxlength="4" autocomplete="off" class="otp"' }) : ""}
              ${o.payment === "cod" ? `<div class="check field"><input type="checkbox" id="cash" name="cash" data-rules="checked"><label for="cash" style="font-weight:700">I collected ${peso(o.total)} in cash</label><span class="err" style="flex-basis:100%"></span></div>` : `<p class="small muted">${icon("checkCircle", 14)} Paid online with ${esc(payLabel(o.payment))}. Don't collect cash.</p>`}
              <button class="btn btn-primary btn-block">Mark as delivered</button>
              <button type="button" class="btn btn-ghost btn-block" data-close>Not yet</button>
            </form>`);
          const f = $("#dlForm");
          liveValidate(f);
          f.onsubmit = async (e) => {
            e.preventDefault();
            if (!validateForm(f)) return;
            if (o.pin && f.pin.value.trim() !== String(o.pin)) { $("#dlAlert span").textContent = "That PIN doesn't match. Ask the customer to check their screen."; $("#dlAlert").classList.add("show"); f.pin.value = ""; return; }
            try { await updateRow("orders", id, { status: "delivered" }); } catch { return toast("Couldn't save. Is server.py still running?", "alert"); }
            $("#modal").hidden = true; $("#modal").innerHTML = ""; sess.del("openModal");
            toast(`Delivered! You earned ${peso(r.fee || 0)}.`, "checkCircle"); draw();
          };
        };
      };
      draw();
      everyFew(3000, ["orders"], () => { if ($("#modal").hidden) draw(); });
    },
  };
}

ROUTES.push(
  { re: /^rider\/login$/, page: pageRiderLogin, riderGuest: true, title: "Rider log in" },
  { re: /^rider$/, page: pageRiderHome, rider: true, title: "Rider" },
  { re: /^rider\/o\/([\w-]+)$/, page: pageRiderOrder, rider: true, title: "Rider · Delivery" },
);
