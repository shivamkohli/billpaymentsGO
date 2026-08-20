/**
 * Best-effort merchant-website scraper backing "Autofill from website" on
 * `public/onboarding.html` — replaces manually typing business description +
 * brand color + logo with a single URL. See `POST /v1/merchant_onboarding/scrape`.
 *
 * Deliberately dependency-free (no cheerio/puppeteer): this fetches the raw
 * HTML of the given page only (no JS execution, no crawling other pages) and
 * pulls out a handful of well-known tags via regex. That means single-page
 * apps that render everything client-side will yield thin/empty results —
 * acceptable for a prototype autofill that the merchant can still edit by
 * hand, not acceptable as a general-purpose scraper.
 *
 * The "estimated customers / app downloads / GMV" numbers a merchant
 * partner might want are NOT obtainable from an arbitrary public website in
 * any reliable way, so this does not fabricate numbers. Instead it derives a
 * coarse tier (small/medium/large/enterprise) from a handful of directly
 * observable page signals (app store links, review/rating counts, page
 * richness) and always attaches `basis` — the literal signals that produced
 * the tier — so nothing here is presented as a hard fact. See
 * `estimateScale()`.
 */

import { inflateSync } from "zlib";
import { CategorySuggestion, EstimatedScaleSignals, ScaleEstimate, ScaleTier, WebsiteScrapeResult } from "../types/onboarding";

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 2_000_000; // avoid pulling down huge pages just to regex a few tags
const MAX_LOGO_BYTES = 3_000_000; // logos/favicons are small; bail rather than decode something huge

function normalizeUrl(rawUrl: string): URL {
  const withScheme = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const url = new URL(withScheme);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http:// and https:// URLs are supported");
  }
  return url;
}

async function fetchHtml(url: URL): Promise<{ html: string; warnings: string[] }> {
  const warnings: string[] = [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Some sites block requests with no UA / non-browser UA.
        "User-Agent":
          "Mozilla/5.0 (compatible; RazorpayBillPayOnboardingBot/1.0; +https://razorpay.com)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) {
      warnings.push(`Website responded with HTTP ${res.status} — results may be incomplete.`);
    }
    const reader = res.body;
    let html: string;
    if (reader) {
      // Cap how much we read so a huge/streaming page can't hang the request.
      const chunks: Uint8Array[] = [];
      let total = 0;
      // @ts-ignore - Node's ReadableStream supports async iteration at runtime even if lib.dom types don't declare it.
      for await (const chunk of reader as any) {
        chunks.push(chunk);
        total += chunk.length;
        if (total >= MAX_HTML_BYTES) {
          warnings.push("Page was larger than expected — only the first portion was scanned.");
          break;
        }
      }
      html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
    } else {
      html = await res.text();
    }
    return { html, warnings };
  } finally {
    clearTimeout(timeout);
  }
}

function matchAttr(html: string, tagPattern: RegExp): string | undefined {
  const match = html.match(tagPattern);
  return match?.[1]?.trim() || undefined;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractMetaContent(html: string, attr: "name" | "property", key: string): string | undefined {
  // Attribute order on <meta> tags varies (content before/after name/property), so match both orders.
  const pattern1 = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]*content=["']([^"']*)["']`, "i");
  const pattern2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${key}["']`, "i");
  const raw = matchAttr(html, pattern1) || matchAttr(html, pattern2);
  return raw ? decodeEntities(raw) : undefined;
}

function extractLinkHref(html: string, relPattern: string): string | undefined {
  const pattern1 = new RegExp(`<link[^>]+rel=["'][^"']*${relPattern}[^"']*["'][^>]*href=["']([^"']*)["']`, "i");
  const pattern2 = new RegExp(`<link[^>]+href=["']([^"']*)["'][^>]*rel=["'][^"']*${relPattern}[^"']*["']`, "i");
  const raw = matchAttr(html, pattern1) || matchAttr(html, pattern2);
  return raw ? decodeEntities(raw) : undefined;
}

function resolveUrl(base: URL, maybeRelative: string | undefined): string | undefined {
  if (!maybeRelative) return undefined;
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return undefined;
  }
}

function extractBrandName(html: string, url: URL): string | undefined {
  const ogSiteName = extractMetaContent(html, "property", "og:site_name");
  if (ogSiteName) return ogSiteName;
  const title = matchAttr(html, /<title[^>]*>([^<]*)<\/title>/i);
  if (title) {
    // Titles are often "Brand — Tagline" or "Brand | Tagline"; take the first segment.
    return decodeEntities(title.split(/[-|–—:]/)[0].trim());
  }
  // Fall back to the domain, minus "www." and TLD, title-cased.
  const host = url.hostname.replace(/^www\./, "").split(".")[0];
  return host ? host.charAt(0).toUpperCase() + host.slice(1) : undefined;
}

function extractLogoUrl(html: string, url: URL): string | undefined {
  const ogImage = extractMetaContent(html, "property", "og:image");
  if (ogImage) return resolveUrl(url, ogImage);
  const appleTouchIcon = extractLinkHref(html, "apple-touch-icon");
  if (appleTouchIcon) return resolveUrl(url, appleTouchIcon);
  const icon = extractLinkHref(html, "icon");
  if (icon) return resolveUrl(url, icon);
  // Last resort: the well-known default location, unverified.
  return resolveUrl(url, "/favicon.ico");
}

const HEX_COLOR_RE = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;

/** Expands a 3-digit hex ("#abc") to 6-digit ("#aabbcc"); passes 6-digit through unchanged. */
function normalizeHex(hex: string): string {
  const h = hex.trim();
  if (h.length === 4) {
    return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  }
  return h.toLowerCase();
}

/**
 * Filters out near-white/near-black/gray RGB values — these are almost
 * always page/icon chrome (borders, backgrounds, body text, transparent-PNG
 * matte) rather than an intentional brand color, so counting them in
 * `scanCssForBrandColor()`'s or `dominantColorFromPixels()`'s frequency pass
 * would just find "gray" on every single page/logo.
 */
function isNeutralRgb(r: number, g: number, b: number): boolean {
  if ([r, g, b].some((n) => Number.isNaN(n))) return true;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const isGrayscale = max - min < 12; // R/G/B all close together -> gray/white/black
  const isNearWhite = min > 235;
  const isNearBlack = max < 20;
  return isGrayscale || isNearWhite || isNearBlack;
}

function isNeutralHex(hex: string): boolean {
  const h = normalizeHex(hex).slice(1);
  return isNeutralRgb(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16));
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Samples the ACTUAL logo image's pixels and returns its most common
 * non-neutral color — the strongest possible signal for "brand color",
 * since it's the same swatch the merchant will see rendered next to their
 * own logo in the onboarding UI. Tried before any meta-tag/CSS heuristic
 * below (see `extractBrandColor()`): a site's `theme-color`/manifest tint
 * is frequently unrelated to its actual logo mark (e.g. an amber PWA
 * task-switcher tint on a site whose logo is coral/pink), which is exactly
 * the mismatch this function exists to avoid.
 *
 * Supports PNG (any of the common 8-bit color types: truecolor, truecolor
 *+alpha, palette) and SVG (regex-scanned `fill`/`stop-color`, consistent
 * with this file's "regex only, no real parser" convention). Deliberately
 * does NOT attempt JPEG/WebP/ICO — decoding those needs real image codecs,
 * which would break the "dependency-free" constraint (see file header); a
 * logo served in one of those formats just falls through to the
 * meta-tag/CSS heuristics below, same as before this function existed.
 */
async function extractBrandColorFromLogo(logoUrl: string | undefined): Promise<string | undefined> {
  if (!logoUrl) return undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(logoUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RazorpayBillPayOnboardingBot/1.0; +https://razorpay.com)" },
    });
    if (!res.ok) return undefined;
    const contentType = res.headers.get("content-type") || "";
    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength === 0 || arrayBuffer.byteLength > MAX_LOGO_BYTES) return undefined;
    const buf = Buffer.from(arrayBuffer);

    if (contentType.includes("svg") || looksLikeSvgText(buf)) {
      return dominantColorFromSvg(buf.toString("utf-8"));
    }
    if (isPngSignature(buf)) {
      return dominantColorFromPng(buf);
    }
    return undefined; // JPEG/WebP/ICO/etc — no decoder here, caller falls through to other signals
  } catch {
    return undefined; // fetch failure/timeout/decode error — same as any other best-effort signal coming up empty
  } finally {
    clearTimeout(timeout);
  }
}

function looksLikeSvgText(buf: Buffer): boolean {
  // SVGs are text; a binary PNG/JPEG won't decode to valid-looking markup like this.
  return /<svg[\s>]/i.test(buf.subarray(0, Math.min(buf.length, 2000)).toString("utf-8"));
}

/** Regex-scans an SVG's `fill="#..."`/`stop-color="#..."` (attribute and inline-style forms) for the most common non-neutral color — same frequency-count approach as `scanCssForBrandColor()`, applied to the logo markup instead of the page's CSS. */
function dominantColorFromSvg(svg: string): string | undefined {
  const colorAttrPattern = /(?:fill|stop-color)\s*[:=]\s*["']?(#[0-9a-fA-F]{3,6})\b/gi;
  const counts = new Map<string, number>();
  let match: RegExpExecArray | null;
  while ((match = colorAttrPattern.exec(svg))) {
    if (isNeutralHex(match[1])) continue;
    const hex = normalizeHex(match[1]);
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [hex, count] of counts) {
    if (count > bestCount) {
      best = hex;
      bestCount = count;
    }
  }
  return best;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPngSignature(buf: Buffer): boolean {
  return buf.length > 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE);
}

interface ParsedPng {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
  idat: Buffer;
  palette?: Buffer;
  trns?: Buffer;
}

/** Walks PNG chunks (length/type/data/crc, per the PNG spec) collecting just what's needed to decode pixel color — IHDR for geometry, all IDAT payloads concatenated, and PLTE/tRNS for palette images. No compression is touched here; that's `zlib.inflateSync()` on the concatenated IDAT, done by the caller. */
function parsePngChunks(buf: Buffer): ParsedPng | undefined {
  let offset = 8;
  let ihdr: Omit<ParsedPng, "idat" | "palette" | "trns"> | undefined;
  const idatParts: Buffer[] = [];
  let palette: Buffer | undefined;
  let trns: Buffer | undefined;

  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (length < 0 || dataEnd + 4 > buf.length) break;
    const data = buf.subarray(dataStart, dataEnd);

    if (type === "IHDR" && data.length >= 13) {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data.readUInt8(8),
        colorType: data.readUInt8(9),
        interlace: data.readUInt8(12),
      };
    } else if (type === "IDAT") {
      idatParts.push(Buffer.from(data));
    } else if (type === "PLTE") {
      palette = Buffer.from(data);
    } else if (type === "tRNS") {
      trns = Buffer.from(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4; // skip the 4-byte CRC
  }

  if (!ihdr || idatParts.length === 0) return undefined;
  return { ...ihdr, idat: Buffer.concat(idatParts), palette, trns };
}

/** Number of raw bytes per pixel PNG stores for a given color type, at 8-bit depth (the only depth this decodes — see `dominantColorFromPng()`). */
function pngChannelsPerPixel(colorType: number): number {
  switch (colorType) {
    case 0:
      return 1; // grayscale
    case 2:
      return 3; // truecolor (RGB)
    case 3:
      return 1; // palette index
    case 4:
      return 2; // grayscale + alpha
    case 6:
      return 4; // truecolor + alpha (RGBA)
    default:
      return 0;
  }
}

/** Reverses PNG's per-scanline filtering (spec section 9) to get raw interleaved pixel bytes. Returns undefined on any inconsistency (truncated data, unknown filter byte) rather than throwing — a decode failure here should just mean "no logo-color signal", not a 500. */
function unfilterPngScanlines(raw: Buffer, width: number, height: number, bytesPerPixel: number): Buffer | undefined {
  const stride = width * bytesPerPixel;
  const out = Buffer.alloc(stride * height);
  let rawOffset = 0;
  let prevRowStart = -1;

  for (let y = 0; y < height; y++) {
    if (rawOffset >= raw.length) return undefined;
    const filterType = raw[rawOffset++];
    const rowStart = y * stride;
    if (rawOffset + stride > raw.length) return undefined;

    for (let x = 0; x < stride; x++) {
      const rawByte = raw[rawOffset + x];
      const a = x >= bytesPerPixel ? out[rowStart + x - bytesPerPixel] : 0; // left
      const b = prevRowStart >= 0 ? out[prevRowStart + x] : 0; // up
      const c = prevRowStart >= 0 && x >= bytesPerPixel ? out[prevRowStart + x - bytesPerPixel] : 0; // up-left
      let value: number;
      switch (filterType) {
        case 0:
          value = rawByte;
          break;
        case 1:
          value = rawByte + a;
          break;
        case 2:
          value = rawByte + b;
          break;
        case 3:
          value = rawByte + Math.floor((a + b) / 2);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          value = rawByte + pred;
          break;
        }
        default:
          return undefined; // unknown filter type — bail rather than silently mis-decode
      }
      out[rowStart + x] = value & 0xff;
    }
    rawOffset += stride;
    prevRowStart = rowStart;
  }
  return out;
}

/**
 * Decodes a PNG far enough to answer one question — "what's its dominant
 * non-neutral color?" — without a general-purpose image library. Only
 * 8-bit, non-interlaced PNGs are supported (the overwhelming majority of
 * web logos/favicons/app icons); anything else (16-bit, Adam7-interlaced,
 * grayscale-only) returns undefined and the caller falls back to the
 * meta-tag/CSS heuristics, same as a fetch failure would.
 */
function dominantColorFromPng(buf: Buffer): string | undefined {
  const parsed = parsePngChunks(buf);
  if (!parsed || parsed.bitDepth !== 8 || parsed.interlace !== 0) return undefined;
  const { width, height, colorType, idat, palette, trns } = parsed;
  if (width <= 0 || height <= 0 || width * height > 20_000_000) return undefined; // sanity cap

  const channels = pngChannelsPerPixel(colorType);
  if (channels === 0 || colorType === 0 || colorType === 4) return undefined; // grayscale carries no color signal

  let inflated: Buffer;
  try {
    inflated = inflateSync(idat);
  } catch {
    return undefined;
  }
  const pixels = unfilterPngScanlines(inflated, width, height, channels);
  if (!pixels) return undefined;

  // Group by a coarsened (quantized) color so near-identical anti-aliased
  // edge pixels collapse into the same bucket instead of splitting the vote.
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
  const totalPixels = width * height;
  const step = totalPixels > 40_000 ? Math.ceil(Math.sqrt(totalPixels / 40_000)) : 1; // subsample large images for speed

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * channels;
      let r: number, g: number, b: number, a: number;
      if (colorType === 3) {
        const paletteIndex = pixels[idx];
        if (!palette || paletteIndex * 3 + 2 >= palette.length) continue;
        r = palette[paletteIndex * 3];
        g = palette[paletteIndex * 3 + 1];
        b = palette[paletteIndex * 3 + 2];
        a = trns && paletteIndex < trns.length ? trns[paletteIndex] : 255;
      } else {
        r = pixels[idx];
        g = pixels[idx + 1];
        b = pixels[idx + 2];
        a = channels === 4 ? pixels[idx + 3] : 255;
      }
      if (a < 128 || isNeutralRgb(r, g, b)) continue;
      const quantize = (n: number) => Math.round(n / 16) * 16;
      const key = `${quantize(r)},${quantize(g)},${quantize(b)}`;
      const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0 };
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.count += 1;
      buckets.set(key, bucket);
    }
  }

  let best: { r: number; g: number; b: number; count: number } | undefined;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket;
  }
  if (!best) return undefined;
  return rgbToHex(best.r / best.count, best.g / best.count, best.b / best.count);
}

/**
 * Looks for a brand-ish CSS custom property (e.g. `--primary-color: #1a73e8;`
 * or `--brand: #ff5a1f;`) inside any inline `<style>` block. Sites that
 * bother naming a CSS variable "primary"/"brand"/"theme"/"accent" are, by
 * construction, telling us which color they consider their brand color —
 * a much stronger signal than guessing from raw background-color usage.
 */
function extractBrandColorFromCssVariables(html: string): string | undefined {
  const styleBlocks = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
  const varPattern = /--[\w-]*(?:brand|primary|theme|accent)[\w-]*\s*:\s*(#[0-9a-fA-F]{3,6})\b/gi;
  for (const block of styleBlocks) {
    const match = varPattern.exec(block);
    varPattern.lastIndex = 0; // reset since we only take the first match per block anyway
    if (match) return normalizeHex(match[1]);
  }
  return undefined;
}

/**
 * Last-resort heuristic: scans inline `<style>` blocks for hex colors used
 * as a `background`/`background-color`/`color`/`border-color` on
 * conspicuously "brand-carrying" selectors (buttons, links, nav/header),
 * and returns whichever non-neutral hex shows up most often. Weak signal —
 * a page can easily use an accent color for something unrelated to the
 * brand — which is why it's tried last, after the meta tags and named CSS
 * variables above.
 */
function scanCssForBrandColor(html: string): string | undefined {
  const styleBlocks = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
  const selectorPattern = /(?:^|[,{}\s])(?:\.?btn[\w-]*|button|a|nav|header|\.primary[\w-]*)[^{]*\{[^}]*\}/gi;
  const hexPattern = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/g;
  const counts = new Map<string, number>();
  for (const block of styleBlocks) {
    const ruleMatches = block.match(selectorPattern) || [];
    for (const rule of ruleMatches) {
      const hexMatches = rule.match(hexPattern) || [];
      for (const raw of hexMatches) {
        if (isNeutralHex(raw)) continue;
        const hex = normalizeHex(raw);
        counts.set(hex, (counts.get(hex) || 0) + 1);
      }
    }
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [hex, count] of counts) {
    if (count > bestCount) {
      best = hex;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Web-app manifest `theme_color` — the same signal browsers use for the
 * PWA install prompt / task-switcher tint, declared via
 * `<link rel="manifest" href="...">` in the raw HTML `<head>`. Deliberately
 * checked even though it costs an extra network round trip: modern SPA
 * frameworks (CRA, Next.js PWA plugin, Vite PWA plugin, etc.) commonly ship
 * a manifest.json with a `theme_color` while leaving everything else in
 * this file's other heuristics empty, because the actual page content is
 * rendered by client-side JS this scraper deliberately does not execute
 * (see file header) — the manifest link itself, though, is always present
 * in the raw server-rendered HTML regardless of client rendering, so it's
 * a reliable extra signal for exactly the kind of site the other
 * heuristics are weakest against.
 */
async function fetchManifestThemeColor(html: string, pageUrl: URL): Promise<string | undefined> {
  const manifestHref = extractLinkHref(html, "manifest");
  const manifestUrl = resolveUrl(pageUrl, manifestHref);
  if (!manifestUrl) return undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(manifestUrl, { signal: controller.signal });
    if (!res.ok) return undefined;
    const json = (await res.json().catch(() => undefined)) as { theme_color?: string } | undefined;
    const themeColor = json?.theme_color;
    return themeColor && HEX_COLOR_RE.test(themeColor.trim()) ? normalizeHex(themeColor) : undefined;
  } catch {
    // Manifest fetch failing (404, timeout, not JSON, CORS-irrelevant since
    // this runs server-side) is not itself an error worth surfacing — it
    // just means this particular signal is unavailable, same as any of the
    // other best-effort heuristics finding nothing.
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Best-effort brand color, tried in descending order of confidence:
 *   1. The ACTUAL logo image's dominant color (`extractBrandColorFromLogo()`)
 *      — sampled from the same PNG/SVG `logo_url` the merchant sees rendered
 *      in the onboarding UI, so the pre-filled swatch is guaranteed to
 *      visually match the logo next to it whenever it's decodable. Tried
 *      FIRST, ahead of the meta-tag signals below: those describe what the
 *      site wants the OS chrome tinted (address bar, PWA task-switcher),
 *      which is frequently a different color than the logo mark itself
 *      (e.g. an amber `theme-color` on a site with a coral/pink logo) — the
 *      exact mismatch this ordering exists to avoid.
 *   2. `<meta name="theme-color">` — the site explicitly declared this as
 *      its brand color (browsers use it to tint the address bar/task
 *      switcher); trusted when the logo itself didn't yield a signal (JPEG/
 *      WebP/ICO logos, or a monochrome/grayscale logo with no color to find).
 *   3. `<meta name="msapplication-TileColor">` — same idea, Windows/Edge's
 *      equivalent signal; plenty of sites set this one but not
 *      `theme-color`.
 *   4. `theme_color` from a linked web-app manifest.json (see
 *      `fetchManifestThemeColor()`) — covers client-rendered SPAs that
 *      declare it there instead of via a meta tag.
 *   5. A CSS custom property whose name mentions brand/primary/theme/accent.
 *   6. Most-frequent non-neutral hex color pulled from button/link/nav/
 *      header rules in inline `<style>` blocks.
 * Sites that render everything via an external stylesheet or client-side JS
 * with no manifest either (see file header), and whose logo isn't a
 * decodable PNG/SVG, won't match any of these and correctly fall through to
 * `undefined` — merchants can still pick a color by hand in that case.
 */
async function extractBrandColor(html: string, pageUrl: URL, logoUrl: string | undefined): Promise<string | undefined> {
  const logoColor = await extractBrandColorFromLogo(logoUrl);
  if (logoColor) return logoColor;

  const themeColor = extractMetaContent(html, "name", "theme-color");
  if (themeColor && HEX_COLOR_RE.test(themeColor.trim())) return normalizeHex(themeColor);

  const tileColor = extractMetaContent(html, "name", "msapplication-TileColor");
  if (tileColor && HEX_COLOR_RE.test(tileColor.trim())) return normalizeHex(tileColor);

  const manifestColor = await fetchManifestThemeColor(html, pageUrl);
  if (manifestColor) return manifestColor;

  const cssVariable = extractBrandColorFromCssVariables(html);
  if (cssVariable) return cssVariable;

  return scanCssForBrandColor(html);
}

function extractDescription(html: string): string | undefined {
  const ogDescription = extractMetaContent(html, "property", "og:description");
  if (ogDescription) return ogDescription;
  return extractMetaContent(html, "name", "description");
}

const VISIBLE_TEXT_MAX_CHARS = 8000;

/** Strips <script>/<style> blocks and tags to get a rough plain-text read of the page, for keyword matching only — not meant to be a clean text extraction. */
function extractVisibleText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, " ");
  return decodeEntities(withoutTags).replace(/\s+/g, " ").trim().slice(0, VISIBLE_TEXT_MAX_CHARS);
}

/**
 * Which BBPS bill-payment categories (`mapping/billCategories.ts`) this
 * merchant would plausibly want to enable for their customers, inferred
 * from page content. Two heuristics, both weak by nature and always
 * surfaced with `reason` so they're checkable, never a black box:
 *
 * 1. Direct keyword match — the page itself talks about a specific utility
 *    (e.g. a DTH operator's own site mentioning "set top box").
 * 2. Fintech/bank/payments signal — if the business reads as a bank/NBFC/
 *    wallet/payments platform, suggest the handful of bill categories most
 *    commonly bundled into a "pay your bills" feature in that kind of app,
 *    since that's the plausible product reason they're onboarding to BBPS
 *    at all. This is the weakest signal of the two and deliberately capped.
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Electricity: ["electricity", "discom", "power distribution", "power utility", "power corporation"],
  Water: ["water board", "water supply", "water utility", "water corporation"],
  Gas: ["piped gas", "city gas distribution", "png connection", "natural gas distribution"],
  "LPG Gas": ["lpg cylinder", "lpg booking", "gas cylinder booking", "lpg gas"],
  DTH: ["dth", "direct to home", "set top box", "cable tv", "cable operator"],
  "Mobile Postpaid": ["postpaid plan", "postpaid bill", "postpaid connection"],
  "Mobile Prepaid": ["prepaid recharge", "mobile recharge", "telecom operator", "sim card", "recharge plans"],
  Broadband: ["broadband", "fibernet", "landline", "internet service provider", "fiber internet"],
  "Credit Card": ["credit card"],
  "Loan Repayment": ["loan emi", "loan repayment", "personal loan", "home loan", "vehicle loan", "car loan"],
  Insurance: ["insurance premium", "insurance policy", "life insurance", "health insurance", "insurer"],
  "Tax Payment": ["municipal tax", "property tax"],
  "Housing Society": ["housing society", "resident welfare association", "society maintenance"],
  "Education Fees": ["school fees", "college fees", "tuition fees", "admission fees"],
  "Subscription Fees": ["subscription plan", "membership fee"],
  "Club and Association": ["club membership", "association dues"],
  Hospital: ["hospital", "healthcare provider", "clinic", "diagnostic centre", "diagnostic center"],
  "Recurring Deposit": ["recurring deposit"],
  FASTag: ["fastag", "toll payment", "toll plaza"],
};

const FINTECH_SIGNAL_KEYWORDS = [
  "bank",
  "nbfc",
  "fintech",
  "neobank",
  "digital wallet",
  "upi",
  "payments platform",
  "payment gateway",
  "lending",
  "credit line",
];
const FINTECH_BUNDLE_CATEGORIES = ["Electricity", "Mobile Prepaid", "Mobile Postpaid", "DTH", "Credit Card", "Loan Repayment"];
const MAX_SUGGESTED_CATEGORIES = 8;

function inferCategories(searchText: string): CategorySuggestion[] {
  const lower = searchText.toLowerCase();
  const suggestions: CategorySuggestion[] = [];
  const suggestedKeys = new Set<string>();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const matchedKeyword = keywords.find((kw) => lower.includes(kw));
    if (matchedKeyword) {
      suggestions.push({ category, reason: `Page content mentions "${matchedKeyword}"` });
      suggestedKeys.add(category);
    }
  }

  const matchedFintechKeyword = FINTECH_SIGNAL_KEYWORDS.find((kw) => lower.includes(kw));
  if (matchedFintechKeyword) {
    for (const category of FINTECH_BUNDLE_CATEGORIES) {
      if (!suggestedKeys.has(category)) {
        suggestions.push({
          category,
          reason: `Business reads as a bank/fintech/payments platform (mentions "${matchedFintechKeyword}") — commonly bundled into a bill-pay feature`,
        });
        suggestedKeys.add(category);
      }
    }
  }

  return suggestions.slice(0, MAX_SUGGESTED_CATEGORIES);
}

function tierFromRank(rank: number): ScaleTier {
  const tiers: ScaleTier[] = ["small", "medium", "large", "enterprise"];
  return tiers[Math.max(0, Math.min(tiers.length - 1, rank))];
}

/**
 * Coarse, transparent-basis size signal. Every bump is a literal, checkable
 * fact about the page (never an invented number) — see the module doc
 * comment for why this can't be a real customers/downloads/GMV figure.
 */
function estimateScale(html: string): EstimatedScaleSignals {
  const hasAppStoreLink = /apps\.apple\.com/i.test(html);
  const hasPlayStoreLink = /play\.google\.com\/store\/apps/i.test(html);
  const linkCount = (html.match(/<a\s+[^>]*href=/gi) || []).length;
  const ratingCountMatch = html.match(/"ratingCount"\s*:\s*"?(\d[\d,]*)"?/i) || html.match(/"reviewCount"\s*:\s*"?(\d[\d,]*)"?/i);
  const ratingCount = ratingCountMatch ? Number(ratingCountMatch[1].replace(/,/g, "")) : undefined;
  const hasEcommerceSchema = /"@type"\s*:\s*"(Product|Offer|OnlineStore)"/i.test(html);
  const htmlSizeKb = Math.round(html.length / 1024);

  const sharedBasis: string[] = [];
  let rank = 0; // starts at "small"

  if (hasAppStoreLink && hasPlayStoreLink) {
    sharedBasis.push("Links to both an App Store and Play Store listing");
    rank += 1;
  } else if (hasAppStoreLink || hasPlayStoreLink) {
    sharedBasis.push(`Links to ${hasAppStoreLink ? "an App Store" : "a Play Store"} listing`);
  }
  if (ratingCount !== undefined) {
    sharedBasis.push(`Page cites a rating/review count of ~${ratingCount.toLocaleString()}`);
    if (ratingCount > 100_000) rank += 2;
    else if (ratingCount > 10_000) rank += 1;
  }
  if (linkCount > 200) {
    sharedBasis.push(`Large page (${linkCount} links found) suggesting an established site`);
    rank += 1;
  } else if (linkCount > 80) {
    sharedBasis.push(`Moderately large page (${linkCount} links found)`);
  }

  const customersBasis = [...sharedBasis];
  const downloadsBasis = [...sharedBasis.filter((b) => !b.startsWith("Page cites") || ratingCount !== undefined)];
  const gmvBasis = [...sharedBasis];
  if (hasEcommerceSchema) {
    gmvBasis.push("Page includes e-commerce product/offer markup");
  }

  const noSignals = sharedBasis.length === 0;

  function toEstimate(basis: string[], rankOverride?: number): ScaleEstimate {
    if (noSignals && basis.length === 0) {
      return { tier: "unknown", label: "Unknown — not enough signal on the page to estimate", basis: [] };
    }
    const finalRank = rankOverride ?? rank;
    const tier = tierFromRank(finalRank);
    return {
      tier,
      label: `${tier.charAt(0).toUpperCase() + tier.slice(1)} (estimated, low confidence)`,
      basis: basis.length > 0 ? basis : [`Page size ~${htmlSizeKb}KB (weak signal only)`],
    };
  }

  const gmvRank = hasEcommerceSchema ? rank + 1 : rank;

  return {
    customers: toEstimate(customersBasis, rank),
    app_downloads:
      hasAppStoreLink || hasPlayStoreLink
        ? toEstimate(downloadsBasis, rank)
        : { tier: "unknown", label: "Unknown — no app store listing found on the page", basis: [] },
    gmv: toEstimate(gmvBasis, gmvRank),
  };
}

export async function scrapeWebsite(rawUrl: string): Promise<WebsiteScrapeResult> {
  const url = normalizeUrl(rawUrl);
  const { html, warnings } = await fetchHtml(url);

  const brand_name = extractBrandName(html, url);
  const logo_url = extractLogoUrl(html, url);
  const brand_color = await extractBrandColor(html, url, logo_url);
  const business_description = extractDescription(html);
  const visibleText = extractVisibleText(html);
  const suggested_categories = inferCategories([business_description, visibleText].filter(Boolean).join(" "));

  if (!business_description) warnings.push("Could not find a meta description on the page — business description left blank.");
  if (!brand_color) {
    warnings.push(
      "Couldn't sample a color from the logo, and couldn't find a theme-color meta tag, a web-app manifest theme color, a branded CSS variable, or a recurring accent color on the page — brand color left as default; pick one manually."
    );
  }
  if (suggested_categories.length === 0) {
    warnings.push("Could not confidently infer which bill-payment categories this business would want — select manually below.");
  }

  return {
    source_url: url.toString(),
    brand_name,
    logo_url,
    brand_color,
    business_description,
    estimated_scale: estimateScale(html),
    suggested_categories,
    warnings,
  };
}
