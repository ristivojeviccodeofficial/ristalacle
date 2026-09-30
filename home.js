/* La Clé — početna: destinacije iz baze + Unlock prozor */
(function () {
  "use strict";
  var $ = LC.$, esc = LC.esc;

  // Demo podaci: koriste se SAMO dok Supabase nije podešen (config.js)
  var DEMO = {
    destinations: [
      { slug: "mykonos", name: "Mykonos", emoji: "\u{1F3DD}\uFE0F" },
      { slug: "croatia", name: "Croatia", emoji: "\u26F5" },
      { slug: "montenegro", name: "Montenegro", emoji: "\u26F0\uFE0F" }
    ],
    villas: [
      { destination: "mykonos", name: "Villa Ornos", location: "Ornos, Mykonos", images: [] },
      { destination: "mykonos", name: "Villa Psarou", location: "Psarou, Mykonos", images: [] },
      { destination: "croatia", name: "Villa Dubrovnik", location: "Dubrovnik, Croatia", images: [] },
      { destination: "croatia", name: "Villa Split", location: "Split, Croatia", images: [] },
      { destination: "montenegro", name: "Villa Kotor", location: "Kotor, Montenegro", images: [] },
      { destination: "montenegro", name: "Villa Budva", location: "Budva, Montenegro", images: [] }
    ]
  };

  var ARROW = '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="20" cy="20" r="18"/><path d="M12 20h15M21 13l7 7-7 7"/></svg>';
  var cat = DEMO, cur = null, list = [], idx = 0, opener = null;
  var dlg = $("#dlg"), photo = $("#photo"), dots = $("#dots");

  LC.mountAccount($("#acct"));

  /* Membership = besplatan nalog */
  $("#applyBtn").addEventListener("click", function () {
    if (LC.configured) {
      if (LC.user) LC.toast("You are already a member.");
      else LC.openAuth("register", { note: "Membership is complimentary. Create your account to apply." });
    } else {
      location.href = "mailto:" + LC.C.EMAIL + "?subject=Membership%20application";
    }
  });

  function renderTiles() {
    var g = $("#destGrid");
    if (!cat.destinations.length) { g.innerHTML = '<p class="empty">New destinations are coming soon.</p>'; return; }
    g.innerHTML = cat.destinations.map(function (d) {
      return '<button class="tile" type="button" data-dest="' + esc(d.slug) + '" aria-haspopup="dialog">' +
        '<div><span class="l1">Unlock</span><br><span class="l2">' + esc(d.name) + '</span></div>' + ARROW + '</button>';
    }).join("");
    g.querySelectorAll("[data-dest]").forEach(function (b) {
      b.addEventListener("click", function () { openDest(b.getAttribute("data-dest"), b); });
    });
  }

  async function load() {
    if (LC.configured) {
      try { cat = await LC.loadCatalog(); }
      catch (e) { console.error(e); $("#destGrid").innerHTML = '<p class="empty">Destinations could not be loaded. Please refresh.</p>'; return; }
    }
    renderTiles();
  }

  function openDest(slug, btn) {
    cur = cat.destinations.filter(function (d) { return d.slug === slug; })[0];
    if (!cur) return;
    list = cat.villas.filter(function (v) { return v.destination === slug; });
    idx = 0; opener = btn;
    render();
    dlg.showModal();
  }

  function render() {
    var v = list[idx], empty = !list.length;
    $("#dlgTitle").textContent = "Unlock " + cur.name;
    var old = photo.querySelector(".ph,.real"); if (old) old.remove();
    var el, img = v && v.images && v.images[0];
    if (img) { el = document.createElement("img"); el.className = "real"; el.src = img; el.alt = v.name; }
    else { el = document.createElement("div"); el.className = "ph"; el.innerHTML = '<span class="em">' + esc(cur.emoji || "") + '</span><span>' + (empty ? "Coming soon" : "Property photo") + '</span>'; }
    photo.insertBefore(el, photo.firstChild);

    $("#prev").hidden = $("#next").hidden = list.length < 2;
    dots.innerHTML = "";
    if (list.length > 1) list.forEach(function (_, i) { var b = document.createElement("i"); if (i === idx) b.className = "on"; dots.appendChild(b); });

    $("#count").textContent = empty ? "" : (idx + 1) + " / " + list.length;
    $("#vName").textContent = empty ? "New villas are coming soon" : v.name;
    $("#vLoc").textContent = empty ? cur.name : (v.location || "");
    $("#inq").textContent = empty ? "Ask about " + cur.name : "Inquire now";
    var more = $("#vMore");
    more.hidden = empty || !v.id;
    if (!more.hidden) more.href = "villa.html?id=" + encodeURIComponent(v.id);
  }

  function go(step) { if (list.length < 2) return; idx = (idx + step + list.length) % list.length; render(); }

  $("#prev").addEventListener("click", function () { go(-1); });
  $("#next").addEventListener("click", function () { go(1); });
  $("#dlgClose").addEventListener("click", function () { dlg.close(); });
  $("#inq").addEventListener("click", function () {
    var v = list[idx];
    var target = v ? { id: v.id, name: v.name, location: v.location } : { id: null, name: "General inquiry: " + cur.name, location: cur.name };
    dlg.close();
    LC.openInquiry(target);
  });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", function () { if (opener && !document.querySelector("dialog[open]")) opener.focus(); });
  dlg.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") go(-1); else if (e.key === "ArrowRight") go(1);
  });
  var sx = null;
  photo.addEventListener("touchstart", function (e) { sx = e.touches[0].clientX; }, { passive: true });
  photo.addEventListener("touchend", function (e) {
    if (sx === null) return;
    var dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    sx = null;
  });

  load();
})();
