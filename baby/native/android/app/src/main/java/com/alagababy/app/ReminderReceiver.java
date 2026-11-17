package com.alagababy.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

/** A reminder's alarm went off (Reminders.java), or the phone restarted / Alaga was updated. */
public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent.getAction();
        if (Reminders.ACTION.equals(action)) {
            try { Reminders.show(ctx, new JSONObject(intent.getStringExtra("r"))); } catch (Exception e) { /* bad payload */ }
        } else if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            Reminders.reschedule(ctx);
        }
    }
}
