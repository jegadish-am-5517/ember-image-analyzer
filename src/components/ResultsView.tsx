import React from 'react';
import { AnalysisResults, ReferenceLocation } from '../lib/analyzer';
import { Code, Copy, Check, Image, ArrowRight } from 'lucide-react';

interface ResultsViewProps {
  results: AnalysisResults;
}

export function ResultsView({ results }: ResultsViewProps) {
  const [copiedPath, setCopiedPath] = React.useState<string | null>(null);

  const handleCopyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 2000);
    } catch (err) {
      console.error('Failed to copy path:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Images"
          value={results.stats.totalImages}
          icon={<Image className="w-5 h-5 text-indigo-600" />}
        />
        <SummaryCard
          title="Referenced"
          value={results.referenced.length}
          icon={<Code className="w-5 h-5 text-green-600" />}
          className="bg-green-50"
        />
        <SummaryCard
          title="Unreferenced"
          value={results.unreferenced.length}
          icon={<Image className="w-5 h-5 text-red-600" />}
          className="bg-red-50"
        />
        <SummaryCard
          title="Files Scanned"
          value={results.stats.totalFiles}
          icon={<FileText className="w-5 h-5 text-blue-600" />}
        />
      </div>

      {/* Results Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Referenced Images */}
        <div className="bg-white rounded-lg shadow-sm border border-green-100">
          <div className="p-4 border-b border-green-100 bg-green-50">
            <h3 className="text-lg font-medium text-green-900">
              Referenced Images
            </h3>
          </div>
          <div className="p-4 space-y-4">
            {results.referenced.map((item, index) => (
              <ReferencedItem
                key={index}
                item={item}
                onCopy={handleCopyPath}
                copiedPath={copiedPath}
              />
            ))}
          </div>
        </div>

        {/* Unreferenced Images */}
        <div className="bg-white rounded-lg shadow-sm border border-red-100">
          <div className="p-4 border-b border-red-100 bg-red-50">
            <h3 className="text-lg font-medium text-red-900">
              Unreferenced Images
            </h3>
          </div>
          <div className="p-4 space-y-2">
            {results.unreferenced.map((item, index) => (
              <UnreferencedItem
                key={index}
                item={item}
                onCopy={handleCopyPath}
                copiedPath={copiedPath}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ... (Component implementations continue)