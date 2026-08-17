import { Router } from "express";
import { createBillRequest, getBillRequest } from "../../orchestration/billRequestService";
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

billRequestsRouter.get("/bill_requests/:id", (req, res) => {
  const resource = getBillRequest(req.params.id);
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
});
