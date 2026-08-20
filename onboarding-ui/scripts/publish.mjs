#!/usr/bin/env node
// Copies the Vite production build into ../public/ so the existing Express
// static server (src/http/app.ts) keeps serving the Blade rewrite at the
// same URL the vanilla-HTML page used to live at: /onboarding.html.
//
// dist/index.html         -> ../public/onboarding.html
// dist/onboarding-assets/ -> ../public/onboarding-assets/ (overwritten)
//
// Deliberately does NOT touch anything else under public/ (uploads/, logos/,
// index.html, billpay-widget.html, brand-kit-preview/).
import { cpSync, copyFileSync, existsSync, rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(here, '..');
const dist = path.join(projectRoot, 'dist');
const publicDir = path.join(projectRoot, '..', 'public');

if (!existsSync(dist)) {
  console.error('[publish] dist/ not found — run `vite build` first.');
  process.exit(1);
}

const distAssets = path.join(dist, 'onboarding-assets');
const publicAssets = path.join(publicDir, 'onboarding-assets');
if (existsSync(distAssets)) {
  rmSync(publicAssets, { recursive: true, force: true });
  cpSync(distAssets, publicAssets, { recursive: true });
  console.log(`[publish] copied ${distAssets} -> ${publicAssets}`);
} else {
  console.warn('[publish] no dist/onboarding-assets found — nothing to copy for assets.');
}

const distIndex = path.join(dist, 'index.html');
const publicOnboarding = path.join(publicDir, 'onboarding.html');
copyFileSync(distIndex, publicOnboarding);
console.log(`[publish] copied ${distIndex} -> ${publicOnboarding}`);
