package io.github.polldavid.babylog;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Baby Log's own plugins must be registered before the bridge starts.
        registerPlugin(TimerNotificationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
