import { describe, it, expect } from 'vitest';
import { mapFieldType } from './object.js';

describe('mapFieldType', () => {
  it.each([
    // strings
    ['string', 'string'],
    ['textarea', 'string'],
    ['reference', 'string'],
    ['id', 'string'],
    ['picklist', 'string'],

    // boolean
    ['boolean', 'boolean'],

    // numbers
    ['int', 'number'],
    ['double', 'number'],
    ['currency', 'number'],
    ['percent', 'number'],
    ['number', 'number'],

    // dates
    ['date', 'Date | string'],
    ['datetime', 'Date | string'],

    // fallback
    ['email', 'any'],
    ['phone', 'any'],
    ['url', 'any'],
    ['multipicklist', 'any'],
    ['unknown_type', 'any'],
  ] as [string, string][])('mapFieldType(%s) → %s', (input, expected) => {
    expect(mapFieldType(input)).toBe(expected);
  });
});
