#!/usr/bin/env node
/**
 * Bundle all card scripts into a single homie-scheduler-cards.js for one-file install.
 * Extras (shared components) are built once from src/shared/ and prepended to the bundle.
 * Run after building all cards (boiler/button, boiler/status, boiler/slots, climate/slots).
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const SHARED = path.join(ROOT, 'src', 'shared');
const CARDS = [
  'homie-scheduler-boiler-button.js',
  'homie-scheduler-boiler-status.js',
  'homie-scheduler-boiler-slots.js',
  'homie-scheduler-climate-slots.js',
];

function buildExtras() {
  if (!fs.existsSync(SHARED)) return '';
  const dirs = fs.readdirSync(SHARED, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();
  let out = '// Shared Components (auto-included from shared/)\n';
  for (const dir of dirs) {
    const dirPath = path.join(SHARED, dir);
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.js'));
    for (const jsFile of files) {
      const jsPath = path.join(dirPath, jsFile);
      let js = fs.readFileSync(jsPath, 'utf8');
      js = js.replace(/^export /gm, '');
      js = js.replace(/\/\/ Export for ES6 modules.*?\n/gm, '');
      js = js.replace(/\/\/ Export for ES6 modules \(backward compatibility\).*?\n/gm, '');
      js = js.replace(/^export \{ [^}]+ \};?\s*$/gm, '');
      js = js.replace(/^\s*\{ [^}]+ \};?\s*$/gm, '');
      out += `// Shared component: ${dir}/${jsFile}\n${js.trim()}\n\n`;
    }
  }
  return out.trimEnd();
}

function stripCardToBody(content) {
  let c = content.replace(/^\/\*\*[\s\S]*?\*\/\s*\n?/, '');
  c = c.replace(/window\.__HOMIE_SCHEDULER_CARDS_VERSION\s*=\s*['"][^'"]*['"];\s*\n?/, '');
  const sharedStart = c.indexOf('// Shared Components (auto-included from shared/)');
  if (sharedStart !== -1) {
    const classMatch = c.match(/\nclass (Homie\w+Card) extends/);
    if (classMatch) {
      const classIdx = c.indexOf(classMatch[0]);
      if (classIdx > sharedStart) c = c.slice(0, sharedStart).trimEnd() + '\n\n' + c.slice(classIdx);
    }
  }
  return c.trim();
}

let version = 'dev';
const cardBodies = [];

for (const file of CARDS) {
  const filePath = path.join(DIST, file);
  if (!fs.existsSync(filePath)) {
    console.error('Missing:', filePath, '- run card builds first.');
    process.exit(1);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  if (cardBodies.length === 0 && /window\.__HOMIE_SCHEDULER_CARDS_VERSION\s*=\s*['"]([^'"]+)['"]/.test(content)) {
    version = content.match(/window\.__HOMIE_SCHEDULER_CARDS_VERSION\s*=\s*['"]([^'"]+)['"]/)[1];
  }
  cardBodies.push(stripCardToBody(content));
}

const extras = buildExtras();
const header = `/**
 * Homie Scheduler Cards - All-in-one bundle
 * Contains: boiler-button, boiler-status, boiler-slots, climate-slots
 * Version: ${version}
 */
window.__HOMIE_SCHEDULER_CARDS_VERSION = '${version}';

`;

const bundle = header + (extras ? extras + '\n\n' : '') + cardBodies.join('\n\n') + '\nexport {};\n';
fs.writeFileSync(path.join(DIST, 'homie-scheduler-cards.js'), bundle, 'utf8');
console.log('✓ Bundle written: dist/homie-scheduler-cards.js (' + (bundle.length / 1024).toFixed(1) + ' KB)');
