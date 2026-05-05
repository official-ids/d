const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APPS_DIR = path.join(ROOT, 'apps');

// ─────────────────────────────────────────────────────────────
// 1. Генерация manifest.json для каталога приложений
// ─────────────────────────────────────────────────────────────
function generateManifest() {
  if (!fs.existsSync(APPS_DIR)) {
    console.warn('⚠️ Папка apps/ не найдена.');
    return [];
  }

  const projects = fs.readdirSync(APPS_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .filter(name => !name.startsWith('.') && name !== 'node_modules');

  const apps = projects.map(project => {
    const pkgPath = path.join(APPS_DIR, project, 'package.json');
    const indexPath = path.join(APPS_DIR, project, 'index.html');
    
    let name = project.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    let description = 'Tool by SERAVIEL LABS';
    let icon = '🧩';
    let tags = [];

    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.description) description = pkg.description;
        if (pkg.keywords) tags = pkg.keywords;
        if (pkg.name) name = pkg.name;
      } catch (e) {}
    }

    if (fs.existsSync(indexPath)) {
      const html = fs.readFileSync(indexPath, 'utf8');
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) {
        const title = titleMatch[1].trim();
        if (title && !title.includes('SERAVIEL')) {
          name = title.replace(/\s*\|\s*.*/, '').trim();
        }
      }
    }

    const autoTags = {
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
    };
    if (autoTags[project]) tags = [...new Set([...tags, ...autoTags[project]])];

    return {
      id: project,
      name,
      description,
      icon,
      path: `/apps/${project}`,
      tags: tags.slice(0, 4)
    };
  });

  const manifestPath = path.join(ROOT, 'apps/manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ apps }, null, 2));
  console.log(`✅ apps/manifest.json сгенерирован (${apps.length} apps)`);
  
  return apps;
}

// ─────────────────────────────────────────────────────────────
// 2. Генерация vercel.json с маршрутами
// ─────────────────────────────────────────────────────────────
const apps = generateManifest();
const projects = apps.map(a => a.id);

const rewrites = [];

// 1. ПРИОРИТЕТ: API (чтобы не перехватились статикой)
projects.forEach(project => {
  const apiPath = path.join(APPS_DIR, project, 'api.js');
  if (fs.existsSync(apiPath)) {
    rewrites.push({ source: `/${project}/api`, destination: `/api/${project}` });
    
    const apiDir = path.join(ROOT, 'api');
    if (!fs.existsSync(apiDir)) fs.mkdirSync(apiDir, { recursive: true });
    fs.writeFileSync(path.join(apiDir, `${project}.js`), fs.readFileSync(apiPath, 'utf8'));
  }
});

// 2. КРИТИЧЕСКИЙ МОМЕНТ: ПРОВЕРКА РЕАЛЬНЫХ ФАЙЛОВ
// Если файл существует (например, 404.html, favicon.png, /list/index.html) - отдаем его СРАЗУ
rewrites.push({ "handle": "filesystem" });

// 3. МАРШРУТЫ ПРИЛОЖЕНИЙ (Виртуальные пути)
projects.forEach(project => {
  // Файлы внутри папки приложения
  rewrites.push({
    source: `/${project}/:path(.*\\..*)`,
    destination: `/apps/${project}/:path`
  });
  // Вход в приложение
  rewrites.push({
    source: `/${project}`,
    destination: `/apps/${project}/index.html`
  });
  rewrites.push({
    source: `/${project}/`,
    destination: `/apps/${project}/index.html`
  });
});

// 4. СТАТИЧЕСКИЕ СТРАНИЦЫ
rewrites.push({ source: '/list', destination: '/list/index.html' });
rewrites.push({ source: '/info', destination: '/info/index.html' });

// 5. ЖЕСТКИЙ CATCH-ALL ДЛЯ 404
// Это правило сработает только если путь не подошел ни под API, 
// ни под существующий файл, ни под проект.
rewrites.push({
  source: '/:path((?!api|apps|list|info|index.html|404.html).*)',
  destination: '/404.html'
});

const config = {
  version: 2,
  cleanUrls: true,
  trailingSlash: false,
  rewrites,
  headers: [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' }
      ]
    }
  ]
};

const outputPath = path.join(ROOT, 'vercel.json');
fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));