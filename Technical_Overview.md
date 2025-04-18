# Technical Plan for Meeting Mind Application

## System Architecture Overview

Meeting Mind is an Electron application that captures and transcribes audio from both the local microphone (your voice) and the system's speaker output (other participants). The application processes these audio streams in parallel and sends them to OpenAI's Whisper API for transcription, then displays the results in a chat-like interface.

## Key Components

### 1. Audio Capture Subsystem

#### Device Discovery
- Uses PulseAudio's `pactl` command to identify the system's audio devices
- Specifically identifies the loopback monitor device (`{default-sink}.monitor`) to capture system audio output

#### Dual-Stream Audio Recording
- Uses `node-audiorecorder` to create two parallel recorders:
  - Microphone recorder: Captures local voice with mono audio (1 channel)
  - Speaker recorder: Captures system output with stereo audio (2 channels)
- Both recorders use high-quality settings (16-bit, 44.1kHz WAV format)
- Raw audio streams are continuously written to disk files to preserve all audio data

### 2. Voice Activity Detection (VAD) Engine

- Audio is processed in real-time as it's captured
- Uses an intelligent speech detection algorithm to:
  1. Identify when a speaker starts talking
  2. Capture the entire utterance until they stop
  3. Process complete, natural speech segments
  4. Send only speech-containing utterances for transcription

### 3. Speech Detection System

- Uses a sophisticated real-time voice activity detection (VAD) algorithm:
  - Monitors audio amplitude levels continuously
  - Uses hysteresis thresholds to avoid jitter (1200 for activation, 800 for deactivation)
  - Implements silence duration timing (1.5 seconds of silence to end utterance)
  - Handles natural pauses during speech
  - Enforces minimum and maximum utterance durations (0.5-15 seconds)
- Generates complete utterance WAV files ready for transcription
- Debug copies of utterance files are saved with timestamp and source information

### 4. Transcription Pipeline

- Speech-detected audio is sent to OpenAI's Whisper API
- Process includes:
  1. Reading audio data into memory buffer
  2. Creating a clean copy for API upload
  3. Processing via OpenAI's audio.transcriptions endpoint with whisper-1 model
  4. Capturing and processing the transcription result
  5. JSON debug files are created for each transcription

### 5. Transcript Management

- Transcriptions are stored in a chronologically sorted buffer
- Each transcript item contains:
  - Source (You/Other)
  - Timestamp
  - Transcribed text
- Updates to the transcript are sent to the UI in real-time

### 6. User Interface

- Chat-like interface with two distinct message types:
  - Green bubbles on right for "You" (microphone)
  - White bubbles on left for "Other" (speaker)
- Messages are displayed in chronological order
- Real-time updates as new transcriptions arrive
- Status panel for system messages and debugging information
- Control buttons for testing audio and starting/stopping recording

### 7. File Management System

- Temporary files in system temp directory for processing
- Debug recordings stored in project's "tmp" directory
- Files include:
  - Continuous recordings of both audio streams
  - Chunk files for processing
  - Copies of files sent to OpenAI
  - JSON output of transcription results

## Data Flow

1. **Initialization**:
   - PulseAudio monitor device detected
   - Recording directories created
   - UI initialized

2. **Recording Process**:
   - User clicks "Start Recording"
   - Two recorder instances start simultaneously
   - Voice Activity Detection (VAD) processing is attached to audio streams
   - Continuous audio streams are written to disk for debugging

3. **Real-time Speech Processing**:
   - Audio streams are continuously monitored for speech
   - When speech begins, a new utterance is started
   - Utterance continues until speech ends (1.5s of silence)
   - Complete utterances are saved as individual WAV files

4. **Transcription Flow**:
   - Complete utterance files are sent to OpenAI Whisper API
   - Whisper API transcribes natural speech segments accurately
   - Transcribed utterances include proper sentences with punctuation
   - Transcript buffer is updated with semantically complete entries

5. **UI Updates**:
   - Transcript component updates with new messages
   - Messages are visually separated by source
   - Status messages inform user of system events

6. **Cleanup**:
   - Temporary files are deleted after processing
   - Recorders are properly stopped on application close
   - Debug directories preserved for analysis

## Voice Activity Detection Optimization

A key innovation is the real-time Voice Activity Detection (VAD) system that:

1. Processes audio in real-time as it arrives from the recorder
2. Uses amplitude-based speech detection with hysteresis
3. Properly identifies natural utterances with their start and end points
4. Groups continuous speech into single transcription units
5. Manages silence periods between phrases
6. Only sends complete utterances to OpenAI API, dramatically improving:
   - Accuracy of transcription (complete thoughts vs. arbitrary chunks)
   - Cost efficiency (no silent periods sent to API)
   - Natural conversation flow (aligned with actual speech patterns)
   - Transcript quality (proper sentence boundaries)

## Debugging Features

The application includes comprehensive debugging features:

1. Detailed logging to console and UI
2. Storage of intermediate files for analysis:
   - Continuous recordings
   - Chunk files
   - Files submitted to OpenAI
   - Transcription results as JSON
3. Speech detection results logged in filenames
4. Audio statistics (size, duration, max amplitude)

## Technologies Used

- **Electron**: Cross-platform desktop app framework
- **Node.js**: JavaScript runtime
- **node-audiorecorder**: Audio capture library
- **OpenAI Whisper API**: Speech-to-text transcription
- **PulseAudio**: Linux audio system (for device discovery)
- **HTML/CSS/JS**: UI rendering
- **WAV format**: Audio storage

This technical implementation allows Meeting Mind to capture, process, and transcribe audio from both local microphone and remote participants, presenting the results in a chat-like interface that preserves the conversational nature of the meeting.