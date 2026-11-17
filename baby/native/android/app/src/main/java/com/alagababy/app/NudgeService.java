package com.alagababy.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * The other parent logged something: the sync server sends a silent Firebase
 * message (server/nudge.js), and this fetches what their phone worked out for
 * this one — reminders, the widget, timer notifications — opens it with the
 * family key and applies it, with Alaga closed. See js/native.js.
 *
 * While Alaga is open on screen it does nothing: the app's own sync picks the
 * change up within seconds and redoes all of it.
 */
public class NudgeService extends FirebaseMessagingService {
    private static final String PREFS = "alaga_nudge";
    private static final int TIMEOUT = 15000;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage msg) {
        if (!"s".equals(msg.getData().get("t")) || MainActivity.inFront) return;
        try { fetchAndApply(this); } catch (Exception e) { /* offline, or sharing stopped: the app catches up when opened */ }
    }

    // Firebase gave this phone a new token: tell the server straight away.
    @Override
    public void onNewToken(@NonNull String token) {
        SharedPreferences p = prefs(this);
        String server = p.getString("server", null), auth = p.getString("auth", null), device = p.getString("device", null);
        if (server == null || auth == null || device == null) return; // not sharing: the app sends it when it starts
        try {
            JSONObject body = new JSONObject().put("d", device).put("t", token);
            http("PUT", server + "/v1/nudge/me", auth, body.toString());
        } catch (Exception e) { /* the app sends it next time it starts */ }
    }

    static void configure(Context ctx, JSObject d) {
        SharedPreferences.Editor e = prefs(ctx).edit();
        if (d.optBoolean("clear")) { e.clear().apply(); return; }
        e.putString("server", d.optString("server")).putString("auth", d.optString("auth"))
                .putString("device", d.optString("device")).putString("key", d.optString("key")).apply();
    }

    static void seen(Context ctx, int seq) {
        SharedPreferences p = prefs(ctx);
        if (seq > p.getInt("seen", 0)) p.edit().putInt("seen", seq).apply();
    }

    static void fetchAndApply(Context ctx) throws Exception {
        SharedPreferences p = prefs(ctx);
        String server = p.getString("server", null), auth = p.getString("auth", null), device = p.getString("device", null), key = p.getString("key", null);
        if (server == null || auth == null || device == null || key == null) return;
        JSONObject res = new JSONObject(http("GET", server + "/v1/nudge/state?d=" + device, auth, null));
        int s = res.optInt("s");
        String blob = res.optString("b");
        if (blob.isEmpty() || s < p.getInt("seen", 0)) return; // older than what this phone already knows
        JSONObject state = new JSONObject(open(key, blob));
        p.edit().putInt("seen", s).apply();
        Reminders.apply(ctx, state);
        JSONObject w = state.optJSONObject("w");
        if (w != null) WidgetPlugin.save(ctx, w.toString());
        JSONArray t = state.optJSONArray("t");
        if (t != null) TimerNotificationPlugin.show(ctx, t);
    }

    // AES-GCM, as sealed in js/native.js: 12-byte IV, then ciphertext and tag; base64url.
    static String open(String keyB64, String blob) throws Exception {
        byte[] key = unb64u(keyB64), all = unb64u(blob);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, all, 0, 12));
        return new String(c.doFinal(all, 12, all.length - 12), StandardCharsets.UTF_8);
    }

    private static byte[] unb64u(String s) {
        return Base64.decode(s + "===".substring(0, (4 - s.length() % 4) % 4), Base64.URL_SAFE | Base64.NO_WRAP);
    }

    private static String http(String method, String url, String auth, String body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setRequestMethod(method);
            c.setConnectTimeout(TIMEOUT);
            c.setReadTimeout(TIMEOUT);
            c.setRequestProperty("Authorization", "Bearer " + auth);
            if (body != null) {
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                try (OutputStream o = c.getOutputStream()) { o.write(body.getBytes(StandardCharsets.UTF_8)); }
            }
            int code = c.getResponseCode();
            if (code < 200 || code >= 300) throw new Exception("HTTP " + code);
            try (InputStream in = c.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buf = new byte[8192];
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                return out.toString("UTF-8");
            }
        } finally {
            c.disconnect();
        }
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
