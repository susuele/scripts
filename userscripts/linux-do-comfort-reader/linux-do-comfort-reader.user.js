// ==UserScript==
// @name         Linux.do Comfort Reader
// @namespace    https://linux.do/
// @version      2.6.4
// @description  简化话题列表，保留作者和回复的舒适阅读模式，重排原生 /print 并阻止自动打印。
// @match        https://linux.do/*
// @icon         https://linux.do/favicon.ico
// @run-at       document-start
// @grant        none
// @sandbox      raw
// @inject-into  page
// @noframes
// @license      MIT
// @homepageURL  https://github.com/susuele/scripts/tree/main/userscripts/linux-do-comfort-reader
// @supportURL   https://github.com/susuele/scripts/issues
// @downloadURL  https://raw.githubusercontent.com/susuele/scripts/main/userscripts/linux-do-comfort-reader/linux-do-comfort-reader.user.js
// @updateURL    https://raw.githubusercontent.com/susuele/scripts/main/userscripts/linux-do-comfort-reader/linux-do-comfort-reader.user.js
// ==/UserScript==

(function () {
  'use strict';
  if (new URLSearchParams(location.search).has('ldr-off')) return;

  // 必须在任何 DOM 初始化、存储读取之前拦截页面自身的 print。
  // @grant none + 页面执行环境：不能只修改油猴沙箱中的 window.print。
  function route() {
    // 优先识别无 slug 的短 URL，避免把 /t/123/8 的楼层 8 当成话题 ID。
    const match = location.pathname.match(/^\/t\/(\d+)(?:\/(\d+|print))?\/?$/) ||
      location.pathname.match(/^\/t\/[^/]+\/(\d+)(?:\/(\d+|print))?\/?$/);
    return {
      id: match ? match[1] : null,
      print: Boolean(match && match[2] === 'print'),
      base: match ? '/t/topic/' + match[1] : null,
    };
  }
  const nativePrint = window.print.bind(window);
  const guardedPrint = function (...args) {
    if (route().print) return; // 持续屏蔽，包括 DOMContentLoaded 后的延迟调用。
    return nativePrint(...args);
  };
  // 静态打印模板可能在加载时重新赋值 print；保留拦截入口。
  try {
    if (route().print) Object.defineProperty(window, 'print', {configurable:true, get:() => guardedPrint, set:() => {}});
    else window.print = guardedPrint;
  }
  catch { window.print = guardedPrint; }
  let fused = false;
  try { fused = sessionStorage.getItem('ldr-core-fuse') === '1'; } catch { /* 内存保险丝仍可使用。 */ }
  if (fused && !route().print) return;
  if (route().print) fused = false;

  const CONFIG_KEY = 'linux-do-comfort-reader:v2';
  const PALETTE_KEY = CONFIG_KEY + ':palette';
  const DEFAULTS = { autoReader: true, simplifyList: true, fontSize: 17, lineHeight: 1.75, width: 780 };
  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  }
  function clamp(value, min, max, fallback) {
    const number = typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN;
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }
  function validate(input) {
    const data = input && typeof input === 'object' ? input : {};
    return {
      autoReader: typeof data.autoReader === 'boolean' ? data.autoReader : DEFAULTS.autoReader,
      simplifyList: typeof data.simplifyList === 'boolean' ? data.simplifyList : DEFAULTS.simplifyList,
      fontSize: clamp(data.fontSize, 14, 28, DEFAULTS.fontSize),
      lineHeight: clamp(data.lineHeight, 1.4, 2.2, DEFAULTS.lineHeight),
      width: clamp(data.width, 560, 1100, DEFAULTS.width),
    };
  }
  let cfg = validate(readJSON(CONFIG_KEY));
  let storageFailed = false;
  const writeJSON = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { storageFailed = true; }
  };
  // 与自动开启设置独立，跟随话题 ID；同话题内楼层 URL 改变不重置。
  let currentId = route().id;
  let manualMode = null;
  let toolbar, topicReply, settings, scheduled = false, lastHref = location.href;
  let paletteDirty = true, themeRevision = 0, settingsDraft = null, previewFrame = 0;
  const postScans = new WeakMap(), dirtyPosts = new WeakSet();
  let lastListUrl = '/latest';
  const BAR_W = 54, BAR_GAP = 8, BAR_EDGE = 16;
  const css = `
    :root {
      --ldr-bg: var(--secondary, var(--ldr-fallback-bg, #fff));
      --ldr-fg: var(--primary, var(--ldr-fallback-fg, #222));
      --ldr-border: var(--primary-low, var(--ldr-fallback-border, #ddd));
      --ldr-accent: var(--tertiary, var(--ldr-fallback-accent, #176ca4));
      --ldr-soft: var(--primary-very-low, var(--ldr-fallback-soft, #f5f5f5));
      --ldr-title: var(--ldr-fg);
      --ldr-text: color-mix(in srgb, var(--ldr-fg) 90%, var(--ldr-bg));
      --ldr-meta: color-mix(in srgb, var(--ldr-fg) 72%, var(--ldr-bg));
      --ldr-font: system-ui, -apple-system, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif;
      --ldr-bar-w: ${BAR_W}px; --ldr-bar-gap: ${BAR_GAP}px; --ldr-bar-edge: ${BAR_EDGE}px;
      --ldr-reserve: calc(2 * (var(--ldr-bar-w) + var(--ldr-bar-gap) + var(--ldr-bar-edge)));
    }
    @media (prefers-color-scheme: dark) {
      html:not(.ldr-has-palette) {
        --ldr-fallback-bg: #181a1b; --ldr-fallback-fg: #ddd;
        --ldr-fallback-border: #3c4043; --ldr-fallback-soft: #25282a;
        --ldr-fallback-accent: #8ab4f8;
      }
    }
    #ldr-toolbar {
      position: fixed; right: auto; top: 50%; transform: translateY(-50%);
      left: var(--ldr-bar-left, calc(100% - var(--ldr-bar-w) - var(--ldr-bar-edge)));
      z-index: 900; display: flex; flex-direction: column; align-items: center; gap: 4px;
      box-sizing: border-box; width: var(--ldr-bar-w); padding: 6px; border: 1px solid var(--ldr-border);
      max-height: calc(100vh - 32px); border-radius: 14px; background: var(--ldr-bg); color: var(--ldr-meta);
      box-shadow: 0 6px 20px #0003; font: 14px/1.4 var(--ldr-font);
      opacity: .85; transition: opacity .2s;
    }
    #ldr-toolbar:is(:hover,:focus-within) { opacity: 1; }
    html:not(.ldr-bar-ready) #ldr-toolbar { visibility: hidden; }
    @media (max-width: 760px) {
      :root { --ldr-reserve: 0px; }
      #ldr-toolbar { opacity: .6; }
      #ldr-toolbar:is(:hover,:focus-within) { opacity: 1; }
    }
    #ldr-toolbar .ldr-divider { width: 26px; border-top: 1px solid var(--ldr-border); margin: 3px 0; }
    #ldr-toolbar[hidden] { display: none !important; }
    #ldr-toolbar a, #ldr-toolbar button, #ldr-toolbar .ldr-status {
      appearance: none; text-decoration: none; font: inherit; cursor: pointer;
      position: relative; box-sizing: border-box; flex: 0 0 40px; width: 40px; height: 40px;
      min-height: 40px; padding: 0; border: 0; border-radius: 9px; background: transparent; color: var(--ldr-meta);
      display: inline-flex; align-items: center; justify-content: center;
    }
    #ldr-toolbar .ldr-icon { display: block; width: 22px; height: 22px; pointer-events: none; }
    #ldr-toolbar .ldr-tooltip {
      position: absolute; right: calc(100% + 12px); top: 50%; transform: translateY(-50%);
      white-space: normal; width: max-content; max-width: min(220px, calc(100vw - 100px)); pointer-events: none; visibility: hidden; opacity: 0;
      padding: 7px 10px; border: 1px solid var(--ldr-border); border-radius: 7px;
      background: var(--ldr-bg); color: var(--ldr-fg); box-shadow: 0 2px 10px #0002;
      font: 13px/1.5 var(--ldr-font); transition: opacity .15s;
    }
    #ldr-toolbar :is(a,button,.ldr-status):focus-visible .ldr-tooltip { visibility: visible; opacity: 1; }
    @media (hover: hover) { #ldr-toolbar :is(a,button,.ldr-status):hover .ldr-tooltip { visibility: visible; opacity: 1; } }
    #ldr-toolbar a:hover, #ldr-toolbar button:hover { background: var(--ldr-soft); color: var(--ldr-title); }
    #ldr-toolbar :focus-visible, #ldr-settings :focus-visible { outline: 2px solid var(--ldr-accent); outline-offset: 2px; }
    #ldr-toolbar button.ldr-active { color: var(--ldr-accent); background: color-mix(in srgb, var(--ldr-accent) 15%, transparent); }
    #ldr-toolbar button.ldr-active::before { content: ""; position: absolute; left: 0; top: 10px; bottom: 10px; width: 2px; border-radius: 2px; background: currentColor; }
    #ldr-toolbar .ldr-status { cursor: help; }
    body.composer-open #ldr-toolbar, html.composer-open #ldr-toolbar { display: none; }
    #ldr-settings {
      --ldr-panel-bg: var(--ldr-bg);
      --ldr-card-bg: color-mix(in srgb, var(--ldr-fg) 4%, var(--ldr-bg));
      --ldr-input-bg: color-mix(in srgb, var(--ldr-bg) 90%, var(--ldr-fg));
      --ldr-panel-border: color-mix(in srgb, var(--ldr-fg) 10%, var(--ldr-panel-bg));
      --ldr-panel-muted: color-mix(in srgb, var(--ldr-fg) 62%, var(--ldr-panel-bg));
      --ldr-panel-accent: #3b82f6;
      box-sizing: border-box; width: 540px; max-width: calc(100vw - 48px); padding: 24px;
      border: 1px solid var(--ldr-panel-border); border-radius: 12px;
      background: var(--ldr-panel-bg); color: var(--ldr-fg); font: 14px/20px var(--ldr-font);
      box-shadow: 0 18px 60px #0005;
      max-height: calc(100vh - 48px); overflow: auto;
    }
    #ldr-settings::backdrop { background: #0007; }
    #ldr-settings h2 { margin: 0 0 22px; font: 500 16px/24px var(--ldr-font); color: inherit; }
    #ldr-settings fieldset { margin: 0 0 16px; padding: 14px; border: 1px solid var(--ldr-panel-border); border-radius: 8px; min-width: 0; background: var(--ldr-card-bg); }
    #ldr-settings legend { float: left; width: 100%; padding: 0; margin: 0 0 8px; color: var(--ldr-panel-muted); font: 500 12px/18px var(--ldr-font); }
    #ldr-settings legend + * { clear: both; }
    #ldr-settings .ldr-setting-row { display: grid; grid-template-columns: minmax(0,1fr) 256px; align-items: center; gap: 16px; min-height: 38px; margin: 10px 0; }
    #ldr-settings .ldr-setting-row > label { margin: 0; font: 400 14px/20px var(--ldr-font); color: inherit; }
    #ldr-settings .ldr-setting-controls { display: flex; justify-content: flex-end; align-items: center; gap: 12px; width: 256px; }
    #ldr-settings .ldr-switch { position: relative; display: block; width: 42px; height: 24px; }
    #ldr-settings .ldr-switch input { appearance: none; position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
    #ldr-settings .ldr-switch-track { display: block; box-sizing: border-box; width: 42px; height: 24px; border: 1px solid var(--ldr-panel-border); border-radius: 999px; background: var(--ldr-input-bg); pointer-events: none; transition: background .15s; }
    #ldr-settings .ldr-switch-track::after { content: ""; display: block; width: 16px; height: 16px; margin: 3px; border-radius: 50%; background: var(--ldr-panel-muted); transition: transform .15s; }
    #ldr-settings .ldr-switch input:checked + .ldr-switch-track { background: var(--ldr-panel-accent); border-color: var(--ldr-panel-accent); }
    #ldr-settings .ldr-switch input:checked + .ldr-switch-track::after { background: #fff; transform: translateX(18px); }
    #ldr-settings .ldr-switch input:focus-visible + .ldr-switch-track { outline: 2px solid var(--ldr-panel-accent); outline-offset: 3px; }
    #ldr-settings .ldr-range-wrap { flex: 1; min-width: 0; }
    #ldr-settings input[type="range"] { appearance: none; display: block; width: 100%; height: 6px; margin: 6px 0; border-radius: 999px; background: linear-gradient(to right, var(--ldr-panel-accent) var(--ldr-range-progress,0%), var(--ldr-input-bg) var(--ldr-range-progress,0%)); cursor: pointer; }
    #ldr-settings input[type="range"]::-webkit-slider-thumb { appearance: none; width: 14px; height: 14px; border: 2px solid var(--ldr-panel-accent); border-radius: 50%; background: var(--ldr-panel-accent); }
    #ldr-settings input[type="range"]::-moz-range-thumb { width: 12px; height: 12px; border: 0; border-radius: 50%; background: var(--ldr-panel-accent); }
    #ldr-settings .ldr-range-endpoints { display: flex; justify-content: space-between; font: 10px/14px var(--ldr-font); color: var(--ldr-panel-muted); }
    #ldr-settings .ldr-number { position: relative; flex: 0 0 96px; }
    #ldr-settings input[type="number"] { box-sizing: border-box; width: 96px; height: 34px; padding: 6px 26px 6px 9px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: inherit; font: 14px/20px var(--ldr-font); appearance: textfield; }
    #ldr-settings input[type="number"]::-webkit-inner-spin-button,
    #ldr-settings input[type="number"]::-webkit-outer-spin-button { appearance: none; margin: 0; }
    #ldr-settings .ldr-unit { position: absolute; right: 9px; top: 7px; color: var(--ldr-panel-muted); font-size: 12px; pointer-events: none; }
    #ldr-settings input[type="number"]:is(:hover,:focus) { border-color: var(--ldr-panel-border); background: var(--ldr-input-bg); }
    #ldr-settings .ldr-settings-actions { display: flex; align-items: center; gap: 10px; margin-top: 22px; }
    #ldr-settings button { appearance: none; display: inline-flex; align-items: center; justify-content: center; min-height: 34px; padding: 6px 14px; border: 1px solid var(--ldr-panel-border); border-radius: 6px; font: 14px/20px var(--ldr-font); background: transparent; color: inherit; text-decoration: none; cursor: pointer; }
    #ldr-settings button[type="submit"] { background: var(--ldr-panel-accent); border-color: var(--ldr-panel-accent); color: #fff; }
    #ldr-settings button[type="submit"]:hover { background: #2563eb; }
    #ldr-settings button[data-reset] { margin-right: auto; padding-left: 0; padding-right: 0; border-color: transparent; color: var(--ldr-panel-muted); }
    #ldr-settings button[data-reset]:hover { color: var(--ldr-fg); }
    #ldr-settings button[data-close]:hover { background: var(--ldr-input-bg); }
    #ldr-settings .ldr-settings-note { margin: 18px 0 0; padding-top: 14px; border-top: 1px solid var(--ldr-panel-border); color: var(--ldr-panel-muted); font: 400 12px/18px var(--ldr-font); }
    @media (prefers-reduced-motion: reduce) { #ldr-settings .ldr-switch-track, #ldr-settings .ldr-switch-track::after { transition: none; } }

    /* 列表保留原生表头、排序、未读徽标及分类/标签筛选。 */
    html.ldr-list #main-outlet { box-sizing: border-box; max-width: none !important; width: min(1080px, calc(100% - var(--ldr-reserve))) !important; margin: 0 auto !important; padding: 24px 20px 110px !important; }
    html.ldr-list .topic-list { width: 100%; table-layout: auto; }
    html.ldr-list .topic-list .posters { display: none !important; }
    html.ldr-list .topic-list .main-link { padding: 18px 8px !important; }
    html.ldr-list .topic-list .link-top-line { display: block; line-height: 1.55; }
    html.ldr-list .topic-list .main-link .title { font-size: 18px; font-weight: 600; overflow-wrap: anywhere; }
    html.ldr-list .topic-list .link-bottom-line { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; margin-top: 8px; font-size: 13px; }
    html.ldr-list .topic-list .topic-excerpt { display: none; }
    html.ldr-list .topic-list td.num { font-size: 13px; min-width: 50px; }
    html.ldr-list .topic-list .discourse-tags { display: flex; flex-wrap: wrap; gap: 4px; }
    html.ldr-list .topic-list .discourse-tag { background: transparent !important; color: var(--ldr-fg) !important; }
    html.ldr-list .topic-list .discourse-tag .tag-icon { display: none; }

    /* 阅读页只隐藏干扰模块，不隐藏状态提示、编辑记录或原生编辑器。 */
    html.ldr-reader :is(.timeline-container,
      .topic-navigation, #topic-progress-wrapper, #progress-topic-wrapper,
      .topic-map, #suggested-topics, .suggested-topics, .more-topics__container,
      .topic-above-suggested-outlet, .topic-post-visited-line, .global-notice,
      .presence-users, .topic-admin-menu-button-container, .read-state,
      .topic-avatar, .d-footer, .footer-nav) { display: none !important; }
    html.ldr-print #main-outlet-wrapper { display: block !important; gap: 0 !important; padding: 0 !important; }
    html.ldr-reader #main-outlet, html.ldr-print #main-outlet {
      box-sizing: border-box; width: min(calc(var(--ldr-width) + 40px), calc(100% - var(--ldr-reserve))) !important; max-width: none !important;
      margin: 0 auto !important; padding: 36px 20px 150px !important;
    }
    html.ldr-reader :is(.container.posts, .posts-wrapper, .topic-post .post__row) { display: block !important; width: 100% !important; }
    html.ldr-reader .topic-body {
      box-sizing: border-box; width: 100% !important; max-width: none !important;
      float: none !important; margin: 0 !important; padding: 0 !important; border: 0 !important;
    }
    html.ldr-reader :is(.topic-post article,.post__row,.post-menu-area,.post-controls) { border: 0 !important; padding-block: 0 !important; box-shadow: none !important; }
    html.ldr-reader .topic-post { padding: 0 0 16px !important; margin: 0 0 20px !important; border: 0 !important; border-bottom: 1px solid var(--ldr-border) !important; }
    html.ldr-reader .topic-meta-data { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; font: 14px/1.5 var(--ldr-font); color: var(--ldr-meta); padding: 0 0 10px !important; margin: 0 !important; }
    html.ldr-reader .topic-meta-data .names { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
    html.ldr-reader .names:has(.ldr-author) > :not(.ldr-author):not(.ldr-owner) { display: none !important; }
    html.ldr-reader .ldr-author { font-weight: 600; }
    html.ldr-reader .ldr-owner { font-size: 12px; font-weight: 500; color: var(--ldr-fg); padding: 1px 6px; border-radius: 4px; background: color-mix(in srgb, var(--ldr-accent) 15%, var(--ldr-bg)); }
    html.ldr-reader .post-info.edits, html.ldr-reader .post-info.edits button { color: var(--ldr-meta); }
    html.ldr-reader :is(.ldr-native-owner,.ldr-duplicate-category) { display: none !important; }
    html.ldr-reader .ldr-native-owner-after::after,
    html.ldr-reader .ldr-native-owner-before::before { content: none !important; display: none !important; }
    html.ldr-reader .topic-owner :is(.cooked,.topic-body)::after { content: none !important; display: none !important; }
    .ldr-author, .ldr-owner, .ldr-floor { display: none; }
    html.ldr-reader :is(.ldr-author, .ldr-owner, .ldr-floor) { display: inline-flex; }
    html.ldr-reader .ldr-floor { font-size: 14px; white-space: nowrap; color: var(--ldr-meta) !important; }
    html.ldr-reader .ldr-floor:hover { color: var(--ldr-accent) !important; }
    html.ldr-reader .post-infos { display: flex; align-items: center; gap: 8px; margin-left: auto; margin-right: 0 !important; }
    html.ldr-reader .post-infos :is(.post-date,.relative-date) { font-size: 14px !important; color: var(--ldr-meta) !important; opacity: 1 !important; }
    html.ldr-reader .topic-meta-data .user-status-message { display: none; }
    html.ldr-reader .reply-to-tab .avatar { display: none; }

    /* 保留原生回复节点及它的祖先；不复制回复按钮或重新实现发帖逻辑。 */
    html.ldr-reader .post-menu-area .actions > :not(.ldr-keep-reply),
    html.ldr-reader .post-menu-area > :not(.ldr-keep-reply),
    html.ldr-reader #topic-footer-buttons .topic-footer-main-buttons > :not(.ldr-keep-reply),
    html.ldr-reader #topic-footer-buttons .topic-footer-main-buttons__actions > :not(.ldr-keep-reply),
    html.ldr-reader #topic-footer-buttons .topic-notifications-button { display: none !important; }
    html.ldr-reader .post-menu-area { margin: 8px 0 0 !important; min-height: 0 !important; }
    html.ldr-reader .post-controls { width: 100%; margin: 0 !important; min-height: 0 !important; }
    html.ldr-reader .post-controls .actions { display: flex; justify-content: flex-end; margin: 0 !important; padding: 0 !important; min-height: 0 !important; }
    html.ldr-reader button.ldr-keep-reply { display: inline-flex !important; align-items: center; gap: 5px; visibility: visible !important; opacity: 1 !important; color: var(--ldr-meta) !important; background: transparent !important; border: 1px solid var(--ldr-border) !important; border-radius: 6px; height: 30px !important; min-height: 0 !important; padding: 0 10px !important; font: 13px/1 var(--ldr-font) !important; }
    html.ldr-reader button.ldr-keep-reply:hover { background: var(--ldr-soft) !important; color: var(--ldr-title) !important; }
    html.ldr-reader button.ldr-keep-reply .d-icon { width: 14px; height: 14px; color: inherit !important; }

    html.ldr-reader #topic-title, html.ldr-print #topic-title { padding: 0 !important; margin: 0 0 28px !important; }
    html.ldr-reader #topic-title h1, html.ldr-print #topic-title h1 { color: var(--ldr-title) !important; font: 600 clamp(28px, 4vw, 32px)/1.4 var(--ldr-font) !important; overflow-wrap: anywhere; }
    :is(html.ldr-reader,html.ldr-print) #topic-title h1 :is(a,.fancy-title,span) { color: inherit !important; font: inherit !important; }
    html.ldr-reader #topic-title .topic-category { margin-top: 12px; font-size: 13px; }
    html.ldr-reader #topic-title :is(.badge-wrapper,.discourse-tag) { display: inline-flex; align-items: center; box-sizing: border-box; min-height: 24px; padding: 0 7px; border: 0; border-radius: 6px; background: var(--ldr-soft); font: 13px/22px var(--ldr-font); }
    html.ldr-reader .topic-post .cooked, html.ldr-print .ldr-print-post > .post {
      font-size: var(--ldr-fs) !important; line-height: var(--ldr-lh) !important;
      padding: 0 !important; overflow-wrap: break-word; word-break: normal; line-break: strict;
      color: var(--ldr-text) !important; font-family: var(--ldr-font) !important; text-autospace: normal;
    }
    :is(html.ldr-reader .topic-post .cooked, html.ldr-print .ldr-print-post > .post) p { margin: 0 0 .8em !important; }
    html.ldr-reader .topic-post .cooked > p.ldr-ps { color: var(--ldr-meta); }
    :is(html.ldr-reader .topic-post .cooked, html.ldr-print .ldr-print-post > .post) img.emoji { vertical-align: -.15em; height: 1.1em; width: auto; }
    :is(html.ldr-reader .topic-post .cooked, html.ldr-print .ldr-print-post > .post) :is(h1,h2,h3,h4) { line-height: 1.4; margin: 1.5em 0 .6em; }
    :is(html.ldr-reader .topic-post .cooked, html.ldr-print .ldr-print-post > .post) img:not(.emoji):not(.avatar) { max-width: 100% !important; height: auto !important; border-radius: 6px; }
    :is(html.ldr-reader .topic-post .cooked, html.ldr-print .ldr-print-post > .post) pre { box-sizing: border-box; max-width: 100%; overflow-x: auto; font-size: .87em; line-height: 1.65; border-radius: 6px; white-space: pre; }
    :is(html.ldr-reader .topic-post .cooked, html.ldr-print .ldr-print-post > .post) pre code { max-height: none; white-space: inherit; overflow-wrap: normal; word-break: normal; }
    :is(html.ldr-reader .topic-post .cooked, html.ldr-print .ldr-print-post > .post) table { display: block; max-width: 100%; overflow-x: auto; }
    :is(html.ldr-reader .topic-post .cooked, html.ldr-print .ldr-print-post > .post) :is(blockquote,aside.quote) { margin: 1em 0; font-size: .95em; }
    :is(html.ldr-reader .topic-post .cooked, html.ldr-print .ldr-print-post > .post) > :last-child { margin-bottom: 0 !important; }
    /* Discourse 的选中文字引用/复制引用/分享浮层；保留原生选择与复制能力。 */
    html.ldr-reader .quote-button { display: none !important; }
    /* 展开的楼中楼不再继承原生头像列及绝对定位；操作链接留在正常文档流中。 */
    html.ldr-reader .embedded-posts {
      box-sizing: border-box; width: 100% !important; max-width: 100% !important;
      margin: 12px 0 0 !important; padding: 0 0 0 12px !important; border-left: 2px solid var(--ldr-border);
    }
    html.ldr-reader .embedded-posts > div { position: relative; margin: 0 !important; padding: 12px 0 !important; }
    html.ldr-reader .embedded-posts :is(.row,.topic-body) { display: block !important; width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
    html.ldr-reader .embedded-posts :is(.row,.topic-body)::before { content: none !important; }
    html.ldr-reader .embedded-posts .topic-meta-data { display: flex !important; align-items: center; flex-wrap: wrap; gap: 8px 12px; position: static !important; }
    html.ldr-reader .embedded-posts .topic-meta-data h5 { position: static !important; margin: 0 !important; font: 600 14px/1.5 var(--ldr-font); }
    html.ldr-reader .embedded-posts .topic-meta-data h5 a { margin: 0 !important; }
    html.ldr-reader .embedded-posts .post-link-arrow { position: static !important; inset: auto !important; transform: none !important; margin-left: auto; }
    html.ldr-reader .embedded-posts .post-link-arrow .post-info.arrow { display: inline-flex !important; align-items: center; gap: 4px; padding: 0 !important; margin: 0 !important; font: 13px/1.5 var(--ldr-font); }
    html.ldr-reader .embedded-posts .cooked { margin: 0 !important; }
    html.ldr-reader .embedded-posts :is(.collapse-up,.collapse-down) { display: none !important; }
    html.ldr-reader .embedded-posts .load-more-replies { position: static !important; transform: none !important; margin: 8px 0 0 !important; }
    #ldr-toolbar #ldr-topic-reply { position: relative; border: 0; box-shadow: none; background: var(--ldr-accent); color: var(--ldr-bg); }
    #ldr-toolbar #ldr-topic-reply[hidden] { display: none !important; }
    #ldr-toolbar #ldr-topic-reply[aria-disabled="true"] { opacity: .6; cursor: default; }

    /* 原生 /print 为静态页面；仅重排返回的标题和帖子，无额外网络请求。 */
    html.ldr-print body { background: var(--ldr-bg) !important; color: var(--ldr-fg) !important; }
    html.ldr-print :is(.d-header-wrap, .sidebar-wrapper, .topic-map, .post-likes, .powered-by-link, .d-footer, .footer-nav),
    html.ldr-print body > header, html.ldr-print #main > header { display: none !important; }
    html.ldr-print .ldr-print-exclude { display: none !important; }
    #ldr-export-content { box-sizing: border-box; max-width: var(--ldr-width); margin: 0 auto; color: var(--ldr-fg); }
    html.ldr-print .ldr-print-post { box-sizing: border-box; float: none !important; width: 100% !important; max-width: none !important; margin: 0 0 16px !important; padding: 0 0 12px !important; border: 0 !important; border-bottom: 1px solid var(--ldr-border) !important; }
    html.ldr-print .ldr-print-floor { display: block; margin: 0 0 8px; font-size: 13px !important; font-weight: 500; line-height: 1.5; }

    @media (prefers-reduced-motion: reduce) { #ldr-toolbar, #ldr-toolbar .ldr-tooltip { transition: none; } }
    @media print {
      #ldr-toolbar, #ldr-settings, #ldr-topic-reply { display: none !important; }
      html.ldr-print { --ldr-bg: #fff; --ldr-fg: #111; --ldr-title: #111; --ldr-text: #111; --ldr-meta: #555; --ldr-border: #ccc; --ldr-soft: #f5f5f5; --ldr-accent: #174b73; }
      html.ldr-print body { background: #fff !important; color: #111 !important; }
      html.ldr-print #main-outlet, html.ldr-print #ldr-export-content { padding: 0 !important; max-width: none !important; width: 100% !important; margin: 0 !important; }
      html.ldr-print :is(.crawler-nav, .crawler-post[role="navigation"], .quote-controls) { display: none !important; }
      html.ldr-print .ldr-print-post { break-inside: auto; }
      html.ldr-print :is(h1,h2,h3,h4,.ldr-print-floor) { break-after: avoid; }
      html.ldr-print .post { font-size: 11pt !important; line-height: 1.65 !important; }
      html.ldr-print :is(img,blockquote) { break-inside: avoid; }
      html.ldr-print pre { white-space: pre-wrap !important; overflow: visible !important; overflow-wrap: anywhere; color: #111 !important; background: #f5f5f5 !important; }
      html.ldr-print pre code { white-space: pre-wrap !important; overflow-wrap: anywhere !important; color: inherit !important; }
      html.ldr-print table { display: table !important; table-layout: fixed; width: 100%; overflow: visible !important; }
      html.ldr-print :is(td,th) { overflow-wrap: anywhere; }
      html.ldr-print a, html.ldr-print a:visited { color: #174b73 !important; font-weight: inherit !important; }
    }
  `;

  function installStyle() {
    if (document.getElementById('ldr-style') || !document.documentElement) return;
    const style = document.createElement('style');
    style.id = 'ldr-style'; style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }
  const paletteNames = { bg: '--secondary', fg: '--primary', border: '--primary-low', accent: '--tertiary', soft: '--primary-very-low' };
  let palette = readJSON(PALETTE_KEY);
  function applyPalette() {
    const root = document.documentElement;
    if (!root) return;
    if (!route().print) {
      const computed = getComputedStyle(root);
      const next = {};
      for (const [name, variable] of Object.entries(paletteNames)) {
        const color = computed.getPropertyValue(variable).trim();
        if (color && window.CSS?.supports('color', color)) next[name] = color;
      }
      if (next.bg && next.fg && JSON.stringify(next) !== JSON.stringify(palette)) {
        palette = next; writeJSON(PALETTE_KEY, next);
      }
    }
    let valid = 0;
    for (const name of Object.keys(paletteNames)) {
      const color = palette?.[name];
      if (typeof color === 'string' && window.CSS?.supports('color', color)) {
        root.style.setProperty('--ldr-fallback-' + name, color); valid++;
      }
    }
    root.classList.toggle('ldr-has-palette', valid >= 2);
    // 正文/元信息直接由站点前景和背景混色，支持 hsl/oklch 等 CSS 颜色，无明暗猜测。
  }

  function preservePosition(change) {
    const anchor = [...document.querySelectorAll('article[id^="post_"]')].find(post => post.getBoundingClientRect().bottom > 0);
    const before = anchor?.getBoundingClientRect();
    const oldY = window.scrollY;
    change();
    requestAnimationFrame(() => {
      if (anchor?.isConnected && before) {
        const after = anchor.getBoundingClientRect();
        const offset = before.top < 0 && before.height ? before.top * after.height / before.height : before.top;
        window.scrollBy(0, after.top - offset);
      } else window.scrollTo(0, oldY);
      window.dispatchEvent(new Event('resize'));
    });
  }
  function toggleReader() {
    preservePosition(() => { manualMode = !document.documentElement.classList.contains('ldr-reader'); apply(); });
  }

  function decoratePosts() {
    const state = route();
    if (!state.id || state.print || !document.documentElement.classList.contains('ldr-reader')) return;
    const firstPost = document.querySelector('article#post_1');
    const ownerId = firstPost?.dataset.userId;
    for (const post of document.querySelectorAll('article[id^="post_"]')) {
      if (post.closest('.embedded-posts')) continue;
      const names = post.querySelector('.topic-meta-data .names');
      const original = names?.querySelector('a[data-user-card]:not(.ldr-author)');
      const username = original?.getAttribute('data-user-card');
      if (names && username) {
        let author = names.querySelector('.ldr-author');
        if (!author) { author = document.createElement('a'); author.className = 'ldr-author'; names.prepend(author); }
        if (author.textContent !== '@' + username) author.textContent = '@' + username;
        const userHref = '/u/' + encodeURIComponent(username);
        if (author.getAttribute('href') !== userHref) author.setAttribute('href', userHref);
        if (author.getAttribute('data-user-card') !== username) author.setAttribute('data-user-card', username);
      }
      const isOwner = Boolean(post.closest('.topic-owner') || post === firstPost || (ownerId && post.dataset.userId === ownerId));
      if (names && !names.querySelector('.ldr-owner') && isOwner) {
        const badge = document.createElement('span'); badge.className = 'ldr-owner'; badge.textContent = '楼主'; names.appendChild(badge);
      }
      if (!isOwner) names?.querySelector('.ldr-owner')?.remove();
      const body = post.querySelector('.topic-body');
      const stamp = [state.id, themeRevision, username, isOwner].join('|');
      const previous = postScans.get(post);
      if (!previous || previous.stamp !== stamp || previous.body !== body || dirtyPosts.has(post)) {
        dirtyPosts.delete(post);
        // 只标记正文以外的重复主题徽标，不触碰帖子内容中的文字。
        for (const label of post.querySelectorAll('.topic-body span,.topic-body em,.topic-body strong,.topic-body div')) {
          if (!label.children.length && !label.closest('.cooked') && label.textContent.trim().toUpperCase() === 'TOPIC OWNER') label.classList.add('ldr-native-owner');
        }
        // 部分站点主题用伪元素绘制英文徽标，只屏蔽内容确为该徽标的伪元素。
        if (window.CSS?.supports('selector(::after)')) {
          for (const container of [post, ...post.querySelectorAll('.topic-body,.contents,.cooked')]) {
            for (const side of ['before', 'after']) {
              const marker = 'ldr-native-owner-' + side;
              if (!container.classList.contains(marker) && getComputedStyle(container, '::' + side).content.replace(/^['"]|['"]$/g, '').trim().toUpperCase() === 'TOPIC OWNER') container.classList.add(marker);
            }
          }
        }
        for (const paragraph of post.querySelectorAll('.cooked > p')) {
          paragraph.classList.toggle('ldr-ps', /^\s*[（(]?\s*P\.?\s*S\s*[.:：]/i.test(paragraph.textContent));
        }
        postScans.set(post, {stamp, body});
      }
      const metadata = post.querySelector('.topic-meta-data');
      if (metadata) {
        let floor = metadata.querySelector('.ldr-floor');
        if (!floor) { floor = document.createElement('a'); floor.className = 'ldr-floor'; floor.title = '本层永久链接'; metadata.appendChild(floor); }
        const number = post.id.slice(5);
        const floorHref = state.base + '/' + number;
        if (floor.getAttribute('href') !== floorHref) floor.setAttribute('href', floorHref);
        if (floor.textContent !== '#' + number) floor.textContent = '#' + number;
      }
    }
    // 仅合并同名父子分类（例如同名分类加 Lv 等级）；不同名称的分类仍保留。
    const categories = [...document.querySelectorAll('#topic-title .topic-category .badge-wrapper')];
    const categoryName = node => (node.querySelector('.badge-category__name,.category-name') || node).textContent.trim().replace(/[,，]\s*Lv\s*\d+\s*$/i, '').trim();
    for (const [index, category] of categories.entries()) {
      category.classList.toggle('ldr-duplicate-category', Boolean(categoryName(category)) && categories.slice(index + 1).some(next => categoryName(next) === categoryName(category)));
    }
    // 标记按钮和中间容器，CSS 保留整个回复路径，其余操作默认隐藏。
    const replies = document.querySelectorAll('.post-menu-area button.reply, .post-menu-area button.post-action-menu__reply, #topic-footer-buttons button.create');
    for (const button of replies) {
      const boundary = button.closest('.post-menu-area, #topic-footer-buttons');
      for (let node = button; node && node !== boundary; node = node.parentElement) node.classList.add('ldr-keep-reply');
    }
  }

  function preparePrint() {
    if (!route().print || document.getElementById('ldr-export-content')) return;
    const title = document.getElementById('topic-title');
    const posts = [...document.querySelectorAll('.crawler-post[id^="post_"]')];
    if (!title || !posts.length) return; // 识别失败时保留原页面，不猜测或清空内容。
    // 仅清理剪藏标题区，实际移除节点，避免隐藏的分类/标签进入 HTML 剪藏。
    for (const metadata of title.querySelectorAll('.topic-category,.discourse-tags,.badge-wrapper,.discourse-tag,a[href^="/c/"],a[href^="/tag/"],a[href^="/tags/"]')) {
      if (!metadata.matches('h1') && !metadata.closest('h1') && !metadata.querySelector('h1')) metadata.remove();
    }
    const content = document.createElement('article');
    content.id = 'ldr-export-content'; content.setAttribute('aria-label', '话题剪藏正文');
    title.parentNode.insertBefore(content, title);
    content.appendChild(title);
    for (const post of posts) {
      // 剪藏模板读取真实 HTML：直接移除每层的作者/日期元信息，用楼层号替换。
      const floor = document.createElement('h2'); floor.className = 'ldr-print-floor'; floor.textContent = '#' + post.id.slice(5);
      const metadata = post.querySelector(':scope > .crawler-post-meta');
      if (metadata) metadata.replaceWith(floor);
      else post.prepend(floor);
      // 隐藏的点赞文字仍可能进入 selectorHtml，移出原生操作统计节点。
      for (const statistic of post.querySelectorAll(':scope > [itemprop="interactionStatistic"], :scope > .post-likes')) statistic.remove();
      post.classList.add('ldr-print-post');
      content.appendChild(post); // 保留正文、引用、图片、代码及原有内容链接。
    }
    // 原生分页/下一页入口留在正文之外，不被剪藏模板混入，也不声称已加载整帖。
  }
  function cleanPrintExtras() {
    if (!route().print) return;
    const protectedContent = node => node.closest('#ldr-export-content,.crawler-post[id^="post_"],.cooked,#topic-title,#ldr-toolbar,#ldr-settings');
    for (const node of document.querySelectorAll('#related-topics,.related-topics,#suggested-topics,.suggested-topics,.more-topics__container,footer,.crawler-footer,.footer-nav')) {
      if (!protectedContent(node) && !node.querySelector('.crawler-post[id^="post_"],#ldr-export-content,#topic-title')) node.classList.add('ldr-print-exclude');
    }
    for (const heading of document.querySelectorAll('h2,h3')) {
      if (protectedContent(heading) || !/^(相关话题|Related topics)$/i.test(heading.textContent.trim())) continue;
      const section = heading.parentElement;
      if (section && !section.matches('html,body,#main,#main-outlet,#main-outlet-wrapper') && section.querySelector('table') && !section.querySelector('.crawler-post,#ldr-export-content,#topic-title')) section.classList.add('ldr-print-exclude');
    }
    for (const link of document.querySelectorAll('a[href="/tos"],a[href="/privacy"]')) {
      if (protectedContent(link)) continue;
      for (let node = link.parentElement; node && !node.matches('html,body,#main,#main-outlet,#main-outlet-wrapper'); node = node.parentElement) {
        if (node.querySelector('.crawler-post,#ldr-export-content,#topic-title') || node.textContent.trim().length > 160) break;
        if (node.querySelector('a[href="/tos"]') && node.querySelector('a[href="/privacy"]')) { node.classList.add('ldr-print-exclude'); break; }
      }
    }
  }

  /* Lucide icons: https://github.com/lucide-icons/lucide
   * ISC License. Copyright (c) 2026 Lucide Icons and Contributors.
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * Feather-derived icons (arrow-left, corner-up-left, info):
   * MIT License. Copyright (c) 2013-present Cole Bemis.
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   */
  const icons = {
    top: '<path d="m6 14 6-6 6 6"/><path d="M4 4h16"/>',
    bottom: '<path d="m6 10 6 6 6-6"/><path d="M4 20h16"/>',
    reader: '<path d="M12 5v16" /><path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z" />',
    exit: '<path d="m14.5 7.5-5 5" /><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" /><path d="m9.5 7.5 5 5" />',
    list: '<path d="M3 5h.01" /><path d="M3 12h.01" /><path d="M3 19h.01" /><path d="M8 5h13" /><path d="M8 12h13" /><path d="M8 19h13" />',
    back: '<path d="m12 19-7-7 7-7" /><path d="M19 12H5" />',
    reply: '<path d="M20 20v-7a4 4 0 0 0-4-4H4" /><path d="M9 14 4 9l5-5" />',
    home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />',
    clip: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /><path d="M14 2v5a1 1 0 0 0 1 1h5" /><path d="M12 18v-6" /><path d="m9 15 3 3 3-3" />',
    settings: '<path d="M14 17H5" /><path d="M19 7h-9" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" />',
    info: '<circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />',
  };
  function setIconLabel(control, label, name) {
    control.setAttribute('aria-label', label);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.75'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); svg.classList.add('ldr-icon');
    svg.innerHTML = icons[name] || icons.info;
    const tooltip = document.createElement('span'); tooltip.className = 'ldr-tooltip'; tooltip.textContent = label; tooltip.setAttribute('aria-hidden', 'true');
    control.append(svg, tooltip); return control;
  }
  function makeLink(label, href, icon = 'back') {
    const a = document.createElement('a'); a.href = href; return setIconLabel(a, label, icon);
  }
  function makeButton(label, act, icon = act) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.act = act;
    setIconLabel(button, label, icon);
    if (act === 'reader') button.querySelector('.ldr-tooltip').textContent = label + ' (Alt+R)';
    return button;
  }
  function makeDivider() {
    const divider = document.createElement('span'); divider.className = 'ldr-divider'; divider.setAttribute('aria-hidden', 'true'); return divider;
  }
  function makeStatus(message) {
    const status = document.createElement('span'); status.className = 'ldr-status'; status.tabIndex = 0; status.setAttribute('role', 'img');
    return setIconLabel(status, message, 'info');
  }
  let barSignature = '';
  function renderToolbar(state, listPage, readerOn) {
    if (!document.body) return;
    if (!toolbar?.isConnected) {
      toolbar = document.createElement('nav'); toolbar.id = 'ldr-toolbar'; toolbar.setAttribute('aria-label', '阅读与剪藏工具');
      toolbar.addEventListener('click', event => {
        const link = event.target.closest('a');
        if (link && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
          // /print 必须请求原生静态页面，避免被 SPA 接管为普通话题视图。
          if (route().print || /\/print\/?$/.test(link.pathname)) {
            event.preventDefault(); event.stopPropagation(); location.assign(link.href);
          }
          return;
        }
        const button = event.target.closest('button[data-act]');
        if (!button) return;
        if (button.dataset.act === 'reader') toggleReader();
        if (button.dataset.act === 'list') { cfg.simplifyList = !cfg.simplifyList; writeJSON(CONFIG_KEY, cfg); apply(); }
        if (button.dataset.act === 'settings') openSettings();
        if (button.dataset.act === 'top') window.scrollTo({top:0,behavior:'auto'});
        if (button.dataset.act === 'bottom') window.scrollTo({top:document.scrollingElement?.scrollHeight || document.documentElement.scrollHeight,behavior:'auto'});
      });
      document.body.appendChild(toolbar); barSignature = '';
    }
    toolbar.hidden = !state.id && !listPage;
    const signature = [state.id, state.print, listPage, readerOn, cfg.simplifyList, storageFailed, lastListUrl].join('|');
    if (signature === barSignature) return;
    const focusedAct = toolbar.contains(document.activeElement) ? document.activeElement.dataset.act : null;
    barSignature = signature; toolbar.replaceChildren();
    if (state.print) {
      toolbar.append(makeLink('回到首页', '/', 'home'), makeLink('回到帖子', state.base + '/1', 'back'), makeDivider(), makeButton('前往底部', 'bottom'), makeButton('回到顶部', 'top'));
    } else if (state.id) {
      const reader = makeButton(readerOn ? '退出阅读模式' : '进入阅读模式', 'reader', readerOn ? 'exit' : 'reader'); reader.classList.toggle('ldr-active', readerOn);
      reader.setAttribute('aria-pressed', String(readerOn));
      toolbar.append(reader, makeLink('返回列表', lastListUrl, 'list'), makeDivider(), makeLink('打印／剪藏', state.base + '/print', 'clip'));
    } else if (listPage) {
      const list = makeButton(cfg.simplifyList ? '恢复原站列表' : '简化话题列表', 'list'); list.classList.toggle('ldr-active', cfg.simplifyList);
      list.setAttribute('aria-pressed', String(cfg.simplifyList));
      toolbar.append(list);
    }
    if (storageFailed && !state.print) {
      toolbar.appendChild(makeStatus('设置仅在本页有效：浏览器存储不可用'));
    }
    if (!state.print) toolbar.append(makeDivider(), makeButton('全局设置', 'settings'));
    if (readerOn && topicReply) toolbar.append(makeDivider(), topicReply);
    if (focusedAct) [...toolbar.querySelectorAll('button[data-act]')].find(button => button.dataset.act === focusedAct)?.focus({preventScroll: true});
  }

  function topicReplyAction() {
    const button = document.querySelector('#topic-footer-buttons button.create');
    if (button) return !button.disabled && button.getAttribute('aria-disabled') !== 'true' ? () => button.click() : null;
    // 页尾尚未加载时调用 Discourse 自己的同一动作；不传 post，不使用任何楼层回复。
    try {
      const container = window.Discourse?.__container__;
      const controller = container?.lookup('controller:topic');
      const model = controller?.model;
      const topicId = model?.get ? model.get('id') : model?.id;
      const canReply = model?.get ? model.get('details.can_create_post') : model?.details?.can_create_post;
      if (String(topicId) === route().id && canReply && typeof controller.replyToPost === 'function') return () => controller.replyToPost();
    } catch { /* 原生应用未就绪或未公开容器时，等待原生页尾按钮出现。 */ }
    return null;
  }
  function renderTopicReply(readerOn) {
    if (!topicReply && readerOn) {
      topicReply = makeButton('回复话题（非楼层回复）', 'topic-reply', 'reply');
      topicReply.id = 'ldr-topic-reply';
      topicReply.addEventListener('click', () => {
        if (topicReply.hidden || topicReply.getAttribute('aria-disabled') === 'true') return;
        setReplyMessage('回复话题（非楼层回复）');
        // then 同时捕获原生动作的同步异常和异步拒绝。
        Promise.resolve().then(() => {
          const action = topicReplyAction();
          if (action) return action();
          renderTopicReply(true);
        }).catch(() => setReplyMessage('原生回复未能打开，请使用页面中的话题回复入口'));
      });
    }
    if (topicReply) {
      topicReply.hidden = !readerOn;
      if (!readerOn) return;
      const available = Boolean(topicReplyAction());
      const state = route().id + '|' + available;
      if (topicReply.dataset.replyState !== state) {
        topicReply.dataset.replyState = state;
        topicReply.setAttribute('aria-disabled', String(!available));
        setReplyMessage(available ? '回复话题（非楼层回复）' : '回复话题：当前页面暂不可用');
      }
    }
  }
  function setReplyMessage(message) {
    if (!topicReply) return;
    topicReply.setAttribute('aria-label', message);
    topicReply.querySelector('.ldr-tooltip').textContent = message;
  }

  const PARAMS = [
    {name:'fontSize', label:'字号', min:14, max:28, step:1, unit:'px'},
    {name:'lineHeight', label:'行距', min:1.4, max:2.2, step:.01, unit:'倍'},
    {name:'width', label:'行宽', min:560, max:1100, step:10, unit:'px'},
  ];
  function openSettings() {
    if (!settings) {
      settings = document.createElement('dialog'); settings.id = 'ldr-settings'; settings.setAttribute('aria-labelledby', 'ldr-settings-title');
      settings.innerHTML = `<form method="dialog">
        <h2 id="ldr-settings-title">全局设置</h2>
        <fieldset><legend>阅读行为</legend>
          <div class="ldr-setting-row"><label for="ldr-autoReader">进入话题自动阅读</label><div class="ldr-setting-controls"><label class="ldr-switch"><input id="ldr-autoReader" name="autoReader" type="checkbox" role="switch"><span class="ldr-switch-track" aria-hidden="true"></span></label></div></div>
          <div class="ldr-setting-row"><label for="ldr-simplifyList">简化话题列表</label><div class="ldr-setting-controls"><label class="ldr-switch"><input id="ldr-simplifyList" name="simplifyList" type="checkbox" role="switch"><span class="ldr-switch-track" aria-hidden="true"></span></label></div></div>
        </fieldset>
        <fieldset><legend>排版参数</legend>
          ${PARAMS.map(p => `<div class="ldr-setting-row"><label for="ldr-${p.name}">${p.label}</label><div class="ldr-setting-controls">
            <div class="ldr-range-wrap"><input id="ldr-${p.name}-range" type="range" data-range="${p.name}" min="${p.min}" max="${p.max}" step="${p.step}" aria-label="${p.label}滑块"><div class="ldr-range-endpoints" aria-hidden="true"><span>${p.min}</span><span>${p.max}</span></div></div>
            <div class="ldr-number"><input id="ldr-${p.name}" name="${p.name}" type="number" min="${p.min}" max="${p.max}" step="${p.name === 'fontSize' ? '1' : 'any'}" required aria-label="${p.label}" title="${p.min}–${p.max} ${p.unit}"><span class="ldr-unit" aria-hidden="true">${p.unit}</span></div>
          </div></div>`).join('')}
        </fieldset>
        <div class="ldr-settings-actions"><button type="button" data-reset>恢复默认</button><button type="button" data-close>取消</button><button type="submit">保存</button></div>
      </form>
      <p class="ldr-settings-note">明暗配色跟随站点，设置保存在当前浏览器。<br>排版调整即时预览；取消会还原，恢复默认后仍需保存。</p>`;
      const form = settings.querySelector('form');
      form.addEventListener('input', event => {
        const field = event.target;
        const name = field.dataset.range || field.name;
        const param = PARAMS.find(p => p.name === name);
        if (!param || !field.value.trim() || !Number.isFinite(Number(field.value))) return;
        const value = clamp(field.value, param.min, param.max, cfg[name]);
        settingsDraft[name] = value;
        if (field.dataset.range) form.elements[name].value = value;
        syncRange(name, value);
        queueSettingsPreview();
      });
      form.addEventListener('submit', event => {
        event.preventDefault();
        cfg = validate({ autoReader: form.elements.autoReader.checked, simplifyList: form.elements.simplifyList.checked, fontSize: form.elements.fontSize.value, lineHeight: form.elements.lineHeight.value, width: form.elements.width.value });
        writeJSON(CONFIG_KEY, cfg); settings.close(); preservePosition(apply);
      });
      settings.querySelector('[data-close]').addEventListener('click', () => settings.close());
      settings.querySelector('[data-reset]').addEventListener('click', () => fillSettings(DEFAULTS));
      settings.addEventListener('close', () => {
        settingsDraft = null; cancelAnimationFrame(previewFrame); previewFrame = 0;
        preservePosition(() => setLayout(cfg));
      });
      document.body.appendChild(settings);
    }
    fillSettings(cfg);
    if (!settings.open) settings.showModal();
  }
  function fillSettings(values) {
    settingsDraft = {...values};
    const fields = settings.querySelector('form').elements;
    for (const [name, value] of Object.entries(values)) {
      if (fields[name].type === 'checkbox') fields[name].checked = value;
      else fields[name].value = value;
    }
    for (const p of PARAMS) syncRange(p.name, values[p.name]);
    queueSettingsPreview();
  }
  function syncRange(name, value) {
    const range = settings.querySelector('[data-range="' + name + '"]');
    range.value = value;
    range.style.setProperty('--ldr-range-progress', ((Number(range.value) - Number(range.min)) / (Number(range.max) - Number(range.min))) * 100 + '%');
  }
  function queueSettingsPreview() {
    if (previewFrame) return;
    previewFrame = requestAnimationFrame(() => {
      previewFrame = 0;
      if (settings?.open && settingsDraft) preservePosition(() => setLayout(settingsDraft));
    });
  }
  function setLayout(values) {
    const root = document.documentElement;
    root.style.setProperty('--ldr-fs', values.fontSize + 'px');
    root.style.setProperty('--ldr-lh', String(values.lineHeight));
    root.style.setProperty('--ldr-width', values.width + 'px');
  }

  let barFrame = 0, barUntil = 0, barLeft = NaN, barFallbackReady = false;
  const watchedOutlets = new Set();
  let outletObserver;
  function syncBarLeft(force = false) {
    if (fused) return;
    const root = document.documentElement;
    if (!root || !toolbar || toolbar.hidden) return;
    const outlet = document.getElementById('main-outlet');
    const attached = root.matches('.ldr-reader,.ldr-print,.ldr-list') && root.clientWidth > 760;
    const rendered = Boolean(outlet?.getClientRects().length);
    const max = Math.max(0, root.clientWidth - BAR_W - BAR_EDGE);
    const left = Math.round(attached && rendered ? Math.max(0, Math.min(outlet.getBoundingClientRect().right + BAR_GAP, max)) : max);
    if (left !== barLeft) {
      barLeft = left; root.style.setProperty('--ldr-bar-left', left + 'px');
    }
    if (rendered || force || barFallbackReady) root.classList.add('ldr-bar-ready');
  }
  function trackBar(ms = 500) {
    if (fused || !toolbar || toolbar.hidden) return;
    barUntil = Math.max(barUntil, performance.now() + ms);
    if (barFrame) return;
    const tick = () => {
      if (fused || toolbar?.hidden) { barFrame = 0; return; }
      syncBarLeft();
      barFrame = performance.now() < barUntil ? requestAnimationFrame(tick) : 0;
    };
    barFrame = requestAnimationFrame(tick);
  }
  function observeOutlet() {
    if (typeof ResizeObserver !== 'function') return;
    outletObserver ??= new ResizeObserver(() => trackBar(150));
    for (const node of watchedOutlets) {
      if (!node.isConnected) { outletObserver.unobserve(node); watchedOutlets.delete(node); }
    }
    for (const id of ['main-outlet','main-outlet-wrapper']) {
      const node = document.getElementById(id);
      if (node && !watchedOutlets.has(node)) { watchedOutlets.add(node); outletObserver.observe(node); }
    }
  }
  window.addEventListener('resize', () => trackBar(150));
  document.addEventListener('click', () => trackBar(600), true);
  document.addEventListener('keydown', () => trackBar(600), true);

  function apply() {
    const root = document.documentElement;
    if (!root) return;
    if (fused) return;
    installStyle();
    const state = route();
    if (state.id !== currentId) { currentId = state.id; manualMode = null; paletteDirty = true; }
    const hasList = Boolean(document.querySelector('#list-area .topic-list, .list-container .topic-list, .contents > .topic-list'));
    const listPage = !state.id && !/^\/(?:u|g|admin|my)(?:\/|$)/.test(location.pathname) && hasList;
    if (listPage) lastListUrl = location.pathname + location.search;
    const readerOn = Boolean(state.id && !state.print && (manualMode ?? cfg.autoReader));
    root.classList.toggle('ldr-reader', readerOn);
    root.classList.toggle('ldr-print', state.print);
    root.classList.toggle('ldr-list', listPage && cfg.simplifyList);
    setLayout(settings?.open && settingsDraft ? settingsDraft : cfg);
    if (paletteDirty) { paletteDirty = false; applyPalette(); }
    if (document.body && document.readyState !== 'loading') {
      decoratePosts(); preparePrint(); cleanPrintExtras(); renderTopicReply(readerOn); renderToolbar(state, listPage, readerOn);
      observeOutlet(); syncBarLeft(); trackBar(150);
    }
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; apply(); });
  }
  function onRoute() {
    if (location.href === lastHref) return;
    lastHref = location.href; paletteDirty = true; apply();
  }
  for (const name of ['pushState', 'replaceState']) {
    const original = history[name];
    history[name] = function (...args) {
      const result = original.apply(this, args);
      try { onRoute(); } catch (error) { console.warn('[舒适阅读] 路由同步失败', error); }
      return result;
    };
  }
  window.addEventListener('popstate', onRoute);
  window.addEventListener('hashchange', onRoute);
  setInterval(() => { if (!document.hidden) onRoute(); }, 1500); // 保留低频兼容回退。
  document.addEventListener('visibilitychange', () => { if (!document.hidden) onRoute(); });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.repeat || !event.altKey || event.ctrlKey || event.metaKey || event.code !== 'KeyR') return;
    if (event.target?.isContentEditable || event.target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), #ldr-settings')) return;
    const state = route();
    if (!state.id || state.print || document.querySelector('.d-modal, .discourse-modal, dialog[open], #reply-control.open') || document.body?.classList.contains('composer-open')) return;
    event.preventDefault(); toggleReader();
  });
  // 动态帖子只增加辅助标记，不清空或替换框架维护的原生帖子。
  const IGNORE = '#ldr-toolbar,#ldr-topic-reply,#ldr-settings,#ldr-style,#reply-control,.d-editor,' +
    '.d-header-wrap,.modal-container,.ldr-author,.ldr-owner,.ldr-floor';
  const observer = new MutationObserver(records => {
    let changed = false;
    for (const record of records) {
      if (record.type !== 'childList' || record.target.closest?.(IGNORE)) continue;
      const nodes = [...record.addedNodes, ...record.removedNodes];
      if (nodes.length && nodes.every(node => node.nodeType === 1 && node.matches('.ldr-author,.ldr-owner,.ldr-floor'))) continue;
      const post = record.target.closest?.('article[id^="post_"]');
      if (post) dirtyPosts.add(post);
      changed = true;
    }
    if (changed) schedule();
  });
  observer.observe(document, { childList: true, subtree: true });
  let themeObserver;
  function themeSignature() {
    const root = document.documentElement;
    return [root.className.split(/\s+/).filter(name => !name.startsWith('ldr-')).join(' '),
      root.getAttribute('data-theme'), root.getAttribute('data-color-scheme'),
      root.style.cssText.replace(/--ldr-[^:;]+:[^;]*;?/g, '')].join('|');
  }
  function themeColors() {
    const computed = getComputedStyle(document.documentElement);
    return Object.values(paletteNames).map(name => computed.getPropertyValue(name).trim()).join('|');
  }
  function boot() {
    paletteDirty = true;
    apply();
    let signature = themeSignature();
    let bodyClass = document.body?.className, colors = themeColors();
    themeObserver = new MutationObserver(() => {
      const next = themeSignature();
      const nextBody = document.body?.className;
      if (next === signature && nextBody === bodyClass) return;
      const nextColors = themeColors();
      const changed = next !== signature || nextColors !== colors;
      signature = next; bodyClass = nextBody; colors = nextColors;
      // 编辑器等无关 body class 改动不使整页扫描缓存失效。
      if (changed) { paletteDirty = true; themeRevision++; schedule(); }
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme'] });
    if (document.body) themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
  function disableEnhancements() {
    observer.disconnect(); themeObserver?.disconnect();
    const root = document.documentElement;
    root.classList.remove('ldr-list','ldr-reader','ldr-print');
    root.classList.remove('ldr-bar-ready'); root.style.removeProperty('--ldr-bar-left');
    cancelAnimationFrame(barFrame); barFrame = 0; barLeft = NaN;
    outletObserver?.disconnect(); watchedOutlets.clear();
    document.getElementById('ldr-style')?.remove();
    if (toolbar) toolbar.hidden = true;
    if (topicReply) topicReply.hidden = true;
    for (const node of document.querySelectorAll('.ldr-author,.ldr-owner,.ldr-floor')) node.remove();
    if (settings?.open) settings.close();
    try { Object.defineProperty(window, 'print', {configurable:true,writable:true,value:nativePrint}); }
    catch { window.print = nativePrint; }
  }
  function checkVisibility() {
    if (fused || route().print || !document.documentElement.matches('.ldr-reader,.ldr-list')) return;
    const main = document.querySelector('#main-outlet');
    if (main?.getClientRects().length) return;
    fused = true;
    try { sessionStorage.setItem('ldr-core-fuse', '1'); } catch { /* 当前页面仍回退。 */ }
    disableEnhancements();
    console.warn('[舒适阅读] 主内容不可见，已停用增强。用 ?ldr-off 临时跳过脚本；清除 sessionStorage 的 ldr-core-fuse 后可重试。');
  }
  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  const afterLoad = () => { barFallbackReady = true; syncBarLeft(true); paletteDirty = true; themeRevision++; schedule(); setTimeout(checkVisibility, 2000); };
  if (document.readyState === 'complete') afterLoad();
  else window.addEventListener('load', afterLoad, { once: true });
})();
