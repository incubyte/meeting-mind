const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Renderer to Main (Invoke/Handle pattern for async requests)
  startRecording: () => ipcRenderer.invoke("audio:start"),
  stopRecording: () => ipcRenderer.invoke("audio:stop"),
  testAudio: () => ipcRenderer.invoke("audio:test"),
  
  // Interview context management
  saveContext: (contextData) => ipcRenderer.invoke("context:save", contextData),
  uploadContextFile: (filePath) => ipcRenderer.invoke("context:upload", filePath),
  
  // Interview analysis
  requestAnalysis: () => ipcRenderer.invoke("analysis:request"),

  // Main to Renderer (Send/On pattern for updates)
  onTranscriptUpdate: (callback) =>
    ipcRenderer.on("transcript:update", (_event, value) => callback(value)),
  onStatusUpdate: (callback) =>
    ipcRenderer.on("status:update", (_event, value) => callback(value)),
  onRecordingStatus: (callback) =>
    ipcRenderer.on("recording:status", (_event, value) => callback(value)),
  onAnalysisUpdate: (callback) =>
    ipcRenderer.on("analysis:update", (_event, value) => callback(value)),

  // Clean up listeners when the window is unloaded
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
