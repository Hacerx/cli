/**
 * Tests if a given string matches a wildcard pattern.
 *
 * @param wildcard - The wildcard pattern to match against. Supports '*' for multiple characters
 * and '?' for a single character. Other special regex characters are escaped.
 * @param str - The string to test against the wildcard pattern.
 * @param caseSensitive - Optional boolean flag to specify if the match should be case-sensitive.
 * Defaults to false, making the match case-insensitive.
 * @returns A boolean indicating whether the string matches the wildcard pattern.
 */
export function wildTest(wildcard: string, str: string, caseSensitive?: boolean): boolean {
    const w = wildcard.replace(/[.+^${}()|[\]\\]/g, '\\$&'); // regexp escape
    const re = new RegExp(`^${w.replace(/\*/g, '.*').replace(/\?/g, '.')}$`, caseSensitive ? 'g' : 'gi');
    return re.test(str); // remove last 'i' above to have case sensitive
}