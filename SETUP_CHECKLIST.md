# GitHub Actions Setup Checklist

## ✅ Pre-Setup
- [ ] You have a GitHub account
- [ ] You own/have push access to the repository
- [ ] You have Node.js 18+ installed
- [ ] You have Java SDK installed (for local testing, optional)

## ✅ Step 1: Generate Keystore

**Choose your platform:**

### Windows Users
```bash
.\scripts\generate-keystore.bat
```
- [ ] Script ran successfully
- [ ] `radio-nocturne.jks` file created
- [ ] `radio-nocturne.jks.b64` file created
- [ ] `keystore.properties` file created
- [ ] Wrote down the following values:
  - [ ] Keystore Password: _______________
  - [ ] Key Alias: _______________
  - [ ] Key Password: _______________

### Linux/Mac Users
```bash
bash scripts/generate-keystore.sh
```
- [ ] Script ran successfully
- [ ] `radio-nocturne.jks` file created
- [ ] `radio-nocturne.jks.b64` file created
- [ ] `keystore.properties` file created
- [ ] Wrote down the following values:
  - [ ] Keystore Password: _______________
  - [ ] Key Alias: _______________
  - [ ] Key Password: _______________

## ✅ Step 2: Prepare Base64 Content

### Windows Users
- [ ] Opened `radio-nocturne.jks.b64`
- [ ] Removed first line: `-----BEGIN CERTIFICATE-----`
- [ ] Removed last line: `-----END CERTIFICATE-----`
- [ ] Copied remaining content

### Linux/Mac Users
```bash
base64 radio-nocturne.jks
```
- [ ] Copied base64 output

## ✅ Step 3: Move Keystore Files

```bash
mkdir -p android/keystore
mv radio-nocturne.jks android/keystore/
mv keystore.properties android/keystore/
rm -f radio-nocturne.jks.b64  # Optional: delete the .b64 file
```

- [ ] Files moved to `android/keystore/`
- [ ] Verified files are NOT in root directory

## ✅ Step 4: Verify Gitignore

Check `.gitignore` contains:
```
android/keystore/*.jks
android/keystore/*.jks.b64
android/keystore/keystore.properties
```

- [ ] Verified `.gitignore` has keystore entries

## ✅ Step 5: Add GitHub Secrets

### Go to GitHub Repository
1. [ ] Opened repository on GitHub
2. [ ] Clicked **Settings** (top menu)
3. [ ] Clicked **Secrets and variables** → **Actions** (left sidebar)

### Create KEYSTORE_FILE Secret
- [ ] Clicked **New repository secret**
- [ ] Name: `KEYSTORE_FILE`
- [ ] Value: Pasted base64 content (without first/last line)
- [ ] Clicked **Add secret**

### Create KEYSTORE_PASSWORD Secret
- [ ] Clicked **New repository secret**
- [ ] Name: `KEYSTORE_PASSWORD`
- [ ] Value: Your keystore password
- [ ] Clicked **Add secret**

### Create KEY_ALIAS Secret
- [ ] Clicked **New repository secret**
- [ ] Name: `KEY_ALIAS`
- [ ] Value: Your key alias (usually `radio-nocturne`)
- [ ] Clicked **Add secret**

### Create KEY_PASSWORD Secret
- [ ] Clicked **New repository secret**
- [ ] Name: `KEY_PASSWORD`
- [ ] Value: Your key password
- [ ] Clicked **Add secret**

## ✅ Step 6: Verify Secrets

Back on GitHub Secrets page:
- [ ] See `KEYSTORE_FILE` in list (shows as `***` - correct!)
- [ ] See `KEYSTORE_PASSWORD` in list
- [ ] See `KEY_ALIAS` in list
- [ ] See `KEY_PASSWORD` in list

## ✅ Step 7: Commit & Push

```bash
git add .
git commit -m "Setup GitHub Actions CI/CD for APK builds"
git push origin main
```

- [ ] Committed changes
- [ ] Pushed to GitHub
- [ ] Verified no keystore files were committed (check git log)

## ✅ Step 8: Verify Workflows

### Check Workflows Files
- [ ] `.github/workflows/build-apk.yml` exists
- [ ] `.github/workflows/build-release.yml` exists

### On GitHub
- [ ] Went to **Actions** tab
- [ ] Saw **Build APK** and **Build Signed Release APK** workflows
- [ ] Initial build is running or completed

## ✅ Step 9: First Build

- [ ] Build started automatically
- [ ] Waited 10-15 minutes for completion
- [ ] Clicked on the workflow run to view logs
- [ ] Verified build succeeded (green checkmark)
- [ ] Downloaded Debug APK from Artifacts

## ✅ Step 10: Test APK

```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

Or download from Actions artifacts:
1. [ ] Went to Actions → Build APK → Latest Run
2. [ ] Downloaded `debug-apk` artifact
3. [ ] Unzipped artifact
4. [ ] Installed APK on device
5. [ ] App launched successfully

## ✅ Final Verification

- [ ] Workflows visible on GitHub (Actions tab)
- [ ] Secrets securely stored in GitHub
- [ ] Keystore files NOT in git repository
- [ ] APK successfully built and downloaded
- [ ] APK successfully installed and ran

---

## 🎉 Success!

If all items are checked, your GitHub Actions CI/CD is fully set up!

### Next Steps:
1. Push code regularly - Debug APK builds automatically
2. Create tags for releases - Release APK + AAB builds automatically
3. Check [GITHUB_ACTIONS_QUICK_START.md](./GITHUB_ACTIONS_QUICK_START.md) for daily usage

---

## 🆘 Troubleshooting

If any step failed:

**Script error:**
- [ ] Check Java is installed: `java -version`
- [ ] Check keytool is available: `keytool -help`
- [ ] Run script again with detailed output

**Git error:**
- [ ] Check `.gitignore` is correctly updated
- [ ] Run: `git status` and verify keystore files aren't listed
- [ ] If they are, run: `git rm --cached android/keystore/*.jks`

**Build error:**
- [ ] Check all 4 GitHub secrets are created
- [ ] Check secret values are correct (no typos)
- [ ] Check base64 encoding (remove first/last line)
- [ ] Run: `npm ci && npm run build` locally to test

**APK won't install:**
- [ ] Check device SDK version matches `targetSdkVersion` in `android/app/build.gradle`
- [ ] Try: `adb uninstall com.radio.nocturne` then reinstall
- [ ] Check device has enough storage space

---

**📞 Need help?**
- Check [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md) for detailed guide
- Review GitHub Actions logs in Actions tab
- Check Android build documentation
