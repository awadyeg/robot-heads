# Awady Office for Android

A thin Android shell around the office GUI in `../hermes`. The GUI is bundled
into the APK (`assets/www`) and served from `https://appassets.androidplatform.net/`.

## Build

```bash
android/build.sh
```

No Android SDK needed: the script fetches `android.jar`, d8, APKEditor and
uber-apk-signer into `android/.tools/` on first run, builds the GUI, and writes
`android/release/AwadyOffice.apk` and `android/release/update.json`.

## Shipping an update

1. Raise `versionCode` (and `versionName`, `notes`) in `app.json`.
2. Run `android/build.sh`.
3. Commit `android/release/` and push.

The installed app checks `update.json` on launch and from **Settings → Check for
updates**, downloads the APK and installs it over itself. The manifest URL is in
`Updater.DEFAULT_MANIFEST`; to move the channel (another branch, say), publish an
`update.json` at the old URL with a `"manifest": "<new url>"` field and the app
follows it from then on.

Updates must be signed with the same key: `awady-office.jks` (alias `office`,
password `awady-office`). Losing it means uninstalling and reinstalling the app.
