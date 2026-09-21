/** Local data model. Everything lives on the device — no accounts, no cloud. */

/**
 * A local profile — not a server account. It personalizes the app and, when
 * `biometricLock` is on, gates access behind the device's Face ID / Touch ID.
 */
export type Profile = {
  name: string;
  /** Require Face ID / Touch ID (or device passcode) to open the app. */
  biometricLock: boolean;
  createdAt: string; // ISO
};

/**
 * A real, server-backed account established with a passkey (web path). Unlike
 * `Profile`, this identity is verified by the backend and can span devices.
 */
export type AuthSession = {
  /** Bearer token from the auth server. */
  token: string;
  userId: string;
  name: string;
};

export type Medication = {
  id: string;
  name: string;
  /** RxNorm identifier when the name was matched to the drug database. */
  rxcui: string | null;
  strength: string | null; // e.g. "200 mg"
  form: string | null; // e.g. "tablet"
  /** Reminder times as "HH:MM" (24h). Each is one dose slot per applicable day. */
  times: string[];
  /** 0=Sun..6=Sat. Empty = every day. */
  daysOfWeek: number[];
  createdAt: string; // ISO

  // --- As-needed (PRN) dosing. When true, the medication has no fixed schedule
  // (`times` is empty), so it never counts toward adherence or reminders; the
  // user logs each dose when they take it. ---
  /** Taken as needed rather than on a schedule. */
  asNeeded?: boolean;
  /** Suggested safe maximum doses per day (from labeling / a pharmacist). Null = no cap set. */
  maxPerDay?: number | null;

  // --- Refill tracking (all optional so medications saved before this feature
  // still load cleanly; null/undefined = refill prediction is off). ---
  /** Units taken per scheduled dose slot (e.g. 2 tablets at a time). Null = 1. */
  pillsPerDose?: number | null;
  /** Units on hand as counted on `quantityAsOf`. Null = not tracking refills. */
  quantityOnHand?: number | null;
  /** Local 'YYYY-MM-DD' the `quantityOnHand` count was taken. */
  quantityAsOf?: string | null;
  /** Warn this many days before the projected run-out date. Null = 7. */
  refillLeadDays?: number | null;

  // --- Pharmacy (optional; enables one-tap refill requests). ---
  /** Which saved pharmacy fills this prescription (id into `pharmacies`). Null = none set. */
  pharmacyId?: string | null;
  /** The prescription (Rx) number the pharmacy uses to identify this fill. Null = unknown. */
  rxNumber?: string | null;

  // --- Care network (optional). ---
  /** The care-network prescription this medication was started from, so the
   * pharmacy's fills count toward its refill-adherence (PDC). */
  careRxId?: string | null;
  /** When the last pharmacy pickup was added to `quantityOnHand` (ms), so a
   * pickup is never counted twice. */
  careFillAt?: number | null;
};

/**
 * A pharmacy the user fills prescriptions at. Kept on-device with everything
 * else; medications reference one by `pharmacyId`, so when a refill is due the
 * user can place the request by phone or text. Nothing is sent anywhere until
 * the user taps Call / Text / Share.
 */
export type Pharmacy = {
  id: string;
  name: string;
  /** Free-form phone number; used to build tel: / sms: links. */
  phone: string;
  /** Optional street address, for the user's own reference. */
  address: string;
  /** Optional notes (which location, hours, etc.). */
  notes: string;
  createdAt: string; // ISO
};

/** A single dose the user marked as taken, tied to a scheduled slot. */
export type DoseLog = {
  medId: string;
  date: string; // 'YYYY-MM-DD' (local)
  time: string; // 'HH:MM' slot it fulfills
  takenAt: string; // ISO timestamp when logged
};

/** A symptom / how-you-feel entry the user records over time. */
export type SymptomLog = {
  id: string;
  date: string; // 'YYYY-MM-DD' (local)
  /** 1 (very mild) … 5 (very severe). */
  severity: number;
  note: string;
  createdAt: string; // ISO
};

/**
 * Emergency medical card details. Kept on-device like everything else; the user
 * can show or share it in an emergency. Medications are pulled live from the
 * medication list, so only the extra fields live here.
 */
export type EmergencyInfo = {
  allergies: string;
  conditions: string;
  bloodType: string;
  contactName: string;
  contactPhone: string;
  notes: string;
};
