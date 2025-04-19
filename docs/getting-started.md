# 🚀 Getting Started with Meeting Mind

This guide will help you set up and run Meeting Mind on your system.

## ⚙️ System Requirements

- **Operating System**: Linux (with PulseAudio audio system)
- **Node.js**: v14 or higher
- **Dependencies**: 
  - OpenAI API key (for transcription)
  - PulseAudio (for audio device management)
  - Internet connection for API access

## 📥 Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/meeting-mind.git
   cd meeting-mind
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Create a `.env` file** in the project root with your OpenAI API key:
   ```
   OPENAI_API_KEY=your_api_key_here
   ```

   Optionally, you can also set up an OpenRouter API key for accessing Gemini Pro:
   ```
   OPENROUTER_API_KEY=your_openrouter_api_key_here
   ```

4. **Build the CSS** (only needed for the first run):
   ```bash
   npm run tailwind:build
   ```

## 🏃‍♂️ Running the Application

1. **Start in development mode**:
   ```bash
   npm run dev
   ```

2. **Start in production mode**:
   ```bash
   npm start
   ```

## 🎯 Initial Setup

When you first run the application, you should:

1. **Test Audio Devices**: Click the "Test Audio" button to verify your microphone and speaker loopback device are properly detected.

2. **Configure Call Types** (Optional): Click the "Settings" button to configure custom call types for different conversation scenarios.

3. **Set Context** (Optional): Toggle the context panel and provide details about the conversation, or upload a document to enhance the AI analysis.

## 🔊 Audio Device Configuration

Meeting Mind requires access to two audio sources:

1. **Microphone**: Your default system microphone will be used to capture your voice (Speaker 1).

2. **Speaker Loopback**: The application automatically attempts to detect your system's PulseAudio monitor device to capture the other party's voice (Speaker 2).

### Troubleshooting Audio Devices

If the application fails to detect your audio devices correctly:

1. **Ensure PulseAudio is running**:
   ```bash
   pulseaudio --check
   ```

2. **Verify your PulseAudio monitor device**:
   ```bash
   pactl list sources | grep monitor
   ```

3. **Check default sources and sinks**:
   ```bash
   pactl info | grep Default
   ```

## 🔑 API Keys

### OpenAI API Key

The application uses OpenAI's Whisper API for transcription. You need to provide a valid OpenAI API key in the `.env` file.

### OpenRouter API Key (Optional)

To use Google's Gemini Pro model for analysis, you can optionally set up an OpenRouter API key. If not provided, the application will attempt to use your OpenAI API key for all features, which may limit some analysis capabilities.

## ✨ Next Steps

Once you have the application running, proceed to the [User Guide](user-guide.md) to learn how to use Meeting Mind effectively.
