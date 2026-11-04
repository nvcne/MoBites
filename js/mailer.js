/* Email for MoBites.
   - Real emails go out through EmailJS when js/email-config.js is filled in.
   - Every email also lands in the demo inbox (#/inbox), so the demo still works offline or before EmailJS is set up.
   - Sign-up, forgot password, change password and delete account all wait for a 6-digit code from an email. */

const mailReady = () => { const c = window.EMAIL_CONFIG || {}; return !!(window.emailjs && c.publicKey && c.serviceId && c.templateId); };
const inboxOf = (email) => store.get("inbox_" + String(email).toLowerCase(), []);

/** Send an email. Resolves true if a real email went out, false if it only reached the demo inbox. */
async function sendMail({ to, name = "", subject, message, code = "" }) {
  const mail = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), to: to.toLowerCase(), subject, message, code, at: Date.now() };
  store.set("inbox_" + mail.to, [mail, ...inboxOf(mail.to)].slice(0, 40));
  if (!mailReady()) return false;
  try {
    await emailjs.send(EMAIL_CONFIG.serviceId, EMAIL_CONFIG.templateId, { to_email: to, to_name: name || to, subject, message, code }, { publicKey: EMAIL_CONFIG.publicKey });
    return true;
  } catch (e) {
    console.warn("[EmailJS] Couldn't send, kept it in the demo inbox instead:", e);
    return false;
  }
}

/* ---------- 6-digit email codes ---------- */
const CHECKS = {
  signup: { title: "Confirm your email", subject: "Your MoBites sign-up code", intro: "Welcome to MoBites! Use this code to finish creating your account.", back: "#/signup" },
  reset: { title: "Reset your password", subject: "Your MoBites password reset code", intro: "Someone (hopefully you) asked to reset your MoBites password.", back: "#/forgot" },
  password: { title: "Confirm your new password", subject: "Confirm your MoBites password change", intro: "You asked to change your MoBites password. It won't change until you enter this code.", back: "#/profile" },
  delete: { title: "Confirm account deletion", subject: "Confirm deleting your MoBites account", intro: "You asked to permanently delete your MoBites account. Nothing is deleted until you enter this code.", back: "#/profile" },
};
const makeCode = () => String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
const maskEmail = (e) => String(e).replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + "•".repeat(Math.min(b.length, 6)) + c);
RULES.otp = (v) => /^\d{6}$/.test(v.trim()) || "Enter the 6 digits from the email.";

/** Email a code and remember (in this tab, so a refresh keeps it) what to do once it's confirmed. */
async function startEmailCheck(kind, email, name, payload = {}) {
  const code = makeCode();
  const k = CHECKS[kind];
  const check = { email, name, payload, hash: await sha256(code), expires: Date.now() + 10 * 60000, tries: 0, sentAt: Date.now(), real: false };
  sess.set("check_" + kind, check);
  check.real = await sendMail({ to: email, name, subject: k.subject, code,
    message: `Hi ${firstName(name || "there")},\n\n${k.intro}\n\nYour code: ${code}\nIt expires in 10 minutes.\n\nIf this wasn't you, ignore this email${kind === "signup" ? "" : ". Your account stays as it is"}.\n\nMoBites` });
  sess.set("check_" + kind, check);
  return check.real;
}

function pageVerify([kind]) {
  const k = CHECKS[kind];
  const c = sess.get("check_" + kind);
  const u = currentUser();
  if (!c || ((kind === "password" || kind === "delete") && !u)) {
    return { html: `<div class="wrap"><div class="empty" style="padding:80px 16px">${icon("mail", 40)}<h2>Nothing to confirm</h2><p style="margin:8px 0 20px">This code was already used or has expired.</p>
      <a class="btn btn-primary" href="${u ? "#/profile" : "#/login"}">${u ? "Back to my account" : "Go to log in"}</a></div></div>` };
  }
  const reset = kind === "reset";
  return {
    html: `<div class="wrap narrow-page">
      <section class="panel verify">
        <div class="ring big-ring">${icon("mail", 30)}</div>
        <h1>${k.title}</h1>
        <p class="muted">We sent a 6-digit code to <b>${esc(maskEmail(c.email))}</b>. It expires in 10 minutes.</p>
        <form class="form" id="vform" novalidate style="margin-top:18px;text-align:left">
          <div class="form-alert" id="alert">${icon("alert", 18)}<span></span></div>
          ${field({ id: "code", label: "6-digit code", ph: "000000", rules: "required otp", attrs: 'inputmode="numeric" autocomplete="one-time-code" maxlength="6" class="otp" data-nodraft' })}
          ${reset ? `${field({ id: "password", label: "New password", type: "password", ph: "Create a new password", rules: "required password", password: true, hint: "At least 8 characters, with a number and a symbol.", attrs: 'autocomplete="new-password"' })}
          ${field({ id: "confirm", label: "Confirm new password", type: "password", ph: "Type it again", rules: "required", password: true, attrs: 'autocomplete="new-password"' })}` : ""}
          <button class="btn ${kind === "delete" ? "btn-danger" : "btn-primary"} btn-block" id="go">${kind === "delete" ? "Delete my account" : kind === "signup" ? "Confirm and create account" : "Confirm"}</button>
        </form>
        <div class="verify-links"><button class="link-btn" id="resend" type="button"></button><a href="${k.back}">${kind === "signup" ? "Change email" : "Cancel"}</a></div>
        ${c.real ? `<p class="small muted">Can't find it? Check your Spam or Promotions folder.</p>`
          : `<div class="db-note" style="text-align:left">${icon("mail", 18)}<span style="flex:1">Real email isn't set up yet, so this email went to the <b>demo inbox</b>.</span><a class="btn btn-ghost btn-sm" href="#/inbox?to=${encodeURIComponent(c.email)}" target="_blank">Open demo inbox</a></div>`}
      </section>
    </div>`,
    after(root) {
      const form = $("#vform", root), alertBox = $("#alert", root);
      const showAlert = (m) => { alertBox.querySelector("span").textContent = m; alertBox.classList.add("show"); };
      bindPasswordToggles(root);
      form.code.addEventListener("input", () => { form.code.value = form.code.value.replace(/\D/g, "").slice(0, 6); });
      const extra = reset ? { confirm: (el) => el.value === form.password.value || "Passwords don't match." } : {};
      liveValidate(form, extra);

      const resend = $("#resend", root);
      const tick = () => {
        const cur = sess.get("check_" + kind);
        if (!cur) return;
        const wait = Math.ceil((cur.sentAt + 30000 - Date.now()) / 1000);
        resend.disabled = wait > 0;
        resend.textContent = wait > 0 ? `Resend code in ${wait}s` : "Resend code";
      };
      tick(); timers.push(setInterval(tick, 1000));
      resend.onclick = async () => {
        const cur = sess.get("check_" + kind);
        resend.disabled = true;
        await startEmailCheck(kind, cur.email, cur.name, cur.payload);
        toast("We sent a new code", "mail");
        render();
      };

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        alertBox.classList.remove("show");
        if (!validateForm(form, extra)) return;
        const cur = sess.get("check_" + kind);
        if (Date.now() > cur.expires) return showAlert("This code has expired. Tap Resend code for a new one.");
        if (cur.tries >= 5) return showAlert("Too many wrong codes. Tap Resend code for a new one.");
        if (await sha256(form.code.value.trim()) !== cur.hash) {
          cur.tries += 1; sess.set("check_" + kind, cur);
          form.code.value = ""; form.code.focus();
          return showAlert(cur.tries >= 5 ? "Too many wrong codes. Tap Resend code for a new one." : `That code isn't right. ${5 - cur.tries} ${5 - cur.tries === 1 ? "try" : "tries"} left.`);
        }
        $("#go", root).disabled = true;
        sess.del("check_" + kind);
        try { await CHECK_DONE[kind](cur, form); }
        catch { $("#go", root).disabled = false; sess.set("check_" + kind, cur); showAlert("We couldn't save that. Is server.py still running?"); }
      });
    },
  };
}

/** What happens after each kind of code is confirmed. */
const CHECK_DONE = {
  async signup(c) {
    const { row, next } = c.payload;
    if (rows("users").some((x) => x.email.toLowerCase() === row.email)) throw new Error("exists");
    const steps = ["Email confirmed", "Creating your account", "Setting up your rewards wallet", "Finding restaurants near you", "Preparing your welcome gift"];
    $("#app").innerHTML = `<div class="wrap narrow-page"><section class="panel building" aria-live="polite">
      <div class="ring big-ring spin-ring">${icon("bike", 32)}</div>
      <h1>Binubuo na namin ang account mo…</h1><p class="muted">We're building your account. This only takes a moment.</p>
      <div class="progress light" role="progressbar" aria-label="Account setup" aria-valuemin="0" aria-valuemax="100"><i id="bar" style="width:0%"></i></div>
      <ol class="build-steps">${steps.map((s, i) => `<li id="bs${i}">${icon("check", 16)}<span>${s}</span></li>`).join("")}</ol></section></div>`;
    const saving = appendRow("users", row);
    for (let i = 0; i < steps.length; i++) {
      $("#bs" + i)?.classList.add("is-on");
      $("#bar").style.width = ((i + 1) / steps.length) * 100 + "%";
      await new Promise((r) => setTimeout(r, i === 1 ? 900 : 650));
      if (i === 1) await saving;
      $("#bs" + i)?.classList.add("is-done");
    }
    setSession(row.email);
    sendMail({ to: row.email, name: row.name, subject: "Welcome to MoBites!", message: `Hi ${firstName(row.name)},\n\nYour MoBites account is ready. Use ${PROMO.code} for ${peso(PROMO.off)} off your first order of ${peso(PROMO.min)} or more.\n\nKain na!\nMoBites` });
    toast(`Welcome, ${firstName(row.name)}! You're now in Member view.`, "checkCircle");
    location.hash = "#/" + (next || "explore");
  },
  async reset(c, form) {
    const hash = await sha256(form.password.value);
    await updateRow("users", c.email, { password_sha256: hash });
    loginGuard.ok("user:" + c.email.toLowerCase());
    sendMail({ to: c.email, name: c.name, subject: "Your MoBites password was reset", message: `Hi ${firstName(c.name)},\n\nYour MoBites password was just reset. If this wasn't you, reset it again right away and contact support.\n\nMoBites` });
    toast("Password reset. Log in with your new password.", "key");
    location.hash = "#/login";
  },
  async password(c) {
    await updateRow("users", c.email, { password_sha256: c.payload.hash });
    sendMail({ to: c.email, name: c.name, subject: "Your MoBites password was changed", message: `Hi ${firstName(c.name)},\n\nYour MoBites password was changed. If this wasn't you, use "Forgot password" right away.\n\nMoBites` });
    toast("Password changed", "key");
    location.hash = "#/profile";
  },
  async delete(c) {
    await deleteRow("users", c.email);
    ["favs_", "earned_", "pay_", "notif_"].forEach((p) => store.del(p + c.email) || store.del(p + c.email.toLowerCase()));
    logout();
    sendMail({ to: c.email, name: c.name, subject: "Your MoBites account was deleted", message: `Hi ${firstName(c.name)},\n\nYour MoBites account and saved details were deleted. Your past orders stay in our records for accounting, without a login attached.\n\nSalamat for eating with us.\nMoBites` });
    location.hash = "#/goodbye";
  },
};

function pageForgot() {
  return {
    html: `<div class="wrap narrow-page">
      <section class="panel verify">
        <div class="ring big-ring">${icon("key", 30)}</div>
        <h1>Forgot your password?</h1>
        <p class="muted">Enter the email you signed up with. We'll send you a code to set a new password.</p>
        <form class="form" id="fform" novalidate style="margin-top:18px;text-align:left">
          <div class="form-alert" id="alert">${icon("alert", 18)}<span></span></div>
          ${field({ id: "email", label: "Email address", type: "email", ph: "juan@email.com", rules: "required email", attrs: 'autocomplete="email"' })}
          <button class="btn btn-primary btn-block" id="go">Send code ${icon("arrowRight", 16)}</button>
        </form>
        <div class="verify-links"><a href="#/login">Back to log in</a></div>
      </section>
    </div>`,
    after(root) {
      const form = $("#fform", root);
      liveValidate(form);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!validateForm(form)) return;
        const u = rows("users").find((x) => x.email.toLowerCase() === form.email.value.trim().toLowerCase());
        if (!u || !u.password_sha256) { $("#alert span", root).textContent = "We couldn't find an account with that email. Check it, or sign up."; $("#alert", root).classList.add("show"); return; }
        $("#go", root).disabled = true;
        await startEmailCheck("reset", u.email, u.name);
        location.hash = "#/verify/reset";
      });
    },
  };
}

function pageGoodbye() {
  return { html: `<div class="wrap narrow-page"><section class="panel verify">
    <div class="ring big-ring">${icon("heart", 30)}</div><h1>Paalam, for now.</h1>
    <p class="muted">Your account was deleted and you've been logged out. We sent a confirmation to your email.</p>
    <div class="actions" style="display:grid;gap:10px;margin-top:18px"><a class="btn btn-primary" href="#/">Back to MoBites</a><a class="btn btn-ghost" href="#/feedback">Tell us why you left</a></div>
  </section></div>` };
}

/* ---------- demo inbox ---------- */
function pageInbox(_, query) {
  const addresses = [];
  try { Object.keys(localStorage).filter((k) => k.startsWith("mb_inbox_")).forEach((k) => addresses.push(k.slice(9))); } catch { /* ignore */ }
  const to = (query.get("to") || currentUser()?.email || addresses[0] || "").toLowerCase();
  const mails = to ? inboxOf(to) : [];
  return {
    html: `<div class="wrap" style="max-width:860px">
      <div class="page-head"><span class="eyebrow">${icon("mail", 16)} Demo inbox</span><h1 style="margin-top:6px">MoBites Mail</h1>
        <p class="muted">Copies of the emails MoBites sent from this browser. ${mailReady() ? "Real emails are also being sent through EmailJS." : "Real email isn't set up yet (see README.md), so this is the only place they show up."}</p></div>
      ${addresses.length > 1 ? `<div class="chips" style="margin-bottom:14px">${addresses.map((a) => `<a class="chip ${a === to ? "is-active" : ""}" href="#/inbox?to=${encodeURIComponent(a)}" style="text-decoration:none">${esc(a)}</a>`).join("")}</div>` : ""}
      <section class="panel">
        <h3>${esc(to || "No emails yet")}</h3>
        ${mails.length ? mails.map((m, i) => `<details class="mail" ${i === 0 ? "open" : ""}><summary><span class="grow"><b>${esc(m.subject)}</b><br><span class="small muted">From MoBites · ${new Date(m.at).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span></span>${m.code ? `<span class="code-pill">${esc(m.code)}</span>` : ""}</summary>
          <div class="mail-body">${esc(m.message).replace(/\n/g, "<br>")}${m.code ? `<button class="btn btn-ghost btn-sm" data-copy="${esc(m.code)}" style="margin-top:12px">Copy code</button>` : ""}</div></details>`).join("")
          : `<div class="empty">${icon("mail", 34)}<p>No emails for this address yet.</p></div>`}
      </section>
    </div>`,
    after(root) {
      $$("[data-copy]", root).forEach((b) => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); } catch { /* blocked */ } toast("Code copied", "check"); });
      timers.push(setInterval(() => { if (inboxOf(to).length !== mails.length) render(); }, 2000));   // new emails show up live
    },
  };
}

ROUTES.push(
  { re: /^verify\/(signup|reset|password|delete)$/, page: pageVerify, title: "Confirm your email" },
  { re: /^forgot$/, page: pageForgot, guestOnly: true, title: "Forgot password" },
  { re: /^goodbye$/, page: pageGoodbye, title: "Account deleted" },
  { re: /^inbox$/, page: pageInbox, title: "Demo inbox" },
);
