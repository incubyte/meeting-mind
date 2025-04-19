# 🔧 Meeting Mind Configuration Guide

This document explains how to configure and customize Meeting Mind for your specific needs.

## 📋 Table of Contents

- [Environment Variables](#environment-variables)
- [Audio Configuration](#audio-configuration)
- [Voice Activity Detection Settings](#voice-activity-detection-settings)
- [LLM Integration](#llm-integration)
- [Transcript Processing](#transcript-processing)
- [Call Types Management](#call-types-management)
- [Debugging Options](#debugging-options)

## 🔐 Environment Variables

Meeting Mind uses environment variables for configuration, defined in a `.env` file in the project root.

### Required Variables

```
OPENAI_API_KEY=your_openai_api_key_here
```

### Optional Variables

```
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

## 🔊 Audio Configuration

Audio settings are defined in `main.js`. You can modify these values to adjust audio capture quality and behavior.

```javascript
// Audio processing settings
const RECORDING_CHUNK_DURATION_SECONDS = 7; // Chunk duration in seconds
const VERBOSE_LOGGING = true;
const TEMP_AUDIO_DIR = path.join(os.tmpdir(), "meeting-mind-audio");
const DEBUG_SAVE_RECORDINGS = true; // Save recordings for debugging
const DEBUG_RECORDINGS_DIR = path.join(path.dirname(import.meta.dirname), "tmp");
```

### Audio Quality Settings

The application uses the following audio quality settings by default:

- **Sample Rate**: 44.1kHz
- **Bit Depth**: 16-bit
- **Channels**: Mono for microphone, Stereo for speaker
- **Format**: WAV

## 🎙️ Voice Activity Detection Settings

Voice Activity Detection (VAD) is the heart of the application. You can customize its behavior by adjusting these parameters in `main.js`:

```javascript
// Voice Activity Detection (VAD) settings
const VAD_AMPLITUDE_THRESHOLD = 80;      // Amplitude threshold for speech detection
const VAD_SILENCE_THRESHOLD = 50;        // Lower threshold for detecting silence
const VAD_SILENCE_DURATION_MS = 1500;    // How long silence must persist to end an utterance
const VAD_MIN_UTTERANCE_MS = 500;        // Minimum utterance duration to be considered valid
const VAD_MAX_UTTERANCE_MS = 15000;      // Maximum utterance length before forced split (15s)
const VAD_SAMPLE_RATE = 44100;           // Audio sample rate
const VAD_FRAME_SIZE = 4096;             // Size of audio frames for processing
const VAD_BUFFER_LIMIT = 1000;           // Maximum number of buffers to store (to prevent memory issues)
```

### Adjusting Speech Detection Sensitivity

To make speech detection more or less sensitive:

- **Increase `VAD_AMPLITUDE_THRESHOLD`** to require louder speech (less sensitive)
- **Decrease `VAD_AMPLITUDE_THRESHOLD`** to detect softer speech (more sensitive)
- **Increase `VAD_SILENCE_THRESHOLD`** to be more tolerant of quiet moments during speech
- **Decrease `VAD_SILENCE_DURATION_MS`** to end utterances more quickly after pauses

## 🧠 LLM Integration

Meeting Mind uses Large Language Models for analysis. These settings can be found in `main.js`:

```javascript
// OpenRouter API configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY; // Fallback to OpenAI key if not defined
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const LLM_MODEL = "google/gemini-2.5-pro-preview-03-25"; // Using Gemini Pro model

// Interview assistant configuration
const ANALYSIS_MODE = true; // Whether to enable interview analysis
const ANALYSIS_AUTO_TRIGGER = true; // Auto trigger analysis when candidate stops speaking
const ANALYSIS_MIN_TRANSCRIPT_LENGTH = 50; // Min characters before allowing analysis
```

### Customizing Analysis Behavior

- Set `ANALYSIS_MODE = false` to disable analysis completely
- Set `ANALYSIS_AUTO_TRIGGER = false` to only trigger analysis manually
- Adjust `ANALYSIS_MIN_TRANSCRIPT_LENGTH` to require more or less conversation before analysis

## 📝 Transcript Processing

Transcript processing settings control how transcribed text is managed:

```javascript
// Transcript intelligent merging settings
const TRANSCRIPT_SIMILARITY_THRESHOLD = 0.5;   // Similarity threshold to detect duplicates (0-1)
const TRANSCRIPT_CONTINUATION_WINDOW = 10000;  // Time window (ms) to consider continuing a message from same speaker
const MAX_TRANSCRIPT_ENTRIES = 100;            // Maximum number of transcript entries to keep
```

### Optimizing Transcript Processing

- **Increase `TRANSCRIPT_SIMILARITY_THRESHOLD`** to be more aggressive at filtering similar utterances
- **Decrease `TRANSCRIPT_SIMILARITY_THRESHOLD`** to keep more potentially duplicate utterances
- **Increase `TRANSCRIPT_CONTINUATION_WINDOW`** to merge utterances across longer pauses
- **Adjust `MAX_TRANSCRIPT_ENTRIES`** based on your memory constraints and conversation length

## 📞 Call Types Management

Call types are managed through the settings interface and stored in JSON format. The default storage location is defined in `src/utils/settingsManager.js`:

```javascript
// Store in local directory instead of Electron userData
this.dataDir = path.join(process.cwd(), 'data');
this.settingsPath = path.join(this.dataDir, 'call-settings.json');
```

### Default Call Types

The system comes with these default call types:

- **Technical Interview**
- **Sales Call**
- **1:1 Meeting**

You can modify these defaults in `src/utils/settingsManager.js` in the `resetToDefaultSettings()` method.

## 🐛 Debugging Options

Debugging flags that can be toggled in `main.js`:

```javascript
const VERBOSE_LOGGING = true;
const DEBUG_SAVE_RECORDINGS = true; // Save recordings for debugging
```

When `DEBUG_SAVE_RECORDINGS` is enabled, the application saves:

- Complete continuous recordings from both audio sources
- Individual utterance files
- Exact files sent to OpenAI
- Transcription results as JSON

These files are stored in the `tmp` directory in the project root.

### Logging Levels

The application uses four logging levels:

- `logVerbose`: Detailed debug information (only when `VERBOSE_LOGGING` is true)
- `logInfo`: General information
- `logWarn`: Warnings and potential issues
- `logError`: Errors and failures

Logs are displayed in the Status panel in the UI and also output to the console.
