const testAudioBtn = document.getElementById("testAudioBtn");
const startRecordingBtn = document.getElementById("startRecordingBtn");
const stopRecordingBtn = document.getElementById("stopRecordingBtn");
const recordingStatusDiv = document.getElementById("recordingStatus");
const statusMessagesPre = document.getElementById("statusMessages");
const transcriptOutputDiv = document.getElementById("transcriptOutput");

let statusLog = ["App Initialized."];
const MAX_STATUS_LINES = 20;

function addStatusMessage(message) {
  console.log("Status Update:", message); // Log to console as well
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

// --- IPC Event Listeners ---
window.electronAPI.onTranscriptUpdate((transcriptItems) => {
  console.log("Received transcript update:", transcriptItems);
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
