/**
 * Grounded medication information from the U.S. FDA openFDA drug-label API.
 * This is the *source of truth* for "what a medication does" — we never let the
 * AI invent drug facts. Public, key-less API. Only the drug name is sent.
 */

const BASE_URL = 'https://api.fda.gov/drug/label.json';

export type MedOverview = {
  brandNames: string[];
  genericNames: string[];
  /** OTC "Purpose" section, when present. */
  purpose: string | null;
  /** "Indications and usage" — what the drug is used to treat. */
  uses: string | null;
  /** A short, truncated safety note from labeling. */
  warning: string | null;
};

type LabelResult = {
  purpose?: string[];
  indications_and_usage?: string[];
  warnings?: string[];
  openfda?: { brand_name?: string[]; generic_name?: string[] };
};

/** Join a label field's paragraphs, collapse whitespace, and cap the length. */
function firstClean(arr: string[] | undefined, max: number): string | null {
  if (!arr || arr.length === 0) return null;
  const text = arr.join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/** Map a raw openFDA label result to our overview shape. Pure — easy to test. */
export function extractOverview(result: LabelResult): MedOverview {
  return {
    brandNames: result.openfda?.brand_name ?? [],
    genericNames: result.openfda?.generic_name ?? [],
    purpose: firstClean(result.purpose, 400),
    uses: firstClean(result.indications_and_usage, 700),
    warning: firstClean(result.warnings, 300),
  };
}

/** A plain-text rendering of the grounded overview — used as the no-key summary
 * and as the grounded input handed to Claude when a key is present. */
export function formatOverviewText(name: string, o: MedOverview): string {
  const lines: string[] = [];
  if (o.purpose) lines.push(o.purpose);
  if (o.uses && o.uses !== o.purpose) lines.push(o.uses);
  if (lines.length === 0) {
    return `We couldn't find FDA label information for “${name}”. Double-check the spelling, or ask your pharmacist what this medication is for.`;
  }
  return lines.join('\n\n');
}

async function queryLabel(
  field: string,
  value: string,
  signal?: AbortSignal,
): Promise<LabelResult | null> {
  const url = `${BASE_URL}?search=${field}:%22${encodeURIComponent(value)}%22&limit=1`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null; // openFDA returns 404 when nothing matches
    const data = (await res.json()) as { results?: LabelResult[] };
    return data.results?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Look up a medication's grounded overview. Tries RxCUI (most precise), then
 * generic name, then brand name. Returns null if nothing is found or offline.
 */
export async function fetchOverview(input: {
  name: string;
  rxcui?: string | null;
  signal?: AbortSignal;
}): Promise<MedOverview | null> {
  const name = input.name.trim();
  if (!name && !input.rxcui) return null;

  const attempts: [string, string][] = [];
  if (input.rxcui) attempts.push(['openfda.rxcui', input.rxcui]);
  if (name) {
    attempts.push(['openfda.generic_name', name.toLowerCase()]);
    attempts.push(['openfda.brand_name', name.toLowerCase()]);
  }

  for (const [field, value] of attempts) {
    const result = await queryLabel(field, value, input.signal);
    if (result) return extractOverview(result);
  }
  return null;
}
