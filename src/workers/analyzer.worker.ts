// Web Worker for heavy computations
import { BoyerMoore } from '../lib/boyer-moore';

interface SearchRequest {
  content: string;
  searchPatterns: string[];
}

interface SearchResult {
  pattern: string;
  positions: Array<{ index: number; length: number }>;
}

self.onmessage = async (e: MessageEvent<SearchRequest>) => {
  const { content, searchPatterns } = e.data;
  
  const results: SearchResult[] = [];
  
  for (const pattern of searchPatterns) {
    const searcher = new BoyerMoore(pattern);
    const searchResult = searcher.search(content);
    
    if (searchResult.found) {
      results.push({
        pattern,
        positions: searchResult.positions
      });
    }
  }
  
  self.postMessage({ results });
};

// Proper error handling
self.onerror = (error: ErrorEvent) => {
  console.error('Worker error:', error);
  self.postMessage({
    error: {
      message: error.message,
      filename: error.filename,
      lineno: error.lineno,
      colno: error.colno
    }
  });
};