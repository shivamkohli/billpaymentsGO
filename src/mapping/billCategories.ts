/**
 * Curated, illustrative list of standard BBPS biller categories, used to
 * drive the merchant-onboarding category multi-select (`public/onboarding.html`
 * -> `GET /v1/merchant_onboarding/categories`).
 *
 * This is intentionally broader than `billerRegistry.ts`'s 4 sample
 * billers — a merchant should be able to say "we want electricity + tax
 * payment + water" even though we've only mocked one sample biller per
 * category so far. `merchantOnboardingService.ts` is explicit about which
 * categories currently have sample billers behind them vs. which are
 * "coming soon" placeholders, so the onboarding flow never pretends to
 * have real biller coverage it doesn't.
 *
 * This list is NOT a verbatim reproduction of NPCI's official category
 * taxonomy (which runs to ~20+ entries and is revised periodically) — it's
 * a representative sample covering the categories a fintech/SFB merchant
 * would plausibly ask for.
 */
export interface BillCategoryOption {
  key: string;
  label: string;
}

export const BBPS_CATEGORY_OPTIONS: BillCategoryOption[] = [
  { key: "Electricity", label: "Electricity" },
  { key: "Water", label: "Water" },
  { key: "Gas", label: "Piped Gas" },
  { key: "LPG Gas", label: "LPG Gas Booking" },
  { key: "DTH", label: "DTH / Cable TV" },
  { key: "Mobile Postpaid", label: "Mobile Postpaid" },
  { key: "Mobile Prepaid", label: "Mobile Prepaid Recharge" },
  { key: "Broadband", label: "Broadband / Landline" },
  { key: "Credit Card", label: "Credit Card Bill Payment" },
  { key: "Loan Repayment", label: "Loan EMI / Repayment" },
  { key: "Insurance", label: "Insurance Premium" },
  { key: "Tax Payment", label: "Municipal Tax / Tax Payment" },
  { key: "Housing Society", label: "Housing Society Dues" },
  { key: "Education Fees", label: "Education Fees" },
  { key: "Subscription Fees", label: "Subscription Fees" },
  { key: "Club and Association", label: "Club & Association Dues" },
  { key: "Hospital", label: "Hospital & Healthcare" },
  { key: "NCC", label: "NCC Bill Payment" },
  { key: "Recurring Deposit", label: "Recurring Deposit" },
  { key: "FASTag", label: "FASTag Recharge" },
];

export function listBillCategoryOptions(): BillCategoryOption[] {
  return BBPS_CATEGORY_OPTIONS;
}

/**
 * Real production BBPS categories are lowercase snake_case (`"credit_card"`,
 * `"mobile_prepaid"`, `"loan_repayment"`, ...) — a completely different
 * vocabulary from this file's Title-Case-with-spaces UI keys above
 * (`"Credit Card"`, `"Mobile Prepaid"`, `"Loan EMI / Repayment"`'s key
 * `"Loan Repayment"`, ...), which predate any production integration and
 * were only ever compared against the local static registry's category
 * field (which happens to also use Title Case, since the same person wrote
 * both).
 *
 * Confirmed by hand: passing a UI key straight through to production's
 * `GET /billers?category=` (e.g. `?category=Credit%20Card`) does NOT 404 or
 * error — it returns `200 OK` with a bare `{"entity":"collection"}` (no
 * `items`/`count` at all), which — left unmapped — throws deep in the
 * pagination code and gets silently swallowed by the existing
 * network-error fallback, producing STALE local demo data that looks
 * plausible (same category taxonomy) but is not real production coverage.
 * This map is the fix: translate a UI category key to the real production
 * category slug(s) BEFORE calling the production catalog client. A UI
 * category may fan out to more than one production slug (e.g. "DTH / Cable
 * TV" covers both `dth` and `cable_tv`). A UI category with no confirmed
 * production equivalent (e.g. "NCC") maps to `[]` — deliberately "coming
 * soon" rather than guessing, per this module's honesty principle.
 */
const UI_CATEGORY_TO_PRODUCTION_CATEGORIES: Record<string, string[]> = {
  Electricity: ["electricity"],
  Water: ["water"],
  Gas: ["gas"],
  "LPG Gas": ["lpg_gas"],
  DTH: ["dth", "cable_tv"],
  "Mobile Postpaid": ["mobile_postpaid"],
  "Mobile Prepaid": ["mobile_prepaid"],
  Broadband: ["broadband_postpaid", "landline_postpaid"],
  "Credit Card": ["credit_card"],
  "Loan Repayment": ["loan_repayment"],
  Insurance: ["insurance"],
  "Tax Payment": ["municipal_taxes", "municipal_services"],
  "Housing Society": ["housing_society"],
  "Education Fees": ["education_fees"],
  "Subscription Fees": ["subscription"],
  "Club and Association": ["clubs_and_associations"],
  Hospital: ["hospital", "hospital_and_pathology"],
  NCC: [],
  "Recurring Deposit": ["recurring_deposit"],
  FASTag: ["fastag"],
};

/** Translates a UI category key (see `BBPS_CATEGORY_OPTIONS`) to the real
 * production BBPS category slug(s) it corresponds to. Returns `[]` for keys
 * with no confirmed production equivalent. */
export function mapUiCategoryToProductionCategories(uiCategoryKey: string): string[] {
  return UI_CATEGORY_TO_PRODUCTION_CATEGORIES[uiCategoryKey] || [];
}
