// ==UserScript==
// @name         Mynavi 2027 Company Blocker
// @namespace    https://job.mynavi.jp/
// @version      1.1.1
// @description  Add a hide button to each company result on Mynavi and remember hidden companies.
// @match        https://job.mynavi.jp/27/pc/search/query.html*
// @match        https://job.mynavi.jp/27/pc/corpinfo/searchCorpListByGenCond/*
// @grant        none
// @run-at       document-idle
// @author       yonagatsuki
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'tm:mynavi2027:hiddenCompanies:v4';
  const BUTTON_CLASS = 'tm-mynavi-hide-company';
  const STYLE_ID = 'tm-mynavi-company-blocker-style';
  let didInitialRepair = false;

  const isSearchResultPage = () => {
    const path = location.pathname;
    return (
      path === '/27/pc/search/query.html' ||
      path.startsWith('/27/pc/corpinfo/searchCorpListByGenCond/')
    );
  };

  if (!isSearchResultPage()) return;

 const TEXT = {
   hide: '今後表示しない',
   titlePrefix: '今後非表示：',
   panelList: '非表示リスト',
   clear: 'クリア',
   countPrefix: '非表示件数：',
   countSuffix: '件',
   empty: '現在、非表示の企業はありません。',
   clearConfirm: '非表示にした企業をすべて削除しますか？',
   close: '閉じる',
   remove: '削除',
 };

  const getHiddenMap = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  };

  const saveHiddenMap = (map) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  };

  const getUniqueHiddenNames = () => {
    return Array.from(new Set(Object.values(getHiddenMap()).filter(Boolean))).sort();
  };

  const normalizeText = (text) => {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .replace(/\bPICK UP\b/gi, '')
      .trim();
  };

  const isCompanyDetailLink = (link) => {
    if (!link || !link.href) return false;

    let url;
    try {
      url = new URL(link.href, location.href);
    } catch (_) {
      return false;
    }

    const path = url.pathname;
    return (
      path.includes('/corpinfo/display') ||
      /\/pc\/search\/corp\d+\//.test(path) ||
      /\/pc\/corpinfo\/corp\d+\//.test(path) ||
      url.searchParams.has('corpId') ||
      url.searchParams.has('corp_id') ||
      url.searchParams.has('corp')
    );
  };

  const getCompanyNameFromCard = (card) => {
    const link =
      card.querySelector('a[id^="corpNameLink"]') ||
      card.querySelector('h3.withCheck a[href]') ||
      Array.from(card.querySelectorAll('h2 a[href], h3 a[href], h4 a[href]')).find(isCompanyDetailLink);

    if (!link) return '';
    return normalizeText(link.textContent);
  };

  const getCorpIdFromCard = (card) => {
    const cardId = card?.id?.match(/^div(\d+)$/)?.[1];
    if (cardId) return cardId;

    const checkedInput = card?.querySelector?.('input[name="batchEntryCorp"][value]');
    if (checkedInput?.value) return checkedInput.value;

    const corpLink = card?.querySelector?.('a[href*="/corp"]') ||
      card?.querySelector?.('a[onclick*="corp_id"]');
    const corpId = corpLink?.href?.match(/corp(\d+)/)?.[1];
    return corpId || '';
  };

  const getCompanyKeyFromCard = (card) => {
    const corpIdFromCard = getCorpIdFromCard(card);
    if (corpIdFromCard) return `corp:${corpIdFromCard}`;

    const link = Array.from(card.querySelectorAll('a[href]')).find(isCompanyDetailLink);
    if (!link) return `name:${getCompanyNameFromCard(card)}`;

    try {
      const url = new URL(link.href, location.href);
      const corpId =
        url.searchParams.get('corpId') ||
        url.searchParams.get('corp_id') ||
        url.searchParams.get('corp') ||
        (url.pathname.match(/corp(\d+)/) || [])[1];

      if (corpId) return `corp:${corpId}`;
      return `url:${url.pathname + url.search}`;
    } catch (_) {
      return `name:${getCompanyNameFromCard(card)}`;
    }
  };

  const hideCompanyCard = (card, companyName) => {
    if (!card) return;
    card.style.display = 'none';
    card.dataset.tmMynaviHidden = companyName;
  };

  const repairPartiallyHiddenCards = () => {
    for (const element of document.querySelectorAll('[data-tm-mynavi-hidden]')) {
      if (element.style.display === 'none') {
        element.style.display = '';
      }
      delete element.dataset.tmMynaviHidden;
    }
  };

  const cleanupStrayButtons = () => {
    for (const button of document.querySelectorAll(`.${BUTTON_CLASS}`)) {
      const card = button.closest('.boxSearchresultEach.corp, .boxSearchresultEach[id^="div"]');
      if (!card || !button.closest('.tm-mynavi-hide-company-wrap')) {
        button.remove();
      }
    }

    for (const wrap of document.querySelectorAll('.tm-mynavi-hide-company-wrap')) {
      if (!wrap.querySelector(`.${BUTTON_CLASS}`)) wrap.remove();
    }
  };

  const addStyle = () => {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${BUTTON_CLASS} {
        display: inline-block;
        padding: 4px 8px;
        border: 1px solid #d93025;
        border-radius: 4px;
        background: #fff;
        color: #d93025;
        cursor: pointer;
        font-size: 12px;
        font-weight: 700;
        line-height: 1.4;
        vertical-align: middle;
      }

      .${BUTTON_CLASS}:hover {
        background: #d93025;
        color: #fff;
      }

      .tm-mynavi-hide-company-wrap {
        display: flex;
        justify-content: flex-end;
        margin: 6px 0 0;
        padding-right: 166px;
      }

      #tm-mynavi-blocker-panel {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        display: flex;
        gap: 8px;
        align-items: center;
        padding: 8px 10px;
        border: 1px solid #bbb;
        border-radius: 6px;
        background: #fff;
        color: #333;
        box-shadow: 0 2px 12px rgba(0, 0, 0, .18);
        font-size: 12px;
      }

      #tm-mynavi-blocker-panel button,
      #tm-mynavi-blocker-modal button {
        padding: 3px 8px;
        border: 1px solid #777;
        border-radius: 4px;
        background: #f7f7f7;
        color: #333;
        cursor: pointer;
        font-size: 12px;
      }

      #tm-mynavi-blocker-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        background: rgba(0, 0, 0, .28);
      }

      #tm-mynavi-blocker-modal {
        position: fixed;
        right: 16px;
        bottom: 64px;
        z-index: 2147483647;
        width: min(420px, calc(100vw - 32px));
        max-height: min(520px, calc(100vh - 96px));
        overflow: auto;
        padding: 14px;
        border: 1px solid #aaa;
        border-radius: 6px;
        background: #fff;
        color: #222;
        box-shadow: 0 6px 24px rgba(0, 0, 0, .24);
        font-size: 13px;
      }

      #tm-mynavi-blocker-modal h2 {
        margin: 0 0 10px;
        font-size: 16px;
      }

      #tm-mynavi-blocker-modal ul {
        margin: 0 0 12px;
        padding: 0;
        list-style: none;
      }

      #tm-mynavi-blocker-modal li {
        display: flex;
        gap: 8px;
        align-items: center;
        justify-content: space-between;
        padding: 7px 0;
        border-top: 1px solid #eee;
      }
    `;
    document.head.appendChild(style);
  };

  const closeModal = () => {
    document.getElementById('tm-mynavi-blocker-modal')?.remove();
    document.getElementById('tm-mynavi-blocker-modal-backdrop')?.remove();
  };

  const removeCompanyByName = (companyName) => {
    const map = getHiddenMap();
    for (const key of Object.keys(map)) {
      if (map[key] === companyName || key === `name:${companyName}`) {
        delete map[key];
      }
    }
    saveHiddenMap(map);
    updatePanelCount();
    showBlockList();
  };

  const showBlockList = () => {
    closeModal();

    const backdrop = document.createElement('div');
    backdrop.id = 'tm-mynavi-blocker-modal-backdrop';
    backdrop.addEventListener('click', closeModal);

    const modal = document.createElement('div');
    modal.id = 'tm-mynavi-blocker-modal';

    const title = document.createElement('h2');
    title.textContent = TEXT.panelList;
    modal.appendChild(title);

    const names = getUniqueHiddenNames();
    if (!names.length) {
      const empty = document.createElement('p');
      empty.textContent = TEXT.empty;
      modal.appendChild(empty);
    } else {
      const list = document.createElement('ul');
      for (const name of names) {
        const item = document.createElement('li');
        const label = document.createElement('span');
        label.textContent = name;

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.textContent = TEXT.remove;
        removeButton.addEventListener('click', () => removeCompanyByName(name));

        item.append(label, removeButton);
        list.appendChild(item);
      }
      modal.appendChild(list);
    }

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = TEXT.close;
    closeButton.addEventListener('click', closeModal);
    modal.appendChild(closeButton);

    document.body.append(backdrop, modal);
  };

  const addControlPanel = () => {
    if (document.getElementById('tm-mynavi-blocker-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'tm-mynavi-blocker-panel';

    const count = document.createElement('span');
    count.id = 'tm-mynavi-blocker-count';

    const manageButton = document.createElement('button');
    manageButton.type = 'button';
    manageButton.textContent = TEXT.panelList;
    manageButton.addEventListener('click', showBlockList);

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.textContent = TEXT.clear;
    clearButton.addEventListener('click', () => {
      if (!confirm(TEXT.clearConfirm)) return;
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    });

    panel.append(count, manageButton, clearButton);
    document.body.appendChild(panel);
    updatePanelCount();
  };

  const updatePanelCount = () => {
    const count = document.getElementById('tm-mynavi-blocker-count');
    if (!count) return;
    count.textContent = `${TEXT.countPrefix}${getUniqueHiddenNames().length}${TEXT.countSuffix}`;
  };

  const findCompanyCards = () => {
    return Array.from(document.querySelectorAll('.boxSearchresultEach.corp, .boxSearchresultEach[id^="div"]'))
      .filter((card) => getCompanyNameFromCard(card));
  };

  const processSearchResults = () => {
    addStyle();
    addControlPanel();
    cleanupStrayButtons();

    if (!didInitialRepair) {
      didInitialRepair = true;
      repairPartiallyHiddenCards();
    }

    const hiddenMap = getHiddenMap();

    for (const card of findCompanyCards()) {
      const companyName = getCompanyNameFromCard(card);
      const companyKey = getCompanyKeyFromCard(card);

      if (hiddenMap[companyKey] || hiddenMap[`name:${companyName}`]) {
        hideCompanyCard(card, companyName);
        continue;
      }

      if (card.querySelector(`.${BUTTON_CLASS}`)) continue;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = BUTTON_CLASS;
      button.textContent = TEXT.hide;
      button.title = `${TEXT.titlePrefix}${companyName}`;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const nextMap = getHiddenMap();
        nextMap[companyKey] = companyName;
        nextMap[`name:${companyName}`] = companyName;
        saveHiddenMap(nextMap);
        hideCompanyCard(card, companyName);
        updatePanelCount();
      });

      const head = card.querySelector('.boxSearchresultEach_head') || card;
      const wrap = document.createElement('div');
      wrap.className = 'tm-mynavi-hide-company-wrap';
      wrap.appendChild(button);
      head.appendChild(wrap);
    }
  };

  const debounce = (fn, delay) => {
    let timer = null;
    return () => {
      clearTimeout(timer);
      timer = setTimeout(fn, delay);
    };
  };

  processSearchResults();

  const observer = new MutationObserver(debounce(processSearchResults, 250));
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
