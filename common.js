/* La Clé — zajednički kod: Supabase klijent, nalozi, forma za upit, chat */
(function () {
  "use strict";

  var C = window.LACLE || {};
  var ok = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY && !/YOUR-/.test(C.SUPABASE_URL) && window.supabase);
  var sb = ok ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY) : null;
  var LC = (window.LC = { sb: sb, configured: !!sb, C: C, user: null, profile: null, ready: false, _l: [] });

  var $ = function (s, r) { return (r || document).querySelector(s); };
  LC.$ = $;
  LC.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  LC.toast = function (msg) {
    var t = document.createElement("div");
    t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3800);
  };
  LC.wa = function (text) { return "https://wa.me/" + C.WHATSAPP + "?text=" + encodeURIComponent(text); };
  LC.fmtTime = function (iso) {
    return new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };
  LC.onAuth = function (fn) { LC._l.push(fn); if (LC.ready) fn(LC.user); };
  function emit() { LC._l.forEach(function (f) { try { f(LC.user); } catch (e) { console.error(e); } }); }

  var X_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  /* ---------- Profil / sesija ---------- */
  LC.loadProfile = async function () {
    if (!sb || !LC.user) { LC.profile = null; return; }
    var r = await sb.from("profiles").select("*").eq("id", LC.user.id).maybeSingle();
    LC.profile = r.data || null;
  };

  LC.init = async function () {
    if (!sb) { LC.ready = true; emit(); return; }
    var s = await sb.auth.getSession();
    LC.user = (s.data.session && s.data.session.user) || null;
    await LC.loadProfile();
    LC.ready = true;
    emit();
    sb.auth.onAuthStateChange(function (event, session) {
      if (event === "INITIAL_SESSION") return;
      LC.user = (session && session.user) || null;
      // bez await unutar callback-a (izbegava deadlock u supabase-js)
      setTimeout(async function () {
        await LC.loadProfile();
        emit();
        if (event === "PASSWORD_RECOVERY") LC.openAuth("newpass");
      }, 0);
    });
  };

  LC.signOut = async function () { if (sb) { await sb.auth.signOut(); LC.user = null; LC.profile = null; emit(); } };

  /* ---------- Dugme "Sign in / Account" u headeru ---------- */
  LC.mountAccount = function (el) {
    if (!el) return;
    if (!LC.configured) { el.hidden = true; return; }
    LC.onAuth(function (u) {
      if (!u) {
        el.innerHTML = '<button class="pill" type="button" id="acctIn">Sign in</button>';
        $("#acctIn", el).onclick = function () { LC.openAuth("login"); };
      } else {
        var name = (LC.profile && LC.profile.full_name) || u.email;
        var admin = LC.profile && LC.profile.is_admin;
        el.innerHTML = '<span>' + LC.esc(name.split(" ")[0]) + '</span>' +
          (admin ? '<a class="pill" href="admin.html">Admin</a>' : '') +
          '<button class="pill" type="button" id="acctOut">Sign out</button>';
        $("#acctOut", el).onclick = function () { LC.signOut(); };
      }
    });
  };

  /* ---------- Katalog (destinacije + vile) ---------- */
  LC.loadCatalog = async function () {
    var r = await Promise.all([
      sb.from("destinations").select("*").eq("published", true).order("sort").order("name"),
      sb.from("villas").select("*").eq("published", true).order("sort").order("created_at")
    ]);
    if (r[0].error) throw r[0].error;
    if (r[1].error) throw r[1].error;
    return { destinations: r[0].data || [], villas: r[1].data || [] };
  };

  /* ---------- Ubacivanje dijaloga ---------- */
  function injectDialogs() {
    if (document.body.dataset.widgets === "off" || $("#authDlg")) return;
    document.body.insertAdjacentHTML("beforeend",
      '<dialog id="authDlg" aria-labelledby="authTitle"><div class="dlg">' +
        '<h3 id="authTitle"></h3>' +
        '<button class="x" type="button" data-close aria-label="Close">' + X_SVG + '</button>' +
        '<p class="note" id="authNote"></p>' +
        '<form id="authForm" novalidate>' +
          '<div class="field" id="fName"><label for="aName">Full name</label><input id="aName" autocomplete="name" maxlength="120"></div>' +
          '<div class="field" id="fEmail"><label for="aEmail">Email</label><input id="aEmail" type="email" autocomplete="email" maxlength="200"></div>' +
          '<div class="field" id="fPass"><label for="aPass">Password</label><input id="aPass" type="password" minlength="8" maxlength="72"></div>' +
          '<p class="err" id="authErr" role="alert"></p>' +
          '<button class="inq" id="authSubmit" type="submit"></button>' +
        '</form>' +
        '<p class="switch"><button class="link" type="button" id="authSwitch"></button><button class="link" type="button" id="authForgot">Forgot password?</button></p>' +
      '</div></dialog>' +

      '<dialog id="inqDlg" aria-labelledby="inqTitle"><div class="dlg">' +
        '<h3 id="inqTitle">Inquire</h3>' +
        '<button class="x" type="button" data-close aria-label="Close">' + X_SVG + '</button>' +
        '<p class="note" id="inqNote"></p>' +
        '<form id="inqForm" novalidate>' +
          '<div class="field hp" aria-hidden="true"><label for="iWeb">Website</label><input id="iWeb" tabindex="-1" autocomplete="off"></div>' +
          '<div class="row2">' +
            '<div class="field"><label for="iName">Full name</label><input id="iName" autocomplete="name" maxlength="120"></div>' +
            '<div class="field"><label for="iEmail">Email</label><input id="iEmail" type="email" autocomplete="email" maxlength="200"></div>' +
          '</div>' +
          '<div class="row3">' +
            '<div class="field"><label for="iPhone">Phone</label><input id="iPhone" type="tel" autocomplete="tel" maxlength="60"></div>' +
            '<div class="field"><label for="iIn">Check-in</label><input id="iIn" type="date"></div>' +
            '<div class="field"><label for="iOut">Check-out</label><input id="iOut" type="date"></div>' +
          '</div>' +
          '<div class="field"><label for="iGuests">Guests</label><input id="iGuests" type="number" min="1" max="100" inputmode="numeric"></div>' +
          '<div class="field"><label for="iMsg">Message</label><textarea id="iMsg" maxlength="4000" placeholder="Tell us about your plans"></textarea></div>' +
          '<p class="err" id="inqErr" role="alert"></p>' +
          '<button class="inq" id="inqSubmit" type="submit">Send inquiry</button>' +
        '</form>' +
        '<div id="inqDone" hidden>' +
          '<p style="text-align:center;font-size:1.15rem" class="ok">Thank you. Your inquiry has been sent.</p>' +
          '<a class="inq secondary" id="inqWa" target="_blank" rel="noopener" href="#">Continue on WhatsApp</a>' +
        '</div>' +
      '</div></dialog>'
    );
    document.querySelectorAll("dialog").forEach(function (d) {
      d.addEventListener("click", function (e) { if (e.target === d || e.target.closest("[data-close]")) d.close(); });
    });
    wireAuth();
    wireInquiry();
  }

  /* ---------- Auth dijalog ---------- */
  var authMode = "login", authAfter = null;
  function setMode(mode, note) {
    authMode = mode;
    var T = {
      login:    ["Sign in", "Sign in", "Create an account", true, false, true],
      register: ["Create account", "Create account", "I already have an account", true, true, false],
      forgot:   ["Reset password", "Send reset link", "Back to sign in", true, false, false],
      newpass:  ["New password", "Save password", "", false, false, false]
    }[mode];
    $("#authTitle").textContent = T[0];
    $("#authSubmit").textContent = T[1];
    $("#authSwitch").textContent = T[2];
    $("#authSwitch").hidden = !T[2];
    $("#fEmail").hidden = !T[3];
    $("#fName").hidden = !T[4];
    $("#fPass").hidden = mode === "forgot";
    $("#authForgot").hidden = !T[5];
    $("#aPass").autocomplete = mode === "login" ? "current-password" : "new-password";
    $("#authNote").textContent = note || (mode === "register" ? "Membership is complimentary." : "");
    $("#authNote").hidden = !$("#authNote").textContent;
    $("#authErr").textContent = ""; $("#authErr").className = "err";
  }
  LC.openAuth = function (mode, opts) {
    if (!LC.configured || !$("#authDlg")) return;
    authAfter = (opts && opts.after) || null;
    setMode(mode || "login", opts && opts.note);
    var d = $("#authDlg"); if (d && !d.open) d.showModal();
  };
  function wireAuth() {
    $("#authSwitch").onclick = function () { setMode(authMode === "login" ? "register" : "login"); };
    $("#authForgot").onclick = function () { setMode("forgot"); };
    $("#authForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      var err = $("#authErr"), btn = $("#authSubmit");
      var email = $("#aEmail").value.trim(), pass = $("#aPass").value, name = $("#aName").value.trim();
      err.className = "err"; err.textContent = "";
      if (authMode !== "newpass" && !/^\S+@\S+\.\S+$/.test(email)) { err.textContent = "Enter a valid email address."; return; }
      if ((authMode === "register" || authMode === "newpass") && pass.length < 8) { err.textContent = "Password must be at least 8 characters."; return; }
      if (authMode === "login" && !pass) { err.textContent = "Enter your password."; return; }
      if (authMode === "register" && !name) { err.textContent = "Enter your full name."; return; }
      btn.disabled = true;
      try {
        if (authMode === "login") {
          var r = await sb.auth.signInWithPassword({ email: email, password: pass });
          if (r.error) throw r.error;
          LC.user = r.data.user; await LC.loadProfile(); emit();
          $("#authDlg").close(); LC.toast("Welcome back");
          if (authAfter) authAfter();
        } else if (authMode === "register") {
          var s = await sb.auth.signUp({ email: email, password: pass, options: { data: { full_name: name } } });
          if (s.error) throw s.error;
          if (s.data.session) {
            LC.user = s.data.user; await LC.loadProfile(); emit();
            $("#authDlg").close(); LC.toast("Account created. Welcome to La Clé.");
            if (authAfter) authAfter();
          } else {
            err.className = "err ok";
            err.textContent = "Check your email to confirm your account, then sign in.";
          }
        } else if (authMode === "forgot") {
          var f = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
          if (f.error) throw f.error;
          err.className = "err ok"; err.textContent = "Reset link sent. Check your email.";
        } else if (authMode === "newpass") {
          var u = await sb.auth.updateUser({ password: pass });
          if (u.error) throw u.error;
          $("#authDlg").close(); LC.toast("Password updated");
        }
      } catch (ex) {
        err.textContent = ex.message || "Something went wrong. Try again.";
      } finally { btn.disabled = false; }
    });
  }

  /* ---------- Forma za upit (rent / inquire) ---------- */
  var inqVilla = null;
  LC.openInquiry = function (villa) {
    inqVilla = villa || null;
    var label = villa && villa.name ? villa.name + (villa.location ? " — " + villa.location : "") : "";
    if (!LC.configured) {
      window.open(LC.wa("Hello La Clé, I'd like to inquire" + (label ? " about " + label : "") + "."), "_blank", "noopener");
      return;
    }
    $("#inqTitle").textContent = villa && villa.name ? "Inquire: " + villa.name : "Inquire";
    $("#inqNote").textContent = villa && villa.location ? villa.location : "";
    $("#inqNote").hidden = !$("#inqNote").textContent;
    $("#inqForm").hidden = false; $("#inqDone").hidden = true;
    $("#inqErr").textContent = "";
    if (LC.profile) {
      if (!$("#iName").value) $("#iName").value = LC.profile.full_name || "";
      if (!$("#iEmail").value) $("#iEmail").value = LC.profile.email || "";
      if (!$("#iPhone").value) $("#iPhone").value = LC.profile.phone || "";
    }
    var today = new Date().toISOString().slice(0, 10);
    $("#iIn").min = today; $("#iOut").min = today;
    $("#inqDlg").showModal();
  };
  function wireInquiry() {
    $("#inqForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      var err = $("#inqErr"), btn = $("#inqSubmit");
      err.textContent = "";
      var v = {
        name: $("#iName").value.trim(), email: $("#iEmail").value.trim(), phone: $("#iPhone").value.trim(),
        ci: $("#iIn").value, co: $("#iOut").value, guests: parseInt($("#iGuests").value, 10), msg: $("#iMsg").value.trim()
      };
      if (!v.name) { err.textContent = "Enter your name."; return; }
      if (!/^\S+@\S+\.\S+$/.test(v.email)) { err.textContent = "Enter a valid email address."; return; }
      if (v.ci && v.co && v.co < v.ci) { err.textContent = "Check-out must be after check-in."; return; }
      var label = inqVilla && inqVilla.name ? inqVilla.name : "";
      if ($("#iWeb").value) { finish(label); return; } // honeypot (botovi)
      btn.disabled = true;
      var row = {
        villa_id: (inqVilla && inqVilla.id) || null,
        villa_name: label || null,
        user_id: LC.user ? LC.user.id : null,
        name: v.name, email: v.email, phone: v.phone || null,
        check_in: v.ci || null, check_out: v.co || null,
        guests: isNaN(v.guests) ? null : v.guests,
        message: v.msg || null
      };
      var r = await sb.from("inquiries").insert(row);
      btn.disabled = false;
      if (r.error) { err.textContent = "Could not send your inquiry. Please try again or use WhatsApp."; return; }
      finish(label);
    });
  }
  function finish(label) {
    $("#inqForm").hidden = true; $("#inqDone").hidden = false;
    $("#inqWa").href = LC.wa("Hello La Clé, I just sent an inquiry" + (label ? " about " + label : "") + ".");
    $("#iMsg").value = "";
  }

  /* ---------- Chat ---------- */
  var chat = { conv: null, channel: null, ids: {}, open: false, unread: 0 };

  function buildChat() {
    if (!LC.configured || document.body.dataset.widgets === "off" || $("#chatFab")) return;
    document.body.insertAdjacentHTML("beforeend",
      '<button class="chat-fab" id="chatFab" type="button" aria-label="Chat with us">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>' +
        '<span class="badge" id="chatBadge" hidden></span></button>' +
      '<section class="chat-panel" id="chatPanel" hidden aria-label="Chat with La Clé">' +
        '<header><strong>Chat with La Clé</strong><button class="x sm" id="chatClose" type="button" aria-label="Close chat">' + X_SVG + '</button></header>' +
        '<div class="chat-msgs" id="chatMsgs" aria-live="polite"></div>' +
        '<form id="chatForm"><input id="chatInput" maxlength="2000" placeholder="Write a message" autocomplete="off" aria-label="Message">' +
        '<button class="send" type="submit" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg></button></form>' +
      '</section>');
    $("#chatFab").onclick = function () { chat.open ? closeChat() : LC.openChat(); };
    $("#chatClose").onclick = closeChat;
    $("#chatForm").addEventListener("submit", sendChat);
    LC.onAuth(chatAuth);
  }

  function renderEmpty() {
    if (!$("#chatMsgs").children.length) {
      $("#chatMsgs").innerHTML = '<div class="chat-empty">Write to us and we will reply here.</div>';
    }
  }
  function addMsg(m) {
    if (chat.ids[m.id]) return;
    chat.ids[m.id] = 1;
    var box = $("#chatMsgs"), e = box.querySelector(".chat-empty"); if (e) e.remove();
    var b = document.createElement("div");
    b.className = "bubble " + (m.from_admin ? "them" : "me");
    b.textContent = m.body;
    var t = document.createElement("time"); t.textContent = LC.fmtTime(m.created_at); b.appendChild(t);
    box.appendChild(b); box.scrollTop = box.scrollHeight;
    if (m.from_admin && !m.is_read) {
      if (chat.open) markRead(); else { chat.unread++; badge(); }
    }
  }
  function badge() {
    var el = $("#chatBadge"); if (!el) return;
    el.hidden = !chat.unread; el.textContent = chat.unread;
  }
  async function markRead() {
    if (!chat.conv) return;
    chat.unread = 0; badge();
    await sb.from("messages").update({ is_read: true }).eq("conversation_id", chat.conv.id).eq("from_admin", true).eq("is_read", false);
  }
  async function loadConv() {
    var r = await sb.from("conversations").select("*").eq("user_id", LC.user.id).maybeSingle();
    chat.conv = r.data || null;
    $("#chatMsgs").innerHTML = ""; chat.ids = {}; chat.unread = 0; badge();
    if (chat.conv) {
      var m = await sb.from("messages").select("*").eq("conversation_id", chat.conv.id).order("created_at").limit(200);
      (m.data || []).forEach(addMsg);
      subscribe();
    }
    renderEmpty();
  }
  function subscribe() {
    if (chat.channel) sb.removeChannel(chat.channel);
    chat.channel = sb.channel("chat-" + chat.conv.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "conversation_id=eq." + chat.conv.id },
        function (p) { addMsg(p.new); })
      .subscribe();
  }
  function chatAuth(u) {
    if (!u) {
      if (chat.channel) { sb.removeChannel(chat.channel); chat.channel = null; }
      chat.conv = null; chat.unread = 0; chat.ids = {}; badge();
      $("#chatMsgs").innerHTML = ""; closeChat();
    } else {
      loadConv();
    }
  }
  LC.openChat = function () {
    if (!LC.configured) { window.open(LC.wa("Hello La Clé"), "_blank", "noopener"); return; }
    if (!LC.user) { LC.openAuth("login", { note: "Sign in to chat with us.", after: LC.openChat }); return; }
    chat.open = true; $("#chatPanel").hidden = false;
    renderEmpty(); markRead();
    setTimeout(function () { $("#chatInput").focus(); var b = $("#chatMsgs"); b.scrollTop = b.scrollHeight; }, 50);
  };
  function closeChat() { chat.open = false; var p = $("#chatPanel"); if (p) p.hidden = true; }
  async function sendChat(e) {
    e.preventDefault();
    var inp = $("#chatInput"), body = inp.value.trim();
    if (!body || !LC.user) return;
    inp.value = "";
    if (!chat.conv) {
      var c = await sb.from("conversations").insert({ user_id: LC.user.id }).select().single();
      if (c.error) { var g = await sb.from("conversations").select("*").eq("user_id", LC.user.id).maybeSingle(); chat.conv = g.data; }
      else chat.conv = c.data;
      if (!chat.conv) { LC.toast("Could not start the chat."); return; }
      subscribe();
    }
    var r = await sb.from("messages").insert({ conversation_id: chat.conv.id, sender_id: LC.user.id, from_admin: false, body: body }).select().single();
    if (r.error) { LC.toast("Message not sent. Try again."); inp.value = body; return; }
    addMsg(r.data);
  }

  /* ---------- Start ---------- */
  function start() {
    injectDialogs();
    buildChat();
    LC.init();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
