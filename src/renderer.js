const testAudioBtn = document.getElementById("testAudioBtn");
const startRecordingBtn = document.getElementById("startRecordingBtn");
const stopRecordingBtn = document.getElementById("stopRecordingBtn");
const recordingStatusDiv = document.getElementById("recordingStatus");
const statusMessagesPre = document.getElementById("statusMessages");
const transcriptOutputDiv = document.getElementById("transcriptOutput");
const downloadTranscriptBtn = document.getElementById("downloadTranscriptBtn");
const micMeterBar = document.getElementById("micMeterBar");
const speakerMeterBar = document.getElementById("speakerMeterBar");
const settingsBtn = document.getElementById("settingsBtn");

// Call and context elements
const callTypeSelect = document.getElementById("callTypeSelect");
const contextToggle = document.getElementById("contextToggle");
const contextFields = document.getElementById("contextFields");
const contextFileInput = document.getElementById("contextFileInput");
const uploadFileBtn = document.getElementById("uploadFileBtn"); 
const contextTextArea = document.getElementById("contextTextArea");
const saveContextBtn = document.getElementById("saveContextBtn");
const contextStatusSpan = document.getElementById("contextStatus");

// Analysis elements
const analysisOutputDiv = document.getElementById("analysisOutput");

// Insights elements
const insightsOutputDiv = document.getElementById("insightsOutput");

let statusLog = ["App Initialized."];
const MAX_STATUS_LINES = 20;

// Track audio levels for visualization
let lastMicLevel = 0;
let lastSpeakerLevel = 0;

// Constants from main.js for the UI
const VAD_AMPLITUDE_THRESHOLD = 80; // Speech detection threshold
const VAD_SILENCE_THRESHOLD = 50;   // Silence detection threshold
const MAX_AUDIO_LEVEL = 200;        // Maximum level for scaling

// Helper to map audio level to percentage for display
function mapLevelToPercentage(level, max = MAX_AUDIO_LEVEL) {
  // Cap the level at max to prevent overflow
  const cappedLevel = Math.min(level, max);
  // Map to percentage (0-100)
  return (cappedLevel / max) * 100;
}

// Position the threshold indicators on the level meters
function positionThresholdIndicators() {
  const micThreshold = document.querySelector('.mic-threshold');
  const speakerThreshold = document.querySelector('.speaker-threshold');
  
  if (micThreshold) {
    micThreshold.style.left = `${mapLevelToPercentage(VAD_AMPLITUDE_THRESHOLD)}%`;
  }
  
  if (speakerThreshold) {
    speakerThreshold.style.left = `${mapLevelToPercentage(VAD_AMPLITUDE_THRESHOLD)}%`;
  }
}

// Update the audio level meters every 50ms for more responsive UI
setInterval(() => {
  // Update mic level meter
  micMeterBar.style.width = `${mapLevelToPercentage(lastMicLevel)}%`;
  
  // Update speaker level meter (when we have actual speaker data)
  speakerMeterBar.style.width = `${mapLevelToPercentage(lastSpeakerLevel)}%`;
  
  // Add a color effect based on level
  if (lastMicLevel >= 80) { // Using the VAD_AMPLITUDE_THRESHOLD value
    micMeterBar.classList.add("bg-green-600");
  } else {
    micMeterBar.classList.remove("bg-green-600");
  }
  
  if (lastSpeakerLevel >= 80) { // Using the VAD_AMPLITUDE_THRESHOLD value
    speakerMeterBar.classList.add("bg-blue-600");
  } else {
    speakerMeterBar.classList.remove("bg-blue-600");
  }
}, 50);

function addStatusMessage(message) {
  console.log("Status Update:", message); // Log to console as well
  
  // Special handling for mic level messages
  if (message.startsWith("[MIC] Level:")) {
    // Extract level and update the mic meter
    const levelMatch = message.match(/Level: (\d+)/);
    if (levelMatch && levelMatch[1]) {
      const level = parseInt(levelMatch[1]);
      lastMicLevel = level;
    }
    
    const status = message.includes("SPEECH") ? "SPEAKING" : "silent";
    
    // Update the recording status display
    const recordingStatusText = recordingStatusDiv.textContent.split('(')[0];
    recordingStatusDiv.textContent = `${recordingStatusText} (Mic: ${lastMicLevel} - ${status})`;
    
    // Use color to indicate speech detection
    if (status === "SPEAKING") {
      recordingStatusDiv.style.color = "#28a745"; // Green when speaking
    } else {
      recordingStatusDiv.style.color = "black"; // Default color when silent
    }
    
    // Don't add these messages to the log to avoid cluttering
    return;
  }
  
  // Special handling for speaker level messages (if they exist)
  if (message.startsWith("[SPEAKER] Level:")) {
    // Extract level and update the speaker meter
    const levelMatch = message.match(/Level: (\d+)/);
    if (levelMatch && levelMatch[1]) {
      const level = parseInt(levelMatch[1]);
      lastSpeakerLevel = level;
    }
    
    // Don't add these messages to the log to avoid cluttering
    return;
  }
  
  // For other messages, proceed as normal
  // Remove timestamp prefixes if they exist for cleaner UI display
  const cleanMessage = message.replace(/^\[(INFO|WARN|ERROR|VERBOSE)\]\s*/, "");
  statusLog.push(cleanMessage);
  if (statusLog.length > MAX_STATUS_LINES) {
    statusLog.shift(); // Keep log size manageable
  }
  statusMessagesPre.textContent = statusLog.join("\n");
  // Scroll to bottom
  statusMessagesPre.scrollTop = statusMessagesPre.scrollHeight;
}

function updateTranscript(transcriptItems) {
  transcriptOutputDiv.innerHTML = ""; // Clear current transcript
  
  // If no transcript items, show a placeholder
  if (!transcriptItems || transcriptItems.length === 0) {
    transcriptOutputDiv.innerHTML = '<div class="p-4 text-gray-500 text-center">Transcript will appear here once the interview begins...</div>';
    return;
  }
  
  // Create a chat-style container
  const chatContainer = document.createElement("div");
  chatContainer.classList.add("chat-container");
  
  // Create a header to show we're in a chat view
  const chatHeader = document.createElement("div");
  chatHeader.classList.add("chat-header");
  chatHeader.innerHTML = "<span class='chat-participant you'>Speaker 1</span> and <span class='chat-participant other'>Speaker 2</span>";
  chatContainer.appendChild(chatHeader);
  
  // Create the messages area
  const messagesArea = document.createElement("div");
  messagesArea.classList.add("chat-messages");
  
  // Filter out items with only "you" text and sort by timestamp
  const filteredItems = [...transcriptItems].filter(item => {
    // Get cleaned up text (trimmed and lowercase)
    const cleanText = item.text?.trim().toLowerCase();
    // Filter out if text is only "you"
    return cleanText !== "you";
  });
  
  // Sort the filtered items by timestamp
  const sortedItems = filteredItems.sort((a, b) => {
    const timeA = a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp);
    const timeB = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
    return timeA - timeB;
  });
  
  // Add messages to the chat
  sortedItems.forEach((item) => {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("chat-message", item.source === "You" ? "message-you" : "message-other");
    
    // Add data attributes for tracking
    if (item.id) {
      messageDiv.dataset.messageId = item.id;
    }
    
    const bubbleDiv = document.createElement("div");
    bubbleDiv.classList.add("message-bubble");
    
    const nameSpan = document.createElement("div");
    nameSpan.classList.add("message-name");
    nameSpan.textContent = item.source === "You" ? "Speaker 1" : "Speaker 2";
    
    const textDiv = document.createElement("div");
    textDiv.classList.add("message-text");
    textDiv.textContent = item.text;
    
    // Time display - show either timestamp or last updated based on what's available
    const timeSpan = document.createElement("div");
    timeSpan.classList.add("message-time");
    const messageTime = item.timestamp instanceof Date ? item.timestamp : new Date(item.timestamp);
    
    // If message has been updated, show that information
    if (item.lastUpdated && item.lastUpdated !== item.timestamp) {
      const lastUpdateTime = item.lastUpdated instanceof Date ? item.lastUpdated : new Date(item.lastUpdated);
      // Show both times if message was updated
      timeSpan.innerHTML = `${messageTime.toLocaleTimeString()} <span class="message-updated">(updated ${lastUpdateTime.toLocaleTimeString()})</span>`;
    } else {
      // Just show the creation time
      timeSpan.textContent = messageTime.toLocaleTimeString();
    }
    
    bubbleDiv.appendChild(nameSpan);
    bubbleDiv.appendChild(textDiv);
    bubbleDiv.appendChild(timeSpan);
    messageDiv.appendChild(bubbleDiv);
    messagesArea.appendChild(messageDiv);
  });
  
  chatContainer.appendChild(messagesArea);
  transcriptOutputDiv.appendChild(chatContainer);
  
  // Scroll to bottom - both the messages area and the transcript container
  messagesArea.scrollTop = messagesArea.scrollHeight;
  transcriptOutputDiv.scrollTop = transcriptOutputDiv.scrollHeight;
}

// Function to download transcript as text or JSON
function downloadTranscript(transcriptItems, format = 'text') {
  if (!transcriptItems || transcriptItems.length === 0) {
    addStatusMessage("No transcript available to download");
    return;
  }
  
  let content = '';
  let filename = `meeting-transcript-${new Date().toISOString().split('T')[0]}.`;
  let mimeType = '';
  
  // Sort transcript items by timestamp
  const sortedItems = [...transcriptItems].sort((a, b) => {
    const timeA = a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp);
    const timeB = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
    return timeA - timeB;
  });
  
  if (format === 'json') {
    // JSON format
    content = JSON.stringify(sortedItems, null, 2);
    filename += 'json';
    mimeType = 'application/json';
  } else {
    // Text format (default)
    content = sortedItems.map(item => {
      const time = new Date(item.timestamp).toLocaleTimeString();
      return `[${time}] ${item.source}: ${item.text}`;
    }).join('\n\n');
    filename += 'txt';
    mimeType = 'text/plain';
  }
  
  // Create download link
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  
  // Clean up
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
  
  addStatusMessage(`Transcript downloaded as ${filename}`);
}

// --- Button Event Listeners ---
testAudioBtn.addEventListener("click", async () => {
  addStatusMessage("Testing audio devices...");
  testAudioBtn.disabled = true;
  try {
    const result = await window.electronAPI.testAudio();
    addStatusMessage(
      `Test Complete: Mic=${result.micOk ? 'OK' : 'FAIL'}, Speaker=${result.speakerOk ? 'OK' : 'FAIL'} ${result.speakerDevice ? '('+result.speakerDevice+')' : ''}`,
    );
  } catch (error) {
    addStatusMessage(`Error during audio test: ${error.message}`);
  } finally {
    testAudioBtn.disabled = false;
  }
});

startRecordingBtn.addEventListener("click", async () => {
  addStatusMessage("Requesting to start recording...");
  startRecordingBtn.disabled = true; // Disable while starting
  try {
    const result = await window.electronAPI.startRecording();
    if (result.success) {
      addStatusMessage("Recording started successfully by main process.");
      // Status update will come via onRecordingStatus
    } else {
      addStatusMessage("Main process failed to start recording.");
      startRecordingBtn.disabled = false; // Re-enable if failed
    }
  } catch (error) {
    addStatusMessage(`Error starting recording: ${error.message}`);
    startRecordingBtn.disabled = false; // Re-enable on error
  }
});

stopRecordingBtn.addEventListener("click", async () => {
  addStatusMessage("Requesting to stop recording...");
  stopRecordingBtn.disabled = true; // Disable while stopping
  try {
    const result = await window.electronAPI.stopRecording();
    if (result.success) {
      addStatusMessage("Recording stopped successfully by main process.");
      // Status update will come via onRecordingStatus
    } else {
      addStatusMessage("Main process reported an issue stopping recording.");
      // Keep disabled? State might be uncertain. Let onRecordingStatus handle UI.
    }
  } catch (error) {
    addStatusMessage(`Error stopping recording: ${error.message}`);
    // Let onRecordingStatus handle UI state based on main process reality
  }
});

// Download transcript button
downloadTranscriptBtn.addEventListener("click", () => {
  // Get the current transcript items from the last received update
  const transcriptItems = window.currentTranscriptItems || [];
  downloadTranscript(transcriptItems, 'text');
});

// --- IPC Event Listeners ---
window.electronAPI.onTranscriptUpdate((transcriptItems) => {
  console.log("Received transcript update:", transcriptItems);
  // Store the transcript items for download function
  window.currentTranscriptItems = transcriptItems;
  updateTranscript(transcriptItems);
});

window.electronAPI.onStatusUpdate((message) => {
  addStatusMessage(message);
});

window.electronAPI.onRecordingStatus(({ isRecording, error }) => {
  console.log("Received recording status:", { isRecording, error });
  if (isRecording) {
    recordingStatusDiv.textContent = "Recording: Active";
    recordingStatusDiv.style.color = "green";
    startRecordingBtn.disabled = true;
    stopRecordingBtn.disabled = false;
    testAudioBtn.disabled = true;
    
    // Add an initial status message about the VAD system
    addStatusMessage("Voice Activity Detection enabled - watching for speech...");
  } else {
    recordingStatusDiv.textContent = `Recording: Inactive ${error ? '(Error)' : ''}`;
    recordingStatusDiv.style.color = error ? "red" : "black";
    startRecordingBtn.disabled = false;
    stopRecordingBtn.disabled = true;
    testAudioBtn.disabled = false;
    if (error) {
        addStatusMessage(`Recording stopped due to error: ${error}`);
    }
  }
});

// --- Context Management ---
uploadFileBtn.addEventListener("click", async () => {
  // If context fields are hidden, show them first
  if (contextFields.classList.contains('hidden')) {
    contextToggle.checked = true;
    contextFields.classList.remove('hidden');
    // Give time for the UI to update before checking the file
    setTimeout(() => {
      checkAndUploadFile();
    }, 100);
  } else {
    checkAndUploadFile();
  }
});

async function checkAndUploadFile() {
  const fileObj = contextFileInput.files[0];
  
  console.log("File object:", fileObj);
  
  // Check if we have a file selected
  if (!fileObj) {
    addStatusMessage("No file selected. Please select a file first.");
    contextStatusSpan.textContent = "No file selected";
    return;
  }
  
  // Handle the file path differently based on browser compatibility
  // Some browsers use path, others use webkitRelativePath or name
  let filePath;
  if (fileObj.path) {
    filePath = fileObj.path;
  } else if (typeof window.electronAPI?.getFilePath === 'function') {
    // If we have a special electron API for getting file paths
    try {
      filePath = await window.electronAPI.getFilePath(fileObj);
    } catch (error) {
      console.error("Error getting file path:", error);
    }
  }
  
  // If we still don't have a path, use the file dialog
  if (!filePath) {
    try {
      // Tell the main process to open a file dialog
      const result = await window.electronAPI.uploadContextFile();
      if (result.success) {
        // The main process handled the file selection and processing
        handleUploadResult(result);
        return;
      } else {
        addStatusMessage("File selection canceled or failed.");
        contextStatusSpan.textContent = "File selection canceled";
        return;
      }
    } catch (error) {
      addStatusMessage(`Error with file dialog: ${error.message}`);
      contextStatusSpan.textContent = "Error selecting file";
      return;
    }
  }
  
  uploadFileBtn.disabled = true;
  contextStatusSpan.textContent = "Uploading file...";
  
  try {
    const result = await window.electronAPI.uploadContextFile(filePath);
    handleUploadResult(result);
  } catch (error) {
    contextStatusSpan.textContent = "Upload failed";
    addStatusMessage(`Error uploading context file: ${error.message}`);
    uploadFileBtn.disabled = false;
  }
}

// Process the upload result
function handleUploadResult(result) {
  if (result.success) {
    // Set the content in the textarea
    contextTextArea.value = result.content;
    
    // If it's a PDF file and has a summary, request early analysis
    if (result.isPdf && result.summary) {
      // Store the summary as additional context
      handleSaveContext({
        isPdf: true, 
        summary: result.summary
      });
      
      // Request an initial analysis
      requestEarlyAnalysis(result.summary);
      
      contextStatusSpan.textContent = `PDF uploaded and analyzed: ${result.filePath.split('/').pop()}`;
      addStatusMessage(`PDF uploaded and analyzed. Analysis and insights generated.`);
    } else {
      contextStatusSpan.textContent = `File uploaded: ${result.filePath.split('/').pop()}`;
      addStatusMessage(`Context file uploaded successfully.`);
    }
  } else {
    contextStatusSpan.textContent = `Upload failed: ${result.error}`;
    addStatusMessage(`Context file upload failed: ${result.error}`);
  }
  
  uploadFileBtn.disabled = false;
}

// Function to request early analysis based on document summary
async function requestEarlyAnalysis(summary) {
  try {
    // Call analysis API with the document summary
    const result = await window.electronAPI.requestAnalysis();
    if (result.success) {
      // Format the analysis result with line breaks
      const formattedAnalysis = result.analysis.replace(/\n/g, '<br>');
      analysisOutputDiv.innerHTML = formattedAnalysis;
      
      // Make insights available too
      const insightsResult = await window.electronAPI.requestInsights();
      if (insightsResult.success) {
        insightsOutputDiv.innerHTML = insightsResult.insights.replace(/\n/g, '<br>');
      }
      
      // Document processed successfully
    }
  } catch (error) {
    addStatusMessage(`Error generating early analysis: ${error.message}`);
  }
}

saveContextBtn.addEventListener("click", async () => {
  const contextText = contextTextArea.value.trim();
  if (!contextText) {
    contextStatusSpan.textContent = "No context provided";
    return;
  }
  
  saveContextBtn.disabled = true;
  contextStatusSpan.textContent = "Saving context...";
  
  try {
    const result = await window.electronAPI.saveContext({
      // For now, put all text in additionalContext
      // Could add more structure later for separate job desc/candidate fields
      additionalContext: contextText
    });
    
    if (result.success) {
      contextStatusSpan.textContent = "Context saved successfully";
      addStatusMessage("Interview context saved successfully.");
      
      // Context saved successfully
    } else {
      contextStatusSpan.textContent = `Save failed: ${result.error}`;
      addStatusMessage(`Failed to save context: ${result.error}`);
    }
  } catch (error) {
    contextStatusSpan.textContent = "Save failed";
    addStatusMessage(`Error saving context: ${error.message}`);
  } finally {
    saveContextBtn.disabled = false;
  }
});

// --- Analysis ---

// Add analysis update listener
window.electronAPI.onAnalysisUpdate((analysisResult) => {
  // Format the analysis result with line breaks
  const formattedAnalysis = analysisResult.replace(/\n/g, '<br>');
  analysisOutputDiv.innerHTML = formattedAnalysis;
});

// --- Insights ---

// Add insights update listener
window.electronAPI.onInsightsUpdate((insightsResult) => {
  // Format the insights result with line breaks
  const formattedInsights = insightsResult.replace(/\n/g, '<br>');
  insightsOutputDiv.innerHTML = formattedInsights;
});

// --- Cleanup on unload ---

window.addEventListener('beforeunload', () => {
    window.electronAPI.removeAllListeners('transcript:update');
    window.electronAPI.removeAllListeners('status:update');
    window.electronAPI.removeAllListeners('recording:status');
    window.electronAPI.removeAllListeners('analysis:update');
    window.electronAPI.removeAllListeners('insights:update');
    window.electronAPI.removeAllListeners('callTypes:updated');
});

// --- Call Type Management ---
async function loadCallTypes() {
  try {
    const callTypes = await window.electronAPI.getCallTypes();
    
    // Clear existing options except the default
    while (callTypeSelect.options.length > 1) {
      callTypeSelect.remove(1);
    }
    
    // Add call types to the dropdown
    callTypes.forEach(callType => {
      const option = new Option(callType.name, callType.id);
      callTypeSelect.add(option);
    });
    
    addStatusMessage(`Loaded ${callTypes.length} call types`);
  } catch (error) {
    console.error('Error loading call types:', error);
    addStatusMessage(`Error loading call types: ${error.message}`);
  }
}

// Settings button click handler
settingsBtn.addEventListener('click', async () => {
  try {
    await window.electronAPI.openSettings();
  } catch (error) {
    console.error('Error opening settings:', error);
    addStatusMessage(`Error opening settings: ${error.message}`);
  }
});

// Update context save handler to include call type
saveContextBtn.addEventListener("click", async () => {
  // If context fields are hidden, show them first
  if (contextFields.classList.contains('hidden')) {
    contextToggle.checked = true;
    contextFields.classList.remove('hidden');
    // Let UI update before continuing
    return setTimeout(() => {
      handleSaveContext();
    }, 100);
  } else {
    handleSaveContext();
  }
});

async function handleSaveContext(customContext) {
  // Use provided custom context or get values from form
  const contextText = customContext ? undefined : contextTextArea.value.trim();
  const selectedCallTypeId = customContext ? undefined : callTypeSelect.value;
  
  // If custom context object was provided, use that directly
  if (customContext) {
    try {
      const result = await window.electronAPI.saveContext({
        ...(customContext.isPdf && { documentSummary: customContext.summary }),
        ...(customContext.additionalContext && { additionalContext: customContext.additionalContext })
      });
      
      if (result.success) {
        addStatusMessage("Document context saved successfully.");
        return true;
      }
      return false;
    } catch (error) {
      addStatusMessage(`Error saving document context: ${error.message}`);
      return false;
    }
  }
  
  // Regular form submission flow
  if (!contextText && !selectedCallTypeId) {
    contextStatusSpan.textContent = "Please select a call type or provide context";
    return;
  }
  
  saveContextBtn.disabled = true;
  contextStatusSpan.textContent = "Saving context...";
  
  try {
    const result = await window.electronAPI.saveContext({
      callTypeId: selectedCallTypeId,
      additionalContext: contextText
    });
    
    if (result.success) {
      contextStatusSpan.textContent = "Context saved successfully";
      addStatusMessage("Call context saved successfully.");
      
      // Context saved successfully
    } else {
      contextStatusSpan.textContent = `Save failed: ${result.error}`;
      addStatusMessage(`Failed to save context: ${result.error}`);
    }
  } catch (error) {
    contextStatusSpan.textContent = "Save failed";
    addStatusMessage(`Error saving context: ${error.message}`);
  } finally {
    saveContextBtn.disabled = false;
  }
}

// Initial UI state
stopRecordingBtn.disabled = true;

// Position the threshold indicators for audio levels
positionThresholdIndicators();

// Context toggle functionality
contextToggle.addEventListener('change', () => {
  if (contextToggle.checked) {
    contextFields.classList.remove('hidden');
  } else {
    contextFields.classList.add('hidden');
  }
});

// Load call types on startup
loadCallTypes();

// Listen for call types updates
window.electronAPI.onCallTypesUpdated(() => {
  addStatusMessage("Call types updated, refreshing dropdown");
  loadCallTypes();
});

// Update UI when recording status changes
window.electronAPI.onRecordingStatus((status) => {
  if (status.isRecording) {
    // Disable settings button during recording
    settingsBtn.disabled = true;
    settingsBtn.classList.add('opacity-50', 'cursor-not-allowed');
  } else {
    // Enable settings button when not recording
    settingsBtn.disabled = false;
    settingsBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  }
});

addStatusMessage("Renderer process loaded.");