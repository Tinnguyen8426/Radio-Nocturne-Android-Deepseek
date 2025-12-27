#!/bin/bash
# Verify GitHub Actions setup

echo "======================================"
echo "GitHub Actions Setup Verification"
echo "======================================"
echo ""

# Check if .github/workflows exist
echo "✓ Checking workflow files..."
if [ -f ".github/workflows/build-apk.yml" ]; then
    echo "  ✅ .github/workflows/build-apk.yml"
else
    echo "  ❌ .github/workflows/build-apk.yml not found"
fi

if [ -f ".github/workflows/build-release.yml" ]; then
    echo "  ✅ .github/workflows/build-release.yml"
else
    echo "  ❌ .github/workflows/build-release.yml not found"
fi

echo ""

# Check if scripts exist
echo "✓ Checking keystore generation scripts..."
if [ -f "scripts/generate-keystore.sh" ]; then
    echo "  ✅ scripts/generate-keystore.sh"
else
    echo "  ❌ scripts/generate-keystore.sh not found"
fi

if [ -f "scripts/generate-keystore.bat" ]; then
    echo "  ✅ scripts/generate-keystore.bat"
else
    echo "  ❌ scripts/generate-keystore.bat not found"
fi

echo ""

# Check if documentation exists
echo "✓ Checking documentation files..."
if [ -f "GITHUB_ACTIONS_SETUP.md" ]; then
    echo "  ✅ GITHUB_ACTIONS_SETUP.md"
else
    echo "  ❌ GITHUB_ACTIONS_SETUP.md not found"
fi

if [ -f "GITHUB_ACTIONS_QUICK_START.md" ]; then
    echo "  ✅ GITHUB_ACTIONS_QUICK_START.md"
else
    echo "  ❌ GITHUB_ACTIONS_QUICK_START.md not found"
fi

if [ -f "GITHUB_SECRETS_TEMPLATE.md" ]; then
    echo "  ✅ GITHUB_SECRETS_TEMPLATE.md"
else
    echo "  ❌ GITHUB_SECRETS_TEMPLATE.md not found"
fi

echo ""

# Check if android/keystore exists
echo "✓ Checking android directory..."
if [ -d "android/keystore" ]; then
    echo "  ✅ android/keystore directory exists"
    if [ -f "android/keystore/.gitkeep" ]; then
        echo "  ✅ android/keystore/.gitkeep"
    fi
else
    echo "  ⚠️  android/keystore directory doesn't exist (will be created during build)"
fi

echo ""

# Check .gitignore
echo "✓ Checking .gitignore for keystore entries..."
if grep -q "android/keystore.*jks" .gitignore; then
    echo "  ✅ Keystore files are gitignored"
else
    echo "  ❌ Keystore files are NOT gitignored (add to .gitignore!)"
fi

echo ""

# Check capacitor config
echo "✓ Checking Capacitor configuration..."
if [ -f "capacitor.config.ts" ]; then
    if grep -q "com.radio.nocturne" capacitor.config.ts; then
        echo "  ✅ App ID is configured correctly"
    else
        echo "  ⚠️  Check app ID in capacitor.config.ts"
    fi
else
    echo "  ❌ capacitor.config.ts not found"
fi

echo ""

# Check Android build files
echo "✓ Checking Android build files..."
if [ -f "android/app/build.gradle" ]; then
    echo "  ✅ android/app/build.gradle exists"
else
    echo "  ❌ android/app/build.gradle not found"
fi

if [ -f "android/gradle.properties" ]; then
    echo "  ✅ android/gradle.properties exists"
else
    echo "  ❌ android/gradle.properties not found"
fi

echo ""

# Check Node.js and npm
echo "✓ Checking Node.js environment..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "  ✅ Node.js $NODE_VERSION installed"
else
    echo "  ❌ Node.js not found"
fi

if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo "  ✅ npm $NPM_VERSION installed"
else
    echo "  ❌ npm not found"
fi

echo ""

# Check Java (for local testing)
echo "✓ Checking Java (optional, for local builds)..."
if command -v java &> /dev/null; then
    JAVA_VERSION=$(java -version 2>&1 | grep -oP 'version "\K[^"]*')
    echo "  ✅ Java $JAVA_VERSION installed"
else
    echo "  ⚠️  Java not found (required for local Android builds, but not needed for GitHub Actions)"
fi

echo ""

# Final summary
echo "======================================"
echo "Summary"
echo "======================================"
echo ""
echo "Setup is ready if you see all ✅"
echo ""
echo "Next steps:"
echo "1. Run keystore generation script:"
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    echo "   .\\scripts\\generate-keystore.bat"
else
    echo "   bash scripts/generate-keystore.sh"
fi
echo ""
echo "2. Add secrets to GitHub:"
echo "   - Go to Settings → Secrets and variables → Actions"
echo "   - Add: KEYSTORE_FILE, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD"
echo ""
echo "3. Push changes:"
echo "   git add ."
echo "   git commit -m 'Setup GitHub Actions CI/CD'"
echo "   git push origin main"
echo ""
echo "✨ Workflow will start automatically!"
