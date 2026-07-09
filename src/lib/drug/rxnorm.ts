/**
 * Thin client over the U.S. National Library of Medicine RxNorm API (RxNav).
 * Used to enrich a typed medication name with a standard RxCUI identifier.
 *
 * Design notes:
 * - The medication name is always free text; RxNorm only *enriches* it. If the
 *   API is unreachable or returns nothing, we degrade to plain free text rather
 *   than blocking the user.
 * - Public, key-less API. No PII is sent — only the drug name the user typed.
 */

const BASE_URL = 'https://rxnav.nlm.nih.gov/REST';

export type DrugSuggestion = {
  rxcui: string;
  name: string;
  /** RxNorm term type, e.g. SBD (branded), SCD (clinical), IN (ingredient). */
  tty?: string;
};

type RxNavDrugsResponse = {
  drugGroup?: {
    conceptGroup?: {
      tty?: string;
      conceptProperties?: { rxcui: string; name: string; tty?: string }[];
    }[];
  };
};

/**
 * Search RxNorm for drug concepts matching `query`. Returns de-duplicated
 * suggestions (by name, case-insensitive), capped at `limit`. Returns an empty
 * array for queries shorter than 3 characters or on any network/parse failure.
 */
export async function searchDrugs(
  query: string,
  opts: { signal?: AbortSignal; limit?: number } = {},
): Promise<DrugSuggestion[]> {
  const term = query.trim();
  if (term.length < 3) return [];

  const limit = opts.limit ?? 8;
  const url = `${BASE_URL}/drugs.json?name=${encodeURIComponent(term)}`;

  let res: Response;
  try {
    res = await fetch(url, { signal: opts.signal });
  } catch {
    return [];
  }
  if (!res.ok) return [];

  let data: RxNavDrugsResponse;
  try {
    data = (await res.json()) as RxNavDrugsResponse;
  } catch {
    return [];
  }

  const groups = data.drugGroup?.conceptGroup ?? [];
  const seen = new Set<string>();
  const out: DrugSuggestion[] = [];

  for (const group of groups) {
    for (const concept of group.conceptProperties ?? []) {
      const key = concept.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ rxcui: concept.rxcui, name: concept.name, tty: concept.tty });
      if (out.length >= limit) return out;
    }
  }
  return out;
}
