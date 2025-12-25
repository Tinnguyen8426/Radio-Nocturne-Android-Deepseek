package com.radio.nocturne.tts;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.media.AudioAttributes;
import android.os.Binder;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import com.radio.nocturne.MainActivity;
import com.radio.nocturne.R;
import java.util.Collections;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;

public class BackgroundTtsService extends Service {
    private static final String TAG = "BackgroundTtsService";
    public interface TtsEventListener {
        void onReady(boolean isSupported, Set<String> availableLanguages);
        void onStart(String utteranceId);
        void onRangeStart(String utteranceId, int start, int end);
        void onDone(String utteranceId);
        void onError(String utteranceId, String error);
    }

    public class LocalBinder extends Binder {
        public BackgroundTtsService getService() {
            return BackgroundTtsService.this;
        }
    }

    private static final String CHANNEL_ID = "radio_nocturne_tts";
    private static final int NOTIFICATION_ID = 3103;

    private final IBinder binder = new LocalBinder();
    private final CopyOnWriteArrayList<TtsEventListener> listeners = new CopyOnWriteArrayList<>();
    private TextToSpeech tts;
    private boolean ready = false;
    private boolean isForeground = false;
    private PendingSpeak pendingSpeak;
    private Set<String> availableLanguages;
    private boolean isSupported = false;

    @Override
    public void onCreate() {
        super.onCreate();
        initTts();
    }

    private void initTts() {
        if (tts != null) return;
        Log.d(TAG, "Service created");
        ready = false;
        tts = new TextToSpeech(getApplicationContext(), status -> {
            ready = status == TextToSpeech.SUCCESS;
            Log.d(TAG, "TTS init status: " + status);
            if (ready) {
                isSupported = tts.getEngines() != null && !tts.getEngines().isEmpty();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    tts.setAudioAttributes(
                        new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build()
                    );
                }
                try {
                    availableLanguages = tts.getAvailableLanguages()
                        .stream()
                        .map(Locale::toLanguageTag)
                        .collect(Collectors.toSet());
                } catch (Exception e) {
                    availableLanguages = Collections.emptySet();
                }
            } else {
                isSupported = false;
                availableLanguages = Collections.emptySet();
            }

            for (TtsEventListener listener : listeners) {
                listener.onReady(isSupported, availableLanguages);
            }

            if (ready && pendingSpeak != null) {
                speak(
                    pendingSpeak.text,
                    pendingSpeak.utteranceId,
                    pendingSpeak.rate,
                    pendingSpeak.pitch,
                    pendingSpeak.languageTag,
                    pendingSpeak.title
                );
                pendingSpeak = null;
            }
        });

        tts.setOnUtteranceProgressListener(
            new UtteranceProgressListener() {
                @Override
                public void onStart(String utteranceId) {
                    for (TtsEventListener listener : listeners) {
                        listener.onStart(utteranceId);
                    }
                }

                @Override
                public void onDone(String utteranceId) {
                    for (TtsEventListener listener : listeners) {
                        listener.onDone(utteranceId);
                    }
                }

                @Override
                public void onError(String utteranceId, int errorCode) {
                    for (TtsEventListener listener : listeners) {
                        listener.onError(utteranceId, "TTS error code: " + errorCode);
                    }
                }

                @Override
                public void onError(String utteranceId) {
                    for (TtsEventListener listener : listeners) {
                        listener.onError(utteranceId, "TTS error");
                    }
                }

                @Override
                public void onRangeStart(String utteranceId, int start, int end, int frame) {
                    for (TtsEventListener listener : listeners) {
                        listener.onRangeStart(utteranceId, start, end);
                    }
                }
            }
        );
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "onStartCommand");
        ensureForeground("Đang chuẩn bị phát...");
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        shutdown();
        super.onDestroy();
    }

    public boolean isReady() {
        return ready;
    }

    public boolean isSupported() {
        return isSupported;
    }

    public Set<String> getAvailableLanguages() {
        return availableLanguages;
    }

    public void registerListener(TtsEventListener listener) {
        if (!listeners.contains(listener)) {
            listeners.add(listener);
            if (ready) {
                listener.onReady(isSupported, availableLanguages);
            }
        }
    }

    public void unregisterListener(TtsEventListener listener) {
        listeners.remove(listener);
    }

    public void speak(String text, String utteranceId, float rate, float pitch, String languageTag, String title) {
        if (text == null || text.trim().isEmpty()) return;
        if (tts == null) {
            Log.w(TAG, "speak called but TTS is null, reinitializing");
            pendingSpeak = new PendingSpeak(text, utteranceId, rate, pitch, languageTag, title);
            initTts();
            return;
        }
        if (!ready) {
            Log.w(TAG, "speak called before TTS ready");
            pendingSpeak = new PendingSpeak(text, utteranceId, rate, pitch, languageTag, title);
            return;
        }
        ensureForeground(title != null ? title : "Radio Nocturne");

        tts.setSpeechRate(rate);
        tts.setPitch(pitch);

        Locale locale = Locale.forLanguageTag(languageTag);
        if (availableLanguages != null && !availableLanguages.contains(languageTag)) {
            Log.w(TAG, "Language not supported: " + languageTag);
            for (TtsEventListener listener : listeners) {
                listener.onError(utteranceId, "Language not supported: " + languageTag);
            }
            return;
        }

        int langResult = tts.setLanguage(locale);
        if (langResult == TextToSpeech.LANG_MISSING_DATA || langResult == TextToSpeech.LANG_NOT_SUPPORTED) {
            Log.w(TAG, "Language not supported by engine: " + languageTag);
            for (TtsEventListener listener : listeners) {
                listener.onError(utteranceId, "Language not supported");
            }
            return;
        }

        Log.d(TAG, "Speaking utterance " + utteranceId);
        Bundle params = new Bundle();
        params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId);
    }

    public void stopPlayback() {
        if (tts != null) {
            tts.stop();
        }
        pendingSpeak = null;
        stopForegroundCompat();
    }

    public void shutdown() {
        stopPlayback();
        if (tts != null) {
            tts.shutdown();
            tts = null;
        }
        ready = false;
        isSupported = false;
        availableLanguages = Collections.emptySet();
        stopSelf();
    }

    private void ensureForeground(String title) {
        Notification notification = buildNotification(title);
        if (isForeground) {
            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.notify(NOTIFICATION_ID, notification);
            }
            return;
        }
        startForeground(NOTIFICATION_ID, notification);
        isForeground = true;
    }

    private void stopForegroundCompat() {
        if (!isForeground) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        isForeground = false;
    }

    private Notification buildNotification(String title) {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Radio Nocturne TTS",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Background narration playback");
            manager.createNotificationChannel(channel);
        }

        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction(Intent.ACTION_MAIN);
        intent.addCategory(Intent.CATEGORY_LAUNCHER);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, intent, flags);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Radio Nocturne")
            .setContentText(title == null || title.isEmpty() ? "Đang phát truyện" : title)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build();
    }

    private static class PendingSpeak {
        final String text;
        final String utteranceId;
        final float rate;
        final float pitch;
        final String languageTag;
        final String title;

        PendingSpeak(
            String text,
            String utteranceId,
            float rate,
            float pitch,
            String languageTag,
            String title
        ) {
            this.text = text;
            this.utteranceId = utteranceId;
            this.rate = rate;
            this.pitch = pitch;
            this.languageTag = languageTag;
            this.title = title;
        }
    }
}
