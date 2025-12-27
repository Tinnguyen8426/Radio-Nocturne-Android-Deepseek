export type Language = 'vi' | 'en';

export enum StoryStatus {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  PAUSED = 'PAUSED',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR',
}

export interface GenerationState {
  status: StoryStatus;
  text: string;
  error?: string;
  topic: string;
}

export interface StoryRecord {
  id: string;
  topic: string;
  title: string;
  language: Language;
  text: string;
  createdAt: string;
  isFavorite: boolean;
  lastOffset: number;
  lastProgressAt?: string;
}

export const GENRE_PROMPTS: Record<Language, string[]> = {
  vi: [
    "Thư gửi từ trạm gác rừng số 4",
    "Bản ghi âm tìm thấy trong xe tai nạn",
    "Email từ đồng nghiệp đã mất tích",
    "Nhật ký của người trực ca đêm",
    "Báo cáo về căn phòng bị niêm phong",
    "Lời nhắn thoại lúc 3 giờ sáng",
  ],
  en: [
    "Letter from Ranger Station 4",
    "Recording found in crashed car",
    "Email from missing colleague",
    "Night shift worker's diary",
    "Report on the sealed room",
    "Voicemail received at 3 AM",
  ]
};
