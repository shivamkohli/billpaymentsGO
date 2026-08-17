/**
 * Real BBPCU (or downstream-aggregator) HTTP+XML client.
 *
 * Left unimplemented (throws) on purpose — like `RsaSha256XmlDsigSigner` in
 * `xml/signer.ts`, we don't yet know the exact endpoint paths / auth scheme
 * because no BBPS API key/secret or onboarding docs have been issued yet.
 * The NPCI spec itself only defines the XML payloads; the transport
 * (base URL paths, header auth vs. mTLS, Bearer token vs. HMAC signing of
 * the HTTP request) is decided per-BBPCU or per-aggregator at onboarding
 * (the spec's sandbox examples reference both Setu (`sandbox-coudc.setu.co`,
 * Bearer token) and PayU (`bbps-sb.payu.in`) conventions, which differ).
 *
 * Once real credentials + an endpoint spec exist, fill in the four methods
 * below: POST the (already-signed) XML string from `credentials.baseUrl +
 * <op-specific path>`, with whatever auth `credentials.apiKey/apiSecret`
 * implies, and return the raw response XML string unchanged so
 * `xml/parser.ts` can parse it exactly like it parses the mock's output.
 */

import { BbpsDownstreamCredentials } from "../config/credentials";
import { BbpcuClient } from "./BbpcuClient";

export class NpciHttpBbpcuClient implements BbpcuClient {
  constructor(private readonly credentials: BbpsDownstreamCredentials) {}

  private notImplemented(op: string): never {
    throw new Error(
      `NpciHttpBbpcuClient.${op} is not implemented yet. BBPS_MODE=live requires real ` +
        "BBPCU/aggregator endpoint paths and auth scheme, which aren't known until NPCI/BBPCU " +
        "onboarding is complete. See the comment in src/gateway/npciHttpBbpcuClient.ts."
    );
  }

  async sendBillFetch(_signedRequestXml: string): Promise<string> {
    return this.notImplemented("sendBillFetch");
  }

  async sendBillValidate(_signedRequestXml: string): Promise<string> {
    return this.notImplemented("sendBillValidate");
  }

  async sendBillPayment(_signedRequestXml: string): Promise<string> {
    return this.notImplemented("sendBillPayment");
  }

  async sendTxnStatusComplain(_signedRequestXml: string): Promise<string> {
    return this.notImplemented("sendTxnStatusComplain");
  }
}
