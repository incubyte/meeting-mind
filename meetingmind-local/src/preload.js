const { ipcRenderer, contextBridge } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', {
    startRecording: () => ipcRenderer.send('start-recording'),
    stopRecording: () => ipcRenderer.send('stop-recording'),
    onNewSuggestion: (callback) => {
      ipcRenderer.on('new-suggestion', (event, ...args) => callback(...args));
    },
    onAudioData: (callback) => {
      ipcRenderer.on('audio-data', (event, ...args) => callback(...args));
    },
    onTranscription: (callback) => {
      ipcRenderer.on('transcription', (event, ...args) => callback(...args));
    },
    startTestRecording: () => ipcRenderer.send('start-test-recording'),
    stopTestRecording: () => ipcRenderer.send('stop-test-recording'),
    playTestRecording: () => ipcRenderer.send('play-test-recording'),
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('new-suggestion');
      ipcRenderer.removeAllListeners('audio-data');
      ipcRenderer.removeAllListeners('transcription');
    }
  }
);