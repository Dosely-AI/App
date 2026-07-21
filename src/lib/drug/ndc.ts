/**
 * Barcode → medication lookup, grounded in the FDA's National Drug Code (NDC)
 * directory. This path uses no AI at all: a scanned barcode resolves to an
 * official FDA product record, so the name/strength/form we show are facts from
 * the label, not a model's guess.
 *
 * US drug packages carry a UPC-A (12 digits) or EAN-13 (13 digits) that embeds
 * the 10-digit NDC:
 *
 *   EAN-13   0 + UPC-A
 *   UPC-A    3 + NDC-10 + check digit
 *
 * The 10 digits alone don't say where the segment boundaries fall — the same
 * digits can be 4-4-2, 5-3-2, or 5-4-1. Rather than guess, we generate every
 * valid segmentation and let openFDA tell us which one exists.
 */

const NDC_URL = 'https://api.fda.gov/drug/ndc.json';

/** Keep only digits — scanners sometimes include spaces or a trailing newline. */
function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Reduce a scanned barcode to the embedded 10-digit NDC, or null if the code
 * isn't a US drug barcode.
 */
export function ndcDigitsFromBarcode(raw: string): string | null {
  let d = digitsOnly(raw);

  // EAN-13 wrapping a UPC-A: drop the leading zero.
  if (d.length === 13 && d.startsWith('0')) d = d.slice(1);

  // UPC-A drug codes use system digit '3': 3 + NDC-10 + check digit.
  if (d.length === 12) {
    if (!d.startsWith('3')) return null;
    return d.slice(1, 11);
  }

  // Some packages encode the NDC directly.
  if (d.length === 11) return d.slice(0, 10);
  if (d.length === 10) return d;

  return null;
}

/**
 * Every valid hyphenation of a 10-digit NDC. Exactly one of these is the real
 * product code; openFDA resolves which.
 */
export function ndcCandidates(digits: string): string[] {
  if (!/^\d{10}$/.test(digits)) return [];
  return [
    `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`, // 4-4-2
    `${digits.slice(0, 5)}-${digits.slice(5, 8)}-${digits.slice(8)}`, // 5-3-2
    `${digits.slice(0, 5)}-${digits.slice(5, 9)}-${digits.slice(9)}`, // 5-4-1
  ];
}

/** Convenience: barcode straight to the candidate list. */
export function candidatesFromBarcode(raw: string): string[] {
  const digits = ndcDigitsFromBarcode(raw);
  return digits ? ndcCandidates(digits) : [];
}

/** What a successful scan tells us about the medication. */
export type NdcProduct = {
  /** Best display name (brand if present, else generic). */
  name: string;
  genericName: string | null;
  brandName: string | null;
  /** e.g. "200 mg" — joined when a product has multiple ingredients. */
  strength: string | null;
  /** e.g. "TABLET, FILM COATED" */
  form: string | null;
  labeler: string | null;
  productNdc: string | null;
};

type NdcResult = {
  generic_name?: string;
  brand_name?: string;
  labeler_name?: string;
  dosage_form?: string;
  product_ndc?: string;
  active_ingredients?: { name?: string; strength?: string }[];
};

/** Title-case FDA's SHOUTED label text so it reads naturally in the UI. */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .trim();
}

/** Map a raw openFDA NDC record to our shape. Pure — easy to unit test. */
export function extractProduct(result: NdcResult): NdcProduct | null {
  const brand = result.brand_name?.trim() || null;
  const generic = result.generic_name?.trim() || null;
  const name = brand || generic;
  if (!name) return null;

  const strengths = (result.active_ingredients ?? [])
    .map((i) => i.strength?.trim())
    .filter((s): s is string => Boolean(s));

  return {
    name: titleCase(name),
    brandName: brand ? titleCase(brand) : null,
    genericName: generic ? titleCase(generic) : null,
    strength: strengths.length > 0 ? strengths.join(' / ') : null,
    form: result.dosage_form ? titleCase(result.dosage_form) : null,
    labeler: result.labeler_name ? titleCase(result.labeler_name) : null,
    productNdc: result.product_ndc ?? null,
  };
}

async function queryNdc(field: string, value: string, signal?: AbortSignal): Promise<NdcResult | null> {
  const url = `${NDC_URL}?search=${field}:%22${encodeURIComponent(value)}%22&limit=1`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null; // openFDA 404s when nothing matches
    const data = (await res.json()) as { results?: NdcResult[] };
    return data.results?.[0] ?? null;
  } catch {
    return null;
  }
}

export type ScanLookup =
  | { status: 'found'; product: NdcProduct }
  | { status: 'not-a-drug-code' }
  | { status: 'no-match'; tried: string[] };

/**
 * Resolve a scanned barcode to an FDA product. Tries each valid NDC
 * segmentation against both the package and product code fields.
 */
export async function lookupBarcode(raw: string, signal?: AbortSignal): Promise<ScanLookup> {
  const candidates = candidatesFromBarcode(raw);
  if (candidates.length === 0) return { status: 'not-a-drug-code' };

  for (const ndc of candidates) {
    for (const field of ['packaging.package_ndc', 'product_ndc']) {
      const result = await queryNdc(field, ndc, signal);
      const product = result ? extractProduct(result) : null;
      if (product) return { status: 'found', product };
    }
  }

  return { status: 'no-match', tried: candidates };
}
