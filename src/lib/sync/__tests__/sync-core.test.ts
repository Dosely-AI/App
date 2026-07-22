import { decideSync, serializeSynced } from '../sync-core';

describe('decideSync', () => {
  it('does nothing when both sides are empty', () => {
    expect(
      decideSync({ serverPresent: false, localEmpty: true, serverUpdatedAt: null, localUpdatedAt: null }),
    ).toBe('in-sync');
  });

  it('pushes when the server has nothing but the device has data', () => {
    expect(
      decideSync({ serverPresent: false, localEmpty: false, serverUpdatedAt: null, localUpdatedAt: '2026-01-01T00:00:00Z' }),
    ).toBe('push');
  });

  it('adopts the server on a fresh device (local empty)', () => {
    expect(
      decideSync({ serverPresent: true, localEmpty: true, serverUpdatedAt: '2026-01-01T00:00:00Z', localUpdatedAt: null }),
    ).toBe('adopt');
  });

  it('adopts when the server copy is newer', () => {
    expect(
      decideSync({
        serverPresent: true,
        localEmpty: false,
        serverUpdatedAt: '2026-02-01T00:00:00Z',
        localUpdatedAt: '2026-01-01T00:00:00Z',
      }),
    ).toBe('adopt');
  });

  it('pushes when the local copy is newer', () => {
    expect(
      decideSync({
        serverPresent: true,
        localEmpty: false,
        serverUpdatedAt: '2026-01-01T00:00:00Z',
        localUpdatedAt: '2026-02-01T00:00:00Z',
      }),
    ).toBe('push');
  });

  it('is in sync when timestamps match', () => {
    const t = '2026-01-15T12:00:00Z';
    expect(
      decideSync({ serverPresent: true, localEmpty: false, serverUpdatedAt: t, localUpdatedAt: t }),
    ).toBe('in-sync');
  });
});

describe('serializeSynced', () => {
  it('reflects only the synced fields and detects changes', () => {
    const base = { medications: [], logs: [], symptoms: [], emergency: null };
    const a = serializeSynced(base);
    const b = serializeSynced({ ...base, symptoms: [{ id: '1', date: '2026-01-01', severity: 2, note: 'x', createdAt: 'y' }] });
    expect(a).not.toBe(b);
    expect(serializeSynced(base)).toBe(a); // stable
  });
});
