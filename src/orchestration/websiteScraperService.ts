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

import { CategorySuggestion, EstimatedScaleSignals, ScaleEstimate, ScaleTier, WebsiteScrapeResult } from "../types/onboarding";

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 2_000_000; // avoid pulling down huge pages just to regex a few tags

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

function extractBrandColor(html: string): string | undefined {
  const themeColor = extractMetaContent(html, "name", "theme-color");
  if (themeColor && /^#[0-9a-f]{3,8}$/i.test(themeColor.trim())) return themeColor.trim();
  return undefined;
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
  const brand_color = extractBrandColor(html);
  const business_description = extractDescription(html);
  const visibleText = extractVisibleText(html);
  const suggested_categories = inferCategories([business_description, visibleText].filter(Boolean).join(" "));

  if (!business_description) warnings.push("Could not find a meta description on the page — business description left blank.");
  if (!brand_color) warnings.push("No theme-color meta tag found — brand color left as default; pick one manually.");
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
