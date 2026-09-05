// ==UserScript==
// @name         FastKB 网页虚拟键盘插件
// @namespace    https://github.com/fastnow
// @version      1.4.1
// @description  可自由布局、双击编辑的网页虚拟键盘。支持宏、连发、手势、多配置等20+功能，完美适配触摸屏与桌面。布局自适应屏幕，声音稳定。
// @author       FastNow Studio
// @match        *://*/*
// @icon         https://fastly.jsdelivr.net/gh/fastnow/FastKB@main/assets/icon.jpg
// @updateURL    https://gh-proxy.org/https://raw.githubusercontent.com/fastnow/FastKB/main/userscript/fastkb.user.js
// @downloadURL  https://gh-proxy.org/https://raw.githubusercontent.com/fastnow/FastKB/main/userscript/fastkb.user.js
// @license      MIT
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// ==/UserScript==

(function() {
    'use strict';

    // ============================================================
    // 1. 配置模块
    // ============================================================

    const STORAGE_KEY = 'gamepad_final_v12';

    const DEFAULT_BUTTON = {
        text: 'Btn',
        key: '',
        code: '',
        type: 'action',
        left: 0,
        top: 0,
        width: 65,
        height: 65,
        bg: 'rgba(255,255,255,0.15)',
        pressedBg: 'rgba(255,255,255,0.4)',
        opacity: 1.0,
        locked: false,
        textColor: '#ffffff',
        fontSize: 0,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        boxShadow: '0 4px 0 rgba(0,0,0,0.3), 0 6px 12px rgba(0,0,0,0.4)',
        borderRadius: 12
    };

    const DEFAULT_PROFILE = {
        buttons: [
            { id: 'w', text: 'W', key: 'w', code: 'KeyW', type: 'action', left: 0, top: 0, width: 65, height: 65, bg: 'rgba(255,255,255,0.15)', pressedBg: 'rgba(255,255,255,0.4)', opacity: 1.0, locked: false, textColor: '#ffffff', fontSize: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', boxShadow: '0 4px 0 rgba(0,0,0,0.3), 0 6px 12px rgba(0,0,0,0.4)', borderRadius: 12 },
            { id: 'a', text: 'A', key: 'a', code: 'KeyA', type: 'action', left: 0, top: 0, width: 65, height: 65, bg: 'rgba(255,255,255,0.15)', pressedBg: 'rgba(255,255,255,0.4)', opacity: 1.0, locked: false, textColor: '#ffffff', fontSize: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', boxShadow: '0 4px 0 rgba(0,0,0,0.3), 0 6px 12px rgba(0,0,0,0.4)', borderRadius: 12 },
            { id: 's', text: 'S', key: 's', code: 'KeyS', type: 'action', left: 0, top: 0, width: 65, height: 65, bg: 'rgba(255,255,255,0.15)', pressedBg: 'rgba(255,255,255,0.4)', opacity: 1.0, locked: false, textColor: '#ffffff', fontSize: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', boxShadow: '0 4px 0 rgba(0,0,0,0.3), 0 6px 12px rgba(0,0,0,0.4)', borderRadius: 12 },
            { id: 'd', text: 'D', key: 'd', code: 'KeyD', type: 'action', left: 0, top: 0, width: 65, height: 65, bg: 'rgba(255,255,255,0.15)', pressedBg: 'rgba(255,255,255,0.4)', opacity: 1.0, locked: false, textColor: '#ffffff', fontSize: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', boxShadow: '0 4px 0 rgba(0,0,0,0.3), 0 6px 12px rgba(0,0,0,0.4)', borderRadius: 12 },
            { id: 'up', text: '↑', key: 'ArrowUp', code: 'ArrowUp', type: 'dpad', left: 0, top: 0, width: 65, height: 65, bg: 'rgba(255,255,255,0.15)', pressedBg: 'rgba(255,255,255,0.4)', opacity: 1.0, locked: false, textColor: '#ffffff', fontSize: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', boxShadow: '0 4px 0 rgba(0,0,0,0.3), 0 6px 12px rgba(0,0,0,0.4)', borderRadius: 50 },
            { id: 'left', text: '←', key: 'ArrowLeft', code: 'ArrowLeft', type: 'dpad', left: 0, top: 0, width: 65, height: 65, bg: 'rgba(255,255,255,0.15)', pressedBg: 'rgba(255,255,255,0.4)', opacity: 1.0, locked: false, textColor: '#ffffff', fontSize: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', boxShadow: '0 4px 0 rgba(0,0,0,0.3), 0 6px 12px rgba(0,0,0,0.4)', borderRadius: 50 },
            { id: 'down', text: '↓', key: 'ArrowDown', code: 'ArrowDown', type: 'dpad', left: 0, top: 0, width: 65, height: 65, bg: 'rgba(255,255,255,0.15)', pressedBg: 'rgba(255,255,255,0.4)', opacity: 1.0, locked: false, textColor: '#ffffff', fontSize: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', boxShadow: '0 4px 0 rgba(0,0,0,0.3), 0 6px 12px rgba(0,0,0,0.4)', borderRadius: 50 },
            { id: 'right', text: '→', key: 'ArrowRight', code: 'ArrowRight', type: 'dpad', left: 0, top: 0, width: 65, height: 65, bg: 'rgba(255,255,255,0.15)', pressedBg: 'rgba(255,255,255,0.4)', opacity: 1.0, locked: false, textColor: '#ffffff', fontSize: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', boxShadow: '0 4px 0 rgba(0,0,0,0.3), 0 6px 12px rgba(0,0,0,0.4)', borderRadius: 50 },
            { id: 'space', text: '␣', key: ' ', code: 'Space', type: 'action', left: 0, top: 0, width: 120, height: 65, bg: 'rgba(255,255,255,0.15)', pressedBg: 'rgba(255,255,255,0.4)', opacity: 1.0, locked: false, textColor: '#ffffff', fontSize: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', boxShadow: '0 4px 0 rgba(0,0,0,0.3), 0 6px 12px rgba(0,0,0,0.4)', borderRadius: 12 },
            { id: 'esc', text: '⎋', key: 'Escape', code: 'Escape', type: 'action', left: 0, top: 0, width: 65, height: 65, bg: 'rgba(255,255,255,0.15)', pressedBg: 'rgba(255,255,255,0.4)', opacity: 1.0, locked: false, textColor: '#ffffff', fontSize: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', boxShadow: '0 4px 0 rgba(0,0,0,0.3), 0 6px 12px rgba(0,0,0,0.4)', borderRadius: 12 }
        ],
        barColor: '#ff4444',
        barWidth: 100,
        barHeight: 12,
        barPosition: 50,
        barOffset: 0,
        editMode: false,
        soundEnabled: true,
        turboEnabled: false,
        turboCPS: 10,
        turboRandom: 30,
        snapToEdge: false,
        snapAlign: false,
        alignThreshold: 20,
        macroPlayInterval: 100,
        macroLoopEnabled: false,
        blockKeys: false,
        quickSwitchKey: 'F5',
        doubleClickSpeed: 300,
        longPressTime: 500,
        gameMode: false,
        theme: 'dark',
        macroSteps: [],
        mouseSimEnabled: false,
        mouseSimMode: 'follow',
        mouseExitBtnSize: 40,
        mouseExitBtnLeft: 60,
        mouseExitBtnTop: 60
    };

    function getDefaultButton(overrides) {
        return { ...DEFAULT_BUTTON, ...overrides };
    }

    function migrateButtonConfig(btn) {
        const defaults = {
            textColor: '#ffffff',
            fontSize: 0,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.15)',
            boxShadow: '0 4px 0 rgba(0,0,0,0.3), 0 6px 12px rgba(0,0,0,0.4)',
            borderRadius: btn.type === 'action' ? 12 : 50
        };
        Object.keys(defaults).forEach(key => {
            if (btn[key] === undefined) btn[key] = defaults[key];
        });
        return btn;
    }

    function normalizeConfig(loaded) {
        if (!loaded || typeof loaded !== 'object') return null;
        const result = { profiles: {}, activeProfile: '默认' };

        if (loaded.profiles) {
            result.activeProfile = loaded.activeProfile || '默认';
            Object.keys(loaded.profiles).forEach(name => {
                const prof = loaded.profiles[name];
                if (prof && prof.buttons) {
                    prof.buttons = prof.buttons.map(migrateButtonConfig);
                    prof.macroSteps = prof.macroSteps || [];
                    prof.mouseSimEnabled = prof.mouseSimEnabled || false;
                    prof.mouseSimMode = prof.mouseSimMode || 'follow';
                    prof.mouseExitBtnSize = prof.mouseExitBtnSize || 40;
                    prof.mouseExitBtnLeft = prof.mouseExitBtnLeft || 60;
                    prof.mouseExitBtnTop = prof.mouseExitBtnTop || 60;
                    result.profiles[name] = prof;
                }
            });
            if (!result.profiles[result.activeProfile]) {
                result.activeProfile = '默认';
                result.profiles['默认'] = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
            }
        } else {
            // Single profile mode
            const prof = { ...loaded };
            if (prof.buttons) prof.buttons = prof.buttons.map(migrateButtonConfig);
            prof.macroSteps = prof.macroSteps || [];
            prof.mouseSimEnabled = prof.mouseSimEnabled || false;
            prof.mouseSimMode = prof.mouseSimMode || 'follow';
            prof.mouseExitBtnSize = prof.mouseExitBtnSize || 40;
            prof.mouseExitBtnLeft = prof.mouseExitBtnLeft || 60;
            prof.mouseExitBtnTop = prof.mouseExitBtnTop || 60;
            result.profiles['默认'] = prof;
        }
        return result;
    }

    function loadConfig() {
        try {
            const saved = GM_getValue(STORAGE_KEY, '{}');
            if (!saved || saved === '{}') {
                return { activeProfile: '默认', profiles: { '默认': JSON.parse(JSON.stringify(DEFAULT_PROFILE)) } };
            }
            const parsed = JSON.parse(saved);
            const normalized = normalizeConfig(parsed);
            if (normalized) return normalized;
        } catch (e) {
            console.warn('配置加载失败，使用默认配置', e);
        }
        return { activeProfile: '默认', profiles: { '默认': JSON.parse(JSON.stringify(DEFAULT_PROFILE)) } };
    }

    function saveConfig(config) {
        GM_setValue(STORAGE_KEY, JSON.stringify(config));
    }

    // ============================================================
    // 2. 工具函数
    // ============================================================

    function getKeyCode(key) {
        if (key.length === 1 && key.match(/[a-zA-Z]/)) {
            return 'Key' + key.toUpperCase();
        }
        const map = {
            ' ': 'Space',
            'ArrowUp': 'ArrowUp',
            'ArrowDown': 'ArrowDown',
            'ArrowLeft': 'ArrowLeft',
            'ArrowRight': 'ArrowRight',
            'Escape': 'Escape',
            'Shift': 'ShiftLeft',
            'Control': 'ControlLeft',
            'Alt': 'AltLeft',
            'Enter': 'Enter',
            'Tab': 'Tab',
            'Backspace': 'Backspace',
            'Delete': 'Delete',
            'Insert': 'Insert',
            'Home': 'Home',
            'End': 'End',
            'PageUp': 'PageUp',
            'PageDown': 'PageDown'
        };
        return map[key] || key;
    }

    function sendKey(eventType, key, code) {
        const keyCodeMap = { 'ArrowUp': 38, 'ArrowDown': 40, 'ArrowLeft': 37, 'ArrowRight': 39, ' ': 32, 'Escape': 27 };
        const keyCode = keyCodeMap[key] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
        document.dispatchEvent(new KeyboardEvent(eventType, {
            key, code, keyCode, which: keyCode, bubbles: true, cancelable: true
        }));
    }

    // 声音系统
    let audioCtx = null;

    function playBeep() {
        if (!audioCtx) return;
        try {
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.frequency.value = 800;
            gainNode.gain.value = 0.1;
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.1);
        } catch (e) { /* ignore */ }
    }

    function beep() {
        if (!activeConfig || !activeConfig.soundEnabled) return;
        try {
            if (!audioCtx) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                audioCtx = new AudioContextClass();
            }
            if (audioCtx.state === 'suspended') {
                audioCtx.resume().then(() => playBeep());
            } else {
                playBeep();
            }
        } catch (e) { /* ignore */ }
    }

    function getRandomTurboInterval(config) {
        const base = 1000 / config.turboCPS;
        if (!config.turboRandom) return base;
        const range = config.turboRandom;
        return base + Math.floor(Math.random() * range * 2) - range;
    }

    function alignButtonPosition(btnConfig, newLeft, newTop, excludeId, config) {
        if (!config.snapAlign) return { left: newLeft, top: newTop };
        const threshold = config.alignThreshold;
        let alignedLeft = newLeft;
        let alignedTop = newTop;

        config.buttons.forEach(other => {
            if (other.id === excludeId) return;
            if (Math.abs(newLeft - other.left) < threshold) alignedLeft = other.left;
            if (Math.abs(newLeft - (other.left + other.width)) < threshold) alignedLeft = other.left + other.width;
            if (Math.abs((newLeft + btnConfig.width) - other.left) < threshold) alignedLeft = other.left - btnConfig.width;
            if (Math.abs((newLeft + btnConfig.width) - (other.left + other.width)) < threshold) alignedLeft = other.left + other.width - btnConfig.width;

            if (Math.abs(newTop - other.top) < threshold) alignedTop = other.top;
            if (Math.abs(newTop - (other.top + other.height)) < threshold) alignedTop = other.top + other.height;
            if (Math.abs((newTop + btnConfig.height) - other.top) < threshold) alignedTop = other.top - btnConfig.height;
            if (Math.abs((newTop + btnConfig.height) - (other.top + other.height)) < threshold) alignedTop = other.top + other.height - btnConfig.height;
        });

        if (config.snapToEdge) {
            const snap = 20;
            if (alignedLeft < snap) alignedLeft = 0;
            if (alignedTop < snap) alignedTop = 0;
            if (alignedLeft > window.innerWidth - btnConfig.width - snap) alignedLeft = window.innerWidth - btnConfig.width;
            if (alignedTop > window.innerHeight - btnConfig.height - snap) alignedTop = window.innerHeight - btnConfig.height;
        }

        return { left: alignedLeft, top: alignedTop };
    }

    function applyAdaptiveLayout(buttons) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const margin = 20;

        const spaceBtn = buttons.find(b => b.id === 'space');
        const spaceWidth = spaceBtn ? spaceBtn.width : 120;

        const sampleBtn = buttons.find(b => b.id === 'w');
        const btnSize = sampleBtn ? sampleBtn.height : 65;

        const row1Y = h - btnSize * 3 - margin;
        const row2Y = h - btnSize * 2 - margin;

        const wasdBaseX = margin;
        const dirBaseX = w - btnSize * 3 - margin;

        buttons.forEach(btn => {
            if (btn.id === 'w') {
                btn.left = wasdBaseX + btnSize;
                btn.top = row1Y;
            } else if (btn.id === 'a') {
                btn.left = wasdBaseX;
                btn.top = row2Y;
            } else if (btn.id === 's') {
                btn.left = wasdBaseX + btnSize;
                btn.top = row2Y;
            } else if (btn.id === 'd') {
                btn.left = wasdBaseX + btnSize * 2;
                btn.top = row2Y;
            } else if (btn.id === 'up') {
                btn.left = dirBaseX + btnSize;
                btn.top = row1Y;
            } else if (btn.id === 'left') {
                btn.left = dirBaseX;
                btn.top = row2Y;
            } else if (btn.id === 'down') {
                btn.left = dirBaseX + btnSize;
                btn.top = row2Y;
            } else if (btn.id === 'right') {
                btn.left = dirBaseX + btnSize * 2;
                btn.top = row2Y;
            } else if (btn.id === 'space') {
                btn.left = (w / 2) - (btn.width / 2);
                btn.top = row2Y;
            } else if (btn.id === 'esc') {
                btn.left = margin;
                btn.top = margin;
            }
            btn.left = Math.max(0, Math.min(btn.left, w - btn.width));
            btn.top = Math.max(0, Math.min(btn.top, h - btn.height));
        });
    }

    // ============================================================
    // 3. 状态管理
    // ============================================================

    let config = loadConfig();
    let activeConfig = config.profiles[config.activeProfile] || config.profiles['默认'];

    const pressCount = {};
    const turboIntervals = {};
    let activeMouseKey = null;
    let settingsVisible = false;
    let editorOpen = false;
    let currentEditingButtonId = null;
    let buttonEditor = null;
    let connectorLine = null;
    let lastClickTime = 0;
    let lastClickButtonId = null;

    // 宏状态
    let macroRecording = false;
    let macroSteps = [];
    let macroPlaying = false;
    let macroPlayTimer = null;
    let macroStartTime = null;
    let macroLoop = false;

    // 拖拽状态
    let dragState = null;

    function saveActiveProfile() {
        config.profiles[config.activeProfile] = JSON.parse(JSON.stringify(activeConfig));
        saveConfig(config);
    }

    function switchProfile(name) {
        if (!config.profiles[name]) return;
        config.activeProfile = name;
        activeConfig = config.profiles[name];
        saveConfig(config);
        rebuildAll();
        if (activeConfig.mouseSimEnabled) {
            MouseSimulator.enable(activeConfig.mouseSimMode);
        } else {
            MouseSimulator.disable();
        }
        // 更新设置面板中的复选框
        const enableCheck = document.getElementById('mouseSimEnabled');
        if (enableCheck) enableCheck.checked = activeConfig.mouseSimEnabled;
    }

    function toggleGameMode(enable) {
        if (enable) {
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
        }
    }

    // ============================================================
    // 4. 鼠标模拟模块（重构版）
    // ============================================================

    const MouseSimulator = (function() {
        let enabled = false;
        let mode = 'follow';
        let cursorElement = null;
        let exitButton = null;
        let activeTouchId = null;
        let startTouchPos = { x: 0, y: 0 };
        let startCursorPos = { x: 0, y: 0 };
        let lastCursorPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        let hasMoved = false;
        let currentHoverElement = null;
        let currentCursorType = 'arrow';
        let styleElement = null;
        let faLink = null;
        let useFallback = false;
        let listeners = [];
        let isDragging = false;

        const MOVE_THRESHOLD = 5;
        const MODE_FOLLOW = 'follow';
        const MODE_DRAG = 'drag';

        function addListener(el, event, handler, opts) {
            el.addEventListener(event, handler, opts);
            listeners.push({ el, event, handler, opts });
        }

        function removeAllListeners() {
            listeners.forEach(({ el, event, handler, opts }) => {
                el.removeEventListener(event, handler, opts);
            });
            listeners = [];
        }

        function shouldShowHandCursor(element) {
            if (!element) return false;
            const tag = element.tagName?.toLowerCase();
            if (tag === 'a' || tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'option') return true;
            const role = element.getAttribute('role');
            if (role === 'button' || role === 'link' || role === 'checkbox' || role === 'radio' || role === 'tab' || role === 'menuitem') return true;
            if (element.hasAttribute('onclick') || element.hasAttribute('ng-click') || element.hasAttribute('@click')) return true;
            const cursor = window.getComputedStyle(element).cursor;
            if (cursor === 'pointer') return true;
            let parent = element.parentElement;
            let depth = 0;
            while (parent && depth < 5) {
                if (window.getComputedStyle(parent).cursor === 'pointer') return true;
                const pTag = parent.tagName?.toLowerCase();
                if (pTag === 'a' || pTag === 'button' || pTag === 'label') return true;
                parent = parent.parentElement;
                depth++;
            }
            return false;
        }

        function updateCursorIcon(targetElement) {
            const showHand = shouldShowHandCursor(targetElement);
            const newType = showHand ? 'hand' : 'arrow';
            if (newType === currentCursorType) return;
            currentCursorType = newType;
            if (useFallback) {
                cursorElement.textContent = showHand ? '»' : '✕';
            } else {
                cursorElement.innerHTML = showHand ? '<i class="fa-solid fa-hand-pointer"></i>' : '<i class="fa-solid fa-arrow-pointer"></i>';
            }
        }

        function setCursorPosition(x, y) {
            x = Math.max(0, Math.min(window.innerWidth, x));
            y = Math.max(0, Math.min(window.innerHeight, y));
            cursorElement.style.left = x + 'px';
            cursorElement.style.top = y + 'px';
            lastCursorPos = { x, y };
        }

        function getTargetFromCursor() {
            return document.elementFromPoint(lastCursorPos.x, lastCursorPos.y);
        }

        function dispatchMouseEvent(type, target, options = {}) {
            if (!target) return;
            const event = new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                clientX: lastCursorPos.x,
                clientY: lastCursorPos.y,
                screenX: lastCursorPos.x,
                screenY: lastCursorPos.y,
                button: options.button || 0,
                buttons: options.buttons || 0,
                relatedTarget: options.relatedTarget || null,
                ...options
            });
            target.dispatchEvent(event);
        }

        function handleHoverChange(newTarget) {
            if (currentHoverElement === newTarget) return;
            if (currentHoverElement) {
                dispatchMouseEvent('mouseleave', currentHoverElement, { relatedTarget: newTarget });
                dispatchMouseEvent('mouseout', currentHoverElement, { relatedTarget: newTarget });
            }
            if (newTarget) {
                dispatchMouseEvent('mouseenter', newTarget, { relatedTarget: currentHoverElement });
                dispatchMouseEvent('mouseover', newTarget, { relatedTarget: currentHoverElement });
            }
            currentHoverElement = newTarget;
            updateCursorIcon(newTarget);
        }

        function isOurUIElement(target) {
            if (!target) return false;
            return target.id === 'mouse-exit-button' ||
                   target.id === 'gamepad-settings' ||
                   target.closest('#gamepad-settings') ||
                   target.closest('#mouse-exit-button') ||
                   (target.classList && (target.classList.contains('gamepad-btn') || target.classList.contains('gamepad-control-bar')));
        }

        function onTouchStart(e) {
            if (!enabled || isOurUIElement(e.target)) return;
            const touch = e.touches[0];
            if (!touch || activeTouchId !== null) return;
            activeTouchId = touch.identifier;
            startTouchPos = { x: touch.clientX, y: touch.clientY };
            startCursorPos = { ...lastCursorPos };
            hasMoved = false;
            isDragging = false;
            e.preventDefault();
            e.stopPropagation();

            const touchTarget = document.elementFromPoint(touch.clientX, touch.clientY);
            if (touchTarget?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(touchTarget?.tagName)) {
                touchTarget.focus();
            }

            const cursorTarget = getTargetFromCursor();
            dispatchMouseEvent('mousedown', cursorTarget, { button: 0, buttons: 1 });
        }

        function onTouchMove(e) {
            if (!enabled || activeTouchId === null || isOurUIElement(e.target)) return;
            let touch = null;
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].identifier === activeTouchId) {
                    touch = e.touches[i];
                    break;
                }
            }
            if (!touch) return;
            e.preventDefault();
            e.stopPropagation();

            const currentX = touch.clientX;
            const currentY = touch.clientY;

            const dx = Math.abs(currentX - startTouchPos.x);
            const dy = Math.abs(currentY - startTouchPos.y);
            if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
                hasMoved = true;
                isDragging = true;
            }

            let newX, newY;
            if (mode === MODE_FOLLOW) {
                newX = currentX;
                newY = currentY;
            } else {
                newX = startCursorPos.x + (currentX - startTouchPos.x);
                newY = startCursorPos.y + (currentY - startTouchPos.y);
            }
            setCursorPosition(newX, newY);

            const newTarget = getTargetFromCursor();
            handleHoverChange(newTarget);
            dispatchMouseEvent('mousemove', newTarget);
        }

        function onTouchEnd(e) {
            if (!enabled || activeTouchId === null || isOurUIElement(e.target)) return;
            let touch = null;
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === activeTouchId) {
                    touch = e.changedTouches[i];
                    break;
                }
            }
            if (!touch) return;
            e.preventDefault();
            e.stopPropagation();

            const cursorTarget = getTargetFromCursor();
            dispatchMouseEvent('mouseup', cursorTarget, { button: 0, buttons: 0 });

            if (!isDragging && !hasMoved) {
                dispatchMouseEvent('click', cursorTarget, { button: 0 });
            }

            activeTouchId = null;
            hasMoved = false;
            isDragging = false;
        }

        function onTouchCancel(e) {
            if (!enabled) return;
            activeTouchId = null;
            hasMoved = false;
            isDragging = false;
        }

        function loadFontAwesome() {
            return new Promise((resolve, reject) => {
                if (document.querySelector('link[href*="font-awesome"], link[href*="fontawesome"]')) {
                    resolve();
                    return;
                }
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
                link.onload = () => resolve();
                link.onerror = () => reject();
                document.head.appendChild(link);
                faLink = link;
            });
        }

        function createExitButton() {
            if (exitButton) return;
            exitButton = document.createElement('div');
            exitButton.id = 'mouse-exit-button';
            const size = activeConfig.mouseExitBtnSize || 40;
            const left = activeConfig.mouseExitBtnLeft || 60;
            const top = activeConfig.mouseExitBtnTop || 60;
            exitButton.style.cssText = `
                position: fixed;
                left: ${left}px;
                top: ${top}px;
                width: ${size}px;
                height: ${size}px;
                background: #ff4444;
                border-radius: 50%;
                z-index: 2147483647;
                cursor: pointer;
                opacity: 0.8;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: ${Math.floor(size * 0.6)}px;
                font-family: "Font Awesome 6 Free", sans-serif;
                font-weight: 900;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                border: 2px solid white;
                transition: opacity 0.2s;
                pointer-events: auto;
            `;
            if (useFallback) {
                exitButton.textContent = '✕';
            } else {
                exitButton.innerHTML = '<i class="fa-solid fa-times"></i>';
            }
            exitButton.addEventListener('click', (e) => {
                e.stopPropagation();
                disable();
                if (activeConfig) {
                    activeConfig.mouseSimEnabled = false;
                    saveActiveProfile();
                }
                const enableCheck = document.getElementById('mouseSimEnabled');
                if (enableCheck) enableCheck.checked = false;
            });
            exitButton.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: false });
            document.body.appendChild(exitButton);
        }

        function updateExitButtonPosition() {
            if (!exitButton) return;
            const size = activeConfig?.mouseExitBtnSize || 40;
            const left = activeConfig?.mouseExitBtnLeft || 60;
            const top = activeConfig?.mouseExitBtnTop || 60;
            exitButton.style.left = left + 'px';
            exitButton.style.top = top + 'px';
            exitButton.style.width = size + 'px';
            exitButton.style.height = size + 'px';
            exitButton.style.fontSize = Math.floor(size * 0.6) + 'px';
        }

        function enable(newMode) {
            if (enabled) {
                mode = newMode || mode;
                updateExitButtonPosition();
                return;
            }
            mode = newMode || 'follow';
            enabled = true;

            styleElement = document.createElement('style');
            styleElement.textContent = '* { cursor: none !important; }';
            document.head.appendChild(styleElement);

            cursorElement = document.createElement('div');
            cursorElement.id = 'custom-mouse-cursor';
            cursorElement.style.cssText = `
                position: fixed;
                z-index: 2147483647;
                pointer-events: none;
                left: ${lastCursorPos.x}px;
                top: ${lastCursorPos.y}px;
                transform: translate(-50%, -50%);
                color: #000;
                text-shadow: 0 0 3px #fff;
                line-height: 1;
                display: block;
                font-size: 32px;
                font-family: "Font Awesome 6 Free", sans-serif;
                font-weight: 900;
            `;
            cursorElement.innerHTML = '<i class="fa-solid fa-arrow-pointer"></i>';
            document.body.appendChild(cursorElement);

            loadFontAwesome().catch(() => {
                useFallback = true;
                cursorElement.textContent = '✕';
                cursorElement.style.fontFamily = 'Arial, sans-serif';
                cursorElement.style.fontSize = '30px';
            });

            createExitButton();

            addListener(document, 'touchstart', onTouchStart, { capture: true, passive: false });
            addListener(document, 'touchmove', onTouchMove, { capture: true, passive: false });
            addListener(document, 'touchend', onTouchEnd, { capture: true });
            addListener(document, 'touchcancel', onTouchCancel, { capture: true });
        }

        function disable() {
            if (!enabled) return;
            enabled = false;
            removeAllListeners();
            if (cursorElement) cursorElement.remove();
            if (exitButton) exitButton.remove();
            if (styleElement) styleElement.remove();
            if (faLink) faLink.remove();
            cursorElement = null;
            exitButton = null;
            styleElement = null;
            faLink = null;
            activeTouchId = null;
            currentHoverElement = null;
        }

        function setMode(newMode) {
            if (newMode === MODE_FOLLOW || newMode === MODE_DRAG) {
                mode = newMode;
            }
        }

        return { enable, disable, setMode, updateExitButtonPosition };
    })();

    // ============================================================
    // 5. 宏系统
    // ============================================================

    function macroRecordHandler(e) {
        if (!macroRecording) return;
        e.preventDefault();
        const now = Date.now();
        const relativeTime = now - macroStartTime;
        const lastTotal = macroSteps.reduce((acc, step) => acc + step.delay, 0);
        const delay = macroSteps.length === 0 ? relativeTime : relativeTime - lastTotal;
        macroSteps.push({
            delay: Math.max(0, delay),
            action: e.type === 'keydown' ? 'down' : 'up',
            key: e.key,
            code: e.code
        });
    }

    function stopMacroRecording() {
        if (macroRecording) {
            macroRecording = false;
            document.removeEventListener('keydown', macroRecordHandler);
            document.removeEventListener('keyup', macroRecordHandler);
            activeConfig.macroSteps = macroSteps.slice();
            saveActiveProfile();
        }
    }

    function playMacro(steps, loop) {
        if (!steps || steps.length === 0) return;
        if (macroPlaying) stopMacro();
        macroPlaying = true;
        macroLoop = loop;
        let index = 0;
        let timer = null;

        function playNext() {
            if (!macroPlaying) return;
            if (index >= steps.length) {
                if (macroLoop) {
                    index = 0;
                    timer = setTimeout(playNext, 0);
                } else {
                    macroPlaying = false;
                }
                return;
            }
            const step = steps[index];
            if (step.action === 'down') {
                sendKey('keydown', step.key, step.code);
            } else {
                sendKey('keyup', step.key, step.code);
            }
            index++;
            timer = setTimeout(playNext, step.delay || 0);
        }

        timer = setTimeout(playNext, steps[0]?.delay || 0);
        macroPlayTimer = timer;
    }

    function stopMacro() {
        macroPlaying = false;
        if (macroPlayTimer) {
            clearTimeout(macroPlayTimer);
            macroPlayTimer = null;
        }
    }

    // ============================================================
    // 6. UI 渲染器
    // ============================================================

    let buttonContainer = null;

    function getButtonContainer() {
        if (!buttonContainer || !document.body.contains(buttonContainer)) {
            buttonContainer = document.createElement('div');
            buttonContainer.id = 'gamepad-button-container';
            document.body.appendChild(buttonContainer);
        }
        return buttonContainer;
    }

    function createButtonElement(btnConfig) {
        const btn = document.createElement('div');
        btn.className = 'gamepad-btn';
        btn.dataset.id = btnConfig.id;
        btn.dataset.key = btnConfig.key;
        btn.dataset.code = btnConfig.code;
        btn.dataset.locked = btnConfig.locked ? 'true' : 'false';
        btn.dataset.editing = 'false';
        btn.textContent = btnConfig.text;

        const fontSize = btnConfig.fontSize && btnConfig.fontSize > 0
            ? btnConfig.fontSize + 'px'
            : Math.min(btnConfig.width, btnConfig.height) * 0.4 + 'px';

        const borderRadius = btnConfig.borderRadius !== undefined
            ? btnConfig.borderRadius + 'px'
            : (btnConfig.type === 'action' ? '12px' : '50%');

        const boxShadow = btnConfig.boxShadow && btnConfig.boxShadow !== 'none'
            ? btnConfig.boxShadow
            : 'none';

        btn.style.cssText = `
            position: fixed;
            left: ${btnConfig.left}px;
            top: ${btnConfig.top}px;
            width: ${btnConfig.width}px;
            height: ${btnConfig.height}px;
            background: ${btnConfig.bg};
            border-radius: ${borderRadius};
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: ${fontSize};
            font-weight: 600;
            color: ${btnConfig.textColor || '#ffffff'};
            text-shadow: 0 2px 4px black;
            box-shadow: ${boxShadow};
            transition: transform 0.05s ease, background 0.05s ease;
            border: ${btnConfig.borderWidth || 1}px solid ${btnConfig.borderColor || 'rgba(255,255,255,0.15)'};
            cursor: ${activeConfig.editMode && !btnConfig.locked ? 'move' : 'pointer'};
            user-select: none;
            touch-action: none;
            opacity: ${btnConfig.opacity};
            pointer-events: auto;
            z-index: 10000;
        `;

        // 拖拽系统
        let dragging = false;
        let startX, startY, startLeft, startTop;

        function startDrag(e) {
            if (editorOpen) return;
            if (!activeConfig.editMode || btnConfig.locked) return;
            e.preventDefault();
            e.stopPropagation();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            startX = clientX;
            startY = clientY;
            startLeft = btnConfig.left;
            startTop = btnConfig.top;
            dragging = true;
            btn.style.cursor = 'grabbing';
            const onDragMove = (ev) => {
                if (!dragging || editorOpen) return;
                ev.preventDefault();
                const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
                const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
                requestAnimationFrame(() => {
                    let newLeft = startLeft + cx - startX;
                    let newTop = startTop + cy - startY;
                    const aligned = alignButtonPosition(btnConfig, newLeft, newTop, btnConfig.id, activeConfig);
                    newLeft = aligned.left;
                    newTop = aligned.top;
                    btn.style.left = newLeft + 'px';
                    btn.style.top = newTop + 'px';
                    btnConfig.left = newLeft;
                    btnConfig.top = newTop;
                });
            };
            const stopDrag = () => {
                if (dragging) {
                    dragging = false;
                    btn.style.cursor = activeConfig.editMode ? 'move' : 'pointer';
                    saveActiveProfile();
                }
                document.removeEventListener('mousemove', onDragMove);
                document.removeEventListener('touchmove', onDragMove);
                document.removeEventListener('mouseup', stopDrag);
                document.removeEventListener('touchend', stopDrag);
            };
            document.addEventListener('mousemove', onDragMove);
            document.addEventListener('touchmove', onDragMove, { passive: false });
            document.addEventListener('mouseup', stopDrag);
            document.addEventListener('touchend', stopDrag);
        }

        btn.addEventListener('mousedown', startDrag);
        btn.addEventListener('touchstart', startDrag, { passive: false });

        // 双击编辑
        function handleDoubleClick(e) {
            if (!activeConfig.editMode) return;
            e.preventDefault();
            e.stopPropagation();
            if (currentEditingButtonId === btnConfig.id) {
                hideButtonEditor();
            } else {
                showButtonEditor(btnConfig.id);
            }
        }
        btn.addEventListener('dblclick', handleDoubleClick);
        btn.addEventListener('touchend', (e) => {
            if (!activeConfig.editMode) return;
            const now = Date.now();
            if (lastClickButtonId === btnConfig.id && now - lastClickTime < activeConfig.doubleClickSpeed) {
                handleDoubleClick(e);
            }
            lastClickTime = now;
            lastClickButtonId = btnConfig.id;
        });

        // 长按
        let longPressTimer = null;
        btn.addEventListener('touchstart', (e) => {
            if (activeConfig.editMode) return;
            longPressTimer = setTimeout(() => {
                if (!activeConfig.editMode && !btnConfig.locked) {
                    e.preventDefault();
                    beep();
                }
            }, activeConfig.longPressTime);
        }, { passive: true });
        btn.addEventListener('touchend', () => clearTimeout(longPressTimer));
        btn.addEventListener('touchcancel', () => clearTimeout(longPressTimer));

        // 按键事件
        function pressHandler(e) {
            if (activeConfig.editMode || btnConfig.locked) return;
            e.preventDefault();
            const key = btn.dataset.key,
                code = btn.dataset.code;
            if (!key) return;
            const current = pressCount[key] || 0;
            if (current === 0) {
                sendKey('keydown', key, code);
                btn.style.transform = 'scale(0.9)';
                btn.style.background = btnConfig.pressedBg;
                beep();

                if (activeConfig.turboEnabled) {
                    if (turboIntervals[key]) clearTimeout(turboIntervals[key]);
                    const turbo = () => {
                        sendKey('keydown', key, code);
                        sendKey('keyup', key, code);
                    };
                    turbo();
                    const next = () => {
                        if (pressCount[key] > 0) {
                            turbo();
                            turboIntervals[key] = setTimeout(next, getRandomTurboInterval(activeConfig));
                        }
                    };
                    turboIntervals[key] = setTimeout(next, getRandomTurboInterval(activeConfig));
                }
            }
            pressCount[key] = current + 1;
        }

        function releaseHandler(e) {
            if (activeConfig.editMode || btnConfig.locked) return;
            e.preventDefault();
            const key = btn.dataset.key;
            if (!key || !(key in pressCount)) return;
            const newCount = pressCount[key] - 1;
            if (newCount <= 0) {
                delete pressCount[key];
                sendKey('keyup', key, btn.dataset.code);
                btn.style.transform = 'scale(1)';
                btn.style.background = btnConfig.bg;
                if (turboIntervals[key]) {
                    clearTimeout(turboIntervals[key]);
                    delete turboIntervals[key];
                }
            } else pressCount[key] = newCount;
        }

        btn.addEventListener('touchstart', pressHandler, { passive: false });
        btn.addEventListener('touchend', releaseHandler);
        btn.addEventListener('touchcancel', releaseHandler);
        btn.addEventListener('mousedown', (e) => {
            if (activeConfig.editMode || btnConfig.locked) return;
            e.preventDefault();
            if (activeMouseKey) {
                const old = document.querySelector(`[data-key="${activeMouseKey}"]`);
                if (old) { old.style.transform = 'scale(1)';
                    old.style.background = btnConfig.bg; }
                delete pressCount[activeMouseKey];
                sendKey('keyup', activeMouseKey, activeMouseKey === ' ' ? 'Space' : activeMouseKey);
            }
            pressHandler(e);
            activeMouseKey = btn.dataset.key;
            document.addEventListener('mouseup', () => {
                if (activeMouseKey) {
                    const b = document.querySelector(`[data-key="${activeMouseKey}"]`);
                    if (b) { b.style.transform = 'scale(1)';
                        b.style.background = btnConfig.bg; }
                    delete pressCount[activeMouseKey];
                    sendKey('keyup', activeMouseKey, activeMouseKey === ' ' ? 'Space' : activeMouseKey);
                    activeMouseKey = null;
                }
            }, { once: true });
        });

        return btn;
    }

    function rebuildButtons() {
        const container = getButtonContainer();
        container.innerHTML = '';
        activeConfig.buttons.forEach(btnConfig => {
            container.appendChild(createButtonElement(btnConfig));
        });
    }

    // ============================================================
    // 7. 按钮编辑器
    // ============================================================

    function showButtonEditor(buttonId) {
        hideButtonEditor();
        const btnConfig = activeConfig.buttons.find(b => b.id === buttonId);
        if (!btnConfig) return;
        currentEditingButtonId = buttonId;
        editorOpen = true;

        document.querySelectorAll('.gamepad-btn').forEach(btn => {
            btn.dataset.editing = 'true';
        });

        const editor = document.createElement('div');
        editor.id = 'button-editor';
        editor.style.cssText = `
            position: fixed;
            background: #333;
            color: white;
            padding: 16px;
            border-radius: 16px;
            box-shadow: 0 10px 20px black;
            border: 1px solid #555;
            z-index: 20001;
            min-width: 280px;
            max-width: 90vw;
            max-height: 80vh;
            overscroll-behavior: contain;
            font-family: system-ui;
            backdrop-filter: blur(8px);
            display: flex;
            flex-direction: column;
        `;

        editor.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: false });
        editor.addEventListener('keydown', (e) => e.stopPropagation(), true);
        editor.addEventListener('keyup', (e) => e.stopPropagation(), true);

        // 标题栏（可拖拽）
        const titleBar = document.createElement('div');
        titleBar.style.cssText = `
            background: #444;
            margin: -16px -16px 12px -16px;
            padding: 8px 16px;
            border-radius: 16px 16px 0 0;
            font-weight: bold;
            text-align: center;
            cursor: move;
            flex-shrink: 0;
        `;
        titleBar.textContent = '编辑按钮';
        editor.appendChild(titleBar);

        let dragStartX, dragStartY, dragStartLeft, dragStartTop, dragging = false;
        function startDragEditor(e) {
            e.preventDefault();
            e.stopPropagation();
            const rect = editor.getBoundingClientRect();
            dragStartLeft = rect.left;
            dragStartTop = rect.top;
            dragStartX = e.touches ? e.touches[0].clientX : e.clientX;
            dragStartY = e.touches ? e.touches[0].clientY : e.clientY;
            dragging = true;
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
            const onDrag = (ev) => {
                if (!dragging) return;
                ev.preventDefault();
                const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
                const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
                requestAnimationFrame(() => {
                    editor.style.left = (dragStartLeft + cx - dragStartX) + 'px';
                    editor.style.top = (dragStartTop + cy - dragStartY) + 'px';
                    updateConnectorLine(buttonId, editor);
                });
            };
            const stopDrag = () => {
                if (dragging) {
                    dragging = false;
                    document.body.style.overflow = '';
                    document.documentElement.style.overflow = '';
                }
                document.removeEventListener('mousemove', onDrag);
                document.removeEventListener('touchmove', onDrag);
                document.removeEventListener('mouseup', stopDrag);
                document.removeEventListener('touchend', stopDrag);
            };
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('touchmove', onDrag, { passive: false });
            document.addEventListener('mouseup', stopDrag);
            document.addEventListener('touchend', stopDrag);
        }
        titleBar.addEventListener('mousedown', startDragEditor);
        titleBar.addEventListener('touchstart', startDragEditor, { passive: false });

        // 内容
        const content = document.createElement('div');
        content.style.cssText = `
            flex: 1;
            overflow-y: auto;
            min-height: 0;
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;

        content.innerHTML = `
            <div style="border-bottom:1px solid #555; padding-bottom:4px;"><b>尺寸</b></div>
            <div style="display:flex; gap:8px;">
                <label>宽: <input type="range" min="30" max="200" value="${btnConfig.width}" id="editor-width" style="width:80px;"></label>
                <label>高: <input type="range" min="30" max="200" value="${btnConfig.height}" id="editor-height" style="width:80px;"></label>
            </div>
            <div style="border-bottom:1px solid #555; padding-bottom:4px;"><b>颜色</b></div>
            <div><label>背景色: <input type="color" id="editor-bg" value="${btnConfig.bg.startsWith('#') ? btnConfig.bg : '#ffffff'}"></label></div>
            <div><label>按下色: <input type="color" id="editor-pressedBg" value="${btnConfig.pressedBg.startsWith('#') ? btnConfig.pressedBg : '#ffffff'}"></label></div>
            <div><label>透明度: <input type="range" min="0.1" max="1" step="0.1" value="${btnConfig.opacity}" id="editor-opacity" style="width:100%;"></label></div>
            <div style="border-bottom:1px solid #555; padding-bottom:4px;"><b>外观</b></div>
            <div><label>圆角: <input type="range" min="0" max="50" value="${btnConfig.borderRadius || (btnConfig.type === 'action' ? 12 : 50)}" id="editor-radius" style="width:100%;"></label></div>
            <div><label>文字颜色: <input type="color" id="editor-textColor" value="${btnConfig.textColor || '#ffffff'}"></label></div>
            <div><label>字体大小: <input type="number" min="0" max="100" value="${btnConfig.fontSize || 0}" id="editor-fontSize" style="width:80px;"> (0=自动比例)</label></div>
            <div><label>边框宽度: <input type="range" min="0" max="10" step="0.5" value="${btnConfig.borderWidth || 1}" id="editor-borderWidth" style="width:100%;"></label></div>
            <div><label>边框颜色: <input type="color" id="editor-borderColor" value="${btnConfig.borderColor ? (btnConfig.borderColor.startsWith('#') ? btnConfig.borderColor : '#ffffff') : '#ffffff'}"></label></div>
            <div><label>阴影: <select id="editor-shadow">
                <option value="default" ${btnConfig.boxShadow === DEFAULT_BUTTON.boxShadow ? 'selected' : ''}>默认</option>
                <option value="none" ${!btnConfig.boxShadow || btnConfig.boxShadow === 'none' ? 'selected' : ''}>无</option>
                <option value="custom" ${btnConfig.boxShadow && btnConfig.boxShadow !== DEFAULT_BUTTON.boxShadow && btnConfig.boxShadow !== 'none' ? 'selected' : ''}>自定义</option>
            </select></label></div>
            <div id="shadow-custom-container" style="display:none;"><input type="text" id="editor-shadowCustom" value="${btnConfig.boxShadow && btnConfig.boxShadow !== 'none' ? btnConfig.boxShadow : ''}" placeholder="例如 0 4px 0 rgba(0,0,0,0.3)" style="width:100%; background:#222; color:white; border:1px solid #555;"></div>
            <div style="border-bottom:1px solid #555; padding-bottom:4px;"><b>映射</b></div>
            <div><label>按键: <input type="text" id="editor-key" value="${btnConfig.key}" style="width:100%; background:#222; color:white; border:1px solid #555; padding:4px;"></label></div>
            <div><label>显示: <input type="text" id="editor-text" value="${btnConfig.text}" style="width:100%; background:#222; color:white; border:1px solid #555; padding:4px;"></label></div>
            <div style="border-bottom:1px solid #555; padding-bottom:4px;"><b>其他</b></div>
            <div><label><input type="checkbox" id="editor-locked" ${btnConfig.locked ? 'checked' : ''}> 锁定位置</label></div>
            <div style="display:flex; gap:8px; margin-top:4px;">
                <button id="editor-reset" style="flex:1; background:#FF9800; border:none; border-radius:8px; color:white; padding:6px;">恢复默认</button>
                <button id="editor-delete" style="flex:1; background:#f44336; border:none; border-radius:8px; color:white; padding:6px;">删除</button>
            </div>
            <div style="display:flex; gap:8px;">
                <button id="editor-close" style="flex:2; background:#2196F3; border:none; border-radius:8px; color:white; padding:8px;">关闭</button>
            </div>
        `;
        editor.appendChild(content);
        document.body.appendChild(editor);

        // 定位编辑器
        const btnElement = document.querySelector(`.gamepad-btn[data-id="${buttonId}"]`);
        if (btnElement) {
            const btnRect = btnElement.getBoundingClientRect();
            let left = btnRect.right + 20;
            let top = btnRect.top;
            if (left + 300 > window.innerWidth) left = btnRect.left - 300 - 20;
            if (top + 500 > window.innerHeight) top = window.innerHeight - 500 - 10;
            editor.style.left = Math.max(10, left) + 'px';
            editor.style.top = Math.max(10, top) + 'px';
        } else {
            editor.style.left = '50px';
            editor.style.top = '50px';
        }

        // 连接线
        const line = document.createElement('div');
        line.id = 'connector-line';
        line.style.cssText = `
            position: fixed;
            height: 2px;
            background: #ffaa00;
            transform-origin: left center;
            z-index: 20000;
            pointer-events: none;
            box-shadow: 0 0 4px #ffaa00;
        `;
        document.body.appendChild(line);
        connectorLine = line;
        updateConnectorLine(buttonId, editor);

        // 阻止事件穿透
        const inputs = editor.querySelectorAll('input, button, select');
        inputs.forEach(inp => {
            inp.addEventListener('mousedown', (e) => e.stopPropagation());
            inp.addEventListener('touchstart', (e) => e.stopPropagation());
        });

        // 绑定控件事件
        const widthInput = editor.querySelector('#editor-width');
        const heightInput = editor.querySelector('#editor-height');
        const bgInput = editor.querySelector('#editor-bg');
        const pressedBgInput = editor.querySelector('#editor-pressedBg');
        const opacityInput = editor.querySelector('#editor-opacity');
        const radiusInput = editor.querySelector('#editor-radius');
        const textColorInput = editor.querySelector('#editor-textColor');
        const fontSizeInput = editor.querySelector('#editor-fontSize');
        const borderWidthInput = editor.querySelector('#editor-borderWidth');
        const borderColorInput = editor.querySelector('#editor-borderColor');
        const shadowSelect = editor.querySelector('#editor-shadow');
        const shadowCustomContainer = editor.querySelector('#shadow-custom-container');
        const shadowCustomInput = editor.querySelector('#editor-shadowCustom');
        const keyInput = editor.querySelector('#editor-key');
        const textInput = editor.querySelector('#editor-text');
        const lockedCheck = editor.querySelector('#editor-locked');
        const resetBtn = editor.querySelector('#editor-reset');
        const deleteBtn = editor.querySelector('#editor-delete');
        const closeBtn = editor.querySelector('#editor-close');

        const updateBtn = (props) => {
            updateButtonElement(buttonId, props);
            saveActiveProfile();
        };

        shadowSelect.addEventListener('change', () => {
            if (shadowSelect.value === 'custom') {
                shadowCustomContainer.style.display = 'block';
            } else {
                shadowCustomContainer.style.display = 'none';
                let shadowValue = shadowSelect.value === 'none' ? 'none' : DEFAULT_BUTTON.boxShadow;
                btnConfig.boxShadow = shadowValue;
                updateBtn({ boxShadow: shadowValue });
            }
        });
        if (shadowSelect.value === 'custom') shadowCustomContainer.style.display = 'block';

        shadowCustomInput.addEventListener('input', () => {
            btnConfig.boxShadow = shadowCustomInput.value || 'none';
            updateBtn({ boxShadow: btnConfig.boxShadow });
        });

        widthInput.addEventListener('input', (e) => {
            btnConfig.width = +e.target.value;
            updateBtn({ width: btnConfig.width });
            updateConnectorLine(buttonId, editor);
        });
        heightInput.addEventListener('input', (e) => {
            btnConfig.height = +e.target.value;
            updateBtn({ height: btnConfig.height });
            updateConnectorLine(buttonId, editor);
        });
        bgInput.addEventListener('input', (e) => {
            btnConfig.bg = e.target.value;
            updateBtn({ bg: btnConfig.bg });
        });
        pressedBgInput.addEventListener('input', (e) => {
            btnConfig.pressedBg = e.target.value;
            saveActiveProfile();
        });
        opacityInput.addEventListener('input', (e) => {
            btnConfig.opacity = +e.target.value;
            updateBtn({ opacity: btnConfig.opacity });
        });
        radiusInput.addEventListener('input', (e) => {
            btnConfig.borderRadius = +e.target.value;
            updateBtn({ borderRadius: btnConfig.borderRadius });
        });
        textColorInput.addEventListener('input', (e) => {
            btnConfig.textColor = e.target.value;
            updateBtn({ textColor: btnConfig.textColor });
        });
        fontSizeInput.addEventListener('input', (e) => {
            btnConfig.fontSize = +e.target.value;
            updateBtn({ fontSize: btnConfig.fontSize });
        });
        borderWidthInput.addEventListener('input', (e) => {
            btnConfig.borderWidth = +e.target.value;
            updateBtn({ borderWidth: btnConfig.borderWidth });
        });
        borderColorInput.addEventListener('input', (e) => {
            btnConfig.borderColor = e.target.value;
            updateBtn({ borderColor: btnConfig.borderColor });
        });
        keyInput.addEventListener('input', (e) => {
            btnConfig.key = e.target.value;
            btnConfig.code = getKeyCode(btnConfig.key);
            updateBtn({ key: btnConfig.key });
        });
        textInput.addEventListener('input', (e) => {
            btnConfig.text = e.target.value;
            const btnEl = document.querySelector(`.gamepad-btn[data-id="${buttonId}"]`);
            if (btnEl) btnEl.textContent = e.target.value;
            saveActiveProfile();
        });
        lockedCheck.addEventListener('change', (e) => {
            btnConfig.locked = e.target.checked;
            updateBtn({ locked: btnConfig.locked });
        });

        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const defaultBtn = DEFAULT_PROFILE.buttons.find(b => b.id === btnConfig.id);
            if (defaultBtn) {
                Object.assign(btnConfig, JSON.parse(JSON.stringify(defaultBtn)));
                // 更新UI控件
                widthInput.value = btnConfig.width;
                heightInput.value = btnConfig.height;
                bgInput.value = btnConfig.bg.startsWith('#') ? btnConfig.bg : '#ffffff';
                pressedBgInput.value = btnConfig.pressedBg.startsWith('#') ? btnConfig.pressedBg : '#ffffff';
                opacityInput.value = btnConfig.opacity;
                radiusInput.value = btnConfig.borderRadius || (btnConfig.type === 'action' ? 12 : 50);
                textColorInput.value = btnConfig.textColor;
                fontSizeInput.value = btnConfig.fontSize;
                borderWidthInput.value = btnConfig.borderWidth;
                borderColorInput.value = btnConfig.borderColor.startsWith('#') ? btnConfig.borderColor : '#ffffff';
                keyInput.value = btnConfig.key;
                textInput.value = btnConfig.text;
                lockedCheck.checked = btnConfig.locked;
                shadowSelect.value = btnConfig.boxShadow === DEFAULT_BUTTON.boxShadow ? 'default' : (btnConfig.boxShadow === 'none' ? 'none' : 'custom');
                if (shadowSelect.value === 'custom') {
                    shadowCustomContainer.style.display = 'block';
                    shadowCustomInput.value = btnConfig.boxShadow;
                } else {
                    shadowCustomContainer.style.display = 'none';
                }
                updateBtn({
                    width: btnConfig.width, height: btnConfig.height, bg: btnConfig.bg,
                    opacity: btnConfig.opacity, borderRadius: btnConfig.borderRadius,
                    textColor: btnConfig.textColor, fontSize: btnConfig.fontSize,
                    borderWidth: btnConfig.borderWidth, borderColor: btnConfig.borderColor,
                    boxShadow: btnConfig.boxShadow, key: btnConfig.key, locked: btnConfig.locked
                });
                saveActiveProfile();
            }
        });

        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('确定删除此按钮吗？')) {
                activeConfig.buttons = activeConfig.buttons.filter(b => b.id !== buttonId);
                saveActiveProfile();
                rebuildButtons();
                hideButtonEditor();
            }
        });

        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            hideButtonEditor();
        });

        buttonEditor = editor;
    }

    function updateButtonElement(buttonId, props) {
        const btnEl = document.querySelector(`.gamepad-btn[data-id="${buttonId}"]`);
        if (!btnEl) return;
        const btnConfig = activeConfig.buttons.find(b => b.id === buttonId);
        if (!btnConfig) return;

        if (props.width !== undefined) {
            btnEl.style.width = props.width + 'px';
            if (!btnConfig.fontSize || btnConfig.fontSize === 0) {
                btnEl.style.fontSize = Math.min(props.width, btnConfig.height) * 0.4 + 'px';
            }
        }
        if (props.height !== undefined) {
            btnEl.style.height = props.height + 'px';
            if (!btnConfig.fontSize || btnConfig.fontSize === 0) {
                btnEl.style.fontSize = Math.min(btnConfig.width, props.height) * 0.4 + 'px';
            }
        }
        if (props.bg !== undefined) btnEl.style.background = props.bg;
        if (props.key !== undefined) btnEl.dataset.key = props.key;
        if (props.opacity !== undefined) btnEl.style.opacity = props.opacity;
        if (props.locked !== undefined) {
            btnEl.dataset.locked = props.locked ? 'true' : 'false';
            btnEl.style.cursor = activeConfig.editMode && !props.locked ? 'move' : 'pointer';
        }
        if (props.borderRadius !== undefined) btnEl.style.borderRadius = props.borderRadius + 'px';
        if (props.textColor !== undefined) btnEl.style.color = props.textColor;
        if (props.fontSize !== undefined) {
            if (props.fontSize > 0) {
                btnEl.style.fontSize = props.fontSize + 'px';
            } else {
                btnEl.style.fontSize = Math.min(btnConfig.width, btnConfig.height) * 0.4 + 'px';
            }
        }
        if (props.borderWidth !== undefined) btnEl.style.borderWidth = props.borderWidth + 'px';
        if (props.borderColor !== undefined) btnEl.style.borderColor = props.borderColor;
        if (props.boxShadow !== undefined) btnEl.style.boxShadow = props.boxShadow === 'none' ? 'none' : props.boxShadow;
    }

    function updateConnectorLine(buttonId, editor) {
        if (!connectorLine) return;
        const btnEl = document.querySelector(`.gamepad-btn[data-id="${buttonId}"]`);
        if (!btnEl || !editor) return;
        const btnRect = btnEl.getBoundingClientRect();
        const editorRect = editor.getBoundingClientRect();
        const btnCenter = { x: btnRect.left + btnRect.width / 2, y: btnRect.top + btnRect.height / 2 };
        const editorCenter = { x: editorRect.left + editorRect.width / 2, y: editorRect.top + editorRect.height / 2 };
        const dx = editorCenter.x - btnCenter.x;
        const dy = editorCenter.y - btnCenter.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        connectorLine.style.width = distance + 'px';
        connectorLine.style.left = btnCenter.x + 'px';
        connectorLine.style.top = btnCenter.y + 'px';
        connectorLine.style.transform = `rotate(${angle}deg)`;
    }

    function hideButtonEditor() {
        if (buttonEditor) buttonEditor.remove();
        if (connectorLine) connectorLine.remove();
        buttonEditor = null;
        connectorLine = null;
        document.querySelectorAll('.gamepad-btn').forEach(btn => {
            btn.dataset.editing = 'false';
        });
        currentEditingButtonId = null;
        editorOpen = false;
    }

    // ============================================================
    // 8. 控制条
    // ============================================================

    function createControlBar() {
        const oldBar = document.getElementById('gamepad-control-bar');
        if (oldBar) oldBar.remove();

        const bar = document.createElement('div');
        bar.id = 'gamepad-control-bar';
        bar.style.cssText = `
            position: fixed; top: ${activeConfig.barOffset}px; left: ${activeConfig.barPosition}%;
            transform: translateX(-50%);
            width: ${activeConfig.barWidth}px; height: ${activeConfig.barHeight}px;
            background: ${activeConfig.barColor}; border-radius: 0 0 8px 8px;
            z-index: 10001; cursor: pointer; opacity: 0.7; transition: opacity 0.2s;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        `;
        bar.addEventListener('mouseenter', () => bar.style.opacity = '1');
        bar.addEventListener('mouseleave', () => bar.style.opacity = '0.7');
        bar.addEventListener('click', toggleSettings);
        document.body.appendChild(bar);
    }

    // ============================================================
    // 9. 设置面板
    // ============================================================

    function toggleSettings() {
        if (settingsVisible) {
            document.getElementById('gamepad-settings')?.remove();
            settingsVisible = false;
        } else {
            showSettings();
        }
    }

    let settingsPanel = null;

    function showSettings() {
        if (settingsVisible) return;
        settingsVisible = true;
        hideButtonEditor();

        const panel = document.createElement('div');
        panel.id = 'gamepad-settings';
        panel.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: #2a2a2a; color: white;
            border-radius: 28px;
            z-index: 20000; width: 480px; max-width: 95vw; max-height: 85vh;
            display: flex; flex-direction: column;
            box-shadow: 0 20px 40px black; border: 1px solid #444;
            font-family: system-ui; backdrop-filter: blur(10px);
            padding: 0;
        `;

        panel.addEventListener('touchmove', (e) => {
            const target = e.target;
            const isInteractive = target.matches('input[type="range"], button, input[type="text"], input[type="number"], input[type="color"], select, label');
            if (!isInteractive) e.preventDefault();
        }, { passive: false });

        panel.addEventListener('keydown', (e) => e.stopPropagation(), true);
        panel.addEventListener('keyup', (e) => e.stopPropagation(), true);

        // 标题栏
        const titleBar = document.createElement('div');
        titleBar.style.cssText = `
            cursor: move;
            background: linear-gradient(145deg, #3a3a3a, #2a2a2a);
            padding: 16px 24px;
            border-radius: 28px 28px 0 0;
            font-weight: bold;
            text-align: center;
            user-select: none;
            color: #fff;
            text-shadow: 0 2px 4px rgba(0,0,0,0.5);
            box-shadow: inset 0 -1px 0 #555;
            flex-shrink: 0;
        `;
        titleBar.textContent = 'FastKB 设置';
        panel.appendChild(titleBar);

        // 拖拽
        let dragStartX, dragStartY, dragStartLeft, dragStartTop, dragging = false;
        titleBar.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            e.preventDefault();
            const rect = panel.getBoundingClientRect();
            dragStartLeft = rect.left;
            dragStartTop = rect.top;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            panel.style.transform = 'none';
            panel.style.left = dragStartLeft + 'px';
            panel.style.top = dragStartTop + 'px';
            dragging = true;
            const onDrag = (ev) => {
                if (!dragging) return;
                ev.preventDefault();
                requestAnimationFrame(() => {
                    panel.style.left = (dragStartLeft + ev.clientX - dragStartX) + 'px';
                    panel.style.top = (dragStartTop + ev.clientY - dragStartY) + 'px';
                });
            };
            const stopDrag = () => {
                dragging = false;
                document.removeEventListener('mousemove', onDrag);
                document.removeEventListener('mouseup', stopDrag);
            };
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', stopDrag);
        });
        titleBar.addEventListener('touchstart', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            const touch = e.touches[0];
            const rect = panel.getBoundingClientRect();
            dragStartLeft = rect.left;
            dragStartTop = rect.top;
            dragStartX = touch.clientX;
            dragStartY = touch.clientY;
            panel.style.transform = 'none';
            panel.style.left = dragStartLeft + 'px';
            panel.style.top = dragStartTop + 'px';
            dragging = true;
            const onDrag = (ev) => {
                if (!dragging) return;
                ev.preventDefault();
                const t = ev.touches[0];
                requestAnimationFrame(() => {
                    panel.style.left = (dragStartLeft + t.clientX - dragStartX) + 'px';
                    panel.style.top = (dragStartTop + t.clientY - dragStartY) + 'px';
                });
            };
            const stopDrag = () => {
                dragging = false;
                document.removeEventListener('touchmove', onDrag);
                document.removeEventListener('touchend', stopDrag);
            };
            document.addEventListener('touchmove', onDrag, { passive: false });
            document.addEventListener('touchend', stopDrag);
        }, { passive: false });

        // Tab 栏
        const tabs = ['常规', '按键', '连发', '宏', '高级', '配置', '帮助'];
        let currentTab = '常规';
        const tabContainer = document.createElement('div');
        tabContainer.style.cssText = 'display:flex; gap:6px; margin:12px 20px 16px 20px; flex-wrap:wrap; flex-shrink:0;';
        tabs.forEach(tabName => {
            const tabBtn = document.createElement('button');
            tabBtn.textContent = tabName;
            tabBtn.dataset.tab = tabName;
            tabBtn.style.cssText = `
                flex:1; padding:6px 4px; background:${currentTab === tabName ? '#4caf50' : '#333'}; border:none;
                border-radius:20px; color:white; cursor:pointer; font-size:13px;
                box-shadow: ${currentTab === tabName ? '0 2px 8px rgba(76,175,80,0.4)' : '0 2px 4px rgba(0,0,0,0.3)'};
                transition: all 0.2s;
                min-width: 40px;
            `;
            tabBtn.addEventListener('click', () => {
                currentTab = tabName;
                tabContainer.querySelectorAll('button').forEach(btn => {
                    btn.style.background = btn.dataset.tab === currentTab ? '#4caf50' : '#333';
                    btn.style.boxShadow = btn.dataset.tab === currentTab ? '0 2px 8px rgba(76,175,80,0.4)' : '0 2px 4px rgba(0,0,0,0.3)';
                });
                renderContent();
            });
            tabContainer.appendChild(tabBtn);
        });
        panel.appendChild(tabContainer);

        const contentDiv = document.createElement('div');
        contentDiv.style.cssText = 'flex:1; overflow-y: auto; padding: 0 20px 20px 20px;';
        panel.appendChild(contentDiv);

        // 关闭按钮
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '关闭';
        closeBtn.style.cssText = `
            margin: 0 20px 16px 20px;
            padding: 10px;
            background: #555;
            border: none;
            border-radius: 16px;
            color: white;
            cursor: pointer;
            font-size: 14px;
            flex-shrink: 0;
        `;
        closeBtn.addEventListener('click', () => {
            panel.remove();
            settingsVisible = false;
        });
        panel.appendChild(closeBtn);

        document.body.appendChild(panel);
        settingsPanel = panel;

        function renderContent() {
            contentDiv.innerHTML = '';
            if (currentTab === '常规') renderGeneral(contentDiv);
            else if (currentTab === '按键') renderKeySettings(contentDiv);
            else if (currentTab === '连发') renderTurbo(contentDiv);
            else if (currentTab === '宏') renderMacro(contentDiv);
            else if (currentTab === '高级') renderAdvanced(contentDiv);
            else if (currentTab === '配置') renderProfile(contentDiv);
            else if (currentTab === '帮助') renderHelp(contentDiv);
        }

        function renderGeneral(container) {
            const group1 = document.createElement('div');
            group1.innerHTML = '<div style="font-size:14px; margin-bottom:8px; color:#aaa;">基础</div>';
            const items = [
                ['编辑模式', 'editMode'],
                ['按键声音', 'soundEnabled']
            ];
            items.forEach(([label, prop]) => {
                const div = document.createElement('div');
                div.style.marginBottom = '10px';
                div.innerHTML = `<label style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" id="${prop}" ${activeConfig[prop] ? 'checked' : ''}> <span>${label}</span>
                </label>`;
                group1.appendChild(div);
                div.querySelector('input').addEventListener('change', (e) => {
                    activeConfig[prop] = e.target.checked;
                    if (prop === 'editMode') {
                        document.querySelectorAll('.gamepad-btn').forEach(btn => {
                            const locked = btn.dataset.locked === 'true';
                            btn.style.cursor = activeConfig.editMode && !locked ? 'move' : 'pointer';
                        });
                        if (!activeConfig.editMode) hideButtonEditor();
                    }
                    saveActiveProfile();
                });
            });
            container.appendChild(group1);
            container.appendChild(document.createElement('hr')).style.cssText = 'border:0.5px solid #555; margin:12px 0;';

            const group2 = document.createElement('div');
            group2.innerHTML = '<div style="font-size:14px; margin-bottom:8px; color:#aaa;">对齐</div>';
            const alignItems = [
                ['辅助对齐', 'snapAlign'],
                ['边缘吸附', 'snapToEdge']
            ];
            alignItems.forEach(([label, prop]) => {
                const div = document.createElement('div');
                div.style.marginBottom = '10px';
                const hint = prop === 'snapToEdge' ? '<span style="color:#aaa; font-size:12px;">(需先开启辅助对齐)</span>' : '';
                div.innerHTML = `
                    <div style="display:flex; align-items:center; gap:8px;">
                        <input type="checkbox" id="${prop}" ${activeConfig[prop] ? 'checked' : ''}>
                        <span>${label}</span>
                        ${hint}
                    </div>
                `;
                group2.appendChild(div);
                div.querySelector('input').addEventListener('change', (e) => {
                    activeConfig[prop] = e.target.checked;
                    saveActiveProfile();
                });
            });
            const alignSlider = document.createElement('div');
            alignSlider.style.marginBottom = '12px';
            alignSlider.innerHTML = `
                <div style="display:flex; justify-content:space-between;">
                    <span>对齐阈值</span><span id="alignThreshold-val">${activeConfig.alignThreshold}px</span>
                </div>
                <input type="range" id="alignThreshold" min="5" max="50" value="${activeConfig.alignThreshold}" style="width:100%;">
            `;
            group2.appendChild(alignSlider);
            const alignInput = alignSlider.querySelector('input');
            const alignSpan = alignSlider.querySelector('span:last-child');
            alignInput.addEventListener('input', (e) => {
                activeConfig.alignThreshold = +e.target.value;
                alignSpan.textContent = activeConfig.alignThreshold + 'px';
                saveActiveProfile();
            });
            container.appendChild(group2);
            container.appendChild(document.createElement('hr')).style.cssText = 'border:0.5px solid #555; margin:12px 0;';

            const group3 = document.createElement('div');
            group3.innerHTML = '<div style="font-size:14px; margin-bottom:8px; color:#aaa;">控制条</div>';
            const sliders = [
                ['宽度', 'barWidth', 40, 200],
                ['高度', 'barHeight', 0, 30],
                ['垂直偏移', 'barOffset', 0, 50, 'px'],
                ['水平位置(%)', 'barPosition', 0, 100, '%']
            ];
            sliders.forEach(([label, prop, min, max, unit = 'px']) => {
                const div = document.createElement('div');
                div.style.marginBottom = '12px';
                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between;">
                        <span>${label}</span><span id="${prop}-val">${activeConfig[prop]}${unit}</span>
                    </div>
                    <input type="range" id="${prop}" min="${min}" max="${max}" value="${activeConfig[prop]}" style="width:100%;">
                `;
                group3.appendChild(div);
                const input = div.querySelector('input');
                const span = div.querySelector('span:last-child');
                input.addEventListener('input', (e) => {
                    activeConfig[prop] = +e.target.value;
                    span.textContent = activeConfig[prop] + unit;
                    if (prop.startsWith('bar')) createControlBar();
                    saveActiveProfile();
                });
            });
            const colorDiv = document.createElement('div');
            colorDiv.style.marginBottom = '12px';
            colorDiv.innerHTML = `
                <div>颜色</div>
                <input type="color" id="barColor" value="${activeConfig.barColor}">
            `;
            group3.appendChild(colorDiv);
            colorDiv.querySelector('input').addEventListener('input', (e) => {
                activeConfig.barColor = e.target.value;
                createControlBar();
                saveActiveProfile();
            });
            container.appendChild(group3);
        }

        function renderKeySettings(container) {
            const addBtn = document.createElement('button');
            addBtn.textContent = '+ 添加按键';
            addBtn.style.cssText = 'width:100%; padding:8px; background:#4caf50; border:none; border-radius:12px; color:white; margin-bottom:12px;';
            addBtn.addEventListener('click', () => {
                const newId = 'custom' + Date.now();
                activeConfig.buttons.push({
                    id: newId,
                    text: '新',
                    key: '',
                    code: '',
                    type: 'action',
                    left: 100,
                    top: 100,
                    width: 65,
                    height: 65,
                    bg: 'rgba(255,255,255,0.15)',
                    pressedBg: 'rgba(255,255,255,0.4)',
                    opacity: 1.0,
                    locked: false,
                    textColor: '#ffffff',
                    fontSize: 0,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.15)',
                    boxShadow: '0 4px 0 rgba(0,0,0,0.3), 0 6px 12px rgba(0,0,0,0.4)',
                    borderRadius: 12
                });
                saveActiveProfile();
                rebuildButtons();
                setTimeout(() => showButtonEditor(newId), 100);
            });
            container.appendChild(addBtn);
            container.appendChild(document.createElement('hr')).style.cssText = 'border:0.5px solid #555; margin:8px 0;';

            activeConfig.buttons.forEach((btn, idx) => {
                const row = document.createElement('div');
                row.style.cssText = 'background:#333; padding:8px; border-radius:8px; margin-bottom:6px;';
                row.innerHTML = `
                    <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap;">
                        <span style="width:30px;">${btn.text}</span>
                        <input type="text" class="key-input" value="${btn.key}" style="width:70px; background:#222; color:white; border:1px solid #555; padding:4px; border-radius:6px;">
                        <input type="number" class="width-input" value="${btn.width}" min="30" max="200" style="width:55px; background:#222; color:white; border:1px solid #555; padding:4px; border-radius:6px;" placeholder="宽">
                        <input type="number" class="height-input" value="${btn.height}" min="30" max="200" style="width:55px; background:#222; color:white; border:1px solid #555; padding:4px; border-radius:6px;" placeholder="高">
                        <input type="color" class="color-input" value="${btn.bg.startsWith('#') ? btn.bg : '#ffffff'}" style="width:36px; height:28px;">
                        <input type="number" class="opacity-input" value="${btn.opacity}" min="0.1" max="1" step="0.1" style="width:50px; background:#222; color:white; border:1px solid #555; padding:4px; border-radius:6px;">
                        <label style="color:#aaa; font-size:12px;"><input type="checkbox" class="locked-check" ${btn.locked ? 'checked' : ''}>锁</label>
                        <button class="remove-btn" style="background:#f44336; border:none; border-radius:6px; color:white; padding:2px 8px; font-size:12px;">✕</button>
                    </div>
                `;
                container.appendChild(row);

                row.querySelector('.key-input').addEventListener('input', (e) => {
                    btn.key = e.target.value;
                    btn.code = getKeyCode(btn.key);
                    updateButtonElement(btn.id, { key: btn.key });
                    saveActiveProfile();
                });
                row.querySelector('.width-input').addEventListener('input', (e) => {
                    btn.width = +e.target.value;
                    updateButtonElement(btn.id, { width: btn.width });
                    saveActiveProfile();
                });
                row.querySelector('.height-input').addEventListener('input', (e) => {
                    btn.height = +e.target.value;
                    updateButtonElement(btn.id, { height: btn.height });
                    saveActiveProfile();
                });
                row.querySelector('.color-input').addEventListener('input', (e) => {
                    btn.bg = e.target.value;
                    updateButtonElement(btn.id, { bg: btn.bg });
                    saveActiveProfile();
                });
                row.querySelector('.opacity-input').addEventListener('input', (e) => {
                    btn.opacity = +e.target.value;
                    updateButtonElement(btn.id, { opacity: btn.opacity });
                    saveActiveProfile();
                });
                row.querySelector('.locked-check').addEventListener('change', (e) => {
                    btn.locked = e.target.checked;
                    updateButtonElement(btn.id, { locked: btn.locked });
                    saveActiveProfile();
                });
                row.querySelector('.remove-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm('删除此按钮？')) {
                        activeConfig.buttons.splice(idx, 1);
                        saveActiveProfile();
                        rebuildButtons();
                        renderKeySettings(container);
                    }
                });
            });
        }

        function renderTurbo(container) {
            const div = document.createElement('div');
            div.innerHTML = `
                <label style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                    <input type="checkbox" id="turboEnabled" ${activeConfig.turboEnabled ? 'checked' : ''}> 启用连发
                </label>
                <div style="margin-bottom:10px;">CPS (每秒次数): <input type="number" id="turboCPS" value="${activeConfig.turboCPS}" min="1" max="50" style="width:80px; background:#222; color:white; border:1px solid #555; padding:4px;"></div>
                <div style="margin-bottom:10px;">随机偏移(ms): <input type="number" id="turboRandom" value="${activeConfig.turboRandom}" min="0" max="200" style="width:80px; background:#222; color:white; border:1px solid #555; padding:4px;"></div>
                <p style="font-size:12px; color:#aaa;">随机偏移使连发更自然，防检测。</p>
            `;
            container.appendChild(div);

            div.querySelector('#turboEnabled').addEventListener('change', (e) => {
                activeConfig.turboEnabled = e.target.checked;
                saveActiveProfile();
            });
            div.querySelector('#turboCPS').addEventListener('input', (e) => {
                activeConfig.turboCPS = +e.target.value;
                saveActiveProfile();
            });
            div.querySelector('#turboRandom').addEventListener('input', (e) => {
                activeConfig.turboRandom = +e.target.value;
                saveActiveProfile();
            });
        }

        function renderMacro(container) {
            container.innerHTML = '';

            const controlRow = document.createElement('div');
            controlRow.style.cssText = 'display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap;';
            controlRow.innerHTML = `
                <button id="macro-record" style="flex:2; background:#2196F3; border:none; border-radius:12px; color:white; padding:8px;">${macroRecording ? '停止录制' : '开始录制'}</button>
                <button id="macro-play" style="flex:1; background:#FF9800; border:none; border-radius:12px; color:white; padding:8px;">播放</button>
                <button id="macro-stop" style="flex:1; background:#f44336; border:none; border-radius:12px; color:white; padding:8px;">停止</button>
            `;
            container.appendChild(controlRow);

            const loopDiv = document.createElement('div');
            loopDiv.style.margin = '6px 0 12px';
            loopDiv.innerHTML = `
                <label style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" id="macro-loop" ${activeConfig.macroLoopEnabled ? 'checked' : ''}> 循环播放
                </label>
            `;
            container.appendChild(loopDiv);

            const stepsHeader = document.createElement('div');
            stepsHeader.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin:8px 0 6px;';
            stepsHeader.innerHTML = `
                <span style="font-weight:bold;">宏步骤 (${(activeConfig.macroSteps || []).length})</span>
                <div>
                    <button id="macro-clear-all" style="background:#f44336; border:none; border-radius:20px; color:white; padding:2px 12px; font-size:12px; margin-right:6px;">清空</button>
                    <button id="macro-add-step" style="background:#4caf50; border:none; border-radius:20px; color:white; padding:2px 12px; font-size:12px;">+添加</button>
                </div>
            `;
            container.appendChild(stepsHeader);

            const stepsList = document.createElement('div');
            stepsList.id = 'macro-steps-list';
            stepsList.style.cssText = 'max-height:200px; overflow-y:auto; background:#222; border-radius:12px; padding:6px;';
            container.appendChild(stepsList);

            const steps = activeConfig.macroSteps || [];
            renderStepList(stepsList, steps);

            const recordBtn = controlRow.querySelector('#macro-record');
            const playBtn = controlRow.querySelector('#macro-play');
            const stopBtn = controlRow.querySelector('#macro-stop');
            const loopCheck = loopDiv.querySelector('#macro-loop');
            const clearAllBtn = stepsHeader.querySelector('#macro-clear-all');
            const addBtn = stepsHeader.querySelector('#macro-add-step');

            recordBtn.addEventListener('click', () => {
                if (!macroRecording) {
                    if (activeConfig.macroSteps && activeConfig.macroSteps.length > 0) {
                        if (!confirm('已有宏步骤，是否覆盖？')) return;
                    }
                    if (macroPlaying) stopMacro();
                    macroRecording = true;
                    macroSteps = [];
                    macroStartTime = Date.now();
                    recordBtn.textContent = '停止录制';
                    document.addEventListener('keydown', macroRecordHandler);
                    document.addEventListener('keyup', macroRecordHandler);
                } else {
                    stopMacroRecording();
                    recordBtn.textContent = '开始录制';
                    renderStepList(stepsList, activeConfig.macroSteps);
                }
            });

            playBtn.addEventListener('click', () => {
                if (macroPlaying) stopMacro();
                playMacro(activeConfig.macroSteps || [], activeConfig.macroLoopEnabled);
            });

            stopBtn.addEventListener('click', stopMacro);

            loopCheck.addEventListener('change', (e) => {
                activeConfig.macroLoopEnabled = e.target.checked;
                saveActiveProfile();
            });

            clearAllBtn.addEventListener('click', () => {
                if (confirm('确定清空所有宏步骤吗？')) {
                    activeConfig.macroSteps = [];
                    saveActiveProfile();
                    renderStepList(stepsList, []);
                }
            });

            addBtn.addEventListener('click', () => {
                const newStep = { delay: 100, action: 'down', key: 'a', code: 'KeyA' };
                activeConfig.macroSteps.push(newStep);
                saveActiveProfile();
                renderStepList(stepsList, activeConfig.macroSteps);
            });

            function renderStepList(listContainer, steps) {
                listContainer.innerHTML = '';
                if (!steps || steps.length === 0) {
                    listContainer.innerHTML = '<div style="text-align:center; color:#888; padding:12px;">暂无步骤</div>';
                    return;
                }
                steps.forEach((step, index) => {
                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex; gap:4px; align-items:center; margin-bottom:4px; background:#333; padding:4px 6px; border-radius:6px; flex-wrap:wrap;';
                    row.innerHTML = `
                        <span style="min-width:20px; color:#aaa; font-size:12px;">${index+1}</span>
                        <input type="number" class="step-delay" value="${step.delay}" min="0" max="5000" step="10" style="width:60px; background:#222; color:white; border:1px solid #555; padding:2px 4px; border-radius:4px; font-size:12px;" title="延迟(ms)">
                        <select class="step-action" style="width:60px; background:#222; color:white; border:1px solid #555; padding:2px 4px; border-radius:4px; font-size:12px;">
                            <option value="down" ${step.action==='down'?'selected':''}>按下</option>
                            <option value="up" ${step.action==='up'?'selected':''}>抬起</option>
                        </select>
                        <input type="text" class="step-key" value="${step.key}" style="width:50px; background:#222; color:white; border:1px solid #555; padding:2px 4px; border-radius:4px; font-size:12px;" placeholder="键">
                        <button class="step-delete" style="background:#f44336; border:none; border-radius:4px; color:white; padding:0 6px; font-size:12px;">✕</button>
                        <button class="step-up" ${index===0?'disabled':''} style="background:#555; border:none; border-radius:4px; color:white; padding:0 6px; font-size:12px;">↑</button>
                        <button class="step-down" ${index===steps.length-1?'disabled':''} style="background:#555; border:none; border-radius:4px; color:white; padding:0 6px; font-size:12px;">↓</button>
                    `;
                    listContainer.appendChild(row);

                    row.querySelector('.step-delay').addEventListener('input', function() {
                        step.delay = parseInt(this.value) || 0;
                        saveActiveProfile();
                    });
                    row.querySelector('.step-action').addEventListener('change', function() {
                        step.action = this.value;
                        saveActiveProfile();
                    });
                    row.querySelector('.step-key').addEventListener('input', function() {
                        step.key = this.value;
                        step.code = getKeyCode(step.key);
                        saveActiveProfile();
                    });
                    row.querySelector('.step-delete').addEventListener('click', () => {
                        activeConfig.macroSteps.splice(index, 1);
                        saveActiveProfile();
                        renderStepList(listContainer, activeConfig.macroSteps);
                    });
                    row.querySelector('.step-up').addEventListener('click', () => {
                        if (index > 0) {
                            [activeConfig.macroSteps[index - 1], activeConfig.macroSteps[index]] = [activeConfig.macroSteps[index], activeConfig.macroSteps[index - 1]];
                            saveActiveProfile();
                            renderStepList(listContainer, activeConfig.macroSteps);
                        }
                    });
                    row.querySelector('.step-down').addEventListener('click', () => {
                        if (index < steps.length - 1) {
                            [activeConfig.macroSteps[index], activeConfig.macroSteps[index + 1]] = [activeConfig.macroSteps[index + 1], activeConfig.macroSteps[index]];
                            saveActiveProfile();
                            renderStepList(listContainer, activeConfig.macroSteps);
                        }
                    });
                });
            }
        }

        function renderAdvanced(container) {
            const group1 = document.createElement('div');
            group1.innerHTML = '<div style="font-size:14px; margin-bottom:8px; color:#aaa;">系统</div>';
            const advancedItems = [
                ['屏蔽系统按键', 'blockKeys', '阻止某些按键影响游戏'],
                ['游戏模式', 'gameMode', '优化性能，禁用页面滚动']
            ];
            advancedItems.forEach(([label, prop, desc]) => {
                const div = document.createElement('div');
                div.style.marginBottom = '12px';
                div.innerHTML = `
                    <label style="display:flex; align-items:center; gap:8px;">
                        <input type="checkbox" id="${prop}" ${activeConfig[prop] ? 'checked' : ''}> <span>${label}</span>
                    </label>
                    <div style="font-size:12px; color:#aaa; margin-left:24px;">${desc}</div>
                `;
                group1.appendChild(div);
                div.querySelector('input').addEventListener('change', (e) => {
                    activeConfig[prop] = e.target.checked;
                    if (prop === 'gameMode') toggleGameMode(activeConfig[prop]);
                    saveActiveProfile();
                });
            });
            container.appendChild(group1);
            container.appendChild(document.createElement('hr')).style.cssText = 'border:0.5px solid #555; margin:12px 0;';

            const group2 = document.createElement('div');
            group2.innerHTML = '<div style="font-size:14px; margin-bottom:8px; color:#aaa;">手势</div>';
            const sliders = [
                ['长按触发(ms)', 'longPressTime', 200, 1000],
                ['双击间隔(ms)', 'doubleClickSpeed', 100, 800]
            ];
            sliders.forEach(([label, prop, min, max]) => {
                const div = document.createElement('div');
                div.style.marginBottom = '12px';
                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between;">
                        <span>${label}</span><span id="${prop}-val">${activeConfig[prop]}ms</span>
                    </div>
                    <input type="range" id="${prop}" min="${min}" max="${max}" value="${activeConfig[prop]}" style="width:100%;">
                `;
                group2.appendChild(div);
                const input = div.querySelector('input');
                const span = div.querySelector('span:last-child');
                input.addEventListener('input', (e) => {
                    activeConfig[prop] = +e.target.value;
                    span.textContent = activeConfig[prop] + 'ms';
                    saveActiveProfile();
                });
            });
            container.appendChild(group2);
            container.appendChild(document.createElement('hr')).style.cssText = 'border:0.5px solid #555; margin:12px 0;';

            // 鼠标模拟
            const groupMouse = document.createElement('div');
            groupMouse.innerHTML = '<div style="font-size:14px; margin-bottom:8px; color:#aaa;">鼠标模拟</div>';

            const mouseEnableDiv = document.createElement('div');
            mouseEnableDiv.style.marginBottom = '10px';
            mouseEnableDiv.innerHTML = `
                <label style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" id="mouseSimEnabled" ${activeConfig.mouseSimEnabled ? 'checked' : ''}> <span>启用鼠标模拟</span>
                </label>
            `;
            groupMouse.appendChild(mouseEnableDiv);

            const mouseModeDiv = document.createElement('div');
            mouseModeDiv.style.marginBottom = '12px';
            mouseModeDiv.style.opacity = activeConfig.mouseSimEnabled ? '1' : '0.5';
            mouseModeDiv.style.pointerEvents = activeConfig.mouseSimEnabled ? 'auto' : 'none';
            mouseModeDiv.innerHTML = `
                <div style="margin-bottom:4px;">模式</div>
                <select id="mouseSimMode" style="width:100%; background:#333; color:white; border:1px solid #555; padding:6px; border-radius:8px;">
                    <option value="follow" ${activeConfig.mouseSimMode === 'follow' ? 'selected' : ''}>跟随</option>
                    <option value="drag" ${activeConfig.mouseSimMode === 'drag' ? 'selected' : ''}>拖动</option>
                </select>
            `;
            groupMouse.appendChild(mouseModeDiv);

            const mouseExitDiv = document.createElement('div');
            mouseExitDiv.style.marginBottom = '12px';
            mouseExitDiv.style.opacity = activeConfig.mouseSimEnabled ? '1' : '0.5';
            mouseExitDiv.style.pointerEvents = activeConfig.mouseSimEnabled ? 'auto' : 'none';
            mouseExitDiv.innerHTML = `
                <div style="margin-bottom:4px;">退出按钮大小</div>
                <input type="range" id="mouseExitBtnSize" min="20" max="80" value="${activeConfig.mouseExitBtnSize}" style="width:100%;">
                <div style="display:flex; justify-content:space-between; margin-top:4px;">
                    <span>左: <input type="number" id="mouseExitBtnLeft" value="${activeConfig.mouseExitBtnLeft}" min="0" max="500" style="width:60px; background:#222; color:white; border:1px solid #555;"></span>
                    <span>上: <input type="number" id="mouseExitBtnTop" value="${activeConfig.mouseExitBtnTop}" min="0" max="500" style="width:60px; background:#222; color:white; border:1px solid #555;"></span>
                </div>
            `;
            groupMouse.appendChild(mouseExitDiv);

            container.appendChild(groupMouse);
            container.appendChild(document.createElement('hr')).style.cssText = 'border:0.5px solid #555; margin:12px 0;';

            const enableCheck = mouseEnableDiv.querySelector('#mouseSimEnabled');
            const modeSelect = mouseModeDiv.querySelector('#mouseSimMode');
            const sizeInput = mouseExitDiv.querySelector('#mouseExitBtnSize');
            const leftInput = mouseExitDiv.querySelector('#mouseExitBtnLeft');
            const topInput = mouseExitDiv.querySelector('#mouseExitBtnTop');

            enableCheck.addEventListener('change', (e) => {
                const enabled = e.target.checked;
                activeConfig.mouseSimEnabled = enabled;
                mouseModeDiv.style.opacity = enabled ? '1' : '0.5';
                mouseModeDiv.style.pointerEvents = enabled ? 'auto' : 'none';
                mouseExitDiv.style.opacity = enabled ? '1' : '0.5';
                mouseExitDiv.style.pointerEvents = enabled ? 'auto' : 'none';
                if (enabled) {
                    MouseSimulator.enable(activeConfig.mouseSimMode);
                } else {
                    MouseSimulator.disable();
                }
                saveActiveProfile();
            });

            modeSelect.addEventListener('change', (e) => {
                activeConfig.mouseSimMode = e.target.value;
                if (activeConfig.mouseSimEnabled) {
                    MouseSimulator.setMode(activeConfig.mouseSimMode);
                }
                saveActiveProfile();
            });

            sizeInput.addEventListener('input', (e) => {
                activeConfig.mouseExitBtnSize = +e.target.value;
                if (activeConfig.mouseSimEnabled) MouseSimulator.updateExitButtonPosition();
                saveActiveProfile();
            });

            leftInput.addEventListener('input', (e) => {
                activeConfig.mouseExitBtnLeft = +e.target.value;
                if (activeConfig.mouseSimEnabled) MouseSimulator.updateExitButtonPosition();
                saveActiveProfile();
            });

            topInput.addEventListener('input', (e) => {
                activeConfig.mouseExitBtnTop = +e.target.value;
                if (activeConfig.mouseSimEnabled) MouseSimulator.updateExitButtonPosition();
                saveActiveProfile();
            });

            // 导入导出
            const group3 = document.createElement('div');
            group3.innerHTML = '<div style="font-size:14px; margin-bottom:8px; color:#aaa;">导入/导出</div>';
            const exportDiv = document.createElement('div');
            exportDiv.style.cssText = 'display:flex; gap:8px;';
            exportDiv.innerHTML = `
                <button id="export-config" style="flex:1; background:#2196F3; border:none; border-radius:12px; color:white; padding:8px;">导出配置</button>
                <button id="import-config" style="flex:1; background:#FF9800; border:none; border-radius:12px; color:white; padding:8px;">导入配置</button>
            `;
            group3.appendChild(exportDiv);
            exportDiv.querySelector('#export-config').addEventListener('click', () => {
                const data = JSON.stringify(config, null, 2);
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'FastKB_config.json';
                a.click();
            });
            exportDiv.querySelector('#import-config').addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        try {
                            const imported = JSON.parse(ev.target.result);
                            if (imported.profiles) config = imported;
                            else config.profiles[config.activeProfile] = imported;
                            saveConfig(config);
                            // 重新加载
                            const loaded = loadConfig();
                            config = loaded;
                            activeConfig = config.profiles[config.activeProfile];
                            rebuildAll();
                            settingsPanel?.remove();
                            settingsVisible = false;
                            alert('导入成功！');
                        } catch (ex) {
                            alert('导入失败：无效的JSON文件');
                        }
                    };
                    reader.readAsText(file);
                };
                input.click();
            });
            container.appendChild(group3);
        }

        function renderProfile(container) {
            const selectDiv = document.createElement('div');
            selectDiv.style.marginBottom = '12px';
            selectDiv.innerHTML = `
                <select id="profile-select" style="width:100%; background:#333; color:white; border:1px solid #555; padding:8px; border-radius:8px;">
                    ${Object.keys(config.profiles).map(name => `<option value="${name}" ${name === config.activeProfile ? 'selected' : ''}>${name}</option>`).join('')}
                </select>
            `;
            container.appendChild(selectDiv);

            const btnDiv = document.createElement('div');
            btnDiv.style.cssText = 'display:flex; gap:6px; flex-wrap:wrap;';
            btnDiv.innerHTML = `
                <button id="profile-save" style="flex:1; background:#4caf50; border:none; border-radius:8px; color:white; padding:6px; font-size:13px;">保存</button>
                <button id="profile-new" style="flex:1; background:#2196F3; border:none; border-radius:8px; color:white; padding:6px; font-size:13px;">新建</button>
                <button id="profile-rename" style="flex:1; background:#FF9800; border:none; border-radius:8px; color:white; padding:6px; font-size:13px;">重命名</button>
                <button id="profile-delete" style="flex:1; background:#f44336; border:none; border-radius:8px; color:white; padding:6px; font-size:13px;">删除</button>
            `;
            container.appendChild(btnDiv);

            const quickDiv = document.createElement('div');
            quickDiv.style.marginTop = '16px';
            quickDiv.innerHTML = `
                <hr style="border:0.5px solid #555; margin:12px 0;">
                <div style="font-size:14px; margin-bottom:6px; color:#aaa;">快速切换</div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span>快捷键:</span>
                    <input type="text" id="quickSwitchKey" value="${activeConfig.quickSwitchKey}" style="width:80px; background:#222; color:white; border:1px solid #555; padding:4px; border-radius:6px;">
                </div>
                <p style="font-size:12px; color:#aaa; margin-top:4px;">按下此键循环切换配置文件</p>
            `;
            container.appendChild(quickDiv);
            quickDiv.querySelector('#quickSwitchKey').addEventListener('input', (e) => {
                activeConfig.quickSwitchKey = e.target.value;
                saveActiveProfile();
            });

            selectDiv.querySelector('#profile-select').addEventListener('change', (e) => {
                switchProfile(e.target.value);
                settingsPanel?.remove();
                settingsVisible = false;
            });
            btnDiv.querySelector('#profile-save').addEventListener('click', () => {
                saveActiveProfile();
                alert('已保存');
            });
            btnDiv.querySelector('#profile-new').addEventListener('click', () => {
                const name = prompt('新配置文件名称');
                if (name && !config.profiles[name]) {
                    config.profiles[name] = JSON.parse(JSON.stringify(activeConfig));
                    switchProfile(name);
                    settingsPanel?.remove();
                    settingsVisible = false;
                } else alert('无效名称或已存在');
            });
            btnDiv.querySelector('#profile-rename').addEventListener('click', () => {
                if (config.activeProfile === '默认') { alert('不能重命名默认'); return; }
                const newName = prompt('新名称', config.activeProfile);
                if (newName && newName !== config.activeProfile && !config.profiles[newName]) {
                    config.profiles[newName] = config.profiles[config.activeProfile];
                    delete config.profiles[config.activeProfile];
                    config.activeProfile = newName;
                    saveConfig(config);
                    settingsPanel?.remove();
                    settingsVisible = false;
                } else alert('名称无效');
            });
            btnDiv.querySelector('#profile-delete').addEventListener('click', () => {
                if (config.activeProfile === '默认') { alert('不能删除默认'); return; }
                if (confirm('删除配置 "' + config.activeProfile + '"？')) {
                    delete config.profiles[config.activeProfile];
                    config.activeProfile = '默认';
                    activeConfig = config.profiles['默认'];
                    saveConfig(config);
                    rebuildAll();
                    settingsPanel?.remove();
                    settingsVisible = false;
                }
            });

            container.appendChild(document.createElement('hr')).style.cssText = 'border:0.5px solid #555; margin:12px 0;';

            const resetBtn = document.createElement('button');
            resetBtn.textContent = '重置当前配置为默认';
            resetBtn.style.cssText = 'width:100%; padding:10px; background:#f44336; border:none; border-radius:16px; color:white; margin-top:12px;';
            resetBtn.addEventListener('click', () => {
                if (confirm('重置当前配置文件？')) {
                    activeConfig = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
                    applyAdaptiveLayout(activeConfig.buttons);
                    config.profiles[config.activeProfile] = activeConfig;
                    saveConfig(config);
                    rebuildAll();
                    settingsPanel?.remove();
                    settingsVisible = false;
                }
            });
            container.appendChild(resetBtn);
        }

        function renderHelp(container) {
            container.innerHTML = `
                <div style="background:#333; border-radius:12px; padding:16px;">
                    <h4 style="margin:0 0 10px;">功能指南</h4>
                    <ul style="list-style:none; padding:0; margin:0; font-size:13px; line-height:1.6;">
                        <li><b>• 编辑模式</b>：开启后可拖拽按钮位置，双击按钮打开编辑栏。</li>
                        <li><b>• 双击编辑</b>：编辑模式下双击按钮弹出浮动工具栏，可调整宽高、颜色、透明度、按键映射等。</li>
                        <li><b>• 辅助对齐</b>：拖拽按钮时自动对齐其他按钮，阈值可调。</li>
                        <li><b>• 连发CPS</b>：设置每秒点击次数，随机偏移防检测。</li>
                        <li><b>• 宏录制</b>：点击"录制宏"开始记录按键，再次点击停止；可循环播放、自定义间隔。</li>
                        <li><b>• 鼠标模拟</b>：在触摸屏上模拟鼠标光标，支持跟随和拖动两种模式。</li>
                        <li><b>• 游戏模式</b>：禁用页面滚动，提升游戏体验。</li>
                        <li><b>• 配置文件</b>：可创建多个配置，快速切换，导出/导入。</li>
                        <li><b>• 快捷键</b>：按F5（可自定义）循环切换配置文件。</li>
                    </ul>
                    <hr style="border:0.5px solid #555; margin:12px 0;">
                    <p style="margin:0; text-align:center; color:#aaa;">© ${new Date().getFullYear()} FastNow Studio | MIT License</p>
                    <p style="margin:6px 0 0; text-align:center; color:#aaa;">版本 v1.4.1</p>
                </div>
            `;
        }

        renderContent();
    }

    // ============================================================
    // 10. 重建与初始化
    // ============================================================

    function rebuildAll() {
        rebuildButtons();
        createControlBar();
        hideButtonEditor();
        if (activeConfig.gameMode) toggleGameMode(true);
        else toggleGameMode(false);
        if (activeConfig.mouseSimEnabled) {
            MouseSimulator.enable(activeConfig.mouseSimMode);
        } else {
            MouseSimulator.disable();
        }
    }

    // ============================================================
    // 11. 事件绑定与启动
    // ============================================================

    // 窗口自适应
    let resizeTimeout = null;
    window.addEventListener('resize', () => {
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (config.activeProfile === '默认' && !activeConfig.editMode) {
                applyAdaptiveLayout(activeConfig.buttons);
                rebuildButtons();
            }
        }, 200);
    });

    // 快捷键切换配置
    document.addEventListener('keydown', (e) => {
        if (e.key === activeConfig.quickSwitchKey) {
            const keys = Object.keys(config.profiles);
            const idx = keys.indexOf(config.activeProfile);
            const next = keys[(idx + 1) % keys.length];
            switchProfile(next);
            e.preventDefault();
        }
    });

    // 启动
    if (config.activeProfile === '默认') {
        applyAdaptiveLayout(activeConfig.buttons);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            rebuildButtons();
            createControlBar();
            if (activeConfig.mouseSimEnabled) MouseSimulator.enable(activeConfig.mouseSimMode);
        });
    } else {
        rebuildButtons();
        createControlBar();
        if (activeConfig.mouseSimEnabled) MouseSimulator.enable(activeConfig.mouseSimMode);
    }

    console.log('FastKB v1.4.1 已加载 | FastNow Studio');
})();