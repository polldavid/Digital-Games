package com.alagababy.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.service.notification.StatusBarNotification;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * Alaga's reminders, scheduled with AlarmManager so they fire with the app
 * closed. Given the whole picture each time (from the app's JavaScript, or
 * from NudgeService when the other parent logged something):
 *
 *   { n: 1|0,                         reminders on?
 *     r: [{ i, k, at, t, b, q }],     the next ones: id, key, when (ms), title, text, quiet
 *     k: [key, …] }                   every reminder that still stands, due or not
 *
 * Replaces everything scheduled before, and takes down any reminder already
 * showing whose key isn't in `k` any more ("last fed 3h ago" after a newer
 * feed came in). Showing reminders carry the tag "r:" + key, so nothing else
 * (the running-timer notifications) is ever touched.
 */
final class Reminders {
    static final String ACTION = "com.alagababy.app.REMIND";
    private static final String PREFS = "alaga_reminders";
    private static final String LOUD = "reminders", QUIET = "quiet";
    private static final String TAG = "r:";

    private Reminders() {}

    // The same channels @capacitor/local-notifications used, so the parent's sound settings carry over.
    static void channels(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(LOUD) == null) {
            NotificationChannel c = new NotificationChannel(LOUD, "Reminders", NotificationManager.IMPORTANCE_HIGH);
            c.setDescription("Feeds, diapers, naps, medicine and visits");
            c.enableVibration(true);
            nm.createNotificationChannel(c);
        }
        if (nm.getNotificationChannel(QUIET) == null) {
            NotificationChannel c = new NotificationChannel(QUIET, "Night reminders (no sound)", NotificationManager.IMPORTANCE_LOW);
            c.setDescription("Reminders during quiet hours");
            c.enableVibration(true);
            nm.createNotificationChannel(c);
        }
    }

    static synchronized void apply(Context ctx, JSONObject state) {
        channels(ctx);
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        JSONArray old = list(p.getString("list", "[]"));
        for (int i = 0; i < old.length(); i++) {
            JSONObject o = old.optJSONObject(i);
            if (o == null) continue;
            PendingIntent pi = pending(ctx, o.optInt("i"), null, PendingIntent.FLAG_NO_CREATE);
            if (pi != null) { am.cancel(pi); pi.cancel(); }
        }
        boolean on = state.optInt("n", 0) == 1;
        JSONArray next = on ? state.optJSONArray("r") : null;
        JSONArray kept = new JSONArray();
        long now = System.currentTimeMillis();
        if (next != null) for (int i = 0; i < next.length(); i++) {
            JSONObject r = next.optJSONObject(i);
            if (r == null || r.optLong("at") <= now) continue;
            schedule(ctx, am, r);
            kept.put(r);
        }
        p.edit().putString("list", kept.toString()).apply();

        Set<String> keys = new HashSet<>();
        JSONArray k = state.optJSONArray("k");
        if (k != null) for (int i = 0; i < k.length(); i++) keys.add(k.optString(i));
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        try {
            for (StatusBarNotification s : nm.getActiveNotifications()) {
                String tag = s.getTag();
                if (tag != null && tag.startsWith(TAG) && (!on || !keys.contains(tag.substring(TAG.length())))) nm.cancel(tag, s.getId());
            }
        } catch (Exception e) { /* nothing showing, or not allowed */ }
    }

    // After a reboot or an app update, alarms are gone: set them again.
    static synchronized void reschedule(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        JSONArray all = list(p.getString("list", "[]")), kept = new JSONArray();
        long now = System.currentTimeMillis();
        for (int i = 0; i < all.length(); i++) {
            JSONObject r = all.optJSONObject(i);
            if (r == null || r.optLong("at") <= now) continue;
            schedule(ctx, am, r);
            kept.put(r);
        }
        p.edit().putString("list", kept.toString()).apply();
    }

    // Exact when the phone allows it; otherwise as close as Android lets an app get (what local-notifications did).
    private static void schedule(Context ctx, AlarmManager am, JSONObject r) {
        PendingIntent pi = pending(ctx, r.optInt("i"), r.toString(), PendingIntent.FLAG_UPDATE_CURRENT);
        long at = r.optLong("at");
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    private static PendingIntent pending(Context ctx, int id, String json, int flags) {
        Intent i = new Intent(ctx, ReminderReceiver.class).setAction(ACTION).setData(Uri.parse("alaga-remind://" + id));
        if (json != null) i.putExtra("r", json);
        return PendingIntent.getBroadcast(ctx, id, i, flags | PendingIntent.FLAG_IMMUTABLE);
    }

    // The alarm went off: show it. Tapping opens Alaga.
    static void show(Context ctx, JSONObject r) {
        channels(ctx);
        String key = r.optString("k");
        boolean quiet = r.optInt("q") == 1;
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse("babylog://remind?k=" + Uri.encode(key)), ctx, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap = PendingIntent.getActivity(ctx, r.optInt("i"), open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new NotificationCompat.Builder(ctx, quiet ? QUIET : LOUD)
                .setSmallIcon(R.drawable.ic_stat_babylog)
                .setColor(0xFF8FA4FF)
                .setContentTitle(r.optString("t"))
                .setContentText(r.optString("b"))
                .setStyle(new NotificationCompat.BigTextStyle().bigText(r.optString("b")))
                .setAutoCancel(true)
                .setContentIntent(tap)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setPriority(quiet ? NotificationCompat.PRIORITY_LOW : NotificationCompat.PRIORITY_HIGH)
                .setShowWhen(true)
                .setWhen(r.optLong("at", System.currentTimeMillis()))
                .build();
        try { NotificationManagerCompat.from(ctx).notify(TAG + key, r.optInt("i"), n); } catch (SecurityException e) { /* notifications not allowed */ }
    }

    private static JSONArray list(String json) {
        try { return new JSONArray(json); } catch (Exception e) { return new JSONArray(); }
    }
}
