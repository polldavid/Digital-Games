package com.alagababy.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * JS (js/native.js):
 *   Nudge.reminders({ n, r, k })                 schedule reminders (Reminders.java)
 *   Nudge.token() -> { token }                   this phone's Firebase token ('' if unavailable)
 *   Nudge.config({ server, auth, device, key })  how NudgeService fetches and opens states
 *   Nudge.config({ clear: true })                stopped sharing: forget all of it
 *   Nudge.seen({ seq })                          the app's own view is this new: ignore older states
 */
@CapacitorPlugin(name = "Nudge")
public class NudgePlugin extends Plugin {
    @PluginMethod
    public void reminders(PluginCall call) {
        Reminders.apply(getContext(), call.getData());
        call.resolve();
    }

    @PluginMethod
    public void token(PluginCall call) {
        try {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(t -> {
                JSObject r = new JSObject();
                r.put("token", t.isSuccessful() && t.getResult() != null ? t.getResult() : "");
                call.resolve(r);
            });
        } catch (Exception e) { // a build without google-services.json
            JSObject r = new JSObject();
            r.put("token", "");
            call.resolve(r);
        }
    }

    @PluginMethod
    public void config(PluginCall call) {
        NudgeService.configure(getContext(), call.getData());
        call.resolve();
    }

    @PluginMethod
    public void seen(PluginCall call) {
        NudgeService.seen(getContext(), call.getInt("seq", 0));
        call.resolve();
    }
}
