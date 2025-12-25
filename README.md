<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1fBeB0QM3LmBVcRPyFCesE7PU33AeLwL1

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `VITE_DEEPSEEK_API_KEY` in `.env.local` to your DeepSeek API key
3. Run the app:
   `npm run dev`

## Notes

- In development the Vite dev server proxies `/api/deepseek` directly to DeepSeek, while production builds call `/.netlify/functions/deepseek-proxy` (or whatever you provide via `VITE_DEEPSEEK_BASE_URL`). Override the target with `VITE_DEEPSEEK_BASE_URL` if you host elsewhere.
- Set both `VITE_DEEPSEEK_API_KEY` (for the client build) and `DEEPSEEK_API_KEY` (for the proxy) in your Netlify environment so every request is authenticated.
- If you deploy somewhere else, you’ll need your own proxy endpoint; point `VITE_DEEPSEEK_BASE_URL` at it.
- Story generation may use multiple capped passes to reach the minimum length; you can stop and resume at any time (resume starts a new continuation pass).
- Tune model/length/latency with `VITE_DEEPSEEK_MODEL`, `VITE_DEEPSEEK_MAX_TOKENS`, `VITE_STORY_MIN_WORDS`, `VITE_STORY_MAX_PASSES`, and `VITE_STORY_TIMEOUT_MS`.

## Android (Capacitor)

1. Build the web bundle: `npm run build`
2. Sync native assets: `npx cap sync android`
3. Open Android Studio: `npx cap open android`

You can enter the DeepSeek API key directly inside the app. The key is stored locally on the device.
Background generation and background TTS run as foreground services, so the app will show a persistent notification while active.
Exporting stories writes a `.txt` file into `Documents/RadioNocturne` on the device.

### Release signing (keystore)

Generate a keystore, then create `android/keystore/keystore.properties` based on `android/keystore/keystore.properties.example`.

Windows example (Android Studio bundled JDK):
```
"C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v ^
  -keystore "%CD%\\android\\keystore\\radio-nocturne-release.jks" ^
  -alias radio_nocturne -keyalg RSA -keysize 2048 -validity 10000 ^
  -storepass YOUR_STORE_PASSWORD -keypass YOUR_KEY_PASSWORD ^
  -dname "CN=Radio Nocturne, OU=Dev, O=Radio Nocturne, L=Hanoi, S=HN, C=VN"
```

Then build release from Android Studio (Generate Signed APK/AAB) or via CLI (`gradlew assembleRelease` / `gradlew bundleRelease`).
