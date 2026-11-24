/* Morrow: interface logic + Firebase (Auth and Firestore). Classic script, no build step. */
(() => {
  "use strict";

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

  // Hooks the Firebase layer fills in (the app works without them)
  const toastEl = document.createElement("div");
  toastEl.className = "toast"; toastEl.setAttribute("role", "status"); document.body.appendChild(toastEl);
  function toast(m, ms) { toastEl.textContent = m; toastEl.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove("on"), ms || 2800); }
  const H = window.Morrow = { toast, beforeStart: go => go(), studying() {}, session() {}, onSubjects() {}, onTasks() {}, onPrefs() {}, onPapers() {}, onTab() {}, canStart: () => true, onCountdowns() {}, running() {}, notify() {}, getDays: () => ({}), signedIn: () => false };

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ } }
  };

  /* ============================================================
     MICRO-INTERACTIONS
     ============================================================ */

  // Ripple (delegated, so it also works on elements created later)
  document.addEventListener("pointerdown", e => {
    if (reduce) return;
    const el = e.target.closest('[data-fx~="ripple"]');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2;
    const dot = document.createElement("span");
    dot.className = "fx-ripple";
    dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    el.appendChild(dot);
    dot.addEventListener("animationend", () => dot.remove());
  });

  // Magnetic (mouse only, so touch scrolling never moves the button)
  $$('[data-fx~="magnetic"]').forEach(el => {
    if (reduce) return;
    const strength = 0.3, max = 14;
    const clamp = v => Math.max(-max, Math.min(max, v));
    el.addEventListener("pointermove", e => {
      if (e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--tx", clamp((e.clientX - (r.left + r.width / 2)) * strength) + "px");
      el.style.setProperty("--ty", clamp((e.clientY - (r.top + r.height / 2)) * strength) + "px");
    });
    el.addEventListener("pointerleave", () => {
      el.style.setProperty("--tx", "0px");
      el.style.setProperty("--ty", "0px");
    });
  });

  // Tilt (subtle)
  $$('[data-fx~="tilt"]').forEach(el => {
    if (reduce) return;
    el.addEventListener("pointermove", e => {
      if (e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--ry", (((e.clientX - r.left) / r.width - 0.5) * 8).toFixed(2) + "deg");
      el.style.setProperty("--rx", ((0.5 - (e.clientY - r.top) / r.height) * 8).toFixed(2) + "deg");
    });
    el.addEventListener("pointerleave", () => {
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
    });
  });

  // Cursor spotlight
  $$('[data-fx~="spot"]').forEach(el => {
    el.addEventListener("pointermove", e => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", (e.clientX - r.left) + "px");
      el.style.setProperty("--my", (e.clientY - r.top) + "px");
    });
  });

  // Particle burst
  function burst(x, y, count = 12, spread = 1) {
    if (reduce) return;
    const color = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#3b4cff";
    for (let i = 0; i < count; i++) {
      const p = document.createElement("span");
      p.className = "fx-particle";
      p.style.background = color;
      document.body.appendChild(p);
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const dist = (30 + Math.random() * 26) * spread;
      const anim = p.animate([
        { transform: `translate(${x - 4}px, ${y - 4}px) scale(1)`, opacity: 1 },
        { transform: `translate(${x - 4 + Math.cos(angle) * dist}px, ${y - 4 + Math.sin(angle) * dist}px) scale(0)`, opacity: 0 }
      ], { duration: 560 + Math.random() * 220, easing: "cubic-bezier(.2,.8,.3,1)" });
      anim.onfinish = () => p.remove();
    }
  }

  function shake(el) {
    if (reduce) return;
    el.animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }],
      { duration: 240, easing: "ease-in-out" }
    );
  }

  // Sliding indicator used by the sidebar and the mode switch
  function place(indicator, target, animate = true) {
    if (!indicator || !target || !target.offsetWidth) return;
    if (!animate) indicator.style.transition = "none";
    indicator.style.width = target.offsetWidth + "px";
    indicator.style.height = target.offsetHeight + "px";
    indicator.style.transform = `translate(${target.offsetLeft}px, ${target.offsetTop}px)`;
    if (!animate) { void indicator.offsetWidth; indicator.style.transition = ""; }
    indicator.classList.add("ready");
  }

  /* ============================================================
     COLOR HELPERS
     ============================================================ */
  const hexToRgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const luminance = c => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const onColor = c => luminance(c) > 0.2 ? "#14171f" : "#ffffff";
  const hexOk = h => typeof h === "string" && /^#[0-9a-f]{6}$/i.test(h);

  /* ============================================================
     TASKS (ticked tasks clear themselves quietly)
     ============================================================ */
  const sample = []; const _unused = [
    { id: 1, text: "Read chapter 4", done: false },
    { id: 2, text: "Finish the problem set", done: false },
    { id: 3, text: "Review yesterday's notes", done: false }
  ];
  let tasks = store.get("focus-tasks", null);
  if (!Array.isArray(tasks)) tasks = sample;
  tasks = tasks
    .filter(t => t && typeof t.text === "string")
    .map(t => ({ id: Number(t.id) || 0, text: t.text, done: !!t.done }));
  let nextId = tasks.reduce((m, t) => Math.max(m, t.id), 0) + 1;

  const list = $("#taskList"), empty = $("#taskEmpty"), meta = $("#taskMeta"), now = $("#now");
  const saveTasks = () => { store.set("focus-tasks", tasks); H.onTasks(tasks); };

  function clearDone() {
    if (!tasks.some(t => t.done)) return;
    tasks = tasks.filter(t => !t.done);
    saveTasks();
    renderTasks();
  }

  function renderNow() {
    const t = tasks.find(x => !x.done);
    now.textContent = "";
    if (t) {
      now.append("Working on ");
      const s = document.createElement("strong");
      s.textContent = t.text;
      now.appendChild(s);
    } else {
      now.textContent = "No task selected. Add one in Tasks.";
    }
  }

  function renderTasks(popId) {
    list.textContent = "";
    tasks.forEach(t => {
      const li = document.createElement("li");
      li.className = "task" + (t.done ? " done" : "");
      li.dataset.id = t.id;

      const check = document.createElement("button");
      check.type = "button";
      check.className = "check" + (t.id === popId && t.done ? " pop" : "");
      check.setAttribute("role", "checkbox");
      check.setAttribute("aria-checked", String(t.done));
      check.setAttribute("aria-label", (t.done ? "Mark not done: " : "Mark done: ") + t.text);
      check.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

      const text = document.createElement("span");
      text.className = "task-text";
      text.textContent = t.text;

      const del = document.createElement("button");
      del.type = "button";
      del.className = "del";
      del.setAttribute("aria-label", "Delete task: " + t.text);
      del.innerHTML = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

      li.append(check, text, del);
      list.appendChild(li);
    });
    const done = tasks.filter(t => t.done).length;
    empty.hidden = tasks.length > 0;
    meta.textContent = tasks.length ? `${done} of ${tasks.length} done` : "";
    renderNow();
  }

  list.addEventListener("click", e => {
    const li = e.target.closest(".task");
    if (!li) return;
    const id = Number(li.dataset.id);
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    if (e.target.closest(".check")) {
      task.done = !task.done;
      if (task.done) {
        const r = e.target.closest(".check").getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2);
      }
      saveTasks();
      renderTasks(id);
    } else if (e.target.closest(".subj-del")) {
      li.classList.add("leaving");
      setTimeout(() => {
        tasks = tasks.filter(t => t.id !== id);
        saveTasks();
        renderTasks();
      }, reduce ? 0 : 180);
    }
  });

  $("#taskForm").addEventListener("submit", e => {
    e.preventDefault();
    const input = $("#taskInput");
    const value = input.value.trim();
    if (!value) { shake(input); input.focus(); return; }
    tasks.push({ id: nextId++, text: value, done: false });
    input.value = "";
    saveTasks();
    renderTasks();
    input.focus();
  });

  // Ticked tasks go when the person leaves the page, switches browser tab, or leaves the Tasks tab
  document.addEventListener("visibilitychange", () => { if (document.hidden) clearDone(); });
  window.addEventListener("pagehide", clearDone);

  /* ============================================================
     TABS
     ============================================================ */
  const tabs = $$(".tab");
  const titles = { timer: "Timer", tasks: "Tasks", subjects: "Subjects", progress: "Progress", papers: "Paper progress", countdown: "Countdown", pulse: "Pulse", ranking: "Ranking", preferences: "Preferences" };
  const navIndicator = $("#navIndicator");
  const segIndicator = $("#segIndicator");
  let currentTab = "timer";

  function showTab(name) {
    if (currentTab === "tasks" && name !== "tasks") clearDone();
    currentTab = name;
    document.documentElement.dataset.tab = name;
    tabs.forEach(t => {
      const on = t.dataset.tab === name;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    });
    $$(".panel").forEach(p => { p.hidden = p.id !== "panel-" + name; });
    $("#pageTitle").textContent = titles[name];
    place(navIndicator, $('.tab[aria-selected="true"]'));
    if (name === "timer") place(segIndicator, $('#seg [aria-pressed="true"]'), false);
    H.onTab(name);
    if (H.ready) {
      H.markSeen(name);
      if (name === "papers") H.drawPapers(true);
      if (name === "countdown") H.renderCountdown(true);
      const cur = $('.tab[aria-selected="true"]'); if (cur && cur.scrollIntoView) cur.scrollIntoView({ inline: "center", block: "nearest" });
    }
  }

  tabs.forEach(t => t.addEventListener("click", () => showTab(t.dataset.tab)));
  $(".nav").addEventListener("keydown", e => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let n = null;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") n = (i + 1) % tabs.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = tabs.length - 1;
    if (n === null) return;
    e.preventDefault();
    tabs[n].focus();
    showTab(tabs[n].dataset.tab);
  });

  /* ============================================================
     PREFERENCES
     ============================================================ */
  const defaults = { timer: 30, focus: 25, short: 5, long: 15, sound: true, auto: false, dark: null, nav: "left", ghost: false, awake: true };
  const saved = store.get("focus-prefs", {});
  const prefs = Object.assign({}, defaults, saved && typeof saved === "object" ? saved : {});
  const limits = { timer: [1, 99], focus: [1, 90], short: [1, 30], long: [1, 60] };
  Object.keys(limits).forEach(k => {
    const n = Math.round(Number(prefs[k]));
    prefs[k] = Number.isFinite(n) ? Math.min(limits[k][1], Math.max(limits[k][0], n)) : defaults[k];
  });
  const savePrefs = () => { store.set("focus-prefs", prefs); H.onPrefs(prefs); };
  const isDark = () => prefs.dark === null ? darkQuery.matches : !!prefs.dark;

  function applyTheme() {
    document.documentElement.dataset.theme = isDark() ? "dark" : "light";
  }

  function syncPrefControls() {
    $$(".stepper").forEach(s => { $("output", s).textContent = prefs[s.dataset.key]; });
    $$(".switch").forEach(sw => {
      const key = sw.dataset.pref;
      sw.setAttribute("aria-checked", String(key === "dark" ? isDark() : !!prefs[key]));
    });
  }

  $$(".stepper").forEach(s => {
    s.addEventListener("click", e => {
      const b = e.target.closest("[data-step]");
      if (!b) return;
      const key = s.dataset.key;
      prefs[key] = Math.min(+s.dataset.max, Math.max(+s.dataset.min, prefs[key] + +b.dataset.step));
      $("output", s).textContent = prefs[key];
      savePrefs();
      timer.afterPrefChange(key);
    });
  });

  $$(".switch").forEach(sw => {
    sw.addEventListener("click", () => {
      const key = sw.dataset.pref;
      const next = sw.getAttribute("aria-checked") !== "true";
      if (key === "dark") { prefs.dark = next; applyTheme(); applyAccent(); }
      else prefs[key] = next;
      sw.setAttribute("aria-checked", String(next));
      savePrefs();
    });
  });

  /* ============================================================
     SUBJECTS (the active subject sets the color of the whole site)
     ============================================================ */
  const navs = ["top", "left", "right", "bottom"];
  function applyNav() {
    if (!navs.includes(prefs.nav)) prefs.nav = "left";
    document.documentElement.dataset.nav = prefs.nav;
    $$("#navOpts [data-nav]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.nav === prefs.nav)));
    requestAnimationFrame(() => place(navIndicator, $('.tab[aria-selected="true"]'), false));
  }

  const PALETTE = [
    ["Lavender", "#b9aee8"], ["Periwinkle", "#a9b8ee"], ["Sky", "#9fc9e6"], ["Mint", "#a4d8c0"],
    ["Sage", "#b7d3a0"], ["Butter", "#ecd89a"], ["Peach", "#f0bf9f"], ["Rose", "#eeb2c0"]
  ];
  const baseSubjects = [
    { id: "mathematics", name: "Combined Mathematics", color: "#b9aee8", locked: false },
    { id: "physics", name: "Physics", color: "#9fc9e6", locked: false },
    { id: "chemistry", name: "Chemistry", color: "#a4d8c0", locked: false }
  ];
  const OLD = { mathematics: ["Mathematics", "#8b5cf6"], physics: ["Physics", "#3b4cff"], chemistry: ["Chemistry", "#1fa971"] };
  const migrate = list => list.map(s => {   // upgrade the earlier default subjects to the new pale ones
    const o = OLD[s.id];
    if (o && s.name === o[0] && String(s.color).toLowerCase() === o[1]) { const b = baseSubjects.find(x => x.id === s.id); return Object.assign({}, s, { name: b.name, color: b.color }); }
    return s;
  });
  let subjects = store.get("focus-subjects", null);
  if (Array.isArray(subjects)) {
    subjects = subjects
      .filter(s => s && typeof s.id === "string" && typeof s.name === "string" && s.name.trim() && hexOk(s.color))
      .map(s => ({ id: s.id, name: s.name.trim().slice(0, 24), color: s.color.toLowerCase(), locked: false }));
  } else {
    subjects = baseSubjects.map(s => Object.assign({}, s));
  }
  subjects = migrate(subjects);
  if (!subjects.length) subjects = baseSubjects.map(s => Object.assign({}, s));
  let activeId = store.get("focus-subject", subjects[0].id);
  if (!subjects.some(s => s.id === activeId)) activeId = subjects[0].id;

  const subjectBox = $("#subjects");
  const subjectForm = $("#subjectForm");
  const nameInput = $("#subjectName");
  const swatchBox = $("#swatches");
  const activeSubject = () => subjects.find(s => s.id === activeId) || subjects[0];
  const subjectList = () => subjects.map(s => ({ id: s.id, name: s.name, color: s.color }));
  const saveSubjects = () => { store.set("focus-subjects", subjectList()); H.onSubjects(subjectList()); };

  function applyAccent() {
    let c = hexToRgb(activeSubject().color);
    c = isDark() ? mix(c, [255, 255, 255], 0.12) : mix(c, [0, 0, 0], 0.12);
    const c2 = mix(c, [255, 255, 255], 0.4);
    const root = document.documentElement.style;
    root.setProperty("--accent", `rgb(${c.join(",")})`);
    root.setProperty("--accent-2", `rgb(${c2.join(",")})`);
    root.setProperty("--on-accent", onColor(c));
    root.setProperty("--accent-soft", `rgba(${c.join(",")},${isDark() ? 0.18 : 0.11})`);
    root.setProperty("--accent-mid", `rgba(${c.join(",")},.3)`);
  }

  function updateSelected() {
    $$(".chip[data-id]", subjectBox).forEach(chip => {
      const on = chip.dataset.id === activeId;
      chip.classList.toggle("on", on);
      $(".chip-main", chip).setAttribute("aria-pressed", String(on));
    });
  }

  function renderSubjects() {
    subjectBox.textContent = "";
    subjects.forEach(s => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.dataset.id = s.id;
      chip.style.setProperty("--c", s.color);
      chip.style.setProperty("--oc", onColor(hexToRgb(s.color)));

      const main = document.createElement("button");
      main.type = "button";
      main.className = "chip-main";
      main.dataset.fx = "ripple";
      const dot = document.createElement("i");
      dot.className = "chip-dot";
      main.append(dot, document.createTextNode(s.name));
      chip.appendChild(main);

      subjectBox.appendChild(chip);
    });

    const add = document.createElement("span");
    add.className = "chip add";
    add.innerHTML = '<button type="button" class="chip-main" id="manageSubjects" data-fx="ripple">Edit subjects</button>';
    subjectBox.appendChild(add);
    updateSelected();
    if (H.ready) H.afterSubjects();
  }

  function selectSubject(id) {
    if (id === activeId) return;
    if (timer.running || (timer.isFocus() && timer.elapsed() > 0)) return toast("Save or reset the session before switching subject");
    activeId = id;
    store.set("focus-subject", activeId);
    applyAccent();
    updateSelected();
  }

  function deleteSubject(id) {
    const s = subjects.find(x => x.id === id);
    if (!s) return;
    if (subjects.length < 2) return toast("Keep at least one subject");
    if (timer.running && activeId === id) return toast("Pause the timer before deleting this subject");
    subjects = subjects.filter(x => x.id !== id);
    if (activeId === id) { activeId = subjects[0].id; store.set("focus-subject", activeId); applyAccent(); }
    saveSubjects();
    renderSubjects();
    const next = $('.chip[data-id] .chip-main', subjectBox);
    if (next) next.focus();
  }

  subjectBox.addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    if (e.target.closest("#manageSubjects")) { showTab("subjects"); return; }
    const id = chip.dataset.id;
    if (!id) return;
    if (e.target.closest(".chip-x")) deleteSubject(id);
    else if (e.target.closest(".chip-main")) selectSubject(id);
  });

  // Add-subject form
  let pickColor = PALETTE[0][1];
  let customChosen = false;
  const customInput = document.createElement("input");
  customInput.type = "color";
  customInput.value = "#0ea5e9";
  customInput.setAttribute("aria-label", "Custom color");
  const customSwatch = document.createElement("label");
  customSwatch.className = "swatch custom";
  customSwatch.appendChild(customInput);

  function markSwatches() {
    $$("button.swatch", swatchBox).forEach(b => b.setAttribute("aria-pressed", String(!customChosen && b.dataset.hex === pickColor)));
    customSwatch.classList.toggle("chosen", customChosen);
    customSwatch.setAttribute("aria-pressed", String(customChosen));
    if (customChosen) customSwatch.style.setProperty("--c", pickColor);
  }

  function renderSwatches() {
    swatchBox.textContent = "";
    PALETTE.forEach(([label, hex]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "swatch";
      b.dataset.hex = hex;
      b.style.setProperty("--c", hex);
      b.setAttribute("aria-label", label);
      swatchBox.appendChild(b);
    });
    swatchBox.appendChild(customSwatch);
    markSwatches();
  }

  swatchBox.addEventListener("click", e => {
    const b = e.target.closest("button.swatch");
    if (!b) return;
    pickColor = b.dataset.hex;
    customChosen = false;
    markSwatches();
  });
  customInput.addEventListener("input", () => {
    pickColor = customInput.value.toLowerCase();
    customChosen = true;
    markSwatches();
  });

  function toggleForm(open) {
    subjectForm.hidden = !open;
    const b = $("#addSubjectBtn");
    if (b) b.setAttribute("aria-expanded", String(open));
    if (open) {
      const used = subjects.map(s => s.color);
      const free = PALETTE.find(p => !used.includes(p[1]));
      pickColor = (free || PALETTE[0])[1];
      customChosen = false;
      renderSwatches();
      nameInput.focus({ preventScroll: true });
    }
  }

  subjectForm.addEventListener("submit", e => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const dup = subjects.some(s => s.name.toLowerCase() === name.toLowerCase());
    if (!name || dup) { shake(nameInput); nameInput.focus(); return; }
    const s = { id: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, color: pickColor, locked: false };
    subjects.push(s);
    saveSubjects();
    nameInput.value = "";
    toggleForm(false);
    renderSubjects();
    applyAccent();
  });
  $("#cancelSubject").addEventListener("click", () => { nameInput.value = ""; toggleForm(false); });
  nameInput.addEventListener("keydown", e => { if (e.key === "Escape") toggleForm(false); });

  /* ============================================================
     TIMER and POMODORO
     Uses real timestamps, so it never drifts, even in a background tab.
     ============================================================ */
  const NS = "http://www.w3.org/2000/svg";
  const ringWrap = $("#ringWrap");
  const ring = $("#ring");
  const head = $("#head");
  const C = 2 * Math.PI * 100;
  ring.style.strokeDasharray = C.toFixed(2);

  // 60 ticks around the dial; they go out as time runs down
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const a = (i * Math.PI) / 30;
    const r1 = 109, r2 = i % 5 === 0 ? 119 : 115;
    const l = document.createElementNS(NS, "line");
    l.setAttribute("class", "tick");
    l.setAttribute("x1", (120 + r1 * Math.sin(a)).toFixed(2));
    l.setAttribute("y1", (120 - r1 * Math.cos(a)).toFixed(2));
    l.setAttribute("x2", (120 + r2 * Math.sin(a)).toFixed(2));
    l.setAttribute("y2", (120 - r2 * Math.cos(a)).toFixed(2));
    $("#ticks").appendChild(l);
    return l;
  });

  const digits = $$("#time .d");
  const statusEl = $("#status");
  const startBtn = $("#startBtn");
  const startLabel = $(".label", startBtn);
  const skipBtn = $("#skipBtn");
  const presetsEl = document.createElement("div"); // stopwatch has no length presets
  const cycleEl = $("#cycle");
  const pips = $$(".pip", cycleEl);
  const modeButtons = $$("#seg [data-mode]");
  const PHASE = { focus: "Focus", short: "Short break", long: "Long break" };

  const timeEl = $("#time");
  function setTime(str) {
    if (timeEl.children.length !== str.length) {
      timeEl.textContent = "";
      for (const ch of str) { const s = document.createElement("span"); s.className = ch === ":" ? "colon" : "d"; timeEl.appendChild(s); }
    }
    timeEl.classList.toggle("long", str.length > 5);
    Array.from(str).forEach((ch, i) => { timeEl.children[i].textContent = ch; });
  }

  const timer = {
    mode: "stopwatch", phase: "focus", cycle: 0,
    totalMs: 0, remainingMs: 0, endAt: 0, accMs: 0, t0: 0,
    running: false, paused: false, finished: false,
    handle: 0, raf: 0, lastStr: "", lastLit: -1,

    elapsed() { if (this.mode === "stopwatch") return Math.floor((this.running ? Date.now() - this.t0 : this.accMs) / 1000); const ms = this.running ? Math.max(0, this.endAt - Date.now()) : this.remainingMs; return Math.round((this.totalMs - ms) / 1000); },
    isFocus() { return this.mode === "stopwatch" || this.phase === "focus"; },
    lengthKey() { return this.mode === "stopwatch" ? "" : this.phase; },
    resetLength() { this.accMs = 0; if (this.mode === "stopwatch") { this.totalMs = 0; this.remainingMs = 0; return; } this.totalMs = prefs[this.lengthKey()] * 60000; this.remainingMs = this.totalMs; },

    setMode(mode) {
      this.halt();
      this.mode = mode;
      this.phase = "focus";
      this.cycle = 0;
      this.paused = false;
      this.finished = false;
      this.resetLength();
      modeButtons.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
      place(segIndicator, $('#seg [aria-pressed="true"]'));
      presetsEl.hidden = mode !== "timer";
      cycleEl.hidden = mode !== "pomodoro";
      skipBtn.hidden = mode !== "pomodoro";
      this.refresh();
    },

    setPhase(phase) {
      this.halt();
      this.phase = phase;
      this.paused = false;
      this.finished = false;
      this.resetLength();
      this.refresh();
    },

    halt() {
      clearInterval(this.handle);
      cancelAnimationFrame(this.raf);
      this.handle = 0;
      this.raf = 0;
      if (this.running) { if (this.mode === "stopwatch") this.accMs = Date.now() - this.t0; else this.remainingMs = Math.max(0, this.endAt - Date.now()); }
      if (this.running && this.isFocus()) H.studying(false);
      if (this.running) H.running(false);
      this.running = false;
      ringWrap.classList.remove("running");
    },

    start() {
      if (this.running || !H.canStart()) return;
      if (this.mode === "stopwatch") this.t0 = Date.now() - this.accMs;
      else { if (this.remainingMs <= 0) this.resetLength(); this.endAt = Date.now() + this.remainingMs; }
      this.running = true;
      this.paused = false;
      this.finished = false;
      ringWrap.classList.add("running");
      if (this.isFocus()) H.studying(true);
      H.running(true);
      this.handle = setInterval(() => this.tick(), 250);
      this.loop();
      this.refresh();
    },

    pause() {
      this.halt();
      this.paused = true;
      this.refresh();
    },

    reset() {
      this.halt();
      this.paused = false;
      this.finished = false;
      this.resetLength();
      this.refresh();
    },

    tick() {
      if (this.mode === "pomodoro" && this.endAt - Date.now() <= 0) this.finish();
    },

    loop() {
      this.paint();
      if (this.running) this.raf = requestAnimationFrame(() => this.loop());
    },

    finish() {
      const counts = this.isFocus(), secs = Math.round(this.totalMs / 1000);
      this.halt();
      H.notify(counts ? "Focus session complete" : "Break is over", this.mode === "pomodoro" ? (counts ? "Nice work. Time for a break." : "Ready for the next focus session?") : "Session finished");
      if (counts) H.session(secs, activeSubject().name);
      this.remainingMs = 0;
      this.paint();
      celebrate();
      if (prefs.sound) beep();
      if (this.mode === "pomodoro") {
        this.advance(true);
        if (prefs.auto) this.start();
        else { this.finished = true; this.refresh(); }
      } else {
        this.finished = true;
        this.refresh();
      }
    },

    // Move to the next pomodoro phase. Skipping a focus session does not count it.
    advance(count) {
      let next = "focus";
      if (this.phase === "focus") {
        if (count) this.cycle += 1;
        next = count && this.cycle % 4 === 0 ? "long" : "short";
      }
      this.setPhase(next);
    },

    afterPrefChange(key) {
      if (key === this.lengthKey() && !this.running && !this.paused) {
        this.resetLength();
        this.refresh();
      }
      syncPresets();
    },

    statusText() {
      const pomodoro = this.mode === "pomodoro";
      if (this.running) return pomodoro ? PHASE[this.phase] : "In progress";
      if (this.paused) return "Paused";
      if (this.finished) return pomodoro ? "Up next: " + PHASE[this.phase] : "Finished";
      return pomodoro ? PHASE[this.phase] : "Ready";
    },

    refresh() {
      statusEl.textContent = this.statusText();
      startLabel.textContent = this.running ? "Pause" : this.paused ? "Resume" : "Start";
      if (this.mode === "pomodoro") {
        const done = this.phase === "long" ? 4 : this.cycle % 4;
        pips.forEach((p, i) => {
          p.classList.toggle("on", i < done);
          p.classList.toggle("cur", this.phase === "focus" && i === done);
        });
        $("#cycleLabel").textContent = this.phase === "focus" ? `Session ${done + 1} of 4` : PHASE[this.phase];
      }
      syncPresets();
      this.lastStr = "";
      this.paint();
      this.setTitle();
    },

    setTitle() {
      const t = this.lastStr;
      document.title = this.running && t ? t + " · Morrow" : "Morrow";
    },

    paint() {
      let disp, f;
      if (this.mode === "stopwatch") {
        const ms = this.running ? Date.now() - this.t0 : this.accMs, s = Math.floor(ms / 1000), p = n => String(n).padStart(2, "0");
        const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
        f = (ms % 60000) / 60000;            // the ring fills once every minute
        disp = (h ? h + ":" : "") + p(m) + ":" + p(s % 60);
      } else {
        const ms = this.running ? Math.max(0, this.endAt - Date.now()) : this.remainingMs, sec = Math.ceil(ms / 1000);
        f = this.totalMs ? Math.min(1, ms / this.totalMs) : 0;
        disp = String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
      }
      ring.style.strokeDashoffset = (C * (1 - f)).toFixed(2);
      head.style.transform = `rotate(${(360 * f).toFixed(2)}deg)`;
      const lit = Math.ceil(f * 60);
      if (lit !== this.lastLit) { ticks.forEach((t, i) => t.classList.toggle("on", i < lit)); this.lastLit = lit; }
      if (disp !== this.lastStr) { setTime(disp); this.lastStr = disp; this.setTitle(); }
    }
  };

  function syncPresets() {
    $$(".preset", presetsEl).forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.min === prefs.timer)));
  }

  function celebrate() {
    ringWrap.classList.remove("flash");
    void ringWrap.offsetWidth;
    ringWrap.classList.add("flash");
    if ($("#panel-timer").hidden) return;
    const r = ringWrap.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, 18, 3);
  }
  ringWrap.addEventListener("animationend", e => { if (e.animationName === "flash") ringWrap.classList.remove("flash"); });

  function beep() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.65);
      osc.onended = () => ctx.close();
    } catch (e) { /* audio unavailable */ }
  }

  startBtn.addEventListener("click", () => { if (timer.running) timer.pause(); else H.beforeStart(() => timer.start()); });
  $("#saveBtn").addEventListener("click", () => {
    if (!timer.isFocus()) return toast("Breaks are not saved");
    const sec = timer.elapsed();
    if (sec < 1) return toast("Start the timer first");
    H.beforeStart(() => { H.session(timer.elapsed(), activeSubject().name); timer.reset(); });
  });
  $("#resetBtn").addEventListener("click", () => timer.reset());
  skipBtn.addEventListener("click", () => timer.advance(false));
  modeButtons.forEach(b => b.addEventListener("click", () => { if (b.dataset.mode !== timer.mode) timer.setMode(b.dataset.mode); }));

  presetsEl.addEventListener("click", e => {
    const b = e.target.closest(".preset");
    if (!b) return;
    prefs.timer = +b.dataset.min;
    savePrefs();
    syncPrefControls();
    timer.reset();
  });

  /* ============================================================
     INIT
     ============================================================ */
  clearDone();            // anything ticked last time is already gone
  applyTheme();
  applyNav();
  applyAccent();
  syncPrefControls();
  renderSubjects();
  renderSwatches();
  timer.setMode("stopwatch");
  renderTasks();
  showTab("timer");

  const relayout = () => {
    place(navIndicator, $('.tab[aria-selected="true"]'), false);
    if (!$("#panel-timer").hidden) place(segIndicator, $('#seg [aria-pressed="true"]'), false);
  };
  window.addEventListener("resize", relayout);
  window.addEventListener("load", relayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
  darkQuery.addEventListener("change", () => { syncPrefControls(); applyTheme(); applyAccent(); });


  /* ============================================================
     WAVE around the dial (like a music player while it plays)
     ============================================================ */
  const cv = $("#wave"), cx = cv.getContext("2d");
  let amp = 0, col = "#3b4cff", fr = 0;
  (function wave(t) {
    if (cv.offsetParent) {
      if (fr++ % 15 === 0) col = getComputedStyle(ringWrap).getPropertyValue("--accent").trim() || col;
      amp += ((ringWrap.classList.contains("running") && !reduce ? 1 : 0) - amp) * 0.06;
      const W = cv.width, c = W / 2, n = 84, r = 332;
      cx.clearRect(0, 0, W, W); cx.strokeStyle = col; cx.lineWidth = 7; cx.lineCap = "round";
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, h = 3 + amp * (10 + 48 * Math.abs(Math.sin(t / 360 + i * 0.55) * Math.cos(t / 900 + i * 0.21)));
        cx.globalAlpha = 0.25 + 0.6 * amp;
        cx.beginPath(); cx.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r); cx.lineTo(c + Math.cos(a) * (r + h), c + Math.sin(a) * (r + h)); cx.stroke();
      }
    }
    requestAnimationFrame(wave);
  })(0);

  $$("#navOpts [data-nav]").forEach(b => b.addEventListener("click", () => { prefs.nav = b.dataset.nav; savePrefs(); applyNav(); }));

  /* ============================================================
     SUBJECTS TAB: add, rename, recolor, remove
     ============================================================ */
  const escH = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const subjList = $("#subjList");
  let palOpen = null, listLock = false;

  function renderSubjectList() {
    subjList.textContent = "";
    subjects.forEach((s, i) => {
      const li = document.createElement("li");
      li.className = "card subj-row"; li.dataset.id = s.id; li.style.setProperty("--c", s.color); li.style.animationDelay = i * 40 + "ms";
      li.innerHTML = '<button type="button" class="sw" aria-label="Change color of ' + escH(s.name) + '" aria-expanded="' + (palOpen === s.id) + '"></button>' +
        '<input class="field" type="text" maxlength="24" aria-label="Subject name"><button type="button" class="btn ghost small subj-del" data-fx="ripple">Remove</button>';
      $("input", li).value = s.name;
      const pal = document.createElement("div");
      pal.className = "pal"; pal.hidden = palOpen !== s.id;
      PALETTE.forEach(([label, hex]) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "swatch"; b.dataset.hex = hex; b.style.setProperty("--c", hex);
        b.setAttribute("aria-label", label); b.setAttribute("aria-pressed", String(hex === s.color));
        pal.appendChild(b);
      });
      const cl = document.createElement("label"), ci = document.createElement("input");
      cl.className = "swatch custom"; ci.type = "color"; ci.value = s.color; ci.setAttribute("aria-label", "Custom color");
      cl.appendChild(ci); pal.appendChild(cl); li.appendChild(pal); subjList.appendChild(li);
    });
  }
  const rowOf = e => { const li = e.target.closest(".subj-row"); return li ? subjects.find(s => s.id === li.dataset.id) : null; };
  function setColor(s, hex, live) {
    s.color = hex; saveSubjects();
    listLock = !!live; renderSubjects(); listLock = false; applyAccent();
    if (live) { const li = $('.subj-row[data-id="' + s.id + '"]', subjList); if (li) li.style.setProperty("--c", hex); }
  }
  subjList.addEventListener("click", e => {
    const s = rowOf(e); if (!s) return;
    if (e.target.closest(".sw")) { palOpen = palOpen === s.id ? null : s.id; renderSubjectList(); return; }
    const sw = e.target.closest("button.swatch"); if (sw) { setColor(s, sw.dataset.hex); return; }
    if (e.target.closest(".del")) deleteSubject(s.id);
  });
  subjList.addEventListener("input", e => { if (e.target.type === "color") { const s = rowOf(e); if (s) setColor(s, e.target.value.toLowerCase(), true); } });
  subjList.addEventListener("change", e => {
    if (e.target.type !== "text") return;
    const s = rowOf(e); if (!s) return;
    const name = e.target.value.trim().slice(0, 24);
    if (!name || subjects.some(x => x.id !== s.id && x.name.toLowerCase() === name.toLowerCase())) { e.target.value = s.name; shake(e.target); return toast(name ? "That subject already exists" : "A subject needs a name"); }
    s.name = name; saveSubjects(); renderSubjects();
  });
  $("#addSubjectBtn").addEventListener("click", () => toggleForm(subjectForm.hidden));

  /* ============================================================
     PAPER PROGRESS: marks per paper, averages, improvement
     ============================================================ */
  const skey = n => String(n).trim().toLowerCase();
  const validPaper = p => p && typeof p.id === "string" && typeof p.subject === "string" && Number.isFinite(+p.score) && +p.max > 0 && /^\d{4}-\d{2}-\d{2}$/.test(p.date || "");
  const cleanPaper = p => ({ id: p.id, subject: p.subject.slice(0, 24), name: String(p.name || "").slice(0, 40), score: +p.score, max: +p.max, date: p.date, ts: +p.ts || 0 });
  let papers = (() => { const p = store.get("focus-papers", []); return Array.isArray(p) ? p.filter(validPaper).map(cleanPaper) : []; })();
  let ppFilter = "all", ppChart = null;
  const savePapers = () => { store.set("focus-papers", papers); H.onPapers(papers); };
  const pct = p => (p.score / p.max) * 100;
  const f1 = n => String(Math.round(n * 10) / 10);
  const dToday = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const byDate = list => list.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.ts - b.ts);
  const mean = list => list.length ? list.reduce((a, p) => a + pct(p), 0) / list.length : 0;
  const subjColor = name => { const s = subjects.find(x => skey(x.name) === skey(name)); return s ? s.color : "#b4bac4"; };
  const lblDate = d => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const deltaPill = d => '<span class="dlt ' + (d >= 0 ? "up" : "down") + '">' + (d >= 0 ? "▲ +" : "▼ ") + f1(d) + "</span>";

  function renderPapers() {
    // subject select + date default
    const sel = $("#ppSubject"), cur = sel.value;
    sel.innerHTML = subjects.map(s => '<option value="' + escH(s.name) + '">' + escH(s.name) + "</option>").join("");
    if (subjects.some(s => s.name === cur)) sel.value = cur;

    const all = byDate(papers), n = all.length;
    const last = n ? pct(all[n - 1]) : 0, prevAvg = n > 1 ? mean(all.slice(0, -1)) : null;
    const card = (t, v, extra) => '<div class="stat card"><span>' + t + "</span><strong" + (v === "–" ? ' class="dim"' : "") + ">" + v + (extra || "") + "</strong></div>";
    $("#ppStats").innerHTML =
      card("Average", n ? f1(mean(all)) + "%" : "–") +
      card("Best", n ? f1(Math.max(...all.map(pct))) + "%" : "–") +
      card("Latest", n ? f1(last) + "%" : "–") +
      card("Latest vs average", prevAvg === null ? "–" : (last - prevAvg >= 0 ? "+" : "") + f1(last - prevAvg) + " pts");

    // filter chips
    const names = subjects.map(s => s.name);
    all.forEach(p => { if (!names.some(x => skey(x) === skey(p.subject))) names.push(p.subject); });
    if (ppFilter !== "all" && !names.some(x => skey(x) === ppFilter)) ppFilter = "all";
    $("#ppChips").innerHTML = '<span class="chip' + (ppFilter === "all" ? " on" : "") + '" style="--c:var(--accent);--oc:var(--on-accent)"><button type="button" class="chip-main" data-k="all">All subjects</button></span>' +
      names.map(nm => { const c = subjColor(nm); return '<span class="chip' + (ppFilter === skey(nm) ? " on" : "") + '" style="--c:' + c + ";--oc:" + onColor(hexToRgb(c)) + '"><button type="button" class="chip-main" data-k="' + escH(skey(nm)) + '"><i class="chip-dot"></i>' + escH(nm) + "</button></span>"; }).join("");

    // per-subject summary
    const rows = names.map(nm => {
      const L = all.filter(p => skey(p.subject) === skey(nm)); if (!L.length) return "";
      const a = mean(L), lt = pct(L[L.length - 1]), c = subjColor(nm), pa = L.length > 1 ? mean(L.slice(0, -1)) : null;
      return '<li class="pp-row" style="--c:' + c + '"><span class="nm"><i class="pdot"></i>' + escH(nm) + ' <small>' + L.length + (L.length === 1 ? " paper" : " papers") + '</small></span>' +
        "<span><b>" + f1(a) + "%</b> avg · latest " + f1(lt) + "% · best " + f1(Math.max(...L.map(pct))) + "% " + (pa === null ? "" : deltaPill(lt - pa)) + "</span>" +
        '<span class="meter"><i style="width:' + Math.min(100, a) + "%;background:" + c + '"></i></span></li>';
    }).join("");
    $("#ppSubjects").innerHTML = rows || '<li class="empty">Your subject averages will show up here.</li>';

    // recent papers
    $("#ppList").innerHTML = all.length ? all.slice().reverse().slice(0, 12).map(p => '<li class="pp-row" style="--c:' + subjColor(p.subject) + '"><span class="nm"><i class="pdot"></i>' + escH(p.subject) + (p.name ? " · " + escH(p.name) : "") + " <small>" + lblDate(p.date) + "</small></span><span><b>" + f1(p.score) + "/" + f1(p.max) + "</b> · " + f1(pct(p)) + '% <button type="button" class="btn ghost small pp-del" data-id="' + escH(p.id) + '" data-fx="ripple">Delete</button></span></li>').join("") : '<li class="empty">No papers yet. Add your first marks above.</li>';
  }

  function drawPapers(animate) {
    const cv = $("#ppChart"), empty = $("#ppEmpty");
    if (ppChart) { ppChart.destroy(); ppChart = null; }
    const base = byDate(ppFilter === "all" ? papers : papers.filter(p => skey(p.subject) === ppFilter));
    empty.hidden = base.length > 0; cv.parentElement.hidden = base.length === 0;
    if (!base.length || typeof Chart === "undefined" || !cv.offsetParent) return;
    const css = getComputedStyle(document.documentElement), mu = css.getPropertyValue("--muted").trim(), ink = css.getPropertyValue("--ink").trim();
    const dates = [...new Set(base.map(p => p.date))], m = mean(base), flat = dates.map(() => +m.toFixed(1)), datasets = [];
    if (ppFilter === "all") {
      [...new Map(base.map(p => [skey(p.subject), p.subject])).values()].forEach(nm => {
        const L = base.filter(p => skey(p.subject) === skey(nm)), c = subjColor(nm);
        datasets.push({ label: nm, data: dates.map(d => { const x = L.filter(p => p.date === d); return x.length ? +mean(x).toFixed(1) : null; }), borderColor: c, backgroundColor: c, borderWidth: 2.5, tension: 0.3, pointRadius: 4, spanGaps: true });
      });
      datasets.push({ label: "Overall average", data: flat, borderColor: ink, borderDash: [6, 6], borderWidth: 1.5, pointRadius: 0 });
    } else {
      const c = subjColor(ppFilter), scores = dates.map(d => +mean(base.filter(p => p.date === d)).toFixed(1));
      let sum = 0, cnt = 0;
      const running = dates.map(d => { base.filter(p => p.date === d).forEach(p => { sum += pct(p); cnt++; }); return +(sum / cnt).toFixed(1); });
      datasets.push({ label: "Marks", data: scores, borderColor: c, backgroundColor: c, borderWidth: 3, tension: 0.3, pointRadius: 5, pointBackgroundColor: scores.map(s => s >= m ? "#6fbf97" : "#e29a9a"), pointBorderColor: c });
      datasets.push({ label: "Running average", data: running, borderColor: ink, borderWidth: 1.5, tension: 0.3, pointRadius: 0, borderColor: mu });
      datasets.push({ label: "Average", data: flat, borderColor: ink, borderDash: [6, 6], borderWidth: 1.5, pointRadius: 0 });
    }
    ppChart = new Chart(cv, { type: "line", data: { labels: dates.map(lblDate), datasets },
      options: { maintainAspectRatio: false, animation: animate ? { duration: 1400, easing: "easeOutQuart" } : false, interaction: { mode: "index", intersect: false },
        scales: { x: { ticks: { color: mu, maxTicksLimit: 8 }, grid: { display: false } }, y: { min: 0, max: 100, ticks: { color: mu, callback: v => v + "%" }, grid: { color: "rgba(128,128,128,.15)" } } },
        plugins: { legend: { labels: { color: mu, usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: c => c.dataset.label + ": " + c.parsed.y + "%" } } } } });
  }

  $("#ppForm").addEventListener("submit", e => {
    e.preventDefault();
    const subject = $("#ppSubject").value, score = parseFloat($("#ppMarks").value), max = parseFloat($("#ppMax").value) || 100;
    if (!subject) return toast("Add a subject first");
    if (!Number.isFinite(score) || score < 0 || score > max) { shake($("#ppMarks")); return toast("Marks must be between 0 and " + f1(max)); }
    papers.push({ id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), subject, name: $("#ppName").value.trim().slice(0, 40), score, max, date: dToday(), ts: Date.now() });
    if (papers.length > 600) papers = byDate(papers).slice(-600);
    savePapers(); $("#ppMarks").value = ""; $("#ppName").value = ""; renderPapers(); drawPapers(true); toast("Paper added");
  });
  $("#ppList").addEventListener("click", e => {
    const b = e.target.closest(".pp-del"); if (!b) return;
    papers = papers.filter(p => p.id !== b.dataset.id); savePapers(); renderPapers(); drawPapers(true);
  });
  $("#ppChips").addEventListener("click", e => { const b = e.target.closest("[data-k]"); if (b) { ppFilter = b.dataset.k; renderPapers(); drawPapers(true); } });

  /* "New" badges disappear once the tab has been opened */
  const seen = store.get("focus-seen", {});
  $$(".tab .new").forEach(b => { if (seen[b.closest(".tab").dataset.tab]) b.remove(); });

  Object.assign(H, {
    getPapers: () => papers,
    applyPapers(list) {
      papers = (Array.isArray(list) ? list : []).filter(validPaper).map(cleanPaper);
      store.set("focus-papers", papers); renderPapers(); drawPapers(false);
    },
    afterSubjects() { if (!listLock) renderSubjectList(); renderPapers(); drawPapers(false); fillCdSubjects(); },
    markSeen(name) { if (seen[name]) return; seen[name] = 1; store.set("focus-seen", seen); const b = $('.tab[data-tab="' + name + '"] .new'); if (b) b.remove(); },
    drawPapers
  });
  H.ready = true;
  renderSubjectList(); renderPapers();

  /* ============================================================
     COUNTDOWN: exams and milestones (compact array in the profile)
     ============================================================ */
  const cdKey = n => String(n).trim().toLowerCase().replace(/[.~*\/\[\]]/g, "_").slice(0, 30);
  const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const dayStr = n => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
  const validCd = c => c && typeof c.id === "string" && typeof c.name === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.date || "");
  const cleanCd = c => ({ id: c.id, name: c.name.slice(0, 50), date: c.date, time: /^\d{2}:\d{2}$/.test(c.time || "") ? c.time : "00:00", created: +c.created || Date.now(), subject: String(c.subject || "").slice(0, 24), pinned: !!c.pinned, main: !!c.main });
  const defaultCds = () => [{ id: "al2027", name: "2027 A/L Examination", date: "2027-08-03", time: "08:30", created: Date.now(), subject: "", pinned: true, main: true }];
  const normCds = list => {
    if (list.length && !list.some(c => c.main)) list[0].main = true;
    let seenMain = false; list.forEach(c => { if (c.main && seenMain) c.main = false; if (c.main) seenMain = true; });
    return list;
  };
  let cds = (() => { const raw = store.get("focus-countdowns", null); return normCds(Array.isArray(raw) ? raw.filter(validCd).map(cleanCd) : defaultCds()); })();
  store.set("focus-countdowns", cds);
  let cdEditing = null;
  const cdTarget = c => new Date(c.date + "T" + c.time + ":00").getTime();
  const cdSave = () => { store.set("focus-countdowns", cds); H.onCountdowns(cds); renderCountdown(); };
  const cdBadgeText = ms => { const d = Math.floor(ms / 864e5); return d >= 1 ? "D-" + d : Math.max(0, Math.ceil(ms / 36e5)) + "H"; };
  const cdWhen = t => new Date(t).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  const cdActions = (c, isMain) => '<div class="cd-actions">' +
    '<button type="button" class="btn ghost small" data-act="pin" data-id="' + escH(c.id) + '" aria-pressed="' + c.pinned + '">' + (c.pinned ? "Unpin from timer" : "Pin to timer") + "</button>" +
    (isMain ? "" : '<button type="button" class="btn ghost small" data-act="main" data-id="' + escH(c.id) + '">Make main</button>') +
    '<button type="button" class="btn ghost small" data-act="edit" data-id="' + escH(c.id) + '">Edit</button>' +
    '<button type="button" class="btn ghost small" data-act="del" data-id="' + escH(c.id) + '">Delete</button></div>';

  function cdPace(c, left) {
    if (left <= 0) return "";
    if (!H.signedIn()) return "Sign in and log some sessions to see your pace.";
    const D = H.getDays(), k = c.subject ? cdKey(c.subject) : null, val = x => !x ? 0 : k ? ((x.by || {})[k] || 0) : (x.total || 0);
    let week = 0; for (let i = 0; i < 7; i++) week += val(D[dayStr(i)]);
    const avg = week / 7 / 3600, since = ymd(new Date(c.created)); let done = 0;
    Object.keys(D).forEach(d => { if (d >= since) done += val(D[d]); });
    const tag = c.subject ? " on " + c.subject : "", logged = "You have logged " + f1(done / 3600) + " hrs" + tag + " since this goal was created.";
    if (avg <= 0) return "Log a few sessions and your pace will show up here. " + logged;
    return "At your current 7-day average (" + f1(avg) + " hrs/day" + tag + "), you will log " + Math.round(avg * left / 864e5) + " more focus hours before this date. " + logged;
  }

  function renderCountdown(animate) {
    const now = Date.now(), main = cds.find(c => c.main), hero = $("#cdHero");
    if (!main) hero.innerHTML = '<div class="empty">No countdown yet. Add your exam or a milestone below.</div>';
    else {
      const t = cdTarget(main), left = t - now, span = Math.max(1, t - main.created), pc = Math.min(100, Math.max(0, (now - main.created) / span * 100));
      const d = Math.floor(left / 864e5), h = Math.floor(left % 864e5 / 36e5), m = Math.floor(left % 36e5 / 6e4);
      hero.innerHTML = '<div class="cd-eyebrow">Main countdown' + (main.pinned ? " · pinned to timer" : "") + '</div><div class="cd-name">' + escH(main.name) + "</div>" +
        '<div class="cd-big">' + (left > 0 ? "<span>" + d + "</span><small>DAYS</small><span>" + h + "</span><small>HRS</small><span>" + m + "</span><small>MIN</small>" : "<span>Done</span>") + "</div>" +
        '<div class="cd-date">' + cdWhen(t) + (main.subject ? " · " + escH(main.subject) : "") + "</div>" +
        '<p class="cd-pace">' + escH(cdPace(main, left)) + "</p>" +
        '<div class="cd-bar"><i style="width:' + (animate ? 0 : pc) + '%"></i></div>' +
        '<div class="cd-meta"><span>' + f1(pc) + "% of the time has passed</span><span>Goal set " + lblDate(ymd(new Date(main.created))) + "</span></div>" + cdActions(main, true);
      if (animate) requestAnimationFrame(() => requestAnimationFrame(() => { const b = $(".cd-bar i", hero); if (b) b.style.width = pc + "%"; }));
    }
    const others = cds.filter(c => !c.main).sort((a, b) => cdTarget(a) - cdTarget(b));
    $("#cdList").innerHTML = others.length ? others.map(c => {
      const left = cdTarget(c) - now;
      return '<li class="cd-item"><div><b>' + escH(c.name) + '</b><div class="cd-sub">' + cdWhen(cdTarget(c)) + (c.subject ? ' <span class="pill">' + escH(c.subject) + "</span>" : "") + '</div></div><span class="dbadge">' + (left > 0 ? cdBadgeText(left) : "Done") + "</span>" + cdActions(c, false) + "</li>";
    }).join("") : '<li class="empty">Add smaller targets such as a term test or a past paper goal.</li>';
    // small badge above the timer clock
    const pin = cds.filter(c => c.pinned && cdTarget(c) > now).sort((a, b) => cdTarget(a) - cdTarget(b))[0], bd = $("#cdBadge");
    bd.hidden = !pin; if (pin) { bd.textContent = cdBadgeText(cdTarget(pin) - now); bd.title = pin.name + ". Open Countdown"; }
  }

  const cdForm = $("#cdForm");
  function fillCdSubjects() {
    const sel = $("#cdSubject"), cur = sel.value;
    sel.innerHTML = '<option value="">No linked subject</option>' + subjects.map(s => '<option value="' + escH(s.name) + '">' + escH(s.name) + "</option>").join("");
    sel.value = Array.from(sel.options).some(o => o.value === cur) ? cur : "";
  }
  function openCdForm(c) {
    cdEditing = c ? c.id : null; cdForm.hidden = false; fillCdSubjects();
    $("#cdFormTitle").textContent = c ? "Edit countdown" : "New countdown";
    $("#cdName").value = c ? c.name : ""; $("#cdDate").value = c ? c.date : ""; $("#cdTime").value = c ? c.time : "08:00"; $("#cdSubject").value = c ? c.subject : "";
    $("#cdName").focus(); cdForm.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  $("#cdNew").addEventListener("click", () => openCdForm(null));
  $("#cdCancel").addEventListener("click", () => { cdForm.hidden = true; cdEditing = null; });
  cdForm.addEventListener("submit", e => {
    e.preventDefault();
    const name = $("#cdName").value.trim().slice(0, 50), date = $("#cdDate").value, time = $("#cdTime").value || "00:00", subject = $("#cdSubject").value;
    if (!name) { shake($("#cdName")); return toast("Give the countdown a name"); }
    if (!date) { shake($("#cdDate")); return toast("Choose a date"); }
    if (cdEditing) { const c = cds.find(x => x.id === cdEditing); if (c) Object.assign(c, { name, date, time, subject }); }
    else cds.push({ id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, date, time, created: Date.now(), subject, pinned: false, main: cds.length === 0 });
    normCds(cds); cdForm.hidden = true; cdEditing = null; cdSave(); toast("Countdown saved");
  });
  $("#panel-countdown").addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const c = cds.find(x => x.id === b.dataset.id); if (!c) return;
    if (b.dataset.act === "edit") return openCdForm(c);
    if (b.dataset.act === "pin") c.pinned = !c.pinned;
    else if (b.dataset.act === "main") cds.forEach(x => { x.main = x === c; });
    else if (b.dataset.act === "del") { if (!confirm("Delete this countdown?")) return; cds = cds.filter(x => x !== c); normCds(cds); }
    cdSave();
  });
  $("#cdBadge").addEventListener("click", () => showTab("countdown"));
  setInterval(renderCountdown, 60000);   // once a minute is plenty

  /* ============================================================
     KEEP THE TIMER ALIVE with the screen off (best effort on the web):
     screen wake lock, a silent audio loop + media session (shows a
     timer notification with a live progress bar), and an alert when a
     Pomodoro block ends.
     ============================================================ */
  const bg = { wake: null, audio: null, poll: 0 };
  const silentWav = () => {
    const sr = 8000, n = sr * 2, buf = new ArrayBuffer(44 + n), v = new DataView(buf), w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, "data"); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128 + Math.round(2 * Math.sin(i / 40)));   // far below anything audible
    return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  };
  async function wakeLock() {
    try {
      if (prefs.awake && "wakeLock" in navigator && !bg.wake) { bg.wake = await navigator.wakeLock.request("screen"); bg.wake.addEventListener("release", () => { bg.wake = null; }); }
    } catch (e) { bg.wake = null; }
  }
  function sessionInfo() {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession, pomo = timer.mode === "pomodoro";
    ms.metadata = new MediaMetadata({ title: (timer.isFocus() ? "Focusing" : "Break") + " · " + activeSubject().name, artist: "Morrow · " + (pomo ? "Pomodoro" : "Stopwatch"), album: "Study timer", artwork: [{ src: "App logo.jpg", sizes: "512x512", type: "image/jpeg" }] });
    ms.playbackState = "playing";
    try {
      const el = timer.elapsed(), dur = pomo ? Math.max(1, timer.totalMs / 1000) : Math.max(4 * 3600, Math.ceil((el + 1800) / 3600) * 3600);
      ms.setPositionState({ duration: dur, playbackRate: 1, position: Math.min(el, dur) });
    } catch (e) { /* not supported here */ }
  }
  H.running = on => {
    if (on) {
      wakeLock();
      if (!bg.audio) { bg.audio = new Audio(silentWav()); bg.audio.loop = true; bg.audio.volume = 0.05; }
      bg.audio.play().catch(() => {});
      sessionInfo(); clearInterval(bg.poll); bg.poll = setInterval(sessionInfo, 20000);
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
    } else {
      clearInterval(bg.poll); if (bg.audio) bg.audio.pause();
      if (bg.wake) { bg.wake.release().catch(() => {}); bg.wake = null; }
      if ("mediaSession" in navigator) { navigator.mediaSession.playbackState = "none"; navigator.mediaSession.metadata = null; }
    }
  };
  if ("mediaSession" in navigator) {
    try {
      const ms = navigator.mediaSession;
      ms.setActionHandler("pause", () => timer.pause());
      ms.setActionHandler("stop", () => timer.pause());
      ms.setActionHandler("play", () => H.beforeStart(() => timer.start()));
    } catch (e) { /* some browsers lack these actions */ }
  }
  document.addEventListener("visibilitychange", () => {   // back on screen: catch up straight away
    if (document.visibilityState !== "visible" || !timer.running) return;
    wakeLock(); if (bg.audio && bg.audio.paused) bg.audio.play().catch(() => {});
    timer.tick(); timer.paint(); sessionInfo();
  });
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) navigator.serviceWorker.register("sw.js").catch(() => {});
  H.notify = (title, body) => {
    try {
      if (!("Notification" in window) || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      navigator.serviceWorker.ready.then(r => r.showNotification(title, { body, icon: "App logo.jpg", badge: "App logo.jpg", tag: "morrow-end", renotify: true })).catch(() => {});
    } catch (e) { /* ignore */ }
  };

  Object.assign(H, {
    getCountdowns: () => cds,
    applyCountdowns(list) { cds = normCds((Array.isArray(list) ? list : []).filter(validCd).map(cleanCd)); store.set("focus-countdowns", cds); renderCountdown(); },
    renderCountdown
  });
  fillCdSubjects(); renderCountdown();

  /* Bridge for the Firebase layer in this same file */
  Object.assign(H, {
    $, $$, place, burst, timer, showTab, activeSubject,
    getSubjects: subjectList, getTasks: () => tasks, getPrefs: () => prefs,
    applySubjects(list) {
      const clean = Array.isArray(list) ? list.filter(s => s && typeof s.id === "string" && typeof s.name === "string" && s.name.trim() && hexOk(s.color)) : [];
      subjects = migrate(clean.length ? clean : baseSubjects).map(s => ({ id: s.id, name: s.name.trim().slice(0, 24), color: s.color.toLowerCase(), locked: false }));
      if (!subjects.some(s => s.id === activeId)) activeId = subjects[0].id;
      store.set("focus-subjects", subjectList()); store.set("focus-subject", activeId);
      renderSubjects(); applyAccent();
      if (clean.length && JSON.stringify(subjectList()) !== JSON.stringify(clean.map(s => ({ id: s.id, name: s.name.trim().slice(0, 24), color: s.color.toLowerCase() })))) H.onSubjects(subjectList());
    },
    applyTasks(list) {
      tasks = (Array.isArray(list) ? list : []).filter(t => t && typeof t.text === "string").map(t => ({ id: Number(t.id) || 0, text: t.text, done: !!t.done }));
      nextId = tasks.reduce((m, t) => Math.max(m, t.id), 0) + 1;
      store.set("focus-tasks", tasks); renderTasks();
    },
    applyPrefs(p) {
      if (!p || typeof p !== "object") return;
      Object.keys(limits).forEach(k => { const n = Math.round(Number(p[k])); if (Number.isFinite(n)) prefs[k] = Math.min(limits[k][1], Math.max(limits[k][0], n)); });
      if (typeof p.sound === "boolean") prefs.sound = p.sound;
      if (typeof p.auto === "boolean") prefs.auto = p.auto;
      if (typeof p.ghost === "boolean") prefs.ghost = p.ghost;
      if (typeof p.awake === "boolean") prefs.awake = p.awake;
      prefs.dark = typeof p.dark === "boolean" ? p.dark : null;
      if (navs.includes(p.nav)) prefs.nav = p.nav;
      store.set("focus-prefs", prefs); syncPrefControls(); applyTheme(); applyNav(); applyAccent();
      if (!timer.running && !timer.paused) { timer.resetLength(); timer.refresh(); }
    }
  });

  requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove("boot")));
})();


/* ================================================================
   FIREBASE LAYER: Auth + Firestore (collection "users").
   Everything for one person lives in ONE document: users/{uid}
   (profile, subjects, tasks, papers and a "days" map with the
   focus time per day), so saving is a single write and the whole
   site reads from the same live snapshot.
   ================================================================ */
(() => {
  "use strict";
  const H = window.Morrow, $ = H.$, $$ = H.$$;
  const ADMIN = "gethminahalangoda@gmail.com";
  const BADGE = '<svg class="vb" viewBox="0 0 24 24" role="img" aria-label="Verified"><path fill="#3b9bf5" d="M12 1l3 2.2 3.7-.2 1.2 3.5 3 2.2-1.1 3.5 1.1 3.5-3 2.2-1.2 3.5-3.7-.2L12 23l-3-2.2-3.7.2-1.2-3.5-3-2.2L2.2 12 1.1 8.5l3-2.2 1.2-3.5L9 3z"/><path d="M7.5 12.3l3 3 6-6.3" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CHK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dstr = d => { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const ago = n => { const d = new Date(); d.setDate(d.getDate() - n); return dstr(d); };
  const key = n => String(n).trim().toLowerCase().replace(/[.~*\/\[\]]/g, "_").slice(0, 30);
  const fmt = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? h + "h " + m + "m" : m + "m"; };
  // 0.1 pts/min in the 1st hour of the day, 0.2 in the 2nd ... capped at 0.6
  const pts = (prev, add) => { let p = 0, s = prev; const e = prev + add; while (s < e) { const h = Math.floor(s / 3600), end = Math.min(e, (h + 1) * 3600); p += (end - s) / 60 * Math.min(0.1 * (h + 1), 0.6); s = end; } return +p.toFixed(2); };
  const av = u => u && u.photoURL ? '<img src="' + esc(u.photoURL) + '" alt="">' : esc(((u && u.name) || "?").trim().charAt(0).toUpperCase() || "?");
  const daysOf = u => (u && u.days && typeof u.days === "object") ? u.days : {};

  let auth, db, user = null, me = null, ref = null, unsub = null, setupErr = "";
  let chart = null, range = 7, dirty = false, photo = "", goal = 4, hadUser = false, memo = {};
  const rk = { list: null, cat: "all", unsub: null };

  if (typeof firebase === "undefined") setupErr = "Firebase did not load. Check your internet connection.";
  else if (typeof firebaseConfig === "undefined" || !firebaseConfig.apiKey || /YOUR_/.test(firebaseConfig.apiKey)) setupErr = "Add your Firebase keys to firebase-config.js.";
  else {
    try {
      firebase.initializeApp(firebaseConfig);
      auth = firebase.auth(); db = firebase.firestore();
      try { db.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) { /* not supported here */ }
      auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
    } catch (e) { setupErr = e.message; }
  }
  if (setupErr) { const d = document.createElement("div"); d.className = "card setup"; d.textContent = "Setup needed: " + setupErr; $("main").prepend(d); }

  const errMsg = (what, e) => {
    console.error(what, e);
    return what + (e && e.code === "permission-denied" ? ": Firestore rules are blocking this. Update your rules." : ": " + ((e && (e.code || e.message)) || "unknown error"));
  };

  /* ---------- Auth ---------- */
  const authHelp = e => {
    const c = e && e.code, host = location.hostname || "this page";
    if (c === "auth/unauthorized-domain") return 'add "' + host + '" under Firebase > Authentication > Settings > Authorized domains, then try again.';
    if (c === "auth/operation-not-allowed") return "turn on Google in Firebase > Authentication > Sign-in method.";
    if (c === "auth/invalid-api-key" || /api-key-not-valid/.test(c || "")) return "the API key in firebase-config.js is not valid.";
    if (c === "auth/network-request-failed") return "no connection to Firebase. Check your internet and try again.";
    if (c === "auth/web-storage-unsupported") return "this browser blocks storage (private mode or an in-app browser). Open the site in Chrome or Safari.";
    if (c === "auth/internal-error") return "Firebase reported an internal error. Check that Google sign-in is enabled and this domain is authorised.";
    return c || (e && e.message) || "unknown error";
  };
  const inApp = /FBAN|FBAV|Instagram|Line\/|WhatsApp|; wv\)|Snapchat|TikTok/i.test(navigator.userAgent);
  const login = () => {
    if (!auth) { H.toast("Setup needed: " + setupErr, 7000); return Promise.resolve(false); }
    if (location.protocol === "file:") { H.toast("Open the site from http://localhost or your https address. Google sign-in cannot work from a file.", 8000); return Promise.resolve(false); }
    if (inApp) { H.toast("Google blocks sign-in inside this app's browser. Open the site in Chrome or Safari.", 8000); return Promise.resolve(false); }
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    return auth.signInWithPopup(provider).then(() => true).catch(e => {
      if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") return false;
      if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {   // popups blocked: use a full-page redirect instead
        H.toast("Opening Google sign-in...");
        auth.signInWithRedirect(provider).catch(err => H.toast("Sign-in failed: " + authHelp(err), 8000));
        return false;
      }
      console.error("Sign-in error", e);
      H.toast("Sign-in failed: " + authHelp(e), 8000);
      return false;
    });
  };
  if (auth) auth.getRedirectResult().catch(e => { if (e && e.code) H.toast("Sign-in failed: " + authHelp(e), 8000); });
  H.canStart = () => !!user;   // studying always needs an account
  H.getDays = () => daysOf(me); H.signedIn = () => !!user;
  H.beforeStart = go => { if (user) return go(); H.toast("Sign in to start studying"); login().then(ok => { if (ok) go(); }); };

  // First visit: welcome dialog asking people to sign in
  const wel = $("#welcome");
  const hideWelcome = () => { wel.hidden = true; };
  const flag = { get: () => { try { return localStorage.getItem("focus-welcomed"); } catch (e) { return "1"; } }, set: () => { try { localStorage.setItem("focus-welcomed", "1"); } catch (e) { /* ignore */ } } };
  $("#wSignIn").addEventListener("click", () => login().then(ok => { if (ok) hideWelcome(); }));
  $("#wLater").addEventListener("click", hideWelcome);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !wel.hidden) hideWelcome(); });
  $("#authBtn").addEventListener("click", () => user ? H.showTab("preferences") : login());

  const newDoc = u => ({
    name: u.displayName || "Student", email: u.email, photoURL: u.photoURL || "", bio: "", dailyGoal: 4,
    subjects: H.getSubjects(), tasks: H.getTasks(), prefs: JSON.parse(JSON.stringify(H.getPrefs())), papers: H.getPapers(), countdowns: H.getCountdowns(),
    days: {}, totalPoints: 0, totalSec: 0, sessionCount: 0, studying: false, studyingAt: 0,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  if (auth) auth.onAuthStateChanged(async u => {
    if (u) hideWelcome();
    else if (!flag.get()) { flag.set(); wel.hidden = false; $("#wSignIn").focus(); }   // new visitor, signed out
    user = u; if (unsub) unsub(); unsub = null; me = null; memo = {}; dirty = false; stopSparks(); stopPulse();
    ref = u ? db.collection("users").doc(u.uid) : null;
    if (u) {
      hadUser = true;
      try {
        const s = await ref.get();
        if (!s.exists) await ref.set(newDoc(u));
        else if (s.data().email !== u.email) await ref.update({ email: u.email });
      } catch (e) { H.toast(errMsg("Could not load your profile", e)); }
      unsub = ref.onSnapshot(s => { me = s.data() || null; render(); listenSparks(); }, e => H.toast(errMsg("Lost connection to your profile", e)));
    } else {
      if (hadUser) { H.applyTasks([]); H.applySubjects(null); H.applyPapers([]); hadUser = false; }
      if (rk.unsub) { rk.unsub(); rk.unsub = null; } rk.list = null; pr.list = [];
      render();
    }
  });

  /* ---------- Saving settings (debounced) ---------- */
  const upd = (() => {
    let t, patch = {};
    return p => {
      Object.assign(patch, p); clearTimeout(t);
      t = setTimeout(() => { const x = patch; patch = {}; if (ref) ref.update(x).catch(e => H.toast(errMsg("Could not save changes", e))); }, 500);
    };
  })();
  H.onSubjects = s => { if (user) upd({ subjects: s }); };
  H.onTasks = t => { if (user) upd({ tasks: t }); };
  H.onPapers = p => { if (user) upd({ papers: p }); };
  H.onCountdowns = c => { if (user) upd({ countdowns: c }); };
  H.onPrefs = p => {
    if (user) upd({ prefs: JSON.parse(JSON.stringify(p)) });
    if (!!p.ghost !== lastGhost) { lastGhost = !!p.ghost; presenceSync(); if (!$("#panel-pulse").hidden) renderPulse(); }
  };

  /* ---------- Studying presence ---------- */
  H.studying = on => { if (ref) ref.update({ studying: on, studyingAt: Date.now() }).catch(() => {}); presenceSync(on); };
  setInterval(() => { const t = H.timer; if (t.running && t.isFocus()) H.studying(true); }, 60000);
  addEventListener("pagehide", () => { if (H.timer.running) H.studying(false); });

  /* ---------- Saving a session: ONE merge-write, no transaction ---------- */
  H.session = (sec, subject) => {
    if (!ref || sec < 1) return;
    const F = firebase.firestore.FieldValue, today = dstr(), k = key(subject), all = daysOf(me);
    const prev = (all[today] && all[today].total) || 0, got = pts(prev, sec);
    const days = { [today]: { total: F.increment(sec), pts: F.increment(got), by: { [k]: F.increment(sec) } } };
    Object.keys(all).filter(d => d < ago(400)).forEach(d => { days[d] = F.delete(); });   // keep the document small
    ref.set({ days, totalPoints: F.increment(got), totalSec: F.increment(sec), sessionCount: F.increment(1), lastSessionAt: Date.now() }, { merge: true })
      .catch(e => H.toast(errMsg("Could not save the session", e)));
    H.toast("Saved " + fmt(sec) + " · +" + got + " pts");
  };

  /* ---------- Render ---------- */
  function render() {
    const b = $("#authBtn");
    if (user) { b.innerHTML = '<span class="avatar">' + av(me || { name: user.displayName, photoURL: user.photoURL }) + '</span><span class="nm">' + esc((me && me.name) || "Account") + "</span>"; b.classList.add("signed"); b.setAttribute("aria-label", "Open preferences"); }
    else { b.textContent = "Sign in with Google"; b.classList.remove("signed"); b.removeAttribute("aria-label"); }
    if (me) {
      const s = JSON.stringify(me.subjects), t = JSON.stringify(me.tasks), p = JSON.stringify(me.prefs), pp = JSON.stringify(me.papers);
      if (memo.s !== s) { memo.s = s; H.applySubjects(me.subjects); }
      if (memo.t !== t) { memo.t = t; H.applyTasks(me.tasks); }
      if (memo.p !== p) { memo.p = p; H.applyPrefs(me.prefs); }
      if (memo.pp !== pp) { memo.pp = pp; if (me.papers !== undefined) H.applyPapers(me.papers); }
      const cc = JSON.stringify(me.countdowns);
      if (memo.cc !== cc) { memo.cc = cc; if (me.countdowns !== undefined) H.applyCountdowns(me.countdowns); else H.onCountdowns(H.getCountdowns()); }
    }
    renderStreak();
    if (!dirty) fillProfile();
    if (!$("#panel-progress").hidden) drawProg(false);
    if (!$("#panel-ranking").hidden) startRank();
  }

  /* ---------- Streak: computed from the saved days (1 minute counts) ---------- */
  function streakInfo() {
    const d = daysOf(me), ok = x => d[x] && d[x].total >= 60;
    let cur = 0, i = ok(dstr()) ? 0 : 1;
    while (i < 800 && ok(ago(i))) { cur++; i++; }
    let best = 0, run = 0, prev = null;
    Object.keys(d).filter(ok).sort().forEach(k => {
      run = prev && Math.round((new Date(k + "T00:00:00") - new Date(prev + "T00:00:00")) / 864e5) === 1 ? run + 1 : 1;
      best = Math.max(best, run); prev = k;
    });
    if (me && (me.lastStudyDate === dstr() || me.lastStudyDate === ago(1))) cur = Math.max(cur, me.streak || 0);   // older saves
    return { cur, best: Math.max(best, cur, (me && me.bestStreak) || 0), ok };
  }
  function renderStreak() {
    const s = streakInfo(), txt = s.cur + " day streak";
    $("#chipTxt").textContent = txt; $("#wkStreak").textContent = txt; $("#wkBest").textContent = "Best: " + s.best + " days";
    const now = new Date(), mon = new Date(now); mon.setDate(now.getDate() - (now.getDay() + 6) % 7);
    const legacy = (me && me.studyDays) || [];
    $("#days").innerHTML = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((l, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i); const x = dstr(d);
      return '<div class="day' + (s.ok(x) || legacy.includes(x) ? " done" : "") + (x === dstr() ? " today" : "") + '" style="--i:' + i + '"><span class="dot">' + CHK + "</span>" + l + "</div>";
    }).join("");
  }

  /* ---------- Progress (reads the live "days" map) ---------- */
  $$("#rngSeg button").forEach(b => b.addEventListener("click", () => {
    $$("#rngSeg button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    H.place($("#rngInd"), b); range = +b.dataset.r; drawProg(true);
  }));
  function count(el, to) { const t0 = performance.now(); (function f(t) { const p = Math.min(1, (t - t0) / 900); el.textContent = (to * (1 - Math.pow(1 - p, 3))).toFixed(1); if (p < 1) requestAnimationFrame(f); })(t0); }
  function drawProg(animate) {
    const D = daysOf(me), t = dstr(), n = new Date(), mon = new Date(n); mon.setDate(n.getDate() - (n.getDay() + 6) % 7);
    const ms = dstr(mon), today = (D[t] && D[t].total) || 0, target = ((me && me.dailyGoal) || 4) * 3600;
    const week = Object.keys(D).filter(d => d >= ms && d <= t).reduce((a, d) => a + (D[d].total || 0), 0);
    $("#stToday").textContent = fmt(today); $("#stWeek").textContent = fmt(week);
    const tp = (me && me.totalPoints) || 0;
    if (animate) count($("#stPts"), tp); else $("#stPts").textContent = tp.toFixed(1);
    const pc = Math.min(100, Math.round(today / target * 100)), bar = $("#goalBar");
    $("#goalTx").textContent = fmt(today) + " of " + fmt(target); $("#goalPct").textContent = pc + "%";
    if (animate) { bar.style.width = "0%"; requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = pc + "%"; })); } else bar.style.width = pc + "%";
    if (typeof Chart === "undefined") return;
    const css = getComputedStyle(document.documentElement), ink = css.getPropertyValue("--ink").trim(), mu = css.getPropertyValue("--muted").trim();
    const dl = [...Array(range)].map((_, i) => ago(range - 1 - i));
    const val = (d, k) => Math.round((D[d] ? (k ? (D[d].by || {})[k] : D[d].total) : 0) / 60) || 0;
    const subs = H.getSubjects().map(s => ({ k: key(s.name), name: s.name, color: s.color })), known = new Set(subs.map(s => s.k)), extra = new Set();
    dl.forEach(d => Object.keys((D[d] && D[d].by) || {}).forEach(k => { if (!known.has(k)) extra.add(k); }));
    const lines = subs.concat([...extra].map(k => ({ k, name: k, color: "#b4bac4" }))).filter(s => dl.some(d => val(d, s.k) > 0));
    if (chart) chart.destroy();
    chart = new Chart($("#chart"), {
      type: "line",
      data: { labels: dl.map(d => d.slice(5)), datasets: [{ label: "Total", data: dl.map(d => val(d)), borderColor: ink, borderWidth: 3, tension: 0.35, pointRadius: 2 }].concat(lines.map(s => ({ label: s.name, data: dl.map(d => val(d, s.k)), borderColor: s.color, borderWidth: 2.5, tension: 0.35, pointRadius: 0 }))) },
      options: { maintainAspectRatio: false, animation: animate ? { duration: 1400, easing: "easeOutQuart" } : false, interaction: { mode: "index", intersect: false },
        scales: { x: { ticks: { color: mu, maxTicksLimit: 8 }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: mu }, grid: { color: "rgba(128,128,128,.15)" } } },
        plugins: { legend: { labels: { color: mu, usePointStyle: true, boxWidth: 8 } } } }
    });
  }

  /* ---------- Ranking ---------- */
  function startRank() {
    if (!user) { renderRank(); return; }
    if (rk.unsub) { renderRank(); return; }
    rk.unsub = db.collection("users").limit(200).onSnapshot(s => { rk.list = s.docs.map(d => Object.assign({ id: d.id }, d.data())); renderRank(); },
      e => { rk.unsub = null; const x = $("#rankEmpty"); x.hidden = false; x.textContent = errMsg("Rankings could not load", e); });
  }
  setInterval(() => { if (!$("#panel-ranking").hidden && rk.list) renderRank(); }, 30000);
  $("#rkChips").addEventListener("click", e => { const b = e.target.closest("[data-k]"); if (b) { rk.cat = b.dataset.k; renderRank(); } });
  $("#rankList").addEventListener("pointermove", e => { const r = e.target.closest(".spot"); if (!r) return; const b = r.getBoundingClientRect(); r.style.setProperty("--mx", e.clientX - b.left + "px"); r.style.setProperty("--my", e.clientY - b.top + "px"); });
  function renderRank() {
    const list = $("#rankList"), empty = $("#rankEmpty"), chips = $("#rkChips");
    if (!user) { list.innerHTML = ""; chips.innerHTML = ""; $("#rkNote").textContent = ""; empty.hidden = false; empty.textContent = "Sign in with Google to see the rankings."; return; }
    if (!rk.list) return;
    const t = dstr(), live = u => u.studying && Date.now() - (u.studyingAt || 0) < 150000;
    const subs = [...new Map(rk.list.flatMap(u => u.subjects || []).map(s => [key(s.name), s.name])).values()].slice(0, 10);
    const cats = [["all", "All subjects"]].concat(subs.map(s => ["s:" + key(s), s]), [["alltime", "All time"]]);
    if (!cats.some(c => c[0] === rk.cat)) rk.cat = "all";
    chips.innerHTML = cats.map(c => '<span class="chip' + (rk.cat === c[0] ? " on" : "") + '" style="--c:var(--accent);--oc:var(--on-accent)"><button type="button" class="chip-main" data-k="' + esc(c[0]) + '">' + esc(c[1]) + "</button></span>").join("");
    $("#rkNote").textContent = rk.cat === "alltime" ? "All-time ranking by points." : "Daily ranking. It starts fresh every day.";
    const today = u => daysOf(u)[t] || null;
    const val = u => { if (rk.cat === "alltime") return u.totalPoints || 0; const x = today(u); return !x ? 0 : rk.cat === "all" ? x.total || 0 : (x.by || {})[rk.cat.slice(2)] || 0; };
    const rows = rk.list.map(u => Object.assign({}, u, { v: val(u) })).filter(u => u.v > 0 || (rk.cat !== "alltime" && live(u))).sort((a, b) => b.v - a.v).slice(0, 50);
    const max = rows.length ? Math.max(rows[0].v, 1) : 1;
    empty.hidden = rows.length > 0; empty.textContent = "Nobody here yet. Save a session to take the first spot.";
    list.innerHTML = rows.map((u, i) => '<li class="row spot' + (u.id === user.uid ? " me" : "") + '" data-fx="spot"><span class="pos">' + (i + 1) + '</span><span class="avatar">' + av(u) + '</span><span class="name"><span>' + esc(u.name) + "</span>" + (u.email === ADMIN ? BADGE : "") + (live(u) ? '<span class="live">Studying</span>' : "") + '</span><span class="meter"><i style="--w:' + Math.round(u.v / max * 100) + '%"></i></span><span class="mins">' + (rk.cat === "alltime" ? u.v.toFixed(1) + " pts" : fmt(u.v)) + "</span></li>").join("");
  }

  /* ---------- Profile (Preferences tab) ---------- */
  function fillProfile() {
    if (!$("#pName")) return;
    $("#pName").value = me ? me.name || "" : ""; $("#pBio").value = me ? me.bio || "" : "";
    photo = me ? me.photoURL || "" : ""; goal = me && me.dailyGoal ? me.dailyGoal : 4; $("#goalOut").textContent = goal;
    $("#pAv").innerHTML = av({ name: me && me.name, photoURL: photo });
  }
  ["#pName", "#pBio"].forEach(s => $(s).addEventListener("input", () => { dirty = true; }));
  $$("[data-g]").forEach(b => b.addEventListener("click", () => { goal = Math.min(10, Math.max(4, goal + +b.dataset.g)); $("#goalOut").textContent = goal; dirty = true; }));
  $("#pFile").addEventListener("change", e => {
    const f = e.target.files[0]; if (!f) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"), s = Math.min(img.width, img.height); c.width = c.height = 160;
      c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 160, 160);
      photo = c.toDataURL("image/jpeg", 0.8); dirty = true; $("#pAv").innerHTML = '<img src="' + photo + '" alt="">';
    };
    img.onerror = () => H.toast("That image could not be read.");
    img.src = URL.createObjectURL(f);
  });
  $("#pSave").addEventListener("click", async () => {
    if (!user) { login(); return; }
    const name = $("#pName").value.trim(); if (!name) return H.toast("Enter a name.");
    try { await ref.update({ name, bio: $("#pBio").value.trim(), photoURL: photo, dailyGoal: goal }); dirty = false; H.toast("Changes saved"); }
    catch (e) { H.toast(errMsg("Could not save", e)); }
  });
  $("#pOut").addEventListener("click", async () => {
    if (!auth || !user) return H.toast("You are not signed in.");
    if (H.timer.running) H.timer.reset();
    await H.studying(false); await auth.signOut(); H.toast("Logged out"); H.showTab("timer");
  });
  $("#pDel").addEventListener("click", async () => {
    if (!user || prompt("This permanently deletes your account and data. Type DELETE to confirm.") !== "DELETE") return;
    const run = async () => {
      try {   // older versions stored sessions in a sub-collection; clean it up if it exists
        const ss = await ref.collection("sessions").get();
        for (let i = 0; i < ss.docs.length; i += 400) { const b = db.batch(); ss.docs.slice(i, i + 400).forEach(d => b.delete(d.ref)); await b.commit(); }
      } catch (e) { /* nothing to clean up */ }
      await ref.delete(); await user.delete();
    };
    try {
      if (unsub) { unsub(); unsub = null; }
      try { await run(); }
      catch (e) { if (e.code === "auth/requires-recent-login") { await user.reauthenticateWithPopup(new firebase.auth.GoogleAuthProvider()); await run(); } else throw e; }
      H.toast("Account deleted"); H.showTab("timer");
    } catch (e) { H.toast(errMsg("Could not delete the account", e)); }
  });

  /* ---------- Pulse: a quiet co-working room (presence/{uid}) ---------- */
  const pr = { unsub: null, list: [] };
  let hbTimer = null, lastGhost = !!H.getPrefs().ghost, sparkUnsub = null, sparkDay = "";

  function presenceNow() {   // what to publish right now, or null when idle / hidden
    const t = H.timer;
    if (!user || !t.running || !t.isFocus() || H.getPrefs().ghost) return null;
    const now = Date.now(), sub = H.activeSubject();
    return { status: "focusing", subject: sub.name, color: sub.color, mode: t.mode, startTime: now - t.elapsed() * 1000, endTime: t.mode === "pomodoro" ? t.endAt : now + 30 * 60000 };
  }
  function presenceSync(force) {   // written on Start/Resume and Pause/Finish (plus a 15 min touch for the stopwatch)
    if (!user || !db) return;
    const p = force === false ? null : presenceNow();
    const photo = me && me.photoURL && me.photoURL.length < 20000 ? me.photoURL : "";
    const base = { uid: user.uid, name: (me && me.name) || user.displayName || "Student", photoURL: photo, email: user.email };
    db.collection("presence").doc(user.uid).set(p ? Object.assign(base, p) : Object.assign(base, { status: "idle", endTime: 0, updatedAt: Date.now() })).catch(() => {});
    clearInterval(hbTimer); hbTimer = p && p.mode === "stopwatch" ? setInterval(() => presenceSync(), 15 * 60000) : null;
  }

  const sparkedKey = () => "focus-sparked-" + dstr();
  const sparkedSet = () => { try { return new Set(JSON.parse(localStorage.getItem(sparkedKey()) || "[]")); } catch (e) { return new Set(); } };
  const markSparked = uid => { try { const s = sparkedSet(); s.add(uid); localStorage.setItem(sparkedKey(), JSON.stringify([...s])); } catch (e) { /* ignore */ } };
  const BOLT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>';

  function startPulse() {
    if (!user) { renderPulse(); return; }
    if (pr.unsub) { renderPulse(); return; }
    pr.unsub = db.collection("presence").where("status", "==", "focusing").limit(60).onSnapshot(s => { pr.list = s.docs.map(d => Object.assign({ id: d.id }, d.data())); renderPulse(); },
      e => { pr.unsub = null; const x = $("#pulseEmpty"); x.hidden = false; x.textContent = errMsg("The room could not load", e); });
  }
  function stopPulse() { if (pr.unsub) { pr.unsub(); pr.unsub = null; } }
  function stopSparks() { if (sparkUnsub) { sparkUnsub(); sparkUnsub = null; } }

  function renderPulse() {
    const grid = $("#pulseGrid"), empty = $("#pulseEmpty"), count = $("#pulseCount"), pill = count.parentElement, now = Date.now();
    $("#pulseNote").textContent = H.getPrefs().ghost ? "Ghost mode is on: others cannot see you, but you can see them." : "Ghost mode hides you from this room while you still see everyone else.";
    if (!user) { grid.innerHTML = ""; count.textContent = "Sign in to see who is focusing"; pill.classList.add("off"); empty.hidden = false; empty.textContent = "Sign in with Google to join the room."; return; }
    const act = pr.list.filter(p => p.status === "focusing" && p.endTime + 60000 > now).sort((a, b) => a.startTime - b.startTime), n = act.length, sent = sparkedSet();
    count.textContent = n === 0 ? "Nobody is focusing right now" : n + (n === 1 ? " person" : " people") + " focusing right now";
    pill.classList.toggle("off", n === 0);
    empty.hidden = n > 0; empty.textContent = "The room is quiet. Start a session and light it up.";
    grid.innerHTML = act.map((p, i) => {
      const mine = p.uid === user.uid;
      return '<article class="card pcard" style="--c:' + esc(p.color || "#b9aee8") + ";animation-delay:" + i * 50 + 'ms" data-start="' + p.startTime + '" data-end="' + p.endTime + '" data-mode="' + esc(p.mode) + '">' +
        '<div class="pc-top"><span class="avatar">' + av(p) + '</span><div class="pc-who"><div class="pc-name"><span>' + esc(p.name) + "</span>" + (p.email === ADMIN ? BADGE : "") + '</div><span class="pill"><i></i>' + esc(p.subject) + "</span></div>" +
        (mine ? '<span class="pc-you">You</span>' : '<button type="button" class="spark' + (sent.has(p.uid) ? " sent" : "") + '" data-uid="' + esc(p.uid) + '" data-name="' + esc(p.name) + '" aria-label="Send ' + esc(p.name) + ' a focus spark">' + BOLT + "</button>") + "</div>" +
        '<div class="pc-meta"><span class="pc-time"></span><span>' + (p.mode === "pomodoro" ? "Pomodoro" : "Stopwatch") + '</span></div><div class="pc-bar"><i></i></div></article>';
    }).join("");
    pulseTick();
  }
  function pulseTick() {   // the thin progress bars are computed locally: no extra reads or writes
    const now = Date.now();
    $$("#pulseGrid .pcard").forEach(c => {
      const s = +c.dataset.start, e = +c.dataset.end, el = Math.max(0, now - s), pomo = c.dataset.mode === "pomodoro";
      c.querySelector(".pc-bar i").style.width = ((pomo ? Math.min(1, el / Math.max(1, e - s)) : (el % 3600e3) / 3600e3) * 100) + "%";
      c.querySelector(".pc-time").textContent = pomo ? Math.min(Math.floor(el / 60000), Math.round((e - s) / 60000)) + "m of " + Math.round((e - s) / 60000) + "m" : fmt(el / 1000);
    });
  }
  setInterval(() => { if (!$("#panel-pulse").hidden) { pulseTick(); if (pr.list.length) renderPulse(); } }, 5000);

  $("#pulseGrid").addEventListener("click", e => { const b = e.target.closest(".spark"); if (b) sendSpark(b, b.dataset.uid, b.dataset.name); });
  async function sendSpark(btn, toUid, toName) {
    if (!user) return login();
    if (sparkedSet().has(toUid)) return H.toast("You already sent " + toName + " a spark today");
    const today = dstr(), F = firebase.firestore.FieldValue, id = today + "_" + user.uid + "_" + toUid, d = daysOf(me)[today] || {};
    try { await db.collection("sparks").doc(id).set({ day: today, from: user.uid, to: toUid, fromName: (me && me.name) || "Someone", ts: Date.now() }); }
    catch (err) { markSparked(toUid); btn.classList.add("sent"); return H.toast(err.code === "permission-denied" ? "You already sent " + toName + " a spark today" : errMsg("Could not send the spark", err)); }
    markSparked(toUid); btn.classList.add("sent", "zap");
    const boost = (d.sparkSent || 0) < 5;   // the first 5 sparks you send each day earn a tiny boost
    if (boost) ref.set({ totalPoints: F.increment(0.1), days: { [today]: { pts: F.increment(0.1), sparkSent: F.increment(1) } } }, { merge: true }).catch(() => {});
    H.toast("Spark sent to " + toName + (boost ? " · +0.1 pts" : ""));
  }
  function listenSparks() {   // incoming sparks (today only), shown as a quiet toast
    if (!user || !db) return;
    const today = dstr();
    if (sparkUnsub && sparkDay === today) return;
    stopSparks(); sparkDay = today;
    sparkUnsub = db.collection("sparks").where("to", "==", user.uid).where("day", "==", today).onSnapshot(s => {
      s.docChanges().forEach(ch => {
        if (ch.type !== "added" || !me) return;
        const id = ch.doc.id, from = ch.doc.data().fromName || "Someone", got = (daysOf(me)[today] && daysOf(me)[today].sparkGot) || [];
        if (got.includes(id)) return;   // already shown and rewarded on this account
        H.toast(from + " sent you a focus spark");
        const F = firebase.firestore.FieldValue, day = { sparkGot: F.arrayUnion(id) }, patch = { days: { [today]: day } };
        if (got.length < 5) { day.pts = F.increment(0.1); patch.totalPoints = F.increment(0.1); }
        ref.set(patch, { merge: true }).catch(() => {});
      });
    }, () => {});
  }
  setInterval(() => { if (user && sparkDay !== dstr()) listenSparks(); }, 60000);

  H.onTab = name => {
    if (name === "pulse") startPulse(); else stopPulse();
    if (name === "progress") { H.place($("#rngInd"), $('#rngSeg [aria-pressed="true"]'), false); drawProg(true); }
    else if (name === "ranking") startRank();
    else if (name === "preferences" && !dirty) fillProfile();
  };
  render();
})();
