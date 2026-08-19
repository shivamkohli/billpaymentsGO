import { Router } from "express";
import { createPayment, getPayment, listPaymentsForCustomer } from "../../orchestration/paymentService";
import { PaymentCreateInput } from "../../types/merchant";
import { sendError } from "../errors";

export const paymentsRouter = Router();

function validateCreateInput(body: unknown): body is PaymentCreateInput {
  const b = body as Partial<PaymentCreateInput> | undefined;
  return (
    !!b &&
    typeof b.bill_request_id === "string" &&
    typeof b.bill_pay_amount === "number" &&
    typeof b.currency === "string" &&
    !!b.fees &&
    Array.isArray(b.payments) &&
    b.payments.length > 0 &&
    Array.isArray(b.bills)
  );
}

paymentsRouter.post("/payments", async (req, res, next) => {
  if (!validateCreateInput(req.body)) {
    sendError(res, 400, {
      code: "BAD_REQUEST_ERROR",
      description: "bill_request_id, bill_pay_amount, currency, fees, payments[] and bills[] are required",
      source: "business",
      step: "validation",
      reason: "INVALID_INPUT",
    });
    return;
  }
  try {
    const resource = await createPayment(req.body as PaymentCreateInput);
    res.status(201).json(resource);
  } catch (err) {
    next(err);
  }
});

// Every payment this customer has made — same shape/reasoning as
// GET /bill_requests?customer_mobile=, see billRequests.ts.
paymentsRouter.get("/payments", async (req, res, next) => {
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
    const items = await listPaymentsForCustomer(mobile);
    res.json({ entity: "collection", count: items.length, items });
  } catch (err) {
    next(err);
  }
});

paymentsRouter.get("/payments/:id", async (req, res, next) => {
  try {
    const resource = await getPayment(req.params.id);
    if (!resource) {
      sendError(res, 404, {
        code: "BAD_REQUEST_ERROR",
        description: `No payment found for id "${req.params.id}"`,
        source: "business",
        step: "lookup",
        reason: "PAYMENT_NOT_FOUND",
      });
      return;
    }
    res.json(resource);
  } catch (err) {
    next(err);
  }
});
