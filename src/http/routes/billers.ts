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
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const all = listBillers();
  const items = category ? all.filter((b) => b.category === category) : all;
  res.json({ entity: "collection", count: items.length, items });
});
