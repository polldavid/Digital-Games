package com.alagababy.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // On screen: NudgeService leaves updates to the app's own sync.
    static volatile boolean inFront = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Baby Log's own plugins must be registered before the bridge starts.
        registerPlugin(TimerNotificationPlugin.class);
        registerPlugin(WidgetPlugin.class);
        registerPlugin(NudgePlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() { super.onResume(); inFront = true; }

    @Override
    public void onPause() { inFront = false; super.onPause(); }
}
