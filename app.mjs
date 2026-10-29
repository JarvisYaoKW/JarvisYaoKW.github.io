import { ensureWallet, selectSkin, redeemSkin } from './pasture-economy.mjs';
import { syncNavigationIndicator } from './navigation.mjs';
import {
  loadEnglishDefinitions,
  englishFor,
  englishForPOS,
  definitionsFromLookup,
} from './english-definitions.mjs';
import { apiRequest, audioSource, storageMode } from './web-services.mjs';
import { lookupPronunciations, auxiliaryEntry, selectedReadings } from './aux-pronunciation.mjs';
import { retainLocalDraft, saveLocalState } from './browser-storage.mjs';
import { loadCatalog, loadBook, bookGroup, catalogHTML } from './wordbooks.mjs';
import {
  practiceControls,
  practiceContext,
  practiceFrame,
  applySidebarState,
} from './practice-layout.mjs';
import { herdSummary, sheepStatus } from './herd.mjs';
import {
  pasturePage,
  pasturePeek,
  mountSheepRoaming,
  skinShopHTML,
  coinHistoryHTML,
} from './herd-view.mjs';
import { selectFamily, validFamilyMeaning } from './family-selection.mjs';
import { verbMeanings, selectVerbForms, extensionItems } from './verb-forms.mjs';
import { senseModel, splitMeanings } from './pronunciation-view.mjs';
import {
  previousQuestion,
  skipQuestion,
  initialState,
  norm,
  uniq,
  category,
  statsOf,
  totalWrong,
  mergeEntries,
  pool,
  nextQuestion,
  submit,
  choices,
  hintMask,
  schedule,
  blankRound,
  compare,
} from './engine.mjs';
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
const icons = {
  star: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="favorite-star" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M 11.49 3.10 Q 12.00 2.00 12.51 3.10 L 14.17 6.71 Q 14.82 8.12 16.36 8.30 L 20.31 8.77 Q 21.51 8.91 20.62 9.73 L 17.70 12.43 Q 16.57 13.48 16.87 15.00 L 17.64 18.90 Q 17.88 20.09 16.82 19.50 L 13.35 17.56 Q 12.00 16.80 10.65 17.56 L 7.18 19.50 Q 6.12 20.09 6.36 18.90 L 7.13 15.00 Q 7.43 13.48 6.30 12.43 L 3.38 9.73 Q 2.49 8.91 3.69 8.77 L 7.64 8.30 Q 9.18 8.12 9.83 6.71 L 11.49 3.10 Z"/></svg>',
  filled:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="favorite-star" fill="currentColor" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M 11.49 3.10 Q 12.00 2.00 12.51 3.10 L 14.17 6.71 Q 14.82 8.12 16.36 8.30 L 20.31 8.77 Q 21.51 8.91 20.62 9.73 L 17.70 12.43 Q 16.57 13.48 16.87 15.00 L 17.64 18.90 Q 17.88 20.09 16.82 19.50 L 13.35 17.56 Q 12.00 16.80 10.65 17.56 L 7.18 19.50 Q 6.12 20.09 6.36 18.90 L 7.13 15.00 Q 7.43 13.48 6.30 12.43 L 3.38 9.73 Q 2.49 8.91 3.69 8.77 L 7.64 8.30 Q 9.18 8.12 9.83 6.71 L 11.49 3.10 Z"/></svg>',
  sun: '☀',
  moon: '☾',
  play: '▶',
  arrow: '↗',
};
let altPending = false;
let stopRoaming = () => {},
  pasturePages = { outside: 0, inside: 0 },
  configOpen = false,
  geometryObserver;
const mobileLayout = matchMedia('(max-width: 900px)');
let S,
  view = ['practice', 'pasture', 'library', 'wrong', 'favorite'].includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : 'practice',
  search = '',
  sort = 'alpha',
  selected = new Set(),
  toastTimer,
  saveTimer,
  saving = false,
  dirty = 0,
  saved = 0,
  saveError = '',
  clock = 0,
  lastTick = 0,
  active = false,
  audio = null,
  audioEpoch = 0,
  resourceTasks = new Map(),
  initializing = true,
  fnSeen = false;
const app = $('#app'),
  modal = $('#modal');
let review = null;
function reviewedQuestion() {
  const r = S.rounds[category(S)],
    q =
      review?.category === category(S) && review.round === r.number
        ? r.history?.[review.index]
        : null;
  return q?.finished && Object.hasOwn(S.entries, q.key) ? q : null;
}
const current = () => reviewedQuestion() || S.rounds[category(S)].current;
function previousButton() {
  return (
    '<button class="secondary" data-action="previous" ' +
    (previousQuestion(S, reviewedQuestion() ? review.index : undefined)
      ? ''
      : 'disabled title="还没有上一题"') +
    '>上一题</button>'
  );
}
function reviewLimit() {
  const r = S.rounds[category(S)];
  return Number.isInteger(r.current?.historyIndex)
    ? r.current.historyIndex
    : r.history?.length || 0;
}
function reviewNextLabel() {
  return reviewedQuestion() && review.index >= reviewLimit() - 1 ? '回到当前题' : '下一题';
}
const entry = () => S.entries[current()?.key];
async function api(url, opts = {}) {
  return apiRequest(url, opts);
}
function toast(t) {
  clearTimeout(toastTimer);
  $('#toast').classList.remove('show');
  modal.querySelector('.dialog-toast')?.classList.remove('show');
  let target = $('#toast');
  if (modal.open) {
    target = modal.querySelector('.dialog-toast');
    if (!target) {
      target = document.createElement('div');
      target.className = 'dialog-toast';
      target.setAttribute('role', 'status');
      target.setAttribute('aria-live', 'polite');
      modal.querySelector('.modal-scroll').appendChild(target);
    }
  }
  target.textContent = t;
  target.classList.add('show');
  if (modal.open) target.scrollIntoView({ block: 'nearest' });
  toastTimer = setTimeout(() => target.classList.remove('show'), 4500);
}
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 0);
}
function persist(delay = 80) {
  dirty++;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, delay);
  saveStatus();
}
function saveStatus() {
  const el = $('#save-status');
  if (!el) return;
  const pending = saving || saved < dirty,
    label = saveError ? '保存失败 · 点击重试' : '自动保存到本机';
  if (el.textContent !== label) el.textContent = label;
  el.classList.toggle('save-error', !!saveError);
  el.setAttribute('aria-busy', String(pending));
  el.title =
    saveError ||
    (pending
      ? '正在保存当前进度…'
      : storageMode === 'browser'
        ? '保存在当前浏览器；不同设备的数据相互独立。'
        : '词库和进度已保存在本机');
}
async function flush() {
  if (saving || saved === dirty || !S) return;
  saving = true;
  saveStatus();
  const version = dirty;
  try {
    const snapshot = structuredClone(S);
    const r =
      storageMode === 'browser'
        ? await saveLocalState(snapshot, S.revision)
        : await api('/api/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: snapshot, expectedRevision: S.revision }),
          });
    S.revision = r.revision;
    saved = version;
    saveError = '';
  } catch (e) {
    saveError = e.message;
    toast('进度尚未保存：' + e.message);
  } finally {
    saving = false;
    saveStatus();
    if (saved < dirty && !saveError) saveNow();
  }
}
function stopAudio() {
  audioEpoch++;
  if (audio) {
    audio.pause();
    audio = null;
  }
  window.speechSynthesis?.cancel();
}
function metricData() {
  const cat = category(S),
    list = Object.values(S.entries),
    a = list.map((e) => statsOf(e, cat));
  const correct = a.reduce((n, x) => n + x.correct, 0),
    wrong = a.reduce((n, x) => n + x.wrong, 0),
    first = a.reduce((n, x) => n + x.first, 0),
    ms = a.reduce((n, x) => n + x.ms, 0),
    chars = a.reduce((n, x) => n + x.chars, 0);
  return {
    correct,
    wrong,
    first,
    ms,
    chars,
    count: list.filter((e) => cat !== 'typing' || !e.recognitionOnly).length,
  };
}
function formatTime(ms) {
  const sec = Math.floor(ms / 1000);
  return sec < 60 ? sec + ' 秒' : Math.floor(sec / 60) + ' 分 ' + (sec % 60) + ' 秒';
}
function metrics() {
  const m = metricData(),
    r = S.rounds[category(S)],
    done = r.done.filter(
      (k) => S.entries[k] && (category(S) !== 'typing' || !S.entries[k].recognitionOnly),
    ).length;
  return `<div class="metrics"><div><span>本轮基础进度</span><strong>${done}<small> / ${m.count}</small></strong><div class="progress-track"><i style="width:${m.count ? (done / m.count) * 100 : 0}%"></i></div></div><div><span>本轮加练</span><strong>${Object.values(r.extra).reduce((a, b) => a + b, 0)}<small> 次</small></strong></div><div><span>累计首答正确率</span><strong>${m.correct + m.wrong ? Math.round((m.first / (m.correct + m.wrong)) * 100) : '—'}<small>${m.correct + m.wrong ? '%' : ''}</small></strong></div><div><span>输入速度</span><strong id="wpm">${m.ms ? Math.round(m.chars / 5 / (m.ms / 60000)) : '—'}<small> WPM</small></strong></div><div><span>有效打字用时</span><strong id="typing-time" class="time">${formatTime(m.ms)}</strong></div></div>`;
}
function header() {
  return `<a class="skip-link" href="#main-content">跳到主要内容</a><header class="header"><a href="#practice" class="brand" data-action="nav" data-view="practice"><img src="/icon.svg" alt="" width="43" height="43"><span>咩词<small>IELTS TYPING STUDIO</small></span></a><nav aria-label="主导航"><span class="nav-indicator" aria-hidden="true"></span>${[
    ['practice', '练习'],
    ['pasture', '草场'],
    ['library', '词库'],
    ['wrong', '常错本'],
    ['favorite', '收藏'],
  ]
    .map(
      ([v, t]) =>
        `<a href="#${v}" data-action="nav" data-view="${v}" ${view === v ? 'aria-current="page"' : ''} class="${view === v ? 'active' : ''}">${t}${v === 'favorite' ? '<span class="nav-dot">' + Object.values(S.entries).filter((e) => e.favorite).length + '</span>' : ''}</a>`,
    )
    .join(
      '',
    )}</nav><div class="header-right"><button id="save-status" class="save-status" data-action="save">已保存到本机</button><button class="icon-btn" title="切换浅色 / 深色" aria-label="切换主题" data-action="theme">${S.settings.theme === 'dark' ? icons.sun : icons.moon}</button><button class="icon-btn" title="设置" aria-label="设置" data-action="settings"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="m9 3-.6 2.2-1.7 1L4.5 5.8 2 10l1.6 1.7v1.8L2 15.2l2.5 4.2 2.2-.4 1.7 1L9 22h5l.6-2 1.7-1 2.2.4 2.5-4.2-1.6-1.7v-1.8L21 10l-2.5-4.2-2.2.4-1.7-1L14 3Z"/><circle cx="11.5" cy="12.5" r="3.4"/></svg></button></div></header>`;
}
function groupOptions(value, withAll = true) {
  return (
    `${withAll ? '<option value="">全部词条</option>' : ''}<option value="__ungrouped" ${value === '__ungrouped' ? 'selected' : ''}>未分组</option>` +
    S.groups
      .map((g) => `<option value="${esc(g)}" ${value === g ? 'selected' : ''}>${esc(g)}</option>`)
      .join('')
  );
}

function badges(e) {
  const st = statsOf(e, category(S));
  return `<div class="badges">${e.favorite ? '<span class="badge favorite">' + icons.filled + ' 已收藏</span>' : ''}${st.wrong ? `<span class="badge wrong">常错 · 已错 ${st.wrong} 次</span>` : ''}</div>`;
}
function favoriteButton(e) {
  return `<button class="favorite-btn ${e.favorite ? 'on' : ''}" data-action="favorite" data-key="${esc(e.key)}" aria-label="${e.favorite ? '取消收藏' : '收藏'} ${esc(e.english)}" title="${e.favorite ? '取消收藏' : '收藏并加入加练'}">${e.favorite ? icons.filled : icons.star}</button>`;
}
function idle() {
  const r = S.rounds[category(S)],
    list = pool(S),
    pending = list.filter((e) => !r.done.includes(e.key)).length;
  return `<section class="welcome"><h2>${list.length ? '开始练习' : '选择练习内容'}</h2><p>${list.length ? '当前范围有 ' + list.length + ' 条内容，' + pending + ' 条本轮未练。' : '可以调整左侧的分组和范围，或导入自己的词库。'}</p><div class="welcome-actions"><button class="primary large" data-action="start">${pending ? '开始 / 继续本轮练习' : '查看本轮完成情况'}</button></div><div class="key-guide"><span><kbd>Enter</kbd> 检查</span><span><kbd>空格</kbd> 下一题</span><span><kbd>Alt</kbd> 照打</span></div></section>`;
}
function practice() {
  const r = S.rounds[category(S)],
    q = current(),
    e = entry();
  return `<main class="main practice-main" id="main-content" tabindex="-1">${practiceContext(S, { mobile: mobileLayout.matches, collapsed: !!S.settings.sidebarCollapsed })}${metrics()}${q && e ? question(q, e) : idle()}${!q && previousQuestion(S) ? `<div class="question-actions">${previousButton()}</div>` : ''}${pasturePeek(S)}<footer class="practice-footer"><span>第 ${r.number} 轮 · ${category(S) === 'typing' ? '完整拼写与字母提示共用进度' : '选择题进度'} · 自动保存</span><button data-action="keys" class="text-btn">键盘操作指南</button></footer></main>`;
}
function question(q, e) {
  const isChoice = category(S) === 'choice';
  return `<section class="question-card"><div class="question-top"><span class="question-stage">${reviewedQuestion() ? '回看 · 第 ' + (review.index + 1) + ' 题' : q.kind === 'extra' ? '本轮加练' : '当前练习'}</span>${badges(e)}${!reviewedQuestion() && q.coinReward === 1 ? '<span class="coin-reward" role="status">+1 金币</span>' : ''}${favoriteButton(e)}</div>${reviewedQuestion() ? '<p class="review-notice">回看已答题，不重复计分；当前题的输入已保留。</p>' : ''}<div class="question-label">${isChoice ? '选择对应的中文释义' : e.type === 'sentence' ? '根据提示，输入完整英文句子' : '看中文，写出英文' + (e.type === 'phrase' ? '短语' : '单词')}</div>${
    isChoice
      ? `<h1 class="english-prompt">${esc(e.english)}</h1>${englishBlock(e.english, e.supplement)}<div class="options">${choices(
          S,
          q,
        )
          .map(
            (o, i) =>
              `<button class="option ${q.input === o.key ? (q.finished && q.outcome === 'correct' ? 'selected correct' : 'selected') : ''} ${q.finished && o.key === e.key ? 'correct' : ''}" data-action="choose" data-key="${esc(o.key)}" ${q.finished ? 'disabled' : ''}><kbd>${i + 1}</kbd><span>${esc(o.label)}</span></button>`,
          )
          .join(
            '',
          )}</div>${q.options.length < 4 ? '<p class="muted">有效释义不足四组，本题使用 ' + q.options.length + ' 个选项。</p>' : ''}`
      : `<div class="meaning-prompt">${e.meanings.map((m) => `<p>${esc(m)}</p>`).join('')}</div>${englishBlock(e.english, e.supplement)}${S.settings.mode === 'hint' && !q.finished ? hintInput(q, e) : `<div class="input-wrap ${q.finished ? q.outcome : q.tries ? 'retry' : ''}"><input id="answer-input" aria-label="输入英文答案" autocomplete="off" autocapitalize="off" spellcheck="false" lang="en" placeholder="在这里输入英文…" value="${esc(q.outcome === 'skipped' ? e.english : q.input)}" ${q.finished ? 'readonly' : ''}><span id="answer-state">${q.finished ? (q.outcome === 'correct' ? '✓' : q.outcome === 'skipped' ? '↷' : '×') : ''}</span></div>`}`
  }<div class="feedback ${q.finished ? q.outcome : q.tries ? 'retry' : ''}" role="status">${q.finished ? (q.outcome === 'skipped' ? '↷ 已跳过，本题不计对错；本轮不再加练这个词。' : q.outcome === 'correct' ? (q.tries ? '✓ 已改对，本题计正确一次' : '✓ 回答正确。') : '× 两次机会已用完，本题计错误一次，已加入常错本。') : q.tries ? '第一次未答对，还可以尝试一次。' : isChoice ? '按数字键选择，也可以点击选项。' : '准备好后，按 Enter 检查答案。'}</div><div class="question-actions">${previousButton()}${q.finished ? `<button class="primary" data-action="next">${reviewNextLabel()} <kbd>空格</kbd></button><button class="secondary" data-action="repeat">原词照打 <kbd>Alt</kbd></button><button class="secondary" data-action="extend">词形与词族 <kbd>Ctrl Alt E</kbd></button>` : `${isChoice ? '' : `<button class="primary" data-action="submit">检查答案 <kbd>Enter</kbd></button>`}<button class="secondary" data-action="skip">跳过 <kbd>Ctrl Enter</kbd></button>${q.tries ? '<button class="text-btn" data-action="repeat">临时照打 <kbd>Alt</kbd></button>' : ''}`}</div>${reviewedQuestion() && review.index < reviewLimit() - 1 ? '<button class="text-btn" data-action="resume-question">回到当前题</button>' : ''}${q.finished ? answerCard(e) : ''}</section>`;
}
function hintLetters(q, e) {
  const word = [...e.english],
    typed = [...q.input],
    mask = [...hintMask(q, e.english, S.settings.hint)],
    allCorrect = compare(q.input, e.english, e.type, S.settings);
  return (
    word
      .map((c, i) => {
        const t = typed[i];
        if (t !== undefined) {
          const equal =
            e.type === 'sentence' && S.settings.strictCase
              ? t === c
              : t.toLowerCase() === c.toLowerCase();
          return (
            '<span class="' +
            (equal ? (allCorrect ? 'whole-correct' : 'letter-correct') : 'letter-wrong') +
            '">' +
            esc(t) +
            '</span>'
          );
        }
        if (mask[i * 2] === '＿')
          return '<span class="hint-hidden" data-width-char="' + esc(c) + '">＿</span>';
        return '<span class="ghost">' + esc(c) + '</span>';
      })
      .join('') +
    typed
      .slice(word.length)
      .map((c) => '<span class="letter-wrong">' + esc(c) + '</span>')
      .join('')
  );
}
function hintInput(q, e) {
  return (
    '<div class="typing-line question-typing-line ' +
    (q.tries ? 'retry' : '') +
    '" id="hint-typing-line"><div class="letter-display" id="hint-display" aria-hidden="true">' +
    hintLetters(q, e) +
    '</div><input id="answer-input" class="aux-input hint-input" aria-label="根据字母提示输入完整英文" autocomplete="off" autocapitalize="off" spellcheck="false" lang="en" value="' +
    esc(q.input) +
    '"></div>'
  );
}
function syncHintGeometry() {
  const q = current(),
    e = entry(),
    field = $('#answer-input'),
    letters = $('#hint-display'),
    line = $('#hint-typing-line');
  if (!q || !e || !field || !letters || !line) return;
  const style = getComputedStyle(field),
    canvas =
      syncHintGeometry.canvas || (syncHintGeometry.canvas = document.createElement('canvas')),
    ctx = canvas.getContext('2d');
  ctx.font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
  ctx.fontKerning = 'none';
  for (const slot of letters.querySelectorAll('[data-width-char]'))
    slot.style.width = ctx.measureText(slot.dataset.widthChar).width + 'px';
  line.style.setProperty(
    '--typing-inset',
    Math.max(0, (line.clientWidth - ctx.measureText(e.english).width) / 2) + 'px',
  );
  letters.style.transform = 'translateX(' + -field.scrollLeft + 'px)';
}
window.addEventListener('resize', () => requestAnimationFrame(syncHintGeometry));
function englishSupplement(word) {
  const item = S.aux?.items[S.aux.index];
  return norm(item?.word) === norm(word) ? item : S.entries[norm(word)]?.supplement || {};
}
function englishSenseHTML(v) {
  return (
    '<p>' +
    esc(v.definition) +
    '</p>' +
    (v.lemma
      ? englishFor(v.lemma)
          .senses.filter((root) => root.pos === 'verb')
          .slice(0, 1)
          .map((root) => '<p class="english-lemma">' + esc(root.definition) + '</p>')
          .join('')
      : '')
  );
}
function englishBody(word, supplement, pos = '') {
  const value = englishForPOS(word, supplement, pos);
  if (!value.senses.length)
    return '<p class="english-empty muted">英文释义尚未补充，可在答案页联网重试。</p>';
  const groups = new Map();
  for (const sense of value.senses) {
    if (!groups.has(sense.pos)) groups.set(sense.pos, []);
    groups.get(sense.pos).push(sense);
  }
  return (
    '<h3>英文释义</h3>' +
    [...groups]
      .map(
        ([part, senses]) =>
          '<div class="english-sense"><span class="english-pos" lang="en">' +
          esc(part) +
          '</span><div lang="en">' +
          senses.slice(0, 3).map(englishSenseHTML).join('') +
          (senses.length > 3
            ? '<details class="english-more"><summary>更多英文释义（' +
              (senses.length - 3) +
              '）</summary>' +
              senses.slice(3).map(englishSenseHTML).join('') +
              '</details>'
            : '') +
          '</div></div>',
      )
      .join('') +
    '<small class="english-source">' +
    esc(value.source) +
    '</small>'
  );
}
function englishBlock(word, supplement = {}, pos = '') {
  if (S.settings.englishDefinitions === false) return '';
  return (
    '<section class="english-definitions" data-english-word="' +
    esc(word) +
    '" data-english-pos="' +
    esc(pos) +
    '" aria-label="英文释义">' +
    englishBody(word, supplement, pos) +
    '</section>'
  );
}
function refreshEnglishBlocks() {
  for (const target of document.querySelectorAll('[data-english-word]')) {
    target.hidden = S.settings.englishDefinitions === false;
    if (!target.hidden)
      target.innerHTML = englishBody(
        target.dataset.englishWord,
        englishSupplement(target.dataset.englishWord),
        target.dataset.englishPos,
      );
  }
}
function prepareEnglishDefinitions() {
  if (S.settings.englishDefinitions === false) return;
  loadEnglishDefinitions()
    .then(refreshEnglishBlocks)
    .catch(() => {});
}
function posOf(e) {
  const m = e.meanings.join(';');
  return /^\s*(?:v[ti]?\.|动)/i.test(m)
    ? 'verb'
    : /^\s*n\./i.test(m)
      ? 'noun'
      : /^\s*adj\./i.test(m)
        ? 'adjective'
        : /^\s*adv\./i.test(m)
          ? 'adverb'
          : '';
}
function phoneticOf(e) {
  const s = e.supplement;
  if (!s) return e.phonetic;
  const p =
    s.phonetics?.find((p) => p.accent === S.settings.accent) || s.phonetics?.find((p) => !p.accent);
  return p?.text || e.phonetic;
}
function sourceLinks(s) {
  const links = s?.sources || [];
  return links
    .map(
      (l) =>
        `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ↗</a>`,
    )
    .join(' · ');
}
function pronunciationHeader(e) {
  const model = senseModel(e, S.settings.accent),
    accent = S.settings.accent === 'us' ? '美音' : '英音';
  return (
    '<div class="phonetic">' +
    (model.ambiguous
      ? '<span>' + accent + '</span>'
      : (model.commonReadings.length
          ? model.commonReadings
              .map((ipa) => '<span class="sense-ipa">' + esc(ipa) + '</span>')
              .join(' ')
          : '<span class="muted">暂无音标，可编辑补充</span>') +
        '<button class="audio-btn" data-action="audio" data-key="' +
        esc(e.key) +
        '">▶ ' +
        accent +
        '</button>') +
    '<button class="text-btn" data-action="accent" data-key="' +
    esc(e.key) +
    '">切换口音</button></div>'
  );
}
function senseSections(e) {
  const model = senseModel(e, S.settings.accent);
  if (!model.ambiguous)
    return (
      '<div class="answer-meanings shared-pronunciation-meanings">' +
      e.meanings.map((m) => '<p>' + esc(m) + '</p>').join('') +
      '</div>'
    );
  return (
    '<div class="sense-groups">' +
    model.groups
      .map(
        (g) =>
          '<section class="sense-group" data-sense-pos="' +
          esc(g.pos) +
          '"><div class="sense-header"><strong class="sense-pos">' +
          esc(g.label) +
          '</strong>' +
          g.readings
            .map(
              (r) =>
                '<div class="sense-pronunciation"><span class="sense-ipa">' +
                esc(r.ipa) +
                '</span>' +
                (!model.ambiguous || r.audio
                  ? '<button class="audio-btn" data-action="audio" data-key="' +
                    esc(e.key) +
                    '" data-pos="' +
                    esc(g.pos) +
                    '" data-strict="' +
                    model.ambiguous +
                    '">▶ ' +
                    (S.settings.accent === 'us' ? '美音' : '英音') +
                    '</button>'
                  : '<span class="muted">该词性' +
                    (S.settings.accent === 'us' ? '美音' : '英音') +
                    '录音待补充</span>') +
                '</div>',
            )
            .join('') +
          (g.unresolved ? '<span class="muted">音标与该词性的对应关系待核实</span>' : '') +
          '</div><div class="sense-definition">' +
          g.meanings.map((m) => '<p>' + esc(m) + '</p>').join('') +
          '</div><span class="sense-audio-status muted" data-audio-status-pos="' +
          esc(g.pos) +
          '" role="status"></span></section>',
      )
      .join('') +
    (model.unmapped.length
      ? '<details class="unmapped-pronunciations"><summary>其他读音：尚未核实对应词性</summary>' +
        model.unmapped.map((p) => '<p>' + esc(p) + ' <small>待核实</small></p>').join('') +
        '</details>'
      : '') +
    '</div>'
  );
}
function answerCard(e) {
  const s = e.supplement;
  const forms = selectVerbForms(e);
  return `<div class="answer-card" id="answer-card"><div class="answer-heading"><div><h2>${esc(e.english)}</h2>${pronunciationHeader(e)}<span id="audio-status" class="muted"></span></div><button class="text-btn" data-action="edit" data-key="${esc(e.key)}">编辑词条 ↗</button></div><div class="recognition-control"><button class="text-btn" data-action="recognition" data-key="${esc(e.key)}">${e.recognitionOnly ? '✓ 仅练认义 · 点击恢复拼写' : '以后只练认义，跳过拼写'}</button></div>${senseSections(e)}${englishBlock(e.english, e.supplement)}<div class="examples"><h3>例句</h3>${
    s?.examples?.length
      ? s.examples
          .slice(0, 2)
          .map(
            (ex, i) =>
              `<div class="example"><span class="example-number">0${i + 1}</span><div><p class="example-en">${esc(ex.en)}</p><p class="example-zh">${esc(ex.zh || '中文译文尚未补充')}</p><small>${esc(ex.source || '词典例句')}${ex.machine ? ' · 中文为机器翻译' : ''}</small></div></div>`,
          )
          .join('')
      : `<p class="muted">${resourceTasks.has(e.key) ? '正在补充例句…' : '暂无例句，可在编辑词条中补充。'}</p>`
  }</div><details class="word-details"><summary>词形、词族与词源 <span>＋</span></summary>${forms.length ? `<h4>动词形态</h4><div class="word-chips">${forms.map((f) => `<span>${esc(f.word)} <small>${esc(f.label)}</small></span>`).join('')}</div>` : ''}${s?.family?.length ? `<h4>词族</h4><div class="word-chips">${s.family.map((f) => `<span>${esc(f.word)} <small>${esc(f.meaning || f.label || '相关派生词')}</small></span>`).join('')}</div>` : ''}${s?.pendingFamily?.length ? `<details class="pending-family"><summary>待补充词族（不进入默认练习） · ${s.pendingFamily.length}</summary><p class="muted">这些关联词的释义或优先级尚待确认。</p><div class="word-chips">${s.pendingFamily.map((f) => `<span>${esc(f.word)} <small>${esc(f.reason)}</small></span>`).join('')}</div></details>` : ''}<h4>词源记忆</h4><p class="etymology">${esc(s?.etymologyZh || s?.etymology || '尚无可核验的词源资料，可联网重试或手动补充。')}</p>${s?.etymologyZh ? `<p class="muted">${esc(s.etymologySource ? '词根线索来源：有道词典 · ' + s.etymologySource : '词源中文为机器翻译或手动补充，请结合原文理解。')}</p>` : ''}${s?.etymologyZh && s.etymology ? `<details><summary>查看 Wiktionary 词源参考</summary><p class="etymology">${esc(s.etymology)}</p></details>` : ''}<button class="secondary" data-action="extend" data-key="${esc(e.key)}">开始拓展练习 →</button></details><div class="source-row"><span>${sourceLinks(s) || esc(e.source)}</span><button class="text-btn" data-action="refresh-resource" data-key="${esc(e.key)}">${resourceTasks.has(e.key) ? '资料获取中…' : '联网补充 / 重试'}</button></div></div>`;
}
function library() {
  const cat = category(S);
  let list = Object.values(S.entries).filter(
    (e) =>
      (view === 'favorite' ? e.favorite : view === 'wrong' ? statsOf(e, cat).wrong > 0 : true) &&
      (!S.settings.group ||
        (S.settings.group === '__ungrouped'
          ? e.groups.length === 0
          : e.groups.includes(S.settings.group))) &&
      norm(e.english + ' ' + e.meanings.join(' ')).includes(norm(search)),
  );
  list.sort(
    sort === 'wrong'
      ? (a, b) => statsOf(b, cat).wrong - statsOf(a, cat).wrong
      : sort === 'recent'
        ? (a, b) => (b.favoritedAt || b.createdAt) - (a.favoritedAt || a.createdAt)
        : (a, b) => a.english.localeCompare(b.english, 'en'),
  );
  const title = view === 'favorite' ? '收藏' : view === 'wrong' ? '常错本' : '词库';
  return `<main class="main library-main"><div class="page-title"><h1>${title}</h1><p>${view === 'favorite' ? '收藏的内容会自动加入加练，也可以在这里集中练习。' : view === 'wrong' ? '仅在一道题的两次机会都答错时记一次错误。历史记录会保留。' : '同一个英文词条合并保存，多种中文释义持续积累。'}</p></div><div class="list-controls"><input id="search" aria-label="搜索词条" placeholder="搜索英文或中文释义…" value="${esc(search)}"><select id="list-group" aria-label="按分组筛选">${groupOptions(S.settings.group)}</select><select id="list-sort" aria-label="排序"><option value="alpha" ${sort === 'alpha' ? 'selected' : ''}>首字母 A–Z</option><option value="wrong" ${sort === 'wrong' ? 'selected' : ''}>错误次数 ↓</option><option value="recent" ${sort === 'recent' ? 'selected' : ''}>最近收藏 / 添加</option></select><button class="secondary" data-action="add">＋ 新建词条</button><button class="secondary" data-action="books">预置词库</button><button class="primary" data-action="import">导入词库</button></div><div class="list-subbar"><span>${list.length} 条内容 · 已选 ${selected.size} 条</span><div><button class="text-btn" data-action="new-group">新建分组</button><button class="text-btn" data-action="batch-group">批量分组</button>${view !== 'library' ? `<button class="text-btn" data-action="practice-list">练习这个列表 →</button>` : ''}</div></div><div class="table-wrap"><table><thead><tr><th><input type="checkbox" id="select-all" aria-label="全选当前列表" ${list.length && list.every((e) => selected.has(e.key)) ? 'checked' : ''}></th><th>英文 / 分组</th><th>中文释义</th><th>正确 / 错误</th><th>收藏</th><th></th></tr></thead><tbody>${
    list.length
      ? list
          .slice(0, 500)
          .map(
            (e) =>
              `<tr><td><input type="checkbox" data-select="${esc(e.key)}" aria-label="选择 ${esc(e.english)}" ${selected.has(e.key) ? 'checked' : ''}></td><td><button class="word-link" data-action="detail" data-key="${esc(e.key)}">${esc(e.english)}</button><small>${esc(e.groups.join(' / ') || '未分组')}${e.recognitionOnly ? ' · 只练认义' : ''}</small></td><td class="table-meaning">${e.meanings.map((m) => esc(m)).join('<br>')}</td><td class="numbers"><span>${statsOf(e, cat).correct}</span> / <span class="red">${statsOf(e, cat).wrong}</span></td><td>${favoriteButton(e)}</td><td><button class="text-btn" data-action="edit" data-key="${esc(e.key)}">编辑</button></td></tr>`,
          )
          .join('')
      : '<tr><td colspan="6" class="empty">这里还没有内容。你可以先导入词库，或换一个分组。</td></tr>'
  }</tbody></table></div>${list.length > 500 ? '<p class="muted">当前显示前 500 条，请使用搜索缩小范围。</p>' : ''}<div class="list-foot"><button class="secondary" data-action="backup">导出完整备份</button><button class="text-btn" data-action="export-csv">导出词库 CSV</button><span>当前成绩类别：${cat === 'typing' ? '拼写' : '选择题'} · <button class="text-btn" data-action="toggle-category">切换查看</button></span></div></main>`;
}
function renderPageShell(content) {
  let host = $('#page-host');
  if (!host) {
    app.innerHTML = header() + '<div id="page-host">' + content + '</div>';
    syncNavigationIndicator();
    return;
  }
  host.innerHTML = content;
  for (const link of document.querySelectorAll('.header nav [data-view]')) {
    const on = link.dataset.view === view;
    link.classList.toggle('active', on);
    if (on) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const dot = $('.header .nav-dot'),
    count = String(Object.values(S.entries).filter((e) => e.favorite).length);
  if (dot && dot.textContent !== count) dot.textContent = count;
  const theme = $('.header [data-action="theme"]'),
    icon = S.settings.theme === 'dark' ? icons.sun : icons.moon;
  if (theme && theme.innerHTML !== icon) theme.innerHTML = icon;
  syncNavigationIndicator();
}
function render(focus = false) {
  geometryObserver?.disconnect();
  stopRoaming();
  document.documentElement.dataset.theme = S.settings.theme;
  const learning = ['practice', 'pasture'].includes(view);
  let content =
    view === 'pasture'
      ? pasturePage(
          S,
          practiceContext(S, {
            mobile: mobileLayout.matches,
            collapsed: !!S.settings.sidebarCollapsed,
            pasture: true,
          }),
          pasturePages,
        )
      : view === 'practice'
        ? practice()
        : library();
  if (view === 'pasture')
    content = content.replace(
      '<main class="main pasture-main">',
      '<main class="main pasture-main" id="main-content" tabindex="-1">',
    );
  if (!learning)
    content = content.replace(
      '<main class="main library-main">',
      '<main class="main library-main" id="main-content" tabindex="-1">',
    );
  renderPageShell(learning ? practiceFrame(content, S, { mobile: mobileLayout.matches }) : content);
  saveStatus();
  bind();
  if (view === 'pasture') stopRoaming = mountSheepRoaming(app);
  if (configOpen && mobileLayout.matches) renderConfigModal();
  else if (focus && !S.aux) setTimeout(() => $('#answer-input')?.focus(), 0);
  if (S.aux) renderAux();
  prepareEnglishDefinitions();
}
function bindPracticeControls(root = document) {
  for (const radio of root.querySelectorAll('input[name="practice-mode"]'))
    radio.addEventListener('change', (ev) => {
      stopAudio();
      active = false;
      S.settings.mode = ev.target.value;
      persist(0);
      render();
      const selected = ev.target.value;
      requestAnimationFrame(() =>
        document.querySelector('input[name="practice-mode"][value="' + selected + '"]')?.focus(),
      );
      if (current()?.finished) ensureResources(entry());
    });
  root.querySelector('#practice-group')?.addEventListener('change', (ev) => {
    S.settings.group = ev.target.value;
    persist();
    render();
    if (current() && !current().finished) toast('当前题已保留，新分组从下一题开始。');
  });
  root.querySelector('#practice-scope')?.addEventListener('change', (ev) => {
    S.settings.scope = ev.target.value;
    persist();
    render();
  });
  root.querySelector('#hint-level')?.addEventListener('input', (ev) => {
    S.settings.hint = Number(ev.target.value);
    if (current()) current().hints = null;
    const label = root.querySelector('#hint-amount');
    if (label)
      label.textContent =
        S.settings.hint >= 1
          ? '100% · 全部显示'
          : S.settings.hint
            ? Math.round(S.settings.hint * 100) + '% 左右'
            : '仅首字母';
    if ($('#hint-display')) {
      $('#hint-display').innerHTML = hintLetters(current(), entry());
      requestAnimationFrame(syncHintGeometry);
    }
    persist(180);
  });
}
function renderConfigModal() {
  showModal(practiceControls(S, { mobile: true }));
  modal.classList.add('practice-config-modal');
  modal.setAttribute('aria-labelledby', 'practice-settings-title');
  document.querySelector('[data-action="config-open"]')?.setAttribute('aria-expanded', 'true');
  bindPracticeControls(modal);
}
function openConfig() {
  configOpen = true;
  renderConfigModal();
}
function toggleSidebar() {
  if (mobileLayout.matches) {
    openConfig();
    return;
  }
  const frame = document.querySelector('.practice-workspace');
  if (!frame) return;
  S.settings.sidebarCollapsed = !S.settings.sidebarCollapsed;
  applySidebarState(frame, !!S.settings.sidebarCollapsed);
  persist();
}
mobileLayout.addEventListener('change', () => {
  if (!S) return;
  if (configOpen) {
    configOpen = false;
    modal.close();
    modal.innerHTML = '';
    modal.classList.remove('practice-config-modal');
  }
  render();
});

function bind() {
  bindPracticeControls();
  if ($('#hint-display')) {
    geometryObserver ??= new ResizeObserver(() => requestAnimationFrame(syncHintGeometry));
    geometryObserver.observe($('#hint-typing-line'));
    const field = $('#answer-input');
    field.addEventListener('scroll', syncHintGeometry);
    field.addEventListener('keyup', () => requestAnimationFrame(syncHintGeometry));
    requestAnimationFrame(syncHintGeometry);
  }
  $('#answer-input')?.addEventListener('input', (ev) => {
    const q = current();
    if (q && !q.finished) {
      q.input = ev.target.value;
      if ($('#hint-display')) {
        $('#hint-display').innerHTML = hintLetters(q, entry());
        requestAnimationFrame(syncHintGeometry);
      }
      active = true;
      lastTick = performance.now();
      persist(220);
    }
  });
  $('#answer-input')?.addEventListener('blur', () => {
    active = false;
    lastTick = 0;
  });
  $('#list-group')?.addEventListener('change', (ev) => {
    S.settings.group = ev.target.value;
    persist();
    render();
  });
  $('#search')?.addEventListener('input', (ev) => {
    search = ev.target.value;
    const pos = ev.target.selectionStart;
    render();
    $('#search')?.focus();
    $('#search')?.setSelectionRange(pos, pos);
  });
  $('#list-sort')?.addEventListener('change', (ev) => {
    sort = ev.target.value;
    render();
  });
  document.querySelectorAll('[data-select]').forEach((el) =>
    el.addEventListener('change', () => {
      el.checked ? selected.add(el.dataset.select) : selected.delete(el.dataset.select);
      render();
    }),
  );
  $('#select-all')?.addEventListener('change', (ev) => {
    document.querySelectorAll('[data-select]').forEach((el) => {
      if (ev.target.checked) selected.add(el.dataset.select);
      else selected.delete(el.dataset.select);
    });
    render();
  });
}
async function checkAnswer(value) {
  const q = current();
  if (!q || q.finished || S.aux) return;
  const input = value ?? $('#answer-input')?.value ?? '';
  if (!String(input).trim()) {
    toast('先输入答案，再检查。');
    return;
  }
  active = false;
  lastTick = 0;
  const result = submit(S, input);
  persist(0);
  render(true);
  if (result === 'retry') {
    const el = $('#answer-input');
    el?.focus();
    el?.select();
  } else if (q.finished) {
    ensureResources(entry());
    if (S.settings.autoAudio) playWord(entry());
  }
}
function skipCurrent() {
  if (!current() || current().finished) return;
  stopAudio();
  active = false;
  lastTick = 0;
  if (skipQuestion(S)) {
    persist(0);
    render();
    ensureResources(entry());
    if (S.settings.autoAudio) playWord(entry());
  }
}
function toggleRecognition(key) {
  const e = S.entries[key];
  if (!e) return;
  e.recognitionOnly = !e.recognitionOnly;
  persist(0);
  if (modal.open) {
    modal.close();
    modal.innerHTML = '';
  }
  render();
  toast(e.recognitionOnly ? '已设为只练认义：以后不再出拼写题，选择题保留。' : '已恢复拼写练习。');
}
function start() {
  review = null;
  stopAudio();
  S.aux = null;
  const old = current();
  if (old && !old.finished) {
    render(true);
    return;
  }
  const q = nextQuestion(S);
  persist(0);
  render(true);
  if (!q) showCompletion();
}
function previous() {
  const found = previousQuestion(S, reviewedQuestion() ? review.index : undefined);
  if (!found) return;
  if (modal.open) closeModal();
  stopAudio();
  active = false;
  lastTick = 0;
  review = { category: category(S), round: S.rounds[category(S)].number, index: found.index };
  render();
  ensureResources(entry());
}
function resumeQuestion() {
  stopAudio();
  active = false;
  lastTick = 0;
  review = null;
  render(true);
  if (current()?.finished) ensureResources(entry());
}
function next() {
  if (reviewedQuestion()) {
    const r = S.rounds[category(S)],
      limit = reviewLimit();
    let i = review.index + 1;
    while (i < limit && !S.entries[r.history[i]?.key]) i++;
    if (i < limit) {
      stopAudio();
      review.index = i;
      render();
      ensureResources(entry());
    } else resumeQuestion();
    return;
  }
  if (!current()?.finished) return;
  stopAudio();
  S.rounds[category(S)].current = null;
  start();
}
function showCompletion() {
  const r = S.rounds[category(S)],
    all = Object.values(S.entries).filter((e) => category(S) !== 'typing' || !e.recognitionOnly),
    globalDone = all.every((e) => r.done.includes(e.key));
  showModal(
    `<div class="modal-mark">✓</div><h2>${globalDone ? '本轮基础内容已完成' : '当前筛选范围已练完'}</h2><p>${globalDone ? '本轮的词条和可用加练已完成。你可以开始新一轮，或继续整理词库。' : '其他分组可能还有未练词。你可以切换到全部内容继续当前轮次。'}</p><div class="modal-actions">${globalDone ? '<button class="primary" data-action="new-round">开始下一轮</button>' : '<button class="primary" data-action="all-scope">继续全部内容</button>'}${previousQuestion(S) ? previousButton() : ''}<button class="secondary" data-action="close-modal">返回</button></div>`,
  );
}
function showModal(html) {
  if (!html.includes('practice-settings-title')) {
    configOpen = false;
    modal.removeAttribute('aria-labelledby');
    document.querySelector('[data-action="config-open"]')?.setAttribute('aria-expanded', 'false');
  }
  modal.classList.toggle('practice-config-modal', configOpen);
  active = false;
  modal.innerHTML = `<button class="close-modal" data-action="close-modal" aria-label="关闭">×</button><div class="modal-scroll" tabindex="0" role="region" aria-label="弹窗内容">${html}</div>`;
  if (!modal.open) modal.showModal();
}
function closeModal() {
  if (S?.aux) stopAudio();
  const wasConfig = configOpen;
  configOpen = false;
  modal.close();
  modal.innerHTML = '';
  modal.classList.remove('practice-config-modal');
  modal.removeAttribute('aria-labelledby');
  if (S?.aux) {
    S.aux = null;
    persist();
  }
  if (wasConfig) {
    const button = document.querySelector('[data-action="config-open"]');
    button?.setAttribute('aria-expanded', 'false');
    button?.focus();
  } else $('#answer-input')?.focus();
}
function toggleFavorite(key) {
  const e = S.entries[key];
  e.favorite = !e.favorite;
  e.favoritedAt = e.favorite ? Date.now() : 0;
  if (e.favorite && S.rounds[category(S)].done.includes(key)) schedule(S, e);
  persist(0);
  const pos = $('#answer-input')?.selectionStart;
  render();
  if (view === 'practice' && !modal.open) {
    $('#answer-input')?.focus();
    if (pos !== undefined) $('#answer-input')?.setSelectionRange(pos, pos);
  }
  toast(e.favorite ? '已收藏，将安排加练。' : '已取消收藏。');
}
function download(name, text, type = 'application/json') {
  const a = document.createElement('a'),
    u = URL.createObjectURL(new Blob([text], { type }));
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
function backup() {
  download(
    '咩词完整备份-' + new Date().toISOString().slice(0, 10) + '.json',
    JSON.stringify(
      { kind: 'ielts-studio-backup', exportedAt: new Date().toISOString(), state: S },
      null,
      2,
    ),
  );
  toast('备份包含词库、收藏、分组、成绩和本轮进度。');
}
async function restoreFile(file) {
  try {
    const raw = JSON.parse(await file.text());
    const state = raw.kind === 'ielts-studio-backup' ? raw.state : raw;
    if (state.version !== 1 || !state.entries || !state.rounds || !state.settings)
      throw Error('请选择本工具导出的完整备份');
    showModal(
      `<h2>恢复这份备份？</h2><p>备份包含 ${Object.keys(state.entries).length} 条词条。恢复会替换当前数据；替换前会在本机自动保留一份当前数据备份。</p><div class="modal-actions"><button class="primary" id="confirm-restore">恢复备份</button><button class="secondary" data-action="close-modal">取消</button></div>`,
    );
    $('#confirm-restore').onclick = async () => {
      try {
        await flush();
        if (saveError) throw Error(saveError);
        const revision = S.revision;
        state.aux = null;
        ensureWallet(state);
        const r = await api('/api/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state, expectedRevision: revision, restore: true }),
        });
        review = null;
        S = state;
        S.revision = r.revision;
        dirty = saved = 0;
        closeModal();
        render();
        toast('备份已恢复。');
      } catch (e) {
        toast(e.message);
      }
    };
  } catch (e) {
    toast('恢复失败：' + e.message);
  }
}
const csvCell = (v) => '"' + String(v ?? '').replaceAll('"', '""') + '"';
function exportCSV() {
  const rows = [
    ['english', 'meaning', 'phonetic', 'type', 'groups'],
    ...Object.values(S.entries).map((e) => [
      e.english,
      e.meanings.join('\n'),
      e.phonetic,
      e.type,
      e.groups.join('|'),
    ]),
  ];
  download(
    '咩词词库.csv',
    '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'),
    'text/csv;charset=utf-8',
  );
}
function parseCSV(text) {
  const rows = [];
  let row = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === ',' || c === '\t')) {
      row.push(cell);
      cell = '';
    } else if (!quoted && (c === '\n' || c === '\r')) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (quoted) throw Error('CSV 引号没有闭合');
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
function importModal() {
  showModal(
    `<h2>导入词库</h2><p>支持有道 .bin、CSV / TSV、词条 JSON。相同英文会合并中文释义，并保留成绩与进度。</p><label class="field">导入到分组<select id="import-group"><option value="">暂不分组</option>${S.groups.map((g) => `<option>${esc(g)}</option>`).join('')}</select></label><label class="field">或新建分组<input id="import-new-group" placeholder="可选，如：雅思写作"></label><label class="file-drop">选择导入文件<input id="import-file" type="file" accept=".bin,.csv,.tsv,.json,.txt"></label><p class="muted">CSV 表头：english, meaning, phonetic, type, groups<br>也支持无表头的“英文［Tab］中文”。词条必须有英文和中文。</p><details><summary>粘贴导入</summary><textarea id="paste-import" rows="5" placeholder="apply&#9;v. 申请；应用&#10;on the fence&#9;犹豫不决"></textarea><button class="secondary" id="paste-import-btn">解析粘贴内容</button></details><div id="import-preview" class="import-preview"></div><div class="modal-actions"><button class="text-btn" data-action="books">选择预置词库</button><button class="text-btn" data-action="restore-picker">恢复完整备份</button></div>`,
  );
  $('#import-file').onchange = () => loadImport($('#import-file').files[0]);
  $('#paste-import-btn').onclick = () =>
    loadImport(new File([$('#paste-import').value], '粘贴内容.tsv'));
}
function rowsFromText(text) {
  const rows = parseCSV(text.replace(/^\ufeff/, ''));
  if (!rows.length) throw Error('文件没有词条');
  const head = rows[0].map(norm),
    hasHeader = head.some((v) => ['english', 'word', '英文', '单词'].includes(v));
  let columns = { en: 0, zh: 1, phonetic: -1, type: -1, groups: -1 };
  if (hasHeader) {
    const find = (names) => head.findIndex((h) => names.includes(h));
    columns = {
      en: find(['english', 'word', '英文', '单词']),
      zh: find(['meaning', 'meanings', 'chinese', '中文', '释义', '中文释义']),
      phonetic: find(['phonetic', '音标']),
      type: find(['type', '类型']),
      groups: find(['groups', 'group', '分组']),
    };
    rows.shift();
    if (columns.en < 0 || columns.zh < 0) throw Error('需要英文和中文释义两列');
  }
  return rows.map((r) => ({
    english: r[columns.en],
    meanings:
      hasHeader && r[columns.zh]?.includes('\n') ? r[columns.zh].split('\n') : [r[columns.zh]],
    phonetic: r[columns.phonetic] || '',
    type: r[columns.type] || undefined,
    groups: r[columns.groups] ? r[columns.groups].split('|').filter(Boolean) : [],
    source: 'CSV / 文本导入',
  }));
}
async function loadImport(file) {
  if (!file) return;
  const box = $('#import-preview');
  box.textContent = '正在解析，请稍候…';
  try {
    let rows;
    if (/\.bin$/i.test(file.name))
      rows = (await api('/api/import-bin', { method: 'POST', body: await file.arrayBuffer() }))
        .rows;
    else if (/\.json$/i.test(file.name)) {
      const raw = JSON.parse(await file.text());
      if (raw.kind === 'ielts-studio-backup') {
        box.textContent = '这是完整备份，请使用下方“恢复完整备份”。';
        return;
      }
      rows = Array.isArray(raw) ? raw : raw.rows || raw.entries;
      if (!Array.isArray(rows)) throw Error('词条 JSON 须为数组，或包含 rows 数组');
    } else rows = rowsFromText(await file.text());
    if (!rows.length) throw Error('没有可导入词条');
    const invalid = rows.filter(
      (r) =>
        !String(r.english || r.word || '').trim() ||
        !(
          r.meaning ||
          r.chinese ||
          (Array.isArray(r.meanings) && r.meanings.some((m) => String(m).trim()))
        ),
    ).length;
    if (invalid)
      throw Error(`有 ${invalid} 行缺少英文或释义，请修正后重新导入；尚未写入任何内容。`);
    box.innerHTML = `<strong>已解析 ${rows.length} 条，尚未写入</strong><p>${rows
      .slice(0, 3)
      .map(
        (r) =>
          esc(r.english || r.word) +
          ' — ' +
          esc((r.meanings || [r.meaning || r.chinese]).join('；')),
      )
      .join('<br>')}</p><button class="primary" id="confirm-import">确认导入</button>`;
    $('#confirm-import').onclick = () => {
      const group = $('#import-new-group').value.trim() || $('#import-group').value;
      const r = mergeEntries(S, rows, group);
      persist(0);
      closeModal();
      render();
      toast(`导入完成：新增 ${r.added} 条，合并补充 ${r.updated} 条，重复跳过 ${r.skipped} 条。`);
    };
  } catch (e) {
    box.textContent = '解析失败：' + e.message;
  }
}
function editModal(key) {
  const e = key ? S.entries[key] : null;
  showModal(
    `<h2>${e ? '编辑词条' : '添加词条'}</h2><form id="edit-form"><label class="field">英文<input id="edit-english" required value="${esc(e?.english || '')}" ${e ? 'readonly' : ''}></label><label class="field">中文释义及词性（不同记录分行）<textarea id="edit-meanings" required rows="4">${esc(e?.meanings.join('\n') || '')}</textarea></label><div class="form-grid"><label class="field">类型<select id="edit-type">${[
      ['word', '单词'],
      ['phrase', '短语'],
      ['sentence', '句子'],
    ]
      .map(([v, l]) => `<option value="${v}" ${e?.type === v ? 'selected' : ''}>${l}</option>`)
      .join(
        '',
      )}</select></label><label class="field">音标<input id="edit-phonetic" value="${esc(e?.phonetic || '')}"></label></div><label class="setting-row"><span>只练认义，不练拼写</span><input id="edit-recognition" type="checkbox" ${e?.recognitionOnly ? 'checked' : ''}></label><label class="field">所属分组（用 | 分隔；留空为未分组）<input id="edit-groups" value="${esc(e?.groups.join('|') || '')}" placeholder="阅读 | 写作"></label><details><summary>例句、词形、词族与词源资料</summary><label class="field">例句（每行 英文 | 中文）<textarea id="edit-examples" rows="3">${esc((e?.supplement?.examples || []).map((x) => x.en + ' | ' + (x.zh || '')).join('\n'))}</textarea></label><label class="field">动词形态（每行 形态标签 | 英文）<textarea id="edit-forms" rows="4" placeholder="过去式 / 过去分词 | applied">${esc((e?.supplement?.forms || []).map((x) => x.label + ' | ' + x.word).join('\n'))}</textarea></label><label class="field">常用词族（每行 英文 | 中文及词性）<textarea id="edit-family" rows="3">${esc((e?.supplement?.family || []).map((x) => x.word + ' | ' + (x.meaning || '')).join('\n'))}</textarea></label><label class="field">词源中文或记忆提示<textarea id="edit-etym" rows="3">${esc(e?.supplement?.etymologyZh || '')}</textarea></label></details><div class="modal-actions"><button class="primary" type="submit">保存词条</button><button class="secondary" type="button" data-action="close-modal">取消</button></div></form>`,
  );
  $('#edit-form').onsubmit = (ev) => {
    ev.preventDefault();
    const english = $('#edit-english').value.trim(),
      meanings = $('#edit-meanings')
        .value.split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
      groups = $('#edit-groups')
        .value.split('|')
        .map((x) => x.trim())
        .filter(Boolean);
    if (!english || !meanings.length) return;
    const existing = S.entries[norm(english)];
    if (!e && existing) {
      toast('该英文已经存在，请编辑已有词条或使用导入合并。');
      return;
    }
    if (!e)
      mergeEntries(S, [
        {
          english,
          meanings,
          groups,
          type: $('#edit-type').value,
          phonetic: $('#edit-phonetic').value.trim(),
        },
      ]);
    const item = e || S.entries[norm(english)];
    item.meanings = uniq(meanings);
    item.groups = uniq(groups);
    item.type = $('#edit-type').value;
    item.recognitionOnly = $('#edit-recognition').checked;
    item.phonetic = $('#edit-phonetic').value.trim();
    groups.forEach((g) => {
      if (!S.groups.includes(g)) S.groups.push(g);
    });
    const splitLines = (id) =>
      $(id)
        .value.split('\n')
        .map((l) => l.split('|').map((x) => x.trim()))
        .filter((r) => r[0]);
    item.supplement = {
      ...item.supplement,
      examples: splitLines('#edit-examples').map(([en, zh]) => ({
        en,
        zh: zh || '',
        source: '手动补充',
      })),
      forms: splitLines('#edit-forms')
        .filter((r) => r[1])
        .map(([label, word]) => ({ label, word })),
      family: splitLines('#edit-family').map(([word, meaning]) => ({
        word,
        meaning: meaning || '',
      })),
      etymologyZh: $('#edit-etym').value.trim(),
      manual: true,
    };
    persist(0);
    closeModal();
    render();
    toast('词条已保存。');
  };
}
function groupModal(batch = false) {
  if (batch && !selected.size) {
    toast('请先勾选需要分组的词条。');
    return;
  }
  showModal(
    `<h2>${batch ? '整理选中的 ' + selected.size + ' 条词条' : '新建分组'}</h2><label class="field">分组名称<input id="new-group-name" list="group-names" placeholder="如：写作表达"><datalist id="group-names">${S.groups.map((g) => `<option value="${esc(g)}">`).join('')}</datalist></label>${batch ? '<label class="field">整理方式<select id="batch-group-mode"><option value="add">添加到该分组，保留原分组</option><option value="replace">移动到该分组，替换原分组</option><option value="remove">从该分组移除</option><option value="clear">移到未分组，清除所有分组</option></select></label>' : ''}<p class="muted">重新分组不会清空成绩，也不会重置本轮进度。</p><div class="modal-actions"><button class="primary" id="save-group">保存</button><button class="secondary" data-action="close-modal">取消</button></div>`,
  );
  $('#save-group').onclick = () => {
    const name = $('#new-group-name').value.trim(),
      mode = $('#batch-group-mode')?.value;
    if (!name && mode !== 'clear') {
      toast('请输入分组名称');
      return;
    }
    if (name && !S.groups.includes(name)) S.groups.push(name);
    if (batch) {
      for (const key of selected) {
        const e = S.entries[key];
        if (!e) continue;
        if (mode === 'clear') e.groups = [];
        if (mode === 'replace') e.groups = [name];
        if (mode === 'add') e.groups = uniq([...e.groups, name]);
        if (mode === 'remove') e.groups = e.groups.filter((g) => g !== name);
      }
      selected.clear();
    }
    persist(0);
    closeModal();
    render();
    toast('分组已保存。');
  };
}
function settingsModal() {
  showModal(
    `<h2>设置</h2><div class="settings-grid"><label class="setting-row"><span>显示英文释义<small>练习题、答案、原词照打及词形词族练习统一开关</small></span><input id="setting-english" type="checkbox" ${S.settings.englishDefinitions !== false ? 'checked' : ''}></label><label class="setting-row"><span>答案出现自动发音<small>默认美音；只在答案展示后播放</small></span><input id="setting-auto" type="checkbox" ${S.settings.autoAudio ? 'checked' : ''}></label><label class="setting-row"><span>发音口音<small>录音不足时使用对应口音的系统合成朗读</small></span><select id="setting-accent"><option value="us" ${S.settings.accent === 'us' ? 'selected' : ''}>美音 en-US</option><option value="uk" ${S.settings.accent === 'uk' ? 'selected' : ''}>英音 en-GB</option></select></label><label class="setting-row"><span>句子严格检查大小写<small>单词和短语始终忽略大小写及首尾空格</small></span><input id="setting-case" type="checkbox" ${S.settings.strictCase ? 'checked' : ''}></label><label class="setting-row"><span>句子严格检查标点</span><input id="setting-punctuation" type="checkbox" ${S.settings.strictPunctuation ? 'checked' : ''}></label></div><p class="muted">速度按 5 个字符折算为 1 个标准词。有效打字时间按连续输入计算，超过 5 秒未操作暂停计时；阅读答案、听发音、窗口失焦及拓展练习不计入正式速度。</p><div class="modal-actions"><button class="primary" id="save-settings">保存设置</button><button class="secondary" data-action="backup">导出完整备份</button><button class="text-btn" data-action="restore-picker">恢复备份</button></div><p class="muted">默认拓展快捷键 Ctrl＋Alt＋E；也会尝试识别 Fn＋Alt。Fn 是否可识别取决于键盘。</p>`,
  );
  $('#save-settings').onclick = () => {
    S.settings.englishDefinitions = $('#setting-english').checked;
    S.settings.autoAudio = $('#setting-auto').checked;
    S.settings.accent = $('#setting-accent').value;
    S.settings.strictCase = $('#setting-case').checked;
    S.settings.strictPunctuation = $('#setting-punctuation').checked;
    persist(0);
    closeModal();
    render();
    toast('设置已保存。');
  };
}
function cleanHTML(html) {
  return html
    .replace(/<(script|style|iframe|object|svg)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<(?:img|link|input|video|audio|source)\b[^>]*>/gi, '');
}
function parseWiki(html, word) {
  const doc = new DOMParser().parseFromString(cleanHTML(html || ''), 'text/html');
  const english = doc.getElementById('English');
  if (!english) return { forms: [], family: [], etymology: '', lemma: null };
  const root = doc.createElement('div');
  let node = english.closest('.mw-heading') || english;
  while ((node = node.nextElementSibling)) {
    if (node.matches('.mw-heading2,h2')) break;
    root.appendChild(node.cloneNode(true));
  }
  // Use the first English etymology: don't mix a different homograph's pronunciation or family.
  const secondEtym = root.querySelector('[id="Etymology_2"]');
  if (secondEtym) {
    let block = secondEtym.closest('.mw-heading') || secondEtym;
    while (block) {
      const next = block.nextElementSibling;
      block.remove();
      block = next;
    }
  }
  const forms = [],
    formTypes = [
      ['s-verb-form-form-of', '第三人称单数'],
      ['ing-form-form-of', '现在分词'],
      ['ed-form-form-of', '过去式 / 过去分词'],
      ['past-form-form-of', '过去式'],
      ['pp-form-form-of', '过去分词'],
    ];
  for (const [cls, label] of formTypes) {
    for (const el of root.querySelectorAll('.headword-line .' + cls)) {
      const w = el.textContent.trim();
      if (w && w.length < 80) forms.push({ word: w, label });
    }
  }
  if (forms.length) forms.unshift({ word, label: '原形' });
  let lemma = null;
  if (!forms.length) {
    const link = root.querySelector('.form-of-definition-link a');
    if (link) lemma = link.textContent.trim();
  }
  const family = [];
  for (const id of ['Derived_terms', 'Related_terms']) {
    const heading = root.querySelector('[id="' + id + '"]');
    if (!heading) continue;
    const h = heading.closest('.mw-heading') || heading;
    const level = Number(heading.tagName.slice(1));
    let el = h.nextElementSibling;
    while (el) {
      const nextHeading = el.matches('.mw-heading')
        ? el.querySelector('h2,h3,h4,h5,h6')
        : el.matches('h2,h3,h4,h5,h6')
          ? el
          : null;
      if (nextHeading && Number(nextHeading.tagName.slice(1)) <= level) break;
      for (const a of el.querySelectorAll('[lang="en"] a[href^="/wiki/"]')) {
        const w = a.textContent.trim();
        if (
          w &&
          w.length < 55 &&
          norm(w) !== norm(word) &&
          !w.includes(':') &&
          !family.some((f) => f.word === w)
        )
          family.push({ word: w, label: '派生 / 相关词' });
      }
      el = el.nextElementSibling;
    }
  }
  // Common members first; the remaining list is shown for discovery, not invented from suffixes.
  const preferred = {
    apply: ['application', 'applicable', 'applicant'],
    retrieve: ['retrieval', 'retriever'],
    implement: ['implementation'],
    execute: ['execution', 'executive'],
    attribute: ['attribution', 'attributable'],
    query: ['querying'],
  };
  const priority = preferred[norm(word)] || [];
  family.sort((a, b) => {
    const ai = priority.indexOf(a.word),
      bi = priority.indexOf(b.word);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  let etymology = '';
  const etymHeading = root.querySelector('[id^="Etymology"]');
  if (etymHeading) {
    let el = (etymHeading.closest('.mw-heading') || etymHeading).nextElementSibling;
    while (el) {
      if (el.matches('.mw-heading,h2,h3,h4,h5,h6')) break;
      if (el.tagName === 'P') {
        const text = el.textContent.replace(/\[\d+\]/g, '').trim();
        if (text) {
          etymology = text;
          break;
        }
      }
      el = el.nextElementSibling;
    }
  }
  const examples = uniq(
    [...root.querySelectorAll('.h-usage-example .e-example')]
      .map((el) => el.textContent.trim())
      .filter((t) => t.length > 10 && t.length < 500),
  )
    .sort((a, b) => Number(/^[A-Z]/.test(b)) - Number(/^[A-Z]/.test(a)))
    .slice(0, 2)
    .map((en) => ({ en, zh: '', source: 'Wiktionary 用例' }));
  return {
    forms: uniqForms(forms),
    family: family.slice(0, 8),
    etymology: etymology.slice(0, 1800),
    lemma,
    examples,
  };
}
function uniqForms(forms) {
  const out = [];
  for (const f of forms) {
    const existing = out.find((x) => norm(x.word) === norm(f.word));
    if (existing && !existing.label.includes(f.label)) existing.label += ' / ' + f.label;
    else if (!existing) out.push(f);
  }
  return out;
}
async function translated(text) {
  try {
    return (
      await api('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
    ).text;
  } catch {
    return '';
  }
}
function refreshAnswerOnly(key) {
  if (view !== 'practice' || entry()?.key !== key || !current()?.finished || modal.open) return;
  const old = $('#answer-card');
  if (old) {
    const open = old.querySelector('.word-details')?.open;
    old.outerHTML = answerCard(S.entries[key]);
    if (open) $('#answer-card .word-details').open = true;
  }
}
async function ensureResources(e, force = false) {
  if (!e || resourceTasks.has(e.key)) return resourceTasks.get(e?.key);
  if (
    e.supplement?.familyVersion === 2 &&
    e.supplement?.pronunciationVersion === 1 &&
    e.supplement?.checked &&
    !force &&
    (e.supplement.complete || Date.now() - e.supplement.checkedAt < 60000)
  )
    return e.supplement;
  const identity = e;
  const task = (async () => {
    try {
      const raw = await api(
        '/api/lookup?word=' + encodeURIComponent(e.english) + (force ? '&refresh=1' : ''),
      );
      if (S.entries[e.key] !== identity) return;
      const importedPos = posOf(e),
        d =
          raw.dictionary.find(
            (d) => importedPos && d.meanings?.some((m) => m.partOfSpeech === importedPos),
          ) || raw.dictionary[0];
      const wiki = parseWiki(raw.wiki, e.english);
      let shape = wiki;
      if (wiki.lemma && norm(wiki.lemma) !== norm(e.english)) {
        const lemmaRaw = await api('/api/lookup?word=' + encodeURIComponent(wiki.lemma));
        const lemmaData = parseWiki(lemmaRaw.wiki, wiki.lemma);
        shape = {
          ...lemmaData,
          lemma: wiki.lemma,
          etymology: wiki.etymology || lemmaData.etymology,
        };
      }
      const yd = raw.youdao;
      if (yd?.forms?.length)
        shape.forms = uniqForms([{ word: yd.lemma || e.english, label: '原形' }, ...yd.forms]);
      const familySelection = selectFamily(
        e.english,
        shape.family || [],
        yd?.family || [],
        e.supplement?.manual ? e.supplement.family || [] : [],
      );
      shape.family = familySelection.family;
      const old = e.supplement || {},
        phonetics = (d?.phonetics || [])
          .filter((p) => p.text)
          .map((p) => ({
            text: p.text,
            accent: /[-_/]uk[.\-_/]/.test(p.audio || '')
              ? 'uk'
              : /[-_/]us[.\-_/]/.test(p.audio || '')
                ? 'us'
                : '',
            audio: p.audio || '',
            license: p.license,
          }));
      for (const accent of ['uk', 'us'])
        if (yd?.phonetics?.[accent])
          phonetics.unshift({ accent, text: '/' + yd.phonetics[accent] + '/', audio: 'youdao' });
      if (!phonetics.length && d?.phonetic) phonetics.push({ text: d.phonetic, accent: '' });
      const dictExamples = uniq(
        (d?.meanings || [])
          .flatMap((m) => (m.definitions || []).map((v) => v.example))
          .filter(Boolean),
      )
        .filter((v) => v.length > 10 && v.length < 500)
        .sort((a, b) => Number(/^[A-Z]/.test(b)) - Number(/^[A-Z]/.test(a)))
        .slice(0, 2)
        .map((en) => ({ en, zh: '', source: 'Free Dictionary / Wiktionary' }));
      if (!phonetics.length && old.phonetics?.length) phonetics.push(...old.phonetics);
      if (!e.phonetic && phonetics.length)
        e.phonetic =
          phonetics.find((p) => p.accent === S.settings.accent)?.text || phonetics[0].text;
      const english = definitionsFromLookup(raw, e.english);
      e.supplement = {
        ...old,
        ...(english.senses.length
          ? { englishDefinitions: english.senses, englishDefinitionSource: english.source }
          : {}),
        phonetics,
        pronunciationGroups: raw.pronunciationGroups || [],
        pronunciationVersion: raw.pronunciationVersion || 1,
        forms: selectVerbForms(
          e,
          old.manual && old.forms?.length
            ? old.forms
            : shape.forms?.length
              ? shape.forms
              : old.forms || [],
        ),
        family: shape.family,
        pendingFamily: familySelection.pendingFamily,
        familyVersion: 2,
        lemma: shape.lemma,
        etymology: old.manual && old.etymology ? old.etymology : shape.etymology,
        examples: old.examples?.length
          ? old.examples
          : yd?.examples?.length
            ? yd.examples
            : dictExamples.length
              ? dictExamples
              : wiki.examples || [],
        etymologyZh: old.etymologyZh || yd?.etymologyZh || '',
        etymologySource: old.etymologyZh ? old.etymologySource || '' : yd?.etymologySource || '',
        sources: [
          ...(yd
            ? [
                {
                  label: '有道词典',
                  url:
                    'https://dict.youdao.com/result?word=' +
                    encodeURIComponent(e.english) +
                    '&lang=en',
                },
              ]
            : []),
          { label: 'Wiktionary · CC BY-SA', url: raw.source },
          { label: 'Free Dictionary API', url: 'https://dictionaryapi.dev/' },
        ],
        checked: !raw.offline,
        complete: !!(raw.youdao && raw.wiki),
        checkedAt: Date.now(),
      };
      persist();
      refreshAnswerOnly(e.key);
      refreshEnglishBlocks();
      const jobs = [];
      for (const ex of e.supplement.examples || [])
        if (!ex.zh)
          jobs.push(
            translated(ex.en).then((zh) => {
              if (zh) {
                ex.zh = zh;
                ex.machine = true;
              }
            }),
          );
      if (e.supplement.etymology && !e.supplement.etymologyZh)
        jobs.push(
          translated(e.supplement.etymology).then((zh) => {
            if (zh) e.supplement.etymologyZh = zh;
          }),
        );
      await Promise.allSettled(jobs);
      if (S.entries[e.key] === identity) {
        persist();
        refreshAnswerOnly(e.key);
        refreshEnglishBlocks();
      }
      return e.supplement;
    } catch (err) {
      if (force) toast(err.message);
      return e.supplement || {};
    } finally {
      resourceTasks.delete(e.key);
      refreshAnswerOnly(e.key);
    }
  })();
  resourceTasks.set(e.key, task);
  refreshAnswerOnly(e.key);
  return task;
}
async function playWord(e, requestedPos, options = {}) {
  if (!e) return;
  stopAudio();
  const epoch = audioEpoch,
    accent = options.accent || S.settings.accent,
    model = senseModel(e, accent),
    pos = requestedPos || posOf(e) || model.groups[0]?.pos || '',
    strict = model.ambiguous;
  const status = (t) => {
    if (epoch !== audioEpoch) return;
    const target = options.statusId
      ? document.getElementById(options.statusId)
      : [...document.querySelectorAll('[data-audio-status-pos]')].find(
          (el) => el.dataset.audioStatusPos === pos,
        ) || (!options.statusId ? $('#audio-status') : null);
    if (target) target.textContent = t;
  };
  status('正在准备发音…');
  try {
    const source = await audioSource(e, accent, pos, strict);
    if (epoch !== audioEpoch) {
      source.revoke?.();
      return;
    }
    audio = new Audio(source.url);
    audio.onended = () => source.revoke?.();
    audio.onerror = () => source.revoke?.();
    await audio.play();
    status(source.label + ' · ' + (accent === 'us' ? '美音' : '英音'));
  } catch {
    if (epoch !== audioEpoch) return;
    if (strict) {
      status('该词性和口音的录音暂不可用，请参考上方已核实音标。');
      return;
    }
    if (!window.speechSynthesis) {
      status('当前浏览器不支持朗读，可稍后重试词典录音。');
      return;
    }
    const lang = accent === 'us' ? 'en-US' : 'en-GB';
    const voices = speechSynthesis.getVoices();
    const voice = voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase());
    if (!voice) {
      status(
        '暂无' +
          (accent === 'us' ? '美音' : '英音') +
          '录音，且系统没有对应口音语音。可在设备或浏览器的语音设置中安装后重试。',
      );
      return;
    }
    const utterance = new SpeechSynthesisUtterance(e.english);
    utterance.lang = lang;
    utterance.voice = voice;
    utterance.rate = 0.9;
    speechSynthesis.speak(utterance);
    status('系统合成朗读 · ' + voice.name);
  }
}
function repeat() {
  const q = current();
  if (!q || (!q.finished && q.tries === 0)) {
    toast('提交过答案后，才能进入原词照打。');
    return;
  }
  stopAudio();
  S.aux = {
    type: 'repeat',
    copy: true,
    index: 0,
    text: '',
    items: [{ word: entry().english, label: '原词照打', meaning: entry().meanings.join('；') }],
    done: 0,
    wrongKeys: 0,
  };
  persist();
  renderAux();
}
async function extend(key) {
  const e = key ? S.entries[key] : entry();
  if (!e || (!key && !current()?.finished)) {
    toast('答案展示后可以进入词形与词族拓展。');
    return;
  }
  stopAudio();
  showModal('<h2>正在准备拓展练习…</h2><p>正在读取词形与同源词资料。</p>');
  await ensureResources(e);
  if (!modal.open) return;
  const items = extensionItems(e);
  if (!items.length) {
    showModal(
      `<h2>暂时没有可练的拓展资料</h2><p>${verbMeanings(e).length ? '动词词形或同源词资料待补充。' : '当前收录释义没有常用动词义，暂无可练的同源词。'}</p><div class="modal-actions"><button class="primary" data-action="edit" data-key="${esc(e.key)}">编辑词条</button><button class="secondary" data-action="close-modal">返回答案</button></div>`,
    );
    return;
  }
  S.aux = {
    type: 'extend',
    copy: S.settings.extensionCopy !== false,
    index: 0,
    text: '',
    items,
    root: e.english,
    done: 0,
    wrongKeys: 0,
  };
  persist();
  renderAux();
}
function letterHTML(word, text, copy) {
  word = word.trim();
  text = text.trim();
  const correct = norm(text) === norm(word),
    chars = [...text];
  return (
    [...word]
      .map((c, i) => {
        const typed = chars[i],
          className =
            typed === undefined
              ? 'ghost'
              : typed.toLowerCase() === c.toLowerCase()
                ? correct
                  ? 'whole-correct'
                  : 'letter-correct'
                : 'letter-wrong';
        return `<span class="${className}">${esc(typed === undefined ? (copy ? c : '') : typed)}</span>`;
      })
      .join('') +
    chars
      .slice([...word].length)
      .map((c) => `<span class="letter-wrong">${esc(c)}</span>`)
      .join('')
  );
}
function syncTypingGeometry() {
  const aux = S.aux,
    field = $('#aux-input'),
    letters = $('#letter-display'),
    line = $('#typing-line');
  if (!aux || !field || !letters || !line) return;
  const style = getComputedStyle(field),
    canvas =
      syncTypingGeometry.canvas || (syncTypingGeometry.canvas = document.createElement('canvas')),
    ctx = canvas.getContext('2d');
  ctx.font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
  ctx.fontKerning = 'none';
  const text = aux.copy ? aux.items[aux.index].word : aux.text;
  const inset = Math.max(0, (line.clientWidth - ctx.measureText(text).width) / 2);
  line.style.setProperty('--typing-inset', inset + 'px');
  letters.style.transform = 'translateX(' + -field.scrollLeft + 'px)';
}
window.addEventListener('resize', () => requestAnimationFrame(syncTypingGeometry));

function auxPronunciationHTML(item) {
  const ready = compare(S.aux?.text || '', item.word, 'word', S.settings),
    readings = selectedReadings(item, item.playAccent || S.settings.accent);
  const note = readings.length
    ? readings.map(esc).join(' · ')
    : item.pronunciationLoading
      ? '正在联网查音标…'
      : item.pronunciationChecked
        ? '暂未查到可靠音标，可稍后重试。'
        : '正在准备音标…';
  return (
    '<div class="aux-phonetic-text" aria-live="polite">' +
    note +
    '</div><div class="aux-audio-controls"><button class="secondary" data-action="aux-audio" data-accent="us" ' +
    (!ready ? 'disabled' : '') +
    ' aria-label="播放当前词美音">▶ 美音</button><button class="secondary" data-action="aux-audio" data-accent="uk" ' +
    (!ready ? 'disabled' : '') +
    ' aria-label="播放当前词英音">▶ 英音</button>' +
    (!readings.length && item.pronunciationChecked
      ? '<button class="text-btn" data-action="aux-phonetic-refresh">重查音标</button>'
      : '') +
    '</div><p id="aux-audio-status" class="muted" role="status">' +
    (ready ? '可选口音听发音，或按 Enter 继续。' : '完整拼对后可选择口音听发音。') +
    '</p>'
  );
}
function updateAuxPronunciation(aux, item) {
  if (S.aux !== aux || aux.items[aux.index] !== item) return;
  const target = $('#aux-pronunciation');
  if (target) target.innerHTML = auxPronunciationHTML(item);
}
async function loadAuxPronunciation(aux, item, force = false) {
  if (item.pronunciationLoading || (item.pronunciationChecked && !force)) return;
  const saved = S.entries[norm(item.word)];
  if (!item.phonetics?.length) {
    item.phonetics = saved?.supplement?.phonetics?.length
      ? [...saved.supplement.phonetics]
      : saved?.phonetic
        ? [{ text: saved.phonetic, accent: '' }]
        : [];
    item.phonetic = saved?.phonetic || '';
    item.pronunciationGroups = saved?.supplement?.pronunciationGroups || [];
  }
  item.pronunciationLoading = true;
  updateAuxPronunciation(aux, item);
  try {
    const raw = await api(
        '/api/lookup?word=' + encodeURIComponent(item.word) + (force ? '&refresh=1' : ''),
      ),
      phonetics = lookupPronunciations(raw);
    const english = definitionsFromLookup(raw, item.word);
    if (english.senses.length) {
      item.englishDefinitions = english.senses;
      item.englishDefinitionSource = english.source;
    }
    if (phonetics.length) item.phonetics = phonetics;
    item.pronunciationGroups = raw.pronunciationGroups || item.pronunciationGroups || [];
    item.phonetic = item.phonetics?.[0]?.text || item.phonetic || '';
    if (saved && S.entries[saved.key] === saved) {
      if (!saved.phonetic && item.phonetic) saved.phonetic = item.phonetic;
      if (phonetics.length)
        saved.supplement = {
          ...saved.supplement,
          phonetics,
          pronunciationGroups: item.pronunciationGroups,
          ...(item.englishDefinitions?.length
            ? {
                englishDefinitions: item.englishDefinitions,
                englishDefinitionSource: item.englishDefinitionSource,
              }
            : {}),
        };
      persist();
    }
  } catch {
  } finally {
    item.pronunciationLoading = false;
    item.pronunciationChecked = true;
    updateAuxPronunciation(aux, item);
    if (S.aux === aux && aux.items[aux.index] === item) refreshEnglishBlocks();
  }
}
async function playAuxWord(accent) {
  const aux = S.aux,
    item = aux?.items[aux.index];
  if (!item || !compare(aux.text, item.word, 'word', S.settings)) return;
  item.playAccent = accent;
  updateAuxPronunciation(aux, item);
  await playWord(auxiliaryEntry(item), undefined, { accent, statusId: 'aux-audio-status' });
}

function renderAux() {
  const aux = S.aux;
  if (!aux) return;
  const item = aux.items[aux.index];
  if (!item) {
    closeModal();
    return;
  }
  showModal(
    `<h2 class="visually-hidden">词义与拼写练习</h2><div class="aux-header"><span class="aux-mode">${aux.type === 'repeat' ? '原词照打' : '词形与词族'}</span><span class="aux-count">${aux.type === 'repeat' ? '已完成 ' + aux.done + ' 次' : aux.index + 1 + ' / ' + aux.items.length}</span></div>${aux.type === 'extend' ? `<div class="aux-tools"><span>原词 ${esc(aux.root)}</span><label><input id="aux-copy" type="checkbox" ${aux.copy ? 'checked' : ''}> 显示灰色答案</label></div>` : ''}<div class="aux-prompt">${aux.type === 'extend' && item.type === 'form' ? `<span class="aux-target-label">${esc(item.label)}</span>` : ''}<p class="aux-meaning">${esc(aux.type === 'extend' && item.type === 'form' ? (item.meaning || '').replace((item.label || '') + ' · ', '') : item.meaning || '')}</p>${englishBlock(item.word, item, item.type === 'form' ? 'verb' : '')}<div id="aux-hint" class="muted">${item.unavailable ? '释义待补充，可跳过此项。' : item.type === 'family' && !item.meaning ? '正在准备中文释义…' : ''}</div></div><div class="typing-line" id="typing-line"><div class="letter-display" id="letter-display" aria-hidden="true">${letterHTML(item.word, aux.text, aux.copy)}</div><input id="aux-input" class="aux-input" aria-label="拓展或反复练习输入" autocomplete="off" spellcheck="false" autocapitalize="off" value="${esc(aux.text)}"></div><div id="aux-pronunciation" class="aux-pronunciation">${auxPronunciationHTML(item)}</div><p id="aux-feedback" class="muted ${aux.feedbackError ? 'is-error' : ''}" role="status" aria-live="polite">${aux.feedbackError ? '还没有完整拼对，可以继续修改。' : compare(aux.text, item.word, 'word', S.settings) ? '✓ 完整拼写正确，按 Enter 继续。' : '直接输入英文，按 Enter 继续。'}</p><div class="modal-actions"><button class="primary" data-action="aux-next">检查 / 继续 <kbd>Enter</kbd></button>${aux.type === 'extend' ? `<button class="secondary" data-action="aux-add">加入主词库</button><button class="text-btn" data-action="aux-skip">跳过此项</button>` : ''}<button class="text-btn" data-action="close-modal">${aux.type === 'repeat' ? '结束照打 Alt' : '返回原答案 Esc'}</button></div>`,
  );
  $('#aux-input').focus();
  $('#aux-input').setSelectionRange(aux.text.length, aux.text.length);
  const syncTypingScroll = syncTypingGeometry;
  $('#aux-input').addEventListener('scroll', syncTypingScroll);
  $('#aux-input').addEventListener('keyup', () => requestAnimationFrame(syncTypingScroll));
  requestAnimationFrame(syncTypingScroll);
  $('#aux-input').oninput = (ev) => {
    const before = aux.text;
    aux.text = ev.target.value;
    const wasComplete = compare(before, item.word, 'word', S.settings),
      isComplete = compare(aux.text, item.word, 'word', S.settings);
    if (wasComplete !== isComplete) {
      stopAudio();
      updateAuxPronunciation(aux, item);
    }
    const typed = [...aux.text];
    if (
      typed.length > before.length &&
      typed.some((c, i) => c.toLowerCase() !== [...item.word][i]?.toLowerCase())
    )
      aux.wrongKeys++;
    $('#letter-display').innerHTML = letterHTML(item.word, aux.text, aux.copy);
    requestAnimationFrame(syncTypingScroll);
    aux.feedbackError = false;
    $('#aux-feedback').classList.remove('is-error');
    $('#aux-feedback').textContent = compare(aux.text, item.word, 'word', S.settings)
      ? '✓ 完整拼写正确，按 Enter 继续。'
      : '直接输入英文，按 Enter 继续。';
    persist(180);
  };
  $('#aux-copy')?.addEventListener('change', (ev) => {
    aux.copy = ev.target.checked;
    S.settings.extensionCopy = aux.copy;
    persist();
    renderAux();
  });
  prepareEnglishDefinitions();
  loadAuxPronunciation(aux, item);
  if (aux.type === 'extend' && item.type === 'family' && !item.meaning)
    loadFamilyMeaning(aux, item);
}
async function loadFamilyMeaning(aux, item) {
  if (item.loading) return;
  item.loading = true;
  try {
    const raw = await api('/api/lookup?word=' + encodeURIComponent(item.word)),
      d = raw.dictionary[0],
      m = d?.meanings?.[0];
    if (raw.youdao?.meanings?.length) {
      item.meaning = raw.youdao.meanings[0];
      return;
    }
    const definition = m?.definitions?.[0]?.definition;
    if (definition) {
      const zh = await translated(definition);
      item.meaning = (m.partOfSpeech || '') + '. ' + (zh || definition);
      item.meaningMachine = !!zh;
    } else {
      item.meaning = '';
      item.unavailable = true;
    }
  } catch {
    item.meaning = '';
    item.unavailable = true;
  } finally {
    item.loading = false;
    if (S.aux === aux && aux.items[aux.index] === item) {
      persist();
      renderAux();
    }
  }
}
function auxNext(skip = false) {
  const aux = S.aux;
  if (!aux) return;
  const item = aux.items[aux.index];
  if (!skip && !compare(aux.text, item.word, 'word', S.settings)) {
    aux.feedbackError = true;
    const feedback = $('#aux-feedback');
    if (feedback) {
      feedback.textContent = '还没有完整拼对，可以继续修改。';
      feedback.classList.add('is-error');
      feedback.scrollIntoView({ block: 'nearest' });
    }
    $('#aux-input')?.focus({ preventScroll: true });
    return;
  }
  stopAudio();
  aux.feedbackError = false;
  if (!skip) {
    aux.done++;
    S.auxStats = S.auxStats || { repeat: 0, extend: 0 };
    S.auxStats[aux.type === 'repeat' ? 'repeat' : 'extend']++;
  }
  if (aux.type === 'repeat') {
    aux.text = '';
    persist();
    renderAux();
  } else {
    aux.index++;
    aux.text = '';
    if (aux.index >= aux.items.length) {
      const done = aux.done;
      closeModal();
      toast(`拓展完成：练过 ${done} 项，已返回原来的答案。`);
      render();
    } else {
      persist();
      renderAux();
    }
  }
}
async function auxAdd() {
  const aux = S.aux;
  if (!aux) return;
  const item = aux.items[aux.index];
  let meaning = item.meaning;
  if (!meaning || item.unavailable) {
    toast('请等待释义补充，或先手动添加中文释义。');
    return;
  }
  const r = mergeEntries(S, [
    {
      english: item.word,
      meanings: [meaning],
      phonetic: item.phonetic || '',
      supplement: {
        phonetics: item.phonetics || [],
        pronunciationGroups: item.pronunciationGroups || [],
        englishDefinitions: englishFor(item.word, item).senses,
        englishDefinitionSource: englishFor(item.word, item).source,
      },
      source: '词族拓展手动加入',
    },
  ]);
  persist(0);
  toast(r.added ? '已加入主词库和当前轮次。' : '已合并到已有词条。');
}
function detail(key, load = true) {
  const e = S.entries[key];
  showModal(
    `<h2>${esc(e.english)}</h2>${badges(e)}${answerCard(e)}<div class="modal-actions"><button class="secondary" data-action="edit" data-key="${esc(key)}">编辑词条</button><button class="text-btn" data-action="close-modal">关闭</button></div>`,
  );
  if (load)
    ensureResources(e).then(() => {
      if (modal.open && modal.querySelector('h2')?.textContent === e.english) detail(key, false);
    });
}
function navigate(v, fromHistory = false) {
  view = v;
  if (!fromHistory && location.hash !== '#' + v) history.pushState(null, '', '#' + v);
  stopAudio();
  active = false;
  lastTick = 0;
  selected.clear();
  render();
}
window.addEventListener('hashchange', () => {
  const v = location.hash.slice(1) || 'practice';
  if (S && ['practice', 'pasture', 'library', 'wrong', 'favorite'].includes(v) && v !== view)
    navigate(v, true);
});

async function showWordbooks() {
  showModal('<h2>预置词库</h2><p>正在载入可用词库…</p>');
  try {
    const catalog = await loadCatalog();
    if (!modal.open) return;
    showModal(
      catalogHTML(S, catalog) +
        '<p id="book-install-feedback" class="book-install-feedback" role="status" aria-live="polite"></p>',
    );
  } catch (e) {
    if (modal.open)
      showModal(
        '<h2>暂时无法载入词库</h2><p>' +
          esc(e.message) +
          '</p><button class="primary" data-action="books">重新加载</button>',
      );
  }
}
async function installWordbook(el) {
  const id = el.dataset.book;
  el.disabled = true;
  el.textContent = '正在加入…';
  try {
    const { book, rows } = await loadBook(id),
      group = bookGroup(book),
      result = mergeEntries(S, rows, group);
    S.builtinBooks ??= {};
    S.builtinBooks[id] = {
      version: book.version,
      group,
      installedAt: Date.now(),
      count: book.count,
    };
    S.settings.group = group;
    S.settings.scope = 'all';
    persist(0);
    if (storageMode === 'browser') navigator.storage?.persist?.().catch(() => {});
    render();
    await showWordbooks();
    const feedback = $('#book-install-feedback');
    if (feedback)
      feedback.textContent =
        '已加入“' +
        group +
        '”：新增 ' +
        result.added +
        ' 条，补充 ' +
        result.updated +
        ' 条；原有成绩和当前题已保留。';
  } catch (e) {
    el.disabled = false;
    el.textContent = '重试加入';
    toast(e.message);
  }
}
function showSkins() {
  showModal(skinShopHTML(S));
}
function setSheepSkin(id) {
  if (!selectSkin(S, id)) {
    toast('请先兑换这款皮肤。');
    return;
  }
  persist(0);
  render();
  showSkins();
}
function exchangeSheepSkin(id) {
  const result = redeemSkin(S, id);
  if (!result.ok) {
    toast(
      {
        owned: '这款皮肤已拥有。',
        insufficient: '金币不足，继续练习即可积累。',
        unavailable: '这款皮肤尚未上架。',
      }[result.reason],
    );
    return;
  }
  persist(0);
  render();
  showSkins();
  toast('已兑换 ' + result.skin.id + ' ' + result.skin.name + '。');
}
const actions = {
  'sheep-skins': showSkins,
  'coin-history': () => showModal(coinHistoryHTML(S)),
  'skin-select': (el) => setSheepSkin(el.dataset.skin),
  'skin-redeem': (el) => exchangeSheepSkin(el.dataset.skin),
  books: showWordbooks,
  'install-book': installWordbook,
  reload: () => location.reload(),
  'sidebar-toggle': toggleSidebar,
  'config-open': openConfig,
  'config-close': closeModal,
  'pasture-practice': () => {
    navigate('practice');
    if (!current()) start();
    else if (current().finished) ensureResources(entry());
    else $('#answer-input')?.focus();
  },
  'pasture-page': (el) => {
    pasturePages[el.dataset.side] = Math.max(0, Number(el.dataset.page));
    render();
  },
  'pasture-inspect': (el) => {
    const key = el.dataset.key,
      status = sheepStatus(S, key);
    if (status === 'caught' || (current()?.key === key && current().finished)) detail(key);
    else
      toast(
        status === 'escaped'
          ? '这只羊进入了正常加练，回练习页再抓一次。'
          : status === 'waiting'
            ? '这只羊还没有抓到，后续按正常练习安排再遇见。'
            : status === 'skipped'
              ? '这只羊本轮已跳过，不计对错。'
              : status === 'unconfirmed'
                ? '旧进度缺少本轮结果，后续正常作答会更新位置。'
                : '这只羊还没练到，按正常练习的随机顺序来遇见它。',
      );
  },
  'pasture-help': () =>
    showModal(
      '<h2>草场说明</h2><div class="herd-help"><p>每个词条是一只羊。正常练习答对后移到右边；两次机会都错，留在左边。第一次答错但第二次改对，也会带回来。</p><p>已答对的词再次进入正常加练时，会从右边逃回左边。再次答对，再带回来。加练的次数与间隔完全沿用正常练习。</p><p>跳过的词本轮留在左边，不计错误。反复照打和词形拓展不改变正式练习进度。</p><p>这里与练习页共用模式、分组、范围和轮次。完整拼写与字母提示共用拼写进度；认义选择显示其正常进度。只有练习页开始新一轮，羊群才随之重置。</p><p>小羊自由走动，经过鼠标或获得键盘焦点时会停下来。点击已带回的小羊可以查看词条。</p></div>',
    ),
  nav: (el) => navigate(el.dataset.view),
  theme: () => {
    S.settings.theme = S.settings.theme === 'dark' ? 'light' : 'dark';
    persist();
    render();
  },
  save: () => {
    saveError = '';
    flush();
  },
  settings: settingsModal,
  import: importModal,
  start,
  next,
  previous,
  'resume-question': resumeQuestion,
  skip: skipCurrent,
  recognition: (el) => toggleRecognition(el.dataset.key),
  submit: () => checkAnswer(),
  choose: (el) => checkAnswer(el.dataset.key),
  favorite: (el) => toggleFavorite(el.dataset.key),
  repeat,
  extend: (el) => extend(el.dataset.key),
  accent: (el) => {
    stopAudio();
    S.settings.accent = S.settings.accent === 'us' ? 'uk' : 'us';
    persist();
    if (modal.open && el.dataset.key) detail(el.dataset.key, false);
    else render();
  },
  audio: (el) => playWord(S.entries[el.dataset.key], el.dataset.pos),
  'refresh-resource': (el) => {
    const e = S.entries[el.dataset.key];
    ensureResources(e, true);
  },
  'close-modal': closeModal,
  add: () => editModal(),
  edit: (el) => editModal(el.dataset.key),
  detail: (el) => detail(el.dataset.key),
  'new-group': () => groupModal(),
  'batch-group': () => groupModal(true),
  backup,
  'export-csv': exportCSV,
  'toggle-category': () => {
    S.settings.mode = category(S) === 'typing' ? 'choice' : 'blank';
    persist();
    render();
  },
  'practice-list': () => {
    S.settings.scope = view === 'favorite' ? 'favorite' : 'wrong';
    persist();
    navigate('practice');
  },
  'all-scope': () => {
    closeModal();
    S.settings.scope = 'all';
    S.settings.group = '';
    S.rounds[category(S)].current = null;
    persist();
    start();
  },
  'new-round': () => {
    const cat = category(S);
    closeModal();
    S.rounds[cat] = blankRound(S.rounds[cat].number + 1);
    persist();
    start();
  },
  'aux-audio': (el) => playAuxWord(el.dataset.accent),
  'aux-phonetic-refresh': () => {
    const aux = S.aux,
      item = aux?.items[aux.index];
    if (item) return loadAuxPronunciation(aux, item, true);
  },
  'aux-next': () => auxNext(),
  'aux-skip': () => auxNext(true),
  'aux-add': auxAdd,
  'restore-picker': () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => restoreFile(input.files[0]);
    input.click();
  },
  seed: async () => {
    const { rows } = await api('/api/seed');
    const r = mergeEntries(S, rows, '有道示例');
    persist(0);
    closeModal();
    render();
    toast(`示例词库：新增 ${r.added}，补充 ${r.updated}，跳过 ${r.skipped}。`);
  },
  keys: () =>
    showModal(
      '<h2>键盘操作指南</h2><div class="keyboard-list"><p><kbd>Enter</kbd> 提交 / 重试答案</p><p><kbd>Ctrl</kbd> ＋ <kbd>Enter</kbd> 跳过，不计对错并显示答案</p><p><kbd>空格</kbd> 答案展示后进入下一题；输入中空格正常使用</p><p><kbd>1</kbd> ～ <kbd>4</kbd> 选择中文释义</p><p><kbd>Alt</kbd> 提交过当前题后，进入或退出原词照打</p><p><kbd>Ctrl</kbd> ＋ <kbd>Alt</kbd> ＋ <kbd>E</kbd> 答案页进入词形与词族拓展</p><p><kbd>Fn</kbd> ＋ <kbd>Alt</kbd> 若键盘能报告 Fn，也可进入拓展</p><p><kbd>Esc</kbd> 退出拓展，回到原题</p></div><p class="muted">Fn 在部分键盘上无法传给网页，拓展按钮和 Ctrl＋Alt＋E 始终作为替代入口。</p>',
    ),
};
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  if (
    el.tagName === 'A' &&
    (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey || ev.button !== 0)
  )
    return;
  ev.preventDefault();
  const action = actions[el.dataset.action];
  if (action) Promise.resolve(action(el)).catch((e) => toast(e.message));
});
document.addEventListener('keydown', (ev) => {
  if (!S || ev.isComposing) return;
  if (configOpen || ev.target.closest?.('.practice-sidebar,.header')) return;
  if (altPending && ev.key !== 'Alt') altPending = false;
  if (ev.key === 'Fn') {
    fnSeen = true;
    return;
  }
  const fn = fnSeen || ev.getModifierState?.('Fn');
  if ((ev.ctrlKey && ev.altKey && ev.code === 'KeyE') || (ev.key === 'Alt' && fn)) {
    ev.preventDefault();
    if (S.aux) closeModal();
    else extend();
    return;
  }
  if (
    ev.key === 'Alt' &&
    !ev.ctrlKey &&
    !ev.shiftKey &&
    !ev.metaKey &&
    view === 'practice' &&
    (!modal.open || S.aux)
  ) {
    ev.preventDefault();
    if (!ev.repeat) altPending = true;
    return;
  }
  if (modal.open) {
    if (ev.key === 'Enter' && S.aux) {
      ev.preventDefault();
      auxNext();
    }
    return;
  }
  if (
    view !== 'practice' ||
    ['SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName) ||
    document.activeElement?.id === 'hint-level'
  )
    return;
  const q = current();
  if (!q) return;
  if (ev.key === ' ' && q.finished) {
    ev.preventDefault();
    next();
    return;
  }
  if (ev.key === 'Enter' && ev.ctrlKey && !q.finished) {
    ev.preventDefault();
    skipCurrent();
    return;
  }
  if (ev.key === 'Enter' && !q.finished) {
    ev.preventDefault();
    if (category(S) === 'typing') checkAnswer();
    return;
  }
  if (category(S) === 'choice' && !q.finished && /^[1-4]$/.test(ev.key)) {
    const option = choices(S, q)[Number(ev.key) - 1];
    if (option) {
      ev.preventDefault();
      checkAnswer(option.key);
    }
  }
});
document.addEventListener('keyup', (ev) => {
  if (ev.key === 'Fn') fnSeen = false;
  if (ev.key === 'Alt' && altPending) {
    altPending = false;
    ev.preventDefault();
    if (S.aux) closeModal();
    else repeat();
  }
});
modal.addEventListener('cancel', (ev) => {
  ev.preventDefault();
  closeModal();
});
document.addEventListener('visibilitychange', () => {
  active = false;
  lastTick = 0;
  if (document.hidden) {
    persist(0);
    flush();
  }
});
window.addEventListener('blur', () => {
  active = false;
  lastTick = 0;
  fnSeen = false;
  altPending = false;
});
window.addEventListener('pagehide', () => {
  if (!S) return;
  if (storageMode === 'browser') {
    retainLocalDraft(S);
    if (dirty > saved) flush();
  } else if (dirty > saved) {
    fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: S, expectedRevision: S.revision }),
      keepalive: true,
    }).catch(() => {});
  }
});
setInterval(() => {
  if (!S || view !== 'practice' || S.aux || modal.open || !active || document.hidden) return;
  const q = current();
  if (!q || q.finished || category(S) !== 'typing') return;
  const now = performance.now();
  if (now - lastTick > 5000) {
    active = false;
    lastTick = 0;
    return;
  }
  q.ms += 250;
  const m = metricData(),
    ms = m.ms + q.ms;
  if ($('#typing-time')) $('#typing-time').textContent = formatTime(ms);
  if ($('#wpm'))
    $('#wpm').innerHTML =
      (ms ? Math.round((m.chars + q.input.trim().length) / 5 / (ms / 60000)) : '—') +
      '<small> WPM</small>';
  clock += 250;
  if (clock >= 2000) {
    clock = 0;
    persist(200);
  }
}, 250);
async function init() {
  try {
    const { state } = await api('/api/state');
    S = state || initialState();
    S.aux = null;
    const hadWallet = !!S.pastureWallet;
    ensureWallet(S);
    if (!hadWallet) persist(0);
    if (!state) {
      const { rows, book } = await api('/api/seed'),
        group = book ? bookGroup(book) : '有道示例';
      mergeEntries(S, rows, group);
      if (book) {
        S.builtinBooks = {
          [book.id]: { version: book.version, group, count: book.count, installedAt: Date.now() },
        };
        S.settings.group = group;
      } else {
        const examples = await api('/examples.json');
        for (const e of Object.values(S.entries)) {
          const ex = examples[e.key];
          if (ex)
            e.supplement = { examples: [{ en: ex[0], zh: ex[1], source: '内置练习例句 · 自编' }] };
        }
      }
      persist(0);
    }
    document.title = '咩词 · IELTS Typing Studio';
    document.documentElement.dataset.storageMode = storageMode;
    render();
    initializing = false;
    if (current()?.finished) ensureResources(entry());
    if (window.speechSynthesis) speechSynthesis.getVoices();
    if (storageMode === 'browser' && 'serviceWorker' in navigator)
      navigator.serviceWorker.register('/sw.js').catch(() => {});
  } catch (e) {
    app.innerHTML =
      '<div class="fatal"><h1>暂时无法打开练习空间</h1><p>' +
      esc(e.message) +
      '</p><p>请检查网络与浏览器存储权限后重试；已有的本地记录不会被覆盖。</p><button class="primary" data-action="reload">重新打开</button></div>';
  }
}

init();
