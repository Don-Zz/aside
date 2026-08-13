<div align="center">

# Aside

**An open-source AI copilot that floats over your screen — sees what you see, hears your meetings, and stays hidden from screen shares.**

A free, self-hosted, MIT-of-spirit-but-actually-GPL alternative to Cluely. Bring your own AI key (OpenAI · Anthropic · Google Gemini · OpenAI-compatible endpoints). Forked from [`Blueturboguy07/cue`](https://github.com/Blueturboguy07/cue) and extended with meeting-summary export, spaced-repetition study flashcards, and a usage/cost dashboard.

</div>

---

> [!IMPORTANT]
> **Please read this first.** Aside tries to stay out of screen recordings/shares, but this is **best-effort, not guaranteed** — on macOS 15.4+ Apple can let modern capture tools see it anyway, on Windows 10 builds older than 2004 it degrades to a black box instead of true exclusion, and a phone camera always can. Using a hidden assistant during a **proctored exam, job interview, or recorded meeting** may break that platform's rules and, in some places, consent laws. **The "meeting audio" feature records and transcribes the other person's voice** — several US states and countries require all-party consent to do that. Aside is built for legitimate uses — your own notes, studying, accessibility, and practice with your own team's or client's knowledge. **You are responsible for how you use it.**

---

## What it does

Aside floats a small glass panel on top of everything. It takes **three separate inputs** — your **screen**, your **microphone**, and your **meeting audio** (what the other person says) — and uses an AI model to help you in real time, then keeps a record of what happened so it gets more useful over time.

| Feature | How to trigger | What it uses |
|---|---|---|
| **Assist** | `⌘` `↵` (macOS) or `Ctrl` `Enter` (Windows), configurable | your screen + recent conversation + memory of recent meetings |
| **What should I say?** | button | meeting audio + your mic |
| **Follow-up questions** | button | the whole conversation |
| **Recap** | button | the whole conversation |
| **Ask anything** | type + `↵` | your screen + conversation |
| **Solve a coding problem** | `⌘` `H` (macOS) or `Ctrl` `H` (Windows) | your screen only |
| **Smart** toggle | pill in the box | switches to a smarter (slower) model |

Three things this fork adds on top of upstream `cue` — all local-first, no server:

- **📁 Meetings** — every listening session is auto-summarized (summary / key points / decisions / action items) the moment you stop listening, and saved as a Markdown file to `~/Documents/aside-meetings/`. The Settings → Meetings tab lists them all.
- **📚 Study** — turn any meeting into a set of spaced-repetition flashcards with one click. Reviews use a Leitner schedule (miss a card, see it again tomorrow; get it right, the gap grows).
- **📊 Usage** — an estimated tokens/cost table, today and all-time, broken down by provider and model, so you can see roughly what you're spending before your provider's own dashboard tells you.
- **🧠 Memory** — Assist/Say/Ask/Follow-up now read the last few meetings' summaries back in, so answers can reference "like we discussed last time" instead of starting cold every session.

### Platform support

|  | macOS | Windows 11 / 10 2004+ |
|---|---|---|
| Screen + coding help | ✅ | ✅ |
| Your mic (the **You** channel) | ✅ | ✅ |
| Meeting audio (the **Them** channel) | ✅ macOS 14.4+ | ✅ |
| Hidden from screen shares | ⚠️ best-effort, weaker on macOS 15.4+ | ✅ `WDA_EXCLUDEFROMCAPTURE` |
| Permissions to grant | Microphone **and** Screen Recording | Microphone only |

> [!NOTE]
> **Meeting audio needs macOS 14.4+.** Capturing the *other* person — what powers **What should I say?**, **Follow-up questions**, and **Recap** — uses system-audio loopback. On Windows that works out of the box. On macOS it relies on ScreenCaptureKit, which Aside enables through Chromium's `MacLoopbackAudioForScreenShare` and `MacSckSystemAudioLoopbackOverride` switches; on older macOS the *Them* channel stays silent while your screen and the **You** channel keep working.

---

## Install

### Option A — Run the packaged app (macOS, Apple silicon)

Grab `Aside-<version>-mac-arm64.zip` from [Releases](../../releases), unzip it, drag `Aside.app` into **Applications**, and open it.

> **Not code-signed / notarized.** This is a personal open-source project without a paid Apple Developer certificate. The first time you open a copy that was downloaded (not built locally), macOS Gatekeeper will likely refuse it as "damaged." Fix it once from Terminal:
> ```bash
> xattr -cr /Applications/Aside.app
> ```
> This is standard for indie/open-source Mac apps distributed outside the App Store — it's not a red flag, it just means nobody paid Apple $99/year for this hobby project (yet).

### Option B — Run from source (macOS or Windows)

You need [Node.js](https://nodejs.org) 22.12+ installed. No Xcode and no Visual Studio build tools required — Aside deliberately avoids native modules.

```bash
git clone https://github.com/Don-Zz/aside.git
cd aside
npm install
npm start
```

To build a standalone app yourself:
```bash
npm run pack        # unpacked app in dist/ (either OS)
npm run dist:mac     # macOS zip            -> dist/
npm run dist:win     # Windows installer    -> dist/
```
> **macOS note:** the packaged app is **ad-hoc signed** unless a Developer ID certificate is configured (see `electron-builder.cjs`). macOS ties permission grants to the exact build, so **rebuilding resets the mic/screen permissions** — you'll grant them again. For everyday use, build once and keep it.

Packaged builds can include a pinned `whisper.cpp` runtime for local transcription. When running from source, prepare the matching runtime once:
```bash
npm run prepare:whisper
```

---

## First launch — the 1-minute setup

A **built-in tutorial** walks you through everything below on first open. Reopen it anytime by clicking the **Aside logo**.

### Step 1 — Grant permissions
**macOS — two grants.** System Settings → **Privacy & Security** → **Microphone** and **Screen Recording** → turn on **Aside**. macOS may ask you to quit & reopen — let it.
**Windows — one grant.** Settings → **Privacy & security** → **Microphone** → allow Aside and "Let desktop apps access your microphone."

### Step 2 — Add your AI key (bring your own)
Aside uses **your own** API key — it's free to run beyond what your provider charges. Open Settings (`...` button, or `⌘,` / `Ctrl,`) → **Keys**.

| Provider | Get a key | Notes |
|---|---|---|
| **Anthropic (Claude)** | [console.anthropic.com](https://console.anthropic.com) | Default provider in this fork. Great for screen & coding help. No speech-to-text — add an OpenAI or Gemini key too if you want the listening features. |
| **OpenAI** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | One key does everything — the *listening* features need a key with **Whisper/audio** access. |
| **Google Gemini** | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | One key does chat + transcription. |
| **Azure AI Foundry** | [ai.azure.com](https://ai.azure.com) | Paste endpoint + key. No speech-to-text — add OpenAI/Gemini for listening. |
| **Custom** | Your endpoint/gateway | Any OpenAI-compatible Chat Completions endpoint. |

Keys are stored **only on your computer** and sent **only** to the provider you chose. Aside has no server and collects nothing beyond what you explicitly export.

### Optional — transcribe locally with whisper.cpp
Settings → **Audio** → **Local** → download a model. Runs entirely on your machine; never falls back to cloud silently.

### Step 3 — The Zoom setting (only needed for Zoom)
Zoom → **Settings** → **Share Screen** → **Advanced** → **Screen capture mode** → choose **"Advanced capture with window filtering."** Google Meet, Teams, and QuickTime need nothing.

---

## How it works (under the hood)

Aside is an [Electron](https://www.electronjs.org/) app. Everything runs locally except the calls to your chosen AI provider.

```
main process ──┬─ overlay window (frameless, transparent, always-on-top, content-protected)
               ├─ screenshot capture (desktopCapturer)
               ├─ speech-to-text (Whisper / Gemini / Deepgram)   ── "You" + "Them" channels
               ├─ LLM streaming (OpenAI / Anthropic / Gemini / Custom)
               ├─ meeting store → auto-summary → Markdown export (src/meetings.js, src/meeting-export.js)
               ├─ flashcard store → Leitner scheduling (src/flashcards.js)
               └─ usage tracker → estimated tokens/cost (src/usage.js)
renderer ──────┴─ the glass UI + mic capture + system-audio loopback
```

**The invisibility** is a single window flag — `setContentProtection(true)` — the same OS mechanism DRM apps and Zoom's own toolbar use. It is not a GPU trick or a special overlay layer. Set `CUE_NO_PROTECT=1` to disable it while debugging.

---

## Privacy

- No accounts, hosted service, or telemetry. Aside collects nothing.
- API keys and your optional résumé/profile text live in a local file (`cue-data.json`, still using the upstream filename internally) and are sent only to the provider you chose.
- Meeting notes, flashcards, and usage stats are local JSON files under Electron's userData directory — nothing leaves your machine except what an AI request needs and what you explicitly export as Markdown.
- Audio utterances and the live transcript stay in memory; Aside does not write captured audio to disk. Downloaded local model files remain on disk until you delete them.

## Contributing

Issues and PRs welcome. The codebase stays small and readable on purpose — `main.js` (app + capture + AI + meetings/study/usage), `renderer/` (the UI), `src/` (providers, stores). No build step for the source (plain HTML/CSS/JS).

## Credits & license

Forked from the open-source [`Blueturboguy07/cue`](https://github.com/Blueturboguy07/cue), itself built as a study of how tools like **Cluely** and **Interview Coder** work, modeled on the open-source clones `pickle-com/glass` and `sohzm/cheating-daddy`. This fork removes a Windows-only feature that disguised the app's process as `MicrosoftEdgeUpdate.exe` in Task Manager (not something a transparent, "you're responsible for how you use it" tool should be doing), adds the Meetings/Study/Usage features above, and restyles the UI with an original palette and app icon.

Local transcription uses [whisper.cpp](https://github.com/ggml-org/whisper.cpp), distributed under the MIT License.

**License: [GPL-3.0-or-later](LICENSE)** — inherited from upstream. You're free to use, modify, and redistribute this, including commercially, as long as anything you distribute stays GPL-licensed with source available. See [gnu.org/licenses/gpl-3.0](https://www.gnu.org/licenses/gpl-3.0.en.html) if you're planning to build a business on top of it — the license shapes what that business model can look like.
