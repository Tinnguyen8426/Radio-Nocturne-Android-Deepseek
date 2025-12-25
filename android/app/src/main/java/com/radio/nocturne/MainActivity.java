package com.radio.nocturne;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.radio.nocturne.background.BackgroundRunnerPlugin;
import com.radio.nocturne.background.BackgroundStoryPlugin;
import com.radio.nocturne.tts.BackgroundTtsPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundTtsPlugin.class);
        registerPlugin(BackgroundRunnerPlugin.class);
        registerPlugin(BackgroundStoryPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
