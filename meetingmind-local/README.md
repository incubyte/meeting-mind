# MeetingMind Local

## Real-time Local Audio Assistant

MeetingMind Local is a desktop application that functions as a real-time, on-device communication coach and assistant. It provides users with immediate, context-aware feedback and actionable suggestions based on the analysis of their live audio environment during online meetings, calls, or while consuming audio content.

## Core Concept

MeetingMind Local captures and analyzes both your speech (via microphone) and what you hear (system audio output), converting these audio streams to text and using AI to provide real-time communication coaching and contextual suggestions.

## Key Features

- **Fully Local Execution**: Runs entirely on your machine for privacy
- **Dual Audio Capture**: Processes both microphone input and system audio output
- **Real-time Speech-to-Text**: Converts audio streams to text transcriptions
- **AI-Powered Analysis**: Generates actionable communication suggestions
- **Non-intrusive Interface**: Displays suggestions in a minimally distracting way

## Technical Challenges

1. **System Audio Loopback**: Achieving reliable, cross-platform capture of system audio output requires OS-specific implementations and often virtual audio devices
2. **Latency Management**: Minimizing end-to-end latency for timely and useful suggestions
3. **Resource Optimization**: Balancing continuous audio processing, STT, and LLM calls with system performance

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/meetingmind-local.git

# Navigate to project directory
cd meetingmind-local

# Install dependencies
npm install

# Start the application
npm start
```

## Requirements

- Node.js 14+
- Electron
- OpenAI API key (set as environment variable)
- OS-specific audio loopback setup:
  - **Windows**: VB-CABLE or similar
  - **macOS**: BlackHole or similar
  - **Linux**: PulseAudio loopback module

## Environment Setup

Create a `.env` file in the project root with your API key:

```
# Use either OpenAI API
OPENAI_API_KEY=your_api_key_here

# OR use OpenRouter API (recommended)
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

OpenRouter is recommended as it provides more model options and can be more cost-effective.

## How It Works

1. The application captures audio from both your microphone and system audio output
2. Audio is converted to text using OpenAI's Whisper API
3. Transcribed text is analyzed by a Large Language Model (LLM)
4. The LLM generates context-aware suggestions for effective communication
5. Suggestions are displayed in the application interface

## License

MIT

## Important Notes on API Usage

- **Speech-to-Text**: Currently requires OpenAI API key for Whisper API access
- **LLM Analysis**: Works with either OpenAI API or OpenRouter API
- If using only OpenRouter API key, the speech-to-text functionality will not work, as OpenRouter doesn't currently support the Whisper API directly

## Acknowledgements

- Built with Electron and Node.js
- Uses OpenAI's API for speech recognition
- Can use either OpenAI or OpenRouter for language processing