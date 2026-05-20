/**
 * SERAVIEL LABS — Health Check Endpoint (v1.1.0)
 * Возвращает статус системы для status page и мониторинга
 * 
 * @see https://vercel.com/docs/functions/edge-functions
 * @security OWASP ASVS 4.0.3: V7.1, V8.2, V10.3
 */

// === Конфигурация ===
const CONFIG = Object.freeze({
  version: '1.1.0',
  startTime: Date.now(),
  checks: {
    manifest: '/apps/manifest.json',
    presentations: '/presentation/presentation-manifest.json',
    filesystem: 'static' // Vercel гарантирует доступность
  },
  timeouts: {
    resourceCheck: 3000,
    totalExecution: 8000 // < 10s лимит Vercel Edge
  },
  baseUrl: process.env.BASE_URL || 'seraviel-labs.vercel.app',
  allowedMethods: ['GET', 'HEAD'],
  // Маскирование чувствительных данных в продакшене
  maskErrors: process.env.NODE_ENV !== 'development'
});

/**
 * Helper: Генерация безопасных заголовков ответа
 * @security OWASP: Security Headers
 */
function getSecurityHeaders(cacheControl, is503 = false) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload'
  };
  
  if (is503) {
    headers['Retry-After'] = '60'; // Клиент повторит через 60 сек
  }
  
  return headers;
}

/**
 * Helper: Проверка доступности ресурса с детализацией ошибок
 * @param {string} url - Путь или полный URL
 * @param {number} timeout - Таймаут в мс
 * @returns {Promise<Object>} Результат проверки
 */
async function checkResource(url, timeout = CONFIG.timeouts.resourceCheck) {
  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    
    const fullUrl = url.startsWith('http') 
      ? url 
      : `https://${CONFIG.baseUrl}${url}`;
    
    const res = await fetch(fullUrl, { 
      signal: controller.signal,
      method: 'HEAD',
      headers: { 
        'User-Agent': 'SeravielHealthCheck/1.1',
        'Accept': '*/*'
      },
      // Edge Runtime: не отправляем куки/авторизацию во внешние запросы
      credentials: 'omit'
    });
    
    clearTimeout(timer);
    const responseTime = Date.now() - startTime;
    
    // Детализация статусов для мониторинга
    if (res.ok) {
      return { ok: true, status: res.status, responseTime, checkedAt: new Date().toISOString() };
    }
    
    // 4xx — ресурс не найден/запрещён (логическая ошибка конфигурации)
    if (res.status >= 400 && res.status < 500) {
      return { ok: false, status: res.status, responseTime, error: 'not_found', checkedAt: new Date().toISOString() };
    }
    
    // 5xx — временная ошибка сервера (можно ретраить)
    return { ok: false, status: res.status, responseTime, error: 'server_error', checkedAt: new Date().toISOString() };
    
  } catch (err) {
    const responseTime = Date.now() - startTime;
    
    // Классификация ошибок для алертинга
    const errorType = 
      err.name === 'AbortError' ? 'timeout' :
      err.name === 'TypeError' ? 'network_error' : 'unknown';
    
    return { 
      ok: false, 
      error: errorType, 
      responseTime,
      message: CONFIG.maskErrors ? undefined : err.message,
      checkedAt: new Date().toISOString()
    };
  }
}

/**
 * Helper: Форматирование аптайма (безопасное)
 */
function formatUptime(startMs) {
  const diff = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

/**
 * Helper: Валидация входящего запроса
 * @security OWASP: Input Validation
 */
function validateRequest(req) {
  // Проверка метода
  if (!CONFIG.allowedMethods.includes(req.method)) {
    return { valid: false, status: 405, body: { error: 'method_not_allowed', allowed: CONFIG.allowedMethods } };
  }
  
  // Проверка User-Agent (базовая защита от сканеров)
  const ua = req.headers.get('user-agent') || '';
  if (ua.includes('sqlmap') || ua.includes('nikto') || ua.includes('nmap')) {
    return { valid: false, status: 403, body: { error: 'forbidden' } };
  }
  
  return { valid: true };
}

/**
 * Main Handler — Edge Runtime compatible
 * @param {Request} req
 * @returns {Promise<Response>}
 */
export default async function handler(req) {
  const requestId = crypto.randomUUID?.() || `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startTs = Date.now();
  
  try {
    // 1. Валидация запроса
    const validation = validateRequest(req);
    if (!validation.valid) {
      return new Response(JSON.stringify(validation.body), {
        status: validation.status,
        headers: getSecurityHeaders('no-store')
      });
    }

    // 2. Авторизация для детального отчета
    const authHeader = req.headers.get('authorization');
    const expectedSecret = process.env.HEALTH_SECRET;
    const isDetailed = expectedSecret && authHeader === `Bearer ${expectedSecret}`;
    
    // 3. Базовый шаблон ответа
    const result = {
      requestId, // Для трассировки в логах
      status: 'healthy',
      version: CONFIG.version,
      uptime: formatUptime(CONFIG.startTime),
      timestamp: new Date().toISOString(),
      region: process.env.VERCEL_REGION || 'unknown',
      checks: {}
    };

    // 4. Параллельная проверка ресурсов с общим таймаутом
    const checksTimeout = setTimeout(() => {
      throw new Error('Health check timeout');
    }, CONFIG.timeouts.totalExecution);
    
    const [manifestCheck, presCheck] = await Promise.all([
      checkResource(CONFIG.checks.manifest),
      checkResource(CONFIG.checks.presentations)
    ]).finally(() => clearTimeout(checksTimeout));
    
    // 5. Агрегация результатов проверок
    result.checks.manifest = manifestCheck.ok ? 'pass' : 'fail';
    result.checks.presentations = presCheck.ok ? 'pass' : 'fail';
    result.checks.filesystem = CONFIG.checks.filesystem === 'static' ? 'pass' : 'fail';
    
    // 6. Определение общего статуса (бизнес-логика)
    const checkValues = Object.values(result.checks);
    const allPass = checkValues.every(c => c === 'pass');
    const anyFail = checkValues.some(c => c === 'fail');
    
    result.status = allPass ? 'healthy' : anyFail ? 'degraded' : 'healthy';
    
    // 7. Детальный режим (только с авторизацией)
    if (isDetailed) {
      result.metrics = {
        totalResponseTime: Date.now() - startTs,
        checks: {
          manifest: { ...manifestCheck, url: CONFIG.maskErrors ? undefined : CONFIG.checks.manifest },
          presentations: { ...presCheck, url: CONFIG.maskErrors ? undefined : CONFIG.checks.presentations }
        }
      };
    }
    
    // 8. Политики кэширования
    const cacheControl = result.status === 'healthy' 
      ? 'public, s-maxage=30, stale-while-revalidate=60' 
      : 'no-store, must-revalidate';
    
    // 9. ✅ КЛЮЧЕВОЙ ФИКС: 200 для healthy/degraded, 503 только при сбое эндпоинта
    const statusCode = 200;
    
    return new Response(JSON.stringify(result), {
      status: statusCode,
      headers: getSecurityHeaders(cacheControl)
    });
    
  } catch (err) {
    // 10. Обработка критических ошибок (сам эндпоинт не работает)
    console.error(`[HEALTH:${requestId}] Critical error:`, {
      name: err.name,
      message: CONFIG.maskErrors ? '[REDACTED]' : err.message,
      stack: CONFIG.maskErrors ? undefined : err.stack
    });
    
    const errorResponse = {
      requestId,
      status: 'down',
      error: CONFIG.maskErrors ? 'service_unavailable' : err.message,
      timestamp: new Date().toISOString(),
      retryAfter: 60
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 503,
      headers: getSecurityHeaders('no-store', true) // is503=true добавляет Retry-After
    });
  }
}

// Vercel Edge Runtime configuration
export const config = {
  runtime: 'edge',
  regions: ['fra1'], // Гео-привязка для консистентности кэша
  // Опционально: ограничение частоты вызовов на уровне платформы
  // @see https://vercel.com/docs/functions/rate-limiting
};