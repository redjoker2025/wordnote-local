/* =========================================================
   拾词 · 数据层
   - localStorage 持久化
   - 简化 SM-2 / 间隔重复
   - 每日日志、连续打卡
   - 备份、恢复、导入导出
   ========================================================= */
(function () {
  "use strict";

  const STORAGE_KEY = "shici.v1";
  const BACKUP_KEY = "shici.backup.v1";
  const VERSION = 1;
  const DAY_MS = 86400000;

  let state = null;
  let lastSaveError = null;

  /* ---------- 小工具 ---------- */

  function uid(prefix) {
    const p = prefix || "w";
    try {
      if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return p + "_" + window.crypto.randomUUID();
      }
    } catch (e) { /* ignore */ }
    return p + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function dayKey(date) {
    const d = date instanceof Date ? date : new Date(date == null ? Date.now() : date);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function endOfDay(value) {
    const d = value instanceof Date ? new Date(value.getTime()) : new Date(value == null ? Date.now() : value);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }

  function startOfDay(value) {
    const d = value instanceof Date ? new Date(value.getTime()) : new Date(value == null ? Date.now() : value);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function toNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toISOSafe(value, fallback) {
    if (!value) return fallback || null;
    const time = typeof value === "number" ? value : Date.parse(value);
    if (!Number.isFinite(time)) return fallback || null;
    return new Date(time).toISOString();
  }

  function normalizeTerm(value) {
    return String(value == null ? "" : value).trim().toLowerCase();
  }

  function addUnique(list, value) {
    if (!Array.isArray(list)) return;
    if (!list.includes(value)) list.push(value);
  }

  function parseTags(value) {
    if (Array.isArray(value)) {
      return Array.from(new Set(value.map(function (t) { return String(t).trim(); }).filter(Boolean)));
    }
    if (typeof value !== "string") return [];
    return Array.from(new Set(value.split(/[,，、;；/]+/).map(function (t) { return t.trim(); }).filter(Boolean)));
  }

  function formatDateTime(ts) {
    if (!ts) return "—";
    const d = new Date(ts);
    if (!Number.isFinite(d.getTime())) return "—";
    return (d.getMonth() + 1) + "月" + d.getDate() + "日 " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  /* ---------- 默认数据 ---------- */

  function defaultSettings() {
    return {
      dailyGoal: 20,
      newLimit: 10,
      reviewLimit: 100,
      autoSpeak: false,
      quizSync: true,
      theme: "auto",
      ttsVoice: "",
      ttsRate: 1
    };
  }

  function defaultSrs() {
    return {
      ease: 2.5,
      intervalDays: 0,
      dueAt: null,
      reps: 0,
      lapses: 0,
      lastRating: null
    };
  }

  function defaultStats() {
    return { seen: 0, correct: 0, wrong: 0 };
  }

  function defaultState() {
    return {
      version: VERSION,
      words: [],
      logs: {},
      settings: defaultSettings(),
      meta: {
        createdAt: nowISO(),
        updatedAt: nowISO(),
        lastExportAt: null,
        lastBackupAt: null,
        sampleLoaded: false
      }
    };
  }

  function normalizeSettings(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    const base = defaultSettings();
    const theme = ["auto", "light", "dark"].includes(src.theme) ? src.theme : base.theme;
    return {
      dailyGoal: clamp(Math.round(toNumber(src.dailyGoal, base.dailyGoal)), 1, 500),
      newLimit: clamp(Math.round(toNumber(src.newLimit, base.newLimit)), 0, 200),
      reviewLimit: clamp(Math.round(toNumber(src.reviewLimit, base.reviewLimit)), 1, 500),
      autoSpeak: Boolean(src.autoSpeak),
      quizSync: src.quizSync == null ? true : Boolean(src.quizSync),
      theme: theme,
      ttsVoice: typeof src.ttsVoice === "string" ? src.ttsVoice : "",
      ttsRate: clamp(toNumber(src.ttsRate, 1), 0.5, 1.5)
    };
  }

  function normalizeWord(raw) {
    if (!raw || typeof raw !== "object") return null;
    const term = String(raw.term != null ? raw.term : (raw.word != null ? raw.word : "")).trim();
    if (!term) return null;

    let meanings = [];
    if (Array.isArray(raw.meanings)) {
      meanings = raw.meanings.map(function (m) {
        if (typeof m === "string") return { pos: "", def: m.trim() };
        if (!m || typeof m !== "object") return null;
        return {
          pos: String(m.pos == null ? "" : m.pos).trim(),
          def: String(m.def != null ? m.def : (m.meaning != null ? m.meaning : "")).trim()
        };
      }).filter(Boolean);
    } else if (raw.meaning || raw.def || raw.definition) {
      meanings = [{
        pos: String(raw.pos == null ? "" : raw.pos).trim(),
        def: String(raw.meaning || raw.def || raw.definition || "").trim()
      }];
    }
    meanings = meanings.map(function (m) {
      return { pos: String(m.pos || "").trim(), def: String(m.def || "").trim() };
    }).filter(function (m) {
      return m.pos || m.def;
    });
    if (!meanings.length) meanings = [{ pos: "", def: "" }];

    let examples = [];
    if (Array.isArray(raw.examples)) {
      examples = raw.examples.map(function (ex) {
        if (typeof ex === "string") return { text: ex.trim(), translation: "" };
        if (!ex || typeof ex !== "object") return null;
        return {
          text: String(ex.text != null ? ex.text : (ex.en != null ? ex.en : "")).trim(),
          translation: String(ex.translation != null ? ex.translation : (ex.zh != null ? ex.zh : "")).trim()
        };
      }).filter(Boolean);
    } else if (raw.example) {
      examples = [{
        text: String(raw.example).trim(),
        translation: String(raw.exampleTranslation || "").trim()
      }];
    }
    examples = examples.filter(function (ex) { return ex.text || ex.translation; });

    const srsRaw = raw.srs && typeof raw.srs === "object" ? raw.srs : {};
    let dueAt = null;
    if (srsRaw.dueAt != null && srsRaw.dueAt !== "") {
      if (typeof srsRaw.dueAt === "number") {
        dueAt = Number.isFinite(srsRaw.dueAt) ? srsRaw.dueAt : null;
      } else {
        const parsed = Date.parse(srsRaw.dueAt);
        dueAt = Number.isFinite(parsed) ? parsed : null;
      }
    }

    const intervalDays = clamp(toNumber(srsRaw.intervalDays, 0), 0, 3650);
    const statsRaw = raw.stats && typeof raw.stats === "object" ? raw.stats : {};
    const firstStudiedAt = toISOSafe(raw.firstStudiedAt, null);
    const seen = Math.max(0, Math.round(toNumber(statsRaw.seen, firstStudiedAt ? 1 : 0)));

    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
      term: term,
      phonetic: String(raw.phonetic == null ? "" : raw.phonetic).trim(),
      meanings: meanings,
      examples: examples,
      tags: parseTags(raw.tags),
      note: String(raw.note == null ? "" : raw.note).trim(),
      starred: Boolean(raw.starred),
      srs: {
        ease: clamp(toNumber(srsRaw.ease, 2.5), 1.3, 3.2),
        intervalDays: intervalDays,
        dueAt: dueAt,
        reps: Math.max(0, Math.round(toNumber(srsRaw.reps, 0))),
        lapses: Math.max(0, Math.round(toNumber(srsRaw.lapses, 0))),
        lastRating: srsRaw.lastRating == null ? null : clamp(Math.round(toNumber(srsRaw.lastRating, 2)), 0, 3)
      },
      stats: {
        seen: seen,
        correct: Math.max(0, Math.round(toNumber(statsRaw.correct, 0))),
        wrong: Math.max(0, Math.round(toNumber(statsRaw.wrong, 0)))
      },
      firstStudiedAt: firstStudiedAt,
      lastStudiedAt: toISOSafe(raw.lastStudiedAt, null),
      createdAt: toISOSafe(raw.createdAt, nowISO()),
      updatedAt: toISOSafe(raw.updatedAt, nowISO())
    };
  }

  function normalizeLog(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    return {
      newIds: Array.isArray(src.newIds) ? Array.from(new Set(src.newIds.filter(function (x) { return typeof x === "string"; }))) : [],
      reviewIds: Array.isArray(src.reviewIds) ? Array.from(new Set(src.reviewIds.filter(function (x) { return typeof x === "string"; }))) : [],
      answers: Math.max(0, Math.round(toNumber(src.answers, 0))),
      correct: Math.max(0, Math.round(toNumber(src.correct, 0))),
      wrong: Math.max(0, Math.round(toNumber(src.wrong, 0))),
      ratings: Math.max(0, Math.round(toNumber(src.ratings, 0)))
    };
  }

  function normalizeState(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.words)) {
      return base;
    }
    const seenIds = new Set();
    const words = [];
    raw.words.forEach(function (item) {
      const word = normalizeWord(item);
      if (!word) return;
      if (seenIds.has(word.id)) word.id = uid();
      seenIds.add(word.id);
      words.push(word);
    });

    const logs = {};
    if (raw.logs && typeof raw.logs === "object") {
      Object.keys(raw.logs).forEach(function (key) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
          logs[key] = normalizeLog(raw.logs[key]);
        }
      });
    }

    const metaRaw = raw.meta && typeof raw.meta === "object" ? raw.meta : {};
    return {
      version: VERSION,
      words: words,
      logs: logs,
      settings: normalizeSettings(raw.settings),
      meta: {
        createdAt: toISOSafe(metaRaw.createdAt, base.meta.createdAt),
        updatedAt: toISOSafe(metaRaw.updatedAt, base.meta.updatedAt),
        lastExportAt: toISOSafe(metaRaw.lastExportAt, null),
        lastBackupAt: toISOSafe(metaRaw.lastBackupAt, null),
        sampleLoaded: Boolean(metaRaw.sampleLoaded)
      }
    };
  }

  /* ---------- 持久化 ---------- */

  function emitError(error) {
    try {
      window.dispatchEvent(new CustomEvent("shici:storage-error", { detail: error }));
    } catch (e) { /* ignore */ }
  }

  function load() {
    let raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        state = defaultState();
        save();
        return state;
      }
      state = normalizeState(JSON.parse(raw));
      return state;
    } catch (error) {
      if (raw) {
        try {
          window.localStorage.setItem("shici.corrupt." + Date.now(), raw);
        } catch (e) { /* ignore */ }
      }
      state = defaultState();
      lastSaveError = error;
      save();
      emitError(error);
      return state;
    }
  }

  function save() {
    if (!state) return false;
    state.meta.updatedAt = nowISO();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      lastSaveError = null;
      return true;
    } catch (error) {
      lastSaveError = error;
      emitError(error);
      return false;
    }
  }

  function getState() {
    return state;
  }

  function getSettings() {
    return state.settings;
  }

  function updateSettings(patch) {
    state.settings = normalizeSettings(Object.assign({}, state.settings, patch || {}));
    save();
    return state.settings;
  }

  function getWord(id) {
    return state.words.find(function (word) { return word.id === id; }) || null;
  }

  /* ---------- 状态 ---------- */

  function isNew(word) {
    return Boolean(word) && !word.firstStudiedAt && word.srs.reps === 0 && word.stats.seen === 0;
  }

  function getStatus(word) {
    if (isNew(word)) return "new";
    if (word.srs.intervalDays >= 21) return "mastered";
    return "learning";
  }

  function isDue(word, now) {
    if (!word || isNew(word)) return false;
    return Boolean(word.srs.dueAt) && word.srs.dueAt <= endOfDay(now == null ? Date.now() : now);
  }

  /* ---------- 统计辅助 ---------- */

  function getLog(day) {
    const key = day || dayKey();
    return state.logs[key] ? normalizeLog(state.logs[key]) : normalizeLog(null);
  }

  function ensureLog(day) {
    const key = day || dayKey();
    if (!state.logs[key] || typeof state.logs[key] !== "object") {
      state.logs[key] = normalizeLog(null);
    }
    return state.logs[key];
  }

  function recordLogEvent(word, wasNew, correct, isRating) {
    const log = ensureLog();
    addUnique(log.reviewIds, word.id);
    if (wasNew) addUnique(log.newIds, word.id);
    log.answers += 1;
    if (correct) log.correct += 1;
    else log.wrong += 1;
    if (isRating) log.ratings += 1;
  }

  function getTodayStats() {
    const log = state.logs[dayKey()];
    const normalized = normalizeLog(log);
    return {
      newCount: normalized.newIds.length,
      reviewedCount: normalized.reviewIds.length,
      answers: normalized.answers,
      correct: normalized.correct,
      wrong: normalized.wrong,
      ratings: normalized.ratings,
      learnedCount: normalized.reviewIds.length
    };
  }

  function getDueWords(now) {
    return state.words.filter(function (word) { return isDue(word, now); }).sort(function (a, b) {
      return (a.srs.dueAt || 0) - (b.srs.dueAt || 0);
    });
  }

  function getNewWords() {
    return state.words.filter(isNew).sort(function (a, b) {
      return Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.term.localeCompare(b.term);
    });
  }

  function getNewIntroducedToday() {
    const log = state.logs[dayKey()];
    return log && Array.isArray(log.newIds) ? log.newIds.length : 0;
  }

  function getNewRemaining() {
    return Math.max(0, state.settings.newLimit - getNewIntroducedToday());
  }

  function getDueCount(now) {
    return getDueWords(now).length;
  }

  function getStreak() {
    let cursor = new Date();
    cursor.setHours(12, 0, 0, 0);
    let key = dayKey(cursor);
    const todayLog = state.logs[key];
    if (!todayLog || !Array.isArray(todayLog.reviewIds) || !todayLog.reviewIds.length) {
      cursor.setDate(cursor.getDate() - 1);
    }
    let streak = 0;
    for (let i = 0; i < 3660; i += 1) {
      key = dayKey(cursor);
      const log = state.logs[key];
      if (log && Array.isArray(log.reviewIds) && log.reviewIds.length > 0) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  function getLastNDays(n) {
    const days = [];
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const weekNames = ["日", "一", "二", "三", "四", "五", "六"];
    for (let i = n - 1; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = dayKey(d);
      const log = state.logs[key];
      const count = log && Array.isArray(log.reviewIds) ? log.reviewIds.length : 0;
      days.push({
        key: key,
        date: d,
        label: i === 0 ? "今天" : "周" + weekNames[d.getDay()],
        short: (d.getMonth() + 1) + "/" + d.getDate(),
        count: count,
        isToday: i === 0
      });
    }
    return days;
  }

  function getAccuracy(days) {
    const n = days || 30;
    const keys = getLastNDays(n).map(function (d) { return d.key; });
    let answers = 0;
    let correct = 0;
    keys.forEach(function (key) {
      const log = state.logs[key];
      if (!log) return;
      answers += toNumber(log.answers, 0);
      correct += toNumber(log.correct, 0);
    });
    return answers ? Math.round((correct / answers) * 100) : null;
  }

  function getAllTags() {
    const map = new Map();
    state.words.forEach(function (word) {
      word.tags.forEach(function (tag) {
        map.set(tag, (map.get(tag) || 0) + 1);
      });
    });
    return Array.from(map.entries()).map(function (entry) {
      return { tag: entry[0], count: entry[1] };
    }).sort(function (a, b) {
      return b.count - a.count || a.tag.localeCompare(b.tag, "zh-CN");
    });
  }

  function getCounts() {
    const counts = {
      all: state.words.length,
      due: 0,
      new: 0,
      learning: 0,
      mastered: 0,
      starred: 0,
      wrong: 0
    };
    state.words.forEach(function (word) {
      const status = getStatus(word);
      if (status === "new") counts.new += 1;
      else if (status === "mastered") counts.mastered += 1;
      else counts.learning += 1;
      if (isDue(word)) counts.due += 1;
      if (word.starred) counts.starred += 1;
      if (word.stats.wrong > 0) counts.wrong += 1;
    });
    return counts;
  }

  function getMastery() {
    const total = state.words.length;
    let mastered = 0;
    let learning = 0;
    let fresh = 0;
    state.words.forEach(function (word) {
      const status = getStatus(word);
      if (status === "mastered") mastered += 1;
      else if (status === "learning") learning += 1;
      else fresh += 1;
    });
    return { total: total, mastered: mastered, learning: learning, new: fresh };
  }

  function getWrongWords(limit) {
    return state.words.filter(function (word) { return word.stats.wrong > 0; }).sort(function (a, b) {
      return b.stats.wrong - a.stats.wrong || b.stats.lapses - a.stats.lapses;
    }).slice(0, limit || 8);
  }

  function getRecentWords(limit) {
    return state.words.slice().sort(function (a, b) {
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    }).slice(0, limit || 5);
  }

  /* ---------- 间隔重复 ---------- */

  function previewIntervalDays(word, rating) {
    const srs = word && word.srs ? word.srs : defaultSrs();
    const interval = toNumber(srs.intervalDays, 0);
    const reps = toNumber(srs.reps, 0);
    const ease = toNumber(srs.ease, 2.5);

    if (rating === 0) return 10 / 1440;
    if (rating === 1) {
      if (reps === 0) return 0.5;
      return Math.max(0.5, interval * 1.2);
    }
    if (rating === 2) {
      if (reps === 0) return 1;
      return Math.max(1, Math.round(interval * ease * 10) / 10);
    }
    if (rating === 3) {
      if (reps === 0) return 3;
      return Math.max(2, Math.round(interval * ease * 1.3 * 10) / 10);
    }
    return 1;
  }

  function applySrs(word, rating) {
    const now = Date.now();
    const srs = word.srs;
    const interval = toNumber(srs.intervalDays, 0);
    const reps = Math.round(toNumber(srs.reps, 0));
    let ease = toNumber(srs.ease, 2.5);
    let nextInterval;
    let nextReps = reps;

    if (rating === 0) {
      ease = clamp(ease - 0.2, 1.3, 3.2);
      nextInterval = 10 / 1440;
      nextReps = 0;
      srs.lapses = Math.max(0, Math.round(toNumber(srs.lapses, 0))) + 1;
    } else if (rating === 1) {
      ease = clamp(ease - 0.15, 1.3, 3.2);
      nextInterval = reps === 0 ? 0.5 : Math.max(0.5, interval * 1.2);
      nextReps = reps + 1;
    } else if (rating === 2) {
      nextInterval = reps === 0 ? 1 : Math.max(1, interval * ease);
      nextReps = reps + 1;
    } else {
      ease = clamp(ease + 0.1, 1.3, 3.2);
      nextInterval = reps === 0 ? 3 : Math.max(2, interval * ease * 1.3);
      nextReps = reps + 1;
    }

    nextInterval = clamp(Math.round(nextInterval * 1000) / 1000, 10 / 1440, 3650);
    srs.ease = Math.round(ease * 100) / 100;
    srs.intervalDays = nextInterval;
    srs.dueAt = now + nextInterval * DAY_MS;
    srs.reps = nextReps;
    srs.lastRating = rating;
    return srs;
  }

  function recordStudiedWord(word, rating, source) {
    const wasNew = isNew(word);
    const now = nowISO();
    applySrs(word, rating);
    word.firstStudiedAt = word.firstStudiedAt || now;
    word.lastStudiedAt = now;
    word.updatedAt = now;
    word.stats.seen = Math.max(0, Math.round(toNumber(word.stats.seen, 0))) + 1;
    if (rating > 0) word.stats.correct += 1;
    else word.stats.wrong += 1;
    recordLogEvent(word, wasNew, rating > 0, source === "study");
    save();
    return wasNew;
  }

  function rateWord(id, rating) {
    const word = getWord(id);
    if (!word) return null;
    const normalizedRating = clamp(Math.round(toNumber(rating, 2)), 0, 3);
    const wasNew = recordStudiedWord(word, normalizedRating, "study");
    return { word: word, wasNew: wasNew, status: getStatus(word) };
  }

  function quizAnswer(id, correct, syncSrs) {
    const word = getWord(id);
    if (!word) return null;
    if (syncSrs === false) {
      recordLogEvent(word, false, Boolean(correct), false);
      save();
      return { word: word, synced: false };
    }
    const wasNew = recordStudiedWord(word, correct ? 2 : 0, "quiz");
    return { word: word, wasNew: wasNew, synced: true };
  }

  function markMastered(id) {
    const word = getWord(id);
    if (!word) return null;
    const now = Date.now();
    const iso = new Date(now).toISOString();
    word.srs.ease = Math.max(word.srs.ease, 2.5);
    word.srs.intervalDays = 30;
    word.srs.dueAt = now + 30 * DAY_MS;
    word.srs.reps = Math.max(word.srs.reps, 3);
    word.srs.lastRating = 3;
    word.firstStudiedAt = word.firstStudiedAt || iso;
    word.lastStudiedAt = iso;
    word.updatedAt = iso;
    word.stats.seen = Math.max(word.stats.seen, 1);
    save();
    return word;
  }

  function resetProgress(id) {
    const word = getWord(id);
    if (!word) return null;
    word.srs = defaultSrs();
    word.stats = defaultStats();
    word.firstStudiedAt = null;
    word.lastStudiedAt = null;
    word.updatedAt = nowISO();
    save();
    return word;
  }

  /* ---------- 单词增删改 ---------- */

  function findDuplicate(term, excludeId) {
    const normalized = normalizeTerm(term);
    return state.words.find(function (word) {
      return word.id !== excludeId && normalizeTerm(word.term) === normalized;
    }) || null;
  }

  function addWord(payload) {
    const word = normalizeWord(Object.assign({}, payload, {
      id: uid(),
      createdAt: nowISO(),
      updatedAt: nowISO()
    }));
    if (!word) return null;
    state.words.push(word);
    save();
    return word;
  }

  function updateWord(id, payload) {
    const current = getWord(id);
    if (!current) return null;
    const next = normalizeWord(Object.assign({}, current, payload, {
      id: current.id,
      srs: current.srs,
      stats: current.stats,
      firstStudiedAt: current.firstStudiedAt,
      lastStudiedAt: current.lastStudiedAt,
      createdAt: current.createdAt,
      updatedAt: nowISO()
    }));
    if (!next) return null;
    const index = state.words.findIndex(function (word) { return word.id === id; });
    state.words[index] = next;
    save();
    return next;
  }

  function toggleStar(id) {
    const word = getWord(id);
    if (!word) return null;
    word.starred = !word.starred;
    word.updatedAt = nowISO();
    save();
    return word;
  }

  function deleteWord(id) {
    const index = state.words.findIndex(function (word) { return word.id === id; });
    if (index === -1) return false;
    state.words.splice(index, 1);
    save();
    return true;
  }

  function deleteWords(ids) {
    const set = new Set(ids || []);
    const before = state.words.length;
    state.words = state.words.filter(function (word) { return !set.has(word.id); });
    if (state.words.length !== before) save();
    return before - state.words.length;
  }

  function bulkAddTag(ids, tag) {
    const clean = String(tag == null ? "" : tag).trim();
    if (!clean) return 0;
    const set = new Set(ids || []);
    let changed = 0;
    state.words.forEach(function (word) {
      if (!set.has(word.id)) return;
      if (!word.tags.includes(clean)) {
        word.tags.push(clean);
        word.updatedAt = nowISO();
        changed += 1;
      }
    });
    if (changed) save();
    return changed;
  }

  function bulkMarkMastered(ids) {
    let changed = 0;
    (ids || []).forEach(function (id) {
      const word = getWord(id);
      if (!word) return;
      const now = Date.now();
      word.srs.intervalDays = 30;
      word.srs.dueAt = now + 30 * DAY_MS;
      word.srs.reps = Math.max(word.srs.reps, 3);
      word.srs.ease = Math.max(word.srs.ease, 2.5);
      word.firstStudiedAt = word.firstStudiedAt || new Date(now).toISOString();
      word.lastStudiedAt = new Date(now).toISOString();
      word.stats.seen = Math.max(word.stats.seen, 1);
      word.updatedAt = new Date(now).toISOString();
      changed += 1;
    });
    if (changed) save();
    return changed;
  }

  function bulkReset(ids) {
    const set = new Set(ids || []);
    let changed = 0;
    state.words.forEach(function (word) {
      if (!set.has(word.id)) return;
      word.srs = defaultSrs();
      word.stats = defaultStats();
      word.firstStudiedAt = null;
      word.lastStudiedAt = null;
      word.updatedAt = nowISO();
      changed += 1;
    });
    if (changed) save();
    return changed;
  }

  /* ---------- 导入 / 示例 ---------- */

  function mergeWords(entries) {
    const existingTerms = new Set(state.words.map(function (word) { return normalizeTerm(word.term); }));
    const existingIds = new Set(state.words.map(function (word) { return word.id; }));
    let added = 0;
    let skipped = 0;
    (entries || []).forEach(function (entry) {
      const word = normalizeWord(entry);
      if (!word) {
        skipped += 1;
        return;
      }
      const key = normalizeTerm(word.term);
      if (!key || existingTerms.has(key)) {
        skipped += 1;
        return;
      }
      if (existingIds.has(word.id)) word.id = uid();
      existingTerms.add(key);
      existingIds.add(word.id);
      state.words.push(word);
      added += 1;
    });
    if (added) save();
    return { added: added, skipped: skipped };
  }

  function replaceState(raw) {
    writeBackup("覆盖导入前");
    state = normalizeState(raw);
    save();
    return state;
  }

  function clearAll() {
    writeBackup("清空前");
    state.words = [];
    state.logs = {};
    state.meta.sampleLoaded = false;
    save();
    return true;
  }

  function getSampleWords() {
    return [
      {
        term: "ephemeral",
        phonetic: "/ɪˈfemərəl/",
        meanings: [{ pos: "adj.", def: "短暂的；转瞬即逝的" }],
        examples: [{ text: "Fame in the digital age can be ephemeral.", translation: "数字时代的名气可能转瞬即逝。" }],
        tags: ["雅思", "文学"]
      },
      {
        term: "serendipity",
        phonetic: "/ˌserənˈdɪpəti/",
        meanings: [{ pos: "n.", def: "意外发现美好事物的运气；机缘巧合" }],
        examples: [{ text: "Meeting her was pure serendipity.", translation: "遇见她纯属美妙的机缘。" }],
        tags: ["高阶", "生活"]
      },
      {
        term: "resilient",
        phonetic: "/rɪˈzɪliənt/",
        meanings: [{ pos: "adj.", def: "有韧性的；能迅速恢复的" }],
        examples: [{ text: "Children are often more resilient than we think.", translation: "孩子往往比我们想象的更有韧性。" }],
        tags: ["四六级", "高频"]
      },
      {
        term: "meticulous",
        phonetic: "/məˈtɪkjələs/",
        meanings: [{ pos: "adj.", def: "一丝不苟的；极其仔细的" }],
        examples: [{ text: "She kept meticulous notes of every experiment.", translation: "她一丝不苟地记录每次实验。" }],
        tags: ["雅思", "高频"]
      },
      {
        term: "wanderlust",
        phonetic: "/ˈwɒndəlʌst/",
        meanings: [{ pos: "n.", def: "对旅行的强烈渴望；漫游癖" }],
        examples: [{ text: "A year at home only deepened his wanderlust.", translation: "在家待了一年反而加深了他对旅行的渴望。" }],
        tags: ["文学", "生活"]
      },
      {
        term: "procrastinate",
        phonetic: "/prəˈkræstɪneɪt/",
        meanings: [{ pos: "v.", def: "拖延；耽搁" }],
        examples: [{ text: "Stop procrastinating and start with one small step.", translation: "别再拖延，从一小步开始。" }],
        tags: ["四六级", "生活"]
      },
      {
        term: "eloquent",
        phonetic: "/ˈeləkwənt/",
        meanings: [{ pos: "adj.", def: "雄辩的；有说服力的" }],
        examples: [{ text: "Her speech was simple but eloquent.", translation: "她的演讲朴实却很有说服力。" }],
        tags: ["雅思", "表达"]
      },
      {
        term: "ambiguous",
        phonetic: "/æmˈbɪɡjuəs/",
        meanings: [{ pos: "adj.", def: "模棱两可的；含糊不清的" }],
        examples: [{ text: "The instructions were deliberately ambiguous.", translation: "那些指示故意写得含糊不清。" }],
        tags: ["四六级", "高频"]
      },
      {
        term: "alleviate",
        phonetic: "/əˈliːvieɪt/",
        meanings: [{ pos: "v.", def: "减轻；缓解" }],
        examples: [{ text: "The medicine helped alleviate the pain.", translation: "这药有助于缓解疼痛。" }],
        tags: ["托福", "高频"]
      },
      {
        term: "inevitable",
        phonetic: "/ɪnˈevɪtəbl/",
        meanings: [{ pos: "adj.", def: "不可避免的；必然发生的" }],
        examples: [{ text: "Change is inevitable; growth is optional.", translation: "变化不可避免，成长却是选择。" }],
        tags: ["四六级", "高频"]
      },
      {
        term: "cherish",
        phonetic: "/ˈtʃerɪʃ/",
        meanings: [{ pos: "v.", def: "珍视；珍惜" }],
        examples: [{ text: "I cherish the quiet mornings we spent together.", translation: "我珍惜我们一起度过的安静清晨。" }],
        tags: ["生活", "表达"]
      },
      {
        term: "subtle",
        phonetic: "/ˈsʌtl/",
        meanings: [{ pos: "adj.", def: "微妙的；不易察觉的" }],
        examples: [{ text: "There is a subtle difference between the two colors.", translation: "这两种颜色之间有细微的差别。" }],
        tags: ["雅思", "高频"]
      },
      {
        term: "curious",
        phonetic: "/ˈkjʊəriəs/",
        meanings: [{ pos: "adj.", def: "好奇的；求知欲强的" }],
        examples: [{ text: "Stay curious and keep asking questions.", translation: "保持好奇，继续提问。" }],
        tags: ["日常", "基础"]
      },
      {
        term: "luminous",
        phonetic: "/ˈluːmɪnəs/",
        meanings: [{ pos: "adj.", def: "发光的；明亮的" }],
        examples: [{ text: "The moon looked soft and luminous.", translation: "月亮看起来柔和而明亮。" }],
        tags: ["文学", "托福"]
      },
      {
        term: "mitigate",
        phonetic: "/ˈmɪtɪɡeɪt/",
        meanings: [{ pos: "v.", def: "减轻；缓和（风险、影响）" }],
        examples: [{ text: "Planting trees can help mitigate the effects of heat.", translation: "植树有助于缓解高温的影响。" }],
        tags: ["托福", "写作"]
      },
      {
        term: "ubiquitous",
        phonetic: "/juːˈbɪkwɪtəs/",
        meanings: [{ pos: "adj.", def: "无处不在的；普遍存在的" }],
        examples: [{ text: "Smartphones are now ubiquitous in daily life.", translation: "智能手机如今在日常生活中无处不在。" }],
        tags: ["雅思", "高频"]
      }
    ];
  }

  function loadSample() {
    const result = mergeWords(getSampleWords().map(function (word) {
      return Object.assign({}, word, { createdAt: nowISO(), updatedAt: nowISO() });
    }));
    if (result.added) {
      state.meta.sampleLoaded = true;
      save();
    }
    return result;
  }

  /* ---------- 备份 ---------- */

  function readBackup() {
    try {
      const raw = window.localStorage.getItem(BACKUP_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.data || !Array.isArray(parsed.data.words)) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function writeBackup(reason) {
    if (!state || !state.words.length) return false;
    try {
      window.localStorage.setItem(BACKUP_KEY, JSON.stringify({
        at: nowISO(),
        reason: reason || "自动备份",
        data: clone(state)
      }));
      state.meta.lastBackupAt = nowISO();
      return true;
    } catch (e) {
      return false;
    }
  }

  function ensureDailyBackup() {
    if (!state || !state.words.length) return false;
    const backup = readBackup();
    if (backup && backup.at && dayKey(backup.at) === dayKey()) return false;
    return writeBackup("每日自动备份");
  }

  function getBackupInfo() {
    const backup = readBackup();
    if (!backup) return null;
    return {
      at: backup.at,
      reason: backup.reason || "自动备份",
      words: backup.data.words.length,
      formatted: formatDateTime(backup.at)
    };
  }

  function restoreBackup() {
    const backup = readBackup();
    if (!backup) return null;
    writeBackup("恢复前");
    state = normalizeState(backup.data);
    save();
    return { words: state.words.length, at: backup.at };
  }

  /* ---------- 导出 ---------- */

  function getExportPayload() {
    return Object.assign({
      app: "拾词",
      appVersion: VERSION,
      exportedAt: nowISO()
    }, clone(state));
  }

  function touchExport() {
    state.meta.lastExportAt = nowISO();
    save();
  }

  function csvEscape(value) {
    const text = value == null ? "" : String(value);
    if (/[",\r\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function formatDateTimeForCSV(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    if (!Number.isFinite(d.getTime())) return "";
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function getCSV() {
    const statusLabels = { new: "新词", learning: "学习中", mastered: "已掌握" };
    const rows = [["单词", "音标", "词性", "释义", "例句", "例句翻译", "标签", "备注", "状态", "下次复习"]];
    state.words.forEach(function (word) {
      const pos = Array.from(new Set(word.meanings.map(function (m) { return m.pos; }).filter(Boolean))).join(" / ");
      const defs = word.meanings.map(function (m) { return m.def; }).filter(Boolean).join("；");
      rows.push([
        word.term,
        word.phonetic,
        pos,
        defs,
        word.examples.map(function (ex) { return ex.text; }).filter(Boolean).join(" | "),
        word.examples.map(function (ex) { return ex.translation; }).filter(Boolean).join(" | "),
        word.tags.join(", "),
        word.note,
        statusLabels[getStatus(word)] || "",
        formatDateTimeForCSV(word.srs.dueAt)
      ]);
    });
    return "\uFEFF" + rows.map(function (row) {
      return row.map(csvEscape).join(",");
    }).join("\r\n");
  }

  /* ---------- 存储信息 ---------- */

  function getStorageInfo() {
    let stateBytes = 0;
    let backupBytes = 0;
    let totalBytes = 0;
    try {
      stateBytes = new Blob([JSON.stringify(state)]).size;
      const backupRaw = window.localStorage.getItem(BACKUP_KEY);
      if (backupRaw) backupBytes = new Blob([backupRaw]).size;
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (!key) continue;
        const value = window.localStorage.getItem(key) || "";
        totalBytes += (key.length + value.length) * 2;
      }
    } catch (e) { /* ignore */ }
    return { stateBytes: stateBytes, backupBytes: backupBytes, totalBytes: totalBytes };
  }

  /* ---------- 对外接口 ---------- */

  window.Store = {
    STORAGE_KEY: STORAGE_KEY,
    BACKUP_KEY: BACKUP_KEY,
    load: load,
    save: save,
    getState: getState,
    getSettings: getSettings,
    updateSettings: updateSettings,
    getWord: getWord,

    isNew: isNew,
    isDue: isDue,
    getStatus: getStatus,
    getDueWords: getDueWords,
    getNewWords: getNewWords,
    getNewRemaining: getNewRemaining,
    getNewIntroducedToday: getNewIntroducedToday,
    getDueCount: getDueCount,

    getTodayStats: getTodayStats,
    getLog: getLog,
    getStreak: getStreak,
    getLastNDays: getLastNDays,
    getAccuracy: getAccuracy,
    getAllTags: getAllTags,
    getCounts: getCounts,
    getMastery: getMastery,
    getWrongWords: getWrongWords,
    getRecentWords: getRecentWords,

    previewIntervalDays: previewIntervalDays,
    rateWord: rateWord,
    quizAnswer: quizAnswer,
    markMastered: markMastered,
    resetProgress: resetProgress,

    findDuplicate: findDuplicate,
    addWord: addWord,
    updateWord: updateWord,
    toggleStar: toggleStar,
    deleteWord: deleteWord,
    deleteWords: deleteWords,
    bulkAddTag: bulkAddTag,
    bulkMarkMastered: bulkMarkMastered,
    bulkReset: bulkReset,

    mergeWords: mergeWords,
    replaceState: replaceState,
    clearAll: clearAll,
    getSampleWords: getSampleWords,
    loadSample: loadSample,

    ensureDailyBackup: ensureDailyBackup,
    getBackupInfo: getBackupInfo,
    restoreBackup: restoreBackup,
    writeBackup: writeBackup,

    getExportPayload: getExportPayload,
    getCSV: getCSV,
    touchExport: touchExport,
    getStorageInfo: getStorageInfo,

    dayKey: dayKey,
    endOfDay: endOfDay,
    formatDateTime: formatDateTime,
    normalizeTerm: normalizeTerm,
    normalizeWord: normalizeWord
  };
})();
