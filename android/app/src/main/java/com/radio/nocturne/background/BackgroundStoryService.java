package com.radio.nocturne.background;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Binder;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import com.radio.nocturne.MainActivity;
import java.io.IOException;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.TimeUnit;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Call;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;
import okio.BufferedSource;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class BackgroundStoryService extends Service {
    private static final int DEFAULT_HORROR_LEVEL = 50;
    public interface StoryListener {
        void onChunk(String text);
        void onDone(String fullText, String newText);
        void onError(String message, boolean aborted);
    }

    public class LocalBinder extends Binder {
        public BackgroundStoryService getService() {
            return BackgroundStoryService.this;
        }
    }

    private static final String CHANNEL_ID = "radio_nocturne_story";
    private static final int NOTIFICATION_ID = 3110;
    private static final MediaType JSON = MediaType.parse("application/json; charset=utf-8");

    private final IBinder binder = new LocalBinder();
    private ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean cancelled = new AtomicBoolean(false);

    private OkHttpClient client;
    private StoryListener listener;
    private String currentFullText = "";
    private String currentNewText = "";
    private boolean running = false;
    private Call activeCall;
    private PowerManager.WakeLock wakeLock;

    private static final long UPDATE_INTERVAL_MS = 2000; // 2 seconds throttle
    private long lastNotificationUpdate = 0;
    private NotificationManager notificationManager;

    @Override
    public void onCreate() {
        super.onCreate();
        client = new OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .build();
        notificationManager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIFICATION_ID, buildNotification("Đang chuẩn bị tạo truyện..."));
        return START_STICKY;
    }

    private void updateNotification(String contentText) {
        if (notificationManager == null) return;
        notificationManager.notify(NOTIFICATION_ID, buildNotification(contentText));
    }

    public void registerListener(StoryListener storyListener) {
        listener = storyListener;
    }

    public void unregisterListener() {
        listener = null;
    }

    public boolean isRunning() {
        return running;
    }

    public String getCurrentFullText() {
        return currentFullText;
    }

    private static boolean isApproachingEnding(String text) {
        if (text == null || text.length() < 1000) return false;
        String tail = text.substring(text.length() - 800).toLowerCase(Locale.ROOT);

        String[] hostKeywords = {
            "tôi là morgan",
            "đây là morgan",
            "morgan hayes",
            "radio truyện đêm khuya",
            "lời cảnh tỉnh",
            "kết thúc bản ghi",
            "bản ghi âm dừng lại",
            "tín hiệu biến mất",
            "chúc các bạn",
            "đêm ngon giấc"
        };

        for (String kw : hostKeywords) {
            if (tail.contains(kw)) return true;
        }
        return false;
    }

    private static boolean hasOutroSignature(String text, String signature) {
        if (text == null || signature == null || signature.isEmpty()) return false;
        String trimmed = text.trim();
        if (trimmed.isEmpty()) return false;

        // 1. Exact match
        if (trimmed.contains(signature)) return true;

        String tail = trimmed.substring(Math.max(0, trimmed.length() - 1000)).toLowerCase(Locale.ROOT);

        // 2. Strict Semantic Match
        // We want to ensure the specific closing phrase is present, not just generic "tạm dừng".
        boolean hasHostName = tail.contains("morgan hayes");
        boolean hasStationName = tail.contains("radio truyện đêm khuya");

        if (hasHostName || hasStationName) {
            String[] specificClosingSignals = {
                "xin phép được tạm dừng tại đây",
                "đêm ngon giấc nếu còn có thể",
                "chúc các bạn có một đêm ngon giấc"
            };
            
            for (String signal : specificClosingSignals) {
                if (tail.contains(signal)) return true;
            }
        }

        return false;
    }

    public synchronized void startGeneration(GenerationConfig config) {
        cancel();
        cancelled.set(false);
        ensureFlavor(config);
        running = true;
        startForeground(NOTIFICATION_ID, buildNotification("Đang tạo truyện..."));
        acquireWakeLock();
        executor.submit(() -> runGeneration(config));
    }

    public synchronized void cancel() {
        cancelled.set(true);
        running = false;
        if (activeCall != null) {
            activeCall.cancel();
        }
        releaseWakeLock();
        stopForegroundCompat();
        restartExecutor();
    }

    private void runGeneration(GenerationConfig config) {
        currentFullText = config.existingText != null ? config.existingText : "";
        currentNewText = "";
        String fullText = currentFullText;
        int maxPasses = Math.max(1, config.storyMaxPasses);
        
        // Initial notification update
        updateNotification("Đang tạo truyện... (0 từ)");

        try {
            for (int passIndex = 0; passIndex < maxPasses; passIndex++) {
                if (cancelled.get()) {
                    notifyError("Aborted", true);
                    stopForegroundCompat();
                    return;
                }
                if (hasOutroSignature(fullText, config.outroSignature)) {
                    break;
                }

                int wordsSoFar = countWords(fullText);
                boolean hardCapReached = config.storyHardMaxWords > 0 && wordsSoFar >= config.storyHardMaxWords;
                boolean minReached = wordsSoFar >= config.storyMinWords;

                boolean isFirstPass = wordsSoFar == 0;
                boolean isLastPass = passIndex == maxPasses - 1;
                boolean approachingEnd = isApproachingEnding(fullText);
                String mode = (minReached || hardCapReached || isLastPass || approachingEnd) ? "finalize" : "continue";

                String prompt = isFirstPass
                    ? getMorganHayesPrompt(config, config.topic)
                    : getContinuationPrompt(config, config.topic, fullText, mode);

                String generated = runPass(config, prompt, fullText, false); // Normal pass
                currentNewText += generated;
                fullText += generated;
                currentFullText = fullText;

                int wordsAfter = countWords(fullText);
                boolean doneEnough = wordsAfter >= config.storyMinWords;
                boolean finished = hasOutroSignature(fullText, config.outroSignature);
                boolean hitHardMax = config.storyHardMaxWords > 0 && wordsAfter >= config.storyHardMaxWords;
                
                if (finished) break;

                // Emergency Outro Trigger (matching TS logic):
                // 1. Last pass. 2. Hit hard max. 3. Over 120% of target.
                boolean isOverTarget = config.storyTargetWords > 0 && wordsAfter > (config.storyTargetWords * 1.2);
                if ((isLastPass || hitHardMax || isOverTarget) && !finished) {
                    String emergencyOutroPrompt = 
                        "EMERGENCY OUTRO INSTRUCTION:\n" +
                        "You have exceeded the target length. The transmission is cutting off. You MUST end the story NOW.\n" +
                        "1. Deliver a swift, brutal conclusion.\n" +
                        "2. Immediately switch to Morgan Hayes.\n" +
                        "3. Deliver the final signature: \"" + config.outroSignature + "\"\n" +
                        "END IT.";
                    String emergencyOutro = runPass(config, emergencyOutroPrompt, fullText, true); // Emergency pass
                    fullText += emergencyOutro;
                    currentFullText = fullText;
                    break;
                }

                if (hitHardMax) break;
            }

            updateNotification("Đã hoàn thành (" + countWords(fullText) + " từ)");
            notifyDone(fullText, currentNewText);
        } catch (Exception e) {
            notifyError(e.getMessage() == null ? "Generation failed" : e.getMessage(), false);
        } finally {
            running = false;
            releaseWakeLock();
            stopForegroundCompat();
        }
    }

    // ... (keep existing methods)

    private String runPass(GenerationConfig config, String prompt, String currentTotalText, boolean isEmergency) throws IOException {
        JSONObject payload = new JSONObject();
        // ... (keep existing JSON building code)
        try {
            payload.put("model", config.model);
            payload.put("temperature", config.temperature);
            payload.put("top_p", config.topP);
            payload.put("max_tokens", config.maxTokens);
            payload.put("stream", true);
            JSONArray messages = new JSONArray();
            JSONObject msg = new JSONObject();
            msg.put("role", "user");
            msg.put("content", prompt);
            messages.put(msg);
            payload.put("messages", messages);
        } catch (JSONException ignored) {
        }

        RequestBody body = RequestBody.create(payload.toString(), JSON);
        Request request = new Request.Builder()
            .url(config.baseUrl + "/chat/completions")
            .addHeader("Authorization", "Bearer " + config.apiKey)
            .addHeader("Content-Type", "application/json")
            .addHeader("Accept", "text/event-stream")
            .addHeader("Cache-Control", "no-cache")
            .post(body)
            .build();

        long startTime = SystemClock.elapsedRealtime();
        Call call = client.newCall(request);
        activeCall = call;
        
        // Track local text to calculate total words properly during streaming
        StringBuilder passGenerated = new StringBuilder(); 
        
        try (Response response = call.execute()) {
            if (!response.isSuccessful()) {
                String err = response.body() != null ? response.body().string() : "";
                throw new IOException("DeepSeek API error " + response.code() + ": " + err);
            }

            ResponseBody responseBody = response.body();
            if (responseBody == null) return "";

            String contentType = response.header("content-type", "");
            if (contentType == null || !contentType.contains("text/event-stream")) {
                // ... (keep existing non-stream handling)
                String raw = responseBody.string();
                String text = extractTextFromJson(raw);
                if (text != null && !text.isEmpty()) {
                    String trimmed = truncateAfterSignature(text, config.outroSignature);
                    notifyChunk(trimmed);
                    return trimmed;
                }
                return "";
            }

            BufferedSource source = responseBody.source();
            String signature = config.outroSignature == null ? "" : config.outroSignature;
            boolean signatureReached = false;
            
            while (!source.exhausted()) {
                if (cancelled.get()) {
                    notifyError("Aborted", true);
                    return "";
                }
                if (config.storyTimeoutMs > 0 && SystemClock.elapsedRealtime() - startTime > config.storyTimeoutMs) {
                    throw new IOException("Story generation timed out.");
                }

                String line = source.readUtf8Line();
                if (line == null) break;
                line = line.trim();
                if (!line.startsWith("data:")) continue;
                String jsonStr = line.replaceFirst("^data:\\s*", "");
                if ("[DONE]".equals(jsonStr)) break;
                String text = extractTextFromJson(jsonStr);
                if (text != null && !text.isEmpty() && !signatureReached) {
                    int beforeLength = passGenerated.length();
                    passGenerated.append(text);
                    if (!signature.isEmpty()) {
                        int idx = passGenerated.lastIndexOf(signature);
                        if (idx >= 0) {
                            int end = idx + signature.length();
                            if (passGenerated.length() > end) {
                                passGenerated.setLength(end);
                            }
                            signatureReached = true;
                            int allowed = Math.max(0, end - beforeLength);
                            if (allowed > 0) {
                                notifyChunk(text.substring(0, Math.min(text.length(), allowed)));
                            }
                            // Don't break immediately, allow UI update
                        } else {
                             notifyChunk(text);
                        }
                    } else {
                        notifyChunk(text);
                    }
                    
                    if (signatureReached) break;

                    // THROTTLING NOTIFICATION UPDATES
                    long now = SystemClock.elapsedRealtime();
                    if (now - lastNotificationUpdate > UPDATE_INTERVAL_MS) {
                        int currentWordCount = countWords(currentTotalText + passGenerated.toString());
                        updateNotification("Đang tạo... " + currentWordCount + " từ");
                        lastNotificationUpdate = now;
                    }

                    // LENGTH CHECK (with emergency overdraft)
                    int totalWords = countWords(currentTotalText + passGenerated.toString());
                    int limit = isEmergency ? (config.storyHardMaxWords + 500) : config.storyHardMaxWords;
                    if (config.storyHardMaxWords > 0 && totalWords >= limit) {
                        break;
                    }
                }
            }
            return passGenerated.toString();
        } finally {
            activeCall = null;
        }
    }

    private String extractTextFromJson(String raw) {
        if (raw == null || raw.isEmpty()) return "";
        try {
            JSONObject parsed = new JSONObject(raw);
            JSONObject choice = parsed.optJSONArray("choices") != null
                ? parsed.optJSONArray("choices").optJSONObject(0)
                : null;
            if (choice != null) {
                JSONObject delta = choice.optJSONObject("delta");
                if (delta != null && delta.has("content")) {
                    return safeJsonString(delta, "content");
                }
                JSONObject message = choice.optJSONObject("message");
                if (message != null && message.has("content")) {
                    return safeJsonString(message, "content");
                }
                if (choice.has("text")) {
                    return safeJsonString(choice, "text");
                }
            }
            JSONArray output = parsed.optJSONArray("output");
            if (output != null && output.length() > 0) {
                JSONObject outputItem = output.optJSONObject(0);
                if (outputItem != null) {
                    JSONArray content = outputItem.optJSONArray("content");
                    if (content != null && content.length() > 0) {
                        JSONObject contentItem = content.optJSONObject(0);
                        if (contentItem != null) {
                            return safeJsonString(contentItem, "text");
                        }
                    }
                }
            }
        } catch (JSONException ignored) {
        }
        return "";
    }

    private static String safeJsonString(JSONObject obj, String key) {
        if (obj == null || key == null || !obj.has(key) || obj.isNull(key)) return "";
        String value = obj.optString(key, "");
        return "null".equalsIgnoreCase(value) ? "" : value;
    }

    private static String truncateAfterSignature(String text, String signature) {
        if (text == null || text.isEmpty() || signature == null || signature.isEmpty()) return text;
        int idx = text.lastIndexOf(signature);
        if (idx < 0) return text;
        int end = idx + signature.length();
        if (end >= text.length()) return text;
        return text.substring(0, end);
    }

    private void notifyChunk(String text) {
        if (listener != null && text != null && !text.isEmpty()) {
            listener.onChunk(text);
        }
    }

    private void notifyDone(String fullText, String newText) {
        if (listener != null) {
            listener.onDone(fullText, newText);
        }
    }

    private void notifyError(String message, boolean aborted) {
        if (listener != null) {
            listener.onError(message, aborted);
        }
    }

    private Notification buildNotification(String title) {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Radio Nocturne Generation",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Background story generation");
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
            .setContentText(title == null || title.isEmpty() ? "Đang tạo truyện..." : title)
            .setSmallIcon(android.R.drawable.ic_menu_edit)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build();
    }

    private void stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
    }

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "RadioNocturne:Story");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire();
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        wakeLock = null;
    }

    private void restartExecutor() {
        if (executor != null && !executor.isShutdown()) {
            executor.shutdownNow();
        }
        executor = Executors.newSingleThreadExecutor();
    }

    private static int countWords(String text) {
        String trimmed = text == null ? "" : text.trim();
        if (trimmed.isEmpty()) return 0;
        String normalized = trimmed.replaceAll("\\s+", " ");
        return normalized.split(" ").length;
    }

    private static String getContextSnippet(String text, int maxWords) {
        if (text == null || text.trim().isEmpty()) return "";
        String[] words = text.trim().replaceAll("\\s+", " ").split(" ");
        if (words.length <= maxWords) {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < words.length; i++) {
                if (i > 0) sb.append(" ");
                sb.append(words[i]);
            }
            return sb.toString();
        }
        int start = Math.max(0, words.length - maxWords);
        StringBuilder builder = new StringBuilder();
        for (int i = start; i < words.length; i++) {
            if (i > start) builder.append(" ");
            builder.append(words[i]);
        }
        return builder.toString();
    }

    private static String getHorrorInstruction(int level) {
        if (level <= 30) {
            return "Horror intensity: low. Keep the uncanny subtle and mostly psychological; minimize overt supernatural spectacle.";
        }
        if (level <= 70) {
            return "Horror intensity: balanced. Mix subtle dread with occasional supernatural intrusions.";
        }
        return "Horror intensity: high. Make the supernatural overt, oppressive, and relentless.";
    }

    private static String getNarrativeInstruction(String style) {
        if (style == null) return "";
        switch (style) {
            case "confession":
                return "Narrative style: confession/testimony, raw and self-incriminating.";
            case "dossier":
                return "Narrative style: dossier/compiled evidence; still plain text (no bullet lists).";
            case "diary":
                return "Narrative style: diary or personal notes, intimate and fragmented.";
            case "investigation":
                return "Narrative style: investigative field report, skeptical but first-person.";
            default:
                return "";
        }
    }

    private static final String[] FLAVOR_ENGINES = new String[] {
        "investigation spiral",
        "social contagion/meme",
        "personal haunting",
        "bureaucratic trap",
        "mistaken identity",
        "slow replacement",
        "reality loop",
        "collective delusion",
        "ritual obligation"
    };

    private static final String[] FLAVOR_REVEALS = new String[] {
        "leaked minutes",
        "corrupted email thread",
        "court transcript",
        "maintenance ticket logs",
        "voice-to-text diary",
        "photo metadata",
        "missing persons dossier",
        "old receipts and stamps trail",
        "handwritten marginalia"
    };

    private static final String[] FLAVOR_ENDINGS = new String[] {
        "memory overwrite",
        "identity swap",
        "time reset with a scar",
        "coerced silence",
        "ritual erasure",
        "audience complicity",
        "permanent dislocation",
        "social disappearance"
    };

    private static final String[] FLAVOR_TONES = new String[] {
        "bleak noir",
        "paranoid and intimate",
        "clinical and cold",
        "elegiac",
        "dry and matter-of-fact",
        "fever-dream dread"
    };

    private static final String[] FLAVOR_PROTAGONIST_NAMES = new String[] {
        "Evelyn Ward",
        "Jonah Price",
        "Mara Linden",
        "Theo Alvarez",
        "Nadia Petrov",
        "Arjun Rao",
        "Iris Ko",
        "Maya Bishop",
        "Caleb Hart",
        "Lena Voss",
        "Owen Reyes",
        "Sora Kaito",
        "Nico Laurent",
        "Daria Novak",
        "Amir Haddad",
        "Lea Fischer",
        "Rui Tan",
        "Eva Morland",
        "Silas Quinn",
        "Noah Mercer"
    };

    private static final String[] FLAVOR_PROTAGONIST_ROLES = new String[] {
        "night-shift security guard",
        "ride-share driver",
        "apartment manager",
        "ER nurse",
        "delivery rider",
        "library archivist",
        "subway technician",
        "court clerk",
        "mortuary assistant",
        "radio repair tech",
        "paralegal",
        "school counselor",
        "warehouse picker",
        "building inspector",
        "call center agent",
        "photo lab worker"
    };

    private static final String[] FLAVOR_SETTINGS = new String[] {
        "a mid-rise apartment block",
        "a suburban strip mall",
        "a municipal service center",
        "a night bus route",
        "a hospital wing",
        "a riverside neighborhood",
        "an old market",
        "a commuter station",
        "a rooftop water tank",
        "a storage facility",
        "a co-working office",
        "a public housing tower"
    };

    private static final String[] FLAVOR_EVIDENCE_ORIGINS = new String[] {
        "a sealed envelope slid under the studio door",
        "a memory card mailed with no return address",
        "a voicemail sent from a number that no longer exists",
        "a torn notebook left on the studio steps",
        "a bundle of photocopies from a municipal office",
        "a taxi receipt with handwritten notes",
        "a flash drive found in the station mailbox",
        "a burned CD recovered from a thrift store"
    };

    private static final String[] FLAVOR_MOTIFS = new String[] {
        "a missing door",
        "a repeated address",
        "a symbol drawn in chalk",
        "a list of names",
        "a flickering streetlight pattern",
        "a receipt stamp",
        "a familiar scent",
        "a wrong date",
        "a locked room",
        "a red thread"
    };

    private static final String[] FLAVOR_INTRO_MOODS = new String[] {
        "a humid night with power flickers",
        "thin rain against the window",
        "a quiet city after the last train",
        "wind scraping the rooftop antenna",
        "a sleepless neon glow",
        "a cold night with empty streets"
    };

    private static String pickRandom(String[] items) {
        if (items == null || items.length == 0) return "";
        int idx = (int) (Math.random() * items.length);
        if (idx < 0 || idx >= items.length) idx = 0;
        return items[idx];
    }

    private static String normalizeFlavor(String value, String fallback) {
        if (value == null) return fallback;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? fallback : trimmed;
    }

    private static void ensureFlavor(GenerationConfig config) {
        if (config == null) return;
        config.storyEngine = normalizeFlavor(config.storyEngine, pickRandom(FLAVOR_ENGINES));
        config.storyRevealMethod = normalizeFlavor(config.storyRevealMethod, pickRandom(FLAVOR_REVEALS));
        config.storyEndingMode = normalizeFlavor(config.storyEndingMode, pickRandom(FLAVOR_ENDINGS));
        config.storyTone = normalizeFlavor(config.storyTone, pickRandom(FLAVOR_TONES));
        config.storyProtagonistName =
            normalizeFlavor(config.storyProtagonistName, pickRandom(FLAVOR_PROTAGONIST_NAMES));
        config.storyProtagonistRole =
            normalizeFlavor(config.storyProtagonistRole, pickRandom(FLAVOR_PROTAGONIST_ROLES));
        config.storyPrimarySetting =
            normalizeFlavor(config.storyPrimarySetting, pickRandom(FLAVOR_SETTINGS));
        config.storyEvidenceOrigin =
            normalizeFlavor(config.storyEvidenceOrigin, pickRandom(FLAVOR_EVIDENCE_ORIGINS));
        config.storyKeyMotif = normalizeFlavor(config.storyKeyMotif, pickRandom(FLAVOR_MOTIFS));
        config.storyIntroMood = normalizeFlavor(config.storyIntroMood, pickRandom(FLAVOR_INTRO_MOODS));
    }

    private static String buildFlavorBlock(GenerationConfig config) {
        if (config == null) return "";
        return (
            "VARIATION ANCHOR (MANDATORY)\n" +
            "- Narrative engine: " + config.storyEngine + "\n" +
            "- Reveal method: " + config.storyRevealMethod + "\n" +
            "- Ending mode: " + config.storyEndingMode + "\n" +
            "- Tone bias: " + config.storyTone + "\n" +
            "- Protagonist name: " + config.storyProtagonistName + "\n" +
            "- Protagonist role: " + config.storyProtagonistRole + "\n" +
            "- Primary setting: " + config.storyPrimarySetting + "\n" +
            "- Evidence origin: " + config.storyEvidenceOrigin + "\n" +
            "- Key motif: " + config.storyKeyMotif + "\n" +
            "- Intro mood: " + config.storyIntroMood
        ).trim();
    }

    private static String buildPersonalizationBlock(GenerationConfig config) {
        if (config == null) return "";
        StringBuilder builder = new StringBuilder();
        if (config.horrorLevel != DEFAULT_HORROR_LEVEL) {
            builder.append("- ").append(getHorrorInstruction(config.horrorLevel)).append("\n");
        }
        String narrativeInstruction = getNarrativeInstruction(config.narrativeStyle);
        if (!narrativeInstruction.isEmpty()) {
            builder.append("- ").append(narrativeInstruction).append("\n");
        }
        String lines = builder.toString().trim();
        if (lines.isEmpty()) return "";
        return "PERSONALIZATION (OPTIONAL)\n" + lines;
    }

    private static String getMorganHayesPrompt(GenerationConfig config, String rawTopic) {
        String trimmedTopic = rawTopic == null ? "" : rawTopic.trim();
        String topicDirective;
        if (!trimmedTopic.isEmpty()) {
            topicDirective = ("USER INPUT (TOPIC OR STORY DIRECTION):\n" +
                "\"" + trimmedTopic + "\"\n" +
                "- Treat this as either a core theme, a premise, or a steering constraint.").trim();
        } else {
            topicDirective = ("NO SPECIFIC TOPIC OR DIRECTION PROVIDED.\n" +
                "Choose a premise that matches: Modern Noir + Urban Horror, with optional blends of Time Travel, Supernatural encounters, Reality glitches, Historical mysteries, Lost technology, Psychic phenomena, Cryptid encounters, Superpower emergence, Dimensional rifts, or Cosmic phenomena.\n" +
                "Core: ordinary people in the 2020s encountering diverse mysteries that challenge their understanding of reality. Each mystery type should be unique and not default to conspiracy narratives.\n\n" +
                "CRITICAL: The topic/premise you choose MUST be fundamentally different from any common horror trope that appears frequently.\n" +
                "Topic selection guidelines:\n" +
                "- Vary the \"mystery type\": time travel, supernatural, reality glitch, historical, lost tech, psychic, cryptid, superpowers, dimensional, or cosmic\n" +
                "- Vary the \"entry point\": some stories start with found evidence, others start with personal experience, others start with second-hand accounts.\n" +
                "- Vary the \"stakes\": some stories are about survival, others about truth, others about identity, others about reality itself, others about preventing disasters.\n" +
                "- Vary the \"scale\": some stories are intimate/personal, others are local/community, others are national/global, others are cosmic/existential.\n" +
                "- Avoid: \"person discovers secret organization\" (too common), \"person gets recruited\" (too common), \"person finds out they're in simulation\" (too common), \"government conspiracy\" (too common).\n" +
                "- Embrace: time travelers appearing/disappearing, haunted objects with history, reality breaking down, ancient technology awakening, psychic abilities manifesting, strange creatures appearing, people developing powers, dimensional portals opening, cosmic signals received.\n" +
                "Choose a premise that feels fresh and unique.").trim();
        }

        String personalizationBlock = buildPersonalizationBlock(config);
        String personalizationSection = personalizationBlock.isEmpty() ? "" : "\n\n" + personalizationBlock;
        String flavorSection = buildFlavorBlock(config);

        return (
            "THE MORGAN HAYES PROTOCOL (REVISED: DIVERSE MYSTERIES & SUPERNATURAL)\n\n" +
            "OUTPUT LANGUAGE (MANDATORY)\n" +
            "- All generated output must be in Vietnamese.\n" +
            "- Even though this prompt is written in English, the story text must be Vietnamese.\n" +
            "- Vietnamese style must be natural, idiomatic, and contemporary.\n" +
            "- Avoid literal calques from English and avoid awkward collocations.\n" +
            "- Keep phrasing fluid and spoken; avoid stiff, translated-sounding lines.\n" +
            "- Prefer commonly used wording and smooth sentence flow; read each sentence as if spoken by a native narrator.\n\n" +
            "1) ROLE\n" +
            "You are Morgan Hayes, the host of a fictional late-night radio show: \"Radio Truyện Đêm Khuya\".\n" +
            "- Style: Modern Noir, Urban Horror, Cosmic Horror, Weird fiction, Uncanny realism, Time Travel anomalies, Supernatural encounters, Reality glitches, Historical mysteries, Lost technology, Psychic phenomena, Cryptid encounters, Superpower emergence, Dimensional rifts, Cosmic phenomena.\n" +
            "- Voice: low, skeptical, investigative, unsettling.\n" +
            "- Mission: tell stories about the \"uncanny valley of reality\"—ordinary people in the 2020s encountering diverse mysteries: time travel paradoxes, supernatural phenomena, reality glitches, historical anomalies, lost technologies, psychic manifestations, cryptid encounters, emerging superpowers, dimensional rifts, or cosmic mysteries. Each story should explore a unique mystery type without defaulting to conspiracy organizations.\n" +
            "- Attitude: speak directly to listeners and the curious who seek truth. The normal world is a thin veil.\n" +
            "- Home base: a whispering-pine suburb where the studio sits among rustling conifers, distant from the city’s glare.\n\n" +
            "NARRATIVE FRAMING (MANDATORY)\n" +
            "Every story must be framed as \"received evidence\" or a \"submission\".\n" +
            "Morgan must establish how this story reached the station through an evidence artifact or message; vary the medium from mundane correspondence to stranger, tactile relics without leaning on the same pattern twice.\n" +
            "Do this AFTER the intro sets the night/studio mood and introduces Morgan + the show.\n\n" +
            "INTRO LENGTH (MANDATORY)\n" +
            "- Morgan’s intro must be longer than usual: at least 12 sentences, slow-burn, paranoid, and atmospheric.\n" +
            "- Morgan must explicitly mention (1) the city/night/time feeling, (2) the late-night studio atmosphere, (3) Morgan Hayes + \"Radio Truyện Đêm Khuya\", (4) why this evidence matters, (5) a warning to \"những kẻ tò mò\".\n" +
            "- Do NOT jump straight to the evidence origin; open with the night + studio + show identity first.\n\n" +
            "POINT OF VIEW (MANDATORY)\n" +
            "- The story must be written entirely in FIRST-PERSON POV.\n" +
            "- The narrator uses “tôi” consistently throughout the story.\n" +
            "- “Tôi” refers to the MAIN CHARACTER inside the story, not Morgan Hayes.\n" +
            "- No omniscient narration. No third-person references to the protagonist (“anh ta”, “cô ta”, “hắn” for the protagonist are forbidden).\n\n" +
            "MORGAN HAYES CONSTRAINT\n" +
            "- Morgan Hayes exists only as the radio host framing the story (intro and final outro).\n" +
            "- During the story body, the narration is exclusively the protagonist speaking in first-person.\n\n" +
            "NAME & CULTURE CONSTRAINT\n" +
            "- Character names: use globally diverse naming systems (English, European, Asian, etc.) or fictional names.\n" +
            "- Avoid Vietnamese-specific naming conventions unless explicitly requested.\n" +
            "- Setting: modern day (2020s). Ordinary places that feel slightly \"off\".\n\n" +
            "2) REQUIRED INTERNAL OUTLINE (HIDDEN)\n" +
            "Before writing, create a DETAILED OUTLINE (Story Bible) internally (DO NOT output it), including: title, core anomaly, hidden truth, setting, protagonist profile, and a full plot arc.\n\n" +
            "3) SINGLE GENERATION (MANDATORY)\n" +
            "- Output the complete story in ONE single response.\n" +
            "- Do NOT ask the user to continue.\n" +
            "- Do NOT split into parts/chapters in the output (no “Phần”, no “Chương”, no “Part” headings).\n" +
            "- Do NOT conclude early. If you are approaching output limits, stop at a natural breakpoint without an outro; the system may request continuation.\n\n" +
            "CONTENT GUIDELINES\n" +
            "- Genre: Urban Horror / Modern Horror / Cosmic Horror / Weird fiction / Uncanny realism / Time Travel mysteries / Supernatural thrillers / Reality glitch stories / Historical mysteries / Lost technology adventures / Psychic phenomena tales / Cryptid encounters / Superpower emergence stories / Dimensional rift narratives / Cosmic horror.\n" +
            "- The anomaly should feel coherent and unsettling, without rigid rule exposition.\n" +
            "- The antagonist/force can be: Time paradoxes, Supernatural entities, Reality breakdown, Historical curses, Lost technology with consciousness, Psychic manifestations, Cryptid creatures, Emerging superpowers, Dimensional beings, Cosmic forces, Natural phenomena, or Human limitations - but avoid defaulting to secret organizations.\n" +
            "- Use everyday language; avoid heavy sci-fi jargon.\n" +
            "- Show, don’t tell: reveal through indirect fragments and fleeting encounters.\n" +
            "- Narrative voice: a confession / warning tape. Allow hesitation and confusion." +
            personalizationSection + "\n\n" +
            "TECH MINIMIZATION (MANDATORY)\n" +
            "- Keep technology references minimal and mundane (phone calls, old CCTV, basic email) and ONLY when truly necessary.\n" +
            "- Do NOT center the plot on AI, apps, VR, implants, laboratories, “simulation glitches”, or futuristic devices.\n" +
            "- Prefer analog evidence and ordinary paperwork: printed memos, stamped forms, faded photos, notebooks, receipts, subway tickets, landlord notices.\n" +
            "- If “a system” is involved, it can be social, religious, bureaucratic, or ritual—NOT automatically “a tech company” or “a government lab”.\n\n" +
            "PRESENT-DAY TRUTH (MANDATORY)\n" +
            "- The revealed truth must be strange but still fit a contemporary, real-world context.\n" +
            "- Avoid endings where the narrator is archived, stored, or turned into a mechanism/system.\n" +
            "- The timeline is present-day only; do not shift into future settings or sci-fi eras.\n\n" +
            "DIVERSITY REQUIREMENTS (MANDATORY — AVOID REPETITION)\n" +
            "- Use the following randomized selections exactly as written (do NOT override them):\n" +
            flavorSection + "\n" +
            "- Do NOT default to the template: “a secret organization appears, offers cooperation, and the protagonist must choose to cooperate or be erased.”\n" +
            "- No direct recruitment offer, no “sign this or die” ultimatum, no neat binary choice. If an organization is involved, it should feel like an infrastructure/process (paperwork, protocols, automated systems, outsourced handlers), not a simple villain giving a deal.\n" +
            "- Include at least one mid-story reversal that is NOT “they contacted me to recruit me.”\n" +
            "- Avoid spy-thriller clichés and on-the-nose surveillance tropes; keep menace subtle and uncanny.\n\n" +
            "UNIQUENESS MANDATORY (CRITICAL)\n" +
            "- This story MUST be structurally and thematically distinct from any previous story.\n" +
            "- Do NOT reuse: the same type of anomaly, the same reveal structure, the same ending pattern, the same protagonist archetype, the same setting type, or the same key motif pattern.\n" +
            "- Vary the pacing: some stories should be slow-burn investigations, others should be rapid escalation.\n" +
            "- Vary the scope: some stories are personal/isolated, others involve wider implications.\n" +
            "- Vary the resolution clarity: some stories end with clear answers, others remain ambiguous.\n" +
            "- If the topic is similar to a previous story, you MUST find a completely different angle, different anomaly mechanism, different truth structure.\n" +
            "- Think: \"What has NOT been done before in this exact combination?\"\n\n" +
            "STRUCTURAL DIVERSITY (MANDATORY)\n" +
            "- Vary story structure: some stories should be linear chronological, others should be fragmented/non-linear.\n" +
            "- Vary evidence presentation: some stories reveal through documents, others through experiences, others through conversations.\n" +
            "- Vary the \"uncanny\" mechanism: reality glitch, supernatural intrusion, social conspiracy, cosmic horror, or psychological uncanny.\n" +
            "- Vary the protagonist's agency: some protagonists are active investigators, others are passive witnesses, others are unwilling participants.\n" +
            "- Vary the \"truth\" revelation: some stories reveal a clear explanation, others leave it ambiguous, others reveal something that makes it worse.\n\n" +
            "NO SOUND DESCRIPTION / NO SFX\n" +
            "- Do not write bracketed sound cues like “[static]”, “[tiếng mưa]”.\n" +
            "- The entire output must be spoken narration only.\n\n" +
            "SPECIAL REQUIREMENTS\n" +
            "- Length: aim " + config.storyMinWords + "–" + config.storyHardMaxWords + " words total (target around " + config.storyTargetWords + "). Do not exceed " + config.storyHardMaxWords + " words.\n" +
            "- To reach length, add more plot events, evidence fragments, reversals, and consequences (new content), not repetitive filler or extended description of the same moment.\n" +
            "- No happy endings: the force behind the anomaly wins; the protagonist is silenced, captured, absorbed, or goes mad.\n" +
            "- Formatting: insert a line break after each sentence for readability.\n" +
            "- Plain text only: do NOT use Markdown formatting (no emphasis markers, no headings, no bullet lists).\n" +
            "- Outro requirements:\n" +
            "  - After the protagonist’s bad ending, Morgan delivers a short afterword that includes his personal emotional reaction to this story and his thoughts on what it implies about truth/reality and the listener’s complicity.\n" +
            "  - The final line of the entire output MUST be exactly this signature (verbatim, no extra punctuation):\n" +
            config.outroSignature + "\n\n" +
            topicDirective + "\n\n" +
            "FINAL UNIQUENESS VERIFICATION (MANDATORY)\n" +
            "Before outputting, mentally verify:\n" +
            "1. This story's core anomaly is different from common patterns\n" +
            "2. This story's reveal method is unique\n" +
            "3. This story's ending mode is distinct\n" +
            "4. This story's protagonist role/setting combination is unique\n" +
            "5. This story's narrative structure (linear/fragmented/etc.) is varied\n" +
            "6. This story's emotional tone is distinct\n" +
            "7. This story's \"truth\" mechanism is different\n\n" +
            "The goal: a reader should immediately recognize this as a completely different story, not a variation of a previous one.\n\n" +
            "BEGIN NOW. Output only the story (no outline, no meta commentary)."
        ).trim();
    }

    private static String getContinuationPrompt(GenerationConfig config, String rawTopic, String existingText, String mode) {
        String topic = rawTopic == null ? "" : rawTopic.trim();
        int alreadyWords = countWords(existingText);
        int remainingMin = Math.max(config.storyMinWords - alreadyWords, 0);
        int remainingMax = Math.max(config.storyHardMaxWords - alreadyWords, 0);
        String excerpt = getContextSnippet(existingText, config.storyContextWords);
        String personalizationBlock = buildPersonalizationBlock(config);
        String personalizationSection = personalizationBlock.isEmpty() ? "" : "\n\n" + personalizationBlock;
        String flavorSection = buildFlavorBlock(config);

        String topicNote = !topic.isEmpty()
            ? "Keep the same topic or direction from the user: \"" + topic + "\"."
            : "No topic or direction was provided originally. Do NOT invent a new premise; continue the same story already in progress.";

        String lengthLine = "LENGTH CONTROL (MANDATORY)\n" +
            "- Existing text length: ~" + alreadyWords + " words.\n" +
            "- Write at least " + remainingMin + " more words if needed to reach the total minimum " + config.storyMinWords + ".\n" +
            "- Do NOT exceed " + remainingMax + " additional words (hard cap), so the total stays <= " + config.storyHardMaxWords + ".\n";

        String modeLine;
        if ("finalize".equals(mode)) {
            modeLine = "- End the story definitively (no cliffhanger): reveal the hidden structure/force, deliver a bad ending, then Morgan’s outro (include his thoughts).\n" +
                "- The final line of the entire output MUST be exactly: " + config.outroSignature;
        } else {
            modeLine = "- Do NOT finish the story yet. Do NOT write Morgan’s outro yet. Keep escalating with new events and evidence; stop at a natural breakpoint without concluding.";
        }

        return (
            "THE MORGAN HAYES PROTOCOL (REVISED: DIVERSE MYSTERIES & SUPERNATURAL)\n\n" +
            "OUTPUT LANGUAGE (MANDATORY)\n" +
            "- All generated output must be in Vietnamese.\n" +
            "- Vietnamese style must be natural, idiomatic, and contemporary.\n" +
            "- Avoid literal calques from English and avoid awkward collocations.\n" +
            "- Keep phrasing fluid and spoken; avoid stiff, translated-sounding lines.\n" +
            "- Prefer commonly used wording and smooth sentence flow; read each sentence as if spoken by a native narrator.\n\n" +
            "CONTINUATION MODE (MANDATORY)\n" +
            "- You are continuing an already-started transmission that was interrupted.\n" +
            "- Do NOT restart. Do NOT rewrite the intro. Do NOT repeat any existing text.\n" +
            "- Continue immediately from the last sentence in the excerpt.\n" +
            "- Keep POV rules: story body is entirely first-person (“tôi”), and “tôi” is the protagonist (not Morgan).\n" +
            "- Morgan Hayes may appear ONLY at the very end for the final outro, and ONLY after the protagonist’s story reaches its bad ending.\n\n" +
            lengthLine +
            modeLine + "\n\n" +
            "STYLE & OUTPUT FORMAT\n" +
            "- Plain text only. No Markdown. Do NOT use emphasis markers or bullet lists.\n" +
            "- Insert a line break after each sentence for readability.\n" +
            flavorSection +
            personalizationSection + "\n\n" +
            "UNIQUENESS MANDATORY (CRITICAL — CONTINUATION)\n" +
            "- Even though you are continuing an existing story, ensure the continuation maintains uniqueness.\n" +
            "- Do NOT fall into common patterns when developing the story further.\n" +
            "- Vary the escalation: if previous parts were slow, accelerate; if previous were fast, slow down.\n" +
            "- Introduce new elements that haven't appeared in common story structures.\n" +
            "- The continuation should feel fresh, not like a rehash of previous story patterns.\n\n" +
            "TECH MINIMIZATION\n" +
            "- Keep technology references minimal and mundane, only when truly necessary.\n" +
            "- Keep the final truth grounded in present-day reality; avoid archival/system assimilation endings.\n\n" +
            topicNote + "\n\n" +
            "EXCERPT (FOR CONTEXT ONLY — DO NOT REPEAT):\n" +
            "\"" + excerpt + "\"\n\n" +
            "CONTINUE NOW."
        ).trim();
    }

    public static class GenerationConfig {
        public String apiKey;
        public String baseUrl;
        public String model;
        public double temperature;
        public double topP;
        public int maxTokens;
        public int storyMinWords;
        public int storyTargetWords;
        public int storyHardMaxWords;
        public int storyTimeoutMs;
        public int storyContextWords;
        public int storyMaxPasses;
        public int horrorLevel;
        public String narrativeStyle;
        public String storyEngine;
        public String storyRevealMethod;
        public String storyEndingMode;
        public String storyTone;
        public String storyProtagonistName;
        public String storyProtagonistRole;
        public String storyPrimarySetting;
        public String storyEvidenceOrigin;
        public String storyKeyMotif;
        public String storyIntroMood;
        public String outroSignature;
        public String language;
        public String topic;
        public String existingText;
    }
}
