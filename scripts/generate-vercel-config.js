/**
 * SERAVIEL LABS — Build Script v2.0
 * Генерация манифестов, sitemap и vercel.json
 * 
 * Улучшения:
 * - Безопасность: валидация путей, лимиты размера
 * - Производительность: кэш, параллельные операции
 * - Надёжность: валидация схем, детальное логирование
 * - Гибкость: конфигурация через объект, поддержка ENV
 */

const fs = require('fs').promises;
const path = require('path');

// === Конфигурация (легко менять для staging/prod) ===
const CONFIG = {
  root: path.join(__dirname, '..'),
  appsDir: 'apps',
  presentationDir: 'presentation',
  baseUrl: process.env.BASE_URL || 'https://seraviel-labs.vercel.app',
  maxFileSize: 50 * 1024, // 50KB лимит на превью кода
  cacheTtl: 5 * 60 * 1000, // 5 минут кэш для manifest
  autoTags: {
    'palette': ['colors', 'design'],
    'qr-generator': ['qr', 'tools'],
    'gradient-studio': ['css', 'gradient'],
    'typing-trainer': ['typing', 'game'],
    'dominant-colors': ['image', 'colors'],
    'color-blindness-sim': ['accessibility', 'a11y'],
    'pomodoro-timer': ['productivity', 'timer'],
    'shadow-studio': ['css', 'shadow'],
    'json-studio': ['json', 'dev'],
    'favicon-generator': ['favicon', 'seo'],
    'hash-generator': ['crypto', 'security'],
    'url-builder': ['url', 'tools'],
  }
};

// === Утилиты ===

/**
 * Безопасное чтение файла с лимитом размера
 */
async function safeReadFile(filePath, maxSize = CONFIG.maxFileSize) {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size > maxSize) {
      console.warn(`⚠️ File too large, skipping preview: ${filePath}`);
      return null;
    }
    return await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`⚠️ Read error: ${filePath}`, err.message);
    return null;
  }
}

/**
 * Валидация пути: защита от path traversal
 */
function isValidRelativePath(p) {
  if (!p || typeof p !== 'string') return false;
  // Блокируем абсолютные пути и выход за пределы
  if (p.startsWith('/') || p.includes('..')) return false;
  // Разрешаем только безопасные символы
  return /^[a-zA-Z0-9_\-./]+$/.test(p);
}

/**
 * Санитизация строки для JSON/HTML (базовая)
 */
function sanitize(str) {
  if (!str) return '';
  return String(str)
    .replace(/[<>]/g, '') // Удаляем потенциальные теги
    .trim()
    .slice(0, 500); // Лимит длины
}

/**
 * Простой кэш в памяти
 */
class SimpleCache {
  constructor(ttl) {
    this.ttl = ttl;
    this.store = new Map();
  }
  get(key) {
    const item = this.store.get(key);
    if (!item) return null;
    if (Date.now() - item.ts > this.ttl) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }
  set(key, value) {
    this.store.set(key, { value, ts: Date.now() });
  }
}

const cache = new SimpleCache(CONFIG.cacheTtl);

// === Генераторы ===

async function generateManifest() {
  const appsDir = path.join(CONFIG.root, CONFIG.appsDir);
  
  try {
    await fs.access(appsDir);
  } catch {
    console.warn('⚠️ Apps directory not found, skipping manifest generation');
    return [];
  }

  const cached = cache.get('manifest');
  if (cached) {
    console.log('♻️ Using cached manifest');
    return cached;
  }

  let entries;
  try {
    entries = await fs.readdir(appsDir, { withFileTypes: true });
  } catch (err) {
    console.error('❌ Failed to read apps directory:', err.message);
    return [];
  }

  const projects = entries
    .filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
    .map(d => d.name);

  const apps = await Promise.all(projects.map(async (project) => {
    const pkgPath = path.join(appsDir, project, 'package.json');
    const indexPath = path.join(appsDir, project, 'index.html');
    
    let name = project.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    let description = 'Tool by SERAVIEL LABS';
    let icon = '🧩';
    let tags = [];

    // Читаем package.json
    const pkgContent = await safeReadFile(pkgPath);
    if (pkgContent) {
      try {
        const pkg = JSON.parse(pkgContent);
        if (pkg.name) name = sanitize(pkg.name);
        if (pkg.description) description = sanitize(pkg.description);
        if (Array.isArray(pkg.keywords)) {
          tags = pkg.keywords.filter(t => typeof t === 'string').slice(0, 4);
        }
      } catch (e) {
        console.warn(`⚠️ Invalid package.json in ${project}`);
      }
    }

    // Читаем title из HTML
    const htmlContent = await safeReadFile(indexPath);
    if (htmlContent) {
      const titleMatch = htmlContent.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) {
        const title = titleMatch[1].trim();
        if (title && !title.includes('SERAVIEL')) {
          name = sanitize(title.replace(/\s*\|\s*.*/, ''));
        }
      }
    }

    // Авто-теги
    if (CONFIG.autoTags[project]) {
      tags = [...new Set([...tags, ...CONFIG.autoTags[project]])].slice(0, 4);
    }

    return {
      id: sanitize(project),
      name,
      description,
      icon,
      path: isValidRelativePath(project) ? `/apps/${project}` : '#',
      tags
    };
  }));

  // Валидация результата
  const validApps = apps.filter(app => app.id && app.name);
  if (validApps.length !== apps.length) {
    console.warn(`⚠️ Filtered out ${apps.length - validApps.length} invalid apps`);
  }

  // Запись манифеста
  const manifestPath = path.join(CONFIG.root, CONFIG.appsDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify({ apps: validApps }, null, 2));
  
  // Обновление app-count в index.html
  const rootIndex = path.join(CONFIG.root, 'index.html');
  try {
    let html = await safeReadFile(rootIndex, 1024 * 1024); // 1MB лимит
    if (html) {
      html = html.replace(
        /<span id="app-count">\d+<\/span>/,
        `<span id="app-count">${validApps.length}</span>`
      );
      await fs.writeFile(rootIndex, html);
      console.log(`   📊 index.html: app count → ${validApps.length}`);
    }
  } catch (e) {
    console.warn('⚠️ Could not update index.html:', e.message);
  }

  cache.set('manifest', validApps);
  console.log(`✅ apps/manifest.json generated (${validApps.length} apps)`);
  return validApps;
}

async function generateCodeStructure() {
  const exclude = new Set([
    'node_modules', '.git', '.vercel', 'dist', 'build',
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    'vercel.json', 'code-structure.json', 'sitemap.xml'
  ]);
  const excludeExt = new Set(['.zip', '.tar', '.gz', '.log', '.env', '.map']);
  const previewExts = new Set(['.js', '.ts', '.html', '.css', '.json', '.md', '.txt']);

  async function scanDir(dir, base = '') {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }

    const items = [];
    for (const entry of entries) {
      if (exclude.has(entry.name) || entry.name.startsWith('.')) continue;
      
      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(base, entry.name).replace(/\\/g, '/');
      
      // Валидация пути
      if (!isValidRelativePath(relPath)) {
        console.warn(`⚠️ Skipping unsafe path: ${relPath}`);
        continue;
      }

      if (entry.isDirectory()) {
        const children = await scanDir(fullPath, relPath);
        items.push({ name: entry.name, type: 'folder', path: relPath, children });
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (excludeExt.has(ext)) continue;
        
        const stat = await fs.stat(fullPath);
        let preview = null;
        
        if (previewExts.has(ext) && stat.size < CONFIG.maxFileSize) {
          const content = await safeReadFile(fullPath, CONFIG.maxFileSize);
          if (content) preview = content.slice(0, 500);
        }
        
        items.push({
          name: entry.name,
          type: 'file',
          path: relPath,
          size: stat.size,
          ext: ext.slice(1),
          preview
        });
      }
    }
    return items;
  }

  const tree = await scanDir(CONFIG.root);
  const outputPath = path.join(CONFIG.root, 'code-structure.json');
  await fs.writeFile(outputPath, JSON.stringify({ 
    tree, 
    generated: new Date().toISOString(),
    version: '2.0'
  }, null, 2));
  
  console.log(`✅ code-structure.json generated (${JSON.stringify(tree).length} bytes)`);
}

async function generatePresentationManifest() {
  const presDir = path.join(CONFIG.root, CONFIG.presentationDir);
  
  try {
    await fs.access(presDir);
  } catch {
    return [];
  }

  let entries;
  try {
    entries = await fs.readdir(presDir, { withFileTypes: true });
  } catch {
    console.warn('⚠️ Could not read presentation directory');
    return [];
  }

  const presentations = entries
    .filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
    .map(d => d.name);

  const items = await Promise.all(presentations.map(async (name) => {
    const pkgPath = path.join(presDir, name, 'package.json');
    const indexPath = path.join(presDir, name, 'index.html');
    
    let title = name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    let description = 'Presentation by SERAVIEL LABS';
    let category = 'general';
    let date = null;
    let tags = [];

    const pkgContent = await safeReadFile(pkgPath);
    if (pkgContent) {
      try {
        const pkg = JSON.parse(pkgContent);
        if (pkg.name) title = sanitize(pkg.name);
        if (pkg.description) description = sanitize(pkg.description);
        if (Array.isArray(pkg.keywords)) tags = pkg.keywords.filter(t => typeof t === 'string');
        if (pkg.seraviel?.category) category = sanitize(pkg.seraviel.category);
        if (pkg.date && !isNaN(new Date(pkg.date).getTime())) date = pkg.date;
      } catch (e) {
        console.warn(`⚠️ Invalid package.json in presentation/${name}`);
      }
    }

    const htmlContent = await safeReadFile(indexPath);
    if (htmlContent) {
      const titleMatch = htmlContent.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) {
        title = sanitize(titleMatch[1].replace(/\s*\|\s*.*/, '').trim());
      }
    }

    return {
      id: sanitize(name),
      title,
      description,
      category,
      date,
      path: isValidRelativePath(name) ? `/presentation/${name}` : '#',
      tags: tags.slice(0, 4)
    };
  }));

  const validItems = items.filter(i => i.id && i.title);
  const manifestPath = path.join(presDir, 'presentation-manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify({ presentations: validItems }, null, 2));
  
  console.log(`✅ presentation-manifest.json generated (${validItems.length} presentations)`);
  return validItems;
}

async function generateSitemap(apps) {
  const baseUrl = CONFIG.baseUrl;
  const today = new Date().toISOString().split('T')[0];
  
  const staticPages = [
    { loc: '/', changefreq: 'monthly', priority: 1.0 },
    { loc: '/to', changefreq: 'yearly', priority: 0.1 },
    { loc: '/list', changefreq: 'monthly', priority: 0.9 },
    { loc: '/code', changefreq: 'yearly', priority: 0.8 },
    { loc: '/info', changefreq: 'yearly', priority: 0.8 },
    { loc: '/info-style', changefreq: 'yearly', priority: 0.8 },
    { loc: '/privacy', changefreq: 'yearly', priority: 0.9 },
    { loc: '/status', changefreq: 'hourly', priority: 1.0 },
    { loc: '/suggest', changefreq: 'monthly', priority: 0.7 },
    { loc: '/code/installer-s', changefreq: 'monthly', priority: 0.8 },
    { loc: '/donate', changefreq: 'yearly', priority: 0.8 },
    { loc: '/404', changefreq: 'yearly', priority: 0.1 }
  ];

  const appPages = apps
    .filter(app => isValidRelativePath(app.path.replace('/apps/', '')))
    .map(app => ({ loc: app.path, changefreq: 'yearly', priority: 0.7 }));

  const presItems = await generatePresentationManifest();
  const presPages = presItems
    .filter(p => isValidRelativePath(p.path.replace('/presentation/', '')))
    .map(p => ({ loc: p.path, changefreq: 'monthly', priority: 0.7 }));

  const urls = [...staticPages, ...appPages, ...presPages];
  
  // Генерация XML с экранированием
  const xmlParts = urls.map(url => {
    const loc = sanitize(url.loc).replace(/&/g, '&amp;');
    return `
  <url>
    <loc>${baseUrl}${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`;
  });

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${xmlParts.join('')}
</urlset>`;

  const outputPath = path.join(CONFIG.root, 'sitemap.xml');
  await fs.writeFile(outputPath, sitemap);
  console.log(`✅ sitemap.xml generated (${urls.length} URLs)`);
}

async function generateVercelConfig(apps) {
  const rewrites = [];
  const projects = apps.map(a => a.id).filter(isValidRelativePath);

  // 1. API маршруты
  for (const project of projects) {
    const apiPath = path.join(CONFIG.root, CONFIG.appsDir, project, 'api.js');
    try {
      await fs.access(apiPath);
      rewrites.push({ source: `/${project}/api`, destination: `/api/${project}` });
      
      const apiDir = path.join(CONFIG.root, 'api');
      await fs.mkdir(apiDir, { recursive: true });
      const content = await safeReadFile(apiPath, 1024 * 1024);
      if (content) {
        await fs.writeFile(path.join(apiDir, `${project}.js`), content);
      }
    } catch {
      // API нет — пропускаем
    }
  }

  // 2. Filesystem handler
  rewrites.push({ handle: 'filesystem' });

  // 3. Виртуальные пути приложений
  for (const project of projects) {
    rewrites.push(
      { source: `/${project}/:path(.*\\..*)`, destination: `/apps/${project}/:path` },
      { source: `/${project}`, destination: `/apps/${project}/index.html` },
      { source: `/${project}/`, destination: `/apps/${project}/index.html` }
    );
  }

  // 4. Статические страницы
  const staticRoutes = [
    '/list', '/info', '/info/style', '/privacy', '/status',
    '/suggest', '/code/installer-s', '/donate', '/to', '/code'
  ];
  for (const route of staticRoutes) {
    rewrites.push({ source: route, destination: `${route}/index.html` });
  }

  // 5. Корень
  rewrites.push({ source: '/$', destination: '/index.html' });

  // 6. Презентации
  const presDir = path.join(CONFIG.root, CONFIG.presentationDir);
  try {
    await fs.access(presDir);
    rewrites.push({ source: '/presentation', destination: '/presentation/index.html' });
    
    const presItems = await fs.readdir(presDir, { withFileTypes: true });
    for (const d of presItems) {
      if (d.isDirectory() && !d.name.startsWith('.') && isValidRelativePath(d.name)) {
        rewrites.push(
          { source: `/presentation/${d.name}`, destination: `/presentation/${d.name}/index.html` },
          { source: `/presentation/${d.name}/:path*`, destination: `/presentation/${d.name}/:path*` }
        );
      }
    }
  } catch {
    // Презентаций нет — пропускаем
  }

  // === Итоговый конфиг ===
  const config = {
    version: 2,
    cleanUrls: true,
    trailingSlash: false,
    crons: [{
      path: '/api/presentation-monitor', // ✅ Исправлено: было '/api/pres-monitor'
      schedule: '*/5 * * * *'
    }],
    errorPages: {
      '404': '/404.html',
      '500': '/500.html'
    },
    rewrites,
    headers: [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }
      ]
    }]
  };

  const outputPath = path.join(CONFIG.root, 'vercel.json');
  await fs.writeFile(outputPath, JSON.stringify(config, null, 2));
  console.log('✅ vercel.json generated');
}

// === Точка входа ===
async function main() {
  const start = Date.now();
  console.log(`🚀 Build script started at ${new Date().toISOString()}`);

  try {
    const apps = await generateManifest();
    await Promise.all([
      generateCodeStructure(),
      generateSitemap(apps)
    ]);
    await generateVercelConfig(apps);
    
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`✨ Build completed in ${duration}s`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Build failed:', err.message);
    if (process.env.NODE_ENV === 'development') {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

// Запуск
if (require.main === module) {
  main();
}

// Экспорт для тестов
module.exports = {
  generateManifest,
  generateCodeStructure,
  generatePresentationManifest,
  generateSitemap,
  generateVercelConfig,
  CONFIG
};