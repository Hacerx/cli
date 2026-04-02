import { describe, it, expect } from 'vitest';
import { extractTestClassesFromXml } from './test.js';

const singleClass = `<?xml version="1.0" encoding="UTF-8"?>
<ApexTestSuite xmlns="http://soap.sforce.com/2006/04/metadata">
    <testClassName>MyTestClass</testClassName>
</ApexTestSuite>`;

const multipleClasses = `<?xml version="1.0" encoding="UTF-8"?>
<ApexTestSuite xmlns="http://soap.sforce.com/2006/04/metadata">
    <testClassName>ClassA</testClassName>
    <testClassName>ClassB</testClassName>
    <testClassName>ClassC</testClassName>
</ApexTestSuite>`;

const withWhitespace = `<ApexTestSuite>
    <testClassName>  SpacedClass  </testClassName>
</ApexTestSuite>`;

const malformed = `<ApexTestSuite>
    <testClassName>UnclosedTag
</ApexTestSuite>`;

describe('extractTestClassesFromXml', () => {
  it('returns empty array when no testClassName tags are present', () => {
    expect(extractTestClassesFromXml('<ApexTestSuite></ApexTestSuite>')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(extractTestClassesFromXml('')).toEqual([]);
  });

  it('extracts a single class name', () => {
    expect(extractTestClassesFromXml(singleClass)).toEqual(['MyTestClass']);
  });

  it('extracts multiple class names in document order', () => {
    expect(extractTestClassesFromXml(multipleClasses)).toEqual(['ClassA', 'ClassB', 'ClassC']);
  });

  it('preserves whitespace inside tags (does not trim)', () => {
    const result = extractTestClassesFromXml(withWhitespace);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('  SpacedClass  ');
  });

  it('does not match malformed unclosed tags', () => {
    expect(extractTestClassesFromXml(malformed)).toEqual([]);
  });
});
