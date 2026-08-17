/**
 * XML-DSig signing, per NPCI BBPS API Specifications v14.0 Section 13
 * (Key Exchange): every outbound message except <Ack> must carry an
 * enveloped XML digital signature —
 *   CanonicalizationMethod: xml-c14n-20010315
 *   SignatureMethod:        rsa-sha256 (spec sample uses rsa-sha256; some
 *                           BBPCU environments still accept rsa-sha1)
 *   DigestMethod:           sha256
 *   Transform:              enveloped-signature
 *
 * We do NOT have signing certs yet (no BBPS API key/secret has been issued),
 * so `NoopSigner` is wired in by default — it returns the XML untouched and
 * logs a loud warning. This is intentional: BBPS_MODE=mock never calls a
 * signer, and BBPS_MODE=live should fail loudly rather than silently send
 * unsigned XML to a real BBPCU endpoint.
 */

export interface XmlSigner {
  sign(xml: string): string;
}

export class NoopSigner implements XmlSigner {
  sign(xml: string): string {
    console.warn(
      "[bbps-go] NoopSigner in use — outbound XML is UNSIGNED. This is only safe in BBPS_MODE=mock."
    );
    return xml;
  }
}

/**
 * Real implementation, to be filled in once BBPS_SIGNING_CERT_PATH /
 * BBPS_SIGNING_KEY_PATH are populated (see .env.example / credentials.ts).
 *
 * Intended implementation once certs exist:
 *   1. `npm install xml-crypto`
 *   2. Use `xml-crypto`'s `SignedXml` with:
 *        - canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
 *        - signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"
 *        - digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256"
 *   3. addReference("/*", transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature"])
 *   4. Load the private key from `signingKeyPath` and sign the whole document,
 *      appending the resulting <Signature> as the last child of the root element.
 *
 * Left unimplemented (throws) until real credentials/certs are available so
 * a misconfiguration surfaces immediately instead of shipping a fake signature.
 */
export class RsaSha256XmlDsigSigner implements XmlSigner {
  constructor(
    private readonly signingCertPath: string,
    private readonly signingKeyPath: string
  ) {}

  sign(_xml: string): string {
    throw new Error(
      "RsaSha256XmlDsigSigner is not implemented yet. Wire in `xml-crypto` once " +
        "BBPS_SIGNING_CERT_PATH/BBPS_SIGNING_KEY_PATH are populated — see the comment " +
        "in src/xml/signer.ts for the exact algorithm parameters required by the spec."
    );
  }
}

export function getSigner(signingCertPath?: string, signingKeyPath?: string): XmlSigner {
  if (signingCertPath && signingKeyPath) {
    return new RsaSha256XmlDsigSigner(signingCertPath, signingKeyPath);
  }
  return new NoopSigner();
}
