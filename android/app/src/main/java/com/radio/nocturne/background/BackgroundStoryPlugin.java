package com.radio.nocturne.background;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.IBinder;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BackgroundStory")
public class BackgroundStoryPlugin extends Plugin implements BackgroundStoryService.StoryListener {
    private BackgroundStoryService service;
    private boolean bound = false;
    private BackgroundStoryService.GenerationConfig pendingConfig;

    private final ServiceConnection connection =
        new ServiceConnection() {
            @Override
            public void onServiceConnected(ComponentName name, IBinder binder) {
                BackgroundStoryService.LocalBinder localBinder =
                    (BackgroundStoryService.LocalBinder) binder;
                service = localBinder.getService();
                bound = true;
                service.registerListener(BackgroundStoryPlugin.this);
                if (pendingConfig != null) {
                    service.startGeneration(pendingConfig);
                    pendingConfig = null;
                }
            }

            @Override
            public void onServiceDisconnected(ComponentName name) {
                if (service != null) {
                    service.unregisterListener();
                }
                service = null;
                bound = false;
            }
        };

    @Override
    protected void handleOnDestroy() {
        if (service != null) {
            service.unregisterListener();
        }
        if (bound) {
            getContext().unbindService(connection);
            bound = false;
        }
        service = null;
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", true);
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        BackgroundStoryService.GenerationConfig config = buildConfig(call);
        if (config.apiKey == null || config.apiKey.trim().isEmpty()) {
            call.reject("API key is missing");
            return;
        }
        pendingConfig = config;
        ensureService();
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (service != null) {
            service.cancel();
        }
        call.resolve();
    }

    @PluginMethod
    public void getState(PluginCall call) {
        JSObject result = new JSObject();
        if (service != null) {
            result.put("running", service.isRunning());
            result.put("text", service.getCurrentFullText());
        } else {
            result.put("running", false);
            result.put("text", "");
        }
        call.resolve(result);
    }

    private void ensureService() {
        Context context = getContext();
        Intent intent = new Intent(context, BackgroundStoryService.class);
        ContextCompat.startForegroundService(context, intent);
        context.bindService(intent, connection, Context.BIND_AUTO_CREATE);
    }

    private BackgroundStoryService.GenerationConfig buildConfig(PluginCall call) {
        BackgroundStoryService.GenerationConfig config = new BackgroundStoryService.GenerationConfig();
        config.apiKey = call.getString("apiKey", "");
        String baseUrl = call.getString("baseUrl", "https://api.deepseek.com");
        if (baseUrl == null || !baseUrl.startsWith("http")) {
            baseUrl = "https://api.deepseek.com";
        }
        config.baseUrl = baseUrl.replaceAll("/$", "");
        config.model = call.getString("model", "deepseek-reasoner");
        config.temperature = call.getDouble("temperature", 1.5);
        config.maxTokens = call.getInt("maxTokens", 8192);
        config.storyMinWords = call.getInt("storyMinWords", 6500);
        config.storyTargetWords = call.getInt("storyTargetWords", 7200);
        config.storyHardMaxWords = call.getInt("storyHardMaxWords", 8000);
        config.storyTimeoutMs = call.getInt("storyTimeoutMs", 12 * 60 * 1000);
        config.storyContextWords = call.getInt("storyContextWords", 320);
        config.storyMaxPasses = call.getInt("storyMaxPasses", 6);
        config.horrorLevel = call.getInt("horrorLevel", 50);
        config.narrativeStyle = call.getString("narrativeStyle", "default");
        config.storyEngine = call.getString("storyEngine", "");
        config.storyRevealMethod = call.getString("storyRevealMethod", "");
        config.storyEndingMode = call.getString("storyEndingMode", "");
        config.storyTone = call.getString("storyTone", "");
        config.storyProtagonistName = call.getString("storyProtagonistName", "");
        config.storyProtagonistRole = call.getString("storyProtagonistRole", "");
        config.storyPrimarySetting = call.getString("storyPrimarySetting", "");
        config.storyEvidenceOrigin = call.getString("storyEvidenceOrigin", "");
        config.storyKeyMotif = call.getString("storyKeyMotif", "");
        config.storyIntroMood = call.getString("storyIntroMood", "");
        config.outroSignature = call.getString("outroSignature", "");
        config.language = call.getString("language", "vi");
        config.topic = call.getString("topic", "");
        config.existingText = call.getString("existingText", "");
        return config;
    }

    @Override
    public void onChunk(String text) {
        JSObject data = new JSObject();
        data.put("text", text);
        notifyListeners("storyChunk", data);
    }

    @Override
    public void onDone(String fullText, String newText) {
        JSObject data = new JSObject();
        data.put("text", fullText);
        data.put("newText", newText);
        notifyListeners("storyDone", data);
    }

    @Override
    public void onError(String message, boolean aborted) {
        JSObject data = new JSObject();
        data.put("message", message);
        data.put("aborted", aborted);
        notifyListeners("storyError", data);
    }
}
