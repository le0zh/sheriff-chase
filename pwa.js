/* Install is optional. No gameplay decisions, permissions, or analytics live here. */
(() => {
  'use strict';
  const PAGE_VERSION = 'cc575679f14b6ffe05ae';
  const DOWNLOAD_MB = '46';
  const scope = new URL('./', location.href).href;
  const storageKey = `sheriff-install-dismissed:${scope}`;
  const $ = (id) => document.getElementById(id);
  const bar = $('pwa-bar');
  const dialog = $('pwa-help');
  const frame = $('game-frame');
  const media = matchMedia('(display-mode: standalone)');
  let phase = 'loading';
  let booted = false;
  let installed = navigator.standalone === true || media.matches;
  let dismissed = false;
  let deferredPrompt = null;
  let prompting = false;
  let registration = null;
  let registering = false;
  let previousFocus = null;
  let closingHistory = false;
  let cacheState = 'idle';
  try { dismissed = localStorage.getItem(storageKey) === '1'; } catch (_) { /* Private storage can be disabled. */ }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function instructions() {
    const items = isIOS ? [
      '打开浏览器的“分享”菜单；有些布局需要先点“更多”。',
      '选择“添加到主屏幕”。在 Safari 中若没有该选项，可在分享菜单底部的“编辑操作”里添加。',
      '如果出现“作为网页 App 打开”开关，请打开它，再点“添加”。'
    ] : [
      '查看浏览器菜单中的“安装应用”或“添加到主屏幕”等选项。',
      '按照浏览器提示确认；添加后，从桌面图标打开游戏。'
    ];
    $('pwa-steps').replaceChildren(...items.map((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    }));
    $('pwa-fallback').textContent = isIOS
      ? '其他 iPhone / iPad 浏览器也可能提供这个选项。如果当前浏览器或聊天 App 里没有，请用 Safari 打开此页再试。'
      : '若没有安装选项，当前浏览器可能不支持安装。你仍然可以直接在这里玩。';
  }
  instructions();

  function measureBar() {
    document.documentElement.style.setProperty('--pwa-space', `${bar.hidden ? 0 : Math.ceil(bar.getBoundingClientRect().height)}px`);
  }
  new ResizeObserver(measureBar).observe(bar);
  function render() {
    bar.hidden = !booted || phase !== 'ready' || installed;
    $('pwa-invite').hidden = dismissed;
    $('pwa-reopen').hidden = !dismissed;
    $('pwa-add').textContent = deferredPrompt ? '安装' : '查看方法';
    $('pwa-native-install').hidden = !deferredPrompt;
    $('pwa-add').disabled = prompting;
    $('pwa-native-install').disabled = prompting;
    measureBar();
  }
  function closeHelp(fromHistory = false) {
    if (!dialog.open) return;
    dialog.close();
    frame.inert = false;
    if (!fromHistory && history.state?.sheriffInstallHelp === true) {
      closingHistory = true;
      history.back();
    }
    if (previousFocus && !bar.hidden) previousFocus.focus({ preventScroll: true });
  }
  function openHelp() {
    if (dialog.open || closingHistory || phase !== 'ready' || installed || prompting) return;
    previousFocus = document.activeElement;
    frame.inert = true;
    dialog.showModal();
    try { history.pushState({ ...history.state, sheriffInstallHelp: true }, ''); } catch (_) { /* Help still works if history is unavailable. */ }
    $('pwa-close').focus({ preventScroll: true });
    queryCache();
  }
  window.addEventListener('popstate', () => {
    closingHistory = false;
    // Back closes help; Forward must not leave a stale help entry or start the game.
    if (dialog.open) closeHelp(true);
    if (history.state?.sheriffInstallHelp === true) {
      const state = { ...history.state };
      delete state.sheriffInstallHelp;
      history.replaceState(state, '');
    }
  });
  // A reload on a help history entry should never reopen an unsolicited modal.
  if (history.state?.sheriffInstallHelp === true) {
    const state = { ...history.state };
    delete state.sheriffInstallHelp;
    history.replaceState(state, '');
  }
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeHelp(); });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeHelp();
  });
  // Godot consumes Enter/Space globally; let DOM defaults run, but never feed these
  // keys into the engine when help or an install control owns keyboard focus.
  for (const name of ['keydown', 'keyup']) {
    document.addEventListener(name, (event) => {
      // The engine prevents Tab on its focused canvas. Provide the missing
      // title-screen route into the optional DOM controls before it sees Tab.
      if (name === 'keydown' && event.key === 'Tab' && event.target.id === 'canvas' && !bar.hidden) {
        event.preventDefault();
        event.stopImmediatePropagation();
        $(dismissed ? 'pwa-reopen' : (event.shiftKey ? 'pwa-dismiss' : 'pwa-add')).focus({ preventScroll: true });
        return;
      }
      if (!dialog.open && !bar.contains(event.target)) return;
      event.stopImmediatePropagation();
      if (dialog.open && event.key === 'Escape') {
        event.preventDefault();
        if (name === 'keydown') closeHelp();
      }
    }, true);
  }
  $('pwa-close').addEventListener('click', () => closeHelp());
  $('pwa-done').addEventListener('click', () => closeHelp());
  $('pwa-reopen').addEventListener('click', openHelp);
  $('pwa-dismiss').addEventListener('click', () => {
    dismissed = true;
    try { localStorage.setItem(storageKey, '1'); } catch (_) { /* Remains dismissed for this visit. */ }
    render();
    $('pwa-reopen').focus({ preventScroll: true });
  });

  async function install() {
    if (prompting || installed || phase !== 'ready') return;
    if (!deferredPrompt) { openHelp(); return; }
    const prompt = deferredPrompt;
    deferredPrompt = null;
    prompting = true;
    render();
    try {
      // Called synchronously inside the click gesture, before any await.
      const result = await prompt.prompt();
      const choice = result || await prompt.userChoice;
      if (choice?.outcome === 'accepted') {
        installed = true;
        closeHelp();
      }
    } catch (_) {
      // A consumed/unavailable browser event cannot be retried. Offer honest help.
      prompting = false;
      openHelp();
    } finally {
      prompting = false;
      render();
    }
  }
  $('pwa-add').addEventListener('click', install);
  $('pwa-native-install').addEventListener('click', install);
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    render();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    closeHelp();
    render();
  });
  media.addEventListener('change', (event) => {
    installed = event.matches || navigator.standalone === true;
    if (installed) closeHelp();
    render();
  });
  window.sheriffSetPhase = (next) => {
    phase = next;
    if (phase !== 'ready') closeHelp();
    render();
  };

  function setCacheStatus(state, text) {
    cacheState = state;
    $('pwa-status').textContent = text;
    $('pwa-retry').hidden = state !== 'failed';
  }
  function showCacheMessage(message) {
    if (!message || message.scope !== scope) return;
    if (message.type === 'CACHE_PROGRESS') {
      setCacheStatus('saving', `正在保存离线文件（${message.done}/${message.total}），可以先玩。首次约 ${DOWNLOAD_MB} MB。`);
    } else if (message.type === 'CACHE_FAILED') {
      setCacheStatus('failed', '离线文件没有完整保存，可能是网络或存储空间不足。可以联网继续玩。');
    } else if (message.type === 'CACHE_STATUS') {
      if (message.ready) {
        setCacheStatus('ready', '离线文件已完整保存。下次打开可离线玩；浏览器清理数据后需重新下载。');
      } else if (cacheState !== 'saving') {
        setCacheStatus('failed', '离线文件还不完整，请联网后重试保存。');
      }
      if (message.version !== PAGE_VERSION && message.ready) $('pwa-update').hidden = false;
    }
  }
  function queryCache() {
    const worker = registration?.active;
    if (!worker) return;
    const channel = new MessageChannel();
    const timer = setTimeout(() => channel.port1.close(), 6000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      showCacheMessage(event.data);
      channel.port1.close();
    };
    worker.postMessage({ type: 'CACHE_STATUS' }, [channel.port2]);
  }
  function watchWorker(worker) {
    if (!worker) return;
    const update = () => {
      if (worker.state === 'activated') { cacheState = 'idle'; queryCache(); }
      if (worker.state === 'installed' && registration?.active && registration.waiting) $('pwa-update').hidden = false;
      if (worker.state === 'redundant' && cacheState === 'saving') {
        if (registration?.active) { cacheState = 'idle'; queryCache(); }
        else setCacheStatus('failed', '离线文件没有完整保存，请联网后重试。现在仍可联网玩。');
      }
    };
    worker.addEventListener('statechange', update);
    update();
  }
  async function registerWorker() {
    if (registering || !booted) return;
    if (!('serviceWorker' in navigator) || !window.isSecureContext) {
      setCacheStatus('unavailable', '这个浏览器暂不能保存离线游戏；请联网玩。');
      return;
    }
    registering = true;
    setCacheStatus('saving', `正在准备离线文件，约 ${DOWNLOAD_MB} MB。可以先玩。`);
    try {
      registration = await navigator.serviceWorker.register(new URL('sw.js', scope), { scope, updateViaCache: 'none' });
      registration.addEventListener('updatefound', () => watchWorker(registration.installing));
      watchWorker(registration.installing);
      if (registration.waiting) $('pwa-update').hidden = false;
      if (registration.active) { cacheState = 'idle'; queryCache(); }
    } catch (_) {
      setCacheStatus('failed', '离线文件没有完整保存，请联网后重试。现在仍可联网玩。');
    } finally { registering = false; }
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (!registration || ![registration.installing, registration.waiting, registration.active].includes(event.source)) return;
      if (registration.active && event.source !== registration.active) {
        // An unsuccessful *update* never makes the already-cached active game
        // unavailable. Keep its status separate from the waiting release.
        if (event.data?.type === 'CACHE_STATUS' && event.data.ready) {
          $('pwa-update').textContent = '新版本已准备好。玩完后，关闭这个游戏的所有窗口，再打开即可更新。';
          $('pwa-update').hidden = false;
        } else if (event.data?.type === 'CACHE_FAILED') {
          $('pwa-update').textContent = '新版本暂未保存，当前版本仍可继续玩。下次联网打开时会再试。';
          $('pwa-update').hidden = false;
          queryCache();
        }
        return;
      }
      showCacheMessage(event.data);
    });
  }
  $('pwa-retry').addEventListener('click', () => {
    if (cacheState === 'saving') return;
    if (registration?.active) {
      setCacheStatus('saving', '正在重新保存离线文件，可以先玩。');
      registration.active.postMessage({ type: 'CACHE_REPAIR' });
    } else { registerWorker(); }
  });
  window.sheriffGameReady = () => {
    if (booted) return;
    booted = true;
    render();
    registerWorker();
  };
  window.addEventListener('online', () => {
    if (cacheState === 'failed' && !registration?.active) registerWorker();
  });
  render();
})();
