# GitHub Secrets Template

This file shows you exactly what secrets you need to add to GitHub.
**DO NOT commit this file with actual values!**

## Required Secrets for Build Workflows

### For all builds (optional):
```
VITE_DEEPSEEK_BASE_URL=https://api.deepseek.com
VITE_DEEPSEEK_MAX_TOKENS=8192
VITE_STORY_TEMPERATURE=1.6
```

### For Release builds (required):
```
KEYSTORE_FILE=MIIJwQIBAzCC...SGg== [base64 encoded .jks file]
KEYSTORE_PASSWORD=your-keystore-password
KEY_ALIAS=radio-nocturne
KEY_PASSWORD=your-key-password
```

## How to Add Secrets

1. Go to GitHub → Your Repository
2. Click **Settings** (top menu)
3. Select **Secrets and variables** → **Actions** (left sidebar)
4. Click **New repository secret**
5. Enter:
   - **Name**: Secret name (exactly as shown above)
   - **Secret**: The value
6. Click **Add secret**

## How to Generate KEYSTORE_FILE

### Step 1: Generate Keystore (if you don't have one)

**Windows:**
```bash
.\scripts\generate-keystore.bat
```

**Linux/Mac:**
```bash
bash scripts/generate-keystore.sh
```

### Step 2: Encode to Base64

**Windows:**
```bash
certutil -encode radio-nocturne.jks keystore.b64
# Open keystore.b64 in editor, remove first and last line
```

**Linux/Mac:**
```bash
base64 radio-nocturne.jks | pbcopy  # Mac - copies to clipboard
base64 radio-nocturne.jks           # Linux - prints to console
```

### Step 3: Copy the Base64 Value

- **Windows**: Open `keystore.b64`, remove first line (`-----BEGIN CERTIFICATE-----`) and last line (`-----END CERTIFICATE-----`), copy remaining
- **Linux/Mac**: Copy the output from base64 command

### Step 4: Add to GitHub Secrets

1. Create secret `KEYSTORE_FILE`
2. Paste the base64 value
3. Click **Add secret**

## Keep These Files Safe

⚠️ **NEVER commit these files to Git:**
- `android/keystore/*.jks`
- `android/keystore/*.jks.b64`
- `android/keystore/keystore.properties`
- `.github/workflows/*` (with actual values in environment variables)

These files are already in `.gitignore` by default.

## Testing Secrets

To verify secrets are set correctly:

1. Run a workflow manually
2. Check the workflow log
3. If you see `***` instead of values, secrets are hidden (correct!)
4. If build succeeds, secrets are correct

## Troubleshooting

### Secret not found
```
error: Secret 'KEYSTORE_FILE' not found
```
→ Make sure secret name matches exactly (case-sensitive)

### Keystore corrupted
```
error: Failed to load keystore
```
→ Keystore file base64 encoding issue:
1. Delete current `KEYSTORE_FILE` secret
2. Re-encode keystore: `base64 radio-nocturne.jks`
3. Create new `KEYSTORE_FILE` secret with new value

### Wrong password
```
error: Keystore was tampered with
```
→ Check `KEYSTORE_PASSWORD` matches the one used when creating keystore

## Security Best Practices

1. ✅ Use strong passwords (20+ characters)
2. ✅ Use different passwords for different keystores (dev vs production)
3. ✅ Rotate passwords periodically
4. ✅ Only give access to trusted team members
5. ✅ Don't share keystore files via email or chat
6. ✅ Review who has access to secrets (Settings → Collaborators)

## More Information

See [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md) for detailed setup instructions.
