/**
 * SERAVIEL LABS Presentation Monitor Bot
 * Vercel Serverless Function + Cron
 * 
 * Задачи:
 * 1. Проверяет presentation-manifest.json каждые 5 минут
 * 2. Отправляет уведомление в Telegram, если найдена новая презентация
 * 3. Формат: Фото + Текст + Кнопка
 * 
 * @see https://core.telegram.org/bots/api
 */

const TELEGRAM_API = 'https://api.telegram.org';
const DEFAULT_TIMEOUT = 8000;
const DEFAULT_TIME_WINDOW = 10 * 60 * 1000;
const MAX_BATCH_SIZE = 5;
const BASE_URL = process.env.BASE_URL || 'https://seraviel-labs.vercel.app';
const PHOTO_URL = process.env.PHOTO_URL || `${BASE_URL}/icon/bot-pres.png`;
const KV_TTL = 24 * 60 * 60; // 24 часа для дедупликации

// Валидация окружения
function validateEnv() {
  const required = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing env vars: ${missing.join(', ')}`);
  }
}

/**
 * Helper: Fetch с таймаутом и обработкой ошибок
 */
async function safeFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || DEFAULT_TIMEOUT);
  
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'SeravielMonitorBot/1.0',
        ...options.headers
      }
    });
    clearTimeout(timeout);
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error(`Request timeout: ${url}`);
    }
    throw err;
  }
}

/**
 * Helper: Telegram Bot API запрос с ретраем
 */
async function tgRequest(method, params, retries = 2) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const url = `${TELEGRAM_API}/bot${token}/${method}`;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await safeFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      if (res.ok) return res.result;
      throw new Error(res.description || 'Telegram API error');
    } catch (err) {
      if (attempt === retries) throw err;
      // Экспоненциальная задержка перед ретраем
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
}

/**
 * Валидация пути презентации
 */
function isValidPresentationPath(path) {
  if (!path || typeof path !== 'string') return false;
  // Блокируем опасные протоколы
  if (/^(javascript|data|vbscript|file):/i.test(path)) return false;
  // Разрешаем относительные и абсолютные пути на своём домене
  if (path.startsWith('/')) return true;
  if (path.startsWith('./') || path.startsWith('../')) return true;
  // Разрешаем только HTTPS на тот же хост
  try {
    const url = new URL(path, BASE_URL);
    return url.protocol === 'https:' && url.hostname === new URL(BASE_URL).hostname;
  } catch {
    return false;
  }
}

/**
 * Санитизация текста для Telegram HTML-режима
 * Разрешены только безопасные теги: b, i, u, s, code, pre, a
 */
function sanitizeForTelegram(text) {
  if (!text) return '';
  // Сначала экранируем все спецсимволы
  let safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Затем разрешаем безопасные теги (белый список)
  const allowedTags = ['b', 'i', 'u', 's', 'code', 'pre', 'a'];
  allowedTags.forEach(tag => {
    // Восстанавливаем только корректные теги из белого списка
    safe = safe.replace(
      new RegExp(`&lt;(${tag})(\\s[^>]*)?&gt;`, 'g'),
      `<$1$2>`
    );
    safe = safe.replace(
      new RegExp(`&lt;/((${allowedTags.join('|')}))&gt;`, 'g'),
      `</$1>`
    );
  });
  
  // Дополнительно валидируем href в <a>
  safe = safe.replace(/<a\s+href="([^"]*)"/gi, (match, href) => {
    if (isValidPresentationPath(href)) {
      return match;
    }
    return '&lt;a href="#"';
  });
  
  return safe;
}

/**
 * Отправка уведомления о презентации
 */
async function sendPresentationAlert(pres, chatId, kv) {
  const presUrl = isValidPresentationPath(pres.path) 
    ? new URL(pres.path, BASE_URL).href 
    : '#';
  
  const safeTitle = sanitizeForTelegram(pres.title);
  const safeDesc = sanitizeForTelegram(pres.description || 'Без описания');
  const category = pres.category ? ` #${sanitizeForTelegram(pres.category)}` : '';
  
  const caption = `🔔 <b>Новая презентация</b>${category}

<b>Название:</b> ${safeTitle}
<b>Ссылка:</b> <a href="${presUrl}">${presUrl}</a>

━━━━━━━━━━━━━━━━━━━━━━

<i>${safeDesc}</i>`;

  // Интерактивные кнопки
  const keyboard = {
    inline_keyboard: [
      [
        { text: '🔗 Открыть', url: presUrl },
        { text: '📋 Копировать', callback_data: `copy:${pres.id}` }
      ],
      [
        { text: '⏰ Позже', callback_data: `snooze:${pres.id}:1h` },
        { text: '🔕 Не в этой категории', callback_data: `mute_cat:${pres.category}` }
      ]
    ]
  };

  try {
    // Попытка отправить с фото
    await tgRequest('sendPhoto', {
      chat_id: chatId,
      photo: PHOTO_URL,
      caption: caption,
      parse_mode: 'HTML',
      reply_markup: JSON.stringify(keyboard),
      disable_notification: false
    });
    console.log(`✓ Sent photo alert: ${pres.id}`);
    return true;
  } catch (err) {
    console.warn(`⚠️ Photo failed: ${err.message}, falling back to text`);
    
    // Фолбэк: текст без фото
    await tgRequest('sendMessage', {
      chat_id: chatId,
      text: caption,
      parse_mode: 'HTML',
      reply_markup: JSON.stringify(keyboard)
    });
    return true;
  }
}

/**
 * Пакетная отправка уведомлений
 */
async function sendBatchAlerts(presentations, chatId, kv) {
  if (presentations.length === 0) return 0;
  
  // Если презентаций много — группируем в одно сообщение
  if (presentations.length > 1 && presentations.length <= MAX_BATCH_SIZE) {
    const items = presentations.map(p => {
      const url = isValidPresentationPath(p.path) 
        ? new URL(p.path, BASE_URL).href 
        : '#';
      return `• <a href="${url}">${sanitizeForTelegram(p.title)}</a>`;
    }).join('\n');
    
    const caption = `🔔 <b>Новые презентации</b> (${presentations.length})\n\n${items}`;
    
    const keyboard = {
      inline_keyboard: [[
        { text: '📂 Открыть каталог', url: `${BASE_URL}/presentation` }
      ]]
    };
    
    await tgRequest('sendMessage', {
      chat_id: chatId,
      text: caption,
      parse_mode: 'HTML',
      reply_markup: JSON.stringify(keyboard)
    });
    
    // Отмечаем все как отправленные
    for (const p of presentations) {
      await kv?.set(`notified:${p.id}`, '1', { ex: KV_TTL });
    }
    return presentations.length;
  }
  
  // Отправляем по одной
  let sent = 0;
  for (const pres of presentations) {
    try {
      await sendPresentationAlert(pres, chatId, kv);
      await kv?.set(`notified:${pres.id}`, '1', { ex: KV_TTL });
      sent++;
      // Небольшая задержка между сообщениями
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error(`Failed to send ${pres.id}: ${err.message}`);
    }
  }
  return sent;
}

/**
 * Проверка, было ли уже уведомление
 */
async function isAlreadyNotified(presId, kv) {
  if (!kv) return false; // Без KV — не можем дедуплицировать
  try {
    const val = await kv.get(`notified:${presId}`);
    return val === '1';
  } catch {
    return false;
  }
}

/**
 * Health check endpoint
 */
async function handleHealth(req, res) {
  const status = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      hasToken: !!process.env.TELEGRAM_BOT_TOKEN,
      hasChatId: !!process.env.TELEGRAM_CHAT_ID,
      hasKV: !!process.env.KV_REST_API_URL
    }
  };
  res.status(200).json(status);
}

/**
 * Main Handler
 */
exports.default = async (req, res) => {
  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    return handleHealth(req, res);
  }
  
  // Security: проверка авторизации крона
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.warn('⚠️ Unauthorized cron attempt');
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  try {
    validateEnv();
  } catch (err) {
    console.error('❌ Env validation failed:', err.message);
    return res.status(500).json({ error: 'Configuration error' });
  }
  
  const manifestUrl = `${BASE_URL}/presentation/presentation-manifest.json`;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const timeWindow = parseInt(process.env.TIME_WINDOW_MS, 10) || DEFAULT_TIME_WINDOW;
  
  // Подключение к Vercel KV (опционально)
  let kv = null;
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const { createClient } = await import('@vercel/kv');
      kv = createClient({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN
      });
    } catch (e) {
      console.warn('⚠️ KV client init failed:', e.message);
    }
  }
  
  console.log(`🔄 Starting check at ${new Date().toISOString()}`);
  const metrics = { checked: 0, new: 0, notified: 0, errors: 0 };
  
  try {
    // Fetch manifest
    const manifest = await safeFetch(manifestUrl, { timeout: 5000 });
    const presentations = Array.isArray(manifest.presentations) ? manifest.presentations : [];
    metrics.checked = presentations.length;
    
    const now = Date.now();
    const recent = [];
    
    for (const pres of presentations) {
      metrics.new++;
      
      // Пропускаем, если уже уведомляли (при наличии KV)
      if (pres.id && await isAlreadyNotified(pres.id, kv)) {
        continue;
      }
      
      // Проверяем свежесть по дате
      let isRecent = false;
      if (pres.date) {
        const presTime = new Date(pres.date).getTime();
        if (!isNaN(presTime) && (now - presTime) < timeWindow) {
          isRecent = true;
        }
      } else {
        // Без даты — считаем новой (одноразово)
        isRecent = true;
      }
      
      if (isRecent) {
        recent.push(pres);
      }
    }
    
    console.log(`📊 Found ${recent.length} recent presentations`);
    
    if (recent.length > 0) {
      metrics.notified = await sendBatchAlerts(recent, chatId, kv);
    }
    
    console.log(`✅ Check complete: ${JSON.stringify(metrics)}`);
    res.status(200).json({ ok: true, metrics });
    
  } catch (err) {
    console.error('❌ Monitor error:', err.message);
    res.status(500).json({ error: 'Internal error', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
};

// Экспорт конфигурации для Vercel
exports.config = {
  maxDuration: 10,
  runtime: 'nodejs18.x'
};