import { refillStatus } from '@/features/refill/refill';
import type { Medication, Pharmacy } from '@/store/types';

import {
  buildRefillGroups,
  composeRefillMessage,
  hasPhone,
  pharmacyForMed,
  refillDueCount,
  sanitizePhone,
  smsUrl,
  telUrl,
  type RefillItem,
} from '../pharmacy';

const TODAY = '2026-07-23';

/** A medication that, by default, is due for a refill "soon" (3 days left). */
function med(over: Partial<Medication> = {}): Medication {
  return {
    id: `m-${Math.random().toString(36).slice(2)}`,
    name: 'Med',
    rxcui: null,
    strength: null,
    form: null,
    times: ['08:00'],
    daysOfWeek: [],
    createdAt: '2026-01-01T00:00:00Z',
    pillsPerDose: 1,
    quantityOnHand: 3,
    quantityAsOf: TODAY,
    refillLeadDays: 7,
    pharmacyId: null,
    rxNumber: null,
    ...over,
  };
}

function pharmacy(over: Partial<Pharmacy> = {}): Pharmacy {
  return {
    id: 'p1',
    name: 'CVS',
    phone: '(555) 123-4567',
    address: '',
    notes: '',
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const item = (m: Medication): RefillItem => ({ med: m, status: refillStatus(m, TODAY) });

describe('buildRefillGroups', () => {
  it('includes only medications that need a refill (soon or out)', () => {
    const meds = [
      med({ name: 'Soon', quantityOnHand: 3 }),
      med({ name: 'Out', quantityOnHand: 0 }),
      med({ name: 'Ok', quantityOnHand: 100 }),
      med({ name: 'Untracked', quantityOnHand: null, quantityAsOf: null }),
    ];
    const names = buildRefillGroups(meds, [], TODAY).flatMap((g) => g.items.map((i) => i.med.name));
    expect(names.sort()).toEqual(['Out', 'Soon']);
  });

  it('groups by pharmacy, most urgent group first, with no-pharmacy group last', () => {
    const cvs = pharmacy({ id: 'cvs', name: 'CVS' });
    const wal = pharmacy({ id: 'wal', name: 'Walgreens' });
    const meds = [
      med({ name: 'A', pharmacyId: 'cvs', quantityOnHand: 5 }), // 5 days
      med({ name: 'B', pharmacyId: 'wal', quantityOnHand: 0 }), // out (most urgent)
      med({ name: 'C', pharmacyId: null, quantityOnHand: 2 }), // 2 days, no pharmacy
    ];
    const groups = buildRefillGroups(meds, [cvs, wal], TODAY);
    expect(groups.map((g) => g.pharmacy?.name ?? null)).toEqual(['Walgreens', 'CVS', null]);
  });

  it('sorts medications within a group by urgency', () => {
    const cvs = pharmacy({ id: 'cvs' });
    const meds = [
      med({ name: 'Later', pharmacyId: 'cvs', quantityOnHand: 6 }),
      med({ name: 'Sooner', pharmacyId: 'cvs', quantityOnHand: 1 }),
    ];
    const [group] = buildRefillGroups(meds, [cvs], TODAY);
    expect(group.items.map((i) => i.med.name)).toEqual(['Sooner', 'Later']);
  });

  it('treats a deleted / unknown pharmacy id as no pharmacy', () => {
    const groups = buildRefillGroups([med({ pharmacyId: 'ghost', quantityOnHand: 2 })], [], TODAY);
    expect(groups).toHaveLength(1);
    expect(groups[0].pharmacy).toBeNull();
  });
});

describe('composeRefillMessage', () => {
  it('lists medications with strength and Rx number, addressed to the pharmacy', () => {
    const msg = composeRefillMessage('Jordan', pharmacy({ name: 'CVS' }), [
      item(med({ name: 'Metformin', strength: '500 mg', form: 'tablet', rxNumber: 'RX123' })),
    ]);
    expect(msg).toContain('Jordan');
    expect(msg).toContain('Hello CVS,');
    expect(msg).toContain('• Metformin (500 mg tablet) — Rx #RX123');
    expect(msg).toContain('prescription:'); // singular for one item
  });

  it('pluralizes and omits missing Rx numbers; falls back for an empty name', () => {
    const msg = composeRefillMessage('', null, [
      item(med({ name: 'Aspirin' })),
      item(med({ name: 'Lisinopril' })),
    ]);
    expect(msg).toContain('a DoselyAI user');
    expect(msg).toContain('prescriptions:'); // plural for two
    expect(msg).toContain('• Aspirin');
    expect(msg).not.toContain('Rx #');
  });
});

describe('phone helpers', () => {
  it('reduces a number to dialable digits, keeping a leading +', () => {
    expect(sanitizePhone('+1 (555) 123-4567')).toBe('+15551234567');
    expect(sanitizePhone('(555) 123-4567')).toBe('5551234567');
  });

  it('builds tel: and sms: links, encoding the body and honoring the separator', () => {
    expect(telUrl('(555) 123-4567')).toBe('tel:5551234567');
    expect(smsUrl('555-123-4567', 'Hi there')).toBe('sms:5551234567?body=Hi%20there');
    expect(smsUrl('555-123-4567', 'Hi', '&')).toBe('sms:5551234567&body=Hi');
    expect(smsUrl('5551234567', '')).toBe('sms:5551234567');
  });

  it('knows when a pharmacy is reachable by phone', () => {
    expect(hasPhone(pharmacy({ phone: '(555) 123-4567' }))).toBe(true);
    expect(hasPhone(pharmacy({ phone: '123' }))).toBe(false);
    expect(hasPhone(null)).toBe(false);
  });
});

describe('pharmacyForMed & refillDueCount', () => {
  it('resolves a medication’s pharmacy, or null when unset/unknown', () => {
    const cvs = pharmacy({ id: 'cvs' });
    expect(pharmacyForMed(med({ pharmacyId: 'cvs' }), [cvs])).toBe(cvs);
    expect(pharmacyForMed(med({ pharmacyId: null }), [cvs])).toBeNull();
    expect(pharmacyForMed(med({ pharmacyId: 'ghost' }), [cvs])).toBeNull();
  });

  it('counts how many medications need a refill', () => {
    const meds = [
      med({ quantityOnHand: 2 }),
      med({ quantityOnHand: 100 }),
      med({ quantityOnHand: 0 }),
    ];
    expect(refillDueCount(meds, TODAY)).toBe(2);
  });
});
