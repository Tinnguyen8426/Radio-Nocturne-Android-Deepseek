package com.radio.nocturne.tts;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.pm.ServiceInfo;
import android.content.Intent;
import android.media.AudioAttributes;
import android.os.Binder;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;
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
        void onStart(String utteranceId, String sessionId);
        void onRangeStart(String utteranceId, int start, int end, int absoluteStart, String sessionId);
        void onDone(String utteranceId, int nextOffset, boolean isFinal, String sessionId);
        void onError(String utteranceId, String error, String sessionId);
    }

    public class LocalBinder extends Binder {
        public BackgroundTtsService getService() {
            return BackgroundTtsService.this;
        }
    }

    private static final String CHANNEL_ID = "radio_nocturne_tts";
    private static final int NOTIFICATION_ID = 3103;
    private static final int CHUNK_GRANULARITY = 700;

    private final IBinder binder = new LocalBinder();
    private final CopyOnWriteArrayList<TtsEventListener> listeners = new CopyOnWriteArrayList<>();
    private TextToSpeech tts;
    private boolean ready = false;
    private boolean isForeground = false;
    private PendingSpeak pendingSpeak;
    private PendingContinuousSpeak pendingContinuousSpeak;
    private Set<String> availableLanguages;
    private boolean isSupported = false;
    private PowerManager.WakeLock wakeLock;
    private boolean continuousMode = false;
    private String continuousText;
    private int continuousOffset = 0;
    private int currentChunkStart = 0;
    private int currentChunkEnd = 0;
    private float continuousRate = 1f;
    private float continuousPitch = 1f;
    private String continuousLanguageTag = "vi-VN";
    private String continuousTitle = "Radio Nocturne";
    private String currentSessionId = "";

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

            if (ready && pendingContinuousSpeak != null) {
                speakContinuous(
                    pendingContinuousSpeak.text,
                    pendingContinuousSpeak.startOffset,
                    pendingContinuousSpeak.rate,
                    pendingContinuousSpeak.pitch,
                    pendingContinuousSpeak.languageTag,
                    pendingContinuousSpeak.title,
                    pendingContinuousSpeak.sessionId
                );
                pendingContinuousSpeak = null;
            } else if (ready && pendingSpeak != null) {
                speak(
                    pendingSpeak.text,
                    pendingSpeak.utteranceId,
                    pendingSpeak.rate,
                    pendingSpeak.pitch,
                    pendingSpeak.languageTag,
                    pendingSpeak.title,
                    pendingSpeak.sessionId
                );
                pendingSpeak = null;
            }
        });

        tts.setOnUtteranceProgressListener(
            new UtteranceProgressListener() {
                @Override
                public void onStart(String utteranceId) {
                    for (TtsEventListener listener : listeners) {
                        listener.onStart(utteranceId, currentSessionId);
                    }
                }

                @Override
                public void onDone(String utteranceId) {
                    boolean isFinal = true;
                    int nextOffset = currentChunkEnd;
                    if (continuousMode && continuousText != null && continuousOffset < continuousText.length()) {
                        isFinal = false;
                        speakNextChunk();
                    } else {
                        continuousMode = false;
                        releaseWakeLock();
                    }
                    for (TtsEventListener listener : listeners) {
                        listener.onDone(utteranceId, nextOffset, isFinal, currentSessionId);
                    }
                }

                @Override
                public void onError(String utteranceId, int errorCode) {
                    continuousMode = false;
                    releaseWakeLock();
                    for (TtsEventListener listener : listeners) {
                        listener.onError(utteranceId, "TTS error code: " + errorCode, currentSessionId);
                    }
                }

                @Override
                public void onError(String utteranceId) {
                    continuousMode = false;
                    releaseWakeLock();
                    for (TtsEventListener listener : listeners) {
                        listener.onError(utteranceId, "TTS error", currentSessionId);
                    }
                }

                @Override
                public void onRangeStart(String utteranceId, int start, int end, int frame) {
                    int absoluteStart = currentChunkStart + start;
                    for (TtsEventListener listener : listeners) {
                        listener.onRangeStart(utteranceId, start, end, absoluteStart, currentSessionId);
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
        initTts();
        ensureForeground("Đang chuẩn bị phát...");
        return START_STICKY;
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

    public void speak(
        String text,
        String utteranceId,
        float rate,
        float pitch,
        String languageTag,
        String title,
        String sessionId
    ) {
        if (text == null || text.trim().isEmpty()) return;
        if (tts == null) {
            Log.w(TAG, "speak called but TTS is null, reinitializing");
            pendingSpeak = new PendingSpeak(text, utteranceId, rate, pitch, languageTag, title, sessionId);
            initTts();
            return;
        }
        if (!ready) {
            Log.w(TAG, "speak called before TTS ready");
            pendingSpeak = new PendingSpeak(text, utteranceId, rate, pitch, languageTag, title, sessionId);
            return;
        }
        continuousMode = false;
        continuousText = null;
        continuousOffset = 0;
        currentSessionId = sessionId != null ? sessionId : "";
        ensureForeground(title != null ? title : "Radio Nocturne");
        acquireWakeLock();

        tts.setSpeechRate(rate);
        tts.setPitch(pitch);

        Locale locale = Locale.forLanguageTag(languageTag);
        if (availableLanguages != null && !availableLanguages.contains(languageTag)) {
            Log.w(TAG, "Language not supported: " + languageTag);
            for (TtsEventListener listener : listeners) {
                listener.onError(utteranceId, "Language not supported: " + languageTag, currentSessionId);
            }
            return;
        }

        int langResult = tts.setLanguage(locale);
        if (langResult == TextToSpeech.LANG_MISSING_DATA || langResult == TextToSpeech.LANG_NOT_SUPPORTED) {
            Log.w(TAG, "Language not supported by engine: " + languageTag);
            for (TtsEventListener listener : listeners) {
                listener.onError(utteranceId, "Language not supported", currentSessionId);
            }
            return;
        }

        Log.d(TAG, "Speaking utterance " + utteranceId);
        Bundle params = new Bundle();
        params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);
        currentChunkStart = 0;
        currentChunkEnd = text.length();
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId);
    }

    public void speakContinuous(
        String text,
        int startOffset,
        float rate,
        float pitch,
        String languageTag,
        String title,
        String sessionId
    ) {
        if (text == null || text.trim().isEmpty()) return;
        if (tts == null) {
            Log.w(TAG, "speakContinuous called but TTS is null, reinitializing");
            pendingContinuousSpeak =
                new PendingContinuousSpeak(text, startOffset, rate, pitch, languageTag, title, sessionId);
            initTts();
            return;
        }
        if (!ready) {
            Log.w(TAG, "speakContinuous called before TTS ready");
            pendingContinuousSpeak =
                new PendingContinuousSpeak(text, startOffset, rate, pitch, languageTag, title, sessionId);
            return;
        }

        continuousMode = true;
        continuousText = text;
        continuousOffset = Math.max(0, Math.min(startOffset, text.length()));
        continuousRate = rate;
        continuousPitch = pitch;
        continuousLanguageTag = languageTag != null ? languageTag : "vi-VN";
        continuousTitle = title != null ? title : "Radio Nocturne";
        currentSessionId = sessionId != null ? sessionId : "";

        ensureForeground(continuousTitle);
        acquireWakeLock();
        tts.stop();
        speakNextChunk();
    }

    private void speakNextChunk() {
        if (continuousText == null) {
            continuousMode = false;
            releaseWakeLock();
            return;
        }
        int start = Math.max(0, Math.min(continuousOffset, continuousText.length()));
        if (start >= continuousText.length()) {
            continuousMode = false;
            releaseWakeLock();
            return;
        }

        int end = computeChunkEnd(continuousText, start);
        if (end <= start) {
            continuousMode = false;
            releaseWakeLock();
            return;
        }

        String chunkText = continuousText.substring(start, end);
        currentChunkStart = start;
        currentChunkEnd = end;
        continuousOffset = end;

        Locale locale = Locale.forLanguageTag(continuousLanguageTag);
        if (availableLanguages != null && !availableLanguages.contains(continuousLanguageTag)) {
            Log.w(TAG, "Language not supported: " + continuousLanguageTag);
            for (TtsEventListener listener : listeners) {
                listener.onError("", "Language not supported: " + continuousLanguageTag, currentSessionId);
            }
            continuousMode = false;
            releaseWakeLock();
            return;
        }

        int langResult = tts.setLanguage(locale);
        if (langResult == TextToSpeech.LANG_MISSING_DATA || langResult == TextToSpeech.LANG_NOT_SUPPORTED) {
            Log.w(TAG, "Language not supported by engine: " + continuousLanguageTag);
            for (TtsEventListener listener : listeners) {
                listener.onError("", "Language not supported", currentSessionId);
            }
            continuousMode = false;
            releaseWakeLock();
            return;
        }

        tts.setSpeechRate(continuousRate);
        tts.setPitch(continuousPitch);

        String utteranceId = "rn_cont_" + System.currentTimeMillis();
        Bundle params = new Bundle();
        params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);
        tts.speak(chunkText, TextToSpeech.QUEUE_FLUSH, params, utteranceId);
    }

    private int computeChunkEnd(String source, int start) {
        int maxEnd = Math.min(source.length(), start + CHUNK_GRANULARITY);
        if (start >= maxEnd) return start;

        String slice = source.substring(start, maxEnd);
        int newlineIdx = slice.lastIndexOf('\n');
        if (newlineIdx > 80) {
            return start + newlineIdx + 1;
        }

        int punctuationIdx = -1;
        for (int i = 0; i < slice.length() - 1; i++) {
            char current = slice.charAt(i);
            char next = slice.charAt(i + 1);
            if ((current == '.' || current == '!' || current == '?') && Character.isWhitespace(next)) {
                punctuationIdx = i + 2;
            }
        }
        if (punctuationIdx > 120) {
            return start + punctuationIdx;
        }
        return maxEnd;
    }

    public void stopPlayback() {
        if (tts != null) {
            tts.stop();
        }
        pendingSpeak = null;
        pendingContinuousSpeak = null;
        continuousMode = false;
        continuousText = null;
        currentSessionId = "";
        stopForegroundCompat();
        releaseWakeLock();
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        isForeground = true;
    }

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "RadioNocturne:Tts");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire();
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        wakeLock = null;
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
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build();
    }

    private static class PendingSpeak {
        final String text;
        final String utteranceId;
        final float rate;
        final float pitch;
        final String languageTag;
        final String title;
        final String sessionId;

        PendingSpeak(
            String text,
            String utteranceId,
            float rate,
            float pitch,
            String languageTag,
            String title,
            String sessionId
        ) {
            this.text = text;
            this.utteranceId = utteranceId;
            this.rate = rate;
            this.pitch = pitch;
            this.languageTag = languageTag;
            this.title = title;
            this.sessionId = sessionId;
        }
    }

    private static class PendingContinuousSpeak {
        final String text;
        final int startOffset;
        final float rate;
        final float pitch;
        final String languageTag;
        final String title;
        final String sessionId;

        PendingContinuousSpeak(
            String text,
            int startOffset,
            float rate,
            float pitch,
            String languageTag,
            String title,
            String sessionId
        ) {
            this.text = text;
            this.startOffset = startOffset;
            this.rate = rate;
            this.pitch = pitch;
            this.languageTag = languageTag;
            this.title = title;
            this.sessionId = sessionId;
        }
    }
}
