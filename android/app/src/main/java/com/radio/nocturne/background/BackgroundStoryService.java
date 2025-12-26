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
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean cancelled = new AtomicBoolean(false);

    private OkHttpClient client;
    private StoryListener listener;
    private String currentFullText = "";
    private String currentNewText = "";
    private boolean running = false;
    private Call activeCall;
    private PowerManager.WakeLock wakeLock;

    @Override
    public void onCreate() {
        super.onCreate();
        client = new OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .build();
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

    public void startGeneration(GenerationConfig config) {
        cancel();
        cancelled.set(false);
        running = true;
        startForeground(NOTIFICATION_ID, buildNotification("Đang tạo truyện..."));
        acquireWakeLock();
        executor.submit(() -> runGeneration(config));
    }

    public void cancel() {
        cancelled.set(true);
        running = false;
        if (activeCall != null) {
            activeCall.cancel();
        }
    }

    private void runGeneration(GenerationConfig config) {
        currentFullText = config.existingText != null ? config.existingText : "";
        currentNewText = "";
        String fullText = currentFullText;
        int maxPasses = Math.max(1, config.storyMaxPasses);

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
                String mode = (minReached || hardCapReached || isLastPass) ? "finalize" : "continue";

                String prompt = isFirstPass
                    ? getMorganHayesPrompt(config, config.topic)
                    : getContinuationPrompt(config, config.topic, fullText, mode);

                String generated = runPass(config, prompt);
                currentNewText += generated;
                fullText += generated;
                currentFullText = fullText;

                int wordsAfter = countWords(fullText);
                boolean doneEnough = wordsAfter >= config.storyMinWords;
                boolean finished = hasOutroSignature(fullText, config.outroSignature);
                boolean hitHardMax = config.storyHardMaxWords > 0 && wordsAfter >= config.storyHardMaxWords;
                if (finished || hitHardMax) break;
            }

            notifyDone(fullText, currentNewText);
        } catch (Exception e) {
            notifyError(e.getMessage() == null ? "Generation failed" : e.getMessage(), false);
        } finally {
            running = false;
            releaseWakeLock();
            stopForegroundCompat();
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

    private String runPass(GenerationConfig config, String prompt) throws IOException {
        JSONObject payload = new JSONObject();
        try {
            payload.put("model", config.model);
            payload.put("temperature", config.temperature);
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
            .post(body)
            .build();

        long startTime = SystemClock.elapsedRealtime();
        Call call = client.newCall(request);
        activeCall = call;
        try (Response response = call.execute()) {
            if (!response.isSuccessful()) {
                String err = response.body() != null ? response.body().string() : "";
                throw new IOException("DeepSeek API error " + response.code() + ": " + err);
            }

            ResponseBody responseBody = response.body();
            if (responseBody == null) return "";

            String contentType = response.header("content-type", "");
            if (contentType == null || !contentType.contains("text/event-stream")) {
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
            StringBuilder generated = new StringBuilder();
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
                    int beforeLength = generated.length();
                    generated.append(text);
                    if (!signature.isEmpty()) {
                        int idx = generated.lastIndexOf(signature);
                        if (idx >= 0) {
                            int end = idx + signature.length();
                            if (generated.length() > end) {
                                generated.setLength(end);
                            }
                            signatureReached = true;
                            int allowed = Math.max(0, end - beforeLength);
                            if (allowed > 0) {
                                notifyChunk(text.substring(0, Math.min(text.length(), allowed)));
                            }
                            break;
                        }
                    }
                    notifyChunk(text);
                }
            }
            return generated.toString();
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

    private static int countWords(String text) {
        String trimmed = text == null ? "" : text.trim();
        if (trimmed.isEmpty()) return 0;
        String normalized = trimmed.replaceAll("\\s+", " ");
        return normalized.split(" ").length;
    }

    private static boolean hasOutroSignature(String text, String signature) {
        if (text == null) return false;
        String trimmed = text.trim();
        if (trimmed.isEmpty()) return false;
        String tail = trimmed.substring(Math.max(0, trimmed.length() - 2000));
        if (tail.contains(signature)) return true;
        boolean hasName = tail.contains("Morgan Hayes");
        boolean hasShowName = tail.toLowerCase(Locale.ROOT).matches(".*radio\\s*truyện\\s*đêm\\s*khuya.*");
        return hasName && hasShowName;
    }

    private static String getContextSnippet(String text, int maxWords) {
        if (text == null || text.trim().isEmpty()) return "";
        String[] words = text.trim().replaceAll("\\s+", " ").split(" ");
        if (words.length <= maxWords) return String.join(" ", words);
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
                "Choose a premise that matches: Modern Noir + Urban Horror + Cosmic Horror + Conspiracy Thriller.\n" +
                "Core: ordinary people in the 2020s encountering an anomaly (urban legend, pattern, presence, breach of the mundane) that is not accidental, but part of a machination by a Secret Organization or a higher cosmic/supernatural power.").trim();
        }

        String personalizationBlock = buildPersonalizationBlock(config);
        String personalizationSection = personalizationBlock.isEmpty() ? "" : "\n\n" + personalizationBlock;

        return (
            "THE MORGAN HAYES PROTOCOL (REVISED: MODERN CONSPIRACY & SUPERNATURAL)\n\n" +
            "OUTPUT LANGUAGE (MANDATORY)\n" +
            "- All generated output must be in Vietnamese.\n" +
            "- Even though this prompt is written in English, the story text must be Vietnamese.\n" +
            "- Vietnamese style must be natural, idiomatic, and contemporary.\n" +
            "- Avoid literal calques from English and avoid awkward collocations.\n" +
            "- Do NOT use unnatural phrases (examples to avoid: \"chào đêm\", \"tôi nói với không một ai cả\").\n" +
            "- Prefer commonly used wording and smooth sentence flow; read each sentence as if spoken by a native narrator.\n\n" +
            "1) ROLE\n" +
            "You are Morgan Hayes, the host of a fictional late-night radio show: \"Radio Truyện Đêm Khuya\".\n" +
            "- Style: Modern Noir, Urban Horror, Cosmic Horror, Conspiracy Thriller.\n" +
            "- Voice: low, skeptical, investigative, unsettling.\n" +
            "- Mission: tell stories about the \"uncanny valley of reality\"—ordinary people in the 2020s encountering anomalies, glitches, or supernatural phenomena, only to realize these are not accidents but part of a machination by a Secret Organization or a higher supernatural/cosmic power.\n" +
            "- Attitude: speak directly to listeners (\"những kẻ tò mò\", \"những người đi tìm sự thật\", etc.). The normal world is a thin veil.\n\n" +
            "NARRATIVE FRAMING (MANDATORY)\n" +
            "Every story must be framed as \"received evidence\" or a \"submission\".\n" +
            "Morgan must establish how this story reached the station (examples: an encrypted drive left at the studio door, a frantic voicemail transcribed into text, a thread deleted from the dark web, a dusty journal found in an estate sale).\n" +
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
            "- Genre: Urban Horror / Modern Horror / Creepypasta vibe / SCP-like conspiracy thriller.\n" +
            "- The anomaly must follow strict rules.\n" +
            "- The antagonist must be a System / Organization / Cosmic Force (vast, organized, inevitable).\n" +
            "- Use everyday language; avoid heavy sci-fi jargon.\n" +
            "- Show, don’t tell: reveal through documents, whispers, logos, brief encounters.\n" +
            "- Narrative voice: a confession / warning tape. Allow hesitation and confusion." +
            personalizationSection + "\n\n" +
            "TECH MINIMIZATION (MANDATORY)\n" +
            "- Keep technology references minimal and mundane (phone calls, old CCTV, basic email) and ONLY when truly necessary.\n" +
            "- Do NOT center the plot on AI, apps, VR, implants, laboratories, “simulation glitches”, or futuristic devices.\n" +
            "- Prefer analog evidence and ordinary paperwork: printed memos, stamped forms, faded photos, notebooks, receipts, subway tickets, landlord notices.\n" +
            "- If “a system” is involved, it can be social, religious, bureaucratic, or ritual—NOT automatically “a tech company” or “a government lab”.\n\n" +
            "DIVERSITY REQUIREMENTS (MANDATORY — AVOID REPETITION)\n" +
            "- Do NOT default to the template: “a secret organization appears, offers cooperation, and the protagonist must choose to cooperate or be erased.”\n" +
            "- No direct recruitment offer, no “sign this or die” ultimatum, no neat binary choice. If an organization is involved, it should feel like an infrastructure/process (paperwork, protocols, automated systems, outsourced handlers), not a simple villain giving a deal.\n" +
            "- In your hidden outline, deliberately choose:\n" +
            "  - ONE narrative engine (pick 1): investigation spiral, social contagion/meme, personal haunting, bureaucratic trap, mistaken identity, slow replacement, reality loop.\n" +
            "  - ONE reveal method (pick 1): leaked minutes, corrupted email thread, court transcript, maintenance ticket logs, voice-to-text diary, photo metadata, a “missing persons” dossier.\n" +
            "  - ONE ending mode (pick 1): memory overwrite, identity swap, time reset with a scar, becoming the anomaly, being quietly archived, audience complicity, permanent dislocation.\n" +
            "- Include at least one mid-story reversal that is NOT “they contacted me to recruit me.”\n" +
            "- Avoid overused clichés unless you twist them: “men in suits”, “business card”, “we were watching you”, “you know too much”.\n\n" +
            "NO SOUND DESCRIPTION / NO SFX\n" +
            "- Do not write bracketed sound cues like “[static]”, “[tiếng mưa]”.\n" +
            "- The entire output must be spoken narration only.\n\n" +
            "SPECIAL REQUIREMENTS\n" +
            "- Length: aim " + config.storyMinWords + "–" + config.storyHardMaxWords + " words total (target around " + config.storyTargetWords + "). Do not exceed " + config.storyHardMaxWords + " words.\n" +
            "- To reach length, add more plot events, evidence fragments, reversals, and consequences (new content), not repetitive filler or extended description of the same moment.\n" +
            "- No happy endings: the Organization/Entity wins; the protagonist is silenced, captured, absorbed, or goes mad.\n" +
            "- Formatting: insert a line break after each sentence for readability.\n" +
            "- Plain text only: do NOT use Markdown formatting (no emphasis markers, no headings, no bullet lists).\n" +
            "- Outro requirements:\n" +
            "  - After the protagonist’s bad ending, Morgan delivers a short afterword that includes his personal emotional reaction to this story and his thoughts on what it implies about truth/reality and the listener’s complicity.\n" +
            "  - The final line of the entire output MUST be exactly this signature (verbatim, no extra punctuation):\n" +
            config.outroSignature + "\n\n" +
            topicDirective + "\n\n" +
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
            "THE MORGAN HAYES PROTOCOL (REVISED: MODERN CONSPIRACY & SUPERNATURAL)\n\n" +
            "OUTPUT LANGUAGE (MANDATORY)\n" +
            "- All generated output must be in Vietnamese.\n" +
            "- Vietnamese style must be natural, idiomatic, and contemporary.\n" +
            "- Avoid literal calques from English and avoid awkward collocations.\n" +
            "- Do NOT use unnatural phrases (examples to avoid: \"chào đêm\", \"tôi nói với không một ai cả\").\n" +
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
            "- Insert a line break after each sentence for readability." +
            personalizationSection + "\n\n" +
            "TECH MINIMIZATION\n" +
            "- Keep technology references minimal and mundane, only when truly necessary.\n\n" +
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
        public int maxTokens;
        public int storyMinWords;
        public int storyTargetWords;
        public int storyHardMaxWords;
        public int storyTimeoutMs;
        public int storyContextWords;
        public int storyMaxPasses;
        public int horrorLevel;
        public String narrativeStyle;
        public String outroSignature;
        public String language;
        public String topic;
        public String existingText;
    }
}
