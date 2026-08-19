import { Router } from "express";
import { createBillRequest, getBillRequest, listBillRequestsForCustomer } from "../../orchestration/billRequestService";
import { BillRequestCreateInput } from "../../types/merchant";
import { sendError } from "../errors";

export const billRequestsRouter = Router();

function validateCreateInput(body: unknown): body is BillRequestCreateInput {
  const b = body as Partial<BillRequestCreateInput> | undefined;
  return !!b && typeof b.biller_id === "string" && !!b.customer?.mobile && !!b.device?.initiating_channel;
}

billRequestsRouter.post("/bill_requests", async (req, res, next) => {
  if (!validateCreateInput(req.body)) {
    sendError(res, 400, {
      code: "BAD_REQUEST_ERROR",
      description: "biller_id, customer.mobile and device.initiating_channel are required",
      source: "business",
      step: "validation",
      reason: "INVALID_INPUT",
    });
    return;
  }
  try {
    const resource = await createBillRequest(req.body as BillRequestCreateInput);
    res.status(201).json(resource);
  } catch (err) {
    next(err);
  }
});

// Every bill this customer has fetched, e.g. for a merchant's own "bill history" screen.
// Requires customer_mobile since there's no merchant-level listing of every bill_request
// ever created — that's an unbounded, cross-customer query we deliberately don't expose.
billRequestsRouter.get("/bill_requests", async (req, res, next) => {
  const mobile = typeof req.query.customer_mobile === "string" ? req.query.customer_mobile : undefined;
  if (!mobile) {
    sendError(res, 400, {
      code: "BAD_REQUEST_ERROR",
      description: "customer_mobile query param is required",
      source: "business",
      step: "validation",
      reason: "INVALID_INPUT",
    });
    return;
  }
  try {
    const items = await listBillRequestsForCustomer(mobile);
    res.json({ entity: "collection", count: items.length, items });
  } catch (err) {
    next(err);
  }
});

billRequestsRouter.get("/bill_requests/:id", async (req, res, next) => {
  try {
    const resource = await getBillRequest(req.params.id);
    if (!resource) {
      sendError(res, 404, {
        code: "BAD_REQUEST_ERROR",
        description: `No bill_request found for id "${req.params.id}"`,
        source: "business",
        step: "lookup",
        reason: "BILL_REQUEST_NOT_FOUND",
      });
      return;
    }
    res.json(resource);
  } catch (err) {
    next(err);
  }
});
