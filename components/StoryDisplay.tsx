import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  const segmentRefs = useRef<Array<HTMLDivElement | null>>([]);
  const activeIndexRef = useRef<number | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const wordCount = useMemo(() => {
    const normalized = text.trim().replace(/\s+/g, ' ');
    if (!normalized) return 0;
    return normalized.split(' ').filter(Boolean).length;
  }, [text]);
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

  useEffect(() => {
    segmentRefs.current = Array(segments.length).fill(null);
    activeIndexRef.current = null;
  }, [segments.length]);

  useEffect(() => {
    if (!segments.length) return;
    const activeIndex = segments.findIndex(
      (segment) => currentOffset >= segment.start && currentOffset < segment.end
    );
    if (activeIndex === -1 || activeIndex === activeIndexRef.current) return;
    activeIndexRef.current = activeIndex;
    const node = segmentRefs.current[activeIndex];
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentOffset, segments]);

  const handleDownload = async () => {
    setExportNote(null);
    try {
      const result = await exportStoryToTxt(text, topic);
      setExportNote(`${exportLabels.saved} ${result.path}`);
    } catch (error) {
      console.error('Export failed:', error);
      setExportNote(exportLabels.failed);
    }
  };

  return (
    <div className="relative w-full bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col h-[65vh] min-h-[480px] max-h-[780px]">
      <div className="bg-gradient-to-r from-black via-zinc-950 to-black p-4 border-b border-zinc-800 flex flex-col gap-2 z-10">
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${isGenerating ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}
            ></div>
            <span className="text-xs uppercase tracking-widest text-zinc-300 font-mono">
              {isGenerating ? 'Đang phát sóng' : 'Nhật ký phát sóng'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] uppercase tracking-widest text-zinc-500 font-mono">
              {counterLabel}: {wordCount.toLocaleString()}
            </span>
            {text.length > 0 && (
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs uppercase tracking-wider rounded transition-colors"
              >
                <Download size={14} />
                {exportLabels.button}
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 font-mono">
          <span className="px-2 py-1 rounded-full bg-red-900/30 border border-red-800 text-red-100 uppercase tracking-wide">
            {topic || (language === 'vi' ? 'Tần số ngẫu nhiên' : 'Untitled broadcast')}
          </span>
          {exportNote && (
            <span className="text-[11px] text-zinc-500 truncate max-w-[320px]">{exportNote}</span>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 p-5 sm:p-6 overflow-y-auto bg-gradient-to-b from-black via-zinc-950 to-black font-mono text-base sm:text-lg leading-7 text-zinc-200 relative scroll-smooth"
      >
        <div className="max-w-3xl mx-auto relative z-10">
          {segments.length === 0 && (
            <span className="text-zinc-700 italic text-center block mt-12">
              {isGenerating ? 'Morgan Hayes đang dệt câu chuyện...' : 'Chưa có tín hiệu phát sóng.'}
            </span>
          )}

          {segments.map((segment, index) => {
            const isActive = currentOffset >= segment.start && currentOffset < segment.end;
            return (
              <div
                key={`${segment.start}-${index}`}
                ref={(node) => {
                  segmentRefs.current[index] = node;
                }}
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
                    mb-4 px-3 py-2 rounded transition-all duration-300 border-l-2 whitespace-pre-wrap break-words cursor-pointer shadow-sm
                    ${isActive ? 'bg-red-950/40 border-red-700 text-red-50 shadow-red-900/20' : 'border-transparent hover:bg-zinc-900/50 hover:border-zinc-700 text-zinc-300'}
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
