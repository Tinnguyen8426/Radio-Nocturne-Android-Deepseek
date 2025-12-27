#!/bin/bash

# Script to generate and setup keystore for GitHub Actions

set -e

echo "======================================"
echo "Radio Nocturne - Keystore Setup"
echo "======================================"
echo ""

# Check if keytool is available
if ! command -v keytool &> /dev/null; then
    echo "❌ keytool not found. Please install Java SDK."
    exit 1
fi

# Input variables
read -p "Enter keystore filename (default: radio-nocturne.jks): " KEYSTORE_NAME
KEYSTORE_NAME=${KEYSTORE_NAME:-radio-nocturne.jks}

read -p "Enter keystore password: " -s KEYSTORE_PASS
echo ""
read -p "Confirm keystore password: " -s KEYSTORE_PASS_CONFIRM
echo ""

if [ "$KEYSTORE_PASS" != "$KEYSTORE_PASS_CONFIRM" ]; then
    echo "❌ Passwords don't match!"
    exit 1
fi

read -p "Enter key alias (default: radio-nocturne): " KEY_ALIAS
KEY_ALIAS=${KEY_ALIAS:-radio-nocturne}

read -p "Enter key password (usually same as keystore password): " -s KEY_PASS
echo ""

read -p "Enter your first and last name: " FIRST_LAST_NAME
read -p "Enter your organization unit (optional): " ORG_UNIT
read -p "Enter your organization name (optional): " ORG_NAME
read -p "Enter your city/locality: " CITY
read -p "Enter your state/province: " STATE
read -p "Enter your country code (2 letters, e.g., VN): " COUNTRY

# Generate keystore
echo ""
echo "Generating keystore file..."
keytool -genkey -v \
    -keystore "$KEYSTORE_NAME" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -alias "$KEY_ALIAS" \
    -storepass "$KEYSTORE_PASS" \
    -keypass "$KEY_PASS" \
    -dname "CN=$FIRST_LAST_NAME, OU=$ORG_UNIT, O=$ORG_NAME, L=$CITY, ST=$STATE, C=$COUNTRY"

echo "✅ Keystore file created: $KEYSTORE_NAME"
echo ""

# Display keystore info
echo "Keystore Information:"
echo "====================="
keytool -list -v -keystore "$KEYSTORE_NAME" -storepass "$KEYSTORE_PASS"

# Encode to base64
echo ""
echo "Encoding keystore to base64..."
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    # Windows
    certutil -encode "$KEYSTORE_NAME" "$KEYSTORE_NAME.b64"
    echo "✅ Base64 file created: $KEYSTORE_NAME.b64"
    echo ""
    echo "The base64 content has been saved to $KEYSTORE_NAME.b64"
    echo "⚠️  Remove the first and last lines from the file before using as KEYSTORE_FILE secret"
    echo ""
else
    # Linux/Mac
    base64 "$KEYSTORE_NAME" > "$KEYSTORE_NAME.b64"
    echo "✅ Base64 encoding saved: $KEYSTORE_NAME.b64"
    echo ""
    BASE64_CONTENT=$(cat "$KEYSTORE_NAME.b64")
fi

# Create properties file
echo ""
echo "Creating keystore.properties file..."
cat > keystore.properties << EOF
storeFile=$KEYSTORE_NAME
storePassword=$KEYSTORE_PASS
keyAlias=$KEY_ALIAS
keyPassword=$KEY_PASS
EOF

echo "✅ keystore.properties created"
echo ""

# Summary
echo "======================================"
echo "Setup Summary"
echo "======================================"
echo "Keystore file: $KEYSTORE_NAME"
echo "Key Alias: $KEY_ALIAS"
echo ""
echo "GitHub Secrets to add:"
echo "1. KEYSTORE_FILE = $(if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then echo "Content of $KEYSTORE_NAME.b64 (remove first & last line)"; else echo "$(head -c 50 $KEYSTORE_NAME.b64)..."; fi)"
echo "2. KEYSTORE_PASSWORD = $KEYSTORE_PASS"
echo "3. KEY_ALIAS = $KEY_ALIAS"
echo "4. KEY_PASSWORD = $KEY_PASS"
echo ""
echo "⚠️  Next steps:"
echo "1. Move keystore files to android/keystore/ directory:"
echo "   mkdir -p android/keystore"
echo "   mv $KEYSTORE_NAME android/keystore/"
echo "   mv keystore.properties android/keystore/"
echo ""
echo "2. Add to .gitignore (IMPORTANT!):"
echo "   android/keystore/*.jks"
echo "   android/keystore/*.jks.b64"
echo "   android/keystore/keystore.properties"
echo ""
echo "3. Go to GitHub → Settings → Secrets and variables → Actions"
echo "4. Create new secrets with the values above"
echo ""
echo "✅ Done!"
