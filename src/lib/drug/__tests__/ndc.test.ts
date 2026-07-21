import {
  candidatesFromBarcode,
  extractProduct,
  ndcCandidates,
  ndcDigitsFromBarcode,
} from '../ndc';

describe('ndcDigitsFromBarcode', () => {
  it('extracts the NDC from a UPC-A drug barcode', () => {
    // 3 + 0093715401 + check digit
    expect(ndcDigitsFromBarcode('300937154016')).toBe('0093715401');
  });

  it('unwraps an EAN-13 that contains a UPC-A', () => {
    expect(ndcDigitsFromBarcode('0300937154016')).toBe('0093715401');
  });

  it('ignores spaces and stray characters from the scanner', () => {
    expect(ndcDigitsFromBarcode(' 3 0093-7154 016\n')).toBe('0093715401');
  });

  it('accepts a bare 10-digit NDC', () => {
    expect(ndcDigitsFromBarcode('0093715401')).toBe('0093715401');
  });

  it('truncates an 11-digit NDC to its 10-digit core', () => {
    expect(ndcDigitsFromBarcode('00937154011')).toBe('0093715401');
  });

  it('rejects a UPC-A that is not a drug code (system digit != 3)', () => {
    expect(ndcDigitsFromBarcode('012345678905')).toBeNull();
  });

  it('rejects codes of an unusable length', () => {
    expect(ndcDigitsFromBarcode('12345')).toBeNull();
    expect(ndcDigitsFromBarcode('')).toBeNull();
  });
});

describe('ndcCandidates', () => {
  it('produces all three valid segmentations', () => {
    expect(ndcCandidates('0093715401')).toEqual([
      '0093-7154-01', // 4-4-2
      '00937-154-01', // 5-3-2
      '00937-1540-1', // 5-4-1
    ]);
  });

  it('returns nothing for a non-10-digit input', () => {
    expect(ndcCandidates('123')).toEqual([]);
    expect(ndcCandidates('abcdefghij')).toEqual([]);
  });
});

describe('candidatesFromBarcode', () => {
  it('goes from scanned barcode to candidate NDCs', () => {
    expect(candidatesFromBarcode('300937154016')).toHaveLength(3);
  });

  it('is empty for a non-drug barcode', () => {
    expect(candidatesFromBarcode('012345678905')).toEqual([]);
  });
});

describe('extractProduct', () => {
  it('prefers the brand name and title-cases FDA text', () => {
    const p = extractProduct({
      brand_name: 'LIPITOR',
      generic_name: 'ATORVASTATIN CALCIUM',
      dosage_form: 'TABLET, FILM COATED',
      labeler_name: 'PARKE-DAVIS',
      product_ndc: '0071-0155',
      active_ingredients: [{ name: 'ATORVASTATIN', strength: '10 mg/1' }],
    });
    expect(p).toEqual({
      name: 'Lipitor',
      brandName: 'Lipitor',
      genericName: 'Atorvastatin Calcium',
      strength: '10 mg/1',
      form: 'Tablet, Film Coated',
      labeler: 'Parke-Davis',
      productNdc: '0071-0155',
    });
  });

  it('falls back to the generic name when there is no brand', () => {
    const p = extractProduct({ generic_name: 'IBUPROFEN' });
    expect(p?.name).toBe('Ibuprofen');
    expect(p?.brandName).toBeNull();
  });

  it('joins the strengths of a multi-ingredient product', () => {
    const p = extractProduct({
      generic_name: 'AMLODIPINE AND VALSARTAN',
      active_ingredients: [
        { name: 'AMLODIPINE', strength: '5 mg/1' },
        { name: 'VALSARTAN', strength: '160 mg/1' },
      ],
    });
    expect(p?.strength).toBe('5 mg/1 / 160 mg/1');
  });

  it('returns null when the record has no usable name', () => {
    expect(extractProduct({ dosage_form: 'TABLET' })).toBeNull();
  });

  it('leaves strength null when no ingredient lists one', () => {
    const p = extractProduct({ generic_name: 'ASPIRIN', active_ingredients: [{ name: 'ASPIRIN' }] });
    expect(p?.strength).toBeNull();
  });
});
