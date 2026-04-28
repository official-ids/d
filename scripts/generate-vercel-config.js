const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APPS_DIR = path.join(ROOT, 'apps');

if (!fs.existsSync(APPS_DIR)) {
  console.warn('⚠️ Папка apps/ не найдена.');
  process.exit(0);
}

const projects = fs.readdirSync(APPS_DIR, { withFileTypes: true })
  .filter(dirent => dirent.isDirectory())
  .map(dirent => dirent.name)
  .filter(name => !name.startsWith('.') && name !== 'node_modules');

if (projects.length === 0) {
  console.log('ℹ️ Нет проектов в apps/.');
  process.exit(0);
}

// Формируем rewrites — ВАЖНО: сначала конкретные пути, потом общие
const rewrites = [];

// 1. Сначала добавляем правила для проектов
projects.forEach(project => {
  rewrites.push(
    { source: `/${project}`, destination: `/apps/${project}/index.html` },
    { source: `/${project}/`, destination: `/apps/${project}/index.html` }, // с trailing slash
    { source: `/${project}/:path*`, destination: `/apps/${project}/:path*` }
  );
});

// 2. Корень сайта — в КОНЦЕ, чтобы не перехватывал другие пути
rewrites.push({ source: '/', destination: '/index.html' });

const config = {
  version: 2,
  outputDirectory: ".",
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

console.log(`✅ vercel.json сгенерирован!`);
console.log(`📦 Проектов: ${projects.length}`);
console.log(`🔗 Маршруты: ${projects.map(p => `/${p}`).join(', ')}`);