import { Router } from "express";
import { config } from "../../config/env";
import { getBillerById, listBillers, listCategories } from "../../mapping/billerRegistry";
import {
  fetchProductionBillerById,
  fetchProductionBillers,
  fetchProductionCategories,
} from "../../gateway/productionBillerCatalogClient";
import { sendError } from "../errors";

export const billersRouter = Router();

// Categories/billers listing is one of the three operations production
// access is scoped to (see CLAUDE.md). When BBPS_MODE=production, prefer the
// real production catalog and fall back to the local static registry if the
// production call fails (network blip, credentials issue, etc.) — this
// endpoint backs the onboarding/demo UIs, so degrading to the local registry
// beats a hard failure.
async function loadCategories(): Promise<string[]> {
  if (config.bbpsMode !== "production") return listCategories();
  try {
    return await fetchProductionCategories();
  } catch (err) {
    console.error("[billers] production categories fetch failed, falling back to local registry:", err);
    return listCategories();
  }
}

async function loadBillers(category?: string) {
  if (config.bbpsMode !== "production") {
    const all = listBillers();
    return category ? all.filter((b) => b.category === category) : all;
  }
  try {
    if (category) return await fetchProductionBillers(category);
    // Production's UNFILTERED `GET /billers` (no `category` query param) is
    // paginated/capped at ~100 items total ACROSS ALL CATEGORIES COMBINED —
    // it is NOT "the full catalog" (confirmed by hand: it returned only 1
    // electricity biller, while `?category=electricity` correctly returned
    // 100). So when no category is requested, fan out per-category instead
    // of calling the unfiltered endpoint once.
    const categories = await fetchProductionCategories();
    const perCategory = await Promise.all(categories.map((c) => fetchProductionBillers(c)));
    return perCategory.flat();
  } catch (err) {
    console.error("[billers] production billers fetch failed, falling back to local registry:", err);
    const all = listBillers();
    return category ? all.filter((b) => b.category === category) : all;
  }
}

billersRouter.get("/billers/categories", async (_req, res) => {
  res.json({ categories: await loadCategories() });
});

billersRouter.get("/billers/:id", async (req, res) => {
  let biller = config.bbpsMode === "production" ? await fetchProductionBillerById(req.params.id) : undefined;
  if (!biller) biller = getBillerById(req.params.id);
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

billersRouter.get("/billers", async (req, res) => {
  // Deliberately NOT filtered by BBPS_MODE=staging: this endpoint is the
  // shared biller catalogue, consumed by more than just the API demo's
  // picker — billpay-widget.html's onboarding-scoped preview and
  // onboarding.html's own curated_offering computation both intersect their
  // own biller lists against *all* of these results. Narrowing this list
  // when BBPS_MODE=staging previously broke those flows (a merchant's
  // curated preview showing almost nothing). See `GET /health` for the
  // staging-servable subset, and `public/index.html` for where that's used
  // to scope just the demo's own biller picker. BBPS_MODE=production DOES
  // change the source (see loadBillers above), since production is a full
  // real catalog, not a single-biller sandbox.
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const items = await loadBillers(category);
  res.json({ entity: "collection", count: items.length, items });
});
