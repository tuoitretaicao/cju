(function() {
    'use strict';

    const pageWin = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    // Chốt chặn chống chạy trùng nếu người dùng bật nhầm 2 bản script trong Tampermonkey
    if (pageWin.__CJU_AUTO_LOADED__) {
        console.warn('[CJU Auto] Phát hiện script đã được khởi chạy trước đó, bỏ qua bản trùng lặp.');
        return;
    }
    pageWin.__CJU_AUTO_LOADED__ = true;

    // Hàm lấy số giây ngẫu nhiên trong khoảng [min, max]
    function getRandom(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // =========================================================================
    // 1. TỰ ĐỘNG BỎ QUA POPUP ALERT / CONFIRM TRÊN TOÀN BỘ TRANG VÀ IFRAME
    // =========================================================================
    function bypassAlerts(win) {
        try {
            win.alert = function(msg) {
                console.log('[CJU Auto] Đã bỏ qua Alert:', msg);
                return true;
            };
            win.confirm = function(msg) {
                console.log('[CJU Auto] Đã chấp nhận Confirm:', msg);
                return true;
            };
            win.prompt = function() { return ''; };
        } catch (e) {}
    }

    bypassAlerts(pageWin);
    bypassAlerts(window);

    function injectAlertBypass() {
        try {
            const injectScript = document.createElement('script');
            injectScript.textContent = `
                window.alert = function() { return true; };
                window.confirm = function() { return true; };
                window.prompt = function() { return ''; };
            `;
            (document.head || document.documentElement).appendChild(injectScript);
            injectScript.remove();
        } catch (e) {}
    }
    injectAlertBypass();

    // =========================================================================
    // 2. KHỞI CHẠY TỰ ĐỘNG
    // =========================================================================
    window.addEventListener('DOMContentLoaded', initAutomation);
    window.addEventListener('load', initAutomation);
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        initAutomation();
    }

    let isInitialized = false;
    function initAutomation() {
        if (isInitialized) return;
        if (!document.body) return;
        isInitialized = true;

        const isMainPage = window.location.href.includes('/classroom/main.do');
        const isPlayerPage = !isMainPage && (
            window.location.href.includes('/learning/') ||
            window.top !== window.self ||
            document.querySelector('video') !== null
        );

        // ---------------------------------------------------------------------
        // XỬ LÝ TRANG DANH SÁCH BÀI HỌC (main.do)
        // ---------------------------------------------------------------------
        if (isMainPage && window.top === window.self) {
            console.log('[CJU Auto] Trang main.do đang hoạt động');

            if (localStorage.getItem('cju_v39_init') !== 'true') {
                localStorage.setItem('cju_auto_enabled', 'true');
                localStorage.setItem('cju_v39_init', 'true');
            }

            let hasTriggeredClick = false;
            let isReloading = false;
            let waitTimer = null;
            let waitSeconds = getRandom(30, 90);

            // Chống mở 2 tab cùng lúc & kiểm tra chặn Popup
            let lastPopupBlocked = false;
            let lastWindowOpenTime = 0;
            try {
                const origOpen = pageWin.open;
                if (typeof origOpen === 'function' && !pageWin.__cjuOpenWrapped) {
                    pageWin.__cjuOpenWrapped = true;
                    pageWin.open = function(...args) {
                        const now = Date.now();
                        // Nếu vừa mở 1 tab trong vòng 8 giây trước đó thì chặn không cho mở thêm tab thứ 2
                        if (now - lastWindowOpenTime < 8000) {
                            console.warn('[CJU Auto] Đã chặn mở trùng tab thứ 2!');
                            return null;
                        }
                        const winRef = origOpen.apply(this, args);
                        if (!winRef) {
                            lastPopupBlocked = true;
                            console.warn('[CJU Auto] Trình duyệt đã chặn cửa sổ Popup!');
                        } else {
                            lastPopupBlocked = false;
                            lastWindowOpenTime = now;
                        }
                        return winRef;
                    };
                }
            } catch (e) {}

            createWidget();

            function handleLessonFinished() {
                if (isReloading) return;
                isReloading = true;
                localStorage.removeItem('cju_last_finished');
                setWidgetMsg('Đã học xong 1 bài! Đang tải lại trang sau 2 giây...');
                setTimeout(() => location.reload(), 2000);
            }

            window.addEventListener('storage', (e) => {
                if (e.key === 'cju_last_finished' && e.newValue) {
                    handleLessonFinished();
                }
            });

            setInterval(() => {
                const lastFinished = parseInt(localStorage.getItem('cju_last_finished') || '0', 10);
                if (lastFinished > 0 && (Date.now() - lastFinished) < 6000) {
                    handleLessonFinished();
                }
            }, 1500);

            function startCountdown() {
                if (waitTimer) clearInterval(waitTimer);
                const isEnabled = localStorage.getItem('cju_auto_enabled') !== 'false';

                if (!isEnabled) {
                    setWidgetMsg('⏸ Đang ở chế độ TẮT. Hãy bấm nút đỏ phía trên để BẬT tự động!');
                    return;
                }

                setWidgetMsg(`Đang đợi ngẫu nhiên ${waitSeconds}s trước khi mở bài mới...`);

                waitTimer = setInterval(() => {
                    const currentlyEnabled = localStorage.getItem('cju_auto_enabled') !== 'false';
                    if (!currentlyEnabled) {
                        clearInterval(waitTimer);
                        setWidgetMsg('⏸ Đã tạm dừng đếm ngược (Đang TẮT).');
                        return;
                    }

                    waitSeconds--;
                    if (waitSeconds > 0) {
                        setWidgetMsg(`Đang đợi ngẫu nhiên ${waitSeconds}s trước khi mở bài mới...`);
                    } else {
                        clearInterval(waitTimer);
                        setWidgetMsg('Đã đếm ngược xong (0s)! Đang tự động mở bài học...');
                        runAutoClick(true);
                    }
                }, 1000);
            }

            startCountdown();

            function runAutoClick(forceAfterCountdown = false) {
                if (hasTriggeredClick) return;

                if (!forceAfterCountdown) {
                    const lastFinished = parseInt(localStorage.getItem('cju_last_finished') || '0', 10);
                    const isRecentlyDone = (Date.now() - lastFinished) < 180000;

                    if (!isRecentlyDone) {
                        const lastHeartbeat = parseInt(localStorage.getItem('cju_video_heartbeat') || '0', 10);
                        if ((Date.now() - lastHeartbeat) < 4000) {
                            setWidgetMsg('Đang có video đang phát, chờ bài học kết thúc...');
                            return;
                        }
                    }
                }

                setWidgetMsg('Đang tìm bài học tiếp theo chưa hoàn thành...');

                const elements = Array.from(document.querySelectorAll('*'))
                    .filter(el => el.children.length === 0 && (el.innerText || el.value || '').trim() === '온라인 학습');

                if (elements.length === 0) {
                    setWidgetMsg('Không tìm thấy nút "온라인 학습".');
                    return;
                }

                let targetEl = null;
                let targetName = '';

                for (const el of elements) {
                    const clickable = el.closest('a, button, input[type="button"]') || el;

                    let card = clickable.parentElement;
                    while (card && card !== document.body) {
                        if (card.innerText && card.innerText.includes('진도율')) {
                            const buttonsInside = Array.from(card.querySelectorAll('*'))
                                .filter(child => child.children.length === 0 && (child.innerText || child.value || '').trim() === '온라인 학습');
                            if (buttonsInside.length === 1) break;
                        }
                        card = card.parentElement;
                    }

                    if (!card) continue;

                    const text = card.innerText;
                    const match = text.match(/진도율\s*:\s*(\d+)\s*%/);
                    let isFinished = false;

                    if (match) {
                        isFinished = parseInt(match[1], 10) >= 100;
                    } else {
                        isFinished = text.includes('100%') || text.includes('100 %');
                    }

                    if (!isFinished) {
                        targetEl = clickable;
                        const titleMatch = text.match(/(\d+교시\s*\d+강)/);
                        targetName = titleMatch ? titleMatch[1] : 'Bài tiếp theo';
                        break;
                    }
                }

                if (targetEl) {
                    hasTriggeredClick = true;
                    setWidgetMsg(`Tìm thấy [${targetName}], đang mở...`);
                    localStorage.setItem('cju_video_heartbeat', Date.now().toString());

                    setTimeout(() => {
                        lastPopupBlocked = false;
                        // SỬA LỖI MỞ 2 TAB: Chỉ gọi duy nhất 1 lệnh click() (bỏ đoạn chạy lặp onclick lần 2)
                        targetEl.click();

                        setTimeout(() => {
                            if (lastPopupBlocked) {
                                hasTriggeredClick = false;
                                setWidgetMsg('⚠️ Chrome đã chặn tự mở tab mới! Hãy bấm biểu tượng bị chặn trên thanh địa chỉ -> Chọn "Luôn cho phép popup từ hive.cju.ac.kr", hoặc bấm nút xanh bên dưới.');
                            } else {
                                setWidgetMsg(`Đang phát [${targetName}]...`);
                            }
                        }, 1000);
                    }, 500);
                } else {
                    setWidgetMsg('🎉 Đã hoàn thành 100% tất cả các bài học!');
                }
            }

            function createWidget() {
                if (document.getElementById('cju-widget')) return;
                const widget = document.createElement('div');
                widget.id = 'cju-widget';
                widget.style.cssText = `
                    position: fixed; top: 15px; right: 15px; z-index: 999999;
                    background: #0f172a; color: #f8fafc; padding: 12px 16px;
                    border-radius: 8px; font-size: 13px; font-family: system-ui, sans-serif;
                    box-shadow: 0 4px 16px rgba(0,0,0,0.4); border: 1px solid #334155;
                    display: flex; flex-direction: column; gap: 8px; max-width: 340px;
                `;

                let isEnabled = localStorage.getItem('cju_auto_enabled') !== 'false';

                widget.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; gap: 8px;">
                        <b style="color:#38bdf8;">⚡ CJU HIVE Auto v4.0</b>
                        <button id="cju-toggle-btn" style="
                            padding: 4px 10px; border: none; border-radius: 4px; cursor: pointer;
                            font-weight: bold; font-size: 11px; background: ${isEnabled ? '#22c55e' : '#ef4444'}; color: #fff;
                        ">${isEnabled ? 'ĐANG BẬT' : 'ĐANG TẮT'}</button>
                    </div>
                    <div id="cju-status-text" style="color: #cbd5e1; font-size: 12px; line-height: 1.4;">
                        Đang khởi động...
                    </div>
                    <button id="cju-manual-btn" style="
                        padding: 6px; background: #2563eb; color: #fff; border: none;
                        border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;
                    ">▶ Bấm học ngay (Bỏ qua đợi)</button>
                `;

                document.body.appendChild(widget);

                document.getElementById('cju-toggle-btn').onclick = () => {
                    isEnabled = !isEnabled;
                    localStorage.setItem('cju_auto_enabled', isEnabled ? 'true' : 'false');
                    const btn = document.getElementById('cju-toggle-btn');
                    btn.innerText = isEnabled ? 'ĐANG BẬT' : 'ĐANG TẮT';
                    btn.style.background = isEnabled ? '#22c55e' : '#ef4444';
                    if (isEnabled) {
                        hasTriggeredClick = false;
                        if (waitSeconds <= 0) {
                            runAutoClick(true);
                        } else {
                            startCountdown();
                        }
                    } else {
                        if (waitTimer) clearInterval(waitTimer);
                        setWidgetMsg('⏸ Đã tạm dừng tự động (ĐANG TẮT).');
                    }
                };

                document.getElementById('cju-manual-btn').onclick = () => {
                    if (waitTimer) clearInterval(waitTimer);
                    hasTriggeredClick = false;
                    runAutoClick(true);
                };
            }

            function setWidgetMsg(msg) {
                const el = document.getElementById('cju-status-text');
                if (el) el.innerText = msg;
            }
        }

        // ---------------------------------------------------------------------
        // XỬ LÝ CỬA SỔ PHÁT VIDEO (popup.do & các iframe chứa video)
        // ---------------------------------------------------------------------
        if (isPlayerPage) {
            console.log('[CJU Auto] Cửa sổ xem video đang chạy:', window.location.href);

            let heartbeatTimer = setInterval(() => {
                localStorage.setItem('cju_video_heartbeat', Date.now().toString());
            }, 1500);

            function getAllDocs() {
                const docs = [document];
                const iframes = document.querySelectorAll('iframe');
                iframes.forEach(iframe => {
                    try {
                        if (iframe.contentDocument) {
                            docs.push(iframe.contentDocument);
                        }
                    } catch (e) {}
                });
                return docs;
            }

            const CONFIRM_WORDS = ['확인', '계속', '예', '출석확인', 'OK', 'ok', 'Ok', '학습시작', '이어보기'];
            setInterval(() => {
                getAllDocs().forEach(doc => {
                    const clickable = doc.querySelectorAll('button, a, input[type="button"], .btn, span');
                    clickable.forEach(el => {
                        if (el.offsetParent === null) return;
                        const text = (el.innerText || el.value || '').trim();

                        const isConfirm = CONFIRM_WORDS.some(kw => text === kw || text.includes(kw));
                        const isInsideDialog = el.closest('.modal, .popup, .dialog, .layer, .swal2-container, [role="dialog"], #alert, .ui-dialog');

                        if (isInsideDialog && isConfirm) {
                            console.log('[CJU Auto] Bấm xác nhận popup modal:', text);
                            el.click();
                        }
                    });
                });
            }, 800);

            let isDone = false;
            let lastPlayBtnClick = 0;

            function closeCurrentWindow() {
                console.log('[CJU Auto] Đang bấm nút 닫기 và đóng tab...');

                const findAndClickClose = (doc) => {
                    try {
                        const btns = Array.from(doc.querySelectorAll('*'))
                            .filter(el => el.children.length === 0 && (el.innerText || el.value || '').trim() === '닫기');
                        if (btns.length > 0) {
                            const c = btns[0].closest('button, a, input, div, span') || btns[0];
                            c.click();
                            return true;
                        }
                    } catch (e) {}
                    return false;
                };

                findAndClickClose(document);
                if (window.top !== window.self) {
                    try { findAndClickClose(window.top.document); } catch (e) {}
                }

                try { if (typeof pageWin.fn_close === 'function') pageWin.fn_close(); } catch (e) {}
                try { if (typeof pageWin.self.close === 'function') pageWin.self.close(); } catch (e) {}

                setTimeout(() => {
                    try { window.top.close(); } catch (e) {}
                    try { window.close(); } catch (e) {}
                }, 500);
            }

            function triggerFinish() {
                if (isDone) return;
                isDone = true;

                const waitCloseSeconds = getRandom(30, 60);
                console.log(`[CJU Auto] Video đã kết thúc! Chờ ngẫu nhiên ${waitCloseSeconds}s để hệ thống lưu điểm danh...`);

                clearInterval(heartbeatTimer);
                localStorage.removeItem('cju_video_heartbeat');

                setTimeout(() => {
                    console.log(`[CJU Auto] Đã hết ${waitCloseSeconds}s chờ! Đang đóng tab và chuyển bài mới.`);
                    localStorage.setItem('cju_last_finished', Date.now().toString());
                    closeCurrentWindow();
                }, waitCloseSeconds * 1000);
            }

            if (window.top === window.self) {
                window.addEventListener('storage', (e) => {
                    if (e.key === 'cju_last_finished') {
                        setTimeout(closeCurrentWindow, 1000);
                    }
                });
            }

            function clickPlayerPlayButtons(doc) {
                const now = Date.now();
                if (now - lastPlayBtnClick < 2000) return;

                const playSelectors = [
                    '.vjs-big-play-button',
                    '.vjs-play-control.vjs-paused',
                    '.jw-state-idle .jw-display-icon-container',
                    '.jw-icon-playback[aria-label="Play"]',
                    '.jw-icon-playback[aria-label="재생"]',
                    '.plyr__control--overlaid',
                    '.fp-play',
                    '.btn-play',
                    '.play-btn',
                    '.u-btn-play',
                    '.vc-pctrl-play-btn',
                    '.xgplayer-start',
                    '[title="재생"]',
                    '[title="Play"]',
                    '[aria-label="재생"]',
                    '[aria-label="Play"]',
                    '[data-plyr="play"]'
                ];

                for (const sel of playSelectors) {
                    const btn = doc.querySelector(sel);
                    if (btn && btn.offsetParent !== null) {
                        const label = (btn.getAttribute('title') || btn.getAttribute('aria-label') || btn.innerText || '').toLowerCase();
                        if (label.includes('pause') || label.includes('일시정지') || label.includes('정지')) continue;

                        console.log('[CJU Auto] Tự động bấm nút Play trên giao diện:', sel);
                        btn.click();
                        lastPlayBtnClick = now;
                        return;
                    }
                }
            }

            setInterval(() => {
                if (isDone) return;

                const docs = getAllDocs();

                docs.forEach(doc => {
                    const allTexts = Array.from(doc.querySelectorAll('*'))
                        .filter(el => el.children.length === 0 && /\d{2}:\d{2}\s*\/\s*\d{2}:\d{2}/.test(el.innerText || ''));

                    allTexts.forEach(el => {
                        const m = el.innerText.match(/(\d{2}:\d{2})\s*\/\s*(\d{2}:\d{2})/);
                        if (m && m[1] === m[2] && m[2] !== '00:00') {
                            triggerFinish();
                        }
                    });

                    const videos = doc.querySelectorAll('video');
                    if (videos.length === 0) {
                        clickPlayerPlayButtons(doc);
                        return;
                    }

                    videos.forEach(video => {
                        video.muted = true;
                        video.defaultMuted = true;
                        if (!video.hasAttribute('muted')) {
                            video.setAttribute('muted', '');
                        }

                        const hasValidDuration = Number.isFinite(video.duration) && video.duration > 10;
                        const isVideoEnded = video.ended || (hasValidDuration && video.currentTime >= video.duration - 1.5);

                        if (isVideoEnded && video.paused) {
                            triggerFinish();
                            return;
                        }

                        if (video.paused && !isVideoEnded) {
                            clickPlayerPlayButtons(doc);

                            const playPromise = video.play();
                            if (playPromise !== undefined) {
                                playPromise.catch(() => {
                                    clickPlayerPlayButtons(doc);
                                    try { video.click(); } catch (e) {}
                                });
                            }
                        }
                    });
                });
            }, 1000);
        }
    }
})();
