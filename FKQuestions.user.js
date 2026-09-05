// ==UserScript==
// @name         FKQuestions
// @namespace    https://github.com/fastnow
// @version      1.0.0
// @description   和令人烦恼的问卷说拜拜
// @author       FastNow Studio
// @homepageURL  https://github.com/fastnow/UserJs
// @updateURL    https://fastly.jsdelivr.net/gh/fastnow/UserJs@main/FKQuestions.user.js
// @downloadURL  https://fastly.jsdelivr.net/gh/fastnow/UserJs@main/FKQuestions.user.js
// @supportURL   https://github.com/fastnow/UserJs/issues
// @license      BSD-3-Clause
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @connect      api.openai.com
// @connect      api.deepseek.com
// @connect      open.bigmodel.cn
// @connect      api.anthropic.com
// @connect      generativelanguage.googleapis.com
// @run-at       document-start
// @noframes
// ==/UserScript==
//
// ─────────────────────────────────────────────
//  安全提示（务必先读）
//  1. @match 目前是全域。强烈建议收敛到你常用的问卷域名，例如：
//        // @match  *://*.wjx.cn/*
//        // @match  *://wj.qq.com/*
//     脚本会读取页面全部表单内容并发送到第三方 AI 服务，注入到网银/后台管理页
//     风险较高。面板「设置 → 站点作用域」可填域名白名单（逗号分隔，留空=全域）。
//  2. 若要使用「自定义端点」，需自行在头部补一行 // @connect 你的域名
//     （本脚本刻意删除了 @connect *，避免密钥可被发往任意域名）。
//  3. API Key 明文存储。面板默认「仅本次会话保存」，勾选后才会落盘到
//     Tampermonkey 存储。共用电脑请勿勾选。
//  4. 本脚本不做任何反检测/反风控对抗。检测到验证码、风控 SDK、陷阱题、蜜罐
//     字段等反作弊措施时，只会通知你并禁用自动填写，不会尝试绕过。
// ─────────────────────────────────────────────
(function () {
    'use strict';

    /* 防重复注入 */
    if (window.__GAMETAME_V3__) return;
    window.__GAMETAME_V3__ = true;

    const NS = 'gametame_v3_';
    const SCRIPT_NAME = 'FKQuestions';

    const CFG = {
        batchSize: 12,        // 每批题目数，避免单次 prompt 超 token
        timeout: 60000,       // 单次请求超时（毫秒）
        maxTokens: 4096,
        temperature: 0.4,
        scanPromptLimit: 1500000, // 反作弊扫描时读取的 HTML 字符上限

        /* ── 跨页相关 ── */
        /* ── 答案约束 ── */
        multiMin: 2,           // 多选题期望最少选几项
        multiMax: 3,           // 多选题期望最多选几项（超出会截断，全选一眼假）
        textMaxChars: 50,      // 填空题最大字数

        /* ── 打字速度（会被设置面板覆盖） ──
           基准值按真人中文输入速度定：普通人用输入法打字约每秒 1.5~3 字，
           即每字 330~670 ms。之前 base=55 相当于每秒 18 字，明显偏快，
           实测反馈就是"太快了"。这里取中位偏保守的一组。 */
        typeSpeed: 'normal',
        typeBaseMs: 320,       // 每字基础毫秒（文本很短时的单字耗时）
        typePerCharMs: 3.5,    // 每多一个字，单字耗时的减少量（手速惯性）
        typeJitter: 0.35,      // 随机抖动比例 0~1
        typeThinkMs: 900,      // 题间思考基准毫秒
        typeThinkPerChar: 12,  // 每字追加的思考时间（读题）
        typePauseChance: 0.06, // 打字过程中"卡壳"的概率
        typeCharMinMs: 150,    // 单字耗时下限，防止长文本快到失真
        typeCharMaxMs: 700,    // 单字耗时上限

        crossPage: false,      // 跨页自动续填（运行时由 state 覆盖）
        maxPages: 20,          // 单次会话最多自动推进多少页，防死循环
        contentChangeNodes: 25, // DOM 累计变动多少节点后才核算内容指纹（避免频繁全量提取）
        sessionTTL: 2 * 3600 * 1000, // 会话有效期 2 小时
        urlPollMs: 700,        // URL 轮询兜底间隔
        afterNavDelay: 1200,   // 检测到跳转后等待页面渲染的时间
        navTimeout: 25000      // 等待跳转发生的超时（超时则判定为最后一页）
    };

    const Probe = {
        listeners: Object.create(null),
        beacons: 0,
        reqs: [],
        canvasReads: 0,
        webdriver: false,
        ready: false,
        paused: false   // 脚本自己建 UI 时暂停统计，避免把自己的监听算成页面的
    };

    const BEHAVIOR_EVENTS = [
        'mousemove', 'pointermove', 'mousedown', 'mouseup', 'click',
        'keydown', 'keypress', 'keyup', 'scroll', 'touchstart', 'touchmove',
        'visibilitychange', 'blur', 'focus', 'copy', 'paste', 'cut',
        'contextmenu', 'selectstart', 'beforeunload', 'pagehide'
    ];

    function installProbe() {
        try {
            const origAdd = EventTarget.prototype.addEventListener;
            EventTarget.prototype.addEventListener = function (type) {
                try {
                    if (!Probe.paused && typeof type === 'string') {
                        Probe.listeners[type] = (Probe.listeners[type] || 0) + 1;
                    }
                } catch (e) { /* ignore */ }
                return origAdd.apply(this, arguments);
            };
        } catch (e) { /* ignore */ }

        try {
            const origBeacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
            if (origBeacon) {
                navigator.sendBeacon = function (url) {
                    Probe.beacons++;
                    Probe.reqs.push(String(url));
                    return origBeacon.apply(navigator, arguments);
                };
            }
        } catch (e) { /* ignore */ }

        try {
            const origFetch = window.fetch;
            if (typeof origFetch === 'function') {
                window.fetch = function (input) {
                    try {
                        Probe.reqs.push(String((input && input.url) || input));
                    } catch (e) { /* ignore */ }
                    return origFetch.apply(window, arguments);
                };
            }
        } catch (e) { /* ignore */ }

        try {
            const origOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function (method, url) {
                try { Probe.reqs.push(String(url)); } catch (e) { /* ignore */ }
                return origOpen.apply(this, arguments);
            };
        } catch (e) { /* ignore */ }

        try {
            const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
            HTMLCanvasElement.prototype.toDataURL = function () {
                Probe.canvasReads++;
                return origToDataURL.apply(this, arguments);
            };
            const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
            CanvasRenderingContext2D.prototype.getImageData = function () {
                Probe.canvasReads++;
                return origGetImageData.apply(this, arguments);
            };
        } catch (e) { /* ignore */ }

        try {
            Probe.webdriver = !!(
                navigator.webdriver ||
                document.documentElement.getAttribute('webdriver') ||
                window.callPhantom || window.__nightmare || window.__selenium ||
                window.domAutomation || window._phantom
            );
        } catch (e) { /* ignore */ }

        Probe.ready = true;
    }

    installProbe();

    const Store = {
        get(key, def) {
            try { return GM_getValue(NS + key, def); } catch (e) { return def; }
        },
        set(key, val) {
            try { GM_setValue(NS + key, val); } catch (e) { /* ignore */ }
        },
        del(key) {
            try { GM_deleteValue(NS + key); } catch (e) { /* ignore */ }
        }
    };

    const state = {
        provider: Store.get('provider', 'deepseek'),
        model: Store.get('model', ''),
        apiKey: Store.get('apiKey', ''),        // 仅当 persistKey 为真时才有值
        persistKey: Store.get('persistKey', false),
        customBase: Store.get('customBase', ''),
        mode: Store.get('mode', 'semi'),        // auto | semi | manual
        autoSubmit: Store.get('autoSubmit', false),
        scopeWhitelist: Store.get('scopeWhitelist', ''),
        crossPage: Store.get('crossPage', false),      // 跨页自动续填
        crossPageAuto: Store.get('crossPageAuto', false), // 跨页时不再逐页询问
        crossPageNext: Store.get('crossPageNext', true),  // 自动点击「下一页」
        /* UI 与调优 */
        sensitivity: Store.get('sensitivity', 'normal'),  // loose | normal | strict
        temperature: Store.get('temperature', 0.4),
        widePanel: Store.get('widePanel', false),
        debug: Store.get('debug', false),
        excludeSelectors: Store.get('excludeSelectors', ''),  // 额外排除的选择器
        /* 媒体内容检测：图标密集的后台/组件库页面可能误报，*/
        mediaCheck: Store.get('mediaCheck', true),
        mediaMinPx: Store.get('mediaMinPx', 44),  // 小于此尺寸的图形视为图标
        risk: null,                             // 最近一次扫描结果
        lastScanAt: 0
    };

    // 调过的参数覆盖默认值
    CFG.batchSize = Store.get('batchSize', CFG.batchSize);
    CFG.timeout = Store.get('timeout', CFG.timeout);
    CFG.temperature = state.temperature;
    CFG.multiMin = Store.get('multiMin', CFG.multiMin);
    CFG.multiMax = Store.get('multiMax', CFG.multiMax);
    CFG.textMaxChars = Store.get('textMaxChars', CFG.textMaxChars);
    CFG.typeSpeed = Store.get('typeSpeed', CFG.typeSpeed);
    CFG.typeBaseMs = Store.get('typeBaseMs', CFG.typeBaseMs);
    CFG.typePerCharMs = Store.get('typePerCharMs', CFG.typePerCharMs);
    CFG.typeJitter = Store.get('typeJitter', CFG.typeJitter);
    CFG.typeThinkMs = Store.get('typeThinkMs', CFG.typeThinkMs);
    CFG.typeThinkPerChar = Store.get('typeThinkPerChar', CFG.typeThinkPerChar);
    CFG.typePauseChance = Store.get('typePauseChance', CFG.typePauseChance);
    CFG.typeCharMinMs = Store.get('typeCharMinMs', CFG.typeCharMinMs);
    CFG.typeCharMaxMs = Store.get('typeCharMaxMs', CFG.typeCharMaxMs);

    if (!state.persistKey) state.apiKey = '';

    function buildMessages(prompt) {
        const sys = Persona.system();
        const msgs = [];
        if (sys) msgs.push({ role: 'system', content: sys });
        msgs.push({ role: 'user', content: prompt });
        return msgs;
    }

    const PROVIDERS = {
        openai: {
            name: 'OpenAI',
            defaultModel: 'gpt-4o-mini',
            models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
            buildRequest(prompt, model, key) {
                return {
                    url: 'https://api.openai.com/v1/chat/completions',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + key
                    },
                    body: {
                        model: model,
                        messages: buildMessages(prompt),
                        temperature: CFG.temperature,
                        max_tokens: CFG.maxTokens
                    }
                };
            },
            parse(res) {
                const d = JSON.parse(res.responseText);
                return d.choices && d.choices[0] && d.choices[0].message
                    ? d.choices[0].message.content : null;
            }
        },

        deepseek: {
            name: 'DeepSeek',
            defaultModel: 'deepseek-chat',
            models: ['deepseek-chat', 'deepseek-reasoner'],
            buildRequest(prompt, model, key) {
                return {
                    url: 'https://api.deepseek.com/v1/chat/completions',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + key
                    },
                    body: {
                        model: model,
                        messages: buildMessages(prompt),
                        temperature: CFG.temperature,
                        max_tokens: CFG.maxTokens
                    }
                };
            },
            parse: function (res) { return PROVIDERS.openai.parse(res); }
        },

        zhipu: {
            name: '智谱 AI (GLM)',
            defaultModel: 'glm-4-flash',
            models: ['glm-4-flash', 'glm-4-plus', 'glm-4.6', 'glm-4'],
            buildRequest(prompt, model, key) {
                return {
                    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + key
                    },
                    body: {
                        model: model,
                        messages: buildMessages(prompt),
                        temperature: CFG.temperature,
                        max_tokens: CFG.maxTokens
                    }
                };
            },
            parse: function (res) { return PROVIDERS.openai.parse(res); }
        },

        claude: {
            name: 'Claude (Anthropic)',
            defaultModel: 'claude-sonnet-4-5',
            models: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-3-5-haiku-latest'],
            buildRequest(prompt, model, key) {
                return {
                    url: 'https://api.anthropic.com/v1/messages',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': key,
                        'anthropic-version': '2023-06-01',
                        // 浏览器直连 Anthropic 必须带此头，否则 403
                        'anthropic-dangerous-direct-browser-access': 'true'
                    },
                    body: {
                        model: model,
                        max_tokens: CFG.maxTokens,
                        system: Persona.system() || undefined,
                        messages: [{ role: 'user', content: prompt }]
                    }
                };
            },
            parse(res) {
                const d = JSON.parse(res.responseText);
                if (Array.isArray(d.content)) {
                    return d.content.filter(c => c.type === 'text').map(c => c.text).join('');
                }
                return null;
            }
        },

        gemini: {
            name: 'Google Gemini',
            defaultModel: 'gemini-2.5-flash',
            models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
            buildRequest(prompt, model, key) {
                return {
                    url: 'https://generativelanguage.googleapis.com/v1beta/models/' +
                        encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key),
                    headers: { 'Content-Type': 'application/json' },
                    body: {
                        systemInstruction: Persona.system()
                            ? { parts: [{ text: Persona.system() }] }
                            : undefined,
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            temperature: CFG.temperature,
                            maxOutputTokens: CFG.maxTokens,
                            responseMimeType: 'application/json'
                        }
                    }
                };
            },
            parse(res) {
                const d = JSON.parse(res.responseText);
                const c = d.candidates && d.candidates[0];
                if (c && c.content && Array.isArray(c.content.parts)) {
                    return c.content.parts.map(p => p.text || '').join('');
                }
                return null;
            }
        },

        custom: {
            name: '自定义端点 (OpenAI 兼容)',
            defaultModel: 'gpt-4o-mini',
            models: [],
            needsBase: true,
            buildRequest(prompt, model, key, base) {
                let baseUrl = String(base || '').trim().replace(/\/+$/, '');
                if (!baseUrl) throw new Error('未填写自定义端点地址');
                if (!/^https?:\/\//i.test(baseUrl)) baseUrl = 'https://' + baseUrl;
                return {
                    url: baseUrl,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + key
                    },
                    body: {
                        model: model,
                        messages: buildMessages(prompt),
                        temperature: CFG.temperature,
                        max_tokens: CFG.maxTokens
                    }
                };
            },
            parse: function (res) { return PROVIDERS.openai.parse(res); }
        }
    };

    function currentProvider() { return PROVIDERS[state.provider] || PROVIDERS.deepseek; }
    function currentModel() {
        return (state.model || '').trim() || currentProvider().defaultModel;
    }

    function esc(s) {
        return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function nodeText(node) {
        if (!node) return '';
        let t = node.innerText;
        if (t === undefined || t === null) t = node.textContent;
        return String(t || '').replace(/\s+/g, ' ').trim();
    }

    function isVisible(el) {
        if (!el) return false;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        if (parseFloat(cs.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 || r.height > 0;
    }

    function isEffectivelyVisible(el) {
        if (isVisible(el)) return true;
        const t = (el.type || '').toLowerCase();
        /* contenteditable 没有 type，靠父级判断；原生日期/滑块控件同理 */
        if (t === 'radio' || t === 'checkbox' || isEditable(el)) {
            let p = el.parentElement;
            let guard = 0;
            while (p && p !== document.body && guard++ < 3) {
                if (isVisible(p)) return true;
                p = p.parentElement;
            }
        }
        return false;
    }

    /** 在执行期间暂停探针，避免脚本自身的监听污染统计结果 */
    function withoutProbe(fn) {
        Probe.paused = true;
        try { return fn(); }
        finally { Probe.paused = false; }
    }

    /** 元素自身的直接文本（不含后代元素文本） */
    function ownText(el) {
        let s = '';
        for (let n = el.firstChild; n; n = n.nextSibling) {
            if (n.nodeType === 3) s += n.nodeValue;
        }
        return s.replace(/\s+/g, ' ').trim();
    }

    /** 收集后代里符合选择器的元素自身的文本 */
    function descendantOwnText(root, selector, limit) {
        const out = [];
        const nodes = root.querySelectorAll(selector);
        for (let i = 0; i < nodes.length && out.length < (limit || 20); i++) {
            const t = ownText(nodes[i]);
            if (t) out.push(t);
        }
        return out;
    }

    const RectCache = {
        map: null,
        /** 开始一轮新的提取，清空旧缓存 */
        begin() { this.map = new Map(); },
        /** 结束一轮提取，释放内存（不释放会让大页面的 WeakMap/Map 长期占用） */
        end() { this.map = null; },
        get(el) {
            if (!el) return { top: 0, left: 0, width: 0, height: 0 };
            if (this.map) {
                const hit = this.map.get(el);
                if (hit) return hit;
            }
            let r;
            try {
                r = el.getBoundingClientRect();
            } catch (e) {
                r = { top: 0, left: 0, width: 0, height: 0 };
            }
            // 归一化出需要的字段，避免外部直接持有 DOMRect（部分环境会变）
            const snap = {
                top: r.top, left: r.left, right: r.right, bottom: r.bottom,
                width: r.width, height: r.height
            };
            if (this.map) this.map.set(el, snap);
            return snap;
        },
        /** 批量预热：一次性读完，把重排次数压到 1 次 */
        prewarm(list) {
            if (!list || !list.length) return;
            for (let i = 0; i < list.length; i++) {
                const el = list[i];
                if (!el || (this.map && this.map.has(el))) continue;
                let r;
                try { r = el.getBoundingClientRect(); }
                catch (e) { r = null; }
                if (r && this.map) {
                    this.map.set(el, {
                        top: r.top, left: r.left, right: r.right, bottom: r.bottom,
                        width: r.width, height: r.height
                    });
                }
            }
        }
    };

    function anchorRect(el) {
        let cur = el;
        let guard = 0;
        /* 沿祖先链向上找时，把整条链一次性预热。
           否则每层都单独读一次，一个嵌套 5 层的控件就是 5 次重排。 */
        if (RectCache.map) {
            const chain = [];
            let c = el;
            while (c && chain.length < 16) { chain.push(c); c = c.parentElement; }
            RectCache.prewarm(chain);
        }
        while (cur && cur.getBoundingClientRect && guard++ < 15) {
            const r = RectCache.get(cur);
            // 1px 透明控件算"没有尺寸"，继续向上找
            if (r.width > 4 && r.height > 4) return r;
            cur = cur.parentElement;
        }
        return RectCache.get(el);
    }

    function optionLabel(input, allowValue) {
        // 填空题直接短路：它压根没有选项概念
        if (allowValue === false) return '';
        // 1. <label for="id">
        if (input.id) {
            let lbl = null;
            try {
                lbl = document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(input.id) : esc(input.id)) + '"]');
            } catch (e) { /* ignore */ }
            const lt = nodeText(lbl);
            if (lt) return lt;
        }
        // 2. 包裹的 <label>
        const wrap = input.closest ? input.closest('label') : null;
        const wt = nodeText(wrap);
        if (wt) return wt;
        // 3. 相邻兄弟文本
        let sib = input.nextSibling;
        while (sib && sib.nodeType !== 3) sib = sib.nextSibling;
        if (sib && sib.nodeValue && sib.nodeValue.trim()) {
            return sib.nodeValue.replace(/\s+/g, ' ').trim();
        }
        // 4. 父节点的直接文本
        if (input.parentElement) {
            const t = ownText(input.parentElement);
            if (t) return t;
        }
        return input.value || '';
    }

    /** 归一化：去掉 A. / 1、/ （3分） 之类前缀，便于匹配 */
    function norm(s) {
        return String(s == null ? '' : s)
            .replace(/^[\s\u3000]*[A-Za-z0-9一二三四五六七八九十]{1,3}\s*[\.、\)．:：,，]\s*/, '')
            .replace(/[\s\u3000]+/g, '')
            .toLowerCase();
    }

    function optionMatches(label, answer) {
        const L = norm(label);
        const A = norm(answer);
        if (!L || !A) return false;
        if (L === A) return true;
        if (L.indexOf(A) !== -1 || A.indexOf(L) !== -1) return true;
        return false;
    }

    /** 兼容 React/Vue 受控组件：用原生 setter 赋值再派发事件 */
    function setValue(el, value) {
        let setter = null;
        try {
            const proto = el.tagName === 'TEXTAREA'
                ? HTMLTextAreaElement.prototype
                : (el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype);
            const desc = Object.getOwnPropertyDescriptor(proto, 'value');
            setter = desc && desc.set;
        } catch (e) { /* ignore */ }

        if (setter) setter.call(el, value);
        else el.value = value;

        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const TITLE_SELECTORS = [
        '.question-title', '.q-title', '.question-text', '.qtext', '.title-text',
        '.field-label', '.form-label', '.item-title', '.matrix-title',
        '[class*="question-title"]', '[class*="questionTitle"]',
        '[class*="question-text"]', '[class*="q-title"]', '[class*="title"]',
        '.label', 'legend', 'label'
    ].join(',');

    function isInside(a, b) {
        return !!(a && b && (b.contains(a) || a === b));
    }

    const NOISE_SELECTOR = [
        'nav', 'header', 'footer', 'aside',
        '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
        '[data-gt]', '[id^="gt-"]',            // 脚本自己的 UI
        '.gt-wrap', '.gt-panel', '.gt-fab', '.gt-awin',
        '[class*="devtools"]', '[class*="dev-panel"]', '[class*="debug-panel"]',
        '.dev', '#dev', '.dev-grid', '#devGrid',   // 常见调试面板
        '[data-testid]', '[data-test]', '[data-cy]',
        '[class*="pagination"]', '[class*="pager"]'
    ].join(',');

    /** 用户在设置里追加的排除选择器，动态拼在 NOISE_SELECTOR 之后 */
    function extraNoise() {
        const v = (state.excludeSelectors || '').trim();
        if (!v) return '';
        // 限制长度，防止手滑粘一大段把整个页面排掉
        return v.slice(0, 500);
    }

    /** 完整的噪声选择器（内置 + 用户自定义） */
    function noiseSelector() {
        const ex = extraNoise();
        return ex ? (NOISE_SELECTOR + ',' + ex) : NOISE_SELECTOR;
    }

    const QCTRL = 'input[type="radio"], input[type="checkbox"], textarea, select';

    /**
     * HTML 表单控件类型 → 内部处理类型。
     *
     * 原来只认 radio/checkbox/text/textarea/select 五种，真实问卷里
     * 日期、滑块、评分、颜色、文件上传都很常见，此前会被直接忽略——
     * 题目列表里少一道题，用户也看不出来。
     *
     * 归类原则：按「填写方式」而非「HTML 类型」分。
     */
    const FIELD_KIND = {
        /* 逐字输入类：模拟真人打字 */
        text:     'text',
        search:   'text',
        email:    'text',
        tel:      'text',
        url:      'text',
        password: 'text',
        number:   'text',
        textarea: 'text',

        /* 选择类 */
        radio:    'radio',
        checkbox: 'checkbox',
        select:   'select',

        /* 直接赋值类：原生控件有自己的 UI（日期选择器/滑块/取色器），
           逐字输入无意义，直接设 value 并派发事件即可 */
        date:           'value',
        datetime_local: 'value',
        month:          'value',
        week:           'value',
        time:           'value',
        range:          'value',
        color:          'value',

        /* 文件上传：浏览器安全策略禁止脚本设置 FileList，
           任何"自动上传"都是幻觉，必须显式告知用户 */
        file: 'file'
    };

    /** 元素是否为可编辑区域（contenteditable）。属性与状态双判，兼容实现差异 */
    function isEditable(el) {
        if (!el) return false;
        if (el.isContentEditable === true) return true;
        if (el.isContentEditable === false) return false;
        if (!el.getAttribute) return false;
        const a = String(el.getAttribute('contenteditable') || '').toLowerCase();
        return a === 'true' || a === '' || a === '1';
    }

    /** 取控件的内部处理类型；未知 input 类型一律按 text 处理，比直接忽略安全 */
    function fieldKind(el) {
        if (!el) return 'text';
        const tag = (el.tagName || '').toLowerCase();
        if (tag === 'select') return 'select';
        if (tag === 'textarea') return 'text';
        if (tag !== 'input') {
            /* 富文本：contenteditable 在问卷里常用于长文作答。
               判断不能只靠 el.isContentEditable——它是可选属性，
               部分环境（含部分测试环境）不实现，实测返回 undefined，
               导致富文本被当成普通文本框，写入时改的是 value 而非 innerText，
               结果写了等于没写。属性 + 状态双判，任一为真即算富文本。 */
            let ce = el.isContentEditable;
            if (ce === undefined && el.getAttribute) {
                const a = String(el.getAttribute('contenteditable') || '').toLowerCase();
                ce = (a === 'true' || a === '' || a === '1');
            }
            if (ce) return 'contenteditable';
            return 'text';
        }
        const t = String(el.type || 'text').toLowerCase().replace(/-/g, '_');
        return FIELD_KIND[t] || 'text';
    }

    /** 该类型是否能被自动填写 */
    function isFillableKind(kind) {
        return kind !== 'file';
    }

    /** 需要逐字输入的（其余直接赋值） */
    function needsTyping(kind) {
        return kind === 'text' || kind === 'contenteditable';
    }

    function isNoise(el) {
        if (!el || !el.closest) return false;
        try { return !!el.closest(noiseSelector()); } catch (e) {
            // 用户自定义选择器可能写错导致抛异常，回退到内置清单
            try { return !!el.closest(NOISE_SELECTOR); } catch (e2) { return false; }
        }
    }

    /**
     * 给候选容器打分：题目控件越多、不同 name 的组数越多，越像问卷主体。
     * 用「组数」而不是控件数，避免一个 20 选项的多选题压过 5 道单选题。
     */
    function scoreContainer(root) {
        let groups = 0;
        const names = new Set();
        try {
            root.querySelectorAll('input[type="radio"], input[type="checkbox"]')
                .forEach(function (i) {
                    if (isNoise(i)) return;
                    names.add((i.type || '') + '::' + (i.name || '__noname__'));
                });
            groups += names.size;
            root.querySelectorAll('textarea, select').forEach(function (i) {
                if (!isNoise(i)) groups++;
            });
        } catch (e) { return 0; }
        return groups;
    }

    /**
     * 选定问卷作用域。页面上的搜索框、筛选器、评论区表单、以及本脚本自己的
     * 设置面板里都有 input，直接全文档扫描必然混入大量噪声。策略：
     *   1. 优先取题目控件最密集的 <form>
     *   2. 没有合格 form 时，扫描常见问卷容器（main / #app / .survey 等）
     *   3. 仍找不到就退回 document，但提取时会逐个元素排除噪声区
     */
    function resolveScope() {
        let best = null;
        let bestScore = 0;

        // 1. form
        try {
            document.querySelectorAll('form').forEach(function (f) {
                if (isNoise(f)) return;
                const s = scoreContainer(f);
                if (s > bestScore) { bestScore = s; best = f; }
            });
        } catch (e) { /* ignore */ }
        if (best && bestScore >= 2) return best;

        // 2. 常见问卷容器
        const CAND = ['main', '[role="main"]', '#app', '#root', '#content',
                      '[class*="survey"]', '[class*="question"]', '[class*="quiz"]',
                      '[class*="form"]', '.container', '.wrapper'];
        try {
            document.querySelectorAll(CAND.join(',')).forEach(function (c) {
                if (isNoise(c)) return;
                const s = scoreContainer(c);
                if (s > bestScore) { bestScore = s; best = c; }
            });
        } catch (e) { /* ignore */ }
        if (best && bestScore >= 2) return best;

        return document;
    }

    /**
     * 为一组无 name 的同类控件找一个「最小公共容器」：
     * 从各自父节点往上走，取第一个至少包住 2 个同组控件的祖先。
     * 注意不能用 parentElement——radio 的直接父节点往往就是它自己的 <label>，
     * 那样每个选项都会被拆成独立的一组。
     */
    function containerOf(inp, set) {
        let node = inp.parentElement;
        let guard = 0;
        while (node && node !== document.body && guard++ < 8) {
            let cnt = 0;
            set.forEach(function (o) { if (node.contains(o)) cnt++; });
            if (cnt >= 2) return node;
            node = node.parentElement;
        }
        return inp.parentElement || document.body;
    }

    /** 把页面上的输入控件按「组」归类：radio/checkbox 按 name，其余各自成组 */
    function collectGroups() {
        const groups = [];
        const byName = Object.create(null);
        const noName = { radio: [], checkbox: [] };
        const inputs = resolveScope().querySelectorAll([
            /* 选择类 */
            'input[type="radio"]', 'input[type="checkbox"]', 'select', 'textarea',
            /* 文本输入类 */
            'input[type="text"]', 'input[type="search"]', 'input[type="email"]',
            'input[type="tel"]', 'input[type="url"]', 'input[type="password"]',
            'input[type="number"]',
            /* 原生 UI 控件类 */
            'input[type="date"]', 'input[type="datetime-local"]', 'input[type="month"]',
            'input[type="week"]', 'input[type="time"]', 'input[type="range"]',
            'input[type="color"]',
            /* 文件类：填不了但要采集，好明确告知用户 */
            'input[type="file"]',
            /* 富文本 */
            '[contenteditable="true"]', '[contenteditable=""]'
        ].join(','));

        inputs.forEach(function (inp) {
            // 脚本自己的设置面板、导航栏、页脚里的控件一律跳过
            if (isNoise(inp)) return;
            /* 单选/多选不在这里判可见性。
               自定义控件普遍用 opacity:0 + 1px 藏起原生 input（MUI/AntD 都这么做），
               它们看得见也点得到，只是控件本身透明。若在这一层用 isVisible 卡掉，
               整道题就没了。它们的可见性交给后面的 isEffectivelyVisible 判断。 */
            const kindVis = fieldKind(inp);
            if (kindVis !== 'radio' && kindVis !== 'checkbox' && !isVisible(inp)) return;
            const t = (inp.type || '').toLowerCase();

            const kind = fieldKind(inp);

            if (kind === 'radio' || kind === 'checkbox') {
                // 有 name：HTML 规范保证同名 radio/checkbox 属于同一题，直接合并，不再拆
                if (inp.name) {
                    const key = kind + '::name::' + inp.name;
                    if (byName[key]) { byName[key].inputs.push(inp); return; }
                    const g = { type: kind, inputs: [inp] };
                    byName[key] = g;
                    groups.push(g);
                } else {
                    noName[kind].push(inp);
                }
            } else {
                // 其余控件各自成题。type 用内部类型，填写层据此决定策略
                groups.push({ type: kind, inputs: [inp] });
            }
        });

        // 无 name 的按 DOM 就近容器分组（典型：自定义按钮组、纯 div 实现的选择器）
        ['radio', 'checkbox'].forEach(function (t) {
            const set = noName[t];
            if (!set.length) return;
            const bucket = new Map();
            set.forEach(function (inp) {
                const c = containerOf(inp, set);
                if (!bucket.has(c)) bucket.set(c, []);
                bucket.get(c).push(inp);
            });
            bucket.forEach(function (list) {
                groups.push({ type: t, inputs: list });
            });
        });

        return groups.filter(function (g) {
            return g.inputs.some(isEffectivelyVisible);
        });
    }

    /** 候选文本是否就是某个选项本身（这样的文本不能当题干） */
    function equalsSomeOption(text, labels) {
        const n = norm(text);
        if (!n) return false;
        return labels.some(function (l) { return norm(l) === n; });
    }

    /** 从控件组向上寻找题干 */
    /** 收集元素及其所有祖先（含自身） */
    function ancestorChain(el) {
        const out = [];
        let cur = el;
        while (cur && out.length < 40) { out.push(cur); cur = cur.parentElement; }
        return out;
    }

    /** 两个元素的最近公共祖先 */
    function commonAncestor(a, b) {
        if (!a || !b) return a || b;
        const ca = ancestorChain(a);
        const set = new Set(ca);
        let cur = b;
        let guard = 0;
        while (cur && guard++ < 40) {
            if (set.has(cur)) return cur;
            cur = cur.parentElement;
        }
        return a.parentElement;
    }

    /** 一组元素的最近公共祖先——也就是"题目容器" */
    function groupContainer(inputs) {
        if (!inputs.length) return null;
        let anc = inputs[0];
        for (let i = 1; i < inputs.length; i++) {
            anc = commonAncestor(anc, inputs[i]);
            if (!anc) return inputs[0].parentElement;
        }
        return anc;
    }

    /**
     * 排除法找题干：在容器内找「不含表单控件、且文本不是任何选项」的元素。
     *
     * 为什么必须有这条路：TITLE_SELECTORS 里除 label/legend 外全是类名匹配
     * （.q-title / [class*="question-title"] …），一旦平台把类名哈希化，
     * 这些选择器集体失效，只能靠 label 兜底——而 label 就是选项本身，
     * 于是题干会被抓成别的题的选项文字。
     * 题干的本质是"文字"而非"某种标签"，所以反过来用排除法定位更稳：
     * 题干不含控件，选项容器必然含控件。
     */
    function titleByExclusion(container, labels, inputs) {
        if (!container || !container.querySelectorAll) return null;
        const all = container.querySelectorAll('*');
        for (let i = 0; i < all.length; i++) {
            const el = all[i];
            // 题干不应与本题控件有包含关系
            if (inputs.some(function (e) { return isInside(el, e) || isInside(e, el); })) continue;
            // 含表单控件 → 是选项容器，不是题干
            if (el.querySelector && el.querySelector('input, textarea, select')) continue;
            const t = ownText(el);
            if (!t || t.length < 2 || t.length > 400) continue;
            if (equalsSomeOption(t, labels)) continue;
            const cleaned = stripOptionNoise(t, labels);
            if (cleaned.length >= 2 && !equalsSomeOption(cleaned, labels)) return cleaned;
        }
        return null;
    }

    function findTitle(group) {
        const first = group.inputs[0];
        const exclude = group.inputs;
        const labels = group.inputs.map(optionLabel).filter(Boolean);

        /* 起点必须是"所有选项的最近公共祖先"，不能是第一个 input。
           原因：真实表单里选项常被包 3~5 层无意义 div（组件库的做法），
           加上本题开启的 DOM 嵌套混淆，从 input 爬到题目容器可能要 8 层以上；
           而中途经过的容器往往同时包含【其他题目】的 label，
           TITLE_SELECTORS 又含 label，于是第一个被抓到的就成了别的题的选项文字
           ——实测出现过题干被抓成"不便透露"（另一题的选项）。
           从公共祖先出发，上一层基本就是题目容器，绕开了这条错路。 */
        let node = groupContainer(group.inputs) || first;
        // 单选/多选的公共祖先可能就是选项容器本身，先退一层确保能覆盖到题干
        if (node && node !== first) {
            const inNode = node.querySelector('input, textarea, select');
            if (inNode && !exclude.some(function (e) { return isInside(inNode, e); })) {
                // 容器里还有别的题的控件，说明爬过头了，退回去
            }
        }

        /* 优先走排除法：从公共祖先逐层向上，找不含控件且非选项的文本。
           这条路不依赖任何类名，混淆环境下是唯一可靠的手段。 */
        {
            let up = node;
            for (let d = 0; up && up !== document.body && d < 6; d++) {
                const t = titleByExclusion(up, labels, exclude);
                if (t) return t;
                up = up.parentElement;
            }
        }

        for (let depth = 0; node && node !== document.body && depth < 12; depth++) {
            // 先看祖先里有没有显式标题元素
            const cands = node.querySelectorAll ? node.querySelectorAll(TITLE_SELECTORS) : [];
            for (let i = 0; i < cands.length; i++) {
                const c = cands[i];
                if (exclude.some(function (e) { return isInside(c, e) || isInside(e, c); })) continue;
                // 脚本面板、导航栏里的 label 不能当题干——它们同样匹配 TITLE_SELECTORS
                if (isNoise(c)) continue;
                /* 题干元素不含任何表单控件，选项容器必然含。
                   这条在类名被随机化时尤其关键：TITLE_SELECTORS 里除了 label/legend
                   其余全是类名匹配，混淆后全部落空，只剩 label 可用，
                   而 label 恰恰就是选项——不加这条就会把别的题的选项文字当题干。 */
                if (c.querySelector && c.querySelector('input, textarea, select')) continue;
                const t = nodeText(c);
                if (t && t.length >= 2 && t.length <= 400) {
                    // 文本本身就是一个选项 —— 说明这是选项容器而非题干，跳过
                    if (equalsSomeOption(t, labels)) continue;
                    const cleaned = stripOptionNoise(t, labels);
                    if (cleaned.length >= 2 && !equalsSomeOption(cleaned, labels)) return cleaned;
                }
            }
            // 再看祖先自身的直接文本
            const own = ownText(node);
            if (own && own.length >= 2 && own.length <= 400) {
                if (equalsSomeOption(own, labels)) { node = node.parentElement; continue; }
                const cleaned = stripOptionNoise(own, labels);
                if (cleaned.length >= 2 && !equalsSomeOption(cleaned, labels)) return cleaned;
            }
            node = node.parentElement;
        }

        const lbl = optionLabel(first);
        return lbl ? ('（未识别题干）' + lbl.slice(0, 60)) : '未命名题目';
    }

    function stripOptionNoise(text, labels) {
        let out = String(text);
        labels.forEach(function (l) {
            const n = norm(l);
            if (n && n.length >= 2) {
                const re = new RegExp(esc(n), 'gi');
                out = out.replace(re, '');
            }
        });
        return out.replace(/\s+/g, ' ').trim() || String(text).replace(/\s+/g, ' ').trim();
    }

    function extractQuestions() {
        const groups = collectGroups();
        const questions = [];
        const seenRects = [];

        /* 开启布局缓存，并在进入前把所有待处理控件及其祖先链一次性读完。
           这样整轮提取的强制重排次数从"每个控件 × 每层祖先"压到 1 次，
           万级节点的页面上卡顿从数秒降到百毫秒级。 */
        RectCache.begin();
        try {
            const toWarm = [];
            groups.forEach(function (g) {
                Array.prototype.forEach.call(g.inputs, function (inp) {
                    let c = inp;
                    let n = 0;
                    while (c && n++ < 16) { toWarm.push(c); c = c.parentElement; }
                });
            });
            RectCache.prewarm(toWarm);
        } catch (e) { /* 预热失败不影响主流程，退化为逐次读取 */ }

        try {
        groups.forEach(function (g) {
            const visible = g.inputs.filter(isEffectivelyVisible);
            if (!visible.length) return;

            const options = [];
            if (g.type === 'select') {
                // 下拉框的选项在 <option> 上，不是 input 的 label
                const sel = visible[0];
                Array.prototype.forEach.call(sel.options || [], function (op) {
                    const t = nodeText(op).trim();
                    if (t && options.indexOf(t) === -1) options.push(t);
                });
            } else if (g.type === 'radio' || g.type === 'checkbox') {
                // 只有选择题才有"选项"概念
                visible.forEach(function (inp) {
                    const lbl = optionLabel(inp);
                    if (lbl && options.indexOf(lbl) === -1) options.push(lbl);
                });
            } else if (g.type === 'value') {
                /* 原生日期/滑块/取色器：把取值范围作为"选项"给出，
                   否则 AI 不知道该返回什么格式（滑块更是完全无从下手） */
                const inp = visible[0];
                /* 这里必须用原生 type 判断，不能用 fieldKind 的结果——
                   fieldKind 已经把 date/range/color 统统归一成 'value' 了，
                   再拿它去比 'date' 永远不相等，格式说明一条都推不进去，
                   AI 就收不到任何格式约定（实测 opt0 全是 null）。 */
                const rawType = String(inp.type || '').toLowerCase();
                const kind = rawType;
                if (kind === 'range') {
                    const min = inp.min !== '' ? inp.min : '0';
                    const max = inp.max !== '' ? inp.max : '100';
                    options.push('（数值范围 ' + min + ' ~ ' + max + '，请只返回一个数字）');
                } else if (kind === 'color') {
                    options.push('（请返回十六进制颜色值，形如 #4F46E5）');
                } else if (kind === 'date') {
                    options.push('（请返回 YYYY-MM-DD 格式的日期）');
                } else if (kind === 'datetime-local') {
                    options.push('（请返回 YYYY-MM-DDTHH:mm 格式）');
                } else if (kind === 'month') {
                    options.push('（请返回 YYYY-MM 格式）');
                } else if (kind === 'week') {
                    options.push('（请返回 YYYY-Www 格式，如 2026-W35）');
                } else if (kind === 'time') {
                    options.push('（请返回 HH:mm 格式）');
                }
            } else if (g.type === 'file') {
                options.push('（文件上传：脚本无法自动选择文件，需你手动操作）');
            }
            // text / contenteditable：options 保持空数组，不读输入框残留值

            /* 去重签名必须用 anchorRect，不能用 input 自身的 rect。
               自定义控件普遍把原生 input 设成 opacity:0 + 1px（或 display:none），
               rect 恒为 0，于是所有单选题算出同一个签名 "0:0:radio"，
               第一题之后同类型的题会被全部当成重复删掉——
               真实环境下这等于整份问卷只剩一道单选题。 */
            const r = anchorRect(visible[0]);
            const sig = Math.round(r.top / 8) + ':' + Math.round(r.left / 8) + ':' + g.type;
            if (seenRects.indexOf(sig) !== -1) return;
            seenRects.push(sig);

            const title = findTitle(g);
            if (!title) return;

            // 排序锚点：不能用 input 自身的 rect——自定义控件常把原生 input
            // 设成 display:none 或 1px 透明，rect 全 0，这题就会被排到最前面。
            // 改为向上找第一个有真实尺寸的祖先。
            const anchor = anchorRect(visible[0]);

            questions.push({
                index: questions.length,
                type: g.type,                       // radio|checkbox|select|text|value|file|contenteditable
                answerType: g.type === 'radio' || g.type === 'select' ? 'single'
                    : (g.type === 'checkbox' ? 'multi'
                    : (g.type === 'file' ? 'file' : 'text')),
                title: title,
                options: options,
                inputs: visible,
                _top: anchor.top,
                _left: anchor.left
            });
        });

        // 按视觉顺序排序（从上到下，从左到右）
        questions.sort(function (a, b) {
            if (Math.abs(a._top - b._top) > 20) return a._top - b._top;
            return a._left - b._left;
        });
        questions.forEach(function (q, i) {
            q.index = i;
            delete q._top;      // 排序用的临时字段，不留在结果里
            delete q._left;
        });

        return questions;
        } finally {
            // 无论中间是否抛错都要释放缓存，否则大页面会长期占着一份 Map
            RectCache.end();
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       6. 反作弊 / 风控检测（只读）
       ═══════════════════════════════════════════════════════════════════════ */

    const CAPTCHA_SIGNATURES = [
        {
            id: 'recaptcha', name: 'reCAPTCHA', level: 'high',
            re: [/recaptcha/i, /google\.com\/recaptcha/, /gstatic\.com\/recaptcha/],
            win: ['grecaptcha', '___grecaptcha_cfg'],
            dom: '.g-recaptcha, [data-sitekey], iframe[src*="recaptcha"]'
        },
        {
            id: 'hcaptcha', name: 'hCaptcha', level: 'high',
            re: [/hcaptcha\.com/i, /hcaptcha/i],
            win: ['hcaptcha'],
            dom: '.h-captcha, iframe[src*="hcaptcha"]'
        },
        {
            id: 'turnstile', name: 'Cloudflare Turnstile', level: 'high',
            re: [/challenges\.cloudflare\.com/i, /turnstile/i],
            win: ['turnstile'],
            dom: '.cf-turnstile, iframe[src*="challenges.cloudflare.com"]'
        },
        {
            id: 'geetest', name: '极验 GeeTest', level: 'high',
            re: [/geetest/i, /gt4?\.js/],
            win: ['geetest', 'initGeetest'],
            dom: '.geetest_panel, .geetest_holder'
        },
        {
            id: 'tencent', name: '腾讯验证码 / 天御', level: 'high',
            re: [/captcha\.tencent\.com/i, /turing\.captcha/i, /tdc\.js/i, /ssl\.captcha\.qq\.com/i],
            win: ['TencentCaptcha'],
            dom: 'iframe[src*="captcha.tencent"], #tcaptcha_iframe'
        },
        {
            id: 'slider', name: '滑块 / 图形验证', level: 'high',
            re: [/slider.?captcha/i, /滑动验证|滑块验证|请完成安全验证|向右滑动/],
            win: [],
            dom: '[class*="slider-captcha"], [class*="slideVerify"], [class*="captcha"]'
        },
        {
            id: 'aliyun', name: '阿里云验证码', level: 'high',
            re: [/aliyuncaptcha/i, /captcha\.aliyun\.com/i],
            win: ['AliyunCaptcha'],
            dom: '#aliyunCaptcha, [data-aliyun-captcha]'
        }
    ];

    const RISK_SDKS = [
        { name: 'FingerprintJS / FPJS', re: [/fingerprintjs/i, /fpjs/i, /@fingerprintjs/i], win: ['FingerprintJS', 'fpjs'], level: 'high' },
        { name: 'DataDome', re: [/datadome/i, /ddosprotection/i], win: ['ddjs'], level: 'high' },
        { name: 'PerimeterX / HUMAN', re: [/perimeterx/i, /_px(?:vid|de|hd|ck)?\b/i, /px-captcha/i], win: ['_pxAppId'], level: 'high' },
        { name: 'Akamai Bot Manager', re: [/akam/i, /_abck/i, /bm-verify/i, /sensor_data/i], win: ['bmak'], level: 'high' },
        { name: 'Kasada', re: [/kasada/i, /kpsdk/i, /ips\.js/i], win: ['KPSDK'], level: 'high' },
        { name: '数美 (Shumei)', re: [/shumei/i, /smcaptcha/i, /fm\.shumei/i], win: [], level: 'high' },
        { name: '同盾 (Tongdun)', re: [/tongdun/i, /fraudmetrix/i, /tdc\.js/i], win: [], level: 'high' },
        { name: '盾山 / 创宇 / 其他风控', re: [/dunshan/i, /yundun/i, /riskcontrol/i, /anti.?bot/i, /anti.?spam/i], win: [], level: 'medium' },
        { name: '会话录制 / 行为回放 (rrweb, Sentry Replay, FullStory, Clarity)', re: [/rrweb/i, /sentry.*replay/i, /fullstory/i, /logrocket/i, /clarity\.ms/i, /hotjar/i], win: ['rrweb', 'FullStory'], level: 'medium' },
        { name: '反调试 / debugger 陷阱', re: [/setInterval\(\s*function\s*\(\s*\)\s*\{\s*debugger/i, /debugger\s*;?\s*\}/i], win: [], level: 'low' }
    ];

    const TRAP_RE = [
        /请(?:直接|务必|一定)?选择[^。]{0,12}(?:第\s*[一二三四五六七八九十1-9]\s*(?:个|项|选项)?|A\s*选项|B\s*选项|非常不?(?:同意|满意|喜欢)|不确定)/i,
        /本题(?:请|应|务必)[^。]{0,10}(?:选择|选)/i,
        /(?:attention|instructional)\s*(?:check|manipulation)/i,
        /测谎|陷阱题|一致性(?:检验|校验)|甄别题/i,
        /请不要(?:选择|作答|填写)/i,
        /为了(?:验证|确认)您?(?:是|为)?(?:真人|人类|真实用户)/i,
        /select\s+(?:option\s+)?['"]?(?:three|3|strongly\s+disagree)/i
    ];

    const TRACK_RE = new RegExp(
        '(beacon|track(ing)?|analytics|collect|monitor|telemetry|heatmap|' +
        'sentry|clarity|fullstory|rrweb|logrocket|hotjar|' +
        'report|event\\?|pv\\.gif|ti\\.gif|log(ger)?\\.(js|php)|' +
        'anti.?cheat|risk|风控|防作弊|作弊)', 'i'
    );

    const LIMIT_WORDS = [
        /您(?:已经|已)?(?:参与|填写|提交|作答)(?:过|了)/,
        /每人(?:仅|只)(?:限|能)(?:填|答|提交)?一?次/,
        /同(?:一)?(?:设备|IP|手机|电脑|微信)(?:仅|只)(?:限|能)/,
        /请勿重复(?:提交|填写|作答)/,
        /该(?:问卷|链接)(?:已)?(?:失效|过期|关闭)/,
        /one\\s+response\\s+per/i,
        /already\\s+(?:responded|submitted|taken)/i
    ];

    function grams(s) {
        const g = new Set();
        const str = String(s);
        if (str.length <= 1) { if (str) g.add(str); return g; }
        for (let i = 0; i < str.length - 1; i++) g.add(str.substr(i, 2));
        return g;
    }

    function jaccard(a, b) {
        const A = grams(a), B = grams(b);
        if (!A.size || !B.size) return 0;
        let inter = 0;
        A.forEach(function (x) { if (B.has(x)) inter++; });
        return inter / (A.size + B.size - inter);
    }

    function normTitle(t) {
        return String(t || '')
            .replace(/[（(][^）)]*[）)]/g, '')
            .replace(/[\s\u3000]+/g, '')
            .toLowerCase();
    }

    /**
     * 收集用于特征匹配的"信号面"：外链资源 URL + 内联脚本内容。
     * 刻意不扫正文文本——页面里只要提到 "reCAPTCHA"（帮助文档、评论区、
     * 控制台输出）就会导致全文正则误报，把整份问卷误判成高风险。
     */
    function collectPageSignals() {
        const urls = [];
        let inline = '';
        try {
            document.querySelectorAll('script[src], iframe[src], frame[src], link[href], img[src]')
                .forEach(function (n) {
                    const u = n.getAttribute('src') || n.getAttribute('href') || '';
                    if (u) urls.push(u);
                });
        } catch (e) { /* ignore */ }
        try {
            const html = document.documentElement.outerHTML.slice(0, CFG.scanPromptLimit);
            const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
            let m;
            while ((m = re.exec(html)) !== null) inline += m[1] + '\n';
        } catch (e) { /* ignore */ }
        return { urls: urls, inline: inline, haystack: urls.join('\n') + '\n' + inline };
    }

    const RiskScanner = {
        scan(questions, historyTitles) {
            const findings = [];
            const ctx = {
                signals: collectPageSignals(),
                questions: questions || [],
                historyTitles: historyTitles || [],
                scope: resolveScope(),
                media: { media: false, interactive: false }
            };

            this._scanCaptcha(ctx, findings);
            this._scanRiskSDK(ctx, findings);
            this._scanHoneypot(ctx, findings);
            this._scanBehavior(ctx, findings);
            this._scanTrapQuestions(ctx, findings);
            this._scanDuplicates(ctx, findings);
            this._scanLimits(ctx, findings);
            this._scanRandomization(ctx, findings);
            this._scanAutomation(ctx, findings);
            this._scanMedia(ctx, findings);

            let level = 'low';
            if (findings.some(f => f.level === 'high')) level = 'high';
            else if (findings.some(f => f.level === 'medium')) level = 'medium';

            const result = {
                level: level,
                findings: findings,
                scannedAt: Date.now(),
                url: location.href,
                // 高风险：禁止自动填写，强制只给建议
                forbidFill: level === 'high',
                // 中风险：可填写，但禁止自动提交且必须人工复核
                forbidAutoSubmit: level !== 'low',
                // 含媒体/交互题：即便整体评级不是中风险，也不能全自动
                hasMedia: !!(ctx.media && (ctx.media.media || ctx.media.interactive))
            };

            state.risk = result;
            state.lastScanAt = result.scannedAt;
            return result;
        },

        _push(findings, level, title, detail, evidence) {
            findings.push({
                level: level,
                title: title,
                detail: detail,
                evidence: evidence || ''
            });
        },

        _scanCaptcha(ctx, out) {
            const hay = ctx.signals.haystack;
            CAPTCHA_SIGNATURES.forEach(function (sig) {
                let via = '';
                if (sig.re.some(function (re) { return re.test(hay); })) via = '外链资源或内联脚本';
                if (!via) {
                    try {
                        if (sig.dom && document.querySelector(sig.dom)) via = 'DOM 元素';
                    } catch (e) { /* ignore */ }
                }
                if (!via && sig.win.some(function (w) { return typeof window[w] !== 'undefined'; })) {
                    via = 'window 对象';
                }
                if (via) {
                    out.push({
                        level: sig.level,
                        title: '检测到验证码：' + sig.name,
                        detail: '来源：' + via + '。自动脚本无法通过真人验证，提交会被拦截或标记。',
                        evidence: sig.name
                    });
                }
            });
        },

        _scanRiskSDK(ctx, out) {
            const hay = ctx.signals.haystack;
            RISK_SDKS.forEach(function (s) {
                let via = '';
                if (s.re.some(function (re) { return re.test(hay); })) via = '外链资源或内联脚本';
                if (!via && s.win.some(function (w) { return typeof window[w] !== 'undefined'; })) {
                    via = 'window 对象';
                }
                if (via) {
                    out.push({
                        level: s.level,
                        title: '检测到风控/追踪组件：' + s.name,
                        detail: '来源：' + via + '。该组件会采集浏览器指纹、鼠标轨迹或录屏，用于识别自动化行为。',
                        evidence: s.name
                    });
                }
            });
        },

        _scanHoneypot(ctx, out) {
            const hits = [];
            const nodes = document.querySelectorAll('form input, form select, form textarea');
            nodes.forEach(function (el) {
                const ident = ((el.name || '') + ' ' + (el.id || '') + ' ' +
                    (typeof el.className === 'string' ? el.className : '')).toLowerCase();
                if (/(honeypot|hp_|_hp\b|trap|bot_|antispam|fax|middle_?name|contact_?url|personal_?website)/.test(ident)) {
                    hits.push({ el: el, kind: '蜜罐命名字段' });
                    return;
                }
                if (/(csrf|token|_tk|nonce|authenticity|__request)/.test(ident)) return;
                if (el.type === 'hidden') return;

                // 单选/多选用 CSS 隐藏自身、由父级 label 代理呈现，是自定义控件的
                // 常见做法（按钮组、评分条），不是蜜罐。蜜罐几乎总是文本输入框，
                // 靠诱使机器人填字来识别。所以只对可输入类型做「视觉隐藏」判定。
                const type = (el.type || '').toLowerCase();
                const isChoice = (type === 'radio' || type === 'checkbox');
                if (isChoice) return;

                let cs = null, r = null;
                try { cs = getComputedStyle(el); r = el.getBoundingClientRect(); } catch (e) { return; }
                const hidden = cs.display === 'none' || cs.visibility === 'hidden' ||
                    parseFloat(cs.opacity) === 0 ||
                    (r.width <= 1 && r.height <= 1) ||
                    r.right < -50 || r.bottom < -50 ||
                    r.left > (window.innerWidth + 100);
                if (hidden) hits.push({ el: el, kind: '视觉隐藏字段' });
            });

            if (hits.length) {
                // 按成因归类，避免同一类隐藏字段刷屏
                const byKind = {};
                const named = [];
                hits.forEach(function (h) {
                    byKind[h.kind] = (byKind[h.kind] || 0) + 1;
                    if (h.kind === '蜜罐命名字段') named.push(h.el.name || h.el.id || '(匿名)');
                });
                const summary = Object.keys(byKind).map(function (k) {
                    return k + ' ×' + byKind[k];
                }).join('，');
                // 匿名字段也要能定位：补上 placeholder / class
                const anon = hits.filter(function (h) {
                    return h.kind === '视觉隐藏字段' && !h.el.name && !h.el.id;
                }).length;
                out.push({
                    level: 'high',
                    title: '检测到蜜罐/隐藏陷阱字段 ×' + hits.length,
                    detail: summary + '。这些字段对真人不可见，自动填写一旦填了就会被判定为机器人。已自动跳过，请勿手动填。',
                    evidence: (named.length ? '命名字段：' + named.slice(0, 5).join('、') : '') +
                              (anon ? (named.length ? '\n' : '') + '另有 ' + anon + ' 个匿名隐藏输入框（多为自定义控件的原生 input，属正常现象）' : '')
                });
            }
        },

        _scanBehavior(ctx, out) {
            const evt = Probe.listeners;
            const behaviorCount = BEHAVIOR_EVENTS.reduce(function (sum, k) {
                return sum + (evt[k] || 0);
            }, 0);
            const keyEvents = ['mousemove', 'pointermove', 'keydown', 'visibilitychange', 'blur', 'scroll'];
            const monitored = keyEvents.filter(function (k) { return (evt[k] || 0) > 0; });

            if (behaviorCount >= 6 && monitored.length >= 3) {
                out.push({
                    level: 'medium',
                    title: '页面正在监听用户行为事件',
                    detail: '检测到 ' + behaviorCount + ' 个行为监听（' + monitored.join('、') +
                        '）。通常用于计算填答轨迹与停留时长，瞬间完成的填写极易被标记。',
                    evidence: monitored.join(', ')
                });
            } else if (behaviorCount >= 3) {
                out.push({
                    level: 'low',
                    title: '存在少量行为监听',
                    detail: '共 ' + behaviorCount + ' 个，可能是常规交互逻辑。',
                    evidence: monitored.join(', ')
                });
            }

            const trackUrls = Probe.reqs.filter(function (u) { return TRACK_RE.test(u); });
            if (trackUrls.length >= 3 || Probe.beacons >= 2 || Probe.canvasReads >= 1) {
                const sample = trackUrls.slice(0, 3).map(function (u) {
                    return u.length > 120 ? u.slice(0, 120) + '…' : u;
                });
                out.push({
                    level: Probe.canvasReads >= 1 ? 'high' : 'medium',
                    title: '检测到数据上报行为',
                    detail: '页面已发起 ' + Probe.reqs.length + ' 次请求，其中疑似埋点/上报 ' + trackUrls.length +
                        ' 次；sendBeacon ' + Probe.beacons + ' 次；canvas 指纹读取 ' + Probe.canvasReads + ' 次。',
                    evidence: sample.join('\n')
                });
            }
        },

        _scanTrapQuestions(ctx, out) {
            const hits = [];
            ctx.questions.forEach(function (q) {
                const t = String(q.title || '');
                if (TRAP_RE.some(function (re) { return re.test(t); })) {
                    hits.push({ q: q, kind: '指令型 / 注意力检验题' });
                }
                // 选项本身像指令
                q.options.forEach(function (o) {
                    if (TRAP_RE.some(function (re) { return re.test(o); })) {
                        hits.push({ q: q, kind: '选项含指令：' + o.slice(0, 30) });
                    }
                });
            });
            if (hits.length) {
                out.push({
                    level: 'high',
                    title: '疑似陷阱题（注意力检验） ×' + hits.length,
                    detail: '这类题目要求按字面指令作答（如"请选择第三项"）。AI 会按语义理解作答，必然答错并被判定无效。',
                    evidence: hits.slice(0, 5).map(function (h) {
                        return '第' + (h.q.index + 1) + '题：' + h.kind;
                    }).join('\n')
                });
            }
        },

        /**
         * 判断题干是否可信。题干提取失败时会兜底成「（未识别题干）xx」
         * 或「未命名题目」，若拿这些兜底值去做相似度比对，所有失败题目都会
         * 两两判为 1.00，瞬间刷出十几条误报——必须先把它们排除掉。
         */
        _titleTrustworthy(t) {
            if (!t) return false;
            const s = String(t);
            if (/^（未识别题干）/.test(s) || /^未命名题目$/.test(s)) return false;
            const n = normTitle(s);
            // 太短的标题（去掉括号后不足 6 字）区分度不够，容易误判
            if (n.length < 6) return false;
            // 纯数字/纯符号
            if (!/[一-龥a-zA-Z]/.test(n)) return false;
            return true;
        },

        _scanDuplicates(ctx, out) {
            const qs = ctx.questions;
            const self = this;
            const pairs = [];

            const usable = [];
            qs.forEach(function (q, i) {
                if (self._titleTrustworthy(q.title)) usable.push({ idx: i, raw: q.title, n: normTitle(q.title) });
            });

            // 同页内的相似题
            for (let i = 0; i < usable.length; i++) {
                for (let j = i + 1; j < usable.length; j++) {
                    const sim = jaccard(usable[i].n, usable[j].n);
                    if (sim >= 0.82) {
                        pairs.push({
                            ai: usable[i].idx, bi: usable[j].idx,
                            a: usable[i].raw, b: usable[j].raw,
                            sim: sim, cross: false
                        });
                    }
                }
            }

            // 与前面几页的相似题（跨页一致性校验，单页扫描看不见）
            const hist = ctx.historyTitles || [];
            usable.forEach(function (u) {
                hist.forEach(function (ht) {
                    if (!self._titleTrustworthy(ht)) return;
                    const sim = jaccard(u.n, normTitle(ht));
                    if (sim >= 0.82) pairs.push({ ai: u.idx, bi: -1, a: u.raw, b: ht, sim: sim, cross: true });
                });
            });

            if (!pairs.length) return;

            // 题干完全一样（sim≈1）多半是提取重复了同一个容器，
            // 和「问卷方设置的一致性校验题」不是一回事，要分开说清楚
            const exact = pairs.filter(function (p) { return p.sim >= 0.995; });
            const fuzzy = pairs.filter(function (p) { return p.sim < 0.995; });

            if (exact.length) {
                out.push({
                    level: 'low',
                    title: '题干重复 ×' + exact.length + '（疑似提取重复，非一致性校验）',
                    detail: '有若干题干面一致，通常是同一个容器被重复计入，或页面本身有相同文案。不影响作答，但可能造成重复填写。',
                    evidence: exact.slice(0, 3).map(function (p) {
                        return '「' + String(p.a).slice(0, 30) + '」出现多次';
                    }).join('\n')
                });
            }

            if (fuzzy.length) {
                const cross = fuzzy.filter(function (p) { return p.cross; });
                out.push({
                    level: 'medium',
                    title: '检测到相似题 ×' + fuzzy.length + (cross.length ? '（其中跨页 ' + cross.length + ' 对）' : ''),
                    detail: '常用于一致性校验（前后回答是否矛盾）。AI 分两次独立作答，答案可能不一致而被判无效。' +
                            (cross.length ? '跨页重复只有在连续作答时才能发现。' : ''),
                    evidence: fuzzy.slice(0, 5).map(function (p) {
                        return (p.cross ? '与前面某页' : '第' + (p.ai + 1) + '题') +
                               ' ↔ 「' + String(p.b).slice(0, 26) + '」（相似度 ' + p.sim.toFixed(2) + '）';
                    }).join('\n')
                });
            }
        },

        _scanLimits(ctx, out) {
            let text = '';
            try { text = nodeText(document.body).slice(0, 20000); } catch (e) { /* ignore */ }
            const hit = LIMIT_WORDS.filter(function (re) { return re.test(text); });
            if (hit.length) {
                out.push({
                    level: 'medium',
                    title: '页面含参与次数/身份限制提示',
                    detail: '可能存在 IP、账号或设备维度的去重，重复提交会被过滤。',
                    evidence: (text.match(/.{0,40}(?:仅限|只能|已经|请勿重复|失效|过期).{0,40}/) || [''])[0]
                });
            }

            if (/[?&](token|sid|uuid|resp|uid|invite|hash)=/i.test(location.search) ||
                /\/s\/[A-Za-z0-9]{8,}/.test(location.pathname)) {
                out.push({
                    level: 'medium',
                    title: '链接含一次性标识',
                    detail: 'URL 带 token / sid / 短码，说明该问卷按人发放并可追溯到具体答卷人。',
                    evidence: location.href.slice(0, 160)
                });
            }

            const cookie = document.cookie || '';
            if (/submitted|answered|responded|done|finished|wjx|survey_/i.test(cookie)) {
                out.push({
                    level: 'low',
                    title: '本地 Cookie 存在作答痕迹',
                    detail: '浏览器已留有该问卷的访问/作答记录。',
                    evidence: cookie.replace(/=[^;]+/g, '=***').slice(0, 200)
                });
            }
        },

        _scanRandomization(ctx, out) {
            let shuffle = false;
            try {
                shuffle = !!document.querySelector('[data-random], [data-shuffle], [class*="shuffle"], [class*="random"]');
            } catch (e) { /* ignore */ }
            if (!shuffle && /shuffle|randomize|Math\.random\(\)\s*-\s*0?\.5/.test(ctx.signals.haystack)) shuffle = true;
            if (shuffle) {
                out.push({
                    level: 'medium',
                    title: '题目/选项可能随机化',
                    detail: '选项顺序被打乱时，AI 按语义返回的答案需要与当前页面的真实顺序重新匹配，错位风险上升。',
                    evidence: 'data-random / shuffle 标记'
                });
            }
        },

        /**
         * 检测题目里包含 AI 无法感知的内容。
         *
         * 这是最容易被忽略的一类问题：脚本能提取题干文字，也能把选项发给 AI，
         * 但如果题目本身是"看图选择""听音判断""看视频回答"，AI 拿到的只有
         * 一句"请根据下图作答"——它看不见图，只能瞎猜，猜出来的答案必错，
         * 而且错得毫无痕迹，用户根本发现不了。
         *
         * 所以这类题目不该继续全自动，必须降级并明确告知用户"这里需要你自己看"。
         */
        /**
         * 判断一个 img/svg/canvas 是否为装饰性图标，而非真正的题目内容。
         *
         * 为什么需要：后台管理系统、组件库的菜单栏里动辄几十个 16px 的 SVG 图标，
         * 若一律算"媒体内容"，脚本会在几乎所有这类页面上误降级为半自动，
         * 全自动形同虚设。真正的题目配图（截图、示意图、图表）尺寸明显更大。
         *
         * 三条判据，命中任意一条即视为装饰：
         *   1. 明确标注 aria-hidden / role=presentation —— 辅助技术都会跳过它
         *   2. 尺寸小于阈值（默认 44px，约等于最小可点击图标的两倍）
         *   3. 位于 button / a 内部 —— 典型的按钮图标
         */
        isDecorativeMedia(el, minPx) {
            if (!el) return true;
            const MIN = (typeof minPx === 'number' && minPx >= 16) ? minPx : 44;
            try {
                const ah = el.getAttribute && el.getAttribute('aria-hidden');
                if (ah && String(ah).toLowerCase() === 'true') return true;
                const role = el.getAttribute && el.getAttribute('role');
                if (role && String(role).toLowerCase() === 'presentation') return true;
                // 按钮/链接里的图形基本都是图标
                if (el.closest && el.closest('button, a, [role="button"]')) return true;
                const r = RectCache.get(el);
                if (r.width && r.height && (r.width < MIN || r.height < MIN)) return true;
                // 取不到尺寸时按属性兜底：有 alt 且非空的通常是内容图
                const alt = el.getAttribute && el.getAttribute('alt');
                if (alt && String(alt).trim().length > 0) return false;
            } catch (e) { /* ignore */ }
            return false;
        },

        _scanMedia(ctx, out) {
            // 用户可在「风险」页关闭；图标密集的后台系统页面关掉可避免误降级
            if (state.mediaCheck === false) { ctx.media = { media: false, interactive: false }; return; }

            const qs = ctx.questions || [];
            const found = [];
            const MIN_PX = (typeof state.mediaMinPx === 'number' && state.mediaMinPx >= 16)
                ? state.mediaMinPx : 44;

            /* 媒体类：AI 看不见/听不见。
               decorative 标记该项通常是装饰性图标（菜单图标、按钮图标等），
               需要按尺寸二次过滤，否则后台管理系统这类图标密集的页面会满屏误报。 */
            const MEDIA = [
                { sel: 'img',                    key: 'image',  name: '图片',      decorative: true },
                { sel: 'video',                  key: 'video',  name: '视频',      decorative: false },
                { sel: 'audio',                  key: 'audio',  name: '音频',      decorative: false },
                { sel: 'canvas',                 key: 'canvas', name: '画布',      decorative: true },
                { sel: 'iframe',                 key: 'iframe', name: '嵌入内容',  decorative: false },
                { sel: 'svg',                    key: 'svg',    name: '矢量图',    decorative: true },
                { sel: 'object, embed',          key: 'embed',  name: '插件对象',  decorative: false }
            ];

            qs.forEach(function (q) {
                const box = q.inputs && q.inputs[0]
                    ? (q.inputs[0].closest('[class*="q"], li, tr, fieldset') || q.inputs[0].parentElement)
                    : null;
                if (!box) return;
                /* 只扫题目容器本身。
                   之前用 box.parentElement，会把整页容器都卷进来，
                   导航栏、页脚、侧边栏的图标全算到题目头上，误报率极高。 */
                const scope = box;
                MEDIA.forEach(function (m) {
                    let nodes = [];
                    try { nodes = Array.prototype.slice.call(scope.querySelectorAll(m.sel)); }
                    catch (e) { return; }
                    if (!nodes.length) return;

                    // 装饰性类型按尺寸与语义过滤掉图标
                    const real = m.decorative
                        ? nodes.filter(function (n) { return !RiskScanner.isDecorativeMedia(n, MIN_PX); })
                        : nodes;
                    if (!real.length) return;

                    found.push({
                        kind: m.key, name: m.name,
                        title: String(q.title).slice(0, 40),
                        count: real.length
                    });
                });
            });

            /* 需要真人操作的题型：脚本填不了，AI 也答不了 */
            const INTERACTIVE = [
                { sel: 'input[type=file]',               name: '文件上传' },
                { sel: 'input[type=range]',              name: '滑块评分' },
                { sel: '[class*="sortable"], [draggable=true]', name: '拖拽排序题' },
                { sel: '[class*="matrix"], table input[type=radio]', name: '矩阵量表题' },
                { sel: '[class*="signature"], [class*="sign-canvas"]', name: '手写签名' },
                { sel: '[class*="rate"], [class*="star"]', name: '星级评分' }
            ];

            const inter = [];
            const scopeRoot = ctx.scope || document;
            INTERACTIVE.forEach(function (m) {
                let n = 0;
                try { n = scopeRoot.querySelectorAll(m.sel).length; } catch (e) { return; }
                if (n > 0) inter.push({ name: m.name, count: n });
            });

            if (found.length) {
                const kinds = {};
                found.forEach(function (f) { kinds[f.name] = (kinds[f.name] || 0) + 1; });
                const summary = Object.keys(kinds).map(function (k) {
                    return k + ' ×' + kinds[k];
                }).join('、');
                this._push(out, 'medium',
                    '题目含 AI 无法感知的媒体内容',
                    '检测到 ' + summary +
                    '。AI 只能读到文字，看不见图片/视频内容，这类题目它会凭空猜测，' +
                    '答案必然不可靠。已降级为「半自动」，这些题目请你自己看过后作答。',
                    found.map(function (f) {
                        return f.title + ' → ' + f.name + (f.count > 1 ? ' ×' + f.count : '');
                    }).join('\n'));
            }

            if (inter.length) {
                this._push(out, 'medium',
                    '存在需真人操作的题型',
                    '检测到 ' + inter.map(function (i) { return i.name; }).join('、') +
                    '。这类控件无法用文字答案自动填写（文件上传受浏览器安全限制，' +
                    '滑块/排序/签名需要真实交互动作）。已降级为「半自动」。',
                    inter.map(function (i) { return i.name + ' ×' + i.count; }).join('\n'));
            }

            /* 记录到 ctx，供策略层判断是否强制降级 */
            ctx.media = { media: found.length > 0, interactive: inter.length > 0 };
        },

        _scanAutomation(ctx, out) {
            if (Probe.webdriver) {
                out.push({
                    level: 'high',
                    title: '当前环境为自动化浏览器',
                    detail: 'navigator.webdriver 为真，说明运行在 Selenium / Puppeteer 等被无头特征标记的会话中，几乎必然被风控识别。',
                    evidence: 'navigator.webdriver = true'
                });
            }
            if (/cdc_|__nightmare|__puppeteer|__playwright/i.test(ctx.signals.inline)) {
                out.push({
                    level: 'high',
                    title: '页面内置自动化工具特征检测',
                    detail: '页面代码包含对 Selenium / Puppeteer / Playwright 特征的检查逻辑。',
                    evidence: 'cdc_ / __puppeteer 等特征字符串'
                });
            }
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════
       配置导出 / 导入
       换浏览器或换机器时，Key、人设、速度参数、白名单要重填一遍很痛苦。
       导出的是明文，含 API Key，所以弹窗标题里就写明了"请妥善保管"。
       ═══════════════════════════════════════════════════════════════════════ */

    const EXPORT_KEYS = [
        'provider', 'model', 'baseUrl', 'apiKey', 'persistKey',
        'mode', 'autoSubmit', 'crossPage', 'sensitivity', 'widePanel', 'debug',
        'persona', 'customSystemPrompt', 'excludeSelectors', 'scopeSelector',
        'multiMin', 'multiMax', 'textMaxChars', 'batchSize', 'timeout', 'temperature',
        'scopeWhitelist',
        'typeSpeed', 'typeBaseMs', 'typePerCharMs', 'typeJitter', 'typeThinkMs',
        'typeThinkPerChar', 'typePauseChance', 'typeCharMinMs', 'typeCharMaxMs'
    ];

    function exportConfig() {
        const out = { _format: 'gametame-config', _version: SCRIPT_NAME, _at: Date.now() };
        EXPORT_KEYS.forEach(function (k) {
            const v = Store.get(k, undefined);
            if (v !== undefined && v !== '') out[k] = v;
        });
        return out;
    }

    function importConfig(cfg) {
        if (!cfg || typeof cfg !== 'object') throw new Error('配置为空');
        let n = 0;
        EXPORT_KEYS.forEach(function (k) {
            if (k in cfg) { Store.set(k, cfg[k]); n++; }
        });
        if ('scopeWhitelist' in cfg) { Store.set('scopeWhitelist', cfg.scopeWhitelist); n++; }
        return n;
    }

    /** 依据风险等级决定实际执行策略 */
    function resolvePolicy(risk) {
        const policy = {
            mode: state.mode,
            autoSubmit: state.autoSubmit,
            downgraded: false,
            blocked: false,
            reasons: []
        };

        if (!risk) return policy;

        if (risk.forbidFill) {
            policy.mode = 'manual';
            policy.autoSubmit = false;
            policy.blocked = true;
            policy.downgraded = true;
            policy.reasons.push('检测到高风险反作弊措施，已强制切换为「仅生成建议」，不会自动填写或提交');
        } else if (risk.hasMedia && policy.mode === 'auto') {
            /* 含图片/视频等 AI 看不见的内容时，全自动毫无意义：
               AI 只能凭空猜，猜完还照填不误，用户事后也看不出哪里错了。
               强制降到半自动，让用户至少过一眼。 */
            policy.mode = 'semi';
            policy.downgraded = true;
            policy.reasons.push('题目含图片/视频等 AI 无法感知的内容，已从「全自动」降级为「半自动」');
        }
        if (risk.forbidAutoSubmit) {
            if (policy.mode === 'auto') {
                policy.mode = 'semi';
                policy.downgraded = true;
                policy.reasons.push('检测到中风险反作弊措施，已从「全自动」降级为「半自动（人工复核后填写）」');
            }
            if (policy.autoSubmit) {
                policy.autoSubmit = false;
                policy.downgraded = true;
                policy.reasons.push('存在反作弊措施，已禁用「自动提交」，需你手动点击提交');
            }
        }
        return policy;
    }

    /* ═══════════════════════════════════════════════════════════════════════
       6.5 跨页处理
       ───────────────────────────────────────────────────────────────────────
       多页问卷有三种换页方式，脚本都要能跟上：
         A. 整页跳转（location.href / <a>）—— 脚本会重新注入，靠持久化状态续接
         B. SPA pushState —— 脚本不重载，靠 URLWatcher 捕获
         C. 前进/后退（popstate / hashchange）—— 同上
       关键点：内存中的 questions/answers 在跳转后必然丢失，所以「做到第几页、
       哪些页已完成」必须落到 GM 存储里，并在新页面重新提取题目。
       ═══════════════════════════════════════════════════════════════════════ */

    /**
     * 页面指纹：只用 pathname + 关键 query 参数，忽略 token/sid/t 这类
     * 每次都会变的一次性参数，否则同一个问卷页会被判成不同页面。
     */
    function pageKey(url) {
        let u;
        try { u = new URL(url, location.href); } catch (e) { u = location; }
        const IGNORE = /^(token|sid|uid|uuid|_t|t|ts|nonce|rand|r|v|hash|sign|session)$/i;
        const keep = [];
        try {
            u.searchParams.forEach(function (v, k) {
                if (!IGNORE.test(k)) keep.push(k + '=' + v);
            });
        } catch (e) { /* ignore */ }
        return u.origin + u.pathname + (keep.length ? '?' + keep.sort().join('&') : '');
    }

    /**
     * 页面内容指纹：题目数量 + 前若干道题干的摘要。
     *
     * 存在意义：少数 SPA 换页时不改 URL，只通过 AJAX 整体重绘内容
     * （典型是内部系统自研的表单向导）。这种情况下纯 URL 的 pageKey 不变，
     * 会被 pendingValid() 判成"原地刷新、跳转无效"，于是超时后手动续填，
     * 把上一页的答案重新填一遍——后页覆盖前页数据，问卷逻辑被打乱。
     * 加上内容指纹后，即便 URL 没变，只要题目变了就能识别出"确实换页了"。
     */
    function contentFingerprint() {
        try {
            const qs = extractQuestions();
            if (!qs.length) return 'empty';
            const head = qs.slice(0, 3).map(function (q) {
                return String(q.title || '').slice(0, 24);
            }).join('|');
            return qs.length + ':' + head;
        } catch (e) {
            return 'err';
        }
    }

    /** URL + 内容指纹，用于判断"是否真的换页了" */
    function pageId() {
        return pageKey(location.href) + '#' + contentFingerprint();
    }

    /* ═══════════════════════════════════════════════════════════════════════
       Core —— 页面理解层门面
       ─────────────────────────────────────────────────────────────────────────
       脚本五千多行，UI 构建与页面解析原本混在同一作用域，问卷平台一改 DOM
       结构，就得在成片的 UI 代码里翻找提取逻辑，维护成本很高。

       这里把"理解页面"的能力集中到一个稳定的门面上：
         · UI 与业务流程一律通过 Core.xxx 调用，不直接依赖内部函数名
         · 平台适配（改选择器、加控件类型、调标题策略）只动 Core 内部
         · 门面签名保持稳定，内部实现可随时替换而不影响调用方

       分层：
         UI / 流程编排  →  Core 门面  →  具体解析实现（extractQuestions 等）
       ═══════════════════════════════════════════════════════════════════════ */
    const Core = {
        /* ── 题目提取 ── */
        /** 提取当前页所有可作答题目 */
        questions() { return extractQuestions(); },
        /** 控件归类（供调试与平台适配排查） */
        groups() { return collectGroups(); },
        /** 元素 → 内部处理类型（radio/checkbox/select/text/value/file/contenteditable） */
        kind: fieldKind,
        /** 选项文字；allowValue=false 时禁止用输入框残留值兜底 */
        label: optionLabel,
        /** 题目容器（所有选项的最近公共祖先） */
        container: groupContainer,
        /** 题干（优先排除法，不依赖类名） */
        title: function (group) { return findTitle(group); },
        /** 排除法找题干，类名被混淆时的兜底路径 */
        titleByExclusion: function (c, labels, inputs) { return titleByExclusion(c, labels, inputs); },
        /** 视觉排序锚点（隐藏控件需向上找有尺寸的祖先） */
        anchor: anchorRect,
        /** 布局缓存控制：批量提取前 begin，结束后 end */
        rect: RectCache,

        /* ── 范围与过滤 ── */
        scope: resolveScope,
        /** 是否为蜜罐/隐藏陷阱字段 */
        isHidden: isHiddenField,
        /** 元素是否可编辑（contenteditable，兼容属性/状态实现差异） */
        isEditable: isEditable,

        /* ── 页面标识 ── */
        pageKey: pageKey,
        pageId: pageId,
        contentFingerprint: contentFingerprint,

        /* ── 模块版本，便于排查"改了没生效" ── */
        version: SCRIPT_NAME
    };

    const Session = {
        data: null,

        load() {
            const d = Store.get('session', null);
            if (!d || typeof d !== 'object') { this.data = null; return null; }
            if (!d.startedAt || Date.now() - d.startedAt > CFG.sessionTTL) {
                this.clear();
                return null;
            }
            // 换了站点/路径前缀就作废，避免把 A 问卷的进度带到 B 问卷
            if (d.origin !== location.origin) { this.clear(); return null; }
            this.data = d;
            return d;
        },

        start() {
            this.data = {
                startedAt: Date.now(),
                origin: location.origin,
                entryPath: location.pathname,
                pages: {},          // { pageKey: { ts, filled, total, title } }
                order: [],          // 已处理页面的顺序
                pending: false,     // 是否有「待继续」的跨页任务（整页跳转后靠它续接）
                autoConfirm: false, // 跨页时是否跳过逐页确认
                lastPageKey: '',
                finished: false
            };
            this.save();
            return this.data;
        },

        save() {
            if (this.data) Store.set('session', this.data);
        },

        clear() {
            this.data = null;
            Store.del('session');
        },

        /** 记录某页已处理，返回是否为重复页（用于防止来回跳造成死循环） */
        markPage(key, info) {
            if (!this.data) return false;
            const dup = Object.prototype.hasOwnProperty.call(this.data.pages, key);
            this.data.pages[key] = Object.assign({ ts: Date.now() }, info || {});
            if (!dup) this.data.order.push(key);
            // 累计题目标题，供跨页一致性校验（重复题常常分散在不同页）
            if (info && Array.isArray(info.titles) && info.titles.length) {
                this.data.titles = (this.data.titles || []).concat(info.titles);
            }
            this.data.lastPageKey = key;
            this.data.pending = false;
            this.save();
            return dup;
        },

        pageCount() {
            return this.data ? this.data.order.length : 0;
        },

        isDone(key) {
            return !!(this.data && this.data.pages[key]);
        },

        setPending(v, autoConfirm) {
            if (!this.data) return;
            this.data.pending = !!v;
            this.data.pendingAt = Date.now();
            // 记录发起换页时所在的页面，用于区分「真跳转」和「原地刷新」
            this.data.pendingFromKey = pageKey(location.href);
            try { this.data.pendingFromId = pageId(); } catch (e) { /* ignore */ }
            if (autoConfirm !== undefined) this.data.autoConfirm = !!autoConfirm;
            this.save();
        },

        /** pending 是否仍然有效（防止刷新页面后误触发自动续填） */
        pendingValid() {
            if (!this.data || !this.data.pending) return false;
            if (Date.now() - (this.data.pendingAt || 0) > CFG.navTimeout + 15000) return false;
            /* 判断是否真的换页：URL 或内容任一变化即可。
               只看 URL 会把"URL 不变但内容整体重绘"的 SPA 误判为原地刷新，
               导致超时后重复填写同一页。 */
            const from = this.data.pendingFromKey;
            if (!from) return true;
            const nowUrl = pageKey(location.href);
            const nowId = pageId();
            if (from !== nowUrl) return true;          // URL 变了，确实换页
            if (this.data.pendingFromId && this.data.pendingFromId !== nowId) return true;  // URL 没变但内容变了
            return false;
        },

        summary() {
            if (!this.data) return '';
            const n = this.data.order.length;
            let filled = 0, total = 0;
            Object.keys(this.data.pages).forEach(function (k) {
                const p = Session.data.pages[k];
                filled += (p.filled || 0);
                total += (p.total || 0);
            });
            return '已完成 ' + n + ' 页，累计填写 ' + filled + '/' + total + ' 题';
        }
    };

    /** URL 变化监听：hook History API + 事件 + 轮询兜底 */
    const URLWatcher = {
        last: '',
        timer: null,
        handler: null,

        install(handler) {
            this.handler = handler;
            this.last = location.href;

            /* 除了 URL，还要监测"URL 不变但内容整体重绘"的纯 AJAX 换页
               （内部系统自研向导的常见做法）。用 MutationObserver 感知 DOM 变动，
               只有累计变动达到规模才去算内容指纹——避免每次微调都做一次全量提取。 */
            let domChanges = 0;
            let lastFp = null;
            const maybeContentChanged = function () {
                if (!state.crossPage) return false;
                if (!Session.data || !Session.data.pending) return false;
                domChanges++;
                // 少量节点变动属正常（loading、计数刷新），超过阈值才值得核算
                if (domChanges < CFG.contentChangeNodes) return false;
                domChanges = 0;
                let fp;
                try { fp = contentFingerprint(); } catch (e) { return false; }
                if (lastFp !== null && fp !== lastFp) {
                    lastFp = fp;
                    return true;
                }
                lastFp = fp;
                return false;
            };

            const check = function () {
                if (location.href !== URLWatcher.last) {
                    const from = URLWatcher.last;
                    URLWatcher.last = location.href;
                    try { URLWatcher.handler && URLWatcher.handler(from, location.href); }
                    catch (e) { console.error('[Gametame] URL 变化处理失败', e); }
                    return;
                }
                // URL 未变，检查内容是否整体重绘
                if (maybeContentChanged()) {
                    try { URLWatcher.handler && URLWatcher.handler(location.href, location.href + '#content'); }
                    catch (e) { console.error('[Gametame] 内容变化处理失败', e); }
                }
            };

            /* MutationObserver 只做"计数"，不做任何 DOM 读取，
               避免在每个 mutation 回调里触发同步布局。 */
            try {
                const MO = window.MutationObserver;
                if (MO && document.body) {
                    this.mo = new MO(function (records) {
                        for (let i = 0; i < records.length; i++) {
                            domChanges += (records[i].addedNodes ? records[i].addedNodes.length : 0)
                                        + (records[i].removedNodes ? records[i].removedNodes.length : 0);
                        }
                    });
                    this.mo.observe(document.body, { childList: true, subtree: true });
                }
            } catch (e) { /* ignore */ }

            try {
                const ps = history.pushState;
                const rs = history.replaceState;
                history.pushState = function () {
                    const r = ps.apply(this, arguments);
                    setTimeout(check, 0);
                    return r;
                };
                history.replaceState = function () {
                    const r = rs.apply(this, arguments);
                    setTimeout(check, 0);
                    return r;
                };
            } catch (e) { /* ignore */ }

            window.addEventListener('popstate', function () { setTimeout(check, 0); });
            window.addEventListener('hashchange', function () { setTimeout(check, 0); });

            // 兜底：某些站点用 location.href 直接赋值，且不触发任何可 hook 的调用
            this.timer = setInterval(check, CFG.urlPollMs);

            // 整页离开前留个标记，方便新页面判断是否「同一份问卷的下一页」
            window.addEventListener('pagehide', function () {
                try {
                    if (Session.data && Session.data.pending) Session.save();
                } catch (e) { /* ignore */ }
            });
        }
    };

    /** 等待 DOM 稳定（题目的数量不再变化，适配懒加载/分步渲染） */
    function waitForStableQuestions(timeoutMs) {
        return new Promise(function (resolve) {
            const deadline = Date.now() + (timeoutMs || 6000);
            let lastCount = -1;
            let stableTicks = 0;
            const t = setInterval(function () {
                let n = 0;
                try { n = extractQuestions().length; } catch (e) { n = 0; }
                if (n > 0 && n === lastCount) stableTicks++;
                else stableTicks = 0;
                lastCount = n;
                if (stableTicks >= 2 || Date.now() > deadline) {
                    clearInterval(t);
                    resolve(n);
                }
            }, 350);
        });
    }

    /**
     * 找「下一页」按钮。要能区分下一页和提交：
     * 提交按钮优先由 findSubmitButton 命中，这里命中后还会再排除一次。
     */
    function findNextButton() {
        const submitBtn = findSubmitButton();
        const sels = [
            'a[class*="next"]', 'button[class*="next"]', '[id*="next"]',
            'a[class*="Next"]', 'button[class*="Next"]',
            '[class*="next-page"]', '[class*="nextPage"]',
            '.pagination a', '.pager a', '.page-nav a'
        ];
        const NEXT_RE = /^(下一页|下页|下一题|下题|下一步|继续|后一页|next|continue)$/i;
        const CONTAIN_RE = /下一页|下页|下一题|下题|下一步|继续填写|next\s*(page|step)?/i;
        const SUBMIT_RE = /提交|完成|发送|交卷|submit|finish|done/i;

        const candidates = [];

        // 1. 结构选择器（最可靠）
        sels.forEach(function (s) {
            try {
                document.querySelectorAll(s).forEach(function (el) {
                    if (isVisible(el)) candidates.push({ el: el, score: 10 });
                });
            } catch (e) { /* ignore */ }
        });

        // 2. 文案匹配（兜底，覆盖自定义类名）
        ['a', 'button', 'input[type="button"]', 'div[role="button"]', 'span[role="button"]'].forEach(function (s) {
            try {
                document.querySelectorAll(s).forEach(function (el) {
                    if (!isVisible(el)) return;
                    const t = (nodeText(el) || el.value || '').replace(/\s+/g, '');
                    if (!t || t.length > 12) return;
                    if (SUBMIT_RE.test(t)) return;          // 排除提交
                    if (NEXT_RE.test(t)) candidates.push({ el: el, score: 8 });
                    else if (CONTAIN_RE.test(t)) candidates.push({ el: el, score: 5 });
                });
            } catch (e) { /* ignore */ }
        });

        if (!candidates.length) return null;

        candidates.sort(function (a, b) { return b.score - a.score; });
        // 排除掉被识别为提交的那个元素
        for (let i = 0; i < candidates.length; i++) {
            if (candidates[i].el !== submitBtn) return candidates[i].el;
        }
        return null;
    }

    /* ═══════════════════════════════════════════════════════════════════════
       7. AI 请求
       ═══════════════════════════════════════════════════════════════════════ */

    function extractJSON(text) {
        if (!text) return null;
        let s = String(text).trim();

        // 剥离 ```json ... ``` 围栏
        const fence = s.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
        if (fence) s = fence[1].trim();

        // 截取第一个 { 到最后一个 }
        const a = s.indexOf('{');
        const b = s.lastIndexOf('}');
        if (a !== -1 && b > a) s = s.slice(a, b + 1);

        const attempts = [s, s.replace(/,\s*([}\]])/g, '$1'), s.replace(/[\u201C\u201D]/g, '"')];
        for (let i = 0; i < attempts.length; i++) {
            try { return JSON.parse(attempts[i]); } catch (e) { /* try next */ }
        }
        return null;
    }

    function requestAI(provider, model, key, prompt) {
        return new Promise(function (resolve, reject) {
            let req;
            try {
                req = provider.buildRequest(prompt, model, key, state.customBase);
            } catch (err) {
                Log.error('请求构造失败', err.message);
                reject(new Error('请求构造失败：' + err.message));
                return;
            }

            const t0 = Date.now();
            const reqUrl = String(req.url || '');
            const safeUrl = reqUrl.replace(/([?&](?:key|api[-_]?key)=)[^&]*/i, '$1***');
            Log.add('ai', '→ 发起请求 ' + provider.name,
                model + '  ' + safeUrl + '  超时 ' + Math.round(CFG.timeout / 1000) + 's',
                { promptChars: prompt.length });

            GM_xmlhttpRequest({
                method: req.method || 'POST',
                url: req.url,
                headers: req.headers,
                data: JSON.stringify(req.body),
                timeout: CFG.timeout,
                onload: function (res) {
                    const ms = Date.now() - t0;
                    if (res.status < 200 || res.status >= 300) {
                        const body = String(res.responseText || '').slice(0, 300);
                        let msg = 'HTTP ' + res.status;
                        if (res.status === 401 || res.status === 403) msg += '：API Key 无效或无权限';
                        else if (res.status === 404) msg += '：接口或模型名不存在，请检查模型名称';
                        else if (res.status === 429) msg += '：请求过于频繁或额度不足';
                        else if (res.status >= 500) msg += '：服务商端异常，请稍后重试';
                        Log.error('← 请求失败 HTTP ' + res.status, msg + '（' + ms + 'ms）', body);
                        reject(new Error(msg + (body ? '\n' + body : '')));
                        return;
                    }
                    let content = null;
                    try {
                        content = provider.parse(res);
                    } catch (e) {
                        Log.error('响应解析失败', e.message + '（' + ms + 'ms）',
                            String(res.responseText || '').slice(0, 400));
                        reject(new Error('响应解析失败：' + e.message));
                        return;
                    }
                    const data = extractJSON(content);
                    if (!data) {
                        Log.error('AI 未返回可解析 JSON', '耗时 ' + ms + 'ms',
                            String(content || '').slice(0, 400));
                        reject(new Error('AI 未返回可解析的 JSON。原始内容前 200 字：\n' +
                            String(content || '').slice(0, 200)));
                        return;
                    }
                    Log.ok('← 请求成功', provider.name + ' / ' + model + '（' + ms + 'ms）',
                        String(content || '').slice(0, 600));
                    resolve(data);
                },
                onerror: function (err) {
                    const m = '请求失败：可能是网络不通、CORS 或该域名未在 @connect 中声明。' +
                        (err && err.error ? '（' + err.error + '）' : '');
                    Log.error('← 网络错误', m);
                    reject(new Error(m));
                },
                ontimeout: function () {
                    const m = '请求超时（' + Math.round(CFG.timeout / 1000) + ' 秒）';
                    Log.error('← ' + m, provider.name + ' / ' + model);
                    reject(new Error(m));
                },
                onabort: function () {
                    Log.warn('← 请求被中止', '');
                    reject(new Error('请求被中止'));
                }
            });
        });
    }

    /* ═══════════════════════════════════════════════════════════════════════
       7.5 人设与提示词
       ───────────────────────────────────────────────────────────────────────
       没有固定人设时，同一份问卷每次问出来的答案风格都不一样，前后页还可能
       自相矛盾（前页说"每天用 3 小时"，后页说"基本不用"）。给模型一个稳定
       的人设，答案才有连贯性，也不容易被问卷的一致性校验题抓到。
       ═══════════════════════════════════════════════════════════════════════ */

    const PERSONAS = {
        none: {
            name: '不指定（默认）',
            desc: '让模型自由发挥',
            text: ''
        },
        student: {
            name: '大学生',
            desc: '20 岁上下，理工科，用 AI 写作业和查资料',
            text: '你是一名 20 岁左右的理工科大学生，日常用 AI 辅助写代码、查资料、整理笔记。' +
                  '消费能力有限，对价格敏感，看重实用性但不苛求完美。'
        },
        office: {
            name: '职场白领',
            desc: '28 岁左右，互联网行业，用 AI 提升效率',
            text: '你是一名 28 岁左右的互联网公司职员，日常用 AI 写文档、做汇报、处理数据。' +
                  '工作节奏快，最看重响应速度和准确性，对隐私有一定顾虑。'
        },
        designer: {
            name: '设计师',
            desc: '30 岁左右，创意行业，用 AI 做图和找灵感',
            text: '你是一名 30 岁左右的设计师，用 AI 生成素材、找配色灵感、做方案初稿。' +
                  '审美要求高，认为 AI 目前还替代不了创意决策，但对效率提升认可。'
        },
        teacher: {
            name: '教师',
            desc: '35 岁左右，教育行业，谨慎使用 AI',
            text: '你是一名 35 岁左右的中学教师，偶尔用 AI 出题、写教案、查教学资料。' +
                  '对 AI 的准确性要求很高，担心学生过度依赖，态度审慎但愿意尝试。'
        },
        dev: {
            name: '程序员',
            desc: '27 岁左右，后端开发，重度使用 AI',
            text: '你是一名 27 岁左右的后端工程师，每天用 AI 写代码、查 bug、做代码审查。' +
                  '技术判断力强，能明确指出 AI 在复杂逻辑和最新 API 上的短板。'
        },
        casual: {
            name: '普通用户',
            desc: '40 岁左右，非技术背景，偶尔用 AI',
            text: '你是一名 40 岁左右的普通用户，非技术背景，偶尔用 AI 查生活常识、写简单的文字。' +
                  '表达朴素口语化，不太懂技术细节，对 AI 的评价比较感性。'
        }
    };

    const Persona = {
        id: Store.get('persona', 'none'),
        customPrompt: Store.get('customSystemPrompt', ''),

        /** 组装最终 system 提示词 */
        system() {
            const parts = [];
            const p = PERSONAS[this.id];
            if (p && p.text) parts.push(p.text);
            const custom = (this.customPrompt || '').trim();
            if (custom) parts.push(custom);
            return parts.join('\n\n');
        },

        /** 人设约束会追加到 user prompt 里，双重保险（弱模型常忽略 system） */
        userHint() {
            const p = PERSONAS[this.id];
            if (!p || !p.text) return '';
            return '【人设】' + p.text + ' 请始终以这个人设的口吻和立场作答。';
        },

        hasCustom() { return !!(this.customPrompt || '').trim(); }
    };

    /**
     * 构建提示词。
     *
     * 这一版重点修掉两个实测出来的坑：
     *
     * 1. 上一版写了「若确实无法判断，填空写『暂无』」，结果 glm-4-flash 这类
     *    弱模型把这条退路当默认答案——明明有 A/B/C/D/E 五个清晰选项，它照样
     *    回「暂无」，然后脚本拿它去匹配选项，整页全废。所以退路必须堵死：
     *    任何情况都要给出一个真实选项，不许交白卷。
     *
     * 2. 上一版写「可全不选」，模型走向另一个极端——六个选项全选。真人做多选
     *    一般只挑 2~3 项，全选一眼假。所以明确给出期望数量，并在代码里兜底截断。
     *
     * 另外 value 必须完全取自 options 原文这条，用一个正例 + 一个反例说明，
     * 比单纯用文字描述有效得多。
     */
    function buildPrompt(batch, questions) {
        const items = batch.map(function (q) {
            const item = {
                index: q.index,
                type: q.answerType,   // single | multi | text
                title: q.title
            };
            /* 原来只在「不是文本题」时带 options，导致原生控件（日期/滑块/取色器）
               的格式说明被丢掉——AI 收不到任何格式提示，只能瞎返回一句中文，
               然后浏览器把非法值直接清空，控件看起来就是"填了但没生效"。
               value 类虽然 answerType 是 text，但它的 options 装的是格式约定，
               必须一起发出去。 */
            if (q.options && q.options.length &&
                (q.answerType !== 'text' || q.type === 'value')) {
                item.options = q.options;
            }
            if (q.type === 'value') item.formatHint = true;   // 提示这是格式约束而非选项
            if (q.answerType === 'text') item.maxLength = CFG.textMaxChars;
            return item;
        });

        const lines = [];
        lines.push('你是问卷填写助手。下面是一份问卷的题目，请逐题作答。');
        lines.push('');

        const hint = Persona.userHint();
        if (hint) { lines.push(hint); lines.push(''); }

        lines.push('【最重要】');
        lines.push('绝不允许交白卷。每一道题都必须给出具体答案，');
        lines.push('严禁输出"暂无""无""不知道""不确定""N/A""以上都不是"这类占位内容——');
        lines.push('选择题必须选一个真实选项，填空题必须写出具体内容。');
        lines.push('');

        lines.push('【输出格式】');
        lines.push('只输出一个 JSON 对象，不要解释、不要 markdown 代码围栏、不要多余文字。');
        lines.push('{"answers":[{"index":<题号>,"value":<答案>}]}');
        lines.push('');

        lines.push('【各题型要求】');
        lines.push('1. type="single" 单选：value 是字符串，必须完全等于 options 中的某一项原文。');
        lines.push('2. type="multi" 多选：value 是字符串数组，每项必须完全取自 options 原文。');
        lines.push('   只选你真正认同的 ' + CFG.multiMin + '~' + CFG.multiMax + ' 项，不要全选，也不要不选。');
        lines.push('3. type="text" 填空：value 是字符串，' + CFG.textMaxChars + ' 字以内，');
        lines.push('   内容具体、口语化，像真人随手写的一句话，不要写成报告腔。');
        lines.push('4. 所有题目都要出现在 answers 里，index 必须与题目一致，不得遗漏或改动。');
        lines.push('');

        lines.push('【正确示例】');
        lines.push('题目：{"index":0,"type":"single","title":"您最常用的 AI 工具是？","options":["ChatGPT","Claude","DeepSeek"]}');
        lines.push('正确：{"index":0,"value":"DeepSeek"}');
        lines.push('错误：{"index":0,"value":"DeepSeek 比较好用"}   ← 不要自己加话，必须原文');
        lines.push('错误：{"index":0,"value":"暂无"}                ← 严禁占位');
        lines.push('');
        lines.push('【原生控件题】');
        lines.push('若某题的 options 只有一项且以「（」开头，那是格式约定，不是可选项。');
        lines.push('例如 options 为「（请返回 YYYY-MM-DD 格式的日期）」时，');
        lines.push('应返回 {"index":0,"value":"2024-06-01"}——严格按约定格式，不要写别的。');
        lines.push('');

        lines.push('【题目】');
        lines.push(JSON.stringify(items, null, 2));

        return lines.join('\n');
    }

    /* ── 答案校验：模型返回的东西不能直接信，要过一遍 ── */

    /** 占位/无效答案：模型偷懒时会返回这些，必须挡掉 */
    const PLACEHOLDER_RE = /^\s*(暂无|无|不知道|不确定|不清楚|没有|同上|略|n\/?a|none|null|undefined|未知|其他)?\s*$/i;

    function isPlaceholder(v) {
        if (v === undefined || v === null) return true;
        if (Array.isArray(v)) return v.length === 0 || v.every(isPlaceholder);
        const s = String(v).trim();
        if (!s) return true;
        return PLACEHOLDER_RE.test(s);
    }

    /**
     * 答案后处理。做三件事：
     *   1. 互斥校验：AI 给的选项不在 options 里 → 记为失败，绝不乱点
     *   2. 占位符拦截：「暂无」之类挡掉，填空题尤其不能写入
     *   3. 多选题数量截断：全选一眼假，截到配置上限
     */
    function sanitizeAnswers(questions, answers) {
        const report = { dropped: [], clipped: [], placeholder: [] };

        questions.forEach(function (q, i) {
            const a = answers[i];
            if (a === undefined || a === null) return;

            /* 这几类不参与"选项匹配"校验：
               · file   —— 本就没有文本答案，拦截只是制造噪音
               · value  —— options 里放的是格式说明（如"请返回 YYYY-MM-DD"），
                           不是可选项。答案当然和它对不上，照旧匹配会把
                           AI 给的正确日期直接判无效清空，控件就填不进去。
               · contenteditable —— 同 text，走占位符检查即可 */
            if (q.type === 'file' || q.type === 'value') return;

            const isText = (q.type === 'text' || q.type === 'textarea' ||
                            q.type === 'select' || q.type === 'contenteditable');

            // 填空题：占位符直接判无效
            if (isText) {
                if (isPlaceholder(a)) {
                    report.placeholder.push({ index: i, title: q.title, value: String(a) });
                    answers[i] = undefined;
                }
                return;
            }

            // 选择题
            const opts = q.options || [];
            if (!opts.length) return;

            if (Array.isArray(a)) {
                // 先过滤掉不在选项里的
                const valid = a.filter(function (v) {
                    return opts.some(function (o) { return optionMatches(o, v); });
                });
                if (valid.length !== a.length) {
                    report.dropped.push({
                        index: i, title: q.title,
                        bad: a.filter(function (v) {
                            return !opts.some(function (o) { return optionMatches(o, v); });
                        })
                    });
                }
                // 再截断数量（全选或过多都不可信）
                if (valid.length > CFG.multiMax) {
                    report.clipped.push({ index: i, title: q.title, from: valid.length });
                    valid.length = CFG.multiMax;
                }
                answers[i] = valid.length ? valid : undefined;

            } else {
                // 单选：不匹配就判无效，绝不退化成"点第一个"
                if (isPlaceholder(a) ||
                    !opts.some(function (o) { return optionMatches(o, a); })) {
                    report.dropped.push({ index: i, title: q.title, bad: [a] });
                    answers[i] = undefined;
                }
            }
        });

        return report;
    }

    function normalizeAnswers(raw, batch) {
        let arr = null;
        if (Array.isArray(raw)) arr = raw;
        else if (raw && Array.isArray(raw.answers)) arr = raw.answers;
        if (!arr) return null;

        const map = new Map();
        arr.forEach(function (item, i) {
            let idx = i;
            let val = item;
            if (item && typeof item === 'object') {
                if (item.index !== undefined) idx = Number(item.index);
                val = (item.value !== undefined ? item.value
                    : (item.answer !== undefined ? item.answer
                        : (item.choice !== undefined ? item.choice : item.text)));
            }
            if (map.has(idx)) return;
            map.set(idx, val);
        });

        return batch.map(function (q) {
            return map.has(q.index) ? map.get(q.index) : undefined;
        });
    }

    async function answerAll(questions, onProgress) {
        const provider = currentProvider();
        const model = currentModel();
        const key = (state.apiKey || '').trim();
        const results = new Array(questions.length).fill(undefined);

        const batches = [];
        for (let i = 0; i < questions.length; i += CFG.batchSize) {
            batches.push(questions.slice(i, i + CFG.batchSize));
        }

        Log.info('开始作答', provider.name + ' / ' + model + '，共 ' + questions.length +
            ' 题，分 ' + batches.length + ' 批，每批上限 ' + CFG.batchSize + ' 题');
        // 逐题记录提取到的题目与选项，方便核对"AI 到底看到了什么"
        questions.forEach(function (q, i) {
            Log.add('info', '第 ' + (i + 1) + ' 题 [' + q.type + '/' + q.answerType + ']',
                String(q.title).slice(0, 80),
                q.options && q.options.length ? q.options : null);
        });

        for (let b = 0; b < batches.length; b++) {
            const batch = batches[b];
            if (onProgress) {
                onProgress('正在请求 AI（第 ' + (b + 1) + '/' + batches.length + ' 批，共 ' +
                    questions.length + ' 题）…');
            }
            const raw = await requestAI(provider, model, key, buildPrompt(batch, questions));
            const norm = normalizeAnswers(raw, batch);
            if (!norm) {
                Log.error('第 ' + (b + 1) + ' 批结果无法解析', '', raw);
                throw new Error('第 ' + (b + 1) + ' 批结果无法解析');
            }
            // 记录 AI 给的答案
            Log.add('ai', 'AI 返回第 ' + (b + 1) + ' 批答案（' + batch.length + ' 题）',
                batch.map(function (q, i) {
                    const v = norm[i];
                    return '  · 第 ' + (q.index + 1) + '题 → ' +
                           (v === undefined ? '（无）'
                               : String(Array.isArray(v) ? v.join('、') : v).slice(0, 50));
                }).join('\n'));
            norm.forEach(function (v, i) {
                results[batch[0].index + i] = v;
            });
        }
        Log.ok('全部批次完成', '共 ' + batches.length + ' 批');
        return results;
    }

    /* ═══════════════════════════════════════════════════════════════════════
       8. 拟人化输入
       ───────────────────────────────────────────────────────────────────────
       一次性 setValue 把整段文字塞进去，在很多页面上会出问题：
         · React/Vue 受控组件只认逐次的 input 事件序列，一次性赋值可能丢失
         · 有字数统计、实时校验、防抖保存的输入框，需要看到中间状态
         · 页面可能监听了 keydown/keyup，一次性赋值完全没有这些事件
       逐字输入更慢，但更不容易出错，也更接近真人的操作痕迹。
       ═══════════════════════════════════════════════════════════════════════ */

    /** 只派发 input 的赋值——逐字输入时每帧都派发 change 太吵了 */
    function setValueTyped(el, value) {
        let setter = null;
        try {
            const proto = el.tagName === 'TEXTAREA'
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;
            const desc = Object.getOwnPropertyDescriptor(proto, 'value');
            setter = desc && desc.set;
        } catch (e) { /* ignore */ }
        if (setter) setter.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    /**
     * 打字速度档位。
     * 这里只定义「倍率与各档的曲线参数」，实际每字耗时会根据当前题的字数
     * 动态计算——见 Human.perChar()。
     */
    const TYPE_SPEEDS = {
        off:    { mult: 0,   label: '关闭（瞬间填入）' },
        fast:   { mult: 0.45, label: '快速' },
        normal: { mult: 1,    label: '正常' },
        slow:   { mult: 1.9,  label: '慢速（更像真人）' }
    };

    const Human = {
        speed: CFG.typeSpeed || 'normal',
        token: 0,          // 中止令牌：递增即让进行中的打字循环退出

        get mult() {
            return (TYPE_SPEEDS[this.speed] || TYPE_SPEEDS.normal).mult;
        },

        /** 关闭档位：不做任何拟人延迟 */
        get enabled() { return this.mult > 0; },

        rand(min, max) { return min + Math.random() * (max - min); },

        /**
         * 按文本长度算每字耗时。
         * 真人打长句时会有"手速惯性"——越打越快，所以字数越多单字耗时越短；
         * 但不能无限快，用 typeCharMinMs 兜底，否则长答案会快到失真。
         * @param {number} len 待输入文本长度
         * @returns {number} 单字毫秒
         */
        perChar(len) {
            const n = Math.max(1, len || 1);
            // 基础耗时随长度递减
            let ms = CFG.typeBaseMs - (n - 1) * CFG.typePerCharMs;
            ms = Math.max(CFG.typeCharMinMs, Math.min(CFG.typeCharMaxMs, ms));
            ms *= this.mult;
            // 抖动：让节奏不规则，机械的匀速最假
            const j = CFG.typeJitter;
            ms *= this.rand(1 - j, 1 + j);
            return Math.max(4, ms);
        },

        /**
         * 题间思考耗时。文本越长，读题和理解的时间越久。
         */
        thinkTime(len) {
            const n = Math.max(1, len || 1);
            let ms = CFG.typeThinkMs + n * CFG.typeThinkPerChar;
            ms *= this.mult;
            ms *= this.rand(0.7, 1.35);
            return Math.max(0, ms);
        },

        /** 中止所有进行中的输入 */
        abort() { this.token++; },

        /** 该令牌是否已失效（即任务已被中止） */
        stale(t) { return t !== this.token; },

        sleep(ms) {
            return new Promise(function (r) { setTimeout(r, ms); });
        },

        rand(min, max) { return min + Math.random() * (max - min); },

        /** 新起一轮填写，返回本次的令牌 */
        begin() { return this.token; },

        /** 模拟鼠标移入并聚焦 */
        async focusEl(el, token) {
            if (this.stale(token)) return false;
            try {
                el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            } catch (e) { /* ignore */ }
            try { el.focus(); } catch (e) { /* ignore */ }
            try {
                el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
            } catch (e) { /* ignore */ }
            if (this.enabled) {
                await this.sleep(this.rand(60, 180));
            }
            return !this.stale(token);
        },

        /**
         * 逐字输入。关掉速度时退化为一次性 setValue（更快，但少了中间态）。
         * @returns {Promise<boolean>} 是否完整输入完毕（false = 被中止）
         */
        async typeInto(el, text, token) {
            if (this.stale(token)) return false;
            const str = String(text === undefined || text === null ? '' : text);
            if (!str) return true;

            // 关闭档：一次性赋值，不做拟人
            if (!this.enabled) {
                setValue(el, str);
                return true;
            }

            // Array.from 而非 split('')：正确处理 emoji 等代理对
            const chars = Array.from(str);
            const len = chars.length;

            // 已有内容则先清掉（真人一般是全选后重输）
            if (el.value) {
                setValueTyped(el, '');
                await this.sleep(this.rand(60, 160));
            }

            let typed = '';
            for (let i = 0; i < len; i++) {
                if (this.stale(token)) return false;
                typed += chars[i];
                setValueTyped(el, typed);

                let d = this.perChar(len);

                // 偶尔卡壳，模拟思考或打错字
                if (Math.random() < CFG.typePauseChance) d += this.rand(150, 420);
                // 标点后稍作停顿
                if (/[，。！？、；：,.!?;:]/.test(chars[i])) d += this.rand(60, 180);

                await this.sleep(d);
            }
            // 最后补一次 change，很多校验逻辑挂在这个事件上
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        },

        /**
         * 富文本（contenteditable）逐字输入。
         * 与 input 的区别：没有 value 属性，得改 innerText；
         * React/Vue 的富文本编辑器通常监听 input 事件并读 innerHTML/textContent。
         */
        async typeIntoEditable(el, text, token) {
            if (this.stale(token)) return false;
            const str = String(text === undefined || text === null ? '' : text);

            if (!this.enabled) {
                el.innerText = str;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }

            try { el.focus(); } catch (e) { /* ignore */ }
            const chars = Array.from(str);
            const len = chars.length;
            let typed = '';
            for (let i = 0; i < len; i++) {
                if (this.stale(token)) return false;
                typed += chars[i];
                el.innerText = typed;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                let d = this.perChar(len);
                if (/[，。！？、；：,.!?;:]/.test(chars[i])) d += this.rand(60, 180);
                await this.sleep(d);
            }
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        },

        /** 点击选择（单选/多选），带随机前后延迟 */
        async clickEl(el, token) {
            if (this.stale(token)) return false;
            if (this.enabled) await this.sleep(this.rand(50, 150));
            try {
                el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            } catch (e) { /* ignore */ }
            let ok = false;
            try { el.click(); } catch (e) { /* ignore */ }
            if (!el.checked) {
                try {
                    el.checked = true;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                } catch (e) { /* ignore */ }
            }
            ok = !!el.checked;
            if (this.enabled) await this.sleep(this.rand(40, 130));
            return ok && !this.stale(token);
        },

        /** 选择下拉项 */
        async selectOption(sel, value, token) {
            if (this.stale(token)) return false;
            try { sel.focus(); } catch (e) { /* ignore */ }
            setValue(sel, value);
            if (this.enabled) await this.sleep(this.rand(80, 200));
            return !this.stale(token);
        },

        /**
         * 两道题之间的思考间隔。
         * 传入下一题的答案长度，答案越长说明题越复杂，停顿也该更久。
         */
        async think(token, nextLen) {
            if (this.stale(token)) return false;
            if (!this.enabled) return true;
            await this.sleep(this.thinkTime(nextLen || 0));
            return !this.stale(token);
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════
       8. 填写（按 DOM 控件类型分支；跳过蜜罐/隐藏字段）
       ═══════════════════════════════════════════════════════════════════════ */

    function isHiddenField(el) {
        if (el.type === 'hidden') return true;
        return !isEffectivelyVisible(el);
    }

    function selectOne(input) {
        if (isHiddenField(input)) return false;
        try { input.click(); } catch (e) { /* ignore */ }
        if (input.checked) {
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('click', { bubbles: true }));
            return true;
        }
        try {
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return input.checked;
        } catch (e) { return false; }
    }

    /**
     * 填写。改为异步逐题、逐字进行，不再一次性全部写入。
     * opts.onProgress(done, total, title) 用于面板显示进度。
     */
    async function fillAnswers(questions, answers, opts) {
        opts = opts || {};
        const report = { filled: 0, failed: [], sanitized: null };
        const token = opts.token !== undefined ? opts.token : Human.begin();
        const total = questions.length;

        // 先过一遍校验：挡掉占位符、剔除不在选项里的答案、截断多选全选
        const safeAnswers = answers.slice();
        const san = sanitizeAnswers(questions, safeAnswers);
        report.sanitized = san;
        if (san.placeholder.length) {
            Log.warn('拦截占位答案 ×' + san.placeholder.length,
                san.placeholder.map(function (p) {
                    return '第 ' + (p.index + 1) + '题「' + String(p.value).slice(0, 12) + '」';
                }).join('、'));
        }
        if (san.dropped.length) {
            Log.warn('剔除无效选项 ×' + san.dropped.length,
                san.dropped.map(function (d) {
                    return '第 ' + (d.index + 1) + '题（AI 给了选项外的答案）';
                }).join('、'));
        }
        if (san.clipped.length) {
            Log.info('多选题数量截断 ×' + san.clipped.length,
                '限制在 ' + CFG.multiMax + ' 项以内，避免全选');
        }

        for (let i = 0; i < questions.length; i++) {
            if (Human.stale(token)) {
                Log.warn('填写已中止', '在第 ' + (i + 1) + ' 题前收到中止信号');
                report.aborted = true;
                break;
            }

            const q = questions[i];
            const answer = safeAnswers[i];

            if (opts.onProgress) {
                try { opts.onProgress(i, total, q.title); } catch (e) { /* ignore */ }
            }

            if (answer === undefined || answer === null) {
                report.failed.push({ index: i, title: q.title, reason: 'AI 未返回答案' });
                Log.warn('✗ 第 ' + (i + 1) + ' 题无答案', String(q.title).slice(0, 50));
                continue;
            }

            const usable = q.inputs.filter(function (inp) { return !isHiddenField(inp); });
            if (!usable.length) {
                report.failed.push({ index: i, title: q.title, reason: '字段为隐藏/蜜罐，已跳过' });
                Log.info('⊘ 第 ' + (i + 1) + ' 题跳过', '字段为隐藏/蜜罐');
                continue;
            }

            let ok = false;

            if (q.type === 'radio' || q.type === 'checkbox') {
                const wanted = Array.isArray(answer) ? answer : [answer];
                const matched = [];
                usable.forEach(function (inp) {
                    const lbl = optionLabel(inp);
                    if (wanted.some(function (w) { return optionMatches(lbl, w); })) matched.push(inp);
                });

                if (!matched.length) {
                    report.failed.push({
                        index: i,
                        title: q.title,
                        reason: '无选项匹配答案「' + String(answer).slice(0, 40) + '」'
                    });
                    Log.warn('✗ 第 ' + (i + 1) + ' 题无匹配选项',
                        String(q.title).slice(0, 40) + ' → ' + String(answer).slice(0, 40));
                    continue;
                }

                // 多选题每个选项之间也留出间隔，不要一瞬间全勾上
                if (q.type === 'radio') {
                    ok = await Human.clickEl(matched[0], token);
                } else {
                    let n = 0;
                    for (let k = 0; k < matched.length; k++) {
                        if (Human.stale(token)) break;
                        if (await Human.clickEl(matched[k], token)) n++;
                    }
                    ok = n > 0;
                }

            } else if (q.type === 'file') {
                /* 文件上传：浏览器禁止脚本给 input[type=file] 赋值（安全策略），
                   任何声称能自动上传的方案要么是伪协议要么需要扩展权限。
                   如实告知，不要假装成功。 */
                report.failed.push({
                    index: i, title: q.title,
                    reason: '文件上传需你手动选择，脚本无法代为操作'
                });
                Log.warn('⚠ 第 ' + (i + 1) + ' 题需手动上传',
                    String(q.title).slice(0, 40) + ' — 浏览器安全策略禁止脚本设置文件');
                continue;

            } else if (q.type === 'value') {
                /* 原生 UI 控件：直接赋值。
                   逐字输入对日期选择器/滑块没有意义——它们根本不接受字符输入，
                   硬逐字只会让浏览器忽略或触发校验错误。 */
                const el = usable[0];
                const raw = Array.isArray(answer) ? answer[0] : answer;
                const v = String(raw === undefined || raw === null ? '' : raw).trim();
                if (!v) {
                    report.failed.push({ index: i, title: q.title, reason: '控件无有效值' });
                    continue;
                }
                const kind = fieldKind(el);
                const before = el.value;
                if (kind === 'range') {
                    const num = parseFloat(v.replace(/[^0-9.\-]/g, ''));
                    if (isNaN(num)) {
                        report.failed.push({ index: i, title: q.title, reason: '滑块需要数字，收到「' + v.slice(0, 20) + '」' });
                        Log.warn('✗ 第 ' + (i + 1) + ' 题滑块值无效', v.slice(0, 30));
                        continue;
                    }
                    const lo = el.min !== '' ? parseFloat(el.min) : 0;
                    const hi = el.max !== '' ? parseFloat(el.max) : 100;
                    el.value = String(Math.max(lo, Math.min(hi, num)));
                } else if (kind === 'color') {
                    const c = v.trim();
                    el.value = /^#[0-9a-fA-F]{6}$/.test(c) ? c
                             : (/^#[0-9a-fA-F]{3}$/.test(c) ? c : '#4F46E5');
                } else {
                    el.value = v;
                }
                // 原生控件同样要派发事件，否则框架拿不到变更
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                ok = (el.value !== before) || el.value === v;
                if (!ok) {
                    report.failed.push({ index: i, title: q.title, reason: '控件赋值未生效' });
                    Log.warn('✗ 第 ' + (i + 1) + ' 题控件赋值失败', String(q.title).slice(0, 40));
                    continue;
                }

            } else if (q.type === 'contenteditable') {
                /* 富文本：没有 value，改 innerText + 逐字输入 */
                const el = usable[0];
                const text = Array.isArray(answer) ? answer.join('；') : String(answer);
                await Human.focusEl(el, token);
                ok = await Human.typeIntoEditable(el, text, token);
                if (!ok) {
                    report.failed.push({ index: i, title: q.title, reason: '富文本写入失败' });
                    continue;
                }

            } else if (q.type === 'select') {
                const sel = usable[0];
                const want = Array.isArray(answer) ? answer[0] : answer;
                let target = null;
                const optList = Array.prototype.slice.call(sel.options || []);
                for (let k = 0; k < optList.length; k++) {
                    if (optionMatches(optList[k].text, want) || norm(optList[k].value) === norm(want)) {
                        target = optList[k];
                        break;
                    }
                }
                if (target) ok = await Human.selectOption(sel, target.value, token);
                else {
                    report.failed.push({ index: i, title: q.title, reason: '下拉无匹配选项' });
                    Log.warn('✗ 第 ' + (i + 1) + ' 题下拉无匹配', String(q.title).slice(0, 40));
                    continue;
                }

            } else {
                const el = usable[0];
                const text = Array.isArray(answer) ? answer.join('；') : String(answer);
                const maxLen = el.maxLength && el.maxLength > 0 ? el.maxLength : 0;
                const final = maxLen ? text.slice(0, maxLen) : text;
                // 先聚焦，再逐字输入
                await Human.focusEl(el, token);
                ok = await Human.typeInto(el, final, token);
                if (ok && el.value !== final) {
                    // 逐字输入可能被 maxLength 或框架拦截，兜底一次
                    setValue(el, final);
                }
            }

            if (Human.stale(token)) { report.aborted = true; break; }

            if (ok) {
                report.filled++;
                Log.add('fill', '✓ 第 ' + (i + 1) + ' 题已填写',
                    String(q.title).slice(0, 50) + ' → ' +
                    String(Array.isArray(answer) ? answer.join('、') : answer).slice(0, 60));
            } else {
                report.failed.push({ index: i, title: q.title, reason: '写入失败（可能是受控组件）' });
                Log.warn('✗ 第 ' + (i + 1) + ' 题写入失败', String(q.title).slice(0, 50));
            }

            // 题间思考间隔（最后一题不用等）；按下一题答案长度估算读题时间
            if (i < questions.length - 1) {
                const nxt = safeAnswers[i + 1];
                const nlen = Array.isArray(nxt) ? nxt.join('').length
                           : (nxt === undefined || nxt === null ? 0 : String(nxt).length);
                const alive = await Human.think(token, nlen);
                if (!alive) { report.aborted = true; break; }
            }
        }

        if (opts.onProgress) {
            try { opts.onProgress(total, total, ''); } catch (e) { /* ignore */ }
        }

        // 汇总：失败的题必须列出来，否则用户只知道"失败了 3 题"却不知道是哪 3 题
        const s = report.sanitized || {};
        const guarded = (s.placeholder || []).length + (s.dropped || []).length;
        if (guarded) {
            Log.info('校验拦截了 ' + guarded + ' 条无效答案',
                '这些题未填写。通常是模型返回了占位内容或选项外的答案，可在「AI」页更换模型或调低随机性。');
        }

        Log.add(report.failed.length ? 'warn' : 'ok',
            '填写完成：成功 ' + report.filled + ' / ' + total,
            report.failed.length
                ? '失败题目：\n' + report.failed.map(function (f) {
                    return '  · 第 ' + (f.index + 1) + '题 「' +
                           String(f.title).slice(0, 30) + '」— ' + f.reason;
                }).join('\n')
                : '全部题目均已成功写入');

        return report;
    }

    function findSubmitButton() {
        const sels = [
            'button[type="submit"]',
            'input[type="submit"]',
            'form button:not([type="button"]):not([type="reset"])',
            '[class*="submit"]:not([class*="success"]):not([class*="result"])',
            '[id*="submit"]'
        ];
        for (let i = 0; i < sels.length; i++) {
            const nodes = document.querySelectorAll(sels[i]);
            for (let j = 0; j < nodes.length; j++) {
                const el = nodes[j];
                if (!isVisible(el)) continue;
                const t = (nodeText(el) || el.value || '').replace(/\s+/g, '');
                if (/提交|提交问卷|submit|完成|发送/i.test(t)) return el;
            }
        }
        return null;
    }

    /* ═══════════════════════════════════════════════════════════════════════
       9. UI（Shadow DOM 隔离，避免 ID/样式冲突，全部用 textContent 防 XSS）
       ═══════════════════════════════════════════════════════════════════════ */

    const ui = {};

    const CSS = [
        ':host{all:initial}',
        '.gt-wrap{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;',
        'font-size:13px;color:#1f2933;line-height:1.5}',

        /* ── 悬浮球 ── */
        '.gt-fab{position:fixed;width:46px;height:46px;border-radius:50%;background:#2563eb;color:#fff;',
        'font-size:21px;display:flex;align-items:center;justify-content:center;cursor:grab;',
        'box-shadow:0 4px 14px rgba(0,0,0,.28);user-select:none;-webkit-user-select:none;z-index:2147483000;',
        'touch-action:none;transition:background .15s}',
        '.gt-fab:hover{background:#1d4ed8}',
        '.gt-fab.dragging{cursor:grabbing;box-shadow:0 8px 22px rgba(0,0,0,.36);transform:scale(1.06)}',
        '.gt-fab.risk-high{background:#dc2626}',
        '.gt-fab.risk-high:hover{background:#b91c1c}',
        '.gt-fab.risk-medium{background:#d97706}',
        '.gt-fab.risk-medium:hover{background:#b45309}',
        '.gt-badge{position:absolute;top:-3px;right:-3px;min-width:18px;height:18px;padding:0 5px;',
        'border-radius:9px;background:#dc2626;color:#fff;font-size:11px;line-height:18px;',
        'text-align:center;font-weight:600;border:2px solid #fff}',
        '.gt-awin{position:fixed;width:340px;height:320px;background:#fff;border-radius:12px;',
        'box-shadow:0 10px 34px rgba(0,0,0,.26);display:none;flex-direction:column;',
        'overflow:hidden;z-index:2147483002;border:1px solid #e4e7eb}',
        '.gt-awin .aw-hd{display:flex;align-items:center;gap:8px;padding:9px 11px;background:#f0fdf4;',
        'border-bottom:1px solid #bbf7d0;cursor:grab;user-select:none;-webkit-user-select:none;flex-shrink:0;',
        'touch-action:none}',
        '.gt-awin .aw-hd .t{font-weight:600;font-size:13px;color:#166534;flex:1;',
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.gt-awin .aw-hd .m{width:22px;height:22px;border:none;background:transparent;cursor:pointer;',
        'border-radius:4px;color:#166534;font-size:13px;line-height:1;flex-shrink:0}',
        '.gt-awin .aw-hd .m:hover{background:#dcfce7}',
        '.gt-awin .aw-bd{flex:1;min-height:0;overflow-y:auto;padding:10px 11px;font-size:12.5px}',
        '.gt-awin .aw-warn{padding:7px 9px;margin-bottom:9px;border-radius:6px;font-size:11.5px;',
        'background:#fef2f2;color:#991b1b;border:1px solid #fecaca;line-height:1.5}',
        '.gt-awin .aw-item{display:flex;gap:8px;margin-bottom:8px;padding:8px 9px;background:#f8fafc;',
        'border-radius:7px;border-left:3px solid #2563eb}',
        '.gt-awin .aw-item .ix{flex-shrink:0;width:18px;height:18px;border-radius:50%;background:#2563eb;',
        'color:#fff;font-size:11px;line-height:18px;text-align:center;font-weight:600}',
        '.gt-awin .aw-item .bd{flex:1;min-width:0}',
        '.gt-awin .aw-item .qt{font-weight:600;color:#1f2933;margin-bottom:3px;word-break:break-word;line-height:1.45}',
        '.gt-awin .aw-item .av{color:#065f46;word-break:break-word;line-height:1.5;white-space:pre-wrap}',
        '.gt-awin .aw-item .av.none{color:#dc2626}',
        '.gt-awin .aw-item .cp{flex-shrink:0;align-self:flex-start;border:none;background:transparent;',
        'cursor:pointer;color:#2563eb;font-size:11px;padding:1px 5px;border-radius:4px}',
        '.gt-awin .aw-item .cp:hover{background:#eff6ff}',
        '.gt-awin .aw-ft{display:flex;gap:8px;padding:9px 11px;border-top:1px solid #e4e7eb;flex-shrink:0}',
        '.gt-awin .aw-tip{padding:5px 11px;font-size:10.5px;color:#9aa5b1;background:#f8fafc;',
        'border-top:1px solid #eef1f4;flex-shrink:0}',

        /* ── 面板 ──
           82vh 在笔记本上几乎顶满屏，挡住题目本身。收到 62vh，
           内容超长由 .gt-panes 内部滚动，不撑高面板。 */
        '.gt-panel{position:fixed;width:320px;background:#fff;border-radius:12px;',
        'box-shadow:0 10px 34px rgba(0,0,0,.26);display:none;flex-direction:column;',
        'overflow:hidden;z-index:2147483001;max-height:62vh}',
        '.gt-panel.wide{width:400px}',

        /* ── 页脚版权 ── */
        '.gt-foot{padding:7px 12px;background:#f8fafc;border-top:1px solid #e4e7eb;',
        'font-size:10.5px;color:#9aa5b1;text-align:center;flex-shrink:0;line-height:1.5;',
        'user-select:none;-webkit-user-select:none}',
        '.gt-foot a{color:#2563eb;text-decoration:none}',
        '.gt-foot a:hover{text-decoration:underline}',

        /* ── 特殊内容提醒条 ── */
        '.gt-media{display:flex;align-items:flex-start;gap:7px;padding:8px 10px;border-radius:7px;',
        'background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:11.5px;',
        'margin-bottom:10px;line-height:1.5}',
        '.gt-media .ic{flex-shrink:0;font-size:13px}',

        /* ── 占位：下面原来那两条 .gt-panel 规则由本段覆盖，需移除 ── */
        '.gt-head{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#f8fafc;',
        'border-bottom:1px solid #e4e7eb;cursor:grab;user-select:none;-webkit-user-select:none;flex-shrink:0;',
        'touch-action:none}',
        '.gt-head.dragging{cursor:grabbing}',
        '.gt-head .ttl{font-weight:600;font-size:13.5px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.gt-head .mini{width:24px;height:24px;border:none;background:transparent;cursor:pointer;',
        'border-radius:5px;color:#52606d;font-size:14px;line-height:1;flex-shrink:0}',
        '.gt-head .mini:hover{background:#e4e7eb}',

        /* ── Tab ── */
        '.gt-tabs{display:flex;gap:2px;padding:6px 6px 0;background:#f8fafc;',
        'border-bottom:1px solid #e4e7eb;overflow-x:auto;flex-shrink:0}',
        '.gt-tab{flex:1;min-width:52px;padding:6px 4px;border:none;background:transparent;cursor:pointer;',
        'font-size:12px;color:#52606d;border-radius:6px 6px 0 0;white-space:nowrap;',
        'border-bottom:2px solid transparent;margin-bottom:-1px}',
        '.gt-tab:hover{background:#eef2f7;color:#1f2933}',
        '.gt-tab.active{color:#2563eb;font-weight:600;border-bottom-color:#2563eb;background:#fff}',
        '.gt-tab .dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#dc2626;',
        'margin-left:3px;vertical-align:middle}',
        '.gt-panes{overflow-y:auto;padding:12px;flex:1;min-height:0}',
        '.gt-pane{display:none}.gt-pane.active{display:block}',

        /* ── 表单 ── */
        '.gt-field{margin-bottom:11px}',
        '.gt-field>label{display:block;font-size:11.5px;color:#52606d;margin-bottom:3px;font-weight:500}',
        '.gt-field input[type=text],.gt-field input[type=password],.gt-field select{width:100%;',
        'box-sizing:border-box;padding:6px 8px;border:1px solid #cbd2d9;border-radius:6px;',
        'font-size:13px;background:#fff;font-family:inherit}',
        '.gt-field input:focus,.gt-field select:focus{outline:none;border-color:#2563eb}',
        '.gt-check{display:flex;align-items:flex-start;gap:6px;font-size:12px;color:#3e4c59;',
        'cursor:pointer;padding:3px 0;line-height:1.4}',
        '.gt-check input{margin-top:2px;flex-shrink:0}',
        '.gt-group{margin-bottom:14px}',
        '.gt-group>.gt-gt{font-size:11px;font-weight:600;color:#7b8794;text-transform:uppercase;',
        'letter-spacing:.4px;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #eef1f4}',
        '.gt-hint{font-size:11px;color:#7b8794;margin-top:4px;word-break:break-word;line-height:1.45}',
        '.gt-row2{display:flex;gap:8px}.gt-row2>*{flex:1}',

        /* ── 按钮 ── */
        '.gt-btn{width:100%;padding:8px;border:none;border-radius:7px;background:#2563eb;color:#fff;',
        'font-size:13px;cursor:pointer;font-family:inherit;margin-top:6px}',
        '.gt-btn:hover{filter:brightness(.94)}',
        '.gt-btn:disabled{opacity:.5;cursor:not-allowed}',
        '.gt-btn.ok{background:#16a34a}',
        '.gt-btn.warn{background:#d97706}',
        '.gt-btn.danger{background:#dc2626}',
        '.gt-btn.ghost{background:#e4e7eb;color:#3e4c59}',
        '.gt-btn.sm{padding:6px;font-size:12px}',
        '.gt-btnrow{display:flex;gap:8px}.gt-btnrow .gt-btn{margin-top:6px}',

        /* ── 风险摘要 ── */
        '.gt-sum{display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:9px;margin-bottom:11px}',
        '.gt-sum.low{background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0}',
        '.gt-sum.medium{background:#fffbeb;color:#92400e;border:1px solid #fde68a}',
        '.gt-sum.high{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}',
        '.gt-sum .ico{font-size:22px;flex-shrink:0}',
        '.gt-sum .txt{flex:1;min-width:0}',
        '.gt-sum .lv{font-weight:600;font-size:13.5px}',
        '.gt-sum .ds{font-size:11.5px;opacity:.9;line-height:1.4;margin-top:2px}',

        /* ── 可折叠分组 ── */
        '.gt-acc{border:1px solid #e4e7eb;border-radius:8px;margin-bottom:7px;overflow:hidden}',
        '.gt-acc>.hd{display:flex;align-items:center;gap:7px;padding:7px 9px;cursor:pointer;',
        'background:#f8fafc;font-size:12px;user-select:none;-webkit-user-select:none}',
        '.gt-acc>.hd:hover{background:#eef2f7}',
        '.gt-acc>.hd .arw{font-size:9px;color:#7b8794;transition:transform .15s;flex-shrink:0}',
        '.gt-acc.open>.hd .arw{transform:rotate(90deg)}',
        '.gt-acc>.hd .nm{flex:1;font-weight:600}',
        '.gt-acc>.bd{display:none;padding:2px 0}',
        '.gt-acc.open>.bd{display:block}',
        '.gt-chip{display:inline-block;padding:1px 7px;border-radius:10px;font-size:10.5px;font-weight:600}',
        '.gt-chip.high{background:#fee2e2;color:#991b1b}',
        '.gt-chip.medium{background:#fef3c7;color:#92400e}',
        '.gt-chip.low{background:#d1fae5;color:#065f46}',

        /* ── 单条发现 ── */
        '.gt-f{border-bottom:1px solid #f0f3f6;padding:7px 9px}',
        '.gt-f:last-child{border-bottom:none}',
        '.gt-f>.hd{display:flex;align-items:flex-start;gap:6px;cursor:pointer;user-select:none;-webkit-user-select:none}',
        '.gt-f>.hd:hover .nm{color:#2563eb}',
        '.gt-f .arw2{font-size:9px;color:#9aa5b1;margin-top:4px;transition:transform .15s;flex-shrink:0}',
        '.gt-f.open .arw2{transform:rotate(90deg)}',
        '.gt-f .nm{flex:1;font-size:12px;font-weight:500;line-height:1.45}',
        '.gt-f>.bd{display:none;padding:5px 0 2px 15px}',
        '.gt-f.open>.bd{display:block}',
        '.gt-f .dt{font-size:11.5px;color:#52606d;line-height:1.5}',
        '.gt-f .ev{margin-top:5px;padding:6px 8px;background:#f5f7fa;border-radius:5px;',
        'font-size:11px;color:#52606d;white-space:pre-wrap;word-break:break-all;',
        'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.45}',

        /* ── Toast ── */
        '.gt-toast{position:fixed;right:18px;bottom:18px;max-width:340px;background:#1f2933;color:#fff;',
        'padding:11px 13px;border-radius:8px;font-size:12.5px;box-shadow:0 6px 20px rgba(0,0,0,.3);',
        'opacity:0;transform:translateY(8px);transition:all .22s ease;pointer-events:none;z-index:2147483002}',
        '.gt-toast.show{opacity:1;transform:translateY(0);pointer-events:auto}',
        '.gt-toast.high{background:#b91c1c}',
        '.gt-toast.medium{background:#b45309}',
        '.gt-toast .tt{font-weight:600;margin-bottom:3px}',

        /* ── 弹窗 ── */
        '.gt-modal{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:center;',
        'justify-content:center;z-index:2147483003;padding:16px}',
        '.gt-modal .box{background:#fff;border-radius:12px;width:100%;max-width:580px;max-height:82vh;',
        'overflow:auto;padding:16px;display:flex;flex-direction:column}',
        '.gt-modal h3{margin:0 0 10px;font-size:16px}',
        '.gt-modal pre{background:#f5f7fa;border:1px solid #e4e7eb;border-radius:6px;padding:10px;',
        'max-height:340px;overflow:auto;white-space:pre-wrap;word-break:break-all;font-size:12px}',
        '.gt-modal .actions{display:flex;gap:8px;margin-top:12px}',
        '.gt-modal .actions .gt-btn{margin-top:0}',
        '.gt-list{margin:6px 0 0;padding-left:16px;font-size:12px}',
        '.gt-empty{text-align:center;color:#9aa5b1;font-size:12px;padding:18px 8px}',


        /* ── 执行日志 ── */
        '.gt-logbox{max-height:280px;overflow-y:auto;border:1px solid #e4e7eb;border-radius:7px;',
        'background:#fbfcfd;margin-top:6px}',
        '.gt-log{display:flex;gap:6px;padding:5px 8px;border-bottom:1px solid #f0f3f6;',
        'font-size:11px;line-height:1.45;align-items:flex-start}',
        '.gt-log:last-child{border-bottom:none}',
        '.gt-log .ts{color:#9aa5b1;flex-shrink:0;font-family:ui-monospace,Menlo,monospace;font-size:10px;',
        'padding-top:1px}',
        '.gt-log .ic{flex-shrink:0;width:13px;text-align:center;font-weight:700;color:#7b8794}',
        '.gt-log .bd{flex:1;min-width:0}',
        '.gt-log .ti{font-weight:600;color:#3e4c59;word-break:break-word}',
        '.gt-log .de{color:#7b8794;white-space:pre-wrap;word-break:break-word;margin-top:2px}',
        '.gt-log .da{margin-top:3px}',
        '.gt-log .da summary{cursor:pointer;color:#2563eb;font-size:10.5px;user-select:none}',
        '.gt-log .da pre{background:#f5f7fa;border:1px solid #e4e7eb;border-radius:4px;padding:5px;',
        'margin:3px 0 0;max-height:150px;overflow:auto;white-space:pre-wrap;word-break:break-all;',
        'font-size:10px;color:#52606d;font-family:ui-monospace,Menlo,monospace}',
        ".gt-log.ok .ic{color:#16a34a}.gt-log.ok .ti{color:#15803d}",
        ".gt-log.warn .ic{color:#d97706}.gt-log.warn .ti{color:#b45309}",
        ".gt-log.err .ic{color:#dc2626}.gt-log.err .ti{color:#b91c1c}",
        ".gt-log.ai .ic{color:#7c3aed}.gt-log.ai .ti{color:#6d28d9}",
        ".gt-log.fill .ic{color:#0891b2}.gt-log.fill .ti{color:#0e7490}",
        ".gt-log.answer .ic{color:#059669}.gt-log.answer .ti{color:#047857}",
        ".gt-log.answer .ms{color:#065f46;white-space:pre-wrap;font-weight:500}"
    ].join('\n');

    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined && text !== null) n.textContent = String(text);
        return n;
    }

    /* ───────────────────────────────────────────────────────────────
       拖拽：区分「点击」与「拖拽」，拖出视口时自动贴边
       ─────────────────────────────────────────────────────────────── */

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    /**
     * 拖拽。三条关键设计：
     *   1. pointermove / pointerup 挂在 document 上——不依赖 setPointerCapture，
     *      指针快速甩出元素范围也不会丢失，拖拽手感稳定。
     *   2. 启动时排除 button——面板头部的「最小化 / 关闭」按钮就长在把手里，
     *      不排除的话点按钮也会启动拖拽，按钮就点不动了。
     *   3. 只在真正开始移动后才 preventDefault——pointerdown 上直接拦截会
     *      连带干掉后续合成的兼容性鼠标事件，按钮同样会失效。
     * 点击与拖拽靠 4px 位移阈值区分，未超阈值则视为点击并回调 onClick。
     */
    function makeDraggable(handle, target, storeKey, onClick) {
        let sx = 0, sy = 0, ox = 0, oy = 0, moved = false, dragging = false;
        let suppressClick = false;   // 拖拽结束后抑制合成 click

        // handle 与 target 相同时整个元素都能拖（悬浮球）；
        // 不同时只有落在把手区域内才启动（面板头部）。
        const wholeHandle = (handle === target);

        function hit(e) {
            if (e.button !== undefined && e.button !== 0) return false;
            // 把手上的按钮不参与拖拽（最小化/关闭）
            if (e.target && e.target.closest && e.target.closest('button')) return false;
            if (wholeHandle) return true;
            /* 判定"是否落在把手上"必须看 handle 本身，不能写死某个类名。
               之前写的是 .gt-head，而 AI 答案窗的把手叫 .aw-hd——
               永远匹配不上，于是答案窗的拖拽从头到尾就没启动过。
               用 contains 判断与具体类名解耦，新增任何可拖窗口都自动生效。 */
            return !!(handle && handle.contains && e.target && handle.contains(e.target));
        }

        // touchstart 兜底：部分移动浏览器对 pointer 事件支持不完整，
        // 显式 preventDefault 也能阻止触摸拖动时页面跟着滚动
        target.addEventListener('touchstart', function (e) {
            if (!hit(e)) return;
            if (e.touches && e.touches.length > 1) { dragging = false; return; }  // 多指手势不拦截
            const t = e.touches[0];
            const r = target.getBoundingClientRect();
            target.style.left = r.left + 'px';
            target.style.top = r.top + 'px';
            target.style.right = 'auto';
            target.style.bottom = 'auto';
            sx = t.clientX; sy = t.clientY;
            ox = r.left; oy = r.top;
            moved = false; dragging = true;
            handle.classList.add('dragging');
            target.style.transition = 'none';
            // 非 passive 才能阻止滚动
            if (e.cancelable) e.preventDefault();
        }, { passive: false });

        target.addEventListener('touchmove', function (e) {
            if (!dragging) return;
            const t = e.touches && e.touches[0];
            if (!t) return;
            const dx = t.clientX - sx;
            const dy = t.clientY - sy;
            if (!moved && Math.abs(dx) + Math.abs(dy) > 4) moved = true;
            if (!moved) return;
            if (e.cancelable) e.preventDefault();
            const r = target.getBoundingClientRect();
            target.style.left = clamp(ox + dx, 4, Math.max(4, window.innerWidth - r.width - 4)) + 'px';
            target.style.top = clamp(oy + dy, 4, Math.max(4, window.innerHeight - r.height - 4)) + 'px';
        }, { passive: false });

        target.addEventListener('touchend', function (e) {
            if (!dragging) return;
            dragging = false;
            handle.classList.remove('dragging');
            if (moved) {
                const r = target.getBoundingClientRect();
                Store.set(storeKey, { left: Math.round(r.left), top: Math.round(r.top) });
                // 触摸拖拽后抑制随后的合成 click，避免误触发 onClick
                suppressClick = true;
                setTimeout(function () { suppressClick = false; }, 180);
            } else if (onClick) {
                onClick(e);
            }
        });

        target.addEventListener('pointerdown', function (e) {
            if (!hit(e)) return;
            const r = target.getBoundingClientRect();
            // 统一用 left/top 定位，先固化当前位置
            target.style.left = r.left + 'px';
            target.style.top = r.top + 'px';
            target.style.right = 'auto';
            target.style.bottom = 'auto';
            sx = e.clientX; sy = e.clientY;
            ox = r.left; oy = r.top;
            moved = false; dragging = true;
            handle.classList.add('dragging');
            target.style.transition = 'none';
            // 指针捕获：即使指针甩出元素范围，事件也会路由回 handle
            try { handle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        });

        function onMove(e) {
            if (!dragging) return;
            const dx = e.clientX - sx;
            const dy = e.clientY - sy;
            if (!moved && Math.abs(dx) + Math.abs(dy) > 4) moved = true;
            if (!moved) return;
            e.preventDefault();          // 拖动中才阻止，避免选中文字
            const r = target.getBoundingClientRect();
            const nx = clamp(ox + dx, 4, Math.max(4, window.innerWidth - r.width - 4));
            const ny = clamp(oy + dy, 4, Math.max(4, window.innerHeight - r.height - 4));
            target.style.left = nx + 'px';
            target.style.top = ny + 'px';
        }

        function finish(e) {
            if (!dragging) return;
            dragging = false;                 // 先置位，重复到达的同一事件会被忽略
            handle.classList.remove('dragging');
            try { handle.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            if (moved) {
                const r = target.getBoundingClientRect();
                Store.set(storeKey, { left: Math.round(r.left), top: Math.round(r.top) });
                suppressClick = true;
                setTimeout(function () { suppressClick = false; }, 180);
            } else if (onClick && !suppressClick) {
                onClick(e);
            }
        }

        // 拖拽刚结束时，浏览器合成的 click 不应触发 onClick（否则拖一下就开面板）
        target.addEventListener('click', function (e) {
            if (suppressClick) { e.stopPropagation(); e.preventDefault(); }
        }, true);

        // move/up 同时挂 document 与 handle 本身：
        // document 覆盖指针甩出元素的情况（原生事件 composed:true，能穿透 Shadow DOM）；
        // handle 兜住指针捕获生效或事件不冒泡的环境。dragging 标志保证只处理一次。
        [document, target].forEach(function (node) {
            node.addEventListener('pointermove', onMove);
            node.addEventListener('pointerup', finish);
            node.addEventListener('pointercancel', finish);
        });
    }

    function applyStoredPos(node, storeKey, fallback) {
        const p = Store.get(storeKey, null);
        if (p && typeof p.left === 'number' && typeof p.top === 'number') {
            const r = node.getBoundingClientRect();
            const w = r.width || fallback.w;
            const h = r.height || fallback.h;
            node.style.left = clamp(p.left, 4, Math.max(4, window.innerWidth - w - 4)) + 'px';
            node.style.top = clamp(p.top, 4, Math.max(4, window.innerHeight - h - 4)) + 'px';
            node.style.right = 'auto';
            node.style.bottom = 'auto';
        } else {
            node.style.right = fallback.right;
            node.style.bottom = fallback.bottom;
        }
    }

    /* ───────────────────────────────────────────────────────────────
       可折叠块
       ─────────────────────────────────────────────────────────────── */

    function makeAccordion(titleNode, bodyNode, open, cls) {
        const wrap = el('div', 'gt-acc' + (open ? ' open' : ''));
        if (cls) wrap.classList.add(cls);
        const hd = el('div', 'hd');
        const arw = el('span', 'arw', '▶');
        hd.appendChild(arw);
        const nm = el('span', 'nm');
        nm.appendChild(titleNode);
        hd.appendChild(nm);
        const bd = el('div', 'bd');
        bd.appendChild(bodyNode);
        wrap.appendChild(hd);
        wrap.appendChild(bd);
        hd.addEventListener('click', function (e) {
            e.stopPropagation();
            wrap.classList.toggle('open');
        });
        return wrap;
    }

    /** 单条发现：标题可点，详情与证据默认收起 */
    function makeFinding(f) {
        const item = el('div', 'gt-f');
        const hd = el('div', 'hd');
        hd.appendChild(el('span', 'arw2', '▶'));
        const nm = el('span', 'nm', f.title);
        hd.appendChild(nm);
        item.appendChild(hd);

        const bd = el('div', 'bd');
        if (f.detail) bd.appendChild(el('div', 'dt', f.detail));
        if (f.evidence) bd.appendChild(el('div', 'ev', String(f.evidence)));
        item.appendChild(bd);

        hd.addEventListener('click', function (e) {
            e.stopPropagation();
            item.classList.toggle('open');
        });
        return item;
    }

    /* ───────────────────────────────────────────────────────────────
       面板
       ─────────────────────────────────────────────────────────────── */

    function buildUI() {
      return withoutProbe(function () {
        const host = document.createElement('div');
        host.setAttribute('data-gt', 'v3');
        host.style.cssText = 'all:initial;position:fixed;z-index:2147483000;';
        const root = host.attachShadow({ mode: 'open' });

        const style = document.createElement('style');
        style.textContent = CSS;
        root.appendChild(style);

        const wrap = el('div', 'gt-wrap');
        root.appendChild(wrap);

        /* ═══════ 悬浮球 ═══════ */
        const fab = el('div', 'gt-fab', '⚙');
        fab.title = SCRIPT_NAME + '\n单击打开面板 · 拖动可移动位置';
        const badge = el('div', 'gt-badge', '');
        badge.style.display = 'none';
        fab.appendChild(badge);
        wrap.appendChild(fab);
        applyStoredPos(fab, 'fabPos', { right: '18px', bottom: '78px', w: 46, h: 46 });

        /* ═══════ 面板 ═══════ */
        const panel = el('div', 'gt-panel');
        if (state.widePanel) panel.classList.add('wide');
        wrap.appendChild(panel);

        /* 头部（拖拽把手） */
        const head = el('div', 'gt-head');
        const headTtl = el('div', 'ttl', 'FKQuestions v1.0.0');
        head.appendChild(headTtl);
        const btnCollapse = el('button', 'gt-head-mini', '—');
        btnCollapse.className = 'mini';
        btnCollapse.title = '收起面板';
        head.appendChild(btnCollapse);
        const btnClose = el('button', 'mini', '✕');
        btnClose.className = 'mini';
        btnClose.title = '关闭面板';
        head.appendChild(btnClose);
        panel.appendChild(head);

        /* Tab 栏 */
        const tabsBar = el('div', 'gt-tabs');
        const panes = el('div', 'gt-panes');
        const TABS = [
            { id: 'fill',  label: '填写' },
            { id: 'ai',    label: 'AI' },
            { id: 'cross', label: '跨页' },
            { id: 'risk',  label: '风险' },
            { id: 'set',   label: '设置' }
        ];
        const tabBtns = {};
        const tabPanes = {};
        TABS.forEach(function (t) {
            const b = el('button', 'gt-tab', t.label);
            b.addEventListener('click', function () { switchTab(t.id); });
            tabsBar.appendChild(b);
            tabBtns[t.id] = b;
            const pn = el('div', 'gt-pane');
            tabPanes[t.id] = pn;
            panes.appendChild(pn);
        });

        panel.appendChild(tabsBar);
        panel.appendChild(panes);

        const foot = el('div', 'gt-foot');
        foot.innerHTML = '';
        foot.appendChild(document.createTextNode('© ' + new Date().getFullYear() + ' '));
        const brand = document.createElement('b');
        brand.textContent = 'FastNow Studio';
        foot.appendChild(brand);
        foot.appendChild(document.createTextNode('  |  BSD 3-Clause'));
        panel.appendChild(foot);
        applyStoredPos(panel, 'panelPos', { right: '18px', bottom: '132px', w: 320, h: 420 });

        let activeTab = Store.get('tab', 'fill');
        function switchTab(id) {
            activeTab = id;
            Store.set('tab', id);
            TABS.forEach(function (t) {
                tabBtns[t.id].classList.toggle('active', t.id === id);
                tabPanes[t.id].classList.toggle('active', t.id === id);
            });
        }

        /* ─────────── Tab: 填写 ─────────── */
        const pFill = tabPanes.fill;

        const gMode = el('div', 'gt-group');
        gMode.appendChild(el('div', 'gt-gt', '执行方式'));
        const fMode = el('div', 'gt-field');
        fMode.appendChild(el('label', null, '执行模式'));
        const selMode = document.createElement('select');
        [['auto', '全自动（直接填写）'],
         ['semi', '半自动（先给我看，确认后填写）'],
         ['manual', '仅生成建议（不碰页面）']].forEach(function (p) {
            const o = document.createElement('option');
            o.value = p[0]; o.textContent = p[1];
            selMode.appendChild(o);
        });
        selMode.value = state.mode;
        fMode.appendChild(selMode);
        gMode.appendChild(fMode);

        const labAuto = el('label', 'gt-check');
        const chkAuto = document.createElement('input');
        chkAuto.type = 'checkbox';
        chkAuto.checked = !!state.autoSubmit;
        labAuto.appendChild(chkAuto);
        labAuto.appendChild(document.createTextNode('填写后自动提交（有反作弊时会被强制关闭）'));
        gMode.appendChild(labAuto);
        pFill.appendChild(gMode);

        /* ── 打字速度 ── */
        const gType = el('div', 'gt-group');
        gType.appendChild(el('div', 'gt-gt', '填入速度'));

        const fSpeedSel = el('div', 'gt-field');
        fSpeedSel.appendChild(el('label', null, '速度档位'));
        const selSpeed = document.createElement('select');
        Object.keys(TYPE_SPEEDS).forEach(function (k) {
            const o = document.createElement('option');
            o.value = k; o.textContent = TYPE_SPEEDS[k].label;
            selSpeed.appendChild(o);
        });
        selSpeed.value = Human.speed;
        fSpeedSel.appendChild(selSpeed);
        const hintSpeed = el('div', 'gt-hint',
            '逐字输入，每题之间留随机间隔。慢速更像真人，但耗时明显更长；' +
            '部分带实时校验的输入框必须用非「关闭」速度才能正确填写。');
        fSpeedSel.appendChild(hintSpeed);
        gType.appendChild(fSpeedSel);

        // 详细参数折叠
        const spdBody = el('div', '');
        const mkRange = function (label, key, min, max, step, unit, hint) {
            const f = el('div', 'gt-field');
            const lb = el('label', null, label + '：' + CFG[key] + (unit || ''));
            f.appendChild(lb);
            const r = document.createElement('input');
            r.type = 'range';
            r.min = String(min); r.max = String(max); r.step = String(step);
            r.value = String(CFG[key]);
            r.style.width = '100%';
            f.appendChild(r);
            r.addEventListener('input', function () {
                CFG[key] = parseFloat(r.value);
                lb.textContent = label + '：' + CFG[key] + (unit || '');
            });
            r.addEventListener('change', function () { Store.set(key, CFG[key]); });
            if (hint) f.appendChild(el('div', 'gt-hint', hint));
            return f;
        };

        spdBody.appendChild(mkRange('每字基础耗时', 'typeBaseMs', 20, 1200, 10, ' ms',
            '文本很短时的单字耗时。真人中文输入约 330~670 ms/字'));
        spdBody.appendChild(mkRange('长度递减系数', 'typePerCharMs', 0, 10, 0.5, ' ms/字',
            '文本每多一个字，单字耗时的减少量——模拟打长句时的手速惯性'));
        spdBody.appendChild(mkRange('单字耗时下限', 'typeCharMinMs', 20, 800, 10, ' ms',
            '兜底值，防止长文本快到失真'));
        spdBody.appendChild(mkRange('单字耗时上限', 'typeCharMaxMs', 100, 2000, 50, ' ms'));
        spdBody.appendChild(mkRange('随机抖动', 'typeJitter', 0, 0.9, 0.05, '',
            '节奏不规则才像真人，匀速最假'));
        spdBody.appendChild(mkRange('题间思考基准', 'typeThinkMs', 0, 3000, 50, ' ms'));
        spdBody.appendChild(mkRange('读题耗时系数', 'typeThinkPerChar', 0, 40, 1, ' ms/字',
            '答案越长说明题越复杂，停顿越久'));
        spdBody.appendChild(mkRange('卡壳概率', 'typePauseChance', 0, 0.3, 0.01, ''));

        const accSpeed = makeAccordion(
            (function () {
                const fr = document.createDocumentFragment();
                fr.appendChild(document.createTextNode('详细速度参数'));
                return fr;
            })(),
            spdBody, false);
        gType.appendChild(accSpeed);
        pFill.appendChild(gType);

        const btnRun = el('button', 'gt-btn ok', '🚀 执行');
        pFill.appendChild(btnRun);
        const statusLine = el('div', 'gt-hint', '');
        pFill.appendChild(statusLine);

        /* 「预览题目」：不消耗 API 额度，先看脚本提取到了什么。
           题目提取错是最常见的问题（多提、漏提、题干抓错），
           以前只能等 AI 返回一堆对不上的答案才发现，白白烧掉一次请求。 */
        const btnPreview = el('button', 'gt-btn ghost sm', '🔍 预览提取到的题目');
        pFill.appendChild(btnPreview);

        // 执行完想看细节时，不用自己去设置页找
        const btnGotoLog = el('button', 'gt-btn ghost sm', '📜 查看执行日志');
        pFill.appendChild(btnGotoLog);

        /* 填错了想重来时，逐项手动清空很痛苦 */
        const btnClear = el('button', 'gt-btn ghost sm', '🧹 清空本页已填内容');
        pFill.appendChild(btnClear);


        /* ─────────── Tab: AI ─────────── */
        const pAI = tabPanes.ai;

        const gProv = el('div', 'gt-group');
        gProv.appendChild(el('div', 'gt-gt', '服务商'));
        const fProv = el('div', 'gt-field');
        fProv.appendChild(el('label', null, 'AI 提供商'));
        const selProvider = document.createElement('select');
        Object.keys(PROVIDERS).forEach(function (k) {
            const o = document.createElement('option');
            o.value = k; o.textContent = PROVIDERS[k].name;
            selProvider.appendChild(o);
        });
        selProvider.value = state.provider;
        fProv.appendChild(selProvider);
        gProv.appendChild(fProv);

        const fBase = el('div', 'gt-field');
        fBase.appendChild(el('label', null, '自定义端点（OpenAI 兼容）'));
        const inpBase = document.createElement('input');
        inpBase.type = 'text';
        inpBase.placeholder = 'https://…/v1/chat/completions';
        inpBase.value = state.customBase || '';
        fBase.appendChild(inpBase);
        const hintBase = el('div', 'gt-hint', '用自定义端点需在脚本头部补一行 // @connect 你的域名');
        fBase.appendChild(hintBase);
        gProv.appendChild(fBase);
        pAI.appendChild(gProv);

        const gModel = el('div', 'gt-group');
        gModel.appendChild(el('div', 'gt-gt', '模型与密钥'));
        const fModel = el('div', 'gt-field');
        fModel.appendChild(el('label', null, '模型'));
        const inpModel = document.createElement('input');
        inpModel.type = 'text';
        inpModel.value = currentModel();
        const listId = 'gt-mdl-' + Math.random().toString(36).slice(2, 8);
        const dl = document.createElement('datalist');
        dl.id = listId;
        inpModel.setAttribute('list', listId);
        fModel.appendChild(inpModel);
        fModel.appendChild(dl);
        gModel.appendChild(fModel);

        const fKey = el('div', 'gt-field');
        fKey.appendChild(el('label', null, 'API Key'));
        const inpKey = document.createElement('input');
        inpKey.type = 'password';
        inpKey.placeholder = '粘贴 API Key';
        inpKey.value = state.apiKey || '';
        fKey.appendChild(inpKey);
        const hintKey = el('div', 'gt-hint', '');
        fKey.appendChild(hintKey);
        gModel.appendChild(fKey);

        const labPersist = el('label', 'gt-check');
        const chkPersist = document.createElement('input');
        chkPersist.type = 'checkbox';
        chkPersist.checked = !!state.persistKey;
        labPersist.appendChild(chkPersist);
        labPersist.appendChild(document.createTextNode('保存到本地（明文存储，共用电脑勿勾）'));
        gModel.appendChild(labPersist);
        pAI.appendChild(gModel);

        /* ── 人设与提示词 ── */
        const gPersona = el('div', 'gt-group');
        gPersona.appendChild(el('div', 'gt-gt', '人设与提示词'));

        const fPersona = el('div', 'gt-field');
        fPersona.appendChild(el('label', null, '虚拟人设'));
        const selPersona = document.createElement('select');
        Object.keys(PERSONAS).forEach(function (k) {
            const o = document.createElement('option');
            o.value = k;
            o.textContent = PERSONAS[k].name + ' — ' + PERSONAS[k].desc;
            selPersona.appendChild(o);
        });
        selPersona.value = Persona.id;
        fPersona.appendChild(selPersona);
        const hintPersona = el('div', 'gt-hint',
            '给模型一个固定身份，答案风格才稳定，前后页也不容易自相矛盾。');
        fPersona.appendChild(hintPersona);
        gPersona.appendChild(fPersona);

        const fSys = el('div', 'gt-field');
        fSys.appendChild(el('label', null, '自定义系统提示词（可选）'));
        const inpSys = document.createElement('textarea');
        inpSys.rows = 3;
        inpSys.style.cssText = 'width:100%;box-sizing:border-box;padding:6px 8px;' +
            'border:1px solid #cbd2d9;border-radius:6px;font-size:12px;font-family:inherit;resize:vertical';
        inpSys.placeholder = '例如：请用简洁口语作答，避免书面语；对价格类问题偏向保守…';
        inpSys.value = Persona.customPrompt || '';
        fSys.appendChild(inpSys);
        const hintSys = el('div', 'gt-hint',
            '会追加在人设之后。人设也会同时写进用户提示词——弱模型常忽略系统指令，双保险。');
        fSys.appendChild(hintSys);
        gPersona.appendChild(fSys);
        pAI.appendChild(gPersona);

        /* ── 答案约束 ── */
        const gAns = el('div', 'gt-group');
        gAns.appendChild(el('div', 'gt-gt', '答案约束'));

        const mkNum = function (label, key, min, max, hint) {
            const f = el('div', 'gt-field');
            f.appendChild(el('label', null, label));
            const i = document.createElement('input');
            i.type = 'number';
            i.min = String(min); i.max = String(max);
            i.value = String(CFG[key]);
            f.appendChild(i);
            i.addEventListener('change', function () {
                let v = parseInt(i.value, 10);
                if (isNaN(v)) v = CFG[key];
                v = Math.max(min, Math.min(max, v));
                i.value = String(v);
                CFG[key] = v;
                Store.set(key, v);
            });
            if (hint) f.appendChild(el('div', 'gt-hint', hint));
            return f;
        };

        const rowMM = el('div', 'gt-row2');
        const fMin = mkNum('多选最少项', 'multiMin', 1, 10, null);
        const fMax = mkNum('多选最多项', 'multiMax', 1, 20, null);
        rowMM.appendChild(fMin);
        rowMM.appendChild(fMax);
        gAns.appendChild(rowMM);
        gAns.appendChild(el('div', 'gt-hint',
            '模型常把多选题全选，一眼假。超出上限会自动截断。'));
        gAns.appendChild(mkNum('填空最大字数', 'textMaxChars', 10, 500,
            '同时用于限制 AI 输出长度'));
        pAI.appendChild(gAns);

        const gAdv = el('div', 'gt-group');
        gAdv.appendChild(el('div', 'gt-gt', '高级'));

        const fTemp = el('div', 'gt-field');
        fTemp.appendChild(el('label', null, '随机性 temperature：' + state.temperature));
        const rngTemp = document.createElement('input');
        rngTemp.type = 'range';
        rngTemp.min = '0'; rngTemp.max = '1'; rngTemp.step = '0.1';
        rngTemp.value = String(state.temperature);
        rngTemp.style.width = '100%';
        fTemp.appendChild(rngTemp);
        gAdv.appendChild(fTemp);

        const fBatch = el('div', 'gt-field');
        fBatch.appendChild(el('label', null, '每批题目数：' + CFG.batchSize));
        const rngBatch = document.createElement('input');
        rngBatch.type = 'range';
        rngBatch.min = '4'; rngBatch.max = '25'; rngBatch.step = '1';
        rngBatch.value = String(CFG.batchSize);
        rngBatch.style.width = '100%';
        fBatch.appendChild(rngBatch);
        const hintBatch = el('div', 'gt-hint', '题目多时调小，可降低单次请求超时概率');
        fBatch.appendChild(hintBatch);
        gAdv.appendChild(fBatch);

        const fTimeout = el('div', 'gt-field');
        fTimeout.appendChild(el('label', null, '请求超时（秒）：' + Math.round(CFG.timeout / 1000)));
        const rngTimeout = document.createElement('input');
        rngTimeout.type = 'range';
        rngTimeout.min = '10'; rngTimeout.max = '120'; rngTimeout.step = '5';
        rngTimeout.value = String(Math.round(CFG.timeout / 1000));
        rngTimeout.style.width = '100%';
        fTimeout.appendChild(rngTimeout);
        gAdv.appendChild(fTimeout);
        pAI.appendChild(gAdv);

        const btnTest = el('button', 'gt-btn ghost sm', '🔌 测试连接');
        pAI.appendChild(btnTest);

        /* ─────────── Tab: 跨页 ─────────── */
        const pCross = tabPanes.cross;
        const hintCross = el('div', 'gt-hint',
            '多页问卷开启后：填完本页自动翻到下一页继续，直到最后一页。支持整页跳转与 SPA 换页。');
        pCross.appendChild(hintCross);

        const gCross = el('div', 'gt-group');
        gCross.style.marginTop = '8px';
        const labCross = el('label', 'gt-check');
        const chkCross = document.createElement('input');
        chkCross.type = 'checkbox';
        chkCross.checked = !!state.crossPage;
        labCross.appendChild(chkCross);
        labCross.appendChild(document.createTextNode('启用跨页自动续填'));
        gCross.appendChild(labCross);

        const labCrossAuto = el('label', 'gt-check');
        const chkCrossAuto = document.createElement('input');
        chkCrossAuto.type = 'checkbox';
        chkCrossAuto.checked = !!state.crossPageAuto;
        labCrossAuto.appendChild(chkCrossAuto);
        labCrossAuto.appendChild(document.createTextNode('后续页面不再逐页弹窗确认'));
        gCross.appendChild(labCrossAuto);

        const labCrossNext = el('label', 'gt-check');
        const chkCrossNext = document.createElement('input');
        chkCrossNext.type = 'checkbox';
        chkCrossNext.checked = !!state.crossPageNext;
        labCrossNext.appendChild(chkCrossNext);
        labCrossNext.appendChild(document.createTextNode('自动点击「下一页」按钮'));
        gCross.appendChild(labCrossNext);
        pCross.appendChild(gCross);

        const sessBox = el('div', '');
        pCross.appendChild(sessBox);

        const btnSession = el('button', 'gt-btn danger', '🛑 中止跨页任务');
        pCross.appendChild(btnSession);

        function syncCrossUI() {
            const on = chkCross.checked;
            [labCrossAuto, labCrossNext, btnSession].forEach(function (n) {
                n.style.display = on ? 'flex' : 'none';
            });
            if (btnSession) btnSession.style.display = on ? 'block' : 'none';
        }

        /* ─────────── Tab: 风险 ─────────── */
        const pRisk = tabPanes.risk;
        const riskBox = el('div', '');
        pRisk.appendChild(riskBox);
        const btnRescan = el('button', 'gt-btn ghost', '🔍 重新扫描');
        pRisk.appendChild(btnRescan);

        const gSens = el('div', 'gt-group');
        gSens.style.marginTop = '10px';
        const fSens = el('div', 'gt-field');
        fSens.appendChild(el('label', null, '扫描敏感度'));
        const selSens = document.createElement('select');
        [['loose', '宽松：只报高风险'],
         ['normal', '标准：报高 + 中风险'],
         ['strict', '严格：全部列出（含提示）']].forEach(function (p) {
            const o = document.createElement('option');
            o.value = p[0]; o.textContent = p[1];
            selSens.appendChild(o);
        });
        selSens.value = state.sensitivity;
        fSens.appendChild(selSens);
        const hintSens = el('div', 'gt-hint', '觉得警告太多可以调宽松。注意：放宽只影响显示，不会改变脚本是否自动填写的判定。');
        fSens.appendChild(hintSens);
        gSens.appendChild(fSens);

        const labMedia = el('label', 'gt-check');
        const chkMedia = document.createElement('input');
        chkMedia.type = 'checkbox';
        chkMedia.checked = !!state.mediaCheck;
        labMedia.appendChild(chkMedia);
        labMedia.appendChild(document.createTextNode('检测图片/视频等 AI 看不到内容的题目'));
        gSens.appendChild(labMedia);

        const fMedia = el('div', 'gt-field');
        fMedia.appendChild(el('label', null, '图形视为「图标」的尺寸上限（px）'));
        const inpMedia = document.createElement('input');
        inpMedia.type = 'number';
        inpMedia.min = '16'; inpMedia.max = '200'; inpMedia.step = '4';
        inpMedia.value = String(state.mediaMinPx);
        fMedia.appendChild(inpMedia);
        const hintMedia = el('div', 'gt-hint',
            '小于此尺寸的 img / svg / canvas 会被当作装饰性图标忽略。' +
            '若你的页面图标较大导致误报，把这个值调大；若题目配图被漏检，调小。');
        fMedia.appendChild(hintMedia);
        gSens.appendChild(fMedia);
        pRisk.appendChild(gSens);

        /* ─────────── Tab: 设置 ─────────── */
        const pSet = tabPanes.set;

        const gScope = el('div', 'gt-group');
        gScope.appendChild(el('div', 'gt-gt', '作用范围'));
        const fScope = el('div', 'gt-field');
        fScope.appendChild(el('label', null, '站点白名单（逗号分隔，留空=所有站点）'));
        const inpScope = document.createElement('input');
        inpScope.type = 'text';
        inpScope.placeholder = 'wjx.cn, wj.qq.com';
        inpScope.value = state.scopeWhitelist || '';
        fScope.appendChild(inpScope);
        const hintScope = el('div', 'gt-hint', '强烈建议填写。脚本会读取页面表单内容并发送给 AI 服务商。');
        fScope.appendChild(hintScope);
        gScope.appendChild(fScope);
        pSet.appendChild(gScope);

        const gExclude = el('div', 'gt-group');
        gExclude.appendChild(el('div', 'gt-gt', '题目提取'));
        const fExclude = el('div', 'gt-field');
        fExclude.appendChild(el('label', null, '额外排除的选择器'));
        const inpExclude = document.createElement('input');
        inpExclude.type = 'text';
        inpExclude.placeholder = '.my-toolbar, #debugBox';
        inpExclude.value = state.excludeSelectors || '';
        fExclude.appendChild(inpExclude);
        fExclude.appendChild(el('div', 'gt-hint',
            '页面上的调试面板、工具栏也会被当成题目。用 CSS 选择器排除它们，逗号分隔。' +
            '已内置常见调试面板、导航与页脚。'));
        gExclude.appendChild(fExclude);
        pSet.appendChild(gExclude);

        const gUI = el('div', 'gt-group');
        gUI.appendChild(el('div', 'gt-gt', '界面'));
        const labWide = el('label', 'gt-check');
        const chkWide = document.createElement('input');
        chkWide.type = 'checkbox';
        chkWide.checked = !!state.widePanel;
        labWide.appendChild(chkWide);
        labWide.appendChild(document.createTextNode('宽屏面板'));
        gUI.appendChild(labWide);

        const labDebug = el('label', 'gt-check');
        const chkDebug = document.createElement('input');
        chkDebug.type = 'checkbox';
        chkDebug.checked = !!state.debug;
        labDebug.appendChild(chkDebug);
        labDebug.appendChild(document.createTextNode('调试模式（控制台输出详细日志）'));
        gUI.appendChild(labDebug);

        const btnResetPos = el('button', 'gt-btn ghost sm', '↩ 重置悬浮球与面板位置');
        gUI.appendChild(btnResetPos);

        /* ── 配置导出 / 导入 ──
           换浏览器、换机器时，Key、人设、速度参数、白名单全得重填一遍，
           很烦。导出成一段文本，新环境粘贴即可。 */
        const btnExport = el('button', 'gt-btn ghost sm', '📤 导出配置（含 Key）');
        gUI.appendChild(btnExport);
        const btnImport = el('button', 'gt-btn ghost sm', '📥 导入配置');
        gUI.appendChild(btnImport);

        const hotkeyHint = el('div', 'gt-hint',
            '快捷键：Alt+Q 开关面板 · Alt+W 立即执行 · Alt+E 预览题目（输入框内不触发）');
        gUI.appendChild(hotkeyHint);
        pSet.appendChild(gUI);

        /* ── 执行日志 ── */
        const gLog = el('div', 'gt-group');
        const logHead = el('div', 'gt-gt');
        logHead.style.cssText += ';display:flex;align-items:center;justify-content:space-between';
        const logHeadTxt = el('span', null, '执行日志');
        const logCount = el('span', null, '0 条');
        logCount.style.cssText = 'font-weight:400;text-transform:none;letter-spacing:0';
        logHead.appendChild(logHeadTxt);
        logHead.appendChild(logCount);
        gLog.appendChild(logHead);

        const logHint = el('div', 'gt-hint',
            '记录题目提取、AI 请求、答案匹配与填写结果。日志只存内存，刷新即清空，不会写入本地存储。');
        gLog.appendChild(logHint);

        const logBox = el('div', 'gt-logbox');
        const logEmpty = el('div', 'gt-empty', '暂无日志。点「🚀 执行」后这里会显示完整过程。');
        logBox.appendChild(logEmpty);
        gLog.appendChild(logBox);

        const labAutoScroll = el('label', 'gt-check');
        const chkAutoScroll = document.createElement('input');
        chkAutoScroll.type = 'checkbox';
        chkAutoScroll.checked = true;
        labAutoScroll.appendChild(chkAutoScroll);
        labAutoScroll.appendChild(document.createTextNode('自动滚动到最新'));
        gLog.appendChild(labAutoScroll);

        const btnRow = el('div', 'gt-btnrow');
        const btnCopyLog = el('button', 'gt-btn ghost sm', '📋 复制日志');
        const btnClearLog = el('button', 'gt-btn ghost sm', '🗑 清空');
        btnRow.appendChild(btnCopyLog);
        btnRow.appendChild(btnClearLog);
        gLog.appendChild(btnRow);
        pSet.appendChild(gLog);

        const gDanger = el('div', 'gt-group');
        gDanger.appendChild(el('div', 'gt-gt', '数据'));
        const btnClearSession = el('button', 'gt-btn ghost sm', '🗑 清除跨页进度');
        gDanger.appendChild(btnClearSession);
        const btnResetAll = el('button', 'gt-btn danger sm', '⚠ 清除全部配置（含 Key）');
        gDanger.appendChild(btnResetAll);
        pSet.appendChild(gDanger);

        /* ═══════ Toast ═══════ */
        // 变量名不能叫 toast：会遮蔽外层同名函数，导致面板内的 toast() 调用全部报错
        const toastEl = el('div', 'gt-toast');
        wrap.appendChild(toastEl);

        /* ═══════ 引用收集 ═══════ */
        Object.assign(ui, {
            host, root, fab, badge, panel, riskBox,
            selProvider, inpBase, inpModel, dl, inpKey, hintKey, chkPersist,
            selPersona, inpSys, selSpeed,
            selMode, chkAuto, inpScope, btnRescan, btnRun, btnClose, toast: toastEl,
            chkCross, chkCrossAuto, chkCrossNext, sessBox, statusLine,
            logBox, logCount, logEmpty, chkAutoScroll,
            setPanel: null,
            tabBtns, switchTab, syncCrossUI, setStatus: function (t) {
                statusLine.textContent = t || '';
            }
        });

        /* ═══════ 事件 ═══════ */
        let visible = false;
        function setPanel(v) {
            visible = v;
            panel.style.display = v ? 'flex' : 'none';
            if (v) {
                // 展开时确保没跑出视口
                const r = panel.getBoundingClientRect();
                if (r.right > window.innerWidth || r.bottom > window.innerHeight || r.top < 0) {
                    applyStoredPos(panel, 'panelPos', { right: '18px', bottom: '132px', w: 320, h: 420 });
                }
            }
        }

        makeDraggable(fab, fab, 'fabPos', function () { setPanel(!visible); });
        makeDraggable(head, panel, 'panelPos', null);

        btnClose.addEventListener('click', function () { setPanel(false); });
        btnCollapse.addEventListener('click', function () { setPanel(false); });
        panel.addEventListener('click', function (e) { e.stopPropagation(); });

        /**
         * 点击面板外部才关闭。
         * 这里必须用 composedPath() 而不是 e.target：面板在 Shadow DOM 内，
         * 事件冒泡到 document 时 target 会被 retarget 成 host 元素，
         * 直接比较 target === fab 永远不成立。
         * 更关键的是时序——pointerup 里刚把面板打开，浏览器紧接着合成 click
         * 并冒泡到这里，若不做排除就会「刚打开立刻被关掉」。
         */
        document.addEventListener('click', function (e) {
            if (!visible) return;
            const path = e.composedPath ? e.composedPath() : [];
            for (let i = 0; i < path.length; i++) {
                if (path[i] === fab || path[i] === panel) return;
            }
            setPanel(false);
        });

        function syncProviderUI() {
            const p = currentProvider();
            fBase.style.display = p.needsBase ? 'block' : 'none';
            dl.innerHTML = '';
            (p.models || []).forEach(function (m) {
                const o = document.createElement('option');
                o.value = m;
                dl.appendChild(o);
            });
            if (!state.model) inpModel.value = p.defaultModel;
        }

        selProvider.addEventListener('change', function () {
            state.provider = selProvider.value;
            state.model = '';
            Store.set('provider', state.provider);
            Store.set('model', '');
            syncProviderUI();
        });

        inpModel.addEventListener('change', function () {
            state.model = inpModel.value.trim();
            Store.set('model', state.model);
        });

        inpBase.addEventListener('change', function () {
            state.customBase = inpBase.value.trim();
            Store.set('customBase', state.customBase);
        });

        inpKey.addEventListener('change', function () {
            state.apiKey = inpKey.value.trim();
            if (state.persistKey) Store.set('apiKey', state.apiKey);
            else Store.del('apiKey');
        });

        chkPersist.addEventListener('change', function () {
            state.persistKey = chkPersist.checked;
            Store.set('persistKey', state.persistKey);
            if (state.persistKey) Store.set('apiKey', state.apiKey);
            else Store.del('apiKey');
            hintKey.textContent = state.persistKey
                ? '⚠️ Key 已明文写入本地存储'
                : '仅保存在内存中，刷新页面后需重新填写';
        });

        rngTemp.addEventListener('input', function () {
            state.temperature = parseFloat(rngTemp.value);
            CFG.temperature = state.temperature;
            fTemp.querySelector('label').textContent = '随机性 temperature：' + state.temperature.toFixed(1);
        });
        rngTemp.addEventListener('change', function () {
            Store.set('temperature', state.temperature);
        });

        rngBatch.addEventListener('input', function () {
            CFG.batchSize = parseInt(rngBatch.value, 10);
            fBatch.querySelector('label').textContent = '每批题目数：' + CFG.batchSize;
        });
        rngBatch.addEventListener('change', function () {
            Store.set('batchSize', CFG.batchSize);
        });

        rngTimeout.addEventListener('input', function () {
            CFG.timeout = parseInt(rngTimeout.value, 10) * 1000;
            fTimeout.querySelector('label').textContent = '请求超时（秒）：' + Math.round(CFG.timeout / 1000);
        });
        rngTimeout.addEventListener('change', function () {
            Store.set('timeout', CFG.timeout);
        });

        selMode.addEventListener('change', function () {
            state.mode = selMode.value;
            Store.set('mode', state.mode);
        });

        chkAuto.addEventListener('change', function () {
            state.autoSubmit = chkAuto.checked;
            Store.set('autoSubmit', state.autoSubmit);
        });

        ui.syncAutoSubmitUI = function (policy) {
            if (!chkAuto || !labAuto) return;
            const blockedByRisk = !!(policy && policy.forbidAutoSubmit);
            const hardBlocked = !!(policy && policy.blocked);

            if (hardBlocked) {
                chkAuto.checked = false;
                chkAuto.disabled = true;
                labAuto.style.opacity = '.5';
                labAuto.title = '检测到高风险反作弊，本页禁止自动填写与提交';
                if (!labAuto.querySelector('.as-note')) {
                    const n = el('span', 'as-note', ' ⛔ 高风险已禁用');
                    n.style.cssText = 'color:#b91c1c;font-size:11px';
                    labAuto.appendChild(n);
                }
            } else if (blockedByRisk) {
                chkAuto.checked = false;
                chkAuto.disabled = true;
                labAuto.style.opacity = '.5';
                labAuto.title = '检测到反作弊措施，自动提交已强制关闭，需你手动点击提交';
                if (!labAuto.querySelector('.as-note')) {
                    const n = el('span', 'as-note', ' ⚠ 有反作弊，已强制关闭');
                    n.style.cssText = 'color:#b45309;font-size:11px';
                    labAuto.appendChild(n);
                }
            } else {
                chkAuto.disabled = false;
                chkAuto.checked = !!state.autoSubmit;
                labAuto.style.opacity = '';
                labAuto.title = '';
                const n = labAuto.querySelector('.as-note');
                if (n) n.remove();
            }
        };

        inpScope.addEventListener('change', function () {
            state.scopeWhitelist = inpScope.value.trim();
            Store.set('scopeWhitelist', state.scopeWhitelist);
        });

        chkCross.addEventListener('change', function () {
            state.crossPage = chkCross.checked;
            Store.set('crossPage', state.crossPage);
            syncCrossUI();
            if (!state.crossPage) Session.clear();
            renderSessionBar(sessBox);
        });

        chkCrossAuto.addEventListener('change', function () {
            state.crossPageAuto = chkCrossAuto.checked;
            Store.set('crossPageAuto', state.crossPageAuto);
        });

        chkCrossNext.addEventListener('change', function () {
            state.crossPageNext = chkCrossNext.checked;
            Store.set('crossPageNext', state.crossPageNext);
        });

        btnSession.addEventListener('click', function () { abortCrossPage(); });

        chkMedia.addEventListener('change', function () {
            state.mediaCheck = chkMedia.checked;
            Store.set('mediaCheck', state.mediaCheck);
            toast('low', '已' + (state.mediaCheck ? '开启' : '关闭'),
                state.mediaCheck ? '将检测媒体类题目并降级' : '不再检测媒体内容，也不会因此降级');
        });
        inpMedia.addEventListener('change', function () {
            const v = parseInt(inpMedia.value, 10);
            if (isNaN(v) || v < 16 || v > 200) { inpMedia.value = String(state.mediaMinPx); return; }
            state.mediaMinPx = v;
            Store.set('mediaMinPx', v);
            toast('low', '已保存', '图标判定阈值：' + v + ' px');
        });
        selSens.addEventListener('change', function () {
            state.sensitivity = selSens.value;
            Store.set('sensitivity', state.sensitivity);
            runScan(true);
        });

        chkWide.addEventListener('change', function () {
            state.widePanel = chkWide.checked;
            Store.set('widePanel', state.widePanel);
            panel.classList.toggle('wide', state.widePanel);
        });

        chkDebug.addEventListener('change', function () {
            state.debug = chkDebug.checked;
            Store.set('debug', state.debug);
            if (state.debug) exposeDebug();
            else { try { delete window.__gametame; } catch (e) { /* ignore */ } }
            toast('low', '调试模式', state.debug
                ? '已开启。内部状态挂载到 window.__gametame，可用 __gametame.speedTable() 查看速度曲线'
                : '已关闭');
        });

        inpExclude.addEventListener('change', function () {
            state.excludeSelectors = inpExclude.value.trim();
            Store.set('excludeSelectors', state.excludeSelectors);
            toast('low', '已保存', state.excludeSelectors
                ? '已排除：' + state.excludeSelectors.slice(0, 40)
                : '已清空额外排除项');
            if (runScan) runScan(true);
        });

        btnExport.addEventListener('click', function () {
            const cfg = exportConfig();
            const txt = JSON.stringify(cfg, null, 2);
            openModal('配置已导出（含 API Key，请妥善保管）', txt);
            Log.info('配置已导出', '共 ' + Object.keys(cfg).length + ' 项');
        });

        btnImport.addEventListener('click', function () {
            const input = prompt('请粘贴之前导出的配置 JSON：');
            if (!input) return;
            try {
                const cfg = JSON.parse(input.trim());
                const n = importConfig(cfg);
                toast('low', '导入成功', '已恢复 ' + n + ' 项配置，部分设置刷新后生效');
                Log.info('配置已导入', '恢复 ' + n + ' 项');
                setTimeout(function () { location.reload(); }, 900);
            } catch (e) {
                toast('medium', '导入失败', '不是有效的配置 JSON：' + String(e.message).slice(0, 60));
            }
        });

        btnResetPos.addEventListener('click', function () {
            Store.del('fabPos');
            Store.del('panelPos');
            fab.style.right = '18px';
            fab.style.bottom = '78px';
            fab.style.left = 'auto';
            fab.style.top = 'auto';
            panel.style.right = '18px';
            panel.style.bottom = '132px';
            panel.style.left = 'auto';
            panel.style.top = 'auto';
            Store.del('awinPos');
            if (ui.awin) {
                ui.awin.style.right = '18px';
                ui.awin.style.bottom = '200px';
                ui.awin.style.left = 'auto';
                ui.awin.style.top = 'auto';
            }
            toast('low', '已重置', '悬浮球与面板回到默认位置');
        });

        btnClearSession.addEventListener('click', function () {
            Session.clear();
            renderSessionBar(sessBox);
            toast('low', '已清除', '跨页进度已删除');
        });

        /* ── 日志渲染 ── */
        const KIND_META = {
            info:  { ico: '•', cls: '' },
            ok:    { ico: '✓', cls: 'ok' },
            warn:  { ico: '!', cls: 'warn' },
            error: { ico: '✕', cls: 'err' },
            ai:    { ico: '⇄', cls: 'ai' },
            fill:  { ico: '✎', cls: 'fill' },
            answer:{ ico: '★', cls: 'answer' }
        };

        let logRendered = 0;

        ui.renderLog = function () {
            if (!ui.logBox) return;
            const items = Log.items;
            ui.logCount.textContent = items.length + ' 条';

            if (!items.length) {
                ui.logBox.innerHTML = '';
                ui.logEmpty.textContent = '暂无日志。点「🚀 执行」后这里会显示完整过程。';
                ui.logBox.appendChild(ui.logEmpty);
                logRendered = 0;
                return;
            }

            // 增量渲染，避免每次全量重建导致闪烁
            for (let i = logRendered; i < items.length; i++) {
                const it = items[i];
                if (logRendered === 0 && ui.logBox.firstChild === ui.logEmpty) {
                    ui.logBox.removeChild(ui.logEmpty);
                }
                const m = KIND_META[it.kind] || KIND_META.info;
                const row = el('div', 'gt-log ' + m.cls);
                const ts = new Date(it.t).toLocaleTimeString();
                row.appendChild(el('span', 'ts', ts));
                row.appendChild(el('span', 'ic', m.ico));

                const body = el('div', 'bd');
                body.appendChild(el('span', 'ti', it.title));

                if (it.detail) {
                    const det = el('div', 'de', it.detail);
                    body.appendChild(det);
                }
                // 附加数据（选项列表、AI 返回的原文等）默认折叠
                if (it.data !== null && it.data !== undefined) {
                    const det = el('details', 'da');
                    det.appendChild(el('summary', null, '查看数据'));
                    let txt;
                    try {
                        txt = typeof it.data === 'string' ? it.data
                            : JSON.stringify(it.data, null, 2);
                    } catch (e) { txt = String(it.data); }
                    det.appendChild(el('pre', null, String(txt).slice(0, 2000)));
                    body.appendChild(det);
                }
                row.appendChild(body);
                ui.logBox.appendChild(row);
            }
            logRendered = items.length;

            if (ui.chkAutoScroll && ui.chkAutoScroll.checked) {
                ui.logBox.scrollTop = ui.logBox.scrollHeight;
            }
        };

        btnCopyLog.addEventListener('click', function () {
            const txt = Log.toText();
            if (!txt) { toast('low', '日志为空', '还没有可复制的记录'); return; }
            copyText(txt).then(function (ok) {
                toast(ok ? 'low' : 'medium', ok ? '已复制' : '复制失败',
                    ok ? Log.items.length + ' 条日志已复制到剪贴板'
                       : '浏览器拒绝了剪贴板访问，请手动选中复制');
            });
        });

        btnClearLog.addEventListener('click', function () {
            Log.clear();
            logRendered = 0;
            toast('low', '已清空', '执行日志已清除');
        });

        btnResetAll.addEventListener('click', function () {
            if (!confirm('将清除所有本地配置（包括 API Key），确定继续？')) return;
            ['provider', 'model', 'apiKey', 'persistKey', 'customBase', 'mode',
             'autoSubmit', 'scopeWhitelist', 'crossPage', 'crossPageAuto',
             'crossPageNext', 'sensitivity', 'temperature', 'batchSize',
             'timeout', 'widePanel', 'debug', 'tab', 'typeSpeed',
             'persona', 'customSystemPrompt', 'excludeSelectors',
             'multiMin', 'multiMax', 'textMaxChars',
             'typeBaseMs', 'typePerCharMs', 'typeJitter', 'typeThinkMs',
             'typeThinkPerChar', 'typePauseChance', 'typeCharMinMs', 'typeCharMaxMs',
             'fabPos', 'panelPos', 'awinPos'].forEach(function (k) { Store.del(k); });
            Session.clear();
            toast('low', '已清除', '全部配置已删除，刷新页面后生效');
        });

        btnGotoLog.addEventListener('click', function () {
            switchTab('set');
            // 滚到日志分组
            setTimeout(function () {
                try { gLog.scrollIntoView({ block: 'start' }); } catch (e) { /* ignore */ }
            }, 30);
        });

        selPersona.addEventListener('change', function () {
            Persona.id = selPersona.value;
            Store.set('persona', Persona.id);
            const p = PERSONAS[Persona.id];
            toast('low', '人设已切换', p ? p.name : '默认');
        });

        inpSys.addEventListener('change', function () {
            Persona.customPrompt = inpSys.value;
            Store.set('customSystemPrompt', Persona.customPrompt);
            toast('low', '已保存', Persona.customPrompt ? '自定义提示词已生效' : '已清空自定义提示词');
        });

        selSpeed.addEventListener('change', function () {
            Human.speed = selSpeed.value;
            CFG.typeSpeed = selSpeed.value;
            Store.set('typeSpeed', Human.speed);
            toast('low', '已切换', '填入速度：' + TYPE_SPEEDS[Human.speed].label);
        });

        btnTest.addEventListener('click', function () { testConnection(); });

        btnRescan.addEventListener('click', function () { runScan(true); });
        btnRun.addEventListener('click', function () { runOnce(); });

        btnPreview.addEventListener('click', function () {
            const qs = extractQuestions();
            if (!qs.length) {
                toast('medium', '未提取到题目', '当前页面没有识别到可填写的控件');
                return;
            }
            openModal('提取到的题目（' + qs.length + ' 道）',
                qs.map(function (q, i) {
                    return (i + 1) + '. [' + q.type + '] ' + q.title +
                        (q.options && q.options.length ? '\n   选项：' + q.options.join(' / ') : '');
                }).join('\n'));
            Log.info('预览题目', '共 ' + qs.length + ' 道，未发起 AI 请求');
        });

        btnClear.addEventListener('click', function () {
            if (!confirm('确定清空本页所有已填写的内容？此操作不可撤销。')) return;
            const qs = extractQuestions();
            let n = 0;
            qs.forEach(function (q) {
                q.inputs.forEach(function (inp) {
                    if (isHiddenField(inp)) return;
                    try {
                        if (inp.type === 'radio' || inp.type === 'checkbox') {
                            if (inp.checked) { inp.checked = false; n++; }
                        } else if (inp.tagName === 'SELECT') {
                            if (inp.selectedIndex > 0) { inp.selectedIndex = 0; n++; }
                        } else if (isEditable(inp)) {
                            if (inp.innerText) { inp.innerText = ''; n++; }
                        } else if (inp.value !== '') {
                            inp.value = ''; n++;
                        }
                        inp.dispatchEvent(new Event('input', { bubbles: true }));
                        inp.dispatchEvent(new Event('change', { bubbles: true }));
                    } catch (e) { /* ignore */ }
                });
            });
            toast('low', '已清空', '共重置 ' + n + ' 个控件');
            Log.info('清空本页填写', '重置 ' + n + ' 个控件');
        });


        syncProviderUI();
        syncCrossUI();
        hintKey.textContent = state.persistKey
            ? '⚠️ Key 已明文写入本地存储'
            : '仅保存在内存中，刷新页面后需重新填写';

        switchTab(activeTab);
        renderSessionBar(sessBox);

        if (document.body) document.body.appendChild(host);
        else document.documentElement.appendChild(host);

        buildAnswerWindow(wrap);

        ui.setPanel = setPanel;

        /* 快捷键挂到这里，直接复用已绑定好的处理函数，不用重复实现 */
        installHotkeys({
            togglePanel: function () { setPanel(!visible); },
            run: function () { runOnce(); },
            preview: function () {
                const qs = extractQuestions();
                if (!qs.length) { toast('medium', '未提取到题目', '当前页面没有可填写的控件'); return; }
                openModal('提取到的题目（' + qs.length + ' 道）',
                    qs.map(function (q, i) {
                        return (i + 1) + '. [' + q.type + '] ' + q.title +
                            (q.options && q.options.length ? '\n   选项：' + q.options.join(' / ') : '');
                    }).join('\n'));
                Log.info('预览题目（快捷键）', '共 ' + qs.length + ' 道，未发起 AI 请求');
            }
        });
      });
    }

    /**
     * 调试接口。仅在设置里开启「调试模式」后挂载，默认完全不暴露内部状态。
     * 排查"为什么这题没填上""打字速度到底多少"这类问题时，比翻控制台日志快。
     */
    function exposeDebug() {
        try {
            window.__gametame = {
                version: SCRIPT_NAME,
                CFG: CFG,
                state: state,
                Human: Human,
                Persona: Persona,
                PERSONAS: PERSONAS,
                Log: Log,
                Session: Session,
                extractQuestions: extractQuestions,
                groupContainer: groupContainer,
                fieldKind: fieldKind,
                isEditable: isEditable,
                openModal: openModal,
                Core: Core,
                RectCache: RectCache,
                contentFingerprint: contentFingerprint,
                pageId: pageId,
                titleByExclusion: titleByExclusion,
                findTitle: findTitle,
                anchorRect: anchorRect,
                runScan: runScan,
                fillAnswers: fillAnswers,
                sanitizeAnswers: sanitizeAnswers,
                buildPrompt: buildPrompt,
                /** 采样当前速度档位下不同文本长度的单字耗时，便于调参 */
                speedTable: function (lens) {
                    const out = {};
                    (lens || [2, 5, 10, 20, 40, 80]).forEach(function (n) {
                        let sum = 0;
                        for (let i = 0; i < 50; i++) sum += Human.perChar(n);
                        out[n] = Math.round(sum / 50 * 10) / 10;
                    });
                    return out;
                }
            };
            console.log('[Gametame] 调试接口已挂载到 window.__gametame');
        } catch (e) { /* ignore */ }
    }

    /**
     * AI 答案独立悬浮窗。
     * 之前塞在设置面板的「填写」页里，问题是：答案要盯着抄，面板却挡在右下角，
     * 看答案和看题目得来回切。独立窗口可以拖到题目旁边，对照着填。
     */
    function buildAnswerWindow(host) {
        const win = el('div', 'gt-awin');
        win.setAttribute('data-gt-awin', '1');

        // 标题栏（拖拽把手）
        const hd = el('div', 'aw-hd');
        const ttl = el('div', 't', 'AI 建议答案');
        hd.appendChild(ttl);

        const btnMin = el('button', 'm', '—');
        btnMin.title = '收起';
        hd.appendChild(btnMin);
        const btnClose = el('button', 'm', '✕');
        btnClose.title = '关闭';
        hd.appendChild(btnClose);
        win.appendChild(hd);

        // 内容区
        const bd = el('div', 'aw-bd');
        win.appendChild(bd);

        // 底部操作
        const ft = el('div', 'aw-ft');
        const btnCopyAll = el('button', 'gt-btn ghost sm', '📋 复制全部');
        const btnFill = el('button', 'gt-btn ok sm', '✍ 填入页面');
        ft.appendChild(btnCopyAll);
        ft.appendChild(btnFill);
        win.appendChild(ft);

        const tip = el('div', 'aw-tip', '拖动标题栏可移动窗口');
        win.appendChild(tip);

        host.appendChild(win);

        // 拖拽（标题栏为把手，触摸同样可用）
        makeDraggable(hd, win, 'awinPos', null);
        applyStoredPos(win, 'awinPos', { right: '18px', bottom: '200px', w: 340, h: 300 });

        btnClose.addEventListener('click', function () {
            win.style.display = 'none';
        });
        // 收起：只留标题栏
        btnMin.addEventListener('click', function () {
            const collapsed = bd.style.display === 'none';
            bd.style.display = collapsed ? 'block' : 'none';
            ft.style.display = collapsed ? 'flex' : 'none';
            tip.style.display = collapsed ? 'block' : 'none';
            btnMin.textContent = collapsed ? '—' : '□';
        });
        win.addEventListener('click', function (e) { e.stopPropagation(); });

        Object.assign(ui, { awin: win, awinBody: bd, awinTitle: ttl, awinFill: btnFill });

        ui.awinFillHandler = null;
        btnFill.addEventListener('click', function () {
            if (ui.awinFillHandler) ui.awinFillHandler();
        });
        return win;
    }

    /** 把答案渲染到独立悬浮窗 */
    function renderAnswers(questions, answers, policy) {
        if (!ui.awin || !ui.awinBody) return;

        const bd = ui.awinBody;
        bd.innerHTML = '';
        const lines = [];

        // 提示条
        if (policy && policy.blocked) {
            bd.appendChild(el('div', 'aw-warn',
                '⛔ 检测到高风险反作弊，未自动填写。以下答案仅供你手动作答时参考。'));
        } else if (policy && policy.mode === 'manual') {
            bd.appendChild(el('div', 'aw-warn',
                '当前为「仅生成建议」模式，页面未被修改。对照下方答案手动作答即可。'));
        }

        questions.forEach(function (q, i) {
            const a = answers[i];
            const av = (a === undefined || a === null) ? '（无）'
                : (Array.isArray(a) ? a.join(' + ') : String(a));

            lines.push('[' + (i + 1) + '] ' + q.title + '\n    → ' + av);

            const row = el('div', 'aw-item');
            row.appendChild(el('span', 'ix', String(i + 1)));

            const body = el('div', 'bd');
            body.appendChild(el('div', 'qt', String(q.title)));
            body.appendChild(el('div', 'av', av));
            row.appendChild(body);

            const cp = el('button', 'cp', '复制');
            cp.addEventListener('click', function (e) {
                e.stopPropagation();
                copyText(av).then(function (ok) {
                    toast(ok ? 'low' : 'medium', ok ? '已复制' : '复制失败',
                        ok ? '第 ' + (i + 1) + ' 题答案已复制' : '请手动选中复制');
                });
            });
            row.appendChild(cp);
            bd.appendChild(row);
        });

        if (ui.awinTitle) {
            ui.awinTitle.textContent = 'AI 建议答案（' + questions.length + ' 题）';
        }

        if (ui.awinFill) {
            if (policy && (policy.blocked || policy.mode === 'manual')) {
                ui.awinFill.style.display = 'none';
            } else {
                ui.awinFill.style.display = 'block';
            }
        }

        // 复制全部
        const oldBtn = bd.querySelector('[data-copyall]');
        if (oldBtn) oldBtn.remove();

        ui.awin.style.display = 'flex';

        Log.info('答案已显示在独立窗口', questions.length + ' 题');
        questions.forEach(function (q, i) {
            const a = answers[i];
            const av = (a === undefined || a === null) ? '（无）'
                : (Array.isArray(a) ? a.join(' + ') : String(a));
            Log.add('answer',
                '第 ' + (i + 1) + ' 题 · ' + String(q.title).slice(0, 40),
                av, { title: q.title, answer: a, options: q.options || [] });
        });
    }

    /** 绑定「复制全部」，避免重复绑定旧闭包 */
    function bindCopyAll(questions, answers) {
        if (!ui.awin) return;
        const btn = ui.awin.querySelector('.aw-ft .gt-btn');
        if (!btn) return;
        const fresh = btn.cloneNode(true);
        fresh.addEventListener('click', function () {
            const lines = questions.map(function (q, i) {
                const a = answers[i];
                const av = (a === undefined || a === null) ? '（无）'
                    : (Array.isArray(a) ? a.join(' + ') : String(a));
                return '[' + (i + 1) + '] ' + q.title + '\n    → ' + av;
            });
            copyText(lines.join('\n')).then(function (ok) {
                toast(ok ? 'low' : 'medium', ok ? '已复制' : '复制失败',
                    ok ? questions.length + ' 题答案已复制' : '请手动选中复制');
            });
        });
        btn.parentNode.replaceChild(fresh, btn);
    }

    /* Toast / 通知 */

    let toastTimer = null;

    function toast(level, title, msg, ms) {
        if (!ui.toast) return;
        const t = ui.toast;
        t.className = 'gt-toast show ' + (level === 'high' ? 'high' : (level === 'medium' ? 'medium' : ''));
        t.innerHTML = '';
        t.appendChild(el('div', 'tt', title));
        if (msg) t.appendChild(el('div', null, msg));
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            t.className = 'gt-toast';
        }, ms || (level === 'low' ? 4000 : 8000));
    }

    /**
     * @param level   通知级别 low/medium/high，决定 toast 配色与是否弹桌面通知
     * @param logKind 可选，单独指定日志级别。
     *   默认按 level 映射，但"检测到高风险"这类提示虽然用 high 配色引起注意，
     *   本身并不是脚本出错，不该在日志里标成 ERROR 误导排查。
     */
    function notify(level, title, msg, logKind) {
        Log.add(logKind || (level === 'high' ? 'error' : (level === 'medium' ? 'warn' : 'info')),
                title, msg);
        toast(level, title, msg);
        if (level !== 'low') {
            try {
                if (typeof GM_notification === 'function') {
                    GM_notification({
                        title: SCRIPT_NAME + '：' + title,
                        text: String(msg || '').slice(0, 500),
                        timeout: 10000
                    });
                }
            } catch (e) { /* ignore */ }
        }
    }

    /** 复制文本：优先异步剪贴板，失败回退到 execCommand */
    function copyText(text) {
        return new Promise(function (resolve) {
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text).then(
                        function () { resolve(true); },
                        function () { resolve(fallbackCopy(text)); }
                    );
                    return;
                }
            } catch (e) { /* ignore */ }
            resolve(fallbackCopy(text));
        });
    }

    function fallbackCopy(text) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;left:-9999px;top:0';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch (e) { return false; }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       执行日志
       ───────────────────────────────────────────────────────────────────────
       AI 答题是个黑盒：题目提取了几道、发给模型的 prompt 长什么样、
       模型回了什么、哪道题没匹配上——这些不出日志就没法排查。
       日志只存内存，不落盘（避免把题目文本和 Key 留在本地存储里）。
       ═══════════════════════════════════════════════════════════════════════ */

    const LOG_MAX = 500;

    const Log = {
        items: [],
        seq: 0,

        add(kind, title, detail, data) {
            try {
                this.items.push({
                    n: ++this.seq,
                    t: Date.now(),
                    kind: kind || 'info',   // info | ok | warn | error | ai | fill
                    title: String(title || ''),
                    detail: detail === undefined || detail === null ? '' : String(detail),
                    data: data === undefined ? null : data
                });
                if (this.items.length > LOG_MAX) this.items.shift();

                // 同步到控制台，方便用 DevTools 排查
                const tag = '[Gametame]';
                const line = tag + ' [' + (kind || 'info').toUpperCase() + '] ' +
                             this.items[this.items.length - 1].title +
                             (this.items[this.items.length - 1].detail
                                 ? ' — ' + this.items[this.items.length - 1].detail : '');
                if (kind === 'error') console.error(line, data || '');
                else if (kind === 'warn') console.warn(line, data || '');
                else console.log(line, data || '');

                if (ui.renderLog) ui.renderLog();
            } catch (e) { /* 日志本身绝不能影响主流程 */ }
        },

        info(t, d, data) { this.add('info', t, d, data); },
        ok(t, d, data) { this.add('ok', t, d, data); },
        warn(t, d, data) { this.add('warn', t, d, data); },
        error(t, d, data) { this.add('error', t, d, data); },

        clear() { this.items = []; this.seq = 0; if (ui.renderLog) ui.renderLog(); },

        /** 导出为纯文本，便于复制排查 */
        toText() {
            return this.items.map(function (i) {
                const ts = new Date(i.t).toLocaleTimeString();
                let s = '[' + ts + '] [' + i.kind.toUpperCase() + '] ' + i.title;
                if (i.detail) s += '\n    ' + i.detail.split('\n').join('\n    ');
                if (i.data !== null && i.data !== undefined) {
                    try {
                        s += '\n    ' + JSON.stringify(i.data, null, 2)
                                .split('\n').join('\n    ');
                    } catch (e) { /* ignore */ }
                }
                return s;
            }).join('\n');
        }
    };

    /* 风险面板渲染 */

    /**
     * 渲染扫描结果。
     * 设计原则：默认只给结论，细节按需展开——十几条告警平铺出来没人会看。
     *   · 顶部一张摘要卡：等级 + 一句话结论
     *   · 下面按等级分三组折叠，高风险默认展开，其余收起
     *   · 每条只显示标题，点开才显示说明与证据
     */
    function renderRisk(risk) {
        if (!ui.riskBox) return;
        const box = ui.riskBox;
        box.innerHTML = '';

        // 敏感度只影响显示，不影响 forbidFill / forbidAutoSubmit 的判定
        const shown = filterBySensitivity(risk.findings, state.sensitivity);
        const shownHigh = shown.filter(function (f) { return f.level === 'high'; }).length;

        const META = {
            low:    { ico: '✅', lv: '未发现明显反作弊', cls: 'low',
                      ds: '仍建议人工核对答案，问卷平台可能还有服务端校验。' },
            medium: { ico: '⚠️', lv: '中风险', cls: 'medium',
                      ds: '存在反作弊措施。可填写，但已禁用自动提交，需人工复核后手动提交。' },
            high:   { ico: '⛔', lv: '高风险', cls: 'high',
                      ds: '已强制切换为「仅生成建议」，不会自动填写或提交。' }
        };
        const m = META[risk.level] || META.low;

        const sum = el('div', 'gt-sum ' + m.cls);
        sum.appendChild(el('div', 'ico', m.ico));
        const txt = el('div', 'txt');
        txt.appendChild(el('div', 'lv', m.lv));
        txt.appendChild(el('div', 'ds', m.ds));
        sum.appendChild(txt);
        box.appendChild(sum);

        if (!shown.length) {
            box.appendChild(el('div', 'gt-empty',
                state.sensitivity === 'loose' && risk.findings.length
                    ? '当前敏感度为「宽松」，已隐藏 ' + risk.findings.length + ' 项中低风险提示'
                    : '本次扫描未发现反作弊特征'));
        } else {
            box.appendChild(buildGroup('high', '高风险', shown, risk.level === 'high'));
            box.appendChild(buildGroup('medium', '中风险', shown, risk.level === 'medium'));
            box.appendChild(buildGroup('low', '提示', shown, false));
        }

        // 跨页时把风险也放进「跨页」Tab，避免来回切
        renderSessionBar(ui.sessBox);
        renderSessionBar(box);

        // 自动提交开关随风险联动置灰
        if (ui.syncAutoSubmitUI) {
            ui.syncAutoSubmitUI({
                forbidAutoSubmit: !!risk.forbidAutoSubmit,
                blocked: !!risk.forbidFill
            });
        }

        if (ui.btnRescan) {
            ui.btnRescan.textContent = '🔍 重新扫描（' + new Date(risk.scannedAt).toLocaleTimeString() + '）';
        }

        // 徽章只数高风险，中风险不打扰
        if (ui.badge) {
            if (shownHigh) {
                ui.badge.style.display = 'block';
                ui.badge.textContent = String(shownHigh);
            } else {
                ui.badge.style.display = 'none';
            }
        }
        if (ui.fab) {
            ui.fab.className = 'gt-fab' + (risk.level === 'low' ? '' : ' risk-' + risk.level);
        }
        // 风险 Tab 上标个红点
        if (ui.tabBtns && ui.tabBtns.risk) {
            const existed = ui.tabBtns.risk.querySelector('.dot');
            if (shownHigh && !existed) {
                const d = el('span', 'dot');
                ui.tabBtns.risk.appendChild(d);
            } else if (!shownHigh && existed) {
                existed.remove();
            }
        }
    }

    /** 按敏感度过滤要显示的条目 */
    function filterBySensitivity(findings, sens) {
        if (sens === 'strict') return findings;
        if (sens === 'loose') return findings.filter(function (f) { return f.level === 'high'; });
        return findings.filter(function (f) { return f.level === 'high' || f.level === 'medium'; });
    }

    /** 一个等级分组（默认折叠，高风险组默认展开） */
    function buildGroup(level, name, findings, open) {
        const list = findings.filter(function (f) { return f.level === level; });
        if (!list.length) return document.createDocumentFragment();

        const body = document.createElement('div');
        list.forEach(function (f) { body.appendChild(makeFinding(f)); });

        const titleNode = document.createDocumentFragment();
        titleNode.appendChild(document.createTextNode(name + ' '));
        const chip = el('span', 'gt-chip ' + level, String(list.length));
        titleNode.appendChild(chip);

        return makeAccordion(titleNode, body, !!open, 'gt-risk-acc');
    }

    /** 跨页进度条（跨页 Tab 与风险 Tab 共用） */
    function renderSessionBar(box) {
        if (!box) return;
        const d = Session.data;
        // 清掉旧的，避免重复追加
        const old = box.querySelector('[data-sess]');
        if (old) old.remove();
        if (!d || !state.crossPage || !d.order.length) return;

        const wrapEl = el('div', '');
        wrapEl.setAttribute('data-sess', '1');
        wrapEl.style.cssText = 'margin-top:8px;padding-top:8px;border-top:1px dashed #e4e7eb';
        wrapEl.appendChild(el('div', 'gt-hint', '跨页进度：' + Session.summary()));
        if (d.pending) wrapEl.appendChild(el('div', 'gt-hint', '等待下一页…'));
        box.appendChild(wrapEl);
    }

    /* ═══════════════════════════════════════════════════════════════════════
       10. 主流程
       ═══════════════════════════════════════════════════════════════════════ */

    function inScope() {
        const wl = (state.scopeWhitelist || '').trim();
        if (!wl) return true;
        const host = location.hostname.toLowerCase();
        return wl.split(/[,，\s]+/).filter(Boolean).some(function (d) {
            d = d.toLowerCase().replace(/^\*\./, '');
            return host === d || host.endsWith('.' + d) || host.endsWith(d);
        });
    }

    let lastRiskLevel = null;

    function runScan(manual) {
        const questions = extractQuestions();
        const risk = RiskScanner.scan(questions);
        renderRisk(risk);

        const levelChanged = lastRiskLevel !== risk.level;
        lastRiskLevel = risk.level;

        if (manual || levelChanged) {
            if (risk.level === 'high') {
                notify('high', '检测到高风险反作弊',
                    '共 ' + risk.findings.length + ' 项：' +
                    risk.findings.slice(0, 3).map(function (f) { return f.title; }).join('；') +
                    '\n已强制切换为「仅生成建议」，不会自动填写或提交。');
            } else if (risk.level === 'medium') {
                notify('medium', '检测到中风险反作弊',
                    '共 ' + risk.findings.length + ' 项：' +
                    risk.findings.slice(0, 3).map(function (f) { return f.title; }).join('；') +
                    '\n已禁用自动提交，需人工复核后手动提交。');
            } else if (manual) {
                notify('low', '扫描完成', '未发现明显反作弊措施。');
            }
        }
        return risk;
    }

    /**
     * 通用信息弹窗。
     * 走 Shadow DOM + textContent，和审查弹窗同一套机制：
     * 内容一律不当 HTML 解析，页面上的恶意文本也注入不进来。
     */
    function openModal(title, bodyText) {
      return withoutProbe(function () {
        const host = document.createElement('div');
        host.setAttribute('data-gt', 'v3-modal');
        host.style.cssText = 'all:initial;position:fixed;z-index:2147483003;';
        const root = host.attachShadow({ mode: 'open' });
        const st = document.createElement('style');
        st.textContent = CSS;
        root.appendChild(st);

        const wrap = el('div', 'gt-wrap');
        root.appendChild(wrap);
        const overlay = el('div', 'gt-modal');
        wrap.appendChild(overlay);
        const box = el('div', 'box');
        overlay.appendChild(box);

        box.appendChild(el('h3', null, String(title)));

        const pre = document.createElement('pre');
        pre.textContent = String(bodyText || '');
        box.appendChild(pre);

        const btnRow = el('div', 'gt-btnrow');
        const btnCopy = el('button', 'gt-btn ghost', '复制');
        const btnClose = el('button', 'gt-btn', '关闭');
        btnRow.appendChild(btnCopy);
        btnRow.appendChild(btnClose);
        box.appendChild(btnRow);

        function close() {
            try { host.remove(); } catch (e) { /* ignore */ }
        }
        btnClose.addEventListener('click', close);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) close();
        });
        btnCopy.addEventListener('click', function () {
            copyText(String(bodyText || '')).then(function (ok) {
                toast(ok ? 'low' : 'medium', ok ? '已复制' : '复制失败',
                    ok ? '内容已复制到剪贴板' : '请手动选中复制');
            });
        });

        document.body.appendChild(host);
        return host;
      });
    }

    function showReview(questions, answers, policy, onConfirm) {
      return withoutProbe(function () {
        const host = document.createElement('div');
        host.setAttribute('data-gt', 'v3-review');
        host.style.cssText = 'all:initial;position:fixed;z-index:2147483003;';
        const root = host.attachShadow({ mode: 'open' });
        const st = document.createElement('style');
        st.textContent = CSS;
        root.appendChild(st);

        const wrap = el('div', 'gt-wrap');
        root.appendChild(wrap);
        const overlay = el('div', 'gt-modal');
        wrap.appendChild(overlay);
        const box = el('div', 'box');
        overlay.appendChild(box);

        box.appendChild(el('h3', null, '审查 AI 答案（' + answers.length + ' 题）'));

        if (policy.reasons.length) {
            const warn = el('div', 'gt-risk ' + (policy.blocked ? 'high' : 'medium'));
            warn.appendChild(el('div', 't', '已自动降低自动化程度'));
            const ul = document.createElement('ul');
            policy.reasons.forEach(function (r) {
                ul.appendChild(el('li', null, r));
            });
            warn.appendChild(ul);
            box.appendChild(warn);
        }

        // 用 textContent 渲染，杜绝存储型 XSS
        const pre = document.createElement('pre');
        const lines = questions.map(function (q, i) {
            const a = answers[i];
            const av = a === undefined ? '（无）'
                : (Array.isArray(a) ? a.join(' + ') : String(a));
            return '[' + (i + 1) + '] ' + q.title + '\n    → ' + av;
        });
        pre.textContent = lines.join('\n');
        box.appendChild(pre);

        const actions = el('div', 'actions');
        const okBtn = el('button', 'gt-btn ok', policy.blocked ? '我知道了' : '确认填写');
        const cancelBtn = el('button', 'gt-btn ghost', '取消');
        actions.appendChild(okBtn);
        actions.appendChild(cancelBtn);
        box.appendChild(actions);

        document.documentElement.appendChild(host);

        function close() {
            if (host.parentElement) host.parentElement.removeChild(host);
        }
        okBtn.addEventListener('click', function () { close(); onConfirm(true); });
        cancelBtn.addEventListener('click', function () { close(); onConfirm(false); });
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) { close(); onConfirm(false); }
        });
      });
    }

    function showResult(report) {
      return withoutProbe(function () {
        const host = document.createElement('div');
        host.setAttribute('data-gt', 'v3-result');
        host.style.cssText = 'all:initial;position:fixed;z-index:2147483003;';
        const root = host.attachShadow({ mode: 'open' });
        const st = document.createElement('style');
        st.textContent = CSS;
        root.appendChild(st);
        const wrap = el('div', 'gt-wrap');
        root.appendChild(wrap);
        const overlay = el('div', 'gt-modal');
        wrap.appendChild(overlay);
        const box = el('div', 'box');
        overlay.appendChild(box);

        box.appendChild(el('h3', null, '填写结果'));
        box.appendChild(el('div', null, '成功填写 ' + report.filled + ' 题。'));

        if (report.failed.length) {
            box.appendChild(el('div', 'gt-risk medium', '有 ' + report.failed.length + ' 题未能自动填写，需要你手动处理：'));
            const ul = el('ul', 'gt-list');
            report.failed.slice(0, 30).forEach(function (f) {
                ul.appendChild(el('li', null,
                    '第 ' + (f.index + 1) + '题：' + String(f.title).slice(0, 40) +
                    '（' + f.reason + '）'));
            });
            box.appendChild(ul);
        }

        const actions = el('div', 'actions');
        const closeBtn = el('button', 'gt-btn', '关闭');
        actions.appendChild(closeBtn);
        box.appendChild(actions);
        document.documentElement.appendChild(host);
        function close() { if (host.parentElement) host.parentElement.removeChild(host); }
        closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
      });
    }

    let running = false;

    /**
     * 处理「单页」：提取 → 扫描 → 问 AI → 按策略填写 → 返回报告
     * @param {Object} opts { autoConfirm: 跳过确认弹窗, questions: 复用已提取的题目 }
     */
    async function runPage(opts) {
        opts = opts || {};

        const questions = opts.questions && opts.questions.length
            ? opts.questions
            : extractQuestions();

        if (!questions.length) {
            notify('medium', '未提取到题目',
                '页面可能尚未加载完成，或题目在 iframe / 动态渲染容器内，脚本暂无法处理。');
            return null;
        }

        // 跨页场景把前面几页的题干一起送去比对，才能发现跨页的一致性校验题
        const histTitles = (state.crossPage && Session.data) ? (Session.data.titles || []) : [];
        const risk = RiskScanner.scan(questions, histTitles);
        renderRisk(risk);
        lastRiskLevel = risk.level;

        const policy = resolvePolicy(risk);
        if (policy.downgraded && !opts.silentDowngrade) {
            notify(risk.level, '已根据反作弊检测结果自动降级', policy.reasons.join('；'));
        }

        const answers = await answerAll(questions, opts.onProgress || function () {});

        // 高风险 / 仅建议模式：不碰页面，答案直接渲染到面板（不再弹窗）
        if (policy.mode === 'manual') {
            Log.info('仅建议模式', '共 ' + questions.length + ' 题，未修改页面');
            renderAnswers(questions, answers, policy);
            bindCopyAll(questions, answers);
            notify(risk.level === 'high' ? 'high' : 'low',
                'AI 答案已生成（仅建议）',
                '共 ' + questions.length + ' 题，已在独立答案窗口列出，可逐条或全部复制。',
                'info');
            return { filled: 0, failed: [], blocked: true, questions: questions, answers: answers, policy: policy };
        }

        // 填写进度回调：面板上实时显示"第 N/M 题"
        const fillOpts = {
            token: Human.begin(),
            onProgress: function (done, total, title) {
                if (ui.setStatus) {
                    ui.setStatus(done >= total ? '' : '正在填写 ' + done + '/' + total +
                        (title ? '：' + String(title).slice(0, 22) : ''));
                }
            }
        };

        // 半自动：需要人工确认（跨页续填时可跳过）
        if (policy.mode === 'semi' && !opts.autoConfirm) {
            const go = await new Promise(function (resolve) {
                showReview(questions, answers, policy, function (confirmed) {
                    resolve(!!confirmed);
                });
            });
            if (!go) {
                notify('low', '已取消', '未修改页面。');
                return null;
            }
        }

        const report = await fillAnswers(questions, answers, fillOpts);
        Object.assign(report, { questions: questions, answers: answers, policy: policy });
        return report;
    }

    /** 填写完当前页后，判断是否还有下一页并推进 */
    async function advanceOrFinish(report, key) {
        const policy = report.policy;
        const crossOn = state.crossPage && !policy.blocked;

        if (!crossOn) {
            // 单页模式：常规结束流程
            showResult(report);
            notify('low', '填写完成',
                '成功 ' + report.filled + ' 题，失败 ' + report.failed.length + ' 题。');
            maybeAutoSubmit(policy);
            return;
        }

        const dup = Session.markPage(key, {
            filled: report.filled,
            total: (report.filled + report.failed.length),
            title: document.title.slice(0, 60),
            titles: (report.questions || []).map(function (q) { return q.title; })
        });

        // 循环保护
        if (dup) {
            notify('medium', '检测到重复页面，已停止跨页',
                '该页面此前已处理过，继续推进可能陷入死循环。' + Session.summary());
            showResult(report);
            maybeAutoSubmit(policy);
            return;
        }
        if (Session.pageCount() > CFG.maxPages) {
            notify('medium', '已达跨页上限', '最多自动推进 ' + CFG.maxPages + ' 页，已停止。' + Session.summary());
            showResult(report);
            maybeAutoSubmit(policy);
            return;
        }

        const nextBtn = state.crossPageNext ? findNextButton() : null;
        const submitBtn = findSubmitButton();

        // 没有下一页 → 说明这是最后一页
        if (!nextBtn) {
            Session.data.finished = true;
            Session.save();
            showResult(report);
            notify('low', '所有页面填写完成', Session.summary() + '。已到最后一页。');
            maybeAutoSubmit(policy);
            return;
        }

        notify('low', '本页完成，准备进入下一页',
            Session.summary() + '。' + (state.crossPageNext ? '即将自动点击「下一页」' : '请手动点击「下一页」后脚本会继续'));

        if (!state.crossPageNext) {
            // 不自动点击：标记待继续，手动翻页后由 URLWatcher / 重新注入接管
            Session.setPending(true, state.crossPageAuto);
            showResult(report);
            return;
        }

        // 标记 pending：无论整页跳转还是 SPA，后续都由 pending 驱动续接。
        // 这里刻意不主动等待或调用下一页的处理逻辑——换页检测统一交给
        // URLWatcher（SPA）和新页面的 boot（整页跳转），避免两处同时驱动造成重复填写。
        Session.setPending(true, state.crossPageAuto);

        const fromHref = location.href;
        try { nextBtn.click(); } catch (e) {
            try { nextBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch (e2) {}
        }

        // 兜底：一段时间后若 pending 仍在且 URL 没变，说明点击没生效
        setTimeout(function () {
            try {
                const d = Session.data;
                if (!d || !d.pending) return;                 // 已成功换页，交给续接流程
                if (location.href !== fromHref) return;       // URL 已变但续接还没跑
                Session.setPending(false);
                notify('medium', '未检测到页面跳转',
                    '「下一页」按钮可能未生效，或该站点使用了脚本无法识别的换页方式。' +
                    Session.summary());
                showResult(report);
                maybeAutoSubmit(policy);
            } catch (e) { /* ignore */ }
        }, CFG.navTimeout);

        void submitBtn;
    }

    function maybeAutoSubmit(policy) {
        if (!policy.autoSubmit || policy.blocked) return;
        const btn = findSubmitButton();
        if (!btn) {
            notify('low', '未找到提交按钮', '请手动提交。');
            return;
        }
        notify('medium', '即将自动提交', '3 秒后点击提交按钮，请确认无误。');
        setTimeout(function () {
            try { btn.click(); } catch (e) { /* ignore */ }
        }, 3000);
    }

    /** 跨页续填入口：由 URLWatcher 或新页面注入时调用 */
    async function continueCrossPage() {
        if (running) return;
        const sess = Session.load();
        if (!sess) return;

        const key = pageKey(location.href);
        if (Session.isDone(key)) {
            notify('low', '当前页面已处理过', '跳过，避免重复填写。' + Session.summary());
            return;
        }
        if (Session.pageCount() >= CFG.maxPages) {
            notify('medium', '已达跨页上限', '最多自动推进 ' + CFG.maxPages + ' 页。');
            Session.setPending(false);
            return;
        }

        running = true;
        setBusy(true);
        try {
            const n = await waitForStableQuestions(6000);
            if (!n) {
                notify('low', '新页面未检测到题目', '可能已到完成页，跨页任务结束。' + Session.summary());
                Session.setPending(false);
                return;
            }
            const report = await runPage({
                autoConfirm: !!(sess.autoConfirm),
                silentDowngrade: true
            });
            if (!report) { Session.setPending(false); return; }
            if (report.blocked) {
                notify('high', '跨页任务中断',
                    '新页面检测到高风险反作弊，已停止自动填写。' + Session.summary(), 'warn');
                Session.setPending(false);
                return;
            }
            await advanceOrFinish(report, key);
        } catch (err) {
            Session.setPending(false);
            notify('high', '跨页执行失败', String(err && err.message ? err.message : err).slice(0, 300));
            console.error('[Gametame] 跨页失败', err);
        } finally {
            running = false;
            setBusy(false);
        }
    }

    function setBusy(busy) {
        const btn = ui.btnRun;
        if (!btn) return;
        if (busy) {
            if (!btn.dataset.old) btn.dataset.old = btn.textContent;
            btn.textContent = '处理中…';
            btn.disabled = true;
        } else {
            btn.textContent = btn.dataset.old || '执行';
            btn.disabled = false;
        }
    }

    async function runOnce() {
        if (running) return;
        Human.begin();          // 新一轮填写，使上一轮残留的中止状态失效

        if (!inScope()) {
            notify('medium', '当前站点不在白名单',
                location.hostname + ' 未匹配白名单，已拒绝执行。可在面板中修改白名单。');
            return;
        }
        if (!(state.apiKey || '').trim()) {
            notify('medium', '缺少 API Key', '请先在面板中填入 API Key。');
            if (ui.setPanel) ui.setPanel(true);
            return;
        }

        // 手动点击 = 开一次新的跨页会话
        if (state.crossPage) {
            Session.start();
            Session.data.autoConfirm = !!state.crossPageAuto;
            Session.save();
        } else {
            Session.clear();
        }

        running = true;
        setBusy(true);
        try {
            const key = pageKey(location.href);
            const report = await runPage({
                onProgress: function (msg) {
                    if (ui.btnRun) ui.btnRun.textContent = msg;
                }
            });
            if (!report) return;
            if (report.blocked) {
                Session.setPending(false);
                return;
            }
            await advanceOrFinish(report, key);
        } catch (err) {
            notify('high', '执行失败', String(err && err.message ? err.message : err).slice(0, 400));
            console.error('[Gametame] ', err);
        } finally {
            running = false;
            setBusy(false);
        }
    }

    /** 中止当前跨页任务（菜单命令用） */
    function abortCrossPage() {
        Session.clear();
        Human.abort();          // 中止进行中的逐字输入
        running = false;
        setBusy(false);
        renderSessionBar(ui.sessBox);
        renderSessionBar(ui.riskBox);
        notify('low', '已中止', '跨页任务已停止，本地进度已清除。');
    }

    /** 用一道最小题目验证 Key / 模型 / 端点是否可用 */
    function testConnection() {
        const provider = currentProvider();
        const key = (state.apiKey || '').trim();
        if (!key) {
            notify('medium', '缺少 API Key', '请先在「AI」标签页填入 Key。');
            if (ui.switchTab) ui.switchTab('ai');
            return;
        }
        const btn = ui.root && ui.root.querySelector ? null : null;
        notify('low', '正在测试…', provider.name + ' / ' + currentModel());
        requestAI(provider, currentModel(), key,
            '请只回复两个字：OK')
            .then(function () {
                notify('low', '连接正常',
                    provider.name + '（' + currentModel() + '）可正常调用。');
            })
            .catch(function (err) {
                notify('high', '连接失败', String(err && err.message ? err.message : err).slice(0, 300));
            });
        void btn;
    }

    /* ═══════════════════════════════════════════════════════════════════════
       11. 启动
       ═══════════════════════════════════════════════════════════════════════ */

    /**
     * 全局快捷键。
     * 面板被拖到屏幕角落或收起时，用键盘比找悬浮球快。
     * 注意避开浏览器保留组合（Alt+Q 在部分环境会触发关机提示，故改用 Shift+Alt）。
     */
    function installHotkeys(handlers) {
        document.addEventListener('keydown', function (e) {
            // 正在输入时不拦截，否则打字会触发快捷键
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
            if (!e.altKey || e.ctrlKey || e.metaKey) return;
            const k = String(e.key || '').toLowerCase();
            if (k === 'q') { e.preventDefault(); handlers.togglePanel(); }
            else if (k === 'w') { e.preventDefault(); handlers.run(); }
            else if (k === 'e') { e.preventDefault(); handlers.preview(); }
        });
    }

    function boot() {
        try {
            if (document.body) buildUI();
            else return;
        } catch (e) {
            console.error('[Gametame] UI 初始化失败', e);
            return;
        }

        Session.load();
        if (state.debug) exposeDebug();

        /* ── 路径 A：整页跳转后的续接 ──
           上一次脚本在销毁前把 pending 写进了存储，新页面读到了就自动接着跑。 */
        if (state.crossPage && Session.pendingValid() && inScope()) {
            Session.setPending(false);
            notify('low', '检测到跨页任务，正在继续', '页面已跳转，等待渲染完成后自动填写本页…');
            setTimeout(function () {
                continueCrossPage().catch(function (e) {
                    console.error('[Gametame] 续接失败', e);
                });
            }, CFG.afterNavDelay);
        } else if (Session.data && Session.data.pending) {
            // pending 已过期（例如手动刷新），清掉避免误触发
            Session.setPending(false);
        }

        /* ── 路径 B：SPA 换页 ── */
        URLWatcher.install(function (from, to) {
            if (!state.crossPage) return;
            if (pageKey(from) === pageKey(to)) return;   // 只是参数变化，不算换页
            if (!Session.data) return;
            if (!Session.data.pending) return;
            Session.setPending(false);
            notify('low', '检测到页面切换（SPA）', '正在处理新页面…');
            setTimeout(function () {
                continueCrossPage().catch(function (e) {
                    console.error('[Gametame] SPA 续接失败', e);
                });
            }, CFG.afterNavDelay);
        });

        // 首屏自动扫描（延迟，等问卷平台渲染完成）
        setTimeout(function () {
            try {
                if (!inScope()) return;
                const risk = runScan(false);
                if (risk.level !== 'low' && ui.setPanel) {
                    // 有风险时自动展开面板，确保能看到
                    ui.setPanel(true);
                }
                // 检测到多页问卷但未开启跨页 → 提示一次，省得每页手点
                if (!state.crossPage && Session.pageCount() === 0 && findNextButton()) {
                    notify('low', '检测到多页问卷',
                        '到「跨页」标签页开启自动续填，填完本页会自动进入下一页继续，无需逐页点击执行。');
                }
            } catch (e) {
                console.error('[Gametame] 首次扫描失败', e);
            }
        }, 1500);

        try {
            if (typeof GM_registerMenuCommand === 'function') {
                GM_registerMenuCommand('重新扫描反作弊', function () { runScan(true); });
                GM_registerMenuCommand('执行问卷填写', function () { runOnce(); });
                GM_registerMenuCommand('中止跨页任务', function () { abortCrossPage(); });
                GM_registerMenuCommand('查看跨页进度', function () {
                    Session.load();
                    notify('low', '跨页进度',
                        Session.data ? Session.summary() : '当前没有进行中的跨页任务。');
                });
                GM_registerMenuCommand('清除本地配置（含 Key）', function () {
                    ['provider', 'model', 'apiKey', 'persistKey', 'customBase', 'mode',
                     'autoSubmit', 'scopeWhitelist', 'crossPage', 'crossPageAuto',
                     'crossPageNext'].forEach(function (k) { Store.del(k); });
                    Session.clear();
                    notify('low', '已清除', '本地保存的配置已删除，刷新页面后生效。');
                });
            }
        } catch (e) { /* ignore */ }

        console.log(SCRIPT_NAME + ' 已启动。点击右下角齿轮打开面板。');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();
