<div align="center">
  <img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Radio Nocturne

Late-night radio fiction generator with immersive narration and a vintage broadcast UI.

## Project Goal

Create a cinematic, always-on storytelling experience that feels like tuning into a haunted midnight station.
The app focuses on long-form, atmospheric stories, real-time streaming, and hands-free listening with background TTS.

## Key Features

- DeepSeek story generation with multi-pass streaming
- Live TTS player (web + Android background service)
- Story library with favorites and export to TXT
- Mobile-first UI inspired by analog radio aesthetics
- Background generation and playback with persistent notifications on Android

## Tech Stack

- React + Vite
- Capacitor (Android)
- DeepSeek API (via direct client key or proxy)

## Getting Started (Web)

Prerequisites: Node.js (LTS)

1. Install dependencies:
   `npm install`
2. Create `.env.local` and set:
   `VITE_DEEPSEEK_API_KEY=your_key_here`
3. Start dev server:
   `npm run dev`

## Environment Variables

- `VITE_DEEPSEEK_API_KEY` (client key for local dev)
- `VITE_DEEPSEEK_BASE_URL` (optional proxy base URL)
- `VITE_DEEPSEEK_MODEL`
- `VITE_DEEPSEEK_MAX_TOKENS`
- `VITE_STORY_MIN_WORDS`
- `VITE_STORY_HARD_MAX_WORDS`
- `VITE_STORY_MAX_PASSES`
- `VITE_STORY_TIMEOUT_MS`

## Build and Preview

- `npm run build`
- `npm run preview`

## Android (Capacitor)

1. Build web assets: `npm run build`
2. Sync native assets: `npx cap sync android`
3. Open Android Studio: `npx cap open android`

Notes:
- Background generation and TTS run as foreground services and show a persistent notification.
- Exported stories are saved to `Documents/RadioNocturne`.

## Deployment Notes

In production, requests can go through `/.netlify/functions/deepseek-proxy`.
Set both `VITE_DEEPSEEK_API_KEY` (client build) and `DEEPSEEK_API_KEY` (proxy) in your deploy environment.
If you host elsewhere, point `VITE_DEEPSEEK_BASE_URL` to your proxy endpoint.
