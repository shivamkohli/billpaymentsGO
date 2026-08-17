/**
 * Gateway boundary: everything on the far side of this interface is "the
 * BBPS network" (BBPCU, and beyond it the Biller BBPOU) — either the real
 * NPCI/BBPCU HTTP+XML connection, or a downstream aggregator (Setu, PayU;
 * see NPCI spec's sandbox integration examples) fronting the same NPCI
 * message set over a simpler REST+Bearer-token API.
 *
 * Deliberately operates on already-built, already-signed XML strings, not
 * domain objects — signing (`xml/signer.ts`) and XML (de)serialization
 * (`xml/builder.ts` / `xml/parser.ts`) are the orchestration layer's job,
 * not the gateway client's. That keeps this interface identical whether
 * the implementation is "POST XML to BBPCU" or "translate to a
 * downstream-aggregator's JSON/REST call and back" — only the client
 * implementation would need to change, not this contract.
 */
export interface BbpcuClient {
  sendBillFetch(signedRequestXml: string): Promise<string>;
  sendBillValidate(signedRequestXml: string): Promise<string>;
  sendBillPayment(signedRequestXml: string): Promise<string>;
  /** Handles both CMS Register Complaint (xchangeId 501) and Status Enquiry (506). */
  sendTxnStatusComplain(signedRequestXml: string): Promise<string>;
}
