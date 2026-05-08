/**
 * SERAVIEL LABS Toast System v2.1
 * 0 API • SVG Icons • Queue • Progress • Promises • Accessible
 * Fixed: Optional chaining assignment bug, safe DOM access, robust global export
 */
(function(global) {
  'use strict';

  var DEFAULTS = {
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

  var config = Object.assign({}, DEFAULTS);
  var queue = [];
  var active = new Map();
  var containers = {};
  var idCounter = 0;

  var ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    loading: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.22-8.55"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
  };

  function getContainer(pos) {
    if (!containers[pos]) {
      var el = document.createElement('div');
      el.className = 'toast-container';
      el.dataset.pos = pos;
      document.body.appendChild(el);
      containers[pos] = el;
    }
    return containers[pos];
  }

  function playSound(type) {
    if (!config.sound) return;
    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      var ctx = new AudioCtx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
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
    var el = document.createElement('div');
    el.className = 'toast';
    el.dataset.type = opts.type || 'info';
    el.dataset.theme = opts.theme || config.theme;
    el.id = 'toast-' + opts.id;
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'polite');

    var iconHtml = opts.icon !== false ? (opts.icon || ICONS[opts.type] || ICONS.info) : '';
    var progressHtml = (config.showProgress && opts.autoDismiss) 
      ? '<div class="toast__progress"><div class="toast__progress-bar" style="transition-duration:' + opts.duration + 'ms"></div></div>' 
      : '';
    var closeHtml = opts.closeable !== false 
      ? '<button class="toast__close" aria-label="Close">' + ICONS.close + '</button>' 
      : '';
    
    var actionsHtml = '';
    if (opts.actions && opts.actions.length) {
      actionsHtml = '<div class="toast__actions">' + opts.actions.map(function(a) {
        return '<button class="toast__btn" data-act="' + (a.id || a.label) + '">' + a.label + '</button>';
      }).join('') + '</div>';
    }

    el.innerHTML = 
      (iconHtml ? '<div class="toast__icon">' + iconHtml + '</div>' : '') +
      '<div class="toast__content">' +
        (opts.title ? '<span class="toast__title">' + opts.title + '</span>' : '') +
        '<span class="toast__message">' + (opts.message || '') + '</span>' +
        actionsHtml +
      '</div>' +
      closeHtml +
      progressHtml;

    if (opts.onShow) el._onShow = opts.onShow;
    if (opts.onHide) el._onHide = opts.onHide;
    if (opts.onAction) el._onAction = opts.onAction;

    var closeBtn = el.querySelector('.toast__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() { dismiss(opts.id); });
    }

    var actionBtns = el.querySelectorAll('.toast__btn');
    for (var i = 0; i < actionBtns.length; i++) {
      actionBtns[i].addEventListener('click', function(e) {
        var btn = e.currentTarget;
        if (el._onAction) el._onAction(btn.dataset.act);
        if (opts.autoDismiss !== false) dismiss(opts.id);
      });
    }

    if (config.pauseOnHover && opts.autoDismiss) {
      var pauseStart = 0;
      el.addEventListener('mouseenter', function() { 
        pauseStart = Date.now(); 
        var bar = el.querySelector('.toast__progress-bar');
        if (bar) bar.style.animationPlayState = 'paused'; 
      });
      el.addEventListener('mouseleave', function() { 
        var paused = Date.now() - pauseStart; 
        if (paused > 0) { 
          opts.duration += paused; 
          var bar = el.querySelector('.toast__progress-bar');
          if (bar) bar.style.transitionDuration = opts.duration + 'ms'; 
        }
      });
    }

    return el;
  }

    // === ИСПРАВЛЕННАЯ ФУНКЦИЯ show ===
  function show(opts) {
    // Генерируем уникальный ID если нет
    if (!opts.id) {
      opts.id = String(++idCounter);
    }
    
    // Устанавливаем autoDismiss по умолчанию из конфига
    if (opts.autoDismiss === undefined) {
      opts.autoDismiss = config.autoDismiss;
    }
    
    // Устанавливаем duration по умолчанию
    if (opts.duration === undefined) {
      opts.duration = config.duration;
    }

    if (queue.length >= config.queueLimit) queue.shift();
    queue.push(opts);
    processQueue();
    return opts.id;
  }

  // === ИСПРАВЛЕННАЯ ФУНКЦИЯ createToastEl (частично) ===
  function createToastEl(opts) {
    var el = document.createElement('div');
    el.className = 'toast';
    el.dataset.type = opts.type || 'info';
    el.dataset.theme = opts.theme || config.theme;
    el.id = 'toast-' + opts.id;  // Теперь id будет уникальным
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'polite');

    var iconHtml = opts.icon !== false ? (opts.icon || ICONS[opts.type] || ICONS.info) : '';
    
    // Прогресс-бар только если autoDismiss включён
    var progressHtml = (config.showProgress && opts.autoDismiss !== false && opts.duration > 0) 
      ? '<div class="toast__progress"><div class="toast__progress-bar" style="transition-duration:' + opts.duration + 'ms"></div></div>' 
      : '';
    
    // Кнопка закрытия
    var closeHtml = opts.closeable !== false 
      ? '<button class="toast__close" aria-label="Close">' + ICONS.close + '</button>' 
      : '';
    
    var actionsHtml = '';
    if (opts.actions && opts.actions.length) {
      actionsHtml = '<div class="toast__actions">' + opts.actions.map(function(a) {
        return '<button class="toast__btn" data-act="' + (a.id || a.label) + '">' + a.label + '</button>';
      }).join('') + '</div>';
    }

    el.innerHTML = 
      (iconHtml ? '<div class="toast__icon">' + iconHtml + '</div>' : '') +
      '<div class="toast__content">' +
        (opts.title ? '<span class="toast__title">' + opts.title + '</span>' : '') +
        '<span class="toast__message">' + (opts.message || '') + '</span>' +
        actionsHtml +
      '</div>' +
      closeHtml +
      progressHtml;

    if (opts.onShow) el._onShow = opts.onShow;
    if (opts.onHide) el._onHide = opts.onHide;
    if (opts.onAction) el._onAction = opts.onAction;

    // === ИСПРАВЛЕНИЕ: Кнопка закрытия ===
    var closeBtn = el.querySelector('.toast__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() { 
        dismiss(opts.id);  // Теперь правильно закрывает
      });
    }

    // Кнопки действий
    var actionBtns = el.querySelectorAll('.toast__btn');
    for (var i = 0; i < actionBtns.length; i++) {
      actionBtns[i].addEventListener('click', function(e) {
        var btn = e.currentTarget;
        if (el._onAction) el._onAction(btn.dataset.act);
        if (opts.autoDismiss !== false) dismiss(opts.id);
      });
    }

    // Пауза при наведении
    if (config.pauseOnHover && opts.autoDismiss !== false) {
      var pauseStart = 0;
      el.addEventListener('mouseenter', function() { 
        pauseStart = Date.now(); 
        var bar = el.querySelector('.toast__progress-bar');
        if (bar) bar.style.animationPlayState = 'paused'; 
      });
      el.addEventListener('mouseleave', function() { 
        var paused = Date.now() - pauseStart; 
        if (paused > 0) { 
          opts.duration += paused; 
          var bar = el.querySelector('.toast__progress-bar');
          if (bar) bar.style.transitionDuration = opts.duration + 'ms'; 
        }
      });
    }

    return el;
  }

  // === ИСПРАВЛЕННАЯ ФУНКЦИЯ processQueue ===
  function processQueue() {
    if (active.size >= config.maxVisible || queue.length === 0) return;
    var opts = queue.shift();
    var container = getContainer(opts.position || config.position);
    var el = createToastEl(opts);
    container.appendChild(el);
    active.set(opts.id, { el: el, opts: opts, timer: null });

    requestAnimationFrame(function() {
      el.classList.add('toast--visible');
      if (el._onShow) el._onShow(opts.id);
      playSound(opts.type);

      // === АВТОЗАКРЫТИЕ ===
      if (opts.autoDismiss !== false && opts.duration > 0) {
        // Запускаем прогресс-бар
        var bar = el.querySelector('.toast__progress-bar');
        if (bar) {
          // Форсируем перерисовку для анимации
          bar.offsetHeight; // eslint-disable-line no-unused-expressions
          bar.style.transform = 'scaleX(0)';
        }
        
        // Устанавливаем таймер
        opts.timer = setTimeout(function() { 
          dismiss(opts.id); 
        }, opts.duration);
      }
    });
  }

  function dismiss(id) {
    var item = active.get(id);
    if (!item) return;
    var el = item.el;
    var opts = item.opts;
    var timer = item.timer;
    
    if (timer) clearTimeout(timer);
    
    el.classList.remove('toast--visible');
    el.classList.add('toast--hiding');
    if (el._onHide) el._onHide(id);

    setTimeout(function() {
      el.remove();
      active.delete(id);
      processQueue();
    }, config.animationSpeed);
  }

  function update(id, data) {
    var item = active.get(id);
    if (!item) return;
    var el = item.el;
    if (data.message) {
      var msgEl = el.querySelector('.toast__message');
      if (msgEl) msgEl.textContent = data.message;
    }
    if (data.title) {
      var titleEl = el.querySelector('.toast__title');
      if (titleEl) titleEl.textContent = data.title;
    }
    if (data.duration !== undefined) {
      item.opts.duration = data.duration;
      var bar = el.querySelector('.toast__progress-bar');
      if (bar) bar.style.transitionDuration = data.duration + 'ms';
    }
  }

  function clear() {
    active.forEach(function(_, id) { dismiss(id); });
    queue.length = 0;
  }

  function promise(promiseFn, opts) {
    opts = opts || {};
    var id = show(Object.assign({}, opts, { type: 'loading', message: opts.loadingMessage || 'Processing...', duration: 0, autoDismiss: false }));
    promiseFn.then(function(res) {
      update(id, { type: 'success', message: opts.successMessage || 'Completed successfully.', duration: opts.duration || config.duration });
      if (opts.onResolve) opts.onResolve(res);
    }).catch(function(err) {
      update(id, { type: 'error', message: opts.errorMessage || (err && err.message) || 'Failed.', duration: opts.duration || config.duration });
      if (opts.onReject) opts.onReject(err);
    });
    return id;
  }

  function progress(message, percent, opts) {
    opts = opts || {};
    var id = opts.id || show(Object.assign({}, opts, { type: 'info', message: message, duration: 0, autoDismiss: false }));
    var item = active.get(id);
    if (item) {
      item.opts.message = message;
      var bar = item.el.querySelector('.toast__progress-bar');
      if (bar) bar.style.transform = 'scaleX(' + (percent / 100) + ')';
      if (percent >= 100 && opts.autoDismiss !== false) {
        setTimeout(function() { dismiss(id); }, 500);
      }
    }
    return id;
  }

  function globalConfig(newCfg) {
    config = Object.assign({}, config, newCfg);
  }

  var api = {
    show: show,
    success: function(msg, opts) { return show(Object.assign({ message: msg, type: 'success' }, opts)); },
    error: function(msg, opts) { return show(Object.assign({ message: msg, type: 'error' }, opts)); },
    warning: function(msg, opts) { return show(Object.assign({ message: msg, type: 'warning' }, opts)); },
    info: function(msg, opts) { return show(Object.assign({ message: msg, type: 'info' }, opts)); },
    loading: function(msg, opts) { return show(Object.assign({ message: msg, type: 'loading', duration: 0 }, opts)); },
    dismiss: dismiss,
    update: update,
    clear: clear,
    promise: promise,
    progress: progress,
    config: globalConfig,
    getActive: function() { return Array.from(active.keys()); },
    getQueue: function() { return queue.slice(); }
  };

  global.toast = api;
})(window);