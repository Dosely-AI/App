import { prefillFrom } from '../scan-prefill';

describe('prefillFrom (scanner → form)', () => {
  it('is empty when nothing was scanned', () => {
    expect(prefillFrom({})).toEqual({});
  });

  it('carries across the scanned fields, trimmed', () => {
    expect(
      prefillFrom({ name: '  Lipitor ', strength: '10 mg', form: 'tablet', quantityOnHand: '30' }),
    ).toEqual({ name: 'Lipitor', strength: '10 mg', form: 'tablet', quantityOnHand: '30' });
  });

  it('ignores blank and whitespace-only values', () => {
    expect(prefillFrom({ name: 'Aspirin', strength: '   ', form: '' })).toEqual({ name: 'Aspirin' });
  });

  it('accepts well-formed suggested times', () => {
    expect(prefillFrom({ times: '08:00,20:00' }).times).toEqual(['08:00', '20:00']);
  });

  it('drops malformed times rather than passing them to the form', () => {
    // "25:00" and "8:00" would both fail schema validation downstream.
    expect(prefillFrom({ times: '08:00,25:00,8:00,banana' }).times).toEqual(['08:00']);
  });

  it('omits times entirely when none survive validation', () => {
    expect(prefillFrom({ times: 'nope' }).times).toBeUndefined();
  });
});
