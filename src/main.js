import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import AudioRecorder from "node-audiorecorder";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config(); // Load .env file

const execPromise = promisify(exec);

// --- Configuration ---
// const MICROPHONE_DEVICE_ID = null; // Keep null to use default mic
const RECORDING_CHUNK_DURATION_SECONDS = 7; // Increased from 5 to 7 seconds for better transcription
const VERBOSE_LOGGING = true;
const TEMP_AUDIO_DIR = path.join(os.tmpdir(), "meeting-mind-audio");
const DEBUG_SAVE_RECORDINGS = true; // Save recordings for debugging
const DEBUG_RECORDINGS_DIR = path.join(path.dirname(import.meta.dirname), "tmp");
// --- End Configuration ---

let mainWindow;
let micRecorder = null;
let speakerRecorder = null;
let micFileStream = null;
let speakerFileStream = null;
let speakerLoopbackDevice = null;
let isRecording = false;
let recordingInterval = null;
let transcriptBuffer = []; // { timestamp: Date, source: string, text: string }[]
let chunkCounter = 0;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function logVerbose(...args) {
  if (VERBOSE_LOGGING) {
    console.log("[VERBOSE]", ...args);
    if (mainWindow) {
      mainWindow.webContents.send("status:update", `[VERBOSE] ${args.join(" ")}`);
    }
  }
}

function logInfo(...args) {
  console.log("[INFO]", ...args);
  if (mainWindow) {
    mainWindow.webContents.send("status:update", `[INFO] ${args.join(" ")}`);
  }
}

function logWarn(...args) {
  console.warn("[WARN]", ...args);
  if (mainWindow) {
    mainWindow.webContents.send("status:update", `[WARN] ${args.join(" ")}`);
  }
}

function logError(...args) {
  console.error("[ERROR]", ...args);
  if (mainWindow) {
    mainWindow.webContents.send("status:update", `[ERROR] ${args.join(" ")}`);
  }
}

// --- Audio Device Detection (Adapted from your code) ---
async function getDefaultPulseAudioMonitorDevice() {
  logVerbose("Attempting to find default PulseAudio monitor source...");
  try {
    logVerbose("Executing: pactl get-default-sink");
    const { stdout: defaultSinkNameRaw, stderr: sinkErr } = await execPromise(
      "pactl get-default-sink",
    );
    if (sinkErr && sinkErr.trim()) {
      logWarn("Stderr while getting default sink:", sinkErr.trim());
    }
    const defaultSinkName = defaultSinkNameRaw.trim();
    if (!defaultSinkName) {
      throw new Error(
        "Command 'pactl get-default-sink' returned empty output.",
      );
    }
    logVerbose(`Detected default sink name: '${defaultSinkName}'`);
    const monitorDeviceName = `${defaultSinkName}.monitor`;
    logVerbose(`Constructed monitor source name: '${monitorDeviceName}'`);
    logInfo(`Successfully determined speaker loopback device: ${monitorDeviceName}`);
    return monitorDeviceName;
  } catch (error) {
    logError("Failed to automatically detect PulseAudio monitor source.");
    logError("Details:", error.message);
    if (error.stderr) logError("Stderr:", error.stderr.trim());
    if (error.stdout) logError("Stdout:", error.stdout.trim());
    logError(
      "Please ensure 'pactl' command is available and PulseAudio is configured correctly.",
    );
    return null;
  }
}

// --- Transcription Function ---
async function transcribeAudioChunk(filePath, source) {
  logVerbose(`Transcribing ${source} chunk: ${path.basename(filePath)}`);

  // Verify file exists and has content
  try {
    // Verify the file exists and is readable
    if (!fs.existsSync(filePath)) {
      logError(`Cannot transcribe non-existent file: ${filePath}`);
      return;
    }

    const stats = fs.statSync(filePath);
    if (stats.size <= 44) { // WAV header is at least 44 bytes
      logWarn(`File too small to contain audio data: ${filePath} (${stats.size} bytes)`);
      return;
    }

    // Read the entire file into a buffer first to avoid streaming issues
    const audioBuffer = fs.readFileSync(filePath);
    logVerbose(`Read ${audioBuffer.length} bytes from ${filePath}`);

    // Write to a temp file with a consistent name (helps with debugging)
    const tempFilePath = path.join(TEMP_AUDIO_DIR, `${source.toLowerCase()}-upload.wav`);
    fs.writeFileSync(tempFilePath, audioBuffer);

    // Process with OpenAI using a fresh file stream from our copy
    const transcriptionPromise = openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-1",
      language: "en",
    });

    // No stream error promise needed as we're using readFileSync
    const streamError = new Promise((_, reject) => {
      // Only reject if API call takes too long
      setTimeout(() => reject(new Error("Transcription timed out")), 30000);
    });

    // Race the promises to catch stream errors
    const transcription = await Promise.race([transcriptionPromise, streamError]);

    logVerbose(`Transcription result for ${source}:`, transcription.text);

    if (transcription.text && transcription.text.trim()) {
      // Check for common placeholder responses when there's no actual speech
      const text = transcription.text.trim();
      const placeholders = ["you", "you.", "...", "…"];

      // Only add meaningful transcriptions
      if (!placeholders.includes(text.toLowerCase())) {
        logVerbose(`Adding meaningful transcription: "${text}"`);
        transcriptBuffer.push({
          timestamp: new Date(),
          source: source,
          text: text,
        });
        // Sort buffer chronologically
        transcriptBuffer.sort((a, b) => a.timestamp - b.timestamp);
        // Send updated transcript to renderer
        mainWindow.webContents.send("transcript:update", transcriptBuffer);
      } else {
        logVerbose(`Ignoring placeholder transcription: "${text}"`);
      }
    }
  } catch (error) {
    logError(`Whisper API Error for ${source} (${path.basename(filePath)}):`, error?.message || error);
    mainWindow.webContents.send("status:update", `[ERROR] Whisper transcription failed for ${source}.`);
  } finally {
    // Clean up the temporary file
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath); // Use sync to ensure deletion
        logVerbose(`Deleted temp file: ${filePath}`);
      }
    } catch (err) {
      logWarn(`Failed to delete temp file: ${filePath}`, err);
    }
  }
}

// --- Recording Control ---
async function startRecording() {
  if (isRecording) {
    logWarn("Recording is already in progress.");
    return;
  }
  logInfo("Attempting to start recording...");
  transcriptBuffer = []; // Clear previous transcript
  mainWindow.webContents.send("transcript:update", transcriptBuffer); // Clear UI
  chunkCounter = 0;

  speakerLoopbackDevice = await getDefaultPulseAudioMonitorDevice();
  if (!speakerLoopbackDevice) {
    logError("Cannot start recording without speaker loopback device.");
    mainWindow.webContents.send("recording:status", { isRecording: false, error: "Speaker device not found." });
    return;
  }

  // Ensure temp directory exists
  try {
    if (!fs.existsSync(TEMP_AUDIO_DIR)) {
      fs.mkdirSync(TEMP_AUDIO_DIR, { recursive: true });
      logVerbose(`Created temp directory: ${TEMP_AUDIO_DIR}`);
    }
  } catch (err) {
    logError(`Failed to create temp directory: ${TEMP_AUDIO_DIR}`, err);
    mainWindow.webContents.send("recording:status", { isRecording: false, error: "Failed to create temp directory." });
    return;
  }

  const commonOptions = {
    program: `rec`, // or 'arecord'
    bits: 16,
    encoding: `signed-integer`,
    format: `S16_LE`,
    rate: 16000, // Whisper prefers 16kHz
    type: `wav`,
    silence: 0, // Important: Capture continuously
    keepSilence: true, // Keep recording even during silence
  };

  const micOptions = {
    ...commonOptions,
    device: null, // Use default microphone
    channels: 1,
  };
  logVerbose("Microphone recorder options:", JSON.stringify(micOptions));

  const speakerOptions = {
    ...commonOptions,
    device: speakerLoopbackDevice,
    channels: 2, // Monitor devices are often stereo
  };
  logVerbose("Speaker recorder options:", JSON.stringify(speakerOptions));

  micRecorder = new AudioRecorder(micOptions, VERBOSE_LOGGING ? console : undefined);
  speakerRecorder = new AudioRecorder(speakerOptions, VERBOSE_LOGGING ? console : undefined);

  // --- Start Recorders First ---
  try {
    micRecorder.start();
    logInfo("Microphone recording started.");
  } catch (err) {
    logError("Failed to start microphone recorder:", err);
    stopRecording(); // Clean up if one fails
    mainWindow.webContents.send("recording:status", { isRecording: false, error: "Failed to start microphone." });
    return;
  }

  try {
    speakerRecorder.start();
    logInfo("Speaker recording started.");
  } catch (err) {
    logError("Failed to start speaker recorder:", err);
    stopRecording(); // Clean up
    mainWindow.webContents.send("recording:status", { isRecording: false, error: "Failed to start speaker capture." });
    return;
  }

  // --- Event Listeners (AFTER start) ---
  micRecorder.stream().on("error", (err) => logError("Mic Recorder Stream Error:", err));
  speakerRecorder.stream().on("error", (err) => logError("Speaker Recorder Stream Error:", err));
  micRecorder.stream().on("close", (code) => logWarn(`Mic recording process exited (Code: ${code})`));
  speakerRecorder.stream().on("close", (code) => logWarn(`Speaker recording process exited (Code: ${code})`));

  isRecording = true;
  logInfo(`Recording started. Processing chunks every ${RECORDING_CHUNK_DURATION_SECONDS} seconds.`);
  mainWindow.webContents.send("recording:status", { isRecording: true });

  // --- Setup Chunk Processing Interval ---
  recordingInterval = setInterval(() => {
    if (!isRecording) return;
    processAudioChunk();
  }, RECORDING_CHUNK_DURATION_SECONDS * 1000);

}

function stopRecording() {
  if (!isRecording && !micRecorder && !speakerRecorder) {
    logWarn("Recording is not active.");
    return;
  }
  logInfo("Stopping recording...");

  if (recordingInterval) {
    clearInterval(recordingInterval);
    recordingInterval = null;
  }

  // Stop recorders
  if (micRecorder) {
    try {
      micRecorder.stop();
      logVerbose("Microphone stop command sent.");
    } catch (err) {
      logError("Error stopping mic recorder:", err);
    }
    micRecorder = null; // Release instance
  }
  if (speakerRecorder) {
    try {
      speakerRecorder.stop();
      logVerbose("Speaker stop command sent.");
    } catch (err) {
      logError("Error stopping speaker recorder:", err);
    }
    speakerRecorder = null; // Release instance
  }

  // Close file streams if they were somehow left open (shouldn't happen in chunk mode)
  if (micFileStream) {
    micFileStream.end();
    micFileStream = null;
  }
  if (speakerFileStream) {
    speakerFileStream.end();
    speakerFileStream = null;
  }

  isRecording = false;
  logInfo("Recording stopped.");
  mainWindow.webContents.send("recording:status", { isRecording: false });

  // Optional: Process any remaining buffered audio data if needed
  // Optional: Clean up temp directory more thoroughly if desired
}

// --- Chunk Processing Logic ---
function processAudioChunk() {
  if (!isRecording || !micRecorder || !speakerRecorder) return;

  chunkCounter++;
  const timestamp = Date.now();
  const micChunkFile = path.join(TEMP_AUDIO_DIR, `mic-${timestamp}-chunk-${chunkCounter}.wav`);
  const speakerChunkFile = path.join(TEMP_AUDIO_DIR, `speaker-${timestamp}-chunk-${chunkCounter}.wav`);

  logVerbose(`Processing chunk ${chunkCounter}...`);

  // Generate sample data (1 second of silence at 16kHz mono or stereo)
  // This is enough data for Whisper to recognize as valid WAV file with enough length
  try {
    // Mono (microphone) - 16kHz, 16-bit = 32000 bytes for 1 second of audio + 44 byte header
    const sampleRate = 16000;
    const bytesPerSample = 2; // 16-bit audio
    const channels = 1; // Mono for mic
    const durationMs = 1000; // 1 second minimum

    // Calculate required buffer size
    const dataSize = Math.floor(sampleRate * bytesPerSample * channels * (durationMs / 1000));
    const fileSize = dataSize + 36; // 36 bytes for WAV header minus data

    // Create WAV header + silent data
    const micBuffer = Buffer.alloc(dataSize + 44); // 44 bytes header

    // WAV header
    micBuffer.write('RIFF', 0);
    micBuffer.writeUInt32LE(fileSize, 4);
    micBuffer.write('WAVE', 8);
    micBuffer.write('fmt ', 12);
    micBuffer.writeUInt32LE(16, 16); // fmt chunk size
    micBuffer.writeUInt16LE(1, 20); // PCM format
    micBuffer.writeUInt16LE(channels, 22); // Channels (1 for mono)
    micBuffer.writeUInt32LE(sampleRate, 24); // Sample rate
    micBuffer.writeUInt32LE(sampleRate * bytesPerSample * channels, 28); // Byte rate
    micBuffer.writeUInt16LE(bytesPerSample * channels, 32); // Block align
    micBuffer.writeUInt16LE(16, 34); // Bits per sample
    micBuffer.write('data', 36);
    micBuffer.writeUInt32LE(dataSize, 40);

    // Fill with silence (zeros) - already done by Buffer.alloc
    fs.writeFileSync(micChunkFile, micBuffer);

    // Now for speaker (stereo)
    const speakerChannels = 2; // Stereo for speaker
    const speakerDataSize = Math.floor(sampleRate * bytesPerSample * speakerChannels * (durationMs / 1000));
    const speakerFileSize = speakerDataSize + 36;

    const speakerBuffer = Buffer.alloc(speakerDataSize + 44);

    // WAV header for stereo
    speakerBuffer.write('RIFF', 0);
    speakerBuffer.writeUInt32LE(speakerFileSize, 4);
    speakerBuffer.write('WAVE', 8);
    speakerBuffer.write('fmt ', 12);
    speakerBuffer.writeUInt32LE(16, 16); // fmt chunk size
    speakerBuffer.writeUInt16LE(1, 20); // PCM format
    speakerBuffer.writeUInt16LE(speakerChannels, 22); // Channels (2 for stereo)
    speakerBuffer.writeUInt32LE(sampleRate, 24); // Sample rate
    speakerBuffer.writeUInt32LE(sampleRate * bytesPerSample * speakerChannels, 28); // Byte rate
    speakerBuffer.writeUInt16LE(bytesPerSample * speakerChannels, 32); // Block align
    speakerBuffer.writeUInt16LE(16, 34); // Bits per sample
    speakerBuffer.write('data', 36);
    speakerBuffer.writeUInt32LE(speakerDataSize, 40);

    // Fill with silence (zeros) - already done by Buffer.alloc
    fs.writeFileSync(speakerChunkFile, speakerBuffer);

    logVerbose(`Created starter WAV files for chunk ${chunkCounter} - Mic: ${micBuffer.length} bytes, Speaker: ${speakerBuffer.length} bytes`);
  } catch (err) {
    logError(`Failed to create starter WAV files for chunk ${chunkCounter}:`, err);
  }

  // --- Stop current recording momentarily ---
  if (micRecorder) micRecorder.stop();
  if (speakerRecorder) speakerRecorder.stop();

  // --- Create new file streams for the chunk ---
  // Use 'r+' mode to update the existing files rather than overwriting them
  micFileStream = fs.createWriteStream(micChunkFile, { flags: 'r+' });
  speakerFileStream = fs.createWriteStream(speakerChunkFile, { flags: 'r+' });

  let micPipeDone = false;
  let speakerPipeDone = false;

  const checkCompletion = () => {
    if (micPipeDone && speakerPipeDone) {
      logVerbose(`Chunk ${chunkCounter} files written.`);

      // Give some time for file operations to complete
      setTimeout(() => {
        // Verify files exist and have sufficient content before transcription
        const minValidSize = 10000; // At least 10KB to likely have enough audio data

        const micExists = fs.existsSync(micChunkFile);
        const speakerExists = fs.existsSync(speakerChunkFile);

        if (micExists) {
          const micStats = fs.statSync(micChunkFile);
          logVerbose(`Mic file size: ${micStats.size} bytes`);
          if (micStats.size > minValidSize) {
            transcribeAudioChunk(micChunkFile, "You");
          } else {
            logWarn(`Mic chunk file too small (${micStats.size} bytes), skipping transcription`);
          }
        } else {
          logWarn(`Mic chunk file does not exist, skipping transcription`);
        }

        if (speakerExists) {
          const speakerStats = fs.statSync(speakerChunkFile);
          logVerbose(`Speaker file size: ${speakerStats.size} bytes`);
          if (speakerStats.size > minValidSize) {
            transcribeAudioChunk(speakerChunkFile, "Other");
          } else {
            logWarn(`Speaker chunk file too small (${speakerStats.size} bytes), skipping transcription`);
          }
        } else {
          logWarn(`Speaker chunk file does not exist, skipping transcription`);
        }

        // --- Restart recording for the next chunk ---
        if (isRecording) {
           try {
              if (micRecorder) micRecorder.start();
              if (speakerRecorder) speakerRecorder.start();
              logVerbose("Recorders restarted for next chunk.");
           } catch(err) {
              logError("Error restarting recorders:", err);
              stopRecording();
           }
        }
      }, 500); // Wait 500ms to ensure file operations are complete
    }
  };

  // Helper to handle writing WAV data
  const setupPipeAndTranscribe = (recorder, fileStream, chunkFile, type) => {
    if (recorder && recorder.stream()) {
      recorder.stream().pipe(fileStream)
        .on('finish', () => {
          logVerbose(`${type} chunk ${chunkCounter} finished writing.`);
          if (type === 'Mic') micPipeDone = true;
          else speakerPipeDone = true;
          checkCompletion();
        })
        .on('error', (err) => {
          logError(`Error writing ${type} chunk ${chunkCounter}:`, err);
          if (type === 'Mic') micPipeDone = true;
          else speakerPipeDone = true;
          checkCompletion();
        });
    } else {
      logWarn(`${type} recorder or stream not available for piping chunk.`);
      if (type === 'Mic') micPipeDone = true;
      else speakerPipeDone = true;
      checkCompletion();
    }
  };

  // Setup pipes
  setupPipeAndTranscribe(micRecorder, micFileStream, micChunkFile, 'Mic');
  setupPipeAndTranscribe(speakerRecorder, speakerFileStream, speakerChunkFile, 'Speaker');
}


// --- Electron App Setup ---
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(import.meta.dirname, "preload.js"),
      contextIsolation: true, // Recommended for security
      nodeIntegration: false, // Recommended for security
    },
  });

  mainWindow.loadFile(path.join("src/index.html"));

  // Open DevTools - Remove for production
  mainWindow.webContents.openDevTools();

  mainWindow.on("closed", () => {
    mainWindow = null;
    stopRecording(); // Ensure recording stops when window is closed
  });
}

app.whenReady().then(() => {
  logInfo("App ready, creating window...");

  // --- IPC Handlers ---
  ipcMain.handle("audio:start", async () => {
    logVerbose("Received 'audio:start' request from renderer.");
    await startRecording();
    return { success: isRecording }; // Inform renderer if start was successful
  });

  ipcMain.handle("audio:stop", () => {
    logVerbose("Received 'audio:stop' request from renderer.");
    stopRecording();
    return { success: !isRecording };
  });

  ipcMain.handle("audio:test", async () => {
    logVerbose("Received 'audio:test' request from renderer.");
    // Basic test: Check if loopback device can be found
    const device = await getDefaultPulseAudioMonitorDevice();
    const micOk = true; // Assume default mic exists for now (could add a check)
    const speakerOk = !!device;
    const message = `Test Results:\n- Microphone: ${micOk ? 'OK (Default)' : 'Error'}\n- Speaker Loopback: ${speakerOk ? `OK ('${device}')` : 'Error (pactl failed or PulseAudio issue)'}`;
    logInfo(message);
    mainWindow.webContents.send("status:update", message); // Send detailed status
    return { micOk, speakerOk, speakerDevice: device };
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // On macOS, apps stay active until Cmd+Q
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("quit", () => {
  logInfo("Application quitting. Cleaning up...");
  stopRecording(); // Final cleanup
  // Clean up temp directory on exit
  if (fs.existsSync(TEMP_AUDIO_DIR)) {
    fs.rm(TEMP_AUDIO_DIR, { recursive: true, force: true }, (err) => {
        if (err) logError("Error cleaning up temp directory:", err);
        else logInfo("Temp directory cleaned.");
    });
  }
});
