import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FolderOpen, Search, Image, Code, FileCheck, Copy, Check, AlertCircle, ArrowRight, Upload, Download, X, ChevronDown, ChevronRight, FileText, List, Loader2 } from 'lucide-react';
import { analyzeImages, type AnalysisResults, type ReferenceLocation, type ProgressInfo, isSearchableFile, shouldIncludePath } from './lib/analyzer';
import { createMockFileSystem, expectedResults } from './mockData';

function App() {
  const [imageDirHandle, setImageDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [emberDirHandle, setEmberDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<AnalysisResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [browserSupported, setBrowserSupported] = useState(true);
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [excludedPaths, setExcludedPaths] = useState<string[]>(['node_modules', '.git', 'dist', 'tmp', 'coverage']);
  const [includedPackages, setIncludedPackages] = useState<string[]>([]);
  const [reportFilename, setReportFilename] = useState('image-analysis.json');
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [showSearchedFiles, setShowSearchedFiles] = useState(false);
  const [previewFiles, setPreviewFiles] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [searchableFiles, setSearchableFiles] = useState<{ handle: FileSystemFileHandle; path: string }[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const analysisResultsRef = useRef<AnalysisResults | null>(null);

  useEffect(() => {
    if (!('showDirectoryPicker' in window)) {
      setBrowserSupported(false);
      setError('Your browser does not support the File System Access API. Using sample data instead.');
    }

    const loadMockData = async () => {
      try {
        const { imageDir, emberDir } = await createMockFileSystem();
        setImageDirHandle(imageDir);
        setEmberDirHandle(emberDir);
      } catch (err) {
        console.error('Failed to create mock file system:', err);
        setError('Failed to load sample data. Please try refreshing the page.');
      }
    };

    loadMockData();
  }, []);

  const handleDirectorySelect = async (type: 'image' | 'ember') => {
    if (!browserSupported) {
      return;
    }

    try {
      const dirHandle = await window.showDirectoryPicker({
        mode: 'read'
      });
      if (type === 'image') {
        setImageDirHandle(dirHandle);
      } else {
        setEmberDirHandle(dirHandle);
      }
      setError(null);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Directory selection error:', err);
        setError('Failed to select directory. Please try again.');
      }
    }
  };

  const handleSaveResults = () => {
    if (!analysisResultsRef.current) return;
    
    const blob = new Blob([JSON.stringify(analysisResultsRef.current, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = reportFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowSavePrompt(false);
  };

  const handleStopAnalysis = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setAnalyzing(false);
      setProgress(null);
      setError('Analysis was stopped by user.');
    }
  };

  const handlePreviewFiles = async () => {
    if (!emberDirHandle) return;
    
    try {
      setError(null);
      setIsLoadingPreview(true);
      const files: { handle: FileSystemFileHandle; path: string }[] = [];
      
      async function* walkDirectory(dirHandle: FileSystemDirectoryHandle, path = ''): AsyncGenerator<{ handle: FileSystemFileHandle; path: string }> {
        const entries = await dirHandle.entries();
        for await (const [name, handle] of entries) {
          const entryPath = path ? `${path}/${name}` : name;
          
          if (handle.kind === 'directory') {
            if (shouldIncludePath(entryPath, excludedPaths, includedPackages)) {
              yield* walkDirectory(handle as FileSystemDirectoryHandle, entryPath);
            }
          } else if (handle.kind === 'file') {
            if (shouldIncludePath(entryPath, excludedPaths, includedPackages) && isSearchableFile(name)) {
              yield { handle: handle as FileSystemFileHandle, path: entryPath };
            }
          }
        }
      }
      
      for await (const file of walkDirectory(emberDirHandle)) {
        files.push(file);
      }
      
      const sortedFiles = files.sort((a, b) => a.path.localeCompare(b.path));
      setSearchableFiles(sortedFiles);
      setPreviewFiles(sortedFiles.map(f => f.path));
      setShowPreview(true);
    } catch (err) {
      console.error('Error previewing files:', err);
      setError('Failed to generate files preview');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleAnalyze = async () => {
    if (!imageDirHandle || !emberDirHandle) return;
    
    try {
      setAnalyzing(true);
      setError(null);
      setProgress(null);
      
      const controller = new AbortController();
      setAbortController(controller);
      
      const filename = reportFilename.endsWith('.json') ? reportFilename : `${reportFilename}.json`;
      setReportFilename(filename);
      
      const filteredPackages = includedPackages
        .map(pkg => pkg.trim())
        .filter(pkg => pkg !== '');
      
      const filteredExcludedPaths = excludedPaths
        .map(path => path.trim())
        .filter(path => path !== '');

      // If we have preview files, use them directly
      const filesToSearch = searchableFiles.length > 0 ? searchableFiles : null;
      
      const results = await analyzeImages(imageDirHandle, emberDirHandle, {
        excludedPaths: filteredExcludedPaths,
        includedPackages: filteredPackages,
        outputPath: filename,
        signal: controller.signal,
        onProgress: (progressInfo) => {
          setProgress(progressInfo);
        },
        searchableFiles: filesToSearch
      });
      
      setResults(results);
      analysisResultsRef.current = results;
      setShowSavePrompt(true);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Analysis was stopped by user.');
      } else {
        setError(err.message);
      }
    } finally {
      setAnalyzing(false);
      setProgress(null);
      setAbortController(null);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setAnalyzing(true);
      setError(null);
      
      const content = await file.text();
      const uploadedResults = JSON.parse(content) as AnalysisResults;
      
      if (!uploadedResults.referenced || !uploadedResults.unreferenced || !uploadedResults.stats) {
        throw new Error('Invalid analysis results file format');
      }
      
      setResults(uploadedResults);
      
      if (uploadedResults.stats.excludedPaths) {
        setExcludedPaths(uploadedResults.stats.excludedPaths);
      }
      if (uploadedResults.stats.includedPackages) {
        setIncludedPackages(uploadedResults.stats.includedPackages);
      }
    } catch (err: any) {
      setError(`Failed to load analysis results: ${err.message}`);
    } finally {
      setAnalyzing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCopyPath = async (path: string) => {
    try {
      const fullPath = imageDirHandle?.name.includes('images') 
        ? `/images/${path}`
        : path;
      
      await navigator.clipboard.writeText(fullPath);
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 2000);
    } catch (err) {
      console.error('Failed to copy path:', err);
    }
  };

  const handleExcludedPathsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pathsText = e.target.value;
    const paths = pathsText.split(',').map(path => path.trim());
    setExcludedPaths(paths);
  };

  const handleIncludedPackagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const packagesText = e.target.value;
    const packages = packagesText.split(',').map(pkg => pkg.trim());
    setIncludedPackages(packages);
  };

  const CopyButton = ({ path }: { path: string }) => (
    <button
      onClick={() => handleCopyPath(path)}
      className="ml-2 p-1 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
      title="Copy full path"
    >
      {copiedPath === path ? (
        <Check className="w-4 h-4 text-green-500" />
      ) : (
        <Copy className="w-4 h-4" />
      )}
    </button>
  );

  const ReferenceItem = ({ reference }: { reference: ReferenceLocation }) => (
    <li className="text-sm text-green-600 mt-1">
      <div className="flex items-start">
        <ArrowRight className="w-4 h-4 mt-0.5 mr-1 flex-shrink-0" />
        <div>
          <p className="font-medium">{reference.path}</p>
          <p className="text-xs text-green-500">
            Line {reference.line}, Column {reference.column}
          </p>
          <code className="block mt-1 text-xs bg-green-50 p-2 rounded">
            {reference.context}
          </code>
        </div>
      </div>
    </li>
  );

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex items-center">
          <Image className="w-8 h-8 text-indigo-600 mr-3" />
          <h1 className="text-2xl font-bold text-gray-900">Ember Image Analyzer</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          {!browserSupported && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <div className="flex">
                <AlertCircle className="h-5 w-5 text-yellow-400" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">Browser Compatibility Notice</h3>
                  <div className="mt-2 text-sm text-yellow-700">
                    <p>Your browser doesn't support directory selection. Sample data will be used instead.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <div className="flex">
              <FileCheck className="h-5 w-5 text-blue-400" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">Sample Data Available</h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p>Sample directories have been created with test data:</p>
                  <ul className="list-disc ml-5 mt-1">
                    <li>4 sample images (3 referenced, 1 unreferenced)</li>
                    <li>Mock Ember.js project structure</li>
                    <li>Templates and styles with image references</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Images Directory</label>
              <div className="mt-1 flex">
                <input
                  type="text"
                  value={imageDirHandle?.name || ''}
                  readOnly
                  className="flex-1 block w-full rounded-l-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  placeholder="Select images directory"
                />
                <button
                  onClick={() => handleDirectorySelect('image')}
                  disabled={!browserSupported || analyzing}
                  className="inline-flex items-center px-4 py-2 border border-l-0 border-gray-300 rounded-r-md bg-gray-50 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FolderOpen className="w-4 h-4 mr-2" />
                  Browse
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Ember.js Project Directory</label>
              <div className="mt-1 flex">
                <input
                  type="text"
                  value={emberDirHandle?.name || ''}
                  readOnly
                  className="flex-1 block w-full rounded-l-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  placeholder="Select Ember.js project directory"
                />
                <button
                  onClick={() => handleDirectorySelect('ember')}
                  disabled={!browserSupported || analyzing}
                  className="inline-flex items-center px-4 py-2 border border-l-0 border-gray-300 rounded-r-md bg-gray-50 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FolderOpen className="w-4 h-4 mr-2" />
                  Browse
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Excluded Paths</label>
                <div className="mt-1">
                  <input
                    type="text"
                    value={excludedPaths.join(', ')}
                    onChange={handleExcludedPathsChange}
                    disabled={analyzing}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="node_modules, .git, dist, tmp, coverage"
                  />
                  <p className="mt-1 text-xs text-gray-500">Comma-separated list of paths to exclude from search</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Included Packages</label>
                <div className="mt-1">
                  <input
                    type="text"
                    value={includedPackages.join(', ')}
                    onChange={handleIncludedPackagesChange}
                    disabled={analyzing}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="@my-scope/ui-components, some-image-library"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Comma-separated list of node_modules packages to include in search
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Report Filename</label>
              <div className="mt-1">
                <input
                  type="text"
                  value={reportFilename}
                  onChange={(e) => setReportFilename(e.target.value)}
                  disabled={analyzing}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="image-analysis.json"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Name of the analysis report file (will be saved as JSON)
                </p>
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">Error</h3>
                    <div className="mt-2 text-sm text-red-700">{error}</div>
                  </div>
                </div>
              </div>
            )}

            {progress && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Processing: {progress.currentImage}</span>
                  <span>{Math.round(progress.percentComplete)}% complete</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${progress.percentComplete}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>
                    Images: {progress.processedImages} / {progress.totalImages}
                  </span>
                  <span>
                    Files: {progress.processedFiles} / {progress.totalFiles}
                  </span>
                  <span>
                    ETA: {formatTime(progress.estimatedTimeRemaining)}
                  </span>
                </div>
              </div>
            )}

            {/* Preview Files Section */}
            {previewFiles.length > 0 && showPreview && (
              <div className="mt-6 bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-700 flex items-center">
                    <List className="w-4 h-4 mr-2 text-gray-500" />
                    Files to be searched ({previewFiles.length})
                  </h3>
                  <button
                    onClick={() => setShowPreview(false)}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="max-h-60 overflow-y-auto bg-white rounded border border-gray-200 p-2">
                  <ul className="text-xs text-gray-600 space-y-1">
                    {previewFiles.map((file, index) => (
                      <li key={index} className="py-1 px-2 hover:bg-gray-50 rounded">
                        {file}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div className="pt-4 flex gap-4">
              {analyzing ? (
                <button
                  onClick={handleStopAnalysis}
                  className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  <X className="w-4 h-4 mr-2" />
                  Stop Analysis
                </button>
              ) : (
                <>
                  <button
                    onClick={handlePreviewFiles}
                    disabled={!emberDirHandle || analyzing || isLoadingPreview}
                    className="inline-flex justify-center items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors duration-200"
                  >
                    {isLoadingPreview ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <List className="w-4 h-4 mr-2" />
                    )}
                    {isLoadingPreview ? 'Loading...' : 'Preview Files'}
                  </button>
                  <button
                    onClick={handleAnalyze}
                    disabled={!imageDirHandle || !emberDirHandle || analyzing}
                    className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400"
                  >
                    <Search className="w-4 h-4 mr-2" />
                    Analyze Images
                  </button>
                </>
              )}

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".json"
                className="hidden"
              />
              
              <button
                onClick={handleUploadClick}
                disabled={analyzing}
                className="inline-flex justify-center items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                <Upload className="w-4 h-4 mr-2" />
                Load Results
              </button>
            </div>
          </div>

          {/* Save Results Dialog */}
          {showSavePrompt && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Save Analysis Results</h3>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700">
                    Filename
                  </label>
                  <input
                    type="text"
                    value={reportFilename}
                    onChange={(e) => setReportFilename(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  />
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setShowSavePrompt(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveResults}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}

          {results && (
            <div className="mt-8 space-y-6">
              <div className="border-t pt-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-medium text-gray-900">Analysis Results</h2>
                  <div className="text-sm text-gray-500">
                    Completed in {formatTime(results.stats.duration)}
                  </div>
                </div>
                
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Analysis Summary</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-sm text-gray-500">Total Images</div>
                      <div className="text-lg font-medium">{results.stats.totalImages}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Files Scanned</div>
                      <div className="text-lg font-medium">{results.stats.totalFiles}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Referenced</div>
                      <div className="text-lg font-medium text-green-600">{results.referenced.length}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Unreferenced</div>
                      <div className="text-lg font-medium text-red-600">{results.unreferenced.length}</div>
                    </div>
                  </div>
                </div>

                {/* Searched Files Collapsible Section */}
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <button 
                    onClick={() => setShowSearchedFiles(!showSearchedFiles)}
                    className="flex items-center justify-between w-full text-left"
                  >
                    <div className="flex items-center">
                      <FileText className="h-5 w-5 text-blue-500 mr-2" />
                      <h3 className="text-sm font-medium text-gray-700">Files Included in Search</h3>
                    </div>
                    {showSearchedFiles ? (
                      <ChevronDown className="h-5 w-5 text-gray-500" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-gray-500" />
                    )}
                  </button>
                  
                  {showSearchedFiles && (
                    <div className="mt-3 border-t border-gray-200 pt-3">
                      <p className="text-xs text-gray-500 mb-2">
                        Total files searched: {results.stats.searchedFiles?.length || 0}
                      </p>
                      <div className="max-h-60 overflow-y-auto bg-white rounded border border-gray-200 p-2">
                        <ul className="text-xs text-gray-600 space-y-1">
                          {results.stats.searchedFiles?.map((file, index) => (
                            <li key={index} className="py-1 px-2 hover:bg-gray-50 rounded">
                              {file}
                            </li>
                          )) || (
                            <li className="py-1 px-2 italic text-gray-400">
                              No files were searched
                            </li>
                          )}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-green-50 p-4 rounded-lg">
                    <h3 className="text-green-800 font-medium flex items-center">
                      <Code className="w-4 h-4 mr-2" />
                      Referenced Images ({results.referenced.length})
                    </h3>
                    <ul className="mt-3 space-y-4">
                      {results.referenced.map((item, index) => (
                        <li key={index} className="text-sm">
                          <div className="font-medium text-green-700 flex items-center">
                            {item.path}
                            <CopyButton path={item.path} />
                          </div>
                          <ul className="ml-4 mt-2 space-y-2">
                            {item.references?.map((ref, refIndex) => (
                              <ReferenceItem key={refIndex} reference={ref} />
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-red-50 p-4 rounded-lg">
                    <h3 className="text-red-800 font-medium flex items-center">
                      <Image className="w-4 h-4 mr-2" />
                      Unreferenced Images ({results.unreferenced.length})
                    </h3>
                    <ul className="mt-3 space-y-2">
                      {results.unreferenced.map((item, index) => (
                        <li key={index} className="text-sm text-red-700 flex items-center">
                          {item.path}
                          <CopyButton path={item.path} />
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;