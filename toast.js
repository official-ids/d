/**
 * SERAVIEL LABS Toast System v2.0
 * 0 API • SVG Icons • Queue • Progress • Promises • Accessible
 */
(function() {
  'use strict';

  const DEFAULTS = {
    duration: 4000,
    position: 'top-right',
    theme: 'light',
    closeable: true,
    pauseOnHover: true,
    maxVisible: 5,
    queueLimit: 50,
    sound: false,
    animationSpeed: 300,
    showProgress: true,
    autoDismiss: true
  };

  let config = { ...DEFAULTS };
  const queue = [];
  const active = new Map();
  let containers = {};
  let idCounter = 0;

  const ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    loading: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.22-8.55"/></svg>'
  };

  function getContainer(pos) {
    if (!containers[pos]) {
      const el = document.createElement('div');
      el.className = 'toast-container';
      el.dataset.pos = pos;
      document.body.appendChild(el);
      containers[pos] = el;
    }
    return containers[pos];
  }

  function playSound(type) {
    if (!config.sound) return;
    // Простой WebAudio beep для 0-dependency
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = type === 'error' ? 300 : type === 'warning' ? 400 : 600;
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch(e) {}
  }

  function createToastEl(opts) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.dataset.type = opts.type || 'info';
    el.dataset.theme = opts.theme || config.theme;
    el.id = `toast-${opts.id}`;
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'polite');

    const iconHtml = opts.icon !== false ? (opts.icon || ICONS[opts.type] || ICONS.info) : '';
    const progressHtml = config.showProgress && opts.autoDismiss ? `<div class="toast__progress"><div class="toast__progress-bar" style="transition-duration:${opts.duration}ms"></div></div>` : '';
    const closeHtml = opts.closeable !== false ? `<button class="toast__close" aria-label="Close">${ICONS.close || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'}</button>` : '';
    
    let actionsHtml = '';
    if (opts.actions?.length) {
      actionsHtml = `<div class="toast__actions">${opts.actions.map(a => `<button class="toast__btn" data-act="${a.id || a.label}">${a.label}</button>`).join('')}</div>`;
    }

    el.innerHTML = `
      ${iconHtml ? `<div class="toast__icon">${iconHtml}</div>` : ''}
      <div class="toast__content">
        ${opts.title ? `<span class="toast__title">${opts.title}</span>` : ''}
        <span class="toast__message">${opts.message || ''}</span>
        ${actionsHtml}
      </div>
      ${closeHtml}
      ${progressHtml}
    `;

    if (opts.onShow) el._onShow = opts.onShow;
    if (opts.onHide) el._onHide = opts.onHide;
    if (opts.onAction) el._onAction = opts.onAction;

    el.querySelector('.toast__close')?.addEventListener('click', () => dismiss(opts.id));
    el.querySelectorAll('.toast__btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (el._onAction) el._onAction(btn.dataset.act);
        if (opts.autoDismiss !== false) dismiss(opts.id);
      });
    });

    if (config.pauseOnHover && opts.autoDismiss) {
      let pauseStart = 0;
      el.addEventListener('mouseenter', () => { pauseStart = Date.now(); el.querySelector('.toast__progress-bar')?.style.animationPlayState = 'paused'; });
      el.addEventListener('mouseleave', () => { 
        const paused = Date.now() - pauseStart; 
        if (paused > 0) { opts.duration += paused; el.querySelector('.toast__progress-bar')?.style.transitionDuration = `${opts.duration}ms`; }
      });
    }

    return el;
  }

  function show(opts) {
    if (queue.length >= config.queueLimit) queue.shift();
    queue.push(opts);
    processQueue();
    return opts.id;
  }

  function processQueue() {
    if (active.size >= config.maxVisible || queue.length === 0) return;
    const opts = queue.shift();
    const container = getContainer(opts.position || config.position);
    const el = createToastEl(opts);
    container.appendChild(el);
    active.set(opts.id, { el, opts, timer: null });

    requestAnimationFrame(() => {
      el.classList.add('toast--visible');
      if (el._onShow) el._onShow(opts.id);
      playSound(opts.type);

      if (opts.autoDismiss && opts.duration > 0) {
        const bar = el.querySelector('.toast__progress-bar');
        if (bar) bar.style.transform = 'scaleX(0)';
        
        opts.timer = setTimeout(() => dismiss(opts.id), opts.duration);
      }
    });
  }

  function dismiss(id) {
    const item = active.get(id);
    if (!item) return;
    const { el, opts, timer } = item;
    if (timer) clearTimeout(timer);
    
    el.classList.remove('toast--visible');
    el.classList.add('toast--hiding');
    if (el._onHide) el._onHide(id);

    setTimeout(() => {
      el.remove();
      active.delete(id);
      processQueue();
    }, config.animationSpeed);
  }

  function update(id, data) {
    const item = active.get(id);
    if (!item) return;
    const { el } = item;
    if (data.message) el.querySelector('.toast__message').textContent = data.message;
    if (data.title) el.querySelector('.toast__title').textContent = data.title;
    if (data.duration !== undefined) {
      item.opts.duration = data.duration;
      const bar = el.querySelector('.toast__progress-bar');
      if (bar) bar.style.transitionDuration = `${data.duration}ms`;
    }
  }

  function clear() {
    active.forEach((_, id) => dismiss(id));
    queue.length = 0;
  }

  function promise(promiseFn, opts = {}) {
    const id = show({ ...opts, type: 'loading', message: opts.loadingMessage || 'Processing...', duration: 0, autoDismiss: false });
    promiseFn.then(res => {
      update(id, { type: 'success', message: opts.successMessage || 'Completed successfully.', duration: opts.duration || config.duration });
      if (opts.onResolve) opts.onResolve(res);
    }).catch(err => {
      update(id, { type: 'error', message: opts.errorMessage || err.message || 'Failed.', duration: opts.duration || config.duration });
      if (opts.onReject) opts.onReject(err);
    });
    return id;
  }

  function progress(message, percent, opts = {}) {
    const id = opts.id || show({ ...opts, type: 'info', message, duration: 0, autoDismiss: false });
    const item = active.get(id);
    if (item) {
      item.opts.message = message;
      const bar = item.el.querySelector('.toast__progress-bar');
      if (bar) bar.style.transform = `scaleX(${percent / 100})`;
      if (percent >= 100 && opts.autoDismiss !== false) {
        setTimeout(() => dismiss(id), 500);
      }
    }
    return id;
  }

  function globalConfig(newCfg) {
    config = { ...config, ...newCfg };
  }

  const api = {
    show,
    success: (msg, opts) => show({ message: msg, type: 'success', ...opts }),
    error: (msg, opts) => show({ message: msg, type: 'error', ...opts }),
    warning: (msg, opts) => show({ message: msg, type: 'warning', ...opts }),
    info: (msg, opts) => show({ message: msg, type: 'info', ...opts }),
    loading: (msg, opts) => show({ message: msg, type: 'loading', duration: 0, ...opts }),
    dismiss,
    update,
    clear,
    promise,
    progress,
    config: globalConfig,
    getActive: () => Array.from(active.keys()),
    getQueue: () => [...queue]
  };

  window.toast = api;
  document.addEventListener('DOMContentLoaded', () => {});
})();