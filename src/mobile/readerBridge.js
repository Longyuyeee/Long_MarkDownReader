// Trusted, fixed reader controller. Its SHA-256 is pinned in readerDocument.ts
// and the Android CSP. Never interpolate document text into this script.
(() => {
  'use strict';
  const channel = document.currentScript.dataset.channel;
  const content = document.getElementById('longedit-reader-content');
  const send = (type, value = {}) => parent.postMessage({ channel, type, ...value }, '*');
  let initialized = false, touched = false, restorePoint = null, timer, hits = [], active = -1, activity = 0, restoring = false, restoreRevision = 0;
  const blocks = () => [...content.children];
  const flow = item => { const rect = item.getBoundingClientRect(); return {top:rect.top + scrollY,height:rect.height}; };
  function position() {
    const items = blocks(), y = scrollY;
    let block = items.findIndex(item => { const box = flow(item); return box.top + box.height > y; });
    if (block < 0) block = Math.max(0, items.length - 1);
    const item = items[block];
    const box = item ? flow(item) : null;
    return { block, fraction: box ? Math.max(0, Math.min(1, (scrollY - box.top) / Math.max(1, box.height))) : 0,
      progress: Math.max(0, Math.min(1, scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight))),
      horizontal: Math.max(0, Math.min(1, scrollX / Math.max(1, document.documentElement.scrollWidth - innerWidth))) };
  }
  function codeAnchor() {
    if (content.dataset.longeditCode !== 'true') return;
    const rows = [...content.querySelectorAll('[data-longedit-code-line]')];
    const row = rows.find(item => { const box = flow(item); return box.top + box.height > scrollY; }) || rows[rows.length - 1];
    if (!row) return;
    const box = flow(row);
    return { line: Number(row.dataset.longeditCodeLine), fraction: Math.max(0, Math.min(1, (scrollY - box.top) / Math.max(1, box.height))) };
  }
  function restore(point, anchor) {
    restoring = true; const revision = ++restoreRevision;
    requestAnimationFrame(() => requestAnimationFrame(() => { if (revision === restoreRevision) restoring = false; }));
    const item = blocks()[point.block];
    const box = item ? flow(item) : null;
    const row = content.dataset.longeditCode === 'true' && anchor && Number.isSafeInteger(anchor.line) && anchor.line > 0 && anchor.line <= 2000 && Number.isFinite(anchor.fraction) && anchor.fraction >= 0 && anchor.fraction <= 1 ? content.querySelector(`[data-longedit-code-line="${anchor.line}"]`) : null;
    const target = row && flow(row);
    scrollTo((point.horizontal || 0) * Math.max(0, document.documentElement.scrollWidth - innerWidth), target ? target.top + target.height * anchor.fraction : point.progress <= .001 ? 0 : box ? box.top + box.height * point.fraction : 0);
  }
  function publish(requestId) { if (initialized) send('position', { point: position(), activity, codeAnchor: codeAnchor(), ...(typeof requestId === 'string' ? { requestId } : {}) }); }
  content.addEventListener('click', event => {
    const copy = event.target instanceof Element ? event.target.closest('button[data-longedit-copy-code]') : null;
    if (copy && content.contains(copy)) {
      event.preventDefault();
      const index = Number(copy.dataset.longeditCopyCode);
      if (Number.isInteger(index) && index >= 0 && index < 128 && !copy.disabled) { copy.disabled = true; send('copy-code', { index }); }
      return;
    }
    const link = event.target instanceof Element ? event.target.closest('a[data-longedit-pdf]') : null;
    if (!link || !content.contains(link)) return;
    event.preventDefault();
    const index = Number(link.dataset.longeditPdf);
    if (Number.isInteger(index) && index >= 0 && index < 200) { publish(); send('pdf-reference', { index }); }
  });
  content.addEventListener('pointerdown', event => { if (event.target instanceof Element && event.target.closest('button[data-longedit-copy-code]')) event.preventDefault(); });
  if (content.dataset.longeditMarkdown === 'true') {
    let hasSelection = false;
    document.addEventListener('selectionchange', () => {
      const selection = getSelection();
      const next = !!selection && !selection.isCollapsed && content.contains(selection.anchorNode) && content.contains(selection.focusNode);
      if (next === hasSelection) return;
      hasSelection = next;
      send('selection-state', { active: hasSelection });
    });
  }
  addEventListener('scroll', () => { if (initialized && !restoring) { activity++; touched = true; } clearTimeout(timer); timer = setTimeout(publish, 120); }, { passive: true });
  for (const type of ['touchstart', 'wheel', 'pointerdown', 'keydown']) addEventListener(type, () => { touched = true; activity++; }, { passive: true });
  addEventListener('pagehide', publish);
  function status(truncated = false) { send('matches', { count: hits.length, current: active + 1, truncated }); }
  function navigate(direction) {
    if (!hits.length) return;
    active = (active + direction + hits.length) % hits.length;
    content.querySelectorAll('mark[data-longedit-hit]').forEach(mark => mark.classList.toggle('current-hit', Number(mark.dataset.longeditHit) === active));
    content.querySelector(`mark[data-longedit-hit="${active}"]`)?.scrollIntoView({ block: 'center' });
    touched = true; activity++; status(hits.length === 1000); publish();
  }
  function search(query) {
    content.querySelectorAll('mark[data-longedit-hit]').forEach(mark => mark.replaceWith(document.createTextNode(mark.textContent)));
    content.normalize(); hits = []; active = -1;
    if (!query) { status(); return; }
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, { acceptNode(node) {
      return node.parentElement.closest('script,style,textarea,select,button,[hidden],[data-longedit-image],[data-longedit-decoration]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    } });
    const nodes = []; let text = '', node, lastBlock;
    while ((node = walker.nextNode())) {
      const block = node.parentElement.closest('p,h1,h2,h3,h4,h5,h6,li,pre,td,th,blockquote');
      if (block !== lastBlock && text) text += '\n';
      nodes.push({ node, from: text.length, to: text.length + node.length }); text += node.data; lastBlock = block;
    }
    const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
    let match;
    while (hits.length < 1000 && (match = pattern.exec(text))) hits.push({ from: match.index, to: match.index + match[0].length });
    let cursor = hits.length - 1;
    for (let i = nodes.length - 1; i >= 0 && cursor >= 0; i--) {
      const entry = nodes[i];
      while (cursor >= 0 && hits[cursor].from >= entry.to) cursor--;
      for (let j = cursor; j >= 0 && hits[j].to > entry.from; j--) {
        const from = Math.max(0, hits[j].from - entry.from), to = Math.min(entry.node.length, hits[j].to - entry.from);
        if (to <= from) continue;
        const range = document.createRange(); range.setStart(entry.node, from); range.setEnd(entry.node, to);
        const mark = document.createElement('mark'); mark.dataset.longeditHit = String(j); range.surroundContents(mark);
      }
    }
    if (hits.length) navigate(1); else status();
  }
  addEventListener('message', event => {
    const data = event.data;
    if (event.source !== parent || !data || data.channel !== channel) return;
    if (data.type === 'init') {
      restorePoint = data.point || null;
      if (restorePoint) restore(restorePoint, data.codeAnchor);
      initialized = true; publish();
    } else if (data.type === 'search' && typeof data.query === 'string' && data.query.length <= 128) search(data.query);
    else if (data.type === 'navigate' && (data.direction === 1 || data.direction === -1)) navigate(data.direction);
    else if (data.type === 'top') { touched = true; activity++; scrollTo(0, 0); publish(); }
    else if (data.type === 'snapshot') publish(data.requestId);
    else if (data.type === 'locate-code-line' && initialized && content.dataset.longeditCode === 'true' && Number.isSafeInteger(data.line) && data.line > 0 && data.line <= 2000) {
      const line = content.querySelector(`[data-longedit-code-line="${data.line}"]`);
      if (line) {
        content.querySelectorAll('.reader-source-current').forEach(item => item.classList.remove('reader-source-current'));
        line.classList.add('reader-source-current');
        touched = true; activity++; line.scrollIntoView({ block: 'center', inline: 'nearest' });
      }
      publish(data.requestId);
    }
    else if (data.type === 'restore' && initialized && typeof data.requestId === 'string') {
      const applied = Number.isSafeInteger(data.activity) && data.activity === activity;
      if (applied) { restorePoint = data.point || null; touched = false; if (restorePoint) restore(restorePoint); }
      send('restored', { requestId: data.requestId, applied, point: position(), activity });
    }
    else if (data.type === 'code-copy-status' && Number.isInteger(data.index) && data.index >= 0 && data.index < 128 && ['copied', 'error'].includes(data.status)) {
      const button = content.querySelector(`button[data-longedit-copy-code="${data.index}"]`), status = content.querySelector(`[data-longedit-copy-status="${data.index}"]`);
      if (button && status) {
        button.disabled = false; status.textContent = data.status === 'copied' ? '已复制' : '复制未完成，请重试';
        clearTimeout(status._reset); status._reset = setTimeout(() => { status.textContent = ''; }, 2500);
      }
    }
    else if (data.type === 'image' && Number.isInteger(data.index)) {
      const target = content.querySelector(`[data-longedit-image="${data.index}"]`);
      if (!target) return;
      if (typeof data.url === 'string' && data.url.length <= 3000000 && /^data:image\/(png|jpeg|webp);base64,/.test(data.url)) {
        const image = document.createElement('img'); image.alt = target.dataset.alt || '';
        image.width = data.width; image.height = data.height;
        image.onload = () => { if (restorePoint && !touched) restore(restorePoint); publish(); };
        image.onerror = () => { target.textContent = '图片无法解码：' + image.alt; target.setAttribute('role', 'img'); target.setAttribute('aria-label', target.textContent); send('image-error', { index: data.index }); };
        image.src = data.url; target.replaceChildren(image); target.classList.remove('image-placeholder'); target.removeAttribute('role'); target.removeAttribute('aria-label');
      } else if (typeof data.error === 'string') { target.textContent = target.dataset.alt + '：' + data.error.slice(0, 240); target.setAttribute('aria-label', target.textContent); }
    }
  });
  addEventListener('resize', () => publish(), { passive: true });
  Promise.resolve(document.fonts?.ready).then(() => send('ready'));
})();
