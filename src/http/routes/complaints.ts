import { Router } from "express";
import { createComplaint, getComplaint, refreshComplaintStatus } from "../../orchestration/complaintService";
import { ComplaintCreateInput } from "../../types/merchant";
import { sendError } from "../errors";

export const complaintsRouter = Router();

function validateCreateInput(body: unknown): body is ComplaintCreateInput {
  const b = body as Partial<ComplaintCreateInput> | undefined;
  return !!b && typeof b.biller_id === "string" && typeof b.bill_payment_id === "string" && typeof b.complaint_type === "string";
}

complaintsRouter.post("/complaints", async (req, res, next) => {
  if (!validateCreateInput(req.body)) {
    sendError(res, 400, {
      code: "BAD_REQUEST_ERROR",
      description: "biller_id, bill_payment_id and complaint_type are required",
      source: "business",
      step: "validation",
      reason: "INVALID_INPUT",
    });
    return;
  }
  try {
    const resource = await createComplaint(req.body as ComplaintCreateInput);
    res.status(201).json(resource);
  } catch (err) {
    next(err);
  }
});

complaintsRouter.get("/complaints/:id", async (req, res, next) => {
  if (!getComplaint(req.params.id)) {
    sendError(res, 404, {
      code: "BAD_REQUEST_ERROR",
      description: `No complaint found for id "${req.params.id}"`,
      source: "business",
      step: "lookup",
      reason: "COMPLAINT_NOT_FOUND",
    });
    return;
  }
  try {
    // Polling this endpoint re-runs the CMS status enquiry (xchangeId 506) so
    // merchant partners see live BOU/COU resolution progress, not a stale snapshot.
    const resource = await refreshComplaintStatus(req.params.id);
    res.json(resource);
  } catch (err) {
    next(err);
  }
});
