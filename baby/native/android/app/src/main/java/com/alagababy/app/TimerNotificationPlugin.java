package com.alagababy.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * Running timers (sleep, feeding, bottle, pumping, tummy time) as ongoing
 * notifications on the lock screen. The clock counts up by itself (Android's
 * chronometer), so nothing has to run in the background. Buttons open the app
 * with a babylog:// link that the web code turns into the same action as the
 * button on the Today screen.
 *
 * JS: TimerNotification.sync({ timers: [{ key, title, text, base, running, actions: [{ title, url }] }] })
 * Shows exactly the timers given; clears any others it showed before.
 */
@CapacitorPlugin(name = "TimerNotification")
public class TimerNotificationPlugin extends Plugin {
    private static final String CHANNEL = "timers";
    private final Set<Integer> shown = new HashSet<>();

    @Override
    public void load() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Running timers", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Sleep, feeding, bottle, pumping and tummy-time timers");
            ch.setShowBadge(false);
            ch.setSound(null, null);
            ch.enableVibration(false);
            getContext().getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
    }

    @PluginMethod
    public void sync(PluginCall call) {
        Context ctx = getContext();
        NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
        JSArray timers = call.getArray("timers", new JSArray());
        Set<Integer> now = new HashSet<>();
        try {
            for (int i = 0; i < timers.length(); i++) {
                JSONObject t = timers.getJSONObject(i);
                int id = idFor(t.optString("key"));
                now.add(id);
                NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
                        .setSmallIcon(R.drawable.ic_stat_babylog)
                        .setContentTitle(t.optString("title"))
                        .setContentText(t.optString("text"))
                        .setOngoing(true)
                        .setOnlyAlertOnce(true)
                        .setSilent(true)
                        .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
                        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                        .setContentIntent(open(ctx, "babylog://open", id * 10));
                if (t.optBoolean("running", true)) {
                    // Counts up from `base` (ms since epoch, already adjusted for pauses).
                    b.setUsesChronometer(true).setShowWhen(true).setWhen(t.optLong("base"));
                } else {
                    b.setShowWhen(false);
                }
                JSONObject[] actions = toArray(t.optJSONArray("actions"));
                for (int a = 0; a < actions.length && a < 3; a++) {
                    b.addAction(0, actions[a].optString("title"), open(ctx, actions[a].optString("url"), id * 10 + a + 1));
                }
                try { nm.notify(id, b.build()); } catch (SecurityException e) { /* notifications not allowed */ }
            }
        } catch (Exception e) {
            call.reject("Bad timer list: " + e.getMessage());
            return;
        }
        for (Integer old : shown) if (!now.contains(old)) nm.cancel(old);
        shown.clear();
        shown.addAll(now);
        call.resolve();
    }

    private static JSONObject[] toArray(org.json.JSONArray arr) {
        if (arr == null) return new JSONObject[0];
        JSONObject[] out = new JSONObject[arr.length()];
        for (int i = 0; i < arr.length(); i++) out[i] = arr.optJSONObject(i);
        return out;
    }

    private static int idFor(String key) {
        return 70000 + Math.abs(key.hashCode() % 20000);
    }

    // Opens (or brings back) the app with a babylog:// link; @capacitor/app reports it as appUrlOpen.
    private static PendingIntent open(Context ctx, String url, int requestCode) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url), ctx, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(ctx, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
