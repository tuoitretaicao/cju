// ==UserScript==
// @name         CJU HIVE (Bản Quyền)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Tool
// @author       Assistant
// @match        https://hive.cju.ac.kr/*
// @match        http://hive.cju.ac.kr/*
// @connect      .dew
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_addElement
// @grant        unsafeWindow
// @grant        window.close
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    console.log('[CJU] Script bắt đầu chạy');

    const _encodedUrl = "aHR0cHM6Ly9janVrZXkuaGFpdnUxMDI0LndvcmtlcnMuZGV2";
    const SERVER_URL = atob(_encodedUrl);
    const url = window.location.href;
    const pageWin = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    const nativePrompt = pageWin.prompt.bind(pageWin);
    const nativeAlert = pageWin.alert.bind(pageWin);

    console.log('[CJU] URL:', url);
    console.log('[CJU] Is main page:', url.includes('/classroom/main.do'));

    if (url.includes('/common/greeting.do') || url.includes('/login')) {
        console.log('[CJU] Bỏ qua trang login/greeting');
        return;
    }

    let deviceId = GM_getValue("CJU_BROWSER_ID", "");
    if (!deviceId) {
        deviceId = "DEV-" + Math.random().toString(36).substring(2, 10).toUpperCase() + "-" + Date.now().toString(36).toUpperCase();
        GM_setValue("CJU_BROWSER_ID", deviceId);
    }
    console.log('[CJU] Device ID:', deviceId);

    GM_registerMenuCommand("🔑 Nhập / Đổi Key CJU HIVE", function() {
        const currentKey = localStorage.getItem("CJU_TEMP_SESSION_KEY") || "";
        const input = nativePrompt("🔑 Nhập mã Key kích hoạt CJU HIVE của bạn:", currentKey);
        if (input !== null && input.trim() !== "") {
            sessionStorage.setItem("CJU_SESSION_ALIVE", "true");
            localStorage.setItem("CJU_TEMP_SESSION_KEY", input.trim());
            console.log('[CJU] Lưu Key, reload trang');
            location.reload();
        }
    });

    const isMainPage = url.includes('/classroom/main.do');
    let activeKey = "";

    if (isMainPage && window.top === window.self) {
        console.log('[CJU] Đây là trang main');

        const isSessionAlive = sessionStorage.getItem("CJU_SESSION_ALIVE");
        const savedKey = localStorage.getItem("CJU_TEMP_SESSION_KEY");

        console.log('[CJU] Session alive:', isSessionAlive);
        console.log('[CJU] Saved key:', savedKey ? '(có)' : '(không)');

        if (!isSessionAlive || !savedKey) {
            localStorage.removeItem("CJU_TEMP_SESSION_KEY");
            const input = nativePrompt("🔑 Vui lòng đăng nhập Key kích hoạt để sử dụng CJU HIVE Auto:\n(Lưu ý: Mỗi Key chỉ dùng cho 1 trình duyệt)");
            if (input && input.trim() !== "") {
                activeKey = input.trim();
                sessionStorage.setItem("CJU_SESSION_ALIVE", "true");
                localStorage.setItem("CJU_TEMP_SESSION_KEY", activeKey);
                console.log('[CJU] Lưu Key mới');
            } else {
                console.log('[CJU] Người dùng hủy nhập Key');
                return;
            }
        } else {
            activeKey = savedKey;
            console.log('[CJU] Dùng Key đã lưu');
        }
    } else {
        activeKey = localStorage.getItem("CJU_TEMP_SESSION_KEY") || "";
        console.log('[CJU] Trang video, lấy Key từ storage');
    }

    if (!activeKey) {
        console.log('[CJU] Không có Key, dừng');
        return;
    }

    console.log('[CJU] Active key:', activeKey.substring(0, 5) + '***');

    function runRemoteTool(codeText) {
        console.log('[CJU] Bắt đầu chạy code Auto, độ dài:', codeText.length);

        pageWin.__CJU_AUTO_LOADED__ = false;

        try {
            const s = document.createElement('script');
            s.textContent = codeText;
            (document.head || document.documentElement).appendChild(s);
            s.remove();
            console.log('[CJU] Chạy code bằng script tag thành công');
            return;
        } catch (e) {
            console.error('[CJU] Lỗi script tag:', e);
        }

        try {
            if (typeof GM_addElement === 'function') {
                const el = GM_addElement('script', { textContent: codeText });
                if (el) el.remove();
                console.log('[CJU] Chạy code bằng GM_addElement thành công');
                return;
            }
        } catch (e) {
            console.error('[CJU] Lỗi GM_addElement:', e);
        }

        try {
            const fn = new Function(codeText);
            fn();
            console.log('[CJU] Chạy code bằng Function thành công');
        } catch (e) {
            console.error('[CJU] Lỗi Function:', e);
        }
    }

    console.log('[CJU] Gọi API kiểm tra Key...');

    GM_xmlhttpRequest({
        method: "GET",
        url: SERVER_URL + "?t=" + Date.now(),
        headers: {
            "x-license-key": activeKey,
            "x-device-id": deviceId
        },
        onload: function(res) {
            console.log('[CJU] API Response status:', res.status);
            console.log('[CJU] Response length:', res.responseText.length);
            console.log('[CJU] Response first 100 chars:', res.responseText.substring(0, 100));

            if (res.status === 200) {
                if (res.responseText.includes("__CJU_AUTO_LOADED__")) {
                    console.log('[CJU] ✅ Key hợp lệ, chạy code Auto');
                    runRemoteTool(res.responseText);
                } else {
                    console.error('[CJU] ❌ Response không chứa marker');
                    if (isMainPage && window.top === window.self) {
                        nativeAlert("❌ Lỗi: Server trả về code không hợp lệ");
                    }
                }
            } else {
                console.error('[CJU] API error:', res.responseText);
                if (isMainPage && window.top === window.self) {
                    nativeAlert(res.responseText || "❌ Key không hợp lệ hoặc đã bị khóa!");
                    sessionStorage.removeItem("CJU_SESSION_ALIVE");
                    localStorage.removeItem("CJU_TEMP_SESSION_KEY");
                }
            }
        },
        onerror: function(err) {
            console.error('[CJU] API connection error:', err);
            if (isMainPage && window.top === window.self) {
                nativeAlert("⚠️ Không thể kết nối tới Server Key!\nKiểm tra Worker Cloudflare của bạn.");
            }
        },
        ontimeout: function() {
            console.error('[CJU] API timeout');
            if (isMainPage && window.top === window.self) {
                nativeAlert("⏱️ Timeout kết nối Server!");
            }
        }
    });
})();
