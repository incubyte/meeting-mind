# 📊 Meeting Mind Development Guide

This guide provides information for developers who want to understand, modify, or contribute to the Meeting Mind application.

## 🏗️ Project Structure

```
meeting-mind/
├── data/                 # Settings storage
├── docs/                 # Documentation
├── src/                  # Source code
│   ├── assets/           # Static assets
│   ├── components/       # UI components
│   ├── utils/            # Utility functions
│   ├── index.html        # Main UI template
│   ├── settings.html     # Settings UI template
│   ├── main.js           # Main Electron process
│   ├── preload.js        # Preload script for IPC
│   ├── renderer.js       # Main UI logic
│   ├── settings.js       # Settings UI logic
│   └── style.css         # CSS styles (Tailwind source)
├── tmp/                  # Debug recordings
├── index.js              # Application entry point
├── package.json          # Project dependencies
└── tailwind.config.js    # Tailwind CSS configuration
```

## 🔄 Application Flow

### Main Process (`main.js`)

The main process handles the core functionality:

1. **Initialization**:
   - Loads environment variables and configuration
   - Creates browser windows
   - Sets up IPC handlers

2. **Audio Processing**:
   - Voice Activity Detection (VAD)
   - Audio buffer management
   - WAV file handling

3. **API Integration**:
   - OpenAI Whisper API for transcription
   - OpenRouter API for Gemini Pro access

4. **Data Management**:
   - Transcript buffer management
   - Context management
   - Settings storage

### Renderer Process

The renderer process is divided into two main parts:

1. **Main UI** (`renderer.js`, `index.html`):
   - Audio controls and visualization
   - Transcript display
   - Analysis and insights presentation
   - Context management UI

2. **Settings UI** (`settings.js`, `settings.html`):
   - Call type management
   - Rich text editing
   - Configuration options

### IPC Communication

Communication between main and renderer processes is handled through a secure IPC bridge defined in `preload.js`. This exports an `electronAPI` object to the renderer with methods for:

- Audio control
- Transcript updates
- Analysis requests
- Settings management

## 🛠️ Development Setup

### Prerequisites

- Node.js v14 or higher
- npm or yarn
- Linux environment with PulseAudio
- OpenAI API key

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/meeting-mind.git
   cd meeting-mind
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with your API keys:
   ```
   OPENAI_API_KEY=your_api_key_here
   OPENROUTER_API_KEY=your_openrouter_key_here # Optional
   ```

4. Build the CSS and start the development server:
   ```bash
   npm run tailwind:build
   npm run dev
   ```

## 🧩 Key Components

### Voice Activity Detection (VAD)

The VAD system in `main.js` is the heart of the application. It:

- Processes raw audio frames in real-time
- Calculates audio amplitude (energy level)
- Detects speech start and end points
- Creates WAV files for complete utterances

Key functions:
- `processAudioForVAD`: Main processing function
- `finalizeUtterance`: Completes an utterance and sends for transcription
- `calculateAmplitude`: Computes audio energy levels
- `extractSamplesFromBuffer`: Extracts audio samples from raw data

### Transcription System

The transcription system manages sending audio to OpenAI and processing results:

- `transcribeAudioChunk`: Sends audio to OpenAI and gets transcription
- `processTranscript`: Determines if a transcript should be added, appended, or ignored
- `calculateTextSimilarity`: Measures similarity between text segments

### Analysis Engine

The analysis engine interacts with the LLM to provide insights:

- `analyzeInterview`: Generates analysis from conversation
- `generateInterviewInsights`: Creates structured Q&A insights
- `buildAnalysisSystemPrompt`: Creates contextual prompts
- `formatTranscriptForLLM`: Formats transcript for model input

## 🔍 Debugging and Testing

### Debug Logging

The application has a comprehensive logging system with different levels:

```javascript
logVerbose("Detailed debug info");
logInfo("General information");
logWarn("Warning or potential issue");
logError("Error condition");
```

These logs are visible in both the console and the Status panel in the UI.

### Audio Debug Files

When `DEBUG_SAVE_RECORDINGS` is enabled, debug files are saved to the `tmp` directory:

- `continuous-mic-*.wav`: Complete microphone recording
- `continuous-speaker-*.wav`: Complete speaker recording
- `vad-mic-utterance-*.wav`: Individual microphone utterances
- `vad-speaker-utterance-*.wav`: Individual speaker utterances
- `openai-submit-*.wav`: Files sent to OpenAI
- `debug-transcription-*.json`: Transcription results

### Testing Audio Devices

Use the "Test Audio" button to verify audio device configuration and display recommended VAD thresholds based on your microphone levels.

## 💡 Extending the Application

### Adding New Features

1. **Main Process Features**:
   - Add new methods to `main.js`
   - Register IPC handlers for new features
   - Update state management as needed

2. **Renderer Features**:
   - Update `preload.js` to expose new IPC methods
   - Add UI elements to `index.html`
   - Implement interaction in `renderer.js`

### Customizing Analysis

The analysis capabilities can be extended by modifying the system prompts:

- Update `buildAnalysisSystemPrompt()` for changes to the Analysis panel
- Update `buildInsightsSystemPrompt()` for changes to the Insights panel

### Adding Support for Other LLMs

To support additional LLM providers:

1. Add a new API client creation function similar to `createOpenRouterClient()`
2. Update the model constant: `LLM_MODEL`
3. Modify the analysis functions to use the new provider

## 🤝 Contributing

Contributions are welcome! To contribute:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

Please ensure your code follows the existing style and includes appropriate documentation.

## 📜 Build and Distribution

### Building for Production

To create a production build:

```bash
npm run tailwind:build
npm run build
```

### Packaging for Distribution

The application can be packaged using electron-builder:

```bash
npm run dist
```

This will create distributable packages in the `dist` directory.

### Configuring electron-builder

Electron-builder configuration is in `package.json`. Customize the `build` section to change application icons, metadata, and packaging options.
