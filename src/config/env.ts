import "dotenv/config";

export type BbpsMode = "mock" | "live" | "staging";

export interface AppConfig {
  port: number;
  bbpsMode: BbpsMode;
  merchantAuth: {
    keyId: string;
    keySecret: string;
  };
}

function resolveBbpsMode(): BbpsMode {
  const raw = (process.env.BBPS_MODE || "mock").trim().toLowerCase();
  if (raw === "live") return "live";
  if (raw === "staging") return "staging";
  return "mock";
}

export const config: AppConfig = {
  port: Number(process.env.PORT || 4000),
  bbpsMode: resolveBbpsMode(),
  merchantAuth: {
    keyId: process.env.RZP_BILLPAY_KEY_ID || "rzp_test_billpay_key",
    keySecret: process.env.RZP_BILLPAY_KEY_SECRET || "rzp_test_billpay_secret",
  },
};
