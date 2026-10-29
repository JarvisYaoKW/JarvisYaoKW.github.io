const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
let catalogPromise;
export async function loadCatalog() {
  catalogPromise ??= fetch('/wordbooks/catalog.json')
    .then(async (r) => {
      if (!r.ok) throw Error('预置词库目录暂时无法加载，请联网后重试。');
      return r.json();
    })
    .catch((e) => {
      catalogPromise = null;
      throw e;
    });
  return catalogPromise;
}
export async function loadBook(id) {
  const catalog = await loadCatalog(),
    book = catalog.books.find((b) => b.id === id);
  if (!book) throw Error('没有找到这本预置词库。');
  const r = await fetch(book.file + '?v=' + encodeURIComponent(book.version));
  if (!r.ok) throw Error('词库下载失败，请检查网络后重试。');
  const data = await r.json();
  if (!Array.isArray(data.rows) || data.rows.length !== book.count)
    throw Error('词库数据校验失败，未执行导入。');
  return { book, rows: data.rows };
}
export function bookGroup(book) {
  return (
    book.group ||
    { 'ielts-core': '雅思核心 1000', ielts: '雅思词汇', cet4: '英语四级', cet6: '英语六级' }[
      book.id
    ] ||
    book.title
  );
}
export function isBookInstalled(state, book) {
  return (
    state.builtinBooks?.[book.id]?.version === book.version ||
    !!(
      book.entryKeys?.length &&
      book.entryKeys.every(
        (key) =>
          Object.hasOwn(state.entries, key) && state.entries[key].groups?.includes(bookGroup(book)),
      )
    )
  );
}
export function catalogHTML(state, catalog) {
  return `<div class="wordbook-heading"><h2>预置词库</h2><p>选择一本加入当前设备。相同英文会合并释义，已有成绩和进度保留。</p></div><div class="wordbook-list">${catalog.books
    .map((b) => {
      const installed = isBookInstalled(state, b);
      return `<section class="wordbook-row"><div><h3>${esc(b.title)}</h3><p class="wordbook-meta">${b.count.toLocaleString('zh-CN')} 词 · ${esc(b.category)} · ${esc(b.licenseLabel || b.license || '来源见说明')}</p><p>${esc(b.description)}</p>${b.noticeUrl ? `<a class="wordbook-notice" href="${esc(b.noticeUrl)}" target="_blank" rel="noopener noreferrer">来源说明 ↗</a>` : ''}</div><button class="${installed ? 'secondary' : 'primary'}" data-action="install-book" data-book="${esc(b.id)}" ${installed ? 'disabled' : ''}>${installed ? '已添加' : '加入我的词库'}</button></section>`;
    })
    .join(
      '',
    )}</div><p class="wordbook-privacy">词库和练习进度保存在当前浏览器，其他设备独立使用。换设备继续练习，可导出并恢复完整备份。</p><details class="wordbook-sources"><summary>数据来源与许可</summary><p>${esc(catalog.sourceNotice)}</p><a href="https://github.com/skywind3000/ECDICT" target="_blank" rel="noopener noreferrer">ECDICT 源项目</a> · <a href="/wordbooks/ECDICT-LICENSE.txt" target="_blank" rel="noopener noreferrer">ECDICT 释义许可（MIT）</a></details>`;
}
