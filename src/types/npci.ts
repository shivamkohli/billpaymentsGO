/**
 * Clean, domain-shaped TypeScript mirrors of the NPCI BBPS API Specifications
 * v14.0 XML message contracts (Sections 1, 2, 4, 6, 23 of the spec).
 *
 * These are intentionally NOT the raw fast-xml-parser attribute-prefixed
 * shape (`@_foo`). `src/xml/builder.ts` and `src/xml/parser.ts` are the only
 * places that know about that XML-attribute encoding — everything else
 * (mappers, gateway clients, tests) works with these plain interfaces.
 */

export interface NpciHead {
  origInst: string;
  refId: string;
  ts: string; // ISODateTime, fixed length 25: YYYY-MM-DDThh:mm:ss+hh:mm
  ver: string;
}

export interface NpciTag {
  name: string;
  value: string;
}

export interface NpciAnalytics {
  tags: NpciTag[]; // FETCHREQUESTSTART / FETCHREQUESTEND / PAYREQUESTSTART / PAYREQUESTEND
}

export interface NpciRiskScore {
  provider: string;
  type: string; // e.g. TXNRISK
  value: string; // "000".."100"
}

export type NpciTxnType =
  | "FORWARD TYPE REQUEST"
  | "REVERSAL TYPE REQUEST"
  | "FORWARD TYPE RESPONSE"
  | "REVERSAL TYPE RESPONSE";

/** xchangeId values per Section 23 / Element <Txn> attribute xchangeId. */
export type NpciXchangeId = "401" | "402" | "501" | "502" | "503" | "506" | "507" | "508";

export interface NpciTxn {
  ts: string;
  msgId: string;
  txnReferenceId?: string;
  paymentRefId?: string;
  directBillChannel?: "L1QR" | "L1PL" | "L2QR" | "L2PL" | "L3QR" | "L3PL";
  directBillContentId?: string;
  siTxn?: "Yes" | "No";
  origRefId?: string;
  type?: NpciTxnType;
  xchangeId?: NpciXchangeId;
  riskScores?: NpciRiskScore[];
}

export interface NpciCustomer {
  mobile: string;
  /** name attribute is EMAIL | AADHAAR | PAN */
  tags?: NpciTag[];
}

/**
 * Device tag `name` values: INITIATING_CHANNEL (mandatory), MOBILE, GEOCODE,
 * POSTAL_CODE, IP, TERMINAL_ID, IMEI, IFSC, MAC, OS, APP.
 */
export interface NpciDevice {
  tags: NpciTag[];
}

export interface NpciAgent {
  id: string;
  device: NpciDevice;
}

export interface NpciBiller {
  id: string;
}

/** tags carry the biller's RefFld1/RefFld2/RefFld3 customer-identification params. */
export interface NpciCustomerParams {
  tags: NpciTag[];
}

export interface NpciBillDetails {
  biller: NpciBiller;
  customerParams?: NpciCustomerParams;
}

export interface NpciReason {
  approvalRefNum?: string;
  responseCode: string; // "000" success; see RESPONSE_CODE_BANDS in mapping/common.ts
  responseReason: string;
  complianceRespCd?: string; // XXX111
  complianceReason?: string;
}

/** tags carry Amount1/Amount2/Amount3 (e.g. Late Fee, Discount). */
export interface NpciBillerResponse {
  customerName?: string;
  amount?: string; // paise, numeric string
  dueDate?: string; // ISO date, "9999-01-01" if unavailable
  billDate?: string; // ISO date, "0001-01-01" if unavailable
  billNumber?: string;
  billPeriod?: string;
  custConvFee?: string;
  tags?: NpciTag[];
}

/** tags carry BlRspFld1/BlRspFld2/PaymentBlRspFld1/PaymentBlRspFld2. */
export interface NpciAdditionalInfo {
  tags: NpciTag[];
}

export type NpciPaymentMode =
  | "Internet_Banking"
  | "Debit_Card"
  | "Credit_Card"
  | "IMPS"
  | "Cash"
  | "UPI"
  | "Wallet"
  | "NEFT"
  | "Prepaid_Card"
  | "AEPS"
  | "Account_Transfer"
  | "Bharat_QR"
  | "USSD";

export interface NpciPaymentMethod {
  quickPay: "Yes" | "No";
  splitPay: "Yes" | "No";
  offUsPay?: "Yes" | "No";
  paymentMode: NpciPaymentMode;
}

/** tags carry Amount1/Amount2/Amount3 selected from the biller's amountBreakupSet (Late Fee, Discount, etc). */
export interface NpciAmount {
  amount: string; // paise
  custConvFee: string; // CCF1, Customer BBPOU -> Biller BBPOU
  couCustConvFee?: string; // CCF2, retained by Customer BBPOU, never forwarded to Biller
  currency: string; // ISO 4217 numeric, "356" for INR
  splitPayAmount?: string;
  tags?: NpciTag[];
}

/**
 * Flows Customer BBPOU -> BBPCU only; BBPCU strips this before forwarding to
 * the Biller BBPOU. tag `name` is one of Remarks | CardNum|AuthCode |
 * IFSC|AccountNo | MMID|MobileNo | WalletName|MobileNo | VPA | Aadhaar|IIN.
 */
export interface NpciPaymentInformation {
  tags: NpciTag[];
}

export interface NpciErrorMessage {
  errorCd?: string;
  errorDtl?: string;
}

export interface NpciBillFetchRequest {
  head: NpciHead;
  analytics?: NpciAnalytics;
  txn: NpciTxn;
  customer: NpciCustomer;
  agent: NpciAgent;
  billDetails: NpciBillDetails;
}

export interface NpciBillFetchResponse {
  head: NpciHead;
  reason: NpciReason;
  txn: Pick<NpciTxn, "ts" | "msgId">;
  billDetails?: NpciBillDetails;
  billerResponse?: NpciBillerResponse;
  additionalInfo?: NpciAdditionalInfo;
}

/** Section 4: identical envelope shape to Bill Fetch, used when fetchRequirement=NOT_SUPPORTED. */
export type NpciBillValidationRequest = NpciBillFetchRequest;
export type NpciBillValidationResponse = NpciBillFetchResponse;

export interface NpciBillPaymentRequest {
  head: NpciHead;
  analytics?: NpciAnalytics;
  txn: NpciTxn;
  customer: NpciCustomer;
  agent: NpciAgent;
  billDetails: NpciBillDetails;
  paymentMethod: NpciPaymentMethod;
  amount: NpciAmount;
  paymentInformation?: NpciPaymentInformation;
}

export interface NpciBillPaymentResponse {
  head: NpciHead;
  reason: NpciReason;
  txn: Pick<NpciTxn, "ts" | "msgId" | "txnReferenceId">;
  billDetails?: NpciBillDetails;
  billerResponse?: NpciBillerResponse;
  additionalInfo?: NpciAdditionalInfo;
}

export interface NpciTxnSearchDateCriteria {
  fromDate?: string;
  toDate?: string;
}

/** CMS request covering xchangeId 401/501/502/503/506/507. */
export interface NpciTxnStatusComplainReq {
  head: NpciHead;
  txn: Pick<NpciTxn, "ts" | "msgId" | "xchangeId">;
  complaintType: "Transaction";
  mobile?: string;
  txnSearchDateCriteria?: NpciTxnSearchDateCriteria;
  txnReferenceId?: string;
  complaintId?: string;
  disposition?: string;
  description?: string;
}

export interface NpciTxnDetail {
  txnReferenceId: string;
  amount: string;
  txnDate: string;
  agentId?: string;
  billerId: string;
  txnStatus: string;
}

export type NpciComplaintStatus =
  | "Assigned"
  | "Escalated"
  | "Re Assigned"
  | "Assigned to COU"
  | "Assigned to BOU"
  | "Assigned to OU"
  | "Resolved"
  | "Unresolved";

export interface NpciTxnStatusComplainResp {
  head: NpciHead;
  txn: Pick<NpciTxn, "ts" | "msgId">;
  responseCode: string; // "000" success, "001" no txn/complaint found
  responseReason: string;
  complaintId?: string;
  assigned?: string;
  openComplaint?: "Y" | "N";
  complaintStatus?: NpciComplaintStatus;
  remarks?: string;
  txnList?: NpciTxnDetail[];
  customerMobile?: string;
}
