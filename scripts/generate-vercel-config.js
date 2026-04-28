const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APPS_DIR = path.join(ROOT, 'apps');

// 1. Проверяем существование папки apps
if (!fs.existsSync(APPS_DIR)) {
  console.warn('️ Папка apps/ не найдена. Пропускаем генерацию.');
  process.exit(0);
}

// 2. Собираем список папок-проектов (игнорируем скрытые и node_modules)
const projects = fs.readdirSync(APPS_DIR, { withFileTypes: true })
  .filter(dirent => dirent.isDirectory())
  .map(dirent => dirent.name)
  .filter(name => !name.startsWith('.') && name !== 'node_modules');

if (projects.length === 0) {
  console.log('ℹ️ В папке apps/ нет проектов. Генерация отменена.');
  process.exit(0);
}

// 3. Формируем правила маршрутизации
const rewrites = projects.flatMap(project => [
  // Точный путь к проекту
  { source: `/${project}`, destination: `/apps/${project}/index.html` },
  // Вложенные пути (картинки, стили, JS внутри проекта)
  { source: `/${project}/:path*`, destination: `/apps/${project}/:path*` }
]);

// Добавляем корень сайта
rewrites.push({ source: '/', destination: '/index.html' });

// 4. Собираем конфигурацию Vercel
const config = {
  rewrites,
  cleanUrls: true,
  trailingSlash: false,
  outputDirectory: ".",
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

// 5. Записываем vercel.json в корень
const outputPath = path.join(ROOT, 'vercel.json');
fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));

console.log(`✅ vercel.json успешно сгенерирован!`);
console.log(` Подключено проектов: ${projects.length}`);
console.log(`🔗 Маршруты: ${projects.map(p => `/${p}`).join(', ')}`);
