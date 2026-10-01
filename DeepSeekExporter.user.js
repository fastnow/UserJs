// ==UserScript==
// @name         DeepSeekExporter
// @name:zh-CN   DeepSeek 对话导出器
// @namespace    https://github.com/fastnow/UserJs
// @version      1.0.0
// @description  一键导出 DeepSeek 完整对话：自动加载全部历史，支持 Markdown / PDF / Word / HTML / JSON / TXT，保留标题层级、代码块、表格与思考链。开源免费，纯本地处理。
// @description:zh-CN 一键导出 DeepSeek 完整对话：自动加载全部历史，支持 Markdown / PDF / Word / HTML / JSON / TXT，保留标题层级、代码块、表格与思考链。开源免费，纯本地处理。
// @author       FastNow Studio
// @copyright    Copyright (c) 2026 FastNow Studio
// @license      MIT
// @match        https://chat.deepseek.com/*
// @icon         https://fastnow.github.io/DeepSeekExporter/icon.png
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @run-at       document-start
// @noframes
// @homepageURL  https://fastnow.github.io/DeepSeekExporter.html
// @updateURL    https://raw.githubusercontent.com/fastnow/UserJs/main/DeepSeekExporter.user.js
// @downloadURL  https://raw.githubusercontent.com/fastnow/UserJs/main/DeepSeekExporter.user.js
// @supportURL   https://github.com/fastnow/UserJs/issues
// ==/UserScript==

/*!
 * DeepSeekExporter v1.0.0 (build 20261001)
 *
 * Copyright (c) 2026 FastNow Studio
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * 隐私声明：本脚本完全在浏览器本地运行，不连接任何第三方服务器，
 * 不上传、不收集任何对话内容。
 */

(function () {
"use strict";

var DSCB = (function () {
"use strict";


  function pickRole(o) {
    const keys = ['role', 'sender', 'author', 'from', 'message_role', 'messageRole', 'sender_type'];
    for (const k of keys) {
      const v = o[k];
      if (typeof v !== 'string') continue;
      const lv = v.toLowerCase();
      if (lv.includes('user') || lv.includes('human')) return 'user';
      if (lv.includes('assistant') || lv.includes('model') || lv.includes('bot') || lv.includes('ai')) return 'assistant';
      if (lv.includes('system')) return 'system';
    }
    return null;
  }

  function strFrom(v) {
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (!v) return '';
    if (Array.isArray(v)) {

      return v
        .map((it) => {
          if (typeof it === 'string') return it;
          if (it && typeof it === 'object') return strFrom(it.text ?? it.content ?? it.value ?? it.data ?? '');
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }
    if (typeof v === 'object') {

      return strFrom(v.text ?? v.content ?? v.value ?? v.answer ?? '');
    }
    return '';
  }

  const THINK_KEYS = [
    'thinking_content', 'thinkingContent',
    'reasoning_content', 'reasoningContent',
    'thinking', 'reason', 'thought', 'think',
  ];
  const BODY_KEYS = ['content', 'text', 'message', 'body', 'value', 'answer', 'resp', 'reply'];

  function normalizeOne(o) {
    if (!o || typeof o !== 'object') return null;
    const role = pickRole(o);
    if (!role) return null;

    let text = '';
    for (const k of BODY_KEYS) {
      const t = strFrom(o[k]);
      if (t && t.length >= text.length) text = t;
    }

    let thinking = '';
    for (const k of THINK_KEYS) {
      const t = strFrom(o[k]);
      if (t && t.length >= thinking.length) thinking = t;
    }

    let fragAttach = '';
    try {
      const frags = o.fragments ?? o.fragment_list ?? o.parts ?? o.blocks;
      if (Array.isArray(frags) && frags.length) {
        let tBuf = '', kBuf = '', aBuf = '';
        frags.forEach(function (f) {
          if (!f || typeof f !== 'object') {
            if (typeof f === 'string' && f.trim()) tBuf += (tBuf ? '\n\n' : '') + f.trim();
            return;
          }
          const ty = String(f.type ?? f.kind ?? f.fragment_type ?? '').toUpperCase();
          const body = (function () {
            const cands = ['content', 'text', 'value', 'body', 'data', 'markdown'];
            let best = '';
            cands.forEach(function (k) {
              const v = strFrom(f[k]);
              if (v && v.length > best.length) best = v;
            });
            return best;
          })();
          const isThink = /THINK|REASON|COT|DEEPTHINK/.test(ty);
          const isImage = /IMAGE|PICTURE|FILE|ATTACH/.test(ty);

          if (isThink) {
            if (body) kBuf += (kBuf ? '\n\n' : '') + body;
          } else if (isImage) {
            const u = strFrom(f.url ?? f.uri ?? f.src ?? f.file_url ?? f.image_url);
            const nm = strFrom(f.name ?? f.file_name ?? f.filename);
            const isImg = !u || /\.(png|jpe?g|gif|webp|bmp|svg|heic)/i.test(u);
            aBuf += (aBuf ? ' ' : '') + (isImg ? '[图片]' : ('[附件: ' + (nm || '文件') + ']'));
          } else {

            if (body) tBuf += (tBuf ? '\n\n' : '') + body;
          }
        });
        if (tBuf && tBuf.length > text.length) text = tBuf;
        if (kBuf && kBuf.length > thinking.length) thinking = kBuf;
        if (aBuf) fragAttach = aBuf;
      }
    } catch (e) {}

    const rawContent = o.content ?? o.message;
    if (rawContent && typeof rawContent === 'object' && !Array.isArray(rawContent)) {
      for (const k of THINK_KEYS) {
        const t = strFrom(rawContent[k]);
        if (t && t.length > thinking.length) thinking = t;
      }
    }

    if (thinking && thinking.trim() === text.trim()) thinking = '';

    try {
      if (typeof stripCitations === 'function') text = stripCitations(text);
      if (typeof stripCitations === 'function') thinking = stripCitations(thinking);
    } catch (e) {}
    try {
      text = text.replace(/\[\s*citation\s*:\s*\d+\s*\]/gi, '');
      text = text.replace(/\[\s*\d+\s*\](\s*\[\s*\d+\s*\])+/g, '');
      thinking = thinking.replace(/\[\s*citation\s*:\s*\d+\s*\]/gi, '');
    } catch (e) {}

    try {

      text = text.replace(/^\s*(搜索到|已搜索|找到)\s*\d+\s*(个)?\s*(网页|结果|来源)\s*/g, '');
      thinking = thinking.replace(/^\s*(搜索到|已搜索|找到)\s*\d+\s*(个)?\s*(网页|结果|来源)\s*/g, '');

      text = text.replace(/\s+-?\d+(?:\s*-\s*\d+)+\s*$/g, '');
      text = text.replace(/\s+-?\d+(?:\s*-\s*\d+)+(?=\s)/g, '');
    } catch (e) {}

    let attachPh = '';
    const files = o.files ?? o.attachments ?? o.images ?? o.file_list ?? o.attachment_list;
    if (Array.isArray(files) && files.length) {
      attachPh = files.map(function (f) {
        const n = typeof f === 'string' ? f : (f && (f.name || f.file_name || f.filename)) || '';
        if (!n) return '[图片]';
        return /\.(png|jpe?g|gif|webp|bmp|svg|heic)$/i.test(n) ? '[图片]' : '[附件: ' + n + ']';
      }).join(' ');
    }

    if (fragAttach) {
      attachPh = attachPh ? (attachPh + ' ' + fragAttach) : fragAttach;
    }
    if (!text.trim()) {
      if (attachPh) text = attachPh;
      else if (role === 'user') text = '[图片]';
      else return null;
    } else if (attachPh) {
      text = text + '\n\n' + attachPh;
    }

    const id = o.message_id ?? o.id ?? o.msg_id ?? o.messageId ?? o.uuid ?? null;
    const ts = o.created_at ?? o.timestamp ?? o.created ?? o.time ?? o.ts ?? o.inserted_at ?? null;

    const parent = o.parent_id ?? o.parentId ?? o.parent_message_id ?? null;

    let vkey = null;
    if (id != null) {
      const n = Number(id);
      if (Number.isFinite(n)) vkey = n;
    }

    return {
      role,
      text: text.trim(),
      thinking: thinking.trim(),
      id: id == null ? null : String(id),
      parent: parent == null ? null : String(parent),
      ts,
      _vkey: vkey,
    };
  }

  function pairByParent(msgs) {
    if (!Array.isArray(msgs) || msgs.length < 2) return msgs;
    const byId = new Map();
    msgs.forEach(function (m) {
      if (m && m.id != null && String(m.id) !== '') byId.set(String(m.id), m);
    });
    if (byId.size < 2) return msgs;

    let bad = 0, checked = 0;
    const pos = new Map();
    msgs.forEach(function (m, i) { pos.set(m, i); });
    msgs.forEach(function (m) {
      if (!m || m.role !== 'assistant' || m.parent == null) return;
      const p = byId.get(String(m.parent));
      if (!p) return;
      checked++;
      if (pos.get(m) < pos.get(p)) bad++;
    });
    if (!checked || bad <= checked / 2) return msgs;

    const children = new Map();
    const roots = [];
    msgs.forEach(function (m) {
      const pid = (m.parent == null || String(m.parent) === '') ? null : String(m.parent);
      if (pid && byId.has(pid)) {
        if (!children.has(pid)) children.set(pid, []);
        children.get(pid).push(m);
      } else {
        roots.push(m);
      }
    });
    if (!roots.length) return msgs;

    const out = [];
    const seen = new Set();
    const queue = roots.slice();
    while (queue.length) {
      const cur = queue.shift();
      if (seen.has(cur)) continue;
      seen.add(cur);
      out.push(cur);
      const kids = children.get(String(cur.id != null ? cur.id : '')) || [];
      kids.forEach(function (k) { queue.push(k); });
    }

    if (out.length !== msgs.length) return msgs;
    return out;
  }

  function scanMessages(node, sink, depth, seen) {
    if (!node || depth > 14) return;
    if (typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      let hit = 0;
      const buf = [];
      for (const it of node) {
        const n = normalizeOne(it);
        if (n) {
          hit++;
          buf.push(n);
        }
      }

      const ok = node.length <= 2 ? hit >= 1 : hit >= 2 && hit >= Math.ceil(node.length / 2);
      if (ok) {
        for (const m of buf) sink.push(m);
      }

      for (const it of node) scanMessages(it, sink, depth + 1, seen);
      return;
    }

    for (const k of Object.keys(node)) {
      scanMessages(node[k], sink, depth + 1, seen);
    }
  }

  const normCache = new Map();
  const NORM_CACHE_MAX = 2000;

  function normCore(t) {
    const src = String(t || '');
    if (src.length < 200) return normCoreRaw(src);
    const hit = normCache.get(src);
    if (hit !== undefined) return hit;
    const v = normCoreRaw(src);
    if (normCache.size > NORM_CACHE_MAX) normCache.clear();
    normCache.set(src, v);
    return v;
  }

  function normCoreRaw(t) {
    return String(t || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .toLowerCase()

      .replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-z0-9]/g, '');
  }

  function betterThan(a, b) {
    const sa = normCore(a.text).length;
    const sb = normCore(b.text).length;
    if (Math.abs(sa - sb) > 20) return sa > sb;

    const rich = (m) => (/```/.test(m.text) ? 2 : 0) + (/^\s*#{1,6}\s/m.test(m.text) ? 1 : 0) + (/\*\*|\n-\s/.test(m.text) ? 1 : 0);
    const ra = rich(a), rb = rich(b);
    if (ra !== rb) return ra > rb;
    return sa > sb;
  }

  function dedupe(list, opts) {
    const strict = !opts || opts.strict !== false;
    const out = [];
    const byId = new Map();
    const seenFp = new Set();
    const seenNorm = new Set();
    const WINDOW = 60;

    function fp(m) {
      return m.role + '|' + m.text.replace(/\s+/g, '');
    }
    function nfp(m) {
      return m.role + '|' + normCore(m.text);
    }

    for (const m of list) {
      if (!m) continue;
      const f = fp(m);
      const nf = nfp(m);
      const fpOn = strict || m.text.length > 30;

      const core = fpOn && nf.length > 15 ? normCore(m.text) : '';

      if (m.id && byId.has(m.id)) {
        const idx = byId.get(m.id);
        if (betterThan(m, out[idx])) {
          if (fpOn) seenFp.delete(fp(out[idx]));
          seenNorm.delete(nfp(out[idx]));
          out[idx] = m;
          if (fpOn) seenFp.add(f);
          seenNorm.add(nf);
        }
        continue;
      }

      if (fpOn && seenFp.has(f)) continue;

      if (fpOn && seenNorm.has(nf)) continue;

      let dupIdx = -1;

      if (core && core.length > 15) {
        const start = Math.max(0, out.length - WINDOW);
        for (let i = out.length - 1; i >= start; i--) {
          const ex = out[i];
          if (ex.role !== m.role) continue;
          const ec = normCore(ex.text);
          if (ec.length <= 15) continue;

          const ratio = Math.min(ec.length, core.length) / Math.max(ec.length, core.length);
          if (ratio < 0.5) continue;
          if (ec.indexOf(core) > -1 || core.indexOf(ec) > -1) { dupIdx = i; break; }
        }
      }
      if (dupIdx > -1) {
        if (betterThan(m, out[dupIdx])) {
          seenNorm.delete(nfp(out[dupIdx]));
          if (fpOn) seenFp.delete(fp(out[dupIdx]));
          out[dupIdx] = m;
          seenNorm.add(nf);
          if (fpOn) seenFp.add(f);
        }
        continue;
      }

      const prev = out[out.length - 1];
      if (fpOn && prev && prev.role === m.role && prev.text === m.text) continue;

      if (m.id) byId.set(m.id, out.length);
      if (fpOn) seenFp.add(f);
      seenNorm.add(nf);
      out.push(m);
    }
    return out;
  }

  function extract(json, opts) {
    const sink = [];
    scanMessages(json, sink, 0, new Set());
    return dedupe(sink, opts);
  }

  function mergeMessages(prev, next, opts) {
    if (!prev || !prev.length) return dedupe(next || [], opts);
    if (!next || !next.length) return prev;
    return dedupe(prev.concat(next), opts);
  }

  function collapseBranches(list, opts) {
    const o = Object.assign({ keep: 'latest' }, opts || {});
    if (o.keep === 'all') return list;
    const out = [];
    const byParent = new Map();
    for (const m of list) {
      if (m.role !== 'assistant' || !m.parent) { out.push(m); continue; }
      if (!byParent.has(m.parent)) {
        byParent.set(m.parent, out.length);
        out.push(m);
        continue;
      }
      const idx = byParent.get(m.parent);
      const cur = out[idx];
      const curId = cur.id ? Number(cur.id) : NaN;
      const newId = m.id ? Number(m.id) : NaN;

      if (!isNaN(newId) && (isNaN(curId) || newId > curId)) out[idx] = m;
      else if (isNaN(newId) && isNaN(curId) && m.text.length > cur.text.length) out[idx] = m;
    }
    return out;
  }

  function estimateTokens(text) {
    if (!text) return 0;

    const cjk = (text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
    const rest = text.length - cjk;
    return Math.ceil(cjk / 1.5 + rest / 4);
  }

  function compressLocally(text, opts) {
    if (!text) return '';
    let s = text;
    const o = opts || {};

    if (o.foldCode !== false) {
      s = s.replace(/```[\s\S]{1200,}?```/g, (block) => {
        const m = block.match(/^```(\w*)\n?([\s\S]*?)```$/);
        if (!m) return block;
        const lang = m[1] || '';
        const body = m[2];
        if (body.length <= 1200) return block;
        const head = body.slice(0, 500);
        const tail = body.slice(-300);
        return (
          '```' +
          lang +
          '\n' +
          head +
          '\n\n/* …… 此处省略 ' +
          (body.length - 800) +
          ' 字符（原文代码块，如需完整内容请索取） …… */\n\n' +
          tail +
          '\n```'
        );
      });
    }

    s = s.replace(/\n{3,}/g, '\n\n');

    if (o.dropSmallTalk) {
      s = s.replace(/^\s*(好的?|嗯+|明白|收到|谢谢|thanks?|ok+|sure)[，。,.!！\s]*$/gim, '');
    }

    return s.trim();
  }

  const CITE_LINE_RE = /^\s*-\d+(-\d+)*\s*$/;
  const CITE_TAIL_RE = /\s+-\d+(-\d+)*\s*$/;

  function stripCitations(text) {
    if (!text) return text;
    return String(text)
      .split('\n')
      .map(function (line) {
        const t = line.trim();

        if (CITE_LINE_RE.test(t)) return '';

        if (CITE_TAIL_RE.test(line)) {
          const stripped = line.replace(CITE_TAIL_RE, '');
          if (/[\u4e00-\u9fff\w]/.test(stripped)) return stripped;
          return '';
        }
        return line;
      })
      .filter(function (l, i, arr) {

        return !(l === '' && arr[i - 1] === '');
      })
      .join('\n')
      .trim();
  }

  function toMarkdown(messages, opts) {
    const o = Object.assign(
      { title: '', includeThinking: true, compressed: false, compressOpts: {}, frontmatter: false, source: '', sortByTime: false },
      opts || {}
    );
    const L = [];
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp =
      now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());

    let list = messages.slice();

    list = o.sortByTime ? sortByTime(list) : finalOrder(list);

    if (o.frontmatter) {
      const iso = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + 'T' +
        pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
      L.push('---');
      L.push('title: "' + String(o.title || '').replace(/"/g, "'") + '"');
      if (o.source) L.push('source: ' + o.source);
      L.push('exported: ' + iso);
      L.push('message_count: ' + list.length);
      L.push('generator: DeepSeekExporter');
      L.push('---', '');
    }

    if (o.title) L.push('# ' + o.title, '');

    const turns = list.filter(function (m) { return m.role === 'user'; }).length;
    L.push('> 导出时间：' + stamp + '　对话轮数：' + turns + '　消息数：' + list.length, '');

    list.forEach((m) => {

      if (o.includeThinking && m.thinking) {
        const th = stripCitations(m.thinking);
        if (th) {
          L.push('**思考过程：**', '');
          L.push(th.split('\n').map((l) => '> ' + l).join('\n'));
          L.push('');
          L.push('---', '');
        }
      }

      L.push(m.role === 'user' ? '**提问：**' : m.role === 'assistant' ? '**回答：**' : '**系统：**', '');
      let body = stripCitations(m.text);
      if (o.compressed) body = compressLocally(body, o.compressOpts);

      if (!body.trim() && m.role === 'assistant' && m.thinking) {
        body = '_（该条仅有思考内容，无独立正文）_';
      }
      L.push(body, '');
      L.push('---', '');
    });

    return L.join('\n');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function inlineMd(s) {
    let out = String(s || '');
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return out;
  }

  const BLOCK_START_RE = /^\s*(```|#{1,6}\s|\s*>\s?|\s*([-*+])\s+|\s*\d+[.)]\s+|\s*\|)/;
  const HR_RE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;

  function mdToHtml(md) {
    const lines = String(md || '').split('\n');
    const body = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      const fence = /^\s*```(\w*)\s*$/.exec(line);
      if (fence) {
        const lang = fence[1] || '';
        const buf = [];
        i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        body.push('<pre class="code' + (lang ? ' lang-' + escapeHtml(lang) : '') + '"><code>' +
          escapeHtml(buf.join('\n')) + '</code></pre>');
        continue;
      }

      const h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) {
        const lv = Math.min(6, h[1].length);
        body.push('<h' + lv + '>' + inlineMd(escapeHtml(h[2])) + '</h' + lv + '>');
        i++; continue;
      }

      if (HR_RE.test(line)) { body.push('<hr>'); i++; continue; }

      if (/^\s*>\s?/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        body.push('<blockquote>' + mdToHtml(buf.join('\n')) + '</blockquote>');
        continue;
      }

      const isSep = i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1]);
      const isLooseTable = i + 1 < lines.length && /^\s*\|/.test(lines[i + 1]);
      if (/^\s*\|/.test(line) && (isSep || isLooseTable)) {
        const row = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
        const head = row(lines[i]);
        i += isSep ? 2 : 1;
        const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(row(lines[i])); i++; }
        let t = '<div class="tw"><table><thead><tr>' +
          head.map((c) => '<th>' + inlineMd(escapeHtml(c)) + '</th>').join('') + '</tr></thead><tbody>';
        rows.forEach((r) => {
          t += '<tr>' + r.map((c) => '<td>' + inlineMd(escapeHtml(c)) + '</td>').join('') + '</tr>';
        });
        body.push(t + '</tbody></table></div>');
        continue;
      }

      if (/^\s*[-*+]\s+/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) { buf.push(lines[i].replace(/^\s*[-*+]\s+/, '')); i++; }
        body.push('<ul>' + buf.map((x) => '<li>' + inlineMd(escapeHtml(x)) + '</li>').join('') + '</ul>');
        continue;
      }

      if (/^\s*\d+[.)]\s+/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { buf.push(lines[i].replace(/^\s*\d+[.)]\s+/, '')); i++; }
        body.push('<ol>' + buf.map((x) => '<li>' + inlineMd(escapeHtml(x)) + '</li>').join('') + '</ol>');
        continue;
      }

      if (line.trim()) {
        const buf = [];
        while (i < lines.length && lines[i].trim() && !BLOCK_START_RE.test(lines[i]) && !HR_RE.test(lines[i])) {
          buf.push(lines[i]); i++;
        }

        if (!buf.length && i < lines.length) { buf.push(lines[i]); i++; }
        body.push('<p>' + inlineMd(escapeHtml(buf.join('\n'))).replace(/\n/g, '<br>') + '</p>');
        continue;
      }

      i++;
    }
    return body.join('\n');
  }

  function messagesToHtml(messages, opts) {
    const o = Object.assign({ includeThinking: true, compressed: false, compressOpts: {} }, opts || {});
    const list = finalOrder(messages);
    const parts = [];
    list.forEach(function (m) {
      const who = m.role === 'user' ? '我' : 'DeepSeek';
      parts.push('<section class="msg ' + (m.role === 'user' ? 'u' : 'a') + '">');
      parts.push('<div class="who">' + (m.role === 'user' ? '提问' : '回答') + '</div>');
      if (o.includeThinking && m.thinking) {
        let th = stripCitations(m.thinking);
        if (th) parts.push('<div class="think"><div class="think-h">思考过程</div>' + mdToHtml(th) + '</div>');
      }
      let body = stripCitations(m.text);
      if (o.compressed) body = compressLocally(body, o.compressOpts);
      parts.push('<div class="body">' + mdToHtml(body) + '</div>');
      parts.push('</section>');
    });
    return parts.join('\n');
  }

  const DOC_CSS = `
:root{--bg:#fff;--fg:#1f2328;--mut:#656d76;--bd:#d0d7de;--qbg:#f6f8fa;--abg:#fff;--code:#f6f8fa;--acc:#0969da}
@media (prefers-color-scheme:dark){
:root{--bg:#0d1117;--fg:#e6edf3;--mut:#8b949e;--bd:#30363d;--qbg:#161b22;--abg:#0d1117;--code:#161b22;--acc:#58a6ff}}
*{box-sizing:border-box}
body{margin:0 auto;padding:32px 24px;max-width:900px;background:var(--bg);color:var(--fg);
font:15px/1.75 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
h1{font-size:1.7em;margin:.6em 0 .5em;padding-bottom:.3em;border-bottom:1px solid var(--bd)}
.meta{color:var(--mut);font-size:.85em;margin-bottom:24px}
.msg{margin:0 0 22px;padding:14px 16px;border:1px solid var(--bd);border-radius:8px}
.msg.u{background:var(--qbg)}
.msg.a{background:var(--abg)}
.who{font-size:.78em;font-weight:600;color:var(--mut);letter-spacing:.05em;margin-bottom:8px}
.think{margin-bottom:12px;padding:10px 12px;border-left:3px solid var(--mut);background:var(--code);
border-radius:0 6px 6px 0;color:var(--mut);font-size:.92em}
.think-h{font-weight:600;margin-bottom:6px;font-size:.85em}
.body>*:first-child{margin-top:0}.body>*:last-child{margin-bottom:0}
h2,h3,h4{line-height:1.4;margin:1.1em 0 .5em}
p{margin:.6em 0}
ul,ol{padding-left:1.6em;margin:.6em 0}
li{margin:.25em 0}
code{font:0.9em ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
background:var(--code);padding:.15em .4em;border-radius:4px}
pre.code{background:var(--code);border:1px solid var(--bd);border-radius:6px;
padding:12px 14px;overflow:auto;margin:.7em 0}
pre.code code{background:none;padding:0;font-size:.88em;line-height:1.6}
.tw{overflow-x:auto;margin:.7em 0}
table{border-collapse:collapse;width:100%;font-size:.92em}
th,td{border:1px solid var(--bd);padding:6px 10px;text-align:left}
th{background:var(--qbg);font-weight:600}
blockquote{margin:.6em 0;padding:.2em 0 .2em 12px;border-left:3px solid var(--bd);color:var(--mut)}
hr{border:0;border-top:1px solid var(--bd);margin:1.4em 0}
a{color:var(--acc)}
`;

  function toHtmlDoc(messages, opts) {
    const o = Object.assign(
      { title: '', includeThinking: true, compressed: false, compressOpts: {}, print: false, source: '', generator: 'DeepSeekExporter' },
      opts || {}
    );
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    const year = d.getFullYear();
    const list = finalOrder(messages);

    const printCss = o.print
      ? `
@media print{
  body{padding:0;max-width:none;font-size:11pt}
  .msg{break-inside:avoid;page-break-inside:avoid;border-color:#ccc}
  .think{break-inside:avoid;page-break-inside:avoid}
  pre.code{break-inside:avoid;page-break-inside:avoid;white-space:pre-wrap;word-break:break-all}
  .tw{break-inside:avoid}
  tr{break-inside:avoid;page-break-inside:avoid}
  .noprint{display:none}
}
@page{margin:16mm 14mm}
`
      : '';

    return '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
      '<meta name="generator" content="' + escapeHtml(o.generator) + '">\n' +
      '<title>' + escapeHtml(o.title || 'DeepSeek 对话') + '</title>\n' +
      '<style>' + DOC_CSS + printCss + '</style>\n</head>\n<body>\n' +
      '<h1>' + escapeHtml(o.title || 'DeepSeek 对话') + '</h1>\n' +
      '<div class="meta">导出时间：' + stamp + '　共 ' + list.length + ' 条' +
      (o.source ? '　来源：<a href="' + escapeHtml(o.source) + '">' + escapeHtml(o.source) + '</a>' : '') + '</div>\n' +
      messagesToHtml(list, o) + '\n' +
      '<footer style="margin-top:32px;padding-top:14px;border-top:1px solid var(--bd);' +
      'font-size:.8rem;color:var(--mut);text-align:center">' +
      '&copy; ' + year + ' FastNow Studio | MIT License</footer>\n' +
      '</body>\n</html>\n';
  }

  function toWordDoc(messages, opts) {
    const inner = toHtmlDoc(messages, opts);
    const wordCss = `
@page{size:A4;margin:2cm}
body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;font-size:10.5pt}
table{border-collapse:collapse}
th,td{border:1px solid #999;padding:4px 8px}
pre.code{background:#f5f5f5;border:1px solid #ccc;padding:8px}
code{font-family:Consolas,monospace}
`;
    return '<html xmlns:o="urn:schemas-microsoft-com:office:office"\n' +
      '      xmlns:w="urn:schemas-microsoft-com:office:word"\n' +
      '      xmlns="http://www.w3.org/TR/REC-html40">\n<head>\n' +
      '<meta charset="utf-8">\n' +
      '<title>' + escapeHtml((opts && opts.title) || 'DeepSeek 对话') + '</title>\n' +
      '<!--[if gte mso 9]>\n<xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml>\n<![endif]-->\n' +
      '<style>' + wordCss + '</style>\n</head>\n<body>\n' +
      inner.replace(/^[\s\S]*?<body>\n?/, '').replace(/<\/body>[\s\S]*$/, '') + '\n</body>\n</html>\n';
  }

  function sortByTime(list) {
    const hasTs = list.some((m) => m.ts != null && m.ts !== '');
    if (!hasTs) return list;
    const idx = list.map((m, i) => i);
    idx.sort(function (a, b) {
      const ta = toTime(list[a].ts);
      const tb = toTime(list[b].ts);
      if (ta != null && tb != null && ta !== tb) return ta - tb;
      return a - b;
    });
    return idx.map((i) => list[i]);
  }

  function toTime(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
    const n = Number(v);
    if (!isNaN(n) && n > 0) return n < 1e12 ? n * 1000 : n;
    const d = Date.parse(v);
    return isNaN(d) ? null : d;
  }

  function buildContinuation(messages, opts) {
    const o = Object.assign(
      {
        title: '',
        includeThinking: false,
        keepRecent: 999,
        compressed: true,
        compressOpts: {},
        lastUserOnly: false,
      },
      opts || {}
    );

    let list = messages.slice();
    if (o.lastUserOnly) {

      const idxLastUser = list.map((m) => m.role).lastIndexOf('user');
      if (idxLastUser > 0) list = list.slice(Math.max(0, idxLastUser - 1));
      else list = list.slice(-1);
    }

    let headNote = '';
    if (list.length > o.keepRecent) {
      const dropped = list.slice(0, list.length - o.keepRecent);
      const kept = list.slice(list.length - o.keepRecent);
      headNote = [
        '> ⚠️ 本对话前 ' + dropped.length + ' 轮因长度限制仅保留要点摘要：',
        '',
      ]
        .concat(
          dropped.map((m, i) => {
            const who = m.role === 'user' ? 'User' : 'DeepSeek';
            const firstLine = (m.text.split('\n').find((l) => l.trim()) || '').trim();
            const digest = firstLine.length > 80 ? firstLine.slice(0, 80) + '…' : firstLine;
            return '- [' + (i + 1) + '] ' + who + '：' + (digest || '(空)');
          })
        )
        .concat([''])
        .join('\n');
      list = kept;
    }

    const L = [];
    L.push('# 对话迁移上下文', '');
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp =
      now.getFullYear() +
      '-' +
      pad(now.getMonth() + 1) +
      '-' +
      pad(now.getDate()) +
      ' ' +
      pad(now.getHours()) +
      ':' +
      pad(now.getMinutes());
    L.push('> 生成时间：' + stamp);
    if (o.title) L.push('> 原对话标题：' + o.title);
    L.push('> 迁移轮数：' + list.length, '');
    if (headNote) L.push(headNote);

    L.push('## 使用说明（请先读完）', '');
    L.push(
      [
        '这是一段从已达上限的旧对话中迁移过来的上下文。请你：',
        '',
        '1. **先花一步提炼**：用几句话总结这段对话里的关键事实、已确立的约定（如代码风格、项目背景、用户偏好）、以及**尚未完成的事项**。',
        '2. **再回答**：基于提炼结果，继续推进最后一个未完成的问题。',
        '3. 不要复述历史，直接延续即可；如需追问用户，只问最关键的一个问题。',
        '',
      ].join('\n')
    );

    L.push('## 历史对话', '');
    list.forEach((m, i) => {
      const who = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'DeepSeek' : 'System';
      L.push('### ' + who + '　(第 ' + (i + 1) + ' 轮)', '');
      if (o.includeThinking && m.thinking) {
        L.push('*思考过程*：', '');
        L.push(
          m.thinking
            .split('\n')
            .map((l) => '> ' + l)
            .join('\n')
        );
        L.push('');
      }
      let body = m.text;
      if (o.compressed) body = compressLocally(body, o.compressOpts);
      L.push(body, '');
    });

    L.push('## 现在', '');
    L.push('请基于以上上下文继续。先给出一句话的要点提炼，然后接着推进。', '');

    return L.join('\n');
  }

  const NOISE_RE = [

    /^\s*\d+\s*\/\s*\d+\s*$/,
    /^本回答由\s*AI\s*生成[，,]?/,
    /^内容仅供参考/,
    /^请仔细甄别/,
    /^复制$/, /^下载$/, /^复制代码$/, /^收起$/, /^展开$/,
    /^重新生成$/, /^\s*点赞\s*$/, /^\s*点踩\s*$/,
    /^已思考[（(][^）)]*[)）]\s*$/,
    /^\d[\d,.]*\s*(tokens?|字符|字)\s*$/i,
    /^(复制|下载)\s*(代码|全部)?\s*$/,

    /^搜索到\s*\d+\s*个网页\s*$/,
    /^已搜索\s*\d+\s*个网页\s*$/,
    /^找到\s*\d+\s*个(网页|结果|来源)\s*$/,
    /^\d+\s*个网页\s*$/,
    /^(联网搜索|深度研究)[：:]?\s*$/,
  ];

  function stripInlineNoise(t) {
    if (!t) return t;
    let r = String(t);

    r = r.replace(/^\s*(搜索到|已搜索|找到)\s*\d+\s*(个)?\s*(网页|结果|来源)\s*/g, '');

    r = r.replace(/\s*\d+\s*\/\s*\d+\s*$/g, '');

    r = r.replace(/\s*本回答由\s*AI\s*生成[，,]?\s*内容仅供参考[，,]?\s*请仔细甄别\s*/g, '');
    return r.trim();
  }

  const USER_CFG = { minLen: 2, keepSingleChar: true, noisePatterns: [], imageText: '', thinkLead: '' };
  let compiledNoise = [];

  function configure(opts) {
    try {
      const o = opts || {};
      if (typeof o.minLen === 'number') USER_CFG.minLen = o.minLen;
      if (typeof o.keepSingleChar === 'boolean') USER_CFG.keepSingleChar = o.keepSingleChar;
      if (Array.isArray(o.noisePatterns)) USER_CFG.noisePatterns = o.noisePatterns.slice();
      if (typeof o.imageText === 'string') USER_CFG.imageText = o.imageText;
      if (typeof o.thinkLead === 'string') USER_CFG.thinkLead = o.thinkLead;

      compiledNoise = [];
      USER_CFG.noisePatterns.forEach(function (p) {
        if (!p) return;
        try { compiledNoise.push(new RegExp(p, 'i')); } catch (e) {}
      });
    } catch (e) {}
  }

  function getConfig() { return Object.assign({}, USER_CFG); }

  function isNoiseText(t) {
    const s = (t || '').trim();
    if (!s) return true;

    for (let i = 0; i < compiledNoise.length; i++) {
      if (compiledNoise[i].test(s)) return true;
    }

    if (s.length < USER_CFG.minLen) {

      if (!/[\w\u4e00-\u9fff]/.test(s)) return true;
      return !USER_CFG.keepSingleChar;
    }
    for (let i = 0; i < NOISE_RE.length; i++) if (NOISE_RE[i].test(s)) return true;
    return false;
  }

  function domToMarkdown(root) {
    if (!root) return '';
    let clone;
    try { clone = root.cloneNode(true); } catch (e) { return (root.textContent || '').trim(); }

    const KILL = [
      'button', '[role="button"]',
      '[class*="copy"]', '[class*="Copy"]',
      '[class*="download"]', '[class*="Download"]',
      '[class*="copy-btn"]', '[class*="code-header"]',
      '[class*="CodeHeader"]', '[class*="toolbar"]',
      '[aria-label="复制"]', '[aria-label="下载"]',
      'svg', 'img',
    ].join(',');
    try {
      Array.prototype.slice.call(clone.querySelectorAll(KILL)).forEach(function (n) { n.remove(); });
    } catch (e) {}

    const out = [];
    walk(clone, out);
    return out
      .join('')

      .replace(/[\u200b-\u200f\u202a-\u202e\ufeff]/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\n+|\n+$/g, '')
      .trim();
  }

  function katexTex(node) {
    try {
      const el = node.classList && (node.classList.contains('katex') ||
                 node.classList.contains('katex-mathml') ||
                 node.classList.contains('katex-html'))
        ? node : (node.querySelector ? node.querySelector('.katex') : null);
      if (!el) return null;

      const ann = el.querySelector('annotation[encoding="application/x-tex"]');
      if (ann && (ann.textContent || '').trim()) return (ann.textContent || '').trim();

      const h = el.querySelector('.katex-html');
      if (h) return (h.textContent || '').replace(/[\u200b-\u200f\ufeff]/g, '').trim();
      return (el.textContent || '').replace(/[\u200b-\u200f\ufeff]/g, '').trim();
    } catch (e) { return null; }
  }

  function isKatex(node) {
    const cl = node.className && node.className.toString ? node.className.toString() : '';
    return /\bkatex(-display)?\b/.test(cl) || cl.indexOf('katex-display') > -1;
  }

  function isDisplayMath(node) {
    const cl = node.className && node.className.toString ? node.className.toString() : '';
    if (cl.indexOf('katex-display') > -1) return true;
    let p = node.parentElement, g = 0;
    while (p && g++ < 4) {
      const pcl = p.className && p.className.toString ? p.className.toString() : '';
      if (pcl.indexOf('katex-display') > -1) return true;
      p = p.parentElement;
    }
    return false;
  }

  function walk(node, out) {
    if (!node) return;
    if (node.nodeType === 3) { out.push(node.nodeValue || ''); return; }
    if (node.nodeType !== 1) return;
    const tag = (node.tagName || '').toLowerCase();

    if (isKatex(node)) {
      const tex = katexTex(node);
      if (tex) {
        const disp = isDisplayMath(node);
        out.push(disp ? '\n\n$$' + tex + '$$\n\n' : '$' + tex + '$');
      }
      return;
    }

    if (node.querySelector && node.querySelector('.katex') &&
        !(node.querySelector('p') || node.querySelector('pre') || node.querySelector('table'))) {
      for (let c = node.firstChild; c; c = c.nextSibling) walk(c, out);
      return;
    }

    if (tag === 'pre') {
      const code = node.querySelector('code');
      const src = code || node;
      let lang = '';
      const cl = (src.className && src.className.toString()) || '';
      const m = /(?:language|lang|hljs|brush)-([a-zA-Z0-9+#_-]+)/.exec(cl);
      if (m) lang = m[1];
      const txt = (src.textContent || '').replace(/\n+$/, '');
      out.push('\n\n```' + lang + '\n' + txt + '\n```\n\n');
      return;
    }
    if (tag === 'code') {
      out.push('`' + (node.textContent || '').replace(/\n+/g, ' ').trim() + '`');
      return;
    }
    if (/^h[1-6]$/.test(tag)) {
      const lv = Number(tag[1]);
      out.push('\n\n' + new Array(lv + 1).join('#') + ' ' + (node.textContent || '').trim() + '\n\n');
      return;
    }
    if (tag === 'li') {
      out.push('\n- ');
      for (let c = node.firstChild; c; c = c.nextSibling) walk(c, out);
      return;
    }
    if (tag === 'tr') {
      const cells = [];
      for (let c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 1) cells.push((c.textContent || '').trim());
      }
      if (cells.length) out.push('| ' + cells.join(' | ') + ' |\n');
      return;
    }
    if (tag === 'br') { out.push('\n'); return; }
    if (tag === 'strong' || tag === 'b') { out.push('**' + (node.textContent || '') + '**'); return; }
    if (tag === 'em' || tag === 'i') { out.push('*' + (node.textContent || '') + '*'); return; }
    if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'blockquote') {
      out.push('\n\n');
      for (let c = node.firstChild; c; c = c.nextSibling) walk(c, out);
      out.push('\n\n');
      return;
    }
    for (let c = node.firstChild; c; c = c.nextSibling) walk(c, out);
  }

  function findImageEls(el) {
    const found = [];
    if (!el || !el.querySelectorAll) return found;
    try {
      const imgs = el.querySelectorAll('img');
      for (let i = 0; i < imgs.length; i++) {
        const im = imgs[i];

        const w = im.naturalWidth || im.width || 0;
        if (w && w < 48) continue;
        found.push({ kind: 'image', alt: im.alt || '' });
      }
    } catch (e) {}
    try {
      const boxes = el.querySelectorAll('[class*="image"],[class*="Image"],[class*="upload"],[class*="Upload"],[class*="attachment"],[class*="file"]');
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.querySelector('img')) continue;
        const t = (b.textContent || '').trim();
        if (t && t.length > 200) continue;
        found.push({ kind: 'file', alt: t });
      }
    } catch (e) {}
    return found;
  }

  function mdIn(el) {
    if (!el || !el.querySelector) return null;
    try {
      if (el.matches && el.matches(MD_SEL_GLOBAL)) return el;
    } catch (e) {}
    try { return el.querySelector(MD_SEL_GLOBAL); } catch (e) { return null; }
  }

  function imagePlaceholder(el) {
    const list = findImageEls(el);
    if (!list.length) return '';
    const ph = [];
    let imgN = 0;
    for (const f of list) {
      if (f.kind === 'image') { imgN++; }
      else if (f.alt) ph.push('[附件: ' + f.alt + ']');
      else ph.push('[附件]');
    }
    if (imgN) {

      const base = USER_CFG.imageText || '[图片]';
      ph.unshift(imgN > 1 ? base + ' ×' + imgN : base);
    }
    return ph.join('\n');
  }

  const THINK_LEAD_RE = /^\s*(我们需要|我们被要求|我们被问到|让我(?:看看|想想|想|先|来|分析)|好的[，,]?\s*(?:用户|让我|我(?:需要|先))|我(?:需要|得|应该)(?:先)?(?:分析|理解|确认|考虑|先)|首先[，,]?我(?:需要|得|要)|We need to|We are asked|Let me|Let's|Okay[，,]?\s*(?:the user|let me))/;

  function thinkLeadRe() {
    if (USER_CFG.thinkLead) {
      try { return new RegExp(USER_CFG.thinkLead); } catch (e) {  }
    }
    return THINK_LEAD_RE;
  }

  function splitThinkLead(text) {
    const t = String(text || '');
    if (!t) return { thinking: '', text: '' };
    if (!thinkLeadRe().test(t)) return { thinking: '', text: t };

    const m = /\n\s*\n/.exec(t);
    if (m) {
      const head = t.slice(0, m.index).trim();
      const rest = t.slice(m.index).trim();
      if (rest) return { thinking: head, text: rest };
    }

    return { thinking: t.trim(), text: '' };
  }

  function findThinkingEl(container, mdEl) {

    try {
      const sel = '[class*="think" i],[class*="Think"],[class*="reason" i],[class*="Reason"],[class*="chain" i],[class*="Chain"]';
      const cands = container.querySelectorAll(sel);
      for (let i = 0; i < cands.length; i++) {
        const el = cands[i];
        if (el.querySelector && el.querySelector('.ds-markdown,[class*="markdown"]')) continue;
        const t = (el.textContent || '').trim();
        if (t.length > 4 && t.length < 30000) return el;
      }
    } catch (e) {}

    try {
      const all = container.querySelectorAll('div,span,p,section,article');
      for (let i = 0; i < all.length; i++) {
        const n = all[i];
        if (n.querySelector && n.querySelector('.ds-markdown,[class*="markdown"]')) continue;
        const t = (n.textContent || '').trim();
        if (/^(已思考|思考过程|深度思考|DeepThink|已深度思考)/.test(t) && t.length > 12 && t.length < 30000) {
          return n;
        }
      }
    } catch (e) {}

    if (mdEl) {
      try {
        let node = mdEl;
        let guard = 0;
        while (node && node.parentElement && node.parentElement !== container && guard++ < 6) {
          node = node.parentElement;
        }
        if (node && node.parentElement === container) {
          const prevs = [];
          let sib = node.previousElementSibling;
          let g = 0;
          while (sib && g++ < 6) { prevs.unshift(sib); sib = sib.previousElementSibling; }
          for (const pv of prevs) {
            if (pv.querySelector && pv.querySelector('.ds-markdown,[class*="markdown"]')) continue;
            const t = (pv.textContent || '').trim();
            if (!t || t.length < 10 || t.length > 30000) continue;
            if (/已思考|思考过程|深度思考|DeepThink|思考中|reasoning/i.test(t)) return pv;
          }
        }
      } catch (e) {}
    }
    return null;
  }

  function stripThinkingTitle(t) {
    return (t || '')
      .replace(/^\s*(已思考|思考过程|深度思考|已深度思考|思考中)\s*[（(][^）)]*[)）]\s*/, '')
      .replace(/^\s*(已思考|思考过程|深度思考|已深度思考)\s*/, '')
      .trim();
  }

  const MD_SEL_GLOBAL = '.ds-markdown';

  function isMdContainer(el) {
    if (!el || !el.classList) return false;
    if (el.classList.contains('ds-markdown-paragraph')) return false;
    if (!el.classList.contains('ds-markdown')) return false;

    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'p' || tag === 'span' || tag === 'code' || tag === 'li') return false;
    return true;
  }

  function firstMdContainer(root) {
    if (!root) return null;
    if (isMdContainer(root)) return root;
    try {
      const all = root.querySelectorAll('.ds-markdown');
      for (let i = 0; i < all.length; i++) {
        if (isMdContainer(all[i])) return all[i];
      }
    } catch (e) {}
    return null;
  }

  function allMdContainers(root) {
    if (!root) return [];
    const out = [];
    if (isMdContainer(root)) out.push(root);
    try {
      const all = root.querySelectorAll('.ds-markdown');
      for (let i = 0; i < all.length; i++) {
        if (isMdContainer(all[i])) out.push(all[i]);
      }
    } catch (e) {}
    return out;
  }

  let listCache = null;
  let vlistInfo = null;

  function detectVersion(doc) {
    var r = { commitId: '', region: '', scripts: [], features: {} };
    try {
      var m = doc.querySelector('meta[name="commit-id"]');
      if (m) r.commitId = m.getAttribute('content') || '';
      var rg = doc.querySelector('meta[name="region"]');
      if (rg) r.region = rg.getAttribute('content') || '';
    } catch (e) {}

    try {
      var ss = doc.querySelectorAll('script[src]');
      for (var i = 0; i < ss.length && r.scripts.length < 6; i++) {
        var src = ss[i].getAttribute('src') || '';
        if (!src) continue;
        var mm = /\/(main|default-vendors|chunk)[^/]*?\.([0-9a-zA-Z_-]{6,})\.js/.exec(src);
        if (mm) r.scripts.push(mm[1] + '@' + mm[2].slice(0, 10));
        else if (/\.js$/.test(src)) {
          var nm = src.split('/').pop() || '';
          if (nm) r.scripts.push(nm.slice(0, 28));
        }
      }
    } catch (e) {}

    var F = {
      dsMessage: !!doc.querySelector('.ds-message'),
      dsMarkdown: !!doc.querySelector('.ds-markdown'),
      mdParagraph: !!doc.querySelector('.ds-markdown-paragraph'),
      virtualList: !!doc.querySelector('.ds-virtual-list'),
      visibleItems: !!doc.querySelector('.ds-virtual-list-visible-items'),
      katex: !!doc.querySelector('.katex'),
      root: !!doc.querySelector('#root')
    };
    r.features = F;

    var need = ['dsMessage', 'dsMarkdown', 'virtualList'];
    var miss = [];
    for (var k in need) { if (!F[need[k]]) miss.push(need[k]); }
    r.adapted = miss.length === 0;
    r.missing = miss;

    try {
      const probe = extractFromDom(doc);
      r.messageCount = probe.length;
      r.roles = {
        user: probe.filter(function (m) { return m.role === 'user'; }).length,
        assistant: probe.filter(function (m) { return m.role === 'assistant'; }).length,
      };
    } catch (e) { r.messageCount = 0; }
    return r;
  }

  function visualTop(el) {
    try {
      if (!el || !el.getBoundingClientRect) return null;
      const r = el.getBoundingClientRect();
      if (!r) return null;
      const t = typeof r.top === 'number' ? r.top : null;
      const h = typeof r.height === 'number' ? r.height : 0;
      if (t === null) return null;
      if (t === 0 && h === 0) return null;
      return t;
    } catch (e) { return null; }
  }

  function sortByVisual(arr) {
    if (!arr || arr.length < 2) return arr;
    let any = false;
    for (let i = 0; i < arr.length; i++) {
      if (visualTop(arr[i].el) !== null) { any = true; break; }
    }
    if (!any) return arr;
    for (let i = 0; i < arr.length; i++) arr[i].domIdx = i;
    arr.sort(function (a, b) {
      const ta = visualTop(a.el), tb = visualTop(b.el);
      if (ta === null && tb === null) return a.domIdx - b.domIdx;
      if (ta === null) return 1;
      if (tb === null) return -1;
      return ta - tb;
    });
    return arr;
  }

  function extractFromDom(doc, opts) {
    const o = opts || {};
    const MD_SEL = MD_SEL_GLOBAL;

    const scrollTop = typeof o.scrollTop === 'number' ? o.scrollTop : 0;

    function scrolledAmount(fromEl) {
      let amt = 0;
      const w = (typeof doc.defaultView !== 'undefined') ? doc.defaultView : null;
      try { if (w) amt += (w.scrollY || w.pageYOffset || 0); } catch (e) {}
      let p = fromEl ? fromEl.parentElement : null, g = 0;
      while (p && g++ < 25) {
        try { if (p.scrollTop) amt += p.scrollTop; } catch (e) {}
        p = p.parentElement;
      }
      return amt;
    }

    function absTopOf(el) {
      try {
        let node = el, guard = 0, r = null;

        while (node && guard++ < 8) {
          if (!node.getBoundingClientRect) { node = node.parentElement; continue; }
          const rr = node.getBoundingClientRect();
          if (rr && typeof rr.top === 'number') {
            const h = (typeof rr.height === 'number') ? rr.height : 0;
            if (!(rr.top === 0 && h === 0)) { r = rr; break; }
          }
          node = node.parentElement;
        }
        if (!r) return null;
        return r.top + scrolledAmount(el);
      } catch (e) { return null; }
    }
    const skipFn = typeof o.skip === 'function' ? o.skip : null;
    const onParsed = typeof o.onParsed === 'function' ? o.onParsed : null;

    function detectVirtualList(d) {
      try {
        const vl = d.querySelector('.ds-virtual-list, [class*="virtual-list"]');
        if (!vl) return null;
        const vis = d.querySelector('.ds-virtual-list-visible-items, [class*="visible-items"]');
        return { root: vl, visible: vis, rendered: vis ? vis.children.length : 0 };
      } catch (e) { return null; }
    }
    vlistInfo = detectVirtualList(doc);

    const sigMap = (typeof WeakMap === 'function') ? new WeakMap() : null;
    function sigOf(el) {
      try { return String((el.textContent || '').length) + ':' + normCore(el.textContent || '').slice(0, 40); }
      catch (e) { return ''; }
    }
    function considered(el) {
      if (!el) return false;

      if (skipFn) { try { if (skipFn(el)) return false; } catch (e) {} }
      if (sigMap) {
        const sg = sigOf(el);
        const prev = sigMap.get(el);
        if (prev !== undefined && prev === sg) return false;
        sigMap.set(el, sg);
      }
      if (onParsed) { try { onParsed(el); } catch (e) {} }
      return true;
    }

    function mkFromEl(role, el, mdEl) {
      let thinking = '';
      let target = el;
      if (role === 'assistant') {
        if (mdEl) {
          let mds = null;
          try {
            const arr = allMdContainers(el);
            mds = arr;
          } catch (e) {}
          if (mds && mds.length > 1) {

            const keep = [];
            const normOf = [];
            Array.prototype.slice.call(mds).forEach(function (m) {
              const nc = normCore(m.textContent || '');
              if (!nc) return;
              for (let i = 0; i < normOf.length; i++) {
                const other = normOf[i];
                if (other.indexOf(nc) > -1) return;
                if (nc.indexOf(other) > -1) { normOf[i] = nc; keep[i] = m; return; }
              }
              normOf.push(nc);
              keep.push(m);
            });
            try {
              const frag = doc.createElement('div');
              keep.forEach(function (m) { frag.appendChild(m.cloneNode(true)); });
              target = keep.length ? frag : mdEl;
            } catch (e) { target = mdEl; }
          } else {
            target = mdEl;
          }
        }
        const te = findThinkingEl(el, mdEl);
        if (te) thinking = stripThinkingTitle(domToMarkdown(te));
      }
      let t = domToMarkdown(target);

      let leadSplit = null;

      t = stripInlineNoise(t);

      if (role === 'assistant' && !thinking && thinkLeadRe().test(t)) {
        const sp = splitThinkLead(t);
        if (sp.thinking) {
          thinking = sp.thinking;
          t = sp.text;
        }
      }

      const ph = imagePlaceholder(el);
      if (ph) t = t ? (t.indexOf('[图片]') === -1 ? t + '\n\n' + ph : t) : ph;
      if (!t) {

        if (role === 'assistant' && thinking) t = '';
        else return null;
      }
      if (role === 'user' && isNoiseText(t)) return null;

      let vkey = null;
      try {
        let n = el, g = 0;
        while (n && g++ < 8) {
          if (n.getAttribute) {
            const v = n.getAttribute('data-virtual-list-item-key');
            if (v != null && String(v).trim() !== '') {
              const num = Number(String(v).trim());
              if (Number.isFinite(num)) { vkey = num; break; }
            }
          }
          n = n.parentElement;
        }
      } catch (e) {}
      return { role: role, text: t, thinking: thinking, id: null, ts: null, _top: absTopOf(el), _vkey: vkey };
    }

    try {
      const dm = doc.querySelectorAll('.ds-message');
      if (dm && dm.length >= 1) {
        const collected = [];
        const seen = new Set();
        dm.forEach(function (el) {

          if (el.parentElement && el.parentElement.closest &&
              el.parentElement.closest('.ds-message')) return;
          if (!considered(el)) return;
          const mdEl = firstMdContainer(el);
          const role = mdEl ? 'assistant' : 'user';
          const m = mkFromEl(role, el, mdEl);
          if (m) {
            const k = normCore(m.text);
            if (k && seen.has(k)) return;
            if (k) seen.add(k);
            collected.push({ el: el, msg: m });
          }
        });

        sortByVisual(collected);
        const a = collected.map(function (x) { return x.msg; });
        const hasU = a.some(function (x) { return x.role === 'user'; });
        const hasA = a.some(function (x) { return x.role === 'assistant'; });

        if (a.length >= 2) return a;
        if (a.length === 1 && (hasU || hasA)) return a;
      }
    } catch (e) {}

    try {
      const marked = doc.querySelectorAll('[data-role],[data-message-role],[data-author],[data-sender]');
      if (marked && marked.length >= 2) {
        const a = [];
        const seen = new Set();
        marked.forEach(function (el) {
          if (!considered(el)) return;
          const raw =
            el.getAttribute('data-role') || el.getAttribute('data-message-role') ||
            el.getAttribute('data-author') || el.getAttribute('data-sender') || '';
          const lv = String(raw).toLowerCase();
          let role = null;
          if (/user|human/.test(lv)) role = 'user';
          else if (/assistant|ai|bot|model|deepseek/.test(lv)) role = 'assistant';
          if (!role) return;
          const m = mkFromEl(role, el, firstMdContainer(el));
          if (m && !seen.has(m.text)) { seen.add(m.text); a.push(m); }
        });
        const hasU = a.some(function (m) { return m.role === 'user'; });
        const hasA = a.some(function (m) { return m.role === 'assistant'; });
        if (a.length >= 2 && hasU && hasA) return a;
      }
    } catch (e) {}

    let mds = Array.prototype.slice.call(doc.querySelectorAll(MD_SEL));
    if (!mds.length) return [];

    let list = null;
    if (listCache && listCache.doc === doc && listCache.el && listCache.el.isConnected) {
      list = listCache.el;
    }

    if (mds.length > 400) mds = mds.slice(0, 400);

    function ancestors(e) {
      const r = [];
      for (let x = e; x; x = x.parentElement) r.unshift(x);
      return r;
    }
    function lca(a, b) {
      const pa = ancestors(a); const pb = ancestors(b);
      let last = pa[0] || null;
      for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
        if (pa[i] === pb[i]) last = pa[i]; else break;
      }
      return last;
    }

    function looksLikeAttachment(el) {
      const t = (el.textContent || '').trim();
      if (!t) return true;
      if (/^(已思考|思考过程|深度思考|DeepThink|已深度思考|思考中)/.test(t)) return true;
      if (/^(本回答由\s*AI\s*生成|内容仅供参考|请仔细甄别)/.test(t)) return true;

      if (/^\s*\d+\s*\/\s*\d+\s*$/.test(t)) return true;
      const cl = (el.className || '').toString();
      if (/think|reason|chain|disclaimer|footer|toolbar|action|page-ind|pagination/i.test(cl)) return true;

      try { if (typeof isNoiseText === 'function' && isNoiseText(t)) return true; } catch (e) {}
      return false;
    }

    function hasNonMdSibling(node) {
      if (!node || !node.parentElement) return false;
      let sib = node.previousElementSibling;
      let g = 0;
      while (sib && g++ < 8) {
        const hasMd = mdIn(sib);
        if (!hasMd && (sib.textContent || '').trim() && !looksLikeAttachment(sib)) return true;
        sib = sib.previousElementSibling;
      }
      sib = node.nextElementSibling;
      g = 0;
      while (sib && g++ < 8) {
        const hasMd = mdIn(sib);
        if (!hasMd && (sib.textContent || '').trim() && !looksLikeAttachment(sib)) return true;
        sib = sib.nextElementSibling;
      }
      return false;
    }

    if (!list) {
      let walkNode = mds[0];
      let guard = 0;
      while (walkNode && walkNode.parentElement && guard++ < 10) {
        if (hasNonMdSibling(walkNode)) { list = walkNode.parentElement; break; }
        walkNode = walkNode.parentElement;
      }
    }

    if (!list) {
      let container = mds[0];
      for (let i = 1; i < mds.length; i++) container = lca(container, mds[i]);
      if (!container) return [];
      let g2 = 0;
      while (container && container.parentElement && g2++ < 12) {
        const n = Array.prototype.slice.call(container.children || []).length;
        if (n >= 2) break;
        container = container.parentElement;
      }
      let cur = container, d = 0;
      for (; d < 8 && cur; d++) {
        const kids = Array.prototype.slice.call(cur.children || []);
        if (!kids.length) break;
        let withMd = 0;
        kids.forEach(function (k) { if (k.querySelector && k.querySelector(MD_SEL)) withMd++; });
        if (withMd >= 2) { list = cur; break; }
        if (kids.length === 1) { cur = kids[0]; continue; }
        list = cur; break;
      }
      if (!list) list = container;
    }
    if (list) listCache = { doc: doc, el: list };

    const out = [];
    const seen = new Set();

    const collectedB = [];
    Array.prototype.slice.call(list.children || []).forEach(function (k) {
      if (!considered(k)) return;
      const mdEl = mdIn(k);

      if (mdEl && onParsed) { try { onParsed(mdEl); } catch (e) {} }
      const m = mkFromEl(mdEl ? 'assistant' : 'user', k, mdEl);
      if (m && !seen.has(m.text)) { seen.add(m.text); collectedB.push({ el: k, msg: m }); }
    });

    sortByVisual(collectedB);
    collectedB.forEach(function (x) { out.push(x.msg); });

    const hasU2 = out.some(function (m) { return m.role === 'user'; });
    if (out.length >= 2 && hasU2) return dedupe(out, { strict: true });

    const alt = [];
    const seen2 = new Set();
    const collectedC = [];
    Array.prototype.slice.call(list.children || []).forEach(function (k) {
      if (!considered(k)) return;
      if (mdIn(k)) return;
      const m = mkFromEl('user', k);
      if (m && !seen2.has(m.text)) { seen2.add(m.text); collectedC.push({ el: k, msg: m }); }
    });
    mds.forEach(function (el) {
      if (!considered(el)) return;
      let host = el;
      for (let i = 0; i < 3 && host.parentElement; i++) host = host.parentElement;
      const m = mkFromEl('assistant', host, el);
      if (m && !seen2.has(m.text)) { seen2.add(m.text); collectedC.push({ el: host, msg: m }); }
    });
    sortByVisual(collectedC);
    collectedC.forEach(function (x) { alt.push(x.msg); });
    return dedupe(alt, { strict: false });
  }

  function sortBySeq(records) {
    if (!records || records.length < 2) return records || [];
    const arr = records.slice();
    arr.sort(function (a, b) {
      const sa = (a && typeof a.seq === 'number') ? a.seq : 0;
      const sb = (b && typeof b.seq === 'number') ? b.seq : 0;
      if (sa !== sb) return sb - sa;
      const oa = (a && typeof a.order === 'number') ? a.order : 0;
      const ob = (b && typeof b.order === 'number') ? b.order : 0;
      return oa - ob;
    });
    return arr;
  }

  function checkOrder(list) {
    const r = { ok: true, reasons: [], maxRun: 0, roleRuns: [] };
    if (!list || !list.length) return r;
    let run = 1, cur = list[0].role;
    for (let i = 1; i < list.length; i++) {
      if (list[i].role === cur) run++;
      else { if (run > r.maxRun) r.maxRun = run; r.roleRuns.push(cur + 'x' + run); cur = list[i].role; run = 1; }
    }
    if (run > r.maxRun) r.maxRun = run;
    r.roleRuns.push(cur + 'x' + run);

    if (r.maxRun >= 3) { r.ok = false; r.reasons.push('连续 ' + r.maxRun + ' 条同角色消息（提问/回答被分成两堆）'); }
    if (list[0].role === 'assistant') { r.ok = false; r.reasons.push('首条是「回答」但前面没有提问（顺序错位）'); }
    if (list[list.length - 1].role === 'user') { r.ok = false; r.reasons.push('末条是「提问」但没有对应回答'); }
    return r;
  }

  function finalOrder(list) {
    if (!Array.isArray(list) || list.length < 2) return list;
    let total = 0, numeric = 0;
    list.forEach(function (m) {
      if (!m || m.id == null || String(m.id) === '') return;
      total++;
      if (Number.isFinite(Number(String(m.id)))) numeric++;
    });
    if (total && numeric >= total * 0.8) return sortById(list);
    return sortByTime(list);
  }

  function sortById(list) {
    if (!Array.isArray(list) || list.length < 2) return list;
    let total = 0, numeric = 0;
    list.forEach(function (m) {
      if (!m || m.id == null || String(m.id) === '') return;
      total++;
      if (Number.isFinite(Number(String(m.id)))) numeric++;
    });
    if (!total || numeric < total * 0.8) return list;
    const idx = list.map(function (m, i) { return i; });
    idx.sort(function (a, b) {
      const na = Number(String(list[a].id));
      const nb = Number(String(list[b].id));
      if (na !== nb) return na - nb;
      return a - b;
    });
    return idx.map(function (i) { return list[i]; });
  }

  function qaBadRatio(list) {
    if (!Array.isArray(list) || list.length < 2) return 0;
    const byId = new Map();
    list.forEach(function (m) {
      if (m && m.id != null && String(m.id) !== '') byId.set(String(m.id), m);
    });
    if (byId.size < 2) return 0;
    const pos = new Map();
    list.forEach(function (m, i) { pos.set(m, i); });
    let bad = 0, checked = 0;
    list.forEach(function (m) {
      if (!m || m.role !== 'assistant' || m.parent == null) return;
      const p = byId.get(String(m.parent));
      if (!p || p.role !== 'user') return;
      checked++;
      if (pos.get(m) < pos.get(p)) bad++;
    });
    if (!checked) return 0;
    return bad / checked;
  }

  var _OUT = {
    pickRole,
    strFrom,
    normalizeOne,
    pairByParent,
    qaBadRatio,
    sortById,
    finalOrder,
    scanMessages,
    dedupe,
    normCore,
    extract,
    mergeMessages,
    estimateTokens,
    compressLocally,
    toMarkdown,
    sortByTime,
    stripCitations,
    escapeHtml,
    sortBySeq,
    checkOrder,
    sortByVisual,
    detectVersion,
    configure,
    getConfig,
    isNoiseText,
    mdToHtml,
    messagesToHtml,
    toHtmlDoc,
    toWordDoc,
    buildContinuation,
    collapseBranches,
    extractFromDom,
    detectVirtualList: function (d) {
      try {
        const vl = d.querySelector('.ds-virtual-list, [class*="virtual-list"]');
        if (!vl) return null;
        const vis = d.querySelector('.ds-virtual-list-visible-items, [class*="visible-items"]');
        return { rendered: vis ? vis.children.length : 0 };
      } catch (e) { return null; }
    },
  };

  if (typeof window !== 'undefined') { try { window.DSCB = _OUT; } catch (e) {} }
  return _OUT;
  
})();

var DSCBAPI = (function () {
"use strict";


  const C = DSCB;

  const BASE = 'https://chat.deepseek.com/api/v0';
  const APP_VERSION = '20241129.1';

  let bearer = '';
  const tokenWaiters = [];

  function setToken(t) {
    if (!t || bearer === t) return;
    bearer = t;

    while (tokenWaiters.length) {
      const w = tokenWaiters.shift();
      try { w(t); } catch (e) {}
    }
  }

  function waitToken(timeoutMs) {
    if (bearer) return Promise.resolve(bearer);
    return new Promise(function (resolve, reject) {
      const timer = setTimeout(function () {
        const i = tokenWaiters.indexOf(w);
        if (i > -1) tokenWaiters.splice(i, 1);
        reject(new Error('未捕获到 Authorization，请打开/切换一次对话'));
      }, timeoutMs || 8000);
      function w(t) {
        clearTimeout(timer);
        resolve(t);
      }
      tokenWaiters.push(w);
    });
  }

  function readUserToken(storage) {
    const st = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!st || typeof st.getItem !== 'function') return null;
    const raw = st.getItem('userToken');
    if (!raw) return null;

    try {
      const o = JSON.parse(raw);
      if (o && typeof o.value === 'string' && o.value.trim()) return o.value.trim();

      const k = ['token', 'access_token', 'accessToken', 'jwt'].find(function (k) {
        return o && typeof o[k] === 'string' && o[k].trim();
      });
      if (k) return o[k].trim();
    } catch (e) {}

    const t = String(raw).trim();
    if (t && !t.startsWith('{')) return t;
    return null;
  }

  var JWT_RE = /[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/;

  function tokenFromString(v) {
    if (!v) return null;
    var s = String(v);
    try {
      var o = JSON.parse(s);
      if (o && typeof o === 'object') {
        var keys = ['token', 'access_token', 'accessToken', 'bearer', 'jwt', 'id_token', 'authToken'];
        for (var i = 0; i < keys.length; i++) {
          if (typeof o[keys[i]] === 'string' && o[keys[i]].length > 15) return o[keys[i]];
        }

        var u = o.user || o.data;
        if (u && typeof u === 'object') {
          for (var j = 0; j < keys.length; j++) {
            if (typeof u[keys[j]] === 'string' && u[keys[j]].length > 15) return u[keys[j]];
          }
        }
      }
    } catch (e) {}
    var m = JWT_RE.exec(s);
    if (m) return m[0];
    return null;
  }

  function scanStorageToken() {

    try {
      const ut = readUserToken();
      if (ut) { setToken(ut); return ut; }
    } catch (e) {}
    if (bearer) return bearer;
    var stores = [];
    try { if (typeof localStorage !== 'undefined') stores.push(localStorage); } catch (e) {}
    try { if (typeof sessionStorage !== 'undefined') stores.push(sessionStorage); } catch (e) {}
    for (var i = 0; i < stores.length; i++) {
      var st = stores[i];
      try {
        for (var j = 0; j < st.length; j++) {
          var k = st.key(j);
          if (!k) continue;
          var v = st.getItem(k);
          if (!v || v.length < 15) continue;

          var looks = /(token|auth|bearer|access|jwt|session|user|account|login)/i.test(k);
          if (!looks && !JWT_RE.test(v)) continue;
          var t = tokenFromString(v);
          if (t) { setToken(t); return bearer; }
        }
      } catch (e) {}
    }
    return scanGlobalToken();
  }

  function scanGlobalToken() {
    try {
      var w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : ((typeof window !== 'undefined') ? window : null);
      if (!w) return null;
      var names = ['__user', '__USER', 'user', '__auth', 'auth', '__token', 'token',
                   '__store', '__STATE__', '__INITIAL_STATE__', '__NUXT__', '__DS_USER__'];
      for (var i = 0; i < names.length; i++) {
        try {
          var o = w[names[i]];
          if (!o) continue;
          var t = (typeof o === 'string') ? tokenFromString(o) : tokenFromString(JSON.stringify(o));
          if (t) { setToken(t); return bearer; }
        } catch (e) {}
      }
    } catch (e) {}
    return null;
  }

  function grabAuth(v) {
    if (!v) return;
    const s = String(v);

    const m = /^Bearer\s+(.+)$/i.exec(s);
    setToken(m ? m[1].trim() : s.trim());
  }

  function installFetchCapture() {
    const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    if (!w.fetch) return;
    const orig = w.fetch;
    function hooked() {
      const args = arguments;
      try {
        const init = args[1];
        if (init && init.headers) {
          const h = init.headers;
          if (typeof h.get === 'function') {
            try { grabAuth(h.get('authorization') || h.get('Authorization')); } catch (e) {}
          } else if (typeof h === 'object') {
            grabAuth(h.authorization || h.Authorization);
          }
        }
      } catch (e) {}
      return orig.apply(this, args);
    }
    try { w.fetch = hooked; } catch (e) {}
  }

  function installXHRCapture() {
    const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    if (!w.XMLHttpRequest) return;
    const P = w.XMLHttpRequest.prototype;
    const origSet = P.setRequestHeader;
    P.setRequestHeader = function (name, value) {
      try {
        if (String(name).toLowerCase() === 'authorization') grabAuth(value);
      } catch (e) {}
      return origSet.apply(this, arguments);
    };
  }

  function sessionIdFromUrl(url) {
    try {
      const u = url || (typeof location !== 'undefined' ? location.href : '');
      const path = String(u).replace(/^https?:\/\/[^/]+/, '').split('?')[0];

      const m = /\/a\/chat\/s\/([^/?#]+)/.exec(path);
      if (m && m[1]) return decodeURIComponent(m[1]);
    } catch (e) {}
    try {
      const u = url || (typeof location !== 'undefined' ? location.href : '');
      const q = new URLSearchParams(String(u).split('?')[1] || '');
      const v = q.get('chat_session_id') || q.get('session_id') || q.get('id');
      if (v) return v;
    } catch (e) {}
    return '';
  }

  function shareIdFromUrl(url) {
    try {
      const u = url || (typeof location !== 'undefined' ? location.href : '');
      const path = String(u).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
      const m = /\/share\/([^/?#]+)/.exec(path);
      if (m && m[1]) return decodeURIComponent(m[1]);
    } catch (e) {}
    return '';
  }

  function isLoginPage(doc) {
    try {
      const d = doc || (typeof document !== 'undefined' ? document : null);
      if (!d) return false;
      const txt = String((d.body && d.body.textContent) || '').replace(/\s+/g, '');
      if (!txt) return false;

      const marks = ['发送验证码', '注册登录即代表', '密码登录', '微信扫码登录', '使用Apple账号登录'];
      const hit = marks.filter(function (m) { return txt.indexOf(m.replace(/\s+/g, '')) > -1; });

      if (hit.length >= 1) {
        const hasChat = !!(d.querySelector && (d.querySelector('.ds-message') || d.querySelector('.ds-markdown')));
        return !hasChat;
      }
    } catch (e) {}
    return false;
  }

  function pageType(url) {
    if (shareIdFromUrl(url)) return 'share';
    if (sessionIdFromUrl(url)) return 'chat';
    return 'unknown';
  }

  const DIAG = { calls: 0, lastUrl: '', lastStatus: null, lastKeys: '', lastBody: '', lastError: '', branchNote: '', structure: '' };

  let RAW = null;
  function keepRaw(j) { try { RAW = JSON.parse(JSON.stringify(j)); } catch (e) { RAW = null; } }

  function summary(j) {
    try {
      const d = j && j.data;
      const bd = d && d.biz_data;
      const arr = bd && bd.chat_messages;
      const sess = bd && bd.chat_session;
      const first = Array.isArray(arr) && arr.length ? arr[0] : null;
      return 'code=' + (j && j.code) +
        ' | data键[' + (d ? Object.keys(d).join(',') : '无') + ']' +
        ' | biz_data键[' + (bd ? Object.keys(bd).join(',') : '无') + ']' +
        ' | chat_messages条数=' + (Array.isArray(arr) ? arr.length : '非数组') +
        ' | current_message_id=' + (sess && sess.current_message_id != null ? sess.current_message_id : '无') +
        ' | 首条字段[' + (first ? Object.keys(first).join(',') : '无') + ']';
    } catch (e) { return '摘要失败'; }
  }
  function snapshot(url, status, parsed, rawText, err) {
    try {
      DIAG.calls++;
      DIAG.lastUrl = String(url || '').slice(0, 300);
      DIAG.lastStatus = (status === null || status === undefined) ? null : status;
      if (parsed && typeof parsed === 'object') {
        try { DIAG.lastKeys = Object.keys(parsed).join(',').slice(0, 200); } catch (e) { DIAG.lastKeys = ''; }
        try { DIAG.lastBody = JSON.stringify(parsed).slice(0, 400); } catch (e) { DIAG.lastBody = ''; }
      } else {
        DIAG.lastBody = String(rawText || parsed || '').slice(0, 400);
      }
      if (err) DIAG.lastError = String(err.message || err).slice(0, 200);
    } catch (e) {}
  }

  function apiGet(path, params) {
    let url = BASE + path;
    if (params) {
      const q = Object.keys(params)
        .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
        .join('&');
      if (q) url += (url.indexOf('?') > -1 ? '&' : '?') + q;
    }

    const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(function () { try { ctl.abort(); } catch (e) {} }, 12000) : null;

    const headers = {
      Accept: 'application/json',
      'x-app-version': APP_VERSION,
      'x-client-platform': 'web',
      'x-client-locale': 'zh_CN',
    };
    if (bearer) headers.Authorization = 'Bearer ' + bearer;
    const init = {
      method: 'GET',
      headers: headers,
      credentials: 'include',
      cache: 'no-store',
    };
    if (ctl) init.signal = ctl.signal;
    return w.fetch(url, init).then(function (r) {
      if (timer) clearTimeout(timer);
      const st = r.status;
      if (!r.ok) {

        return r.text().catch(function () { return ''; }).then(function (txt) {
          snapshot(url, st, null, txt, null);

          let hint = '';
          if (st === 401 || st === 403) hint = '未登录或登录已过期，请先登录 DeepSeek 网页版';
          else if (st === 404) hint = '接口路径可能已变更';
          else if (st >= 500) hint = '服务器错误，稍后重试';
          throw new Error('HTTP ' + st + (hint ? '（' + hint + '）' : '') +
            (txt ? ' · ' + String(txt).slice(0, 120) : ''));
        });
      }
      return r.json().then(function (j) {
        snapshot(url, st, j, '', null);
        try { keepRaw(j); DIAG.structure = summary(j); } catch (e) {}
        return j;
      }).catch(function (e) {
        snapshot(url, st, null, '', e);
        throw new Error('响应不是 JSON');
      });
    }).catch(function (e) {
      if (timer) clearTimeout(timer);
      if (e && e.name === 'AbortError') throw new Error('请求超时（12s）');
      throw e;
    });
  }

  function fetchHistoryPage(sessionId, cursor, pageSize) {

    const q = { chat_session_id: sessionId, cache_version: '0' };
    if (cursor) q.cursor = cursor;
    if (pageSize) q.count = pageSize;
    return apiGet('/chat/history_messages', q);
  }

  function fetchHistory(sessionId) {
    return fetchHistoryPage(sessionId, null);
  }

  function nextCursor(json) {
    try {
      const bd = json && json.data && json.data.biz_data;
      const c = bd && (bd.next_cursor || bd.cursor || bd.nextCursor);
      if (c && String(c).length && String(c) !== '0' && String(c) !== 'null') return String(c);
      const d = json && json.data;
      const c2 = d && (d.next_cursor || d.cursor);
      if (c2 && String(c2).length && String(c2) !== '0' && String(c2) !== 'null') return String(c2);
    } catch (e) {}
    return null;
  }

  function hasMore(json) {
    try {
      const bd = json && json.data && json.data.biz_data;
      if (bd && typeof bd.has_more !== 'undefined') return !!bd.has_more;
      const d = json && json.data;
      if (d && typeof d.has_more !== 'undefined') return !!d.has_more;
    } catch (e) {}
    return null;
  }

  async function fetchAllHistory(sessionId, opts) {
    const o = Object.assign({ maxPages: 60, delayMs: 260, onProgress: null }, opts || {});
    let cursor = null;
    let all = [];
    for (let page = 0; page < o.maxPages; page++) {
      const json = o.fetchImpl
        ? await o.fetchImpl(cursor
            ? '/api/v0/chat/history_messages?chat_session_id=' + sessionId + '&cursor=' + encodeURIComponent(cursor)
            : '/api/v0/chat/history_messages?chat_session_id=' + sessionId, { headers: {} })
        : await fetchHistoryPage(sessionId, cursor);
      const parsed = json && typeof json.json === 'function' ? await json.json() : json;

      try {
        const bc = parsed && (parsed.code !== undefined ? parsed.code : null);
        const bm = parsed && parsed.msg ? String(parsed.msg) : '';
        if (bc && bc !== 0 && /INVALID_TOKEN|NOT_LOGIN|UNAUTHORIZED/i.test(bm)) {
          throw new Error('接口要求登录凭证（' + bm + '）· 未能自动取得 token');
        }
      } catch (e) { if (e && e.message && /登录凭证/.test(e.message)) throw e; }
      const msgs = parseHistory(parsed);
      if (!msgs.length) break;
      all = all.concat(msgs);
      if (o.onProgress) o.onProgress(all.length, page + 1);
      cursor = nextCursor(parsed);
      const more = hasMore(parsed);

      if (!cursor && more === false) break;
      if (!cursor) break;
      if (o.delayMs && page < o.maxPages - 1) await new Promise((r) => setTimeout(r, o.delayMs));
    }

    return C.mergeMessages([], all, { strict: true });
  }

  function fetchSessions(count) {
    return apiGet('/chat_session/fetch_page', { count: count || 100 });
  }

  function fetchMe() {
    return apiGet('/users/current');
  }

  function rebuildBranch(bizData) {
    const sess = bizData && bizData.chat_session;
    const arr = bizData && bizData.chat_messages;
    if (!sess || !Array.isArray(arr) || !arr.length) return [];
    const byId = new Map();
    arr.forEach(function (m) {
      const id = (m && m.message_id != null) ? String(m.message_id).trim() : '';
      if (id && !byId.has(id)) byId.set(id, m);
    });
    let cur = (sess.current_message_id != null) ? String(sess.current_message_id).trim() : '';
    if (!cur || !byId.has(cur)) {

      const childSet = new Set();
      arr.forEach(function (m) {
        const p = (m && m.parent_id != null) ? String(m.parent_id).trim() : '';
        if (p) childSet.add(p);
      });
      const tail = arr.filter(function (m) {
        const id = (m && m.message_id != null) ? String(m.message_id).trim() : '';
        return id && !childSet.has(id);
      });
      if (tail.length === 1) cur = String(tail[0].message_id).trim();
    }
    if (!cur || !byId.has(cur)) return arr;
    const chain = [];
    const seen = new Set();
    while (cur && byId.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      const m = byId.get(cur);
      chain.unshift(m);
      const p = (m && m.parent_id != null) ? String(m.parent_id).trim() : '';
      cur = (p && byId.has(p)) ? p : '';
    }

    if (chain.length && chain.length < arr.length * 0.5) {
      try {
        DIAG.branchNote = '分支链只覆盖 ' + chain.length + '/' + arr.length + ' 条（疑似断链），已放弃重建改用原序';
      } catch (e) {}
      return arr;
    }
    try { DIAG.branchNote = '分支链覆盖 ' + chain.length + '/' + arr.length + ' 条'; } catch (e) {}
    return chain.length ? chain : arr;
  }

  function parseHistory(json) {

    let ordered = null;
    try {
      const bd = json && json.data && json.data.biz_data;
      if (bd && bd.chat_messages && bd.chat_messages.length) ordered = rebuildBranch(bd);
    } catch (e) {}
    if (ordered && ordered.length) {
      const fake = { data: { biz_data: { chat_messages: ordered } } };
      const msgs = C.extract(fake);

      return msgs;
    }
    const msgs = C.extract(json);
    return C.collapseBranches(msgs, { keep: 'latest' });
  }

  function parseSessions(json) {
    const out = [];
    try {
      const bd = json && json.data && json.data.biz_data;
      const arr = (bd && (bd.chat_sessions || bd.sessions || bd.list)) || [];
      arr.forEach(function (s) {
        if (!s || !s.id) return;
        out.push({ id: String(s.id), title: s.title || '(无标题)', updated: s.updated_at || s.updated || '' });
      });
    } catch (e) {}
    return out;
  }

  async function loadCurrentSession(sessionId, opts) {

    const o = opts || {};
    let firstErr = null;
    const sid = sessionId || sessionIdFromUrl();
    if (!sid) throw new Error('无法从 URL 获取会话 ID，请打开一个对话');
    if (o.token) setToken(o.token);

    if (!o.token && !o.skipTokenWait) {
      try {
        const msgs = await fetchAllHistory(sid, { fetchImpl: o.fetchImpl, onProgress: o.onProgress });
        if (msgs.length) {
          return { messages: msgs, count: msgs.length, source: 'API 分页全量(cookie)', sessionId: sid };
        }
      } catch (e) {
        firstErr = e;
      }
      try { await waitToken(o.timeoutMs || 2500); } catch (e) {  }
    }

    let msgs = [];
    try {
      msgs = await fetchAllHistory(sid, { fetchImpl: o.fetchImpl, onProgress: o.onProgress });
    } catch (e) {
      const why = String((e && e.message) || e);
      const hint = firstErr ? '（无 token 直连也失败：' + String((firstErr && firstErr.message) || firstErr) + '）' : '';
      throw new Error(why + hint);
    }
    if (!msgs.length) throw new Error('API 返回为空，可能接口已变更（可改用滚动+DOM 抓取）');
    return { messages: msgs, count: msgs.length, source: 'API 分页全量', sessionId: sid };
  }

  async function loadAllSessions(opts) {
    const o = Object.assign({ limit: 50, delayMs: 800, onProgress: null }, opts || {});
    await waitToken(8000);
    const sj = await fetchSessions(100);
    let list = parseSessions(sj);
    if (!list.length) throw new Error('未取到会话列表');
    list = list.slice(0, o.limit);

    const out = [];
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (o.onProgress) o.onProgress(i + 1, list.length, s.title);
      try {
        const json = await fetchHistory(s.id);
        const msgs = parseHistory(json);
        if (msgs.length) out.push({ session: s, messages: msgs });
      } catch (e) {}

      if (o.delayMs && i < list.length - 1) {
        if (i > 0 && i % 5 === 0) await new Promise((r) => setTimeout(r, o.delayMs));
      }
    }
    return out;
  }

  const _OUT = {
    install: function () {
      installFetchCapture();
      installXHRCapture();
    },
    hasToken: function () { return !!bearer; },
    diag: function () { return DIAG; },
    rawSnapshot: function () { return RAW; },
    readUserToken: readUserToken,
    rebuildBranch: rebuildBranch,
    isLoginPage: isLoginPage,
    waitToken: waitToken,
    sessionIdFromUrl: sessionIdFromUrl,
    loadCurrentSession: loadCurrentSession,
    shareIdFromUrl: shareIdFromUrl,
    pageType: pageType,
    fetchAllHistory: fetchAllHistory,
    fetchHistoryPage: fetchHistoryPage,
    nextCursor: nextCursor,
    loadAllSessions: loadAllSessions,
    parseHistory: parseHistory,
    fetchSessions: fetchSessions,

    _setToken: setToken,
    scanStorageToken: scanStorageToken,
    scanGlobalToken: scanGlobalToken,
    tokenFromString: tokenFromString,
    _clearToken: function () { bearer = ''; },
    _getToken: function () { return bearer; },
  };

  (typeof window !== 'undefined' ? window : globalThis).DSCBAPI = _OUT;
  
})();


(function () {
  'use strict';

  const C = (typeof DSCB !== 'undefined' && DSCB)
    ? DSCB
    : ((typeof window !== 'undefined' && window.DSCB) ? window.DSCB : null);

  const ICONS = {
    download: 'M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z',
    doc:      'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z',
    code:     'M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z',
    txt:      'M4 4h16v2H4V4zm0 4h16v2H4V8zm0 4h10v2H4v-2zm0 4h16v2H4v-2zm0 4h10v2H4v-2z',
    rotate:   'M17.65 6.35A8 8 0 1 0 19.73 14h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
    close:    'M19 6.4L17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4z',
    bridge:   'M2 18h20v2H2v-2zM4 16V9a2 2 0 0 1 4 0v1h8V9a2 2 0 0 1 4 0v7h2v-7a4 4 0 0 0-2-3.46V4h-2v1.54A4 4 0 0 0 12 3a4 4 0 0 0-4 2.54V4H6v1.54A4 4 0 0 0 4 9v7z',
    html:     'M3 3h18v2H3V3zm0 4h18v2H3V7zm0 4h12v2H3v-2zm0 4h18v2H3v-2zm0 4h12v2H3v-2z',
    pdf:      'M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 2v5h5l-5-5zM8 13h8v2H8v-2zm0 4h8v2H8v-2z',
    word:     'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm2.2 4.2l1.6 6.4 1.4-4.2 1.4 4.2 1.6-6.4',
    check:    'M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z',
    chevron:  'M7.4 8.6L12 13.2l4.6-4.6L18 10l-6 6-6-6 1.4-1.4z',
  };

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function icon(name, size) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size || '1em');
    svg.setAttribute('height', size || '1em');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', ICONS[name] || ICONS.download);
    svg.appendChild(p);
    return svg;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const CFG_KEY = 'dse_cfg_v1';

  const DEFAULT_CFG = {
    exportThinking: true,
    strictDedupe: true,
    compress: false,
    frontmatter: false,
    keepSingleChar: true,
  };

  const FAB_ICON_B64 = ('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'.indexOf('__') === 0) ? '' : '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';
  const SCRIPT_VERSION = '1.0.0';
  const SCRIPT_BUILD = '20261001';
  let cfg = Object.assign({}, DEFAULT_CFG);
  try {
    const saved = typeof GM_getValue === 'function' ? GM_getValue(CFG_KEY, null) : localStorage.getItem(CFG_KEY);
    if (saved) cfg = Object.assign(cfg, typeof saved === 'string' ? JSON.parse(saved) : saved);
  } catch (e) {}
  function saveCfg() {
    try {
      const str = JSON.stringify(cfg);
      if (typeof GM_setValue === 'function') GM_setValue(CFG_KEY, str);
      else localStorage.setItem(CFG_KEY, str);
    } catch (e) {}
  }

  let pool = [];
  let lastPath = location.pathname;
  let phase = 'idle';
  let lastSource = '';

  const parsed = new WeakSet();
  const parsedSig = new WeakMap();
  const parsedOrder = [];

  function elSig(el) {
    try {
      const md = el && el.querySelector ? el.querySelector('.ds-markdown') : null;
      const t = (md || el).textContent || '';
      return C.normCore(String(t).replace(/\s+/g, ' ').trim()).slice(0, 400);
    } catch (e) { return ''; }
  }

  function shouldSkip(el) {
    if (!parsed.has(el)) return false;
    const oldSig = parsedSig.get(el);
    const newSig = elSig(el);

    return oldSig === newSig && newSig !== '';
  }

  function markParsed(el) {
    parsed.add(el);
    parsedSig.set(el, elSig(el));
    if (parsedOrder.indexOf(el) < 0) parsedOrder.push(el);
  }

  function refreshTail(n) {
    for (let i = 0; i < n && parsedOrder.length; i++) {
      const el = parsedOrder.pop();
      if (el) { try { parsed.delete(el); parsedSig.delete(el); } catch (e) {} }
    }
  }
  function clearParsed() {
    while (parsedOrder.length) {
      const el = parsedOrder.pop();
      if (el) { try { parsed.delete(el); parsedSig.delete(el); } catch (e) {} }
    }
  }

  let stepNo = -1;
  let curScrollTop = 0;
  const seqMap = new Map();

  function recordSeq(msgs) {
    try {

      const sorted = msgs.slice().sort(function (a, b) {
        const ta = (typeof a._top === 'number') ? a._top : Infinity;
        const tb = (typeof b._top === 'number') ? b._top : Infinity;
        return ta - tb;
      });
      sorted.forEach(function (m, i) {
        const k = C.normCore(m.text);
        if (!k) return;

        try {
          if (m._vkey != null && Number.isFinite(m._vkey) && !keyMap.has(k)) keyMap.set(k, m._vkey);
        } catch (e) {}
        const old = seqMap.get(k);
        if (!old) {

          seqMap.set(k, { seq: stepNo, order: i, msg: m });
          return;
        }

        if ((m.text || '').length > (old.msg.text || '').length) old.msg = m;
      });
    } catch (e) {}
  }

  const keyMap = new Map();
  function readItemKey(el) {
    try {
      let n = el, guard = 0;
      while (n && guard++ < 8) {
        if (n.getAttribute) {
          const v = n.getAttribute('data-virtual-list-item-key');
          if (v != null && String(v).trim() !== '') {
            const num = Number(String(v).trim());
            if (Number.isFinite(num)) return num;
          }
        }
        n = n.parentElement;
      }
    } catch (e) {}
    return null;
  }

  let orderAuthority = 'scroll';

  let orderBasis = '';
  let apiFailReason = '';
  let apiDiag = '';
  let scrollDiag = '';

  function orderedPool() {
    try {

      if (orderAuthority === 'api' && !pool.some(function (m) { return m && m._vkey == null; })) {
        return pool;
      }
      if (!seqMap.size) return pool;
      if (seqMap.size < pool.length) return pool;

      const hasKey = function (m) { return m && m._vkey != null && Number.isFinite(m._vkey); };
      const withKey = pool.filter(hasKey);
      if (withKey.length > 1 && withKey.length >= pool.length * 0.5) {
        const noKey = pool.filter(function (m) { return !hasKey(m); });
        return withKey.slice().sort(function (a, b) { return a._vkey - b._vkey; }).concat(noKey);
      }

      const recs = Array.from(seqMap.values());

      if (keyMap.size >= pool.length * 0.5 && keyMap.size > 1) {
        orderBasis = '虚拟列表索引';
        return recs
          .filter(function (r) { return keyMap.has(C.normCore(r.msg.text)); })
          .sort(function (a, b) {
            return keyMap.get(C.normCore(a.msg.text)) - keyMap.get(C.normCore(b.msg.text));
          })
          .map(function (x) { return x.msg; })
          .concat(recs
            .filter(function (r) { return !keyMap.has(C.normCore(r.msg.text)); })
            .map(function (x) { return x.msg; }));
      }

      recs.sort(function (a, b) {
        if (a.seq !== b.seq) return b.seq - a.seq;
        return a.order - b.order;
      });
      let out = recs.map(function (x) { return x.msg; });
      try { if (C.sortById) out = C.sortById(out); } catch (e) {}
      return out;
    } catch (e) { return pool; }
  }

  function grabFromDom(prepend) {
    try {
      refreshTail(3);
      try {
        const sc = findScrollContainer();
        if (sc) curScrollTop = sc.scrollTop;
      } catch (e) {}
      const msgs = C.extractFromDom(document, {
        skip: shouldSkip,
        onParsed: markParsed,
        scrollTop: (typeof curScrollTop === 'number') ? curScrollTop : 0,
      });
      if (msgs.length) {
        pool = prepend && pool.length
          ? C.mergeMessages(msgs, pool, { strict: cfg.strictDedupe })
          : C.mergeMessages(pool, msgs, { strict: cfg.strictDedupe });
        recordSeq(msgs);
        updateBadge();
      }
      return msgs.length;
    } catch (e) { logErr('DOM 解析', e); return 0; }
  }

  const API_PAT = /\/(api\/v\d+\/)?(chat|message|history|session|conversation)/i;
  function isTarget(url) {
    if (!url) return false;
    const u = String(url);
    if (u.indexOf('/api/') === -1 && !/chat|message|history/i.test(u)) return false;
    return API_PAT.test(u);
  }
  function feed(json) {
    try {
      const msgs = C.extract(json);
      if (!msgs.length) return;
      const merged = C.mergeMessages(pool, msgs, { strict: cfg.strictDedupe });
      if (merged.length > pool.length) { pool = merged; updateBadge(); }
    } catch (e) {}
  }
  function feedSSE(text) {
    if (!text) return;
    try { feed(JSON.parse(text)); return; } catch (e) {}
    String(text).split(/\r?\n/).forEach(function (line) {
      const m = /^\s*data:\s*(.+)$/.exec(line);
      if (!m || m[1] === '[DONE]') return;
      try { feed(JSON.parse(m[1])); } catch (e) {}
    });
  }
  function installFetchHook() {
    const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    if (!w.fetch) return;
    const orig = w.fetch;
    w.fetch = function () {
      const args = arguments;
      let url = '';
      try { const a0 = args[0]; url = typeof a0 === 'string' ? a0 : a0 && a0.url ? a0.url : ''; } catch (e) {}
      const p = orig.apply(this, args);
      try {
        if (isTarget(url) && p && typeof p.then === 'function') {
          p.then(function (resp) {
            try {
              if (resp && typeof resp.clone === 'function') {
                let ct = '';
                try { ct = resp.headers && resp.headers.get ? resp.headers.get('content-type') || '' : ''; } catch (e) {}
                if (/stream/i.test(ct)) resp.clone().text().then(feedSSE).catch(function () {});
                else resp.clone().json().then(feed).catch(function () {
                  try { resp.clone().text().then(feedSSE).catch(function () {}); } catch (e2) {}
                });
              }
            } catch (e) {}
            return resp;
          }).catch(function () {});
        }
      } catch (e) {}
      return p;
    };
  }
  function installXHRHook() {
    const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    if (!w.XMLHttpRequest) return;
    const P = w.XMLHttpRequest.prototype;
    const origOpen = P.open, origSend = P.send;
    P.open = function () {
      try { this.__dse_url = arguments[1]; } catch (e) {}
      return origOpen.apply(this, arguments);
    };
    P.send = function () {
      try {
        const self = this;
        if (isTarget(self.__dse_url)) {
          self.addEventListener('load', function () {
            try {
              const txt = self.responseText;
              if (txt && txt.length < 20 * 1024 * 1024) {
                try { feed(JSON.parse(txt)); } catch (e2) { feedSSE(txt); }
              }
            } catch (e) {}
          });
        }
      } catch (e) {}
      return origSend.apply(this, arguments);
    };
  }

  let scCache = null;
  function findScrollContainer() {
    if (scCache && scCache.isConnected) return scCache;
    const mds = document.querySelectorAll('.ds-markdown, [class*="markdown"]');
    if (!mds.length) return null;
    let el = mds[0], guard = 0;
    while (el && el !== document.body && guard++ < 15) {
      try {
        if (el.scrollHeight > el.clientHeight + 40 && /auto|scroll|overlay/.test(getComputedStyle(el).overflowY)) { scCache = el; return el; }
      } catch (e) {}
      el = el.parentElement;
    }
    el = mds[0]; guard = 0;
    while (el && guard++ < 15) {
      try { if (el.scrollHeight > el.clientHeight + 40) { scCache = el; return el; } } catch (e) {}
      el = el.parentElement;
    }
    return null;
  }

  async function waitStable(sc, ms) {
    try {
      if (typeof requestAnimationFrame === 'function') {
        await new Promise(function (r) {
          requestAnimationFrame(function () { requestAnimationFrame(function () { r(); }); });
        });
      }
    } catch (e) {}
    await sleep(ms || 260);
    try { curScrollTop = sc.scrollTop; } catch (e) {}
    await sleep(60);
    try { curScrollTop = sc.scrollTop; } catch (e) {}
  }

  async function waitStable(sc, ms) {
    try {
      if (typeof requestAnimationFrame === 'function') {
        await new Promise(function (r) {
          requestAnimationFrame(function () { requestAnimationFrame(function () { r(); }); });
        });
      }
    } catch (e) {}
    await sleep(ms || 260);
    try { curScrollTop = sc.scrollTop; } catch (e) {}
    await sleep(60);
    try { curScrollTop = sc.scrollTop; } catch (e) {}
  }

  async function measureTotal(sc, onProgress) {
    const H = sc.clientHeight || 600;
    let lastH = sc.scrollHeight, stuck = 0;

    if (lastH <= H * 3) {
      try { sc.scrollTop = sc.scrollHeight; } catch (e) {}
      return { total: lastH, viewport: H, skipped: true };
    }
    const t0 = Date.now();
    for (let i = 0; i < 200; i++) {
      if (Date.now() - t0 > 25000) break;
      const before = sc.scrollTop;
      if (before <= 0) { await sleep(300); break; }

      sc.scrollTop = Math.max(0, before - Math.floor(H * 1.0));
      await sleep(160);
      if (onProgress) onProgress(i + 1, 0, pool.length, 0, 'measure');
      const curH = sc.scrollHeight;
      if (curH <= lastH) { if (++stuck >= 10) break; } else stuck = 0;
      lastH = curH;
      if (sc.scrollTop <= 0) {

        await sleep(400);
        if (sc.scrollHeight > lastH) { lastH = sc.scrollHeight; stuck = 0; continue; }
        break;
      }
    }

    try { sc.scrollTop = sc.scrollHeight; } catch (e) {}
    await sleep(220);
    try { curScrollTop = sc.scrollTop; } catch (e) {}
    return { total: sc.scrollHeight || lastH, viewport: H };
  }

  async function scrollLoadAll(onProgress) {
    const sc = findScrollContainer();
    if (!sc) {
      grabFromDom(false);
      return { ok: true, msg: '已抓取 ' + pool.length + ' 条', source: 'DOM' };
    }

    const STEP_RATIO = 0.4;
    const MAX_STEPS = 4000;

    if (onProgress) onProgress(0, 0, pool.length, 0, 'measure');
    const mz = await measureTotal(sc, onProgress);
    const TOTAL = mz.total, VH = mz.viewport || sc.clientHeight || 600;
    const stepPx = Math.max(180, Math.floor(VH * STEP_RATIO));

    const estSteps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(TOTAL / stepPx)));

    let perStepMs = 340;

    let lastH = sc.scrollHeight, lastN = pool.length, topStuck = 0;
    let stepsRun = 0, topIdle = 0, noNewStreak = 0, stepScale = 1;

    for (let i = 0; i < MAX_STEPS; i++) {
      const tStep = Date.now();
      stepsRun = i;
      stepNo = i;

      const px = Math.max(180, Math.floor(VH * Math.min(0.9, STEP_RATIO * stepScale)));
      const beforeTop = sc.scrollTop;
      sc.scrollTop = Math.max(0, beforeTop - px);
      const movedPx = beforeTop - sc.scrollTop;
      curScrollTop = sc.scrollTop;

      await waitStable(sc, px > VH * 0.6 ? 420 : 260);
      curScrollTop = sc.scrollTop;

      const n0 = pool.length;
      grabFromDom(true);
      const grew = sc.scrollHeight > lastH;
      const gotNew = pool.length > n0 || pool.length > lastN;
      lastH = sc.scrollHeight;
      lastN = pool.length;

      const spent = Date.now() - tStep;
      perStepMs = Math.round(perStepMs * 0.7 + spent * 0.3);
      const etaSec = Math.max(0, Math.ceil(((estSteps - i - 1) * perStepMs) / 1000));

      if (onProgress) onProgress(i + 1, estSteps, pool.length, i >= estSteps ? -1 : etaSec, 'grab');

      const atTop = (sc.scrollTop <= 0) || (movedPx <= 0);
      if (atTop) {
        if (!grew && !gotNew) { if (++topIdle >= 5) break; } else topIdle = 0;
      } else {
        topIdle = 0;
      }

      if (!grew && !gotNew) {
        if (++noNewStreak > 5) stepScale = Math.min(2.4, stepScale * 1.35);
      } else { noNewStreak = 0; stepScale = 1; }

      if (sc.scrollTop <= 0) {
        await sleep(400);
        const before = pool.length;
        grabFromDom(true);
        if (pool.length === before) { if (++topStuck >= 4) break; } else topStuck = 0;
      }
    }
    try { sc.scrollTop = sc.scrollHeight; } catch (e) {}

    try {
      const v = C.detectVirtualList(document);
      if (v && v.rendered) {
        scrollDiag = '滚动 ' + (stepsRun + 1) + ' 步 · 窗口渲染 ' + v.rendered + ' 条 · 抓到 ' + pool.length + ' 条';
        if (pool.length <= v.rendered) {
          scrollDiag += '（抓到的条数 ≈ 窗口条数，可能没滚起来/页面未加载更多）';
        }
      } else {
        scrollDiag = '滚动 ' + (stepsRun + 1) + ' 步 · 抓到 ' + pool.length + ' 条';
      }
    } catch (e) {}
    return { ok: true, msg: '抓取完成：共 ' + pool.length + ' 条', source: 'DOM 滚动' };
  }

  function fmtProgress(cur, total, n, etaSec, stage) {
    if (stage === 'measure') return '估算对话长度… (' + cur + ')';

    if (etaSec < 0) return '抓 ' + n + ' 条 · 深入中 ' + cur + ' 步';
    let t = '抓 ' + n + ' 条 · ' + cur + '/' + total;
    if (etaSec > 0) t += ' · 还需 ' + etaSec + 's';
    return t;
  }

  async function grabAll(onProgress) {

    const _w = (typeof window !== 'undefined') ? window : null;
    const API = (_w && _w.DSCBAPI) ? _w.DSCBAPI : ((typeof DSCBAPI !== 'undefined') ? DSCBAPI : null);

    const isShare = API && typeof API.pageType === 'function' && API.pageType() === 'share';
    const isChat = API && typeof API.pageType === 'function' && API.pageType() === 'chat';

    if (API && typeof API.isLoginPage === 'function') {
      try {
        if (API.isLoginPage(document)) {
          return {
            ok: false,
            msg: '⚠ 当前是 DeepSeek 登录页（未登录或登录已过期）。\n' +
                 '请先在网页上完成登录，回到对话页后再点抓取。\n' +
                 '未登录时服务器不会返回对话内容，抓取结果必然为空。',
            source: '未登录',
          };
        }
      } catch (e) {}
    }

    if (API && !isShare) {
      try {
        API.install();
        const sid = API.sessionIdFromUrl();
        if (sid) {
          if (!sid || sid === 'undefined' || sid.length < 4) {
            apiDiag = '会话 ID 为空（URL 形如 /a/chat/s/ 后面没有 ID）。\n' +
                      '请打开一个具体对话（地址栏应是 /a/chat/s/一串字符），而不是新建对话的空页面。';
            throw new Error('会话 ID 为空');
          }
          if (onProgress) onProgress('正在读取完整历史…', 0);

          if (!API.hasToken()) {

            if (API.scanStorageToken) { try { API.scanStorageToken(); } catch (e) {} }
          }
          const r = await API.loadCurrentSession(sid, {
            timeoutMs: 2500,
            onProgress: function (n) { if (onProgress) onProgress('已读取 ' + n + ' 条…', n); },
          });
          if (r && r.messages && r.messages.length) {

            let domCount = 0;
            try {
              domCount = document.querySelectorAll('.ds-message').length;
            } catch (e) {}
            const apiCount = r.messages.length;
            let shortage = domCount > 0 && apiCount < domCount * 0.8;

            try {
              let apiMax = -1, domMax = -1;
              r.messages.forEach(function (m) {
                if (m && m._vkey != null && Number.isFinite(m._vkey)) apiMax = Math.max(apiMax, m._vkey);
              });
              const nodes = document.querySelectorAll('[data-virtual-list-item-key]');
              Array.prototype.forEach.call(nodes, function (n) {
                const v = Number(n.getAttribute('data-virtual-list-item-key'));
                if (Number.isFinite(v)) domMax = Math.max(domMax, v);
              });
              if (!shortage && apiMax >= 0 && domMax > apiMax) {
                shortage = true;
                apiDiag = '接口最新只到第 ' + apiMax + ' 条，但页面已渲染到第 ' + domMax +
                          ' 条 → 接口数据不完整，已滚动补齐';
              }
            } catch (e) {}
            if (shortage) {
              apiDiag = '接口只返回 ' + apiCount + ' 条，但页面当前可见 ' + domCount +
                        ' 条 → 判定接口数据不完整，已改用滚动抓取';

              pool = C.mergeMessages(pool, r.messages, { strict: cfg.strictDedupe });
            } else {

              const apiMsgs = r.messages;
              const apiKeys = new Set();
              apiMsgs.forEach(function (m) { try { const k = C.normCore(m.text); if (k) apiKeys.add(k); } catch (e) {} });
              const extra = pool.filter(function (m) {
                try { const k = C.normCore(m.text); return k && !apiKeys.has(k); } catch (e) { return false; }
              });
              pool = extra.length ? C.mergeMessages(apiMsgs, extra, { strict: cfg.strictDedupe }) : apiMsgs;

              try { if (C.sortById) pool = C.sortById(pool); } catch (e) {}

              orderAuthority = 'api';
              orderBasis = '接口 parent_id 链';
              lastSource = 'API';
              updateBadge();
              return { ok: true, msg: '已读取 ' + pool.length + ' 条（完整历史）', source: 'API' };
            }
          }
        }
      } catch (e) {

        apiFailReason = String((e && e.message) || e);
      }

      try {
        const sidNow = API && API.sessionIdFromUrl ? API.sessionIdFromUrl() : '(无)';
        apiDiag = 'token=' + (API && API.hasToken() ? '有' : '无') +
                  ' sid=' + (sidNow || '(无)') +
                  ' 页面=' + (API && API.pageType ? API.pageType() : '?');
        if (apiFailReason) apiDiag += '\n错误=' + apiFailReason;

        try {
          const dg = (API && API.diag) ? API.diag() : null;
          if (dg && dg.calls) {
            apiDiag += '\n请求 ' + dg.calls + ' 次 · HTTP ' + dg.lastStatus +
                       ' · 顶层字段[' + (dg.lastKeys || '(无)') + ']';
            if (dg.lastBody) apiDiag += '\n响应样本: ' + dg.lastBody;
            if (dg.lastError) apiDiag += '\n解析错误: ' + dg.lastError;
            if (dg.branchNote) apiDiag += '\n分支重建: ' + dg.branchNote;
            if (dg.structure) apiDiag += '\n响应结构: ' + dg.structure;
            apiDiag += '\nURL: ' + dg.lastUrl;
          }
        } catch (e) {}
      } catch (e) { apiDiag = '诊断收集失败: ' + e.message; }
    }

    if (onProgress) onProgress(isShare ? '分享页：正在解析…' : '正在滚动加载…', pool.length);
    const r = await scrollLoadAll(function (cur, total, n, etaSec, stage) {
      if (onProgress) onProgress(fmtProgress(cur, total, n, etaSec, stage), n);
    });
    if (scrollDiag) r.msg += '\n' + scrollDiag;
    if (apiDiag) {
      r.msg += '\n⚠ 未能通过接口读取完整历史，已改用页面滚动（可能不完整）';
      r.msg += '\n建议刷新页面后重开对话再抓；若仍如此，点「复制诊断信息」反馈给开发者';
    }
    if (isShare) {
      r.source = '分享页解析';
      r.msg = '分享页：已解析 ' + pool.length + ' 条（分享页无接口权限，仅取当前可渲染内容）';
    }
    return r;
  }

  function download(name, content, mime) {
    try {
      const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      return true;
    } catch (e) { return false; }
  }
  function stamp() {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }
  function safeTitle() {
    let t = '';
    try { t = (document.title || '').replace(/\s*[-–|]\s*DeepSeek.*$/i, '').trim(); } catch (e) {}
    t = (t || 'deepseek').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
    return t || 'deepseek';
  }
  function toTxt(list) {
    return list.map(function (m) {
      const who = m.role === 'user' ? '我' : 'DeepSeek';
      let s = '【' + who + '】\n' + m.text;
      if (cfg.exportThinking && m.thinking) s += '\n（思考）\n' + m.thinking;
      return s;
    }).join('\n\n' + '-'.repeat(40) + '\n\n');
  }
  function exportPdf(sorted, base, htmlOpts) {
    try {
      const html = C.toHtmlDoc(sorted, Object.assign({}, htmlOpts, { print: true }));
      const ifr = document.createElement('iframe');
      ifr.setAttribute('aria-hidden', 'true');
      ifr.style.cssText = 'position:fixed;left:-99999px;top:0;width:794px;height:1123px;border:0;visibility:hidden;';
      document.body.appendChild(ifr);
      const d = ifr.contentDocument || (ifr.contentWindow && ifr.contentWindow.document);
      if (!d) return { ok: false, msg: '无法创建打印视图' };
      d.open(); d.write(html); d.close();
      setTimeout(function () {
        try { ifr.contentWindow.focus(); ifr.contentWindow.print(); } catch (e) {}
        setTimeout(function () { try { ifr.remove(); } catch (e) {} }, 1200);
      }, 400);
      return { ok: true, msg: '已打开打印窗口 → 目标选「另存为 PDF」' };
    } catch (e) {
      return { ok: false, msg: 'PDF 失败：' + String((e && e.message) || e) };
    }
  }
  function doExport(kind) {
    if (!pool.length) return { ok: false, msg: '没有可导出的内容' };
    const base = safeTitle() + '-' + stamp();

    let sorted = orderedPool();
    try { if (C.sortById) sorted = C.sortById(sorted); } catch (e) {}
    if (kind === 'md') {
      const md = C.toMarkdown(sorted, {
        title: safeTitle(), includeThinking: cfg.exportThinking,
        compressed: cfg.compress, frontmatter: cfg.frontmatter, source: location.href,
      });
      return { ok: download(base + '.md', md, 'text/markdown;charset=utf-8'), msg: '已保存 ' + base + '.md' };
    }
    if (kind === 'json') {
      return { ok: download(base + '.json', JSON.stringify(sorted, null, 2), 'application/json'), msg: '已保存 ' + base + '.json' };
    }
    if (kind === 'txt') {
      return { ok: download(base + '.txt', toTxt(sorted), 'text/plain;charset=utf-8'), msg: '已保存 ' + base + '.txt' };
    }
    const htmlOpts = { title: safeTitle(), includeThinking: cfg.exportThinking, compressed: cfg.compress, source: location.href };
    if (kind === 'html') {
      return { ok: download(base + '.html', C.toHtmlDoc(sorted, htmlOpts), 'text/html;charset=utf-8'), msg: '已保存 ' + base + '.html' };
    }
    if (kind === 'word') {
      return { ok: download(base + '.doc', C.toWordDoc(sorted, htmlOpts), 'application/msword;charset=utf-8'), msg: '已保存 ' + base + '.doc' };
    }
    if (kind === 'pdf') return exportPdf(sorted, base, htmlOpts);
    return { ok: false, msg: '未知格式' };
  }

  const CSS = `
#dse-fab{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:46px;height:46px;
  border-radius:14px;border:none;cursor:grab;color:#fff;background:#f7f7f5;
  box-shadow:0 4px 14px rgba(0,0,0,.16);display:flex;align-items:center;justify-content:center;padding:0;
  touch-action:none;-webkit-tap-highlight-color:transparent;user-select:none}
#dse-fab.drag{cursor:grabbing}
#dse-fab:hover{box-shadow:0 6px 18px rgba(0,0,0,.22)}
#dse-fab img{width:30px;height:30px;display:block;pointer-events:none;border-radius:6px}
#dse-fab .badge{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 5px;
  background:#e5484d;color:#fff;font:600 10px/18px ui-sans-serif,system-ui,sans-serif;
  text-align:center;border-radius:9px;border:2px solid #fff;pointer-events:none}

#dse-panel{position:fixed;right:20px;bottom:76px;z-index:2147483001;
  width:min(360px,calc(100vw - 32px));max-height:calc(100vh - 120px);overflow-y:auto;overscroll-behavior:contain;
  background:#fff;color:#111;border:1px solid #ececec;border-radius:16px;display:none;
  box-shadow:0 12px 40px rgba(0,0,0,.10);
  font:13px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
#dse-panel.on{display:block}
#dse-panel.moved{left:auto;right:auto;top:auto;bottom:auto}
#dse-fab.moved{left:auto;right:auto;top:auto;bottom:auto}
#dse-panel::-webkit-scrollbar{width:6px}
#dse-panel::-webkit-scrollbar-thumb{background:#e0e0e0;border-radius:3px}
@media (prefers-color-scheme:dark){
  #dse-fab{background:#26262a;color:#111}
  #dse-fab .badge{border-color:#1c1c1c}
  #dse-panel{background:#1c1c1c;color:#f5f5f5;border-color:#2e2e2e}
  #dse-panel::-webkit-scrollbar-thumb{background:#3a3a3a}
}
@media (max-width:520px){
  #dse-panel{left:16px;right:16px;bottom:76px;width:auto;max-width:none;max-height:72vh}
  #dse-fab{right:16px;bottom:16px}
}

.dse-head{display:flex;align-items:center;gap:10px;padding:16px 18px 12px;
  cursor:grab;touch-action:none;user-select:none;-webkit-tap-highlight-color:transparent}
.dse-head.drag{cursor:grabbing}
.dse-head h3{margin:0;font-size:13px;font-weight:600;letter-spacing:-.01em;flex:1;pointer-events:none}
.dse-head .x{width:26px;height:26px;border:none;background:transparent;color:inherit;cursor:pointer;
  display:flex;align-items:center;justify-content:center;opacity:.35;padding:0;border-radius:7px}
.dse-head .x:hover{opacity:.8;background:rgba(127,127,127,.10)}
.dse-head .x svg{width:14px;height:14px}

.dse-body{padding:0 18px 16px}

.dse-ver{font:10.5px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:#909090;
  padding:6px 8px;border-radius:8px;border:1px dashed #e0e0e0;background:#fafafa;
  cursor:pointer;user-select:all;margin-bottom:8px;word-break:break-all}
@media (prefers-color-scheme:dark){.dse-ver{background:#232323;border-color:#383838;color:#8a8a8a}}
.dse-ver:hover{border-style:solid}
.dse-stat{font:11.5px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace;color:#6b6b6b;
  background:#fafafa;border:1px solid #f0f0f0;border-radius:10px;padding:10px 12px;margin-bottom:14px;white-space:pre-line}
@media (prefers-color-scheme:dark){.dse-stat{background:#242424;border-color:#303030;color:#9a9a9a}}

.dse-row{display:flex;gap:8px;margin-bottom:8px}
.dse-row>*{flex:1;min-width:0}
.dse-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:8px}

.dse-btn{display:flex;align-items:center;justify-content:center;gap:6px;padding:11px 8px;min-width:0;
  border:1px solid #e8e8e8;border-radius:10px;background:#fff;color:#111;cursor:pointer;
  font:500 12px/1 ui-sans-serif,system-ui,sans-serif}
.dse-btn:hover{background:#f7f7f7;border-color:#ddd}
.dse-btn:disabled{opacity:.45;cursor:default}
.dse-btn svg{width:14px;height:14px;flex-shrink:0;opacity:.7}
.dse-btn>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dse-btn.main{background:#111;color:#fff;border-color:#111;font-weight:600;padding:13px}
.dse-btn.main:hover{background:#2a2a2a}
.dse-btn.main svg{opacity:1}
@media (prefers-color-scheme:dark){
  .dse-btn{background:#262626;color:#f5f5f5;border-color:#333}
  .dse-btn:hover{background:#303030;border-color:#3d3d3d}
  .dse-btn.main{background:#f5f5f5;color:#111;border-color:#f5f5f5}
  .dse-btn.main:hover{background:#e5e5e5}
}

.dse-set{border-top:1px solid #f0f0f0;margin-top:14px;padding-top:12px}
@media (prefers-color-scheme:dark){.dse-set{border-top-color:#2e2e2e}}
.dse-set label{display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;font-size:12px;color:#444}
@media (prefers-color-scheme:dark){.dse-set label{color:#b5b5b5}}
.dse-set input[type=checkbox]{width:14px;height:14px;accent-color:#111;margin:0}

#dse-tip{margin-top:12px;font:11.5px/1.5 ui-sans-serif,system-ui,sans-serif;min-height:16px;
  color:#8a8a8a;word-break:break-word}
.dse-foot{margin-top:14px;padding-top:12px;border-top:1px solid #f0f0f0;
  font:10.5px/1.5 ui-sans-serif,system-ui,sans-serif;color:#a3a3a3;text-align:center}
@media (prefers-color-scheme:dark){.dse-foot{border-top-color:#2e2e2e;color:#707070}}
`;

  function logErr(tag, e) {
    try { console.warn('[DeepSeekExporter] ' + tag + ' 失败：', e); } catch (_) {}
  }

  function posGet(key) {
    try {
      const raw = (typeof GM_getValue === 'function') ? GM_getValue(key, null) : localStorage.getItem(key);
      if (!raw) return null;
      const o = (typeof raw === 'string') ? JSON.parse(raw) : raw;
      return (o && typeof o.x === 'number' && typeof o.y === 'number') ? o : null;
    } catch (e) { return null; }
  }
  function posSet(key, o) {
    try {
      const v = JSON.stringify(o);
      if (typeof GM_setValue === 'function') GM_setValue(key, v);
      else localStorage.setItem(key, v);
    } catch (e) {}
  }
  function clampPos(x, y, w, h) {
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;
    const m = 6;
    return {
      x: Math.min(Math.max(m, x), Math.max(m, vw - w - m)),
      y: Math.min(Math.max(m, y), Math.max(m, vh - h - m)),
    };
  }

  function makeDraggable(el, handle, key, opts) {
    opts = opts || {};
    const saved = posGet(key);
    if (saved) {
      const p0 = clampPos(saved.x, saved.y, el.offsetWidth || 46, el.offsetHeight || 46);
      el.classList.add('moved');
      el.style.left = p0.x + 'px';
      el.style.top = p0.y + 'px';
    }
    let dragging = false, movedFar = false;
    let sx = 0, sy = 0, ox = 0, oy = 0;

    function down(ev) {
      if (ev.pointerType === 'mouse' && ev.button != null && ev.button !== 0) return;
      if (opts.noDragFrom && ev.target && ev.target.closest && ev.target.closest(opts.noDragFrom)) return;
      const r = el.getBoundingClientRect();
      ox = r.left; oy = r.top;
      if (!el.classList.contains('moved')) el.classList.add('moved');
      el.style.left = ox + 'px';
      el.style.top = oy + 'px';
      sx = ev.clientX; sy = ev.clientY;
      dragging = true; movedFar = false;
      handle.classList.add('drag');
      try { if (handle.setPointerCapture && ev.pointerId != null) handle.setPointerCapture(ev.pointerId); } catch (e) {}
    }
    function move(ev) {
      if (!dragging) return;
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!movedFar && Math.abs(dx) + Math.abs(dy) < 5) return;
      movedFar = true;
      const p = clampPos(ox + dx, oy + dy, el.offsetWidth, el.offsetHeight);
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      if (ev.cancelable) ev.preventDefault();
    }
    function up() {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('drag');
      if (!movedFar) return;
      const r = el.getBoundingClientRect();
      posSet(key, { x: Math.round(r.left), y: Math.round(r.top) });

      const kill = function (e) { e.stopPropagation(); e.preventDefault(); };
      el.addEventListener('click', kill, true);
      setTimeout(function () { try { el.removeEventListener('click', kill, true); } catch (e) {} }, 0);
    }
    handle.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);

    window.addEventListener('resize', function () {
      const sv = posGet(key);
      if (!sv) return;
      const p = clampPos(sv.x, sv.y, el.offsetWidth, el.offsetHeight);
      if (p.x !== sv.x || p.y !== sv.y) {
        el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
        posSet(key, { x: Math.round(p.x), y: Math.round(p.y) });
      }
    });
  }

  function ensureVisible(el, key) {
    if (!el) return;
    try {
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth || 1024;
      const vh = window.innerHeight || 768;
      const zero = r.width < 4 || r.height < 4;
      const outside = r.right < 8 || r.bottom < 8 || r.left > vw - 8 || r.top > vh - 8;
      if (!zero && !outside) return;
      try {
        if (typeof GM_setValue === 'function') GM_setValue(key, '');
        else localStorage.removeItem(key);
      } catch (e) {}
      el.classList.remove('moved');
      el.style.left = '';
      el.style.top = '';
    } catch (e) {}
  }

  function startWatchdog() {
    setInterval(function () {
      try {
        if (!fabEl) { boot(); return; }
        const host = document.body || document.documentElement;
        if (!host) return;
        if (fabEl && !fabEl.isConnected) host.appendChild(fabEl);
        if (panelEl && !panelEl.isConnected) host.appendChild(panelEl);
        ensureVisible(fabEl, 'dse_pos_fab');
        if (panelOpen) ensureVisible(panelEl, 'dse_pos_panel');
      } catch (e) {}
    }, 4000);
  }

  function addStyle() {
    try {
      if (typeof GM_addStyle === 'function') GM_addStyle(CSS);
      else { const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }
    } catch (e) {}
  }

  let fabEl = null, panelEl = null, panelOpen = false;
  let elStat, elTip, elGrab, elExport, elSource, elVer;
  let lastDiag = '';

  function updateBadge() {
    if (!fabEl) return;
    let dot = fabEl.querySelector('.badge');
    if (pool.length) {
      if (!dot) { dot = document.createElement('span'); dot.className = 'badge'; fabEl.appendChild(dot); }
      dot.textContent = pool.length;
    } else if (dot) dot.remove();
    if (panelOpen) refreshStat();
  }

  let verInfo = null;
  let verReady = false;

  function versionInfo() {
    return verReady ? verInfo : null;
  }

  function pageRendered() {
    try {
      const r = document.querySelector('#root');
      return !!(r && r.children.length > 0 && (r.textContent || '').trim().length > 0);
    } catch (e) { return false; }
  }

  function refreshVer() {
    if (!elVer) return;
    try {
      const elapsed = Date.now() - verStart;
      if (!pageRendered()) {
        elVer.textContent = '等待页面渲染…';
        return;
      }

      if (!keySelectorsReady() && elapsed < VER_MIN_DELAY) {
        elVer.textContent = '正在识别页面结构…';
        return;
      }
      const v = C.detectVersion(document);
      verInfo = v;
      verReady = true;
      const parts = [];
      if (v.commitId) parts.push('build ' + v.commitId.slice(0, 8));
      if (v.scripts.length) parts.push(v.scripts.slice(0, 2).join(' '));
      const cnt = v.messageCount || 0;
      parts.push(v.adapted ? '结构适配 ✓' : '结构不匹配 ⚠ 缺失 ' + v.missing.join(','));
      if (cnt) parts.push('检测到 ' + cnt + ' 条');
      elVer.textContent = parts.join(' · ');
      elVer.title = '点击复制完整诊断信息（页面改版时把它发给开发者）\n\n' + JSON.stringify(v, null, 1);
    } catch (e) { elVer.textContent = '版本信息获取失败'; }
  }

  const VER_MIN_DELAY = 1500;
  const VER_SETTLE_MAX = 30000;
  const verStart = Date.now();

  function keySelectorsReady() {
    try {
      return !!(document.querySelector('.ds-message') || document.querySelector('.ds-markdown'));
    } catch (e) { return false; }
  }

  function watchRender() {
    let tries = 0;
    const timer = setInterval(function () {
      const elapsed = Date.now() - verStart;
      const okNow = pageRendered() && (keySelectorsReady() || elapsed >= VER_MIN_DELAY);

      if (okNow && (keySelectorsReady() || elapsed >= VER_SETTLE_MAX)) {
        refreshVer();
        if (verReady && verInfo && verInfo.adapted) { clearInterval(timer); return; }
        if (elapsed >= VER_SETTLE_MAX) { clearInterval(timer); return; }
      }

      if (!verReady && tries % 2 === 0) refreshVer();
      if (++tries > 60) { clearInterval(timer); refreshVer(); }
    }, 500);
    try {
      if (typeof MutationObserver === 'function') {
        const root = document.querySelector('#root');
        if (root) {
          const mo = new MutationObserver(function () {
            if (!verReady && keySelectorsReady() && Date.now() - verStart >= VER_MIN_DELAY) {
              refreshVer();
            }
          });
          mo.observe(root, { childList: true, subtree: true });
        }
      }
    } catch (e) {}
  }

  function refreshStat() {
    if (!elStat) return;
    if (!pool.length) { elStat.textContent = '尚未抓取'; return; }
    const u = pool.filter((m) => m.role === 'user').length;
    const a = pool.filter((m) => m.role === 'assistant').length;
    const th = pool.filter((m) => m.thinking).length;
    const tk = C.estimateTokens(pool.map((m) => m.text + ' ' + (m.thinking || '')).join('\n'));
    let s = pool.length + ' 条 · ' + u + ' 问 ' + a + ' 答';
    if (th) s += ' · 思考 ' + th;
    s += '\n约 ' + tk + ' tokens';
    if (lastSource) s += ' · 来源 ' + lastSource;

    if (orderBasis) s += '\n排序依据：' + orderBasis;
    elStat.textContent = s;
  }

  function buildFeedback(brief, detail) {
    let env = '';
    try {
      const v = versionInfo ? versionInfo() : null;
      env = '\n--- 环境 ---' +
            '\n页面: ' + location.href +
            '\n脚本: ' + (SCRIPT_VERSION || '') + ' / ' + (SCRIPT_BUILD || '') +
            (v ? '\n页面构建: ' + (v.commitId || '-') + ' ' + (v.scripts || []).join(' ') + '\n结构: ' + (v.adapted ? '适配' : '不匹配 ' + (v.missing || []).join(',')) : '');
    } catch (e) {}
    return brief + env + (detail ? '\n--- 详情 ---\n' + detail : '');
  }

  function tip(msg, ok) {
    if (!elTip) return;
    elTip.textContent = msg || '';
    elTip.style.color = ok === false ? '#e5484d' : '';
  }

  function setPhase(p) {
    phase = p;
    elGrab.style.display = p === 'done' ? 'none' : 'flex';
    elExport.style.display = p === 'done' ? 'block' : 'none';
    if (p === 'done') refreshStat();
  }

  function mkBtn(action, iconName, label, cls) {
    const b = document.createElement('button');
    b.className = 'dse-btn' + (cls ? ' ' + cls : '');
    b.setAttribute('data-a', action);
    b.appendChild(icon(iconName));
    const sp = document.createElement('span');
    sp.textContent = label;
    b.appendChild(sp);
    return b;
  }

  function buildPanel() {
    if (panelEl && fabEl) return;
    const fab = document.createElement('button');
    fab.id = 'dse-fab';
    fab.title = 'DeepSeekExporter（拖动可移动位置）';
    fab.setAttribute('aria-label', '打开导出面板');
    if (FAB_ICON_B64) {
      const im = document.createElement('img');
      im.alt = '';
      im.draggable = false;

      im.onerror = function () {
        try { if (im.parentNode) im.parentNode.replaceChild(icon('bridge'), im); } catch (e) {}
      };
      im.src = 'data:image/png;base64,' + FAB_ICON_B64;
      fab.appendChild(im);
    } else {
      fab.appendChild(icon('bridge'));
    }
    fab.onclick = function () {
      panelOpen = !panelOpen;
      panelEl.classList.toggle('on', panelOpen);
      if (panelOpen) refreshStat();
    };
    document.body.appendChild(fab);
    fabEl = fab;
    try { makeDraggable(fab, fab, 'dse_pos_fab'); } catch (e) {}

    const p = document.createElement('div');
    p.id = 'dse-panel';
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-label', 'DeepSeekExporter');

    const head = document.createElement('div');
    head.className = 'dse-head';
    head.title = '拖动此处可移动面板';
    const h3 = document.createElement('h3'); h3.textContent = 'DeepSeekExporter';
    const x = document.createElement('button'); x.className = 'x'; x.title = '关闭';
    x.appendChild(icon('close'));
    x.onclick = function () { panelOpen = false; p.classList.remove('on'); };
    head.appendChild(h3); head.appendChild(x);
    p.appendChild(head);

    const body = document.createElement('div');
    body.className = 'dse-body';

    elVer = document.createElement('div'); elVer.className = 'dse-ver';
    elVer.title = '点击复制诊断信息；双击重新检测页面结构';
    elVer.ondblclick = function () { verReady = false; refreshVer(); tip('已重新检测页面结构', true); };
    elVer.onclick = function () {
      try {
        const txt = JSON.stringify(C.detectVersion(document), null, 2);
        if (navigator.clipboard) navigator.clipboard.writeText(txt);
        tip('版本/结构诊断已复制到剪贴板', true);
      } catch (e) { tip('复制失败：' + e.message, false); }
    };
    body.appendChild(elVer);

    elStat = document.createElement('div'); elStat.className = 'dse-stat';
    body.appendChild(elStat);

    elGrab = document.createElement('div');
    elGrab.className = 'dse-row';
    elGrab.appendChild(mkBtn('grab', 'download', '抓取对话', 'main'));
    body.appendChild(elGrab);

    elExport = document.createElement('div');
    elExport.style.display = 'none';
    const grid = document.createElement('div');
    grid.className = 'dse-grid';
    grid.style.marginBottom = '8px';
    grid.appendChild(mkBtn('md', 'doc', 'Markdown'));
    grid.appendChild(mkBtn('pdf', 'pdf', 'PDF'));
    grid.appendChild(mkBtn('word', 'word', 'Word'));
    grid.appendChild(mkBtn('html', 'html', 'HTML'));
    grid.appendChild(mkBtn('json', 'code', 'JSON'));
    grid.appendChild(mkBtn('txt', 'txt', 'TXT'));
    elExport.appendChild(grid);
    const r3 = document.createElement('div'); r3.className = 'dse-row';
    r3.appendChild(mkBtn('regrab', 'rotate', '重新抓取'));
    elExport.appendChild(r3);
    body.appendChild(elExport);

    const set = document.createElement('div');
    set.className = 'dse-set';
    function addCheck(k, label) {
      const l = document.createElement('label');
      const i = document.createElement('input');
      i.type = 'checkbox'; i.setAttribute('data-k', k); i.checked = !!cfg[k];
      i.onchange = function () { cfg[k] = i.checked; saveCfg(); };
      const sp = document.createElement('span'); sp.textContent = label;
      l.appendChild(i); l.appendChild(sp); set.appendChild(l);
    }
    addCheck('exportThinking', '导出思考链');
    addCheck('strictDedupe', '严格去重');
    addCheck('compress', '折叠超长代码');
    addCheck('frontmatter', 'YAML 元数据');
    body.appendChild(set);

    elTip = document.createElement('div'); elTip.id = 'dse-tip';
    body.appendChild(elTip);

    const foot = document.createElement('div');
    foot.className = 'dse-foot';
    foot.innerHTML = '&copy; ' + new Date().getFullYear() + ' FastNow Studio | MIT License';
    body.appendChild(foot);

    p.appendChild(body);
    document.body.appendChild(p);
    panelEl = p;

    try { makeDraggable(p, head, 'dse_pos_panel', { noDragFrom: '.x' }); } catch (e) {}

    body.addEventListener('click', async function (e) {
      const btn = e.target.closest ? e.target.closest('button') : null;
      if (!btn) return;
      const a = btn.getAttribute('data-a');

      if (a === 'grab' || a === 'regrab') {
        apiFailReason = ''; apiDiag = ''; scrollDiag = '';
        if (a === 'regrab') { pool = []; clearParsed(); scCache = null; seqMap.clear(); keyMap.clear(); stepNo = -1; orderAuthority = 'scroll'; updateBadge(); setPhase('idle'); }
        btn.disabled = true;
        const label = btn.querySelector('span');
        const oldText = label ? label.textContent : '';
        try {
          const r = await grabAll(function (msg) {
            if (label) label.textContent = msg.length > 26 ? msg.slice(0, 26) + '…' : msg;

            try { if (elStat && msg) elStat.textContent = msg; } catch (e) {}
            lastDiag = msg;
          });
          lastSource = r.source || '';

          try {
            const oc = C.checkOrder(orderedPool());
            if (!oc.ok) {
              r.msg += '\n⚠ 顺序可能不对：' + oc.reasons.join('；');
              r.msg += '\n建议改在对话页(chat.deepseek.com/a/chat/s/…)用接口抓取';
            }
          } catch (e) {}
          refreshVer();
          lastDiag = r.msg;
          tip(r.msg, r.ok);

          try {
            if (apiDiag && elTip && !elTip.querySelector('[data-a="copydiag"]')) {
              const cb = document.createElement('button');
              cb.setAttribute('data-a', 'copydiag');
              cb.className = 'dse-btn dse-btn-sm';
              cb.textContent = '复制诊断信息';
              cb.onclick = function () {
                try {
                  const txt = buildFeedback('接口未走通（可能不完整）', apiDiag);
                  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt);
                  tip('诊断信息已复制，发给开发者即可定位', true);
                } catch (e) { tip('复制失败：' + e.message, false); }
              };
              elTip.appendChild(cb);
            }
          } catch (e) {}
          if (pool.length) setPhase('done');
        } catch (err) {
          const em = String((err && err.message) || err);
          tip('抓取失败：' + em, false);
          try {
            if (elTip && !elTip.querySelector('[data-a="copyerr"]')) {
              const eb = document.createElement('button');
              eb.setAttribute('data-a', 'copyerr');
              eb.className = 'dse-btn dse-btn-sm';
              eb.textContent = '复制错误信息';
              eb.onclick = function () {
                try {
                  const txt = buildFeedback('抓取异常', em + '\n' + String((err && err.stack) || ''));
                  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt);
                  tip('错误信息已复制，反馈给开发者即可', true);
                } catch (e) { tip('复制失败：' + e.message, false); }
              };
              elTip.appendChild(eb);
            }
          } catch (e) {}
        } finally {
          btn.disabled = false;
          if (label) label.textContent = oldText;
        }
        return;
      }

      if (['md', 'json', 'txt', 'html', 'word', 'pdf'].indexOf(a) > -1) {
        const r = doExport(a);
        tip(r.msg, r.ok);
      }
    });
  }

  function applyCfg() {
    try {
      C.configure({ keepSingleChar: !!cfg.keepSingleChar });
    } catch (e) {}
  }

  try { installFetchHook(); } catch (e) { logErr('fetch 钩子', e); }
  try { installXHRHook(); } catch (e) { logErr('XHR 钩子', e); }

  let booted = false;

  function boot() {
    if (booted) return;
    try {
      addStyle();
      buildPanel();
      applyCfg();
      refreshVer();
      watchRender();
      setPhase('idle');
      startWatchdog();
      setInterval(function () {
        try {
          if (location.pathname !== lastPath) {
            lastPath = location.pathname;
            pool = []; clearParsed(); scCache = null; lastSource = ''; seqMap.clear(); keyMap.clear(); stepNo = -1; orderAuthority = 'scroll';
            updateBadge(); setPhase('idle'); tip('');
          }
        } catch (e) {}
      }, 1500);
      if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('DeepSeekExporter：打开/关闭面板', function () {
          panelOpen = !panelOpen;
          if (panelEl) panelEl.classList.toggle('on', panelOpen);
        });
        GM_registerMenuCommand('DeepSeekExporter：重置界面位置', function () {
          try {
            ['dse_pos_fab', 'dse_pos_panel'].forEach(function (k) {
              if (typeof GM_setValue === 'function') GM_setValue(k, '');
              else localStorage.removeItem(k);
            });
            [fabEl, panelEl].forEach(function (el) {
              if (!el) return;
              el.classList.remove('moved');
              el.style.left = '';
              el.style.top = '';
            });
          } catch (e) {}
        });
      }
      booted = true;
    } catch (e) {

      logErr('启动', e);
      try { if (fabEl && fabEl.parentNode) fabEl.parentNode.removeChild(fabEl); } catch (_) {}
      try { if (panelEl && panelEl.parentNode) panelEl.parentNode.removeChild(panelEl); } catch (_) {}
      fabEl = null; panelEl = null;
    }
  }

  function mountWhenReady(n) {
    n = n || 0;
    const host = document.body || document.documentElement;
    if (!host) {
      if (n < 60) setTimeout(function () { mountWhenReady(n + 1); }, 150);
      return;
    }
    boot();
  }
  mountWhenReady();
  document.addEventListener('DOMContentLoaded', boot, { once: true });
  setTimeout(boot, 2500);
  setTimeout(boot, 6000);
})();

})();
