/**
 * Read-only catalog access against the REAL Razorpay production BBPS API
 * (`https://api.razorpay.com/v1/bill_payments`) — categories and
 * billers-within-category ONLY. This is one of the three operations
 * production access is scoped to; see CLAUDE.md "Production Razorpay BBPS
 * API — usage constraints".
 *
 * Confirmed by hand against the live endpoint: `GET /billers/categories`
 * returns `{ categories: string[] }` and `GET /billers?category=` returns
 * `{ entity: "collection", count, items: [...] }` — i.e. the exact same
 * envelope shape `src/http/routes/billers.ts` already serves from the local
 * static registry. The per-biller item shape is NOT the same as this repo's
 * local `BillerResource` (see `src/types/merchant.ts`), though, so
 * `mapProductionBillerToResource()` below translates it — this keeps every
 * downstream consumer (curated_offering computation, billpay-widget, the
 * onboarding UI) working unchanged regardless of whether a biller came from
 * the local registry or the real production catalog.
 */

import { getProductionCredentials } from "../config/credentials";
import { BillerCustomerParam, BillerMode, BillerResource, FetchRequirement, PaymentAmountExactness } from "../types/merchant";

interface ProductionBillerParam {
  name: string;
  data_type?: string;
  min_length?: number;
  max_length?: number;
  regex?: string;
  optional?: boolean;
}

interface ProductionBillerRaw {
  id: string;
  gateway_biller_id?: string;
  name: string;
  alias_name?: string;
  category: string;
  status?: string;
  logo_url?: string;
  supported_channels?: string[];
  gateway_data?: {
    account_holder_config?: { params?: ProductionBillerParam[] };
    bill_request_config?: { bill_request_required?: string };
    payment_config?: { amount_exactness?: string; bill_request_required?: string; methods?: { method: string }[] };
  };
}

interface ProductionCategoriesResponse {
  categories: string[];
}

interface ProductionBillersResponse {
  entity: string;
  count: number;
  items: ProductionBillerRaw[];
}

// Simple in-memory cache — this catalog changes rarely (new billers get
// onboarded, not re-onboarded every minute), so there's no reason to hit
// production on every single request. Not subject to the 4-fetch consumer
// cap (that only applies to consumer/bill-data fetch, not catalog listing).
const CACHE_TTL_MS = 10 * 60 * 1000;
let categoriesCache: { at: number; value: string[] } | undefined;
const billersCache = new Map<string, { at: number; value: BillerResource[] }>();

function authHeader(keyId: string, keySecret: string): string {
  return "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}

function requireCreds() {
  const creds = getProductionCredentials();
  if (!creds) {
    throw new Error(
      "BBPS_MODE=production but no production credentials are configured. " +
        "Populate BBPS_PRODUCTION_KEY_ID/BBPS_PRODUCTION_KEY_SECRET/BBPS_PRODUCTION_MID/" +
        "BBPS_PRODUCTION_BASE_URL in .env, or set BBPS_MODE=mock."
    );
  }
  return creds;
}

function fetchRequirementFrom(raw?: string): FetchRequirement {
  if (raw === "mandatory") return "MANDATORY";
  if (raw === "optional") return "OPTIONAL";
  return "NOT_SUPPORTED";
}

function amountExactnessFrom(raw?: string): PaymentAmountExactness | undefined {
  if (raw === "exact") return "Exact";
  if (raw === "exact_and_above") return "Exact and above";
  if (raw === "exact_and_below") return "Exact and below";
  return undefined;
}

/**
 * Translates one real production biller object into this app's local
 * `BillerResource` shape. Two fields have no confirmed 1:1 production
 * equivalent and are conservatively defaulted rather than guessed:
 *   - `support_bill_validation`: no distinct "validation" signal was found
 *     on the production payload sampled (`bill_request_config` only
 *     distinguishes fetch requirement) — defaults to "NOT_SUPPORTED".
 *   - `mode`: production's `supported_channels` doesn't map cleanly to NPCI's
 *     ONLINE/OFFLINE_A/OFFLINE_B biller-mode taxonomy — defaults to "ONLINE"
 *     when "online" is present (true for every biller sampled), since that's
 *     the only mode this server's HTTP-only flows can service anyway.
 */
export function mapProductionBillerToResource(raw: ProductionBillerRaw): BillerResource {
  const params = raw.gateway_data?.account_holder_config?.params || [];
  const customer_params: BillerCustomerParam[] = params.map((p) => ({
    name: p.name,
    data_type: p.data_type || "string",
    min_length: p.min_length,
    max_length: p.max_length,
    regex: p.regex,
    optional: p.optional ?? false,
  }));

  const fetchRequirement = fetchRequirementFrom(raw.gateway_data?.bill_request_config?.bill_request_required);
  const mode: BillerMode = "ONLINE";

  return {
    id: raw.gateway_biller_id || raw.id,
    name: raw.name,
    alias_name: raw.alias_name,
    category: raw.category,
    mode,
    accepts_adhoc: fetchRequirement === "NOT_SUPPORTED",
    fetch_requirement: fetchRequirement,
    support_bill_validation: "NOT_SUPPORTED",
    payment_amount_exactness: amountExactnessFrom(raw.gateway_data?.payment_config?.amount_exactness),
    payment_modes: Array.from(new Set((raw.gateway_data?.payment_config?.methods || []).map((m) => m.method))),
    customer_params,
    logo_url: raw.logo_url,
  };
}

async function productionGet<T>(path: string): Promise<T> {
  const creds = requireCreds();
  const res = await fetch(`${creds.baseUrl}${path}`, {
    method: "GET",
    headers: { Authorization: authHeader(creds.keyId, creds.keySecret) },
  });
  if (!res.ok) {
    throw new Error(`Production BBPS catalog request failed: GET ${path} -> HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function fetchProductionCategories(): Promise<string[]> {
  if (categoriesCache && Date.now() - categoriesCache.at < CACHE_TTL_MS) return categoriesCache.value;
  const { categories } = await productionGet<ProductionCategoriesResponse>("/billers/categories");
  categoriesCache = { at: Date.now(), value: categories };
  return categories;
}

// Razorpay's standard REST list pagination (same convention as the Payments
// API): `count` is the page size (max returned per call, itself capped at
// 100 by the server regardless of what's requested), and the response's
// `count` field is just "how many items came back in this page", NOT the
// total across all pages. Confirmed by hand: `?category=electricity`
// (no explicit paging) returned exactly 100 items, but
// `?category=electricity&skip=100` returned 4 MORE — i.e. that category
// actually has 104 billers, and the un-paginated call was silently
// truncated. Must page with `skip` until a page comes back short of
// `PAGE_SIZE`.
const PAGE_SIZE = 100;

// Deliberate cap, NOT just a safety net — confirmed by hand that some
// categories are genuinely huge (`education_fees` has 20,000+ billers,
// individually-registered schools/colleges) and paginating through all of
// them on every request would mean hundreds of sequential network round
// trips per category, blocking the onboarding-wizard submission / biller
// listing endpoints for many seconds. All "normal" categories confirmed so
// far (electricity 104, loan_repayment 529, housing_society 394,
// broadband_postpaid 406, b2b 116, credit_card 39) fit comfortably under
// this cap, so it fixes the original under-counting bug for them while
// bounding worst-case categories to a sample rather than their full,
// enormous real count.
const MAX_PAGES = 10;

async function fetchAllPages(path: string): Promise<ProductionBillerRaw[]> {
  const items: ProductionBillerRaw[] = [];
  let skip = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const pageUrl = `${path}${sep}count=${PAGE_SIZE}&skip=${skip}`;
    const { items: pageItems } = await productionGet<ProductionBillersResponse>(pageUrl);
    items.push(...pageItems);
    if (pageItems.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }
  return items;
}

export async function fetchProductionBillers(category?: string): Promise<BillerResource[]> {
  const cacheKey = category || "__all__";
  const cached = billersCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const path = category ? `/billers?category=${encodeURIComponent(category)}` : "/billers";
  const items = await fetchAllPages(path);
  const mapped = items.map(mapProductionBillerToResource);
  billersCache.set(cacheKey, { at: Date.now(), value: mapped });
  return mapped;
}

export async function fetchProductionBillerById(id: string): Promise<BillerResource | undefined> {
  // No single-item production endpoint confirmed by id lookup that's cheaper
  // than listing, so scan the (cached) full catalog — but "the full catalog"
  // must be assembled the same way `src/http/routes/billers.ts`'s
  // `loadBillers()` does: fan out `fetchProductionBillers(category)` per
  // category. Calling `fetchProductionBillers()` with no category hits
  // production's UNFILTERED `GET /billers`, which — confirmed by hand
  // elsewhere in this file — truncates to ~100 items total ACROSS ALL
  // CATEGORIES COMBINED, not the real full catalog. That previously made
  // this function 404 on real billers (e.g. IDFC/HDFC credit cards) that
  // exist well past the first ~100 cross-category items but are very much
  // present once you fetch the credit_card category on its own — the same
  // biller a merchant could just have searched up in the widget's own biller
  // list, which does go through the correct per-category fan-out.
  const categories = await fetchProductionCategories();
  const perCategory = await Promise.all(categories.map((c) => fetchProductionBillers(c)));
  return perCategory.flat().find((b) => b.id === id);
}
