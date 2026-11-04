/* Member account: profile, contact numbers (main number is fixed, extras can be added), food allergies,
   password change and account deletion (both confirmed by email), saved payment methods, and feedback. */

const ALLERGENS = ["Peanuts", "Tree nuts", "Shellfish", "Fish", "Eggs", "Milk", "Soy", "Wheat/Gluten"];
const listOf = (s) => String(s || "").split(";").map((x) => x.trim()).filter(Boolean);
const fmtNum = (p) => String(p || "").replace(/^(\d{4})(\d{3})(\d{4})$/, "$1 $2 $3");
const maskNum = (p) => "•••• " + String(p).slice(-4);

function allergyPicker(name, selected) {
  return `<fieldset class="chip-pick"><legend>Food allergies <span class="muted">(optional)</span></legend>
    <div class="chip-grid">${ALLERGENS.map((a) => `<label><input type="checkbox" name="${name}" value="${a}" ${selected.includes(a) ? "checked" : ""}><span>${a}</span></label>`).join("")}</div>
    <span class="hint">We pass these to the restaurant and rider with every order.</span></fieldset>`;
}

/* ---------- saved payment methods (kept in this browser, like a phone wallet; never in a public .txt file) ---------- */
const payData = (u) => store.get("pay_" + u.email.toLowerCase(), { def: "cod", wallets: [], cards: [] });
const savePay = (u, d) => store.set("pay_" + u.email.toLowerCase(), d);
function payMethods(u) {
  const d = payData(u);
  return [{ key: "cod", label: "Cash on delivery", sub: "Pay the rider when your food arrives", ic: "cash" },
    ...d.wallets.map((w) => ({ key: w.type, label: payLabel(w.type), sub: "Linked e-wallet · " + maskNum(w.number), ic: "wallet" })),
    ...d.cards.map((c) => ({ key: "card-" + c.last4, label: `${c.brand} ••${c.last4}`, sub: `Expires ${c.exp}`, ic: "card" }))];
}
function defaultPayMethod(u) { const d = payData(u); return payMethods(u).some((m) => m.key === d.def) ? d.def : "cod"; }
const cardBrand = (n) => (/^4/.test(n) ? "Visa" : /^(5[1-5]|2[2-7])/.test(n) ? "Mastercard" : /^35/.test(n) ? "JCB" : "Card");

/** A spinner pop-up for a moment ("Charging your card…"). */
function processingBox(title, sub = "", ms = 1400) {
  return new Promise((resolve) => {
    const close = modal(`<div class="ring big-ring spin-ring">${icon("wallet", 28)}</div><h2 style="font-size:22px">${esc(title)}</h2>${sub ? `<p class="muted">${esc(sub)}</p>` : ""}`, "", resolve);
    setTimeout(close, ms);
  });
}

/** The pretend GCash / Maya screen where the customer approves the payment with their MPIN. */
function walletApprove(type, amount, u) {
  const w = payData(u).wallets.find((x) => x.type === type);
  return new Promise((resolve) => {
    let paid = false;
    modal(`
      <div class="wallet-head wallet-${type}">${icon("wallet", 22)} ${payLabel(type)}</div>
      <p class="muted" style="margin:0">MoBites is asking for a payment of</p>
      <div class="wallet-amt">${peso(amount)}</div>
      <p class="small muted" style="margin:0">From ${payLabel(type)} ${w ? maskNum(w.number) : ""}</p>
      <form class="form" id="mpinForm" novalidate style="text-align:left">
        ${field({ id: "mpin", label: "Enter your 4-digit MPIN", type: "password", ph: "••••", rules: "required", hint: "Demo: any 4 digits.", attrs: 'inputmode="numeric" maxlength="4" autocomplete="off"' })}
        <button class="btn btn-primary btn-block">Pay ${peso(amount)}</button>
        <button type="button" class="btn btn-ghost btn-block" data-close>Cancel payment</button>
      </form>`, "", () => resolve(paid));
    const f = $("#mpinForm");
    f.mpin.focus();
    f.mpin.addEventListener("input", () => (f.mpin.value = f.mpin.value.replace(/\D/g, "").slice(0, 4)));
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (!validateForm(f, { mpin: (el) => /^\d{4}$/.test(el.value) || "Your MPIN is 4 digits." })) return;
      paid = true;
      await processingBox(`Paying with ${payLabel(type)}…`, peso(amount), 1200);   // replaces this pop-up
      resolve(true);
    };
  });
}

/** Choose what to add: an e-wallet or a card. */
function openAddPayment(u, onDone) {
  const d = payData(u);
  modal(`<div style="display:flex;justify-content:space-between;align-items:center"><h2 style="font-size:22px">Add a payment method</h2><button class="icon-btn" data-close aria-label="Close">${icon("x", 18)}</button></div>
    <div class="pay-list">
      ${["gcash", "maya"].map((t) => d.wallets.some((w) => w.type === t)
        ? `<div class="pay-opt is-off"><span class="pay-ic">${icon("wallet", 20)}</span><span class="grow"><b>${payLabel(t)}</b><br><span class="small muted">Already linked</span></span></div>`
        : `<button type="button" class="pay-opt" data-add="${t}"><span class="pay-ic">${icon("wallet", 20)}</span><span class="grow"><b>Link ${payLabel(t)}</b><br><span class="small muted">Approve each payment in the app</span></span>${icon("chevronRight", 18)}</button>`).join("")}
      <button type="button" class="pay-opt" data-add="card"><span class="pay-ic">${icon("card", 20)}</span><span class="grow"><b>Credit or debit card</b><br><span class="small muted">Visa, Mastercard or JCB</span></span>${icon("chevronRight", 18)}</button>
    </div>`, "wide");
  $$("[data-add]").forEach((b) => b.onclick = () => (b.dataset.add === "card" ? addCard(u, onDone) : linkWallet(u, b.dataset.add, onDone)));
}

function linkWallet(u, type, onDone) {
  let code = null;
  modal(`<div class="wallet-head wallet-${type}">${icon("wallet", 22)} Link ${payLabel(type)}</div>
    <form class="form" id="wForm" novalidate style="text-align:left">
      ${phoneField("wnum", `${payLabel(type)} mobile number`, fmtNum(u.phone))}
      <div id="wCode" hidden>${field({ id: "wcode", label: "6-digit code", ph: "000000", rules: "required otp", hint: `We sent it to ${esc(maskEmail(u.email))}.`, attrs: 'inputmode="numeric" maxlength="6" autocomplete="one-time-code"' })}</div>
      <button class="btn btn-primary btn-block" id="wGo">Send code</button>
      <button type="button" class="btn btn-ghost btn-block" data-close>Cancel</button>
    </form>`, "wide");
  const f = $("#wForm");
  maskPhone(f.wnum);
  liveValidate(f);
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (!validateForm(f)) return;
    if (!code) {
      code = makeCode();
      const real = await sendMail({ to: u.email, name: u.name, subject: `Your ${payLabel(type)} linking code`, code,
        message: `Hi ${firstName(u.name)},\n\nUse this code to link ${payLabel(type)} ${maskNum(normalizePhone(f.wnum.value))} to MoBites: ${code}\n\nIf this wasn't you, ignore this email.\n\nMoBites` });
      $("#wCode").hidden = false; f.wnum.readOnly = true; $("#wGo").textContent = `Link ${payLabel(type)}`;
      toast(real ? "Code sent to your email" : "Code sent to the demo inbox", "mail");
      return f.wcode.focus();
    }
    if (f.wcode.value.trim() !== code) { f.wcode.closest(".field").classList.add("has-error"); $("#wcode-err").innerHTML = icon("alert", 14) + "That code isn't right."; return; }
    const d = payData(u);
    d.wallets.push({ type, number: normalizePhone(f.wnum.value) });
    if (d.def === "cod") d.def = type;
    savePay(u, d);
    $("#modal").hidden = true; $("#modal").innerHTML = ""; sess.del("openModal");
    toast(`${payLabel(type)} linked`, "wallet");
    onDone?.(type);
  };
}

function addCard(u, onDone) {
  modal(`<div style="display:flex;justify-content:space-between;align-items:center"><h2 style="font-size:22px">${icon("card", 22)} Add a card</h2><button class="icon-btn" data-close aria-label="Close">${icon("x", 18)}</button></div>
    <form class="form" id="cForm" novalidate style="text-align:left">
      ${field({ id: "cname", label: "Name on card", value: u.name, rules: "required name", attrs: 'autocomplete="cc-name"' })}
      ${field({ id: "cnum", label: "Card number", ph: "4242 4242 4242 4242", rules: "required card", hint: "Demo: use the test number 4242 4242 4242 4242.", attrs: 'inputmode="numeric" autocomplete="cc-number" maxlength="19"' })}
      <div class="row-2">
        ${field({ id: "cexp", label: "Expiry", ph: "MM/YY", rules: "required expiry", attrs: 'inputmode="numeric" autocomplete="cc-exp" maxlength="5"' })}
        ${field({ id: "ccvc", label: "CVC", ph: "123", rules: "required cvc", attrs: 'inputmode="numeric" autocomplete="cc-csc" maxlength="4"' })}
      </div>
      <p class="small muted">${icon("lock", 14)} We only keep the last 4 digits and the expiry date. Never your full card number or CVC.</p>
      <button class="btn btn-primary btn-block">Save card</button>
    </form>`, "wide");
  const f = $("#cForm");
  f.cnum.addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 "); });
  f.cexp.addEventListener("input", (e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 4); e.target.value = v.length > 2 ? v.slice(0, 2) + "/" + v.slice(2) : v; });
  const extra = { cnum: (el) => !payData(u).cards.some((c) => c.last4 === el.value.replace(/\D/g, "").slice(-4)) || "This card is already saved." };
  liveValidate(f, extra);
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (!validateForm(f, extra)) return;
    const n = f.cnum.value.replace(/\D/g, "");
    const card = { brand: cardBrand(n), last4: n.slice(-4), exp: f.cexp.value, name: f.cname.value.trim() };
    await processingBox("Checking your card…", `${card.brand} ••${card.last4}`, 1200);
    const d = payData(u);
    d.cards.push(card);
    if (d.def === "cod") d.def = "card-" + card.last4;
    savePay(u, d);
    toast(`${card.brand} ••${card.last4} saved`, "card");
    onDone?.("card-" + card.last4);
  };
}

function pagePayments() {
  const u = currentUser();
  const methods = payMethods(u);
  return {
    html: `<div class="wrap" style="max-width:820px">
      <div class="crumbs"><a href="#/profile">My account</a> / Payment methods</div>
      <div class="page-head"><span class="eyebrow">${icon("wallet", 16)} Payment methods</span><h1 style="margin-top:6px">Paano ka magbabayad?</h1>
        <p class="muted">Save a card or link an e-wallet once. At checkout, just pick it.</p></div>
      <section class="panel">
        <div class="pay-list">${methods.map((m) => `
          <div class="pay-opt"><span class="pay-ic">${icon(m.ic, 20)}</span><span class="grow"><b>${esc(m.label)}</b>${m.key === defaultPayMethod(u) ? ` <span class="badge">Default</span>` : ""}<br><span class="small muted">${esc(m.sub)}</span></span>
            ${m.key === defaultPayMethod(u) ? "" : `<button class="btn btn-ghost btn-sm" data-def="${m.key}">Make default</button>`}
            ${m.key === "cod" ? "" : `<button class="btn btn-danger btn-sm" data-rm="${m.key}" aria-label="Remove ${esc(m.label)}">${icon("trash", 14)}</button>`}</div>`).join("")}</div>
        <button class="btn btn-primary" id="add" style="margin-top:16px">${icon("plus", 16)} Add a card or e-wallet</button>
        <p class="small muted" style="margin-top:14px">${icon("shield", 14)} Payment details stay in this browser, not in the shared Notepad files. Cards keep only the last 4 digits.</p>
      </section>
    </div>`,
    after(root) {
      $("#add", root).onclick = () => openAddPayment(u, () => render());
      $$("[data-def]", root).forEach((b) => b.onclick = () => { savePay(u, { ...payData(u), def: b.dataset.def }); toast("Default payment updated", "wallet"); render(); });
      $$("[data-rm]", root).forEach((b) => b.onclick = async () => {
        const m = methods.find((x) => x.key === b.dataset.rm);
        if (!await confirmBox({ ic: "trash", title: `Remove ${esc(m.label)}?`, text: "You can add it again anytime.", yes: "Remove", danger: true })) return;
        const cur = payData(u);
        cur.wallets = cur.wallets.filter((w) => w.type !== m.key);
        cur.cards = cur.cards.filter((c) => "card-" + c.last4 !== m.key);
        if (cur.def === m.key) cur.def = "cod";
        savePay(u, cur);
        toast(`${m.label} removed`, "trash"); render();
      });
    },
  };
}

/* ---------- my account ---------- */
function pageProfile() {
  const u = currentUser();
  const loc = getLoc();
  const saved = store.get("notif_" + u.email, {});
  const alts = listOf(u.alt_phones);
  const mine = listOf(u.allergies);
  const other = mine.filter((a) => !ALLERGENS.includes(a)).join(", ");
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
          <a class="link-arrow" href="#/payments">Payment methods ${icon("arrowRight", 14)}</a>
          <a class="link-arrow" href="#/feedback">Send feedback ${icon("arrowRight", 14)}</a>
          <a class="link-arrow" href="#/privacy">Privacy Policy ${icon("arrowRight", 14)}</a>
          <button class="btn btn-danger btn-block" id="logout" style="margin-top:8px">${icon("logout", 16)} Log out</button>
        </aside>
        <div style="display:grid;gap:20px">
          <section class="panel"><h3>Personal info</h3>
            <form class="form" id="infoForm" novalidate>
              <div class="row-2">
                ${field({ id: "name", label: "Full name", value: u.name, rules: "required name", hint: "Letters only." })}
                ${field({ id: "email", label: "Email address", type: "email", value: u.email, attrs: "disabled", hint: "Your email is your login and can't be changed." })}
              </div>
              <div><button class="btn btn-primary">Save changes</button></div>
            </form>
          </section>

          <section class="panel"><h3>${icon("phone", 20)} Contact numbers</h3>
            <div class="num-list">
              <div class="num-row"><span class="grow"><b>${fmtNum(u.phone)}</b> <span class="badge">Main</span><br><span class="small muted">${icon("lock", 12)} Your main number can't be changed. It's how riders and support reach you.</span></span></div>
              ${alts.map((p) => `<div class="num-row"><span class="grow"><b>${fmtNum(p)}</b><br><span class="small muted">Extra number</span></span><button class="btn btn-danger btn-sm" data-rmnum="${p}" aria-label="Remove ${fmtNum(p)}">${icon("trash", 14)}</button></div>`).join("")}
            </div>
            ${alts.length < 3 ? `<form class="form add-num" id="phoneForm" novalidate>${phoneField("newPhone", "Add another number")}<div><button class="btn btn-ghost">${icon("plus", 16)} Add number</button></div></form>` : `<p class="small muted">You can save up to 3 extra numbers.</p>`}
          </section>

          <section class="panel"><h3>Food allergies</h3>
            <form class="form" id="allergyForm" novalidate>
              ${allergyPicker("allergy", mine)}
              ${field({ id: "allergyOther", label: 'Other allergies <span class="muted">(optional)</span>', value: other, ph: "e.g. Sesame, Mango", hint: "Separate with commas." })}
              <div><button class="btn btn-primary">Save allergies</button></div>
            </form>
          </section>

          <section class="panel"><div class="section-head" style="margin-bottom:8px"><h3 style="margin:0">Payment methods</h3><a class="link-arrow" href="#/payments">Manage ${icon("arrowRight", 14)}</a></div>
            <div class="pay-list">${payMethods(u).map((m) => `<div class="pay-opt"><span class="pay-ic">${icon(m.ic, 20)}</span><span class="grow"><b>${esc(m.label)}</b><br><span class="small muted">${esc(m.sub)}</span></span>${m.key === defaultPayMethod(u) ? `<span class="badge">Default</span>` : ""}</div>`).join("")}</div>
          </section>

          <section class="panel"><h3>Delivery address</h3>
            <div class="addr-card"><span class="pin">${icon("pin", 20)}</span><span class="grow"><b>${esc(loc?.label || "No location pinned yet")}</b>${loc?.detail ? `<br><span class="small muted">${esc(loc.detail)}</span>` : ""}</span><button class="btn btn-ghost btn-sm" data-loc>${loc ? "Change" : "Set location"}</button></div>
          </section>

          <section class="panel"><h3>${icon("key", 20)} Change password</h3>
            <form class="form" id="pwForm" novalidate>
              <div class="form-alert" id="pwAlert">${icon("alert", 18)}<span></span></div>
              ${field({ id: "current", label: "Current password", type: "password", rules: "required", password: true, attrs: 'autocomplete="current-password"' })}
              <div class="row-2">
                ${field({ id: "newPw", label: "New password", type: "password", rules: "required password", password: true, hint: "8+ characters, a number and a symbol.", attrs: 'autocomplete="new-password"' })}
                ${field({ id: "confirmPw", label: "Confirm new password", type: "password", rules: "required", password: true, attrs: 'autocomplete="new-password"' })}
              </div>
              <div><button class="btn btn-primary">Change password</button></div>
              <p class="small muted">We'll email you a code first. Your password won't change until you enter it.</p>
            </form>
          </section>

          <section class="panel"><h3>Notifications</h3>
            ${[["n1", "Order updates", "Rider status and delivery messages", true], ["n2", "Promos & rewards", "Deals, points and member perks", true], ["n3", "New restaurants", "When a new spot opens near you", false]].map(([id, t, d, on]) =>
              `<label class="toggle" for="${id}"><span><b>${t}</b><br><span class="muted small">${d}</span></span><input type="checkbox" id="${id}" ${(id in saved ? saved[id] : on) ? "checked" : ""}></label>`).join("")}
          </section>

          <section class="panel danger-zone"><h3>Delete account</h3>
            <p class="muted small">This permanently deletes your login, saved numbers, allergies, favorites, points and payment methods. Past orders stay in our records without your login.</p>
            <div style="margin-top:12px"><button class="btn btn-danger" id="delAcct">${icon("trash", 16)} Delete my account</button></div>
          </section>
        </div>
      </div>
    </div>`,
    after(root) {
      const save = async (changes, msg) => {
        try { await updateRow("users", u.email, changes); } catch { toast("Couldn't save. Is server.py still running?", "alert"); return false; }
        toast(msg); return true;
      };
      const info = $("#infoForm", root);
      liveValidate(info);
      info.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!validateForm(info)) return;
        if (info.name.value.trim() === u.name) return toast("Nothing changed", "check");
        if (await save({ name: info.name.value.trim() }, "Name saved")) render();
      });

      const pf = $("#phoneForm", root);
      if (pf) {
        maskPhone(pf.newPhone);
        const extra = { newPhone: (el) => ![u.phone, ...alts].includes(normalizePhone(el.value)) || "That number is already on your account." };
        liveValidate(pf, extra);
        pf.addEventListener("submit", async (e) => {
          e.preventDefault();
          if (!validateForm(pf, extra)) return;
          if (await save({ alt_phones: [...alts, normalizePhone(pf.newPhone.value)].join(";") }, "Number added")) { pf.reset(); render(); }
        });
      }
      $$("[data-rmnum]", root).forEach((b) => b.onclick = async () => {
        if (!await confirmBox({ ic: "phone", title: `Remove ${fmtNum(b.dataset.rmnum)}?`, text: "Riders won't be able to call you on this number anymore.", yes: "Remove", danger: true })) return;
        if (await save({ alt_phones: alts.filter((p) => p !== b.dataset.rmnum).join(";") }, "Number removed")) render();
      });

      const af = $("#allergyForm", root);
      liveValidate(af);
      af.addEventListener("submit", async (e) => {
        e.preventDefault();
        const list = [...$$("input[name=allergy]:checked", af).map((x) => x.value), ...af.allergyOther.value.split(",").map((x) => x.trim()).filter(Boolean)];
        if (await save({ allergies: [...new Set(list)].join(";") }, list.length ? "Allergies saved" : "No allergies saved")) render();
      });

      const pw = $("#pwForm", root);
      bindPasswordToggles(root);
      const pwExtra = { confirmPw: (el) => el.value === pw.newPw.value || "Passwords don't match.", newPw: (el) => el.value !== pw.current.value || "Use a different password from your current one." };
      liveValidate(pw, pwExtra);
      pw.addEventListener("submit", async (e) => {
        e.preventDefault();
        $("#pwAlert", root).classList.remove("show");
        if (!validateForm(pw, pwExtra)) return;
        if (await sha256(pw.current.value) !== u.password_sha256) { $("#pwAlert span", root).textContent = "Your current password isn't right."; $("#pwAlert", root).classList.add("show"); pw.current.value = ""; pw.current.focus(); return; }
        if (!await confirmBox({ ic: "key", title: "Change your password?", text: `We'll email a code to <b>${esc(maskEmail(u.email))}</b>. Your password changes only after you enter it.`, yes: "Send code" })) return;
        await startEmailCheck("password", u.email, u.name, { hash: await sha256(pw.newPw.value) });
        location.hash = "#/verify/password";
      });

      $("#delAcct", root).onclick = () => {
        modal(`<div class="ring" style="background:var(--st-cancelled-bg);color:var(--st-cancelled)">${icon("trash", 28)}</div>
          <h2 style="font-size:24px">Delete your account?</h2>
          <p class="muted">This can't be undone. Your points (${userPoints(u).toLocaleString()}), favorites and saved payment methods will be gone.</p>
          <form class="form" id="delForm" novalidate style="text-align:left">
            <div class="form-alert" id="delAlert">${icon("alert", 18)}<span></span></div>
            ${field({ id: "delPw", label: "Enter your password to continue", type: "password", rules: "required", password: true, attrs: 'autocomplete="current-password"' })}
            <div class="check field"><input type="checkbox" id="delOk" name="delOk" data-rules="checked"><label for="delOk" style="font-weight:600">I understand my account will be permanently deleted.</label><span class="err" style="flex-basis:100%"></span></div>
            <button class="btn btn-danger btn-block">Continue</button>
            <button type="button" class="btn btn-ghost btn-block" data-close>Keep my account</button>
          </form>`);
        const f = $("#delForm");
        bindPasswordToggles(f);
        liveValidate(f);
        f.onsubmit = async (e) => {
          e.preventDefault();
          if (!validateForm(f)) return;
          if (await sha256(f.delPw.value) !== u.password_sha256) { $("#delAlert span").textContent = "That password isn't right."; $("#delAlert").classList.add("show"); f.delPw.value = ""; return; }
          await startEmailCheck("delete", u.email, u.name);
          location.hash = "#/verify/delete";
        };
      };

      $$("[data-loc]", root).forEach((b) => b.onclick = () => openMapPicker());
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

/* ---------- feedback ---------- */
RULES.feedback = (v) => (v.trim().length >= 10 && v.trim().length <= 500) || (v.trim().length < 10 ? "Tell us a bit more (at least 10 characters)." : "Keep it under 500 characters.");
const FEEDBACK_TOPICS = { app: "Using the app", delivery: "Delivery", food: "Food", rider: "Rider", other: "Something else" };

function pageFeedback(_, query) {
  const u = currentUser();
  const mine = u ? userOrders(u).slice(0, 10) : [];
  const pre = query.get("order") || "";
  return {
    html: `<div class="wrap" style="max-width:760px">
      <div class="page-head"><span class="eyebrow">${icon("chat", 16)} Feedback</span><h1 style="margin-top:6px">Kumusta ang MoBites?</h1>
        <p class="muted">Tell us what you loved or what we should fix. Every message is read by the team.</p></div>
      <section class="panel" id="fbPanel">
        <form class="form" id="fbForm" novalidate>
          <div class="field" id="starsField"><label id="starsLabel">Your rating</label>
            <div class="stars" role="radiogroup" aria-labelledby="starsLabel">${[1, 2, 3, 4, 5].map((n) => `<label title="${n} star${n > 1 ? "s" : ""}"><input type="radio" name="rating" value="${n}"><span>${icon("star", 30)}</span><span class="sr">${n} star${n > 1 ? "s" : ""}</span></label>`).join("")}</div>
            <span class="err" id="stars-err"></span></div>
          <div class="row-2">
            ${selectField({ id: "topic", label: "What is it about?", options: FEEDBACK_TOPICS, value: pre ? "delivery" : "app" })}
            ${u ? selectField({ id: "order", label: 'Order <span class="muted">(optional)</span>', options: Object.fromEntries(mine.map((o) => [o.id, `${o.id} · ${restaurantById(o.restaurant_id)?.name || "Restaurant"}`])), blank: "Not about an order", value: pre })
              : field({ id: "email", label: "Your email", type: "email", ph: "juan@email.com", rules: "required email", hint: "So we can reply." })}
          </div>
          <div class="field"><label for="message">Your message</label><textarea id="message" name="message" maxlength="500" data-rules="required feedback" placeholder="e.g. Ang bilis ng delivery, pero sana may…" aria-describedby="message-err"></textarea><span class="hint" id="count">0 / 500</span><span class="err" id="message-err"></span></div>
          <div><button class="btn btn-primary">${icon("chat", 16)} Send feedback</button></div>
        </form>
      </section>
    </div>`,
    after(root) {
      const f = $("#fbForm", root);
      const starsOk = () => {
        const ok = !!f.querySelector("input[name=rating]:checked");
        $("#starsField", root).classList.toggle("has-error", !ok && !!f.dataset.touched);
        $("#stars-err", root).innerHTML = ok ? "" : icon("alert", 14) + "Pick from 1 to 5 stars.";
        return ok;
      };
      $$("input[name=rating]", f).forEach((r) => r.addEventListener("change", () => { $$(".stars label", f).forEach((l, i) => l.classList.toggle("is-on", i < +r.value)); starsOk(); }));
      f.message.addEventListener("input", () => ($("#count", root).textContent = `${f.message.value.length} / 500`));
      liveValidate(f);
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        const ok = validateForm(f);
        if (!starsOk() || !ok) return;
        const email = u ? u.email : f.email.value.trim().toLowerCase();
        const row = { id: "F" + String(Date.now()).slice(-6), email, rating: +f.querySelector("input[name=rating]:checked").value, topic: f.topic.value,
          order_id: u ? f.order.value : "", message: f.message.value.trim(), date: ymd(new Date()), status: "new" };
        try { await appendRow("feedback", row); } catch { return toast("Couldn't send. Is server.py still running?", "alert"); }
        sendMail({ to: email, name: u?.name || "", subject: "Salamat sa feedback!", message: `Hi${u ? " " + firstName(u.name) : ""},\n\nThanks for rating MoBites ${row.rating} out of 5. The team reads every message, and we'll reply if we need more details.\n\nYour message:\n"${row.message}"\n\nMoBites` });
        f.reset();
        $("#fbPanel", root).innerHTML = `<div class="empty" style="padding:40px 16px">${icon("checkCircle", 44)}<h2>Salamat sa feedback!</h2><p style="margin:8px 0 20px">We got your message and sent a copy to your email.</p><a class="btn btn-primary" href="#/${u ? "explore" : ""}">Back to MoBites</a></div>`;
      });
    },
  };
}

ROUTES.push(
  { re: /^profile$/, page: pageProfile, member: "Log in to see your account" },
  { re: /^payments$/, page: pagePayments, member: "Log in to manage payment methods", title: "Payment methods" },
  { re: /^feedback$/, page: pageFeedback, title: "Feedback" },
);
