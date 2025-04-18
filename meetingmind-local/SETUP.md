# MeetingMind Local - Setup Guide

## Project Structure

```
meetingmind-local/
├── .env.example        # Example environment variables file
├── .gitignore          # Git ignore file
├── README.md           # Project documentation
├── SETUP.md            # This setup guide
├── package.json        # Node.js package configuration
└── src/
    ├── audioCapture.js # Audio capture module
    ├── index.html      # Main application UI
    ├── index.js        # Main electron process
    ├── llmAnalyzer.js  # LLM analysis module
    ├── preload.js      # Electron preload script
    └── speechToText.js # Speech-to-text module
```

## Setup Steps

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   ```bash
   cp .env.example .env
   # Edit .env and add your OpenAI API key
   ```

3. **System Audio Loopback Setup**

   This application requires system audio loopback to capture audio from other applications.
   Setup varies by platform:

   **Windows:**
   - Install [VB-CABLE Virtual Audio Device](https://vb-audio.com/Cable/)
   - Set VB-CABLE as your default output device
   - Modify `audioCapture.js` to use VB-CABLE as input device

   **macOS:**
   - Install [BlackHole](https://existential.audio/blackhole/)
   - Create a Multi-Output Device in Audio MIDI Setup
   - Modify `audioCapture.js` to use BlackHole as input device

   **Linux:**
   - Configure PulseAudio loopback:
     ```bash
     pactl load-module module-loopback latency_msec=1
     ```
   - Modify `audioCapture.js` to use the correct PulseAudio device

4. **Start the Application**
   ```bash
   npm start
   ```

## Next Steps for Development

1. **Implement System Audio Capture**
   - Complete the OS-specific implementations in `audioCapture.js`
   - Test with different audio output sources

2. **Optimize Speech Recognition**
   - Implement chunking for more efficient API usage
   - Add offline models as an alternative to API-based STT

3. **Enhance LLM Analyzer**
   - Fine-tune prompts for better suggestions
   - Add topic detection and meeting context awareness

4. **UI Improvements**
   - Add settings panel for configuration
   - Implement suggestion categories (clarity, conciseness, etc.)
   - Add visualization of conversation flow

5. **Packaging & Distribution**
   - Add electron-builder for creating installable packages
   - Create installers for different platforms