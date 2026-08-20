/**
 * Backs the merchant-onboarding wizard (`public/onboarding.html`): takes a
 * business description + selected bill-payment categories + branding +
 * integration shape, and returns a "curated offering preview" — which
 * categories already have billers wired up vs. which are still "coming
 * soon" (would be provisioned from a real NPCI Biller MDM feed once BBPS
 * credentials exist).
 *
 * When `BBPS_MODE=production`, this reflects the REAL production biller
 * catalog (see `src/gateway/productionBillerCatalogClient.ts`), same as
 * `GET /billers` in `src/http/routes/billers.ts` — falling back to the local
 * static sample registry only if the production catalog call fails, exactly
 * mirroring `loadBillers()` there. In any other mode it uses the local
 * static sample registry, in which case the "live" billers listed are mock
 * sample data, not real billers.
 *
 * Deliberately honest about coverage: it does NOT claim every category the
 * merchant picks is immediately live just because they asked for it — see
 * `computeCuratedOffering()`.
 */

import { config } from "../config/env";
import { fetchProductionBillers } from "../gateway/productionBillerCatalogClient";
import { generateEntityId } from "../ids/generator";
import { listBillers } from "../mapping/billerRegistry";
import { mapUiCategoryToProductionCategories } from "../mapping/billCategories";
import { BillerResource } from "../types/merchant";
import { MemoryStore } from "../store/memoryStore";
import {
  CategoryCoverage,
  CuratedOfferingPreview,
  MerchantBranding,
  MerchantOnboardingCreateInput,
  MerchantOnboardingResource,
} from "../types/onboarding";

const store = new MemoryStore<MerchantOnboardingResource>();

function dedupeBillersById(billers: BillerResource[]): BillerResource[] {
  const seen = new Set<string>();
  return billers.filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)));
}

/**
 * Fetches billers for a single onboarding-UI category key (e.g. "Credit
 * Card", "DTH" — see `BBPS_CATEGORY_OPTIONS` in `mapping/billCategories.ts`).
 *
 * Production's UNFILTERED `GET /billers` (no `category` query param) is
 * paginated/capped at ~100 items total ACROSS ALL CATEGORIES COMBINED — it
 * is NOT "the full catalog" — so this must always call
 * `fetchProductionBillers(category)` per selected category, never the
 * unfiltered form. Confirmed by hand: unfiltered returned only 1 electricity
 * biller while `?category=electricity` correctly returned 100.
 *
 * Just as important: the UI's category KEY ("Credit Card") is not the same
 * string as production's category SLUG ("credit_card") — see
 * `mapUiCategoryToProductionCategories()`. Passing the raw UI key straight
 * to production doesn't error (it 200s with a bare `{"entity":"collection"}`,
 * no `items`), which — unmapped — throws deep in pagination and gets
 * silently swallowed by the network-error fallback below, surfacing STALE
 * local demo data that looks plausible instead of real production coverage.
 * So the UI key is translated to real production slug(s) FIRST; a key with
 * no confirmed production equivalent (e.g. "NCC") is honestly "coming soon"
 * (no billers, no network call, no fallback) rather than substituting fake
 * local sample data for a category production doesn't actually have.
 */
interface CategoryBillers {
  billers: BillerResource[];
  /** Whether `billers` actually came from the real production catalog, or the local sample registry (including the production-mode error fallback below). */
  source: "production" | "sample";
}

async function loadBillersForCategory(category: string): Promise<CategoryBillers> {
  if (config.bbpsMode !== "production") {
    return {
      billers: listBillers().filter((b) => b.category.toLowerCase() === category.toLowerCase()),
      source: "sample",
    };
  }
  const productionSlugs = mapUiCategoryToProductionCategories(category);
  if (productionSlugs.length === 0) return { billers: [], source: "production" };
  try {
    const perSlug = await Promise.all(productionSlugs.map((slug) => fetchProductionBillers(slug)));
    return { billers: dedupeBillersById(perSlug.flat()), source: "production" };
  } catch (err) {
    console.error(`[merchantOnboarding] production billers fetch failed for category "${category}", falling back to local registry:`, err);
    return {
      billers: listBillers().filter((b) => b.category.toLowerCase() === category.toLowerCase()),
      source: "sample",
    };
  }
}

export async function computeCuratedOffering(categories: string[]): Promise<CuratedOfferingPreview> {
  const usingProductionCatalog = config.bbpsMode === "production";
  const coverage: CategoryCoverage[] = await Promise.all(
    categories.map(async (category) => {
      const { billers, source } = await loadBillersForCategory(category);
      return {
        category,
        status: billers.length > 0 ? "live" : "coming_soon",
        catalog_source: source,
        biller_count: billers.length,
        biller_ids: billers.map((b) => b.id),
      } as CategoryCoverage;
    })
  );

  const liveCount = coverage.filter((c) => c.status === "live").length;
  const recommended_next_step = usingProductionCatalog
    ? liveCount === coverage.length && coverage.length > 0
      ? "All requested categories already have real production billers available — you can start integration testing now."
      : "Some categories don't have any production billers yet. Our onboarding team will follow up as NPCI's Biller MDM feed adds coverage, and update this offering automatically."
    : liveCount === coverage.length && coverage.length > 0
      ? "All requested categories already have sample billers wired up behind the mock BBPCU — you can start integration testing against BBPS_MODE=mock immediately."
      : "Some categories don't have sample billers yet. Our onboarding team will provision the remaining categories from NPCI's Biller MDM feed once your BBPS credentials are issued, and update this offering automatically.";

  return {
    categories: coverage,
    total_categories_requested: categories.length,
    categories_with_live_coverage: liveCount,
    recommended_next_step,
  };
}

export async function createMerchantOnboarding(
  input: MerchantOnboardingCreateInput,
  branding: MerchantBranding
): Promise<MerchantOnboardingResource> {
  const id = generateEntityId("onboarding");
  const createdAt = Date.now();
  const resource: MerchantOnboardingResource = {
    id,
    entity: "bill_payment.merchant_onboarding",
    business_description: input.business_description,
    categories: input.categories,
    integration_mode: input.integration_mode,
    existing_app: input.integration_mode === "existing_app_section" ? input.existing_app : undefined,
    estimated_user_base: input.estimated_user_base,
    design_system: input.design_system,
    entry_point: input.entry_point,
    receipt_co_branding: input.receipt_co_branding,
    source_url: input.source_url,
    estimated_scale: input.estimated_scale,
    branding,
    curated_offering: await computeCuratedOffering(input.categories),
    created_at: createdAt,
    updated_at: createdAt,
  };
  store.set(id, resource);
  return resource;
}

export function getMerchantOnboarding(id: string): MerchantOnboardingResource | undefined {
  return store.get(id);
}

export function listMerchantOnboardings(): MerchantOnboardingResource[] {
  return store.list();
}
