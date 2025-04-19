# Technical Overview of Meeting Mind Application

## System Architecture Overview

Meeting Mind is an Electron application that captures and transcribes audio from both the local microphone (your voice) and the system's speaker output (other participants). The application processes these audio streams in parallel and sends them to OpenAI's Whisper API for transcription, then displays the results in a chat-like interface. Additional AI-powered analysis provides real-time interview assistance and insights.

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
  - Uses hysteresis thresholds to avoid jitter (80 for activation, 50 for deactivation)
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
  - Last updated timestamp
  - Unique ID
  - Transcribed text
- Intelligent transcript processing:
  - Similar utterances detected and filtered to avoid duplicates
  - Continuous speech from the same speaker merged when appropriate
  - Text similarity measured using word overlap algorithms
- Updates to the transcript are sent to the UI in real-time

### 6. AI Analysis Engine

- Powered by large language models (Google's Gemini 2.5 Pro)
- Includes two primary analysis types:
  1. **Real-time Interview Analysis**:
     - Provides follow-up questions based on candidate responses
     - Offers observations about technical accuracy and communication skills
     - Suggests tactical tips for improving the interview process
  2. **Q&A Insights**:
     - Automatically identifies question-answer pairs in the transcript
     - Evaluates the technical accuracy and completeness of answers
     - Summarizes candidate responses
- Analysis triggers:
  - Automatic analysis when candidate stops speaking
  - Manual analysis via UI button
  - Configurable minimum transcript length before analysis

### 7. User Interface

- Modern, responsive layout using Tailwind CSS
- Two-column layout with multiple panels:
  - Controls and audio visualization
  - Interview setup with context management
  - Status and logging panel
  - Analysis and suggestions panel
  - Transcript display with chat-like interface
  - Q&A insights panel
- Audio level meters with real-time visualization
- Chat-like transcript with two distinct message types:
  - Green bubbles for "You" (interviewer)
  - White bubbles for "Other" (candidate)

### 8. File Management System

- Temporary files in system temp directory for processing
- Debug recordings stored in project's "tmp" directory
- Files include:
  - Continuous recordings of both audio streams
  - Individual utterance files for processing
  - Copies of files sent to OpenAI
  - JSON output of transcription results

## Data Flow

1. **Initialization**:
   - PulseAudio monitor device detected
   - Recording directories created
   - UI initialized
   - Context loaded (if provided)

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

5. **AI Analysis Flow**:
   - When candidate stops speaking, analysis may auto-trigger
   - Transcript is formatted and sent to LLM with appropriate prompts
   - Analysis results are processed and displayed in UI panels
   - Q&A insights are generated on demand or automatically

6. **UI Updates**:
   - Transcript component updates with new messages
   - Messages are visually separated by source
   - Audio level meters show real-time speech detection
   - Analysis panels update with AI-generated content
   - Status messages inform user of system events

7. **Cleanup**:
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

## Intelligent Transcript Processing

The system includes several optimizations for generating high-quality transcripts:

1. **Duplicate Detection**:
   - Uses text similarity algorithms to identify repeated phrases
   - Prevents duplicate transcriptions of the same utterance
   - Calculates Jaccard similarity between word sets

2. **Continuous Speech Handling**:
   - Merges consecutive utterances from the same speaker
   - Uses time-window heuristics to identify related speech
   - Preserves natural conversation flow

3. **Multiple Source Management**:
   - Tracks source attribution for all utterances
   - Maintains separate processing for interviewer and candidate
   - Enables accurate conversation reconstruction

## LLM Analysis Features

The AI analysis capabilities leverage sophisticated prompting techniques:

1. **System Prompt Engineering**:
   - Contextualizes the LLM with job descriptions and candidate information
   - Provides structured output formats for consistent results
   - Includes best practices for interview conduct

2. **Transcript Formatting**:
   - Prepares conversation history in optimal format for LLM understanding
   - Maps sources to interviewer/candidate roles for clarity
   - Chronologically sorts and structures the conversation

3. **Q&A Identification**:
   - Uses specialized prompts to detect all question types
   - Handles explicit and implicit questions
   - Pairs questions with corresponding answers
   - Evaluates technical accuracy and completeness

## Debugging Features

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

## Technologies Used

- **Electron**: Cross-platform desktop app framework
- **Node.js**: JavaScript runtime
- **node-audiorecorder**: Audio capture library
- **OpenAI Whisper API**: Speech-to-text transcription
- **Google Gemini 2.5 Pro**: Large language model for analysis
- **PulseAudio**: Linux audio system (for device discovery)
- **Tailwind CSS**: Utility-first CSS framework for UI
- **HTML/JavaScript**: UI rendering and interaction
- **WAV format**: Audio storage

This technical implementation allows Meeting Mind to capture, process, and transcribe audio from both interviewer and candidate, presenting the results in a chat-like interface and providing AI-powered analysis and insights to enhance the interview experience.