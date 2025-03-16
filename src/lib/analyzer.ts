import { BoyerMoore } from './boyer-moore';

// Types
export interface ReferenceLocation {
  path: string;
  line: number;
  column: number;
  context: string;
}

export interface ImageReference {
  path: string;
  references?: ReferenceLocation[];
}

export interface AnalysisResults {
  referenced: ImageReference[];
  unreferenced: ImageReference[];
  stats: {
    totalImages: number;
    totalFiles: number;
    duration: number;
    excludedPaths: string[];
    includedPackages: string[];
    searchedFiles: string[];
  };
}

export interface ProgressInfo {
  currentImage: string;
  processedImages: number;
  totalImages: number;
  processedFiles: number;
  totalFiles: number;
  estimatedTimeRemaining: number;
  percentComplete: number;
  speed: {
    imagesPerSecond: number;
    filesPerSecond: number;
  };
}

// Constants
const DEFAULT_EXCLUDED_PATHS = ['node_modules', '.git', 'dist', 'tmp', 'coverage'];
const SEARCHABLE_FILE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.hbs', '.handlebars', '.scss', '.sass', '.css', '.html'];
const IMAGE_FILE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];

// Utility functions
export function isImageFile(filename: string): boolean {
  return IMAGE_FILE_EXTENSIONS.some(ext => filename.toLowerCase().endsWith(ext));
}

export function isSearchableFile(filename: string): boolean {
  return SEARCHABLE_FILE_EXTENSIONS.some(ext => filename.toLowerCase().endsWith(ext));
}

export function shouldIncludePath(
  path: string,
  excludedPaths: string[] = DEFAULT_EXCLUDED_PATHS,
  includedPackages: string[] = []
): boolean {
  const normalizedPath = path.toLowerCase();
  
  // Check if path contains node_modules
  if (normalizedPath.includes('node_modules')) {
    // Only include if it's in the includedPackages list
    return includedPackages.some(pkg => {
      const trimmedPkg = pkg.trim().toLowerCase();
      return trimmedPkg !== '' && normalizedPath.includes(`node_modules/${trimmedPkg}`);
    });
  }
  
  // Check if path should be excluded
  return !excludedPaths.some(excluded => {
    const trimmedExcluded = excluded.trim().toLowerCase();
    return trimmedExcluded !== '' && normalizedPath.includes(trimmedExcluded);
  });
}

function findLineAndColumn(content: string, index: number): { line: number; column: number; context: string } {
  const lines = content.slice(0, index + 1).split('\n');
  const line = lines.length;
  const column = lines[lines.length - 1].length;
  
  // Get context (the whole line where the match was found)
  const allLines = content.split('\n');
  const context = allLines[line - 1].trim();
  
  return { line, column, context };
}

// Main analyzer class
class ImageAnalyzer {
  private startTime: number;
  private processedImages: number;
  private processedFiles: number;
  private totalProcessedFiles: number;
  private currentImage: string;
  private readonly excludedPaths: string[];
  private readonly includedPackages: string[];
  private readonly onProgress?: (info: ProgressInfo) => void;
  private readonly signal?: AbortSignal;
  private lastProgressUpdate: number;
  private searchedFiles: string[] = [];

  constructor(options: {
    excludedPaths?: string[];
    includedPackages?: string[];
    onProgress?: (info: ProgressInfo) => void;
    signal?: AbortSignal;
  }) {
    this.startTime = Date.now();
    this.processedImages = 0;
    this.processedFiles = 0;
    this.totalProcessedFiles = 0;
    this.currentImage = '';
    this.excludedPaths = options.excludedPaths || DEFAULT_EXCLUDED_PATHS;
    this.includedPackages = options.includedPackages || [];
    this.onProgress = options.onProgress;
    this.signal = options.signal;
    this.lastProgressUpdate = 0;
  }

  private updateProgress(updates: {
    currentImage?: string;
    processedImages?: number;
    processedFiles?: number;
    totalImages: number;
    totalFiles: number;
  }) {
    // Throttle progress updates to avoid UI freezing
    const now = Date.now();
    if (now - this.lastProgressUpdate < 100) {
      return;
    }
    this.lastProgressUpdate = now;

    if (updates.currentImage) {
      this.currentImage = updates.currentImage;
    }
    if (typeof updates.processedImages === 'number') {
      this.processedImages = updates.processedImages;
    }
    if (typeof updates.processedFiles === 'number') {
      this.processedFiles = updates.processedFiles;
      this.totalProcessedFiles = this.processedFiles;
    }

    const elapsed = now - this.startTime;
    const imagesPerSecond = this.processedImages / (elapsed / 1000);
    const filesPerSecond = this.totalProcessedFiles / (elapsed / 1000);
    
    const remainingImages = updates.totalImages - this.processedImages;
    const remainingFiles = (updates.totalFiles * updates.totalImages) - this.totalProcessedFiles;
    
    const estimatedTimeRemaining = Math.max(
      remainingImages / Math.max(imagesPerSecond, 0.001),
      remainingFiles / Math.max(filesPerSecond, 0.001)
    ) * 1000;

    // Calculate overall progress considering both image and file processing
    const totalOperations = updates.totalImages * updates.totalFiles;
    const completedOperations = this.totalProcessedFiles;
    const percentComplete = Math.min(100, Math.max(0, (completedOperations / totalOperations) * 100));

    this.onProgress?.({
      currentImage: this.currentImage,
      processedImages: this.processedImages,
      totalImages: updates.totalImages,
      processedFiles: this.processedFiles,
      totalFiles: updates.totalFiles,
      estimatedTimeRemaining: Number.isFinite(estimatedTimeRemaining) ? estimatedTimeRemaining : 0,
      percentComplete,
      speed: {
        imagesPerSecond: Number.isFinite(imagesPerSecond) ? imagesPerSecond : 0,
        filesPerSecond: Number.isFinite(filesPerSecond) ? filesPerSecond : 0
      }
    });
  }

  private async searchFileForImage(
    fileHandle: FileSystemFileHandle,
    imagePath: string,
    imageName: string
  ): Promise<ReferenceLocation[]> {
    if (this.signal?.aborted) {
      throw new DOMException('Analysis aborted by user', 'AbortError');
    }

    const file = await fileHandle.getFile();
    const content = await file.text();
    
    const searchPatterns = [
      `/images/${imagePath}`,
      `images/${imagePath}`,
      imageName,
      `/${imagePath}`,
      imagePath
    ];

    const references: ReferenceLocation[] = [];
    const foundPositions = new Set<number>();
    
    for (const pattern of searchPatterns) {
      const searcher = new BoyerMoore(pattern);
      const result = searcher.search(content);
      
      if (result.found) {
        for (const pos of result.positions) {
          if (foundPositions.has(pos.index)) {
            continue;
          }
          
          foundPositions.add(pos.index);
          
          const { line, column, context } = findLineAndColumn(content, pos.index);
          references.push({
            path: fileHandle.name,
            line,
            column,
            context
          });
        }
      }
    }

    return references;
  }

  private async* walkDirectory(
    dirHandle: FileSystemDirectoryHandle,
    path = ''
  ): AsyncGenerator<{ handle: FileSystemHandle; path: string; type: 'file' | 'directory' }> {
    try {
      if (this.signal?.aborted) {
        throw new DOMException('Analysis aborted by user', 'AbortError');
      }

      const entries = await dirHandle.entries();
      
      for await (const [name, handle] of entries) {
        if (this.signal?.aborted) {
          throw new DOMException('Analysis aborted by user', 'AbortError');
        }

        const entryPath = path ? `${path}/${name}` : name;
        
        if (handle.kind === 'directory') {
          if (shouldIncludePath(entryPath, this.excludedPaths, this.includedPackages)) {
            yield { handle, path: entryPath, type: 'directory' };
            yield* this.walkDirectory(handle as FileSystemDirectoryHandle, entryPath);
          }
        } else if (handle.kind === 'file') {
          if (shouldIncludePath(entryPath, this.excludedPaths, this.includedPackages)) {
            yield { handle, path: entryPath, type: 'file' };
          }
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
      console.error(`Error walking directory ${path}:`, error);
    }
  }

  async analyze(
    imageDirHandle: FileSystemDirectoryHandle,
    emberDirHandle: FileSystemDirectoryHandle,
    options: {
      searchableFiles?: { handle: FileSystemFileHandle; path: string }[] | null;
    } = {}
  ): Promise<AnalysisResults> {
    this.startTime = Date.now();
    this.processedImages = 0;
    this.processedFiles = 0;
    this.totalProcessedFiles = 0;
    this.currentImage = '';
    this.lastProgressUpdate = 0;
    this.searchedFiles = [];

    if (this.signal?.aborted) {
      throw new DOMException('Analysis aborted by user', 'AbortError');
    }

    const images: { handle: FileSystemFileHandle; path: string }[] = [];
    let searchableFiles = options.searchableFiles || [];

    // Collect image files
    for await (const entry of this.walkDirectory(imageDirHandle)) {
      if (entry.type === 'file' && isImageFile(entry.path)) {
        images.push({
          handle: entry.handle as FileSystemFileHandle,
          path: entry.path
        });
      }
    }

    if (this.signal?.aborted) {
      throw new DOMException('Analysis aborted by user', 'AbortError');
    }

    // If searchableFiles not provided, collect them
    if (!options.searchableFiles) {
      for await (const entry of this.walkDirectory(emberDirHandle)) {
        if (entry.type === 'file' && isSearchableFile(entry.path)) {
          searchableFiles.push({
            handle: entry.handle as FileSystemFileHandle,
            path: entry.path
          });
        }
      }
    }

    // Store searched files paths for reporting
    this.searchedFiles = searchableFiles.map(file => file.path);

    if (this.signal?.aborted) {
      throw new DOMException('Analysis aborted by user', 'AbortError');
    }

    const results: AnalysisResults = {
      referenced: [],
      unreferenced: [],
      stats: {
        totalImages: images.length,
        totalFiles: searchableFiles.length,
        duration: 0,
        excludedPaths: this.excludedPaths,
        includedPackages: this.includedPackages,
        searchedFiles: this.searchedFiles
      }
    };

    this.updateProgress({
      totalImages: images.length,
      totalFiles: searchableFiles.length,
      processedImages: 0,
      processedFiles: 0
    });

    for (let i = 0; i < images.length; i++) {
      if (this.signal?.aborted) {
        throw new DOMException('Analysis aborted by user', 'AbortError');
      }

      const { handle, path } = images[i];
      
      this.updateProgress({
        currentImage: path,
        totalImages: images.length,
        totalFiles: searchableFiles.length,
        processedImages: i
      });

      const references: ReferenceLocation[] = [];
      const imageName = path.split('/').pop()!;
      
      let processedFilesForImage = 0;

      for (const file of searchableFiles) {
        try {
          if (this.signal?.aborted) {
            throw new DOMException('Analysis aborted by user', 'AbortError');
          }

          const fileRefs = await this.searchFileForImage(file.handle, path, imageName);
          
          for (const ref of fileRefs) {
            const isDuplicate = references.some(
              existingRef => 
                existingRef.path === ref.path && 
                existingRef.line === ref.line && 
                existingRef.column === ref.column
            );
            
            if (!isDuplicate) {
              references.push(ref);
            }
          }
          
          processedFilesForImage++;
          this.processedFiles = processedFilesForImage;
          this.totalProcessedFiles = (i * searchableFiles.length) + processedFilesForImage;
          
          this.updateProgress({
            totalImages: images.length,
            totalFiles: searchableFiles.length,
            processedFiles: this.processedFiles
          });
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            throw error;
          }
          console.error(`Error searching file ${file.path} for image ${path}:`, error);
        }
      }

      if (references.length > 0) {
        results.referenced.push({ path, references });
      } else {
        results.unreferenced.push({ path });
      }
      
      this.processedImages = i + 1;
      this.updateProgress({
        totalImages: images.length,
        totalFiles: searchableFiles.length,
        processedImages: this.processedImages,
        processedFiles: searchableFiles.length
      });
    }

    results.stats.duration = Date.now() - this.startTime;
    return results;
  }
}

export async function analyzeImages(
  imageDirHandle: FileSystemDirectoryHandle,
  emberDirHandle: FileSystemDirectoryHandle,
  options: {
    excludedPaths?: string[];
    includedPackages?: string[];
    outputPath?: string;
    onProgress?: (info: ProgressInfo) => void;
    signal?: AbortSignal;
    searchableFiles?: { handle: FileSystemFileHandle; path: string }[] | null;
  } = {}
): Promise<AnalysisResults> {
  const analyzer = new ImageAnalyzer({
    excludedPaths: options.excludedPaths,
    includedPackages: options.includedPackages,
    onProgress: options.onProgress,
    signal: options.signal
  });

  return analyzer.analyze(imageDirHandle, emberDirHandle, {
    searchableFiles: options.searchableFiles
  });
}