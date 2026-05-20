#!/usr/bin/env node
/**
 * SERAVIEL LABS — Build: Strip console.* from production HTML/JS
 * Запускается ТОЛЬКО при продакшен-сборке
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 🔍 Автоматический поиск всех HTML/JS файлов в проекте
function findFiles(dir, extensions = ['.html', '.js'], exclude = ['node_modules', '.git', 'dist', 'scripts']) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !exclude.includes(entry.name)) {
      results.push(...findFiles(fullPath, extensions, exclude));
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

// 🧹 Удаление console.log/info/debug/trace (warn/error можно оставить для мониторинга)
function stripConsole(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  
  // Паттерн: console.метод(аргументы); или без ;
  content = content.replace(
    /console\.(log|info|debug|trace)\s*\([^)]*(?:\([^)]*\)[^)]*)*\)\s*;?/g, 
    ''
  );
  
  // Удаляем пустые строки после зачистки
  content = content.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }
  return false;
}

// 🚀 Main
(function main() {
  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  
  if (!isProd) {
    console.log('🔧 Dev mode: console.log stripping skipped');
    process.exit(0);
  }
  
  console.log('🔐 Production build: stripping console.log statements...');
  
  const files = findFiles(process.cwd());
  let strippedCount = 0;
  
  for (const file of files) {
    if (stripConsole(file)) {
      strippedCount++;
      console.log(`  ✂️  ${path.relative(process.cwd(), file)}`);
    }
  }
  
  console.log(`✅ Done: ${strippedCount} files modified, console.log removed from production build`);
})();