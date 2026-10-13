package com.mobileapp.anix;

import android.os.Bundle;
import androidx.media3.common.util.UnstableApi;
import com.getcapacitor.BridgeActivity;
import com.mobileapp.anix.plugin.AnixPlayerPlugin;

@UnstableApi
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AnixPlayerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
