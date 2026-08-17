/**
 * End-to-end test of the full merchant-facing flow — bill_request -> payment
 * -> complaint -> status poll — running entirely against MockBbpcuClient
 * (BBPS_MODE=mock). Env vars are set before requiring the app modules so
 * `src/config/env.ts` picks them up at import time.
 */
process.env.BBPS_MODE = "mock";
process.env.RZP_BILLPAY_KEY_ID = "rzp_test_billpay_key";
process.env.RZP_BILLPAY_KEY_SECRET = "rzp_test_billpay_secret";

/* eslint-disable @typescript-eslint/no-var-requires */
const request = require("supertest");
const { createApp } = require("../src/http/app");

describe("bbps-go merchant REST API (mock BBPCU)", () => {
  const app = createApp();
  const KEY_ID = "rzp_test_billpay_key";
  const KEY_SECRET = "rzp_test_billpay_secret";

  let billRequestId: string;
  let paymentId: string;
  let complaintId: string;

  it("rejects requests without Basic Auth", async () => {
    const res = await request(app).get("/v1/bill_payments/billers");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTHENTICATION_ERROR");
  });

  it("lists the sample biller catalogue", async () => {
    const res = await request(app).get("/v1/bill_payments/billers").auth(KEY_ID, KEY_SECRET);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it("creates a bill_request and fetches a bill via the mock BBPCU", async () => {
    const res = await request(app)
      .post("/v1/bill_payments/bill_requests")
      .auth(KEY_ID, KEY_SECRET)
      .send({
        biller_id: "MSEB00000NAT01",
        customer: { name: "Test User", mobile: "9876543210" },
        device: { initiating_channel: "INT" },
      });
    expect(res.status).toBe(201);
    expect(res.body.entity).toBe("bill_payment.bill_request");
    expect(res.body.status).toBe("success");
    expect(res.body.bills).toHaveLength(1);
    billRequestId = res.body.id;
  });

  it("creates a successful payment against the bill_request", async () => {
    const res = await request(app)
      .post("/v1/bill_payments/payments")
      .auth(KEY_ID, KEY_SECRET)
      .send({
        bill_request_id: billRequestId,
        bill_pay_amount: 5000,
        currency: "INR",
        fees: { app_convenience_fee: 0, biller_convenience_fee: 0 },
        payments: [
          { id: "leg_1", provider: "razorpay", amount: 5000, currency: "INR", method: "upi", upi: { vpa: "test@upi" } },
        ],
        bills: [{ bill_number: "MOCKBILL0", amount: 5000, currency: "INR" }],
        customer: { name: "Test User", mobile: "9876543210" },
        biller_id: "MSEB00000NAT01",
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("success");
    expect(res.body.gateway_transaction_id).toBeDefined();
    paymentId = res.body.id;
  });

  it("declines a payment when the amount matches the mock's decline rule", async () => {
    const res = await request(app)
      .post("/v1/bill_payments/payments")
      .auth(KEY_ID, KEY_SECRET)
      .send({
        bill_request_id: billRequestId,
        bill_pay_amount: 13, // MockBbpcuClient declines any amount ending in "13"
        currency: "INR",
        fees: { app_convenience_fee: 0, biller_convenience_fee: 0 },
        payments: [
          { id: "leg_2", provider: "razorpay", amount: 13, currency: "INR", method: "upi", upi: { vpa: "test@upi" } },
        ],
        bills: [{ bill_number: "MOCKBILL0", amount: 13, currency: "INR" }],
        customer: { name: "Test User", mobile: "9876543210" },
        biller_id: "MSEB00000NAT01",
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("failed");
    expect(res.body.error.code).toBe("BBPS_808");
  });

  it("registers a complaint against the successful payment and can poll its status", async () => {
    const createRes = await request(app)
      .post("/v1/bill_payments/complaints")
      .auth(KEY_ID, KEY_SECRET)
      .send({
        biller_id: "MSEB00000NAT01",
        bill_payment_id: paymentId,
        complaint_type: "Erroneously paid in wrong account",
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.gateway_complaint_id).toBeDefined();
    complaintId = createRes.body.id;

    const pollRes = await request(app).get(`/v1/bill_payments/complaints/${complaintId}`).auth(KEY_ID, KEY_SECRET);
    expect(pollRes.status).toBe(200);
    expect(["processing", "success"]).toContain(pollRes.body.status);
  });

  it("returns a business error envelope for unknown entity ids", async () => {
    const res = await request(app).get("/v1/bill_payments/bill_requests/does_not_exist").auth(KEY_ID, KEY_SECRET);
    expect(res.status).toBe(404);
    expect(res.body.error.source).toBe("business");
  });
});
