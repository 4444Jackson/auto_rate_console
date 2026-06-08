/*
 * 互评助手 - 控制台版
 * 
 * 用法：
 * 1. 登录网站(eg.icourse163.org打开课程 → 作业 → 学生互评 页面)
 * 2. F12 打开 Console
 * 3. 粘贴本段代码，回车执行
 * 4. 页面右侧出现悬浮面板，点击"开始互评"
 * 
 * 功能：自动勾选满分、填写评语、提交、跳转下一份
 * 安全：每次操作间有随机延迟，避免并发限制
 */

(function () {
    'use strict';

    // ==================== 配置 ====================
    const CONFIG = {
        defaultComment: '不错，加油！',
        defaultCount: 5,
        defaultDelay: 1500,
        delayRandom: 1500, // 额外随机延迟
        retryCount: 3,
        retryInterval: 1000,
    };

    let isRunning = false;
    let shouldStop = false;

    // ==================== 工具 ====================
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    function randDelay() {
        const base = parseInt(document.getElementById('mc-comment-delay')?.value, 10) || CONFIG.defaultDelay;
        return base + Math.floor(Math.random() * CONFIG.delayRandom);
    }

    function updateStatus(text) {
        const el = document.getElementById('mc-status');
        if (el) el.textContent = text;
    }

    async function waitForEl(selector, timeout = 6000) {
        const el = document.querySelector(selector);
        if (el) return el;

        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) { observer.disconnect(); resolve(el); }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => { observer.disconnect(); resolve(document.querySelector(selector)); }, timeout);
        });
    }

    // 用 dispatchEvent 触发框架响应
    function setNativeValue(element, value) {
        const setter = Object.getOwnPropertyDescriptor(
            element.constructor.prototype, 'value'
        )?.set;
        if (setter) {
            setter.call(element, value);
        } else {
            element.value = value;
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // ==================== 核心逻辑 ====================

    // 勾选所有最高分 radio
    function fillRadios() {
        const sections = document.querySelectorAll('.s');
        let count = 0;

        sections.forEach(section => {
            // 方案A：找 label 下的 input
            const labels = section.querySelectorAll('label');
            let radio = null;

            if (labels.length > 0) {
                const lastLabel = labels[labels.length - 1];
                radio = lastLabel.querySelector('input[type="radio"]');
            }

            // 方案B：直接找所有 radio
            if (!radio) {
                const radios = section.querySelectorAll('input[type="radio"]');
                if (radios.length > 0) radio = radios[radios.length - 1];
            }

            if (radio) {
                radio.checked = true;
                radio.click(); // 触发框架的事件绑定
                count++;
            }
        });

        return count;
    }

    // 填写所有评语框
    function fillComments() {
        const comment = document.getElementById('mc-comment-text')?.value || CONFIG.defaultComment;
        const textareas = document.querySelectorAll(
            'textarea[name="inputtxt"], textarea.j-textarea, textarea.inputtxt, textarea'
        );
        let count = 0;

        textareas.forEach(ta => {
            setNativeValue(ta, comment);
            count++;
        });

        return count;
    }

    // 取消"遵守规则"勾选
    function uncheckAgreement() {
        const cb = document.querySelector('.j-acb');
        if (cb && cb.type === 'checkbox') {
            cb.checked = false;
        }
    }

    // 点击提交
    async function clickSubmit() {
        const selectors = [
            '.j-submitbtn',
            '.u-btn.u-btn-default.f-fl.j-submitbtn',
            'a[class*="submit"]',
            'button[class*="submit"]',
        ];
        for (const s of selectors) {
            const btn = document.querySelector(s);
            if (btn) { btn.click(); return true; }
        }
        // 最兜底：找文本为"提交"的按钮
        const all = document.querySelectorAll('a, button, input[type="button"], input[type="submit"]');
        for (const el of all) {
            if (el.textContent.trim() === '提交') { el.click(); return true; }
        }
        return false;
    }

    // 点击下一份
    async function clickNext() {
        await sleep(randDelay());
        const selectors = ['.j-gotonext', 'a.j-gotonext', '.j-getnextbtn', 'a[class*="gotonext"]'];
        for (const s of selectors) {
            const el = document.querySelector(s);
            if (el) { el.click(); return true; }
        }
        // 兜底：测一下"不再有更多"提示
        return false;
    }

    // 处理一份
    async function processOne(i, total) {
        if (shouldStop) return false;
        updateStatus(`正在处理第 ${i} / ${total} 份...`);

        // 先看看有没有评分题，没有就点"前往作业"
        let sections = document.querySelectorAll('.s');
        if (sections.length === 0) {
            const goBtn = await waitForEl('.j-getnextbtn', 3000);
            if (goBtn) {
                goBtn.click();
                await sleep(randDelay());
                sections = document.querySelectorAll('.s');
            }
        }

        if (sections.length === 0) {
            updateStatus(`第 ${i} 份：当前页面没有评分题，跳过`);
            return false;
        }

        uncheckAgreement();
        const rc = fillRadios();
        const cc = fillComments();
        console.log(`[互评] 第${i}份：评分${rc}项 评语${cc}条`);

        await sleep(500 + Math.random() * 500);

        const ok = await clickSubmit();
        if (!ok) {
            updateStatus(`第 ${i} 份：未找到提交按钮`);
            return false;
        }

        updateStatus(`已提交第 ${i} 份`);
        return true;
    }

    // 批量处理
    async function processAll() {
        if (isRunning) return;
        isRunning = true;
        shouldStop = false;

        const count = parseInt(document.getElementById('mc-count')?.value, 10) || CONFIG.defaultCount;
        document.getElementById('mc-start').style.display = 'none';
        document.getElementById('mc-stop').style.display = 'inline-block';

        for (let i = 1; i <= count; i++) {
            if (shouldStop) { updateStatus(`已停止（完成 ${i - 1} / ${count}）`); break; }
            const ok = await processOne(i, count);
            if (i < count && !shouldStop) {
                const hasNext = await clickNext();
                if (!hasNext) {
                    updateStatus(`已完成 ${i} / ${count} 份（没有更多待评）`);
                    break;
                }
                await sleep(randDelay());
            }
        }

        if (!shouldStop) updateStatus('全部完成 ✓');
        document.getElementById('mc-start').style.display = 'inline-block';
        document.getElementById('mc-stop').style.display = 'none';
        isRunning = false;
        shouldStop = false;
    }

    function stop() { shouldStop = true; updateStatus('正在停止...'); }

    // ==================== UI ====================

    function createUI() {
        if (document.getElementById('mc-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'mc-panel';
        panel.innerHTML = `
            <div id="mc-dragbar" style="
                padding:10px 14px;background:linear-gradient(135deg,#667eea,#764ba2);
                color:#fff;font-weight:600;font-size:14px;cursor:move;
                display:flex;justify-content:space-between;align-items:center;
            ">
                <span>互评助手</span>
                <span id="mc-toggle" style="cursor:pointer;font-size:16px;">−</span>
            </div>
            <div id="mc-body" style="padding:12px 14px;">
                <div style="margin-bottom:10px;">
                    <label style="display:block;margin-bottom:4px;color:#666;font-size:12px;">互评份数</label>
                    <input id="mc-count" type="number" min="1" value="${CONFIG.defaultCount}" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;outline:none;">
                </div>
                <div style="margin-bottom:10px;">
                    <label style="display:block;margin-bottom:4px;color:#666;font-size:12px;">评语</label>
                    <input id="mc-comment-text" type="text" value="${CONFIG.defaultComment}" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;outline:none;">
                </div>
                <div style="margin-bottom:12px;">
                    <label style="display:block;margin-bottom:4px;color:#666;font-size:12px;">延迟(ms)</label>
                    <input id="mc-comment-delay" type="number" min="500" step="100" value="${CONFIG.defaultDelay}" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;outline:none;">
                </div>
                <div style="display:flex;gap:8px;">
                    <button id="mc-start" style="flex:1;padding:8px 0;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">开始互评</button>
                    <button id="mc-stop" style="flex:1;padding:8px 0;background:#ff4757;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;display:none;">停止</button>
                </div>
                <div id="mc-status" style="margin-top:10px;padding:6px;background:#f5f5f5;border-radius:6px;font-size:12px;color:#666;text-align:center;min-height:20px;">就绪，等待操作</div>
                <div style="margin-top:8px;font-size:11px;color:#aaa;text-align:center;">控制台版 · 无需油猴</div>
            </div>
        `;

        Object.assign(panel.style, {
            position: 'fixed', top: '80px', right: '20px', width: '210px',
            background: '#fff', border: '1px solid #e0e0e0',
            borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            zIndex: '999999', fontFamily: '-apple-system, sans-serif',
            fontSize: '13px', color: '#333', overflow: 'hidden', userSelect: 'none',
        });

        document.body.appendChild(panel);

        // 事件绑定
        document.getElementById('mc-start').onclick = processAll;
        document.getElementById('mc-stop').onclick = stop;

        const toggle = document.getElementById('mc-toggle');
        const body = document.getElementById('mc-body');
        toggle.onclick = () => {
            const hidden = body.style.display === 'none';
            body.style.display = hidden ? 'block' : 'none';
            toggle.textContent = hidden ? '−' : '+';
        };

        // 拖拽
        let dragging = false, ox = 0, oy = 0;
        const bar = document.getElementById('mc-dragbar');
        bar.onmousedown = (e) => {
            dragging = true;
            ox = e.clientX - panel.offsetLeft;
            oy = e.clientY - panel.offsetTop;
        };
        document.onmousemove = (e) => {
            if (!dragging) return;
            panel.style.left = (e.clientX - ox) + 'px';
            panel.style.top = (e.clientY - oy) + 'px';
            panel.style.right = 'auto';
        };
        document.onmouseup = () => { dragging = false; };
    }

    // 注入
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        createUI();
    } else {
        document.addEventListener('DOMContentLoaded', createUI);
    }

    console.log('[互评助手] 控制台版已加载 ✓');
    console.log('提示：如果右侧没看到面板，请检查页面是否完全加载后重新粘贴执行');
})();
