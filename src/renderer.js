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
  transcriptItems.forEach((item) => {
    const itemDiv = document.createElement("div");
    itemDiv.classList.add("transcript-item");

    const sourceSpan = document.createElement("span");
    sourceSpan.classList.add("transcript-source", `transcript-source-${item.source}`);
    sourceSpan.textContent = `${item.source}:`; // e.g., "You:", "Other:"

    const textSpan = document.createElement("span");
    textSpan.classList.add("transcript-text");
    textSpan.textContent = item.text;

    const timeSpan = document.createElement("span");
    timeSpan.classList.add("transcript-timestamp");
    timeSpan.textContent = `(${item.timestamp.toLocaleTimeString()})`;

    itemDiv.appendChild(sourceSpan);
    itemDiv.appendChild(textSpan);
    itemDiv.appendChild(timeSpan);
    transcriptOutputDiv.appendChild(itemDiv);
  });
  // Scroll to bottom
  transcriptOutputDiv.scrollTop = transcriptOutputDiv.scrollHeight;
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
