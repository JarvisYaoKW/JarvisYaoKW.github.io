import {
  dailyCandidates,
  dailyConfig,
  dailySummary,
  isDaily,
  localDay,
} from './daily-learning.mjs';
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function planSwitch(s) {
  return `<fieldset class="config-section"><legend>学习计划</legend><div class="plan-switch">${[
    ['round', '整库练习'],
    ['daily', '每日学习'],
  ]
    .map(
      ([v, label]) =>
        `<button data-action="learning-plan" data-plan="${v}" aria-pressed="${isDaily(s) === (v === 'daily')}">${label}</button>`,
    )
    .join('')}</div></fieldset>`;
}
export function dailyControls(s) {
  const config = dailyConfig(s.daily?.config),
    t = s.daily?.task;
  return `<fieldset class="config-section daily-fields"><legend>每日任务设置</legend><label for="daily-target">每日新词目标</label><input id="daily-target" type="number" min="0" max="1000" step="1" value="${config.target}" data-daily-config="target"><label for="daily-budget">每日总词数上限（复习优先）</label><input id="daily-budget" type="number" min="1" max="2000" value="${config.budget}" data-daily-config="budget">${[
    ['newHint', '新词回忆提示'],
    ['reviewHint', '复习字母提示'],
  ]
    .map(
      ([key, label]) =>
        `<label for="daily-${key}">${label} <output id="daily-${key}-value">${Math.round(config[key] * 100)}%</output></label><input id="daily-${key}" type="range" min="0" max="1" step="0.05" value="${config[key]}" data-daily-config="${key}">`,
    )
    .join(
      '',
    )}<label for="daily-group">词库分组</label><select id="daily-group" data-daily-config="group"><option value="">全部词条</option><option value="__ungrouped" ${config.group === '__ungrouped' ? 'selected' : ''}>未分组</option>${s.groups.map((g) => `<option value="${esc(g)}" ${config.group === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select><label for="daily-scope">范围</label><select id="daily-scope" data-daily-config="scope">${[
    ['all', '全部内容'],
    ['wrong', '只练常错'],
    ['favorite', '只练收藏'],
  ]
    .map(
      ([value, label]) =>
        `<option value="${value}" ${config.scope === value ? 'selected' : ''}>${label}</option>`,
    )
    .join(
      '',
    )}</select><p class="config-pending">新词先照打，再回忆拼写。复习间隔为 1、3、7、14、30 天。</p>${t ? '<p class="config-pending">设置用于下一份任务；也可调整当前任务，已完成的学习记录保留。<button class="secondary" data-action="daily-adjust">调整当前任务</button></p>' : ''}</fieldset>`;
}
export function dailyMetrics(s) {
  const m = dailySummary(s);
  return `<div class="metrics daily-metrics">${[
    ['新词完成', m.newDone, ` / ${m.newTotal}`],
    ['复习完成', m.reviewDone, ` / ${m.reviewTotal}`],
    ['待安排复习', m.backlog, ' 词'],
    ['暂缓', m.deferred, ' 词'],
    ['正式作答', m.attempts, ' 次'],
  ]
    .map(
      ([label, n, unit]) =>
        `<div><span>${label}</span><strong>${n}<small>${unit}</small></strong></div>`,
    )
    .join('')}</div>`;
}
export function dailyIdle(s) {
  const t = s.daily?.task,
    m = dailySummary(s),
    { fresh, due } = dailyCandidates(s),
    c = dailyConfig(s.daily.config);
  const finishedToday = t?.day === localDay() && m.complete;
  return `<section class="welcome daily-welcome"><h2>${finishedToday ? '今日任务已完成' : t && !m.complete ? '继续每日学习' : '开始每日学习'}</h2><p ${!finishedToday && (!t || m.complete) ? 'id="daily-preview"' : ''}>${finishedToday ? `新词 ${m.newDone} 词，复习 ${m.reviewDone} 词${m.deferred ? `，暂缓 ${m.deferred} 词` : ''}。` : t && !m.complete ? `${esc(t.day)} 的任务已保留，可以继续完成。` : `可安排新词 ${Math.min(c.target, fresh.length, Math.max(0, c.budget - due.length))} 词、到期复习 ${Math.min(c.budget, due.length)} 词。`}</p><p class="muted">新词：照打 → 回忆拼写。答错的词稍后再练；到期复习优先；总量不足时减少新词，未安排的复习保留。</p>${!finishedToday ? '<button class="primary large" data-action="daily-start">' + (t && !m.complete ? '继续任务' : '生成并开始任务') + '</button>' : ''}${!t && (!c.target || !fresh.length) && !due.length ? '<p class="muted">当前设置没有可安排的词。可调整新词目标、分组或加入预置词库；没有到期词时无需复习。</p>' : ''}</section>`;
}
export function dailyFeedback(q, s) {
  if (!q.finished)
    return q.tries
      ? '第一次未答对，还可以尝试一次。'
      : q.stage === 'copy'
        ? '跟着灰色单词输入，按 Enter 检查。'
        : '按 Enter 检查答案。';
  if (q.outcome === 'skipped') return '已暂缓，不计对错和完成词数；后续任务仍会安排。';
  if (q.stage === 'copy')
    return q.outcome === 'correct'
      ? '照打完成，按 Enter 继续，隔几个词再回忆；本步不计分。'
      : '先看正确拼写，稍后再照打；本步不计分。';
  return q.outcome === 'correct'
    ? '✓ 本词已完成，下一次复习' +
        (s?.daily.records[q.key]?.due ? '：' + s.daily.records[q.key].due : '已安排') +
        '。'
    : '× 本题计错误一次，稍后会再次练习。';
}
