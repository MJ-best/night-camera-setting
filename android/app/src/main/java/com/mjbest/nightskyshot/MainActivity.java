package com.mjbest.nightskyshot;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(CompassPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
