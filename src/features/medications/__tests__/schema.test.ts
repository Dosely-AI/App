import { medicationFormSchema, TIME_RE } from '@/features/medications/schema';

const base = {
  name: 'Ibuprofen',
  rxcui: null,
  strength: '',
  form: '',
  times: ['08:00'],
  daysOfWeek: [] as number[],
};

describe('medicationFormSchema', () => {
  it('accepts a minimal valid medication', () => {
    expect(medicationFormSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a blank name', () => {
    expect(medicationFormSchema.safeParse({ ...base, name: '   ' }).success).toBe(false);
  });

  it('trims the name', () => {
    expect(medicationFormSchema.parse({ ...base, name: '  Aspirin  ' }).name).toBe('Aspirin');
  });

  it('requires at least one dose time', () => {
    expect(medicationFormSchema.safeParse({ ...base, times: [] }).success).toBe(false);
  });

  it('rejects a malformed time', () => {
    expect(medicationFormSchema.safeParse({ ...base, times: ['8:00'] }).success).toBe(false);
  });

  it('rejects out-of-range day numbers', () => {
    expect(medicationFormSchema.safeParse({ ...base, daysOfWeek: [7] }).success).toBe(false);
  });
});

describe('TIME_RE', () => {
  it('matches valid 24h times', () => {
    expect(TIME_RE.test('00:00')).toBe(true);
    expect(TIME_RE.test('23:59')).toBe(true);
  });
  it('rejects invalid times', () => {
    expect(TIME_RE.test('24:00')).toBe(false);
    expect(TIME_RE.test('12:60')).toBe(false);
    expect(TIME_RE.test('8:00')).toBe(false);
  });
});
