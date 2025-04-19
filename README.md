# Meeting Mind

An intelligent, real-time interview assistant that transcribes and analyzes conversations using advanced voice activity detection and AI processing.

## Overview

Meeting Mind is an Electron-based desktop application designed to enhance interview experiences by providing real-time transcription, analysis, and insights. The application captures audio from both the interviewer's microphone and the candidate's voice (via system speaker output), transcribes the conversation using OpenAI's Whisper API, and offers intelligent analysis using large language models.

![Meeting Mind Interface](docs/screenshot.png)

## Key Features

- **Dual-Stream Audio Capture**: Records both local microphone and system audio output simultaneously
- **Intelligent Voice Activity Detection (VAD)**: Detects natural speech patterns and utterances
- **Real-Time Transcription**: Converts speech to text using OpenAI's Whisper API
- **Interview Analysis**: Provides suggestions for follow-up questions and observations about candidate responses
- **Q&A Insights**: Automatically identifies question-answer pairs and evaluates responses
- **Chat-Like Interface**: Presents transcribed conversation in an easy-to-follow format
- **Audio Level Visualization**: Shows real-time audio levels for both microphone and speaker

## System Requirements

- **Operating System**: Linux (PulseAudio audio system required)
- **Node.js**: v14 or higher
- **Dependencies**: 
  - OpenAI API key (for transcription and analysis)
  - PulseAudio (for audio device management)

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/meeting-mind.git
   cd meeting-mind
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the project root with your OpenAI API key:
   ```
   OPENAI_API_KEY=your_api_key_here
   ```

4. Build the CSS (only needed for the first run):
   ```
   npm run tailwind:build
   ```

5. Start the application:
   ```
   npm run dev
   ```

## Usage

1. **Test Audio Devices**: Click the "Test Audio" button to verify your microphone and speaker loopback device are properly detected.

2. **Set Interview Context** (Optional): Enter job description, candidate information, or other contextual details to improve the AI analysis.

3. **Start Recording**: Click the "Start" button to begin recording the conversation.

4. **Conduct Interview**: As the conversation progresses, the application will transcribe speech in real-time and display it in the chat interface.

5. **Review Analysis**: Check the "Analysis & Suggestions" panel for recommended follow-up questions and observations.

6. **View Insights**: The "Interview Insights" panel shows structured Q&A evaluations of the conversation.

7. **Stop Recording**: Click "Stop" when the interview is complete.

8. **Download Transcript**: Save the conversation transcript for later reference.

## Architecture

Meeting Mind uses a modular architecture with several key components:

- **Audio Capture Subsystem**: Manages audio recording from multiple sources
- **Voice Activity Detection Engine**: Processes audio streams to identify speech
- **Transcription Pipeline**: Converts speech to text using OpenAI's Whisper API
- **Analysis Engine**: Generates insights using LLM models (Gemini Pro)
- **UI Layer**: Electron-based interface for displaying transcripts and insights

For more detailed information about the architecture, see [Architecture.md](Architecture.md).

## Technical Details

For a deep dive into the technical implementation, including audio processing, voice activity detection algorithms, and the transcription pipeline, see [Technical_Overview.md](Technical_Overview.md).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC

## Acknowledgments

- OpenAI for the Whisper API
- Google for the Gemini Pro model
- Electron.js community
- Node.js community