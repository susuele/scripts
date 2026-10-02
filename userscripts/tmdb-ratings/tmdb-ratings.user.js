// ==UserScript==
// @name         TMDB Ratings Enhancer
// @namespace    doveboy_js
// @version      6.0.1
// @description  TMDB列表页显示TMDB评分；TMDB详情页海报下方显示IMDb与豆瓣评分
// @author       白鸽男孩
// @license      Zlib/Libpng License
// @icon         data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAACE1BMVEVWZHBtd4A1TF4dOVAVM0t1foQpQlcLK0V2foQLK0UdOVAVM0sUMksDJUECJEECI0AEJkIILEYILUYILUcHLUcGLUcGLEcGLEgFLEgELEgEK0gDJkIDIz8gS1hNiYFco5RZpJhTo5pOop1JoZ9EoKI+n6Q5nqc0nakvnKwqm64lm7AhmrIcmbQXmLcSlbcLfaAFRmUpVV13upyAzqt5zK5yyrJrybVkyLhexrtXxb5QxMJJwsVDwcg8wMs2v84vvtEpvNQju9cdutoXud0RueAKps8ETm8DJEAMMEdqpYyHz6h+y6p3ya1xyLBqx7NjxbZcxLpWw71PwsBIwMNCv8Y7vsk1vcwvvM8putIjudUduNgXt9oQtt0Kt+MFkr0DLksBI0AgSFWDw52FzacXt9sKteEEq9kDQmMhSVaExJ6FzKcWt9oErNoDRGQCJEAPNElxrZGHzqgFmcQDMU81Y2Z+xKGAzat4y65xybFryLRkx7ddxbpWxL5Qw8FJwsRCwMc8v8o1vs0vvdApvNMjutYdudkXuNwRuOAKrtgEWn0FJ0IuXWNdno5otJ9ktaNes6ZYsqhSsatMsK5Gr7FArrQ6rbY0rLkvq7wqqr4kqcEfqMMap8YUpMYNj7QGVXYDJ0MILEUQN00QOU4POE8OOE8NOFAMOFALOFEKN1EJN1IIN1IHN1MGN1MFNVIEK0cDJD////8aMDTXAAAADHRSTlMAD3bZ+w6U+Q741/rWbuZkAAAAAWJLR0SwQ2SuxAAAAAd0SU1FB+QDCRYML2Rma/kAAAEsSURBVDjLY2BgZGJm4cEKWJiZGBkYWNnYeflwAF52Ng4GJk4+XpyAj5OJgYsXL+Bi4ObDJ8/HzcCDXwHPUFLALyAoJCwsIiIiKiYuAQSSUtIyKApk5eQVFJWUVVTV1DU0tbR1dPX0DZAU8BsaGZuYmplbWFpZ29ja2Ts4Ojm7uLq5wxTweXh6efv4+vkHBAYFh4SGhUdERkXHxMbFu0MVJCQmJaMrSIlJTUuXgSnIyMxCV5Adk5qTC1OQl19QiMWKomKYFbx5JaVl5RWVVdU1tXX1DY1NzS2tbe0dne4Ib3Z19/T29U+YOGnylKnTps+YOWv2nLnz5qME1IKFixYvWbJ02fIVK1auWrV6zdp169GCOg8K3KFgEEY3HgUEkz3BjEMw63EQyryEsj8Ad3V9dC1JE+0AAAAldEVYdGRhdGU6Y3JlYXRlADIwMjAtMDMtMDlUMjI6MTI6NDcrMDE6MDDPqcePAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDIwLTAzLTA5VDIyOjEyOjQ3KzAxOjAwvvR/MwAAAFd6VFh0UmF3IHByb2ZpbGUgdHlwZSBpcHRjAAB4nOPyDAhxVigoyk/LzEnlUgADIwsuYwsTIxNLkxQDEyBEgDTDZAMjs1Qgy9jUyMTMxBzEB8uASKBKLgDqFxF08kI1lQAAAABJRU5ErkJggg==
// @match        https://www.themoviedb.org/*
// @match        https://www.themoviedb.org/*/*
// @match        https://www.themoviedb.org/*/*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @connect      themoviedb.org
// @connect      www.themoviedb.org
// @connect      api.themoviedb.org
// @connect      omdbapi.com
// @connect      www.omdbapi.com
// @connect      api.douban.com
// @run-at       document-idle
// @homepageURL  https://github.com/susuele/scripts/tree/main/userscripts/tmdb-ratings
// @supportURL   https://github.com/susuele/scripts/issues
// @downloadURL  https://raw.githubusercontent.com/susuele/scripts/main/userscripts/tmdb-ratings/tmdb-ratings.user.js
// @updateURL    https://raw.githubusercontent.com/susuele/scripts/main/userscripts/tmdb-ratings/tmdb-ratings.user.js
// ==/UserScript==
// Original download: https://update.greasyfork.org/scripts/591783/TMDB%E8%AF%84%E5%88%86%E5%A2%9E%E5%BC%BA%E5%A4%A7%E5%B8%88.user.js
// Original update: https://update.greasyfork.org/scripts/591783/TMDB%E8%AF%84%E5%88%86%E5%A2%9E%E5%BC%BA%E5%A4%A7%E5%B8%88.meta.js

(() => {
    'use strict';

    const VERSION = '6.0.1';

    const CACHE_PREFIX = 'tmdb-ratings-master-v10:';
    const LIST_PROCESSED_ATTR = 'data-tmdb-ratings-master-v10-processed';
    const DETAIL_ROW_ID = 'tmdb-ratings-master-v10-detail-row';

    /*
     * 存储键。
     * 继续保留旧 OMDb 键名，以兼容之前通过菜单保存的 OMDb Key。
     */
    const OMDB_KEY_STORAGE = 'tmdb-pr-v6-omdb-key';
    const TMDB_CREDENTIAL_STORAGE = 'tmdb-ratings-master-tmdb-credential';

    // 凭据由用户在脚本管理器中配置，不随源码发布。
    const DOUBAN_KEY_STORAGE = 'tmdb-ratings-master-douban-key';

    const CACHE_TTL = {
        tmdb: 30 * 24 * 60 * 60 * 1000,
        imdbId: 30 * 24 * 60 * 60 * 1000,
        imdb: 7 * 24 * 60 * 60 * 1000,
        douban: 7 * 24 * 60 * 60 * 1000
    };

    const pendingRequests = new Map();

    let currentUrl = location.href;
    let scanTimer = null;
    let positionTimer = null;
    let currentPosterImage = null;

    injectStyle();
    registerMenus();
    initialize();

    function injectStyle() {
        const style = document.createElement('style');

        style.textContent = `
            .tmdb-ratings-master-list-rating {
                position: absolute !important;
                top: 8px !important;
                left: 8px !important;
                z-index: 50 !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                min-width: 42px !important;
                height: 28px !important;
                padding: 0 8px !important;
                box-sizing: border-box !important;
                border: 1px solid rgba(255,255,255,.28) !important;
                border-radius: 6px !important;
                background: rgba(3,37,65,.95) !important;
                color: #fff !important;
                font: 700 14px/1 Arial,sans-serif !important;
                box-shadow: 0 2px 8px rgba(0,0,0,.28) !important;
                pointer-events: none !important;
            }

            .tmdb-ratings-master-list-rating.is-na {
                color: #cbd5df !important;
            }

            /*
             * 评分栏插入 body 并绝对定位。
             * 因而不会影响 TMDB 原生详情页 flex 布局。
             */
            #tmdb-ratings-master-v10-detail-row {
                position: absolute !important;
                z-index: 10000 !important;
                display: grid !important;
                grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
                gap: 8px !important;
                box-sizing: border-box !important;
                pointer-events: auto !important;
            }

            #tmdb-ratings-master-v10-detail-row .tmdb-ratings-master-badge {
                min-width: 0 !important;
                height: 40px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                gap: 5px !important;
                padding: 0 9px !important;
                box-sizing: border-box !important;
                border: 1px solid rgba(255,255,255,.20) !important;
                border-radius: 6px !important;
                color: #fff !important;
                text-decoration: none !important;
                font: 600 13px/1 Arial,sans-serif !important;
                box-shadow: 0 2px 7px rgba(0,0,0,.30) !important;
                overflow: hidden !important;
                transition: transform .15s ease, filter .15s ease !important;
            }

            #tmdb-ratings-master-v10-detail-row .tmdb-ratings-master-badge:hover {
                color: #fff !important;
                transform: translateY(-1px) !important;
                filter: brightness(1.12) !important;
            }

            #tmdb-ratings-master-v10-detail-row .tmdb-ratings-master-badge[aria-disabled="true"] {
                cursor: default !important;
                opacity: .86 !important;
            }

            #tmdb-ratings-master-v10-detail-row .label {
                overflow: hidden !important;
                text-overflow: ellipsis !important;
                white-space: nowrap !important;
            }

            #tmdb-ratings-master-v10-detail-row .value {
                flex: 0 0 auto !important;
                margin-left: 4px !important;
                font-weight: 800 !important;
                white-space: nowrap !important;
            }

            #tmdb-ratings-master-v10-detail-row .imdb {
                background: #202020 !important;
            }

            #tmdb-ratings-master-v10-detail-row .imdb .label {
                color: #f5c518 !important;
                font-weight: 800 !important;
            }

            #tmdb-ratings-master-v10-detail-row .douban {
                background: #087b3e !important;
            }

            @media (max-width: 700px) {
                #tmdb-ratings-master-v10-detail-row .tmdb-ratings-master-badge {
                    height: 38px !important;
                    padding: 0 7px !important;
                    font-size: 12px !important;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function registerMenus() {
        GM_registerMenuCommand('设置 OMDb API Key', async () => {
            const oldValue = String(
                GM_getValue(OMDB_KEY_STORAGE, '') || ''
            );

            const input = prompt(
                '请输入 OMDb API Key：\n\n' +
                '申请地址：https://www.omdbapi.com/apikey.aspx',
                oldValue
            );

            if (input === null) return;

            const apiKey = input.trim();

            if (!apiKey) {
                GM_deleteValue(OMDB_KEY_STORAGE);
                alert('OMDb API Key 已删除。');
                resetDetailRow();
                scanPage();
                return;
            }

            try {
                const result = await requestJson(
                    `https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&i=tt0111161&r=json`
                );

                if (result?.Response !== 'True') {
                    throw new Error(result?.Error || '验证失败');
                }

                GM_setValue(OMDB_KEY_STORAGE, apiKey);
                clearCacheByPrefixPart('imdb:');

                alert(
                    `OMDb API Key 验证成功。\n` +
                    `${result.Title}\nIMDb：${result.imdbRating}`
                );

                resetDetailRow();
                scanPage();
            } catch (error) {
                alert(
                    `OMDb API Key 验证失败：\n${error.message}\n\n` +
                    '本次不会保存该 Key。'
                );
            }
        });

        GM_registerMenuCommand('检查 OMDb API Key', async () => {
            const apiKey = String(
                GM_getValue(OMDB_KEY_STORAGE, '') || ''
            ).trim();

            if (!apiKey) {
                alert('尚未设置 OMDb API Key。');
                return;
            }

            try {
                const result = await requestJson(
                    `https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&i=tt0111161&r=json`
                );

                if (result?.Response !== 'True') {
                    throw new Error(result?.Error || '验证失败');
                }

                alert(
                    `OMDb API Key 有效。\n` +
                    `${result.Title}：IMDb ${result.imdbRating}`
                );
            } catch (error) {
                alert(`OMDb API Key 无效：\n${error.message}`);
            }
        });

        GM_registerMenuCommand('设置 TMDB API 凭据', () => {
            const oldValue = String(
                GM_getValue(TMDB_CREDENTIAL_STORAGE, '') || ''
            );

            const input = prompt(
                '请输入 TMDB API 凭据：\n\n' +
                '可以填写任意一种：\n' +
                '1. API Read Access Token（通常以 eyJ 开头）\n' +
                '2. API Key（通常为约 32 位短字符串）\n\n' +
                '获取地址：https://www.themoviedb.org/settings/api',
                oldValue
            );

            if (input === null) return;

            const credential = input
                .trim()
                .replace(/^Bearer\s+/i, '');

            if (!credential) {
                GM_deleteValue(TMDB_CREDENTIAL_STORAGE);
                alert('TMDB API 凭据已删除。');
                return;
            }

            GM_setValue(TMDB_CREDENTIAL_STORAGE, credential);
            clearCacheByPrefixPart('imdb-id:');

            alert(
                'TMDB API 凭据已保存。\n' +
                '请执行“清除评分缓存并重新获取”，然后刷新页面。'
            );
        });

        GM_registerMenuCommand('检查 TMDB API 凭据', async () => {
            const credential = String(
                GM_getValue(TMDB_CREDENTIAL_STORAGE, '') || ''
            )
                .trim()
                .replace(/^Bearer\s+/i, '');

            if (!credential) {
                alert('尚未设置 TMDB API 凭据。');
                return;
            }

            const isReadAccessToken = credential.startsWith('eyJ');

            const url = isReadAccessToken
                ? 'https://api.themoviedb.org/3/movie/597/external_ids'
                : `https://api.themoviedb.org/3/movie/597/external_ids?api_key=${encodeURIComponent(credential)}`;

            const headers = {
                Accept: 'application/json;charset=utf-8'
            };

            if (isReadAccessToken) {
                headers.Authorization = `Bearer ${credential}`;
            }

            try {
                const response = await request({
                    method: 'GET',
                    url,
                    headers,
                    responseType: 'json'
                });

                const body = parseResponseJson(response);

                if (response.status < 200 || response.status >= 300) {
                    throw new Error(
                        `HTTP ${response.status}` +
                        `${body?.status_message ? `：${body.status_message}` : ''}`
                    );
                }

                if (!/^tt\d{7,10}$/i.test(String(body?.imdb_id || ''))) {
                    throw new Error('TMDB API 响应中未包含 IMDb ID');
                }

                alert(
                    'TMDB API 凭据有效。\n' +
                    `泰坦尼克号 IMDb ID：${body.imdb_id}`
                );
            } catch (error) {
                alert(`TMDB API 凭据无效：\n${error.message}`);
            }
        });

        GM_registerMenuCommand('设置豆瓣 API Key', () => {
            const oldValue = String(GM_getValue(DOUBAN_KEY_STORAGE, '') || '');
            const input = prompt('请输入你有权使用的豆瓣 API Key（留空删除）：', oldValue);
            if (input === null) return;
            const apiKey = input.trim();
            if (apiKey) GM_setValue(DOUBAN_KEY_STORAGE, apiKey);
            else GM_deleteValue(DOUBAN_KEY_STORAGE);
            clearCacheByPrefixPart('douban:');
            resetDetailRow();
            scanPage();
            alert(apiKey ? '豆瓣 API Key 已保存，接口有效性以实际请求结果为准。' : '豆瓣 API Key 已删除。');
        });

        GM_registerMenuCommand('清除评分缓存并重新获取', () => {
            let count = 0;

            for (const key of GM_listValues()) {
                if (key.startsWith(CACHE_PREFIX)) {
                    GM_deleteValue(key);
                    count += 1;
                }
            }

            resetAllInjectedElements();
            scanPage();

            alert(`已清除 ${count} 条缓存，正在重新获取评分。`);
        });

        GM_registerMenuCommand(`脚本版本：${VERSION}`, () => {
            alert(`TMDB Ratings Enhancer ${VERSION}`);
        });
    }

    function initialize() {
        scanPage();

        const observer = new MutationObserver(() => {
            if (location.href !== currentUrl) {
                currentUrl = location.href;
                resetAllInjectedElements();
            }

            clearTimeout(scanTimer);
            scanTimer = setTimeout(scanPage, 250);
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });

        window.addEventListener('resize', scheduleDetailRowPosition);
        window.addEventListener('scroll', scheduleDetailRowPosition, true);

        window.addEventListener('popstate', () => {
            currentUrl = location.href;
            resetAllInjectedElements();

            clearTimeout(scanTimer);
            scanTimer = setTimeout(scanPage, 300);
        });
    }

    function scanPage() {
        const media = getCurrentDetailMedia();

        if (
            media &&
            document.querySelector('.header.large, .header_poster_wrapper')
        ) {
            addDetailRatings(media);
            return;
        }

        addListRatings();
    }

    function getCurrentDetailMedia() {
        const match = location.pathname.match(
            /^\/(movie|tv)\/(\d+)(?:-[^/]+)?\/?$/
        );

        return match
            ? {
                type: match[1],
                id: match[2]
            }
            : null;
    }

    function findMainPosterImage() {
        const selectors = [
            '.header.large .poster_wrapper img[src*="/t/p/"]',
            '.header_poster_wrapper ~ .poster_wrapper img[src*="/t/p/"]',
            '.poster_wrapper img[src*="/t/p/"]'
        ];

        const candidates = [];

        for (const selector of selectors) {
            candidates.push(...document.querySelectorAll(selector));
        }

        for (const image of candidates) {
            if (image.closest('script, template, .ac_results, footer')) {
                continue;
            }

            const source = [
                image.currentSrc,
                image.src,
                image.getAttribute('data-src'),
                image.getAttribute('srcset')
            ].filter(Boolean).join(' ');

            if (/w45_|w66_|w92_|w94_|w154_|profile/i.test(source)) {
                continue;
            }

            const rect = image.getBoundingClientRect();

            if (
                rect.width >= 150 &&
                rect.height >= 220 &&
                rect.height > rect.width * 1.15 &&
                rect.top < 900
            ) {
                return image;
            }
        }

        return null;
    }

    function positionDetailRow() {
        const row = document.getElementById(DETAIL_ROW_ID);
        const poster = currentPosterImage || findMainPosterImage();

        if (!row || !poster || !row.isConnected) return;

        const rect = poster.getBoundingClientRect();

        row.style.left = `${Math.round(rect.left + window.scrollX)}px`;
        row.style.top = `${Math.round(rect.top + window.scrollY + rect.height + 10)}px`;
        row.style.width = `${Math.round(rect.width)}px`;
    }

    function scheduleDetailRowPosition() {
        clearTimeout(positionTimer);
        positionTimer = setTimeout(positionDetailRow, 30);
    }

    async function addDetailRatings(media) {
        const mediaKey = `${media.type}:${media.id}`;
        const oldRow = document.getElementById(DETAIL_ROW_ID);

        if (oldRow?.isConnected && oldRow.dataset.mediaKey === mediaKey) {
            currentPosterImage = findMainPosterImage() || currentPosterImage;
            scheduleDetailRowPosition();
            return;
        }

        resetDetailRow();

        const poster = findMainPosterImage();

        if (!poster) {
            setTimeout(() => {
                if (!document.getElementById(DETAIL_ROW_ID)) {
                    addDetailRatings(media);
                }
            }, 1000);

            return;
        }

        currentPosterImage = poster;

        const row = document.createElement('div');
        row.id = DETAIL_ROW_ID;
        row.dataset.mediaKey = mediaKey;

        row.innerHTML = `
            <a class="tmdb-ratings-master-badge imdb"
               aria-disabled="true"
               title="正在获取 IMDb 评分">
                <span class="label">IMDb</span>
                <span class="value">...</span>
            </a>

            <a class="tmdb-ratings-master-badge douban"
               aria-disabled="true"
               title="正在获取豆瓣评分">
                <span class="label">豆瓣</span>
                <span class="value">...</span>
            </a>
        `;

        document.body.appendChild(row);

        positionDetailRow();
        requestAnimationFrame(positionDetailRow);
        setTimeout(positionDetailRow, 300);
        setTimeout(positionDetailRow, 1000);

        const imdbBadge = row.querySelector('.imdb');
        const doubanBadge = row.querySelector('.douban');

        const imdbIdResult = await getImdbId(media);

        if (!row.isConnected || row.dataset.mediaKey !== mediaKey) return;

        if (!imdbIdResult.id) {
            updateDetailBadge(
                imdbBadge,
                'N/A',
                '',
                `IMDb ID 获取失败：${imdbIdResult.error || '未知原因'}`
            );

            updateDetailBadge(
                doubanBadge,
                'N/A',
                '',
                `豆瓣查询依赖 IMDb ID：${imdbIdResult.error || '未知原因'}`
            );

            return;
        }

        const imdbId = imdbIdResult.id;

        const [imdbResult, doubanResult] = await Promise.all([
            getImdbRating(imdbId),
            getDoubanRating(imdbId)
        ]);

        if (!row.isConnected || row.dataset.mediaKey !== mediaKey) return;

        updateDetailBadge(
            imdbBadge,
            imdbResult.rating || 'N/A',
            `https://www.imdb.com/title/${imdbId}/`,
            imdbResult.error
                ? `IMDb：${imdbResult.error}`
                : `IMDb 评分：${imdbResult.rating}`
        );

        updateDetailBadge(
            doubanBadge,
            doubanResult.rating || 'N/A',
            doubanResult.url || '',
            doubanResult.error
                ? `豆瓣：${doubanResult.error}`
                : `豆瓣评分：${doubanResult.rating}`
        );

        positionDetailRow();
    }

    function updateDetailBadge(element, value, url, title) {
        element.querySelector('.value').textContent = value;
        element.title = title || '';

        if (url) {
            element.href = url;
            element.target = '_blank';
            element.rel = 'noopener noreferrer';
            element.removeAttribute('aria-disabled');
        } else {
            element.removeAttribute('href');
            element.removeAttribute('target');
            element.setAttribute('aria-disabled', 'true');
        }
    }

    async function getImdbId(media) {
        const cacheKey = `imdb-id:${media.type}:${media.id}`;
        const cached = readCache(cacheKey, CACHE_TTL.imdbId);

        if (cached?.id) {
            return cached;
        }

        let credential = String(
            GM_getValue(TMDB_CREDENTIAL_STORAGE, '') || ''
        )
            .trim()
            .replace(/^Bearer\s+/i, '');

        if (!credential) {
            return {
                id: '',
                error: '未设置 TMDB API 凭据'
            };
        }

        const isReadAccessToken = credential.startsWith('eyJ');

        const url = isReadAccessToken
            ? `https://api.themoviedb.org/3/${media.type}/${media.id}/external_ids`
            : `https://api.themoviedb.org/3/${media.type}/${media.id}/external_ids?api_key=${encodeURIComponent(credential)}`;

        const headers = {
            Accept: 'application/json;charset=utf-8'
        };

        if (isReadAccessToken) {
            headers.Authorization = `Bearer ${credential}`;
        }

        try {
            const response = await request({
                method: 'GET',
                url,
                headers,
                responseType: 'json'
            });

            const data = parseResponseJson(response);

            if (response.status < 200 || response.status >= 300) {
                return {
                    id: '',
                    error:
                        `TMDB API HTTP ${response.status}` +
                        `${data?.status_message ? `：${data.status_message}` : ''}`
                };
            }

            const imdbId = String(data?.imdb_id || '').trim();

            if (!/^tt\d{7,10}$/i.test(imdbId)) {
                return {
                    id: '',
                    error: 'TMDB API 返回成功，但该条目没有 IMDb ID'
                };
            }

            const result = { id: imdbId };
            writeCache(cacheKey, result);

            return result;
        } catch (error) {
            return {
                id: '',
                error: `TMDB API 请求失败：${error.message}`
            };
        }
    }

    async function getImdbRating(imdbId) {
        const cacheKey = `imdb:${imdbId}`;
        const cached = readCache(cacheKey, CACHE_TTL.imdb);

        if (cached?.rating) {
            return cached;
        }

        const apiKey = String(
            GM_getValue(OMDB_KEY_STORAGE, '') || ''
        ).trim();

        if (!apiKey) {
            return {
                rating: '',
                error: '未设置 OMDb API Key'
            };
        }

        try {
            const data = await requestJson(
                `https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&i=${encodeURIComponent(imdbId)}&r=json`
            );

            if (data?.Response !== 'True') {
                return {
                    rating: '',
                    error: data?.Error || 'OMDb 未返回有效影片资料'
                };
            }

            if (!data.imdbRating || data.imdbRating === 'N/A') {
                return {
                    rating: '',
                    error: 'OMDb 已找到影片，但 IMDb 暂无评分'
                };
            }

            const result = {
                rating: String(data.imdbRating)
            };

            writeCache(cacheKey, result);
            return result;
        } catch (error) {
            return {
                rating: '',
                error: `OMDb 请求失败：${error.message}`
            };
        }
    }

    async function getDoubanRating(imdbId) {
        const apiKey = String(GM_getValue(DOUBAN_KEY_STORAGE, '') || '').trim();
        if (!apiKey) return { rating: '', url: '', error: '请先在脚本菜单设置豆瓣 API Key' };
        const cacheKey = `douban:${imdbId}`;
        const cached = readCache(cacheKey, CACHE_TTL.douban);

        if (cached?.rating || cached?.url) {
            return cached;
        }

        try {
            const response = await request({
                method: 'POST',
                url: `https://api.douban.com/v2/movie/imdb/${encodeURIComponent(imdbId)}`,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    Accept: 'application/json'
                },
                data: `apikey=${encodeURIComponent(apiKey)}`,
                responseType: 'json'
            });

            if (response.status < 200 || response.status >= 300) {
                throw new Error(`豆瓣接口 HTTP ${response.status}`);
            }

            const data = parseResponseJson(response);

            const subject = Array.isArray(data?.subjects)
                ? data.subjects[0]
                : data;

            let url = subject?.alt || subject?.url || subject?.mobile_url || '';

            if (url) {
                url = url
                    .replace(/^http:/i, 'https:')
                    .replace('/movie/', '/subject/');
            }

            const rawRating =
                subject?.rating?.average ??
                subject?.rating?.value ??
                subject?.score ??
                '';

            const rating = Number(rawRating) > 0
                ? Number(rawRating).toFixed(1)
                : '';

            if (!rating && !url) {
                return {
                    rating: '',
                    url: '',
                    error: data?.msg || data?.message || '豆瓣没有返回对应条目'
                };
            }

            const result = { rating, url };

            if (rating || url) {
                writeCache(cacheKey, result);
            }

            return {
                ...result,
                error: rating ? '' : '已找到豆瓣条目，但暂无评分'
            };
        } catch (error) {
            return {
                rating: '',
                url: '',
                error: error.message
            };
        }
    }

    function addListRatings() {
        const cards = [
            ...new Set([
                ...document.querySelectorAll('[data-object-id]'),
                ...document.querySelectorAll('.card.style_1'),
                ...document.querySelectorAll('.card.style_2')
            ])
        ];

        for (const card of cards) {
            if (card.getAttribute(LIST_PROCESSED_ATTR) === '1') continue;
            if (card.closest('script, template')) continue;

            const media = getMediaFromCard(card);
            const posterBox = getPosterBoxFromCard(card);

            if (!media || !posterBox) continue;

            card.setAttribute(LIST_PROCESSED_ATTR, '1');

            if (getComputedStyle(posterBox).position === 'static') {
                posterBox.style.position = 'relative';
            }

            const badge = document.createElement('span');
            badge.className = 'tmdb-ratings-master-list-rating';
            badge.textContent = '...';

            posterBox.appendChild(badge);

            getTmdbRating(media).then(result => {
                if (!badge.isConnected) return;

                badge.textContent = result.rating || 'N/A';
                badge.title = result.error
                    ? `TMDB：${result.error}`
                    : `TMDB 评分：${result.rating}`;

                badge.classList.toggle('is-na', !result.rating);
            });
        }
    }

    function getMediaFromCard(card) {
        const id = card.getAttribute('data-object-id');
        const type = card.getAttribute('data-object-type');

        if (id && /^(movie|tv)$/i.test(type || '')) {
            return {
                type: type.toLowerCase(),
                id
            };
        }

        const link = card.querySelector(
            'a[href^="/movie/"], a[href^="/tv/"]'
        );

        const match = link?.getAttribute('href')?.match(
            /^\/(movie|tv)\/(\d+)/
        );

        return match
            ? {
                type: match[1],
                id: match[2]
            }
            : null;
    }

    function getPosterBoxFromCard(card) {
        const image = card.querySelector(
            'img.poster, .image img[src*="/t/p/"], img[src*="media.themoviedb.org/t/p/"]'
        );

        return (
            image?.closest('.image') ||
            image?.closest('.image_content') ||
            image?.parentElement ||
            null
        );
    }

    async function getTmdbRating(media) {
        const cacheKey = `tmdb:${media.type}:${media.id}`;
        const cached = readCache(cacheKey, CACHE_TTL.tmdb);

        if (cached?.rating) {
            return cached;
        }

        try {
            const html = await requestText(
                `https://www.themoviedb.org/${media.type}/${media.id}`
            );

            const rating = extractTmdbRating(html);

            if (!rating) {
                return {
                    rating: '',
                    error: '暂无 TMDB 评分'
                };
            }

            const result = { rating };
            writeCache(cacheKey, result);

            return result;
        } catch (error) {
            return {
                rating: '',
                error: error.message
            };
        }
    }

    function extractTmdbRating(html) {
        const source = String(html || '');

        const percentMatch = source.match(
            /class=["'][^"']*user_score_chart[^"']*["'][^>]*data-percent=["'](\d+(?:\.\d+)?)/i
        );

        if (percentMatch) {
            return (Number(percentMatch[1]) / 10).toFixed(1);
        }

        const jsonMatch = source.match(
            /"ratingValue"\s*:\s*"?(\d+(?:\.\d+)?)"?/i
        );

        if (jsonMatch) {
            return Number(jsonMatch[1]).toFixed(1);
        }

        return '';
    }

    function requestText(url) {
        return deduplicateRequest(`text:${url}`, () =>
            request({
                method: 'GET',
                url,
                headers: {
                    Accept: 'text/html,application/xhtml+xml'
                }
            }).then(response => {
                if (response.status < 200 || response.status >= 300) {
                    throw new Error(`HTTP ${response.status}`);
                }

                return response.responseText;
            })
        );
    }

    function requestJson(url) {
        return deduplicateRequest(`json:${url}`, () =>
            request({
                method: 'GET',
                url,
                headers: {
                    Accept: 'application/json'
                },
                responseType: 'json'
            }).then(response => {
                if (response.status < 200 || response.status >= 300) {
                    const body = parseResponseJson(response);
                    throw new Error(
                        `HTTP ${response.status}` +
                        `${body?.Error ? `：${body.Error}` : ''}`
                    );
                }

                return parseResponseJson(response);
            })
        );
    }

    function request(options) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                timeout: 15000,
                ...options,
                onload: resolve,
                onerror: () => reject(new Error('网络请求失败')),
                ontimeout: () => reject(new Error('请求超时')),
                onabort: () => reject(new Error('请求已取消'))
            });
        });
    }

    function parseResponseJson(response) {
        if (response?.response && typeof response.response === 'object') {
            return response.response;
        }

        try {
            return JSON.parse(response?.responseText || '{}');
        } catch (_) {
            return {};
        }
    }

    function deduplicateRequest(key, factory) {
        if (pendingRequests.has(key)) {
            return pendingRequests.get(key);
        }

        const promise = factory().finally(() => {
            pendingRequests.delete(key);
        });

        pendingRequests.set(key, promise);
        return promise;
    }

    function readCache(key, ttl) {
        const stored = GM_getValue(CACHE_PREFIX + key, null);

        if (!stored || typeof stored !== 'object') {
            return null;
        }

        if (!stored.savedAt || Date.now() - stored.savedAt > ttl) {
            GM_deleteValue(CACHE_PREFIX + key);
            return null;
        }

        return stored.data || null;
    }

    function writeCache(key, data) {
        /*
         * 不缓存纯失败结果。
         * 因此网络/API 临时失败时，刷新后仍可重新尝试。
         */
        if (!data || (!data.id && !data.rating && !data.url)) {
            return;
        }

        GM_setValue(CACHE_PREFIX + key, {
            savedAt: Date.now(),
            data
        });
    }

    function clearCacheByPrefixPart(part) {
        for (const key of GM_listValues()) {
            if (key.startsWith(CACHE_PREFIX + part)) {
                GM_deleteValue(key);
            }
        }
    }

    function resetDetailRow() {
        document.querySelectorAll(
            [
                '#tmdb-ratings-master-v10-detail-row',
                '#tmdb-pr-v9-detail-ratings',
                '#tmdb-pr-v8-detail-ratings',
                '#tmdb-pr-v7-detail-ratings',
                '#tmdb-pr-v6-detail-ratings'
            ].join(',')
        ).forEach(node => node.remove());

        currentPosterImage = null;
    }

    function resetAllInjectedElements() {
        resetDetailRow();

        document.querySelectorAll(
            '.tmdb-ratings-master-list-rating, .tmdb-pr-list-rating'
        ).forEach(node => node.remove());

        document.querySelectorAll(
            `[${LIST_PROCESSED_ATTR}]`
        ).forEach(node => node.removeAttribute(LIST_PROCESSED_ATTR));
    }
})();
