/**
 * Sourced reference data for the "NR (Net Revenue) potential" calculator
 * shown on the merchant-onboarding results screen (see
 * `orchestration/nrPotentialService.ts` and `GET
 * /v1/merchant_onboarding/:id/nr_potential`).
 *
 * Three very different kinds of numbers live in this file, and they carry
 * very different confidence levels — never conflate them:
 *
 * 1. `npci_monthly_value_cr` / `npci_monthly_volume_mn` — REAL, sourced data.
 *    Pulled directly from Bharat Connect's own public live feed:
 *    https://www.bharat-connect.com/pages/statistics/json/categories.json
 *    (the JSON backing https://www.bharat-connect.com/statistics/billers/).
 *    `npci_as_of` records the exact (fiscal year, month) row used, because
 *    a handful of niche categories (Hospital, Recurring Deposit, NCC) don't
 *    report every month — where that happens we use the most recent
 *    available month for that category and say so, rather than pretending
 *    it's current.
 *
 * 2. `avg_transaction_value` — merchant-provided reference figures (per the
 *    "Avg. Customer Value" table shared directly for this feature), used
 *    as-is rather than re-derived from NPCI value÷volume (the two don't
 *    always agree — e.g. NPCI's blended Loan Repayment ATV implied by
 *    value÷volume is ~₹6.5k vs. ₹15k here — because NPCI's average is
 *    pulled across every biller on the network while this figure reflects
 *    a more typical/target customer).
 *
 * 3. `industry_category_mau_mn` — ROUGH, non-authoritative estimates of the
 *    total addressable population for that bill category in India (not the
 *    number of people already paying digitally). Used only to derive a
 *    *penetration ratio* against `INDUSTRY_OVERALL_DIGITAL_MAU_MN`, i.e.
 *    "what fraction of a digitally-active Indian is also a plausible
 *    consumer of this bill category." Where a solid public figure exists
 *    (TRAI/RBI/NHAI-cited), `mau_basis` names it; where none could be found
 *    this session, `mau_basis` says so explicitly and the number is a
 *    reasoned placeholder, not a citation. Always surface `mau_basis` to
 *    the merchant — same transparency rule as `estimated_scale` in
 *    `websiteScraperService.ts`.
 */

export interface CategoryIndustryStats {
  /** NPCI/Bharat Connect network-wide monthly transaction value, ₹ Cr. */
  npci_monthly_value_cr: number;
  /** NPCI/Bharat Connect network-wide monthly transaction volume, millions of transactions. */
  npci_monthly_volume_mn: number;
  /** Fiscal year + month the above two figures were reported for (most recent available; not always the current month). */
  npci_as_of: string;
  /** Reference average transaction value for this category, ₹ (merchant-provided figure — see file header). */
  avg_transaction_value: number;
  /** Rough estimate of the total addressable population (millions) that plausibly consumes this bill category, regardless of payment channel. */
  industry_category_mau_mn: number;
  /** Source/confidence note for `industry_category_mau_mn` — always shown to the merchant. */
  mau_basis: string;
}

/**
 * "Industry overall digital/UPI MAU" — the single consistent denominator
 * used to turn every category's addressable population into a penetration
 * ratio. ~500M unique UPI active users is the figure most consistently
 * cited across NPCI, BCG, and PIB commentary through 2025-26. This is a
 * blended, rounded estimate, not an NPCI-published exact figure.
 */
export const INDUSTRY_OVERALL_DIGITAL_MAU_MN = 500;
export const INDUSTRY_OVERALL_DIGITAL_MAU_BASIS =
  "~500M unique UPI monthly active users in India (NPCI / BCG / PIB-cited estimates, 2025-26) — used as the single consistent denominator for every category's penetration ratio below.";

/** Net Revenue rate applied to projected transaction value — confirmed as 0.3% of GMV. */
export const NR_RATE_OF_GMV = 0.003;

/**
 * Keyed by the same category keys as `BBPS_CATEGORY_OPTIONS` in
 * `billCategories.ts`. Every category a merchant can select has an entry
 * here so the projection never silently drops a category.
 */
export const CATEGORY_INDUSTRY_STATS: Record<string, CategoryIndustryStats> = {
  Electricity: {
    npci_monthly_value_cr: 22191.69,
    npci_monthly_volume_mn: 89.1,
    npci_as_of: "Jul 2026 (FY2026-27)",
    avg_transaction_value: 2000,
    industry_category_mau_mn: 300,
    mau_basis: "~300M Indian households have a grid electricity connection (CEEW / PIB electrification data).",
  },
  Water: {
    npci_monthly_value_cr: 282.69,
    npci_monthly_volume_mn: 2.52,
    npci_as_of: "Jul 2026 (FY2026-27)",
    avg_transaction_value: 500,
    industry_category_mau_mn: 60,
    mau_basis:
      "Rough estimate of urban households with a metered, bill-generating piped water connection — no single authoritative national figure found.",
  },
  Gas: {
    npci_monthly_value_cr: 471.06,
    npci_monthly_volume_mn: 3.09,
    npci_as_of: "Jul 2026 (FY2026-27)",
    avg_transaction_value: 1000,
    industry_category_mau_mn: 12,
    mau_basis: "~12M active piped natural gas (PNG/city gas distribution) connections (PNGRB-cited industry figures).",
  },
  "LPG Gas": {
    npci_monthly_value_cr: 513.23,
    npci_monthly_volume_mn: 5.32,
    npci_as_of: "Jul 2026 (FY2026-27)",
    avg_transaction_value: 1050,
    industry_category_mau_mn: 300,
    mau_basis:
      "~300M LPG consumer households under PAHAL/Ujjwala — most only book a cylinder every 1-2 months, so treat as an upper bound, not a true monthly figure.",
  },
  DTH: {
    npci_monthly_value_cr: 485.35,
    npci_monthly_volume_mn: 14.25,
    npci_as_of: "Jul 2026 (FY2026-27), DTH + Cable TV rows combined",
    avg_transaction_value: 400,
    industry_category_mau_mn: 55,
    mau_basis: "~51M active pay-DTH subscribers (TRAI, Dec 2025) plus residual cable TV.",
  },
  "Mobile Postpaid": {
    npci_monthly_value_cr: 624.94,
    npci_monthly_volume_mn: 9.54,
    npci_as_of: "Jul 2026 (FY2026-27)",
    avg_transaction_value: 450,
    industry_category_mau_mn: 65,
    mau_basis: "Postpaid is ~5% of India's ~1.26B wireless subscriber base (TRAI, Dec 2025).",
  },
  "Mobile Prepaid": {
    npci_monthly_value_cr: 220.89,
    npci_monthly_volume_mn: 12.83,
    npci_as_of: "Jul 2026 (FY2026-27)",
    avg_transaction_value: 300,
    industry_category_mau_mn: 1190,
    mau_basis:
      "~95% of India's ~1.26B wireless subscriber base (TRAI, Dec 2025) — this counts SIM connections, not unique humans (multi-SIM ownership is common), so category penetration is capped at 100% downstream.",
  },
  Broadband: {
    npci_monthly_value_cr: 282.2,
    npci_monthly_volume_mn: 3.52,
    npci_as_of: "Jul 2026 (FY2026-27), Broadband Postpaid + Landline Postpaid rows combined",
    avg_transaction_value: 800,
    industry_category_mau_mn: 45,
    mau_basis: "~45M wireline broadband + landline telephone subscribers (TRAI, Oct 2025).",
  },
  "Credit Card": {
    npci_monthly_value_cr: 94179.95,
    npci_monthly_volume_mn: 56.6,
    npci_as_of: "Jul 2026 (FY2026-27)",
    avg_transaction_value: 15000,
    industry_category_mau_mn: 100,
    mau_basis: "~115M outstanding credit cards (RBI, Nov 2025), discounted for merchants who hold more than one card.",
  },
  "Loan Repayment": {
    npci_monthly_value_cr: 20796.74,
    npci_monthly_volume_mn: 32.12,
    npci_as_of: "Jul 2026 (FY2026-27)",
    avg_transaction_value: 15000,
    industry_category_mau_mn: 200,
    mau_basis: "~200M unique credit-active retail borrowers in India (Equifax/Experian-cited industry estimates).",
  },
  Insurance: {
    npci_monthly_value_cr: 5970.03,
    npci_monthly_volume_mn: 7.83,
    npci_as_of: "Jul 2026 (FY2026-27)",
    avg_transaction_value: 18000,
    industry_category_mau_mn: 80,
    mau_basis:
      "Rough estimate — no single authoritative monthly-premium-payer figure found; discounted down from IRDAI-cited policies-in-force counts to account for annual/half-yearly (not monthly) payment modes.",
  },
  "Tax Payment": {
    npci_monthly_value_cr: 69.44,
    npci_monthly_volume_mn: 0.13,
    npci_as_of: "Jul 2026 (FY2026-27), \"Municipal Taxes\" row",
    avg_transaction_value: 10000,
    industry_category_mau_mn: 40,
    mau_basis: "Rough estimate of urban property-tax-paying households with digital payment access — no single authoritative figure found.",
  },
  "Housing Society": {
    npci_monthly_value_cr: 1.0,
    npci_monthly_volume_mn: 0.002,
    npci_as_of: "Jul 2026 (FY2026-27)",
    avg_transaction_value: 5000,
    industry_category_mau_mn: 15,
    mau_basis: "Rough estimate of urban gated-community/apartment households — a negligibly small live BBPS category today.",
  },
  "Education Fees": {
    npci_monthly_value_cr: 138.05,
    npci_monthly_volume_mn: 0.41,
    npci_as_of: "Jul 2026 (FY2026-27)",
    avg_transaction_value: 25000,
    industry_category_mau_mn: 120,
    mau_basis: "Rough estimate from India's ~250M school+college enrolment, discounted for digital fee-payment adoption.",
  },
  "Subscription Fees": {
    npci_monthly_value_cr: 3.8,
    npci_monthly_volume_mn: 0.09,
    npci_as_of: "Jul 2026 (FY2026-27), \"Subscription\" row",
    avg_transaction_value: 1000,
    industry_category_mau_mn: 20,
    mau_basis: "Rough estimate; niche BBPS bucket with no authoritative population figure found.",
  },
  "Club and Association": {
    npci_monthly_value_cr: 0.01,
    npci_monthly_volume_mn: 0.002,
    npci_as_of: "Jul 2026 (FY2026-27)",
    avg_transaction_value: 5000,
    industry_category_mau_mn: 5,
    mau_basis: "Rough estimate; a negligibly small live BBPS category today.",
  },
  Hospital: {
    npci_monthly_value_cr: 1.65,
    npci_monthly_volume_mn: 0.0023,
    npci_as_of: "Jul 2025 (FY2025-26), \"Hospital and Pathology\" row — most recent available, over a year stale",
    avg_transaction_value: 10000,
    industry_category_mau_mn: 15,
    mau_basis: "Rough estimate of recurring-billing hospital/diagnostic customers; a negligibly small, thinly-reported live BBPS category today.",
  },
  NCC: {
    npci_monthly_value_cr: 0,
    npci_monthly_volume_mn: 0,
    npci_as_of: "Not found in Bharat Connect's public category feed",
    avg_transaction_value: 2500,
    industry_category_mau_mn: 2,
    mau_basis: "No public data source identified for this niche BBPS category this session — treated as negligible pending a real biller feed.",
  },
  "Recurring Deposit": {
    npci_monthly_value_cr: 56.54,
    npci_monthly_volume_mn: 0.07,
    npci_as_of: "Dec 2025 (FY2025-26) — most recent available, ~8 months stale",
    avg_transaction_value: 5000,
    industry_category_mau_mn: 40,
    mau_basis: "Rough estimate of active bank RD account holders — no single authoritative figure found.",
  },
  FASTag: {
    npci_monthly_value_cr: 2722.97,
    npci_monthly_volume_mn: 31.74,
    npci_as_of: "Jul 2026 (FY2026-27), \"Fastag\" row",
    avg_transaction_value: 1000,
    industry_category_mau_mn: 70,
    mau_basis: "~8+ crore FASTags issued cumulatively (NHAI-cited figures), discounted for inactive/duplicate tags.",
  },
};
