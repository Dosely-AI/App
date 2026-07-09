import { extractOverview, fetchOverview, formatOverviewText } from '@/lib/drug/openfda';

const sampleResult = {
  purpose: ['Purpose  Pain reliever/fever reducer'],
  indications_and_usage: ['temporarily relieves minor aches and pains', 'reduces fever'],
  warnings: ['Liver warning: this product contains acetaminophen. '.repeat(30)],
  openfda: { brand_name: ['Tylenol'], generic_name: ['ACETAMINOPHEN'] },
};

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

describe('extractOverview', () => {
  it('pulls and cleans the relevant label fields', () => {
    const o = extractOverview(sampleResult);
    expect(o.brandNames).toEqual(['Tylenol']);
    expect(o.genericNames).toEqual(['ACETAMINOPHEN']);
    expect(o.purpose).toBe('Purpose Pain reliever/fever reducer');
    expect(o.uses).toBe('temporarily relieves minor aches and pains reduces fever');
    expect(o.warning?.endsWith('…')).toBe(true); // truncated
  });

  it('handles a sparse result without throwing', () => {
    const o = extractOverview({});
    expect(o).toEqual({
      brandNames: [],
      genericNames: [],
      purpose: null,
      uses: null,
      warning: null,
    });
  });
});

describe('formatOverviewText', () => {
  it('joins purpose and uses', () => {
    const text = formatOverviewText('Tylenol', extractOverview(sampleResult));
    expect(text).toContain('Pain reliever');
    expect(text).toContain('relieves minor aches');
  });

  it('gives a helpful message when nothing is known', () => {
    const text = formatOverviewText('Zzz', extractOverview({}));
    expect(text).toMatch(/couldn't find/i);
  });
});

describe('fetchOverview', () => {
  it('returns an overview from the first matching query', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [sampleResult] }),
    }) as unknown as typeof fetch;
    const o = await fetchOverview({ name: 'acetaminophen' });
    expect(o?.genericNames).toEqual(['ACETAMINOPHEN']);
  });

  it('returns null when the API has no match', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    expect(await fetchOverview({ name: 'notadrug' })).toBeNull();
  });

  it('returns null for empty input without fetching', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    expect(await fetchOverview({ name: '  ' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
