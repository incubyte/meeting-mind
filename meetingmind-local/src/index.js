require('dotenv').config();
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const AudioCapture = require('./audioCapture');
const SpeechToText = require('./speechToText');
const LLMAnalyzer = require('./llmAnalyzer');

let mainWindow;
let audioCapture;
let speechToText;
let llmAnalyzer;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 800, // Increased height to accommodate new UI elements
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  // Open DevTools in development
  mainWindow.webContents.openDevTools();
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  
  // Initialize core components
  audioCapture = new AudioCapture();
  speechToText = new SpeechToText();
  llmAnalyzer = new LLMAnalyzer();
  
  // Setup processing pipeline
  setupAudioProcessingPipeline();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function setupAudioProcessingPipeline() {
  // Start listening for audio from microphone
  audioCapture.startMicrophoneCapture();
  
  // Start listening for system audio (this is more complex and OS-specific)
  audioCapture.startSystemAudioCapture();
  
  // Process microphone audio
  audioCapture.on('microphoneData', async (audioData) => {
    const transcription = await speechToText.transcribe(audioData, 'microphone');
    if (transcription) {
      processTranscription(transcription, 'microphone');
    }
  });
  
  // Process system audio
  audioCapture.on('systemAudioData', async (audioData) => {
    const transcription = await speechToText.transcribe(audioData, 'system');
    if (transcription) {
      processTranscription(transcription, 'system');
    }
  });

  // Handle audio visualization data
  audioCapture.on('audioData', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('audio-data', data);
    }
  });

  // Handle test recording events
  audioCapture.on('testRecordingReady', (filePath) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('test-recording-ready', filePath);
    }
  });
}

async function processTranscription(transcription, source) {
  // Add to transcript buffer
  const analysis = await llmAnalyzer.analyzeTranscript(transcription, source);
  
  // Send transcription to UI
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('transcription', transcription);
  }
  
  // Send suggestions to UI
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('new-suggestion', analysis);
  }
}

// IPC handlers for UI interaction
ipcMain.on('start-recording', () => {
  audioCapture.startMicrophoneCapture();
  audioCapture.startSystemAudioCapture();
});

ipcMain.on('stop-recording', () => {
  audioCapture.stopMicrophoneCapture();
  audioCapture.stopSystemAudioCapture();
});

// Test recording handlers
ipcMain.on('start-test-recording', () => {
  audioCapture.startTestRecording();
});

ipcMain.on('stop-test-recording', () => {
  audioCapture.stopTestRecording();
});

ipcMain.on('play-test-recording', () => {
  audioCapture.playTestRecording();
});