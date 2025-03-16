// Optimized Boyer-Moore string search implementation
export class BoyerMoore {
  private badCharTable: Map<string, number>;
  private goodSuffixTable: number[];
  private pattern: string;

  constructor(pattern: string) {
    this.pattern = pattern;
    this.badCharTable = this.buildBadCharTable(pattern);
    this.goodSuffixTable = this.buildGoodSuffixTable(pattern);
  }

  private buildBadCharTable(pattern: string): Map<string, number> {
    const table = new Map<string, number>();
    const patternLength = pattern.length;
    
    // Initialize with default value
    for (let i = 0; i < patternLength - 1; i++) {
      table.set(pattern[i], patternLength - 1 - i);
    }
    
    return table;
  }

  private buildGoodSuffixTable(pattern: string): number[] {
    const m = pattern.length;
    const table = new Array(m).fill(0);
    const suffixes = this.buildSuffixTable(pattern);
    let lastPrefixPosition = m;

    // Case 1: The suffix is a prefix of the pattern
    for (let i = m - 1; i >= 0; i--) {
      if (this.isPrefix(pattern, i + 1)) {
        lastPrefixPosition = i + 1;
      }
      table[m - 1 - i] = lastPrefixPosition - i + m - 1;
    }

    // Case 2: The suffix matches a substring of the pattern
    for (let i = 0; i < m - 1; i++) {
      const slen = suffixes[i];
      const j = m - 1 - slen;
      if (table[j] > m - 1 - i) {
        table[j] = m - 1 - i;
      }
    }

    return table;
  }

  private buildSuffixTable(pattern: string): number[] {
    const m = pattern.length;
    const suffixes = new Array(m).fill(0);
    let f = 0;
    let g = m - 1;
    
    for (let i = m - 2; i >= 0; i--) {
      if (i > g && suffixes[i + m - 1 - f] < i - g) {
        suffixes[i] = suffixes[i + m - 1 - f];
      } else {
        if (i < g) {
          g = i;
        }
        f = i;
        while (g >= 0 && pattern[g] === pattern[g + m - 1 - f]) {
          g--;
        }
        suffixes[i] = f - g;
      }
    }
    
    return suffixes;
  }

  private isPrefix(pattern: string, p: number): boolean {
    const m = pattern.length;
    for (let i = p, j = 0; i < m; i++, j++) {
      if (pattern[i] !== pattern[j]) {
        return false;
      }
    }
    return true;
  }

  search(text: string): { found: boolean; positions: Array<{ index: number; length: number }> } {
    const positions: Array<{ index: number; length: number }> = [];
    const m = this.pattern.length;
    const n = text.length;
    
    if (m === 0 || n === 0) {
      return { found: false, positions: [] };
    }

    let skip: number;
    let i = 0;

    while (i <= n - m) {
      skip = 0;
      for (let j = m - 1; j >= 0; j--) {
        if (this.pattern[j] !== text[i + j]) {
          const badCharSkip = this.badCharTable.get(text[i + j]) || m;
          const goodSuffixSkip = this.goodSuffixTable[m - 1 - j];
          skip = Math.max(1, Math.max(badCharSkip - m + 1 + j, goodSuffixSkip));
          break;
        }
      }
      
      if (skip === 0) {
        positions.push({ index: i, length: m });
        skip = 1; // Ensure we always advance
      }
      
      i += skip;
    }
    
    return { found: positions.length > 0, positions };
  }
}