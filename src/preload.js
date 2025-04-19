const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Renderer to Main (Invoke/Handle pattern for async requests)
  startRecording: () => ipcRenderer.invoke("audio:start"),
  stopRecording: () => ipcRenderer.invoke("audio:stop"),
  testAudio: () => ipcRenderer.invoke("audio:test"),
  
  // Interview context management
  saveContext: (contextData) => ipcRenderer.invoke("context:save", contextData),
  uploadContextFile: (filePath) => ipcRenderer.invoke("context:upload", filePath),
  getFilePath: (fileObj) => {
    // This is a helper function to get file paths from a file object
    // In most cases, we'll fall back to the main process's file dialog
    return Promise.resolve(fileObj?.path || null);
  },
  
  // Interview analysis
  requestAnalysis: () => ipcRenderer.invoke("analysis:request"),
  requestInsights: () => ipcRenderer.invoke("insights:request"),

  // Settings and call type management
  openSettings: () => ipcRenderer.invoke("settings:open"),
  navigateToMain: () => ipcRenderer.invoke("settings:close"),
  getCallTypes: () => ipcRenderer.invoke("callTypes:getAll"),
  getCallType: (id) => ipcRenderer.invoke("callTypes:get", id),
  addCallType: (callType) => ipcRenderer.invoke("callTypes:add", callType),
  updateCallType: (id, updates) => ipcRenderer.invoke("callTypes:update", id, updates),
  deleteCallType: (id) => ipcRenderer.invoke("callTypes:delete", id),

  // Main to Renderer (Send/On pattern for updates)
  onTranscriptUpdate: (callback) =>
    ipcRenderer.on("transcript:update", (_event, value) => callback(value)),
  onStatusUpdate: (callback) =>
    ipcRenderer.on("status:update", (_event, value) => callback(value)),
  onRecordingStatus: (callback) =>
    ipcRenderer.on("recording:status", (_event, value) => callback(value)),
  onAnalysisUpdate: (callback) =>
    ipcRenderer.on("analysis:update", (_event, value) => callback(value)),
  onInsightsUpdate: (callback) =>
    ipcRenderer.on("insights:update", (_event, value) => callback(value)),
  onCallTypesUpdated: (callback) =>
    ipcRenderer.on("callTypes:updated", (_event) => callback()),

  // Clean up listeners when the window is unloaded
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
