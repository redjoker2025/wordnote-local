/* =========================================================
   拾词 · 界面公共层
   ========================================================= */
window.WA = window.WA || {};

(function (WA) {
  "use strict";

  /* ---------- 基础工具 ---------- */

  WA.$ = function (selector, root) {
    return (root || document).querySelector(selector);
  };

  WA.$$ = function (selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  };

  const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

  WA.e = function (value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return ESC_MAP[ch];
    });
  };

  WA.icon = function (name, className) {
    return '<svg class="icon ' + (className || "") + '" aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
  };

  WA.clamp = function (value, min, max) {
    return Math.min(max, Math.max(min, value));
  };

  WA.shuffle = function (list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  };

  WA.isTyping = function (target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
  };

  /* ---------- 时间与文本 ---------- */

  WA.formatDue = function (word) {
    if (!word) return "—";
    if (Store.isNew(word)) return "未学习";
    if (!word.srs.dueAt) return "—";
    const now = Date.now();
    const due = word.srs.dueAt;
    if (due <= now) return "现在复习";
    const todayKey = Store.dayKey();
    const dueKey = Store.dayKey(due);
    if (dueKey === todayKey) return "今天";
    const tomorrow = new Date();
    tomorrow.setHours(12, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (dueKey === Store.dayKey(tomorrow)) return "明天";
    const diff = Math.ceil((due - now) / 86400000);
    if (diff < 7) return diff + " 天后";
    const d = new Date(due);
    return (d.getMonth() + 1) + "月" + d.getDate() + "日";
  };

  WA.formatInterval = function (days) {
    if (days == null || !Number.isFinite(days)) return "—";
    if (days <= 0.0001) return "现在";
    const minutes = days * 1440;
    if (minutes < 60) return Math.max(1, Math.round(minutes)) + " 分钟";
    const hours = days * 24;
    if (hours < 24) return Math.max(1, Math.round(hours)) + " 小时";
    if (days < 30) return Math.max(1, Math.round(days)) + " 天";
    if (days < 365) {
      const months = Math.round((days / 30) * 10) / 10;
      return months + " 个月";
    }
    const years = Math.round((days / 365) * 10) / 10;
    return years + " 年";
  };

  WA.formatBytes = function (bytes) {
    if (!bytes) return "0 B";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  WA.formatDuration = function (ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    if (total < 60) return total + " 秒";
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    if (minutes < 60) return minutes + " 分 " + (seconds ? seconds + " 秒" : "");
    const hours = Math.floor(minutes / 60);
    return hours + " 小时 " + (minutes % 60) + " 分";
  };

  WA.normalizeAnswer = function (value) {
    let text = String(value == null ? "" : value).trim().toLowerCase();
    try {
      text = text.normalize("NFKC");
    } catch (e) { /* ignore */ }
    return text.replace(/[\s'’\-–—.,!?;:()[\]{}"“”‘’]+/g, "");
  };

  WA.hasMeaning = function (word) {
    return Boolean(word) && word.meanings.some(function (m) { return m.def && m.def.trim(); });
  };

  WA.primaryMeaning = function (word) {
    if (!word) return "";
    const found = word.meanings.find(function (m) { return m.def && m.def.trim(); });
    if (!found) return "";
    return (found.pos ? found.pos + " " : "") + found.def;
  };

  WA.fullMeaning = function (word) {
    if (!word) return "";
    return word.meanings
      .filter(function (m) { return m.def && m.def.trim(); })
      .slice(0, 2)
      .map(function (m) { return (m.pos ? m.pos + " " : "") + m.def; })
      .join("；");
  };

  WA.meaningHTML = function (word) {
    const items = word.meanings.filter(function (m) { return m.def || m.pos; });
    if (!items.length) return '<span class="word-pos">暂无释义</span>';
    return items.map(function (m) {
      return '<span class="word-pos">' + WA.e(m.pos) + "</span>" + WA.e(m.def);
    }).join("；");
  };

  WA.promptMeaningHTML = function (word) {
    const items = word.meanings.filter(function (m) { return m.def; }).slice(0, 2);
    if (!items.length) return "暂无释义";
    return items.map(function (m) {
      return '<span class="word-pos">' + WA.e(m.pos) + "</span>" + WA.e(m.def);
    }).join("；");
  };

  /* ---------- Toast ---------- */

  WA.toast = function (message, type, duration) {
    const container = WA.$("#toastContainer");
    if (!container) return;
    const node = document.createElement("div");
    node.className = "toast" + (type ? " is-" + type : "");
    node.textContent = message;
    container.appendChild(node);
    const life = duration || (type === "error" ? 4200 : 2600);
    setTimeout(function () {
      node.classList.add("is-leaving");
      setTimeout(function () { node.remove(); }, 200);
    }, life);
  };

  /* ---------- 主题 ---------- */

  WA.systemDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  WA.resolveTheme = function () {
    const theme = Store.getSettings().theme;
    if (theme === "light" || theme === "dark") return theme;
    return WA.systemDark && WA.systemDark.matches ? "dark" : "light";
  };

  WA.applyTheme = function () {
    const resolved = WA.resolveTheme();
    document.documentElement.dataset.theme = resolved;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", resolved === "dark" ? "#131512" : "#f6f5f1");

    const toggleUse = WA.$("#themeToggle use");
    if (toggleUse) {
      toggleUse.setAttribute("href", resolved === "dark" ? "#i-sun" : "#i-moon");
    }
    const toggle = WA.$("#themeToggle");
    if (toggle) toggle.setAttribute("aria-label", resolved === "dark" ? "切换到浅色主题" : "切换到深色主题");

    const current = Store.getSettings().theme;
    WA.$$("#themeSegmented button").forEach(function (button) {
      button.classList.toggle("is-active", button.getAttribute("data-theme-value") === current);
    });
  };

  WA.toggleTheme = function () {
    const next = WA.resolveTheme() === "dark" ? "light" : "dark";
    Store.updateSettings({ theme: next });
    WA.applyTheme();
    if (WA.currentView === "settings" && WA.renderSettings) WA.renderSettings(true);
  };

  /* ---------- 语音 ---------- */

  WA.ttsSupported = function () {
    return "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
  };

  WA.voices = [];

  WA.populateVoiceSelect = function () {
    const select = WA.$("#voiceSelect");
    if (!select) return;
    const settings = Store.getSettings();
    const frag = document.createDocumentFragment();
    const def = document.createElement("option");
    def.value = "";
    def.textContent = "系统默认";
    frag.appendChild(def);

    const voices = WA.voices.slice().sort(function (a, b) {
      const aEn = /^en/i.test(a.lang) ? 0 : 1;
      const bEn = /^en/i.test(b.lang) ? 0 : 1;
      return aEn - bEn || a.name.localeCompare(b.name);
    });
    voices.forEach(function (voice) {
      const option = document.createElement("option");
      option.value = voice.name;
      option.textContent = voice.name + " · " + voice.lang;
      frag.appendChild(option);
    });
    if (!voices.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "当前浏览器无可用语音";
      frag.appendChild(option);
    }
    select.replaceChildren(frag);
    select.value = voices.some(function (v) { return v.name === settings.ttsVoice; }) ? settings.ttsVoice : "";
  };

  WA.initVoices = function () {
    if (!WA.ttsSupported()) {
      WA.populateVoiceSelect();
      return;
    }
    const refresh = function () {
      WA.voices = window.speechSynthesis.getVoices() || [];
      WA.populateVoiceSelect();
    };
    refresh();
    if (typeof window.speechSynthesis.addEventListener === "function") {
      window.speechSynthesis.addEventListener("voiceschanged", refresh);
    } else {
      window.speechSynthesis.onvoiceschanged = refresh;
    }
  };

  WA.getVoice = function () {
    const name = Store.getSettings().ttsVoice;
    let voice = WA.voices.find(function (v) { return v.name === name; });
    if (!voice) voice = WA.voices.find(function (v) { return /^en/i.test(v.lang); });
    if (!voice && WA.voices.length) voice = WA.voices[0];
    return voice || null;
  };

  WA.speak = function (text) {
    if (!text) return;
    if (!WA.ttsSupported()) {
      WA.toast("当前浏览器不支持语音朗读", "error");
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(String(text));
      const voice = WA.getVoice();
      if (voice) utterance.voice = voice;
      utterance.lang = voice ? voice.lang : "en-US";
      utterance.rate = Store.getSettings().ttsRate;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      WA.toast("语音播放失败", "error");
    }
  };

  WA.speakWord = function (id) {
    const word = Store.getWord(id);
    if (word) WA.speak(word.term);
  };

  /* ---------- 下载 ---------- */

  WA.fileStamp = function () {
    const d = new Date();
    const pad = function (n) { return n < 10 ? "0" + n : String(n); };
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" + pad(d.getHours()) + pad(d.getMinutes());
  };

  WA.downloadFile = function (filename, content, mime) {
    const blob = new Blob([content], { type: mime || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1200);
  };

  WA.triggerImport = function () {
    const input = WA.$("#fileInput");
    if (input) input.click();
  };

  /* ---------- 滚动锁定 / 视图 ---------- */

  WA.lockBody = function (locked) {
    document.body.style.overflow = locked ? "hidden" : "";
  };

  const VIEW_TITLES = {
    dashboard: "今日学习",
    library: "单词库",
    stats: "学习统计",
    settings: "设置"
  };

  WA.VIEW_TITLES = VIEW_TITLES;
  WA.currentView = "dashboard";

  WA.navigate = function (view) {
    if (!VIEW_TITLES[view]) view = "dashboard";
    WA.currentView = view;
    WA.$$(".view").forEach(function (section) {
      section.hidden = section.id !== "view-" + view;
    });
    WA.$$("[data-view]").forEach(function (button) {
      button.classList.toggle("is-active", button.getAttribute("data-view") === view);
    });
    const title = WA.$("#viewTitle");
    if (title) title.textContent = VIEW_TITLES[view];
    WA.renderCurrentView();
    window.scrollTo(0, 0);
    if (view === "library") {
      const search = WA.$("#librarySearch");
      if (search && WA.libState && WA.libState.search) search.value = WA.libState.search;
    }
    if (view === "settings") {
      WA.renderSettings(true);
    }
  };

  WA.renderCurrentView = function () {
    if (WA.currentView === "dashboard" && WA.renderDashboard) WA.renderDashboard();
    else if (WA.currentView === "library" && WA.renderLibrary) WA.renderLibrary();
    else if (WA.currentView === "stats" && WA.renderStats) WA.renderStats();
    else if (WA.currentView === "settings" && WA.renderSettings) WA.renderSettings(false);
  };

  WA.renderAll = function () {
    WA.applyTheme();
    WA.updateChrome();
    WA.renderCurrentView();
  };

  /* ---------- 顶栏 / 侧栏 ---------- */

  WA.updateChrome = function () {
    const state = Store.getState();
    if (!state) return;
    const settings = Store.getSettings();
    const today = Store.getTodayStats();
    const counts = Store.getCounts();
    const newRemaining = Math.min(Store.getNewRemaining(), Store.getNewWords().length);
    const pending = counts.due + newRemaining;
    const goal = settings.dailyGoal || 1;
    const pct = Math.min(100, Math.round((today.reviewedCount / goal) * 100));

    const badge = WA.$("#navDueBadge");
    if (badge) {
      badge.textContent = pending > 99 ? "99+" : String(pending);
      badge.hidden = pending <= 0;
    }

    const wordCount = WA.$("#navWordCount");
    if (wordCount) wordCount.textContent = counts.all;

    const sideGoalText = WA.$("#sideGoalText");
    if (sideGoalText) sideGoalText.textContent = today.reviewedCount + " / " + goal;
    const sideGoalBar = WA.$("#sideGoalBar");
    if (sideGoalBar) sideGoalBar.style.width = pct + "%";
    const sideStreak = WA.$("#sideStreak");
    if (sideStreak) sideStreak.textContent = Store.getStreak();

    const topDate = WA.$("#topDate");
    const now = new Date();
    const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    const dateLabel = (now.getMonth() + 1) + "月" + now.getDate() + "日 · " + weekdays[now.getDay()];
    if (topDate) topDate.textContent = dateLabel;

    const hour = now.getHours();
    let greeting = "晚上好";
    if (hour < 5) greeting = "凌晨好";
    else if (hour < 11) greeting = "早上好";
    else if (hour < 13) greeting = "中午好";
    else if (hour < 18) greeting = "下午好";
    const greetingEl = WA.$("#greetingText");
    if (greetingEl) greetingEl.textContent = greeting;

    const dateChip = WA.$("#dateChip");
    if (dateChip) dateChip.textContent = dateLabel;

    const title = WA.$("#viewTitle");
    if (title) title.textContent = VIEW_TITLES[WA.currentView] || "今日学习";

    WA.applyTheme();
  };

  WA.miniWeekBars = function (days) {
    const max = Math.max(1, Math.max.apply(null, days.map(function (d) { return d.count; })));
    return days.map(function (day) {
      const height = day.count ? Math.max(6, Math.round((day.count / max) * 92)) : 4;
      const label = day.isToday ? "今天" : day.label.replace("周", "");
      return '<div class="mini-bar' + (day.isToday ? " is-today" : "") + '" title="' + WA.e(day.short) + " · " + day.count + ' 个单词">' +
        '<span class="mini-bar-count">' + (day.count || "") + "</span>" +
        '<div class="mini-bar-fill" style="height:' + height + 'px"></div>' +
        '<span class="mini-bar-label">' + WA.e(label) + "</span>" +
        "</div>";
    }).join("");
  };

  /* ---------- 今日学习 ---------- */

  WA.renderDashboard = function () {
    const state = Store.getState();
    const settings = Store.getSettings();
    const today = Store.getTodayStats();
    const mastery = Store.getMastery();
    const counts = Store.getCounts();
    const dueWords = Store.getDueWords();
    const newWords = Store.getNewWords();
    const newAvailable = Math.min(Store.getNewRemaining(), newWords.length);
    const pending = dueWords.length + newAvailable;
    const goal = settings.dailyGoal || 1;
    const pct = Math.min(100, Math.round((today.reviewedCount / goal) * 100));
    const accuracy = Store.getAccuracy(30);

    const setText = function (id, value) {
      const node = WA.$(id);
      if (node) node.textContent = value;
    };
    setText("#statStreak", Store.getStreak());
    setText("#statMastered", mastery.mastered);
    setText("#statTotal", mastery.total);
    setText("#statAccuracy", accuracy == null ? "—" : accuracy + "%");

    const hero = WA.$("#heroCard");
    if (hero) {
      if (state.words.length === 0) {
        hero.innerHTML =
          '<div class="hero-empty">' +
            '<div class="hero-empty-copy">' +
              '<div class="hero-empty-icon">' + WA.icon("book") + "</div>" +
              '<h2 class="hero-title">词库还是空的。</h2>' +
              '<p class="hero-desc">先记下第一个不会的单词，或者载入示例词库看看完整流程。</p>' +
              '<div class="hero-empty-actions">' +
                '<button class="btn btn-primary" type="button" data-action="add">' + WA.icon("plus") + " 添加第一个单词</button>" +
                '<button class="btn" type="button" data-action="sample">载入示例词库</button>' +
                '<button class="btn btn-ghost" type="button" data-action="import">' + WA.icon("upload") + " 导入备份</button>" +
              "</div>" +
            "</div>" +
          "</div>";
      } else {
        let title;
        let desc;
        let primary;
        let secondary;
        if (pending > 0) {
          title = "还有 <em>" + pending + "</em> 个词，等你一会儿。";
          const minutes = Math.max(1, Math.ceil(dueWords.length * 0.4 + newAvailable * 0.55));
          desc = "待复习 " + dueWords.length + " · 新词 " + newAvailable + " · 预计约 " + minutes + " 分钟";
          primary = '<button class="btn btn-primary" type="button" data-action="study-today">' + WA.icon("play") + " 开始学习</button>";
          secondary = '<button class="btn" type="button" data-action="free-study">自由练习</button>';
        } else if (today.reviewedCount > 0) {
          title = "今天的任务完成了。";
          desc = "已学习 " + today.reviewedCount + " 个词，连续打卡 " + Store.getStreak() + " 天。也可以再自由复习一会儿。";
          primary = '<button class="btn btn-primary" type="button" data-action="free-study">' + WA.icon("rotate") + " 自由复习</button>";
          secondary = '<button class="btn" type="button" data-action="quiz">' + WA.icon("target") + " 做一组测验</button>";
        } else {
          title = "今天没有到期的词。";
          desc = "自由复习几个旧词，或者添加新的单词。";
          primary = '<button class="btn btn-primary" type="button" data-action="free-study">' + WA.icon("play") + " 自由复习</button>";
          secondary = '<button class="btn" type="button" data-action="add">' + WA.icon("plus") + " 添加单词</button>";
        }

        hero.innerHTML =
          '<div class="hero-main">' +
            '<span class="hero-kicker">' + WA.icon("sparkles") + " 今日计划</span>" +
            '<h2 class="hero-title">' + title + "</h2>" +
            '<p class="hero-desc">' + WA.e(desc) + "</p>" +
            '<div class="hero-cta">' + primary + secondary + "</div>" +
          "</div>" +
          '<div class="hero-side">' +
            '<div class="progress-ring" style="--progress:' + pct + '">' +
              '<div class="ring-center"><strong>' + pct + '%</strong><span>今日目标</span></div>' +
            "</div>" +
            '<p class="hero-goal-text">' + today.reviewedCount + " / " + goal + " 词</p>" +
          "</div>";
      }
    }

    const recent = WA.$("#recentList");
    if (recent) {
      const recentWords = Store.getRecentWords(5);
      if (!recentWords.length) {
        recent.innerHTML = '<div class="soft-empty">还没有添加单词</div>';
      } else {
        recent.innerHTML = recentWords.map(function (word) {
          const meaning = WA.fullMeaning(word) || "暂无释义";
          return '<button class="recent-item" type="button" data-edit="' + WA.e(word.id) + '">' +
            '<span class="recent-main">' +
              '<span class="recent-term">' + WA.e(word.term) + "</span>" +
              '<span class="recent-def">' + WA.e(meaning) + "</span>" +
            "</span>" +
            '<span class="recent-meta">' + WA.e(WA.formatDue(word)) + "</span>" +
            "</button>";
        }).join("");
      }
    }

    const weekChart = WA.$("#weekChart");
    const days = Store.getLastNDays(7);
    if (weekChart) weekChart.innerHTML = WA.miniWeekBars(days);
    const weekTotal = WA.$("#weekTotal");
    if (weekTotal) {
      const total = days.reduce(function (sum, day) { return sum + day.count; }, 0);
      weekTotal.textContent = "共 " + total + " 词";
    }

    WA.updateChrome();
  };

  /* ---------- 通用弹窗 ---------- */

  WA.openDialog = function (dialog) {
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
  };

  WA.confirmResolver = null;
  WA.promptResolver = null;

  WA.settleConfirm = function (value) {
    const resolver = WA.confirmResolver;
    WA.confirmResolver = null;
    const dialog = WA.$("#confirmDialog");
    if (dialog && dialog.open) dialog.close();
    if (resolver) resolver(value);
  };

  WA.confirmAction = function (options) {
    const opts = options || {};
    const dialog = WA.$("#confirmDialog");
    if (!dialog) return Promise.resolve(false);
    if (WA.confirmResolver) WA.settleConfirm(false);
    WA.$("#confirmTitle").textContent = opts.title || "确认";
    WA.$("#confirmMessage").textContent = opts.message || "";
    const ok = WA.$("#confirmOkBtn");
    if (ok) {
      ok.textContent = opts.okText || "确定";
      ok.className = "btn " + (opts.danger ? "btn-danger" : "btn-primary");
    }
    return new Promise(function (resolve) {
      WA.confirmResolver = resolve;
      WA.openDialog(dialog);
    });
  };

  WA.settlePrompt = function (value) {
    const resolver = WA.promptResolver;
    WA.promptResolver = null;
    const dialog = WA.$("#promptDialog");
    if (dialog && dialog.open) dialog.close();
    if (resolver) resolver(value);
  };

  WA.askText = function (options) {
    const opts = options || {};
    const dialog = WA.$("#promptDialog");
    if (!dialog) return Promise.resolve(null);
    if (WA.promptResolver) WA.settlePrompt(null);
    WA.$("#promptTitle").textContent = opts.title || "输入";
    WA.$("#promptLabel").textContent = opts.label || "内容";
    const input = WA.$("#promptInput");
    input.value = opts.value || "";
    input.placeholder = opts.placeholder || "";
    const submit = WA.$("#promptForm button[type=submit]");
    if (submit) submit.textContent = opts.okText || "确定";
    return new Promise(function (resolve) {
      WA.promptResolver = resolve;
      WA.openDialog(dialog);
      setTimeout(function () { input.focus(); input.select(); }, 30);
    });
  };

  WA.bindDialogs = function () {
    WA.$$("[data-close-dialog]").forEach(function (button) {
      button.addEventListener("click", function () {
        const dialog = button.closest("dialog");
        if (dialog) dialog.close();
      });
    });

    const confirmDialog = WA.$("#confirmDialog");
    const confirmOk = WA.$("#confirmOkBtn");
    const confirmCancel = WA.$("#confirmCancelBtn");
    const confirmClose = WA.$("#confirmCloseBtn");
    if (confirmOk) confirmOk.addEventListener("click", function () { WA.settleConfirm(true); });
    if (confirmCancel) confirmCancel.addEventListener("click", function () { WA.settleConfirm(false); });
    if (confirmClose) confirmClose.addEventListener("click", function () { WA.settleConfirm(false); });
    if (confirmDialog) {
      confirmDialog.addEventListener("cancel", function (event) {
        event.preventDefault();
        WA.settleConfirm(false);
      });
      confirmDialog.addEventListener("close", function () {
        if (WA.confirmResolver) {
          const resolver = WA.confirmResolver;
          WA.confirmResolver = null;
          resolver(false);
        }
      });
    }

    const promptDialog = WA.$("#promptDialog");
    const promptForm = WA.$("#promptForm");
    if (promptForm) {
      promptForm.addEventListener("submit", function (event) {
        event.preventDefault();
        const value = WA.$("#promptInput").value.trim();
        if (!value) {
          WA.$("#promptInput").focus();
          return;
        }
        WA.settlePrompt(value);
      });
    }
    if (promptDialog) {
      promptDialog.addEventListener("cancel", function (event) {
        event.preventDefault();
        WA.settlePrompt(null);
      });
      promptDialog.addEventListener("close", function () {
        if (WA.promptResolver) {
          const resolver = WA.promptResolver;
          WA.promptResolver = null;
          resolver(null);
        }
      });
    }

    if (WA.systemDark) {
      const handler = function () {
        if (Store.getSettings().theme === "auto") WA.applyTheme();
      };
      if (typeof WA.systemDark.addEventListener === "function") WA.systemDark.addEventListener("change", handler);
      else if (typeof WA.systemDark.addListener === "function") WA.systemDark.addListener(handler);
    }
  };
})(window.WA);
