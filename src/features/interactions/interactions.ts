import { fetchOverview } from '@/lib/drug/openfda';
import type { Medication } from '@/store/types';

/**
 * Drug-interaction information, grounded in FDA labeling. For each medication we
 * read its label's "Drug Interactions" section and flag where it names another
 * medication the user takes.
 *
 * Honest scope: this surfaces what the labels *say* and where two of your drugs
 * are named together. It is NOT an exhaustive interaction engine — labels often
 * describe interactions by drug *class* (e.g. "NSAIDs", "ACE inhibitors")
 * rather than by name, so a pharmacist reviewing the full list is still the
 * source of truth. That caveat is shown in the UI.
 */

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Which of `names` are named in `text` (word-start, case-insensitive, ≥4 chars). */
export function findMentions(text: string, names: string[]): string[] {
  if (!text) return [];
  const hits = new Set<string>();
  for (const name of names) {
    const n = name.trim();
    if (n.length < 4) continue;
    if (new RegExp(`\\b${escapeRegex(n)}`, 'i').test(text)) hits.add(name);
  }
  return [...hits];
}

export type MedInteraction = {
  /** Display name of the medication. */
  name: string;
  /** The label's drug-interactions text, or null if none found. */
  text: string | null;
  /** Other medications the user takes that are named in this one's text. */
  mentions: string[];
};

/** Unique unordered pairs of medications that name each other. */
export function interactionPairs(entries: MedInteraction[]): [string, string][] {
  const seen = new Set<string>();
  const pairs: [string, string][] = [];
  for (const e of entries) {
    for (const other of e.mentions) {
      const key = [e.name.toLowerCase(), other.toLowerCase()].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([e.name, other]);
    }
  }
  return pairs;
}

export type InteractionReport = {
  entries: MedInteraction[];
  /** Medications whose labels name each other — the "ask about these" list. */
  pairs: [string, string][];
  /** True when at least one label's interaction section was found. */
  hasAnyText: boolean;
};

/** Fetch and cross-reference interaction info across the user's medications. */
export async function checkInteractions(
  meds: Medication[],
  signal?: AbortSignal,
): Promise<InteractionReport> {
  // One label lookup per medication, in parallel.
  const data = await Promise.all(
    meds.map(async (m) => {
      const overview = await fetchOverview({ name: m.name, rxcui: m.rxcui, signal });
      const aliases = [m.name, ...(overview?.genericNames ?? [])]
        .map((a) => a.trim())
        .filter((a) => a.length >= 4);
      return { med: m, text: overview?.interactions ?? null, aliases };
    }),
  );

  const entries: MedInteraction[] = data.map((d) => {
    const others = data.filter((x) => x.med.id !== d.med.id);
    const mentions = d.text
      ? others.filter((o) => findMentions(d.text as string, o.aliases).length > 0).map((o) => o.med.name)
      : [];
    return { name: d.med.name, text: d.text, mentions: [...new Set(mentions)] };
  });

  return {
    entries,
    pairs: interactionPairs(entries),
    hasAnyText: entries.some((e) => e.text !== null),
  };
}
