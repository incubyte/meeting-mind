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
const RECORDING_CHUNK_DURATION_SECONDS = 7; // Chunk duration in seconds
const VERBOSE_LOGGING = true;
const TEMP_AUDIO_DIR = path.join(os.tmpdir(), "meeting-mind-audio");
const DEBUG_SAVE_RECORDINGS = true; // Save recordings for debugging
const DEBUG_RECORDINGS_DIR = path.join(path.dirname(import.meta.dirname), "tmp");
// --- End Configuration ---

// Audio processing settings
const SILENCE_THRESHOLD = 1000;            // Threshold of sound level to consider audio to have speech
const SAMPLES_TO_CHECK = 100;              // Number of samples to check in the audio file

// Transcript intelligent merging settings
const TRANSCRIPT_SIMILARITY_THRESHOLD = 0.7;   // Similarity threshold to detect duplicates (0-1)
const TRANSCRIPT_CONTINUATION_WINDOW = 10000;  // Time window (ms) to consider continuing a message from same speaker
const MAX_TRANSCRIPT_ENTRIES = 100;            // Maximum number of transcript entries to keep

/**
 * Check if an audio file contains actual speech/sound rather than just silence
 * @param {string} filePath - Path to the WAV audio file
 * @returns {boolean} - True if the audio likely contains speech, false if it's likely silence
 */
function checkForSpeechInAudio(filePath) {
  try {
    // Read the WAV file
    const fileBuffer = fs.readFileSync(filePath);
    
    // WAV file structure:
    // - 44 bytes header
    // - Then the actual PCM audio data
    
    // Skip the header to get to the audio data
    const audioData = fileBuffer.slice(44);
    
    // For 16-bit audio (which we're using), each sample is 2 bytes
    const bytesPerSample = 2; 
    
    // The number of samples in the file
    const sampleCount = Math.floor(audioData.length / bytesPerSample);
    
    // Don't process if the file is too small
    if (sampleCount < 100) {
      logWarn(`Audio file too small for speech detection: ${filePath}`);
      return false;
    }
    
    // We'll check a subset of samples throughout the file
    const samplesPerCheck = Math.floor(sampleCount / SAMPLES_TO_CHECK);
    
    // Track if we found any sound above the threshold
    let foundSound = false;
    let maxValue = 0;
    
    // Check samples throughout the file
    for (let i = 0; i < SAMPLES_TO_CHECK; i++) {
      // Calculate the position to check
      const sampleIndex = i * samplesPerCheck;
      const bufferPos = sampleIndex * bytesPerSample;
      
      // Skip if we're at the end of the file
      if (bufferPos >= audioData.length - 1) continue;
      
      // Read a 16-bit sample (little endian)
      const sampleValue = audioData.readInt16LE(bufferPos);
      
      // Take the absolute value (since audio waveforms go negative)
      const absValue = Math.abs(sampleValue);
      
      // Keep track of max value for logging
      maxValue = Math.max(maxValue, absValue);
      
      // Check if this sample is above our threshold
      if (absValue > SILENCE_THRESHOLD) {
        foundSound = true;
        break; // We found sound, no need to check more
      }
    }
    
    logVerbose(`Audio check for ${path.basename(filePath)}: max value = ${maxValue}, threshold = ${SILENCE_THRESHOLD}, contains speech = ${foundSound}`);
    
    // If we're debugging, save a copy of the file with the result in the filename
    if (DEBUG_SAVE_RECORDINGS) {
      const debugFileCopy = path.join(
        DEBUG_RECORDINGS_DIR,
        `${foundSound ? 'HAS-SPEECH' : 'SILENCE'}-${path.basename(filePath)}`
      );
      try {
        fs.copyFileSync(filePath, debugFileCopy);
        logVerbose(`Saved silence-checked audio file to: ${debugFileCopy}`);
      } catch (err) {
        logWarn(`Failed to save silence-checked audio copy: ${err.message}`);
      }
    }
    
    return foundSound;
  } catch (err) {
    // If anything goes wrong, log the error and assume there's no speech (safer approach)
    logError(`Error checking for speech in audio file ${filePath}: ${err.message}`);
    return false;
  }
}

let mainWindow;
let micRecorder = null;
let speakerRecorder = null;
let micFileStream = null;
let speakerFileStream = null;
let speakerLoopbackDevice = null;
let isRecording = false;
let recordingInterval = null;
// Enhanced transcript buffer with additional properties for smart merging
let transcriptBuffer = []; // { id: number, timestamp: Date, lastUpdated: Date, source: string, text: string }[]
let chunkCounter = 0;

/**
 * Calculate similarity between two strings
 * Returns a value between 0 (completely different) and 1 (identical)
 */
function calculateTextSimilarity(text1, text2) {
  // If either string is empty, they're completely different
  if (!text1 || !text2) return 0;
  
  // Normalize both texts - lowercase and trim
  const a = text1.toLowerCase().trim();
  const b = text2.toLowerCase().trim();
  
  // Check for exact match or containment
  if (a === b) return 1;
  if (a.includes(b)) return 0.9;
  if (b.includes(a)) return 0.9;
  
  // Simple word overlap similarity for performance
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));
  
  // Count common words
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  
  // Calculate Jaccard similarity
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Find the most recent transcript from a specific source
 */
function findLatestTranscriptFromSource(source) {
  for (let i = transcriptBuffer.length - 1; i >= 0; i--) {
    if (transcriptBuffer[i].source === source) {
      return transcriptBuffer[i];
    }
  }
  return null;
}

/**
 * Check if a transcript should be ignored (too similar to existing text)
 * or merged with an existing message
 * 
 * @returns {object} Decision with action type and message
 */
function processTranscript(newText, source) {
  // Find the latest message from this source
  const latestMessage = findLatestTranscriptFromSource(source);
  
  if (!latestMessage) {
    return { action: 'create', message: 'First message from this source' };
  }
  
  // Check if this is similar to the previous message from this source
  const similarity = calculateTextSimilarity(latestMessage.text, newText);
  
  // If too similar, ignore to avoid duplicates
  if (similarity > TRANSCRIPT_SIMILARITY_THRESHOLD) {
    return { action: 'ignore', message: `Duplicate detected (${similarity.toFixed(2)})` };
  }
  
  // Check if we should continue the previous message (same speaker within time window)
  const now = new Date();
  const timeSinceLastUpdate = now - new Date(latestMessage.lastUpdated);
  
  if (timeSinceLastUpdate <= TRANSCRIPT_CONTINUATION_WINDOW) {
    return { action: 'append', message: `Continuing message (${timeSinceLastUpdate}ms gap)` };
  }
  
  // Default to creating a new message
  return { action: 'create', message: 'New message' };
}

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
    
    // Save a debug copy of exactly what we're sending to OpenAI
    if (DEBUG_SAVE_RECORDINGS) {
      const openaiSubmitFile = path.join(
        DEBUG_RECORDINGS_DIR, 
        `openai-submit-${source.toLowerCase()}-${Date.now()}.wav`
      );
      fs.copyFileSync(tempFilePath, openaiSubmitFile);
      logVerbose(`Saved exact OpenAI submission file to: ${openaiSubmitFile}`);
      
      // Log file properties
      const stats = fs.statSync(openaiSubmitFile);
      const channelCount = source === "You" ? 1 : 2;
      const durationSeconds = stats.size / (16000 * 2 * channelCount); // Approx duration in seconds
      logVerbose(`OpenAI submission file properties: Size=${stats.size} bytes, ~${durationSeconds.toFixed(2)} seconds duration`);
    }
    
    // Process with OpenAI using a fresh file stream from our copy
    logVerbose(`Sending ${source} audio to OpenAI Whisper API (${path.basename(filePath)})`);
    
    const startTime = Date.now();
    const transcriptionPromise = openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-1",
      language: "en",
    }).then(result => {
      const endTime = Date.now();
      logVerbose(`OpenAI Whisper API responded in ${endTime - startTime}ms for ${source}`);
      return result;
    });
    
    // No stream error promise needed as we're using readFileSync
    const streamError = new Promise((_, reject) => {
      // Only reject if API call takes too long
      setTimeout(() => reject(new Error("Transcription timed out")), 30000);
    });
    
    // Race the promises to catch stream errors
    const transcription = await Promise.race([transcriptionPromise, streamError]);

    logVerbose(`Transcription result for ${source}:`, transcription.text);
    
    // Debug: Save transcription results to file
    if (DEBUG_SAVE_RECORDINGS) {
      try {
        const debugResultFile = path.join(
          DEBUG_RECORDINGS_DIR, 
          `debug-transcription-${source.toLowerCase()}-${Date.now()}.json`
        );
        fs.writeFileSync(
          debugResultFile, 
          JSON.stringify({
            source: source,
            timestamp: new Date().toISOString(),
            filePath: filePath,
            result: transcription,
            text: transcription.text
          }, null, 2)
        );
        logVerbose(`Saved transcription result to: ${debugResultFile}`);
      } catch (err) {
        logError(`Failed to save transcription result: ${err.message}`);
      }
    }

    if (transcription.text && transcription.text.trim()) {
      const text = transcription.text.trim();
      
      // Process the transcript to determine if we should add, append, or ignore
      const decision = processTranscript(text, source);
      logVerbose(`Transcript decision for "${text}": ${decision.action} - ${decision.message}`);
      
      const now = new Date();
      
      if (decision.action === 'ignore') {
        // Skip this transcription as it's likely a duplicate
        logVerbose(`Ignoring duplicate transcription: "${text}"`);
      }
      else if (decision.action === 'append') {
        // Append to the existing message from this source
        const latestMessage = findLatestTranscriptFromSource(source);
        
        // Only append if the new text adds information
        if (text.length > latestMessage.text.length || !latestMessage.text.includes(text)) {
          logVerbose(`Appending to existing ${source} message: "${latestMessage.text}" + "${text}"`);
          
          // Decide how to join the texts (with space or newline)
          const lastChar = latestMessage.text.slice(-1);
          const joinChar = (lastChar === '.' || lastChar === '?' || lastChar === '!') ? ' ' : ' ';
          
          // Update the message
          latestMessage.text = latestMessage.text + joinChar + text;
          latestMessage.lastUpdated = now;
          
          // Note: No need to sort since we're updating in place
        } else {
          logVerbose(`New text "${text}" doesn't add information to "${latestMessage.text}"`);
        }
      }
      else {
        // Create a new transcript entry
        logVerbose(`Adding new transcription: "${text}"`);
        transcriptBuffer.push({
          id: Date.now(), // Unique ID
          timestamp: now,
          lastUpdated: now,
          source: source,
          text: text,
        });
        
        // Sort buffer chronologically
        transcriptBuffer.sort((a, b) => a.timestamp - b.timestamp);
        
        // Limit transcript buffer size
        if (transcriptBuffer.length > MAX_TRANSCRIPT_ENTRIES) {
          transcriptBuffer.shift(); // Remove oldest entry
        }
      }
      
      // Send updated transcript to renderer
      mainWindow.webContents.send("transcript:update", transcriptBuffer);
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

  // Ensure debug directory exists if debugging enabled
  if (DEBUG_SAVE_RECORDINGS) {
    try {
      if (!fs.existsSync(DEBUG_RECORDINGS_DIR)) {
        fs.mkdirSync(DEBUG_RECORDINGS_DIR, { recursive: true });
        logVerbose(`Created debug directory: ${DEBUG_RECORDINGS_DIR}`);
      }
    } catch (err) {
      logError(`Failed to create debug directory: ${DEBUG_RECORDINGS_DIR}`, err);
    }
  }

  const commonOptions = {
    program: `rec`, // or 'arecord'
    bits: 16,
    encoding: `signed-integer`,
    format: `S16_LE`,
    rate: 44100, // Using 44.1kHz for better quality
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

  // Create recorder instances
  micRecorder = new AudioRecorder(micOptions, VERBOSE_LOGGING ? console : undefined);
  speakerRecorder = new AudioRecorder(speakerOptions, VERBOSE_LOGGING ? console : undefined);

  // --- Set up the microphone first ---
  let micStartSuccess = false;
  let speakerStartSuccess = false;

  try {
    logVerbose("Starting microphone recorder...");
    micRecorder.start();
    logInfo("Microphone recording started successfully.");
    micStartSuccess = true;
  } catch (err) {
    logError("Failed to start microphone recorder:", err);
    mainWindow.webContents.send("recording:status", { isRecording: false, error: "Failed to start microphone." });
  }

  // Set up microphone stream AFTER starting
  if (micStartSuccess) {
    logVerbose("Setting up microphone stream and event listeners...");
    const micStream = micRecorder.stream(); // Get stream reference AFTER starting
    
    if (micStream) {
      micStream.on("error", (err) => {
        logError("Mic Recorder Stream Error:", err);
      });
      
      micStream.on("close", (code) => {
        logWarn(`Mic recording process exited (Code: ${code})`);
      });
      
      micStream.on("end", () => {
        logVerbose("Microphone recorder stream ended.");
      });
      
      // Set up a direct pipe to a continuous file for testing
      if (DEBUG_SAVE_RECORDINGS) {
        const debugMicFile = path.join(DEBUG_RECORDINGS_DIR, `continuous-mic-${Date.now()}.wav`);
        const debugMicStream = fs.createWriteStream(debugMicFile, { encoding: "binary" });
        micStream.pipe(debugMicStream);
        logInfo(`DEBUG: Writing continuous mic recording to ${debugMicFile}`);
      }
    } else {
      logError("Failed to get microphone stream even after start");
      micStartSuccess = false;
    }
  }

  // --- Set up the speaker recording ---
  try {
    logVerbose("Starting speaker recorder...");
    speakerRecorder.start();
    logInfo("Speaker recording started successfully.");
    speakerStartSuccess = true;
  } catch (err) {
    logError("Failed to start speaker recorder:", err);
    mainWindow.webContents.send("recording:status", { isRecording: false, error: "Failed to start speaker capture." });
  }

  // Set up speaker stream AFTER starting
  if (speakerStartSuccess) {
    logVerbose("Setting up speaker stream and event listeners...");
    const speakerStream = speakerRecorder.stream(); // Get stream reference AFTER starting
    
    if (speakerStream) {
      speakerStream.on("error", (err) => {
        logError("Speaker Recorder Stream Error:", err);
      });
      
      speakerStream.on("close", (code) => {
        logWarn(`Speaker recording process exited (Code: ${code})`);
      });
      
      speakerStream.on("end", () => {
        logVerbose("Speaker recorder stream ended.");
      });
      
      // Set up a direct pipe to a continuous file for testing
      if (DEBUG_SAVE_RECORDINGS) {
        const debugSpeakerFile = path.join(DEBUG_RECORDINGS_DIR, `continuous-speaker-${Date.now()}.wav`);
        const debugSpeakerStream = fs.createWriteStream(debugSpeakerFile, { encoding: "binary" });
        speakerStream.pipe(debugSpeakerStream);
        logInfo(`DEBUG: Writing continuous speaker recording to ${debugSpeakerFile}`);
      }
    } else {
      logError("Failed to get speaker stream even after start");
      speakerStartSuccess = false;
    }
  }
  
  // If neither recording started successfully, stop and return an error
  if (!micStartSuccess && !speakerStartSuccess) {
    stopRecording();
    mainWindow.webContents.send("recording:status", { isRecording: false, error: "Failed to start both recordings." });
    return;
  }

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

  // Close file streams if they were somehow left open
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
}

// --- Chunk Processing Logic ---
function processAudioChunk() {
  if (!isRecording) return;

  chunkCounter++;
  const timestamp = Date.now();
  const chunkStartTime = new Date().toLocaleTimeString();
  logVerbose(`Starting chunk ${chunkCounter} at ${chunkStartTime}, chunk size: ${RECORDING_CHUNK_DURATION_SECONDS}s`);
  
  // Instead of stopping and starting the recorders, we'll use the continuous recordings
  // that are already being saved to the debug files, and transcribe those
  if (!DEBUG_SAVE_RECORDINGS) {
    logWarn("DEBUG_SAVE_RECORDINGS is disabled, cannot process chunks without continuous recordings");
    return;
  }
  
  // Find the latest continuous recordings in our debug folder
  try {
    // Create the debug directory if it doesn't exist
    if (!fs.existsSync(DEBUG_RECORDINGS_DIR)) {
      fs.mkdirSync(DEBUG_RECORDINGS_DIR, { recursive: true });
      logVerbose(`Created debug recordings directory: ${DEBUG_RECORDINGS_DIR}`);
    }
    
    const micChunkFile = path.join(DEBUG_RECORDINGS_DIR, `chunk-mic-${timestamp}-${chunkCounter}.wav`);
    const speakerChunkFile = path.join(DEBUG_RECORDINGS_DIR, `chunk-speaker-${timestamp}-${chunkCounter}.wav`);

    logVerbose(`Processing chunk ${chunkCounter} using continuous recordings...`);
    
    // Look for continuous recording files
    const files = fs.readdirSync(DEBUG_RECORDINGS_DIR);
    const micFiles = files.filter(f => f.startsWith('continuous-mic-'));
    const speakerFiles = files.filter(f => f.startsWith('continuous-speaker-'));
    
    if (micFiles.length > 0 && speakerFiles.length > 0) {
      // Sort by timestamp to get most recent
      micFiles.sort();
      speakerFiles.sort();
      
      const latestMicFile = path.join(DEBUG_RECORDINGS_DIR, micFiles[micFiles.length - 1]);
      const latestSpeakerFile = path.join(DEBUG_RECORDINGS_DIR, speakerFiles[speakerFiles.length - 1]);
      
      logVerbose(`Using latest mic file: ${latestMicFile}`);
      logVerbose(`Using latest speaker file: ${latestSpeakerFile}`);
      
      // Copy the files for this chunk
      fs.copyFileSync(latestMicFile, micChunkFile);
      fs.copyFileSync(latestSpeakerFile, speakerChunkFile);
      
      // Get file stats
      const micStats = fs.statSync(micChunkFile);
      const speakerStats = fs.statSync(speakerChunkFile);
      
      logVerbose(`Mic chunk file size: ${micStats.size} bytes`);
      logVerbose(`Speaker chunk file size: ${speakerStats.size} bytes`);
      
      // Minimum size for a valid WAV file (at least WAV header + some content)
      const minValidSize = 1000;
      
      // Check for silence in microphone audio before transcribing
      if (micStats.size > minValidSize) {
        // Check if the audio contains actual sound or just silence
        const hasSpeech = checkForSpeechInAudio(micChunkFile);
        if (hasSpeech) {
          logVerbose(`Mic audio contains speech, sending for transcription`);
          transcribeAudioChunk(micChunkFile, "You");
        } else {
          logInfo(`Mic audio appears to be silence, skipping OpenAI API call`);
        }
      } else {
        logWarn(`Mic chunk file too small: ${micStats.size} bytes, skipping transcription`);
      }
      
      // Check for silence in speaker audio before transcribing
      if (speakerStats.size > minValidSize) {
        // Check if the audio contains actual sound or just silence
        const hasSpeech = checkForSpeechInAudio(speakerChunkFile);
        if (hasSpeech) {
          logVerbose(`Speaker audio contains speech, sending for transcription`);
          transcribeAudioChunk(speakerChunkFile, "Other");
        } else {
          logInfo(`Speaker audio appears to be silence, skipping OpenAI API call`);
        }
      } else {
        logWarn(`Speaker chunk file too small: ${speakerStats.size} bytes, skipping transcription`);
      }
    } else {
      logWarn("No continuous recordings found for transcription");
    }
  } catch (err) {
    logError(`Error processing continuous recordings: ${err.message}`);
  }
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