/* =========================================================
   拾词 · 应用入口
   - 统计页渲染
   - 设置页渲染与绑定
   - 全局事件委托 / 快捷键
   - 初始化
   ========================================================= */
(function (WA) {
  "use strict";

  const $ = WA.$;
  const $$ = WA.$$;
  const e = WA.e;

  /* =========================================================
     统计
     ========================================================= */

  function statCard(icon, tone, value, label) {
    return '<div class="stat-card">' +
      '<span class="stat-ico ' + tone + '">' + WA.icon(icon) + "</span>" +
      "<div><strong>" + e(value) + "</strong><span>" + e(label) + "</span></div>" +
      "</div>";
  }

  function heatLevel(count, max) {
    if (!count) return 0;
    if (max <= 1) return 4;
    const ratio = count / max;
    if (ratio > 0.75) return 4;
    if (ratio > 0.5) return 3;
    if (ratio > 0.25) return 2;
    return 1;
  }

  function renderHeatmap() {
    const wrap = $("#heatmap");
    if (!wrap) return;
    const days = Store.getLastNDays(30);
    const counts = days.map(function (day) { return day.count; });
    const max = Math.max.apply(null, counts.concat([1]));
    const total = counts.reduce(function (sum, count) { return sum + count; }, 0);
    const activeDays = counts.filter(function (count) { return count > 0; }).length;

    wrap.innerHTML = days.map(function (day) {
      const level = heatLevel(day.count, max);
      const title = day.short + " · " + (day.count ? day.count + " 个单词" : "没有学习");
      return '<span class="heat-cell' + (level ? " lv" + level : "") + '" title="' + e(title) + '" aria-label="' + e(title) + '"></span>';
    }).join("");

    const label = $("#heatmapTotal");
    if (label) label.textContent = "共 " + total + " 词 · " + activeDays + " 天有记录";

    const summary = $("#heatStats");
    if (summary) {
      const todayCount = Store.getTodayStats().reviewedCount;
      const weekCount = Store.getLastNDays(7).reduce(function (sum, day) { return sum + day.count; }, 0);
      const goal = Math.max(1, Store.getSettings().dailyGoal);
      const goalDays = days.filter(function (day) { return day.count >= goal; }).length;
      summary.innerHTML =
        '<div class="heat-stat"><strong>' + todayCount + " 词</strong><span>今日学习</span></div>" +
        '<div class="heat-stat"><strong>' + weekCount + " 词</strong><span>近 7 天</span></div>" +
        '<div class="heat-stat"><strong>' + goalDays + " 天</strong><span>达成每日目标</span></div>";
    }
  }

  function renderMastery() {
    const mastery = Store.getMastery();
    const donut = $("#masteryDonut");
    const percentEl = $("#donutPercent");
    const legend = $("#masteryLegend");
    const total = mastery.total;

    const masteredPct = total ? Math.round((mastery.mastered / total) * 100) : 0;
    const learningPct = total ? Math.round((mastery.learning / total) * 100) : 0;
    const restPct = Math.max(0, 100 - masteredPct - learningPct);

    if (percentEl) percentEl.textContent = masteredPct + "%";
    if (donut) {
      donut.style.background = "conic-gradient(" +
        "var(--green) 0 " + masteredPct + "%, " +
        "var(--accent) " + masteredPct + "% " + (masteredPct + learningPct) + "%, " +
        "var(--surface-2) " + (masteredPct + learningPct) + "% 100%)";
    }

    if (legend) {
      legend.innerHTML =
        '<div class="legend-row"><span class="legend-dot green"></span><span>已掌握</span><span>' + mastery.mastered + "</span></div>" +
        '<div class="legend-row"><span class="legend-dot blue"></span><span>学习中</span><span>' + mastery.learning + "</span></div>" +
        '<div class="legend-row"><span class="legend-dot gray"></span><span>新词</span><span>' + mastery.new + "</span></div>";
    }
  }

  function renderWeekChart() {
    const chart = $("#statsWeekChart");
    if (!chart) return;
    const days = Store.getLastNDays(7);
    const max = Math.max.apply(null, days.map(function (day) { return day.count; }).concat([1]));
    const total = days.reduce(function (sum, day) { return sum + day.count; }, 0);

    chart.innerHTML = days.map(function (day) {
      const height = day.count ? Math.max(6, Math.round((day.count / max) * 100)) : 2;
      return '<div class="bar-col' + (day.isToday ? " is-today" : "") + '" title="' + e(day.short + " · " + day.count + " 个单词") + '">' +
        '<span class="bar-value">' + (day.count || "") + "</span>" +
        '<div class="chart-track"><div class="bar-fill-v" style="height:' + height + '%"></div></div>' +
        '<span class="bar-label">' + e(day.isToday ? "今天" : day.label) + "</span>" +
        "</div>";
    }).join("");

    const label = $("#statsWeekTotal");
    if (label) label.textContent = "共 " + total + " 词";
  }

  function renderWeakWords() {
    const wrap = $("#weakList");
    if (!wrap) return;
    const words = Store.getWrongWords(6);
    if (!words.length) {
      wrap.innerHTML = '<div class="weak-empty">还没有易错词，继续保持。</div>';
      return;
    }
    wrap.innerHTML = words.map(function (word, index) {
      return '<div class="weak-item">' +
        '<span class="weak-rank">' + (index + 1 < 10 ? "0" : "") + (index + 1) + "</span>" +
        '<div class="weak-main">' +
          '<div class="weak-term">' + e(word.term) + "</div>" +
          '<div class="weak-def">' + e(WA.fullMeaning(word) || "暂无释义") + "</div>" +
        "</div>" +
        '<span class="weak-count">×' + word.stats.wrong + "</span>" +
        "</div>";
    }).join("");
  }

  WA.renderStats = function () {
    const overview = $("#statsOverview");
    const mastery = Store.getMastery();
    const accuracy = Store.getAccuracy(30);
    const last30 = Store.getLastNDays(30);
    const studiedWords = last30.reduce(function (sum, day) { return sum + day.count; }, 0);

    if (overview) {
      overview.innerHTML =
        statCard("flame", "warm", Store.getStreak() + " 天", "连续打卡") +
        statCard("layers", "blue", studiedWords + " 词", "近 30 天学习") +
        statCard("trophy", "green", mastery.mastered + " 词", "已掌握") +
        statCard("target", "violet", accuracy == null ? "—" : accuracy + "%", "近 30 天正确率");
    }

    renderHeatmap();
    renderMastery();
    renderWeekChart();
    renderWeakWords();

    const practice = $("#practiceWeakBtn");
    if (practice) practice.disabled = Store.getWrongWords(1).length === 0;
  };

  /* =========================================================
     设置
     ========================================================= */

  function setValue(selector, value, full) {
    const input = $(selector);
    if (!input) return;
    if (!full && document.activeElement === input) return;
    input.value = value;
  }

  function renderBackupInfo() {
    const info = Store.getBackupInfo();
    const text = $("#backupInfo");
    const button = $("#restoreBackupBtn");
    if (text) {
      text.textContent = info
        ? info.formatted + " · " + info.reason + " · " + info.words + " 个单词"
        : "暂无备份";
    }
    if (button) button.disabled = !info;
  }

  function renderStorageInfo() {
    const info = Store.getStorageInfo();
    const state = Store.getState();
    const storage = $("#storageInfo");
    const words = $("#wordStorageInfo");
    if (storage) storage.textContent = "本地占用 " + WA.formatBytes(info.totalBytes);
    if (words) {
      words.textContent = state.words.length + " 个单词 · 数据 " + WA.formatBytes(info.stateBytes);
    }
  }

  WA.renderSettings = function (full) {
    const state = Store.getState();
    if (!state) return;
    const settings = Store.getSettings();

    setValue("#setDailyGoal", settings.dailyGoal, full);
    setValue("#setNewLimit", settings.newLimit, full);
    setValue("#setReviewLimit", settings.reviewLimit, full);

    const autoSpeak = $("#setAutoSpeak");
    if (autoSpeak) autoSpeak.checked = Boolean(settings.autoSpeak);
    const quizSync = $("#setQuizSync");
    if (quizSync) quizSync.checked = Boolean(settings.quizSync);

    $$("#themeSegmented [data-theme-value]").forEach(function (button) {
      button.classList.toggle("is-active", button.getAttribute("data-theme-value") === settings.theme);
    });

    const range = $("#rateRange");
    if (range && (full || document.activeElement !== range)) range.value = settings.ttsRate;
    const rateValue = $("#rateValue");
    if (rateValue) rateValue.textContent = Number(settings.ttsRate).toFixed(1) + "×";

    const voice = $("#voiceSelect");
    if (full) {
      WA.populateVoiceSelect();
    } else if (voice) {
      voice.value = settings.ttsVoice || "";
    }

    renderBackupInfo();
    renderStorageInfo();
  };

  function updateSetting(patch, rerender) {
    Store.updateSettings(patch);
    WA.updateChrome();
    if (rerender) WA.renderSettings(false);
  }

  function bindNumberSetting(selector, key) {
    const input = $(selector);
    if (!input) return;
    input.addEventListener("change", function () {
      const value = Number(input.value);
      if (!Number.isFinite(value)) {
        WA.renderSettings(false);
        return;
      }
      updateSetting({ [key]: value }, true);
    });
  }

  async function restoreBackup() {
    const info = Store.getBackupInfo();
    if (!info) {
      WA.toast("当前没有可恢复的备份", "error");
      return;
    }
    const ok = await WA.confirmAction({
      title: "恢复备份",
      message: "将用 " + info.formatted + " 的备份（" + info.words + " 个单词）覆盖当前数据。\n当前数据会先自动保存一份备份。",
      okText: "恢复备份"
    });
    if (!ok) return;
    const result = Store.restoreBackup();
    if (!result) {
      WA.toast("备份恢复失败", "error");
      return;
    }
    WA.libState.selected.clear();
    WA.applyTheme();
    WA.renderAll();
    WA.navigate("dashboard");
    WA.toast("已恢复 " + result.words + " 个单词", "success", 3600);
  }

  async function clearAllData() {
    const state = Store.getState();
    if (!state.words.length && !Object.keys(state.logs).length) {
      WA.toast("当前没有数据");
      return;
    }
    const ok = await WA.confirmAction({
      title: "清空所有数据",
      message: "将删除全部 " + state.words.length + " 个单词、学习记录和统计数据。\n清空前会自动保存一份备份，仍然建议先导出 JSON。",
      okText: "清空所有数据",
      danger: true
    });
    if (!ok) return;
    Store.clearAll();
    WA.libState.selected.clear();
    WA.libState.manage = false;
    WA.libState.search = "";
    WA.libState.filter = "all";
    WA.libState.tag = "";
    WA.renderAll();
    WA.navigate("dashboard");
    WA.toast("已清空所有数据", "success");
  }

  function testVoice() {
    if (!WA.ttsSupported()) {
      WA.toast("当前浏览器不支持语音朗读", "error");
      return;
    }
    WA.speak("serendipity");
  }

  function bindSettings() {
    bindNumberSetting("#setDailyGoal", "dailyGoal");
    bindNumberSetting("#setNewLimit", "newLimit");
    bindNumberSetting("#setReviewLimit", "reviewLimit");

    const autoSpeak = $("#setAutoSpeak");
    if (autoSpeak) {
      autoSpeak.addEventListener("change", function () {
        updateSetting({ autoSpeak: autoSpeak.checked });
      });
    }

    const quizSync = $("#setQuizSync");
    if (quizSync) {
      quizSync.addEventListener("change", function () {
        updateSetting({ quizSync: quizSync.checked });
      });
    }

    const themeGroup = $("#themeSegmented");
    if (themeGroup) {
      themeGroup.addEventListener("click", function (event) {
        const button = event.target.closest("[data-theme-value]");
        if (!button) return;
        Store.updateSettings({ theme: button.getAttribute("data-theme-value") });
        WA.applyTheme();
        WA.renderSettings(false);
      });
    }

    const rate = $("#rateRange");
    if (rate) {
      rate.addEventListener("input", function () {
        const value = Number(rate.value) || 1;
        const label = $("#rateValue");
        if (label) label.textContent = value.toFixed(1) + "×";
      });
      rate.addEventListener("change", function () {
        updateSetting({ ttsRate: Number(rate.value) || 1 }, true);
      });
    }

    const voice = $("#voiceSelect");
    if (voice) {
      voice.addEventListener("change", function () {
        updateSetting({ ttsVoice: voice.value });
      });
    }

    const test = $("#testVoiceBtn");
    if (test) test.addEventListener("click", testVoice);

    const restore = $("#restoreBackupBtn");
    if (restore) restore.addEventListener("click", restoreBackup);

    const clear = $("#clearAllBtn");
    if (clear) clear.addEventListener("click", clearAllData);
  }

  /* =========================================================
     全局事件
     ========================================================= */

  function runAction(action) {
    if (action === "study-today") {
      WA.startStudy("today");
    } else if (action === "free-study") {
      WA.startStudy("free");
    } else if (action === "quiz") {
      WA.openQuiz();
    } else if (action === "add") {
      WA.openWordDialog();
    } else if (action === "library") {
      WA.navigate("library");
    } else if (action === "sample") {
      WA.loadSampleAction();
    } else if (action === "import") {
      WA.triggerImport();
    } else if (action === "clear-filters") {
      WA.libState.search = "";
      WA.libState.filter = "all";
      WA.libState.tag = "";
      WA.libState.limit = 50;
      const search = $("#librarySearch");
      if (search) search.value = "";
      WA.renderLibrary();
    }
  }

  function bindGlobalEvents() {
    document.addEventListener("click", function (event) {
      const viewButton = event.target.closest("[data-view]");
      if (viewButton) {
        WA.navigate(viewButton.getAttribute("data-view"));
        return;
      }

      const actionButton = event.target.closest("[data-action]");
      if (actionButton) {
        runAction(actionButton.getAttribute("data-action"));
        return;
      }

      const row = event.target.closest(".word-row");
      if (row && WA.libState.manage && !event.target.closest(".word-actions") && !event.target.closest(".word-check")) {
        const checkbox = row.querySelector(".word-check");
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return;
      }

      const editButton = event.target.closest("[data-edit]");
      if (editButton) {
        WA.openWordDialog(editButton.getAttribute("data-edit"));
        return;
      }

      const speakButton = event.target.closest("[data-speak]");
      if (speakButton) {
        WA.speakWord(speakButton.getAttribute("data-speak"));
        return;
      }

      const starButton = event.target.closest("[data-star]");
      if (starButton) {
        WA.toggleWordStar(starButton.getAttribute("data-star"));
        return;
      }

      const deleteButton = event.target.closest("[data-delete]");
      if (deleteButton) {
        WA.deleteWordWithConfirm(deleteButton.getAttribute("data-delete"));
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (WA.isTyping(event.target)) return;
      if (document.querySelector("dialog[open]")) return;

      const study = $("#studyOverlay");
      const quiz = $("#quizOverlay");
      if ((study && !study.hidden) || (quiz && !quiz.hidden)) return;

      if (event.key === "/") {
        event.preventDefault();
        WA.navigate("library");
        setTimeout(function () {
          const search = $("#librarySearch");
          if (search) search.focus();
        }, 60);
        return;
      }

      if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        WA.openWordDialog();
      }
    });

    const themeToggle = $("#themeToggle");
    if (themeToggle) themeToggle.addEventListener("click", WA.toggleTheme);

    const add = $("#globalAddBtn");
    if (add) add.addEventListener("click", function () { WA.openWordDialog(); });
    const bottomAdd = $("#bottomAddBtn");
    if (bottomAdd) bottomAdd.addEventListener("click", function () { WA.openWordDialog(); });

    const practice = $("#practiceWeakBtn");
    if (practice) {
      practice.addEventListener("click", function () {
        if (!Store.getWrongWords(1).length) {
          WA.toast("还没有易错词，先学几个吧");
          return;
        }
        WA.navigate("dashboard");
        WA.startStudy("wrong");
      });
    }
  }

  /* =========================================================
     初始化
     ========================================================= */

  let lastStorageErrorAt = 0;

  function onStorageError(event) {
    const now = Date.now();
    if (now - lastStorageErrorAt < 5000) return;
    lastStorageErrorAt = now;
    const error = event && event.detail;
    const message = error && error.name === "QuotaExceededError"
      ? "浏览器存储空间已满，请导出备份后清理数据"
      : "数据保存失败，请检查浏览器存储设置";
    WA.toast(message, "error", 5200);
  }

  function init() {
    window.addEventListener("shici:storage-error", onStorageError);

    Store.load();
    Store.ensureDailyBackup();

    WA.bindDialogs();
    WA.bindLibrary();
    WA.bindStudy();
    WA.bindQuiz();
    bindSettings();
    bindGlobalEvents();
    WA.initVoices();

    WA.applyTheme();
    WA.navigate("dashboard");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window.WA);
