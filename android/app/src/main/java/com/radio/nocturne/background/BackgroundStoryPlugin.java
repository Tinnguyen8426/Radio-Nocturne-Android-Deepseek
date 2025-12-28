package com.radio.nocturne.background;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.IBinder;
import android.util.Log;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BackgroundStory")
public class BackgroundStoryPlugin extends Plugin implements BackgroundStoryService.StoryListener {
    private static final String TAG = "BackgroundStory";
    private BackgroundStoryService service;
    private boolean bound = false;
    private BackgroundStoryService.GenerationConfig pendingConfig;

    private final ServiceConnection connection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder binder) {
            Log.d(TAG, "Service connected");
            BackgroundStoryService.LocalBinder localBinder = (BackgroundStoryService.LocalBinder) binder;
            service = localBinder.getService();
            bound = true;
            if (service != null) {
                service.registerListener(BackgroundStoryPlugin.this);
                if (pendingConfig != null) {
                    Log.d(TAG, "Starting pending generation");
                    service.startGeneration(pendingConfig);
                    pendingConfig = null;
                }
            }
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            Log.d(TAG, "Service disconnected");
            if (service != null) {
                service.unregisterListener();
            }
            service = null;
            bound = false;
        }
    };

    @Override
    protected void handleOnDestroy() {
        Log.d(TAG, "Plugin destroy");
        if (service != null) {
            service.unregisterListener();
        }
        if (bound) {
            Context context = getContext();
            if (context != null) {
                context.unbindService(connection);
            }
            bound = false;
        }
        service = null;
        super.handleOnDestroy();
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

        if (bound && service != null) {
            Log.d(TAG, "Service already bound, starting generation");
            service.startGeneration(config);
            pendingConfig = null;
        } else {
            Log.d(TAG, "Service not bound, queueing config and binding");
            pendingConfig = config;
            ensureService();
        }
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
        if (context == null) return;
        
        Intent intent = new Intent(context, BackgroundStoryService.class);
        try {
            ContextCompat.startForegroundService(context, intent);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start foreground service", e);
        }
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
        
        Double temp = call.getDouble("temperature");
        config.temperature = temp != null ? temp : 1.5;
        
        Double topP = call.getDouble("topP");
        config.topP = topP != null ? topP : 0.95;
        
        Integer maxTokens = call.getInt("maxTokens");
        config.maxTokens = maxTokens != null ? maxTokens : 8192;
        
        Integer storyMinWords = call.getInt("storyMinWords");
        config.storyMinWords = storyMinWords != null ? storyMinWords : 2000;
        
        Integer storyTargetWords = call.getInt("storyTargetWords");
        config.storyTargetWords = storyTargetWords != null ? storyTargetWords : 7200;
        
        Integer storyHardMaxWords = call.getInt("storyHardMaxWords");
        config.storyHardMaxWords = storyHardMaxWords != null ? storyHardMaxWords : 10000;
        
        Integer storyTimeoutMs = call.getInt("storyTimeoutMs");
        config.storyTimeoutMs = storyTimeoutMs != null ? storyTimeoutMs : 12 * 60 * 1000;
        
        Integer storyContextWords = call.getInt("storyContextWords");
        config.storyContextWords = storyContextWords != null ? storyContextWords : 320;
        
        Integer storyMaxPasses = call.getInt("storyMaxPasses");
        config.storyMaxPasses = storyMaxPasses != null ? storyMaxPasses : 12;
        
        Integer horrorLevel = call.getInt("horrorLevel");
        config.horrorLevel = horrorLevel != null ? horrorLevel : 50;
        
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