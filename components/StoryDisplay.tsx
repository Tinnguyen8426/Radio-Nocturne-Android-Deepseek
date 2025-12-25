import React, { useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { Language } from '../types';
import { exportStoryToTxt } from '../services/storyExport';

interface StoryDisplayProps {
  text: string;
  isGenerating: boolean;
  topic: string;
  language: Language;
  currentOffset?: number;
  onJumpRequest?: (offset: number) => void;
}

const StoryDisplay: React.FC<StoryDisplayProps> = ({ 
  text, 
  isGenerating, 
  topic,
  language,
  currentOffset = 0,
  onJumpRequest,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const wordCount = useMemo(() => {
    const normalized = text.trim().replace(/\s+/g, ' ');
    if (!normalized) return 0;
    return normalized.split(' ').filter(Boolean).length;
  }, [text]);
  const minWords = Number(import.meta.env.VITE_STORY_MIN_WORDS || 6500);
  const hardMaxWords = Number(import.meta.env.VITE_STORY_HARD_MAX_WORDS || 8000);
  const counterLabel = language === 'vi' ? 'TỪ' : 'WORDS';
  const exportLabels =
    language === 'vi'
      ? {
          button: 'Xuất .TXT',
          saved: 'Đã lưu:',
          failed: 'Không thể xuất file.',
        }
      : {
          button: 'Export .TXT',
          saved: 'Saved:',
          failed: 'Export failed.',
        };

  const segments = useMemo(() => {
    const regex = /[^\n]+/g;
    const results: Array<{ text: string; start: number; end: number }> = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const content = match[0];
      if (!content.trim().length) continue;
      const start = match.index ?? 0;
      results.push({
        text: content,
        start,
        end: start + content.length,
      });
    }

    return results;
  }, [text]);

  const handleDownload = async () => {
    setExportNote(null);
    try {
      const result = await exportStoryToTxt(text, topic);
      setExportNote(`${exportLabels.saved} ${result.path}`);
    } catch (error) {
      console.error("Export failed:", error);
      setExportNote(exportLabels.failed);
    }
  };

  return (
    <div className="relative w-full bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl shadow-black/50 overflow-hidden flex flex-col h-[500px] lg:h-[650px]">
      {/* Header */}
      <div className="bg-zinc-950 p-4 border-b border-zinc-800 flex justify-between items-center z-10">
        <div className="flex items-center gap-2">
           <div className={`w-3 h-3 rounded-full ${isGenerating ? 'bg-red-500 animate-pulse' : 'bg-zinc-600'}`}></div>
           <span className="text-xs uppercase tracking-widest text-zinc-400 font-mono">
             {isGenerating ? 'RECEIVING TRANSMISSION...' : 'TRANSMISSION LOG'}
           </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] uppercase tracking-widest text-zinc-500 font-mono">
            {counterLabel}: {wordCount.toLocaleString()}
          </span>
          {exportNote && (
            <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-mono truncate max-w-[240px]">
              {exportNote}
            </span>
          )}
          {text.length > 0 && (
            <button 
              onClick={handleDownload}
              className="flex items-center gap-2 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs uppercase tracking-wider rounded transition-colors"
            >
              <Download size={14} />
              {exportLabels.button}
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div 
        ref={containerRef}
        className="flex-1 p-8 overflow-y-auto bg-black bg-opacity-95 font-mono text-sm leading-relaxed text-zinc-300 relative scroll-smooth"
      >
         {/* CRT Effect Overlay inside container */}
         <div className="fixed inset-0 pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-overlay z-0"></div>
         
         <div className="max-w-3xl mx-auto relative z-10">
            {segments.length === 0 && (
              <span className="text-zinc-700 italic text-center block mt-20">Waiting for signal...</span>
            )}

            {segments.map((segment, index) => {
              const isActive = currentOffset >= segment.start && currentOffset < segment.end;
              return (
                <div 
                  key={`${segment.start}-${index}`}
                  onDoubleClick={(event) => {
                    if (!onJumpRequest) return;
                    const selection = window.getSelection();
                    let offsetInside = 0;
                    if (selection && selection.rangeCount > 0) {
                      const range = selection.getRangeAt(0);
                      const preRange = range.cloneRange();
                      preRange.selectNodeContents(event.currentTarget);
                      preRange.setEnd(range.startContainer, range.startOffset);
                      offsetInside = preRange.toString().length;
                    } else {
                      offsetInside = Math.floor(segment.text.length / 2);
                    }
                    const absolute = segment.start + Math.min(offsetInside, segment.text.length);
                    onJumpRequest(absolute);
                  }}
                  className={`
                    mb-4 px-3 py-2 rounded transition-all duration-300 border-l-2 whitespace-pre-wrap break-words cursor-pointer
                    ${isActive ? 'bg-red-950/30 border-red-800 text-red-100 shadow-inner' : 'border-transparent hover:bg-zinc-900/50 hover:border-zinc-700 text-zinc-400'}
                  `}
                >
                  {segment.text}
                </div>
              );
            })}
         </div>
      </div>
    </div>
  );
};

export default StoryDisplay;
