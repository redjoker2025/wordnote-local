/* =========================================================
   拾词 · 测验模式
   ========================================================= */
(function (WA) {
  "use strict";

  const $ = WA.$;
  const e = WA.e;

  WA.currentQuiz = null;
  let lastFocus = null;

  const TYPE_LABELS = {
    e2c: "英译中",
    c2e: "中译英",
    spell: "拼写",
    listen: "听写"
  };

  function scopeWords(scope) {
    const words = Store.getState().words;
    if (scope === "due") return Store.getDueWords();
    if (scope === "wrong") return Store.getWrongWords(1000);
    if (scope === "starred") return words.filter(function (word) { return word.starred; });
    return words.slice();
  }

  function choiceSets() {
    const meanings = new Set();
    const terms = new Set();
    Store.getState().words.forEach(function (word) {
      const meaning = WA.primaryMeaning(word);
      if (meaning) meanings.add(meaning);
      if (word.term) terms.add(word.term);
    });
    return { meanings: meanings, terms: terms };
  }

  function eligibleWords(mode, pool) {
    if (mode === "listen") return WA.ttsSupported() ? pool.slice() : [];
    if (mode === "e2c" || mode === "c2e") {
      const sets = choiceSets();
      const hasChoices = mode === "e2c" ? sets.meanings.size >= 2 : sets.terms.size >= 2;
      if (!hasChoices) return [];
      return pool.filter(WA.hasMeaning);
    }
    if (mode === "spell") return pool.filter(WA.hasMeaning);
    return pool.filter(function (word) {
      return WA.hasMeaning(word) || WA.ttsSupported();
    });
  }

  function makeChoices(correct, candidates) {
    const unique = Array.from(new Set(candidates.map(function (item) { return String(item || "").trim(); }).filter(function (item) {
      return item && item !== correct;
    })));
    if (!correct || !unique.length) return null;
    const picked = WA.shuffle(unique).slice(0, 3);
    return WA.shuffle([correct].concat(picked));
  }

  function makeQuestion(word, type) {
    const meaning = WA.fullMeaning(word);
    const primary = WA.primaryMeaning(word);
    const base = {
      verbose: true,
      wordId: word.id,
      type: type,
      term: word.term,
      phonetic: word.phonetic,
      meaning: meaning,
      primary: primary
    };
    const words = Store.getState().words;

    if (type === "e2c") {
      if (!primary) return null;
      const options = makeChoices(primary, words.map(function (item) { return WA.primaryMeaning(item); }));
      if (!options) return null;
      return Object.assign(base, { correctText: primary, options: options });
    }
    if (type === "c2e") {
      if (!meaning) return null;
      const options = makeChoices(word.term, words.map(function (item) { return item.term; }));
      if (!options) return null;
      return Object.assign(base, { correctText: word.term, options: options });
    }
    if (type === "spell") {
      if (!meaning) return null;
      return Object.assign(base, { correctText: word.term, options: null });
    }
    if (type === "listen") {
      if (!WA.ttsSupported()) return null;
      return Object.assign(base, { correctText: word.term, options: null });
    }
    return null;
  }

  function buildQuizQuestions(mode, pool, countOption) {
    const eligible = eligibleWords(mode, pool);
    if (!eligible.length) return [];
    const count = countOption === "all" ? eligible.length : Math.max(1, parseInt(countOption, 10) || 10);
    const selected = WA.shuffle(eligible).slice(0, Math.min(count, eligible.length));
    const sets = choiceSets();
    const questions = [];
    const lastTypes = [];

    selected.forEach(function (word) {
      let candidates = [];
      if (mode === "mixed") {
        if (WA.hasMeaning(word)) {
          candidates.push("spell");
          if (sets.meanings.size >= 2) candidates.push("e2c");
          if (sets.terms.size >= 2) candidates.push("c2e");
        }
        if (WA.ttsSupported()) candidates.push("listen");
      } else {
        candidates = [mode];
      }

      const filtered = candidates.filter(function (type) {
        return !(lastTypes.length >= 2 && lastTypes[0] === type && lastTypes[1] === type);
      });
      const order = WA.shuffle(filtered.length ? filtered : candidates);

      for (let i = 0; i < order.length; i += 1) {
        const question = makeQuestion(word, order[i]);
        if (question) {
          questions.push(question);
          lastTypes.unshift(order[i]);
          if (lastTypes.length > 2) lastTypes.pop();
          break;
        }
      }
    });

    return questions;
  }

  function updateQuizSetup() {
    const modeInput = document.querySelector('input[name="quizMode"]:checked');
    const mode = modeInput ? modeInput.value : "mixed";
    const scope = $("#quizScope").value;
    const countOption = $("#quizCount").value;
    const pool = scopeWords(scope);
    const eligible = eligibleWords(mode, pool);
    const requested = countOption === "all" ? eligible.length : Math.max(1, parseInt(countOption, 10) || 10);
    const actual = Math.min(requested, eligible.length);
    const info = $("#quizSetupInfo");
    const start = $("#quizStartBtn");
    if (!info || !start) return;

    let warning = "";
    if (!pool.length) warning = "这个范围内还没有单词。";
    else if (mode === "listen" && !WA.ttsSupported()) warning = "当前浏览器不支持语音播放，无法进行听写。";
    else if (mode === "spell" && !eligible.length) warning = "拼写题需要单词带有释义。";
    else if ((mode === "e2c" || mode === "c2e") && !eligible.length) warning = "选择题至少需要两个不同的单词或释义。";
    else if (mode === "mixed" && !eligible.length) warning = "范围内没有可用于测验的单词，请先补充释义。";

    info.classList.toggle("is-warning", Boolean(warning));
    if (warning) {
      info.textContent = warning;
      start.disabled = true;
    } else {
      let text = "范围内共 " + pool.length + " 个词，可测验 " + eligible.length + " 个，本组 " + actual + " 题。";
      if (actual < requested) text += " 题量不足时按实际数量进行。";
      info.textContent = text;
      start.disabled = actual === 0;
    }
  }

  function renderQuizHeader() {
    const session = WA.currentQuiz;
    if (!session) return;
    const counter = $("#quizCounter");
    if (counter) counter.textContent = (session.index + 1) + " / " + session.questions.length;
    const bar = $("#quizProgressBar");
    if (bar) bar.style.width = Math.round((session.index / session.questions.length) * 100) + "%";
    const score = $("#quizScore");
    if (score) score.textContent = "答对 " + session.correctCount + " / " + session.answers.length;
  }

  function promptHTML(question) {
    if (question.type === "e2c") {
      return '<div>' +
        '<div class="prompt-term">' + e(question.term) + "</div>" +
        (question.phonetic ? '<div class="prompt-phonetic">' + e(question.phonetic) + "</div>" : "") +
        '<button class="card-speaker" type="button" data-quiz-speak aria-label="朗读单词" title="朗读">' + WA.icon("volume") + "</button>" +
      "</div>";
    }
    if (question.type === "c2e") {
      return '<div class="prompt-meaning">' + WA.promptMeaningHTML(Store.getWord(question.wordId)) + "</div>" +
        '<p class="prompt-hint-text">选择对应的英文单词</p>';
    }
    if (question.type === "spell") {
      return '<div class="prompt-meaning">' + WA.promptMeaningHTML(Store.getWord(question.wordId)) + "</div>" +
        '<p class="prompt-hint-text" id="quizPromptHint">根据释义拼写单词</p>';
    }
    return '<div class="prompt-listen">' +
      '<button class="listen-orb" type="button" data-quiz-speak aria-label="重新播放发音" title="重新播放">' + WA.icon("volume") + "</button>" +
      '<p class="listen-caption">听发音，拼出这个单词</p>' +
      '<p class="prompt-hint-text" id="quizPromptHint"></p>' +
    "</div>";
  }

  function renderQuestion() {
    const session = WA.currentQuiz;
    if (!session) return;
    if (session.index >= session.questions.length) {
      finishQuiz();
      return;
    }
    const question = session.questions[session.index];
    session.current = question;
    session.answered = false;
    session.hintUsed = false;

    $("#quizTypeLabel").textContent = TYPE_LABELS[question.type] || "测验";
    $("#quizPrompt").innerHTML = promptHTML(question);

    const optionsWrap = $("#quizOptions");
    const form = $("#quizTypeForm");
    const feedback = $("#quizFeedback");
    const next = $("#quizNextBtn");
    const hint = $("#quizHintBtn");
    feedback.hidden = true;
    feedback.className = "quiz-feedback";
    next.hidden = true;
    hint.hidden = true;

    if (question.options) {
      optionsWrap.hidden = false;
      form.hidden = true;
      optionsWrap.innerHTML = question.options.map(function (option, index) {
        return '<button class="quiz-option" type="button" data-option-index="' + index + '">' +
          '<span class="option-key">' + (index + 1) + "</span><span>" + e(option) + "</span>" +
        "</button>";
      }).join("");
    } else {
      optionsWrap.hidden = true;
      optionsWrap.innerHTML = "";
      form.hidden = false;
      const input = $("#quizAnswerInput");
      input.value = "";
      input.disabled = false;
      input.className = "";
      input.placeholder = question.type === "listen" ? "输入听到的单词…" : "输入单词…";
      $("#quizSubmitBtn").hidden = false;
      hint.hidden = false;
      setTimeout(function () { input.focus(); }, 60);
    }

    const hintText = $("#quizHint");
    if (hintText) {
      hintText.textContent = question.options
        ? "1–4 选择选项 · Enter 继续 · Esc 退出"
        : "输入后按 Enter 提交 · Esc 退出";
    }

    renderQuizHeader();
    if (question.type === "listen") {
      setTimeout(function () {
        if (WA.currentQuiz && WA.currentQuiz.current === question && !WA.currentQuiz.finished) {
          WA.speak(question.term);
        }
      }, 180);
    }
  }

  function feedbackHTML(question, correct) {
    const full = question.meaning || "暂无释义";
    if (correct) {
      return "<strong>回答正确。</strong> " + e(question.term) + " — " + e(full);
    }
    return "<strong>正确答案：</strong><span class=\"feedback-answer\">" + e(question.correctText) + "</span><br>" +
      e(question.term) + " — " + e(full);
  }

  function recordAnswer(correct) {
    const session = WA.currentQuiz;
    if (!session || session.answered) return;
    const question = session.current;
    if (!question) return;
    session.answered = true;
    session.answers.push({ wordId: question.wordId, type: question.type, correct: correct });

    if (correct) {
      session.correctCount += 1;
    } else if (!session.wrongIds.includes(question.wordId)) {
      session.wrongIds.push(question.wordId);
    }
    Store.quizAnswer(question.wordId, correct, session.sync);

    const feedback = $("#quizFeedback");
    if (feedback) {
      feedback.hidden = false;
      feedback.className = "quiz-feedback " + (correct ? "is-correct" : "is-wrong");
      feedback.innerHTML = feedbackHTML(question, correct);
    }
    const next = $("#quizNextBtn");
    if (next) next.hidden = false;
    const hint = $("#quizHintBtn");
    if (hint) hint.hidden = true;

    const bar = $("#quizProgressBar");
    if (bar) bar.style.width = Math.round(((session.index + 1) / session.questions.length) * 100) + "%";
    const score = $("#quizScore");
    if (score) score.textContent = "答对 " + session.correctCount + " / " + session.answers.length;
    WA.updateChrome();
  }

  function optionText(button) {
    const span = button.querySelector("span:last-child");
    return span ? span.textContent.trim() : button.textContent.trim();
  }

  function answerOption(index) {
    const session = WA.currentQuiz;
    if (!session || session.answered || !session.current || !session.current.options) return;
    const buttons = WA.$$("#quizOptions .quiz-option");
    const picked = buttons[index];
    if (!picked) return;
    const correct = optionText(picked) === session.current.correctText;

    buttons.forEach(function (button, buttonIndex) {
      button.disabled = true;
      if (optionText(button) === session.current.correctText) button.classList.add("is-correct");
      else if (buttonIndex === index) button.classList.add("is-wrong");
      else button.classList.add("is-dim");
    });

    recordAnswer(correct);
  }

  function submitTypedAnswer() {
    const session = WA.currentQuiz;
    if (!session || session.answered || !session.current || session.current.options) return;
    const input = $("#quizAnswerInput");
    const value = input.value.trim();
    if (!value) {
      input.focus();
      return;
    }
    const correct = WA.normalizeAnswer(value) === WA.normalizeAnswer(session.current.correctText);
    input.disabled = true;
    input.classList.add(correct ? "is-correct" : "is-wrong");
    const submit = $("#quizSubmitBtn");
    if (submit) submit.hidden = true;
    recordAnswer(correct);
  }

  function revealHint() {
    const session = WA.currentQuiz;
    if (!session || session.answered || !session.current) return;
    const word = Store.getWord(session.current.wordId);
    if (!word) return;
    const chars = Array.from(word.term);
    const first = chars.length ? chars[0] : "";
    const length = word.term.replace(/\s/g, "").length;
    let hint = $("#quizPromptHint");
    if (!hint) {
      hint = document.createElement("p");
      hint.className = "prompt-hint-text";
      hint.id = "quizPromptHint";
      $("#quizPrompt").appendChild(hint);
    }
    hint.textContent = "首字母 " + first.toUpperCase() + " · 共 " + length + " 个字符";
    const button = $("#quizHintBtn");
    if (button) button.hidden = true;
    session.hintUsed = true;
  }

  function finishQuiz() {
    const session = WA.currentQuiz;
    if (!session) return;
    session.finished = true;
    const play = $("#quizPlay");
    if (play) play.hidden = true;
    const results = $("#quizResults");
    if (!results) return;
    results.hidden = false;

    const bar = $("#quizProgressBar");
    if (bar) bar.style.width = "100%";
    const counter = $("#quizCounter");
    if (counter) counter.textContent = "完成";

    const total = session.questions.length;
    const accuracy = total ? Math.round((session.correctCount / total) * 100) : 0;
    let title = "没关系，多见几次就熟了。";
    if (accuracy >= 60) title = "还不错，再巩固一下。";
    if (accuracy >= 80) title = "记得很牢。";
    if (accuracy === 100) title = "全对，漂亮。";

    const wrongWords = session.wrongIds.map(function (id) { return Store.getWord(id); }).filter(Boolean);
    const wrongHTML = wrongWords.length
      ? '<div class="result-wrong">' +
          '<h3>需要再看看</h3>' +
          wrongWords.map(function (word) {
            return '<div class="result-wrong-item"><span class="result-wrong-term">' + e(word.term) + "</span>" +
              '<span class="result-wrong-def">' + e(WA.fullMeaning(word) || "暂无释义") + "</span></div>";
          }).join("") +
        "</div>"
      : "";

    results.innerHTML =
      '<div class="results-card">' +
        '<div class="result-ring" style="--progress:' + accuracy + '"><div class="result-ring-center">' + accuracy + "%</div></div>" +
        "<h2>" + e(title) + "</h2>" +
        '<p class="result-sub">答对 ' + session.correctCount + " / " + total + " 题 · 用时 " +
          WA.formatDuration(Date.now() - session.startedAt) + "</p>" +
        '<div class="result-stats">' +
          '<div class="result-stat"><strong>' + session.correctCount + "</strong><span>答对</span></div>" +
          '<div class="result-stat"><strong>' + (total - session.correctCount) + "</strong><span>答错</span></div>" +
          '<div class="result-stat"><strong>' + accuracy + '%</strong><span>正确率</span></div>' +
        "</div>" +
        wrongHTML +
        '<div class="result-actions">' +
          (wrongWords.length ? '<button class="btn" type="button" data-quiz-action="retry">' + WA.icon("rotate") + " 重练错题</button>" : "") +
          '<button class="btn btn-primary" type="button" data-quiz-action="again">' + WA.icon("shuffle") + " 再来一组</button>" +
          '<button class="btn btn-ghost" type="button" data-quiz-action="done">完成</button>' +
        "</div>" +
      "</div>";

    WA.updateChrome();
  }

  function beginSession(questions, mode, sync, scope) {
    WA.currentQuiz = {
      questions: questions,
      index: 0,
      mode: mode,
      sync: sync,
      scope: scope,
      answers: [],
      correctCount: 0,
      wrongIds: [],
      startedAt: Date.now(),
      answered: false,
      current: null,
      finished: false,
      returnView: WA.currentView
    };
    $("#quizSetup").hidden = true;
    $("#quizResults").hidden = true;
    $("#quizResults").innerHTML = "";
    $("#quizPlay").hidden = false;
    renderQuestion();
  }

  function startQuiz() {
    const modeInput = document.querySelector('input[name="quizMode"]:checked');
    const mode = modeInput ? modeInput.value : "mixed";
    const scope = $("#quizScope").value;
    const countOption = $("#quizCount").value;
    const sync = $("#quizSync").checked;
    const pool = scopeWords(scope);
    const questions = buildQuizQuestions(mode, pool, countOption);
    if (!questions.length) {
      WA.toast("没有生成题目，检查一下单词释义和题量设置", "error");
      return;
    }
    beginSession(questions, mode, sync, scope);
  }

  function closeQuizOverlay() {
    const overlay = $("#quizOverlay");
    if (overlay) overlay.hidden = true;
    WA.lockBody(false);
    WA.currentQuiz = null;
    const focusTarget = lastFocus;
    lastFocus = null;
    if (focusTarget && typeof focusTarget.focus === "function") {
      setTimeout(function () {
        if (document.contains(focusTarget)) focusTarget.focus();
      }, 30);
    }
    WA.renderAll();
  }

  WA.openQuiz = function () {
    if (!Store.getState().words.length) {
      WA.toast("先添加几个单词，再来做测验吧");
      return;
    }
    const overlay = $("#quizOverlay");
    if (!overlay) return;
    WA.currentQuiz = null;
    $("#quizSetup").hidden = false;
    $("#quizPlay").hidden = true;
    $("#quizResults").hidden = true;
    $("#quizResults").innerHTML = "";
    const mixed = document.querySelector('input[name="quizMode"][value="mixed"]');
    if (mixed) mixed.checked = true;
    $("#quizScope").value = "all";
    $("#quizCount").value = "10";
    $("#quizSync").checked = Store.getSettings().quizSync;
    const counter = $("#quizCounter");
    if (counter) counter.textContent = "测验";
    const bar = $("#quizProgressBar");
    if (bar) bar.style.width = "0%";
    lastFocus = document.activeElement;
    overlay.hidden = false;
    WA.lockBody(true);
    updateQuizSetup();
  };

  WA.exitQuiz = async function (force) {
    const session = WA.currentQuiz;
    if (!session || force || !session.answers.length) {
      closeQuizOverlay();
      return;
    }
    const ok = await WA.confirmAction({
      title: "退出测验",
      message: "已作答的题目已经保存到学习记录，未作答的题目会直接结束。",
      okText: "退出"
    });
    if (ok) closeQuizOverlay();
  };

  WA.quizAction = function (action) {
    const session = WA.currentQuiz;
    if (action === "done") {
      closeQuizOverlay();
      WA.navigate("dashboard");
      return;
    }
    if (!session) return;
    if (action === "again") {
      const play = $("#quizPlay");
      const results = $("#quizResults");
      if (play) play.hidden = true;
      if (results) results.hidden = true;
      $("#quizSetup").hidden = false;
      const bar = $("#quizProgressBar");
      if (bar) bar.style.width = "0%";
      const counter = $("#quizCounter");
      if (counter) counter.textContent = "测验";
      WA.currentQuiz = null;
      updateQuizSetup();
      return;
    }
    if (action === "retry") {
      const words = session.wrongIds.map(function (id) { return Store.getWord(id); }).filter(Boolean);
      if (!words.length) {
        WA.toast("这次没有错题");
        return;
      }
      const questions = buildQuizQuestions(session.mode, words, "all");
      if (!questions.length) {
        WA.toast("没有生成错题练习，换一种模式试试", "error");
        return;
      }
      beginSession(questions, session.mode, session.sync, "retry");
    }
  };

  WA.answerQuizOption = answerOption;

  WA.quizKeyboard = function (event) {
    const session = WA.currentQuiz;
    const overlay = $("#quizOverlay");
    if (!overlay || overlay.hidden) return;
    if (document.querySelector("dialog[open]")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      WA.exitQuiz();
      return;
    }
    if (!session || session.finished) return;

    const target = event.target;
    if (WA.isTyping(target)) {
      if (event.key === "Enter" && session.answered) {
        event.preventDefault();
        session.index += 1;
        renderQuestion();
      }
      return;
    }
    if (session.answered) {
      if (event.key === "Enter") {
        event.preventDefault();
        session.index += 1;
        renderQuestion();
      }
      return;
    }
    if (session.current && session.current.options && /^[1-4]$/.test(event.key)) {
      event.preventDefault();
      answerOption(Number(event.key) - 1);
      return;
    }
    if (event.key === "Enter" && session.current && !session.current.options) {
      event.preventDefault();
      const input = $("#quizAnswerInput");
      if (input) input.focus();
    }
  };

  function goNext() {
    const session = WA.currentQuiz;
    if (!session) return;
    if (!session.answered) {
      if (session.current && !session.current.options) submitTypedAnswer();
      else WA.toast("先选择一个答案");
      return;
    }
    session.index += 1;
    renderQuestion();
  }

  WA.bindQuiz = function () {
    const exit = $("#quizExitBtn");
    if (exit) exit.addEventListener("click", function () { WA.exitQuiz(); });

    const start = $("#quizStartBtn");
    if (start) start.addEventListener("click", startQuiz);

    $("#quizModes").addEventListener("change", updateQuizSetup);
    $("#quizScope").addEventListener("change", updateQuizSetup);
    $("#quizCount").addEventListener("change", updateQuizSetup);

    const options = $("#quizOptions");
    if (options) {
      options.addEventListener("click", function (event) {
        const button = event.target.closest("[data-option-index]");
        if (button) answerOption(Number(button.getAttribute("data-option-index")));
      });
    }

    const form = $("#quizTypeForm");
    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        submitTypedAnswer();
      });
    }

    const next = $("#quizNextBtn");
    if (next) next.addEventListener("click", goNext);
    const hint = $("#quizHintBtn");
    if (hint) hint.addEventListener("click", revealHint);

    const prompt = $("#quizPrompt");
    if (prompt) {
      prompt.addEventListener("click", function (event) {
        if (!event.target.closest("[data-quiz-speak]")) return;
        const session = WA.currentQuiz;
        if (session && session.current) WA.speak(session.current.term);
      });
    }

    const results = $("#quizResults");
    if (results) {
      results.addEventListener("click", function (event) {
        const button = event.target.closest("[data-quiz-action]");
        if (button) WA.quizAction(button.getAttribute("data-quiz-action"));
      });
    }

    document.addEventListener("keydown", WA.quizKeyboard);
  };
})(window.WA);
