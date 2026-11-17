/**
 * MORROW — Deep Focus Engine
 * Includes:
 * - Native OS/Phone System Notifications (Windows, Mac, Android) via Service Worker
 * - Super Admin Controls for gethminahalangoda@gmail.com (Broadcasts, 1-on-1 messaging, Stat editing)
 * - Telegram-style Verified Blue Badges
 * - Cloud-First Firestore Hydration (Eliminates 0-point overwrites)
 * - Background Lock-Screen Timer (Web Worker + WakeLock + Timestamp Delta)
 * - Accurate Calendar Streak System
 * - Classore Leaderboard with Live Server Refresh
 * - Restored Animated Bar Graph
 */

(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // -------------------------------------------------------------
  // 0. ADMIN IDENTIFICATION & PERMISSIONS
  // -------------------------------------------------------------
  const SUPER_ADMIN_EMAIL = "gethminahalangoda@gmail.com";

  function isSuperAdmin(email) {
    return !!email && email.toLowerCase().trim() === SUPER_ADMIN_EMAIL.toLowerCase();
  }

  function isUserPremium(user) {
    if (!user) return false;
    if (isSuperAdmin(user.email)) return true;
    return user.isPremium === true;
  }

  // Telegram-style Verified Blue Badge SVG
  function getVerifiedBadgeHtml(isPremium, title = "Verified Scholar") {
    if (!isPremium) return "";
    return `
      <span class="tg-verified-badge" title="${title}">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
          <path d="M12 2L14.4 4.4L17.7 4.1L18.9 7.2L22 8.4L21.6 11.8L23.7 14.3L21.6 16.9L22 20.3L18.9 21.5L17.7 24.6L14.4 24.3L12 26.7L9.6 24.3L6.3 24.6L5.1 21.5L2 20.3L2.4 16.9L0.3 14.3L2.4 11.8L2 8.4L5.1 7.2L6.3 4.1L9.6 4.4L12 2Z" transform="scale(0.82) translate(2.5, 0.5)" fill="#24A1DE"/>
          <path d="M8.5 12.5L11 15L16.5 9.5" stroke="#FFFFFF" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
    `;
  }

  // Dynamically inject styles for admin badges, editor, and notifications
  function injectDynamicStyles() {
    if ($("#morrow-dynamic-styles")) return;
    const style = document.createElement("style");
    style.id = "morrow-dynamic-styles";
    style.textContent = `
      .tg-verified-badge {
        display: inline-flex;
        align-items: center;
        vertical-align: middle;
        margin-left: 5px;
        flex-shrink: 0;
      }
      .tg-verified-badge svg {
        filter: drop-shadow(0 0 5px rgba(36, 161, 222, 0.45));
        transition: transform 0.2s ease;
      }
      .tg-verified-badge:hover svg {
        transform: scale(1.15);
      }
      .spin-clockwise {
        animation: spinClockwise 0.65s cubic-bezier(0.4, 0, 0.2, 1) infinite;
      }
      @keyframes spinClockwise {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      .refresh-lead-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        font-size: 0.82rem;
        border-radius: 999px;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .refresh-lead-btn:hover {
        background: var(--accent-soft);
        border-color: var(--accent);
      }
      .admin-topbar-broadcast-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        border-radius: 999px;
        background: linear-gradient(135deg, rgba(36, 161, 222, 0.2), rgba(202, 56, 56, 0.2));
        border: 1px solid #24A1DE;
        color: #eef0f6;
        font-size: 0.82rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .admin-topbar-broadcast-btn:hover {
        transform: scale(1.04);
        box-shadow: 0 0 14px rgba(36, 161, 222, 0.4);
      }
      .leaderboard-row {
        cursor: pointer;
      }
      .admin-modal-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
        text-align: left;
        margin-bottom: 12px;
      }
      .admin-modal-field label {
        font-size: 0.78rem;
        color: var(--muted);
        font-weight: 700;
        text-transform: uppercase;
      }
      .admin-modal-field input, .admin-modal-field textarea, .admin-modal-field select {
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid var(--line-strong);
        background: var(--surface-raised);
        color: var(--ink);
        font: inherit;
        font-size: 0.9rem;
        outline: none;
      }
      .admin-modal-field input:focus, .admin-modal-field textarea:focus {
        border-color: var(--accent);
      }
      .in-app-toast-alert {
        position: fixed;
        top: 20px;
        right: 20px;
        max-width: 380px;
        width: calc(100% - 40px);
        background: var(--surface);
        border: 1px solid #24A1DE;
        box-shadow: 0 16px 40px rgba(0,0,0,0.6), 0 0 20px rgba(36, 161, 222, 0.35);
        border-radius: 16px;
        padding: 16px 18px;
        z-index: 9999999;
        animation: toastIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      @keyframes toastIn {
        from { transform: translateY(-20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  // -------------------------------------------------------------
  // NATIVE OS / PHONE SYSTEM NOTIFICATIONS ENGINE
  // -------------------------------------------------------------
  async function initSystemNotifications() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      console.warn("System notifications are not supported by this browser.");
      return;
    }

    try {
      await navigator.serviceWorker.register('sw.js');
      console.log("[MORROW] Service Worker registered for system notifications.");

      if (Notification.permission === 'default') {
        await Notification.requestPermission();
      }
    } catch (err) {
      console.warn("Service worker registration error:", err);
    }
  }

  async function triggerRealOSNotification(title, message) {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      try {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification(title, {
          body: message,
          icon: 'App logo.jpg',
          badge: 'App logo.jpg',
          vibrate: [200, 100, 200],
          tag: 'morrow-notif-' + Date.now(),
          renotify: true
        });
      } catch (e) {
        new Notification(title, {
          body: message,
          icon: 'App logo.jpg'
        });
      }
    }
  }

  // -------------------------------------------------------------
  // 1. STATE & STORAGE
  // -------------------------------------------------------------
  const STORAGE_KEY = "MORROW_STATE_V9";

  const defaultState = {
    user: {
      uid: null,
      email: null,
      displayName: "Scholar",
      avatar: null,
      bio: "Focusing deeply.",
      presence: "online",
      isPremium: false,
      isAdmin: false
    },
    settings: {
      dailyGoalHours: 4.0,
      theme: "dark"
    },
    subjects: [
      { id: "math", name: "Mathematics", color: "#ca3838" },
      { id: "physics", name: "Physics", color: "#2b79de" },
      { id: "chemistry", name: "Chemistry", color: "#701385" }
    ],
    streak: {
      count: 0,
      lastStudyDate: null,
      weekDaysDone: []
    },
    stats: {
      todaySeconds: 0,
      weekSeconds: 0,
      totalSeconds: 0,
      dailyPoints: 0,
      weeklyPoints: 0,
      allTimePoints: 0,
      lastRecordedDate: new Date().toISOString().split("T")[0],
      weeklyDays: { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 }
    }
  };

  let state = loadLocalState();
  let sessionTasks = JSON.parse(sessionStorage.getItem("MORROW_SESSION_TASKS") || "[]");
  let isCloudHydrated = false;

  let pendingSession = {
    seconds: 0,
    isCompletedPomo: false,
    timestampEnd: 0
  };

  function loadLocalState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...defaultState, ...JSON.parse(raw) } : defaultState;
    } catch (e) {
      return defaultState;
    }
  }

  function saveLocalState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (isCloudHydrated) {
      syncWithFirestore();
    }
  }

  function saveSessionTasks() {
    sessionStorage.setItem("MORROW_SESSION_TASKS", JSON.stringify(sessionTasks));
  }

  // -------------------------------------------------------------
  // 2. CALENDAR STREAK ENGINE
  // -------------------------------------------------------------
  function getTodayString() {
    return new Date().toISOString().split("T")[0];
  }

  function getYesterdayString() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  }

  function checkDayRoll() {
    const today = getTodayString();
    const yesterday = getYesterdayString();

    if (state.stats.lastRecordedDate !== today) {
      if (state.streak.lastStudyDate && state.streak.lastStudyDate !== yesterday && state.streak.lastStudyDate !== today) {
        state.streak.count = 0;
      }

      state.stats.todaySeconds = 0;
      state.stats.dailyPoints = 0;
      state.stats.lastRecordedDate = today;

      if (new Date().getDay() === 1) {
        state.stats.weekSeconds = 0;
        state.stats.weeklyPoints = 0;
        state.stats.weeklyDays = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
        state.streak.weekDaysDone = [];
      }
      saveLocalState();
    }
  }

  function markStreakToday() {
    const today = getTodayString();
    const yesterday = getYesterdayString();
    const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date().getDay()];

    if (state.streak.lastStudyDate !== today) {
      if (state.streak.lastStudyDate === yesterday) {
        state.streak.count += 1;
      } else {
        state.streak.count = 1;
      }
      state.streak.lastStudyDate = today;

      if (!state.streak.weekDaysDone.includes(dayName)) {
        state.streak.weekDaysDone.push(dayName);
      }
      saveLocalState();
      renderStreakWeek();
    }
  }

  function renderStreakWeek() {
    const c = state.streak.count;
    const sideNum = $("#sideStreakNum");
    const topText = $("#topStreakText");
    const headTitle = $("#streakHeadTitle");

    if (sideNum) sideNum.textContent = c;
    if (topText) topText.textContent = `${c} day streak`;
    if (headTitle) headTitle.textContent = `${c} day streak`;

    const container = $("#weekDaysContainer");
    if (!container) return;
    container.innerHTML = "";
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const currentDayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date().getDay()];

    days.forEach(d => {
      const isDone = state.streak.weekDaysDone.includes(d);
      const isToday = d === currentDayName;
      const el = document.createElement("div");
      el.className = `day ${isDone ? "done" : ""} ${isToday ? "today" : ""}`;
      el.innerHTML = `
        <span class="dot">
          <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
        </span>
        ${d}
      `;
      container.appendChild(el);
    });
  }

  // -------------------------------------------------------------
  // 3. BACKGROUND & LOCK SCREEN ACCURATE TIMER
  // -------------------------------------------------------------
  let timerMode = "stopwatch";
  let timerRunning = false;
  let stopwatchSecs = 0;
  let pomoRemaining = 25 * 60;
  let activeSubId = state.subjects[0]?.id || "math";

  let sessionStartTimestamp = 0;
  let sessionBaseSeconds = 0;
  let wakeLock = null;

  let timerWorker = null;
  try {
    const workerBlob = new Blob([`
      let interval = null;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          if (interval) clearInterval(interval);
          interval = setInterval(() => self.postMessage('tick'), 1000);
        } else if (e.data === 'stop') {
          if (interval) clearInterval(interval);
          interval = null;
        }
      };
    `], { type: 'application/javascript' });
    timerWorker = new Worker(URL.createObjectURL(workerBlob));
    timerWorker.onmessage = () => {
      if (timerRunning) onTimerTick();
    };
  } catch (err) {
    console.warn("Background worker fallback active.");
  }

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (e) {}
  }

  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release().catch(() => {});
      wakeLock = null;
    }
  }

  const ringProgress = $("#ringProgress");
  const C = 2 * Math.PI * 100;
  if (ringProgress) ringProgress.style.strokeDasharray = C.toFixed(2);

  function setSubjectLock(locked) {
    const bar = $("#subjectsBar");
    const hint = $("#subjectLockHint");
    if (!bar || !hint) return;
    if (locked) {
      bar.classList.add("timer-locked");
      hint.classList.add("visible");
    } else {
      bar.classList.remove("timer-locked");
      hint.classList.remove("visible");
    }
  }

  function initTimer() {
    renderSubjectsBar();
    updateTimerDisplay();

    $$("#seg button").forEach(btn => {
      btn.addEventListener("click", () => {
        if (timerRunning) return;
        $$("#seg button").forEach(b => b.setAttribute("aria-pressed", "false"));
        btn.setAttribute("aria-pressed", "true");
        timerMode = btn.dataset.mode;
        placeIndicator($("#segIndicator"), btn);
        resetTimer();
      });
    });

    $("#startBtn").addEventListener("click", () => {
      if (timerRunning) {
        pauseTimer();
      } else {
        if (!state.user.uid) {
          showModal(
            "Sign in to start focusing",
            "Please sign in with your Google account to record study time, keep your streak alive, and sync your points.",
            [
              {
                label: "Sign In with Google",
                primary: true,
                action: () => {
                  closeModal();
                  triggerGoogleSignIn();
                }
              },
              { label: "Cancel", primary: false, action: closeModal }
            ]
          );
          return;
        }
        startTimer();
      }
    });

    $("#resetBtn").addEventListener("click", resetTimer);

    $("#saveSessionBtn").addEventListener("click", () => {
      if (timerRunning) pauseTimer();
      commitSessionVerification();
    });

    const claimAction = $("#claimPointsActionBtn");
    if (claimAction) claimAction.addEventListener("click", commitSessionVerification);
    const topClaim = $("#topClaimPointsBtn");
    if (topClaim) topClaim.addEventListener("click", commitSessionVerification);

    $("#topicInput").addEventListener("input", e => {
      $("#activeTopicTag").textContent = e.target.value.trim() || "No topic selected";
    });
  }

  function startTimer() {
    timerRunning = true;
    setSubjectLock(true);
    $("#startBtnLabel").textContent = "Pause";
    $("#ringWrap").classList.add("running");
    $("#timerStatus").textContent = timerMode === "stopwatch" ? "Tracking Focus" : "Pomodoro Active";
    setPresence("studying");

    sessionStartTimestamp = Date.now();
    sessionBaseSeconds = timerMode === "stopwatch" ? stopwatchSecs : pomoRemaining;

    requestWakeLock();
    if (timerWorker) timerWorker.postMessage('start');
  }

  function pauseTimer() {
    timerRunning = false;
    setSubjectLock(false);
    if (timerWorker) timerWorker.postMessage('stop');
    releaseWakeLock();

    $("#startBtnLabel").textContent = "Resume";
    $("#ringWrap").classList.remove("running");
    $("#timerStatus").textContent = "Paused";
    setPresence("online");

    if (pendingSession.seconds >= 30) {
      promptPendingPointsCard();
    }
  }

  function resetTimer() {
    pauseTimer();
    stopwatchSecs = 0;
    pomoRemaining = 25 * 60;
    pendingSession.seconds = 0;
    const pendingCard = $("#pendingSessionCard");
    if (pendingCard) pendingCard.classList.remove("visible");
    const topClaim = $("#topClaimPointsBtn");
    if (topClaim) topClaim.style.display = "none";
    $("#startBtnLabel").textContent = "Start";
    $("#timerStatus").textContent = "Ready";
    updateTimerDisplay();
  }

  function onTimerTick() {
    const elapsed = Math.floor((Date.now() - sessionStartTimestamp) / 1000);

    if (timerMode === "stopwatch") {
      stopwatchSecs = sessionBaseSeconds + elapsed;
      pendingSession.seconds = elapsed;
    } else {
      pomoRemaining = Math.max(0, sessionBaseSeconds - elapsed);
      pendingSession.seconds = elapsed;

      if (pomoRemaining === 0) {
        pendingSession.isCompletedPomo = true;
        pauseTimer();
        pomoRemaining = 25 * 60;
        commitSessionVerification();
        return;
      }
    }

    if (elapsed > 0 && elapsed % 60 === 0) {
      recordFocusMinute();
    }

    updateTimerDisplay();
  }

  document.addEventListener("visibilitychange", () => {
    if (timerRunning) {
      onTimerTick();
    }
  });

  function updateTimerDisplay() {
    const s = timerMode === "stopwatch" ? stopwatchSecs : pomoRemaining;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    $("#timeDigits").textContent = `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;

    if (!ringProgress) return;
    if (timerMode === "stopwatch") {
      const f = (stopwatchSecs % 3600) / 3600;
      ringProgress.style.strokeDashoffset = (C * (1 - f)).toFixed(2);
    } else {
      const f = pomoRemaining / (25 * 60);
      ringProgress.style.strokeDashoffset = (C * (1 - f)).toFixed(2);
    }
  }

  function recordFocusMinute() {
    checkDayRoll();
    state.stats.todaySeconds += 60;
    state.stats.weekSeconds += 60;
    state.stats.totalSeconds += 60;

    const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date().getDay()];
    if (state.stats.weeklyDays[dayName] !== undefined) {
      state.stats.weeklyDays[dayName] += 60;
    }

    if (state.stats.todaySeconds >= 900) {
      markStreakToday();
    }
    saveLocalState();
  }

  function calculateSessionPoints(minutes, isCompletedPomo) {
    if (minutes <= 0) return 0;
    const todayMinsBefore = Math.floor(state.stats.todaySeconds / 60);

    let basePoints = 0;
    for (let m = 0; m < minutes; m++) {
      const minToday = todayMinsBefore + m;
      if (minToday < 480) {
        basePoints += 10;
      } else if (minToday < 720) {
        basePoints += 2;
      } else {
        basePoints += 0;
      }
    }

    const completionBonus = isCompletedPomo ? 1.2 : 1.0;
    const streakMult = Math.min(1.5, 1.0 + Math.max(0, state.streak.count) * 0.1);

    return Math.round(basePoints * completionBonus * streakMult);
  }

  function promptPendingPointsCard() {
    const mins = Math.max(1, Math.round(pendingSession.seconds / 60));
    const pts = calculateSessionPoints(mins, pendingSession.isCompletedPomo);
    const details = $("#pendingSessionDetails");
    if (details) details.textContent = `${mins}m focused (+${pts} pts) • Claim within 5m`;
    const pendingCard = $("#pendingSessionCard");
    if (pendingCard) pendingCard.classList.add("visible");
    const topClaim = $("#topClaimPointsBtn");
    if (topClaim) topClaim.style.display = "inline-flex";
    pendingSession.timestampEnd = Date.now();
  }

  function commitSessionVerification() {
    if (pendingSession.seconds < 15) {
      showModal("Session Too Short", "Study at least 1 minute to earn verified points.", [
        { label: "OK", action: closeModal }
      ]);
      return;
    }

    if (pendingSession.timestampEnd && (Date.now() - pendingSession.timestampEnd) > 5 * 60 * 1000) {
      showModal("Session Expired", "Points unverified because the 5-minute claim window lapsed.", [
        { label: "Close", action: closeModal }
      ]);
      resetTimer();
      return;
    }

    const minutes = Math.max(1, Math.round(pendingSession.seconds / 60));
    const earnedPoints = calculateSessionPoints(minutes, pendingSession.isCompletedPomo);

    state.stats.dailyPoints += earnedPoints;
    state.stats.weeklyPoints += earnedPoints;
    state.stats.allTimePoints += earnedPoints;

    if (window.recordStudySession) {
      window.recordStudySession(minutes, earnedPoints);
    }

    saveLocalState();
    resetTimer();

    showModal("Points Claimed!", `You earned +${earnedPoints} pts! Your global ranking is updated.`, [
      { label: "Awesome", action: closeModal }
    ]);

    renderProgressTab();
    renderClassoreLeaderboard();
  }

  // -------------------------------------------------------------
  // 4. COLOR ACCENTS & THEMING
  // -------------------------------------------------------------
  const hexToRgb = h => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const luminance = c => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const onColor = c => luminance(c) > 0.28 ? "#14171f" : "#ffffff";

  function applyAccentColor(hex) {
    let c = hexToRgb(hex);
    if (state.settings.theme === "dark") c = mix(c, [255, 255, 255], 0.15);
    const c2 = mix(c, [255, 255, 255], 0.35);
    const root = document.documentElement.style;
    root.setProperty("--accent", `rgb(${c.join(",")})`);
    root.setProperty("--accent-2", `rgb(${c2.join(",")})`);
    root.setProperty("--on-accent", onColor(c));
    root.setProperty("--accent-soft", `rgba(${c.join(",")}, 0.14)`);
    root.setProperty("--accent-mid", `rgba(${c.join(",")}, 0.35)`);
    if ($("#ringProgress")) $("#ringProgress").style.stroke = `rgb(${c.join(",")})`;
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const sw = $("#themeSwitch");
    if (sw) sw.setAttribute("aria-checked", String(theme === "dark"));
  }

  // -------------------------------------------------------------
  // 5. AUDIO WAVE VISUALIZER
  // -------------------------------------------------------------
  const waveCanvas = $("#waveCanvas");
  const waveCtx = waveCanvas ? waveCanvas.getContext("2d") : null;
  let waveStep = 0;

  function renderWave() {
    if (!waveCtx) return;
    waveCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
    const W = waveCanvas.width;
    const H = waveCanvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const radius = 96;

    if (timerRunning) {
      waveStep += 0.04;
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ca3838";

      for (let layer = 0; layer < 3; layer++) {
        waveCtx.beginPath();
        waveCtx.strokeStyle = accent;
        waveCtx.globalAlpha = 0.25 - layer * 0.06;
        waveCtx.lineWidth = 2.5;

        for (let a = 0; a <= Math.PI * 2; a += 0.04) {
          const freq = 6 + layer * 2;
          const amp = 5.5 * Math.sin(a * freq + waveStep + layer);
          const r = radius + amp;
          const x = cx + r * Math.cos(a);
          const y = cy + r * Math.sin(a);
          if (a === 0) waveCtx.moveTo(x, y);
          else waveCtx.lineTo(x, y);
        }
        waveCtx.closePath();
        waveCtx.stroke();
      }
      waveCtx.globalAlpha = 1.0;
    }
    requestAnimationFrame(renderWave);
  }

  // -------------------------------------------------------------
  // 6. SUBJECTS & ALL-SUBJECTS FILTERING
  // -------------------------------------------------------------
  let currentSubjectFilter = "all";

  function renderSubjectsBar() {
    const bar = $("#subjectsBar");
    const taskSelect = $("#taskSubSelect");
    const filterPills = $("#subjectFilterPills");
    if (!bar || !taskSelect || !filterPills) return;
    bar.innerHTML = "";
    taskSelect.innerHTML = "";

    state.subjects.forEach(s => {
      const chip = document.createElement("span");
      chip.className = `chip ${s.id === activeSubId ? "on" : ""}`;
      chip.style.setProperty("--c", s.color);
      chip.style.setProperty("--oc", onColor(hexToRgb(s.color)));
      chip.innerHTML = `
        <button type="button" class="chip-main">
          <i class="chip-dot"></i><span>${s.name}</span>
        </button>
      `;

      chip.querySelector("button").addEventListener("click", () => {
        if (timerRunning) {
          showModal("Timer Active", "Subject switching is locked during active focus. Pause or save the session first.", [
            { label: "Got it", action: closeModal }
          ]);
          return;
        }
        activeSubId = s.id;
        applyAccentColor(s.color);
        renderSubjectsBar();
      });
      bar.appendChild(chip);

      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      taskSelect.appendChild(opt);
    });

    filterPills.innerHTML = "";
    const allPill = document.createElement("span");
    allPill.className = `sub-filter-item ${currentSubjectFilter === "all" ? "active" : ""}`;
    allPill.dataset.sub = "all";
    allPill.textContent = "All Subjects";
    allPill.addEventListener("click", () => {
      currentSubjectFilter = "all";
      $$(".sub-filter-item").forEach(p => p.classList.remove("active"));
      allPill.classList.add("active");
      renderClassoreLeaderboard();
    });
    filterPills.appendChild(allPill);

    state.subjects.forEach(s => {
      const fp = document.createElement("span");
      fp.className = `sub-filter-item ${currentSubjectFilter === s.id ? "active" : ""}`;
      fp.dataset.sub = s.id;
      fp.textContent = s.name;
      fp.addEventListener("click", () => {
        currentSubjectFilter = s.id;
        $$(".sub-filter-item").forEach(p => p.classList.remove("active"));
        fp.classList.add("active");
        renderClassoreLeaderboard();
      });
      filterPills.appendChild(fp);
    });

    renderPrefSubjectList();
  }

  function renderPrefSubjectList() {
    const prefList = $("#prefSubjectList");
    if (!prefList) return;
    prefList.innerHTML = "";

    state.subjects.forEach(s => {
      const row = document.createElement("div");
      row.className = "subject-edit-item";
      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="width: 12px; height: 12px; border-radius: 50%; background: ${s.color};"></span>
          <strong>${s.name}</strong>
        </div>
        <button type="button" class="del-task-btn" title="Remove"><i data-lucide="trash-2" style="width: 14px; height: 14px;"></i></button>
      `;
      row.querySelector("button").addEventListener("click", () => {
        if (state.subjects.length <= 1) {
          showModal("Notice", "You must keep at least one subject.", [{ label: "OK", action: closeModal }]);
          return;
        }
        state.subjects = state.subjects.filter(sub => sub.id !== s.id);
        if (activeSubId === s.id) activeSubId = state.subjects[0].id;
        saveLocalState();
        renderSubjectsBar();
      });
      prefList.appendChild(row);
    });
    lucide.createIcons();
  }

  const newSubForm = $("#newSubjectForm");
  if (newSubForm) {
    newSubForm.addEventListener("submit", e => {
      e.preventDefault();
      const name = $("#newSubName").value.trim();
      const color = $("#newSubColor").value;
      if (!name) return;

      state.subjects.push({
        id: "sub_" + Date.now().toString(36),
        name,
        color
      });
      saveLocalState();
      $("#newSubName").value = "";
      renderSubjectsBar();
    });
  }

  // -------------------------------------------------------------
  // 7. STUDY TASKS
  // -------------------------------------------------------------
  function renderTasks() {
    const list = $("#taskList");
    const empty = $("#taskEmpty");
    if (!list || !empty) return;
    list.innerHTML = "";
    empty.hidden = sessionTasks.length > 0;

    sessionTasks.forEach(t => {
      const sub = state.subjects.find(s => s.id === t.subjectId) || { name: "General", color: "#ca3838" };
      const li = document.createElement("li");
      li.className = `task ${t.done ? "done" : ""}`;
      li.innerHTML = `
        <button type="button" class="check" aria-checked="${t.done}">
          <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
        </button>
        <span class="task-text">${t.text}</span>
        <span class="task-badge" style="background:${sub.color}22; color:${sub.color}">${sub.name}</span>
        <button type="button" class="del-task-btn"><i data-lucide="x" style="width: 14px; height: 14px;"></i></button>
      `;

      li.querySelector(".check").addEventListener("click", () => {
        t.done = !t.done;
        saveSessionTasks();
        renderTasks();
      });

      li.querySelector(".del-task-btn").addEventListener("click", () => {
        sessionTasks = sessionTasks.filter(item => item.id !== t.id);
        saveSessionTasks();
        renderTasks();
      });

      list.appendChild(li);
    });
    lucide.createIcons();
  }

  const taskForm = $("#taskForm");
  if (taskForm) {
    taskForm.addEventListener("submit", e => {
      e.preventDefault();
      const text = $("#taskInput").value.trim();
      const subjectId = $("#taskSubSelect").value;
      if (!text) return;

      sessionTasks.push({ id: Date.now(), text, subjectId, done: false });
      saveSessionTasks();
      $("#taskInput").value = "";
      renderTasks();
    });
  }

  function clearCompletedTasks() {
    if (sessionTasks.some(t => t.done)) {
      sessionTasks = sessionTasks.filter(t => !t.done);
      saveSessionTasks();
      renderTasks();
    }
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) clearCompletedTasks(); });
  window.addEventListener("pagehide", clearCompletedTasks);

  // -------------------------------------------------------------
  // 8. PROGRESS TAB & EXACT ANIMATED BAR GRAPH
  // -------------------------------------------------------------
  function renderProgressTab() {
    const todayHrs = state.stats.todaySeconds / 3600;
    const weekHrs = state.stats.weekSeconds / 3600;
    const goal = state.settings.dailyGoalHours;

    const statToday = $("#statToday");
    const statWeek = $("#statWeek");
    const statPts = $("#statTotalPts");
    const badge = $("#chartTotalBadge");

    if (statToday) statToday.textContent = `${Math.floor(todayHrs)}h ${Math.round((todayHrs % 1) * 60)}m`;
    if (statWeek) statWeek.textContent = `${Math.floor(weekHrs)}h ${Math.round((weekHrs % 1) * 60)}m`;
    if (statPts) statPts.textContent = `${state.stats.weeklyPoints} Pts`;
    if (badge) badge.textContent = `${weekHrs.toFixed(1)}h total`;

    const goalRatio = $("#goalTextRatio");
    const goalPct = $("#goalPercent");
    const meterBar = $("#goalMeterBar");

    if (goalRatio) goalRatio.textContent = `${todayHrs.toFixed(1)}h of ${goal.toFixed(1)}h`;
    const pct = Math.min(100, Math.round((todayHrs / goal) * 100));
    if (goalPct) goalPct.textContent = `${pct}%`;
    if (meterBar) meterBar.style.width = `${pct}%`;

    renderRestoredBarGraph();
  }

  function renderRestoredBarGraph() {
    const container = $("#weeklyBarsContainer");
    if (!container) return;

    container.innerHTML = "";

    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const currentDayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date().getDay()];

    const vals = days.map(d => (state.stats.weeklyDays[d] || 0) / 3600);
    const maxVal = Math.max(2, ...vals);

    days.forEach((day, idx) => {
      const hours = vals[idx];
      let percent = Math.min(100, Math.round((hours / maxVal) * 100));
      if (hours > 0 && percent < 6) percent = 6;

      const isToday = day === currentDayName;

      const col = document.createElement("div");
      col.className = `col ${isToday ? "today" : ""}`;
      col.innerHTML = `
        <div class="well">
          <i style="--h: ${percent}%; --n: ${idx};" title="${day}: ${hours.toFixed(1)}h"></i>
        </div>
        ${day}
      `;
      container.appendChild(col);
    });
  }

  // -------------------------------------------------------------
  // 9. CLASSORE LEADERBOARD & INTERACTIVE PROFILE / EDIT MODAL
  // -------------------------------------------------------------
  let currentLeague = "weekly";
  let cachedLeaderboardUsers = [];

  function initClassoreLeagues() {
    $$(".league-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        $$(".league-tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentLeague = btn.dataset.league;
        renderClassoreLeaderboard();
      });
    });

    const filterBar = $(".classore-filter-bar");
    if (filterBar) {
      // 1. Refresh Button
      let refreshBtn = $("#btnRefreshLeaderboard");
      if (!refreshBtn) {
        refreshBtn = document.createElement("button");
        refreshBtn.id = "btnRefreshLeaderboard";
        refreshBtn.type = "button";
        refreshBtn.className = "btn ghost refresh-lead-btn";
        refreshBtn.title = "Reload Leaderboard Data";
        refreshBtn.innerHTML = `<i data-lucide="rotate-cw" style="width:14px;height:14px;"></i><span>Refresh</span>`;

        const authContainer = $("#authContainer");
        if (authContainer) {
          filterBar.insertBefore(refreshBtn, authContainer);
        } else {
          filterBar.appendChild(refreshBtn);
        }

        refreshBtn.addEventListener("click", async () => {
          const icon = refreshBtn.querySelector("i, svg");
          if (icon) icon.classList.add("spin-clockwise");
          await forceRefreshLeaderboard();
          setTimeout(() => {
            if (icon) icon.classList.remove("spin-clockwise");
          }, 650);
        });
      }

      // 2. Admin Broadcast Button (Only visible to gethminahalangoda@gmail.com)
      let broadcastBtn = $("#btnAdminBroadcast");
      if (state.user.isAdmin && !broadcastBtn) {
        broadcastBtn = document.createElement("button");
        broadcastBtn.id = "btnAdminBroadcast";
        broadcastBtn.type = "button";
        broadcastBtn.className = "admin-topbar-broadcast-btn";
        broadcastBtn.title = "Admin: Send In-App & Push Notification";
        broadcastBtn.innerHTML = `<span>📢 Broadcast</span>`;
        broadcastBtn.addEventListener("click", () => {
          openNotificationComposerModal(null);
        });

        const authContainer = $("#authContainer");
        if (authContainer) {
          filterBar.insertBefore(broadcastBtn, authContainer);
        } else {
          filterBar.appendChild(broadcastBtn);
        }
      }
      lucide.createIcons();
    }
  }

  function renderAvatar(container, user, size = "40px") {
    if (!container) return;
    container.innerHTML = "";
    if (user.avatar) {
      const img = document.createElement("img");
      img.src = user.avatar;
      img.style.width = size;
      img.style.height = size;
      img.style.borderRadius = "50%";
      img.style.objectFit = "cover";
      container.appendChild(img);
    } else {
      const initials = (user.displayName || "S").slice(0, 2).toUpperCase();
      container.textContent = initials;
      container.style.display = "grid";
      container.style.placeItems = "center";
      container.style.background = "var(--accent-soft)";
      container.style.color = "var(--ink)";
      container.style.fontWeight = "700";
    }
  }

  function extractUserPoints(user, league) {
    if (league === "daily") {
      return user.dailyPoints ?? user.points ?? 0;
    } else if (league === "alltime") {
      return user.allTimePoints ?? user.points ?? user.weeklyPoints ?? 0;
    } else {
      return user.weeklyPoints ?? user.points ?? user.allTimePoints ?? 0;
    }
  }

  function renderClassoreLeaderboard() {
    const listEl = $("#classoreLeaderboardRows");
    if (!listEl) return;
    listEl.innerHTML = "";

    let fullList = [...cachedLeaderboardUsers];
    const meExists = fullList.some(u => u.uid === state.user.uid);
    if (!meExists) {
      fullList.push({
        uid: state.user.uid || "local_me",
        email: state.user.email,
        displayName: state.user.displayName,
        avatar: state.user.avatar,
        bio: state.user.bio || "Local Scholar",
        points: state.stats.weeklyPoints,
        dailyPoints: state.stats.dailyPoints,
        weeklyPoints: state.stats.weeklyPoints,
        allTimePoints: state.stats.allTimePoints,
        streak: state.streak.count,
        weeklyHours: state.stats.weekSeconds / 3600,
        isPremium: isUserPremium(state.user)
      });
    }

    if (currentSubjectFilter !== "all") {
      fullList = fullList.filter(u => u.activeSubject === currentSubjectFilter || true);
    }

    fullList.sort((a, b) => extractUserPoints(b, currentLeague) - extractUserPoints(a, currentLeague));

    let myRank = -1;
    let pointsBehind = 0;
    let personAboveName = "";

    fullList.forEach((user, idx) => {
      const rank = idx + 1;
      const isMe = user.uid === (state.user.uid || "local_me");
      const userPts = extractUserPoints(user, currentLeague);
      const userIsVerified = isUserPremium(user);

      if (isMe) {
        myRank = rank;
        if (idx > 0) {
          const aboveUser = fullList[idx - 1];
          pointsBehind = extractUserPoints(aboveUser, currentLeague) - userPts;
          personAboveName = aboveUser.displayName || `#${rank - 1}`;
        }
      }

      const row = document.createElement("div");
      row.className = `leaderboard-row ${isMe ? "is-me" : ""}`;

      let rankHtml = `<span>${rank}</span>`;
      if (rank === 1) rankHtml = `<span class="badge-gold">★ 1</span>`;
      else if (rank === 2) rankHtml = `<span class="badge-silver">★ 2</span>`;
      else if (rank === 3) rankHtml = `<span class="badge-bronze">★ 3</span>`;

      row.innerHTML = `
        <div class="row-user-info">
          <div class="rank-badge-wrap">${rankHtml}</div>
          <div class="user-row-avatar" id="classoreRowAv_${rank}"></div>
          <div style="min-width:0; flex:1;">
            <div class="user-name-title">
              <span>${user.displayName || "Scholar"} ${isMe ? "(You)" : ""}</span>
              ${getVerifiedBadgeHtml(userIsVerified)}
            </div>
            <div class="user-sub-location">${user.bio || "Scholar"}</div>
          </div>
        </div>
        <div class="points-pill">• ${userPts} Pts</div>
      `;

      row.addEventListener("click", () => {
        openScholarProfileModal(user);
      });

      listEl.appendChild(row);
      renderAvatar($(`#classoreRowAv_${rank}`), user, "38px");
    });

    const cardName = $("#classoreUserName");
    const userIsVerified = isUserPremium(state.user);
    if (cardName) {
      cardName.innerHTML = `<span>${state.user.displayName} (You)</span> ${getVerifiedBadgeHtml(userIsVerified)}`;
    }

    const cardBio = $("#classoreUserBio");
    if (cardBio) cardBio.textContent = state.user.bio || "Local Scholar";
    renderAvatar($("#classoreUserAvatar"), state.user, "70px");

    const tRank = $("#classoreTileRank");
    const tStreak = $("#classoreTileStreak");
    const tPoints = $("#classoreTilePoints");
    const tTime = $("#classoreTileTime");

    if (tRank) tRank.textContent = myRank > 0 ? `#${myRank}` : "--";
    if (tStreak) tStreak.textContent = state.streak.count;
    if (tPoints) tPoints.textContent = extractUserPoints(state.user, currentLeague) || state.stats.weeklyPoints;
    if (tTime) tTime.textContent = `${(state.stats.weekSeconds / 3600).toFixed(1)}h`;

    const banner = $("#classoreRelativeBanner");
    if (banner) {
      if (myRank === 1) {
        banner.textContent = "🏆 You are currently #1 on the leaderboard!";
      } else if (myRank > 1) {
        banner.textContent = `You are #${myRank} — ${pointsBehind} pts behind ${personAboveName}`;
      } else {
        banner.textContent = "Complete a focus session to establish your standing.";
      }
    }
  }

  // -------------------------------------------------------------
  // 10. SCHOLAR PROFILE & ADMIN STAT EDITOR MODAL
  // -------------------------------------------------------------
  function openScholarProfileModal(user) {
    const isMe = user.uid === state.user.uid;
    const isOwner = isSuperAdmin(state.user.email);
    const verified = isUserPremium(user);
    const weeklyPts = user.weeklyPoints ?? user.points ?? 0;
    const weeklyHours = user.weeklyHours ?? ((user.totalStudyTime || 0) / 60) ?? 0;
    const streak = user.streak ?? 0;

    let adminFormHtml = "";
    if (isOwner) {
      adminFormHtml = `
        <div style="margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line-strong);">
          <div style="font-size: 0.8rem; font-weight: 800; color: #24A1DE; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
            <span>👑 ADMIN STAT EDITOR</span>
            <span>${user.email || user.uid}</span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="admin-modal-field">
              <label>Weekly Points</label>
              <input type="number" id="admEditPoints" value="${weeklyPts}">
            </div>
            <div class="admin-modal-field">
              <label>Weekly Hours</label>
              <input type="number" step="0.1" id="admEditHours" value="${weeklyHours.toFixed(1)}">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="admin-modal-field">
              <label>Streak (Days)</label>
              <input type="number" id="admEditStreak" value="${streak}">
            </div>
            <div class="admin-modal-field">
              <label>Verified / Premium</label>
              <select id="admEditVerified">
                <option value="true" ${verified ? 'selected' : ''}>Verified (Blue Badge)</option>
                <option value="false" ${!verified ? 'selected' : ''}>Standard</option>
              </select>
            </div>
          </div>

          <div style="display: flex; gap: 8px; margin-top: 10px;">
            <button type="button" class="btn" id="admBtnSaveUser" style="flex: 1; padding: 10px;">Save Changes</button>
            <button type="button" class="btn ghost" id="admBtnSendDM" style="padding: 10px;">💬 Message</button>
          </div>
        </div>
      `;
    }

    const modalContent = `
      <div style="display: flex; flex-direction: column; align-items: center; text-align: center;">
        <div class="profile-card-avatar" style="width: 64px; height: 64px; margin-bottom: 8px;" id="modalAvatarBox"></div>
        <h3 style="margin: 0; font-size: 1.25rem;">
          ${user.displayName || "Scholar"}
          ${getVerifiedBadgeHtml(verified)}
        </h3>
        <p style="color: var(--muted); font-size: 0.85rem; margin: 4px 0 16px;">${user.bio || "Scholar of Morrow"}</p>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; width: 100%;">
          <div style="background: var(--surface-raised); padding: 10px; border-radius: 12px; border: 1px solid var(--line);">
            <div style="font-size: 0.75rem; color: var(--muted);">Points</div>
            <div style="font-size: 1.15rem; font-weight: 800; color: #10b981;">${weeklyPts}</div>
          </div>
          <div style="background: var(--surface-raised); padding: 10px; border-radius: 12px; border: 1px solid var(--line);">
            <div style="font-size: 0.75rem; color: var(--muted);">Focus</div>
            <div style="font-size: 1.15rem; font-weight: 800; color: var(--accent);">${weeklyHours.toFixed(1)}h</div>
          </div>
          <div style="background: var(--surface-raised); padding: 10px; border-radius: 12px; border: 1px solid var(--line);">
            <div style="font-size: 0.75rem; color: var(--muted);">Streak</div>
            <div style="font-size: 1.15rem; font-weight: 800; color: var(--flame);">${streak}d</div>
          </div>
        </div>

        ${adminFormHtml}
      </div>
    `;

    showModal("Scholar Profile", modalContent, [
      { label: "Close", primary: false, action: closeModal }
    ], true);

    renderAvatar($("#modalAvatarBox"), user, "64px");

    if (isOwner) {
      const btnSave = $("#admBtnSaveUser");
      if (btnSave) {
        btnSave.addEventListener("click", async () => {
          const newPts = parseInt($("#admEditPoints").value) || 0;
          const newHrs = parseFloat($("#admEditHours").value) || 0;
          const newStreak = parseInt($("#admEditStreak").value) || 0;
          const newVerified = $("#admEditVerified").value === "true";

          btnSave.textContent = "Saving...";
          const db = firebase.firestore();

          try {
            await db.collection("users").doc(user.uid).set({
              points: newPts,
              weeklyPoints: newPts,
              allTimePoints: newPts,
              dailyPoints: newPts,
              weeklyHours: newHrs,
              totalStudyTime: Math.round(newHrs * 60),
              totalSeconds: Math.round(newHrs * 3600),
              streak: newStreak,
              isPremium: newVerified,
              lastActive: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            if (isMe) {
              state.stats.weeklyPoints = newPts;
              state.stats.weekSeconds = Math.round(newHrs * 3600);
              state.streak.count = newStreak;
              state.user.isPremium = newVerified;
              saveLocalState();
            }

            const target = cachedLeaderboardUsers.find(u => u.uid === user.uid);
            if (target) {
              target.points = newPts;
              target.weeklyPoints = newPts;
              target.weeklyHours = newHrs;
              target.streak = newStreak;
              target.isPremium = newVerified;
            }

            renderClassoreLeaderboard();
            closeModal();
            showInAppToast("Admin Notice", `Successfully updated stats for ${user.displayName || "user"}!`);
          } catch (err) {
            console.error("Admin update error:", err);
            alert("Error saving: check Firestore security rules to allow admin writes.");
            btnSave.textContent = "Save Changes";
          }
        });
      }

      const btnDM = $("#admBtnSendDM");
      if (btnDM) {
        btnDM.addEventListener("click", () => {
          closeModal();
          openNotificationComposerModal(user);
        });
      }
    }
  }

  // -------------------------------------------------------------
  // 11. NOTIFICATIONS COMPOSER (ADMIN BROADCAST & DIRECT)
  // -------------------------------------------------------------
  function openNotificationComposerModal(targetUser = null) {
    if (!state.user.isAdmin) return;

    const isGlobal = !targetUser;
    const recipientLabel = isGlobal 
      ? "📢 All Scholars (Global Broadcast)" 
      : `👤 ${targetUser.displayName || "Scholar"} (${targetUser.email || targetUser.uid})`;

    const modalContent = `
      <div style="text-align: left;">
        <div style="font-size: 0.8rem; font-weight: 700; color: #24A1DE; margin-bottom: 14px;">
          RECIPIENT: ${recipientLabel}
        </div>

        <div class="admin-modal-field">
          <label>Notification Title</label>
          <input type="text" id="notifInputTitle" placeholder="e.g. Focus Sprint Announcement" maxlength="60" required>
        </div>

        <div class="admin-modal-field">
          <label>Message Content</label>
          <textarea id="notifInputMessage" rows="3" placeholder="Write your announcement or notice here..." maxlength="240" required></textarea>
        </div>

        <button type="button" class="btn" id="btnSubmitSendNotif" style="width: 100%; margin-top: 8px;">
          Send Notification
        </button>
      </div>
    `;

    showModal(isGlobal ? "Broadcast to Website" : "Direct Message", modalContent, [
      { label: "Cancel", primary: false, action: closeModal }
    ], true);

    const btnSubmit = $("#btnSubmitSendNotif");
    if (btnSubmit) {
      btnSubmit.addEventListener("click", async () => {
        const title = $("#notifInputTitle").value.trim();
        const message = $("#notifInputMessage").value.trim();
        if (!title || !message) {
          alert("Please fill in both the title and message.");
          return;
        }

        btnSubmit.textContent = "Sending...";
        const db = firebase.firestore();

        try {
          await db.collection("notifications").add({
            title: title,
            message: message,
            targetUid: isGlobal ? "all" : targetUser.uid,
            senderEmail: SUPER_ADMIN_EMAIL,
            senderName: "Gethmina Halangoda (Admin)",
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });

          closeModal();
          showInAppToast("Notification Dispatched", isGlobal ? "Global announcement sent to all users!" : `Direct message delivered to ${targetUser.displayName}!`);
        } catch (err) {
          console.error("Notification dispatch error:", err);
          alert("Could not dispatch notification. Make sure Firestore rules allow writes to the 'notifications' collection.");
          btnSubmit.textContent = "Send Notification";
        }
      });
    }
  }

  // Real-time listener for incoming notifications + Native OS Notifications
  function initRealtimeNotificationsListener() {
    if (!window.firebase || !firebase.apps.length) return;
    const db = firebase.firestore();

    db.collection("notifications")
      .orderBy("createdAt", "desc")
      .limit(6)
      .onSnapshot(snap => {
        snap.docChanges().forEach(change => {
          if (change.type === "added") {
            const data = change.doc.data();
            const notifId = change.doc.id;

            const isForMe = data.targetUid === "all" || (state.user.uid && data.targetUid === state.user.uid);
            const hasSeen = localStorage.getItem("morrow_seen_notif_" + notifId);

            if (isForMe && !hasSeen) {
              localStorage.setItem("morrow_seen_notif_" + notifId, "true");

              // 1. In-App Frosted Banner
              showInAppToast(data.title, data.message, data.senderName);

              // 2. Real Native Windows / Mac / Android OS System Notification
              triggerRealOSNotification(data.title, data.message);
            }
          }
        });
      }, err => console.warn("Notifications listener:", err));
  }

  function showInAppToast(title, message, sender = "Admin Notice") {
    const existing = $(".in-app-toast-alert");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "in-app-toast-alert";
    toast.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 1rem;">🔔</span>
          <strong style="font-size: 0.95rem; color: #24A1DE;">${title}</strong>
        </div>
        <button type="button" class="del-task-btn" style="padding: 2px;" id="btnToastDismiss">
          <i data-lucide="x" style="width: 14px; height: 14px;"></i>
        </button>
      </div>
      <p style="margin: 0; font-size: 0.85rem; color: var(--ink); line-height: 1.4;">${message}</p>
      <div style="margin-top: 6px; font-size: 0.72rem; color: var(--muted); text-align: right;">${sender}</div>
    `;

    document.body.appendChild(toast);
    lucide.createIcons();

    const btnDismiss = $("#btnToastDismiss");
    if (btnDismiss) btnDismiss.addEventListener("click", () => toast.remove());
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 9000);
  }

  // -------------------------------------------------------------
  // 12. MANUAL LEADERBOARD REFRESH
  // -------------------------------------------------------------
  async function forceRefreshLeaderboard() {
    if (!window.firebase || !firebase.apps.length) return;
    const db = firebase.firestore();

    try {
      const snap = await db.collection("users").limit(50).get({ source: "server" });
      cachedLeaderboardUsers = [];
      snap.forEach(doc => {
        const data = doc.data();
        const userEmail = data.email || "";
        cachedLeaderboardUsers.push({
          uid: doc.id,
          email: userEmail,
          displayName: data.displayName || "Scholar",
          avatar: data.avatar || null,
          bio: data.bio || "Scholar",
          points: data.points ?? data.weeklyPoints ?? 0,
          weeklyPoints: data.weeklyPoints ?? data.points ?? 0,
          dailyPoints: data.dailyPoints ?? data.points ?? 0,
          allTimePoints: data.allTimePoints ?? data.points ?? 0,
          weeklyHours: data.weeklyHours ?? ((data.totalStudyTime || 0) / 60) ?? 0,
          streak: data.streak || 0,
          isPremium: isSuperAdmin(userEmail) || data.isPremium === true
        });
      });
      renderClassoreLeaderboard();
      console.log("[MORROW] Forced server refresh on leaderboard.");
    } catch (err) {
      const snap = await db.collection("users").limit(50).get();
      cachedLeaderboardUsers = [];
      snap.forEach(doc => {
        const data = doc.data();
        const userEmail = data.email || "";
        cachedLeaderboardUsers.push({
          uid: doc.id,
          email: userEmail,
          displayName: data.displayName || "Scholar",
          avatar: data.avatar || null,
          bio: data.bio || "Scholar",
          points: data.points ?? data.weeklyPoints ?? 0,
          weeklyPoints: data.weeklyPoints ?? data.points ?? 0,
          dailyPoints: data.dailyPoints ?? data.points ?? 0,
          allTimePoints: data.allTimePoints ?? data.points ?? 0,
          weeklyHours: data.weeklyHours ?? ((data.totalStudyTime || 0) / 60) ?? 0,
          streak: data.streak || 0,
          isPremium: isSuperAdmin(userEmail) || data.isPremium === true
        });
      });
      renderClassoreLeaderboard();
    }
  }

  // -------------------------------------------------------------
  // 13. CLOUD-FIRST FIRESTORE HYDRATION & SYNC
  // -------------------------------------------------------------
  function setPresence(status) {
    state.user.presence = status;
    const dot = $("#sidePresence");
    if (dot) dot.className = `presence-dot ${status}`;
    if (window.updateCloudPresence) {
      window.updateCloudPresence(status);
    }
  }

  async function syncWithFirestore() {
    if (!window.firebase || !firebase.apps.length || !state.user.uid || !isCloudHydrated) return;
    try {
      const db = firebase.firestore();
      const isOwner = isSuperAdmin(state.user.email);
      const isPremiumUser = isOwner || state.user.isPremium;

      await db.collection("users").doc(state.user.uid).set({
        email: state.user.email || "",
        displayName: state.user.displayName,
        avatar: state.user.avatar,
        bio: state.user.bio,
        weeklyHours: state.stats.weekSeconds / 3600,
        todaySeconds: state.stats.todaySeconds,
        totalSeconds: state.stats.totalSeconds,
        points: state.stats.weeklyPoints,
        dailyPoints: state.stats.dailyPoints,
        weeklyPoints: state.stats.weeklyPoints,
        allTimePoints: state.stats.allTimePoints,
        totalStudyTime: Math.round(state.stats.totalSeconds / 60),
        streak: state.streak.count,
        weekDaysDone: state.streak.weekDaysDone,
        lastStudyDate: state.streak.lastStudyDate,
        subjects: state.subjects,
        presence: state.user.presence,
        isPremium: isPremiumUser,
        role: isOwner ? "admin" : "scholar",
        lastActive: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.warn("Firestore sync notice:", e);
    }
  }

  async function hydrateUserFromCloud(uid) {
    if (!window.firebase || !firebase.apps.length || !uid) return;
    const db = firebase.firestore();

    try {
      const docSnap = await db.collection("users").doc(uid).get();

      if (docSnap.exists) {
        const cloud = docSnap.data();

        const cloudWeeklyPts = cloud.weeklyPoints ?? cloud.points ?? 0;
        const cloudDailyPts = cloud.dailyPoints ?? cloud.points ?? 0;
        const cloudAllTimePts = cloud.allTimePoints ?? cloud.points ?? 0;
        const cloudTotalSecs = cloud.totalSeconds ?? ((cloud.totalStudyTime || 0) * 60) ?? 0;
        const cloudWeekSecs = Math.round((cloud.weeklyHours || 0) * 3600) || cloudTotalSecs;

        state.stats.weeklyPoints = Math.max(state.stats.weeklyPoints, cloudWeeklyPts);
        state.stats.dailyPoints = Math.max(state.stats.dailyPoints, cloudDailyPts);
        state.stats.allTimePoints = Math.max(state.stats.allTimePoints, cloudAllTimePts);
        state.stats.weekSeconds = Math.max(state.stats.weekSeconds, cloudWeekSecs);
        state.stats.totalSeconds = Math.max(state.stats.totalSeconds, cloudTotalSecs);

        if (cloud.streak !== undefined) {
          state.streak.count = Math.max(state.streak.count, cloud.streak);
        }
        if (cloud.weekDaysDone && Array.isArray(cloud.weekDaysDone)) {
          state.streak.weekDaysDone = Array.from(new Set([...state.streak.weekDaysDone, ...cloud.weekDaysDone]));
        }
        if (cloud.lastStudyDate) state.streak.lastStudyDate = cloud.lastStudyDate;
        if (cloud.displayName) state.user.displayName = cloud.displayName;
        if (cloud.avatar) state.user.avatar = cloud.avatar;
        if (cloud.bio) state.user.bio = cloud.bio;
        if (cloud.subjects && cloud.subjects.length) state.subjects = cloud.subjects;

        if (cloud.isPremium || isSuperAdmin(state.user.email)) {
          state.user.isPremium = true;
        }

        console.log(`[MORROW] Hydrated user state from cloud: ${state.stats.weeklyPoints} pts, ${state.streak.count} day streak.`);
      }

      isCloudHydrated = true;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

      renderStreakWeek();
      renderProgressTab();
      renderClassoreLeaderboard();
      renderUserProfile();
      renderSubjectsBar();

      initUserLiveListener(uid);
    } catch (err) {
      console.error("Cloud hydration error:", err);
      isCloudHydrated = true;
    }
  }

  function initUserLiveListener(uid) {
    const db = firebase.firestore();
    db.collection("users").doc(uid).onSnapshot(doc => {
      if (doc.exists) {
        const remote = doc.data();

        const remoteWeekly = remote.weeklyPoints ?? remote.points ?? 0;
        const remoteDaily = remote.dailyPoints ?? 0;
        const remoteAllTime = remote.allTimePoints ?? remote.points ?? 0;
        const remoteTotalSec = remote.totalSeconds ?? ((remote.totalStudyTime || 0) * 60) ?? 0;
        const remoteWeekSec = Math.round((remote.weeklyHours || 0) * 3600) || remoteTotalSec;

        state.stats.weeklyPoints = Math.max(state.stats.weeklyPoints, remoteWeekly);
        state.stats.dailyPoints = Math.max(state.stats.dailyPoints, remoteDaily);
        state.stats.allTimePoints = Math.max(state.stats.allTimePoints, remoteAllTime);
        state.stats.weekSeconds = Math.max(state.stats.weekSeconds, remoteWeekSec);
        state.stats.totalSeconds = Math.max(state.stats.totalSeconds, remoteTotalSec);

        if (remote.streak !== undefined) state.streak.count = Math.max(state.streak.count, remote.streak);
        if (remote.displayName) state.user.displayName = remote.displayName;
        if (remote.avatar) state.user.avatar = remote.avatar;
        if (remote.bio) state.user.bio = remote.bio;
        if (remote.isPremium || isSuperAdmin(state.user.email)) state.user.isPremium = true;

        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        renderStreakWeek();
        renderProgressTab();
        renderClassoreLeaderboard();
        renderUserProfile();
      }
    });
  }

  function initFirestoreRealtimeLeaderboard() {
    if (!window.firebase || !firebase.apps.length) {
      renderClassoreLeaderboard();
      return;
    }
    const db = firebase.firestore();

    db.collection("users").limit(50).onSnapshot(snap => {
      cachedLeaderboardUsers = [];
      snap.forEach(doc => {
        const data = doc.data();
        const userEmail = data.email || "";
        cachedLeaderboardUsers.push({
          uid: doc.id,
          email: userEmail,
          displayName: data.displayName || "Scholar",
          avatar: data.avatar || null,
          bio: data.bio || "Scholar",
          points: data.points ?? data.weeklyPoints ?? 0,
          weeklyPoints: data.weeklyPoints ?? data.points ?? 0,
          dailyPoints: data.dailyPoints ?? data.points ?? 0,
          allTimePoints: data.allTimePoints ?? data.points ?? 0,
          weeklyHours: data.weeklyHours ?? ((data.totalStudyTime || 0) / 60) ?? 0,
          streak: data.streak || 0,
          isPremium: isSuperAdmin(userEmail) || data.isPremium === true
        });
      });
      renderClassoreLeaderboard();
    }, err => console.warn(err));
  }

  function triggerGoogleSignIn() {
    if (window.signInWithGoogle) {
      window.signInWithGoogle().catch(() => {
        showModal("Sign-In Notice", "Sign-in popup was dismissed. Please check your credentials.", [
          { label: "Close", action: closeModal }
        ]);
      });
    }
  }

  function initAuth() {
    if (!window.firebase || !firebase.apps.length) return;

    firebase.auth().onAuthStateChanged(async user => {
      if (user) {
        state.user.uid = user.uid;
        state.user.email = (user.email || "").toLowerCase().trim();
        state.user.displayName = user.displayName || state.user.displayName;
        if (!state.user.avatar && user.photoURL) {
          state.user.avatar = user.photoURL;
        }

        if (isSuperAdmin(state.user.email)) {
          state.user.isAdmin = true;
          state.user.isPremium = true;
          console.log("[MORROW] Super Admin verified: gethminahalangoda@gmail.com");
        }

        const btnLogin = $("#btnGoogleLogin");
        const btnLogout = $("#btnSignOut");
        if (btnLogin) btnLogin.style.display = "none";
        if (btnLogout) btnLogout.style.display = "inline-flex";

        renderUserProfile();
        initFirestoreRealtimeLeaderboard();
        initRealtimeNotificationsListener();
        initClassoreLeagues();
        initSystemNotifications(); // Requests native browser/phone system notification permissions

        await hydrateUserFromCloud(user.uid);
      } else {
        state.user.uid = null;
        state.user.email = null;
        state.user.isAdmin = false;
        state.user.isPremium = false;
        isCloudHydrated = false;
        const btnLogin = $("#btnGoogleLogin");
        const btnLogout = $("#btnSignOut");
        if (btnLogin) btnLogin.style.display = "inline-flex";
        if (btnLogout) btnLogout.style.display = "none";
      }
    });

    const btnLogin = $("#btnGoogleLogin");
    if (btnLogin) btnLogin.addEventListener("click", triggerGoogleSignIn);
    const btnLogout = $("#btnSignOut");
    if (btnLogout) {
      btnLogout.addEventListener("click", async () => {
        if (window.signOutUser) {
          await window.signOutUser();
        } else {
          await firebase.auth().signOut();
        }
        location.reload();
      });
    }
  }

  // -------------------------------------------------------------
  // 14. PREFERENCES & LOCAL AVATAR DRAG/DROP
  // -------------------------------------------------------------
  function initPreferences() {
    renderUserProfile();

    const slider = $("#dailyGoalSlider");
    if (slider) {
      slider.value = state.settings.dailyGoalHours;
      const lbl = $("#dailyGoalLabel");
      if (lbl) lbl.textContent = `${state.settings.dailyGoalHours.toFixed(1)}h`;
      slider.addEventListener("input", e => {
        state.settings.dailyGoalHours = parseFloat(e.target.value);
        if (lbl) lbl.textContent = `${state.settings.dailyGoalHours.toFixed(1)}h`;
      });
    }

    const themeSw = $("#themeSwitch");
    if (themeSw) {
      themeSw.addEventListener("click", () => {
        const next = state.settings.theme === "dark" ? "light" : "dark";
        state.settings.theme = next;
        applyTheme(next);
        applyAccentColor(state.subjects[0]?.color || "#ca3838");
        saveLocalState();
      });
    }

    const savePrefBtn = $("#btnSavePreferences");
    if (savePrefBtn) {
      savePrefBtn.addEventListener("click", () => {
        const name = $("#prefDisplayName").value.trim();
        const bio = $("#prefBio").value.trim();
        if (name) state.user.displayName = name;
        state.user.bio = bio;
        saveLocalState();
        renderUserProfile();
        renderClassoreLeaderboard();
        showModal("Preferences Saved", "Your settings and scholar profile have been updated.", [{ label: "OK", action: closeModal }]);
      });
    }

    const syncCloudBtn = $("#btnSyncCloud");
    if (syncCloudBtn) {
      syncCloudBtn.addEventListener("click", () => {
        saveLocalState();
        showModal("Synchronized", "Your stats and points are synced across devices.", [{ label: "OK", action: closeModal }]);
      });
    }

    const dropZone = $("#avatarDropZone");
    const fileInput = $("#avatarFileInput");

    if (dropZone && fileInput) {
      dropZone.addEventListener("dragover", e => {
        e.preventDefault();
        dropZone.classList.add("dragover");
      });
      dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
      dropZone.addEventListener("drop", e => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleAvatarFile(e.dataTransfer.files[0]);
        }
      });

      fileInput.addEventListener("change", e => {
        if (e.target.files && e.target.files[0]) {
          handleAvatarFile(e.target.files[0]);
        }
      });
    }
  }

  function handleAvatarFile(file) {
    if (!file.type.startsWith("image/")) {
      showModal("Invalid File", "Please upload an image file (PNG, JPG, WEBP).", [{ label: "OK", action: closeModal }]);
      return;
    }
    if (file.size > 2.5 * 1024 * 1024) {
      showModal("File Too Large", "Please choose an image under 2.5MB.", [{ label: "OK", action: closeModal }]);
      return;
    }

    const reader = new FileReader();
    reader.onload = evt => {
      state.user.avatar = evt.target.result;
      renderUserProfile();
      saveLocalState();
      renderClassoreLeaderboard();
    };
    reader.readAsDataURL(file);
  }

  function renderUserProfile() {
    const isVerified = isUserPremium(state.user);
    const sideName = $("#sideUserName");
    if (sideName) {
      sideName.innerHTML = `<span>${state.user.displayName}</span> ${getVerifiedBadgeHtml(isVerified)}`;
    }

    const prefName = $("#prefDisplayName");
    if (prefName) prefName.value = state.user.displayName;
    const prefBio = $("#prefBio");
    if (prefBio) prefBio.value = state.user.bio;

    renderAvatar($("#sideAvatarContainer"), state.user, "40px");
    renderAvatar($("#avatarPreviewBox"), state.user, "60px");
  }

  // -------------------------------------------------------------
  // 15. CUSTOM IN-APP MODAL
  // -------------------------------------------------------------
  const modalEl = $("#customModal");
  const modalTitle = $("#modalTitle");
  const modalDesc = $("#modalDesc");
  const modalButtons = $("#modalButtons");

  function showModal(title, descOrHtml, buttons = [], isHtml = false) {
    if (!modalEl) return;
    modalTitle.textContent = title;
    if (isHtml) {
      modalDesc.innerHTML = descOrHtml;
    } else {
      modalDesc.textContent = descOrHtml;
    }
    modalButtons.innerHTML = "";

    buttons.forEach(b => {
      const btn = document.createElement("button");
      btn.className = b.primary ? "btn" : "btn ghost";
      btn.textContent = b.label;
      btn.addEventListener("click", b.action);
      modalButtons.appendChild(btn);
    });

    modalEl.classList.add("active");
    lucide.createIcons();
  }

  function closeModal() {
    if (modalEl) modalEl.classList.remove("active");
  }

  // -------------------------------------------------------------
  // 16. TABS NAVIGATION & INDICATORS
  // -------------------------------------------------------------
  const navIndicator = $("#navIndicator");
  const tabs = $$(".tab");
  const panels = $$(".panel");

  function placeIndicator(ind, target, animate = true) {
    if (!ind || !target || !target.offsetWidth) return;
    if (!animate) ind.style.transition = "none";
    ind.style.width = target.offsetWidth + "px";
    ind.style.height = target.offsetHeight + "px";
    ind.style.transform = `translate(${target.offsetLeft}px, ${target.offsetTop}px)`;
    if (!animate) { void ind.offsetWidth; ind.style.transition = ""; }
    ind.classList.add("ready");
  }

  function switchTab(name) {
    tabs.forEach(t => {
      const on = t.dataset.tab === name;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    });
    panels.forEach(p => p.hidden = p.id !== `panel-${name}`);
    $("#pageTitle").textContent = name.charAt(0).toUpperCase() + name.slice(1);
    placeIndicator(navIndicator, $(`.tab[aria-selected="true"]`));

    if (name === "progress") renderProgressTab();
    if (name === "ranking") {
      renderClassoreLeaderboard();
      initClassoreLeagues();
    }
    if (name === "timer") placeIndicator($("#segIndicator"), $('#seg [aria-pressed="true"]'), false);
  }

  tabs.forEach(t => t.addEventListener("click", () => switchTab(t.dataset.tab)));

  document.addEventListener("pointerdown", e => {
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

  window.addEventListener("focus", () => { if (!timerRunning) setPresence("online"); });
  window.addEventListener("blur", () => { if (!timerRunning) setPresence("offline"); });

  // -------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------
  injectDynamicStyles();
  checkDayRoll();
  applyTheme(state.settings.theme);
  applyAccentColor(state.subjects[0]?.color || "#ca3838");
  initTimer();
  renderStreakWeek();
  renderTasks();
  initClassoreLeagues();
  initPreferences();
  initAuth();
  switchTab("timer");
  renderWave();

  const relayout = () => {
    placeIndicator(navIndicator, $(`.tab[aria-selected="true"]`), false);
    if (!$("#panel-timer").hidden) placeIndicator($("#segIndicator"), $('#seg [aria-pressed="true"]'), false);
  };
  window.addEventListener("resize", relayout);
  window.addEventListener("load", relayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);

  requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove("boot")));
})();