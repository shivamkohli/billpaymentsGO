import "dotenv/config";

export type BbpsMode = "mock" | "live" | "staging" | "production";

export interface AppConfig {
  port: number;
  bbpsMode: BbpsMode;
  merchantAuth: {
    keyId: string;
    keySecret: string;
  };
  supabase: {
    url?: string;
    serviceRoleKey?: string;
    /** True once both fields above are populated — see src/store/supabaseClient.ts. */
    enabled: boolean;
  };
}

function resolveBbpsMode(): BbpsMode {
  const raw = (process.env.BBPS_MODE || "mock").trim().toLowerCase();
  if (raw === "live") return "live";
  if (raw === "staging") return "staging";
  // "production" hits the real Razorpay production BBPS API. Scope is
  // intentionally narrow — see CLAUDE.md "Production Razorpay BBPS API —
  // usage constraints" — enforced in src/gateway/productionBbpcuClient.ts
  // and src/http/routes/billers.ts, not just by this flag.
  if (raw === "production") return "production";
  return "mock";
}

const supabaseUrl = process.env.SUPABASE_URL?.trim() || undefined;
// Service role key, not the anon key — this server writes bill_requests/payments
// directly and isn't going through Supabase's row-level-security-gated client SDK.
// Never expose this to a browser; it only ever lives here, server-side.
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined;

export const config: AppConfig = {
  port: Number(process.env.PORT || 4000),
  bbpsMode: resolveBbpsMode(),
  merchantAuth: {
    keyId: process.env.RZP_BILLPAY_KEY_ID || "rzp_test_billpay_key",
    keySecret: process.env.RZP_BILLPAY_KEY_SECRET || "rzp_test_billpay_secret",
  },
  supabase: {
    url: supabaseUrl,
    serviceRoleKey: supabaseServiceRoleKey,
    enabled: Boolean(supabaseUrl && supabaseServiceRoleKey),
  },
};
