import { Role, RxStatus, Scope } from '@/lib/care/protocol.gen';
import type { DoseLog, Medication } from '@/store/types';

import {
  buildSnapshot,
  dayNumber,
  isValidNpi,
  linkedMed,
  pendingPickup,
  refillsLeft,
  riskLabel,
  riskReasons,
  rxActions,
  scopeLabels,
  scopesFor,
  supplyAfterPickup,
} from '../care';

function med(overrides: Partial<Medication> = {}): Medication {
  return {
    id: 'm1',
    name: 'Atorvastatin',
    rxcui: '617312',
    strength: '20 mg',
    form: 'tablet',
    times: ['21:00'],
    daysOfWeek: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('NPI validation', () => {
  it('accepts valid check digits and rejects everything else', () => {
    expect(isValidNpi('1234567893')).toBe(true);
    expect(isValidNpi('1245319599')).toBe(true);
    expect(isValidNpi('1234567890')).toBe(false);
    expect(isValidNpi('123456789')).toBe(false);
    expect(isValidNpi('12345678a3')).toBe(false);
  });
});

describe('day numbers', () => {
  it('match the vault (days since the Unix epoch)', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('2024-01-01')).toBe(19723);
  });
});

describe('scopes', () => {
  it('offers each provider only the permissions that fit them', () => {
    expect(scopesFor(Role.PHARMACY).map((s) => s.flag)).not.toContain(Scope.PRESCRIBE);
    expect(scopesFor(Role.PRESCRIBER).map((s) => s.flag)).not.toContain(Scope.RECEIVE_RX);
    expect(scopeLabels(Scope.READ_MEDS | Scope.READ_REFILL)).toEqual(['Medication list', 'Refills']);
  });
});

describe('prescription actions', () => {
  it('walks a pharmacy forward one step at a time', () => {
    expect(rxActions(RxStatus.SENT, Role.PHARMACY, 0)[0]).toMatchObject({ status: RxStatus.RECEIVED });
    expect(rxActions(RxStatus.READY, Role.PHARMACY, 0)[0]).toMatchObject({ status: RxStatus.PICKED_UP });
    expect(rxActions(RxStatus.PICKED_UP, Role.PHARMACY, 3)).toEqual([]);
  });

  it('lets a patient request refills only while refills remain', () => {
    expect(rxActions(RxStatus.PICKED_UP, Role.PATIENT, 1).map((a) => a.status)).toEqual([RxStatus.SENT]);
    expect(rxActions(RxStatus.PICKED_UP, Role.PATIENT, 0)).toEqual([]);
    expect(rxActions(RxStatus.IN_PROGRESS, Role.PATIENT, 1)).toEqual([]); // too late to cancel
    expect(refillsLeft(2, 1)).toBe(1);
    expect(refillsLeft(0, 3)).toBe(0);
  });

  it('lets a prescriber cancel only open prescriptions', () => {
    expect(rxActions(RxStatus.READY, Role.PRESCRIBER, 0).map((a) => a.status)).toEqual([RxStatus.CANCELLED]);
    expect(rxActions(RxStatus.CANCELLED, Role.PRESCRIBER, 0)).toEqual([]);
  });
});

describe('risk labels', () => {
  it('tiers scores and spells out reasons', () => {
    expect(riskLabel(7).tone).toBe('high');
    expect(riskLabel(3).tone).toBe('watch');
    expect(riskLabel(0).tone).toBe('ok');
    expect(riskReasons(1 | 4)).toEqual(['out of medication', 'low refill adherence']);
  });
});

describe('buildSnapshot', () => {
  const now = new Date(2024, 0, 10, 23, 0);

  it('converts medications to fixed-point, vault-ready records', () => {
    const snap = buildSnapshot('  Alex Rivera ', [
      med({ pillsPerDose: 1.5, quantityOnHand: 30, quantityAsOf: '2024-01-05', daysOfWeek: [1, 3, 5] }),
    ], [], now);
    expect(snap.displayName).toBe('Alex Rivera');
    expect(snap.tzOffsetMin ?? 0).toBe(-now.getTimezoneOffset());
    const m = snap.med![0];
    expect(m).toMatchObject({
      id: 'm1',
      slotsPerDay: 1,
      daysMask: (1 << 1) | (1 << 3) | (1 << 5),
      unitsPerDoseMilli: 1500,
      supplyTracked: true,
      onHandMilli: 30_000,
      asOfDay: dayNumber('2024-01-05'),
    });
  });

  it('summarizes the last 30 days of adherence and timing', () => {
    const logs: DoseLog[] = [
      { medId: 'm1', date: '2024-01-08', time: '21:00', takenAt: new Date(2024, 0, 8, 21, 5).toISOString() },
      { medId: 'm1', date: '2024-01-09', time: '21:00', takenAt: new Date(2024, 0, 9, 22, 30).toISOString() },
    ];
    const m = buildSnapshot('A', [med({ createdAt: new Date(2024, 0, 8).toISOString() })], logs, now).med![0];
    expect(m.dosesDue).toBe(3); // Jan 8, 9, 10
    expect(m.dosesTaken).toBe(2);
    expect(m.dosesLate).toBe(1); // 90 minutes late on the 9th
    expect(m.selfAdherencePct).toBe(67);
  });

  it('never sends invalid values the vault would reject', () => {
    const m = buildSnapshot('A', [med({ rxcui: 'not-a-cui', asNeeded: true, times: [] })], [], now).med![0];
    expect(m.rxcui).toBeUndefined();
    expect(m.slotsPerDay).toBe(0);
    expect(m.supplyTracked).toBe(false);
    expect(m.onHandMilli).toBeUndefined();
  });
});

describe('pharmacy pickups', () => {
  const rx = {
    id: 'rx1',
    medId: 'm1',
    quantityMilli: 30_000,
    history: [
      { status: RxStatus.SENT, atMs: 1 },
      { status: RxStatus.PICKED_UP, atMs: 100 },
    ],
  };

  it('finds the medication a prescription belongs to', () => {
    expect(linkedMed([med({ id: 'other' }), med()], rx)?.id).toBe('m1');
    expect(linkedMed([med({ id: 'x', careRxId: 'rx1' })], { id: 'rx1' })?.id).toBe('x');
    expect(linkedMed([med({ id: 'x' })], { id: 'rx9' })).toBeUndefined();
  });

  it('adds a pickup to supply exactly once', () => {
    const m = med({ quantityOnHand: 10, quantityAsOf: '2024-01-01' });
    const pickup = pendingPickup(m, rx);
    expect(pickup).toEqual({ atMs: 100, units: 30 });
    // 1/day since Jan 1: 5 left on Jan 6, plus the 30 just picked up.
    const updated = { ...m, ...supplyAfterPickup(m, pickup!, '2024-01-06') };
    expect(updated.quantityOnHand).toBe(35);
    expect(updated.quantityAsOf).toBe('2024-01-06');
    expect(pendingPickup(updated, rx)).toBeNull();
  });

  it('starts tracking supply for an untracked medication', () => {
    const m = med();
    expect(supplyAfterPickup(m, { atMs: 5, units: 30 }, '2024-01-06').quantityOnHand).toBe(30);
  });
});
