<div align="center">
  <img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Radio Nocturne 📻

Một ứng dụng tạo truyện ngụ ngôn đêm khuya với lời kể sống động và giao diện phát thanh cổ điển.

## 🎯 Mục Tiêu Dự Án

Tạo ra một trải nghiệm kể chuyện điện ảnh, luôn hoạt động giống như đang điều chỉnh đến một đài phát thanh nửa đêm bí ẩn. Ứng dụng tập trung vào:
- Truyện dài đầy khí quyển 
- Streaming thời gian thực
- Nghe rảnh tay với TTS nền

## ✨ Tính Năng Nổi Bật

### 🤖 Tạo Truyện Thông Minh
- Tích hợp DeepSeek API để tạo truyện tự động
- Multi-pass streaming để tạo nội dung liên tục
- Tùy chỉnh độ dài và thể loại truyện

### 🔊 Trải Nghiệm Âm Thanh
- Trình phát TTS trực tiếp (web + Android background service)
- Hỗ trợ nghe nền trên Android với thông báo liên tục
- Audio visualizer cho trải nghiệm trực quan

### 📚 Quản Lý Thư Viện
- Lưu trữ truyện đã tạo
- Danh sách yêu thích
- Xuất truyện ra file TXT
- Tìm kiếm và lọc truyện

### 📱 Giao Diện Di Động
- Thiết kế mobile-first
- UI lấy cảm hứng từ radio analog
- Tối ưu cho trải nghiệm đêm khuya

### 🔄 Chức Năng Nền
- Tạo truyện và phát TTS trên nền Android
- Persistent notifications
- Tự động lưu tiến trình

## 🛠 Tech Stack

### Frontend
- **React 19** - UI framework
- **Vite** - Build tool và dev server
- **TypeScript** - Type safety
- **Lucide React** - Icon library

### Mobile
- **Capacitor 8** - Cross-platform mobile framework
- **Android Native** - Background services và notifications

### Backend & API
- **DeepSeek API** - Story generation
- **Netlify Functions** - API proxy cho production
- **Google GenAI** - AI integration

### Storage
- **Capacitor Preferences** - Local storage
- **Capacitor Filesystem** - File management
- **Capacitor SQLite** - Local database

## 🚀 Bắt Đầu (Web)

### Yêu Cầu
- Node.js (LTS)
- npm hoặc yarn

### Cài Đặt

1. **Clone repository**
   ```bash
   git clone <repository-url>
   cd Radio-Nocturne-feature-deepseek-api
   ```

2. **Cài đặt dependencies**
   ```bash
   npm install
   ```

3. **Cấu hình môi trường**
   ```bash
   # Tạo file .env.local
   touch .env.local
   ```
   Thêm nội dung sau vào `.env.local`:
   ```env
   VITE_DEEPSEEK_API_KEY=your_api_key_here
   VITE_DEEPSEEK_BASE_URL=https://api.deepseek.com
   VITE_DEEPSEEK_MODEL=deepseek-chat
   VITE_DEEPSEEK_MAX_TOKENS=4000
   VITE_STORY_MIN_WORDS=500
   VITE_STORY_HARD_MAX_WORDS=2000
   VITE_STORY_MAX_PASSES=3
   VITE_STORY_TIMEOUT_MS=30000
   ```

4. **Khởi động dev server**
   ```bash
   npm run dev
   ```

5. **Mở browser**
   Truy cập `http://localhost:5173`

## 📱 Build Android

### Yêu Cầu
- Android Studio
- Java JDK 17+
- Android SDK (API level 33+)

### Các Bước

1. **Build web assets**
   ```bash
   npm run build
   ```

2. **Sync với native project**
   ```bash
   npx cap sync android
   ```

3. **Mở Android Studio**
   ```bash
   npx cap open android
   ```

4. **Build và run từ Android Studio**

### Lưu Ý Android
- Background generation và TTS chạy như foreground services
- Hiển thị persistent notification khi chạy nền
- Stories được lưu vào `Documents/RadioNocturne`
- Yêu cầu permissions: Storage, Notifications, Background

## ⚙️ Environment Variables

### Bắt Buộc
- `VITE_DEEPSEEK_API_KEY` - API key cho DeepSeek

### Tùy Chọn
- `VITE_DEEPSEEK_BASE_URL` - Base URL cho API (default: https://api.deepseek.com)
- `VITE_DEEPSEEK_MODEL` - Model name (default: deepseek-chat)
- `VITE_DEEPSEEK_MAX_TOKENS` - Max tokens per request (default: 4000)

### Cấu Hình Story
- `VITE_STORY_MIN_WORDS` - Số từ tối thiểu (default: 500)
- `VITE_STORY_HARD_MAX_WORDS` - Số từ tối đa (default: 2000)
- `VITE_STORY_MAX_PASSES` - Số lần tạo lại (default: 3)
- `VITE_STORY_TIMEOUT_MS` - Timeout per pass (default: 30000)

## 🚀 Deployment

### Web (Netlify)

1. **Build cho production**
   ```bash
   npm run build
   ```

2. **Deploy**
   - Push code sẽ trigger auto-deploy qua GitHub Actions
   Hoặc manual deploy qua Netlify dashboard

### Environment Variables cho Production
- `VITE_DEEPSEEK_API_KEY` - Client-side API key
- `DEEPSEEK_API_KEY` - Server-side API key (cho proxy)
- `VITE_DEEPSEEK_BASE_URL` - Proxy endpoint URL

### Custom Hosting
Nếu host ở nơi khác, cấu hình `VITE_DEEPSEEK_BASE_URL` pointing đến proxy endpoint của bạn.

## 📁 Cấu Trúc Project

```
├── components/          # React components
│   ├── AudioVisualizer.tsx
│   ├── PauseDialog.tsx
│   ├── StoryDisplay.tsx
│   └── StoryLibrary.tsx
├── services/           # Business logic
│   ├── apiKeyStore.ts
│   ├── backgroundRunner.ts
│   ├── backgroundStory.ts
│   └── backgroundTts.ts
├── utils/              # Utility functions
├── android/            # Android native code
├── netlify/            # Serverless functions
└── scripts/            # Build scripts
```

## 🔧 Development Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run type-check   # TypeScript type checking
```

## 🐛 Troubleshooting

### Common Issues

1. **API Key không hoạt động**
   - Kiểm tra API key có hợp lệ không
   - Đảm bảo environment variables được set đúng

2. **Android build lỗi**
   - Kiểm tra Android SDK và JDK version
   - Run `npx cap sync android` sau khi thay đổi code

3. **Background service không hoạt động**
   - Kiểm tra permissions trong Android settings
   - Đảm bảo app có notification permissions

## 🤝 Contributing

1. Fork repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- [DeepSeek API Documentation](https://platform.deepseek.com/)
- [Capacitor Documentation](https://capacitorjs.com/)
- [React Documentation](https://react.dev/)
