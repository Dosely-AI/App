// GENERATED from native/vault/protocol/protocol.def by build.mjs — do not edit.
// JSON shapes of the Dosely care API (see server/src/care).

export const Role = {
  PATIENT: 1,
  PHARMACY: 2,
  PRESCRIBER: 3,
  SYSTEM: 4,
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const Scope = {
  READ_MEDS: 1,
  READ_ADHERENCE: 2,
  READ_TIMING: 4,
  READ_REFILL: 8,
  RECEIVE_RX: 16,
  PRESCRIBE: 32,
} as const;

export const Purpose = {
  TREATMENT: 1,
  PAYMENT: 2,
  OPERATIONS: 3,
  PATIENT_REQUEST: 4,
} as const;
export type Purpose = (typeof Purpose)[keyof typeof Purpose];

export const RxStatus = {
  SENT: 1,
  RECEIVED: 2,
  IN_PROGRESS: 3,
  READY: 4,
  PICKED_UP: 5,
  CANCELLED: 6,
} as const;
export type RxStatus = (typeof RxStatus)[keyof typeof RxStatus];

export const RefillLevel = {
  UNTRACKED: 0,
  UNKNOWN: 1,
  OK: 2,
  SOON: 3,
  OUT: 4,
} as const;
export type RefillLevel = (typeof RefillLevel)[keyof typeof RefillLevel];

export const RiskReason = {
  REFILL_OVERDUE: 1,
  REFILL_SOON: 2,
  LOW_PDC: 4,
  LATE_DOSES: 8,
  MISSED_DOSES: 16,
} as const;

export const WorkKind = {
  REFILL_OVERDUE: 1,
  NEW_RX: 2,
  REFILL_DUE: 3,
  HIGH_RISK: 4,
  LOW_PDC: 5,
  MED_SYNC: 6,
} as const;
export type WorkKind = (typeof WorkKind)[keyof typeof WorkKind];

export const Cmd = {
  HELLO: 1,
  STATS: 2,
  PROVIDER_REGISTER: 10,
  PROVIDER_GET: 11,
  INVITE_CREATE: 20,
  INVITE_REDEEM: 21,
  GRANT_LIST: 22,
  GRANT_REVOKE: 23,
  SNAPSHOT_PUT: 30,
  PATIENT_SUMMARY: 31,
  PATIENT_ERASE: 32,
  PROVIDER_PATIENTS: 33,
  RX_CREATE: 40,
  RX_LIST: 41,
  RX_GET: 42,
  RX_SET_STATUS: 43,
  WORKLIST: 50,
  AUDIT_QUERY: 60,
  AUDIT_VERIFY: 61,
} as const;
export type Cmd = (typeof Cmd)[keyof typeof Cmd];

export interface ProviderJson {
  id?: string;
  role?: number;
  name?: string;
  org?: string;
  npi?: string;
  verified?: boolean;
  publicKey?: string;
  createdAtMs?: number;
}

export interface GrantJson {
  id?: string;
  patientId?: string;
  providerId?: string;
  scopes?: number;
  createdAtMs?: number;
  expiresAtMs?: number;
  revoked?: boolean;
  providerName?: string;
  providerRole?: number;
  providerVerified?: boolean;
  providerOrg?: string;
  patientName?: string;
}

export interface InviteJson {
  patientId?: string;
  role?: number;
  scopes?: number;
  expiresAtMs?: number;
  nonce?: string;
  grantDays?: number;
  token?: string;
}

export interface SnapshotJson {
  patientId?: string;
  displayName?: string;
  med?: MedJson[];
  updatedAtMs?: number;
  tzOffsetMin?: number;
}

export interface MedJson {
  id?: string;
  name?: string;
  rxcui?: string;
  strength?: string;
  form?: string;
  slotsPerDay?: number;
  daysMask?: number;
  unitsPerDoseMilli?: number;
  onHandMilli?: number;
  asOfDay?: number;
  leadDays?: number;
  asNeeded?: boolean;
  selfAdherencePct?: number;
  dosesDue?: number;
  dosesTaken?: number;
  dosesLate?: number;
  avgDelayMin?: number;
  supplyTracked?: boolean;
  rxId?: string;
}

export interface RxJson {
  id?: string;
  patientId?: string;
  prescriberId?: string;
  pharmacyId?: string;
  medId?: string;
  drugName?: string;
  rxcui?: string;
  strength?: string;
  form?: string;
  sig?: string;
  quantityMilli?: number;
  daysSupply?: number;
  refills?: number;
  controlled?: boolean;
  issuedAtMs?: number;
  status?: number;
  updatedAtMs?: number;
  signature?: string;
  prescriberKey?: string;
  signatureValid?: boolean;
  prescriberName?: string;
  patientName?: string;
  pharmacyName?: string;
  history?: StatusEventJson[];
  refillsUsed?: number;
}

export interface StatusEventJson {
  status?: number;
  atMs?: number;
  actorId?: string;
}

export interface SummaryJson {
  patientId?: string;
  displayName?: string;
  med?: MedSummaryJson[];
  riskScore?: number;
  riskReasons?: number;
  sync?: SyncPlanJson;
  pharmacy?: PharmacyRefJson[];
  updatedAtMs?: number;
  scopes?: number;
}

export interface MedSummaryJson {
  medId?: string;
  name?: string;
  strength?: string;
  form?: string;
  level?: number;
  daysLeft?: number;
  runOutDay?: number;
  refillByDay?: number;
  pdcPermille?: number;
  pdcValid?: boolean;
  riskScore?: number;
  riskReasons?: number;
  selfAdherencePct?: number;
  dosesDue?: number;
  dosesTaken?: number;
  dosesLate?: number;
  avgDelayMin?: number;
  asNeeded?: boolean;
  fillCount?: number;
  remainingMilli?: number;
  dailyMilli?: number;
}

export interface SyncPlanJson {
  syncDay?: number;
  shortFill?: ShortFillJson[];
}

export interface ShortFillJson {
  medId?: string;
  name?: string;
  days?: number;
  unitsMilli?: number;
}

export interface PharmacyRefJson {
  id?: string;
  name?: string;
  org?: string;
  verified?: boolean;
}

export interface PatientRefJson {
  id?: string;
  displayName?: string;
  scopes?: number;
  grantExpiresAtMs?: number;
  riskScore?: number;
  updatedAtMs?: number;
}

export interface WorkJson {
  kind?: number;
  patientId?: string;
  patientName?: string;
  medId?: string;
  medName?: string;
  dueDay?: number;
  priority?: number;
  detail?: string;
  rxId?: string;
}

export interface AuditJson {
  seq?: number;
  atMs?: number;
  actorId?: string;
  actorRole?: number;
  command?: number;
  patientId?: string;
  purpose?: number;
  outcome?: number;
  detail?: string;
  actorName?: string;
}

export interface StatsJson {
  version?: number;
  providers?: number;
  patients?: number;
  grants?: number;
  prescriptions?: number;
  auditEntries?: number;
  integrityErrors?: number;
  auditIntact?: boolean;
  auditBrokenAt?: number;
}
