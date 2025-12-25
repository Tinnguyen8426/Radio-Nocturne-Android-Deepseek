package com.radio.nocturne.tts;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.IBinder;
import android.speech.tts.TextToSpeech;
import android.util.Log;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;

@CapacitorPlugin(name = "BackgroundTts")
public class BackgroundTtsPlugin extends Plugin implements BackgroundTtsService.TtsEventListener {
    private static final String TAG = "BackgroundTts";
    private BackgroundTtsService service;
    private boolean bound = false;
    private PendingSpeak pendingSpeak;

    private boolean ttsReady = false;
    private boolean ttsSupported = false;
    private Set<String> ttsAvailableLanguages = Collections.emptySet();
    private final List<PluginCall> pendingReadyCalls = new ArrayList<>();
    private String lastStartError;

    private record PendingSpeak(String text, String utteranceId, float rate, float pitch, String language, String title, PluginCall call) {}

    private final ServiceConnection connection =
        new ServiceConnection() {
            @Override
            public void onServiceConnected(ComponentName name, IBinder binder) {
                BackgroundTtsService.LocalBinder localBinder =
                    (BackgroundTtsService.LocalBinder) binder;
                service = localBinder.getService();
                bound = true;
                Log.d(TAG, "Service connected");
                service.registerListener(BackgroundTtsPlugin.this);

                if (pendingSpeak != null) {
                    speakInternal(pendingSpeak);
                    pendingSpeak = null;
                }
            }

            @Override
            public void onServiceDisconnected(ComponentName name) {
                if (service != null) {
                    service.unregisterListener(BackgroundTtsPlugin.this);
                }
                service = null;
                bound = false;
                ttsReady = false;
                Log.w(TAG, "Service disconnected");
            }
        };

    @Override
    protected void handleOnDestroy() {
        if (service != null) {
            service.unregisterListener(this);
        }
        if (bound) {
            getContext().unbindService(connection);
            bound = false;
        }
        service = null;
    }

    @Override
    public void onReady(boolean isSupported, Set<String> availableLanguages) {
        ttsReady = true;
        ttsSupported = isSupported;
        ttsAvailableLanguages = availableLanguages;
        synchronized (pendingReadyCalls) {
            for (PluginCall call : pendingReadyCalls) {
                if ("isSupported".equals(call.getMethodName())) {
                    resolveIsSupported(call);
                } else if ("getAvailableLanguages".equals(call.getMethodName())) {
                    resolveAvailableLanguages(call);
                }
            }
            pendingReadyCalls.clear();
        }
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        if (!ttsReady) {
            synchronized (pendingReadyCalls) {
                pendingReadyCalls.add(call);
            }
            if (!ensureService()) {
                synchronized (pendingReadyCalls) {
                    pendingReadyCalls.remove(call);
                }
                rejectServiceStart(call, "Unable to start TTS service");
            }
        } else {
            resolveIsSupported(call);
        }
    }

    private void resolveIsSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", ttsSupported);
        call.resolve(result);
    }

    @PluginMethod
    public void getAvailableLanguages(PluginCall call) {
        if (!ttsReady) {
            synchronized (pendingReadyCalls) {
                pendingReadyCalls.add(call);
            }
            if (!ensureService()) {
                synchronized (pendingReadyCalls) {
                    pendingReadyCalls.remove(call);
                }
                rejectServiceStart(call, "Unable to start TTS service");
            }
        } else {
            resolveAvailableLanguages(call);
        }
    }

    private void resolveAvailableLanguages(PluginCall call) {
        JSArray languages = new JSArray();
        for (String lang : ttsAvailableLanguages) {
            languages.put(lang);
        }
        JSObject result = new JSObject();
        result.put("languages", languages);
        call.resolve(result);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        String utteranceId = call.getString("utteranceId", "");
        String language = call.getString("language", "vi-VN");
        String title = call.getString("title", "Radio Nocturne");
        Double rateValue = call.getDouble("rate", 1.0);
        Double pitchValue = call.getDouble("pitch", 1.0);
        float rate = rateValue != null ? rateValue.floatValue() : 1.0f;
        float pitch = pitchValue != null ? pitchValue.floatValue() : 1.0f;

        if (text == null || text.trim().isEmpty()) {
            call.reject("Text is empty");
            return;
        }

        PendingSpeak pending = new PendingSpeak(text, utteranceId, rate, pitch, language, title, call);
        if (!bound || service == null) {
            pendingSpeak = pending;
            if (!ensureService()) {
                pendingSpeak = null;
                rejectServiceStart(call, "Unable to start TTS service");
            }
            return;
        }

        speakInternal(pending);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (service != null) {
            service.stopPlayback();
        }
        call.resolve();
    }

    @PluginMethod
    public void openTtsSettings(PluginCall call) {
        Intent intent = new Intent("com.android.settings.TTS_SETTINGS");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void installTtsData(PluginCall call) {
        Intent intent = new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void shutdown(PluginCall call) {
        if (service != null) {
            service.shutdown();
        }
        call.resolve();
    }

    private boolean ensureService() {
        if (bound) return true;
        Context context = getContext();
        if (context == null) {
            lastStartError = "Missing context";
            Log.e(TAG, "Cannot start service: " + lastStartError);
            return false;
        }
        Intent intent = new Intent(context, BackgroundTtsService.class);
        lastStartError = null;
        try {
            ContextCompat.startForegroundService(context, intent);
            Log.d(TAG, "Foreground service start requested");
        } catch (Exception e) {
            lastStartError = e.getMessage() != null ? e.getMessage() : e.toString();
            Log.e(TAG, "Failed to start foreground service", e);
        }

        try {
            boolean result = context.bindService(intent, connection, Context.BIND_AUTO_CREATE);
            if (result) {
                lastStartError = null;
                Log.d(TAG, "Service bind requested");
            } else if (lastStartError == null) {
                lastStartError = "Unable to bind TTS service";
                Log.e(TAG, "bindService returned false");
            }
            return result;
        } catch (Exception e) {
            if (lastStartError == null) {
                lastStartError = e.getMessage() != null ? e.getMessage() : e.toString();
            }
            Log.e(TAG, "Failed to bind service", e);
            return false;
        }
    }

    private void rejectServiceStart(PluginCall call, String fallback) {
        String message = lastStartError != null ? lastStartError : fallback;
        Log.e(TAG, "Rejecting call: " + message);
        call.reject(message);
    }

    private void speakInternal(PendingSpeak pending) {
        if (service == null) {
            Log.e(TAG, "Speak requested but service unavailable");
            pending.call.reject("TTS service unavailable");
            return;
        }
        try {
            service.speak(
                pending.text(),
                pending.utteranceId(),
                pending.rate(),
                pending.pitch(),
                pending.language(),
                pending.title()
            );
            pending.call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Failed to speak", e);
            pending.call.reject(e.getMessage() != null ? e.getMessage() : "TTS speak failed");
        }
    }

    @Override
    public void onStart(String utteranceId) {
        JSObject data = new JSObject();
        data.put("utteranceId", utteranceId);
        notifyListeners("ttsStart", data);
    }

    @Override
    public void onRangeStart(String utteranceId, int start, int end) {
        JSObject data = new JSObject();
        data.put("utteranceId", utteranceId);
        data.put("charIndex", start);
        data.put("end", end);
        notifyListeners("ttsProgress", data);
    }

    @Override
    public void onDone(String utteranceId) {
        JSObject data = new JSObject();
        data.put("utteranceId", utteranceId);
        notifyListeners("ttsDone", data);
    }

    @Override
    public void onError(String utteranceId, String error) {
        Log.w(TAG, "TTS error for " + utteranceId + ": " + error);
        JSObject data = new JSObject();
        data.put("utteranceId", utteranceId);
        data.put("error", error);
        notifyListeners("ttsError", data);
    }
}
