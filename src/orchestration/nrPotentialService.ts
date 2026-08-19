/**
 * "NR (Net Revenue) potential" calculator shown on the merchant-onboarding
 * results screen, below branding.
 *
 * Chain: Merchant Active Users -> Category Adoption -> Monthly Transacting
 * Users -> Transactions -> GMV -> NR.
 *
 *   category_penetration   = industry_category_mau / industry_overall_digital_mau   (capped at 100%)
 *   merchant_category_mau  = merchant_active_users x category_penetration x affinity_factor   (steady-state ceiling)
 *   monthly_category_users = merchant_category_mau x ramp_pct(month)
 *   txns_per_user_per_month (industry) = npci_monthly_volume / industry_category_mau
 *   monthly_volume          = monthly_category_users x txns_per_user_per_month
 *   monthly_value            = monthly_volume x avg_transaction_value
 *   NR                       = value x 0.3% (NR_RATE_OF_GMV)
 *
 * Run once per scenario (Conservative / Base / Upside) — each scales the
 * ramp curve and the "affinity factor" (how much more/less likely this
 * merchant's user base is to adopt a category than an average digitally
 * active Indian; defaults to 1.0x, i.e. "no demographic signal").
 *
 * All industry figures come from `mapping/npciCategoryStats.ts` — see that
 * file's header for exactly which numbers are sourced vs. rough estimates.
 * This service intentionally never invents a number that file doesn't
 * provide, and always surfaces `mau_basis` / `npci_as_of` per category so
 * the merchant can see what's solid and what's a placeholder.
 */

import { listBillCategoryOptions } from "../mapping/billCategories";
import {
  CATEGORY_INDUSTRY_STATS,
  INDUSTRY_OVERALL_DIGITAL_MAU_BASIS,
  INDUSTRY_OVERALL_DIGITAL_MAU_MN,
  NR_RATE_OF_GMV,
} from "../mapping/npciCategoryStats";
import {
  MerchantOnboardingResource,
  NrPotentialCategoryProjection,
  NrPotentialResult,
  NrPotentialScenarioKey,
  NrPotentialScenarioResult,
} from "../types/onboarding";

/**
 * Illustrative 12-month adoption ramp: cumulative % of a category's
 * *potential* users (merchant_category_mau) activated by that month.
 * M1=10% ... M12=65%, +5 points/month. Uniform across categories for now —
 * a category-specific ramp (e.g. FASTag ramping faster than Insurance)
 * would be a natural next refinement once real cohort data exists.
 */
const BASE_RAMP_PCT = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65];

/** Ramp curve and affinity factor are both scaled per scenario; ramp is capped at 95% either way (see rampPctForMonth). */
const SCENARIOS: Array<{ key: NrPotentialScenarioKey; label: string; ramp_multiplier: number; affinity_factor: number }> = [
  { key: "conservative", label: "Conservative", ramp_multiplier: 0.7, affinity_factor: 0.8 },
  { key: "base", label: "Base", ramp_multiplier: 1.0, affinity_factor: 1.0 },
  { key: "upside", label: "Upside", ramp_multiplier: 1.3, affinity_factor: 1.2 },
];

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  listBillCategoryOptions().map((c) => [c.key, c.label])
);

function rampPctForMonth(month: number, rampMultiplier: number): number {
  const base = BASE_RAMP_PCT[month - 1] ?? BASE_RAMP_PCT[BASE_RAMP_PCT.length - 1];
  return Math.min(base * rampMultiplier, 95);
}

function categoryPenetration(industryCategoryMauMn: number): number {
  if (INDUSTRY_OVERALL_DIGITAL_MAU_MN <= 0) return 0;
  return Math.min(industryCategoryMauMn / INDUSTRY_OVERALL_DIGITAL_MAU_MN, 1);
}

function projectCategory(
  category: string,
  merchantActiveUsers: number,
  rampMultiplier: number,
  affinityFactor: number
): NrPotentialCategoryProjection {
  const stats = CATEGORY_INDUSTRY_STATS[category];
  const penetration = categoryPenetration(stats.industry_category_mau_mn);
  const txnsPerUserPerMonth =
    stats.industry_category_mau_mn > 0 ? stats.npci_monthly_volume_mn / stats.industry_category_mau_mn : 0;

  // Steady-state ceiling: never let penetration x affinity exceed 100% of the merchant's active base.
  const adoptedFraction = Math.min(penetration * affinityFactor, 1);
  const merchantCategoryMauPotential = merchantActiveUsers * adoptedFraction;

  const months = BASE_RAMP_PCT.map((_, idx) => {
    const month = idx + 1;
    const rampPct = rampPctForMonth(month, rampMultiplier);
    const users = merchantCategoryMauPotential * (rampPct / 100);
    const transactions = users * txnsPerUserPerMonth;
    const value = transactions * stats.avg_transaction_value;
    return { month, ramp_pct: rampPct, users, transactions, value };
  });

  const fy1Transactions = months.reduce((sum, m) => sum + m.transactions, 0);
  const fy1Value = months.reduce((sum, m) => sum + m.value, 0);

  return {
    category,
    label: CATEGORY_LABELS[category] ?? category,
    npci_monthly_value_cr: stats.npci_monthly_value_cr,
    npci_monthly_volume_mn: stats.npci_monthly_volume_mn,
    npci_as_of: stats.npci_as_of,
    avg_transaction_value: stats.avg_transaction_value,
    industry_category_mau_mn: stats.industry_category_mau_mn,
    mau_basis: stats.mau_basis,
    category_penetration: penetration,
    industry_transactions_per_user_per_month: txnsPerUserPerMonth,
    merchant_category_mau_potential: merchantCategoryMauPotential,
    months,
    fy1_totals: {
      exit_month_users: months[months.length - 1].users,
      transactions: fy1Transactions,
      value: fy1Value,
    },
  };
}

function projectScenario(
  key: NrPotentialScenarioKey,
  label: string,
  rampMultiplier: number,
  affinityFactor: number,
  categories: string[],
  merchantActiveUsers: number
): NrPotentialScenarioResult {
  const categoryProjections = categories
    .filter((c) => c in CATEGORY_INDUSTRY_STATS)
    .map((c) => projectCategory(c, merchantActiveUsers, rampMultiplier, affinityFactor));

  const year1Transactions = categoryProjections.reduce((sum, c) => sum + c.fy1_totals.transactions, 0);
  const year1Gmv = categoryProjections.reduce((sum, c) => sum + c.fy1_totals.value, 0);
  const exitMonthlyGmv = categoryProjections.reduce((sum, c) => sum + c.months[c.months.length - 1].value, 0);

  // Deduplicated exit-month active-user estimate: treat per-category adoption as
  // independent probabilities and take the probability of adopting at least one
  // category, rather than naively summing (which would double-count merchants'
  // users who pay more than one bill category).
  const exitAdoptionFraction =
    1 -
    categoryProjections.reduce((product, c) => {
      const exitRampPct = c.months[c.months.length - 1].ramp_pct;
      const adoptedFraction = merchantActiveUsers > 0 ? c.merchant_category_mau_potential / merchantActiveUsers : 0;
      const p = Math.min(adoptedFraction * (exitRampPct / 100), 0.95);
      return product * (1 - p);
    }, 1);
  const year1ActiveUsers = merchantActiveUsers * exitAdoptionFraction;

  return {
    scenario: key,
    label,
    ramp_multiplier: rampMultiplier,
    affinity_factor: affinityFactor,
    year1_active_users: year1ActiveUsers,
    year1_transactions: year1Transactions,
    year1_gmv: year1Gmv,
    exit_monthly_gmv: exitMonthlyGmv,
    year1_nr: year1Gmv * NR_RATE_OF_GMV,
    exit_monthly_nr: exitMonthlyGmv * NR_RATE_OF_GMV,
    categories: categoryProjections,
  };
}

export function computeNrPotential(resource: MerchantOnboardingResource): NrPotentialResult {
  const base: Omit<NrPotentialResult, "available" | "message" | "scenarios" | "merchant_active_users"> = {
    entity: "bill_payment.nr_potential",
    merchant_onboarding_id: resource.id,
    industry_overall_digital_mau_mn: INDUSTRY_OVERALL_DIGITAL_MAU_MN,
    industry_overall_digital_mau_basis: INDUSTRY_OVERALL_DIGITAL_MAU_BASIS,
    ramp_curve_pct: BASE_RAMP_PCT,
    nr_rate_of_gmv: NR_RATE_OF_GMV,
    notes: [
      "All NPCI value/volume figures are Bharat Connect's real, published network-wide numbers — see each category's npci_as_of.",
      "Industry category MAU figures are rough addressable-population estimates (see each category's mau_basis), not confirmed digital-adoption counts — used only to derive a penetration ratio.",
      "Average transaction value is a merchant-provided reference figure per category, used as-is rather than re-derived from NPCI value ÷ volume.",
      "NR = projected transaction value × 0.3%.",
    ],
  };

  if (!resource.categories || resource.categories.length === 0) {
    return { ...base, available: false, message: "No bill-payment categories selected — nothing to project." };
  }

  const merchantActiveUsers = resource.estimated_user_base;
  if (!merchantActiveUsers || merchantActiveUsers <= 0) {
    return {
      ...base,
      available: false,
      message:
        'No "Estimated user base" was provided for this merchant — it\'s required to project category adoption. Fill it in (section 1) and resubmit, or use "Autofill from website" to derive a rough figure.',
    };
  }

  const scenarios = Object.fromEntries(
    SCENARIOS.map((s) => [
      s.key,
      projectScenario(s.key, s.label, s.ramp_multiplier, s.affinity_factor, resource.categories, merchantActiveUsers),
    ])
  ) as Record<NrPotentialScenarioKey, NrPotentialScenarioResult>;

  return { ...base, available: true, merchant_active_users: merchantActiveUsers, scenarios };
}
