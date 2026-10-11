package com.awady.office;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.app.ProgressDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONObject;

/**
 * In-app updates. Reads a small update.json published next to the APK in the
 * GitHub repo; when it names a higher versionCode, downloads that APK and
 * hands it to the system installer. The manifest can point at a new manifest
 * URL ("manifest" field), which is remembered, so the update channel can move
 * without shipping a new app first.
 */
final class Updater {
    static final String DEFAULT_MANIFEST =
            "https://raw.githubusercontent.com/awadyeg/robot-heads/ccr-402eaf76-twjrnu/android/release/update.json";
    private static final String PREFS = "updater";
    private static boolean busy;

    private Updater() {
    }

    static long versionCode(Context c) {
        try {
            PackageInfo p = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode;
        } catch (Exception e) {
            return 0;
        }
    }

    static String versionName(Context c) {
        try {
            return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "?";
        }
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, 0);
    }

    /** Checks for a newer version; `manual` also reports "up to date" and errors. */
    static void check(final Activity a, final boolean manual) {
        if (busy) return;
        busy = true;
        if (manual) Toast.makeText(a, "Checking for updates…", Toast.LENGTH_SHORT).show();
        new Thread(() -> {
            JSONObject info = null;
            String manifestUrl = prefs(a).getString("manifest", DEFAULT_MANIFEST);
            Exception error = null;
            try {
                for (int hop = 0; hop < 3; hop++) {
                    info = new JSONObject(new String(get(manifestUrl + "?t=" + System.currentTimeMillis()), "UTF-8"));
                    String moved = info.optString("manifest", "");
                    if (moved.isEmpty() || moved.equals(manifestUrl)) break;
                    manifestUrl = moved;
                    prefs(a).edit().putString("manifest", moved).apply();
                }
            } catch (Exception e) {
                error = e;
            }
            final JSONObject result = info;
            final Exception failure = error;
            final String base = manifestUrl;
            a.runOnUiThread(() -> {
                busy = false;
                if (a.isFinishing()) return;
                if (result == null) {
                    if (manual) Toast.makeText(a, "Couldn't check for updates: " + failure.getMessage(), Toast.LENGTH_LONG).show();
                    return;
                }
                long latest = result.optLong("versionCode", 0);
                if (latest <= versionCode(a)) {
                    if (manual) Toast.makeText(a, "You're on the latest version (" + versionName(a) + ")", Toast.LENGTH_SHORT).show();
                    return;
                }
                if (!manual && latest == prefs(a).getLong("skipped", -1)) return;
                offer(a, result, base);
            });
        }, "update-check").start();
    }

    private static void offer(final Activity a, final JSONObject info, final String manifestUrl) {
        final long code = info.optLong("versionCode");
        String notes = info.optString("notes", "");
        new AlertDialog.Builder(a)
                .setTitle("Update available · " + info.optString("versionName", String.valueOf(code)))
                .setMessage((notes.isEmpty() ? "" : notes + "\n\n") + "You have " + versionName(a) + ".")
                .setPositiveButton("Update", (d, w) -> {
                    try {
                        String apk = new URL(new URL(manifestUrl), info.getString("apk")).toString();
                        download(a, apk);
                    } catch (Exception e) {
                        Toast.makeText(a, "Bad update info: " + e.getMessage(), Toast.LENGTH_LONG).show();
                    }
                })
                .setNegativeButton("Later", (d, w) -> prefs(a).edit().putLong("skipped", code).apply())
                .show();
    }

    @SuppressWarnings("deprecation")
    private static void download(final Activity a, final String url) {
        final ProgressDialog dialog = new ProgressDialog(a);
        dialog.setTitle("Downloading update");
        dialog.setProgressStyle(ProgressDialog.STYLE_HORIZONTAL);
        dialog.setMax(100);
        dialog.setCancelable(false);
        dialog.show();
        new Thread(() -> {
            File out = new File(a.getCacheDir(), "update.apk");
            Exception error = null;
            try {
                HttpURLConnection c = open(url + "?t=" + System.currentTimeMillis());
                long total = c.getContentLengthLong();
                try (InputStream in = c.getInputStream(); OutputStream o = new FileOutputStream(out)) {
                    byte[] buf = new byte[16384];
                    long done = 0;
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        o.write(buf, 0, n);
                        done += n;
                        if (total > 0) {
                            final int pct = (int) (done * 100 / total);
                            a.runOnUiThread(() -> dialog.setProgress(pct));
                        }
                    }
                } finally {
                    c.disconnect();
                }
            } catch (Exception e) {
                error = e;
            }
            final Exception failure = error;
            a.runOnUiThread(() -> {
                dialog.dismiss();
                if (failure != null) {
                    Toast.makeText(a, "Download failed: " + failure.getMessage(), Toast.LENGTH_LONG).show();
                } else {
                    install(a, out);
                }
            });
        }, "update-download").start();
    }

    /** After the user allows installs from this app in Settings, carry on. */
    static void resumePendingInstall(Activity a) {
        String pending = prefs(a).getString("pending", null);
        if (pending == null || !canInstall(a)) return;
        prefs(a).edit().remove("pending").apply();
        File f = new File(pending);
        if (f.exists()) install(a, f);
    }

    private static boolean canInstall(Context c) {
        return Build.VERSION.SDK_INT < 26 || c.getPackageManager().canRequestPackageInstalls();
    }

    private static void install(final Activity a, File apk) {
        if (!canInstall(a)) {
            prefs(a).edit().putString("pending", apk.getAbsolutePath()).apply();
            new AlertDialog.Builder(a)
                    .setTitle("Allow updates")
                    .setMessage("To install updates, allow Awady Office to install apps on the next screen, then come back.")
                    .setPositiveButton("Open settings", (d, w) -> a.startActivity(
                            new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + a.getPackageName()))))
                    .setNegativeButton("Cancel", null)
                    .show();
            return;
        }
        try {
            PackageInstaller pi = a.getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            params.setAppPackageName(a.getPackageName());
            int id = pi.createSession(params);
            try (PackageInstaller.Session session = pi.openSession(id)) {
                try (OutputStream out = session.openWrite("update.apk", 0, apk.length()); InputStream in = new FileInputStream(apk)) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                    session.fsync(out);
                }
                int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                PendingIntent done = PendingIntent.getBroadcast(a, id, new Intent(a, InstallReceiver.class), flags);
                session.commit(done.getIntentSender());
            }
        } catch (Exception e) {
            Toast.makeText(a, "Install failed: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private static HttpURLConnection open(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(60000);
        c.setRequestProperty("Cache-Control", "no-cache");
        int code = c.getResponseCode();
        if (code != 200) {
            c.disconnect();
            throw new Exception("HTTP " + code);
        }
        return c;
    }

    private static byte[] get(String url) throws Exception {
        HttpURLConnection c = open(url);
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        } finally {
            c.disconnect();
        }
    }
}
