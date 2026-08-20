/**
 * Single seam that picks Mock vs. Live: everything in `orchestration/`
 * calls `getBbpcuClient()` and never imports `MockBbpcuClient` or
 * `NpciHttpBbpcuClient` directly. Flipping `BBPS_MODE=live` (plus
 * populating `.env` with real BBPS_* values, see `.env.example`) is the
 * only change needed to start hitting the real BBPCU/aggregator — no
 * orchestration or mapping code changes.
 */

import { config } from "../config/env";
import { getCredentialsProvider, getProductionCredentials, getStagingCredentials } from "../config/credentials";
import { BbpcuClient } from "./BbpcuClient";
import { MockBbpcuClient } from "./mockBbpcuClient";
import { NpciHttpBbpcuClient } from "./npciHttpBbpcuClient";
import { ProductionBbpcuClient } from "./productionBbpcuClient";
import { StagingSandboxBbpcuClient } from "./stagingSandboxBbpcuClient";

let cached: BbpcuClient | undefined;

export function getBbpcuClient(): BbpcuClient {
  if (cached) return cached;

  if (config.bbpsMode === "mock") {
    cached = new MockBbpcuClient();
    return cached;
  }

  if (config.bbpsMode === "staging") {
    const stagingCreds = getStagingCredentials();
    if (!stagingCreds) {
      throw new Error(
        "BBPS_MODE=staging but no staging sandbox credentials are configured. " +
          "Populate BBPS_STAGING_KEY_ID/BBPS_STAGING_KEY_SECRET/BBPS_STAGING_BASE_URL " +
          "in .env, or set BBPS_MODE=mock to use the local mock responder."
      );
    }
    cached = new StagingSandboxBbpcuClient(stagingCreds);
    return cached;
  }

  if (config.bbpsMode === "production") {
    // Scope is intentionally narrow — see CLAUDE.md "Production Razorpay
    // BBPS API — usage constraints". ProductionBbpcuClient itself enforces
    // rules 2-4 (consumer-fetch cap, Pay Bill and Complaints always mock)
    // structurally; this branch is just credential wiring, same shape as
    // the staging branch above.
    const productionCreds = getProductionCredentials();
    if (!productionCreds) {
      throw new Error(
        "BBPS_MODE=production but no production credentials are configured. " +
          "Populate BBPS_PRODUCTION_KEY_ID/BBPS_PRODUCTION_KEY_SECRET/BBPS_PRODUCTION_MID/" +
          "BBPS_PRODUCTION_BASE_URL in .env, or set BBPS_MODE=mock to use the local mock responder."
      );
    }
    cached = new ProductionBbpcuClient(productionCreds);
    return cached;
  }

  const creds = getCredentialsProvider().getBbpsCredentials();
  if (!creds) {
    throw new Error(
      "BBPS_MODE=live but no BBPS downstream credentials are configured. " +
        "Populate BBPS_BBPOU_ID/BBPS_ORIG_INST/BBPCU_BASE_URL/BBPS_API_KEY/BBPS_API_SECRET " +
        "in .env (see .env.example), or set BBPS_MODE=mock to use the mock BBPCU responder."
    );
  }
  cached = new NpciHttpBbpcuClient(creds);
  return cached;
}

/** Test helper: forces the next getBbpcuClient() call to re-resolve instead of using the cache. */
export function resetBbpcuClientCache(): void {
  cached = undefined;
}
