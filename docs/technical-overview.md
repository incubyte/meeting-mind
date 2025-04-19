# 📚 Technical Overview of Meeting Mind

This document provides a detailed technical overview of the Meeting Mind application architecture, components, and data flow.

## 🏗️ System Architecture

Meeting Mind follows a modular architecture built on Electron, which provides both main process (Node.js) and renderer process (web technologies) capabilities. The architecture emphasizes real-time processing, efficient audio handling, and responsive user interface.

```
+---------------------------------------------+
|                 Meeting Mind                |
+---------------------------------------------+
|                                             |
|  +--------+      +-------------+            |
|  |  UI    |<---->| Electron    |            |
|  | Layer  |      | IPC Bridge  |            |
|  +--------+      +------+------+            |
|                         |                   |
|  +--------+      +------v------+    +-------+-------+
|  | Audio  |----->| Speech      |--->| Transcription |
|  | System |      | Detection   |    | Engine       |
|  +--------+      +------+------+    +-------+-------+
|                         |                   |
|                  +------v------+    +-------v-------+
|                  | Analysis    |<-->| Conversation  |
|                  | Engine      |    | Context       |
|                  +-------------+    +---------------+
|                                             |
+---------------------------------------------+
```

## 🔍 Core Components

### 1. Electron Application Core

The main entry point of the application, responsible for:
- Application lifecycle management
- Window creation and management
- IPC (Inter-Process Communication) handling
- Environment configuration

**Key Files:**
- `main.js`: Main process entry point
- `preload.js`: Secure bridge between renderer and main processes
- `index.js`: Application initialization

### 2. Audio Capture Subsystem

Manages all audio recording functionality, including:
- Device discovery and configuration
- Multiple audio stream handling
- Audio format conversion
- Buffer management for processing

**Key Components:**
- Microphone recorder (Speaker 1's voice)
- Speaker recorder (Speaker 2's voice via system audio output/loopback)
- Raw audio storage for debugging

### 3. Voice Activity Detection (VAD) Engine

The intelligent speech detection system that:
- Processes audio in real-time
- Distinguishes between speech and silence
- Identifies natural utterance boundaries
- Manages audio buffering and file creation

**Algorithms:**
- Amplitude-based speech detection with hysteresis
- Silence duration timing
- Minimum and maximum utterance enforcement
- Audio energy calculation

### 4. Transcription Pipeline

Converts detected speech to text using:
- OpenAI's Whisper API integration
- Audio preprocessing for optimal results
- Result parsing and formatting
- Error handling and retry logic

### 5. Analysis Engine

Provides intelligent insights through:
- Large Language Model integration (Google's Gemini Pro)
- Context-aware prompting
- Follow-up question generation
- Answer evaluation and scoring

**Analysis Types:**
- Real-time conversation assistance
- Question-answer pair detection
- Response quality evaluation
- Suggested follow-up questions

### 6. UI Layer

A responsive interface built with:
- HTML/CSS (Tailwind CSS for styling)
- JavaScript for DOM manipulation
- Electron's IPC for communication with main process

**UI Components:**
- Audio control panel
- Real-time audio level visualization
- Transcript display with chat-like interface
- Analysis and insights panels
- Context management interface

### 7. Settings Management

Handles user configuration for:
- Call types and descriptions
- Persistent storage in JSON format
- Rich text editing capabilities
- Context management

## 📊 Data Flow

### 1. Initialization Flow
```
User -> Electron App: Start application
Electron App -> main.js: Initialize app
main.js -> createWindow(): Create main window
main.js -> settingsManager: Load call settings
settingsManager -> main.js: Return call types
main.js -> mainWindow: Load UI (index.html)
mainWindow -> preload.js: Expose IPC APIs to renderer
mainWindow -> renderer.js: Initialize UI components
renderer.js -> electronAPI: getCallTypes()
main.js -> renderer.js: Return call types
renderer.js -> UI: Display call types in dropdown
```

### 2. Recording and Transcription Flow
```
User -> UI: Click "Start Recording"
renderer.js -> electronAPI: startRecording()
main.js -> vadState: Initialize Voice Activity Detection state
main.js -> getDefaultPulseAudioMonitorDevice(): Get speaker loopback device
main.js -> AudioRecorder: Create mic and speaker recorders
AudioRecorder -> main.js: Start audio streams
AudioRecorder -> processAudioForVAD(): Process audio chunks continuously
processAudioForVAD -> calculateAmplitude(): Detect speech levels
processAudioForVAD -> main.js: Update UI with audio levels
processAudioForVAD -> finalizeUtterance(): When speech ends
finalizeUtterance -> transcribeAudioChunk(): Send audio to OpenAI
OpenAI API -> main.js: Return transcription text
main.js -> processTranscript(): Process transcript for similarity/continuity
main.js -> renderer.js: Send transcript update
renderer.js -> UI: Update transcript display
```

### 3. Analysis Flow
```
checkAutoTriggerAnalysis -> analyzeInterview(): Auto-trigger analysis
analyzeInterview -> buildAnalysisSystemPrompt(): Create context-aware prompt
analyzeInterview -> formatTranscriptForLLM(): Format transcript
analyzeInterview -> OpenRouter API: Send to LLM model (Gemini Pro)
OpenRouter API -> main.js: Return analysis results
main.js -> renderer.js: Send analysis update
renderer.js -> UI: Display analysis
```

## 🛠️ Technical Details

### Voice Activity Detection (VAD) Parameters

- **Amplitude Threshold**: 80 for speech detection
- **Silence Threshold**: 50 for silence detection
- **Silence Duration**: 1.5 seconds of silence to end utterance
- **Min Utterance Duration**: 0.5 seconds
- **Max Utterance Duration**: 15 seconds

### Audio Processing Specifications

- **Sample Rate**: 44.1kHz
- **Bit Depth**: 16-bit
- **Format**: WAV
- **Channels**: Mono for microphone, Stereo for speaker loopback

### Transcript Processing

- **Similarity Threshold**: 0.5 for duplicate detection
- **Continuation Window**: 10 seconds for message continuation
- **Max Transcript Size**: 100 entries

### LLM Integration

- **Model**: Google's Gemini 2.5 Pro (via OpenRouter API)
- **System Prompts**: Dynamically built based on context
- **Temperature**: 0.3 for analysis, 0.2 for insights (more focused)

## 💾 File Organization

- `src/`: Main source directory
  - `main.js`: Main process logic
  - `preload.js`: Secure IPC bridge
  - `renderer.js`: UI interaction logic
  - `settings.js`: Settings UI logic
  - `index.html`: Main application UI
  - `settings.html`: Settings UI
  - `utils/`: Utility functions including settings management
  - `components/`: UI components
  - `assets/`: Static assets

## 🔄 Debugging Features

The application includes comprehensive debugging features:

1. Detailed logging to console and UI
2. Storage of intermediate files for analysis:
   - Continuous recordings
   - Utterance files
   - Files submitted to OpenAI
   - Transcription results as JSON
3. Speech detection results logged in filenames
4. Audio statistics (size, duration, max amplitude)
5. Audio calibration tools

## 🔧 Technology Stack

- **Electron**: Cross-platform desktop app framework
- **Node.js**: JavaScript runtime
- **node-audiorecorder**: Audio capture library
- **OpenAI Whisper API**: Speech-to-text transcription
- **Google Gemini 2.5 Pro**: Large language model for analysis
- **PulseAudio**: Linux audio system (for device discovery)
- **Tailwind CSS**: Utility-first CSS framework for UI
- **HTML/JavaScript**: UI rendering and interaction
- **WAV Format**: Audio storage
