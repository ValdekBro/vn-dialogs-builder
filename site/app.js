// VNami website: language switch, download links from the latest GitHub release, videos that play when visible.
(() => {
  const REPO = "ValdekBro/vn-dialogs-builder";
  const RELEASES = `https://github.com/${REPO}/releases/latest`;

  // ── Texts ───────────────────────────────────────────────
  // Ukrainian is in the HTML itself; English replaces it. Keys match data-i18n attributes.
  const EN = {
    "nav.features": "Features",
    "nav.agent": "AI agent",
    "nav.download": "Download",
    "hero.eyebrow": "Free · Windows and macOS",
    "hero.title": "Branching dialogue.<br>Made visible.",
    "hero.lede": "A dialogue editor for visual novels: who says what, where the player chooses, and where every option leads. With an AI co-writer that works right on your canvas.",
    "hero.download": "Download",
    "clients.label": "Works with any agent that speaks MCP",
    "f1.title": "Dialogue as a map, not a document",
    "f1.text": "Every block is one character's lines. Several lines in a block make a choice, and each option gets its own arrow. Branches merge again, loop back or jump to another scene. Anything unfinished is marked red.",
    "f1.p1": "(+) after a block — and keep writing",
    "f1.p2": "Undo and redo for every action",
    "f1.p3": "Autosave every second",
    "f2.title": "Write together <span class=\"nw\">with an AI agent</span>",
    "f2.text": "VNami has a built-in MCP server. Connect Claude, Cursor or another agent and ask it to write a scene: it reads your characters and lore, and its blocks appear on the canvas as it works.",
    "f2.p1": "Claude connects with one button",
    "f2.p2": "Every agent action can be undone",
    "f2.p3": "It deletes only with your approval",
    "f3.title": "Play it like a player",
    "f3.text": "Simulation plays a scene as a chat: lines appear one by one, choices become buttons, jumps carry on into the next scene. If a branch breaks, VNami stops and shows you where.",
    "f3.p1": "Paced by line length, from 0.5× to 3×",
    "f3.p2": "Start from any block with ▶",
    "f3.p3": "Choose with a click or keys 1–9",
    "g1.title": "Characters with character",
    "g1.text": "Colour, backstory and speech style — the agent uses them too.",
    "g2.title": "Export to JSON",
    "g2.text": "A versioned format to take your dialogue into your engine. Import works too.",
    "g3.title": "Local and private",
    "g3.text": "No accounts, no cloud. Your projects stay on your computer.",
    "g4.title": "See what is unfinished",
    "g4.text": "The issue counter takes you straight to the block where a branch ends.",
    "g5.title": "Projects and scenes",
    "g5.text": "Any number of projects and scenes, jumps between scenes and quick switching.",
    "g6.title": "Updates itself",
    "g6.text": "A new version shows a banner in the app. On Windows it is one click.",
    "steps.title": "Connect an agent in a minute",
    "steps.s1": "Press the robot button in VNami's top bar.",
    "steps.s2": "Pick your AI: Claude, Claude Code, Cursor or another.",
    "steps.s3": "Do the one step it shows — for Claude, it's one button.",
    "steps.quote": "“Read the project and finish the «Ярмарок» scene: ГГ buys bagels. Give the player a choice of how to answer.”",
    "dl.title": "Download VNami",
    "dl.sub": "Free. No sign-up.",
    "dl.win": "Windows 10 and 11 · updates itself",
    "dl.arm": "Macs with M1 and newer",
    "dl.intel": "Macs with an Intel processor",
    "dl.note": "Which Mac you have: Apple menu → About This Mac. First launch on Mac: System Settings → Privacy & Security → Open Anyway. The app's interface is in Ukrainian.",
    "footer.changelog": "What's new",
    "footer.releases": "All versions",
    "footer.free": "Free, no accounts, no ads",
  };
  const UK = {};
  for (const el of document.querySelectorAll("[data-i18n]")) UK[el.dataset.i18n] = el.innerHTML;
  const DYNAMIC = {
    uk: { forOs: (os) => `Завантажити для ${os}`, version: (v) => `Версія ${v}`, other: "Інші платформи", title: "VNami — розгалужені діалоги для візуальних новел" },
    en: { forOs: (os) => `Download for ${os}`, version: (v) => `Version ${v}`, other: "Other platforms", title: "VNami — branching dialogue for visual novels" },
  };

  const store = {
    get: () => { try { return localStorage.getItem("vnami-lang"); } catch { return null; } },
    set: (v) => { try { localStorage.setItem("vnami-lang", v); } catch { /* private mode */ } },
  };
  let lang = store.get() || (/^(uk|ru|be)\b/i.test(navigator.language || "") ? "uk" : "en");

  function applyLang(next) {
    lang = next;
    document.documentElement.lang = lang;
    const dict = lang === "en" ? EN : UK;
    for (const el of document.querySelectorAll("[data-i18n]")) {
      const text = dict[el.dataset.i18n];
      if (text !== undefined) el.innerHTML = text;
    }
    for (const b of document.querySelectorAll("[data-lang]")) b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
    document.title = DYNAMIC[lang].title;
    renderDownload();
  }
  for (const b of document.querySelectorAll("[data-lang]")) {
    b.addEventListener("click", () => {
      store.set(b.dataset.lang);
      applyLang(b.dataset.lang);
    });
  }

  // ── Downloads ───────────────────────────────────────────
  const OS_NAME = { win: "Windows", "mac-arm64": "macOS", "mac-x64": "macOS (Intel)" };
  let release = null; // { version, assets: { win, "mac-arm64", "mac-x64" } }
  let visitor = guessVisitor();

  function guessVisitor() {
    const ua = navigator.userAgent;
    if (/Windows/i.test(ua)) return "win";
    if (/Macintosh|Mac OS X/i.test(ua) && !/iPhone|iPad/i.test(ua)) return "mac-arm64";
    return null;
  }
  // Chromium can tell Intel Macs apart; Safari and Firefox cannot, so Apple Silicon is the default.
  navigator.userAgentData?.getHighEntropyValues?.(["architecture"]).then((v) => {
    if (visitor === "mac-arm64" && v.architecture === "x86") {
      visitor = "mac-x64";
      renderDownload();
    }
  }).catch(() => {});

  function renderDownload() {
    const d = DYNAMIC[lang];
    const hero = document.getElementById("hero-download");
    const label = hero.querySelector("span");
    const meta = document.getElementById("hero-meta");
    const url = visitor && release?.assets[visitor];
    if (url) {
      hero.href = url;
      label.textContent = d.forOs(OS_NAME[visitor]);
    } else {
      hero.href = "#download";
      label.textContent = lang === "en" ? EN["hero.download"] : UK["hero.download"];
    }
    meta.innerHTML = release
      ? `${d.version(release.version)} · <a href="#download">${d.other}</a>`
      : "&nbsp;";
    for (const card of document.querySelectorAll("[data-asset]")) {
      const asset = release?.assets[card.dataset.asset];
      card.href = asset || RELEASES;
      card.classList.toggle("recommended", card.dataset.asset === visitor);
      let file = card.querySelector("small");
      if (asset) {
        if (!file) card.append((file = document.createElement("small")));
        file.textContent = decodeURIComponent(asset.split("/").pop());
      }
    }
  }

  fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((data) => {
      const find = (re) => data.assets.find((a) => re.test(a.name))?.browser_download_url;
      release = {
        version: data.tag_name.replace(/^v/, ""),
        assets: { win: find(/Setup.*\.exe$/), "mac-arm64": find(/mac-arm64\.dmg$/), "mac-x64": find(/mac-x64\.dmg$/) },
      };
      renderDownload();
    })
    .catch(() => {}); // Offline or rate-limited: the cards keep linking to the releases page.

  // ── Videos: load and play only while on screen ─────────
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const videos = document.querySelectorAll("video[data-src]");
  const start = (v) => {
    if (!v.src) v.src = v.dataset.src;
    if (reduced) { v.controls = true; return; }
    v.play().catch(() => { v.controls = true; });
  };
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) start(e.target);
        else if (!e.target.paused) e.target.pause();
      }
    }, { rootMargin: "200px 0px", threshold: 0.15 });
    videos.forEach((v) => io.observe(v));
  } else {
    videos.forEach(start);
  }

  // ── Nav border once the page scrolls ───────────────────
  const nav = document.querySelector(".nav");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  applyLang(lang);
})();
