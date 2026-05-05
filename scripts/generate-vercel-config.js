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

if (projects.length === 0) {
  console.log('ℹ️ Нет проектов в apps/.');
  process.exit(0);
}

const rewrites = [];

// --- ПРИОРИТЕТ 1: API МАРШРУТЫ ---
// API должны идти первыми, чтобы перехватывать запросы до того, как они уйдут в статику
projects.forEach(project => {
  const apiPath = path.join(APPS_DIR, project, 'api.js');
  
  if (fs.existsSync(apiPath)) {
    // Маршрут: /project/api
    rewrites.push({
      source: `/${project}/api`,
      destination: `/api/${project}`
    });
    
    // Дублирующий маршрут: /apps/project/api
    rewrites.push({
      source: `/apps/${project}/api`,
      destination: `/api/${project}`
    });
    
    // Создание файла функции в /api/ (если его нет)
    const apiDir = path.join(ROOT, 'api');
    if (!fs.existsSync(apiDir)) fs.mkdirSync(apiDir, { recursive: true });
    
    const apiContent = fs.readFileSync(apiPath, 'utf8');
    fs.writeFileSync(path.join(apiDir, `${project}.js`), `// Auto-generated\n${apiContent}`);
  }
});

// --- ПРИОРИТЕТ 2: СТАТИЧЕСКИЕ ФАЙЛЫ ПРИЛОЖЕНИЙ (Assets) ---
// Это правило позволяет загружать скрипты и стили: /project/script.js -> /apps/project/script.js
projects.forEach(project => {
  rewrites.push({
    source: `/${project}/:asset(.*\\..*)`, // Ищем файлы с точкой (напр. .js, .css, .png)
    destination: `/apps/${project}/:asset`
  });
});

// --- ПРИОРИТЕТ 3: ТОЧКИ ВХОДА В ПРИЛОЖЕНИЯ (index.html) ---
projects.forEach(project => {
  rewrites.push({
    source: `/${project}`,
    destination: `/apps/${project}/index.html`
  });
  rewrites.push({
    source: `/${project}/`,
    destination: `/apps/${project}/index.html`
  });
});

// --- ПРИОРИТЕТ 4: ОБЩИЕ СТРАНИЦЫ ---
rewrites.push({ source: '/list', destination: '/list/index.html' });
rewrites.push({ source: '/info', destination: '/info/index.html' });
rewrites.push({ source: '/', destination: '/index.html' });

// --- ПРИОРИТЕТ 5: ЯВНЫЙ ПЕРЕХВАТ 404 ---
// Если ничего выше не сработало, и это не физический файл — отдаем 404.html
// Мы используем регулярку, которая НЕ трогает системные пути Vercel
rewrites.push({
  source: '/:path((?!api|_next|static|favicon).*)',
  destination: '/404.html'
});

// === Сборка финального конфига ===
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
    },
    {
      source: '/apps/:project/api',
      headers: [
        { key: 'Access-Control-Allow-Origin', value: '*' },
        { key: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' },
        { key: 'Access-Control-Allow-Headers', value: 'Content-Type' }
      ]
    }
  ]
};

const outputPath = path.join(ROOT, 'vercel.json');
fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));

console.log(`✅ vercel.json сгенерирован успешно!`);
console.log(`📦 Проектов: ${projects.length}`);
console.log(`🔗 Маршруты: /info, /list, ${projects.map(p => `/${p}`).join(', ')}`);