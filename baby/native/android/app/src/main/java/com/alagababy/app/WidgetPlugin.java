package com.alagababy.app;

import android.content.Context;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * JS: Widget.update({ name, status, sinceAt, sinceLabel, feed, next, asleep })
 * Saves what the home-screen widget shows and redraws it (AlagaWidget).
 */
@CapacitorPlugin(name = "Widget")
public class WidgetPlugin extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        Context ctx = getContext();
        ctx.getSharedPreferences(AlagaWidget.PREFS, Context.MODE_PRIVATE).edit().putString("data", call.getData().toString()).apply();
        AlagaWidget.refresh(ctx);
        call.resolve();
    }
}
