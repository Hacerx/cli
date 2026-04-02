import { describe, it, expect } from 'vitest';
import { wildTest } from './strings.js';

// wildTest(wildcard, str, caseSensitive?)
// caseSensitive defaults to undefined (falsy) → regex uses 'gi' → case-insensitive by default
// caseSensitive=true → regex uses 'g' → case-sensitive

describe('wildTest', () => {
  it.each([
    // [wildcard, str, caseSensitive, expected, label]
    ['Foo', 'Foo', undefined, true, 'exact match same case'],
    ['foo', 'Foo', undefined, true, 'case-insensitive by default'],
    ['foo', 'Foo', false, true, 'case-insensitive when caseSensitive=false'],
    ['foo', 'Foo', true, false, 'case-sensitive when caseSensitive=true'],
    ['FOO', 'foo', true, false, 'case-sensitive uppercase vs lowercase'],
    ['FOO', 'foo', undefined, true, 'case-insensitive uppercase vs lowercase'],

    // * wildcard
    ['Foo*', 'FooBar', undefined, true, '* matches suffix'],
    ['*Bar', 'FooBar', undefined, true, '* matches prefix'],
    ['Foo*Baz', 'FooAnyBaz', undefined, true, '* matches middle'],
    ['Foo*', 'BarBaz', undefined, false, '* no match'],
    ['*', 'anything', undefined, true, '* alone matches anything'],
    ['*', '', undefined, true, '* matches empty string'],

    // ? wildcard
    ['Fo?', 'Foo', undefined, true, '? matches single char'],
    ['Fo?', 'Fooo', undefined, false, '? does not match multiple chars'],

    // literal dots (escaped, not regex wildcards)
    ['Foo..Bar', 'Foo..Bar', undefined, true, '.. matches literal two dots'],
    ['Foo..Bar', 'FooXBar', undefined, false, '.. does not match non-dot char'],

    // edge cases
    ['', '', undefined, true, 'empty pattern matches empty string'],
    ['abc', '', undefined, false, 'non-empty pattern does not match empty string'],
  ] as [string, string, boolean | undefined, boolean, string][])(
    '%s vs "%s" (caseSensitive=%s) → %s — %s',
    (wildcard, str, caseSensitive, expected) => {
      expect(wildTest(wildcard, str, caseSensitive)).toBe(expected);
    }
  );
});
