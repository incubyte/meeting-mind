# Meeting Mind Architecture

This document provides a detailed overview of the Meeting Mind application architecture, including its components, data flow, and design principles.

## System Architecture Overview

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
|                  | Analysis    |<-->| Interview     |
|                  | Engine      |    | Context       |
|                  +-------------+    +---------------+
|                                             |
+---------------------------------------------+
```

## Core Components

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
- Microphone recorder (local voice)
- Speaker recorder (system audio output/loopback)
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
- Large Language Model integration (Gemini Pro)
- Context-aware prompting
- Follow-up question generation
- Answer evaluation and scoring

**Analysis Types:**
- Real-time interview assistance
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

### 7. Data Flow Management

Handles the flow of information through the system:
- Audio data buffering and processing
- Transcript creation and management
- Context preservation between components
- State management across processes

## Communication Flow

1. **User Interaction → Main Process**
   - User interactions in the UI trigger IPC messages
   - Main process handles these messages and executes appropriate actions

2. **Audio Recording → Speech Detection**
   - Audio is captured from both microphone and system audio
   - Voice Activity Detection processes these streams in real-time

3. **Speech Detection → Transcription**
   - Detected utterances are sent to the Whisper API
   - Transcribed text is returned and processed

4. **Transcription → Analysis**
   - Transcribed text is accumulated in the transcript buffer
   - Analysis engine processes the transcript with contextual information

5. **Analysis → UI**
   - Analysis results are sent to the renderer process
   - UI is updated to display transcripts, analysis, and insights

## Design Principles

### 1. Real-Time Processing

Meeting Mind emphasizes immediate feedback, with:
- Continuous audio processing
- Speech detection with minimal latency
- Progressive transcript updates
- On-demand analysis generation

### 2. Modular Architecture

The system is designed with clear component boundaries:
- Separation of audio, speech, transcription, and analysis concerns
- Isolated processing pipelines
- Well-defined interfaces between components

### 3. Error Resilience

The application handles various failure modes:
- Audio device detection fallbacks
- Transcription error handling
- Analysis failure recovery
- User feedback for system status

### 4. Developer Experience

The codebase prioritizes maintainability:
- Comprehensive logging system
- Debug file creation for troubleshooting
- Clear code organization
- Detailed comments explaining complex algorithms

## File Organization

- `src/`: Main source directory
  - `main.js`: Main process logic
  - `preload.js`: Secure IPC bridge
  - `renderer.js`: UI interaction logic
  - `index.html`: Main application UI
  - `components/`: UI components
  - `assets/`: Static assets

## Conclusion

Meeting Mind's architecture balances real-time performance with complex audio processing and AI analysis capabilities. The modular design allows for future enhancements and makes the system adaptable to different use cases beyond interview scenarios.