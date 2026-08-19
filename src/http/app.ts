import path from "path";
import express, { Express } from "express";
import { config } from "../config/env";
import { basicAuth } from "./basicAuth";
import { billersRouter } from "./routes/billers";
import { billRequestsRouter } from "./routes/billRequests";
import { paymentsRouter } from "./routes/payments";
import { complaintsRouter } from "./routes/complaints";
import { merchantOnboardingRouter } from "./routes/merchantOnboarding";
import { errorHandler, notFoundHandler } from "./errors";
import { STAGING_SANDBOX_SERVABLE_BILLER_IDS } from "../gateway/stagingSandboxBbpcuClient";

/**
 * `public/` is a tiny, dependency-free HTML+JS demo UI (forms for
 * bill_request/payment/complaint, backed by fetch() against the same API
 * routes below) — purely so the flow can be clicked through in a browser
 * instead of curl. It calls the API with its own Basic Auth header; it is
 * not part of the merchant-facing contract.
 */
const PUBLIC_DIR = path.join(__dirname, "..", "..", "public");

export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      bbps_mode: config.bbpsMode,
      // Which locally-registered biller_ids the real staging sandbox can
      // actually service right now (empty outside BBPS_MODE=staging). This
      // is deliberately NOT used to filter `GET /billers` itself — that
      // endpoint is shared by flows (onboarding-scoped widget preview,
      // onboarding.html's curated_offering) that need the full local
      // catalogue. Consumers that want to warn/restrict on a per-picker
      // basis (see public/index.html) should filter client-side using this.
      staging_servable_biller_ids: config.bbpsMode === "staging" ? STAGING_SANDBOX_SERVABLE_BILLER_IDS : [],
    });
  });

  app.use("/v1/bill_payments", basicAuth, billersRouter);
  app.use("/v1/bill_payments", basicAuth, billRequestsRouter);
  app.use("/v1/bill_payments", basicAuth, paymentsRouter);
  app.use("/v1/bill_payments", basicAuth, complaintsRouter);

  // Dashboard-side merchant onboarding wizard — no partner Basic Auth (see
  // src/http/routes/merchantOnboarding.ts for why).
  app.use("/v1/merchant_onboarding", merchantOnboardingRouter);

  app.use(express.static(PUBLIC_DIR));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
