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
// 5. Генерация presentation-manifest.json
// ─────────────────────────────────────────────────────────────
function generatePresentationManifest() {
  const PRES_DIR = path.join(ROOT, 'presentation');
  if (!fs.existsSync(PRES_DIR)) return [];
  
  const presentations = fs.readdirSync(PRES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
    .map(d => d.name);
  
  const items = presentations.map(name => {
    const pkgPath = path.join(PRES_DIR, name, 'package.json');
    const indexPath = path.join(PRES_DIR, name, 'index.html');
    
    // Defaults
    let title = name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    let description = 'Presentation by SERAVIEL LABS';
    let category = 'general';
    let tags = [];
    
    // Read from package.json
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.name) title = pkg.name;
        if (pkg.description) description = pkg.description;
        if (pkg.keywords) tags = pkg.keywords;
        if (pkg.seraviel?.category) category = pkg.seraviel.category;
      } catch(e) {}
    }
    
    // Read from index.html title
    if (fs.existsSync(indexPath)) {
      const html = fs.readFileSync(indexPath, 'utf8');
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) title = titleMatch[1].replace(/\s*\|\s*.*/, '').trim();
    }
    
    return {
      id: name,
      title,
      description,
      category,
      path: `/presentation/${name}`,
      tags: tags.slice(0, 4)
    };
  });
  
  const manifestPath = path.join(PRES_DIR, 'presentation-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ presentations: items }, null, 2));
  console.log(`✅ presentation-manifest.json сгенерирован (${items.length} presentations)`);
  
  return items;
}


   // ─────────────────────────────────────────────────────────────
// 3. Генерация sitemap.xml для поисковиков
// ─────────────────────────────────────────────────────────────
function generateSitemap(apps) {
  const baseUrl = 'https://seraviel-labs.vercel.app';
  const today = new Date().toISOString().split('T')[0];
  
  // Статические страницы
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
  
  // Страницы приложений
  const appPages = apps.map(app => ({
    loc: app.path,
    changefreq: 'yearly',
    priority: 0.7
  }));


  const presItems = generatePresentationManifest();
  const presPages = presItems.map(p => ({
    loc: p.path,
    changefreq: 'monthly',
    priority: 0.7
  }));
  
  // Сборка XML
    const urls = [...staticPages, ...appPages, ...presPages];
  const xmlParts = urls.map(url => `
  <url>
    <loc>${baseUrl}${url.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`);
  
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${xmlParts.join('')}
</urlset>`;
  
  const outputPath = path.join(ROOT, 'sitemap.xml');
  fs.writeFileSync(outputPath, sitemap);
  console.log(`✅ sitemap.xml сгенерирован (${urls.length} URLs)`);
}


// ─────────────────────────────────────────────────────────────
// 4. Генерация vercel.json с маршрутами
// ─────────────────────────────────────────────────────────────

// === ВЫЗЫВАЕМ ФУНКЦИИ (ОДИН РАЗ!) ===
const apps = generateManifest();      // ← Генерируем manifest + обновляем index.html
generateCodeStructure();    // ← Генерируем code-structure.json
generateSitemap(apps);      // ← Генерируем sitemap.xml

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
rewrites.push({ source: '/info/style', destination: '/info/style/index.html' });
rewrites.push({ source: '/privacy', destination: '/privacy/index.html' });
rewrites.push({ source: '/status', destination: '/status/index.html' });
rewrites.push({ source: '/suggest', destination: '/suggest/index.html' });
rewrites.push({ source: '/code/installer-s', destination: '/code/installer-s/index.html' });
rewrites.push({ source: '/donate', destination: '/donate/index.html' });
rewrites.push({ source: '/to', destination: '/to/index.html' });
rewrites.push({ source: '/code', destination: '/code/index.html' }); // ← Правило для Code Viewer

// 5. КОРЕНЬ (СТРОГО "/")
rewrites.push({ source: '/$', destination: '/index.html' });


// 6. ПРЕЗЕНТАЦИИ
const presDir = path.join(ROOT, 'presentation');
if (fs.existsSync(presDir)) {
  // Главная страница презентаций
  rewrites.push({ source: '/presentation', destination: '/presentation/index.html' });
  
  // Отдельные презентации
  const presItems = fs.readdirSync(presDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => d.name);
  
  presItems.forEach(name => {
    rewrites.push({ source: `/presentation/${name}`, destination: `/presentation/${name}/index.html` });
    rewrites.push({ source: `/presentation/${name}/:path*`, destination: `/presentation/${name}/:path*` });
  });
}

// === КОНФИГ ===
const config = {
  version: 2,
  cleanUrls: true,
  trailingSlash: false,

  crons: [{
    path: '/api/pres-monitor',
    schedule: '*/45 * * * *'
  }],
  
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