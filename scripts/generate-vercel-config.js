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
  
  // === ОБНОВЛЯЕМ index.html: подставляем актуальное число приложений ===
  const indexPath = path.join(ROOT, 'index.html');
  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, 'utf8');
    html = html.replace(
      /<span id="app-count">\d+<\/span>/,
      `<span id="app-count">${apps.length}</span>`
    );
    fs.writeFileSync(indexPath, html);
    console.log(`   📊 index.html: app count → ${apps.length}`);
  }
  console.log(`✅ apps/manifest.json сгенерирован (${apps.length} apps)`);
  
  return apps;
}

// ─────────────────────────────────────────────────────────────
// 2. Генерация code-structure.json для Code Viewer
// ─────────────────────────────────────────────────────────────
function generateCodeStructure() {
  const exclude = [
    'node_modules', '.git', '.vercel', 'dist', 'build',
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    'vercel.json', 'code-structure.json'
  ];
  const excludeExt = ['.zip', '.tar', '.gz', '.log', '.env'];
  
  function scanDir(dir, base = '') {
    if (!fs.existsSync(dir)) return [];
    const items = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (exclude.includes(entry.name) || entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(base, entry.name).replace(/\\/g, '/');
      
      if (entry.isDirectory()) {
        const children = scanDir(fullPath, relPath);
        items.push({ name: entry.name, type: 'folder', path: relPath, children });
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (excludeExt.includes(ext)) continue;
        const stat = fs.statSync(fullPath);
        
        let preview = null;
        if (['.js','.ts','.html','.css','.json','.md','.txt'].includes(ext) && stat.size < 50000) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            preview = content.slice(0, 500);
          } catch(e) {}
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
  
  const tree = scanDir(ROOT);
  const outputPath = path.join(ROOT, 'code-structure.json');
  fs.writeFileSync(outputPath, JSON.stringify({ tree, generated: new Date().toISOString() }, null, 2));
  console.log(`✅ code-structure.json сгенерирован`);
}

// ─────────────────────────────────────────────────────────────
// 3. Генерация vercel.json с маршрутами
// ─────────────────────────────────────────────────────────────

// === ВЫЗЫВАЕМ ФУНКЦИИ (ОДИН РАЗ!) ===
const apps = generateManifest();      // ← Генерируем manifest + обновляем index.html
generateCodeStructure();              // ← Генерируем code-structure.json

const projects = apps.map(a => a.id);
const rewrites = [];

// 1. ПРИОРИТЕТ: API
projects.forEach(project => {
  const apiPath = path.join(APPS_DIR, project, 'api.js');
  if (fs.existsSync(apiPath)) {
    rewrites.push({ source: `/${project}/api`, destination: `/api/${project}` });
    
    const apiDir = path.join(ROOT, 'api');
    if (!fs.existsSync(apiDir)) fs.mkdirSync(apiDir, { recursive: true });
    fs.writeFileSync(path.join(apiDir, `${project}.js`), fs.readFileSync(apiPath, 'utf8'));
  }
});

// 2. ВАЖНО: Останавливаем обработку, если найден реальный файл
rewrites.push({ "handle": "filesystem" });

// 3. ВИРТУАЛЬНЫЕ ПУТИ ПРИЛОЖЕНИЙ
projects.forEach(project => {
  rewrites.push({
    source: `/${project}/:path(.*\\..*)`,
    destination: `/apps/${project}/:path`
  });
  rewrites.push({
    source: `/${project}`,
    destination: `/apps/${project}/index.html`
  });
  rewrites.push({
    source: `/${project}/`,
    destination: `/apps/${project}/index.html`
  });
});

// 4. ГЛАВНЫЕ СТРАНИЦЫ САЙТА
rewrites.push({ source: '/list', destination: '/list/index.html' });
rewrites.push({ source: '/info', destination: '/info/index.html' });
rewrites.push({ source: '/code', destination: '/apps/code-viewer/index.html' }); // ← Правило для Code Viewer

// 5. КОРЕНЬ (СТРОГО "/")
rewrites.push({ source: '/$', destination: '/index.html' });

// === КОНФИГ ===
const config = {
  version: 2,
  cleanUrls: true,
  trailingSlash: false,
  
  errorPages: {
    '404': '/404.html',
    '500': '/500.html'
  },
  
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
console.log('✅ vercel.json сгенерирован');