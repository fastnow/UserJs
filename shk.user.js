// ==UserScript==
// @name         SHK HACKER
// @namespace    https://fastnow.github.io
// @icon         https://fastnow.github.io/favicon.ico
// @version      2.5.1
// @description  适用于YP3D-SPIS3D的油篡改猴作弊脚本。FastNow 工作室为您保驾护航，期待下次与你重逢:D
// @author       FastNow Studio
// @license      BSD-3-Clause
// @supportURL   https://github.com/fastnow/SHK-Mod
// @match        *://yp3d.com/ships3d/*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/fastnow/SHK-Mod/main/SHK%20HACKER.user.js
// @updateURL    https://raw.githubusercontent.com/fastnow/SHK-Mod/main/SHK%20HACKER.user.js
// ==/UserScript==
(function() {
    'use strict';
    const CONFIG = {
        MENU_KEY: '\\',
        STATUS_DURATION: 2000,
        DEFAULT_JUMP_HEIGHT: 3.8,
        DEFAULT_LAND_SPEED: 3.8,
        DEFAULT_WATER_SPEED: 2.8,
        DEFAULT_HEALTH_REGEN: 999,
        CURRENT_CROSSHAIR: 'tShape'
    };
    const CROSSHAIR_STYLES = {
        'tShape': {
            html: '<div id="crosshair-element" style="width:20px;height:20px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:999999;">' +
                  '<div style="width:100%;height:2px;background:rgba(0,255,0,0.8);position:absolute;top:30%;"></div>' +
                  '<div style="width:2px;height:50%;background:rgba(0,255,0,0.8);position:absolute;left:50%;margin-left:-1px;bottom:0;"></div>' +
                  '</div>',
            name: 'T型准星'
        },
        'redDot': {
            html: '<div id="crosshair-element" style="width:10px;height:10px;border-radius:50%;background:red;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:999999;"></div>',
            name: '红点'
        },
        'simpleCross': {
            html: '<div id="crosshair-element" style="width:20px;height:20px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:999999;">' +
                  '<div style="width:100%;height:2px;background:white;position:absolute;top:50%;margin-top:-1px;"></div>' +
                  '<div style="width:2px;height:100%;background:white;position:absolute;left:50%;margin-left:-1px;"></div>' +
                  '</div>',
            name: '简单十字'
        },
        'advancedCross': {
            html: '<div id="crosshair-element" style="width:30px;height:30px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:999999;">' +
                  '<div style="width:100%;height:1px;background:rgba(255,255,255,0.8);position:absolute;top:50%;margin-top:-1px;"></div>' +
                  '<div style="width:1px;height:100%;background:rgba(255,255,255,0.8);position:absolute;left:50%;margin-left:-1px;"></div>' +
                  '<div style="width:8px;height:8px;border-radius:50%;border:2px solid rgba(255,0,0,0.7);position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);"></div>' +
                  '</div>',
            name: '高级十字'
        },
        'circle': {
            html: '<div id="crosshair-element" style="width:20px;height:20px;border-radius:50%;border:2px solid rgba(255,255,255,0.8);position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:999999;"></div>',
            name: '圆圈'
        },
        'dotCross': {
            html: '<div id="crosshair-element" style="width:24px;height:24px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:999999;">' +
                  '<div style="width:100%;height:1px;background:rgba(255,255,255,0.8);position:absolute;top:50%;margin-top:-1px;"></div>' +
                  '<div style="width:1px;height:100%;background:rgba(255,255,255,0.8);position:absolute;left:50%;margin-left:-1px;"></div>' +
                  '<div style="width:6px;height:6px;border-radius:50%;background:rgba(255,0,0,0.7);position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);"></div>' +
                  '</div>',
            name: '点十字'
        },
        'square': {
            html: '<div id="crosshair-element" style="width:16px;height:16px;border:2px solid rgba(255,255,255,0.8);position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:999999;"></div>',
            name: '方框'
        },
        'detailedScale': {
            html: `<div id="crosshair-element" style="width:60px;height:60px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:999999;">
                    <div style="width:100%;height:1px;background:cyan;position:absolute;top:50%;"></div>
                    <div style="width:1px;height:100%;background:cyan;position:absolute;left:50%;"></div>

                    ${Array.from({length: 10}, (_, i) => {
                        const pos = 5 * (i+1);
                        return `
                        <div style="height:3px;width:1px;background:yellow;position:absolute;left:50%;top:calc(50% - ${pos}px);"></div>
                        <div style="height:3px;width:1px;background:yellow;position:absolute;left:50%;top:calc(50% + ${pos}px);"></div>
                        <div style="width:3px;height:1px;background:yellow;position:absolute;top:50%;left:calc(50% - ${pos}px);"></div>
                        <div style="width:3px;height:1px;background:yellow;position:absolute;top:50%;left:calc(50% + ${pos}px);"></div>
                        `}).join('')}

                    <div style="width:4px;height:4px;border-radius:50%;background:red;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);"></div>
                   </div>`,
            name: '刻度十字'
        },
        'triangle': {
            html: `<div id="crosshair-element" style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:12px solid #00ff00;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:999999;"></div>`,
            name: '三角准星'
        },
        'sniperScope': {
            html: `<div id="crosshair-element" style="width:50px;height:50px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:999999;">
                    <div style="width:100%;height:100%;border:2px solid rgba(0,255,0,0.7);border-radius:50%;position:absolute;"></div>
                    <div style="width:70%;height:70%;border:1px solid rgba(0,255,0,0.5);border-radius:50%;position:absolute;top:15%;left:15%;"></div>
                    <div style="width:100%;height:1px;background:rgba(0,255,0,0.8);position:absolute;top:50%;"></div>
                    <div style="width:1px;height:100%;background:rgba(0,255,0,0.8);position:absolute;left:50%;"></div>
                    <div style="width:6px;height:6px;border-radius:50%;background:rgba(255,0,0,0.8);position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);"></div>
                   </div>`,
            name: '狙击镜'
        },
        'diamond': {
            html: `<div id="crosshair-element" style="width:16px;height:16px;background:rgba(255,215,0,0.8);transform:rotate(45deg);position:fixed;top:50%;left:50%;margin:-8px 0 0 -8px;pointer-events:none;z-index:999999;"></div>`,
            name: '菱形准星'
        },
        'chevron': {
            html: `<div id="crosshair-element" style="width:24px;height:24px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:999999;">
                    <div style="width:100%;height:2px;background:magenta;position:absolute;top:33%;transform:rotate(45deg);"></div>
                    <div style="width:100%;height:2px;background:magenta;position:absolute;top:33%;transform:rotate(-45deg);"></div>
                    <div style="width:100%;height:2px;background:magenta;position:absolute;top:66%;transform:rotate(-45deg);"></div>
                    <div style="width:100%;height:2px;background:magenta;position:absolute;top:66%;transform:rotate(45deg);"></div>
                   </div>`,
            name: 'V形准星'
        },
        'pixel': {
            html: `<div id="crosshair-element" style="width:3px;height:3px;background:#00ffff;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:999999;"></div>`,
            name: '像素点'
        },
        'crosshairOutline': {
            html: `<div id="crosshair-element" style="width:30px;height:30px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:999999;">
                    <div style="width:100%;height:2px;background:black;position:absolute;top:50%;margin-top:-1px;"></div>
                    <div style="width:2px;height:100%;background:black;position:absolute;left:50%;margin-left:-1px;"></div>
                    <div style="width:100%;height:1px;background:white;position:absolute;top:50%;margin-top:-1px;"></div>
                    <div style="width:1px;height:100%;background:white;position:absolute;left:50%;margin-left:-1px;"></div>
                   </div>`,
            name: '轮廓十字'
        },
        'radar': {
            html: `<div id="crosshair-element" style="width:40px;height:40px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:999999;">
                    <div style="width:100%;height:100%;border:1px dashed #00ff99;border-radius:50%;position:absolute;"></div>
                    <div style="width:80%;height:80%;border:1px dashed #00ff99;border-radius:50%;position:absolute;top:10%;left:10%;"></div>
                    <div style="width:100%;height:1px;background:#00ff99;position:absolute;top:50%;"></div>
                    <div style="width:1px;height:100%;background:#00ff99;position:absolute;left:50%;"></div>
                    <div style="width:6px;height:6px;border-radius:50%;background:#ff0055;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);"></div>
                   </div>`,
            name: '雷达准星'
        },
        'doubleRing': {
            html: `<div id="crosshair-element" style="width:35px;height:35px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:999999;">
                    <div style="width:100%;height:100%;border:2px solid #ff5500;border-radius:50%;position:absolute;"></div>
                    <div style="width:60%;height:60%;border:1px solid #ff5500;border-radius:50%;position:absolute;top:20%;left:20%;"></div>
                    <div style="width:100%;height:1px;background:#ff5500;position:absolute;top:50%;"></div>
                    <div style="width:1px;height:100%;background:#ff5500;position:absolute;left:50%;"></div>
                   </div>`,
            name: '双环准星'
        },
        'arrowCross': {
            html: `<div id="crosshair-element" style="width:40px;height:40px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:999999;">
                    <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:10px solid #ff00ff;position:absolute;top:0;left:50%;transform:translateX(-50%);"></div>
                    <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:10px solid #ff00ff;position:absolute;bottom:0;left:50%;transform:translateX(-50%);"></div>
                    <div style="width:0;height:0;border-top:6px solid transparent;border-bottom:6px solid transparent;border-right:10px solid #ff00ff;position:absolute;left:0;top:50%;transform:translateY(-50%);"></div>
                    <div style="width:0;height:0;border-top:6px solid transparent;border-bottom:6px solid transparent;border-left:10px solid #ff00ff;position:absolute;right:0;top:50%;transform:translateY(-50%);"></div>

                    <div style="width:100%;height:1px;background:#ff00ff;position:absolute;top:50%;"></div>
                    <div style="width:1px;height:100%;background:#ff00ff;position:absolute;left:50%;"></div>
                   </div>`,
            name: '箭头十字'
        },
        'dotGrid': {
            html: `<div id="crosshair-element" style="width:30px;height:30px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:999999;">
                    ${Array.from({length: 5}, (_, y) =>
                      Array.from({length: 5}, (_, x) =>
                        `<div style="width:2px;height:2px;background:white;border-radius:50%;position:absolute;top:${y*7}px;left:${x*7}px;"></div>`
                      ).join('')
                    ).join('')}
                    <div style="width:4px;height:4px;background:red;border-radius:50%;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);"></div>
                   </div>`,
            name: '点阵准星'
        }
    };
    const GameAPI = {
        THREE: window.THREE,
        scene: null,
        gameClient: null,
        camera: null,
        originalMethods: {},
        originalValues: {
            movement: { land: {}, water: {}, jump: {} }
        }
    };
    delete window.THREE;
    const FeatureManager = {
        states: {
            crosshair: false,
            highJump: false,
            dolphin: false,
            landSpeed: false,
            waterSpeed: false,
            healthRegen: false
        },
        isActive(feature) { return this.states[feature] || false; },
        toggle(feature) {
            this.states[feature] = !this.states[feature];
            return this.states[feature];
        }
    };
    const UIManager = {
        elements: {},
        createElement(id, html, style) {
            const el = document.createElement('div');
            el.id = id;
            if (style) el.style.cssText = style;
            if (html) el.innerHTML = html;
            document.body.appendChild(el);
            this.elements[id] = el;
            return el;
        },
        removeElement(id) {
            if (this.elements[id]) {
                this.elements[id].remove();
                delete this.elements[id];
            }
        },
        showStatus(message) {
            if (!this.elements.status) {
                this.createElement('status', null, `
                    position: fixed;
                    top: 10px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(0,0,0,0.7);
                    color: white;
                    padding: 8px 15px;
                    border-radius: 5px;
                    z-index: 9999999;
                    font-family: Arial;
                    font-size: 14px;
                    pointer-events: none;
                    opacity: 0;
                    transition: opacity 0.3s;
                `);
            }
            const status = this.elements.status;
            status.textContent = message;
            status.style.opacity = 1;
            setTimeout(() => status.style.opacity = 0, CONFIG.STATUS_DURATION);
        }
    };

    function toggleCrosshair() {
        const statusElement = document.querySelector('.menu-item[data-feature="crosshair"] .status');
        const isActive = FeatureManager.toggle('crosshair');
        if (isActive) {
            UIManager.createElement('crosshair-element', CROSSHAIR_STYLES[CONFIG.CURRENT_CROSSHAIR].html);
            statusElement.textContent = 'ON';
            statusElement.style.color = '#0f0';
            UIManager.showStatus(`准星已激活 (${CROSSHAIR_STYLES[CONFIG.CURRENT_CROSSHAIR].name})`);
        } else {
            UIManager.removeElement('crosshair-element');
            statusElement.textContent = 'OFF';
            statusElement.style.color = '#f00';
            UIManager.showStatus("准星已关闭");
        }
    }
    function changeCrosshairStyle(style) {
        CONFIG.CURRENT_CROSSHAIR = style;
        if (FeatureManager.isActive('crosshair')) {
            UIManager.removeElement('crosshair-element');
            UIManager.createElement('crosshair-element', CROSSHAIR_STYLES[style].html);
            UIManager.showStatus(`准星样式已切换为: ${CROSSHAIR_STYLES[style].name}`);
        }
    }

    function toggleLandSpeed() {
        const player = getPlayer();
        const statusElement = document.querySelector('.menu-item[data-feature="landSpeed"] .status');
        const landSpeedInput = document.getElementById('landSpeed-input');
        let landSpeed = parseFloat(landSpeedInput.value) || CONFIG.DEFAULT_LAND_SPEED;

        if (!player) {
            UIManager.showStatus("未检测到玩家对象，请重试");
            return;
        }

        const safeLandProps = ['runSpeed', 'walkSpeed', 'groundSpeed', 'maxSpeed'];
        const hasSafeProps = safeLandProps.some(prop => player[prop] !== undefined);

        if (!hasSafeProps) {
            UIManager.showStatus("未找到安全的速度属性，无法激活");
            return;
        }

        if (Object.keys(GameAPI.originalValues.movement.land).length === 0) {
            safeLandProps.forEach(prop => {
                if (player[prop] !== undefined) {
                    GameAPI.originalValues.movement.land[prop] = player[prop];
                }
            });
        }

        const isActive = FeatureManager.toggle('landSpeed');

        safeLandProps.forEach(prop => {
            if (player[prop] !== undefined) {
                player[prop] = isActive ? landSpeed : GameAPI.originalValues.movement.land[prop];
            }
        });

        if (GameAPI.scene?.render) GameAPI.scene.render();

        statusElement.textContent = isActive ? 'ON' : 'OFF';
        statusElement.style.color = isActive ? '#0f0' : '#f00';
        UIManager.showStatus(`陆地速度已${isActive ? '激活' : '关闭'} (速度: ${landSpeed})`);
    }

    function toggleWaterSpeed() {
        const player = getPlayer();
        const statusElement = document.querySelector('.menu-item[data-feature="waterSpeed"] .status');
        const waterSpeedInput = document.getElementById('waterSpeed-input');
        let waterSpeed = parseFloat(waterSpeedInput.value) || CONFIG.DEFAULT_WATER_SPEED;

        if (!player) {
            UIManager.showStatus("未检测到玩家对象，请重试");
            return;
        }

        const safeWaterProps = ['waterSpeed', 'swimmingSpeed', 'aquaticSpeed'];
        const hasSafeProps = safeWaterProps.some(prop => player[prop] !== undefined);

        if (!hasSafeProps) {
            UIManager.showStatus("未找到安全的水中属性，无法激活");
            return;
        }

        if (Object.keys(GameAPI.originalValues.movement.water).length === 0) {
            safeWaterProps.forEach(prop => {
                if (player[prop] !== undefined) {
                    GameAPI.originalValues.movement.water[prop] = player[prop];
                }
            });
        }

        const isActive = FeatureManager.toggle('waterSpeed');

        safeWaterProps.forEach(prop => {
            if (player[prop] !== undefined) {
                player[prop] = isActive ? waterSpeed : GameAPI.originalValues.movement.water[prop];
            }
        });

        if (GameAPI.scene?.render) GameAPI.scene.render();

        statusElement.textContent = isActive ? 'ON' : 'OFF';
        statusElement.style.color = isActive ? '#0f0' : '#f00';
        UIManager.showStatus(`水中速度已${isActive ? '激活' : '关闭'} (速度: ${waterSpeed})`);
    }

    function toggleHighJump() {
        const player = getPlayer();
        const statusElement = document.querySelector('.menu-item[data-feature="highJump"] .status');
        const jumpHeightInput = document.getElementById('jump-height-input');
        let jumpHeight = parseFloat(jumpHeightInput.value) || CONFIG.DEFAULT_JUMP_HEIGHT;

        if (!player) {
            UIManager.showStatus("未检测到玩家对象，请重试");
            return;
        }

        const safeJumpProps = ['jumpForce', 'jumpPower', 'jumpSpeed'];
        const hasSafeProps = safeJumpProps.some(prop => player[prop] !== undefined);

        if (!hasSafeProps) {
            UIManager.showStatus("未找到安全的跳跃属性，无法激活");
            return;
        }

        if (Object.keys(GameAPI.originalValues.movement.jump).length === 0) {
            safeJumpProps.forEach(prop => {
                if (player[prop] !== undefined) {
                    GameAPI.originalValues.movement.jump[prop] = player[prop];
                }
            });
        }

        const isActive = FeatureManager.toggle('highJump');

        safeJumpProps.forEach(prop => {
            if (player[prop] !== undefined) {
                player[prop] = isActive ? jumpHeight : GameAPI.originalValues.movement.jump[prop];
            }
        });

        if (GameAPI.scene?.render) GameAPI.scene.render();

        statusElement.textContent = isActive ? 'ON' : 'OFF';
        statusElement.style.color = isActive ? '#0f0' : '#f00';
        UIManager.showStatus(`高跳已${isActive ? '激活' : '关闭'} (高度: ${jumpHeight})`);
    }

    function toggleDolphin() {
        const statusElement = document.querySelector('.menu-item[data-feature="dolphin"] .status');
        if (!document.getElementById('dolphin-btn')) {
            const dolphinBtn = UIManager.createElement('dolphin-btn', '╳', `
                position: fixed;
                bottom: 170px;
                right: 30px;
                width: 60px;
                height: 60px;
                background: rgba(0,255,255,0.3);
                border-radius: 50%;
                display: flex;
                justify-content: center;
                align-items: center;
                color: white;
                font-size: 24px;
                z-index: 999999;
                border: 1px solid rgba(255,255,255,0.5);
            `);
            dolphinBtn.addEventListener('touchstart', () => {
                window.originalMathSqrt = Math.sqrt;
                Math.sqrt = () => 1;
                statusElement.textContent = 'ON';
                statusElement.style.color = '#0f0';
                dolphinBtn.style.background = 'rgba(0,255,255,0.7)';
                UIManager.showStatus("瞬移模式已激活");
            });
            ['touchend', 'mouseup', 'mouseleave'].forEach(event => {
                dolphinBtn.addEventListener(event, () => {
                    if (window.originalMathSqrt) Math.sqrt = window.originalMathSqrt;
                    statusElement.textContent = 'OFF';
                    statusElement.style.color = '#f00';
                    dolphinBtn.style.background = 'rgba(0,255,255,0.3)';
                    UIManager.showStatus("瞬移模式已关闭");
                    if (GameAPI.scene?.render) GameAPI.scene.render(); // 修复瞬移后的渲染
                });
            });
            dolphinBtn.addEventListener('mousedown', () => {
                window.originalMathSqrt = Math.sqrt;
                Math.sqrt = () => 1;
                statusElement.textContent = 'ON';
                statusElement.style.color = '#0f0';
                dolphinBtn.style.background = 'rgba(0,255,255,0.7)';
                UIManager.showStatus("瞬移模式已激活");
            });
        }
        UIManager.showStatus("按住按钮以激活瞬移模式");
    }

    function toggleHealthRegen() {
        const player = getPlayer();
        const statusElement = document.querySelector('.menu-item[data-feature="healthRegen"] .status');
        const regenInput = document.getElementById('health-regen-input');
        let regenRate = parseFloat(regenInput.value) || CONFIG.DEFAULT_HEALTH_REGEN;

        if (!player) {
            UIManager.showStatus("未检测到玩家对象，请重试");
            return;
        }

        if (player.health === undefined) player.health = 100;
        if (player.maxHealth === undefined) player.maxHealth = 100;

        const isActive = FeatureManager.toggle('healthRegen');

        if (GameAPI.originalValues.healthInterval) clearInterval(GameAPI.originalValues.healthInterval);

        if (isActive) {
            GameAPI.originalValues.healthInterval = setInterval(() => {
                if (player.health < player.maxHealth) {
                    player.health = Math.min(player.health + regenRate, player.maxHealth);
                    if (typeof player.onHealthChange === 'function') {
                        player.onHealthChange(player.health);
                    }
                }
            }, 1000);
        }

        statusElement.textContent = isActive ? 'ON' : 'OFF';
        statusElement.style.color = isActive ? '#0f0' : '#f00';
        UIManager.showStatus(`血量回复已${isActive ? '激活' : '关闭'} (速度: ${regenRate}/秒)`);
    }

    function getPlayer() {
        return (
            GameAPI.gameClient?.gameClient?.sailorMe ||
            GameAPI.gameClient?.gameClient?.player ||
            GameAPI.gameClient?.player ||
            window.player ||
            (window.game && window.game.player)
        );
    }

    function toggleMenu() {
        const menu = document.getElementById('cheat-menu');
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }

    function createMainMenu() {
        const menuHTML = `
        <div style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1);">
            <h2 style="margin: 0; text-align: center; font-size: 16px;">SHK作弊菜单</h2>
        </div>
        <div id="menu-items" style="max-height: 500px; overflow-y: auto; padding: 10px;">
            <div class="menu-category" style="color: #0ff; margin: 10px 0 5px 0; font-size: 14px;">准星功能</div>
            <div class="menu-item" data-feature="crosshair" style="padding: 8px; margin-bottom: 5px; background: rgba(255,255,255,0.05); border-radius: 3px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
                <span>准星</span>
                <span class="status" style="color: #f00;">OFF</span>
            </div>
            <div style="padding: 5px 0; margin-bottom: 10px;">
                <select id="crosshair-style" style="width:100%;background:rgba(0,0,0,0.5);color:white;border:1px solid rgba(255,255,255,0.2);padding:5px;border-radius:3px;">
                    ${Object.entries(CROSSHAIR_STYLES).map(([key, style]) =>
                        `<option value="${key}">${style.name}</option>`
                    ).join('')}
                </select>
            </div>

            <div class="menu-category" style="color: #0ff; margin: 10px 0 5px 0; font-size: 14px;">移动增强</div>
            <div class="menu-item" data-feature="highJump" style="padding: 8px; margin-bottom: 5px; background: rgba(255,255,255,0.05); border-radius: 3px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
                <span>高跳</span>
                <div>
                    <input type="number" id="jump-height-input" value="${CONFIG.DEFAULT_JUMP_HEIGHT}" min="1" max="100" step="0.1" style="width:50px;height:20px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:white;text-align:center;margin-left:10px;border-radius:3px;">
                    <span class="status" style="color: #f00; margin-left: 10px;">OFF</span>
                </div>
            </div>
            <div class="menu-item" data-feature="landSpeed" style="padding: 8px; margin-bottom: 5px; background: rgba(255,255,255,0.05); border-radius: 3px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
                <span>陆地速度</span>
                <div>
                    <input type="number" id="landSpeed-input" value="${CONFIG.DEFAULT_LAND_SPEED}" min="1" max="100" step="0.1" style="width:50px;height:20px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:white;text-align:center;margin-left:10px;border-radius:3px;">
                    <span class="status" style="color: #f00; margin-left: 10px;">OFF</span>
                </div>
            </div>
            <div class="menu-item" data-feature="waterSpeed" style="padding: 8px; margin-bottom: 5px; background: rgba(255,255,255,0.05); border-radius: 3px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
                <span>水中速度</span>
                <div>
                    <input type="number" id="waterSpeed-input" value="${CONFIG.DEFAULT_WATER_SPEED}" min="1" max="100" step="0.1" style="width:50px;height:20px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:white;text-align:center;margin-left:10px;border-radius:3px;">
                    <span class="status" style="color: #f00; margin-left: 10px;">OFF</span>
                </div>
            </div>
            <div class="menu-item" data-feature="dolphin" style="padding: 8px; margin-bottom: 5px; background: rgba(255,255,255,0.05); border-radius: 3px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
                <span>瞬移模式</span>
                <span class="status" style="color: #f00;">OFF</span>
            </div>

            <div class="menu-category" style="color: #0ff; margin: 10px 0 5px 0; font-size: 14px;">*生存增强</div>
            <div class="menu-item" data-feature="healthRegen" style="padding: 8px; margin-bottom: 5px; background: rgba(255,255,255,0.05); border-radius: 3px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
                <span>血量回复</span>
                <div>
                    <input type="number" id="health-regen-input" value="${CONFIG.DEFAULT_HEALTH_REGEN}" min="0.1" max="100" step="0.1" style="width:50px;height:20px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:white;text-align:center;margin-left:10px;border-radius:3px;">
                    <span class="status" style="color: #f00; margin-left: 10px;">OFF</span>
                </div>
            </div>

            <div style="text-align: center; margin-top: 15px; font-size: 12px; color: rgba(255,255,255,0.5);">
                 © ${new Date().getFullYear()} FastNow Studio | 为您保驾护航
            </div>
        </div>
        `;
        const menu = UIManager.createElement('cheat-menu', menuHTML, `
            position: fixed;
            top: 20px;
            left: 20px;
            width: 280px;
            background: rgba(0,0,0,0.85);
            border-radius: 5px;
            color: white;
            font-family: Arial;
            z-index: 999999;
            border: 1px solid rgba(255,255,255,0.2);
            display: none;
        `);

        function setupMenuClickHandlers() {
            document.querySelector('.menu-item[data-feature="crosshair"]').addEventListener('click', function(e) {
                if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
                    toggleCrosshair();
                }
            });
            document.querySelector('.menu-item[data-feature="highJump"]').addEventListener('click', function(e) {
                if (e.target.tagName !== 'INPUT') {
                    toggleHighJump();
                }
            });
            document.querySelector('.menu-item[data-feature="landSpeed"]').addEventListener('click', function(e) {
                if (e.target.tagName !== 'INPUT') {
                    toggleLandSpeed();
                }
            });
            document.querySelector('.menu-item[data-feature="waterSpeed"]').addEventListener('click', function(e) {
                if (e.target.tagName !== 'INPUT') {
                    toggleWaterSpeed();
                }
            });
            document.querySelector('.menu-item[data-feature="dolphin"]').addEventListener('click', function(e) {
                toggleDolphin();
            });
            document.querySelector('.menu-item[data-feature="healthRegen"]').addEventListener('click', function(e) {
                if (e.target.tagName !== 'INPUT') {
                    toggleHealthRegen();
                }
            });
        }

        document.getElementById('crosshair-style').addEventListener('change', function() {
            changeCrosshairStyle(this.value);
        });
        document.addEventListener('keydown', function(e) {
            if (e.key === CONFIG.MENU_KEY) {
                toggleMenu();
            }
        });
        setTimeout(setupMenuClickHandlers, 500);
    }

    function createUIToggleButton() {
        const button = UIManager.createElement('ui-toggle-btn', 'UI', `
            position: fixed;
            top: 5px;
            right: 5px;
            width: 30px;
            height: 30px;
            background: rgba(0,0,0,0.5);
            border-radius: 3px;
            color: white;
            font-size: 12px;
            text-align: center;
            line-height: 30px;
            z-index: 1000000;
            cursor: pointer;
            border: 1px solid rgba(255,255,255,0.2);
        `);
        button.addEventListener('click', toggleMenu);
    }

    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #cheat-menu ::-webkit-scrollbar { width: 5px; }
            #cheat-menu ::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); }
            #cheat-menu ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
            #crosshair-style option { background: #222; }
            .menu-item:hover { background: rgba(255,255,255,0.1) !important; }
            #ui-toggle-btn:hover { background: rgba(0,0,0,0.7) !important; }
            input[type="number"] { -moz-appearance: textfield; }
            input[type="number"]::-webkit-inner-spin-button,
            input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        `;
        document.head.appendChild(style);
    }

    function initAPIHooks() {
        GameAPI.originalMethods.WeakMap_set = WeakMap.prototype.set;
        GameAPI.originalMethods.Object_defineProperty = Object.defineProperty;

        WeakMap.prototype.set = new Proxy(WeakMap.prototype.set, {
            apply(target, thisArg, args) {
                const [key, value] = args;
                if (value?.type === 'Scene') {
                    GameAPI.scene = value;
                    if (value.camera) GameAPI.camera = value.camera;
                }
                return Reflect.apply(target, thisArg, args);
            }
        });

        Object.defineProperty = new Proxy(Object.defineProperty, {
            apply(target, thisArg, args) {
                const [obj, prop] = args;
                if (prop === 'getCollectionLengths' && !GameAPI.gameClient) {
                    GameAPI.gameClient = obj;
                }
                return Reflect.apply(target, thisArg, args);
            }
        });

        const checkInterval = setInterval(() => {
            if (!GameAPI.gameClient?.gameClient) {
                for (const key in window) {
                    if (window[key]?.gameSocket && window[key]?.sailorMe) {
                        GameAPI.gameClient = window[key];
                        clearInterval(checkInterval);
                        document.getElementById('cheat-menu').style.display = 'block';
                        break;
                    }
                }
            }
        }, 500);
    }

	// *主函数
	function init() {
    	function showProgress(message) {
  	    	UIManager.showStatus(message);
        	console.log(`[SHK] ${message}`);
        	return new Promise(resolve => setTimeout(resolve, 1000));
  		}
    	(async function() {
        	await showProgress("脚本开始初始化...");
        	await showProgress("正在加载样式...");
        	addStyles();
        	await showProgress("正在初始化API钩子...");
        	initAPIHooks();
        	await showProgress("正在创建主菜单...");
        	createMainMenu();
        	await showProgress("正在创建UI切换按钮...");
        	createUIToggleButton();
        	await showProgress("脚本加载成功");
        	setTimeout(() => {
            	UIManager.showStatus("FastNow 工作室为您保驾护航");
        	}, 500);
    	})();
	}

    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }
})();