import { billRequestInputToNpciRequest } from "../src/mapping/billRequest.mapper";
import { paymentInputToNpciRequest } from "../src/mapping/payment.mapper";
import { complaintInputToNpciRequest } from "../src/mapping/complaint.mapper";
import { decideBillRequestKind, getBillerById } from "../src/mapping/billerRegistry";
import {
  buildBillFetchRequestXml,
  buildBillPaymentRequestXml,
  buildTxnStatusComplainReqXml,
} from "../src/xml/builder";
import {
  parseBillFetchRequestXml,
  parseBillPaymentRequestXml,
  parseTxnStatusComplainReqXml,
} from "../src/xml/parser";
import { BillRequestCreateInput, ComplaintCreateInput, PaymentCreateInput } from "../src/types/merchant";

describe("mapping layer round-trips (merchant JSON -> NPCI domain object -> XML -> NPCI domain object)", () => {
  it("bill_request: MSEDCL is fetch-required and round-trips customer/agent/biller fields", () => {
    const biller = getBillerById("MSEB00000NAT01")!;
    const kind = decideBillRequestKind(biller);
    expect(kind).toBe("fetch");

    const input: BillRequestCreateInput = {
      biller_id: biller.id,
      customer: { name: "Jane Doe", mobile: "9123456789", email: "jane@example.com" },
      device: { initiating_channel: "INT", ip: "10.0.0.1" },
    };
    const npciReq = billRequestInputToNpciRequest(input, kind);
    const xml = buildBillFetchRequestXml(npciReq);
    expect(xml).toContain("<ns2:BillFetchRequest");

    const parsed = parseBillFetchRequestXml(xml);
    expect(parsed.customer.mobile).toBe("9123456789");
    expect(parsed.billDetails.biller.id).toBe(biller.id);
    expect(parsed.agent.device.tags.find((t) => t.name === "INITIATING_CHANNEL")?.value).toBe("INT");
    expect(parsed.agent.device.tags.find((t) => t.name === "IP")?.value).toBe("10.0.0.1");
  });

  it("adhoc-only billers (no fetch/validation support) are routed as adhoc_only", () => {
    const biller = getBillerById("INDANE0000LPG01")!;
    expect(decideBillRequestKind(biller)).toBe("adhoc_only");
  });

  it("payment: round-trips amount, payment mode and biller id through NPCI XML", () => {
    const input: PaymentCreateInput = {
      bill_request_id: "billreq_test",
      bill_pay_amount: 150000,
      currency: "INR",
      fees: { app_convenience_fee: 500, biller_convenience_fee: 200 },
      payments: [{ id: "leg_1", provider: "razorpay", amount: 150000, currency: "INR", method: "upi", upi: { vpa: "jane@upi" } }],
      bills: [{ bill_number: "MOCKBILL0", amount: 150000, currency: "INR" }],
      customer: { name: "Jane Doe", mobile: "9123456789" },
      biller_id: "MSEB00000NAT01",
      device: { initiating_channel: "INT" },
    };
    const npciReq = paymentInputToNpciRequest(input);
    const xml = buildBillPaymentRequestXml(npciReq);
    const parsed = parseBillPaymentRequestXml(xml);

    expect(parsed.amount.amount).toBe("150000");
    expect(parsed.paymentMethod.paymentMode).toBe("UPI");
    expect(parsed.billDetails.biller.id).toBe("MSEB00000NAT01");
    expect(parsed.txn.txnReferenceId).toHaveLength(20);
  });

  it("complaint: round-trips txnReferenceId and disposition through CMS XML", () => {
    const input: ComplaintCreateInput = {
      biller_id: "MSEB00000NAT01",
      bill_payment_id: "pay_test",
      complaint_type: "Erroneously paid in wrong account",
      complaint_description: "Paid twice for the same bill",
    };
    const npciReq = complaintInputToNpciRequest(input, "RZPY6224HRVZ1CK6TRMEXTRA1", "9123456789");
    const xml = buildTxnStatusComplainReqXml(npciReq);
    const parsed = parseTxnStatusComplainReqXml(xml);

    expect(parsed.txnReferenceId).toBe("RZPY6224HRVZ1CK6TRMEXTRA1");
    expect(parsed.disposition).toBe("Erroneously paid in wrong account");
    expect(parsed.mobile).toBe("9123456789");
    expect(parsed.txn.xchangeId).toBe("501");
  });
});
