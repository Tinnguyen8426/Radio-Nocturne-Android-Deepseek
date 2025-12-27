# GitHub Actions Build Workflows for Radio Nocturne

Hai workflows GitHub Actions đã được tạo để tự động hóa quá trình build APK cho dự án.

## 📋 Workflows có sẵn

### 1. **build-apk.yml** - Build thường xuyên (Debug/Release)
- Tự động chạy trên:
  - Push đến `main`, `develop`, hoặc branch `feature/**`
  - Pull request đến `main` hoặc `develop`
  - Thủ công (manual dispatch)

**Build Types:**
- **Debug**: Build mặc định (tốc độ nhanh, dùng để test)
- **Release**: Build signed release (cần keystore)

### 2. **build-release.yml** - Build Release chính thức
- Tự động chạy khi push tag `v*` (e.g., `v1.0.0`, `v1.1.0`)
- Tạo GitHub Release với APK và AAB files
- Có thể chạy thủ công

---

## 🔑 Cấu hình bắt buộc (GitHub Secrets)

### Cho Build thường xuyên:
```
VITE_DEEPSEEK_BASE_URL      (tuỳ chọn) - Base URL của DeepSeek API
VITE_DEEPSEEK_MAX_TOKENS    (tuỳ chọn) - Max tokens cho DeepSeek
VITE_STORY_TEMPERATURE      (tuỳ chọn) - Temperature cho story generation
```

### Cho Release Build (bắt buộc):
```
KEYSTORE_FILE               - File keystore (base64 encoded)
KEYSTORE_PASSWORD           - Mật khẩu keystore
KEY_ALIAS                   - Alias của key trong keystore
KEY_PASSWORD                - Mật khẩu của key
```

---

## 📝 Cách cấu hình Secrets trên GitHub

1. Truy cập repo trên GitHub → **Settings**
2. Chọn **Secrets and variables** → **Actions**
3. Nhấn **New repository secret**
4. Thêm từng secret:

### 1. Tạo keystore (nếu chưa có)

**Tạo keystore file:**
```bash
keytool -genkey -v -keystore radio-nocturne.jks -keyalg RSA -keysize 2048 -validity 10000 -alias radio-nocturne
```

**Encode keystore thành base64:**
```bash
# Windows PowerShell
certutil -encode radio-nocturne.jks keystore.txt
# Sau đó copy nội dung từ keystore.txt (bỏ dòng đầu và cuối)

# Linux/Mac
base64 -i radio-nocturne.jks
```

**Lấy thông tin từ keystore:**
```bash
keytool -list -v -keystore radio-nocturne.jks
# Nhập mật khẩu keystore
# Tìm: Alias name, Owner, Valid dates, ...
```

### 2. Thêm Secrets vào GitHub

| Secret Name | Giá trị |
|-------------|--------|
| `KEYSTORE_FILE` | Output base64 của keystore.jks |
| `KEYSTORE_PASSWORD` | Mật khẩu khi tạo keystore |
| `KEY_ALIAS` | Alias name (e.g., `radio-nocturne`) |
| `KEY_PASSWORD` | Mật khẩu key (thường giống keystore password) |

---

## 🚀 Cách sử dụng

### 1. **Build Debug tự động (mỗi push)**
Khi bạn push code lên `main`, `develop` hoặc branch `feature/**`:
- Workflow tự động chạy
- Build Debug APK
- APK có sẵn để download trong **Actions** tab

### 2. **Build Debug thủ công**
```
Trên GitHub:
1. Vào **Actions** tab
2. Chọn **Build APK** workflow
3. Nhấn **Run workflow**
4. Chọn **debug** trong Build type
5. Nhấn **Run workflow**
```

### 3. **Build Release thủ công**
```
Trên GitHub:
1. Vào **Actions** tab
2. Chọn **Build APK** workflow
3. Nhấn **Run workflow**
4. Chọn **release** trong Build type
5. Nhấn **Run workflow**
```

### 4. **Build Release chính thức (tự động)**
```
Trên local hoặc GitHub Web:
1. Tạo tag: git tag v1.0.0
2. Push tag: git push origin v1.0.0
3. Workflow tự động chạy
4. Release được tạo tự động trên GitHub
5. APK + AAB được upload vào Release
```

---

## 📦 Output Files

### Debug Build:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

### Release Build:
```
android/app/build/outputs/apk/release/app-release.apk
android/app/build/outputs/bundle/release/app-release.aab
```

Tất cả files được lưu trong **Actions artifacts** (có sẵn 30 ngày).

---

## 🔍 Kiểm tra Build Status

1. Vào repo → **Actions** tab
2. Chọn workflow bạn muốn xem
3. Xem log chi tiết nếu build failed

---

## 🐛 Troubleshooting

### Build fail "Type check failed"
```bash
# Chạy type check locally
npm run type-check

# Fix lỗi TypeScript
npm run type-check -- --noEmit
```

### Build fail "Cannot find module"
```bash
# Cập nhật dependencies
npm ci
```

### Keystore error
- Kiểm tra `KEYSTORE_FILE` base64 đã decode đúng chưa
- Kiểm tra `KEY_ALIAS` và passwords có đúng không
- Thử encode lại keystore

### Build fail khi build gradle
```bash
# Clear gradle cache
cd android
./gradlew clean
./gradlew assembleDebug
```

---

## 📋 Checklist trước lần build đầu tiên

- [ ] Tạo keystore file (nếu release build)
- [ ] Encode keystore thành base64
- [ ] Thêm tất cả secrets vào GitHub
- [ ] Kiểm tra `capacitor.config.ts` có appId đúng không
- [ ] Kiểm tra `package.json` version
- [ ] Chạy `npm run type-check` locally để chắc chắn
- [ ] Chạy `npm run build` để chắc chắn web build OK

---

## 💡 Tips

1. **Tạo release notes**: Khi push tag, GitHub tự động tạo release, bạn có thể edit release notes
2. **Versioning**: Dùng semantic versioning (v1.0.0, v1.0.1, v2.0.0, ...)
3. **Debug trước**: Luôn chạy debug build trước khi release
4. **Keep secrets safe**: Không bao giờ commit keystore hoặc secrets files

---

## 📚 Tài liệu liên quan

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Android Gradle Build Documentation](https://developer.android.com/build)
- [Capacitor Android Build Guide](https://capacitorjs.com/docs/android)
- [Keystore Creation Guide](https://developer.android.com/studio/publish/app-signing)
