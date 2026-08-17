/**
 * Merchant onboarding / bill-payment-offer configurator.
 *
 * Distinct from `types/merchant.ts` (the BBPS partner REST API merchants
 * integrate against once live) — this is the one-time setup flow a
 * Razorpay merchant fills in from *inside the dashboard* to describe their
 * business and let us curate which billers/categories + which integration
 * shape (standalone app vs. embedded section) applies to them. In a real
 * build this would sit behind dashboard session auth, not the BBPS
 * `RZP_BILLPAY_KEY_ID`/`SECRET` Basic Auth used elsewhere in this repo.
 */

export type IntegrationMode = "new_app" | "existing_app_section";

export interface ExistingAppIntegrationDetails {
  /** Generic custom-URI-scheme deep link, e.g. "myapp://billpay". */
  deep_link?: string;
  /** iOS Universal Link, e.g. "https://myapp.com/billpay". */
  ios_universal_link?: string;
  /** Android App Link, e.g. "https://myapp.com/billpay" (verified via assetlinks.json). */
  android_app_link?: string;
  /** Android application id, e.g. "com.mybank.app". */
  android_package_name?: string;
  /** iOS bundle identifier, e.g. "com.mybank.app". */
  ios_bundle_id?: string;
}

export interface MerchantBranding {
  logo_url?: string;
  /** Hex color, e.g. "#0f6fde". */
  brand_color?: string;
}

/**
 * Optional design-system inputs so the embedded bill-payment UI can match a
 * merchant's existing app's native look and feel, rather than looking like
 * a bolted-on widget. All free-text/optional — there's no fixed schema for
 * "describe your design system," so we capture what's given and let the
 * design team follow up for anything under-specified.
 */
export interface DesignSystemPreferences {
  /** e.g. "Material 3", "Human Interface Guidelines", "in-house Blade-based DS". */
  design_system_name?: string;
  /** Free-form list of hex codes, e.g. ["#0f6fde", "#ffffff", "#1a1a1a"]. */
  color_hex_codes?: string[];
  /** e.g. "Primary font: Inter, weights 400/600/700". */
  typography_guidelines?: string;
  /** e.g. "Rounded 8px corners, solid fill, 44px height, white label text". */
  primary_button_style?: string;
  /** e.g. "Material UI, Tailwind, in-house component library". */
  component_libraries?: string;
}

export type EntryPointLabel = "Pay Bills" | "Bharat Connect" | "Other";

export type EntryPointPlacement =
  | "home_dashboard_button"
  | "quick_action_shortcut"
  | "services_subsection"
  | "other";

/**
 * Where/how the merchant wants the bill-payment entry point surfaced inside
 * their app, and under what label. Both optional — if unset, we default to
 * proposing a home-dashboard "Pay Bills" button during design review.
 */
export interface EntryPointPreferences {
  label?: EntryPointLabel;
  /** Required detail when label === "Other". */
  label_other?: string;
  placement?: EntryPointPlacement;
  /** Required detail when placement === "other". */
  placement_other?: string;
}

export interface MerchantOnboardingCreateInput {
  business_description: string;
  /** Category keys from `mapping/billCategories.ts` (`BBPS_CATEGORY_OPTIONS`). Multi-select. */
  categories: string[];
  integration_mode: IntegrationMode;
  existing_app?: ExistingAppIntegrationDetails;
  estimated_user_base?: number;
  design_system?: DesignSystemPreferences;
  entry_point?: EntryPointPreferences;
  /** Merchant logo + BBPS/Bharat Connect logo shown together on the digital confirmation/receipt screen. */
  receipt_co_branding?: boolean;
}

export type CategoryCoverageStatus = "live_sample_billers" | "coming_soon";

export interface CategoryCoverage {
  category: string;
  status: CategoryCoverageStatus;
  sample_biller_count: number;
  sample_biller_ids: string[];
}

export interface CuratedOfferingPreview {
  categories: CategoryCoverage[];
  total_categories_requested: number;
  categories_with_live_coverage: number;
  recommended_next_step: string;
}

export interface MerchantOnboardingResource {
  id: string;
  entity: "bill_payment.merchant_onboarding";
  business_description: string;
  categories: string[];
  integration_mode: IntegrationMode;
  existing_app?: ExistingAppIntegrationDetails;
  estimated_user_base?: number;
  design_system?: DesignSystemPreferences;
  entry_point?: EntryPointPreferences;
  receipt_co_branding?: boolean;
  branding: MerchantBranding;
  curated_offering: CuratedOfferingPreview;
  created_at: number;
  updated_at?: number;
}
