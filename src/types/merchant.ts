/**
 * Razorpay-facing REST/JSON DTOs, transcribed from the "RZP BBPS Overview" /
 * COU API design doc (bill_requests, payments, complaints, billers entities).
 * This is the contract merchant partners integrate against — it must not
 * change shape when the downstream gateway (mock today, real BBPCU / an
 * aggregator like Setu/PayU tomorrow) changes.
 */

export interface MerchantCustomer {
  id?: string;
  name: string;
  mobile: string;
  email?: string;
}

export interface MerchantDevice {
  initiating_channel: string; // e.g. "INT", "MOB", "AGT" (see BILLER/NPCI channel codes)
  mobile?: string;
  geocode?: string;
  ip?: string;
  mac?: string;
  os?: string;
  app?: string;
  imei?: string;
  terminal_id?: string;
  ifsc?: string;
  postal_code?: string;
}

export interface MerchantAccountHolder {
  AccountHolderName?: string;
  AccountNumber?: string;
  mobile?: string;
  [key: string]: string | undefined;
}

export interface MerchantAmountDetails {
  min_amount_due?: number;
  current_outstanding_amount?: number;
  [key: string]: number | undefined;
}

export type BillPeriod =
  | "ONETIME"
  | "DAILY"
  | "WEEKLY"
  | "BIMONTHLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "HALFYEARLY"
  | "YEARLY"
  | "ASPRESENTED"
  | "NA";

export interface MerchantBill {
  bill_number: string;
  amount: number; // paise
  currency: string;
  bill_date?: string;
  due_date?: string;
  bill_period?: BillPeriod;
  amount_details?: MerchantAmountDetails;
}

export type ErrorSource = "business" | "razorpay" | "gateway" | "biller" | "customer" | "npci";

export interface MerchantErrorPayload {
  code: string;
  description: string;
  field?: string | null;
  source: ErrorSource;
  step: string;
  reason: string;
  metadata?: Record<string, unknown>;
}

// ── Bill Request (fetch-or-validate) ────────────────────────────────────────

export type BillRequestStatus = "processing" | "success" | "failed";

export interface BillRequestCreateInput {
  biller_id: string;
  gateway_biller_id?: string;
  customer: MerchantCustomer;
  device: MerchantDevice;
  biller_data?: { account_holder?: MerchantAccountHolder };
}

export interface BillRequestResource {
  id: string;
  entity: "bill_payment.bill_request";
  status: BillRequestStatus;
  customer: MerchantCustomer;
  biller_id: string;
  gateway_biller_id?: string;
  gateway: "bbps";
  created_at: number;
  updated_at?: number;
  expiry_at?: number;
  account_holder?: MerchantAccountHolder;
  bills: MerchantBill[];
  data?: Record<string, unknown>;
  error?: MerchantErrorPayload;
}

// ── Bill Payment ─────────────────────────────────────────────────────────────

export interface MerchantFees {
  app_convenience_fee: number;
  biller_convenience_fee: number;
}

export interface MerchantPaymentLegCard {
  type: string;
  last4: string;
  auth_code?: string;
}

export interface MerchantPaymentLegUpi {
  vpa: string;
}

export interface MerchantPaymentLeg {
  id: string;
  provider: "razorpay";
  amount: number;
  currency: string;
  method: string; // card | upi | netbanking | wallet | ...
  status?: string;
  card?: MerchantPaymentLegCard;
  upi?: MerchantPaymentLegUpi;
}

export interface PaymentCreateInput {
  bill_request_id: string;
  bill_pay_amount: number;
  currency: string;
  fees: MerchantFees;
  payments: MerchantPaymentLeg[];
  bills: Pick<MerchantBill, "bill_number" | "amount" | "currency">[];
  customer?: MerchantCustomer;
  biller_id?: string;
  gateway_biller_id?: string;
  device?: MerchantDevice;
  biller_data?: { account_holder?: MerchantAccountHolder };
}

export type PaymentStatus = "processing" | "success" | "failed";

export interface PaymentResource {
  id: string;
  entity: "bill_payment.payment";
  status: PaymentStatus;
  gateway_transaction_id?: string;
  biller_transaction_id?: string;
  biller_id?: string;
  gateway_biller_id?: string;
  gateway: "bbps";
  bill_pay_amount: number;
  currency: string;
  fees: MerchantFees;
  customer?: MerchantCustomer;
  payments: MerchantPaymentLeg[];
  account_holder?: MerchantAccountHolder;
  bills?: MerchantBill[];
  data?: Record<string, unknown>;
  created_at: number;
  updated_at?: number;
  error?: MerchantErrorPayload;
}

// ── Complaint ────────────────────────────────────────────────────────────────

export interface ComplaintCreateInput {
  biller_id: string;
  bill_payment_id: string;
  complaint_type: string; // NPCI complaint disposition, e.g. "Erroneously paid in wrong account"
  complaint_description?: string;
}

export type ComplaintStatus = "processing" | "success" | "failed";

export type GatewayComplaintStatus =
  | "assigned"
  | "escalated"
  | "re_assigned"
  | "assigned_to_cou"
  | "assigned_to_bou"
  | "resolved"
  | "unresolved"
  | "registered";

export interface ComplaintResource {
  id: string;
  entity: "bill_payment.complaint";
  status: ComplaintStatus;
  gateway_complaint_id?: string;
  gateway_complaint_status?: GatewayComplaintStatus;
  biller_remarks?: string;
  created_at: number;
  updated_at?: number;
  error?: MerchantErrorPayload;
}

// ── Biller (MDM) ─────────────────────────────────────────────────────────────

export type FetchRequirement = "MANDATORY" | "OPTIONAL" | "NOT_SUPPORTED";
export type BillerMode = "ONLINE" | "OFFLINE_A" | "OFFLINE_B";
export type PaymentAmountExactness = "Exact" | "Exact and above" | "Exact and below";

export interface BillerCustomerParam {
  name: string;
  label?: string;
  data_type: string;
  min_length?: number;
  max_length?: number;
  regex?: string;
  optional: boolean;
}

export interface BillerResource {
  id: string;
  name: string;
  alias_name?: string;
  category: string;
  mode: BillerMode;
  accepts_adhoc: boolean;
  fetch_requirement: FetchRequirement;
  support_bill_validation: FetchRequirement;
  payment_amount_exactness?: PaymentAmountExactness;
  payment_modes: string[];
  customer_params: BillerCustomerParam[];
  /**
   * Biller logo, served from this app's own static assets (`public/logos/`)
   * rather than fetched live from BBPCU — NPCI's real Biller MDM feed
   * (Section 15, <BBPSPlanMDMPush>) does not include logo binaries at all,
   * so any COU sourcing real biller logos does so out-of-band (e.g. from
   * NPCI's biller-logo asset drops) and serves them itself, same as here.
   */
  logo_url?: string;
}
