/**
 * BBPS ID generation per NPCI BBPS API Specifications v14.0, Section 20
 * ("BBPS IDs" — Generation Logic table). v14.0's headline change is that
 * Message ID / Reference ID / Transaction Reference ID all embed a Julian
 * date component so BBPCU can validate freshness / detect replay.
 */

import { randomUUID } from "crypto";

const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomAlphaNumeric(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHANUMERIC[Math.floor(Math.random() * ALPHANUMERIC.length)];
  }
  return out;
}

function randomNumeric(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += Math.floor(Math.random() * 10).toString();
  }
  return out;
}

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1);
  const diffMs = date.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Julian date component used inside msgId/refId: 1-digit year + 3-digit
 * day-of-year, e.g. 2026-08-11 -> "6224" (year digit "6", day-of-year "224").
 * Total length 4 ("YDDD").
 */
export function julianDateYDDD(date: Date = new Date()): string {
  const yearDigit = (date.getFullYear() % 10).toString();
  const ddd = String(dayOfYear(date)).padStart(3, "0");
  return `${yearDigit}${ddd}`;
}

/**
 * Julian date component used inside complaintId: 2-digit year + 3-digit
 * day-of-year, e.g. 2026-08-11 -> "26224". Total length 5 ("YYDDD").
 */
export function julianDateYYDDD(date: Date = new Date()): string {
  const yy = String(date.getFullYear() % 100).padStart(2, "0");
  const ddd = String(dayOfYear(date)).padStart(3, "0");
  return `${yy}${ddd}`;
}

function hhmm(date: Date = new Date()): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}${mm}`;
}

/**
 * Message ID / Reference ID — fixed length 35:
 *   Random AlphaNumeric (27) + Julian Date YDDD (4) + Time of initiation HHMM (4)
 */
export function generateMsgOrRefId(date: Date = new Date()): string {
  return `${randomAlphaNumeric(27)}${julianDateYDDD(date)}${hhmm(date)}`;
}

/**
 * Transaction Reference ID — fixed length 12 or 20:
 *   i)  Originating Institution ID (4) + Random alphanumeric (8)              = 12
 *   ii) Originating Institution ID (4) + Julian Date YDDD (4) + Random (12)   = 20
 *
 * COUs are expected to ensure the Julian date used is the current date.
 * We default to the 20-char variant since it round-trips a verifiable date.
 */
export function generateTxnReferenceId(
  originatingInstitutionId: string,
  variant: 12 | 20 = 20,
  date: Date = new Date()
): string {
  if (originatingInstitutionId.length !== 4) {
    throw new Error(
      `originatingInstitutionId must be exactly 4 characters, got "${originatingInstitutionId}"`
    );
  }
  if (variant === 12) {
    return `${originatingInstitutionId}${randomAlphaNumeric(8)}`;
  }
  return `${originatingInstitutionId}${julianDateYDDD(date)}${randomAlphaNumeric(12)}`;
}

/**
 * Complaint ID — fixed length 15:
 *   First 4 chars of the txnReferenceId (4) + Julian Date YYDDD of
 *   registration date (5) + Random Numeric (6)
 */
export function generateComplaintId(txnReferenceId: string, date: Date = new Date()): string {
  const prefix = txnReferenceId.slice(0, 4).padEnd(4, "X");
  return `${prefix}${julianDateYYDDD(date)}${randomNumeric(6)}`;
}

/**
 * Agent ID — fixed length 20:
 *   Customer BBPOU ID (4) + Agent Institution ID (4) + Payment Channel Code (3) + Random (9)
 */
export function generateAgentId(
  customerBbpouId: string,
  agentInstitutionId: string,
  paymentChannelCode: string
): string {
  if (customerBbpouId.length !== 4) throw new Error("customerBbpouId must be 4 characters");
  if (agentInstitutionId.length !== 4) throw new Error("agentInstitutionId must be 4 characters");
  if (paymentChannelCode.length !== 3) throw new Error("paymentChannelCode must be 3 characters");
  return `${customerBbpouId}${agentInstitutionId}${paymentChannelCode}${randomNumeric(9)}`;
}

/** Initiating Channel -> 3-char Channel Code used inside a generated Agent ID (Section 23, Element <Agent> id). */
export const CHANNEL_CODE_IN_AGENT_ID: Record<string, string> = {
  BNKBRNCH: "BNK",
  MOB: "MOB",
  MOBB: "MBB",
  INT: "INT",
  INTB: "INB",
  ATM: "ATM",
  KIOSK: "KSK",
  AGT: "AGT",
  BSC: "BSC",
};

/**
 * Merchant-facing entity id (`billreq_...`, `pay_...`, `complaint_...`),
 * mirroring Razorpay's standard `<prefix>_<random>` entity id convention.
 * Unrelated to any NPCI-defined id format above.
 */
export function generateEntityId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 18)}`;
}

export function isoTimestamp(date: Date = new Date()): string {
  // YYYY-MM-DDThh:mm:ss+hh:mm (fixed length 25), default tz assumed IST (+05:30)
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}+05:30`;
}
