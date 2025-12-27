import React from 'react';
import { Play, Plus, X } from 'lucide-react';

interface PauseDialogProps {
  isOpen: boolean;
  storyTitle: string;
  onResume: () => void;
  onCreateNew: () => void;
  onClose: () => void;
  language: 'vi' | 'en';
}

const PauseDialog: React.FC<PauseDialogProps> = ({
  isOpen,
  storyTitle,
  onResume,
  onCreateNew,
  onClose,
  language,
}) => {
  if (!isOpen) return null;

  const t = language === 'vi' ? {
    title: 'Truyện bị dừng',
    message: 'Bạn muốn làm gì tiếp theo?',
    resume: 'Tiếp tục truyện cũ',
    createNew: 'Tạo truyện mới',
    cancel: 'Hủy',
    currentStory: 'Truyện hiện tại:',
  } : {
    title: 'Story Paused',
    message: 'What would you like to do next?',
    resume: 'Resume this story',
    createNew: 'Create new story',
    cancel: 'Cancel',
    currentStory: 'Current story:',
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gradient-to-b from-gray-900 to-black border border-blue-500/30 rounded-lg shadow-2xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="border-b border-blue-500/20 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-cyan-400">{t.title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-cyan-400 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          <p className="text-gray-300">{t.message}</p>

          {storyTitle && (
            <div className="bg-gray-800/50 border border-blue-500/20 rounded p-3">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                {t.currentStory}
              </p>
              <p className="text-cyan-300 font-semibold truncate">{storyTitle}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="border-t border-blue-500/20 px-6 py-4 space-y-3">
          <button
            onClick={onResume}
            className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-2 px-4 rounded transition-colors"
          >
            <Play size={18} />
            {t.resume}
          </button>
          <button
            onClick={onCreateNew}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded transition-colors"
          >
            <Plus size={18} />
            {t.createNew}
          </button>
          <button
            onClick={onClose}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded transition-colors"
          >
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PauseDialog;
