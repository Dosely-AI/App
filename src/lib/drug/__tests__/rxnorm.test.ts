import { searchDrugs } from '@/lib/drug/rxnorm';

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

const sample = {
  drugGroup: {
    conceptGroup: [
      {
        tty: 'SBD',
        conceptProperties: [
          { rxcui: '1', name: 'Ibuprofen 200 mg', tty: 'SCD' },
          { rxcui: '2', name: 'Advil', tty: 'SBD' },
        ],
      },
      {
        tty: 'IN',
        conceptProperties: [
          { rxcui: '3', name: 'Ibuprofen', tty: 'IN' },
          { rxcui: '4', name: 'ibuprofen', tty: 'IN' }, // duplicate by case
        ],
      },
    ],
  },
};

function mockFetch(impl: jest.Mock) {
  (global as unknown as { fetch: unknown }).fetch = impl;
  return impl;
}

describe('searchDrugs', () => {
  it('returns [] for short queries without fetching', async () => {
    const fetchMock = mockFetch(jest.fn());
    expect(await searchDrugs('ib')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses, de-duplicates by name (case-insensitive), and preserves order', async () => {
    mockFetch(jest.fn().mockResolvedValue({ ok: true, json: async () => sample }));
    const res = await searchDrugs('ibuprofen');
    expect(res.map((r) => r.name)).toEqual(['Ibuprofen 200 mg', 'Advil', 'Ibuprofen']);
    expect(res[0]).toEqual({ rxcui: '1', name: 'Ibuprofen 200 mg', tty: 'SCD' });
  });

  it('caps results at the requested limit', async () => {
    mockFetch(jest.fn().mockResolvedValue({ ok: true, json: async () => sample }));
    const res = await searchDrugs('ibuprofen', { limit: 2 });
    expect(res).toHaveLength(2);
  });

  it('URL-encodes the query term', async () => {
    const fetchMock = mockFetch(jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    await searchDrugs('vitamin d');
    expect(String(fetchMock.mock.calls[0][0])).toContain('name=vitamin%20d');
  });

  it('returns [] on a network error', async () => {
    mockFetch(jest.fn().mockRejectedValue(new Error('offline')));
    expect(await searchDrugs('ibuprofen')).toEqual([]);
  });

  it('returns [] on a non-ok response', async () => {
    mockFetch(jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    expect(await searchDrugs('ibuprofen')).toEqual([]);
  });
});
