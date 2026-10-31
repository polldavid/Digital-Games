package com.alagababy.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * The home-screen widget: the baby's name, time since the last feed (counting
 * up by itself, like the timer notifications), when the next feed is due, the
 * last diaper, and Feed / Diaper / Sleep buttons that open the app with the
 * same babylog://do/ links as the app-icon shortcuts.
 *
 * native.js sends what to show through WidgetPlugin, which keeps it in
 * SharedPreferences, so the widget can redraw after a reboot without the app.
 * Times are shown as clock times ("7:03 PM"), so they stay right while the
 * app is closed; only the counter moves.
 */
public class AlagaWidget extends AppWidgetProvider {
    static final String PREFS = "alaga_widget";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        RemoteViews v = build(ctx);
        for (int id : ids) mgr.updateAppWidget(id, v);
    }

    static void refresh(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, AlagaWidget.class));
        if (ids.length > 0) new AlagaWidget().onUpdate(ctx, mgr, ids);
    }

    static RemoteViews build(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_today);
        JSONObject d = null;
        try { d = new JSONObject(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("data", "{}")); } catch (Exception e) { /* shown as "open Alaga" */ }
        v.setOnClickPendingIntent(R.id.w_root, open(ctx, "babylog://open", 1));
        if (d == null || d.optString("name").isEmpty()) {
            v.setTextViewText(R.id.w_name, "Alaga");
            v.setTextViewText(R.id.w_status, "");
            v.setViewVisibility(R.id.w_since_row, View.GONE);
            v.setTextViewText(R.id.w_feed, "Open Alaga to start tracking");
            v.setViewVisibility(R.id.w_next, View.GONE);
            v.setViewVisibility(R.id.w_buttons, View.GONE);
            return v;
        }
        v.setTextViewText(R.id.w_name, d.optString("name"));
        v.setTextViewText(R.id.w_status, d.optString("status"));
        long since = d.optLong("sinceAt");
        if (since > 0) {
            // Chronometer counts from elapsedRealtime; turn the wall-clock time into that.
            long base = SystemClock.elapsedRealtime() - (System.currentTimeMillis() - since);
            v.setChronometer(R.id.w_since, base, null, true);
            v.setTextViewText(R.id.w_since_label, d.optString("sinceLabel"));
            v.setViewVisibility(R.id.w_since_row, View.VISIBLE);
        } else {
            v.setViewVisibility(R.id.w_since_row, View.GONE);
        }
        v.setTextViewText(R.id.w_feed, d.optString("feed"));
        String next = d.optString("next");
        v.setTextViewText(R.id.w_next, next);
        v.setViewVisibility(R.id.w_next, next.isEmpty() ? View.GONE : View.VISIBLE);
        v.setViewVisibility(R.id.w_buttons, View.VISIBLE);
        v.setTextViewText(R.id.w_sleep, d.optBoolean("asleep") ? "☀️ Woke up" : "🌙 Sleep");
        v.setOnClickPendingIntent(R.id.w_feed_btn, open(ctx, "babylog://do/feed", 2));
        v.setOnClickPendingIntent(R.id.w_diaper, open(ctx, "babylog://do/diaper", 3));
        v.setOnClickPendingIntent(R.id.w_sleep, open(ctx, "babylog://do/sleep", 4));
        return v;
    }

    // Same as the timer notifications: open (or bring back) the app with a babylog:// link.
    private static PendingIntent open(Context ctx, String url, int requestCode) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url), ctx, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(ctx, 500 + requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
