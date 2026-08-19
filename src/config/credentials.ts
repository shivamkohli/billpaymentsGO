/**
 * Credentials layer for the BBPS downstream connection (Razorpay COU <-> BBPCU/NPCI).
 *
 * The whole point of this abstraction: nothing in the mapping layer, the
 * orchestration services, or the HTTP routes ever reads `process.env`
 * directly. They all depend on the `CredentialsProvider` interface below.
 *
 * Today, no real BBPS API key/secret has been issued, so `EnvCredentialsProvider`
 * returns `null` and `src/gateway/index.ts` falls back to `MockBbpcuClient`.
 * The moment NPCI/BBPCU on-boarding issues real credentials:
 *   1. Fill in the BBPS_* values in `.env` (see `.env.example`).
 *   2. Set `BBPS_MODE=live`.
 * No source change is required — `getBbpsCredentials()` will start returning
 * a populated object and `getBbpcuClient()` will wire up `NpciHttpBbpcuClient`
 * instead of the mock.
 *
 * Swapping the credential *source* (env vars -> Vault/KMS/secrets manager) is
 * a one-file change: implement `CredentialsProvider` and swap the export in
 * `getCredentialsProvider()`.
 */

export interface BbpsDownstreamCredentials {
  /** BBPOU ID allocated to Razorpay's COU by BBPCU at on-boarding (4 chars, e.g. "OU21"). */
  bbpouId: string;
  /** Value carried in <Head origInst="..."/> for every outbound message. */
  origInst: string;
  /** Base URL for the BBPCU (or downstream aggregator, e.g. Setu/PayU) endpoint set. */
  baseUrl: string;
  /** API key/secret (or Bearer token material) for authenticating to BBPCU / the downstream aggregator. */
  apiKey: string;
  apiSecret: string;
  /** XML-DSig signing material — required before any real (non-Ack) message can be sent. */
  signingCertPath?: string;
  signingKeyPath?: string;
  /** mTLS CA bundle, if the downstream connection requires client-cert auth. */
  mtlsCaPath?: string;
}

export interface CredentialsProvider {
  /** Returns null when BBPS downstream credentials have not been provisioned yet. */
  getBbpsCredentials(): BbpsDownstreamCredentials | null;
  isConfigured(): boolean;
}

/**
 * Credentials for Razorpay's own BBPS *sandbox* (stage) — a deterministic
 * mock-gateway environment reachable over plain HTTP Basic Auth + JSON,
 * documented in the "Razorpay BBPS Sandbox — Merchant Integration Guide".
 * This is a different downstream than `BbpsDownstreamCredentials` above:
 * that one is the real NPCI/BBPCU XML+mTLS connection (still unissued);
 * this one is Razorpay's own stage gateway used by `BBPS_MODE=staging`
 * (see `src/gateway/stagingSandboxBbpcuClient.ts`) to serve real-time
 * (if simulated) responses instead of `MockBbpcuClient`'s local fake data.
 */
export interface StagingSandboxCredentials {
  keyId: string;
  keySecret: string;
  baseUrl: string;
}

/** Returns null when BBPS_STAGING_* env vars are not fully populated. */
export function getStagingCredentials(): StagingSandboxCredentials | null {
  const keyId = process.env.BBPS_STAGING_KEY_ID?.trim();
  const keySecret = process.env.BBPS_STAGING_KEY_SECRET?.trim();
  const baseUrl = process.env.BBPS_STAGING_BASE_URL?.trim();
  if (!keyId || !keySecret || !baseUrl) return null;
  return { keyId, keySecret, baseUrl };
}

const REQUIRED_ENV_KEYS = [
  "BBPS_BBPOU_ID",
  "BBPS_ORIG_INST",
  "BBPCU_BASE_URL",
  "BBPS_API_KEY",
  "BBPS_API_SECRET",
] as const;

export class EnvCredentialsProvider implements CredentialsProvider {
  isConfigured(): boolean {
    return REQUIRED_ENV_KEYS.every((key) => !!process.env[key]?.trim());
  }

  getBbpsCredentials(): BbpsDownstreamCredentials | null {
    if (!this.isConfigured()) return null;
    return {
      bbpouId: process.env.BBPS_BBPOU_ID!.trim(),
      origInst: process.env.BBPS_ORIG_INST!.trim(),
      baseUrl: process.env.BBPCU_BASE_URL!.trim(),
      apiKey: process.env.BBPS_API_KEY!.trim(),
      apiSecret: process.env.BBPS_API_SECRET!.trim(),
      signingCertPath: process.env.BBPS_SIGNING_CERT_PATH?.trim() || undefined,
      signingKeyPath: process.env.BBPS_SIGNING_KEY_PATH?.trim() || undefined,
      mtlsCaPath: process.env.BBPS_MTLS_CA_PATH?.trim() || undefined,
    };
  }
}

/** Test/dev helper — lets specs inject fixed credentials without touching env vars. */
export class StaticCredentialsProvider implements CredentialsProvider {
  constructor(private readonly creds: BbpsDownstreamCredentials | null) {}
  isConfigured(): boolean {
    return this.creds !== null;
  }
  getBbpsCredentials(): BbpsDownstreamCredentials | null {
    return this.creds;
  }
}

let provider: CredentialsProvider = new EnvCredentialsProvider();

export function getCredentialsProvider(): CredentialsProvider {
  return provider;
}

/** Escape hatch for tests / future secrets-manager integration. */
export function setCredentialsProvider(next: CredentialsProvider): void {
  provider = next;
}
