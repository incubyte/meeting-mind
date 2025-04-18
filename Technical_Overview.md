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

### 2. Chunk Processing Engine

- Audio is processed in configurable chunks (7 seconds)
- For each chunk processing cycle:
  1. Microphone and speaker recordings are copied from continuous streams
  2. Each audio chunk is analyzed for silence/speech detection
  3. Chunks with actual speech are sent for transcription
  4. Silent chunks are skipped to avoid unnecessary API calls

### 3. Speech Detection System

- Implemented with a custom algorithm that:
  - Analyzes WAV file structure (skipping 44-byte header)
  - Samples audio data throughout the file (100 sample points)
  - Compares sample amplitudes against a configurable threshold (1000)
  - Classifies audio as silence or speech based on maximum amplitude
- Debug copies of audio files are saved with "HAS-SPEECH" or "SILENCE" prefixes

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
   - Continuous audio streams are written to disk
   - Chunk processing timer starts (every 7 seconds)

3. **Chunk Processing Cycle**:
   - Latest continuous recordings are copied for processing
   - Speech detection analyzes copied files
   - Files with speech are sent for transcription
   - Silent files are skipped

4. **Transcription Flow**:
   - Speech audio is sent to OpenAI Whisper API
   - Received transcriptions are processed and timestamped
   - Transcript buffer is updated with new entries
   - UI is notified to refresh transcript display

5. **UI Updates**:
   - Transcript component updates with new messages
   - Messages are visually separated by source
   - Status messages inform user of system events

6. **Cleanup**:
   - Temporary files are deleted after processing
   - Recorders are properly stopped on application close
   - Debug directories preserved for analysis

## Silent Audio Optimization

A key optimization is the speech detection system that prevents sending silent audio to the OpenAI API:

1. Files with less than 44 bytes (just WAV header) are immediately rejected
2. Small files (< 100 samples) are marked as silence
3. Files are sampled at 100 points to find maximum amplitude
4. If no sample exceeds threshold (1000), file is considered silence
5. Only files with detected speech are sent to API, saving resources

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