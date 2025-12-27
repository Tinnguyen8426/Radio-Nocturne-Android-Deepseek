# 🚀 GitHub Actions CI/CD - Quick Start

Hai workflows GitHub Actions đã được thiết lập để tự động build APK cho dự án **Radio Nocturne**.

## ⚡ Quick Start (5 phút)

### 1️⃣ **Tạo Keystore** (chỉ lần đầu)

**Windows:**
```bash
.\scripts\generate-keystore.bat
```

**Linux/Mac:**
```bash
bash scripts/generate-keystore.sh
```

Script sẽ:
- ✅ Tạo keystore file
- ✅ Encode thành base64
- ✅ In ra thông tin cần thiết

### 2️⃣ **Thêm GitHub Secrets**

1. Vào **GitHub** → Repo → **Settings** → **Secrets and variables** → **Actions**
2. Tạo 4 secrets:
   - `KEYSTORE_FILE` - Paste nội dung base64 (bỏ dòng đầu & cuối)
   - `KEYSTORE_PASSWORD` - Mật khẩu keystore
   - `KEY_ALIAS` - Alias name (thường là `radio-nocturne`)
   - `KEY_PASSWORD` - Key password

### 3️⃣ **Sắp xếp lại Keystore Files**

```bash
mkdir -p android/keystore
mv radio-nocturne.jks android/keystore/
mv keystore.properties android/keystore/
```

### 4️⃣ **Push & Build!**

```bash
git add .
git commit -m "Add GitHub Actions workflows"
git push origin main
```

**Chọn một cách build:**

#### **Cách A: Build Debug tự động (mỗi push)**
```bash
git push origin main
# Workflow tự động chạy → Artifact sẵn sàng trong 5-10 phút
```

#### **Cách B: Build Release thủ động**
```bash
# GitHub Actions → Build APK → Run workflow → Chọn "release"
# hoặc

git tag v1.0.0
git push origin v1.0.0
# Workflow tự động chạy → Release được tạo với APK + AAB
```

---

## 📦 Workflows

### **build-apk.yml** - Thường xuyên
| Trigger | Output |
|---------|--------|
| Push đến `main`, `develop`, `feature/**` | Debug APK |
| Manual dispatch | Debug hoặc Release APK |

**Download:** Actions → Build APK → Artifacts

### **build-release.yml** - Official Release
| Trigger | Output |
|---------|--------|
| Push tag `v*` (v1.0.0, ...) | GitHub Release + APK + AAB |
| Manual dispatch | Release artifacts |

**Download:** GitHub Releases page

---

## 📋 File Locations

```
.github/workflows/
├── build-apk.yml          # Debug/Release builds
└── build-release.yml      # Official releases

scripts/
├── generate-keystore.sh   # Generate keystore (Linux/Mac)
└── generate-keystore.bat  # Generate keystore (Windows)

android/keystore/
├── radio-nocturne.jks     # ⚠️ Gitignored
├── keystore.properties    # ⚠️ Gitignored
└── .gitkeep              # Keep folder in git
```

---

## 🔐 Security

**IMPORTANT:**
- ❌ Không bao giờ commit `.jks` files
- ❌ Không bao giờ commit `keystore.properties`
- ✅ Keystore chỉ tồn tại trong GitHub Secrets
- ✅ Được encoded thành base64 trong CI/CD

---

## 📖 Chi tiết

Xem **[GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md)** để tìm hiểu thêm:
- Cấu hình chi tiết
- Troubleshooting
- Build types
- Customization

---

## ❓ FAQ

**Q: Tôi không có Java/keytool?**
> A: Tải [Java JDK 17+](https://www.oracle.com/java/technologies/downloads/)

**Q: Base64 encoding sai?**
> A: Xoá dòng đầu `-----BEGIN CERTIFICATE-----` và dòng cuối `-----END CERTIFICATE-----`

**Q: Build failed "Cannot find module"?**
> A: Chạy `npm ci` locally, sau đó push lại

**Q: Muốn thay đổi version code?**
> A: Edit `android/app/build.gradle`:
> ```gradle
> versionCode 2
> versionName "1.0.1"
> ```

---

## 🎯 Workflow tập trung

### Cho Development:
```
1. Tạo feature branch
2. Push code
3. Workflow tự động build Debug APK
4. Test APK từ Actions artifacts
5. Merge PR
```

### Cho Release:
```
1. Test ở develop branch
2. Merge vào main
3. Tạo tag v1.0.0
4. Push tag
5. Workflow tự động build Release
6. GitHub Release + APK + AAB sẵn sàng
```

---

**✨ Bây giờ bạn đã sẵn sàng! Push code và workflow sẽ tự động xử lý.**
