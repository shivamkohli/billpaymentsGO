/**
 * Backs the merchant-onboarding wizard (`public/onboarding.html`): takes a
 * business description + selected bill-payment categories + branding +
 * integration shape, and returns a "curated offering preview" — which
 * categories already have sample billers wired up behind the mock BBPCU
 * vs. which are still "coming soon" (would be provisioned from a real
 * NPCI Biller MDM feed once BBPS credentials exist).
 *
 * Deliberately honest about coverage: it does NOT claim every category the
 * merchant picks is immediately live just because they asked for it — see
 * `computeCuratedOffering()`.
 */

import { generateEntityId } from "../ids/generator";
import { listBillers } from "../mapping/billerRegistry";
import { MemoryStore } from "../store/memoryStore";
import {
  CategoryCoverage,
  CuratedOfferingPreview,
  MerchantBranding,
  MerchantOnboardingCreateInput,
  MerchantOnboardingResource,
} from "../types/onboarding";

const store = new MemoryStore<MerchantOnboardingResource>();

export function computeCuratedOffering(categories: string[]): CuratedOfferingPreview {
  const allBillers = listBillers();
  const coverage: CategoryCoverage[] = categories.map((category) => {
    const matches = allBillers.filter((b) => b.category.toLowerCase() === category.toLowerCase());
    return {
      category,
      status: matches.length > 0 ? "live_sample_billers" : "coming_soon",
      sample_biller_count: matches.length,
      sample_biller_ids: matches.map((b) => b.id),
    };
  });

  const liveCount = coverage.filter((c) => c.status === "live_sample_billers").length;
  const recommended_next_step =
    liveCount === coverage.length && coverage.length > 0
      ? "All requested categories already have sample billers wired up behind the mock BBPCU — you can start integration testing against BBPS_MODE=mock immediately."
      : "Some categories don't have sample billers yet. Our onboarding team will provision the remaining categories from NPCI's Biller MDM feed once your BBPS credentials are issued, and update this offering automatically.";

  return {
    categories: coverage,
    total_categories_requested: categories.length,
    categories_with_live_coverage: liveCount,
    recommended_next_step,
  };
}

export function createMerchantOnboarding(
  input: MerchantOnboardingCreateInput,
  branding: MerchantBranding
): MerchantOnboardingResource {
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
    curated_offering: computeCuratedOffering(input.categories),
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
