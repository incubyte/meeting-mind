const testAudioBtn = document.getElementById("testAudioBtn");
const startRecordingBtn = document.getElementById("startRecordingBtn");
const stopRecordingBtn = document.getElementById("stopRecordingBtn");
const recordingStatusDiv = document.getElementById("recordingStatus");
const statusMessagesPre = document.getElementById("statusMessages");
const transcriptOutputDiv = document.getElementById("transcriptOutput");
const downloadTranscriptBtn = document.getElementById("downloadTranscriptBtn");
const micMeterBar = document.getElementById("micMeterBar");
const speakerMeterBar = document.getElementById("speakerMeterBar");

let statusLog = ["App Initialized."];
const MAX_STATUS_LINES = 20;

// Track audio levels for visualization
let lastMicLevel = 0;
let lastSpeakerLevel = 0;

// Helper to map audio level to percentage for display
function mapLevelToPercentage(level, max = 200) {
  // Cap the level at max to prevent overflow
  const cappedLevel = Math.min(level, max);
  // Map to percentage (0-100)
  return (cappedLevel / max) * 100;
}

// Update the audio level meters every 100ms
setInterval(() => {
  // Update mic level meter
  micMeterBar.style.width = `${mapLevelToPercentage(lastMicLevel)}%`;
  
  // Update speaker level meter (when we have actual speaker data)
  speakerMeterBar.style.width = `${mapLevelToPercentage(lastSpeakerLevel)}%`;
  
  // Add a color effect based on level
  if (lastMicLevel > 100) {
    micMeterBar.classList.add("bg-green-600");
  } else {
    micMeterBar.classList.remove("bg-green-600");
  }
  
  if (lastSpeakerLevel > 100) {
    speakerMeterBar.classList.add("bg-blue-600");
  } else {
    speakerMeterBar.classList.remove("bg-blue-600");
  }
}, 100);

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
  
  // Create a chat-style container
  const chatContainer = document.createElement("div");
  chatContainer.classList.add("chat-container");
  
  // Create a header to show we're in a chat view
  const chatHeader = document.createElement("div");
  chatHeader.classList.add("chat-header");
  chatHeader.innerHTML = "<span class='chat-participant you'>You</span> and <span class='chat-participant other'>Other Person</span>";
  chatContainer.appendChild(chatHeader);
  
  // Create the messages area
  const messagesArea = document.createElement("div");
  messagesArea.classList.add("chat-messages");
  
  // Ensure the transcript items are sorted by timestamp
  const sortedItems = [...transcriptItems].sort((a, b) => {
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
    nameSpan.textContent = item.source;
    
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
  
  // Scroll to bottom
  messagesArea.scrollTop = messagesArea.scrollHeight;
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

// --- Cleanup on unload ---
window.addEventListener('beforeunload', () => {
    window.electronAPI.removeAllListeners('transcript:update');
    window.electronAPI.removeAllListeners('status:update');
    window.electronAPI.removeAllListeners('recording:status');
});

// Initial UI state
stopRecordingBtn.disabled = true;
addStatusMessage("Renderer process loaded.");