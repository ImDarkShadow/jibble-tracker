/**
 * Zero-dependency build script for Work Tracker for Jibble
 * Compiles canonical src/ into Chrome and Firefox builds (and updates chrome/ and firefox/ dirs)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.join(__dirname, 'src');
const CHROME_OUT_DIR = path.join(__dirname, 'chrome');
const FIREFOX_OUT_DIR = path.join(__dirname, 'firefox');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

function buildTarget(target) {
  const isChrome = target === 'chrome';
  const outDir = isChrome ? CHROME_OUT_DIR : FIREFOX_OUT_DIR;

  console.log(`\n📦 Building target: ${target.toUpperCase()}...`);

  // Read source manifest
  const srcManifestPath = path.join(SRC_DIR, 'manifest.json');
  const baseManifest = JSON.parse(fs.readFileSync(srcManifestPath, 'utf8'));

  // Target-specific manifest adjustments
  const manifest = { ...baseManifest };

  if (isChrome) {
    manifest.background = {
      service_worker: 'background.js',
      type: 'module'
    };
    delete manifest.browser_specific_settings;
  } else {
    // Firefox
    manifest.browser_specific_settings = {
      gecko: {
        id: 'work-tracker-for-jibble@extension',
        strict_min_version: '142.0',
        data_collection_permissions: {
          required: ['none']
        }
      }
    };
    manifest.background = {
      scripts: ['background.js']
    };
  }

  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  // Copy all files from src/
  copyRecursiveSync(SRC_DIR, outDir);

  // Copy root LICENSE into build folder
  const rootLicense = path.join(__dirname, 'LICENSE');
  if (fs.existsSync(rootLicense)) {
    fs.copyFileSync(rootLicense, path.join(outDir, 'LICENSE'));
  }

  // Write target-specific manifest
  fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8'
  );

  console.log(`  ✓ Built to: ${path.relative(__dirname, outDir)}/`);
}

function main() {
  const args = process.argv.slice(2);
  const targetArg = args.find(a => a.startsWith('--target='));
  const target = targetArg ? targetArg.split('=')[1] : 'all';

  if (!fs.existsSync(SRC_DIR)) {
    console.error(`❌ Source directory not found: ${SRC_DIR}`);
    process.exit(1);
  }

  if (target === 'chrome' || target === 'all') {
    buildTarget('chrome');
  }

  if (target === 'firefox' || target === 'all') {
    buildTarget('firefox');
  }

  console.log('\n✨ Build completed successfully!\n');
}

main();
