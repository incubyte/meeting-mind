const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Renderer to Main (Invoke/Handle pattern for async requests)
  startRecording: () => ipcRenderer.invoke("audio:start"),
  stopRecording: () => ipcRenderer.invoke("audio:stop"),
  testAudio: () => ipcRenderer.invoke("audio:test"),

  // Main to Renderer (Send/On pattern for updates)
  onTranscriptUpdate: (callback) =>
    ipcRenderer.on("transcript:update", (_event, value) => callback(value)),
  onStatusUpdate: (callback) =>
    ipcRenderer.on("status:update", (_event, value) => callback(value)),
  onRecordingStatus: (callback) =>
    ipcRenderer.on("recording:status", (_event, value) => callback(value)),

  // Clean up listeners when the window is unloaded
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
