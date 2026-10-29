import { SHEEP_SKINS, walletSummary, selectedSkin } from './pasture-economy.mjs';
import { category } from './engine.mjs';
import { herdSummary, sheepStatus } from './herd.mjs';
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const sheepSeed = (key) =>
  [...key].reduce((n, c) => (Math.imul(n, 31) + c.codePointAt(0)) >>> 0, 7);
export function sheepSVG(variant = 0) {
  const v = variant % 6,
    lamb = v === 2,
    ram = v === 3,
    floppy = v === 4;
  const wool = ['#fffdf3', '#e5ccb0', '#fffcf6', '#ebe3d2', '#dac6ac', '#787973'][v];
  const face = ['#6c645b', '#786153', '#a58b79', '#655b51', '#8c7662', '#4f514e'][v];
  return `<svg class="sheep-svg variant-${v}" viewBox="0 0 72 62" aria-hidden="true"><ellipse cx="34" cy="54" rx="25" ry="4" fill="#526a3820"/><g class="sheep-body" style="--wool:${wool};--face:${face}" transform="${lamb ? 'translate(8 7) scale(.8)' : v === 1 ? 'translate(-2 0) scale(1.05 1)' : ''}"><g class="sheep-legs" stroke="${face}" stroke-width="4.4" stroke-linecap="round"><path class="leg-front" d="M24 40v12M44 40v12"/><path class="leg-back" d="M17 39v11M36 41v11"/></g><circle cx="10" cy="33" r="5" fill="${wool}" stroke="#9e96893d"/><path d="M13 39C3 36 5 23 14 21C12 11 25 9 30 15C35 6 49 11 48 20C60 20 59 35 51 39C49 48 34 48 29 44C22 48 12 46 13 39Z" fill="${wool}" stroke="#9e968957" stroke-width="1.2"/>${v === 0 || ram ? '<path d="M18 24q-4 5 2 7m11-12q-4 5 2 7m10 6q-5 1-3 6m-17 0q-4 0-3 4" stroke="#c9c1af" stroke-width="1.2" fill="none" stroke-linecap="round"/>' : ''}<g class="sheep-head"><ellipse cx="53" cy="33" rx="9" ry="11" fill="${face}"/><ellipse cx="45" cy="${floppy ? 30 : 25}" rx="${floppy ? 7 : 6}" ry="3.6" transform="rotate(${floppy ? -40 : 25} 45 26)" fill="${face}"/><ellipse cx="61" cy="${floppy ? 30 : 24}" rx="${floppy ? 7 : 6}" ry="3.6" transform="rotate(${floppy ? 40 : -25} 61 26)" fill="${face}"/>${ram ? '<path d="M45 24c-11-14-18 5-7 6q6-1 3-6m19 0c10-14 17 4 7 6q-5-1-2-6" fill="none" stroke="#b69d79" stroke-width="4" stroke-linecap="round"/>' : ''}<circle cx="51" cy="31" r="1.4" fill="#fff"/><circle cx="57" cy="31" r="1.4" fill="#fff"/><path d="M53 38q2 2 4 0" stroke="#f1e5d5" stroke-width="1.2" fill="none" stroke-linecap="round"/></g><path class="sheep-scarf" d="M46 42q8 3 14-1l-1 4q-7 3-13-1Z" fill="#a6ae8c"/></g></svg>`;
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
      miss: `这次没抓到 #${number}，它留在出发草场。`,
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
    q = s.rounds[category(s)].current;
  const known = status === 'caught' || (q?.key === e.key && q.finished),
    selected = q?.key === e.key && !q.finished;
  return `<button class="sheep-token ${status}${selected ? ' selected' : ''}" data-action="pasture-inspect" data-key="${esc(e.key)}" data-seed="${seed}" data-variant="${skin.variant}" data-skin-id="${skin.id}" aria-label="羊 ${numbers.get(e.key)}，${names[status]}${known ? '，' + esc(e.english) : ''}" title="${esc('#' + numbers.get(e.key) + ' · ' + names[status] + ' · 皮肤 ' + skin.id + ' ' + skin.name + (known ? ' · ' + e.english : ''))}"><span class="sheep-direction">${sheepSVG(skin.variant)}</span><span class="sheep-name">${known ? esc(e.english) : '#' + numbers.get(e.key)}</span>${e.favorite ? '<i class="sheep-favorite" aria-label="已收藏">●</i>' : ''}${status === 'escaped' ? '<i class="sheep-escape">↶</i>' : ''}</button>`;
}
function field(s, list, side, numbers, pages) {
  const size = typeof innerWidth !== 'undefined' && innerWidth < 700 ? 12 : 24,
    totalPages = Math.max(1, Math.ceil(list.length / size));
  const page = Math.min(Math.max(0, pages[side] || 0), totalPages - 1),
    shown = list.slice(page * size, (page + 1) * size);
  return `<section class="pasture-field ${side}"><div class="field-heading"><div><span class="field-marker"></span><h2>${side === 'outside' ? '出发草场' : '记忆草场'}</h2><span class="field-count">${list.length}<small> 只</small></span></div><span>${side === 'outside' ? '还没带回的小羊' : '本轮已答对的小羊'}</span></div><div class="field-ground"><div class="field-grass"></div><div class="sheep-roam">${shown.map((e) => token(s, e, numbers)).join('')}</div>${!list.length ? `<div class="field-empty">${side === 'outside' ? '小羊都被带过去啦。' : '这片草地在等第一只小羊。'}<small>${side === 'outside' ? '接着完成正常练习里的加练。' : '回到练习页，答对就能带回来。'}</small></div>` : ''}<div class="field-fence" aria-hidden="true"></div></div><div class="field-footer"><span>${list.length ? `${page * size + 1}–${Math.min((page + 1) * size, list.length)} / ${list.length} 只` : '0 只'} · 自由活动中</span>${totalPages > 1 ? `<div><button data-action="pasture-page" data-side="${side}" data-page="${page - 1}" ${page === 0 ? 'disabled' : ''} aria-label="上一页羊群">←</button><span>${page + 1} / ${totalPages}</span><button data-action="pasture-page" data-side="${side}" data-page="${page + 1}" ${page === totalPages - 1 ? 'disabled' : ''} aria-label="下一页羊群">→</button></div>` : '<span class="field-click-note">点击小羊查看状态</span>'}</div></section>`;
}
export function pasturePage(s, toolbar, pages = {}) {
  const sum = herdSummary(s),
    r = s.rounds[category(s)],
    q = r.current,
    numbers = new Map(Object.keys(s.entries).map((k, i) => [k, String(i + 1).padStart(3, '0')]));
  const percent = sum.entries.length
    ? Math.round((sum.caught.length / sum.entries.length) * 100)
    : 0;
  return `<main class="main pasture-main">${toolbar}${walletBarHTML(s)}<div class="herd-progress"><div><strong>正常练习 · 第 ${r.number} 轮</strong><span>${category(s) === 'typing' ? '拼写进度' : '认义选择进度'}</span><span>已带回 <b>${sum.caught.length}</b> / ${sum.entries.length} 只</span><span>基础已练 ${sum.done} 条 · 加练 ${sum.extra} 次</span></div><span>逃回 ${sum.escaped.length} 只</span></div><div class="herd-progress-bar" aria-label="已带回 ${percent}%"><i style="width:${percent}%"></i></div><div class="pasture-board">${field(s, sum.outside, 'outside', numbers, pages)}<div class="pasture-bridge" aria-hidden="true"><span>→</span><small>答对就带回</small></div>${field(s, sum.caught, 'inside', numbers, pages)}</div><div class="herd-story ${sum.event?.type || ''}" role="status">${esc(eventText(s))}</div><div class="pasture-return"><div><strong>${q ? '当前题和输入都已保留' : '正常练习进度'}</strong><p>答对带过去 · 答错留在原地 · 已抓到的词进入加练时逃回来</p></div><button class="primary" data-action="pasture-practice">${q?.finished ? '返回当前答案' : q ? '继续正常练习' : '开始正常练习'} →</button></div>${sum.skipped.length ? `<p class="pasture-note">${sum.skipped.length} 只本轮跳过的小羊留在出发草场，不计为答错。</p>` : ''}${sum.unknown.length ? '<p class="pasture-note">部分旧记录没有本轮答题结果，暂时留在出发草场；后续作答会自动更新。</p>' : ''}<div class="pasture-footnote"><span>与练习页共用模式、分组、范围和轮次 · 新词自动加入 · 照打与拓展不改变羊的位置</span></div></main>`;
}

// One animation loop per mounted grassland; all coordinates remain inside its bounds.
export function mountSheepRoaming(root = document) {
  const media = matchMedia('(prefers-reduced-motion: reduce)'),
    fields = [...root.querySelectorAll('.sheep-roam')];
  let frame = 0,
    last = 0,
    disposed = false;
  const items = [];
  function openSpot(field, random, except = null) {
    const peers = items.filter((a) => a.field === field && a !== except),
      w = Math.max(1, field.clientWidth - 67),
      h = Math.max(1, field.clientHeight - 67);
    let best = { x: random(), y: random() },
      distance = -1;
    for (let i = 0; i < 20; i++) {
      const spot = { x: random(), y: random() },
        d = peers.length
          ? Math.min(...peers.map((a) => Math.hypot((a.x - spot.x) * w, (a.y - spot.y) * h)))
          : 1;
      if (d > distance) {
        best = spot;
        distance = d;
      }
    }
    return best;
  }
  for (const field of fields)
    for (const el of field.querySelectorAll('.sheep-token')) {
      let seed = Number(el.dataset.seed) || 1;
      const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      const spot = openSpot(field, random),
        target = openSpot(field, random);
      items.push({
        field,
        el,
        random,
        ...spot,
        tx: target.x,
        ty: target.y,
        pause: random() * 2,
        rest: false,
        speed: 13 + random() * 20,
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
          a.pause = 0.7 + a.random() * 2.8;
          a.rest = a.random() < 0.5;
          const target = openSpot(a.field, a.random, a);
          a.tx = target.x;
          a.ty = target.y;
        } else {
          let vx = dx / d,
            vy = dy / d;
          for (const other of items)
            if (other !== a && other.field === a.field) {
              const ox = x - other.x * w,
                oy = y - other.y * h,
                near = Math.hypot(ox, oy);
              if (near > 0 && near < 60) {
                vx += ((ox / near) * (60 - near)) / 25;
                vy += ((oy / near) * (60 - near)) / 25;
              }
            }
          const length = Math.max(1, Math.hypot(vx, vy));
          x = Math.min(w, Math.max(0, x + (vx / length) * step));
          y = Math.min(h, Math.max(0, y + (vy / length) * step));
          a.x = w ? x / w : 0;
          a.y = h ? y / h : 0;
          a.el.style.setProperty('--facing', vx < 0 ? '-1' : '1');
        }
      } else if (!held) a.pause -= dt;
      a.el.classList.toggle('walking', !held && a.pause <= 0);
      a.el.classList.toggle('grazing', !held && a.pause > 0 && a.rest);
      a.el.style.transform = `translate(${Math.min(w, Math.max(0, x))}px,${Math.min(h, Math.max(0, y))}px)`;
      a.el.style.zIndex = String(1 + Math.floor(y));
    }
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
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
      selected = w.selected === skin.id,
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
      (selected || disabled ? 'disabled' : '') +
      '>' +
      (selected
        ? '使用中'
        : owned
          ? '使用'
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
    '">随机外观</button></div><h3 class="skin-section-heading">基础皮肤 · S001–S006</h3><div class="skin-grid">' +
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
