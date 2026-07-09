/** Local data model. Everything lives on the device — no accounts, no cloud. */

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
};

/** A single dose the user marked as taken, tied to a scheduled slot. */
export type DoseLog = {
  medId: string;
  date: string; // 'YYYY-MM-DD' (local)
  time: string; // 'HH:MM' slot it fulfills
  takenAt: string; // ISO timestamp when logged
};
