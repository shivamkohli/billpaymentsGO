import { Router } from "express";
import { getBillerById, listBillers, listCategories } from "../../mapping/billerRegistry";
import { sendError } from "../errors";

export const billersRouter = Router();

billersRouter.get("/billers/categories", (_req, res) => {
  res.json({ categories: listCategories() });
});

billersRouter.get("/billers/:id", (req, res) => {
  const biller = getBillerById(req.params.id);
  if (!biller) {
    sendError(res, 404, {
      code: "BAD_REQUEST_ERROR",
      description: `No biller found for id "${req.params.id}"`,
      source: "business",
      step: "biller_lookup",
      reason: "BILLER_NOT_FOUND",
    });
    return;
  }
  res.json(biller);
});

billersRouter.get("/billers", (req, res) => {
  // Deliberately NOT filtered by BBPS_MODE: this endpoint is the shared local
  // biller catalogue, consumed by more than just the API demo's picker —
  // billpay-widget.html's onboarding-scoped preview and onboarding.html's own
  // curated_offering computation both intersect their own biller lists
  // against *all* of these results. Narrowing this list when
  // BBPS_MODE=staging previously broke those flows (a merchant's curated
  // preview showing almost nothing). See `GET /health` for the
  // staging-servable subset, and `public/index.html` for where that's used
  // to scope just the demo's own biller picker.
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const all = listBillers();
  const items = category ? all.filter((b) => b.category === category) : all;
  res.json({ entity: "collection", count: items.length, items });
});
