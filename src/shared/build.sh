#!/bin/bash
# Common build script for all cards
# Usage: bash build.sh <output-filename>
# Example: bash build.sh homie-scheduler-boiler-slots.js

set -e

if [ -z "$1" ]; then
    echo "Error: output filename required"
    echo "Usage: bash build.sh <output-filename>"
    exit 1
fi

OUTPUT_FILE="$1"

# Check files exist
if [ ! -f "card-script.js" ]; then
    echo "Error: card-script.js not found"
    exit 1
fi

if [ ! -f "card-styles.css" ]; then
    echo "Error: card-styles.css not found"
    exit 1
fi

if [ ! -f "card-template.html" ]; then
    echo "Error: card-template.html not found"
    exit 1
fi

# Output to dist/
DIST_DIR="../../../dist"
mkdir -p "$DIST_DIR"

# Use Node.js if available
if command -v node &> /dev/null; then
    
    OUTPUT_FILE="$OUTPUT_FILE" node << 'NODESCRIPT'
const fs = require('fs');
const path = require('path');

// Read main files (from card root, no dev/)
const devContent = fs.readFileSync('card-script.js', 'utf8');
let cssContent = fs.readFileSync('card-styles.css', 'utf8');
let htmlTemplate = fs.readFileSync('card-template.html', 'utf8');

// Automatically scan shared/ directory for components (JS and HTML only; CSS is in each card)
const sharedBase = '../../shared';
let sharedJs = '';

if (fs.existsSync(sharedBase)) {
  const sharedDirs = fs.readdirSync(sharedBase, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  for (const dir of sharedDirs) {
    const dirPath = path.join(sharedBase, dir);
    const files = fs.readdirSync(dirPath);
    
    // Include .js files only
    const jsFiles = files.filter(f => f.endsWith('.js'));
    for (const jsFile of jsFiles) {
      const jsPath = path.join(dirPath, jsFile);
      let jsContent = fs.readFileSync(jsPath, 'utf8');
      jsContent = jsContent.replace(/^export /gm, '');
      jsContent = jsContent.replace(/\/\/ Export for ES6 modules.*?\n/gm, '');
      jsContent = jsContent.replace(/\/\/ Export for ES6 modules \(backward compatibility\).*?\n/gm, '');
      jsContent = jsContent.replace(/^export \{ [^}]+ \};?\s*$/gm, '');
      jsContent = jsContent.replace(/^\s*\{ [^}]+ \};?\s*$/gm, '');
      const inlinedJs = jsContent.trim();
      sharedJs += `// Shared component: ${dir}/${jsFile}\n${inlinedJs}\n\n`;
      console.log(`✓ Included shared/${dir}/${jsFile}`);
    }
    
    // Include .html files (for template replacement)
    const htmlFiles = files.filter(f => f.endsWith('.html'));
    for (const htmlFile of htmlFiles) {
      const htmlPath = path.join(dirPath, htmlFile);
      const htmlContent = fs.readFileSync(htmlPath, 'utf8');
      // Use filename without extension as marker name (e.g., 'duration-selector' or 'weekday-selector')
      const markerName = htmlFile.replace('.html', '');
      
      // Replace section in main template using markers
      // Format: <!-- SHARED:marker-name --> ... <!-- END:marker-name -->
      const markerStart = `<!-- SHARED:${markerName} -->`;
      const markerEnd = `<!-- END:${markerName} -->`;
      
      // Replace ALL occurrences of the marker (for both popup and slot templates)
      // Use regex with global flag to replace all occurrences at once
      const markerRegex = new RegExp(
        markerStart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + markerEnd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'g'
      );
      const matches = htmlTemplate.match(markerRegex);
      const replacementCount = matches ? matches.length : 0;
      
      if (replacementCount > 0) {
        htmlTemplate = htmlTemplate.replace(markerRegex, markerStart + '\n' + htmlContent.trim() + '\n' + markerEnd);
        console.log(`✓ Replaced shared/${dir}/${htmlFile} in template (${replacementCount} occurrence(s))`);
      }
    }
  }
}

// Escape CSS for JavaScript (card-styles.css only; shared CSS is in card files)
const cssEscaped = cssContent
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\${/g, '\\${')
    .replace(/\n/g, '\\n');

// Escape HTML template for JavaScript
const htmlEscaped = htmlTemplate
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\${/g, '\\${')
    .replace(/\n/g, '\\n');

// Build production content: shared JS first, then main content
let prodContent = devContent;
if (sharedJs) {
  // Insert shared JS before the class definition
  const classMatch = prodContent.match(/^(class \w+)/m);
  if (classMatch) {
    const insertPos = prodContent.indexOf(classMatch[0]);
    prodContent = prodContent.slice(0, insertPos) + 
                  `// Shared Components (auto-included from shared/)\n${sharedJs}` + 
                  prodContent.slice(insertPos);
  } else {
    // Fallback: prepend if class not found
    prodContent = `// Shared Components (auto-included from shared/)\n${sharedJs}\n\n${prodContent}`;
  }
}

// Replace styleLink variable definition
prodContent = prodContent
    .replace(
        /const styleLink = `<link rel="stylesheet" href="card-styles\.css">`;/g,
        `const styleContent = \`${cssEscaped}\`;`
    )
    .replace(
        /\$\{styleLink\}/g,
        `<style>\${styleContent}</style>`
    )
    .replace(/Development Version/g, 'Production Version (auto-generated from dev version)')
    .replace(/homie-schedule-slots-dev\.js/g, 'homie-schedule-slots.js')
    .replace(/This version loads styles from external file card-styles\.css/g, 'Production version with embedded styles and HTML template');

// Replace template loading with embedded template
// Match the entire _loadTemplate method (including async and all content)
// Need to match balanced braces to find the complete method
// Strategy: find "async _loadTemplate() {" and then find matching closing brace
let loadTemplateMatch = prodContent.match(/async _loadTemplate\(\) \{/);
if (loadTemplateMatch) {
  const startPos = loadTemplateMatch.index;
  let braceCount = 0;
  let pos = startPos + loadTemplateMatch[0].length;
  let foundStart = false;
  
  // Find the matching closing brace
  while (pos < prodContent.length) {
    if (prodContent[pos] === '{') {
      braceCount++;
      foundStart = true;
    } else if (prodContent[pos] === '}') {
      if (foundStart && braceCount === 0) {
        // Found the matching closing brace
        const methodEnd = pos + 1;
        const methodCode = prodContent.substring(startPos, methodEnd);
        const embeddedTemplateCode = `async _loadTemplate() {
    if (this._htmlTemplate) return this._htmlTemplate;
    
    // Template is embedded in production build
    this._htmlTemplate = \`${htmlEscaped}\`;
    return this._htmlTemplate;
  }`;
        prodContent = prodContent.substring(0, startPos) + embeddedTemplateCode + prodContent.substring(methodEnd);
        break;
      }
      braceCount--;
    }
    pos++;
  }
}

// Add header - determine card name from output filename
const outputFile = process.env.OUTPUT_FILE;
let cardName = 'Homie Schedule Card';
if (outputFile) {
  // Extract card name from filename (e.g. homie-scheduler-boiler-button.js -> Boiler Button)
  const nameParts = outputFile.replace('.js', '').split('-');
  if (nameParts.length > 1) {
    cardName = nameParts.slice(1).map(part => 
      part.charAt(0).toUpperCase() + part.slice(1)
    ).join(' ') + ' Card';
  }
}

const header = `/**
 * ${cardName} - Production Version
 * 
 * ⚠️ AUTO-GENERATED FILE - DO NOT EDIT MANUALLY!
 * 
 * This file is automatically generated from:
 *   - card-script.js (source code)
 *   - card-styles.css (styles, embedded)
 *   - card-template.html (HTML template, embedded)
${sharedJs ? ' *   - ../../shared/* (JS/HTML only; CSS is in card-styles.css)' : ''}
 * 
 * To rebuild: bash build.sh (output: dist/)
 * 
 * Last build: ${new Date().toISOString()}
 */

`;

// Write output
if (!outputFile || outputFile === 'undefined') {
  console.error('Error: OUTPUT_FILE is not set or is undefined');
  process.exit(1);
}
const distDir = '../../../dist';
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}
fs.writeFileSync(path.join(distDir, outputFile), header + prodContent);

console.log('✓ Build complete!');
NODESCRIPT

# Copy homie-custom-styles.css to dist (from src/)
if [ -f "../../homie-custom-styles.css" ]; then
    cp "../../homie-custom-styles.css" "$DIST_DIR/homie-custom-styles.css"
    echo "✓ Copied homie-custom-styles.css to dist/"
fi

else
    echo "Error: Node.js is required for build"
    echo "Please install Node.js: https://nodejs.org/"
    exit 1
fi
