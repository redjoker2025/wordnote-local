/* =========================================================
   拾词 · 单词库 / 单词编辑 / 导入导出
   ========================================================= */
(function (WA) {
  "use strict";

  const $ = WA.$;
  const $$ = WA.$$;
  const e = WA.e;

  WA.libState = WA.libState || {
    search: "",
    filter: "all",
    tag: "",
    sort: "recent",
    manage: false,
    selected: new Set(),
    limit: 50
  };
  WA.editingWordId = null;
  WA.pendingImport = null;

  const FILTER_LABELS = {
    all: "全部",
    due: "待复习",
    new: "新词",
    learning: "学习中",
    mastered: "已掌握",
    starred: "重点",
    wrong: "易错"
  };

  const STATUS_LABELS = {
    new: "新词",
    learning: "学习中",
    mastered: "已掌握"
  };

  /* =========================================================
     单词编辑
     ========================================================= */

  function addMeaningRow(data) {
    const row = document.createElement("div");
    row.className = "repeat-row meaning-row";
    row.innerHTML =
      '<input class="pos-input" type="text" maxlength="16" placeholder="词性" aria-label="词性">' +
      '<input class="meaning-input" type="text" placeholder="释义，例如：短暂的；转瞬即逝的" aria-label="释义">' +
      '<button class="remove-row" type="button" aria-label="删除这条释义">' + WA.icon("x") + "</button>";
    row.querySelector(".pos-input").value = data && data.pos ? data.pos : "";
    row.querySelector(".meaning-input").value = data && data.def ? data.def : "";
    return row;
  }

  function addExampleRow(data) {
    const row = document.createElement("div");
    row.className = "example-row";
    row.innerHTML =
      '<input class="example-text" type="text" placeholder="例句（英文）" aria-label="例句">' +
      '<input class="example-zh" type="text" placeholder="例句翻译（可选）" aria-label="例句翻译">' +
      '<button class="remove-row" type="button" aria-label="删除这条例句">' + WA.icon("x") + "</button>";
    row.querySelector(".example-text").value = data && data.text ? data.text : "";
    row.querySelector(".example-zh").value = data && data.translation ? data.translation : "";
    return row;
  }

  function renderWordMeta(word) {
    const meta = $("#wordMeta");
    if (!meta || !word) {
      if (meta) meta.hidden = true;
      return;
    }
    const status = Store.getStatus(word);
    meta.hidden = false;
    meta.innerHTML =
      '<span class="word-status status-' + status + '">' + (STATUS_LABELS[status] || "新词") + "</span>" +
      "<span>下次复习：" + e(WA.formatDue(word)) + "</span>" +
      "<span>正确 " + word.stats.correct + " · 错误 " + word.stats.wrong + "</span>" +
      '<span class="meta-actions">' +
        '<button class="btn btn-xs" type="button" data-word-action="master">标记掌握</button>' +
        '<button class="btn btn-xs" type="button" data-word-action="reset">重置进度</button>' +
      "</span>";
  }

  WA.openWordDialog = function (wordId) {
    const dialog = $("#wordDialog");
    const form = $("#wordForm");
    if (!dialog || !form) return;

    const word = wordId ? Store.getWord(wordId) : null;
    if (wordId && !word) {
      WA.toast("这个单词已经不存在了", "error");
      return;
    }

    WA.editingWordId = word ? word.id : null;
    form.reset();

    const meaningRows = $("#meaningRows");
    const exampleRows = $("#exampleRows");
    meaningRows.replaceChildren();
    exampleRows.replaceChildren();

    $("#wordDialogTitle").textContent = word ? "编辑单词" : "添加单词";
    $("#wordDialogEyebrow").textContent = word ? "EDIT WORD" : "NEW WORD";
    $("#deleteWordBtn").hidden = !word;
    $("#wordMeta").hidden = true;

    if (word) {
      $("#wordTerm").value = word.term;
      $("#wordPhonetic").value = word.phonetic || "";
      $("#wordTags").value = word.tags.join(", ");
      $("#wordNote").value = word.note || "";
      $("#wordStarred").checked = Boolean(word.starred);
      (word.meanings.length ? word.meanings : [{ pos: "", def: "" }]).forEach(function (meaning) {
        meaningRows.appendChild(addMeaningRow(meaning));
      });
      word.examples.forEach(function (example) {
        exampleRows.appendChild(addExampleRow(example));
      });
      renderWordMeta(word);
    } else {
      meaningRows.appendChild(addMeaningRow());
    }

    WA.openDialog(dialog);
    setTimeout(function () {
      $("#wordTerm").focus();
    }, 40);
  };

  function collectWordForm() {
    const term = $("#wordTerm").value.trim();
    if (!term) {
      WA.toast("请填写单词或短语", "error");
      $("#wordTerm").focus();
      return null;
    }

    const meanings = $$(".meaning-row", $("#meaningRows")).map(function (row) {
      return {
        pos: row.querySelector(".pos-input").value.trim(),
        def: row.querySelector(".meaning-input").value.trim()
      };
    }).filter(function (m) { return m.def; });

    if (!meanings.length) {
      WA.toast("请至少填写一条释义", "error");
      const first = $("#meaningRows .meaning-input");
      if (first) first.focus();
      return null;
    }

    const examples = $$(".example-row", $("#exampleRows")).map(function (row) {
      return {
        text: row.querySelector(".example-text").value.trim(),
        translation: row.querySelector(".example-zh").value.trim()
      };
    }).filter(function (ex) { return ex.text || ex.translation; });

    const duplicate = Store.findDuplicate(term, WA.editingWordId);
    if (duplicate) {
      WA.toast("词库中已有「" + duplicate.term + "」", "error");
      $("#wordTerm").focus();
      return null;
    }

    const tags = Array.from(new Set($("#wordTags").value.split(/[,，、;；/]+/).map(function (tag) {
      return tag.trim();
    }).filter(Boolean)));

    return {
      term: term,
      phonetic: $("#wordPhonetic").value.trim(),
      meanings: meanings,
      examples: examples,
      tags: tags,
      note: $("#wordNote").value.trim(),
      starred: $("#wordStarred").checked
    };
  }

  async function deleteEditingWord() {
    const word = WA.editingWordId ? Store.getWord(WA.editingWordId) : null;
    if (!word) return;
    const ok = await WA.confirmAction({
      title: "删除单词",
      message: "确定删除「" + word.term + "」吗？学习记录也会一并从单词库中移除。",
      okText: "删除",
      danger: true
    });
    if (!ok) return;
    Store.deleteWord(word.id);
    WA.libState.selected.delete(word.id);
    const dialog = $("#wordDialog");
    if (dialog && dialog.open) dialog.close();
    WA.renderAll();
    WA.toast("已删除「" + word.term + "」");
  }

  function bindWordForm() {
    $("#addMeaningBtn").addEventListener("click", function () {
      const row = addMeaningRow();
      $("#meaningRows").appendChild(row);
      row.querySelector(".meaning-input").focus();
    });

    $("#addExampleBtn").addEventListener("click", function () {
      const row = addExampleRow();
      $("#exampleRows").appendChild(row);
      row.querySelector(".example-text").focus();
    });

    $("#meaningRows").addEventListener("click", function (event) {
      const button = event.target.closest(".remove-row");
      if (!button) return;
      const rows = $$(".meaning-row", $("#meaningRows"));
      if (rows.length <= 1) {
        rows[0].querySelector(".meaning-input").value = "";
        rows[0].querySelector(".pos-input").value = "";
        return;
      }
      button.closest(".meaning-row").remove();
    });

    $("#exampleRows").addEventListener("click", function (event) {
      const button = event.target.closest(".remove-row");
      if (button) button.closest(".example-row").remove();
    });

    $("#wordForm").addEventListener("submit", function (event) {
      event.preventDefault();
      const payload = collectWordForm();
      if (!payload) return;

      if (WA.editingWordId) {
        const updated = Store.updateWord(WA.editingWordId, payload);
        if (!updated) {
          WA.toast("保存失败，请重试", "error");
          return;
        }
        WA.toast("已保存「" + updated.term + "」", "success");
      } else {
        const created = Store.addWord(payload);
        if (!created) {
          WA.toast("添加失败，请重试", "error");
          return;
        }
        WA.toast("已添加「" + created.term + "」", "success");
      }
      const dialog = $("#wordDialog");
      if (dialog && dialog.open) dialog.close();
      WA.renderAll();
    });

    $("#deleteWordBtn").addEventListener("click", function () {
      deleteEditingWord();
    });

    $("#wordMeta").addEventListener("click", async function (event) {
      const button = event.target.closest("[data-word-action]");
      if (!button || !WA.editingWordId) return;
      const action = button.getAttribute("data-word-action");
      if (action === "master") {
        const word = Store.markMastered(WA.editingWordId);
        if (word) {
          renderWordMeta(word);
          WA.renderAll();
          WA.toast("已标记为掌握");
        }
      } else if (action === "reset") {
        const ok = await WA.confirmAction({
          title: "重置学习进度",
          message: "这个单词会重新变成新词，复习次数和错误记录都会清空。",
          okText: "重置"
        });
        if (!ok) return;
        const word = Store.resetProgress(WA.editingWordId);
        if (word) {
          renderWordMeta(word);
          WA.renderAll();
          WA.toast("学习进度已重置");
        }
      }
    });

    $("#wordDialog").addEventListener("close", function () {
      WA.editingWordId = null;
    });
  }

  WA.toggleWordStar = function (id) {
    const word = Store.toggleStar(id);
    if (!word) return;
    WA.renderAll();
    WA.toast(word.starred ? "已标为重点" : "已取消重点");
  };

  WA.deleteWordWithConfirm = async function (id) {
    const word = Store.getWord(id);
    if (!word) return;
    const ok = await WA.confirmAction({
      title: "删除单词",
      message: "确定删除「" + word.term + "」吗？学习记录也会一并移除。",
      okText: "删除",
      danger: true
    });
    if (!ok) return;
    Store.deleteWord(id);
    WA.libState.selected.delete(id);
    WA.renderAll();
    WA.toast("已删除「" + word.term + "」");
  };

  /* =========================================================
     单词库列表
     ========================================================= */

  function matchesFilter(word, filter) {
    if (filter === "due") return Store.isDue(word);
    if (filter === "new") return Store.isNew(word);
    if (filter === "learning") return Store.getStatus(word) === "learning";
    if (filter === "mastered") return Store.getStatus(word) === "mastered";
    if (filter === "starred") return Boolean(word.starred);
    if (filter === "wrong") return word.stats.wrong > 0;
    return true;
  }

  function getFilteredWords() {
    const search = WA.libState.search.trim().toLowerCase();
    let words = Store.getState().words.slice();

    if (WA.libState.tag) {
      words = words.filter(function (word) { return word.tags.includes(WA.libState.tag); });
    }
    words = words.filter(function (word) { return matchesFilter(word, WA.libState.filter); });

    if (search) {
      words = words.filter(function (word) {
        const haystack = [
          word.term,
          word.phonetic,
          word.note,
          word.tags.join(" ")
        ].concat(
          word.meanings.map(function (m) { return m.pos + " " + m.def; }),
          word.examples.map(function (ex) { return ex.text + " " + ex.translation; })
        ).join(" ").toLowerCase();
        return haystack.includes(search);
      });
    }

    const sort = WA.libState.sort;
    words.sort(function (a, b) {
      if (sort === "alpha") return a.term.localeCompare(b.term, "en");
      if (sort === "wrong") return b.stats.wrong - a.stats.wrong || Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      if (sort === "due") {
        const av = Store.isNew(a) || !a.srs.dueAt ? Number.MAX_SAFE_INTEGER : a.srs.dueAt;
        const bv = Store.isNew(b) || !b.srs.dueAt ? Number.MAX_SAFE_INTEGER : b.srs.dueAt;
        return av - bv;
      }
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });

    return words;
  }

  function updateFilterChips(counts) {
    $$("#filterChips .chip").forEach(function (chip) {
      const filter = chip.getAttribute("data-filter");
      chip.classList.toggle("is-active", filter === WA.libState.filter);
      chip.innerHTML = FILTER_LABELS[filter] + " <span>" + (counts[filter] || 0) + "</span>";
    });
  }

  function rebuildTagOptions() {
    const select = $("#tagFilter");
    if (!select) return;
    const tags = Store.getAllTags();
    if (WA.libState.tag && !tags.some(function (item) { return item.tag === WA.libState.tag; })) {
      WA.libState.tag = "";
    }
    const frag = document.createDocumentFragment();
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "全部标签";
    frag.appendChild(all);
    tags.forEach(function (item) {
      const option = document.createElement("option");
      option.value = item.tag;
      option.textContent = item.tag + " (" + item.count + ")";
      frag.appendChild(option);
    });
    select.replaceChildren(frag);
    select.value = WA.libState.tag;
  }

  function tagsHTML(word) {
    if (!word.tags.length) return "";
    const shown = word.tags.slice(0, 4);
    const rest = word.tags.length - shown.length;
    return '<span class="word-tags">' + shown.map(function (tag) {
      return '<span class="mini-tag">' + e(tag) + "</span>";
    }).join("") + (rest > 0 ? '<span class="mini-tag">+' + rest + "</span>" : "") + "</span>";
  }

  function wordRowHTML(word) {
    const status = Store.getStatus(word);
    const isDue = Store.isDue(word);
    const selected = WA.libState.selected.has(word.id);
    return '<article class="word-row' + (selected ? " is-selected" : "") + '" data-word-id="' + e(word.id) + '">' +
      '<input class="word-check" type="checkbox" data-select="' + e(word.id) + '"' + (selected ? " checked" : "") + ' aria-label="选择 ' + e(word.term) + '">' +
      '<button class="word-row-main" type="button" data-edit="' + e(word.id) + '">' +
        '<span class="word-term-line">' +
          '<span class="word-term">' + e(word.term) + "</span>" +
          (word.starred ? '<span class="word-star">' + WA.icon("star") + "</span>" : "") +
          (word.phonetic ? '<span class="word-phonetic">' + e(word.phonetic) + "</span>" : "") +
        "</span>" +
        '<span class="word-meanings">' + WA.meaningHTML(word) + "</span>" +
        tagsHTML(word) +
      "</button>" +
      '<div class="word-side">' +
        '<span class="word-status status-' + status + '">' + STATUS_LABELS[status] + "</span>" +
        '<span class="word-due' + (isDue ? " is-due" : "") + '">' + WA.icon("clock") + " " + e(WA.formatDue(word)) + "</span>" +
        '<div class="word-actions">' +
          '<button class="icon-btn" type="button" data-speak="' + e(word.id) + '" title="朗读" aria-label="朗读 ' + e(word.term) + '">' + WA.icon("volume") + "</button>" +
          '<button class="icon-btn' + (word.starred ? " is-starred" : "") + '" type="button" data-star="' + e(word.id) + '" title="重点" aria-label="切换重点">' + WA.icon("star") + "</button>" +
          '<button class="icon-btn" type="button" data-edit="' + e(word.id) + '" title="编辑" aria-label="编辑 ' + e(word.term) + '">' + WA.icon("edit") + "</button>" +
          '<button class="icon-btn" type="button" data-delete="' + e(word.id) + '" title="删除" aria-label="删除 ' + e(word.term) + '">' + WA.icon("trash") + "</button>" +
        "</div>" +
      "</div>" +
    "</article>";
  }

  function emptyLibraryHTML(hasWords) {
    if (!hasWords) {
      return '<div class="empty-state">' +
        '<div class="empty-ico">' + WA.icon("book") + "</div>" +
        "<h3>还没有单词</h3>" +
        "<p>把不会的单词收进来。可以手动添加，也可以导入 CSV、TXT 或之前的 JSON 备份。</p>" +
        '<div class="empty-actions">' +
          '<button class="btn btn-primary" type="button" data-action="add">' + WA.icon("plus") + " 添加单词</button>" +
          '<button class="btn" type="button" data-action="sample">载入示例词库</button>' +
          '<button class="btn btn-ghost" type="button" data-action="import">' + WA.icon("upload") + " 导入文件</button>" +
        "</div>" +
      "</div>";
    }
    return '<div class="empty-state">' +
      '<div class="empty-ico">' + WA.icon("search") + "</div>" +
      "<h3>没有找到匹配的单词</h3>" +
      "<p>换一个关键词、标签或筛选条件试试。</p>" +
      '<div class="empty-actions">' +
        '<button class="btn" type="button" data-action="clear-filters">清除筛选</button>' +
        '<button class="btn btn-primary" type="button" data-action="add">' + WA.icon("plus") + " 添加单词</button>" +
      "</div>" +
    "</div>";
  }

  function syncManageUi(filtered) {
    const selected = WA.libState.selected;
    const allVisibleSelected = filtered.length > 0 && filtered.every(function (word) { return selected.has(word.id); });
    const someVisibleSelected = filtered.some(function (word) { return selected.has(word.id); });
    const selectAll = $("#selectAll");
    if (selectAll) {
      selectAll.checked = allVisibleSelected;
      selectAll.indeterminate = !allVisibleSelected && someVisibleSelected;
    }
    const count = $("#selectedCount");
    if (count) count.textContent = "已选 " + selected.size + " 个";
    ["#bulkTagBtn", "#bulkMasterBtn", "#bulkResetBtn", "#bulkDeleteBtn"].forEach(function (selector) {
      const button = $(selector);
      if (button) button.disabled = selected.size === 0;
    });
  }

  WA.renderLibraryList = function () {
    const list = $("#wordList");
    if (!list) return;
    const allWords = Store.getState().words;
    const counts = Store.getCounts();
    const filtered = getFilteredWords();
    const lib = WA.libState;

    const validIds = new Set(allWords.map(function (word) { return word.id; }));
    lib.selected.forEach(function (id) {
      if (!validIds.has(id)) lib.selected.delete(id);
    });

    updateFilterChips(counts);

    const countEl = $("#libraryCount");
    if (countEl) {
      const active = Boolean(lib.search.trim() || lib.tag || lib.filter !== "all");
      countEl.textContent = active
        ? "筛选出 " + filtered.length + " 个 / 共 " + allWords.length + " 个单词"
        : "共 " + allWords.length + " 个单词";
    }

    const manageBtn = $("#manageBtn");
    if (manageBtn) {
      manageBtn.innerHTML = WA.icon("check") + " " + (lib.manage ? "完成" : "管理");
      manageBtn.classList.toggle("btn-primary", lib.manage);
    }
    const manageBar = $("#manageBar");
    if (manageBar) manageBar.hidden = !lib.manage || allWords.length === 0;
    list.classList.toggle("manage-mode", lib.manage);

    if (!filtered.length) {
      list.innerHTML = emptyLibraryHTML(allWords.length > 0);
    } else {
      const shown = filtered.slice(0, lib.limit);
      list.innerHTML = shown.map(wordRowHTML).join("");
    }

    const more = $("#libraryMore");
    if (more) {
      more.hidden = filtered.length <= lib.limit;
      const shownInfo = $("#libraryShown");
      if (shownInfo) shownInfo.textContent = "已显示 " + Math.min(filtered.length, lib.limit) + " / " + filtered.length;
    }

    syncManageUi(filtered);
  };

  WA.renderLibrary = function () {
    rebuildTagOptions();
    const search = $("#librarySearch");
    if (search && search.value !== WA.libState.search) search.value = WA.libState.search;
    const sort = $("#sortSelect");
    if (sort) sort.value = WA.libState.sort;
    const tag = $("#tagFilter");
    if (tag) tag.value = WA.libState.tag;
    WA.renderLibraryList();
  };

  function toggleManage(force) {
    WA.libState.manage = typeof force === "boolean" ? force : !WA.libState.manage;
    if (!WA.libState.manage) WA.libState.selected.clear();
    WA.renderLibraryList();
  }

  async function bulkTag() {
    if (!WA.libState.selected.size) { WA.toast("请先选择单词", "error"); return; }
    const tag = await WA.askText({
      title: "批量添加标签",
      label: "标签名称",
      placeholder: "例如：高频、雅思",
      okText: "添加"
    });
    if (!tag) return;
    const changed = Store.bulkAddTag(Array.from(WA.libState.selected), tag);
    WA.libState.selected.clear();
    WA.renderAll();
    WA.toast(changed ? "已为 " + changed + " 个单词添加标签" : "这些单词已经有该标签了");
  }

  async function bulkMaster() {
    if (!WA.libState.selected.size) { WA.toast("请先选择单词", "error"); return; }
    const count = WA.libState.selected.size;
    const ok = await WA.confirmAction({
      title: "标记为掌握",
      message: "将 " + count + " 个单词标记为已掌握，并把下次复习时间设为 30 天后。",
      okText: "标记掌握"
    });
    if (!ok) return;
    const changed = Store.bulkMarkMastered(Array.from(WA.libState.selected));
    WA.libState.selected.clear();
    WA.renderAll();
    WA.toast("已标记 " + changed + " 个单词");
  }

  async function bulkReset() {
    if (!WA.libState.selected.size) { WA.toast("请先选择单词", "error"); return; }
    const count = WA.libState.selected.size;
    const ok = await WA.confirmAction({
      title: "重置学习进度",
      message: "将 " + count + " 个单词重置为新词，复习记录会被清空。",
      okText: "重置"
    });
    if (!ok) return;
    const changed = Store.bulkReset(Array.from(WA.libState.selected));
    WA.libState.selected.clear();
    WA.renderAll();
    WA.toast("已重置 " + changed + " 个单词");
  }

  async function bulkDelete() {
    if (!WA.libState.selected.size) { WA.toast("请先选择单词", "error"); return; }
    const count = WA.libState.selected.size;
    const ok = await WA.confirmAction({
      title: "批量删除",
      message: "确定删除选中的 " + count + " 个单词吗？这个操作不能撤销。",
      okText: "删除",
      danger: true
    });
    if (!ok) return;
    const changed = Store.deleteWords(Array.from(WA.libState.selected));
    WA.libState.selected.clear();
    WA.renderAll();
    WA.toast("已删除 " + changed + " 个单词");
  }

  function bindLibrary() {
    $("#librarySearch").addEventListener("input", function (event) {
      WA.libState.search = event.target.value;
      WA.libState.limit = 50;
      WA.renderLibraryList();
    });

    $("#tagFilter").addEventListener("change", function (event) {
      WA.libState.tag = event.target.value;
      WA.libState.limit = 50;
      WA.renderLibraryList();
    });

    $("#sortSelect").addEventListener("change", function (event) {
      WA.libState.sort = event.target.value;
      WA.renderLibraryList();
    });

    $("#filterChips").addEventListener("click", function (event) {
      const chip = event.target.closest("[data-filter]");
      if (!chip) return;
      WA.libState.filter = chip.getAttribute("data-filter");
      WA.libState.limit = 50;
      WA.renderLibraryList();
    });

    $("#manageBtn").addEventListener("click", function () {
      toggleManage();
    });

    $("#manageDoneBtn").addEventListener("click", function () {
      toggleManage(false);
    });

    $("#selectAll").addEventListener("change", function (event) {
      const filtered = getFilteredWords();
      if (event.target.checked) {
        filtered.forEach(function (word) { WA.libState.selected.add(word.id); });
      } else {
        filtered.forEach(function (word) { WA.libState.selected.delete(word.id); });
      }
      WA.renderLibraryList();
    });

    $("#wordList").addEventListener("change", function (event) {
      const checkbox = event.target.closest(".word-check");
      if (!checkbox) return;
      const id = checkbox.getAttribute("data-select");
      if (checkbox.checked) WA.libState.selected.add(id);
      else WA.libState.selected.delete(id);
      const row = checkbox.closest(".word-row");
      if (row) row.classList.toggle("is-selected", checkbox.checked);
      syncManageUi(getFilteredWords());
    });

    $("#bulkTagBtn").addEventListener("click", bulkTag);
    $("#bulkMasterBtn").addEventListener("click", bulkMaster);
    $("#bulkResetBtn").addEventListener("click", bulkReset);
    $("#bulkDeleteBtn").addEventListener("click", bulkDelete);

    $("#loadMoreBtn").addEventListener("click", function () {
      WA.libState.limit += 50;
      WA.renderLibraryList();
    });

    bindWordForm();
    bindImportExport();
  }

  /* =========================================================
     导入
     ========================================================= */

  function parseDelimited(text, delimiter) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            quoted = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === delimiter) {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (ch !== "\r") {
        field += ch;
      }
    }
    if (field !== "" || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows
      .map(function (cells) { return cells.map(function (cell) { return cell.trim(); }); })
      .filter(function (cells) { return cells.some(function (cell) { return cell !== ""; }); });
  }

  function detectDelimiter(text) {
    const line = (text.split(/\r?\n/).find(function (item) { return item.trim(); }) || "");
    const count = function (ch) { return (line.match(new RegExp("\\" + ch, "g")) || []).length; };
    const tabs = count("\t");
    const commas = count(",");
    const semicolons = count(";");
    if (tabs > 0 && tabs >= commas) return "\t";
    if (commas > 0) return ",";
    if (semicolons > 0) return ";";
    return "\t";
  }

  const HEADER_ALIASES = {
    term: ["单词", "word", "term", "英文", "词汇", "phrase", "spelling", "headword"],
    phonetic: ["音标", "phonetic", "ipa", "pronunciation"],
    pos: ["词性", "pos", "partofspeech"],
    meaning: ["释义", "meaning", "definition", "def", "中文", "意思", "解释", "翻译"],
    example: ["例句", "example", "sentence"],
    exampleTranslation: ["例句翻译", "例句中文", "exampletranslation", "sentencetranslation"],
    tags: ["标签", "tags", "tag", "分类", "类别"],
    note: ["备注", "笔记", "note", "notes", "memo", "comment"]
  };

  function normalizeHeader(value) {
    return String(value == null ? "" : value).replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s_\-]+/g, "");
  }

  function getCSVHeaderMap(row) {
    const normalized = row.map(normalizeHeader);
    const map = {};
    let known = 0;
    normalized.forEach(function (header, index) {
      if (!header) return;
      let matched = false;
      Object.keys(HEADER_ALIASES).forEach(function (field) {
        if (map[field] != null) return;
        if (HEADER_ALIASES[field].includes(header)) {
          map[field] = index;
          known += 1;
          matched = true;
        }
      });
      if (!matched && header === "translation") {
        if (normalized.includes("example") || normalized.includes("例句")) map.exampleTranslation = index;
        else map.meaning = index;
        known += 1;
        matched = true;
      }
    });
    if (map.term == null || known === 0) return null;
    return map;
  }

  function splitList(value) {
    return String(value || "").split(/\s*\|\s*|\r?\n/).map(function (item) { return item.trim(); }).filter(Boolean);
  }

  function rowToEntry(row, map) {
    const get = function (field) {
      const index = map[field];
      return index == null ? "" : String(row[index] == null ? "" : row[index]).trim();
    };
    const term = get("term");
    if (!term) return null;
    const def = get("meaning");
    const pos = get("pos");
    const entry = {
      term: term,
      phonetic: get("phonetic"),
      meanings: (def || pos) ? [{ pos: pos, def: def }] : [],
      tags: get("tags").split(/[,，、;；/]+/).map(function (tag) { return tag.trim(); }).filter(Boolean),
      note: get("note")
    };
    const examples = splitList(get("example"));
    const translations = splitList(get("exampleTranslation"));
    if (examples.length || translations.length) {
      const count = Math.max(examples.length, translations.length);
      entry.examples = [];
      for (let i = 0; i < count; i += 1) {
        entry.examples.push({ text: examples[i] || "", translation: translations[i] || "" });
      }
    }
    return entry;
  }

  WA.parseCSVEntries = function (text) {
    const clean = String(text || "").replace(/^\uFEFF/, "");
    const delimiter = detectDelimiter(clean);
    const rows = parseDelimited(clean, delimiter);
    if (!rows.length) return [];
    const headerMap = getCSVHeaderMap(rows[0]);
    const map = headerMap || {
      term: 0,
      meaning: 1,
      phonetic: 2,
      example: 3,
      exampleTranslation: 4,
      tags: 5,
      note: 6
    };
    const dataRows = headerMap ? rows.slice(1) : rows;
    return dataRows.map(function (row) { return rowToEntry(row, map); }).filter(Boolean);
  };

  WA.parseTXTEntries = function (text) {
    const entries = [];
    String(text || "").split(/\r?\n/).forEach(function (rawLine) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) return;
      let term = "";
      let meaning = "";
      let example = "";
      let translation = "";
      if (line.includes("\t")) {
        const parts = line.split("\t").map(function (part) { return part.trim(); });
        term = parts[0] || "";
        meaning = parts[1] || "";
        example = parts[2] || "";
        translation = parts[3] || "";
      } else {
        const dash = line.match(/^(.+?)\s+[-—–]\s+(.+)$/);
        if (dash) {
          term = dash[1].trim();
          meaning = dash[2].trim();
        } else {
          const commaIndex = line.indexOf(",");
          if (commaIndex > 0) {
            term = line.slice(0, commaIndex).trim();
            meaning = line.slice(commaIndex + 1).trim();
          } else {
            term = line;
          }
        }
      }
      if (!term) return;
      entries.push({
        term: term,
        phonetic: "",
        meanings: meaning ? [{ pos: "", def: meaning }] : [],
        examples: (example || translation) ? [{ text: example, translation: translation }] : [],
        tags: [],
        note: ""
      });
    });
    return entries;
  };

  function countImportable(entries) {
    return (entries || []).filter(function (entry) {
      return entry && typeof entry === "object" && (entry.term || entry.word);
    }).length;
  }

  WA.handleImportFile = async function (file) {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      WA.toast("文件过大，建议拆分后再导入", "error");
      return;
    }
    try {
      const text = await file.text();
      const trimmed = text.trim();
      if (!trimmed) {
        WA.toast("文件内容为空", "error");
        return;
      }
      const lower = file.name.toLowerCase();
      let parsed = null;

      const asJSON = function () {
        try { return JSON.parse(trimmed); } catch (err) { return null; }
      };

      if (lower.endsWith(".json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
        parsed = asJSON();
        if (!parsed) {
          WA.toast("JSON 解析失败，请检查文件格式", "error");
          return;
        }
      }

      let pending = null;
      if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.words)) {
        const count = countImportable(parsed.words);
        if (!count) { WA.toast("备份中没有可导入的单词", "error"); return; }
        pending = { kind: "state", fileName: file.name, state: parsed, entries: [], count: count };
      } else if (parsed && Array.isArray(parsed)) {
        const count = countImportable(parsed);
        if (!count) { WA.toast("没有找到可导入的单词", "error"); return; }
        pending = { kind: "words", fileName: file.name, entries: parsed, count: count };
      } else if (parsed && Array.isArray(parsed.entries)) {
        const count = countImportable(parsed.entries);
        if (!count) { WA.toast("没有找到可导入的单词", "error"); return; }
        pending = { kind: "words", fileName: file.name, entries: parsed.entries, count: count };
      } else if (parsed && (parsed.term || parsed.word)) {
        pending = { kind: "words", fileName: file.name, entries: [parsed], count: 1 };
      } else {
        let entries;
        if (lower.endsWith(".csv")) entries = WA.parseCSVEntries(text);
        else if (lower.endsWith(".txt")) entries = WA.parseTXTEntries(text);
        else entries = text.includes("\t") || text.includes(",") ? WA.parseCSVEntries(text) : WA.parseTXTEntries(text);
        const count = countImportable(entries);
        if (!count) { WA.toast("没有解析到可导入的单词", "error"); return; }
        pending = { kind: "words", fileName: file.name, entries: entries, count: count };
      }

      WA.pendingImport = pending;
      const dialog = $("#importDialog");
      $("#importSummary").textContent = pending.kind === "state"
        ? "「" + pending.fileName + "」是一份完整备份，包含 " + pending.count + " 个单词。"
        : "「" + pending.fileName + "」解析出 " + pending.count + " 个可导入的单词。";
      $("#importNote").textContent = pending.kind === "state"
        ? "合并导入只会添加新单词并跳过重复项；覆盖恢复会替换当前全部数据，操作前会自动保存一份当前备份。"
        : "重复单词会自动跳过，已有单词的学习进度不会受到影响。导入的单词会从「新词」开始。";
      $("#importReplaceBtn").hidden = pending.kind !== "state";
      $("#importMergeBtn").textContent = pending.kind === "state" ? "合并单词" : "合并导入";
      WA.openDialog(dialog);
    } catch (error) {
      WA.toast("读取文件失败：" + (error.message || "未知错误"), "error");
    }
  };

  async function mergePendingImport() {
    const pending = WA.pendingImport;
    if (!pending) return;
    const entries = pending.kind === "state" ? pending.state.words : pending.entries;
    const result = Store.mergeWords(entries);
    const dialog = $("#importDialog");
    if (dialog && dialog.open) dialog.close();
    WA.pendingImport = null;
    WA.renderAll();
    if (WA.currentView === "settings") WA.renderSettings(true);
    if (result.added) {
      WA.toast("导入完成：新增 " + result.added + " 个，跳过 " + result.skipped + " 个", "success", 3600);
    } else {
      WA.toast("没有新增单词，跳过 " + result.skipped + " 个重复项", "error");
    }
  }

  async function replacePendingImport() {
    const pending = WA.pendingImport;
    if (!pending || pending.kind !== "state") return;
    const ok = await WA.confirmAction({
      title: "覆盖恢复",
      message: "将用备份中的 " + pending.count + " 个单词替换当前全部数据。\n当前数据会先自动备份，但仍建议先手动导出一份。",
      okText: "覆盖并恢复",
      danger: true
    });
    if (!ok) return;
    Store.replaceState(pending.state);
    const dialog = $("#importDialog");
    if (dialog && dialog.open) dialog.close();
    WA.pendingImport = null;
    WA.applyTheme();
    WA.renderAll();
    WA.navigate("dashboard");
    WA.toast("已恢复 " + Store.getState().words.length + " 个单词", "success");
  }

  function exportJSON() {
    const payload = Store.getExportPayload();
    const content = JSON.stringify(payload, null, 2);
    WA.downloadFile("拾词备份-" + WA.fileStamp() + ".json", content, "application/json");
    Store.touchExport();
    WA.toast("JSON 备份已导出", "success");
  }

  function exportCSV() {
    WA.downloadFile("拾词单词表-" + WA.fileStamp() + ".csv", Store.getCSV(), "text/csv;charset=utf-8");
    Store.touchExport();
    WA.toast("CSV 已导出", "success");
  }

  function loadSampleAction() {
    const result = Store.loadSample();
    WA.renderAll();
    if (WA.currentView === "settings") WA.renderSettings(true);
    if (result.added) WA.toast("已载入 " + result.added + " 个示例单词", "success");
    else WA.toast("示例词库已经全部存在了");
  }

  function bindImportExport() {
    const exportJsonBtn = $("#exportJsonBtn");
    if (exportJsonBtn) exportJsonBtn.addEventListener("click", exportJSON);
    const exportCsvBtn = $("#exportCsvBtn");
    if (exportCsvBtn) exportCsvBtn.addEventListener("click", exportCSV);
    const importBtn = $("#importBtn");
    if (importBtn) importBtn.addEventListener("click", WA.triggerImport);
    const loadSampleBtn = $("#loadSampleBtn");
    if (loadSampleBtn) loadSampleBtn.addEventListener("click", loadSampleAction);

    const fileInput = $("#fileInput");
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = "";
        if (file) WA.handleImportFile(file);
      });
    }

    const importMerge = $("#importMergeBtn");
    if (importMerge) importMerge.addEventListener("click", mergePendingImport);
    const importReplace = $("#importReplaceBtn");
    if (importReplace) importReplace.addEventListener("click", replacePendingImport);
    const importCancel = $("#importCancelBtn");
    const importClose = $("#importCloseBtn");
    const importDialog = $("#importDialog");
    if (importCancel) importCancel.addEventListener("click", function () {
      if (importDialog && importDialog.open) importDialog.close();
    });
    if (importClose) importClose.addEventListener("click", function () {
      if (importDialog && importDialog.open) importDialog.close();
    });
    if (importDialog) {
      importDialog.addEventListener("close", function () { WA.pendingImport = null; });
    }
  }

  WA.bindLibrary = function () {
    bindLibrary();
  };

  WA.loadSampleAction = loadSampleAction;
  WA.exportJSON = exportJSON;
  WA.exportCSV = exportCSV;
})(window.WA);
