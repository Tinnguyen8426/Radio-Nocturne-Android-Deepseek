import React, { useMemo } from 'react';
import { BookOpen, Star } from 'lucide-react';
import { Language, StoryRecord } from '../types';

interface StoryLibraryProps {
  stories: StoryRecord[];
  language: Language;
  onSelect: (story: StoryRecord) => void;
  onToggleFavorite: (story: StoryRecord) => void;
}

const TEXT = {
  vi: {
    title: 'Kho Truyện',
    empty: 'Chưa có truyện lưu.',
    hint: 'Chạm để mở, nhấn sao để yêu thích.',
  },
  en: {
    title: 'Story Vault',
    empty: 'No saved stories yet.',
    hint: 'Tap to open, hit the star to favorite.',
  },
};

const formatDate = (value: string, language: Language) => {
  if (!value) return '';
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const StoryLibrary: React.FC<StoryLibraryProps> = ({
  stories,
  language,
  onSelect,
  onToggleFavorite,
}) => {
  const labels = TEXT[language];
  const fallbackTitle = language === 'vi' ? 'Không tiêu đề' : 'Untitled';
  const sorted = useMemo(() => {
    return [...stories].sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [stories]);

  return (
    <div className="w-full bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950">
        <div className="flex items-center gap-2 text-zinc-300 text-sm font-mono">
          <BookOpen size={16} className="text-red-500" />
          <span>{labels.title}</span>
        </div>
        <div className="text-[11px] uppercase tracking-wide text-zinc-500">
          {labels.hint}
        </div>
      </div>
      <div className="px-4 py-4 flex flex-col gap-3">
        {sorted.length === 0 ? (
          <div className="text-sm text-zinc-500 italic">{labels.empty}</div>
        ) : (
          sorted.map((story) => (
            <div
              key={story.id}
              onClick={() => onSelect(story)}
              className="group flex items-start justify-between gap-4 p-3 rounded border border-zinc-800 bg-zinc-950 hover:border-red-900/60 hover:bg-zinc-900 transition cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-200 font-mono truncate">
                  {story.topic || fallbackTitle}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-zinc-500 mt-1">
                  {story.language === 'vi' ? 'VN' : 'EN'} · {formatDate(story.createdAt, language)}
                </div>
                <div className="text-xs text-zinc-500 mt-2 line-clamp-2">
                  {story.text.slice(0, 160)}...
                </div>
                {story.lastOffset > 0 && story.text.length > 0 && (
                  <div className="mt-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-amber-300">
                    <span className="h-2 w-2 rounded-full bg-amber-400"></span>
                    <span>
                      {language === 'vi' ? 'Đọc dở:' : 'In progress:'}{' '}
                      {Math.min(100, Math.round((story.lastOffset / Math.max(1, story.text.length)) * 100))}%
                    </span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleFavorite(story);
                }}
                className={`p-2 rounded-full border transition ${
                  story.isFavorite
                    ? 'border-yellow-500/60 text-yellow-400 bg-yellow-500/10'
                    : 'border-zinc-700 text-zinc-500 hover:text-yellow-300 hover:border-yellow-500/60'
                }`}
                aria-label="Toggle favorite"
              >
                <Star size={16} fill={story.isFavorite ? 'currentColor' : 'none'} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default StoryLibrary;
