import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Maximize2, Minimize2, Type, Minus, Plus } from 'lucide-react';
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
  const [fontSize, setFontSize] = useState(18);
  const [isReadingMode, setIsReadingMode] = useState(false);
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
    // Split by sentences for better reading experience
    const sentenceRegex = /[^.!?]+[.!?]+/g;
    const results: Array<{ text: string; start: number; end: number }> = [];
    let match: RegExpExecArray | null;
    let lastIndex = 0;

    while ((match = sentenceRegex.exec(text)) !== null) {
      const content = match[0].trim();
      if (!content.length) continue;
      const start = match.index ?? lastIndex;
      results.push({
        text: content,
        start,
        end: start + content.length,
      });
      lastIndex = start + content.length;
    }

    // If no sentences found, fall back to line-based splitting
    if (results.length === 0) {
      const lineRegex = /[^\n]+/g;
      while ((match = lineRegex.exec(text)) !== null) {
        const content = match[0];
        if (!content.trim().length) continue;
        const start = match.index ?? 0;
        results.push({
          text: content,
          start,
          end: start + content.length,
        });
      }
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

  const progress = text.length > 0 ? Math.min(100, (currentOffset / text.length) * 100) : 0;
  const estimatedReadingTime = Math.ceil(wordCount / 200); // Assuming 200 WPM

  const handleFontSizeChange = (delta: number) => {
    setFontSize((prev) => Math.max(12, Math.min(24, prev + delta)));
  };

  const readingModeContent = (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
        <button
          onClick={() => handleFontSizeChange(-2)}
          className="p-2 bg-zinc-900/80 hover:bg-zinc-800 rounded-full text-zinc-300 transition"
          title={language === 'vi' ? 'Giảm cỡ chữ' : 'Decrease font size'}
        >
          <Minus size={16} />
        </button>
        <span className="text-xs text-zinc-400 font-mono w-12 text-center">{fontSize}px</span>
        <button
          onClick={() => handleFontSizeChange(2)}
          className="p-2 bg-zinc-900/80 hover:bg-zinc-800 rounded-full text-zinc-300 transition"
          title={language === 'vi' ? 'Tăng cỡ chữ' : 'Increase font size'}
        >
          <Plus size={16} />
        </button>
        <button
          onClick={() => setIsReadingMode(false)}
          className="p-2 bg-zinc-900/80 hover:bg-zinc-800 rounded-full text-zinc-300 transition"
          title={language === 'vi' ? 'Thoát chế độ đọc' : 'Exit reading mode'}
        >
          <Minimize2 size={16} />
        </button>
      </div>
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto bg-black p-8 scroll-smooth"
        style={{
          fontFamily: 'Georgia, serif',
          fontSize: `${fontSize}px`,
          lineHeight: 1.8,
        }}
      >
        <div className="max-w-3xl mx-auto text-zinc-100">
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
                  mb-6 px-4 py-3 rounded-lg transition-all duration-500 border-l-4 whitespace-pre-wrap break-words cursor-pointer
                  ${isActive 
                    ? 'bg-red-950/30 border-red-600 text-red-50 shadow-lg shadow-red-900/20 scale-[1.02]' 
                    : 'border-transparent hover:bg-zinc-900/30 text-zinc-300'
                  }
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

  if (isReadingMode && text.length > 0) {
    return readingModeContent;
  }

  return (
    <div className="relative w-full bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col h-[65vh] min-h-[480px] max-h-[780px]">
      <div className="bg-gradient-to-r from-black via-zinc-950 to-black p-4 border-b border-zinc-800 flex flex-col gap-2 z-10">
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${isGenerating ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}
            ></div>
            <span className="text-xs uppercase tracking-widest text-zinc-300 font-mono">
              {isGenerating ? (language === 'vi' ? 'Đang phát sóng' : 'Broadcasting') : (language === 'vi' ? 'Nhật ký phát sóng' : 'Broadcast log')}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] uppercase tracking-widest text-zinc-500 font-mono">
              {counterLabel}: {wordCount.toLocaleString()}
            </span>
            {estimatedReadingTime > 0 && (
              <span className="text-[11px] uppercase tracking-widest text-zinc-500 font-mono">
                {language === 'vi' ? '~' : '~'}{estimatedReadingTime} {language === 'vi' ? 'phút' : 'min'}
              </span>
            )}
            {text.length > 0 && (
              <>
                <button
                  onClick={() => setIsReadingMode(true)}
                  className="flex items-center gap-2 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs uppercase tracking-wider rounded transition-colors"
                  title={language === 'vi' ? 'Chế độ đọc toàn màn hình' : 'Full-screen reading mode'}
                >
                  <Maximize2 size={14} />
                  {language === 'vi' ? 'Đọc' : 'Read'}
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs uppercase tracking-wider rounded transition-colors"
                >
                  <Download size={14} />
                  {exportLabels.button}
                </button>
              </>
            )}
          </div>
        </div>
        {text.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-600 transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono w-12 text-right">{progress.toFixed(0)}%</span>
          </div>
        )}
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
        className="flex-1 p-5 sm:p-6 overflow-y-auto bg-gradient-to-b from-black via-zinc-950 to-black relative scroll-smooth"
        style={{
          fontFamily: 'Georgia, serif',
          fontSize: `${fontSize}px`,
          lineHeight: 1.8,
        }}
      >
        <div className="max-w-3xl mx-auto relative z-10 text-zinc-200">
          {segments.length === 0 && (
            <span className="text-zinc-700 italic text-center block mt-12">
              {isGenerating 
                ? (language === 'vi' ? 'Morgan Hayes đang dệt câu chuyện...' : 'Morgan Hayes is weaving the story...')
                : (language === 'vi' ? 'Chưa có tín hiệu phát sóng.' : 'No broadcast signal yet.')
              }
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
                    mb-5 px-4 py-3 rounded-lg transition-all duration-500 border-l-4 whitespace-pre-wrap break-words cursor-pointer
                    ${isActive 
                      ? 'bg-red-950/30 border-red-600 text-red-50 shadow-lg shadow-red-900/20 scale-[1.01]' 
                      : 'border-transparent hover:bg-zinc-900/30 hover:border-zinc-700 text-zinc-300'
                    }
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
