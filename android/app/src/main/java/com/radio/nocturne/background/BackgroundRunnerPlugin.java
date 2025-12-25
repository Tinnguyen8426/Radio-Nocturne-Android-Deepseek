package com.radio.nocturne.background;

import android.content.Context;
import android.content.Intent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BackgroundRunner")
public class BackgroundRunnerPlugin extends Plugin {
    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", true);
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        String title = call.getString("title", "Đang tạo truyện...");
        Context context = getContext();
        Intent intent = new Intent(context, BackgroundRunnerService.class);
        intent.putExtra(BackgroundRunnerService.EXTRA_TITLE, title);
        ContextCompat.startForegroundService(context, intent);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(context, BackgroundRunnerService.class);
        context.stopService(intent);
        call.resolve();
    }
}
