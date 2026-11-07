/* =========================================================
   拾词 · 背单词模式
   ========================================================= */
(function (WA) {
  "use strict";

  const $ = WA.$;
  const $$ = WA.$$;
  const e = WA.e;

  WA.currentStudy = null;
  let lastFocus = null;

  function buildQueue(mode) {
    const items = [];
    if (mode === "today") {
      const settings = Store.getSettings();
      const due = Store.getDueWords().slice(0, settings.reviewLimit);
      due.forEach(function (word) {
        items.push({ id: word.id, kind: "review", requeued: false });
      });
      const newRemaining = Store.getNewRemaining();
      Store.getNewWords().slice(0, newRemaining).forEach(function (word) {
        items.push({ id: word.id, kind: "new", requeued: false });
      });
    } else if (mode === "free") {
      WA.shuffle(Store.getState().words).slice(0, 30).forEach(function (word) {
        items.push({ id: word.id, kind: Store.isNew(word) ? "new" : "review", requeued: false });
      });
    } else if (mode === "wrong") {
      Store.getWrongWords(12).forEach(function (word) {
        items.push({ id: word.id, kind: "review", requeued: false });
      });
    }
    return items.filter(function (item) { return Boolean(Store.getWord(item.id)); });
  }

  function toastEmpty(mode) {
    if (mode === "today") WA.toast("今天没有待学习的单词，试试自由练习或测验");
    else if (mode === "wrong") WA.toast("目前还没有易错词，再学几个吧");
    else WA.toast("词库还是空的，先添加一个单词吧");
  }

  WA.startStudy = function (mode) {
    const source = mode || "today";
    const items = buildQueue(source);
    if (!items.length) {
      toastEmpty(source);
      return false;
    }

    const ids = Array.from(new Set(items.map(function (item) { return item.id; })));
    WA.currentStudy = {
      source: source,
      items: items,
      pointer: 0,
      completed: new Set(),
      newIds: new Set(),
      reviewIds: new Set(),
      requeueCount: new Map(),
      answers: 0,
      correct: 0,
      forgot: 0,
      totalUnique: ids.length,
      startedAt: Date.now(),
      currentId: null,
      currentItem: null,
      flipped: false,
      ratedCurrent: false,
      summary: false,
      returnView: WA.currentView
    };

    const overlay = $("#studyOverlay");
    if (overlay) overlay.hidden = false;
    const stage = $("#studyStage");
    if (stage) stage.hidden = false;
    const summary = $("#studySummary");
    if (summary) summary.hidden = true;
    resetStudyHeader();
    WA.lockBody(true);
    lastFocus = document.activeElement;
    renderCard();
    return true;
  };

  function resetStudyHeader() {
    if (!WA.currentStudy) return;
    const counter = $("#studyCounter");
    if (counter) counter.textContent = "0 / " + WA.currentStudy.totalUnique;
    const bar = $("#studyProgressBar");
    if (bar) bar.style.width = "0%";
  }

  function renderCard() {
    const session = WA.currentStudy;
    if (!session) return;
    if (session.pointer >= session.items.length) {
      finishSession();
      return;
    }

    const item = session.items[session.pointer];
    const word = item ? Store.getWord(item.id) : null;
    if (!word) {
      session.pointer += 1;
      renderCard();
      return;
    }

    session.currentItem = item;
    session.currentId = word.id;
    session.flipped = false;
    session.ratedCurrent = false;

    const isNew = Store.isNew(word);
    const isDue = Store.isDue(word);
    const kind = $("#studyKind");
    if (kind) {
      let label = isNew ? "新词" : "复习";
      kind.textContent = label;
      kind.classList.toggle("is-new", isNew);
    }
    const sub = $("#studySub");
    if (sub) {
      let label = "巩固复习";
      if (session.source === "wrong") label = "易错专项";
      else if (isNew) label = "第一次见";
      else if (isDue) label = "到期复习";
      sub.textContent = label + " · 剩余 " + Math.max(0, session.totalUnique - session.completed.size) + " 词";
    }

    const front = $("#cardFront");
    if (front) {
      front.innerHTML =
        '<div class="card-badge' + (isNew ? " is-new" : "") + '">' + (isNew ? "新词" : "复习") + "</div>" +
        '<div class="card-top-actions">' +
          '<button class="card-speaker" type="button" data-study-speak aria-label="朗读这个单词" title="朗读">' + WA.icon("volume") + "</button>" +
        "</div>" +
        '<div class="card-word">' + e(word.term) + "</div>" +
        (word.phonetic ? '<div class="card-phonetic">' + e(word.phonetic) + "</div>" : "") +
        (word.tags.length ? '<div class="card-tags">' + word.tags.slice(0, 4).map(function (tag) {
          return '<span class="mini-tag">' + e(tag) + "</span>";
        }).join("") + "</div>" : "") +
        '<p class="card-tip">先在心里回忆，再翻面</p>';
    }

    const back = $("#cardBack");
    if (back) {
      const meanings = word.meanings.filter(function (m) { return m.def || m.pos; });
      const meaningsHTML = meanings.length
        ? meanings.map(function (m) {
            return '<div class="back-meaning"><span class="back-pos">' + e(m.pos) + "</span><span>" + e(m.def) + "</span></div>";
          }).join("")
        : '<div class="back-empty">暂无释义，可以补充一下。</div>';
      const examplesHTML = word.examples.length
        ? '<div class="back-examples">' + word.examples.map(function (example) {
            return '<div class="back-example">' +
              (example.text ? '<div class="back-example-text">' + e(example.text) + "</div>" : "") +
              (example.translation ? '<div class="back-example-zh">' + e(example.translation) + "</div>" : "") +
            "</div>";
          }).join("") + "</div>"
        : "";
      const noteHTML = word.note ? '<div class="back-note">' + e(word.note) + "</div>" : "";

      back.innerHTML =
        '<div class="card-top-actions">' +
          '<button class="card-speaker" type="button" data-study-speak aria-label="朗读这个单词" title="朗读">' + WA.icon("volume") + "</button>" +
        "</div>" +
        '<div class="back-head"><span class="back-word">' + e(word.term) + "</span>" +
          (word.phonetic ? '<span class="back-phonetic">' + e(word.phonetic) + "</span>" : "") +
        "</div>" +
        '<div class="back-meanings">' + meaningsHTML + "</div>" +
        examplesHTML + noteHTML;
    }

    const flashcard = $("#flashcard");
    if (flashcard) {
      flashcard.classList.remove("is-flipped", "card-enter");
      void flashcard.offsetWidth;
      flashcard.classList.add("card-enter");
    }
    const flipBtn = $("#flipBtn");
    if (flipBtn) {
      flipBtn.hidden = false;
      flipBtn.innerHTML = '查看释义 <kbd>Space</kbd>';
    }
    const ratingBar = $("#ratingBar");
    if (ratingBar) {
      ratingBar.hidden = true;
      $$("[data-preview]", ratingBar).forEach(function (node) {
        const rating = Number(node.getAttribute("data-preview"));
        node.textContent = WA.formatInterval(Store.previewIntervalDays(word, rating));
      });
    }

    updateProgress();
    if (Store.getSettings().autoSpeak) {
      setTimeout(function () {
        if (WA.currentStudy && WA.currentStudy.currentId === word.id && !WA.currentStudy.summary) {
          WA.speak(word.term);
        }
      }, 220);
    }
  }

  function updateProgress() {
    const session = WA.currentStudy;
    if (!session) return;
    const pct = session.totalUnique ? Math.round((session.completed.size / session.totalUnique) * 100) : 0;
    const bar = $("#studyProgressBar");
    if (bar) bar.style.width = pct + "%";
    const counter = $("#studyCounter");
    if (counter) {
      const current = Math.min(
        session.totalUnique,
        session.completed.size + (session.currentId && !session.completed.has(session.currentId) ? 1 : 0)
      );
      counter.textContent = current + " / " + session.totalUnique;
    }
  }

  WA.flipStudyCard = function () {
    const session = WA.currentStudy;
    if (!session || session.summary || session.flipped) return;
    session.flipped = true;
    const flashcard = $("#flashcard");
    if (flashcard) flashcard.classList.add("is-flipped");
    const flipBtn = $("#flipBtn");
    if (flipBtn) flipBtn.hidden = true;
    const ratingBar = $("#ratingBar");
    if (ratingBar) ratingBar.hidden = false;
    updateProgress();
  };

  WA.rateCurrent = function (rating) {
    const session = WA.currentStudy;
    if (!session || session.summary || !session.flipped || session.ratedCurrent || !session.currentId) return;
    session.ratedCurrent = true;

    const id = session.currentId;
    const item = session.currentItem || { id: id, kind: "review" };
    const value = WA.clamp(Number(rating), 0, 3);
    const result = Store.rateWord(id, value);
    if (!result) {
      session.pointer += 1;
      renderCard();
      return;
    }

    session.answers += 1;
    if (value > 0) session.correct += 1;
    else session.forgot += 1;
    if (result.wasNew) session.newIds.add(id);
    session.completed.add(id);
    session.reviewIds.add(id);

    if (value === 0) {
      const count = session.requeueCount.get(id) || 0;
      if (count < 2) {
        session.requeueCount.set(id, count + 1);
        const insertAt = Math.min(session.items.length, session.pointer + 4);
        session.items.splice(insertAt, 0, { id: id, kind: item.kind, requeued: true });
      }
    }

    WA.updateChrome();
    session.pointer += 1;
    renderCard();
  };

  function finishSession() {
    const session = WA.currentStudy;
    if (!session) return;
    session.summary = true;
    session.currentId = null;

    const stage = $("#studyStage");
    if (stage) stage.hidden = true;
    const summary = $("#studySummary");
    if (!summary) return;
    summary.hidden = false;

    const bar = $("#studyProgressBar");
    if (bar) bar.style.width = "100%";
    const counter = $("#studyCounter");
    if (counter) counter.textContent = session.totalUnique + " / " + session.totalUnique;
    const sub = $("#studySub");
    if (sub) sub.textContent = "本轮完成";

    const accuracy = session.answers ? Math.round((session.correct / session.answers) * 100) : 0;
    let title = "多见几次，就熟了。";
    if (accuracy === 100 && session.forgot === 0) title = "这一组很稳。";
    else if (accuracy >= 80) title = "记得很牢。";
    else if (accuracy >= 60) title = "再巩固一下就好。";

    const againAction = session.source === "today" ? "free" : "again";
    const againLabel = session.source === "today" ? "自由复习" : "再来一组";

    summary.innerHTML =
      '<div class="summary-card">' +
        '<div class="summary-icon">' + WA.icon("check") + "</div>" +
        "<h2>" + e(title) + "</h2>" +
        '<p class="summary-sub">共 ' + session.totalUnique + " 个单词</p>" +
        '<div class="summary-stats">' +
          '<div class="summary-stat"><strong>' + session.completed.size + "</strong><span>已学</span></div>" +
          '<div class="summary-stat"><strong>' + session.newIds.size + "</strong><span>新词</span></div>" +
          '<div class="summary-stat"><strong>' + accuracy + '%</strong><span>正确率</span></div>' +
          '<div class="summary-stat"><strong>' + session.forgot + "</strong><span>忘记</span></div>" +
        "</div>" +
        '<p class="summary-time">' + WA.icon("clock") + " 用时 " + WA.formatDuration(Date.now() - session.startedAt) + "</p>" +
        '<div class="summary-actions">' +
          '<button class="btn btn-primary" type="button" data-session-action="' + againAction + '">' + WA.icon("rotate") + " " + againLabel + "</button>" +
          '<button class="btn" type="button" data-session-action="quiz">' + WA.icon("target") + " 做一组测验</button>" +
          '<button class="btn btn-ghost" type="button" data-session-action="home">返回首页</button>' +
        "</div>" +
      "</div>";

    WA.updateChrome();
  }

  function closeStudyOverlay() {
    const overlay = $("#studyOverlay");
    if (overlay) overlay.hidden = true;
    WA.lockBody(false);
    WA.currentStudy = null;
    const focusTarget = lastFocus;
    lastFocus = null;
    if (focusTarget && typeof focusTarget.focus === "function") {
      setTimeout(function () {
        if (document.contains(focusTarget)) focusTarget.focus();
      }, 30);
    }
    WA.renderAll();
  }

  WA.exitStudy = async function (force) {
    const session = WA.currentStudy;
    if (!session) return;
    if (force || session.summary || session.answers === 0) {
      closeStudyOverlay();
      return;
    }
    const ok = await WA.confirmAction({
      title: "退出学习",
      message: "已评分的单词会保存，本轮未完成的学习记录不会丢失。",
      okText: "退出"
    });
    if (ok) closeStudyOverlay();
  };

  WA.studySessionAction = function (action) {
    const session = WA.currentStudy;
    if (!session) return;
    if (action === "again") {
      const source = session.source;
      closeStudyOverlay();
      WA.startStudy(source === "wrong" ? "wrong" : "free");
    } else if (action === "free") {
      closeStudyOverlay();
      WA.startStudy("free");
    } else if (action === "quiz") {
      closeStudyOverlay();
      if (WA.openQuiz) WA.openQuiz();
    } else if (action === "home") {
      closeStudyOverlay();
      WA.navigate("dashboard");
    }
  };

  WA.studyKeyboard = function (event) {
    const session = WA.currentStudy;
    if (!session) return;
    const overlay = $("#studyOverlay");
    if (!overlay || overlay.hidden) return;
    if (document.querySelector("dialog[open]")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      WA.exitStudy();
      return;
    }
    if (session.summary) return;
    if (event.key === " " && !session.flipped) {
      event.preventDefault();
      WA.flipStudyCard();
      return;
    }
    if (["1", "2", "3", "4"].includes(event.key) && session.flipped) {
      event.preventDefault();
      WA.rateCurrent(Number(event.key) - 1);
      return;
    }
    if ((event.key === "s" || event.key === "S") && session.currentId) {
      const word = Store.getWord(session.currentId);
      if (word) {
        event.preventDefault();
        WA.speak(word.term);
      }
    }
  };

  WA.bindStudy = function () {
    const flipBtn = $("#flipBtn");
    if (flipBtn) flipBtn.addEventListener("click", WA.flipStudyCard);

    const ratingBar = $("#ratingBar");
    if (ratingBar) {
      ratingBar.addEventListener("click", function (event) {
        const button = event.target.closest("[data-rating]");
        if (!button) return;
        WA.rateCurrent(Number(button.getAttribute("data-rating")));
      });
    }

    const exitBtn = $("#studyExitBtn");
    if (exitBtn) exitBtn.addEventListener("click", function () { WA.exitStudy(); });

    const stage = $("#studyStage");
    if (stage) {
      stage.addEventListener("click", function (event) {
        if (!event.target.closest("[data-study-speak]")) return;
        const session = WA.currentStudy;
        if (!session || !session.currentId) return;
        const word = Store.getWord(session.currentId);
        if (word) WA.speak(word.term);
      });
    }

    const summary = $("#studySummary");
    if (summary) {
      summary.addEventListener("click", function (event) {
        const button = event.target.closest("[data-session-action]");
        if (!button) return;
        WA.studySessionAction(button.getAttribute("data-session-action"));
      });
    }

    document.addEventListener("keydown", WA.studyKeyboard);
  };
})(window.WA);
