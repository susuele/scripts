// ==UserScript==
// @name         Arena History Export
// @namespace    local.arena.history.export
// @version      1.0.1
// @description  手动加载并导出当前对话全部已渲染轮次、模型回答版本、代码、表格和附件链接。
// @match        https://arena.ai/*
// @match        https://www.arena.ai/*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @license      MIT
// @homepageURL  https://github.com/susuele/scripts/tree/main/userscripts/arena-history-export
// @supportURL   https://github.com/susuele/scripts/issues
// @downloadURL  https://raw.githubusercontent.com/susuele/scripts/main/userscripts/arena-history-export/arena-history-export.user.js
// @updateURL    https://raw.githubusercontent.com/susuele/scripts/main/userscripts/arena-history-export/arena-history-export.user.js
// ==/UserScript==

(() => {
  'use strict';
  const VERSION = '1.0.1';
  let busy = false, cancelled = false, prepared = null, panel, status, summary, saveMD, saveJSON;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clean = s => String(s || '').replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();
  const text = (node, value) => { node.textContent = value; };

  function safeURL(value) {
    if (!value) return '';
    try {
      const url = new URL(value, location.href);
      return /^(https?:|blob:)$/.test(url.protocol) || /^data:image\/(png|jpeg|gif|webp);/i.test(value) ? url.href : '';
    } catch { return ''; }
  }
  function mdURL(value) { return value.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/[\r\n<>]/g, ''); }
  function inlineEscape(value) { return value.replace(/([\\`*_[\]<>])/g, '\\$1'); }
  function fence(value, char = '`') {
    const runs = value.match(char === '`' ? /`+/g : /~+/g) || [];
    return char.repeat(Math.max(3, ...runs.map(s => s.length + 1)));
  }

  // Read textContent, not innerText: off-screen carousel versions are also exported.
  function markdown(node, depth = 0) {
    if (node.nodeType === 3) return inlineEscape(node.textContent.replace(/\s+/g, ' '));
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    if (['script', 'style', 'button', 'svg', 'noscript'].includes(tag)) return '';
    if (node.classList.contains('katex')) {
      const latex = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
      if (latex) return node.parentElement?.classList.contains('katex-display') ? `\n\n$$\n${latex}\n$$\n\n` : `$${latex}$`;
    }
    if (tag === 'pre') {
      const code = node.querySelector('code');
      const body = code ? code.textContent : node.textContent;
      const lang = (code?.className.match(/language-([\w+-]+)/)?.[1] ||
        node.querySelector('[data-code-block] span.text-sm')?.textContent || '').replace(/[^\w+-]/g, '');
      const marker = fence(body);
      return `\n\n${marker}${lang}\n${body.replace(/\n$/, '')}\n${marker}\n\n`;
    }
    if (tag === 'code') {
      const body = node.textContent, runs = body.match(/`+/g) || [];
      const mark = '`'.repeat(Math.max(1, ...runs.map(s => s.length + 1)));
      const pad = /^[` ]|[` ]$/.test(body) ? ' ' : '';
      return mark + pad + body + pad + mark;
    }
    if (tag === 'br') return '  \n';
    if (tag === 'hr') return '\n\n---\n\n';
    if (tag === 'img') {
      const url = safeURL(node.currentSrc || node.getAttribute('src') || node.getAttribute('data-src'));
      return url ? `![${inlineEscape(node.alt || '图片')}](${mdURL(url)})` : '[图片：无可用链接]';
    }
    const children = () => Array.from(node.childNodes).map(n => markdown(n, depth)).join('');
    if (tag === 'table') {
      const rows = Array.from(node.querySelectorAll('tr')).filter(row => row.closest('table') === node)
        .map(row => Array.from(row.children).filter(cell => /^(TD|TH)$/.test(cell.tagName))
          .map(cell => clean(markdown(cell)).replace(/\|/g, '\\|').replace(/\n+/g, '<br>')));
      if (!rows.length) return '';
      const width = Math.max(...rows.map(row => row.length));
      const format = row => '| ' + Array.from({ length: width }, (_, i) => row[i] || '').join(' | ') + ' |';
      return '\n\n' + [format(rows[0]), format(Array(width).fill('---')), ...rows.slice(1).map(format)].join('\n') + '\n\n';
    }
    if (tag === 'ul' || tag === 'ol') {
      let index = Number(node.getAttribute('start') || 1);
      return '\n' + Array.from(node.children).filter(n => n.tagName === 'LI').map(li => {
        const marker = tag === 'ol' ? `${index++}. ` : '- ';
        const body = clean(Array.from(li.childNodes).map(n => markdown(n, depth + 1)).join(''));
        return marker + body.replace(/\n/g, '\n' + ' '.repeat(marker.length));
      }).join('\n') + '\n';
    }
    if (tag === 'a') {
      const url = safeURL(node.getAttribute('href')), label = children();
      return url ? `[${label || inlineEscape(url)}](${mdURL(url)})` : label;
    }
    const body = children();
    if (/^h[1-6]$/.test(tag)) return `\n\n${'#'.repeat(Number(tag[1]))} ${clean(body)}\n\n`;
    if (tag === 'strong' || tag === 'b') return `**${body}**`;
    if (tag === 'em' || tag === 'i') return `*${body}*`;
    if (tag === 'del' || tag === 's') return `~~${body}~~`;
    if (tag === 'blockquote') return '\n\n' + clean(body).split('\n').map(line => '> ' + line).join('\n') + '\n\n';
    if (['p', 'div', 'section', 'details', 'summary', 'figure', 'figcaption'].includes(tag)) return '\n\n' + body + '\n\n';
    return body;
  }

  function context() {
    const id = location.pathname.match(/^\/c\/([^/]+)\/?$/)?.[1];
    if (!id) throw new Error('请先打开需要导出的历史对话（地址应为 /c/对话ID）。');
    const area = document.getElementById('chat-area');
    if (!area) throw new Error('未找到 chat-area；页面可能尚未加载或 Arena 已改版。');
    const list = Array.from(area.querySelectorAll('ol')).find(e =>
      e.classList.contains('flex-col-reverse') && e.querySelector('.prose'));
    if (!list) throw new Error('未识别到当前版本的对话列表。请等待消息加载；不要导出空白首页。');
    const scroll = list.closest('[data-radix-scroll-area-viewport]');
    if (!scroll) throw new Error('未识别到历史滚动区域，无法核查早期消息。');
    return { id, area, list, scroll };
  }
  function rowsOf(list) {
    return Array.from(list.children).filter(row => row.querySelector('.prose') ||
      row.querySelector('img:not([aria-hidden="true"]), video, audio'));
  }
  function modelOf(prose, row) {
    for (let p = prose ? prose.parentElement : row; p && p !== row.parentElement; p = p.parentElement) {
      const labels = Array.from(p.querySelectorAll('h2.hidden')).filter(e => /^Message from /i.test(e.textContent));
      if (labels.length === 1) return clean(labels[0].textContent.replace(/^Message from\s+/i, ''));
      const models = p.querySelectorAll('span.font-mono .truncate');
      if (models.length === 1) return clean(models[0].textContent);
    }
    return '未知模型';
  }
  function attachments(root) {
    const result = [];
    for (const e of root.querySelectorAll('img,video,audio,a[download]')) {
      const url = safeURL(e.currentSrc || e.getAttribute('src') || e.querySelector('source')?.src || e.getAttribute('href'));
      if (!url) continue;
      const item = { type: e.tagName.toLowerCase(), name: e.alt || e.getAttribute('download') || clean(e.textContent) || '', url };
      if (!result.some(x => x.type === item.type && x.url === url)) result.push(item);
    }
    return result;
  }
  function extract(ctx) {
    // Arena puts newest rows first in the DOM, then reverses them with CSS.
    const rows = rowsOf(ctx.list).reverse();
    const messages = [];
    for (const row of rows) {
      const user = row.classList.contains('justify-end');
      const bodies = Array.from(row.querySelectorAll('.prose')).filter(e => !e.parentElement.closest('.prose'));
      if (!bodies.length) {
        const slides = Array.from(row.querySelectorAll('[aria-roledescription="slide"]'));
        const scopes = slides.length ? slides : [row];
        scopes.forEach((scope, index) => {
          const media = attachments(scope), model = user ? null : modelOf(null, scope);
          if (!media.length || (!user && model === '未知模型')) throw new Error('发现无法识别的附件/消息类型，已停止导出。');
          messages.push({ role: user ? 'user' : 'assistant', model, version: user ? null : index + 1,
            markdown: '[此消息仅含附件；见附件链接]', attachments: media });
        });
        continue;
      }
      if (user && bodies.length !== 1) throw new Error('用户消息结构发生变化，无法可靠区分消息顺序。');
      bodies.forEach((prose, index) => {
        const scope = user ? row : prose.closest('[aria-roledescription="slide"]') || row;
        const body = clean(markdown(prose));
        const media = attachments(scope);
        if (!body && !media.length) throw new Error('存在空白或尚未完成的消息，请稍后重试。');
        if (!user && modelOf(prose, row) === '未知模型') throw new Error('无法识别回答的模型标签；请检查 Arena 是否改版。');
        messages.push({ role: user ? 'user' : 'assistant', model: user ? null : modelOf(prose, row),
          version: user ? null : index + 1, markdown: body, attachments: media });
      });
    }
    let turn = 0;
    for (const message of messages) {
      if (message.role === 'user') turn++;
      message.turn = turn;
    }
    if (!turn || messages[0]?.role !== 'user') throw new Error('最早一条消息不是用户提问，无法确认历史起点。');
    return messages;
  }
  function signature(messages) { return JSON.stringify(messages); }
  function inventory(messages) {
    const counts = new Map();
    for (const { turn, ...message } of messages) {
      const key = JSON.stringify(message);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }
  function check(ctx) {
    if (cancelled) throw new Error('已取消，未下载文件。');
    if (location.pathname.match(/^\/c\/([^/]+)/)?.[1] !== ctx.id || !ctx.list.isConnected)
      throw new Error('导出过程中切换了对话，请在目标对话重新操作。');
    const generating = Array.from(ctx.area.querySelectorAll('button')).some(e =>
      !e.disabled && /^(stop( generating| generation| response)?|停止(生成|回答)?)$/i.test(clean(e.getAttribute('aria-label') || e.textContent)));
    if (generating) throw new Error('模型仍在生成，请等回答结束后再导出。');
  }
  async function settle(ctx, edge, deadline, known) {
    let stable = 0, previous = '';
    while (stable < 5) {
      check(ctx);
      if (Date.now() > deadline) throw new Error('加载历史超过 60 秒，未确认完整性。请先手动加载历史后重试。');
      ctx.scroll.scrollTo({ top: edge === 'top' ? 0 : ctx.scroll.scrollHeight, behavior: 'instant' });
      await wait(800);
      check(ctx);
      const messages = extract(ctx), sig = signature(messages);
      const keys = inventory(messages);
      // Do not silently lose earlier messages due to virtual rendering or pagination.
      for (const [key, count] of known) if ((keys.get(key) || 0) < count) throw new Error('检测到历史消息被移出页面或发生变更。当前脚本无法保证完整性，已停止导出。');
      for (const [key, count] of keys) known.set(key, count);
      const state = `${ctx.scroll.scrollHeight}:${sig}`;
      stable = state === previous ? stable + 1 : 0;
      previous = state;
      text(status, `正在核查${edge === 'top' ? '历史起点' : '最新消息'}：${messages.filter(m => m.role === 'user').length} 轮，${messages.filter(m => m.role === 'assistant').length} 个回答…`);
    }
  }
  async function prepare() {
    if (busy) return;
    busy = true; cancelled = false; prepared = null;
    saveMD.disabled = saveJSON.disabled = true;
    text(summary, ''); text(status, '正在加载历史…');
    let ctx, position, originalHeight;
    try {
      ctx = context(); position = ctx.scroll.scrollTop; originalHeight = ctx.scroll.scrollHeight;
      check(ctx);
      const known = inventory(extract(ctx));
      const deadline = Date.now() + 60000;
      await settle(ctx, 'top', deadline, known);
      await settle(ctx, 'bottom', deadline, known);
      await settle(ctx, 'top', deadline, known);
      check(ctx);
      const messages = extract(ctx);
      const link = Array.from(document.querySelectorAll('a[href]')).find(e => {
        try { return new URL(e.href).pathname === `/c/${ctx.id}`; } catch { return false; }
      });
      prepared = { schema_version: 1, exporter_version: VERSION, conversation_id: ctx.id,
        title: clean(link?.textContent) || `Arena 对话 ${ctx.id}`, url: `${location.origin}/c/${ctx.id}`,
        exported_at: new Date().toISOString(), source: 'Arena rendered conversation DOM',
        coverage: { status: 'loaded_dom_stable', turns: messages.filter(m => m.role === 'user').length,
          assistant_answers: messages.filter(m => m.role === 'assistant').length,
          limitations: ['仅包含页面已渲染/加载的当前对话及回答版本；无法核实服务器端未返回、已删除或未挂载的分支。',
            '附件保存链接，不下载二进制文件；临时链接可能失效。', 'Markdown 根据页面渲染内容还原，非服务端原始 Markdown。'] }, messages };
      text(status, '核查完成，可以下载。');
      text(summary, `${prepared.coverage.turns} 轮提问 · ${prepared.coverage.assistant_answers} 个模型回答 · ${messages.length} 条消息（包括已挂载的回答版本）`);
      saveMD.disabled = saveJSON.disabled = false;
    } catch (error) { text(status, error.message || String(error)); }
    finally {
      if (ctx?.list.isConnected && location.pathname === `/c/${ctx.id}` && position !== undefined)
        ctx.scroll.scrollTo({ top: position + ctx.scroll.scrollHeight - originalHeight, behavior: 'instant' });
      busy = false;
    }
  }
  function exportMarkdown(data) {
    const out = [`# ${inlineEscape(data.title)}`, `来源：${data.url}`, `导出时间：${data.exported_at}`,
      `共 ${data.coverage.turns} 轮提问、${data.coverage.assistant_answers} 个模型回答。`,
      '> 导出范围：当前页面加载的消息及回答版本。附件为链接；未返回或已删除的历史无法恢复。'];
    for (const m of data.messages) {
      out.push(`---\n\n## 第 ${m.turn} 轮 · ${m.role === 'user' ? '用户' : `${inlineEscape(m.model)}（回答 ${m.version}）`}`, m.markdown);
      if (m.attachments.length) out.push('附件：\n' + m.attachments.map(a =>
        `- [${inlineEscape(a.name || a.type)}](${mdURL(a.url)})`).join('\n'));
    }
    return out.join('\n\n') + '\n';
  }
  function download(format) {
    if (!prepared || busy) return;
    try {
      const ctx = context();
      if (ctx.id !== prepared.conversation_id) throw new Error('对话已切换，请重新加载并核查。');
      check(ctx);
      if (signature(extract(ctx)) !== signature(prepared.messages)) throw new Error('消息已发生变化，请重新加载并核查后下载。');
      const title = prepared.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 60).replace(/[. ]+$/, '') || 'Arena';
      const base = `${title}_${prepared.conversation_id}_${prepared.exported_at.replace(/[:.]/g, '-')}`;
      const body = format === 'json' ? JSON.stringify(prepared, null, 2) : exportMarkdown(prepared);
      const blob = new Blob([body], { type: format === 'json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = `${base}.${format === 'json' ? 'json' : 'md'}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      text(status, '已请求浏览器下载；以浏览器下载结果为准。');
    } catch (error) { text(status, error.message || String(error)); }
  }
  function mount() {
    const host = document.createElement('div');
    host.id = 'arena-history-export';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `:host{position:fixed;right:18px;bottom:18px;z-index:2147483647;font:14px/1.5 system-ui,sans-serif;color:#e5e7eb}button{font:inherit;cursor:pointer;border:1px solid #596579;border-radius:8px;padding:7px 11px;background:#243247;color:white}button:disabled{opacity:.4;cursor:default}section{width:min(370px,calc(100vw - 50px));padding:16px;background:#111827;border:1px solid #596579;border-radius:12px;box-shadow:0 6px 26px #0006;margin-bottom:8px}h3{margin:0 0 8px;font-size:16px}p{margin:8px 0;overflow-wrap:anywhere}.note{font-size:12px;color:#b4c0d3}.actions{display:flex;gap:8px;flex-wrap:wrap}[hidden]{display:none!important}`;
    shadow.appendChild(style);
    panel = document.createElement('section'); panel.hidden = true;
    const heading = document.createElement('h3'); text(heading, '导出当前对话历史'); panel.appendChild(heading);
    const note = document.createElement('p'); note.className = 'note';
    text(note, '先加载并核查，再手动下载。包含已加载的所有轮次及模型回答版本。附件保留链接；未返回、已删除或未挂载的分支无法核实。'); panel.appendChild(note);
    const actions = document.createElement('div'); actions.className = 'actions';
    function button(label, fn) { const b = document.createElement('button'); text(b, label); b.addEventListener('click', fn); actions.appendChild(b); return b; }
    button('加载并核查', prepare); button('取消', () => { cancelled = true; });
    saveMD = button('下载 Markdown', () => download('md')); saveJSON = button('下载 JSON', () => download('json'));
    saveMD.disabled = saveJSON.disabled = true; panel.appendChild(actions);
    status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    text(status, '请在目标对话中点击“加载并核查”。'); panel.appendChild(status);
    summary = document.createElement('p'); panel.appendChild(summary);
    shadow.appendChild(panel);
    const toggle = document.createElement('button'); text(toggle, '导出对话');
    toggle.addEventListener('click', () => { panel.hidden = !panel.hidden; }); shadow.appendChild(toggle);
    document.body.appendChild(host);
    if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('Arena：导出当前对话', () => { panel.hidden = false; });
  }
  mount();
})();
