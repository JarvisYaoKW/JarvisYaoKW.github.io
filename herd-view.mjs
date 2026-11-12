import { activeRound, isDaily, dailySummary } from './daily-learning.mjs';
import { renderSkinSheep, bindSheepMotion } from './sheep-art.mjs';
import { SHEEP_SKINS, walletSummary, selectedSkin, skinSelection } from './pasture-economy.mjs';
import { category } from './engine.mjs';
import { herdSummary, sheepStatus, sheepBundles, SHEEP_SIZES } from './herd.mjs';
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const sheepSeed = (key) =>
  [...key].reduce((n, c) => (Math.imul(n, 31) + c.codePointAt(0)) >>> 0, 7);
export function sheepSVG(variant = 0) {
  return renderSkinSheep(variant);
}
const names = {
  caught: '已带回',
  escaped: '加练时逃回来',
  waiting: '答错，尚未带回',
  skipped: '本轮已跳过',
  unconfirmed: '已练，旧记录未区分结果',
  free: '尚未练习',
};
export function eventText(s) {
  const sum = herdSummary(s),
    ev = sum.event;
  if (!ev) return '草场显示当前轮次的练习进度。';
  const number = String(Object.keys(s.entries).indexOf(ev.key) + 1).padStart(3, '0');
  return (
    {
      catch: `抓到 #${number} 啦，它已经到了记忆草场。${ev.coins ? ' 金币 +1。' : ''}`,
      miss: `这次没抓到 #${number}，它留在待记草场。`,
      escape: `#${number} 又溜回来了，当前正在正常加练。`,
      skip: `先放过 #${number}，这题跳过，不计对错。`,
    }[ev.type] || ''
  );
}
export function pasturePeek(s) {
  const sum = herdSummary(s);
  return `<button class="pasture-peek" data-action="nav" data-view="pasture"><span class="peek-sheep">${sheepSVG(selectedSkin(s, 2).variant)}</span><span>记忆草场 <b>${sum.caught.length} / ${sum.entries.length}</b><small>${esc(eventText(s))}</small></span><span class="peek-arrow">查看草场 ↗</span></button>`;
}
function token(s, e, numbers) {
  const seed = sheepSeed(e.key),
    skin = selectedSkin(s, seed),
    status = sheepStatus(s, e.key),
    q = activeRound(s).current;
  const known = status === 'caught' || (q?.key === e.key && q.finished),
    selected = q?.key === e.key && !q.finished;
  return `<button class="sheep-token ${status}${selected ? ' selected' : ''}" data-action="pasture-inspect" data-key="${esc(e.key)}" data-seed="${seed}" data-variant="${skin.variant}" data-skin-id="${skin.id}" aria-label="羊 ${numbers.get(e.key)}，${names[status]}${known ? '，' + esc(e.english) : ''}" title="${esc('#' + numbers.get(e.key) + ' · ' + names[status] + ' · 皮肤 ' + skin.id + ' ' + skin.name + (known ? ' · ' + e.english : ''))}"><span class="sheep-direction">${sheepSVG(skin.variant)}</span><span class="sheep-name">${known ? esc(e.english) : '#' + numbers.get(e.key)}</span>${e.favorite ? '<i class="sheep-favorite" aria-label="已收藏">●</i>' : ''}${status === 'escaped' ? '<i class="sheep-escape">↶</i>' : ''}</button>`;
}
function bundleToken(s, bundle, side, list, numbers) {
  const e = list[bundle.offset];
  if (bundle.value === 1) {
    return token(s, e, numbers)
      .replace('class="sheep-token ', 'class="sheep-token size-tiny ')
      .replace('aria-label="羊 ', 'aria-label="小小羊，代表 1 词，羊 ')
      .replace('data-action="pasture-inspect"', 'data-action="pasture-inspect" data-value="1"')
      .replace('<span class="sheep-name">', '<span class="sheep-name visually-hidden">');
  }
  const seed = sheepSeed(`${side}:${bundle.value}:${bundle.offset}`),
    skin = selectedSkin(s, seed),
    caught = side === 'inside';
  return `<button class="sheep-token sheep-bundle size-${bundle.size}${caught ? ' caught' : ''}" data-action="pasture-bundle" data-value="${bundle.value}" data-label="${bundle.label}" data-seed="${seed}" data-variant="${skin.variant}" data-skin-id="${skin.id}" aria-label="${bundle.label}，代表 ${bundle.value} 词，${caught ? '本轮已答对' : '待记'}" title="${bundle.label} · ${bundle.value} 词 · 皮肤 ${skin.id} ${skin.name}"><span class="sheep-direction">${sheepSVG(skin.variant)}</span></button>`;
}
function field(s, list, side, numbers) {
  const bundles = sheepBundles(list.length);
  return `<section class="pasture-field ${side}"><div class="field-heading"><div><span class="field-marker"></span><h2>${side === 'outside' ? '待记草场' : '记忆草场'}</h2><span class="field-count">${list.length.toLocaleString('zh-CN')}<small> 词</small></span></div><span>${side === 'outside' ? '待带回' : '本轮已答对'}</span></div><div class="field-ground"><div class="field-grass"></div><div class="sheep-roam">${bundles.map((b) => bundleToken(s, b, side, list, numbers)).join('')}</div>${!list.length ? `<div class="field-empty">${side === 'outside' ? '这一侧的词都带回来了。' : '还没有带回的词。'}<small>${side === 'outside' ? '接着完成正常练习里的加练。' : '正常练习答对后，会出现在这里。'}</small></div>` : ''}<div class="field-fence" aria-hidden="true"></div></div></section>`;
}
function sheepLegend() {
  return `<div class="sheep-legend" aria-label="羊体型与词数换算">${SHEEP_SIZES.map((unit) => `<div class="legend-unit size-${unit.size}"><span class="legend-sheep">${sheepSVG(0)}</span><span><strong>${unit.label}</strong><small>1 只 = ${unit.value} 词</small></span></div>`).join('')}</div>`;
}
export function pasturePage(s, toolbar) {
  const sum = herdSummary(s),
    r = activeRound(s),
    q = r.current,
    numbers = new Map(Object.keys(s.entries).map((k, i) => [k, String(i + 1).padStart(3, '0')]));
  const percent = sum.entries.length
    ? Math.round((sum.caught.length / sum.entries.length) * 100)
    : 0;
  return `<main class="main pasture-main">${toolbar}${walletBarHTML(s)}<div class="herd-progress"><div><strong>${isDaily(s) ? '每日学习 · ' + (s.daily?.task?.day || '待生成任务') : '整库练习 · 第 ' + r.number + ' 轮'}</strong><span>${isDaily(s) ? '任务进度' : category(s) === 'typing' ? '拼写进度' : '认义选择进度'}</span><span>已带回 <b>${sum.caught.length}</b> / ${sum.entries.length} 词</span><span>${isDaily(s) ? '新词 ' + dailySummary(s).newDone + '/' + dailySummary(s).newTotal + ' · 复习 ' + dailySummary(s).reviewDone + '/' + dailySummary(s).reviewTotal : '基础已练 ' + sum.done + ' 条 · 加练 ' + sum.extra + ' 次'}</span></div><span>逃回 ${sum.escaped.length} 词</span></div><div class="herd-progress-bar" aria-label="已带回 ${percent}%"><i style="width:${percent}%"></i></div>${sheepLegend()}<div class="pasture-board">${field(s, sum.outside, 'outside', numbers)}<div class="pasture-bridge" aria-hidden="true"><span>→</span><small>答对就带回</small></div>${field(s, sum.caught, 'inside', numbers)}</div><div class="herd-story ${sum.event?.type || ''}" role="status">${esc(eventText(s))}</div><div class="pasture-return"><div><strong>${q ? '当前题和输入都已保留' : '正常练习进度'}</strong><p>答对带过去 · 答错留在原地 · 已抓到的词进入加练时逃回来</p></div><button class="primary" data-action="pasture-practice">${q?.finished ? '返回当前答案' : q ? '继续练习' : '开始练习'} →</button></div>${sum.skipped.length ? `<p class="pasture-note">${sum.skipped.length} 个本轮跳过的词留在待记草场，不计为答错。</p>` : ''}${sum.unknown.length ? '<p class="pasture-note">部分旧记录没有本轮答题结果，暂时留在待记草场；后续作答会自动更新。</p>' : ''}<div class="pasture-footnote"><span>${isDaily(s) ? '显示当前每日任务 · 照打不移动羊，正式答对后带回' : '与练习页共用模式、分组、范围和轮次 · 新词自动加入 · 照打与拓展不改变羊的位置'}</span></div></main>`;
}

// One animation loop per mounted grassland; all coordinates remain inside its bounds.
export function mountSheepRoaming(root = document) {
  const media = matchMedia('(prefers-reduced-motion: reduce)'),
    fields = [...root.querySelectorAll('.sheep-roam')];
  let frame = 0,
    last = 0,
    disposed = false;
  const items = [];
  function openSpot(field, random, el, except = null) {
    const peers = items.filter((a) => a.field === field && a !== except),
      w = Math.max(1, field.clientWidth - el.offsetWidth),
      h = Math.max(1, field.clientHeight - el.offsetHeight);
    let best = { x: random(), y: random() },
      distance = -Infinity;
    for (let i = 0; i < 32; i++) {
      const spot = { x: random(), y: random() },
        cx = spot.x * w + el.offsetWidth / 2,
        cy = spot.y * h + el.offsetHeight / 2,
        d = peers.length
          ? Math.min(
              ...peers.map((a) => {
                const ax =
                    a.x * Math.max(0, field.clientWidth - a.el.offsetWidth) + a.el.offsetWidth / 2,
                  ay =
                    a.y * Math.max(0, field.clientHeight - a.el.offsetHeight) +
                    a.el.offsetHeight / 2;
                return Math.hypot(ax - cx, ay - cy) - (a.el.offsetWidth + el.offsetWidth) / 2;
              }),
            )
          : 1;
      if (d > distance) {
        best = spot;
        distance = d;
      }
    }
    return best;
  }
  function fitFields() {
    const narrow = matchMedia('(max-width: 700px)').matches;
    const heights = fields.map((field) => {
      const tokens = [...field.querySelectorAll('.sheep-token')],
        area = tokens.reduce((sum, el) => sum + el.offsetWidth * el.offsetHeight, 0),
        base = narrow ? 280 : 375;
      return Math.max(base, Math.ceil(area / Math.max(1, field.clientWidth) / 0.55) + 42);
    });
    fields.forEach((field, index) => {
      field.parentElement.style.height = `${narrow ? heights[index] : Math.max(...heights)}px`;
    });
  }
  fitFields();
  const resize = new ResizeObserver(fitFields);
  for (const field of fields) resize.observe(field.parentElement);
  for (const field of fields)
    for (const el of field.querySelectorAll('.sheep-token')) {
      let seed = Number(el.dataset.seed) || 1;
      const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      const spot = openSpot(field, random, el),
        target = openSpot(field, random, el);
      items.push({
        field,
        el,
        random,
        animate: bindSheepMotion(el.querySelector('.sheep-svg')),
        action: 'idle',
        actionTime: random() * 2.8,
        ...spot,
        tx: target.x,
        ty: target.y,
        pause: random() * 2,
        rest: false,
        speed: (13 + random() * 20) * Math.sqrt(67 / Math.max(42, el.offsetWidth)),
      });
    }
  function tick(now) {
    if (disposed) return;
    const dt = Math.min(0.06, last ? (now - last) / 1000 : 0);
    last = now;
    for (const a of items) {
      const w = Math.max(0, a.field.clientWidth - a.el.offsetWidth),
        h = Math.max(0, a.field.clientHeight - a.el.offsetHeight);
      let x = a.x * w,
        y = a.y * h;
      const held = a.el.matches(':hover,:focus-visible') || document.hidden || media.matches;
      if (!held && a.pause <= 0) {
        const dx = a.tx * w - x,
          dy = a.ty * h - y,
          d = Math.hypot(dx, dy),
          step = a.speed * dt;
        if (d < Math.max(2, step)) {
          a.rest = a.random() < 0.5;
          a.pause = a.rest ? 4.2 : 0.7 + a.random() * 2.8;
          const target = openSpot(a.field, a.random, a.el, a);
          a.tx = target.x;
          a.ty = target.y;
        } else {
          let vx = dx / d,
            vy = dy / d;
          for (const other of items)
            if (other !== a && other.field === a.field) {
              const ox =
                  x +
                  a.el.offsetWidth / 2 -
                  (other.x * Math.max(0, a.field.clientWidth - other.el.offsetWidth) +
                    other.el.offsetWidth / 2),
                oy =
                  y +
                  a.el.offsetHeight / 2 -
                  (other.y * Math.max(0, a.field.clientHeight - other.el.offsetHeight) +
                    other.el.offsetHeight / 2),
                near = Math.hypot(ox, oy),
                spacing = (a.el.offsetWidth + other.el.offsetWidth) / 2;
              if (near > 0 && near < spacing) {
                vx += ((ox / near) * (spacing - near)) / 25;
                vy += ((oy / near) * (spacing - near)) / 25;
              }
            }
          const length = Math.max(1, Math.hypot(vx, vy));
          x = Math.min(w, Math.max(0, x + (vx / length) * step));
          y = Math.min(h, Math.max(0, y + (vy / length) * step));
          a.x = w ? x / w : 0;
          a.y = h ? y / h : 0;
          a.el.style.setProperty('--facing', vx < 0 ? '1' : '-1');
        }
      } else if (!held) a.pause -= dt;
      const action = !held && a.pause <= 0 ? 'walk' : !held && a.rest ? 'graze' : 'idle';
      if (action !== a.action) {
        a.action = action;
        a.actionTime = 0;
      }
      if (!held) a.actionTime += dt;
      a.animate(action, a.actionTime, media.matches);
      a.el.classList.toggle('walking', action === 'walk');
      a.el.classList.toggle('grazing', action === 'graze');
      a.el.style.transform = `translate(${Math.min(w, Math.max(0, x))}px,${Math.min(h, Math.max(0, y))}px)`;
      a.el.style.zIndex = String(1 + Math.floor(y));
    }
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    resize.disconnect();
  };
}

export function coinIcon() {
  return '<svg class="coin-icon" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="currentColor" opacity=".18"/><circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="16" cy="16" r="8.5" fill="none" stroke="currentColor" stroke-width="1"/><path d="M16 10v12m-3-9h6m-6 6h6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
}
export function walletBarHTML(s) {
  const w = walletSummary(s);
  return (
    '<section class="pasture-wallet" aria-label="草场金币"><div class="wallet-balance">' +
    coinIcon() +
    '<div><span>金币余额</span><strong id="coin-balance">' +
    w.balance.toLocaleString('zh-CN') +
    '</strong></div></div><div class="wallet-totals"><span>累计获得 <b>' +
    w.earned.toLocaleString('zh-CN') +
    '</b></span><span>已兑换 <b>' +
    w.spent.toLocaleString('zh-CN') +
    '</b></span><small>正式答对 +1 · 加练抓回 +1</small></div><div class="wallet-actions"><button class="secondary" data-action="coin-history">金币记录</button><button class="primary" data-action="sheep-skins">羊皮肤</button></div></section>'
  );
}
export function skinShopHTML(s, catalog = SHEEP_SKINS) {
  const w = walletSummary(s),
    newSkins = catalog.filter((x) => !x.starter);
  const tile = (skin) => {
    const owned = w.owned.includes(skin.id),
      selected = skinSelection(s).includes(skin.id),
      disabled = !owned && (skin.available === false || w.balance < skin.cost);
    return (
      '<section class="skin-tile ' +
      (selected ? 'is-selected' : '') +
      '" data-skin="' +
      esc(skin.id) +
      '"><div class="skin-art">' +
      sheepSVG(skin.variant) +
      '</div><div class="skin-caption"><strong>' +
      esc(skin.id) +
      '</strong><span>' +
      esc(skin.name) +
      '</span></div><small>' +
      (skin.starter ? '基础皮肤 · 已拥有' : owned ? '已拥有' : skin.cost + ' 金币') +
      '</small><button class="' +
      (selected ? 'primary' : 'secondary') +
      '" data-action="' +
      (owned ? 'skin-select' : 'skin-redeem') +
      '" data-skin="' +
      esc(skin.id) +
      '" ' +
      (disabled ? 'disabled' : '') +
      (owned ? ' aria-pressed="' + selected + '"' : '') +
      '>' +
      (selected
        ? '已选 ✓'
        : owned
          ? '选入随机'
          : skin.available === false
            ? '即将上架'
            : w.balance < skin.cost
              ? '还差 ' + (skin.cost - w.balance) + ' 金币'
              : '兑换') +
      '</button></section>'
    );
  };
  return (
    '<h2>羊皮肤</h2><div class="skin-shop-toolbar"><span class="shop-wallet">' +
    coinIcon() +
    '<strong>' +
    w.balance.toLocaleString('zh-CN') +
    '</strong><span>金币</span></span><button class="' +
    (w.selected === 'mixed' ? 'primary' : 'secondary') +
    '" data-action="skin-select" data-skin="mixed" aria-pressed="' +
    (w.selected === 'mixed') +
    '">全选已拥有</button></div><p class="muted">可多选：只在选中的皮肤中随机搭配；只选一款则统一使用。至少保留一款。</p><h3 class="skin-section-heading">基础皮肤 · S001–S006</h3><div class="skin-grid">' +
    catalog
      .filter((x) => x.starter)
      .map(tile)
      .join('') +
    '</div><h3 class="skin-section-heading">金币兑换</h3>' +
    (newSkins.length
      ? '<div class="skin-grid">' + newSkins.map(tile).join('') + '</div>'
      : '<p class="skin-shop-empty">新皮肤将在这里上架，金币余额会持续保留。</p>')
  );
}
export function coinHistoryHTML(s) {
  const w = walletSummary(s);
  return (
    '<h2>金币记录</h2><p class="coin-history-total">余额 <strong>' +
    w.balance.toLocaleString('zh-CN') +
    '</strong> · 累计获得 ' +
    w.earned.toLocaleString('zh-CN') +
    ' · 已兑换 ' +
    w.spent.toLocaleString('zh-CN') +
    '</p><ol class="coin-history">' +
    w.recent
      .map((t) => {
        const date = new Date(t.at).toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }),
          word = t.key ? s.entries[t.key]?.english || t.key : '',
          label =
            t.type === 'opening'
              ? '历史正确作答'
              : t.type === 'redeem'
                ? '兑换皮肤 ' + t.skin
                : (t.category === 'choice' ? '认义选择' : '拼写练习') +
                  ' · ' +
                  (t.kind === 'extra' ? '加练抓回' : '抓到羊');
        return (
          '<li><div><strong>' +
          esc(label) +
          '</strong>' +
          (word ? '<span lang="en">' + esc(word) + '</span>' : '') +
          '<small>' +
          esc(date) +
          '</small></div><b class="' +
          (t.amount > 0 ? 'coin-income' : 'coin-expense') +
          '">' +
          (t.amount > 0 ? '+' : '') +
          t.amount +
          '</b></li>'
        );
      })
      .join('') +
    '</ol>' +
    (!w.recent.length
      ? '<p class="skin-shop-empty">完成正式练习、答对抓羊后，这里会记录金币收入。</p>'
      : '<p class="muted">显示最近 100 条记录。</p>')
  );
}
