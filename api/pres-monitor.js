/**
 * SERAVIEL LABS Presentation Monitor Bot
 * Vercel Serverless Function + Cron
 * 
 * Задачи:
 * 1. Проверяет presentation-manifest.json каждые 5 минут
 * 2. Отправляет уведомление в Telegram, если найдена новая презентация
 * 3. Формат: Фото + Текст + Кнопка
 */

const https = require('https');

// Настройки функции
exports.config = {
  maxDuration: 10 // Увеличиваем таймаут до 10 секунд
};

/**
 * Helper: Выполняет запрос к Telegram Bot API
 */
function tgRequest(method, params) {
  return new Promise((resolve, reject) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return reject(new Error('TELEGRAM_BOT_TOKEN not set'));

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${botToken}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          json.ok ? resolve(json.result) : reject(new Error(json.description || 'TG API Error'));
        } catch (e) {
          reject(new Error(`Parse error: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(params));
    req.end();
  });
}

/**
 * Helper: Отправляет красивое уведомление с фото
 */
async function sendPresentationAlert(pres, chatId) {
  const baseUrl = 'https://seraviel-labs.vercel.app';
  const presUrl = `${baseUrl}${pres.path}`;
  
  // Ссылка на фото (загрузи bot-pres.png в репозиторий или на хостинг)
  const photoUrl = 'https://seraviel-labs.vercel.app/icon/bot-pres.png';

  // Экранируем спецсимволы в описании, чтобы не сломать HTML
function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;')
             .replace(/</g, '&lt;')
             .replace(/>/g, '&gt;');
}

const safeDesc = escapeHtml(pres.description || 'Без описания');

const caption = `🔔 <b>Новая презентация</b>

<b>Name:</b> ${escapeHtml(pres.title)}
<b>URL:</b> <a href="${presUrl}">${pres.path}</a>

━━━━━━━━━━━━━━━━━━━━━━

<i>${safeDesc}</i>`; // ← ТЕПЕРЬ ТЕГ ЗАКРЫТ

  // Кнопка под сообщением
  const keyboard = {
    inline_keyboard: [[
      { text: '🔗 Открыть презентацию', url: presUrl }
    ]]
  };

  try {
    // Пытаемся отправить с фото
    await tgRequest('sendPhoto', {
      chat_id: chatId,
      photo: photoUrl,
      caption: caption,
      parse_mode: 'HTML',
      reply_markup: JSON.stringify(keyboard)
    });
    console.log(`✓ Sent photo alert for: ${pres.title}`);
  } catch (err) {
    console.warn(`⚠️ Photo send failed (${err.message}), falling back to text...`);
    
    // Фолбэк: если фото не отправилось, шлём просто текст
    await tgRequest('sendMessage', {
      chat_id: chatId,
      text: caption,
      parse_mode: 'HTML',
      reply_markup: JSON.stringify(keyboard)
    });
  }
}

/**
 * Main Handler
 */
exports.default = async (req, res) => {
  // 1. Security Check (защита от посторонних вызовов)
  const cronSecret = process.env.CRON_SECRET;
  if (req.method !== 'POST' || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(403).json({ error: 'Forbidden: Invalid auth' });
  }

  const manifestUrl = 'https://seraviel-labs.vercel.app/presentation/presentation-manifest.json';
  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  if (!chatId) {
    return res.status(500).json({ error: 'Missing TELEGRAM_CHAT_ID env var' });
  }

  console.log(`🔄 Starting check at ${new Date().toISOString()}`);

  try {
    // 2. Fetch Manifest
    const manifest = await new Promise((resolve, reject) => {
      https.get(manifestUrl, (r) => {
        let data = '';
        r.on('data', chunk => data += chunk);
        r.on('end', () => {
          try { resolve(JSON.parse(data)); } 
          catch (e) { reject(new Error('Invalid JSON in manifest')); }
        });
      }).on('error', reject);
    });

    const presentations = manifest.presentations || [];
    const now = Date.now();
    const TIME_WINDOW = 10 * 60 * 1000; // 10 минут в миллисекундах
    let notified = 0;

    // 3. Process Items
    for (const pres of presentations) {
      // Deduplication logic:
      // Если в объекте есть поле 'date' (ISO string) и оно свежее (< 10 мин назад)
      // ИЛИ если поля нет — уведомляем (для обратной совместимости)
      
      let isRecent = false;
      
      if (pres.date) {
        const presTime = new Date(pres.date).getTime();
        if (!isNaN(presTime) && (now - presTime) < TIME_WINDOW) {
          isRecent = true;
        }
      } else {
        // Если даты нет в манифесте, считаем презентацию новой (одноразово)
        // В продакшене лучше добавить дату в generatePresentationManifest()
        isRecent = true; 
      }

      if (isRecent) {
        console.log(`🆕 New/Recent presentation found: ${pres.title}`);
        await sendPresentationAlert(pres, chatId);
        notified++;
      }
    }

    console.log(`✅ Check complete. Notified: ${notified} presentations.`);
    res.status(200).json({ ok: true, notified, total: presentations.length });

  } catch (err) {
    console.error('❌ Monitor error:', err);
    res.status(500).json({ error: err.message });
  }
};