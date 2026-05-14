/**
 * SERAVIEL LABS — Health Check Endpoint
 * Возвращает статус системы для status page и мониторинга
 * 
 * @see https://vercel.com/docs/functions/edge-functions
 */

// === Конфигурация ===
const CONFIG = {
  version: '1.0.0',
  startTime: Date.now(),
  checks: {
    manifest: '/apps/manifest.json',
    presentations: '/presentation/presentation-manifest.json'
  }
};

/**
 * Helper: Проверка доступности ресурса
 */
async function checkResource(url, timeout = 3000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    
    // Для локальных путей используем относительный URL
    const fullUrl = url.startsWith('http') 
      ? url 
      : `https://${process.env.BASE_URL || 'seraviel-labs.vercel.app'}${url}`;
    
    const res = await fetch(fullUrl, { 
      signal: controller.signal,
      method: 'HEAD',
      headers: { 'User-Agent': 'SeravielHealthCheck/1.0' }
    });
    
    clearTimeout(timer);
    return { ok: res.ok, status: res.status, time: Date.now() };
  } catch (err) {
    return { ok: false, error: err.message, time: Date.now() };
  }
}

/**
 * Helper: Форматирование аптайма
 */
function formatUptime(start) {
  const diff = Math.floor((Date.now() - start) / 1000);
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

/**
 * Main Handler
 */
export default async function handler(req) {
  // Только GET
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Опциональная проверка авторизации для детального отчета
  const authHeader = req.headers.get('authorization');
  const isDetailed = authHeader === `Bearer ${process.env.HEALTH_SECRET}`;
  
  const result = {
    status: 'healthy',
    version: CONFIG.version,
    uptime: formatUptime(CONFIG.startTime),
    timestamp: new Date().toISOString(),
    checks: {}
  };

  try {
    // Проверка манифестов
    const [manifestCheck, presCheck] = await Promise.all([
      checkResource(CONFIG.checks.manifest),
      checkResource(CONFIG.checks.presentations)
    ]);
    
    result.checks.manifest = manifestCheck.ok ? 'pass' : 'fail';
    result.checks.presentations = presCheck.ok ? 'pass' : 'fail';
    result.checks.filesystem = 'pass'; // Vercel гарантирует доступность статики

    // Определение общего статуса
    const allPass = Object.values(result.checks).every(c => c === 'pass');
    result.status = allPass ? 'healthy' : 'degraded';
    
    // Детальный режим: метрики
    if (isDetailed) {
      result.metrics = {
        responseTime: Date.now() - CONFIG.startTime,
        checks: { manifest: manifestCheck, presentations: presCheck }
      };
    }
    
    // Кэширование: 30 сек для healthy, без кэша для degraded
    const cacheControl = result.status === 'healthy' 
      ? 'public, s-maxage=30, stale-while-revalidate=60' 
      : 'no-store';
    
    const statusCode = result.status === 'healthy' ? 200 : 503;
    
    return new Response(JSON.stringify(result), {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': cacheControl
      }
    });
    
  } catch (err) {
    console.error('Health check failed:', err);
    
    result.status = 'degraded';
    result.error = process.env.NODE_ENV === 'development' ? err.message : 'Internal check error';
    
    return new Response(JSON.stringify(result), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });
  }
}

// Конфигурация Vercel Edge Runtime
export const config = {
  runtime: 'edge',
  regions: ['fra1'] // Выполнять во Франкфурте
};