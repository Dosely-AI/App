// GENERATED from native/vault/protocol/protocol.def by build.mjs — do not edit.

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

export const Err = {
  OK: 0,
  BAD_REQUEST: 1,
  UNAUTHORIZED: 2,
  FORBIDDEN: 3,
  NOT_FOUND: 4,
  CONFLICT: 5,
  EXPIRED: 6,
  STEP_UP_REQUIRED: 7,
  INTEGRITY: 8,
  INTERNAL: 9,
  UNSUPPORTED: 10,
  LIMIT: 11,
  UNVERIFIED: 12,
} as const;
export type Err = (typeof Err)[keyof typeof Err];

export const FieldType = {
  U64: 1,
  I64: 2,
  BOOL: 3,
  BYTES: 4,
  STR: 5,
  MSG: 6,
} as const;
export type FieldType = (typeof FieldType)[keyof typeof FieldType];

export const Frame = {
  VERSION: 1,
  KIND_REQUEST: 1,
  KIND_RESPONSE: 2,
  HEADER_SIZE: 28,
  MAC_SIZE: 32,
  MAX_PAYLOAD: 1048576,
  MAX_CLOCK_SKEW_MS: 300000,
} as const;

export const Codec = {
  MAX_DEPTH: 8,
  MAX_FIELDS: 65536,
  MAX_STRING: 65536,
  MAX_BYTES: 65536,
} as const;

export const RecordType = {
  PATIENT_KEY: 1,
  SNAPSHOT: 2,
  PROVIDER: 3,
  PROVIDER_KEY: 4,
  GRANT: 5,
  RX_BODY: 6,
  RX_META: 7,
  INVITE_SPENT: 8,
  FILL: 9,
  TOMBSTONE: 10,
} as const;
export type RecordType = (typeof RecordType)[keyof typeof RecordType];

export type WireType = 'u64' | 'i64' | 'bool' | 'str' | 'bytes' | 'msg';
export type FieldSpec = {
  readonly tag: number;
  readonly type: WireType;
  /** Nested message group; absent for untyped (command-dependent) messages. */
  readonly of?: string;
  readonly repeated?: boolean;
};

export const Schema = {
  Req: {
    RequestId: { tag: 1, type: 'u64' },
    Command: { tag: 2, type: 'u64' },
    Actor: { tag: 3, type: 'msg', of: 'Actor' },
    Args: { tag: 4, type: 'msg', of: 'Arg' },
    Context: { tag: 5, type: 'msg', of: 'Ctx' },
  },
  Resp: {
    RequestId: { tag: 1, type: 'u64' },
    Status: { tag: 2, type: 'u64' },
    Result: { tag: 3, type: 'msg' },
    Error: { tag: 4, type: 'str' },
  },
  Actor: {
    Id: { tag: 1, type: 'str' },
    Role: { tag: 2, type: 'u64' },
  },
  Ctx: {
    Purpose: { tag: 1, type: 'u64' },
    StepUpAtMs: { tag: 2, type: 'u64' },
  },
  Arg: {
    PatientId: { tag: 1, type: 'str' },
    ProviderId: { tag: 2, type: 'str' },
    GrantId: { tag: 3, type: 'str' },
    RxId: { tag: 4, type: 'str' },
    Status: { tag: 5, type: 'u64' },
    Limit: { tag: 6, type: 'u64' },
    Token: { tag: 7, type: 'bytes' },
    Role: { tag: 8, type: 'u64' },
    Scopes: { tag: 9, type: 'u64' },
    GrantDays: { tag: 10, type: 'u64' },
    Day: { tag: 11, type: 'u64' },
    Record: { tag: 12, type: 'msg' },
    ExpiresInMs: { tag: 13, type: 'u64' },
  },
  List: {
    Item: { tag: 1, type: 'msg', repeated: true },
  },
  Hello: {
    Version: { tag: 1, type: 'u64' },
    SystemKey: { tag: 2, type: 'bytes' },
  },
  Provider: {
    Id: { tag: 1, type: 'str' },
    Role: { tag: 2, type: 'u64' },
    Name: { tag: 3, type: 'str' },
    Org: { tag: 4, type: 'str' },
    Npi: { tag: 5, type: 'str' },
    Verified: { tag: 6, type: 'bool' },
    PublicKey: { tag: 7, type: 'bytes' },
    CreatedAtMs: { tag: 8, type: 'u64' },
  },
  Grant: {
    Id: { tag: 1, type: 'str' },
    PatientId: { tag: 2, type: 'str' },
    ProviderId: { tag: 3, type: 'str' },
    Scopes: { tag: 4, type: 'u64' },
    CreatedAtMs: { tag: 5, type: 'u64' },
    ExpiresAtMs: { tag: 6, type: 'u64' },
    Revoked: { tag: 7, type: 'bool' },
    ProviderName: { tag: 8, type: 'str' },
    ProviderRole: { tag: 9, type: 'u64' },
    ProviderVerified: { tag: 10, type: 'bool' },
    ProviderOrg: { tag: 11, type: 'str' },
    PatientName: { tag: 12, type: 'str' },
  },
  Invite: {
    PatientId: { tag: 1, type: 'str' },
    Role: { tag: 2, type: 'u64' },
    Scopes: { tag: 3, type: 'u64' },
    ExpiresAtMs: { tag: 4, type: 'u64' },
    Nonce: { tag: 5, type: 'bytes' },
    GrantDays: { tag: 6, type: 'u64' },
    Token: { tag: 7, type: 'bytes' },
  },
  Token: {
    Body: { tag: 1, type: 'bytes' },
    Signature: { tag: 2, type: 'bytes' },
  },
  Snapshot: {
    PatientId: { tag: 1, type: 'str' },
    DisplayName: { tag: 2, type: 'str' },
    Med: { tag: 3, type: 'msg', of: 'Med', repeated: true },
    UpdatedAtMs: { tag: 4, type: 'u64' },
    TzOffsetMin: { tag: 5, type: 'i64' },
  },
  Med: {
    Id: { tag: 1, type: 'str' },
    Name: { tag: 2, type: 'str' },
    Rxcui: { tag: 3, type: 'str' },
    Strength: { tag: 4, type: 'str' },
    Form: { tag: 5, type: 'str' },
    SlotsPerDay: { tag: 6, type: 'u64' },
    DaysMask: { tag: 7, type: 'u64' },
    UnitsPerDoseMilli: { tag: 8, type: 'u64' },
    OnHandMilli: { tag: 9, type: 'u64' },
    AsOfDay: { tag: 10, type: 'u64' },
    LeadDays: { tag: 11, type: 'u64' },
    AsNeeded: { tag: 12, type: 'bool' },
    SelfAdherencePct: { tag: 13, type: 'u64' },
    DosesDue: { tag: 14, type: 'u64' },
    DosesTaken: { tag: 15, type: 'u64' },
    DosesLate: { tag: 16, type: 'u64' },
    AvgDelayMin: { tag: 17, type: 'i64' },
    SupplyTracked: { tag: 18, type: 'bool' },
    RxId: { tag: 19, type: 'str' },
  },
  Fill: {
    Id: { tag: 1, type: 'str' },
    PatientId: { tag: 2, type: 'str' },
    MedId: { tag: 3, type: 'str' },
    RxId: { tag: 4, type: 'str' },
    Day: { tag: 5, type: 'u64' },
    QuantityMilli: { tag: 6, type: 'u64' },
    DaysSupply: { tag: 7, type: 'u64' },
    PharmacyId: { tag: 8, type: 'str' },
  },
  Rx: {
    Id: { tag: 1, type: 'str' },
    PatientId: { tag: 2, type: 'str' },
    PrescriberId: { tag: 3, type: 'str' },
    PharmacyId: { tag: 4, type: 'str' },
    MedId: { tag: 5, type: 'str' },
    DrugName: { tag: 6, type: 'str' },
    Rxcui: { tag: 7, type: 'str' },
    Strength: { tag: 8, type: 'str' },
    Form: { tag: 9, type: 'str' },
    Sig: { tag: 10, type: 'str' },
    QuantityMilli: { tag: 11, type: 'u64' },
    DaysSupply: { tag: 12, type: 'u64' },
    Refills: { tag: 13, type: 'u64' },
    Controlled: { tag: 14, type: 'bool' },
    IssuedAtMs: { tag: 15, type: 'u64' },
    Status: { tag: 16, type: 'u64' },
    UpdatedAtMs: { tag: 17, type: 'u64' },
    Signature: { tag: 18, type: 'bytes' },
    PrescriberKey: { tag: 19, type: 'bytes' },
    SignatureValid: { tag: 20, type: 'bool' },
    PrescriberName: { tag: 21, type: 'str' },
    PatientName: { tag: 22, type: 'str' },
    PharmacyName: { tag: 23, type: 'str' },
    History: { tag: 24, type: 'msg', of: 'StatusEvent', repeated: true },
    RefillsUsed: { tag: 25, type: 'u64' },
  },
  StatusEvent: {
    Status: { tag: 1, type: 'u64' },
    AtMs: { tag: 2, type: 'u64' },
    ActorId: { tag: 3, type: 'str' },
  },
  RxMeta: {
    Id: { tag: 1, type: 'str' },
    PatientId: { tag: 2, type: 'str' },
    PrescriberId: { tag: 3, type: 'str' },
    PharmacyId: { tag: 4, type: 'str' },
    Status: { tag: 5, type: 'u64' },
    IssuedAtMs: { tag: 6, type: 'u64' },
    UpdatedAtMs: { tag: 7, type: 'u64' },
    History: { tag: 8, type: 'msg', of: 'StatusEvent', repeated: true },
  },
  Summary: {
    PatientId: { tag: 1, type: 'str' },
    DisplayName: { tag: 2, type: 'str' },
    Med: { tag: 3, type: 'msg', of: 'MedSummary', repeated: true },
    RiskScore: { tag: 4, type: 'u64' },
    RiskReasons: { tag: 5, type: 'u64' },
    Sync: { tag: 6, type: 'msg', of: 'SyncPlan' },
    Pharmacy: { tag: 7, type: 'msg', of: 'PharmacyRef', repeated: true },
    UpdatedAtMs: { tag: 8, type: 'u64' },
    Scopes: { tag: 9, type: 'u64' },
  },
  MedSummary: {
    MedId: { tag: 1, type: 'str' },
    Name: { tag: 2, type: 'str' },
    Strength: { tag: 3, type: 'str' },
    Form: { tag: 4, type: 'str' },
    Level: { tag: 5, type: 'u64' },
    DaysLeft: { tag: 6, type: 'u64' },
    RunOutDay: { tag: 7, type: 'u64' },
    RefillByDay: { tag: 8, type: 'u64' },
    PdcPermille: { tag: 9, type: 'u64' },
    PdcValid: { tag: 10, type: 'bool' },
    RiskScore: { tag: 11, type: 'u64' },
    RiskReasons: { tag: 12, type: 'u64' },
    SelfAdherencePct: { tag: 13, type: 'u64' },
    DosesDue: { tag: 14, type: 'u64' },
    DosesTaken: { tag: 15, type: 'u64' },
    DosesLate: { tag: 16, type: 'u64' },
    AvgDelayMin: { tag: 17, type: 'i64' },
    AsNeeded: { tag: 18, type: 'bool' },
    FillCount: { tag: 19, type: 'u64' },
    RemainingMilli: { tag: 20, type: 'u64' },
    DailyMilli: { tag: 21, type: 'u64' },
  },
  SyncPlan: {
    SyncDay: { tag: 1, type: 'u64' },
    ShortFill: { tag: 2, type: 'msg', of: 'ShortFill', repeated: true },
  },
  ShortFill: {
    MedId: { tag: 1, type: 'str' },
    Name: { tag: 2, type: 'str' },
    Days: { tag: 3, type: 'u64' },
    UnitsMilli: { tag: 4, type: 'u64' },
  },
  PharmacyRef: {
    Id: { tag: 1, type: 'str' },
    Name: { tag: 2, type: 'str' },
    Org: { tag: 3, type: 'str' },
    Verified: { tag: 4, type: 'bool' },
  },
  PatientRef: {
    Id: { tag: 1, type: 'str' },
    DisplayName: { tag: 2, type: 'str' },
    Scopes: { tag: 3, type: 'u64' },
    GrantExpiresAtMs: { tag: 4, type: 'u64' },
    RiskScore: { tag: 5, type: 'u64' },
    UpdatedAtMs: { tag: 6, type: 'u64' },
  },
  Work: {
    Kind: { tag: 1, type: 'u64' },
    PatientId: { tag: 2, type: 'str' },
    PatientName: { tag: 3, type: 'str' },
    MedId: { tag: 4, type: 'str' },
    MedName: { tag: 5, type: 'str' },
    DueDay: { tag: 6, type: 'u64' },
    Priority: { tag: 7, type: 'u64' },
    Detail: { tag: 8, type: 'str' },
    RxId: { tag: 9, type: 'str' },
  },
  Audit: {
    Seq: { tag: 1, type: 'u64' },
    AtMs: { tag: 2, type: 'u64' },
    ActorId: { tag: 3, type: 'str' },
    ActorRole: { tag: 4, type: 'u64' },
    Command: { tag: 5, type: 'u64' },
    PatientId: { tag: 6, type: 'str' },
    Purpose: { tag: 7, type: 'u64' },
    Outcome: { tag: 8, type: 'u64' },
    Detail: { tag: 9, type: 'str' },
    ActorName: { tag: 10, type: 'str' },
  },
  Stats: {
    Version: { tag: 1, type: 'u64' },
    Providers: { tag: 2, type: 'u64' },
    Patients: { tag: 3, type: 'u64' },
    Grants: { tag: 4, type: 'u64' },
    Prescriptions: { tag: 5, type: 'u64' },
    AuditEntries: { tag: 6, type: 'u64' },
    IntegrityErrors: { tag: 7, type: 'u64' },
    AuditIntact: { tag: 8, type: 'bool' },
    AuditBrokenAt: { tag: 9, type: 'u64' },
  },
  Rec: {
    Type: { tag: 1, type: 'u64' },
    Id: { tag: 2, type: 'str' },
    Version: { tag: 3, type: 'u64' },
    Sealed: { tag: 4, type: 'bytes' },
  },
  AuditRec: {
    Seq: { tag: 1, type: 'u64' },
    Sealed: { tag: 2, type: 'bytes' },
    Chain: { tag: 3, type: 'bytes' },
  },
} as const satisfies Record<string, Record<string, FieldSpec>>;

export type SchemaName = keyof typeof Schema;

export interface ReqMsg {
  RequestId?: number;
  Command?: number;
  Actor?: ActorMsg;
  Args?: ArgMsg;
  Context?: CtxMsg;
}

export interface RespMsg {
  RequestId?: number;
  Status?: number;
  Result?: Uint8Array;
  Error?: string;
}

export interface ActorMsg {
  Id?: string;
  Role?: number;
}

export interface CtxMsg {
  Purpose?: number;
  StepUpAtMs?: number;
}

export interface ArgMsg {
  PatientId?: string;
  ProviderId?: string;
  GrantId?: string;
  RxId?: string;
  Status?: number;
  Limit?: number;
  Token?: Uint8Array;
  Role?: number;
  Scopes?: number;
  GrantDays?: number;
  Day?: number;
  Record?: Uint8Array;
  ExpiresInMs?: number;
}

export interface ListMsg {
  Item?: Uint8Array[];
}

export interface HelloMsg {
  Version?: number;
  SystemKey?: Uint8Array;
}

export interface ProviderMsg {
  Id?: string;
  Role?: number;
  Name?: string;
  Org?: string;
  Npi?: string;
  Verified?: boolean;
  PublicKey?: Uint8Array;
  CreatedAtMs?: number;
}

export interface GrantMsg {
  Id?: string;
  PatientId?: string;
  ProviderId?: string;
  Scopes?: number;
  CreatedAtMs?: number;
  ExpiresAtMs?: number;
  Revoked?: boolean;
  ProviderName?: string;
  ProviderRole?: number;
  ProviderVerified?: boolean;
  ProviderOrg?: string;
  PatientName?: string;
}

export interface InviteMsg {
  PatientId?: string;
  Role?: number;
  Scopes?: number;
  ExpiresAtMs?: number;
  Nonce?: Uint8Array;
  GrantDays?: number;
  Token?: Uint8Array;
}

export interface TokenMsg {
  Body?: Uint8Array;
  Signature?: Uint8Array;
}

export interface SnapshotMsg {
  PatientId?: string;
  DisplayName?: string;
  Med?: MedMsg[];
  UpdatedAtMs?: number;
  TzOffsetMin?: number;
}

export interface MedMsg {
  Id?: string;
  Name?: string;
  Rxcui?: string;
  Strength?: string;
  Form?: string;
  SlotsPerDay?: number;
  DaysMask?: number;
  UnitsPerDoseMilli?: number;
  OnHandMilli?: number;
  AsOfDay?: number;
  LeadDays?: number;
  AsNeeded?: boolean;
  SelfAdherencePct?: number;
  DosesDue?: number;
  DosesTaken?: number;
  DosesLate?: number;
  AvgDelayMin?: number;
  SupplyTracked?: boolean;
  RxId?: string;
}

export interface FillMsg {
  Id?: string;
  PatientId?: string;
  MedId?: string;
  RxId?: string;
  Day?: number;
  QuantityMilli?: number;
  DaysSupply?: number;
  PharmacyId?: string;
}

export interface RxMsg {
  Id?: string;
  PatientId?: string;
  PrescriberId?: string;
  PharmacyId?: string;
  MedId?: string;
  DrugName?: string;
  Rxcui?: string;
  Strength?: string;
  Form?: string;
  Sig?: string;
  QuantityMilli?: number;
  DaysSupply?: number;
  Refills?: number;
  Controlled?: boolean;
  IssuedAtMs?: number;
  Status?: number;
  UpdatedAtMs?: number;
  Signature?: Uint8Array;
  PrescriberKey?: Uint8Array;
  SignatureValid?: boolean;
  PrescriberName?: string;
  PatientName?: string;
  PharmacyName?: string;
  History?: StatusEventMsg[];
  RefillsUsed?: number;
}

export interface StatusEventMsg {
  Status?: number;
  AtMs?: number;
  ActorId?: string;
}

export interface RxMetaMsg {
  Id?: string;
  PatientId?: string;
  PrescriberId?: string;
  PharmacyId?: string;
  Status?: number;
  IssuedAtMs?: number;
  UpdatedAtMs?: number;
  History?: StatusEventMsg[];
}

export interface SummaryMsg {
  PatientId?: string;
  DisplayName?: string;
  Med?: MedSummaryMsg[];
  RiskScore?: number;
  RiskReasons?: number;
  Sync?: SyncPlanMsg;
  Pharmacy?: PharmacyRefMsg[];
  UpdatedAtMs?: number;
  Scopes?: number;
}

export interface MedSummaryMsg {
  MedId?: string;
  Name?: string;
  Strength?: string;
  Form?: string;
  Level?: number;
  DaysLeft?: number;
  RunOutDay?: number;
  RefillByDay?: number;
  PdcPermille?: number;
  PdcValid?: boolean;
  RiskScore?: number;
  RiskReasons?: number;
  SelfAdherencePct?: number;
  DosesDue?: number;
  DosesTaken?: number;
  DosesLate?: number;
  AvgDelayMin?: number;
  AsNeeded?: boolean;
  FillCount?: number;
  RemainingMilli?: number;
  DailyMilli?: number;
}

export interface SyncPlanMsg {
  SyncDay?: number;
  ShortFill?: ShortFillMsg[];
}

export interface ShortFillMsg {
  MedId?: string;
  Name?: string;
  Days?: number;
  UnitsMilli?: number;
}

export interface PharmacyRefMsg {
  Id?: string;
  Name?: string;
  Org?: string;
  Verified?: boolean;
}

export interface PatientRefMsg {
  Id?: string;
  DisplayName?: string;
  Scopes?: number;
  GrantExpiresAtMs?: number;
  RiskScore?: number;
  UpdatedAtMs?: number;
}

export interface WorkMsg {
  Kind?: number;
  PatientId?: string;
  PatientName?: string;
  MedId?: string;
  MedName?: string;
  DueDay?: number;
  Priority?: number;
  Detail?: string;
  RxId?: string;
}

export interface AuditMsg {
  Seq?: number;
  AtMs?: number;
  ActorId?: string;
  ActorRole?: number;
  Command?: number;
  PatientId?: string;
  Purpose?: number;
  Outcome?: number;
  Detail?: string;
  ActorName?: string;
}

export interface StatsMsg {
  Version?: number;
  Providers?: number;
  Patients?: number;
  Grants?: number;
  Prescriptions?: number;
  AuditEntries?: number;
  IntegrityErrors?: number;
  AuditIntact?: boolean;
  AuditBrokenAt?: number;
}

export interface RecMsg {
  Type?: number;
  Id?: string;
  Version?: number;
  Sealed?: Uint8Array;
}

export interface AuditRecMsg {
  Seq?: number;
  Sealed?: Uint8Array;
  Chain?: Uint8Array;
}

export type MsgTypes = {
  Req: ReqMsg;
  Resp: RespMsg;
  Actor: ActorMsg;
  Ctx: CtxMsg;
  Arg: ArgMsg;
  List: ListMsg;
  Hello: HelloMsg;
  Provider: ProviderMsg;
  Grant: GrantMsg;
  Invite: InviteMsg;
  Token: TokenMsg;
  Snapshot: SnapshotMsg;
  Med: MedMsg;
  Fill: FillMsg;
  Rx: RxMsg;
  StatusEvent: StatusEventMsg;
  RxMeta: RxMetaMsg;
  Summary: SummaryMsg;
  MedSummary: MedSummaryMsg;
  SyncPlan: SyncPlanMsg;
  ShortFill: ShortFillMsg;
  PharmacyRef: PharmacyRefMsg;
  PatientRef: PatientRefMsg;
  Work: WorkMsg;
  Audit: AuditMsg;
  Stats: StatsMsg;
  Rec: RecMsg;
  AuditRec: AuditRecMsg;
};
