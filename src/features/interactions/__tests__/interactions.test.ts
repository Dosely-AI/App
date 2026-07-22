import { findMentions, interactionPairs, type MedInteraction } from '../interactions';

describe('findMentions', () => {
  const text =
    'Concomitant use with lisinopril or other ACE inhibitors may increase risk. ' +
    'Caution with NSAIDs such as ibuprofen.';

  it('finds a named medication in the text', () => {
    expect(findMentions(text, ['Lisinopril'])).toEqual(['Lisinopril']);
  });

  it('is case-insensitive', () => {
    expect(findMentions(text, ['IBUPROFEN'])).toEqual(['IBUPROFEN']);
  });

  it('does not match a medication that is absent', () => {
    expect(findMentions(text, ['Metformin'])).toEqual([]);
  });

  it('ignores very short names to avoid false hits', () => {
    expect(findMentions('take with ace', ['ace'])).toEqual([]);
  });

  it('returns nothing for empty text', () => {
    expect(findMentions('', ['Lisinopril'])).toEqual([]);
  });
});

describe('interactionPairs', () => {
  it('collapses mutual mentions into one unordered pair', () => {
    const entries: MedInteraction[] = [
      { name: 'Aspirin', text: 'x', mentions: ['Warfarin'] },
      { name: 'Warfarin', text: 'y', mentions: ['Aspirin'] },
    ];
    expect(interactionPairs(entries)).toEqual([['Aspirin', 'Warfarin']]);
  });

  it('captures a one-directional mention', () => {
    const entries: MedInteraction[] = [
      { name: 'Metformin', text: 'x', mentions: ['Lisinopril'] },
      { name: 'Lisinopril', text: 'y', mentions: [] },
    ];
    expect(interactionPairs(entries)).toEqual([['Metformin', 'Lisinopril']]);
  });

  it('returns no pairs when nothing is cross-referenced', () => {
    const entries: MedInteraction[] = [
      { name: 'A', text: 'x', mentions: [] },
      { name: 'B', text: 'y', mentions: [] },
    ];
    expect(interactionPairs(entries)).toEqual([]);
  });
});
