import { dateKey } from '@/features/adherence/dates';

import type { MedicationFormValues } from '../schema';
import { formToInput } from '../to-input';

const form = (over: Partial<MedicationFormValues> = {}): MedicationFormValues => ({
  name: 'Aspirin',
  rxcui: null,
  strength: '',
  form: '',
  times: ['08:00'],
  daysOfWeek: [],
  pillsPerDose: '',
  quantityOnHand: '',
  refillLeadDays: '',
  ...over,
});

const today = dateKey(new Date());

describe('formToInput refill handling', () => {
  it('leaves refill fields null when the count is blank', () => {
    const out = formToInput(form());
    expect(out.quantityOnHand).toBeNull();
    expect(out.quantityAsOf).toBeNull();
    expect(out.pillsPerDose).toBeNull();
    expect(out.refillLeadDays).toBeNull();
  });

  it('stamps today when a count is first entered', () => {
    const out = formToInput(form({ quantityOnHand: '30', pillsPerDose: '2', refillLeadDays: '10' }));
    expect(out.quantityOnHand).toBe(30);
    expect(out.quantityAsOf).toBe(today);
    expect(out.pillsPerDose).toBe(2);
    expect(out.refillLeadDays).toBe(10);
  });

  it('keeps the original count date when the quantity is unchanged', () => {
    const out = formToInput(form({ quantityOnHand: '30' }), {
      quantityOnHand: 30,
      quantityAsOf: '2024-01-01',
    });
    expect(out.quantityAsOf).toBe('2024-01-01');
  });

  it('re-stamps today when the quantity changes (a fresh count)', () => {
    const out = formToInput(form({ quantityOnHand: '20' }), {
      quantityOnHand: 30,
      quantityAsOf: '2024-01-01',
    });
    expect(out.quantityOnHand).toBe(20);
    expect(out.quantityAsOf).toBe(today);
  });

  it('clears the count date when tracking is turned off', () => {
    const out = formToInput(form({ quantityOnHand: '' }), {
      quantityOnHand: 30,
      quantityAsOf: '2024-01-01',
    });
    expect(out.quantityOnHand).toBeNull();
    expect(out.quantityAsOf).toBeNull();
  });
});
