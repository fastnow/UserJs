// ==UserScript==
// @name         SiteAssetDL
// @namespace    https://github.com/fastnow/SiteAssetDL
// @version      1.0.0
// @description  嗅探页面图片/视频/音频/字体/字幕资源。懒加载深度扫描、并发批量下载、流式直写硬盘、原生压缩打包、多格式导出。悬浮按钮与窗口可拖动，适配触摸与桌面设备。
// @author       FastNow Studio
// @homepage     https://github.com/fastnow/UserJs
// @supportURL   https://github.com/fastnow/UserJs/issues
// @updateURL    https://fastly.jsdelivr.net/gh/fastnow/UserJs@main/SiteAssetDL.user.js
// @downloadURL  https://fastly.jsdelivr.net/gh/fastnow/UserJs@main/SiteAssetDL.user.js
// @license      MIT
// @match        *://*/*
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @grant        GM_notification
// @grant        unsafeWindow
// @grant        window.onurlchange
// @connect      *
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  if (window.__SNIFFER_PRO__) return;
  window.__SNIFFER_PRO__ = true;

  const SELF_MARK = 'data-sniffer-self';
  const BACKUP_ATTR = 'data-sniffer-backup';
  const STORE_PREFIX = 'sniffer3.';

  const EXT_TYPE = {};
  (function () {
    const m = {
      image: ['jpg', 'jpeg', 'jpe', 'jfif', 'pjpeg', 'png', 'gif', 'webp', 'avif',
              'bmp', 'svg', 'svgz', 'ico', 'cur', 'apng', 'heic', 'heif', 'tif', 'tiff'],
      video: ['mp4', 'm4v', 'webm', 'mkv', 'mov', 'avi', 'flv', 'ogv', '3gp', 'wmv',
              'm3u8', 'mpd', 'ts'],
      audio: ['mp3', 'm4a', 'wav', 'ogg', 'oga', 'opus', 'flac', 'aac', 'weba', 'wma', 'aiff'],
      font: ['woff', 'woff2', 'ttf', 'otf', 'eot', 'sfnt', 'pfb', 'pfm'],
      subtitle: ['srt', 'vtt', 'ass', 'ssa'],
    };
    for (const t in m) for (const e of m[t]) EXT_TYPE[e] = t;
  })();

  const TYPE_META = {
    image: { label: '图片', icon: '🖼' },
    video: { label: '视频', icon: '🎬' },
    audio: { label: '音频', icon: '🎵' },
    font: { label: '字体', icon: '🔤' },
    subtitle: { label: '字幕', icon: '💬' },
    other: { label: '其他', icon: '📄' },
  };

  const PRECOMPRESSED = new Set([
    'jpg', 'jpeg', 'jpe', 'jfif', 'png', 'gif', 'webp', 'avif', 'heic', 'heif',
    'mp4', 'm4v', 'webm', 'mkv', 'mov', 'avi', 'flv', 'wmv', 'm3u8', 'mpd', 'ts',
    'mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'wma',
    'woff2', 'woff', 'zip', 'gz', 'br', '7z', 'rar', 'pdf',
  ]);
  const COMPRESSIBLE = new Set([
    'srt', 'vtt', 'ass', 'ssa', 'txt', 'json', 'xml', 'html', 'htm', 'css',
    'svg', 'svgz', 'ttf', 'otf', 'eot', 'js', 'map', 'csv', 'md',
  ]);

  const LAZY_ATTRS = [
    'data-src', 'data-original', 'data-lazy-src', 'data-lazysrc', 'data-lazy',
    'data-srcset', 'data-lazy-srcset', 'data-src-set', 'data-bgset',
    'data-echo', 'data-url', 'data-uri', 'data-image', 'data-img', 'data-imgsrc',
    'data-img-src', 'data-hi-res-src', 'data-hires-src', 'data-hd', 'data-hd-src',
    'data-full', 'data-full-src', 'data-zoom-image', 'data-zoom-src',
    'data-big', 'data-big-src', 'data-large', 'data-large-src',
    'data-actualsrc', 'data-actual-src', 'data-origin', 'data-original-src',
    'data-ks-lazyload', 'data-layzr', 'data-layzr-src', 'data-breeze',
    'data-src-retina', 'data-retina', 'data-webp', 'data-fallback-src',
    'data-gif', 'data-gifsrc', 'data-thumb', 'data-thumbnail', 'data-preview',
    'data-href', 'data-file', 'data-fileurl', 'data-file-url', 'data-path',
    'data-media', 'data-asset', 'data-load-src', 'data-defer-src',
    'data-bg', 'data-background', 'data-background-image',
    'data-lazyload', 'data-lazyload-src', 'data-photo', 'data-photo-src',
    'data-picture', 'data-real', 'data-real-src', 'data-raw', 'data-raw-src',
    'data-default-src', 'data-echo-src', 'data-holder', 'data-lazy-img',
    'data-src-hi', 'data-src-big', 'data-u', 'data-l',
  ];
  const LAZY_SET = new Set(LAZY_ATTRS);
  const HEURISTIC_WORDS = ['src', 'img', 'image', 'url', 'href', 'file', 'photo',
                           'thumb', 'original', 'full', 'hd', 'lazy', 'bg',
                           'background', 'asset', 'media', 'pic', 'picture'];

  const NOISE_INITIATORS = new Set(['script', 'xmlhttprequest', 'fetch', 'beacon',
                                    'navigation', 'ping', 'early-hints', 'other']);

  const SUPPORTS_POINTER = (() => {
    try { return typeof window.PointerEvent === 'function'; } catch { return false; }
  })();
  const EV_DOWN = SUPPORTS_POINTER ? 'pointerdown' : 'mousedown';
  const EV_MOVE = SUPPORTS_POINTER ? 'pointermove' : 'mousemove';
  const EV_UP = SUPPORTS_POINTER ? 'pointerup' : 'mouseup';

  const isCoarsePointer = (() => {
    try {
      if (typeof matchMedia !== 'function') return false;
      return matchMedia('(pointer: coarse)').matches;
    } catch { return false; }
  })();

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function fmtSize(b) {
    if (!b || b <= 0) return '—';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    if (b < 1073741824) return (b / 1048576).toFixed(2) + ' MB';
    return (b / 1073741824).toFixed(2) + ' GB';
  }
  function fmtSpeed(bps) {
    if (!bps || bps <= 0) return '—';
    return fmtSize(bps) + '/s';
  }
  function fmtEta(sec) {
    if (!isFinite(sec) || sec < 0) return '—';
    if (sec < 60) return Math.ceil(sec) + ' 秒';
    if (sec < 3600) return Math.floor(sec / 60) + ':' + String(Math.ceil(sec % 60)).padStart(2, '0');
    return Math.floor(sec / 3600) + ' 时';
  }
  function rand6() { return Math.random().toString(36).slice(2, 8); }

  function getExt(url) {
    if (!url) return '';
    if (url.startsWith('data:')) {
      const m = /^data:(?:image|font|video|audio)\/([a-z0-9.+-]+)/i.exec(url);
      return m ? m[1].replace('+xml', '') : '';
    }
    let p;
    try { p = new URL(url, location.href).pathname; }
    catch { p = url.split(/[?#]/)[0]; }
    const i = p.lastIndexOf('.');
    if (i < 0 || p.length - i > 6) return '';
    return p.slice(i + 1).toLowerCase();
  }

  function guessType(url, contentType, initiatorType) {
    if (contentType) {
      const ct = contentType.toLowerCase();
      if (ct.startsWith('image/')) return 'image';
      if (ct.startsWith('video/') || ct === 'application/vnd.apple.mpegurl' ||
          ct === 'application/dash+xml') return 'video';
      if (ct.startsWith('audio/')) return 'audio';
      if (ct.startsWith('font/') || ct.includes('font-woff') ||
          ct === 'application/x-font-ttf' || ct === 'application/vnd.ms-fontobject') return 'font';
      if (ct.includes('srt') || ct.includes('vtt')) return 'subtitle';
    }
    const byExt = EXT_TYPE[getExt(url)];
    if (byExt) return byExt;
    if (initiatorType === 'img' || initiatorType === 'image' || initiatorType === 'input') return 'image';
    if (initiatorType === 'video') return 'video';
    if (initiatorType === 'audio') return 'audio';
    if (initiatorType === 'track') return 'subtitle';
    if (initiatorType === 'css') return 'image';
    return 'other';
  }

  function basenameOf(url, initiatorType, forcedType) {
    if (!url) return 'unnamed';
    if (url.startsWith('data:')) return 'inline-' + rand6() + '.' + (getExt(url) || 'png');
    let u;
    try { u = new URL(url, location.href); } catch { return 'unnamed-' + rand6(); }
    let seg = u.pathname.split('/').pop() || '';
    try { seg = decodeURIComponent(seg); } catch {}
    let name = seg.replace(/[\\/:*?"<>|]/g, '_').trim();
    const ext = getExt(url);
    if (ext) {
      if (!name.toLowerCase().endsWith('.' + ext)) name += '.' + ext;
    } else {
      name += guessExtByType(forcedType || guessType(url, '', initiatorType));
    }
    if (!name || name.length > 150) {
      name = 'resource-' + rand6() + guessExtByType(forcedType || guessType(url, '', initiatorType));
    }
    return name;
  }
  function guessExtByType(t) {
    return { image: '.jpg', video: '.mp4', audio: '.mp3', font: '.woff2', subtitle: '.srt' }[t] || '';
  }

  function dedupKey(url, ignoreQuery) {
    if (url.startsWith('data:')) return url;
    try {
      const u = new URL(url, location.href);
      return ignoreQuery ? (u.origin + u.pathname) : u.href;
    } catch { return url; }
  }

  function resolveUrl(u) {
    try { return new URL(u, location.href).href; } catch { return u || ''; }
  }

  function extractCssUrls(cssText) {
    const out = [];
    const re = /url\(\s*(['"]?)([^'")]+?)\1\s*\)/gi;
    let m;
    while ((m = re.exec(cssText))) {
      const v = m[2].trim();
      if (!v || v.startsWith('#')) continue;
      out.push(v);
    }
    return out;
  }

  function parseSrcset(str) {
    if (!str) return [];
    return str.split(',')
      .map(part => {
        const seg = part.trim().split(/\s+/);
        const url = seg[0];
        if (!url) return null;
        const desc = seg[1] || '';
        let weight = 0;
        if (desc.endsWith('w')) weight = parseFloat(desc) || 0;
        else if (desc.endsWith('x')) weight = (parseFloat(desc) || 1) * 10000;
        else weight = 1;
        return { url, desc, weight };
      })
      .filter(Boolean)
      .sort((a, b) => b.weight - a.weight);
  }

  function isPlaceholderImg(el, src) {
    if (!src) return true;
    if (/^data:image\/(gif|png)/i.test(src) && src.length < 3000) return true;
    if (/\/(blank|placeholder|loading|default|grey|gray|spacer)[-_.]?\d*\.(gif|png|jpg|svg)/i.test(src)) return true;
    if (el && el.naturalWidth && el.naturalWidth <= 2) return true;
    return false;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function safeName(s) {
    return String(s || '').replace(/[\\/:*?"<>|\r\n]/g, '_').trim().slice(0, 120);
  }

  function csvCell(s) {
    const v = String(s == null ? '' : s);
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function shouldCompress(name, size, mode) {
    if (mode === 'none') return false;
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (mode === 'all') return true;
    if (PRECOMPRESSED.has(ext)) return false;
    if (!COMPRESSIBLE.has(ext)) return false;
    return size >= 512 && size <= 8 * 1024 * 1024;
  }

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function dosDateTime(d = new Date()) {
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
  }

  const supportsDeflateRaw = (() => {
    try { new CompressionStream('deflate-raw'); return true; } catch { return false; }
  })();

  async function deflateRaw(u8) {
    const cs = new CompressionStream('deflate-raw');
    const stream = new Blob([u8]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function dedupeNames(names) {
    const used = new Map();
    return names.map(n => {
      const k = n.toLowerCase();
      const c = used.get(k) || 0;
      used.set(k, c + 1);
      if (c === 0) return n;
      const dot = n.lastIndexOf('.');
      return dot > 0 ? `${n.slice(0, dot)} (${c})${n.slice(dot)}` : `${n} (${c})`;
    });
  }

  async function buildZip(files, opts = {}) {
    if (files.length > 65535) throw new Error('文件数超过 ZIP 上限 65535');
    const mode = opts.mode || 'auto';
    const enc = new TextEncoder();
    const { time, date } = dosDateTime();
    const FLAG = 0x0800;

    const names = dedupeNames(files.map(f => f.name));
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    let compressed = 0, stored = 0, rawSize = 0;

    for (let i = 0; i < files.length; i++) {
      const raw = files[i].data;
      const nameBytes = enc.encode(names[i]);
      const crc = crc32(raw);
      rawSize += raw.length;

      let payload = raw;
      let method = 0;
      if (supportsDeflateRaw && shouldCompress(names[i], raw.length, mode)) {
        try {
          const def = await deflateRaw(raw);
          if (def.length < raw.length) { payload = def; method = 8; compressed++; }
          else stored++;
        } catch { stored++; }
      } else {
        stored++;
      }

      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, FLAG, true);
      lh.setUint16(8, method, true);
      lh.setUint16(10, time, true);
      lh.setUint16(12, date, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, payload.length, true);
      lh.setUint32(22, raw.length, true);
      lh.setUint16(26, nameBytes.length, true);
      lh.setUint16(28, 0, true);
      localParts.push(new Uint8Array(lh.buffer), nameBytes, payload);

      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, FLAG, true);
      cd.setUint16(10, method, true);
      cd.setUint16(12, time, true);
      cd.setUint16(14, date, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, payload.length, true);
      cd.setUint32(24, raw.length, true);
      cd.setUint16(28, nameBytes.length, true);
      cd.setUint16(30, 0, true);
      cd.setUint16(32, 0, true);
      cd.setUint16(34, 0, true);
      cd.setUint16(36, 0, true);
      cd.setUint32(38, 0, true);
      cd.setUint32(42, offset, true);
      centralParts.push(new Uint8Array(cd.buffer), nameBytes);

      offset += 30 + nameBytes.length + payload.length;
      if (opts.onProgress) opts.onProgress(i + 1, files.length);
    }

    const cdSize = centralParts.reduce((n, u) => n + u.length, 0);
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(4, 0, true);
    eocd.setUint16(6, 0, true);
    eocd.setUint16(8, files.length, true);
    eocd.setUint16(10, files.length, true);
    eocd.setUint32(12, cdSize, true);
    eocd.setUint32(16, offset, true);
    eocd.setUint16(20, 0, true);

    const blob = new Blob([...localParts, ...centralParts, new Uint8Array(eocd.buffer)],
                          { type: 'application/zip' });
    return { blob, compressed, stored, rawSize };
  }

  async function runQueue(items, worker, opts = {}) {
    const total = items.length;
    if (!total) return { results: [], done: 0, failed: 0, failures: [] };

    const cfg = Object.assign({
      concurrency: 6,
      retries: 2,
      baseDelay: 400,
      adaptive: true,
      shouldStop: null,
      onProgress: null,
    }, opts);

    const isPermanent = e => /4(03|04|10|51)/.test(String(e && e.message)) ||
                             (e && e.permanent === true);

    let idx = 0, done = 0, failed = 0, consecFail = 0;
    const baseConcurrency = Math.max(1, Math.min(cfg.concurrency, total));
    let activeConcurrency = baseConcurrency;
    const results = new Array(total);
    const failures = [];

    async function runner() {
      while (true) {
        if (cfg.shouldStop && cfg.shouldStop()) return;
        const i = idx++;
        if (i >= total) return;

        let ok = false, lastErr = null;
        for (let attempt = 0; attempt <= cfg.retries; attempt++) {
          if (cfg.shouldStop && cfg.shouldStop()) return;
          if (attempt > 0) await sleep(cfg.baseDelay * Math.pow(2, attempt - 1));
          try {
            results[i] = await worker(items[i], i);
            ok = true;
            consecFail = 0;
            if (cfg.adaptive && activeConcurrency < baseConcurrency) activeConcurrency++;
            break;
          } catch (e) {
            lastErr = e;
            if (isPermanent(e)) break;
            consecFail++;
            if (cfg.adaptive && consecFail >= 3 && activeConcurrency > 1) {
              activeConcurrency = Math.max(1, activeConcurrency - 1);
              consecFail = 0;
            }
          }
        }
        done++;
        if (!ok) { failed++; failures.push({ index: i, item: items[i], error: lastErr }); }
        if (cfg.onProgress) {
          cfg.onProgress({ done, failed, total, index: i, ok, error: lastErr, concurrency: activeConcurrency });
        }
      }
    }

    const runners = [];
    for (let i = 0; i < activeConcurrency; i++) runners.push(runner());
    await Promise.all(runners);

    return { results, done, failed, failures };
  }

  function fetchBinary(url, opts = {}) {
    return new Promise((resolve, reject) => {
      const done = (fn, arg) => { clearTimeout(timer); fn(arg); };
      const timer = setTimeout(() => done(reject, new Error('超时')), opts.timeout || 60000);
      try {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          responseType: 'arraybuffer',
          headers: Object.assign({ Referer: location.href }, opts.headers || {}),
          timeout: opts.timeout || 60000,
          onload(res) {
            if (res.status >= 200 && res.status < 300 && res.response) {
              done(resolve, new Uint8Array(res.response));
            } else {
              const e = new Error('HTTP ' + res.status);
              if (res.status === 403 || res.status === 404 || res.status === 410) e.permanent = true;
              done(reject, e);
            }
          },
          onerror: () => done(reject, new Error('网络错误')),
          ontimeout: () => done(reject, new Error('超时')),
          onabort: () => done(reject, new Error('已中断')),
        });
      } catch (e) { done(reject, e); }
    });
  }

  const DEF = {
    concurrency: 6,
    retries: 2,
    zipMode: 'auto',
    theme: 'auto',
    groupBy: 'none',
    scanBg: true,
    forceHydrate: true,
    autoScroll: true,
    followInfinite: false,
    ignoreQuery: false,
    rememberPos: true,
    autoNotify: true,
    hoverPreview: true,
  };

  const state = Object.assign({}, DEF);
  const view = {
    filterType: 'all',
    search: '',
    minW: 0,
    minSize: 0,
    maxSize: 0,
    domain: '',
    exclude: '',
    onlyLazy: false,
    source: '',
    sort: 'smart',
  };

  function loadState() {
    if (typeof GM_getValue !== 'function') return;
    for (const k in DEF) {
      const v = GM_getValue(STORE_PREFIX + k, DEF[k]);
      if (v !== undefined && v !== null) state[k] = v;
    }
  }
  function saveState() {
    if (typeof GM_setValue !== 'function') return;
    for (const k in DEF) GM_setValue(STORE_PREFIX + k, state[k]);
  }

  const store = { items: new Map(), seq: 0 };
  let perfBaseline = 0;

  function addItem(raw) {
    const url = raw.url;
    if (!url || url.length < 5) return null;
    if (url.startsWith('data:') && url.length < 200) return null;
    if (/^(javascript|about|blob):/i.test(url)) return null;
    if (/^data:(text|application)\/(javascript|json)/i.test(url)) return null;

    const key = dedupKey(url, state.ignoreQuery);
    const existing = store.items.get(key);

    if (existing) {
      if (raw.el && !existing.el) existing.el = raw.el;
      if (raw.w && !existing.w) { existing.w = raw.w; existing.h = raw.h; }
      if (raw.size && !existing.size) existing.size = raw.size;
      if (existing.type === 'other') {
        const nt = guessType(url, raw.contentType, raw.initiatorType);
        if (nt !== 'other') { existing.type = nt; existing.ext = getExt(url); }
      }
      existing.sources.add(raw.source);
      if (raw.source === 'lazy' || raw.lazy) existing.lazy = true;
      return existing;
    }

    const type = guessType(url, raw.contentType, raw.initiatorType);
    if (type === 'other') return null;

    const item = {
      id: ++store.seq,
      url, key, type,
      ext: getExt(url),
      name: basenameOf(url, raw.initiatorType, type),
      size: raw.size || 0,
      w: raw.w || 0, h: raw.h || 0,
      alt: raw.alt || '',
      initiatorType: raw.initiatorType || '',
      source: raw.source,
      sources: new Set([raw.source]),
      el: raw.el || null,
      lazy: raw.source === 'lazy' || !!raw.lazy,
      startTime: raw.startTime || 0,
      selected: false,
      failed: false,
      probed: false,
    };
    store.items.set(key, item);
    return item;
  }

  function collectFromPerformance() {
    if (!window.performance || !performance.getEntriesByType) return 0;
    let entries;
    try { entries = performance.getEntriesByType('resource'); } catch { return 0; }
    let n = 0;
    for (const e of entries) {
      if (e.startTime < perfBaseline) continue;
      if (NOISE_INITIATORS.has(e.initiatorType)) continue;
      if (addItem({
        url: e.name,
        contentType: e.contentType || '',
        initiatorType: e.initiatorType,
        size: e.decodedBodySize || e.transferSize || 0,
        startTime: e.startTime,
        source: 'perf',
      })) n++;
    }
    return n;
  }

  function boostPerfBuffer() {
    try {
      if (performance.setResourceTimingBufferSize) performance.setResourceTimingBufferSize(20000);
    } catch {}
    try {
      new PerformanceObserver(list => {
        for (const e of list.getEntries()) {
          if (e.startTime < perfBaseline) continue;
          if (NOISE_INITIATORS.has(e.initiatorType)) continue;
          addItem({
            url: e.name,
            contentType: e.contentType || '',
            initiatorType: e.initiatorType,
            size: e.decodedBodySize || e.transferSize || 0,
            startTime: e.startTime,
            source: 'perf',
          });
        }
        bumpBadge();
      }).observe({ type: 'resource', buffered: true });
    } catch {}
  }

  function collectFromDom(root) {
    const doc = root || document;
    let n = 0;
    const add = raw => { if (addItem(raw)) n++; };

    doc.querySelectorAll('img').forEach(img => {
      const src = img.currentSrc || img.getAttribute('src') || '';
      const w = img.naturalWidth || 0, h = img.naturalHeight || 0;
      if (src && !isPlaceholderImg(img, src)) {
        add({ url: src, el: img, w, h, alt: img.alt, initiatorType: 'img', source: 'dom' });
      }
      const ss = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
      if (ss) for (const c of parseSrcset(ss)) {
        add({ url: c.url, el: img, initiatorType: 'img', source: 'dom', lazy: true });
      }
    });

    doc.querySelectorAll('video, audio').forEach(m => {
      const s = m.getAttribute('src') || m.currentSrc || '';
      if (s) add({ url: s, el: m, initiatorType: m.tagName.toLowerCase(), source: 'dom' });
      const poster = m.getAttribute('poster');
      if (poster) add({ url: poster, el: m, initiatorType: 'img', source: 'dom' });
    });
    doc.querySelectorAll('source').forEach(s => {
      const src = s.getAttribute('src') || s.getAttribute('srcset') || '';
      const p = s.parentElement ? s.parentElement.tagName.toLowerCase() : 'video';
      if (src) add({ url: src, el: s, initiatorType: p === 'audio' ? 'audio' : 'video', source: 'dom' });
    });
    doc.querySelectorAll('track').forEach(t => {
      const src = t.getAttribute('src');
      if (src) add({ url: src, el: t, initiatorType: 'track', source: 'dom' });
    });
    doc.querySelectorAll('image, use').forEach(el => {
      const href = el.getAttribute('href') || el.getAttribute('xlink:href') || '';
      if (href) add({ url: href, el, initiatorType: 'image', source: 'svg' });
    });
    doc.querySelectorAll('input[type="image"]').forEach(el => {
      const s = el.getAttribute('src');
      if (s) add({ url: s, el, initiatorType: 'input', source: 'dom' });
    });
    doc.querySelectorAll('embed[src], object[data]').forEach(el => {
      const s = el.getAttribute('src') || el.getAttribute('data');
      if (s) add({ url: s, el, initiatorType: 'embed', source: 'dom' });
    });

    n += harvestDataAttrs(doc);
    return n;
  }

  function harvestDataAttrs(doc) {
    let n = 0;
    const all = doc.querySelectorAll('*');
    const limit = Math.min(all.length, 8000);

    for (let i = 0; i < limit; i++) {
      const el = all[i];
      if (!el.attributes) continue;
      for (const attr of el.attributes) {
        const name = attr.name.toLowerCase();
        if (!name.startsWith('data-')) continue;
        if (name === BACKUP_ATTR || name === SELF_MARK) continue;
        const isKnown = LAZY_SET.has(name);
        if (!isKnown && !HEURISTIC_WORDS.some(w => name.includes(w))) continue;

        const val = (attr.value || '').trim();
        if (val.length < 8 || val.length > 2000) continue;
        if (val.startsWith('{') || val.startsWith('[')) continue;

        const looks = /^(https?:)?\/\//i.test(val) || /^data:image\//i.test(val) ||
                      /^\/[^/]/.test(val) ||
                      /\.(jpe?g|png|gif|webp|avif|svg|bmp|mp4|webm|m3u8|mpd|mp3|m4a|wav|ogg|flac|woff2?|ttf|otf|srt|vtt)(\?|#|$)/i.test(val);
        if (!looks) continue;

        if (/srcset|bgset/i.test(name)) {
          for (const c of parseSrcset(val)) {
            if (addItem({ url: c.url, el, initiatorType: 'img', source: 'lazy', lazy: true })) n++;
          }
          continue;
        }
        const isBg = /(bg|background)/i.test(name);
        if (addItem({ url: val, el, initiatorType: isBg ? 'css' : 'img', source: 'lazy', lazy: true })) n++;
      }
    }
    return n;
  }

  function collectFromCss() {
    let n = 0;
    const FONT_FACE = (typeof CSSRule !== 'undefined' && CSSRule.FONT_FACE_RULE) || 5;
    for (const sheet of Array.from(document.styleSheets || [])) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      if (!rules) continue;
      for (const rule of rules) {
        try {
          const isFont =
            (typeof CSSFontFaceRule !== 'undefined' && rule instanceof CSSFontFaceRule) ||
            rule.type === FONT_FACE ||
            (rule.cssText && /^\s*@font-face/i.test(rule.cssText));
          if (isFont) {
            let src = '';
            try { src = rule.style ? rule.style.getPropertyValue('src') : ''; } catch {}
            if (!src && rule.cssText) src = rule.cssText;
            for (const u of extractCssUrls(src)) {
              if (addItem({ url: u, initiatorType: 'css', contentType: guessCTbyFontUrl(u), source: 'font' })) n++;
            }
          } else if (rule.cssText && /url\(/i.test(rule.cssText)) {
            for (const u of extractCssUrls(rule.cssText)) {
              if (addItem({ url: u, initiatorType: 'css', source: 'css' })) n++;
            }
          }
        } catch {}
      }
    }
    return n;
  }

  function collectFromStyleTags() {
    let n = 0;
    for (const tag of document.querySelectorAll('style')) {
      const text = tag.textContent || '';
      if (!/url\(/i.test(text)) continue;
      for (const blk of text.match(/@font-face\s*\{[^}]*\}/gi) || []) {
        for (const u of extractCssUrls(blk)) {
          if (addItem({ url: u, initiatorType: 'css', contentType: guessCTbyFontUrl(u), source: 'font' })) n++;
        }
      }
      for (const u of extractCssUrls(text.replace(/@font-face\s*\{[^}]*\}/gi, ''))) {
        if (addItem({ url: u, initiatorType: 'css', source: 'css' })) n++;
      }
    }
    return n;
  }

  function guessCTbyFontUrl(u) {
    const e = getExt(u);
    return { woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf',
             otf: 'font/otf', eot: 'application/vnd.ms-fontobject' }[e] || '';
  }

  function collectBackgroundImages(limit = 2500) {
    let n = 0;
    const all = document.querySelectorAll('*');
    const end = Math.min(all.length, limit);
    for (let i = 0; i < end; i++) {
      try {
        const bg = getComputedStyle(all[i]).backgroundImage;
        if (!bg || bg === 'none' || !bg.includes('url(')) continue;
        for (const u of extractCssUrls(bg)) {
          if (addItem({ url: u, el: all[i], initiatorType: 'css', source: 'bg' })) n++;
        }
      } catch {}
    }
    return n;
  }

  function collectFromFrames() {
    let n = 0;
    document.querySelectorAll('iframe').forEach(f => {
      try { if (f.contentDocument) n += collectFromDom(f.contentDocument); } catch {}
    });
    return n;
  }

  function collectAll(includeBg = true) {
    let n = 0;
    n += collectFromPerformance();
    n += collectFromDom(document);
    n += collectFromFrames();
    n += collectFromCss();
    n += collectFromStyleTags();
    if (includeBg && state.scanBg) n += collectBackgroundImages();
    return n;
  }

  let moTimer = null;
  function setupMutationObserver() {
    if (!window.MutationObserver) return;
    const mo = new MutationObserver(muts => {
      for (const m of muts) {
        for (const node of m.addedNodes || []) {
          if (node.nodeType !== 1) continue;
          if (node.tagName === 'IMG') {
            const s = node.getAttribute('src');
            if (s) addItem({ url: s, el: node, initiatorType: 'img', source: 'dom' });
          }
          if (node.querySelectorAll) {
            node.querySelectorAll('img').forEach(img => {
              const s = img.getAttribute('src');
              if (s) addItem({ url: s, el: img, initiatorType: 'img', source: 'dom' });
            });
            harvestDataAttrs(node);
          }
        }
      }
      clearTimeout(moTimer);
      moTimer = setTimeout(() => { collectFromPerformance(); if (ui.root) renderList(); }, 400);
    });
    mo.observe(document.documentElement || document, { childList: true, subtree: true });
  }

  function forceHydrate() {
    let count = 0;
    document.querySelectorAll('img').forEach(img => {
      const cur = img.getAttribute('src') || '';
      if (!isPlaceholderImg(img, cur)) return;

      let target = null;
      const ss = img.getAttribute('data-srcset') || img.getAttribute('data-lazy-srcset') || '';
      if (ss) {
        const c = parseSrcset(ss);
        if (c.length) target = c[0].url;
      }
      if (!target) {
        for (const attr of LAZY_ATTRS) {
          const v = img.getAttribute(attr);
          if (v && v.length > 8 && !/^data:/i.test(v)) { target = v; break; }
        }
      }
      if (!target) return;
      try {
        if (!img.hasAttribute(BACKUP_ATTR)) img.setAttribute(BACKUP_ATTR, cur || '');
        img.setAttribute(SELF_MARK, '1');
        img.src = target;
        img.removeAttribute('loading');
        img.removeAttribute('srcset');
        count++;
      } catch {}
    });
    return count;
  }

  function restoreHydrate() {
    let n = 0;
    document.querySelectorAll(`img[${BACKUP_ATTR}]`).forEach(img => {
      const backup = img.getAttribute(BACKUP_ATTR);
      if (backup === null) return;
      try {
        if (backup) img.setAttribute('src', backup);
        else img.removeAttribute('src');
        img.setAttribute('loading', 'lazy');
        img.removeAttribute(BACKUP_ATTR);
        n++;
      } catch {}
    });
    return n;
  }

  async function waitNetworkIdle(idleMs = 1200, timeout = 12000) {
    const count = () => { try { return performance.getEntriesByType('resource').length; } catch { return 0; } };
    const t0 = Date.now();
    let last = count(), stable = 0;
    while (Date.now() - t0 < timeout) {
      if (scan.aborted) break;
      await sleep(250);
      const now = count();
      if (now === last) { stable += 250; if (stable >= idleMs) break; }
      else { stable = 0; last = now; }
    }
    await sleep(300);
  }

  async function autoScroll(opts = {}) {
    const { step = 700, delay = 200, maxSteps = 150, onProgress } = opts;
    const startY = window.scrollY;
    let lastH = -1, stableCount = 0, steps = 0;

    for (let i = 0; i < maxSteps; i++) {
      if (scan.aborted) break;
      window.scrollBy(0, step);
      steps++;
      await sleep(delay);
      if (onProgress) onProgress({ steps, maxSteps });
      const h = document.documentElement.scrollHeight;
      const bottom = window.scrollY + window.innerHeight >= h - 50;
      if (h === lastH && bottom) {
        if (++stableCount >= 3) break;
      } else stableCount = 0;
      lastH = h;
      if (bottom && !state.followInfinite) break;
    }
    try { window.scrollTo({ top: startY, behavior: 'auto' }); } catch {}
    return steps;
  }

  const scan = { aborted: false, running: false };

  async function deepScan(opts = {}) {
    if (scan.running) return;
    scan.running = true;
    scan.aborted = false;

    const cfg = Object.assign({
      forceHydrate: state.forceHydrate,
      doScroll: state.autoScroll,
    }, opts);

    const before = store.items.size;
    const r = { hydrated: 0, steps: 0, added: 0 };

    try {
      ui.setBusy(true, '扫描中…');
      if (cfg.forceHydrate) {
        r.hydrated = forceHydrate();
        await waitNetworkIdle(1000, 8000);
      }
      if (cfg.doScroll && !scan.aborted) {
        r.steps = await autoScroll({
          onProgress: p => ui.setBusy(true, `滚动触发懒加载 ${p.steps}/${p.maxSteps}`),
        });
        await waitNetworkIdle(1500, 15000);
      }
      collectAll(false);
      r.added = store.items.size - before;
      ui.setBusy(false, `扫描完成：新增 ${r.added} 项（解冻 ${r.hydrated} · 滚动 ${r.steps} 步）`);
      renderList();
    } catch (e) {
      ui.setBusy(false, '扫描出错：' + e.message);
    } finally {
      scan.running = false;
      scan.aborted = false;
      ui.syncScanBtn();
    }
  }

  function abortScan() {
    scan.aborted = true;
    ui.setBusy(false, '已停止');
    ui.syncScanBtn();
  }

  async function probeItem(item) {
    if (item.probed || item.url.startsWith('data:')) return;
    item.probed = true;
    await new Promise(resolve => {
      const fin = () => resolve();
      const t = setTimeout(fin, 8000);
      try {
        GM_xmlhttpRequest({
          method: 'HEAD', url: item.url,
          headers: { Referer: location.href },
          timeout: 8000,
          onload(res) {
            clearTimeout(t);
            const cl = /content-length:\s*(\d+)/i.exec(res.responseHeaders || '');
            const ct = /content-type:\s*([^\r\n;]+)/i.exec(res.responseHeaders || '');
            if (cl) item.size = parseInt(cl[1], 10);
            if (ct) {
              item.contentType = ct[1].trim();
              const nt = guessType(item.url, item.contentType, item.initiatorType);
              if (nt !== 'other') { item.type = nt; item.ext = getExt(item.url); }
            }
            fin();
          },
          onerror() { clearTimeout(t); fin(); },
          ontimeout() { clearTimeout(t); fin(); },
        });
      } catch { clearTimeout(t); fin(); }
    });
  }

  function getFiltered() {
    const kw = view.search.trim().toLowerCase();
    const exArr = view.exclude.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const out = [];

    for (const it of store.items.values()) {
      if (view.filterType !== 'all' && it.type !== view.filterType) continue;
      if (view.onlyLazy && !it.lazy) continue;
      if (view.source === 'lazy' && !it.lazy) continue;
      if (view.source === 'loaded' && it.lazy) continue;
      if (view.source === 'css' && !['css', 'bg', 'font'].includes(it.source)) continue;
      if (view.minW && it.type === 'image' && (it.w || 0) < view.minW) continue;
      if (view.minSize && (it.size || 0) < view.minSize) continue;
      if (view.maxSize && (it.size || 0) > view.maxSize) continue;
      if (view.domain) {
        let host = '';
        try { host = new URL(it.url, location.href).hostname; } catch {}
        if (!host.includes(view.domain)) continue;
      }
      if (exArr.length) {
        const hay = (it.url + ' ' + it.name).toLowerCase();
        if (exArr.some(x => hay.includes(x))) continue;
      }
      if (kw) {
        const hay = (it.name + ' ' + it.url + ' ' + it.alt).toLowerCase();
        if (!hay.includes(kw)) continue;
      }
      out.push(it);
    }

    sortItems(out, view.sort);
    return out;
  }

  function sortItems(arr, mode) {
    const cmp = {
      smart: (a, b) => (a.type === 'image' && b.type === 'image')
        ? (b.w || 0) - (a.w || 0) || (b.size || 0) - (a.size || 0)
        : (b.size || 0) - (a.size || 0),
      sizeDesc: (a, b) => (b.size || 0) - (a.size || 0),
      sizeAsc: (a, b) => (a.size || 0) - (b.size || 0),
      name: (a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'),
      newest: (a, b) => (b.startTime || 0) - (a.startTime || 0) || b.id - a.id,
    }[mode] || ((a, b) => b.id - a.id);
    arr.sort(cmp);
    return arr;
  }

  function buildGroups(items) {
    if (state.groupBy === 'none') return [{ title: null, items }];
    const map = new Map();
    for (const it of items) {
      let k;
      if (state.groupBy === 'type') k = TYPE_META[it.type].label;
      else {
        try { k = new URL(it.url, location.href).hostname || '其他'; } catch { k = '其他'; }
      }
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    const order = state.groupBy === 'type'
      ? ['图片', '视频', '音频', '字体', '字幕', '其他']
      : null;
    const keys = Array.from(map.keys());
    if (order) keys.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    else keys.sort((a, b) => map.get(b).length - map.get(a).length);
    return keys.map(k => ({ title: k, items: map.get(k) }));
  }

  function markDuplicates(items) {
    const map = new Map();
    for (const it of items) {
      if (!it.size) continue;
      const k = `${it.type}:${it.size}:${it.w || 0}x${it.h || 0}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    let n = 0;
    for (const list of map.values()) {
      if (list.length < 2) continue;
      for (let i = 1; i < list.length; i++) { list[i].dupe = true; n++; }
    }
    return n;
  }

  function exportAs(items, format) {
    const dir = safeName(document.title) || 'downloads';
    switch (format) {
      case 'txt': return items.map(i => i.url).join('\n');
      case 'aria2': return items.map(i =>
        `${i.url}\n  dir=${dir}\n  out=${i.name}\n  referer=${location.href}\n`).join('\n');
      case 'wget': return items.map(i =>
        `wget --referer="${location.href}" -O "${i.name}" "${i.url}"`).join('\n');
      case 'curl': return items.map(i =>
        `curl -e "${location.href}" -o "${i.name}" "${i.url}"`).join('\n');
      case 'md': return items.map(i => {
        const t = i.type === 'image' ? `![${i.name}]` : `[${i.name}]`;
        return `${t}(${i.url})`;
      }).join('\n');
      case 'csv': {
        const head = ['url', 'name', 'type', 'size', 'width', 'height', 'lazy'];
        const rows = items.map(i => [
          i.url, i.name, i.type, i.size || '', i.w || '', i.h || '', i.lazy ? 1 : 0,
        ].map(csvCell).join(','));
        return '\ufeff' + [head.join(','), ...rows].join('\r\n');
      }
      case 'json': return JSON.stringify(items.map(i => ({
        url: i.url, name: i.name, type: i.type, size: i.size,
        width: i.w || undefined, height: i.h || undefined, lazy: i.lazy,
      })), null, 2);
      default: return items.map(i => i.url).join('\n');
    }
  }

  const EXPORT_EXT = {
    txt: 'txt', aria2: 'txt', wget: 'sh', curl: 'sh',
    md: 'md', csv: 'csv', json: 'json',
  };

  function triggerDownload(blob, filename) {
    const a = document.createElement('a');
    a.download = filename;
    a.setAttribute(SELF_MARK, '1');

    const click = () => {
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 4000);
    };

    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const url = URL.createObjectURL(blob);
      a.href = url;
      click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return;
    }

    if (typeof FileReader === 'function') {
      const fr = new FileReader();
      fr.onload = () => { a.href = fr.result; click(); };
      fr.readAsDataURL(blob);
      return;
    }

    a.href = 'data:application/octet-stream;base64,';
    click();
  }

  function dataUrlToBlob(dataUrl) {
    const [head, b64] = dataUrl.split(',');
    const mime = (/:([^;]+);/.exec(head) || [, 'application/octet-stream'])[1];
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: mime });
  }

  async function writeBlob(blob, fallbackName) {
    if (ui.zipHandle) {
      try {
        const w = await ui.zipHandle.createWritable();
        await blob.stream().pipeTo(w);
        return { method: 'stream' };
      } catch {}
    }
    triggerDownload(blob, fallbackName);
    return { method: 'download' };
  }

  function downloadSingle(item) {
    if (item.url.startsWith('data:')) {
      triggerDownload(dataUrlToBlob(item.url), item.name);
      return Promise.resolve();
    }
    return new Promise(resolve => {
      if (typeof GM_download !== 'function') {
        fetchBinary(item.url)
          .then(d => { triggerDownload(new Blob([d]), item.name); resolve(); })
          .catch(() => resolve());
        return;
      }
      GM_download({
        url: item.url,
        name: item.name,
        headers: { Referer: location.href },
        onload: resolve,
        onerror: () => {
          fetchBinary(item.url)
            .then(d => { triggerDownload(new Blob([d]), item.name); })
            .catch(() => {})
            .finally(resolve);
        },
      });
    });
  }

  const lastFailures = [];
  const failedKeys = new Set();

  async function downloadZip(items) {
    if (!items.length) return;
    const total = items.length;

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const zipName = `${safeName(document.title) || 'resources'}_${stamp}.zip`;
    ui.zipHandle = await ui.askSaveTarget(zipName);

    const t0 = Date.now();
    let bytes = 0, failedN = 0;
    const files = [];
    lastFailures.length = 0;

    ui.setBusy(true, `下载中 0/${total}`);

    const result = await runQueue(items, async (it, i) => {
      let data;
      if (it.url.startsWith('data:')) {
        data = new Uint8Array(await dataUrlToBlob(it.url).arrayBuffer());
      } else {
        data = await fetchBinary(it.url);
      }
      files[i] = { name: it.name, data };
      bytes += data.length;
      return data.length;
    }, {
      concurrency: state.concurrency,
      retries: state.retries,
      shouldStop: () => scan.aborted,
      onProgress: ({ done, failed, total: t }) => {
        failedN = failed;
        const el = (Date.now() - t0) / 1000;
        const speed = el > 0 ? bytes / el : 0;
        const eta = speed > 0 ? ((t - done) * (bytes / done || 0)) / speed : NaN;
        ui.setBusy(true,
          `下载中 ${done}/${t} · ${fmtSize(bytes)} · ${fmtSpeed(speed)}` +
          (isFinite(eta) && done > 2 ? ` · 剩余 ${fmtEta(eta)}` : '') +
          (failed ? ` · 失败 ${failed}` : ''),
          (done / t) * 90);
      },
    });

    if (scan.aborted) { ui.setBusy(false, '已取消'); ui.zipHandle = null; return; }

    lastFailures.length = 0;
    result.failures.forEach(f => {
      lastFailures.push({ item: f.item, error: f.error });
      failedKeys.add(f.item.key);
    });
    result.results.forEach((r, i) => { if (r) failedKeys.delete(items[i].key); });

    const packed = files.filter(Boolean);

    if (!packed.length) {
      ui.setBusy(false, '全部下载失败');
      ui.zipHandle = null;
      ui.syncRetryBtn();
      return;
    }

    ui.setBusy(true, `打包中（${packed.length} 个文件）…`, 92);
    let res;
    try {
      res = await buildZip(packed, { mode: state.zipMode });
    } catch (e) {
      ui.setBusy(false, '打包失败：' + e.message);
      ui.zipHandle = null;
      return;
    }

    ui.setBusy(true, '写入文件…', 97);
    await writeBlob(res.blob, zipName);
    ui.zipHandle = null;

    const sec = (Date.now() - t0) / 1000;
    const ratio = res.rawSize ? (1 - res.blob.size / res.rawSize) * 100 : 0;
    ui.setBusy(false,
      `完成 ${packed.length}/${total} · ${fmtSize(res.blob.size)} · ` +
      `${fmtSpeed(res.blob.size / Math.max(sec, 0.1))} · ${sec.toFixed(1)}s` +
      (state.zipMode !== 'none' && res.compressed ? ` · 压缩 ${res.compressed} 个(-${ratio.toFixed(0)}%)` : '') +
      (failedN ? ` · 失败 ${failedN}` : ''));
    notify('打包完成', `${packed.length} 个文件 · ${fmtSize(res.blob.size)}`);
    ui.syncRetryBtn();
    renderList();
  }

  async function saveToFolder(items) {
    if (typeof window.showDirectoryPicker !== 'function') {
      ui.setBusy(false, '当前浏览器不支持直接保存到文件夹，请用「打包 ZIP」或「逐个下载」');
      return;
    }
    let dirHandle;
    try {
      dirHandle = await window.showDirectoryPicker({ id: 'sniffer-dl', mode: 'readwrite' });
    } catch (e) {
      if (e && e.name !== 'AbortError') console.warn(e);
      return;
    }
    if (!dirHandle) return;

    const total = items.length;
    const t0 = Date.now();
    let bytes = 0, failedN = 0;
    lastFailures.length = 0;
    ui.setBusy(true, `保存到文件夹 0/${total}`);

    const result = await runQueue(items, async it => {
      let res;
      try {
        res = await fetch(it.url, { mode: 'cors', credentials: 'omit' });
      } catch { res = null; }

      const fh = await dirHandle.getFileHandle(it.name, { create: true });
      const w = await fh.createWritable();
      try {
        if (res && res.ok && res.body) {
          await res.body.pipeTo(w);
        } else {
          const data = await fetchBinary(it.url);
          await w.write(data);
        }
      } catch (e) {
        try { await w.abort(); } catch {}
        throw e;
      }
      bytes += it.size || 0;
      return true;
    }, {
      concurrency: Math.max(2, Math.floor(state.concurrency / 2)),
      retries: state.retries,
      shouldStop: () => scan.aborted,
      onProgress: ({ done, failed, total: t }) => {
        failedN = failed;
        const el = (Date.now() - t0) / 1000;
        ui.setBusy(true,
          `保存中 ${done}/${t} · ${fmtSpeed(el > 0 ? bytes / el : 0)}` +
          (failed ? ` · 失败 ${failed}` : ''),
          (done / t) * 100);
      },
    });

    lastFailures.push(...result.failures.map(f => ({ item: f.item, error: f.error })));
    result.failures.forEach(f => failedKeys.add(f.item.key));
    ui.syncRetryBtn();
    renderList();
    ui.setBusy(false, `已保存 ${total - failedN}/${total} 个文件到文件夹` +
      (failedN ? `（失败 ${failedN}）` : ''));
    if (state.autoNotify) notify('保存完成', `${total - failedN} 个文件已写入磁盘`);
  }

  async function probeAll(items) {
    const t = items.length;
    if (!t) return;
    ui.setBusy(true, `探测大小 0/${t}`);
    await runQueue(items, it => probeItem(it), {
      concurrency: Math.min(8, state.concurrency + 2),
      retries: 1,
      shouldStop: () => scan.aborted,
      onProgress: ({ done }) => ui.setBusy(true, `探测大小 ${done}/${t}`, (done / t) * 100),
    });
    ui.setBusy(false, `探测完成（${t} 项）`);
    renderList();
  }

  function notify(title, text) {
    if (!state.autoNotify || typeof GM_notification !== 'function') return;
    try { GM_notification({ title, text, timeout: 4000 }); } catch {}
  }

  function findElementByUrl(url) {
    const sels = 'img, video, audio, source, track, image, use, input[type="image"], embed, object';
    const list = document.querySelectorAll(sels);
    const attrs = ['src', 'currentSrc', 'href', 'xlink:href', 'data', 'poster'];
    for (const el of list) {
      for (const a of attrs) {
        let v = '';
        try { v = (a === 'currentSrc' ? el.currentSrc : el.getAttribute(a)) || ''; } catch {}
        if (!v || v.length < 5) continue;
        if (v === url || resolveUrl(v) === url) return el;
      }
    }
    const bgEls = document.querySelectorAll('*');
    const limit = Math.min(bgEls.length, 1500);
    for (let i = 0; i < limit; i++) {
      try {
        const bg = getComputedStyle(bgEls[i]).backgroundImage;
        if (!bg || !bg.includes('url(')) continue;
        for (const u of extractCssUrls(bg)) {
          if (resolveUrl(u) === url) return bgEls[i];
        }
      } catch {}
    }
    return null;
  }

  function locateItem(item) {
    let el = item.el;
    if (!el || !el.isConnected) el = findElementByUrl(item.url);
    if (!el) {
      ui.setBusy(false, '页面上找不到该资源对应的元素（可能是懒加载或已移除）');
      return false;
    }
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
    const prev = el.style.outline;
    const prevOffset = el.style.outlineOffset;
    el.style.outlineOffset = '2px';
    let on = true, n = 0;
    const timer = setInterval(() => {
      el.style.outline = on ? '3px solid #ff2d55' : '';
      on = !on;
      if (++n >= 7) {
        clearInterval(timer);
        el.style.outline = prev;
        el.style.outlineOffset = prevOffset;
      }
    }, 240);
    ui.setBusy(false, '已定位到页面中的元素');
    return true;
  }

  const CSS = `
:host{all:initial}
*{box-sizing:border-box;margin:0;padding:0}
.snf{
  --bg:#fff;--bg2:#f7f7f8;--bg3:#eeeef0;--bd:#e4e4e7;--bd2:#d4d4d8;
  --tx:#18181b;--tx2:#71717a;--tx3:#a1a1aa;
  --ac:#2563eb;--ac2:#dbeafe;--ok:#16a34a;--wn:#f59e0b;--er:#dc2626;
  --sh:0 1px 2px rgba(0,0,0,.06),0 4px 16px rgba(0,0,0,.08);
  --sh2:0 8px 40px rgba(0,0,0,.18);
  font:13px/1.5 system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
  color:var(--tx);
}
.snf.dark{
  --bg:#1b1b1d;--bg2:#232326;--bg3:#2c2c30;--bd:#2f2f34;--bd2:#3f3f46;
  --tx:#f4f4f5;--tx2:#a1a1aa;--tx3:#71717a;
  --ac:#60a5fa;--ac2:#1e3a5f;
  --sh:0 1px 2px rgba(0,0,0,.3),0 4px 16px rgba(0,0,0,.4);
  --sh2:0 8px 40px rgba(0,0,0,.6);
}
.fab{
  position:fixed;right:20px;bottom:20px;z-index:2147483646;
  display:flex;align-items:center;gap:7px;height:42px;padding:0 15px 0 13px;
  background:var(--bg);color:var(--tx);border:1px solid var(--bd);
  border-radius:22px;box-shadow:var(--sh);cursor:grab;
  font:inherit;font-size:13px;font-weight:500;
  touch-action:none;-webkit-user-select:none;user-select:none;
  transition:box-shadow .15s,border-color .15s;
}
.fab:hover{box-shadow:var(--sh2);border-color:var(--bd2)}
.fab.dragging{cursor:grabbing;opacity:.92}
.fab svg{width:16px;height:16px;opacity:.75;pointer-events:none}
.fab span{pointer-events:none}
.fab .n{
  background:var(--ac);color:#fff;border-radius:9px;padding:0 6px;
  font-size:11px;font-weight:700;line-height:17px;min-width:18px;text-align:center;
}
.fab .n[hidden]{display:none}
.panel{
  position:fixed;right:16px;bottom:16px;z-index:2147483647;
  width:min(900px,94vw);height:min(660px,86vh);
  min-width:330px;min-height:280px;
  display:none;flex-direction:column;
  background:var(--bg);border:1px solid var(--bd);border-radius:14px;
  box-shadow:var(--sh2);overflow:hidden;
}
.panel.open{display:flex}
.panel.max{
  width:96vw!important;height:94vh!important;
  left:2vw!important;top:3vh!important;right:auto!important;bottom:auto!important;
}
.hd{
  display:flex;align-items:center;gap:6px;padding:0 8px 0 14px;height:46px;
  border-bottom:1px solid var(--bd);flex-shrink:0;cursor:grab;
  background:var(--bg);touch-action:none;-webkit-user-select:none;user-select:none;
}
.hd.dragging{cursor:grabbing}
.hd h1{font-size:13px;font-weight:600;display:flex;align-items:center;gap:7px}
.hd h1 svg{width:15px;height:15px;color:var(--ac);pointer-events:none}
.stats{font-size:11px;color:var(--tx3);font-weight:400}
.grow{flex:1}
.ib{
  width:28px;height:28px;display:grid;place-items:center;border:none;background:transparent;
  color:var(--tx2);border-radius:6px;cursor:pointer;font-size:14px;line-height:1;flex-shrink:0;
}
.ib:hover{background:var(--bg3);color:var(--tx)}
.ib.on{color:var(--ac);background:var(--ac2)}
.bar{padding:8px 12px;border-bottom:1px solid var(--bd);display:flex;gap:8px;
  align-items:center;flex-wrap:wrap;flex-shrink:0;background:var(--bg)}
.seg{display:flex;background:var(--bg3);border-radius:8px;padding:2px;gap:1px;flex-wrap:wrap}
.seg button{
  border:none;background:transparent;padding:4px 10px;border-radius:6px;cursor:pointer;
  font:inherit;font-size:12px;color:var(--tx2);white-space:nowrap;transition:.12s;
}
.seg button:hover{color:var(--tx)}
.seg button.on{background:var(--bg);color:var(--tx);font-weight:500;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.seg button i{font-style:normal;opacity:.5;margin-left:4px;font-size:11px}
.inp{display:flex;align-items:center;gap:6px;background:var(--bg2);
  border:1px solid var(--bd);border-radius:7px;padding:0 8px;height:28px;min-width:0}
.inp:focus-within{border-color:var(--ac);background:var(--bg)}
.inp svg{width:13px;height:13px;color:var(--tx3);flex-shrink:0}
.inp input,.inp select{
  border:none;background:transparent;outline:none;font:inherit;font-size:12px;
  color:var(--tx);width:100%;min-width:0;
}
.inp select{cursor:pointer}
.inp input::placeholder{color:var(--tx3)}
.inp.w1{width:150px}
.sel2{
  height:28px;padding:0 8px;border:1px solid var(--bd);border-radius:7px;background:var(--bg);
  color:var(--tx);font:inherit;font-size:12px;outline:none;cursor:pointer;
}
.sel2:focus{border-color:var(--ac)}
.btn{
  height:28px;padding:0 11px;border:1px solid var(--bd);background:var(--bg);
  color:var(--tx);border-radius:7px;cursor:pointer;font:inherit;font-size:12px;
  white-space:nowrap;transition:.12s;display:inline-flex;align-items:center;gap:5px;
}
.btn:hover{background:var(--bg3);border-color:var(--bd2)}
.btn.pri{background:var(--ac);border-color:var(--ac);color:#fff;font-weight:500}
.btn.pri:hover{filter:brightness(1.08)}
.btn:disabled{opacity:.45;cursor:not-allowed}
.btn.sm{height:26px;padding:0 9px;font-size:11px}
.btn.retry{background:var(--wn);border-color:var(--wn);color:#fff;font-weight:500}
.btn.retry[hidden]{display:none}
.flt{padding:10px 12px;border-bottom:1px solid var(--bd);background:var(--bg2);
  display:flex;gap:10px;flex-wrap:wrap;align-items:center;flex-shrink:0}
.flt[hidden]{display:none}
.fld{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--tx2)}
.fld input[type=number],.fld input[type=text]{
  width:68px;height:26px;padding:0 7px;border:1px solid var(--bd);border-radius:6px;
  background:var(--bg);color:var(--tx);font:inherit;font-size:12px;outline:none;
}
.fld input:focus{border-color:var(--ac)}
.cb{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--tx2);cursor:pointer;
  -webkit-user-select:none;user-select:none}
.cb input{accent-color:var(--ac);cursor:pointer;width:14px;height:14px}
.prog{height:2px;background:transparent;flex-shrink:0;overflow:hidden}
.prog i{display:block;height:100%;width:0;background:var(--ac);transition:width .25s}
.prog.off{opacity:0}
.bd{flex:1;overflow-y:auto;overflow-x:hidden;padding:12px;background:var(--bg2)}
.bd::-webkit-scrollbar{width:9px}
.bd::-webkit-scrollbar-thumb{background:var(--bd2);border-radius:5px;border:2px solid var(--bg2)}
.gh{font-size:11px;font-weight:600;color:var(--tx3);text-transform:uppercase;
  letter-spacing:.05em;margin:14px 2px 8px;display:flex;align-items:center;gap:7px}
.gh:first-child{margin-top:0}
.gh::after{content:'';flex:1;height:1px;background:var(--bd)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:9px}
.card{background:var(--bg);border:1px solid var(--bd);border-radius:10px;
  overflow:hidden;cursor:pointer;position:relative;transition:.13s;
  -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
.card:hover{border-color:var(--ac);transform:translateY(-1px);box-shadow:var(--sh)}
.card.sel{border-color:var(--ac);box-shadow:0 0 0 2px var(--ac2)}
.th{width:100%;height:92px;object-fit:contain;background:var(--bg3);display:block}
.ico{width:100%;height:92px;display:flex;flex-direction:column;align-items:center;
  justify-content:center;background:var(--bg3);font-size:24px;gap:3px}
.ico b{font-size:10px;font-weight:500;color:var(--tx3);letter-spacing:.03em}
.meta{padding:6px 8px}
.nm{font-size:11px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dm{font-size:10px;color:var(--tx3);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chk{position:absolute;top:6px;left:6px;width:17px;height:17px;accent-color:var(--ac);
  cursor:pointer;z-index:2;opacity:0;transition:opacity .12s}
.card:hover .chk,.card.sel .chk{opacity:1}
.acts{position:absolute;top:5px;right:5px;display:flex;gap:3px;opacity:0;transition:.12s}
.card:hover .acts{opacity:1}
.mini{width:23px;height:23px;display:grid;place-items:center;border:none;border-radius:5px;
  background:rgba(20,20,22,.72);color:#fff;cursor:pointer;font-size:11px}
.mini:hover{background:rgba(20,20,22,.92)}
.tag{position:absolute;bottom:5px;left:5px;font-size:9px;font-weight:600;
  padding:1px 5px;border-radius:4px;color:#fff;letter-spacing:.02em}
.tag.lz{background:var(--wn)}
.tag.dp{background:var(--er)}
.tag.bad{background:var(--er)}
.empty{text-align:center;color:var(--tx3);padding:56px 20px;font-size:13px}
.empty b{display:block;font-size:28px;margin-bottom:8px;opacity:.5}
.empty p{margin-top:6px;font-size:11px;opacity:.8}
.ft{display:flex;align-items:center;gap:7px;padding:9px 12px;border-top:1px solid var(--bd);
  background:var(--bg);flex-shrink:0;flex-wrap:wrap}
.sel{font-size:12px;color:var(--tx2)}
.sel b{color:var(--tx);font-weight:600}
.st{padding:6px 12px;font-size:11px;color:var(--tx2);border-top:1px solid var(--bd);
  background:var(--bg);display:flex;gap:8px;align-items:center;flex-shrink:0;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.st .sp{margin-left:auto;color:var(--tx3);font-variant-numeric:tabular-nums;flex-shrink:0}
.rsz{position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;
  touch-action:none;z-index:7}
.rsz::after{content:'';position:absolute;right:3px;bottom:3px;width:8px;height:8px;
  border-right:2px solid var(--bd2);border-bottom:2px solid var(--bd2)}
.panel.max .rsz{display:none}
.dw{position:absolute;top:0;right:0;bottom:0;width:272px;background:var(--bg);
  border-left:1px solid var(--bd);padding:14px;overflow-y:auto;z-index:8;
  transform:translateX(100%);transition:transform .2s;box-shadow:var(--sh2)}
.dw.open{transform:none}
.dw h3{font-size:12px;font-weight:600;margin-bottom:12px;display:flex;align-items:center}
.dw h3 .ib{margin-left:auto}
.row{margin-bottom:13px}
.row>label{display:block;font-size:11px;color:var(--tx2);margin-bottom:5px}
.row .v{float:right;color:var(--tx);font-weight:600;font-variant-numeric:tabular-nums}
.row input[type=range]{width:100%;accent-color:var(--ac);cursor:pointer}
.hint{font-size:10px;color:var(--tx3);margin-top:4px;line-height:1.5}
.sw{display:flex;align-items:center;justify-content:space-between;padding:6px 0;
  font-size:12px;color:var(--tx);border-bottom:1px solid var(--bd);gap:8px}
.sw:last-child{border-bottom:none}
.sw input{accent-color:var(--ac);cursor:pointer;width:15px;height:15px;flex-shrink:0}
.pv{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.9);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px}
.pv img{max-width:92vw;max-height:78vh;object-fit:contain;transition:transform .15s}
.pv .cap{color:#ddd;font-size:12px;text-align:center;max-width:88vw;
  word-break:break-all;display:flex;gap:12px;align-items:center;flex-wrap:wrap;justify-content:center}
.pv .cap span{opacity:.75}
.pv .btns{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.pv button{padding:8px 16px;border:none;border-radius:7px;background:#333;color:#fff;
  cursor:pointer;font:inherit;font-size:12px}
.pv button.pri{background:var(--ac)}
.pv .nav{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;
  display:grid;place-items:center;background:rgba(255,255,255,.12);color:#fff;
  border:none;border-radius:50%;cursor:pointer;font-size:20px}
.pv .nav:hover{background:rgba(255,255,255,.24)}
.pv .nav.l{left:12px}
.pv .nav.r{right:12px}
.hv{position:fixed;z-index:2147483645;background:var(--bg);border:1px solid var(--bd);
  border-radius:10px;box-shadow:var(--sh2);padding:5px;pointer-events:none;display:none}
.hv img{max-width:340px;max-height:340px;display:block;border-radius:6px}
@media (pointer:coarse){
  .ib{width:38px;height:38px;font-size:16px}
  .btn{height:38px;padding:0 15px;font-size:13px}
  .btn.sm{height:34px;padding:0 13px;font-size:12px}
  .sel2{height:34px;padding:0 10px;font-size:13px}
  .inp{height:34px}
  .mini{width:34px;height:34px;font-size:14px}
  .card .chk{opacity:1;width:22px;height:22px}
  .card .acts{opacity:1;gap:4px}
  .chk{width:22px;height:22px}
  .grid{grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:10px}
  .th,.ico{height:108px}
  .seg button{padding:6px 12px;font-size:13px}
  .rsz{width:34px;height:34px}
  .hd{height:52px}
  .sw{padding:10px 0}
  .dw{width:min(300px,86vw)}
  .row input[type=range]{height:26px}
  .pv button{padding:11px 20px}
}
`;

  const ICON = {
    lens: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M11 8v6M8 11h6"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  };

  const ui = {};

  function buildUI() {
    const host = document.createElement('div');
    host.setAttribute(SELF_MARK, '1');
    host.style.cssText = 'all:initial';
    const sh = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = CSS;
    sh.appendChild(style);

    const root = document.createElement('div');
    root.className = 'snf';
    root.innerHTML = `
      <button class="fab" data-fab title="SiteAssetDL · 可拖动，点击打开 (Alt+S)">
        ${ICON.lens}<span>嗅探</span><span class="n" hidden>0</span>
      </button>

      <div class="panel">
        <div class="hd" data-hd>
          <h1>${ICON.lens}<span>SiteAssetDL</span></h1>
          <span class="stats" data-r="stats"></span>
          <span class="grow"></span>
          <button class="ib" data-a="rescan" title="重新采集">⟳</button>
          <button class="ib" data-a="theme" title="切换主题">◐</button>
          <button class="ib" data-a="max" title="最大化 / 还原">⤢</button>
          <button class="ib" data-a="set" title="设置">⚙</button>
          <button class="ib" data-a="min" title="收起">−</button>
        </div>

        <div class="bar">
          <div class="seg" data-r="tabs">
            <button class="on" data-t="all">全部<i>0</i></button>
            <button data-t="image">图片<i>0</i></button>
            <button data-t="video">视频<i>0</i></button>
            <button data-t="audio">音频<i>0</i></button>
            <button data-t="font">字体<i>0</i></button>
            <button data-t="subtitle">字幕<i>0</i></button>
          </div>
          <label class="inp w1">${ICON.search}<input data-i="search" placeholder="搜索文件名或 URL…"></label>
          <select data-i="sort" class="sel2">
            <option value="smart">智能排序</option>
            <option value="sizeDesc">体积 大→小</option>
            <option value="sizeAsc">体积 小→大</option>
            <option value="newest">最新加载</option>
            <option value="name">文件名</option>
          </select>
          <select data-i="src" class="sel2">
            <option value="">全部来源</option>
            <option value="loaded">已加载</option>
            <option value="lazy">懒加载</option>
            <option value="css">CSS / 背景</option>
          </select>
          <button class="btn sm" data-a="flt">筛选</button>
          <span class="grow"></span>
          <button class="btn sm" data-a="probe" title="用 HEAD 请求补全真实体积与类型">探测大小</button>
          <button class="btn sm" data-a="deep">深度扫描</button>
          <button class="btn sm" data-a="stop" disabled>停止</button>
        </div>

        <div class="flt" data-r="flt" hidden>
          <label class="fld">宽 ≥<input type="number" data-i="minW" min="0" step="50" placeholder="0"></label>
          <label class="fld">体积 <input type="number" data-i="minSize" min="0" step="10" placeholder="0">~
            <input type="number" data-i="maxSize" min="0" step="100" placeholder="∞"> KB</label>
          <label class="fld">域名 <input type="text" data-i="domain" placeholder="如 cdn." style="width:96px"></label>
          <label class="fld">排除 <input type="text" data-i="exclude" placeholder="关键词,逗号分隔" style="width:110px"></label>
          <label class="cb"><input type="checkbox" data-c="lazy">仅懒加载</label>
          <button class="btn sm" data-a="dedupe" title="删除被标记为重复的资源">移除重复</button>
          <button class="btn sm" data-a="clr">清除</button>
        </div>

        <div class="prog off"><i></i></div>

        <div class="bd" data-r="body"><div class="grid" data-r="grid"></div></div>

        <div class="st" data-r="status"><span>就绪</span><span class="sp"></span></div>

        <div class="ft">
          <label class="cb"><input type="checkbox" data-c="all"><span class="sel" data-r="sel">已选 0 项</span></label>
          <select data-a="pick" class="sel2">
            <option value="">批量选择…</option>
            <option value="all">全选</option>
            <option value="none">全部取消</option>
            <option value="invert">反选</option>
            <option value="image">仅图片</option>
            <option value="big">仅大图 (≥1000px)</option>
            <option value="lazy">仅懒加载</option>
            <option value="dupe">仅重复项</option>
          </select>
          <span class="grow"></span>
          <select data-a="exp" class="sel2">
            <option value="">导出…</option>
            <option value="txt">URL 列表 (.txt)</option>
            <option value="aria2">aria2 输入文件</option>
            <option value="wget">wget 脚本</option>
            <option value="curl">curl 脚本</option>
            <option value="md">Markdown</option>
            <option value="csv">CSV 表格</option>
            <option value="json">JSON</option>
          </select>
          <button class="btn sm" data-a="copy">复制 URL</button>
          <button class="btn sm" data-a="copyName">复制文件名</button>
          <button class="btn sm" data-a="down">逐个下载</button>
          <button class="btn sm" data-a="folder" title="流式直写磁盘，支持超大文件">存到文件夹</button>
          <button class="btn sm pri" data-a="zip">打包 ZIP</button>
          <button class="btn sm retry" data-a="retry" hidden title="重试上一次失败的下载">重试失败 0</button>
        </div>

        <div class="rsz" data-rsz title="拖动调整大小"></div>

        <div class="dw" data-r="dw">
          <h3>设置 <button class="ib" data-a="dwclose">✕</button></h3>
          <div class="row">
            <label>下载并发数 <span class="v" data-r="vconc">6</span></label>
            <input type="range" data-s="concurrency" min="1" max="16" step="1">
            <div class="hint">并发越高越快，但可能被站点限流。连续失败会自动降速。</div>
          </div>
          <div class="row">
            <label>失败重试次数 <span class="v" data-r="vretry">2</span></label>
            <input type="range" data-s="retries" min="0" max="5" step="1">
          </div>
          <div class="row">
            <label>ZIP 压缩</label>
            <select data-s="zipMode" class="sel2" style="width:100%">
              <option value="auto">智能（推荐）</option>
              <option value="none">不压缩（最快）</option>
              <option value="all">全部压缩（最小）</option>
            </select>
            <div class="hint">图片 / 视频 / 音频本身已压缩，再压只会变慢。</div>
          </div>
          <div class="row">
            <label>分组显示</label>
            <select data-s="groupBy" class="sel2" style="width:100%">
              <option value="none">不分组</option>
              <option value="type">按类型</option>
              <option value="domain">按域名</option>
            </select>
          </div>
          <div class="row">
            <label>主题</label>
            <select data-s="theme" class="sel2" style="width:100%">
              <option value="auto">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </div>
          <div data-r="sw"></div>
        </div>
      </div>

      <div class="hv" data-hv><img alt=""></div>
    `;
    sh.appendChild(root);
    document.documentElement.appendChild(host);

    const q = s => sh.querySelector(s);
    const qa = s => Array.from(sh.querySelectorAll(s));

    ui.sh = sh;
    ui.host = host;
    ui.root = root;
    ui.fab = q('.fab');
    ui.badge = q('.fab .n');
    ui.panel = q('.panel');
    ui.grid = q('[data-r="grid"]');
    ui.body = q('[data-r="body"]');
    ui.status = q('[data-r="status"] span');
    ui.stats = q('[data-r="stats"]');
    ui.sel = q('[data-r="sel"]');
    ui.prog = q('.prog');
    ui.progBar = q('.prog i');
    ui.dw = q('[data-r="dw"]');
    ui.hover = q('[data-hv]');
    ui.hoverImg = q('[data-hv] img');
    ui.zipHandle = null;

    const prefersDark = () => {
      try {
        if (typeof matchMedia !== 'function') return false;
        return matchMedia('(prefers-color-scheme: dark)').matches;
      } catch { return false; }
    };
    ui.applyTheme = () => {
      const m = state.theme === 'auto' ? (prefersDark() ? 'dark' : 'light') : state.theme;
      root.classList.toggle('dark', m === 'dark');
    };
    ui.applyTheme();
    try {
      if (typeof matchMedia === 'function') {
        const mq = matchMedia('(prefers-color-scheme: dark)');
        if (mq.addEventListener) mq.addEventListener('change', () => {
          if (state.theme === 'auto') ui.applyTheme();
        });
      }
    } catch {}

    ui.setBusy = (busy, text, pct) => {
      if (text !== undefined) ui.status.textContent = text;
      ui.prog.classList.toggle('off', !busy);
      if (pct !== undefined) ui.progBar.style.width = pct + '%';
      if (!busy) ui.progBar.style.width = '0%';
      ui.syncScanBtn();
    };
    ui.syncScanBtn = () => {
      const b1 = q('[data-a="deep"]'), b2 = q('[data-a="stop"]');
      if (b1) b1.disabled = scan.running;
      if (b2) b2.disabled = !scan.running;
    };
    ui.syncRetryBtn = () => {
      const b = q('[data-a="retry"]');
      if (!b) return;
      if (lastFailures.length) {
        b.hidden = false;
        b.textContent = `重试失败 ${lastFailures.length}`;
      } else {
        b.hidden = true;
      }
    };

    ui.askSaveTarget = async name => {
      try {
        if (!window.showSaveFilePicker || !window.isSecureContext) return null;
        return await window.showSaveFilePicker({
          suggestedName: name,
          types: [{ description: 'ZIP 压缩包', accept: { 'application/zip': ['.zip'] } }],
        });
      } catch { return null; }
    };

    const SW = [
      ['scanBg', '扫描 CSS 背景图'],
      ['forceHydrate', '深度扫描时强制解冻'],
      ['autoScroll', '深度扫描时自动滚动'],
      ['followInfinite', '追踪无限滚动'],
      ['ignoreQuery', '去重时忽略 URL 参数'],
      ['hoverPreview', '悬停快速预览图片'],
      ['rememberPos', '记住窗口位置'],
      ['autoNotify', '任务完成后通知'],
    ];
    q('[data-r="sw"]').innerHTML = SW.map(([k, label]) =>
      `<label class="sw"><span>${label}</span><input type="checkbox" data-s2="${k}"></label>`).join('');

    const syncSettings = () => {
      qa('[data-s]').forEach(el => { el.value = state[el.dataset.s]; });
      qa('[data-s2]').forEach(el => { el.checked = !!state[el.dataset.s2]; });
      q('[data-r="vconc"]').textContent = state.concurrency;
      q('[data-r="vretry"]').textContent = state.retries;
    };
    syncSettings();

    root.addEventListener('input', e => {
      const k = e.target.dataset.s;
      if (k) {
        state[k] = (e.target.type === 'range') ? +e.target.value : e.target.value;
        saveState();
        syncSettings();
        if (k === 'theme' || k === 'groupBy') { ui.applyTheme(); renderList(); }
      }
      const k2 = e.target.dataset.s2;
      if (k2) { state[k2] = e.target.checked; saveState(); renderList(); }

      const i = e.target.dataset.i;
      if (i) {
        if (i === 'search') view.search = e.target.value;
        if (i === 'minW') view.minW = +e.target.value || 0;
        if (i === 'minSize') view.minSize = (+e.target.value || 0) * 1024;
        if (i === 'maxSize') view.maxSize = (+e.target.value || 0) * 1024;
        if (i === 'domain') view.domain = e.target.value.trim();
        if (i === 'exclude') view.exclude = e.target.value;
        renderList();
      }
    });
    root.addEventListener('change', e => {
      const i = e.target.dataset.i;
      if (i === 'sort') { view.sort = e.target.value; renderList(); }
      if (i === 'src') { view.source = e.target.value; renderList(); }
      const c = e.target.dataset.c;
      if (c === 'lazy') { view.onlyLazy = e.target.checked; renderList(); }
      if (c === 'all') {
        const items = getFiltered();
        items.forEach(x => { x.selected = e.target.checked; });
        renderList();
      }
      const pick = e.target.dataset.a;
      if (pick === 'pick' && e.target.value) {
        applyBulkSelect(e.target.value);
        e.target.value = '';
      }
    });

    function applyBulkSelect(mode) {
      const items = getFiltered();
      const byMode = {
        all: () => items.forEach(i => { i.selected = true; }),
        none: () => items.forEach(i => { i.selected = false; }),
        invert: () => items.forEach(i => { i.selected = !i.selected; }),
        image: () => items.forEach(i => { i.selected = i.type === 'image'; }),
        big: () => items.forEach(i => { i.selected = i.type === 'image' && (i.w || 0) >= 1000; }),
        lazy: () => items.forEach(i => { i.selected = !!i.lazy; }),
        dupe: () => { markDuplicates(items); items.forEach(i => { i.selected = !!i.dupe; }); },
      };
      if (byMode[mode]) byMode[mode]();
      renderList();
      ui.setBusy(false, `已选择 ${items.filter(i => i.selected).length} 项`);
    }

    ui.toggle = (force) => {
      const open = force !== undefined ? force : !ui.panel.classList.contains('open');
      ui.panel.classList.toggle('open', open);
      ui.fab.style.display = open ? 'none' : 'flex';
      if (open) {
        collectFromPerformance();
        renderList();
        restorePos();
      }
    };
    ui.fab.addEventListener('click', e => {
      if (ui.fab.dataset.justDragged === '1') { e.preventDefault(); return; }
      ui.toggle(true);
    });
    q('[data-a="min"]').addEventListener('click', () => ui.toggle(false));

    const hdEl = q('[data-hd]');
    hdEl.addEventListener('click', e => {
      const a = e.target.closest('[data-a]');
      if (!a) return;
      if (hdEl.dataset.justDragged === '1') return;
      const act = a.dataset.a;
      if (act === 'rescan') { collectAll(true); renderList(); ui.setBusy(false, '已重新采集'); }
      if (act === 'theme') {
        state.theme = state.theme === 'auto' ? 'light' : (state.theme === 'light' ? 'dark' : 'auto');
        saveState(); syncSettings(); ui.applyTheme();
        ui.setBusy(false, '主题：' + ({ auto: '跟随系统', light: '浅色', dark: '深色' })[state.theme]);
      }
      if (act === 'max') {
        const maxed = ui.panel.classList.toggle('max');
        a.classList.toggle('on', maxed);
        if (!maxed) restorePos();
      }
      if (act === 'set') ui.dw.classList.toggle('open');
    });

    ui.dw.addEventListener('click', e => {
      if (e.target.closest('[data-a="dwclose"]')) ui.dw.classList.remove('open');
    });

    q('[data-r="tabs"]').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      qa('[data-r="tabs"] button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      view.filterType = b.dataset.t;
      renderList();
    });

    q('.bar').addEventListener('click', e => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const a = b.dataset.a;
      if (a === 'flt') { const f = q('[data-r="flt"]'); f.hidden = !f.hidden; b.classList.toggle('on', !f.hidden); }
      if (a === 'deep') deepScan();
      if (a === 'stop') abortScan();
      if (a === 'probe') {
        const sel = getFiltered().filter(i => i.selected);
        probeAll(sel.length ? sel : getFiltered());
      }
    });

    q('[data-r="flt"]').addEventListener('click', e => {
      const a = e.target.dataset.a;
      if (a === 'clr') {
        Object.assign(view, { minW: 0, minSize: 0, maxSize: 0, domain: '', exclude: '', onlyLazy: false });
        qa('[data-r="flt"] input').forEach(el => {
          if (el.type === 'checkbox') el.checked = false; else el.value = '';
        });
        renderList();
      }
      if (a === 'dedupe') removeDuplicates();
    });

    q('.ft').addEventListener('click', async e => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const a = b.dataset.a;
      const sel = getFiltered().filter(i => i.selected);
      const list = sel.length ? sel : getFiltered();

      if (a === 'retry') {
        const retryList = lastFailures.map(f => f.item);
        lastFailures.length = 0;
        ui.syncRetryBtn();
        if (!retryList.length) return;
        await downloadZip(retryList);
        return;
      }
      if (a !== 'exp' && !list.length) return;

      if (a === 'zip') {
        if (list.length > 400 && !confirm(`将下载并打包 ${list.length} 个文件，耗时可能较久。继续？`)) return;
        await downloadZip(list);
      }
      if (a === 'folder') await saveToFolder(list);
      if (a === 'down') {
        if (list.length > 20 && !confirm(`将触发 ${list.length} 次下载，浏览器可能提示"允许多文件下载"。继续？`)) return;
        const t0 = Date.now();
        lastFailures.length = 0;
        ui.setBusy(true, `逐个下载 0/${list.length}`);
        const r = await runQueue(list, it => downloadSingle(it), {
          concurrency: Math.min(3, state.concurrency),
          retries: state.retries,
          shouldStop: () => scan.aborted,
          onProgress: ({ done, total }) => ui.setBusy(true, `逐个下载 ${done}/${total}`, (done / total) * 100),
        });
        r.failures.forEach(f => {
          lastFailures.push({ item: f.item, error: f.error });
          failedKeys.add(f.item.key);
        });
        ui.syncRetryBtn();
        renderList();
        ui.setBusy(false, `已触发 ${list.length} 个下载（${((Date.now() - t0) / 1000).toFixed(1)}s）`);
      }
      if (a === 'copy') {
        const txt = list.map(i => i.url).join('\n');
        if (typeof GM_setClipboard === 'function') GM_setClipboard(txt, 'text');
        else navigator.clipboard?.writeText(txt);
        ui.setBusy(false, `已复制 ${list.length} 条 URL 到剪贴板`);
      }
      if (a === 'copyName') {
        const txt = list.map(i => i.name).join('\n');
        if (typeof GM_setClipboard === 'function') GM_setClipboard(txt, 'text');
        else navigator.clipboard?.writeText(txt);
        ui.setBusy(false, `已复制 ${list.length} 个文件名`);
      }
    });

    q('.ft').addEventListener('change', async e => {
      if (e.target.dataset.a !== 'exp') return;
      const fmt = e.target.value;
      e.target.value = '';
      if (!fmt) return;
      const sel = getFiltered().filter(i => i.selected);
      const list = sel.length ? sel : getFiltered();
      if (!list.length) return;
      const ext = EXPORT_EXT[fmt] || 'txt';
      const stamp = new Date().toISOString().slice(0, 10);
      const mime = fmt === 'json' ? 'application/json' :
                   fmt === 'csv' ? 'text/csv' : 'text/plain';
      const blob = new Blob([exportAs(list, fmt)], { type: mime + ';charset=utf-8' });
      triggerDownload(blob, `${safeName(document.title) || 'resources'}_${stamp}.${ext}`);
      ui.setBusy(false, `已导出 ${list.length} 条（${fmt}）`);
    });

    setupFabDrag();
    setupPanelDrag();
    setupResize();
    bindScroll();
  }

  function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

  function startDrag(handle, onStart, onMove, onEnd) {
    handle.addEventListener(EV_DOWN, e => {
      if (e.button !== undefined && e.button !== 0 && e.button !== null) return;
      if (e.target.closest('button:not([data-fab]), input, select, a')) return;

      const startX = e.clientX;
      const startY = e.clientY;
      let moved = false;
      let ctx = null;

      try { handle.setPointerCapture && handle.setPointerCapture(e.pointerId); } catch {}

      const move = ev => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        if (!moved) {
          moved = true;
          handle.classList.add('dragging');
          ctx = onStart(startX, startY) || {};
        }
        onMove(dx, dy, ctx, ev);
      };
      const up = ev => {
        document.removeEventListener(EV_MOVE, move);
        document.removeEventListener(EV_UP, up);
        document.removeEventListener('pointercancel', up);
        try { handle.releasePointerCapture && handle.releasePointerCapture(e.pointerId); } catch {}
        handle.classList.remove('dragging');
        if (moved) {
          onEnd(ctx);
          setTimeout(() => { handle.dataset.justDragged = ''; }, 0);
          handle.dataset.justDragged = '1';
        } else {
          handle.dataset.justDragged = '';
        }
      };

      document.addEventListener(EV_MOVE, move);
      document.addEventListener(EV_UP, up);
      document.addEventListener('pointercancel', up);
    });
  }

  function setupFabDrag() {
    const fab = ui.fab;

    const saved = (() => {
      try { return GM_getValue(STORE_PREFIX + 'fabPos', ''); } catch { return ''; }
    })();
    if (saved && saved.includes('|')) {
      const [l, t] = saved.split('|');
      if (l && t && l !== 'auto') {
        fab.style.left = l;
        fab.style.top = t;
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
      }
    }

    const snap = () => {
      const r = fab.getBoundingClientRect();
      const margin = 14;
      const centerX = r.left + r.width / 2;
      const toRight = centerX > window.innerWidth / 2;
      const left = toRight ? (window.innerWidth - r.width - margin) : margin;
      const top = clamp(r.top, margin, Math.max(margin, window.innerHeight - r.height - margin));
      fab.style.left = left + 'px';
      fab.style.top = top + 'px';
      fab.style.right = 'auto';
      fab.style.bottom = 'auto';
      if (state.rememberPos) {
        try { GM_setValue(STORE_PREFIX + 'fabPos', left + 'px|' + top + 'px'); } catch {}
      }
    };

    let originLeft = 0, originTop = 0;

    startDrag(fab,
      () => {
        const r = fab.getBoundingClientRect();
        const sl = parseFloat(fab.style.left);
        const st = parseFloat(fab.style.top);
        originLeft = isFinite(sl) ? sl : r.left;
        originTop = isFinite(st) ? st : r.top;
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
        fab.style.left = originLeft + 'px';
        fab.style.top = originTop + 'px';
        return { originLeft, originTop };
      },
      (dx, dy) => {
        const left = clamp(originLeft + dx, 0, Math.max(0, window.innerWidth - 40));
        const top = clamp(originTop + dy, 0, Math.max(0, window.innerHeight - 40));
        fab.style.left = left + 'px';
        fab.style.top = top + 'px';
      },
      () => { snap(); }
    );

  }

  function setupPanelDrag() {
    const hd = ui.sh.querySelector('[data-hd]');
    const panel = ui.panel;

    startDrag(hd,
      () => {
        const r = panel.getBoundingClientRect();
        const sl = parseFloat(panel.style.left);
        const st = parseFloat(panel.style.top);
        const left = isFinite(sl) ? sl : r.left;
        const top = isFinite(st) ? st : r.top;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
        return { left, top };
      },
      (dx, dy, ctx) => {
        const w = panel.offsetWidth;
        const left = clamp(ctx.left + dx, -(w - 140), Math.max(0, window.innerWidth - 140));
        const top = clamp(ctx.top + dy, 0, Math.max(0, window.innerHeight - 52));
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
      },
      () => {
        if (panel.classList.contains('max')) return;
        if (state.rememberPos) {
          try {
            GM_setValue(STORE_PREFIX + 'pos', panel.style.left + '|' + panel.style.top);
          } catch {}
        }
      }
    );
  }

  function restorePos() {
    if (!state.rememberPos) return;
    try {
      const p = GM_getValue(STORE_PREFIX + 'pos', '');
      if (!p || !p.includes('|')) return;
      const [l, t] = p.split('|');
      if (!l || !t || l === 'auto') return;
      ui.panel.style.right = 'auto';
      ui.panel.style.bottom = 'auto';
      ui.panel.style.left = l;
      ui.panel.style.top = t;
    } catch {}
  }

  function setupResize() {
    const h = ui.sh.querySelector('[data-rsz]');
    const panel = ui.panel;
    let sw = 0, sh = 0, sx = 0, sy = 0;

    startDrag(h,
      () => {
        const r = panel.getBoundingClientRect();
        const pl = parseFloat(panel.style.left);
        const pt = parseFloat(panel.style.top);
        sw = parseFloat(panel.style.width) || panel.offsetWidth || r.width || 900;
        sh = parseFloat(panel.style.height) || panel.offsetHeight || r.height || 660;
        sx = isFinite(pl) ? pl : r.left;
        sy = isFinite(pt) ? pt : r.top;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left = sx + 'px';
        panel.style.top = sy + 'px';
        return {};
      },
      (dx, dy) => {
        const w = clamp(sw + dx, 330, window.innerWidth - 20);
        const hh = clamp(sh + dy, 280, window.innerHeight - 20);
        panel.style.width = w + 'px';
        panel.style.height = hh + 'px';
      },
      () => {
        if (state.rememberPos) {
          try {
            GM_setValue(STORE_PREFIX + 'size', panel.style.width + '|' + panel.style.height);
            GM_setValue(STORE_PREFIX + 'pos', panel.style.left + '|' + panel.style.top);
          } catch {}
        }
      }
    );

    try {
      const s = GM_getValue(STORE_PREFIX + 'size', '');
      if (s && s.includes('|')) {
        const [w, hh] = s.split('|');
        if (w && hh) { panel.style.width = w; panel.style.height = hh; }
      }
    } catch {}
  }

  window.addEventListener('resize', () => {
    if (!ui.panel) return;
    const w = ui.panel.offsetWidth || 900;
    const h = ui.panel.offsetHeight || 660;
    const left = parseFloat(ui.panel.style.left || '') || 0;
    const top = parseFloat(ui.panel.style.top || '') || 0;
    if (ui.panel.classList.contains('open') && !ui.panel.classList.contains('max')) {
      ui.panel.style.left = clamp(left, -(w - 140), Math.max(0, window.innerWidth - 140)) + 'px';
      ui.panel.style.top = clamp(top, 0, Math.max(0, window.innerHeight - 52)) + 'px';
    }
  });

  function bindScroll() {
    if (!ui.body) return;
    ui.body.addEventListener('scroll', () => {
      if (ui.body.scrollTop + ui.body.clientHeight >= ui.body.scrollHeight - 250) renderChunk();
    });
  }

  let renderRows = [], rendered = 0;

  function renderList() {
    if (!ui.root || !ui.panel.classList.contains('open')) { bumpBadge(); return; }

    const items = getFiltered();
    markDuplicates(items);

    const total = store.items.size;
    ui.badge.textContent = total > 999 ? '999+' : String(total);
    ui.badge.hidden = !total;

    const counts = {};
    let totalBytes = 0;
    for (const i of store.items.values()) {
      counts[i.type] = (counts[i.type] || 0) + 1;
      totalBytes += i.size || 0;
    }
    ui.stats.textContent = totalBytes
      ? `${total} 项 · ${fmtSize(totalBytes)}`
      : `${total} 项`;

    ui.sh.querySelectorAll('[data-r="tabs"] button').forEach(b => {
      const t = b.dataset.t;
      b.querySelector('i').textContent = t === 'all' ? total : (counts[t] || 0);
    });

    const selN = items.filter(i => i.selected).length;
    const selBytes = items.filter(i => i.selected).reduce((n, i) => n + (i.size || 0), 0);
    ui.sel.innerHTML = `已选 <b>${selN}</b> / ${items.length} 项` +
      (selBytes ? ` · <b>${fmtSize(selBytes)}</b>` : '');
    const allCb = ui.sh.querySelector('[data-c="all"]');
    if (allCb) allCb.checked = selN > 0 && selN === items.length;

    renderRows = [];
    for (const g of buildGroups(items)) {
      if (g.title) renderRows.push({ kind: 'h', title: g.title, count: g.items.length });
      for (const it of g.items) renderRows.push({ kind: 'i', item: it });
    }

    ui.grid.innerHTML = '';
    rendered = 0;

    if (!items.length) {
      ui.grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
        <b>🗂</b>没有匹配的资源
        <p>试试「深度扫描」触发懒加载，或放宽筛选条件</p></div>`;
      return;
    }
    renderChunk();
  }

  function renderChunk() {
    if (rendered >= renderRows.length) return;
    const frag = document.createDocumentFragment();
    const end = Math.min(rendered + 60, renderRows.length);
    for (let i = rendered; i < end; i++) {
      const row = renderRows[i];
      if (row.kind === 'h') {
        const h = document.createElement('div');
        h.className = 'gh';
        h.style.gridColumn = '1/-1';
        h.innerHTML = `${escapeHtml(row.title)} <span style="opacity:.6;font-weight:400">${row.count}</span>`;
        frag.appendChild(h);
      } else {
        frag.appendChild(buildCard(row.item));
      }
    }
    ui.grid.appendChild(frag);
    rendered = end;
  }

  function buildCard(item) {
    const card = document.createElement('div');
    card.className = 'card' + (item.selected ? ' sel' : '');
    card.title = item.url + (item.alt ? `\n\n${item.alt}` : '');

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'chk';
    chk.checked = item.selected;
    chk.addEventListener('click', e => e.stopPropagation());
    chk.addEventListener('change', () => {
      item.selected = chk.checked;
      card.classList.toggle('sel', chk.checked);
      updateSelText();
    });
    card.appendChild(chk);

    if (item.type === 'image') {
      const img = document.createElement('img');
      img.className = 'th';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = item.url;
      img.addEventListener('error', () => {
        const d = document.createElement('div');
        d.className = 'ico';
        d.innerHTML = '<div>🖼</div><b>加载失败</b>';
        img.replaceWith(d);
      });
      card.appendChild(img);
    } else {
      const d = document.createElement('div');
      d.className = 'ico';
      d.innerHTML = `<div>${TYPE_META[item.type].icon}</div><b>${escapeHtml((item.ext || item.type).toUpperCase())}</b>`;
      card.appendChild(d);
    }

    const acts = document.createElement('div');
    acts.className = 'acts';
    acts.innerHTML =
      `<button class="mini" title="下载" data-x="dl">↓</button>
       <button class="mini" title="复制链接" data-x="cp">⧉</button>
       <button class="mini" title="在页面中定位" data-x="loc">◎</button>
       <button class="mini" title="新标签打开" data-x="op">↗</button>`;
    acts.addEventListener('click', e => {
      e.stopPropagation();
      const b = e.target.closest('[data-x]');
      if (!b) return;
      if (b.dataset.x === 'dl') downloadSingle(item);
      if (b.dataset.x === 'op') window.open(item.url, '_blank');
      if (b.dataset.x === 'loc') locateItem(item);
      if (b.dataset.x === 'cp') {
        if (typeof GM_setClipboard === 'function') GM_setClipboard(item.url, 'text');
        else navigator.clipboard?.writeText(item.url);
        ui.setBusy(false, '已复制：' + item.name);
      }
    });
    card.appendChild(acts);

    const badge = failedKeys.has(item.key) ? '<span class="tag bad">失败</span>'
      : item.dupe ? '<span class="tag dp">重复</span>'
      : item.lazy ? '<span class="tag lz">懒加载</span>' : '';
    if (badge) card.insertAdjacentHTML('beforeend', badge);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const dim = item.w ? `${item.w}×${item.h}` : TYPE_META[item.type].label;
    meta.innerHTML =
      `<div class="nm">${escapeHtml(item.name)}</div>
       <div class="dm">${dim}${item.size ? ' · ' + fmtSize(item.size) : ''}</div>`;
    card.appendChild(meta);

    card.addEventListener('click', () => {
      item.selected = !item.selected;
      chk.checked = item.selected;
      card.classList.toggle('sel', item.selected);
      updateSelText();
    });

    if (item.type === 'image') {
      card.addEventListener('dblclick', () => openPreview(item));
      if (state.hoverPreview && !isCoarsePointer) {
        card.addEventListener('mouseenter', e => showHover(item, e));
        card.addEventListener('mousemove', e => moveHover(e));
        card.addEventListener('mouseleave', hideHover);
      }
      if (isCoarsePointer) {
        let lt = null;
        card.addEventListener('touchstart', () => {
          lt = setTimeout(() => { lt = null; openPreview(item); }, 550);
        }, { passive: true });
        const cancel = () => { if (lt) { clearTimeout(lt); lt = null; } };
        card.addEventListener('touchend', cancel);
        card.addEventListener('touchmove', cancel, { passive: true });
        card.addEventListener('touchcancel', cancel);
      }
    }
    return card;
  }

  function showHover(item, e) {
    if (!ui.hover) return;
    ui.hoverImg.src = item.url;
    ui.hover.style.display = 'block';
    moveHover(e);
  }
  function moveHover(e) {
    if (!ui.hover || ui.hover.style.display !== 'block') return;
    const pad = 14;
    const w = 352, h = 352;
    let left = e.clientX + 18;
    let top = e.clientY + 18;
    if (left + w > window.innerWidth - pad) left = e.clientX - w - 18;
    if (top + h > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - h - pad);
    ui.hover.style.left = Math.max(pad, left) + 'px';
    ui.hover.style.top = Math.max(pad, top) + 'px';
  }
  function hideHover() {
    if (ui.hover) { ui.hover.style.display = 'none'; ui.hoverImg.removeAttribute('src'); }
  }

  function updateSelText() {
    const items = getFiltered();
    const n = items.filter(i => i.selected).length;
    const b = items.filter(i => i.selected).reduce((s, i) => s + (i.size || 0), 0);
    ui.sel.innerHTML = `已选 <b>${n}</b> / ${items.length} 项` + (b ? ` · <b>${fmtSize(b)}</b>` : '');
    const cb = ui.sh.querySelector('[data-c="all"]');
    if (cb) cb.checked = n > 0 && n === items.length;
  }

  function removeDuplicates() {
    const items = getFiltered();
    markDuplicates(items);
    let n = 0;
    for (const it of items) {
      if (it.dupe) {
        store.items.delete(it.key);
        n++;
      }
    }
    renderList();
    ui.setBusy(false, n ? `已移除 ${n} 个重复项` : '没有发现重复项');
  }

  function bumpBadge() {
    if (!ui.badge) return;
    const n = store.items.size;
    ui.badge.textContent = n > 999 ? '999+' : String(n);
    ui.badge.hidden = !n;
  }

  let pvIndex = -1, pvList = [], pvZoom = 1;

  function openPreview(item) {
    hideHover();
    pvList = getFiltered().filter(i => i.type === 'image');
    pvIndex = pvList.findIndex(i => i.key === item.key);
    if (pvIndex < 0) { pvList = [item]; pvIndex = 0; }
    pvZoom = 1;
    drawPreview();
  }

  function drawPreview() {
    let ov = ui.sh.querySelector('.pv');
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'pv';
      ov.setAttribute(SELF_MARK, '1');
      ui.sh.appendChild(ov);
    }
    const it = pvList[pvIndex];
    if (!it) { closePreview(); return; }

    ov.innerHTML = `
      ${pvList.length > 1 ? '<button class="nav l" data-p="prev">‹</button>' : ''}
      <img src="${escapeHtml(it.url)}" style="transform:scale(${pvZoom})">
      <div class="cap">
        <span>${it.w ? it.w + '×' + it.h : ''}</span>
        <span>${it.size ? fmtSize(it.size) : ''}</span>
        <span>${escapeHtml(it.name)}</span>
        ${pvList.length > 1 ? `<span>${pvIndex + 1}/${pvList.length}</span>` : ''}
      </div>
      <div class="btns">
        <button data-p="zout">缩小</button>
        <button data-p="zin">放大</button>
        <button data-p="reset">1:1</button>
        <button data-p="loc">页面中定位</button>
        <button class="pri" data-p="dl">下载</button>
        <button data-p="close">关闭</button>
      </div>
      ${pvList.length > 1 ? '<button class="nav r" data-p="next">›</button>' : ''}
    `;
    ov.onclick = e => {
      const b = e.target.closest('[data-p]');
      if (e.target === ov) { closePreview(); return; }
      if (!b) return;
      const p = b.dataset.p;
      if (p === 'close') closePreview();
      if (p === 'prev') { pvIndex = (pvIndex - 1 + pvList.length) % pvList.length; pvZoom = 1; drawPreview(); }
      if (p === 'next') { pvIndex = (pvIndex + 1) % pvList.length; pvZoom = 1; drawPreview(); }
      if (p === 'zin') { pvZoom = Math.min(pvZoom * 1.25, 6); redrawZoom(); }
      if (p === 'zout') { pvZoom = Math.max(pvZoom / 1.25, 0.15); redrawZoom(); }
      if (p === 'reset') { pvZoom = 1; redrawZoom(); }
      if (p === 'dl') downloadSingle(pvList[pvIndex]);
      if (p === 'loc') locateItem(pvList[pvIndex]);
    };
  }
  function redrawZoom() {
    const img = ui.sh.querySelector('.pv img');
    if (img) img.style.transform = `scale(${pvZoom})`;
  }
  function closePreview() {
    const ov = ui.sh.querySelector('.pv');
    if (ov) ov.remove();
  }

  function setupKeys() {
    document.addEventListener('keydown', e => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        ui.toggle();
        return;
      }
      const open = ui.panel.classList.contains('open');
      if (e.key === 'Escape') {
        if (ui.sh.querySelector('.pv')) closePreview();
        else if (open) ui.toggle(false);
        return;
      }
      if (!open) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        const items = getFiltered();
        const allOn = items.length && items.every(i => i.selected);
        items.forEach(i => { i.selected = !allOn; });
        renderList();
      }
      if (ui.sh.querySelector('.pv')) {
        if (e.key === 'ArrowLeft' && pvList.length > 1) {
          pvIndex = (pvIndex - 1 + pvList.length) % pvList.length; pvZoom = 1; drawPreview();
        }
        if (e.key === 'ArrowRight' && pvList.length > 1) {
          pvIndex = (pvIndex + 1) % pvList.length; pvZoom = 1; drawPreview();
        }
      }
    });
  }

  function boot() {
    loadState();
    boostPerfBuffer();
    collectAll(false);

    if (document.body) buildUI();
    else document.addEventListener('DOMContentLoaded', buildUI, { once: true });

    setupMutationObserver();
    setupKeys();

    setTimeout(() => {
      if (state.scanBg) collectBackgroundImages();
      document.querySelectorAll('img').forEach(img => {
        if (!img.naturalWidth) return;
        const it = store.items.get(dedupKey(img.currentSrc || img.src || '', state.ignoreQuery));
        if (it && !it.w) { it.w = img.naturalWidth; it.h = img.naturalHeight; }
      });
      if (ui.root) renderList();
      bumpBadge();
    }, 1200);

    window.addEventListener('load', () => {
      setTimeout(() => { collectAll(true); if (ui.root) renderList(); bumpBadge(); }, 800);
    });

    let lastUrl = location.href, routeTimer = null;
    const onRouteChange = () => {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      store.items.clear();
      store.seq = 0;
      try { perfBaseline = performance.now(); } catch { perfBaseline = 0; }
      setTimeout(() => { collectAll(false); if (ui.root) renderList(); bumpBadge(); }, 600);
    };
    window.addEventListener('urlchange', onRouteChange);
    window.addEventListener('popstate', onRouteChange);
    window.addEventListener('hashchange', onRouteChange);

    const schedule = () => { clearTimeout(routeTimer); routeTimer = setTimeout(onRouteChange, 500); };
    for (const m of ['pushState', 'replaceState']) {
      const orig = history[m];
      if (typeof orig !== 'function' || orig.__snifferPatched) continue;
      const f = function (...args) {
        const r = orig.apply(this, args);
        schedule();
        return r;
      };
      f.__snifferPatched = true;
      try { history[m] = f; } catch {}
    }

    const exp = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
    try {
      exp.__snifferPro = {
        store, state, view, deepScan, abortScan, collectAll, getFiltered,
        buildZip, runQueue, exportAs, forceHydrate, restoreHydrate,
        downloadZip, saveToFolder, sortItems, markDuplicates, shouldCompress,
        removeDuplicates, locateItem, findElementByUrl, exportAs2: exportAs,
        ui,
      };
    } catch {}

    console.log(`[SiteAssetDL] 就绪，收录 ${store.items.size} 项 · Alt+S 打开`);
  }

  if (document.documentElement) boot();
  else document.addEventListener('readystatechange', function h() {
    if (document.documentElement) { document.removeEventListener('readystatechange', h); boot(); }
  });

})();
