#!/usr/bin/env node
/**
 * Bundle all card scripts into a single homie-scheduler-cards.js for one-file install.
 * Run after building all cards (boiler/button, boiler/status, boiler/slots, climate/slots).
 */
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');
const CARDS = [
  'homie-scheduler-boiler-button.js',
  'homie-scheduler-boiler-status.js',
  'homie-scheduler-boiler-slots.js',
  'homie-scheduler-climate-slots.js',
];

let version = 'dev';
const parts = [];

for (const file of CARDS) {
  const filePath = path.join(DIST, file);
  if (!fs.existsSync(filePath)) {
    console.error('Missing:', filePath, '- run card builds first.');
    process.exit(1);
  }
  let content = fs.readFileSync(filePath, 'utf8');
  if (parts.length === 0 && /window\.__HOMIE_SCHEDULER_CARDS_VERSION\s*=\s*['"]([^'"]+)['"]/.test(content)) {
    version = content.match(/window\.__HOMIE_SCHEDULER_CARDS_VERSION\s*=\s*['"]([^'"]+)['"]/)[1];
  }
  if (parts.length > 0) {
    content = content.replace(/^\/\*\*[\s\S]*?\*\/\s*\n?/, '');
    content = content.replace(/window\.__HOMIE_SCHEDULER_CARDS_VERSION\s*=\s*['"][^'"]*['"];\s*\n?/, '');
  }
  parts.push(content);
}

const header = `/**
 * Homie Scheduler Cards - All-in-one bundle
 * Contains: boiler-button, boiler-status, boiler-slots, climate-slots
 * Version: ${version}
 */
`;

// Output as ES module so it loads correctly as "JavaScript Module" in HA Resources / HACS
const bundle = header + parts.join('\n\n') + '\nexport {};\n';
fs.writeFileSync(path.join(DIST, 'homie-scheduler-cards.js'), bundle, 'utf8');
console.log('✓ Bundle written: dist/homie-scheduler-cards.js (' + (bundle.length / 1024).toFixed(1) + ' KB)');
