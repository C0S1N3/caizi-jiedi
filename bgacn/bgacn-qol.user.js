// ==UserScript==
// @name         BGACN 猜字解底 · 对局记录与输入效率
// @namespace    bgacn-cj-qol
// @version      1.4.0
// @description  牌局页辅助：自动记录每轮公共字/提示字/作答/比分并可导出 CSV；作答卡自动跳格、粘贴分卡、重复字提醒；猜字阶段计时；页内候选答案面板（载入词库后直接写出各玩家候选隐藏字与底候选）。
// @match        https://bgacn.com/*
// @match        https://*.bgacn.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // ---------- 配置与选择器 ----------

  var LS_KEY = "cj_qol_log_v1";
  var MAX_LOG = 2000;
  var DEDUP_WINDOW = 5;      // 与最近几条记录同键则视为重复状态
  var TICK_DELAY = 300;      // DOM 变化后的合并延迟
  var TIMER_WARN = 120;      // 猜字计时变橙（秒）
  var TIMER_CRITICAL = 150;  // 猜字计时变红（秒）
  var CARD_FOOTER = "哪一个字，能分别与它们组词？";

  var SEL = {
    shell: "main.cj-shell",
    room: ".cj-room-code",
    round: ".cj-round strong",
    progress: ".cj-progress",
    publicChar: ".cj-public strong",
    central: ".cj-central strong",
    mySecret: ".cj-secret strong",
    player: ".cj-score-player",
    playerName: ".cj-score-name strong",
    playerScore: ".cj-score b",
    clueCard: ".cj-clue-card",
    clueName: "header strong",
    clueStatus: "header span",
    clueFace: ".cj-clue-face span",
    clueFaceBox: ".cj-clue-face",
    answerInput: '.cj-answer-form input[aria-label^="作答卡"]'
  };

  var STYLE = {
    root: "position:fixed;right:14px;bottom:14px;z-index:2147483647;font-family:system-ui,sans-serif;",
    button: "padding:8px 14px;border-radius:10px;border:1px solid #d8d0c0;background:#fffdf8;" +
      "color:#3a332b;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(60,50,30,.15);",
    smallButton: "padding:4px 10px;border-radius:6px;border:1px solid #d8d0c0;background:#fff;cursor:pointer;font-size:12px;",
    chip: "margin-top:6px;text-align:right;font-size:12px;color:#8a8071;display:none;",
    panel: "position:fixed;right:14px;bottom:64px;z-index:2147483647;width:420px;max-height:60vh;overflow:auto;" +
      "background:#fffdf8;border:1px solid #d8d0c0;border-radius:12px;padding:12px;" +
      "font-family:system-ui,sans-serif;font-size:12px;color:#3a332b;box-shadow:0 4px 16px rgba(60,50,30,.2);",
    panelHead: "display:flex;gap:8px;align-items:center;margin-bottom:8px;",
    statLine: "margin-bottom:8px;color:#8a8071;line-height:1.7;",
    table: "width:100%;border-collapse:collapse;font-size:12px;",
    th: "text-align:left;padding:3px 4px;border-bottom:1px solid #e8e2d5;color:#8a8071;font-weight:normal;position:sticky;top:0;background:#fffdf8;",
    td: "padding:3px 4px;border-bottom:1px dashed #eee6d8;vertical-align:top;",
    hintBox: "position:fixed;left:14px;bottom:14px;z-index:2147483647;width:370px;max-height:52vh;display:flex;flex-direction:column;" +
      "background:#fffdf8;border:2px solid #c9b78f;border-radius:12px;padding:10px;" +
      "font-family:system-ui,sans-serif;font-size:12px;color:#3a332b;box-shadow:0 6px 24px rgba(60,50,30,.28);",
    hintHead: "display:flex;gap:6px;align-items:center;margin-bottom:6px;padding:4px 6px;" +
      "background:#f3ecdd;border-radius:8px;color:#5a4a2e;",
    hintStatus: "color:#8a8071;font-size:11px;",
    hintBody: "overflow:auto;",
    hintRow: "display:flex;gap:6px;align-items:center;padding:3px 0;border-bottom:1px dashed #eee6d8;",
    hintWho: "min-width:60px;max-width:92px;color:#8a8071;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
    hintPair: "min-width:38px;color:#8a8071;",
    hintCands: "display:flex;flex-wrap:wrap;gap:4px;flex:1;",
    hintCand: "padding:2px 7px;border-radius:6px;border:1px solid #e0d8c8;background:#fff;color:#3a332b;" +
      "font-size:13px;cursor:pointer;min-width:26px;",
    hintTip: "color:#8a8071;line-height:1.6;padding:4px 0;",
    cardStrip: "display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:6px;padding:4px 6px;" +
      "background:rgba(255,253,248,.94);border:1px solid #e4dccb;border-radius:8px;",
    cardStripLabel: "color:#8a8071;font-size:11px;"
  };

  // ---------- 小工具 ----------

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function textOf(sel) { var n = $(sel); return n ? n.textContent.trim() : ""; }
  function el(tag, style, text) {
    var n = document.createElement(tag);
    if (style) n.style.cssText = style;
    if (text != null) n.textContent = text;
    return n;
  }
  function pad2(n) { return ("0" + n).slice(-2); }
  function fmtClock(sec) { return pad2(Math.floor(sec / 60)) + ":" + pad2(sec % 60); }
  function isCjk(ch) { return ch >= "一" && ch <= "鿿"; }

  // ---------- 日志存取 ----------

  function loadLog() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); }
    catch (e) { return []; }
  }
  function saveLog(log) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(log.slice(-MAX_LOG))); }
    catch (e) { /* 配额不足时放弃本次写入 */ }
  }

  // ---------- 页面状态解析 ----------

  function parsePlayers() {
    return $$(SEL.player).map(function (p) {
      var name = p.querySelector(SEL.playerName);
      var score = p.querySelector(SEL.playerScore);
      return {
        name: name ? name.textContent.replace("（你）", "").trim() : "",
        me: p.classList.contains("is-me"),
        score: score ? score.textContent.trim() : ""
      };
    });
  }

  function parseClues() {
    return $$(SEL.clueCard).map(function (card) {
      var name = card.querySelector(SEL.clueName);
      var status = card.querySelector(SEL.clueStatus);
      var chars = Array.prototype.slice.call(card.querySelectorAll(SEL.clueFace))
        .filter(function (s) { return !s.closest(".cj-qol-inject"); })
        .map(function (s) { return s.textContent.trim(); });
      return {
        player: name ? name.textContent.replace("（你）", "").trim() : "",
        status: status ? status.textContent.trim() : "",
        chars: chars.join("/"),
        text: cardText(card)
      };
    });
  }

  // 卡片文本要排除脚本自己注入的候选条，否则翻牌统计会被污染
  function cardText(card) {
    var clone = card.cloneNode(true);
    var injected = clone.querySelectorAll(".cj-qol-inject");
    for (var i = 0; i < injected.length; i++) injected[i].remove();
    return clone.textContent.replace(/\s+/g, "");
  }

  function parseState() {
    var shell = $(SEL.shell);
    if (!shell) return null;
    return {
      ts: Date.now(),
      room: textOf(SEL.room),
      phase: shell.getAttribute("data-phase") || "",
      round: textOf(SEL.round),
      progress: textOf(SEL.progress),
      publicChar: textOf(SEL.publicChar),
      central: textOf(SEL.central),
      mySecret: textOf(SEL.mySecret),
      players: parsePlayers(),
      clues: parseClues(),
      answers: $$(SEL.answerInput).map(function (i) { return i.value.trim(); })
    };
  }

  function stateKey(st) {
    return [
      st.room, st.round, st.phase, st.progress, st.publicChar, st.mySecret,
      st.players.map(function (p) { return p.name + p.score; }).join(","),
      st.clues.map(function (c) { return c.player + c.chars + c.status; }).join(","),
      st.answers.join(",")
    ].join("|");
  }

  // ---------- 统计 ----------

  // 各提示卡共有的字符（脚注等公共文案），取所有卡的最少出现次数
  function commonChars(clues) {
    if (clues.length < 2) return "";   // 只有一张卡时无法区分共有字与隐藏字
    var bags = clues.map(function (c) {
      var b = {};
      (c.text || "").split("").forEach(function (ch) { b[ch] = (b[ch] || 0) + 1; });
      return b;
    });
    var out = "";
    Object.keys(bags[0]).forEach(function (ch) {
      var m = bags[0][ch];
      for (var i = 1; i < bags.length; i++) m = Math.min(m, bags[i][ch] || 0);
      for (var k = 0; k < m; k++) out += ch;
    });
    return out;
  }

  // 翻牌后整卡文本 = 玩家名 + 状态 + 提示字 + 隐藏字 + 固定脚注；多重集相减后剩一个字即隐藏字
  // 先按已知脚注文案相减（站点文案未变时最准），失败再改用“全卡共有字符”兜底
  function extractHidden(clue, common) {
    var base = (clue.player || "") + (clue.status || "") +
      (clue.chars || "").replace(/\//g, "");
    var plans = [base + CARD_FOOTER, base + (common || "")];
    for (var p = 0; p < plans.length; p++) {
      var bag = {};
      plans[p].split("").forEach(function (c) { bag[c] = (bag[c] || 0) + 1; });
      var rest = [];
      (clue.text || "").split("").forEach(function (c) {
        if (bag[c]) { bag[c]--; return; }
        if (isCjk(c)) rest.push(c);
      });
      if (rest.length === 1) return rest[0];
    }
    return "";
  }

  function groupRounds(log) {
    var rounds = [], index = {};
    log.forEach(function (e) {
      var k = (e.room || "") + "|" + (e.round || "");
      if (!index[k]) { index[k] = { entries: [] }; rounds.push(index[k]); }
      index[k].entries.push(e);
    });
    return rounds;
  }

  function analyzeRound(entries) {
    var guessEntry = null, last = entries[entries.length - 1];
    entries.forEach(function (e) { if (!guessEntry && e.phase === "guess") guessEntry = e; });

    var myScore = null, myName = "";
    (last.players || []).forEach(function (p) { if (p.me) myScore = parseInt(p.score, 10); });
    if (guessEntry) {
      (guessEntry.players || []).forEach(function (p) { if (p.me) myName = p.name; });
    }

    var hidden = [], base = "";
    entries.forEach(function (e) {
      var clues = e.clues || [];
      var common = commonChars(clues);
      clues.forEach(function (c) {
        var h = extractHidden(c, common);
        if (h && !hidden.some(function (x) { return x.player === c.player && x.char === h; })) {
          hidden.push({ player: c.player, char: h });
        }
      });
      if (!base && e.central && e.central !== "?") base = e.central;
    });

    return {
      myScore: myScore,
      myName: myName,
      answers: guessEntry ? (guessEntry.answers || []).filter(Boolean) : [],
      hidden: hidden,
      base: base
    };
  }

  function computeStats(log) {
    var s = { rounds: 0, myPoints: [], guessHit: 0, guessOpp: 0, baseHit: 0, baseOpp: 0 };
    var prevMy = null;
    groupRounds(log).forEach(function (r) {
      s.rounds++;
      var a = analyzeRound(r.entries);
      if (a.myScore != null && prevMy != null) s.myPoints.push(a.myScore - prevMy);
      if (a.myScore != null) prevMy = a.myScore;
      if (!a.answers.length) return;
      a.hidden.forEach(function (h) {
        if (h.player === a.myName) return;
        s.guessOpp++;
        if (a.answers.indexOf(h.char) >= 0) s.guessHit++;
      });
      if (a.base) {
        s.baseOpp++;
        if (a.answers.indexOf(a.base) >= 0) s.baseHit++;
      }
    });
    return s;
  }

  // ---------- CSV ----------

  function csvCell(v) {
    v = String(v == null ? "" : v);
    return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function buildCsv(log) {
    var rows = [["time", "room", "round", "phase", "progress", "public_char", "central",
      "my_secret", "players", "clues", "answers"].join(",")];
    log.forEach(function (e) {
      rows.push([
        new Date(e.ts).toISOString(), e.room, e.round, e.phase, e.progress,
        e.publicChar, e.central || "", e.mySecret,
        (e.players || []).map(function (p) { return p.name + "=" + p.score + (p.me ? "(me)" : ""); }).join("; "),
        (e.clues || []).map(function (c) { return c.player + ":" + c.chars + ":" + c.status; }).join("; "),
        (e.answers || []).join("/")
      ].map(csvCell).join(","));
    });
    return rows.join("\r\n");
  }

  function exportCsv() {
    var blob = new Blob(["\uFEFF" + buildCsv(loadLog())], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "caizi-jiedi-log.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- 悬浮 UI 与面板 ----------

  var uiRoot = null, timerChip = null;

  function ensureUI() {
    if (uiRoot || !$(SEL.shell)) return;
    uiRoot = el("div", STYLE.root);
    uiRoot.id = "cj-qol-root";
    var btn = el("button", STYLE.button, "对局记录");
    btn.addEventListener("click", togglePanel);
    timerChip = el("div", STYLE.chip);
    uiRoot.appendChild(btn);
    uiRoot.appendChild(timerChip);
    document.body.appendChild(uiRoot);
  }

  function statsLineText(st) {
    return "轮数 " + st.rounds +
      " · 我的逐轮得分 " + (st.myPoints.length ? st.myPoints.join("/") : "-") +
      " · 猜隐藏字 " + st.guessHit + "/" + st.guessOpp +
      " · 解底 " + st.baseHit + "/" + st.baseOpp +
      (st.guessOpp || st.baseOpp ? "" : "（翻牌数据齐全后自动统计）");
  }

  function entryRowCells(e) {
    var t = new Date(e.ts);
    return [
      pad2(t.getHours()) + ":" + pad2(t.getMinutes()),
      e.room, e.round, e.phase, e.publicChar, e.central || "", e.mySecret,
      (e.players || []).map(function (p) { return p.name + p.score; }).join(" "),
      (e.clues || []).map(function (c) { return c.player + ":" + c.chars; }).join(" "),
      (e.answers || []).join(" ")
    ];
  }

  function renderLogTable(log) {
    var table = el("table", STYLE.table);
    var head = el("tr");
    ["时间", "房", "轮", "阶段", "公共", "底", "我的字", "比分", "提示字", "我的作答"].forEach(function (h) {
      head.appendChild(el("th", STYLE.th, h));
    });
    table.appendChild(head);
    log.slice().reverse().forEach(function (e) {   // 最新在上
      var tr = el("tr");
      entryRowCells(e).forEach(function (c) { tr.appendChild(el("td", STYLE.td, c)); });
      table.appendChild(tr);
    });
    return table;
  }

  var panelEl = null;

  function togglePanel() {
    if (panelEl) { panelEl.remove(); panelEl = null; return; }

    var log = loadLog();
    var panel = el("div", STYLE.panel);
    panel.id = "cj-qol-panel";
    panelEl = panel;

    var head = el("div", STYLE.panelHead);
    var title = el("strong", null, "对局记录（" + log.length + " 条）");
    title.setAttribute("data-cj-title", "1");
    head.appendChild(title);
    var spacer = el("span");
    spacer.style.flex = "1";
    head.appendChild(spacer);
    var diagBtn = el("button", STYLE.smallButton, "复制诊断");
    diagBtn.addEventListener("click", function () {
      var text = diagnose();
      copyText(text, diagBtn);
    });
    var csvBtn = el("button", STYLE.smallButton, "导出 CSV");
    csvBtn.addEventListener("click", exportCsv);
    var clearBtn = el("button", STYLE.smallButton, "清空");
    clearBtn.addEventListener("click", function () {
      if (!confirm("清空全部对局记录？")) return;
      localStorage.removeItem(LS_KEY);
      lastKey = "";
      panel.remove();
      panelEl = null;
    });
    head.appendChild(diagBtn);
    head.appendChild(csvBtn);
    head.appendChild(clearBtn);
    panel.appendChild(head);

    var stat = el("div", STYLE.statLine, statsLineText(computeStats(log)));
    stat.setAttribute("data-cj-stat", "1");
    panel.appendChild(stat);
    panel.appendChild(renderLogTable(log));
    document.body.appendChild(panel);
  }

  // 面板开着时随新记录自动刷新
  function refreshPanel() {
    if (!panelEl) return;
    var log = loadLog();
    var title = panelEl.querySelector("[data-cj-title]");
    if (title) title.textContent = "对局记录（" + log.length + " 条）";
    var stat = panelEl.querySelector("[data-cj-stat]");
    if (stat) stat.textContent = statsLineText(computeStats(log));
    var oldTable = panelEl.querySelector("table");
    if (oldTable) {
      var fresh = renderLogTable(log);
      oldTable.parentNode.replaceChild(fresh, oldTable);
    }
  }

  // 诊断信息：当前解析状态 + 首张提示卡的真实 DOM，用于校准翻牌解析
  function diagnose() {
    var st = parseState();
    var card = $(SEL.clueCard);
    return [
      "== state ==",
      JSON.stringify(st, null, 1),
      "== clue card html ==",
      card ? card.outerHTML : "(no clue card)"
    ].join("\n");
  }

  function copyText(text, btn) {
    var done = function (ok) {
      var old = btn.textContent;
      btn.textContent = ok ? "已复制" : "复制失败";
      setTimeout(function () { btn.textContent = old; }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () {
        done(fallbackCopy(text));
      });
    } else {
      done(fallbackCopy(text));
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px;top:0;";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  // ---------- 猜字计时 ----------

  var timerStart = 0, timerInterval = 0;

  function startTimer(phase) {
    stopTimer();
    if (phase !== "guess" || !timerChip) return;
    timerStart = Date.now();
    timerChip.style.display = "";
    timerChip.textContent = "猜字 00:00";
    timerInterval = setInterval(function () {
      var sec = Math.floor((Date.now() - timerStart) / 1000);
      timerChip.textContent = "猜字 " + fmtClock(sec);
      timerChip.style.color = sec >= TIMER_CRITICAL ? "#d8483b" : sec >= TIMER_WARN ? "#b47a16" : "#8a8071";
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = 0; }
    if (timerChip) timerChip.style.display = "none";
  }

  // ---------- 作答卡输入效率 ----------

  function isAnswerInput(node) {
    return !!node && node.tagName === "INPUT" && !node.disabled &&
      /^作答卡/.test(node.getAttribute("aria-label") || "");
  }
  function answerInputs() { return $$(SEL.answerInput); }
  function inputAfter(list, from) { return list[list.indexOf(from) + 1] || null; }
  function nextEmptyInput(from) {
    var list = answerInputs(), i = list.indexOf(from);
    for (var j = i + 1; j < list.length; j++) if (!list[j].value) return list[j];
    return null;
  }

  function markDuplicates() {
    var seen = {};
    answerInputs().forEach(function (i) {
      if (i.disabled) return;
      var v = i.value.trim();
      i.style.boxShadow = v && seen[v] ? "0 0 0 2px #d8483b" : "";
      if (v) seen[v] = true;
    });
  }

  function onAnswerInput(e) {
    var inp = e.target;
    if (!isAnswerInput(inp)) return;
    if (inp.value.length > 1) inp.value = inp.value.slice(-1);  // 输入法组词中间态只留末字
    markDuplicates();
    if (inp.value.length === 1) {
      var next = nextEmptyInput(inp);
      if (next) next.focus();
    }
    scheduleTick();
  }

  function onAnswerPaste(e) {
    var inp = e.target;
    if (!isAnswerInput(inp)) return;
    var text = (e.clipboardData || window.clipboardData).getData("text") || "";
    var chars = Array.from(text).filter(isCjk);
    if (chars.length <= 1) return;  // 单字粘贴走浏览器默认行为
    e.preventDefault();
    var list = answerInputs();
    var pos = list.indexOf(inp);
    for (var i = 0; i < chars.length && pos < list.length; i++, pos++) {
      list[pos].value = chars[i];
    }
    markDuplicates();
    (list[pos] || inp).focus();
  }

  function onAnswerKeydown(e) {
    if (e.key !== "Enter" || !isAnswerInput(e.target)) return;
    var next = nextEmptyInput(e.target) || inputAfter(answerInputs(), e.target);
    if (next && next !== e.target) {
      next.focus();
      e.preventDefault();
    }
  }

  document.addEventListener("input", onAnswerInput);
  document.addEventListener("paste", onAnswerPaste);
  document.addEventListener("keydown", onAnswerKeydown);

  // ---------- 候选答案（组词求解） ----------

  var DICT_LS_KEY = "cj_qol_dict_v1";
  var DICT_MIN_F = 5;      // 低于此词频的条目多是生僻噪声，不作候选
  var MAX_CANDS = 6;
  var DICT_PATH = "C:\\coding\\script\\bgacn\\words.tsv";

  var dictIndex = null;    // char -> Map(char -> {f: 词频, w: [[词, 频]]})
  var dictCount = 0;

  function buildIndex(text) {
    var index = new Map(), count = 0;
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var sp = lines[i].lastIndexOf(" ");
      if (sp < 1) continue;
      var w = lines[i].slice(0, sp);
      if (w.length !== 2 || !isCjk(w[0]) || !isCjk(w[1])) continue;
      var f = parseInt(lines[i].slice(sp + 1), 10);
      if (!f || f < DICT_MIN_F) continue;
      count++;
      linkWord(index, w[0], w[1], w, f);
      linkWord(index, w[1], w[0], w, f);
    }
    return { index: index, count: count };
  }

  function linkWord(index, x, y, w, f) {
    if (!index.has(x)) index.set(x, new Map());
    var m = index.get(x);
    var e = m.get(y);
    if (!e) { e = { f: 0, w: [] }; m.set(y, e); }
    if (f > e.f) e.f = f;
    e.w.push([w, f]);
    if (e.w.length > 3) {
      e.w.sort(function (a, b) { return b[1] - a[1]; });
      e.w.length = 3;
    }
  }

  // 与所有提示字都能组词的候选；按最弱一环的词频排序
  function solveClues(chars, limit) {
    if (!dictIndex) return [];
    var uniq = [];
    chars.forEach(function (c) {
      if (isCjk(c) && dictIndex.has(c) && uniq.indexOf(c) < 0) uniq.push(c);
    });
    if (!uniq.length) return [];
    var out = [];
    dictIndex.get(uniq[0]).forEach(function (e0, cand) {
      var minF = e0.f, sumF = e0.f, ok = true, ev = [];
      for (var i = 0; i < uniq.length; i++) {
        var e = dictIndex.get(uniq[i]).get(cand);
        if (!e) { ok = false; break; }
        if (i > 0) {
          if (e.f < minF) minF = e.f;
          sumF += e.f;
        }
        ev.push(e);
      }
      if (ok) out.push({ char: cand, minF: minF, sumF: sumF, ev: ev });
    });
    out.sort(function (a, b) { return (b.minF - a.minF) || (b.sumF - a.sumF); });
    return out.slice(0, limit || MAX_CANDS);
  }

  function evidenceText(x) {
    return (x.ev || []).map(function (e) {
      var ws = e.w.slice().sort(function (a, b) { return b[1] - a[1]; });
      return ws.length ? ws[0][0] : "";
    }).join("/");
  }

  var hintBox = null, hintBody = null, hintStatus = null, hintFile = null;

  function ensureHintUI() {
    if (hintBox) return;
    hintBox = el("div", STYLE.hintBox);
    hintBox.id = "cj-qol-hint";

    var head = el("div", STYLE.hintHead);
    head.appendChild(el("strong", null, "候选答案"));
    hintStatus = el("span", STYLE.hintStatus, "");
    head.appendChild(hintStatus);
    var spacer = el("span");
    spacer.style.flex = "1";
    head.appendChild(spacer);
    var loadBtn = el("button", STYLE.smallButton, "载入词库");
    loadBtn.addEventListener("click", function () { hintFile.click(); });
    head.appendChild(loadBtn);
    var foldBtn = el("button", STYLE.smallButton, "－");
    foldBtn.addEventListener("click", function () {
      var folded = hintBody.style.display === "none";
      hintBody.style.display = folded ? "" : "none";
      foldBtn.textContent = folded ? "－" : "＋";
    });
    head.appendChild(foldBtn);
    hintBox.appendChild(head);

    hintFile = document.createElement("input");
    hintFile.type = "file";
    hintFile.accept = ".txt,.tsv,.csv";
    hintFile.style.display = "none";
    hintFile.addEventListener("change", function () {
      var f = hintFile.files[0];
      if (f) readDictFile(f);
    });
    hintBox.appendChild(hintFile);

    hintBody = el("div", STYLE.hintBody);
    hintBox.appendChild(hintBody);
    document.body.appendChild(hintBox);
  }

  function setDictStatus(t) { if (hintStatus) hintStatus.textContent = t; }

  function readDictFile(file) {
    setDictStatus("读取中…");
    var fr = new FileReader();
    fr.onload = function () { installDict(String(fr.result)); };
    fr.onerror = function () { setDictStatus("读文件失败"); };
    fr.readAsText(file);
  }

  function installDict(text) {
    var built = buildIndex(text);
    if (!built.count) { setDictStatus("没读到可用词条"); return; }
    dictIndex = built.index;
    dictCount = built.count;
    try { localStorage.setItem(DICT_LS_KEY, text); } catch (e) { /* 配额不足则只在本页有效 */ }
    setDictStatus(dictCount + " 词");
    renderHint();
  }

  function loadDictFromStorage() {
    var text = null;
    try { text = localStorage.getItem(DICT_LS_KEY); } catch (e) { text = null; }
    if (!text) { setDictStatus("未载入"); return; }
    setDictStatus("载入中…");
    setTimeout(function () {
      var built = buildIndex(text);
      dictIndex = built.index;
      dictCount = built.count;
      setDictStatus(dictCount + " 词");
      renderHint();
    }, 0);
  }

  function candChip(x, best) {
    var b = el("button", STYLE.hintCand + (best ? ";font-weight:600;color:#1c6b45;border-color:#9fcbb2" : ""), x.char);
    b.title = evidenceText(x);
    b.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      fillNextCard(x.char);
    });
    return b;
  }

  // 候选直接写在每张提示卡下面
  function injectCardCandidates() {
    if (!dictIndex) return;
    $$(SEL.clueCard).forEach(function (card) {
      var old = card.querySelector(".cj-qol-inject");
      if (old) old.remove();
      var chars = Array.prototype.slice.call(card.querySelectorAll(SEL.clueFace))
        .filter(function (s) { return !s.closest(".cj-qol-inject"); })
        .map(function (s) { return s.textContent.trim(); })
        .filter(function (c) { return c && c !== "?"; });
      if (chars.length < 2) return;
      var cands = solveClues(chars, 5);
      if (!cands.length) return;
      var strip = el("div", STYLE.cardStrip);
      strip.className = "cj-qol-inject";
      strip.appendChild(el("div", STYLE.cardStripLabel, "候选"));
      cands.forEach(function (x, i) { strip.appendChild(candChip(x, i === 0)); });
      var faceBox = card.querySelector(SEL.clueFaceBox);
      if (faceBox && faceBox.parentNode) faceBox.parentNode.insertBefore(strip, faceBox.nextSibling);
      else card.appendChild(strip);
    });
  }

  function renderHint() {
    if (!hintBody) return;
    hintBody.innerHTML = "";
    var st = parseState();
    if (!st) {
      hintBody.appendChild(el("div", STYLE.hintTip, "未检测到牌局页（进入房间后自动显示候选）"));
      return;
    }
    injectCardCandidates();
    injectBaseCandidates(st);
    if (!dictIndex) {
      hintBody.appendChild(el("div", STYLE.hintTip,
        "点「载入词库」选 " + DICT_PATH + "（也可以把该文件拖到本页）。载入后这里会直接写出每个玩家的候选隐藏字和底候选。"));
      return;
    }
    (st.clues || []).forEach(function (c) {
      var chars = (c.chars || "").split("/").filter(function (x) { return x && x !== "?"; });
      if (chars.length < 2) return;
      var row = el("div", STYLE.hintRow);
      row.appendChild(el("span", STYLE.hintWho, c.player));
      row.appendChild(el("span", STYLE.hintPair, chars.join("/")));
      var box = el("div", STYLE.hintCands);
      var cands = solveClues(chars, MAX_CANDS);
      if (!cands.length) box.appendChild(el("span", STYLE.hintTip, "无候选"));
      cands.forEach(function (x, i) { box.appendChild(candChip(x, i === 0)); });
      row.appendChild(box);
      hintBody.appendChild(row);
    });

    var baseClues = [];
    if (st.publicChar && st.publicChar !== "?") baseClues.push(st.publicChar);
    if (st.mySecret && st.mySecret !== "?") baseClues.push(st.mySecret);
    if (baseClues.length >= 2) {
      var brow = el("div", STYLE.hintRow);
      brow.appendChild(el("span", STYLE.hintWho, "底"));
      brow.appendChild(el("span", STYLE.hintPair, baseClues.join("/")));
      var bbox = el("div", STYLE.hintCands);
      solveClues(baseClues, 4).forEach(function (x, i) { bbox.appendChild(candChip(x, i === 0)); });
      brow.appendChild(bbox);
      hintBody.appendChild(brow);
    }
  }

  // 底候选写到中央题卡上
  function injectBaseCandidates(st) {
    var host = $(SEL.central);
    if (!host) return;
    var target = host.parentNode || host;
    var old = target.querySelector(".cj-qol-inject");
    if (old) old.remove();
    if (!dictIndex) return;
    var clues = [];
    if (st.publicChar && st.publicChar !== "?") clues.push(st.publicChar);
    if (st.mySecret && st.mySecret !== "?") clues.push(st.mySecret);
    if (clues.length < 2) return;
    var cands = solveClues(clues, 4);
    if (!cands.length) return;
    var strip = el("div", STYLE.cardStrip);
    strip.className = "cj-qol-inject";
    strip.appendChild(el("div", STYLE.cardStripLabel, "底候选"));
    cands.forEach(function (x, i) { strip.appendChild(candChip(x, i === 0)); });
    target.appendChild(strip);
  }

  function fillNextCard(ch) {
    var list = answerInputs().filter(function (i) { return !i.disabled; });
    for (var i = 0; i < list.length; i++) {
      if (!list[i].value) {
        list[i].value = ch;
        list[i].dispatchEvent(new Event("input", { bubbles: true }));
        list[i].focus();
        return true;
      }
    }
    return false;
  }

  document.addEventListener("dragover", function (e) {
    if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0) e.preventDefault();
  });
  document.addEventListener("drop", function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f || !/\.(txt|tsv|csv)$/i.test(f.name)) return;
    e.preventDefault();
    readDictFile(f);
  });

  // ---------- 主循环 ----------

  var lastKey = "";
  var lastPhase = "";

  function recordIfChanged(st) {
    var key = stateKey(st);
    if (key === lastKey) return false;
    lastKey = key;
    var log = loadLog();
    var repeated = log.slice(-DEDUP_WINDOW).some(function (e) { return e.k === key; });
    if (repeated) return false;
    st.k = key;
    log.push(st);
    saveLog(log);
    refreshPanel();
    return true;
  }

  function tick() {
    ensureUI();
    ensureHintUI();
    var st = parseState();
    if (!st) { renderHint(); return; }
    if (recordIfChanged(st)) renderHint();
    if (st.phase !== lastPhase) {
      lastPhase = st.phase;
      startTimer(st.phase);
    }
    if (st.phase === "guess") markDuplicates();
  }

  var tickScheduled = false;
  function scheduleTick() {
    if (tickScheduled) return;
    tickScheduled = true;
    setTimeout(function () { tickScheduled = false; tick(); }, TICK_DELAY);
  }

  new MutationObserver(scheduleTick).observe(document.body, {
    childList: true, subtree: true, characterData: true
  });
  tick();
  loadDictFromStorage();

  // 脚本自身出错时给出可见提示，免得整页没反应又查不到原因
  window.addEventListener("error", function (e) {
    var src = e.filename || "";
    if (!/bgacn-qol|user\.js|userscript/i.test(src)) return;
    showFatal(e.message + "（" + src.split("/").pop() + ":" + e.lineno + "）");
  });

  function showFatal(msg) {
    if (document.getElementById("cj-qol-fatal")) return;
    var box = el("div", "position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#b3261e;color:#fff;" +
      "font:13px system-ui,sans-serif;padding:6px 10px;");
    box.id = "cj-qol-fatal";
    box.textContent = "猜字解底脚本出错：" + msg;
    document.body.appendChild(box);
  }

  window.__cjQol = {
    parseState: parseState, computeStats: computeStats, buildCsv: buildCsv,
    extractHidden: extractHidden, commonChars: commonChars, diagnose: diagnose,
    togglePanel: togglePanel, solveClues: solveClues, installDict: installDict,
    renderHint: renderHint
  };
})();
