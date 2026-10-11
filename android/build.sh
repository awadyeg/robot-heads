#!/usr/bin/env bash
# Builds the Awady Office APK without the Android SDK:
#   web GUI (hermes/) -> assets/www, Java -> javac -> d8, manifest + res ->
#   APKEditor, then zipalign + sign with uber-apk-signer.
# Output: android/release/AwadyOffice.apk and android/release/update.json,
# which installed apps read to offer the update.
#
#   android/build.sh            build with the version in android/app.json
#
# To ship an update: raise versionCode (and versionName, notes) in app.json,
# run this, commit android/release/ and push.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
TOOLS="${ANDROID_TOOLS:-$HERE/.tools}"
BUILD="$HERE/build"
mkdir -p "$TOOLS"

fetch() { # url file
  [ -s "$TOOLS/$2" ] || { echo "fetching $2"; curl -fsSL -o "$TOOLS/$2" "$1"; }
}
fetch https://raw.githubusercontent.com/Sable/android-platforms/master/android-34/android.jar android.jar
fetch https://storage.googleapis.com/r8-releases/raw/8.5.35/r8lib.jar r8lib.jar
fetch https://github.com/REAndroid/APKEditor/releases/download/V1.4.5/APKEditor-1.4.5.jar APKEditor.jar
fetch https://github.com/patrickfav/uber-apk-signer/releases/download/v1.3.0/uber-apk-signer-1.3.0.jar uber-apk-signer.jar

read_json() { node -e "process.stdout.write(String(require('$HERE/app.json').$1))"; }
VERSION_CODE="$(read_json versionCode)"
VERSION_NAME="$(read_json versionName)"
echo "Awady Office $VERSION_NAME ($VERSION_CODE)"

# 1. the GUI
(cd "$ROOT" && pnpm --filter robot-heads-hermes run build >/dev/null)

# 2. the Java shell
rm -rf "$BUILD" && mkdir -p "$BUILD/classes" "$BUILD/dex"
# the platform jar has no LambdaMetafactory stub, so compile against Java 8 and
# put Android on the classpath; d8 desugars the lambdas
javac -nowarn --release 8 -Xlint:-options -cp "$TOOLS/android.jar" \
  -d "$BUILD/classes" $(find "$HERE/src" -name '*.java')
java -cp "$TOOLS/r8lib.jar" com.android.tools.r8.D8 --release --min-api 24 \
  --lib "$TOOLS/android.jar" --output "$BUILD/dex" $(find "$BUILD/classes" -name '*.class')

# 3. an APKEditor project: manifest, resources, assets, dex
P="$BUILD/project"
mkdir -p "$P/resources/package_1" "$P/root/assets"
sed -e "s/@VERSION_CODE@/$VERSION_CODE/" -e "s/@VERSION_NAME@/$VERSION_NAME/" \
  "$HERE/AndroidManifest.xml" > "$P/AndroidManifest.xml"
cp -r "$HERE/res" "$P/resources/package_1/res"
printf '{"package_id":127,"package_name":"com.awady.office"}\n' > "$P/resources/package_1/package.json"
cp -r "$ROOT/hermes/dist" "$P/root/assets/www"
cp "$BUILD/dex/classes.dex" "$P/root/classes.dex"
java -jar "$TOOLS/APKEditor.jar" b -i "$P" -o "$BUILD/unsigned.apk" -f >/dev/null

# 4. align and sign
java -jar "$TOOLS/uber-apk-signer.jar" --apks "$BUILD/unsigned.apk" --out "$BUILD/signed" \
  --ks "$HERE/awady-office.jks" --ksAlias office --ksPass awady-office --ksKeyPass awady-office >/dev/null

mkdir -p "$HERE/release"
cp "$(find "$BUILD/signed" -name '*.apk' | head -1)" "$HERE/release/AwadyOffice.apk"
node -e "
const app = require('$HERE/app.json');
const out = { versionCode: app.versionCode, versionName: app.versionName, notes: app.notes, apk: 'AwadyOffice.apk' };
require('fs').writeFileSync('$HERE/release/update.json', JSON.stringify(out, null, 2) + '\n');
"
ls -la "$HERE/release"
