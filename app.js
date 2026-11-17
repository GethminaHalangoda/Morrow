/**
 * MORROW — Deep Focus Engine
 * Cloud-first Firestore hydration (prevents 0-point overwrites),
 * Universal field mapping (points, weeklyPoints, totalStudyTime),
 * Background timer, real-time sync, and Classore leaderboard.
 */

(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // -------------------------------------------------------------
  // 1. STATE & STORAGE
  // -------------------------------------------------------------
  const STORAGE_KEY = "MORROW_STATE_V7";

  const defaultState = {
    user: {
      uid: null,
      displayName: "Scholar",
      avatar: null,
      bio: "Focusing deeply.",
      presence: "online"
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
  let isCloudHydrated = false; // Prevents overwriting cloud data on fresh devices

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
  // 2. CALENDAR STREAK LOGIC
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
    $("#sideStreakNum").textContent = c;
    $("#topStreakText").textContent = `${c} day streak`;
    $("#streakHeadTitle").textContent = `${c} day streak`;

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
  // 3. BACKGROUND & LOCK-SCREEN ACCURATE TIMER
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

    $("#claimPointsActionBtn").addEventListener("click", commitSessionVerification);
    $("#topClaimPointsBtn").addEventListener("click", commitSessionVerification);

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
    $("#pendingSessionCard").classList.remove("visible");
    $("#topClaimPointsBtn").style.display = "none";
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
    $("#pendingSessionDetails").textContent = `${mins}m focused (+${pts} pts) • Claim within 5m`;
    $("#pendingSessionCard").classList.add("visible");
    $("#topClaimPointsBtn").style.display = "inline-flex";
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

    // Use atomic increment helper
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
    $("#themeSwitch").setAttribute("aria-checked", String(theme === "dark"));
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

  $("#newSubjectForm").addEventListener("submit", e => {
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

  $("#taskForm").addEventListener("submit", e => {
    e.preventDefault();
    const text = $("#taskInput").value.trim();
    const subjectId = $("#taskSubSelect").value;
    if (!text) return;

    sessionTasks.push({ id: Date.now(), text, subjectId, done: false });
    saveSessionTasks();
    $("#taskInput").value = "";
    renderTasks();
  });

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
  // 8. PROGRESS TAB & RESTORED COLUMN WELLS
  // -------------------------------------------------------------
  function renderProgressTab() {
    const todayHrs = state.stats.todaySeconds / 3600;
    const weekHrs = state.stats.weekSeconds / 3600;
    const goal = state.settings.dailyGoalHours;

    $("#statToday").textContent = `${Math.floor(todayHrs)}h ${Math.round((todayHrs % 1) * 60)}m`;
    $("#statWeek").textContent = `${Math.floor(weekHrs)}h ${Math.round((weekHrs % 1) * 60)}m`;
    $("#statTotalPts").textContent = `${state.stats.weeklyPoints} Pts`;
    $("#chartTotalBadge").textContent = `${weekHrs.toFixed(1)}h total`;

    $("#goalTextRatio").textContent = `${todayHrs.toFixed(1)}h of ${goal.toFixed(1)}h`;
    const pct = Math.min(100, Math.round((todayHrs / goal) * 100));
    $("#goalPercent").textContent = `${pct}%`;
    $("#goalMeterBar").style.width = `${pct}%`;

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
  // 9. CLASSORE LEADERBOARD (Universal Field Mapper)
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

  // Maps all potential Firestore schema variations (points, weeklyPoints, allTimePoints)
  function extractUserPoints(user, league) {
    if (league === "daily") {
      return user.dailyPoints ?? user.points ?? 0;
    } else if (league === "alltime") {
      return user.allTimePoints ?? user.points ?? user.weeklyPoints ?? 0;
    } else {
      // Weekly (default)
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
        displayName: state.user.displayName,
        avatar: state.user.avatar,
        bio: state.user.bio || "Local Scholar",
        points: state.stats.weeklyPoints,
        dailyPoints: state.stats.dailyPoints,
        weeklyPoints: state.stats.weeklyPoints,
        allTimePoints: state.stats.allTimePoints,
        streak: state.streak.count,
        weeklyHours: state.stats.weekSeconds / 3600
      });
    }

    if (currentSubjectFilter !== "all") {
      fullList = fullList.filter(u => u.activeSubject === currentSubjectFilter || true);
    }

    // Client-side sort prevents documents with different point key names from being dropped
    fullList.sort((a, b) => extractUserPoints(b, currentLeague) - extractUserPoints(a, currentLeague));

    let myRank = -1;
    let pointsBehind = 0;
    let personAboveName = "";

    fullList.forEach((user, idx) => {
      const rank = idx + 1;
      const isMe = user.uid === (state.user.uid || "local_me");
      const userPts = extractUserPoints(user, currentLeague);

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
            <div class="user-name-title">${user.displayName || "Scholar"} ${isMe ? "(You)" : ""}</div>
            <div class="user-sub-location">${user.bio || "Scholar"}</div>
          </div>
        </div>
        <div class="points-pill">• ${userPts} Pts</div>
      `;

      listEl.appendChild(row);
      renderAvatar($(`#classoreRowAv_${rank}`), user, "38px");
    });

    $("#classoreUserName").textContent = `${state.user.displayName} (You)`;
    $("#classoreUserBio").textContent = state.user.bio || "Local Scholar";
    renderAvatar($("#classoreUserAvatar"), state.user, "70px");

    $("#classoreTileRank").textContent = myRank > 0 ? `#${myRank}` : "--";
    $("#classoreTileStreak").textContent = state.streak.count;
    $("#classoreTilePoints").textContent = extractUserPoints(state.user, currentLeague) || state.stats.weeklyPoints;
    $("#classoreTileTime").textContent = `${(state.stats.weekSeconds / 3600).toFixed(1)}h`;

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
  // 10. CLOUD-FIRST FIRESTORE HYDRATION & SYNC (Users Collection)
  // -------------------------------------------------------------
  function setPresence(status) {
    state.user.presence = status;
    $("#sidePresence").className = `presence-dot ${status}`;
    if (window.updateCloudPresence) {
      window.updateCloudPresence(status);
    }
  }

  async function syncWithFirestore() {
    if (!window.firebase || !firebase.apps.length || !state.user.uid || !isCloudHydrated) return;
    try {
      const db = firebase.firestore();
      await db.collection("users").doc(state.user.uid).set({
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
        lastActive: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.warn("Firestore sync notice:", e);
    }
  }

  // STEP 1: Download from Cloud FIRST on new device before saving
  async function hydrateUserFromCloud(uid) {
    if (!window.firebase || !firebase.apps.length || !uid) return;
    const db = firebase.firestore();

    try {
      const docSnap = await db.collection("users").doc(uid).get();

      if (docSnap.exists) {
        const cloud = docSnap.data();

        // Harmonize field variations (points, weeklyPoints, totalStudyTime)
        const cloudWeeklyPts = cloud.weeklyPoints ?? cloud.points ?? 0;
        const cloudDailyPts = cloud.dailyPoints ?? cloud.points ?? 0;
        const cloudAllTimePts = cloud.allTimePoints ?? cloud.points ?? 0;
        const cloudTotalSecs = cloud.totalSeconds ?? ((cloud.totalStudyTime || 0) * 60) ?? 0;
        const cloudWeekSecs = Math.round((cloud.weeklyHours || 0) * 3600) || cloudTotalSecs;

        // Take higher values so unsaved offline focus isn't lost either
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

        console.log(`[MORROW] Hydrated user state from cloud: ${state.stats.weeklyPoints} pts, ${state.streak.count} day streak.`);
      }

      isCloudHydrated = true;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

      renderStreakWeek();
      renderProgressTab();
      renderClassoreLeaderboard();
      renderUserProfile();
      renderSubjectsBar();

      // Listen for future changes across devices
      initUserLiveListener(uid);
    } catch (err) {
      console.error("Cloud hydration error:", err);
      isCloudHydrated = true; // Fallback to avoid deadlocking writes
    }
  }

  // STEP 2: Live cross-device listener
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

        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        renderStreakWeek();
        renderProgressTab();
        renderClassoreLeaderboard();
        renderUserProfile();
      }
    });
  }

  // Live leaderboard listener for all users
  function initFirestoreRealtimeLeaderboard() {
    if (!window.firebase || !firebase.apps.length) {
      renderClassoreLeaderboard();
      return;
    }
    const db = firebase.firestore();

    // Query collection without composite order-by so documents with different point field names are never omitted
    db.collection("users").limit(50).onSnapshot(snap => {
      cachedLeaderboardUsers = [];
      snap.forEach(doc => {
        const data = doc.data();
        cachedLeaderboardUsers.push({
          uid: doc.id,
          displayName: data.displayName || "Scholar",
          avatar: data.avatar || null,
          bio: data.bio || "Scholar",
          points: data.points ?? data.weeklyPoints ?? 0,
          weeklyPoints: data.weeklyPoints ?? data.points ?? 0,
          dailyPoints: data.dailyPoints ?? data.points ?? 0,
          allTimePoints: data.allTimePoints ?? data.points ?? 0,
          weeklyHours: data.weeklyHours ?? ((data.totalStudyTime || 0) / 60) ?? 0,
          streak: data.streak || 0
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
        state.user.displayName = user.displayName || state.user.displayName;
        if (!state.user.avatar && user.photoURL) {
          state.user.avatar = user.photoURL;
        }

        $("#btnGoogleLogin").style.display = "none";
        $("#btnSignOut").style.display = "inline-flex";

        renderUserProfile();
        initFirestoreRealtimeLeaderboard();

        // Hydrate from cloud FIRST before executing any writes
        await hydrateUserFromCloud(user.uid);
      } else {
        state.user.uid = null;
        isCloudHydrated = false;
        $("#btnGoogleLogin").style.display = "inline-flex";
        $("#btnSignOut").style.display = "none";
      }
    });

    $("#btnGoogleLogin").addEventListener("click", triggerGoogleSignIn);
    $("#btnSignOut").addEventListener("click", async () => {
      if (window.signOutUser) {
        await window.signOutUser();
      } else {
        await firebase.auth().signOut();
      }
      location.reload();
    });
  }

  // -------------------------------------------------------------
  // 11. PREFERENCES & LOCAL AVATAR DRAG/DROP
  // -------------------------------------------------------------
  function initPreferences() {
    renderUserProfile();

    const slider = $("#dailyGoalSlider");
    slider.value = state.settings.dailyGoalHours;
    $("#dailyGoalLabel").textContent = `${state.settings.dailyGoalHours.toFixed(1)}h`;
    slider.addEventListener("input", e => {
      state.settings.dailyGoalHours = parseFloat(e.target.value);
      $("#dailyGoalLabel").textContent = `${state.settings.dailyGoalHours.toFixed(1)}h`;
    });

    $("#themeSwitch").addEventListener("click", () => {
      const next = state.settings.theme === "dark" ? "light" : "dark";
      state.settings.theme = next;
      applyTheme(next);
      applyAccentColor(state.subjects[0]?.color || "#ca3838");
      saveLocalState();
    });

    $("#btnSavePreferences").addEventListener("click", () => {
      const name = $("#prefDisplayName").value.trim();
      const bio = $("#prefBio").value.trim();
      if (name) state.user.displayName = name;
      state.user.bio = bio;
      saveLocalState();
      renderUserProfile();
      renderClassoreLeaderboard();
      showModal("Preferences Saved", "Your settings and scholar profile have been updated.", [{ label: "OK", action: closeModal }]);
    });

    $("#btnSyncCloud").addEventListener("click", () => {
      saveLocalState();
      showModal("Synchronized", "Your stats and points are synced across devices.", [{ label: "OK", action: closeModal }]);
    });

    const dropZone = $("#avatarDropZone");
    const fileInput = $("#avatarFileInput");

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
    $("#sideUserName").textContent = state.user.displayName;
    $("#prefDisplayName").value = state.user.displayName;
    $("#prefBio").value = state.user.bio;
    renderAvatar($("#sideAvatarContainer"), state.user, "40px");
    renderAvatar($("#avatarPreviewBox"), state.user, "60px");
  }

  // -------------------------------------------------------------
  // 12. CUSTOM MODAL
  // -------------------------------------------------------------
  const modalEl = $("#customModal");
  const modalTitle = $("#modalTitle");
  const modalDesc = $("#modalDesc");
  const modalButtons = $("#modalButtons");

  function showModal(title, desc, buttons = []) {
    modalTitle.textContent = title;
    modalDesc.textContent = desc;
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
    modalEl.classList.remove("active");
  }

  // -------------------------------------------------------------
  // 13. TABS NAVIGATION & INDICATORS
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
    if (name === "ranking") renderClassoreLeaderboard();
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