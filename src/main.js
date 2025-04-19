import { app, BrowserWindow, ipcMain, dialog } from "electron";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import settingsManager from "./utils/settingsManager.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import AudioRecorder from "node-audiorecorder";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config(); // Load .env file

const execPromise = promisify(exec);

// --- Configuration ---
// OpenRouter API configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY; // Fallback to OpenAI key if not defined
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const LLM_MODEL = "google/gemini-2.5-pro-preview-03-25"; // Updated to Gemini Pro model

// Interview assistant configuration
const ANALYSIS_MODE = true; // Whether to enable interview analysis
const ANALYSIS_AUTO_TRIGGER = true; // Auto trigger analysis when candidate stops speaking
const ANALYSIS_MIN_TRANSCRIPT_LENGTH = 50; // Min characters before allowing analysis

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

// Voice Activity Detection (VAD) settings
const VAD_AMPLITUDE_THRESHOLD = 80;       // Amplitude threshold for speech detection (higher than silence for hysteresis)
const VAD_SILENCE_THRESHOLD = 50;         // Lower threshold for detecting silence (lower than speech for hysteresis)
const VAD_SILENCE_DURATION_MS = 1500;      // How long silence must persist to end an utterance
const VAD_MIN_UTTERANCE_MS = 500;          // Minimum utterance duration to be considered valid
const VAD_MAX_UTTERANCE_MS = 15000;        // Maximum utterance length before forced split (15s)
const VAD_SAMPLE_RATE = 44100;             // Audio sample rate
const VAD_FRAME_SIZE = 4096;               // Size of audio frames for processing
const VAD_BUFFER_LIMIT = 1000;             // Maximum number of buffers to store (to prevent memory issues)

// Transcript intelligent merging settings
const TRANSCRIPT_SIMILARITY_THRESHOLD = 0.5;   // Similarity threshold to detect duplicates (0-1) - lowered to be less aggressive
const TRANSCRIPT_CONTINUATION_WINDOW = 10000;  // Time window (ms) to consider continuing a message from same speaker
const MAX_TRANSCRIPT_ENTRIES = 100;            // Maximum number of transcript entries to keep

/**
 * Process audio frames for Voice Activity Detection (VAD)
 * This is the core function for utterance detection
 *
 * @param {Buffer} audioBuffer - Raw audio data buffer
 * @param {string} source - Audio source ('mic' or 'speaker')
 */
function processAudioForVAD(audioBuffer, source) {
  const state = vadState[source];
  const now = Date.now();

  // Extract audio samples (assuming 16-bit PCM audio)
  const samples = extractSamplesFromBuffer(audioBuffer);

  // Calculate amplitude (speech level)
  const amplitude = calculateAmplitude(samples);
  state.lastAmplitude = amplitude;

  // Enhanced level logging for debugging
  // For mic, log more frequently to better understand the amplitude
  if (source === 'mic' && state.frameCount % 5 === 0) {
    const thresholdInfo = `threshold=${VAD_AMPLITUDE_THRESHOLD}/${VAD_SILENCE_THRESHOLD}`;
    logVerbose(`${source} VAD: amplitude=${amplitude.toFixed(2)}, active=${state.isActive}, silence=${state.isSilence}, ${thresholdInfo}`);

    // Log to UI for better visibility - send every frame for real-time meter
    const levelStatus = amplitude > VAD_AMPLITUDE_THRESHOLD ? "SPEECH" : "quiet";
    mainWindow.webContents.send("status:update", `[MIC] Level: ${amplitude.toFixed(0)} (${levelStatus})`);
  }
  // For speaker, send level data at the same rate as mic
  else if (source === 'speaker' && state.frameCount % 5 === 0) {
    logVerbose(`${source} VAD: amplitude=${amplitude.toFixed(2)}, active=${state.isActive}, silence=${state.isSilence}`);

    // Send speaker level to UI for visualization
    mainWindow.webContents.send("status:update", `[SPEAKER] Level: ${amplitude.toFixed(0)}`);
  }

  // Safety check - if our buffer gets too large, we need to finalize and send it
  if (state.audioBuffers.length > VAD_BUFFER_LIMIT) {
    if (state.isActive) {
      logWarn(`${source} VAD: Buffer limit reached, forcing utterance end`);
      finalizeUtterance(source, "buffer-limit");
    } else {
      // Just clear buffers if we're not in an active utterance
      state.audioBuffers = [];
    }
  }

  // Always store the frame (we'll keep a rolling buffer of recent audio)
  state.audioBuffers.push(audioBuffer);
  state.frameCount++;

  // VAD state machine
  if (!state.isActive) {
    // Not in an active utterance - check if we should start one
    if (amplitude > VAD_AMPLITUDE_THRESHOLD) {
      // Speech detected - start a new utterance
      state.isActive = true;
      state.isSilence = false;
      state.utteranceStart = now;
      state.silenceStart = null;

      // Create a new output file for this utterance
      state.utteranceCount++;
      state.audioPath = path.join(
        DEBUG_RECORDINGS_DIR,
        `vad-${source}-utterance-${state.utteranceCount}-${now}.wav`
      );

      logInfo(`${source} VAD: Speech started (amplitude=${amplitude})`);

      // Initialize the WAV file with an empty header - we'll fill it later
      initializeWavFile(state.audioPath, source === 'mic' ? 1 : 2);
    }
  } else {
    // In an active utterance

    // Check for max duration (force split long utterances)
    const utteranceDuration = now - state.utteranceStart;
    if (utteranceDuration > VAD_MAX_UTTERANCE_MS) {
      logInfo(`${source} VAD: Maximum utterance duration reached (${utteranceDuration}ms)`);
      finalizeUtterance(source, "max-duration");

      // Start a new utterance immediately if still speaking
      if (amplitude > VAD_AMPLITUDE_THRESHOLD) {
        state.isActive = true;
        state.isSilence = false;
        state.utteranceStart = now;
        state.utteranceCount++;
        state.audioPath = path.join(
          DEBUG_RECORDINGS_DIR,
          `vad-${source}-utterance-${state.utteranceCount}-${now}.wav`
        );
        initializeWavFile(state.audioPath, source === 'mic' ? 1 : 2);
      }
      return;
    }

    // Update the utterance file with the new audio data
    if (state.audioPath) {
      appendToWavFile(state.audioPath, audioBuffer);
    }

    // Detect silence (using hysteresis - lower threshold for detecting silence)
    if (amplitude < VAD_SILENCE_THRESHOLD) {
      if (!state.isSilence) {
        // Just entered silence
        state.isSilence = true;
        state.silenceStart = now;
        logVerbose(`${source} VAD: Potential speech end, entering silence (amplitude=${amplitude})`);
      } else {
        // Continuing silence - check if it's been silent long enough to end the utterance
        const silenceDuration = now - state.silenceStart;
        if (silenceDuration > VAD_SILENCE_DURATION_MS) {
          // Silence persisted long enough - end the utterance
          logInfo(`${source} VAD: Speech ended after ${utteranceDuration}ms (silence=${silenceDuration}ms)`);
          finalizeUtterance(source, "silence");
        }
      }
    } else {
      // Still hearing speech
      if (state.isSilence) {
        // Was silent but speech resumed
        logVerbose(`${source} VAD: Speech resumed after ${now - state.silenceStart}ms of silence`);
        state.isSilence = false;
        state.silenceStart = null;
      }
    }
  }
}

/**
 * Finalize an utterance, process it, and reset state
 *
 * @param {string} source - Audio source ('mic' or 'speaker')
 * @param {string} reason - Why the utterance was finalized
 */
function finalizeUtterance(source, reason) {
  const state = vadState[source];
  const now = Date.now();

  if (!state.isActive || !state.utteranceStart) {
    // Not in an active utterance - nothing to do
    state.isActive = false;
    state.isSilence = true;
    state.audioBuffers = [];
    return;
  }

  const utteranceDuration = now - state.utteranceStart;

  // Only process if the utterance is long enough
  if (utteranceDuration >= VAD_MIN_UTTERANCE_MS) {
    logInfo(`${source} VAD: Processing utterance of ${utteranceDuration}ms (reason: ${reason})`);

    // Complete the WAV file
    finalizeWavFile(state.audioPath);

    // Send the utterance for transcription
    if (fs.existsSync(state.audioPath)) {
      // Send to transcription API - using source mapping (mic → "You", speaker → "Other")
      const transcriptSource = source === 'mic' ? 'You' : 'Other';
      transcribeAudioChunk(state.audioPath, transcriptSource);

      // If this is a candidate utterance (speaker), check if we should auto-trigger analysis
      if (source === 'speaker') {
        // We'll do this after a short delay to allow transcription to complete
        setTimeout(() => {
          checkAutoTriggerAnalysis(source);
        }, 2000);
      }
    } else {
      logError(`${source} VAD: Utterance file not found: ${state.audioPath}`);
    }
  } else {
    logVerbose(`${source} VAD: Utterance too short (${utteranceDuration}ms), discarding`);
    // Remove the unfinished WAV file
    if (state.audioPath && fs.existsSync(state.audioPath)) {
      fs.unlinkSync(state.audioPath);
    }
  }

  // Reset state
  state.isActive = false;
  state.isSilence = true;
  state.utteranceStart = null;
  state.silenceStart = null;
  state.audioBuffers = [];
  state.audioPath = null;
}

/**
 * Extract samples from a raw audio buffer
 *
 * @param {Buffer} buffer - Raw audio data
 * @returns {Int16Array} - Array of audio samples
 */
function extractSamplesFromBuffer(buffer) {
  // Create a view into the buffer as 16-bit signed integers (PCM format)
  return new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);
}

/**
 * Calculate the amplitude (energy level) of audio samples
 *
 * @param {Int16Array} samples - Audio samples
 * @returns {number} - Amplitude value
 */
function calculateAmplitude(samples) {
  // Take a subset of samples for performance
  const step = Math.max(1, Math.floor(samples.length / 100));
  let sum = 0;
  let count = 0;

  // Calculate RMS (root mean square) of the samples
  for (let i = 0; i < samples.length; i += step) {
    sum += samples[i] * samples[i];
    count++;
  }

  if (count === 0) return 0;

  // Return RMS amplitude
  return Math.sqrt(sum / count);
}

/**
 * Initialize a WAV file with a proper header
 *
 * @param {string} filePath - Path to the WAV file
 * @param {number} channels - Number of audio channels (1=mono, 2=stereo)
 */
function initializeWavFile(filePath, channels) {
  try {
    // Create the directory if it doesn't exist
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Create a WAV header
    const headerBuffer = Buffer.alloc(44); // WAV header is 44 bytes

    // RIFF chunk descriptor
    headerBuffer.write('RIFF', 0);
    headerBuffer.writeUInt32LE(0, 4); // File size - 8 (placeholder, will update later)
    headerBuffer.write('WAVE', 8);

    // fmt sub-chunk
    headerBuffer.write('fmt ', 12);
    headerBuffer.writeUInt32LE(16, 16); // Sub-chunk size (16 for PCM)
    headerBuffer.writeUInt16LE(1, 20); // Audio format (1 for PCM)
    headerBuffer.writeUInt16LE(channels, 22); // Number of channels
    headerBuffer.writeUInt32LE(VAD_SAMPLE_RATE, 24); // Sample rate

    // Calculate bytes per sample and other header fields
    const bytesPerSample = 2; // 16-bit = 2 bytes
    const blockAlign = channels * bytesPerSample;
    const byteRate = VAD_SAMPLE_RATE * blockAlign;

    headerBuffer.writeUInt32LE(byteRate, 28); // Byte rate
    headerBuffer.writeUInt16LE(blockAlign, 32); // Block align
    headerBuffer.writeUInt16LE(bytesPerSample * 8, 34); // Bits per sample

    // data sub-chunk
    headerBuffer.write('data', 36);
    headerBuffer.writeUInt32LE(0, 40); // Data size (placeholder, will update later)

    // Write the header to the file
    fs.writeFileSync(filePath, headerBuffer);
    logVerbose(`Initialized WAV file: ${filePath}`);
  } catch (err) {
    logError(`Failed to initialize WAV file: ${err.message}`);
  }
}

/**
 * Append audio data to an existing WAV file
 *
 * @param {string} filePath - Path to the WAV file
 * @param {Buffer} audioBuffer - Audio data to append
 */
function appendToWavFile(filePath, audioBuffer) {
  try {
    // Append the audio data to the file
    fs.appendFileSync(filePath, audioBuffer);
  } catch (err) {
    logError(`Failed to append to WAV file: ${err.message}`);
  }
}

/**
 * Finalize a WAV file by updating the header with the correct file size
 *
 * @param {string} filePath - Path to the WAV file
 */
function finalizeWavFile(filePath) {
  try {
    // Get the file size
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    // Update the file size in the header
    const headerBuffer = Buffer.alloc(8);

    // RIFF chunk size (file size - 8)
    headerBuffer.writeUInt32LE(fileSize - 8, 0);

    // data chunk size (file size - 44)
    headerBuffer.writeUInt32LE(fileSize - 44, 4);

    // Open the file and update the header fields
    const fd = fs.openSync(filePath, 'r+');
    fs.writeSync(fd, headerBuffer.slice(0, 4), 0, 4, 4); // Update RIFF chunk size
    fs.writeSync(fd, headerBuffer.slice(4, 8), 0, 4, 40); // Update data chunk size
    fs.closeSync(fd);

    logVerbose(`Finalized WAV file: ${filePath} (size=${fileSize} bytes)`);
  } catch (err) {
    logError(`Failed to finalize WAV file: ${err.message}`);
  }
}

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
let settingsWindow = null;
let micRecorder = null;
let speakerRecorder = null;
let micFileStream = null;
let speakerFileStream = null;
let speakerLoopbackDevice = null;
let isRecording = false;
let recordingInterval = null;
let currentCallType = null; // Selected call type for context

// Voice Activity Detection (VAD) state tracking
let vadState = {
  mic: {
    isActive: false,        // Whether speech is currently detected
    isSilence: true,        // Whether we're in a silent period
    utteranceStart: null,   // When the current utterance started
    silenceStart: null,     // When the current silence started
    audioBuffers: [],       // Audio buffers for the current utterance
    frameCount: 0,          // Number of frames processed
    lastAmplitude: 0,       // Last detected amplitude
    audioPath: null,        // Path to the current utterance audio file
    utteranceCount: 0,      // Counter for utterances from this source
  },
  speaker: {
    isActive: false,
    isSilence: true,
    utteranceStart: null,
    silenceStart: null,
    audioBuffers: [],
    frameCount: 0,
    lastAmplitude: 0,
    audioPath: null,
    utteranceCount: 0,
  }
};
// Enhanced transcript buffer with additional properties for smart merging
let transcriptBuffer = []; // { id: number, timestamp: Date, lastUpdated: Date, source: string, text: string }[]
let chunkCounter = 0;

// Interview assistant context
let interviewContext = {
  jobDescription: "",       // Job description or agenda
  candidateInfo: "",        // Information about the candidate
  additionalContext: "",    // Any additional context provided
  systemPrompt: "",         // Base system prompt for LLM
};

// LLM analysis state
let lastAnalysisTime = 0;   // Last time analysis was performed
let analysisPending = false; // Whether analysis is in progress
let lastProcessedTranscriptLength = 0; // Number of transcript items processed in last analysis
let lastInsightsTime = 0;   // Last time insights were generated
let insightsPending = false; // Whether insights generation is in progress

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

  // Check for exact match only
  if (a === b) return 1;

  // Remove the containment check as it's causing too many false positives
  // For longer texts, we check for more precise similarity

  // Simple word overlap similarity for performance
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));

  // Word count check - very different length texts are likely different
  if (Math.abs(setA.size - setB.size) > 3) return 0.3;

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

/**
 * Create an OpenAI compatible client for OpenRouter
 * @returns {OpenAI} OpenAI compatible client for OpenRouter
 */
function createOpenRouterClient() {
  return new OpenAI({
    apiKey: OPENROUTER_API_KEY,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: {
      "HTTP-Referer": "https://meeting-mind.app", // Replace with your app's URL
      "X-Title": "Meeting Mind", // Replace with your app name
    },
  });
}

/**
 * Setup the LLM system prompt for interview assistance
 * Builds a system prompt with provided context
 * @returns {string} System prompt for the LLM
 */
function buildSystemPrompt() {
  // Start with base system instructions
  let systemPrompt = `
You are an expert assistant helping someone conduct an effective conversation or interview.
Your role is to analyze the ongoing conversation in real-time.

When generating content for the "Analysis & Suggestions" panel:
Provide brief, scannable analysis with exactly these three sections in this order:
1. FOLLOWUP QUESTIONS: 2-3 specific questions to ask next based on the conversation context
2. OBSERVATIONS: 1-2 brief insights about technical accuracy and communication quality
3. SUGGESTIONS: 1-2 tactical tips to improve the conversation

Use very concise bullet points. Keep the entire response under 10 lines total.

When generating content for the "Insights" panel:
You must thoroughly analyze the transcript to identify ALL questions and answers, even if they're implicit or brief.

For each question-answer exchange:
1. Identify the question (even brief ones or follow-ups) and format as: "Q: <question>"
2. Evaluate the answer with this format:
   "ANSWER REVIEW: <assessment of technical accuracy and completeness>"
   "RESPONSE: <concise summary of response>"

IMPORTANT GUIDELINES:
- Detect ALL questions in the conversation, including brief follow-ups
- Look for question patterns like "Tell me about...", "How would you...", "What if...", etc.
- If multiple questions are asked consecutively without answers between them, treat them as a single complex question
- Do not skip any questions - identify and evaluate every Q&A pair
- Only provide insights when you can identify clear Q&A exchanges - if none exist yet, state "Waiting for complete Q&A exchanges to provide insights."
`;

  // Add call type context if available
  if (interviewContext.callTypeContext) {
    systemPrompt += `\n\nCALL TYPE INFORMATION:\n${interviewContext.callTypeContext}\n`;
  }

  // Add job description if available
  if (interviewContext.jobDescription) {
    systemPrompt += `\n\nJOB DESCRIPTION:\n${interviewContext.jobDescription}\n`;
  }

  // Add candidate information if available
  if (interviewContext.candidateInfo) {
    systemPrompt += `\n\nCANDIDATE INFORMATION:\n${interviewContext.candidateInfo}\n`;
  }

  // Add any additional context provided
  if (interviewContext.additionalContext) {
    systemPrompt += `\n\nADDITIONAL CONTEXT:\n${interviewContext.additionalContext}\n`;
  }

  // Add conversation best practices
  systemPrompt += `\n\nKEY REMINDERS:
- Remain objective and avoid biases
- Focus on relevant topics based on the conversation context
- Listen actively and suggest clarifying questions
- Give the other person enough time to respond fully
- Stay within legal and ethical guidelines`;

  return systemPrompt;
}

/**
 * Format the transcript for sending to the LLM
 * @param {Array} transcriptItems - Array of transcript items
 * @param {string} purpose - The purpose of formatting ('analysis' or 'insights')
 * @returns {string} Formatted transcript
 */
function formatTranscriptForLLM(transcriptItems, purpose = 'analysis') {
  // Ensure the transcript items are sorted by timestamp
  const sortedItems = [...transcriptItems].sort((a, b) => {
    const timeA = a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp);
    const timeB = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
    return timeA - timeB;
  });

  // Format the transcript as a conversation
  let formattedTranscript = sortedItems.map(item => {
    const speaker = item.source === "You" ? "Interviewer" : "Candidate";
    return `${speaker}: ${item.text}`;
  }).join("\n\n");

  // For insights format, provide improved instructions for Q&A detection
  if (purpose === 'insights') {
    formattedTranscript = `Please analyze the following transcript and identify all interview questions and answers.

IMPORTANT INSTRUCTIONS:
1. Identify ALL questions asked by the Interviewer, even brief or follow-up questions
2. Each detected question should be paired with its corresponding answer from the Candidate
3. Format each Q&A pair exactly as follows:
   - "Q: <interviewer's question>"
   - "ANSWER REVIEW: <brief assessment of technical accuracy and completeness>"
   - "CANDIDATE RESPONSE: <summarized response>"
4. Even if a question is unclear or implicit, still identify it as a separate Q&A pair
5. If multiple questions are asked consecutively without answers between them, treat them as a single complex question
6. Do not skip any questions, even if they seem minor or repetitive

Transcript:
${formattedTranscript}`;
  }

  return formattedTranscript;
}

/**
 * Perform analysis on the current transcript
 * @param {boolean} forceTrigger - Whether to force the analysis even if the conditions aren't met
 * @returns {Promise<string>} The analysis result
 */
async function analyzeInterview(forceTrigger = false) {
  // Check if we have enough transcript to analyze
  if (transcriptBuffer.length === 0) {
    return "No transcript available yet for analysis.";
  }

  // Check if we've just done an analysis recently (unless forced)
  const now = Date.now();
  if (!forceTrigger && now - lastAnalysisTime < 5000) {
    return "Analysis requested too soon after the last one.";
  }

  // Check if we have at least one utterance from the candidate (source = "Other")
  const hasOtherSpeaker = transcriptBuffer.some(item => item.source === "Other");
  if (!hasOtherSpeaker) {
    return "Waiting for the candidate to speak before providing analysis.";
  }

  // Check if there's enough new content since the last analysis
  const newContentLength = transcriptBuffer.length - lastProcessedTranscriptLength;
  if (!forceTrigger && newContentLength === 0) {
    return "No new content since the last analysis.";
  }

  // Check if the total transcript text meets the minimum length requirement
  const totalText = transcriptBuffer.map(item => item.text).join(" ");
  if (totalText.length < ANALYSIS_MIN_TRANSCRIPT_LENGTH) {
    return "Not enough conversation yet for meaningful analysis.";
  }

  // If we get here, perform the analysis
  analysisPending = true;
  lastAnalysisTime = now;
  lastProcessedTranscriptLength = transcriptBuffer.length;

  try {
    logInfo("Performing interview analysis...");
    const openRouterClient = createOpenRouterClient();
    const systemPrompt = buildSystemPrompt();
    const formattedTranscript = formatTranscriptForLLM(transcriptBuffer);

    const response = await openRouterClient.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Here is the current interview transcript. Provide your Analysis & Suggestions for the panel:\n\n${formattedTranscript}` }
      ],
      temperature: 0.3, // Lower temperature for more focused responses
      max_tokens: 1000
    });

    // Extract and return the analysis
    const analysisResult = response.choices[0]?.message?.content || "Analysis failed.";
    logInfo("Analysis completed successfully.");
    analysisPending = false;
    return analysisResult;
  } catch (error) {
    logError("Error performing interview analysis:", error.message);
    analysisPending = false;
    return `Analysis failed due to error: ${error.message}`;
  }
}

/**
 * Generate interview insights based on Q&A pairs
 * @param {boolean} forceTrigger - Whether to force insights generation
 * @returns {Promise<string>} The insights result
 */
async function generateInterviewInsights(forceTrigger = false) {
  // Check if we have enough transcript to analyze
  if (transcriptBuffer.length < 2) {
    return "Not enough conversation yet for Q&A insights.";
  }

  // Check if we've just generated insights recently (unless forced)
  const now = Date.now();
  if (!forceTrigger && now - lastInsightsTime < 8000) {
    return "Insights requested too soon after the last generation.";
  }

  // Check if we have at least one utterance from the candidate (source = "Other")
  const hasOtherSpeaker = transcriptBuffer.some(item => item.source === "Other");
  if (!hasOtherSpeaker) {
    return "Waiting for the candidate to speak before providing insights.";
  }

  // If we get here, generate the insights
  insightsPending = true;
  lastInsightsTime = now;

  try {
    logInfo("Generating Q&A insights...");
    const openRouterClient = createOpenRouterClient();
    const systemPrompt = buildSystemPrompt();
    const formattedTranscript = formatTranscriptForLLM(transcriptBuffer, 'insights');

    // Enhanced prompt for better Q&A identification
    const userPrompt = `Thoroughly analyze this interview transcript and identify ALL question-answer pairs.

YOUR TASK:
1. Identify EVERY question asked by the interviewer, even brief follow-ups or clarifications
2. For each question, evaluate the corresponding answer
3. Format your response as a series of Q&A evaluations

Remember to:
- Include ALL questions, even if they seem minor
- Look for question patterns like "Tell me about...", "How would you...", "What if...", "Could you explain..."
- Do not merge or skip any questions unless they were asked consecutively with no answer between them
- Detect implicit questions that don't end with a question mark

Transcript for analysis:
${formattedTranscript}`;

    const response = await openRouterClient.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2, // Lower temperature for more precise analysis
      max_tokens: 2000  // Increased for more comprehensive analysis
    });

    // Extract and return the insights
    const insightsResult = response.choices[0]?.message?.content || "Insights generation failed.";
    logInfo("Insights generation completed successfully.");
    insightsPending = false;
    return insightsResult;
  } catch (error) {
    logError("Error generating interview insights:", error.message);
    insightsPending = false;
    return `Insights generation failed due to error: ${error.message}`;
  }
}

/**
 * Check if analysis should be auto-triggered
 * This is called when a speaker stops talking
 * @param {string} source - The source of the utterance ('mic' or 'speaker')
 */
function checkAutoTriggerAnalysis(source) {
  // Only trigger if:
  // 1. Analysis mode is enabled
  // 2. Auto triggering is enabled
  // 3. The source is "speaker" (candidate)
  // 4. We're not already doing an analysis
  if (
    ANALYSIS_MODE &&
    ANALYSIS_AUTO_TRIGGER &&
    source === 'speaker' &&
    !analysisPending
  ) {
    logVerbose("Auto-triggering interview analysis after candidate speech...");
    // Perform the analysis and send results to renderer
    analyzeInterview().then(result => {
      if (mainWindow) {
        mainWindow.webContents.send("analysis:update", result);
      }
    });

    // Also generate insights after a short delay
    setTimeout(() => {
      if (!insightsPending) {
        generateInterviewInsights().then(insights => {
          if (mainWindow) {
            mainWindow.webContents.send("insights:update", insights);
          }
        });
      }
    }, 2000);
  }
}

/**
 * Handle a text file upload
 * @param {string} filePath - Path to the uploaded file
 * @returns {Promise<string>} The file contents
 */
async function handleTextFileUpload(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content;
  } catch (error) {
    logError("Error reading text file:", error.message);
    throw error;
  }
}

/**
 * Update the interview context
 * @param {Object} context - New context object
 * @returns {Object} The updated context
 */
function updateInterviewContext(context) {
  interviewContext = { ...interviewContext, ...context };

  // Regenerate the system prompt with the new context
  interviewContext.systemPrompt = buildSystemPrompt();

  return interviewContext;
}

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

  // Reset VAD state
  vadState.mic = {
    isActive: false,
    isSilence: true,
    utteranceStart: null,
    silenceStart: null,
    audioBuffers: [],
    frameCount: 0,
    lastAmplitude: 0,
    audioPath: null,
    utteranceCount: 0,
  };

  vadState.speaker = {
    isActive: false,
    isSilence: true,
    utteranceStart: null,
    silenceStart: null,
    audioBuffers: [],
    frameCount: 0,
    lastAmplitude: 0,
    audioPath: null,
    utteranceCount: 0,
  };

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
      // Handle errors and stream events
      micStream.on("error", (err) => {
        logError("Mic Recorder Stream Error:", err);
      });

      micStream.on("close", (code) => {
        logWarn(`Mic recording process exited (Code: ${code})`);
        // Finalize any active utterance
        if (vadState.mic.isActive) {
          finalizeUtterance('mic', 'stream-closed');
        }
      });

      micStream.on("end", () => {
        logVerbose("Microphone recorder stream ended.");
      });

      // Set up continuous file for debugging
      if (DEBUG_SAVE_RECORDINGS) {
        const debugMicFile = path.join(DEBUG_RECORDINGS_DIR, `continuous-mic-${Date.now()}.wav`);
        const debugMicStream = fs.createWriteStream(debugMicFile, { encoding: "binary" });
        micStream.pipe(debugMicStream);
        logInfo(`DEBUG: Writing continuous mic recording to ${debugMicFile}`);
      }

      // Set up data handler for VAD processing
      micStream.on("data", (chunk) => {
        // Process audio chunk for Voice Activity Detection
        processAudioForVAD(chunk, 'mic');
      });
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
      // Handle errors and stream events
      speakerStream.on("error", (err) => {
        logError("Speaker Recorder Stream Error:", err);
      });

      speakerStream.on("close", (code) => {
        logWarn(`Speaker recording process exited (Code: ${code})`);
        // Finalize any active utterance
        if (vadState.speaker.isActive) {
          finalizeUtterance('speaker', 'stream-closed');
        }
      });

      speakerStream.on("end", () => {
        logVerbose("Speaker recorder stream ended.");
      });

      // Set up continuous file for debugging
      if (DEBUG_SAVE_RECORDINGS) {
        const debugSpeakerFile = path.join(DEBUG_RECORDINGS_DIR, `continuous-speaker-${Date.now()}.wav`);
        const debugSpeakerStream = fs.createWriteStream(debugSpeakerFile, { encoding: "binary" });
        speakerStream.pipe(debugSpeakerStream);
        logInfo(`DEBUG: Writing continuous speaker recording to ${debugSpeakerFile}`);
      }

      // Set up data handler for VAD processing
      speakerStream.on("data", (chunk) => {
        // Process audio chunk for Voice Activity Detection
        processAudioForVAD(chunk, 'speaker');
      });
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
  logInfo(`Recording started. Using Voice Activity Detection (VAD) for speech processing.`);
  mainWindow.webContents.send("recording:status", { isRecording: true });

  // We don't need the processing interval anymore since we're using VAD
  // But we'll keep a status update interval to provide some UI feedback
  recordingInterval = setInterval(() => {
    if (!isRecording) return;
    // Log status periodically
    logVerbose(`Mic status: active=${vadState.mic.isActive}, amplitude=${vadState.mic.lastAmplitude}`);
    logVerbose(`Speaker status: active=${vadState.speaker.isActive}, amplitude=${vadState.speaker.lastAmplitude}`);
  }, 5000);
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

  // Finalize any active utterances
  if (vadState.mic.isActive) {
    logInfo("Finalizing active microphone utterance before stopping");
    finalizeUtterance('mic', 'recording-stopped');
  }

  if (vadState.speaker.isActive) {
    logInfo("Finalizing active speaker utterance before stopping");
    finalizeUtterance('speaker', 'recording-stopped');
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

  // Reset VAD state
  vadState.mic = {
    isActive: false,
    isSilence: true,
    utteranceStart: null,
    silenceStart: null,
    audioBuffers: [],
    frameCount: 0,
    lastAmplitude: 0,
    audioPath: null,
    utteranceCount: 0,
  };

  vadState.speaker = {
    isActive: false,
    isSilence: true,
    utteranceStart: null,
    silenceStart: null,
    audioBuffers: [],
    frameCount: 0,
    lastAmplitude: 0,
    audioPath: null,
    utteranceCount: 0,
  };

  isRecording = false;
  logInfo("Recording stopped.");
  mainWindow.webContents.send("recording:status", { isRecording: false });
}

// --- Voice Activity Detection (VAD) is now handling audio processing ---
// The previous chunk-based approach has been replaced by real-time speech detection

// --- Electron App Setup ---
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: path.join(import.meta.dirname, "preload.js"),
      contextIsolation: true, // Recommended for security
      nodeIntegration: false, // Recommended for security
    },
    // Set default state to be maximized
    show: false // Hide until ready-to-show event
  });

  // Once DOM is ready, show window maximized
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.loadFile(path.join("src/index.html"));

  // Open DevTools - Remove for production
  mainWindow.webContents.openDevTools();

  mainWindow.on("closed", () => {
    mainWindow = null;
    stopRecording(); // Ensure recording stops when window is closed

    // Also close settings window if open
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close();
    }
  });
}

/**
 * Create and show settings window
 */
function createSettingsWindow() {
  // If settings window already exists, just focus it
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  // Create the settings window
  settingsWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    parent: mainWindow,
    modal: false,
    webPreferences: {
      preload: path.join(import.meta.dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false // Hide until ready-to-show event
  });

  // Once DOM is ready, show window maximized
  settingsWindow.once('ready-to-show', () => {
    settingsWindow.maximize();
    settingsWindow.show();
  });

  settingsWindow.loadFile(path.join("src/settings.html"));

  // Open DevTools for settings window during development
  // settingsWindow.webContents.openDevTools();

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

app.whenReady().then(() => {
  logInfo("App ready, creating window...");

  // --- IPC Handlers ---
  // Audio recording handlers
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

  // Settings window handlers
  ipcMain.handle("settings:open", () => {
    logVerbose("Received 'settings:open' request from renderer.");
    createSettingsWindow();
    return { success: true };
  });

  ipcMain.handle("settings:close", () => {
    logVerbose("Received 'settings:close' request from renderer.");
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close();
    }
    return { success: true };
  });


  // Call type management handlers
  ipcMain.handle("callTypes:getAll", () => {
    logVerbose("Received 'callTypes:getAll' request from renderer.");
    return settingsManager.getCallTypes();
  });

  ipcMain.handle("callTypes:get", (event, id) => {
    logVerbose(`Received 'callTypes:get' request for ID: ${id}`);
    return settingsManager.getCallType(id);
  });

  ipcMain.handle("callTypes:add", (event, callType) => {
    logVerbose(`Received 'callTypes:add' request: ${callType.name}`);
    try {
      const success = settingsManager.addCallType(callType);
      logInfo(`Call type add result: ${success ? 'Success' : 'Failed'}`);
      
      if (success) {
        // Notify main window that call types have been updated
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("callTypes:updated");
        }
      }
      
      return { success };
    } catch (error) {
      logError(`Error adding call type: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("callTypes:update", (event, id, updates) => {
    logVerbose(`Received 'callTypes:update' request for ID: ${id}`);
    try {
      const success = settingsManager.updateCallType(id, updates);
      logInfo(`Call type update result for ${id}: ${success ? 'Success' : 'Failed'}`);
      
      if (success) {
        // Notify main window that call types have been updated
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("callTypes:updated");
        }
      }
      
      return { success };
    } catch (error) {
      logError(`Error updating call type: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("callTypes:delete", (event, id) => {
    logVerbose(`Received 'callTypes:delete' request for ID: ${id}`);
    try {
      const success = settingsManager.deleteCallType(id);
      logInfo(`Call type delete result for ${id}: ${success ? 'Success' : 'Failed'}`);
      
      if (success) {
        // Notify main window that call types have been updated
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("callTypes:updated");
        }
      }
      
      return { success };
    } catch (error) {
      logError(`Error deleting call type: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  // Handle context text update
  ipcMain.handle("context:save", (event, contextData) => {
    logVerbose("Received 'context:save' request from renderer.");
    try {
      // If there's a callTypeId in the context data, set the current call type
      if (contextData.callTypeId) {
        currentCallType = settingsManager.getCallType(contextData.callTypeId);

        // If call type has a description, use it as part of the context
        if (currentCallType && currentCallType.description) {
          // Strip HTML tags for clean text
          const plainDescription = currentCallType.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

          // Include call type in the context
          contextData.callTypeContext = `Call Type: ${currentCallType.name}\n${plainDescription}`;
        }
      }

      const updatedContext = updateInterviewContext(contextData);
      logInfo("Interview context updated successfully.");
      return { success: true, context: updatedContext };
    } catch (error) {
      logError("Failed to update interview context:", error.message);
      return { success: false, error: error.message };
    }
  });

  // Handle file uploads
  ipcMain.handle("context:upload", async (event, filePath) => {
    logVerbose("Received 'context:upload' request from renderer.");
    try {
      if (!filePath) {
        // Open file dialog and get selected file
        const result = await dialog.showOpenDialog({
          properties: ['openFile'],
          filters: [
            { name: 'Text Files', extensions: ['txt', 'pdf'] }
          ]
        });

        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, error: "No file selected" };
        }

        filePath = result.filePaths[0];
      }

      // Handle text file
      if (filePath.toLowerCase().endsWith('.txt')) {
        const content = await handleTextFileUpload(filePath);
        return { success: true, content, filePath };
      }
      // TODO: Add PDF handling if needed

      return { success: false, error: "Unsupported file type" };
    } catch (error) {
      logError("Failed to upload context file:", error.message);
      return { success: false, error: error.message };
    }
  });

  // Handle analysis request
  ipcMain.handle("analysis:request", async () => {
    logVerbose("Received 'analysis:request' request from renderer.");
    try {
      const analysis = await analyzeInterview(true); // force trigger
      return { success: true, analysis };
    } catch (error) {
      logError("Failed to perform interview analysis:", error.message);
      return { success: false, error: error.message };
    }
  });

  // Handle insights request
  ipcMain.handle("insights:request", async () => {
    logVerbose("Received 'insights:request' request from renderer.");
    try {
      const insights = await generateInterviewInsights(true); // force trigger
      return { success: true, insights };
    } catch (error) {
      logError("Failed to generate interview insights:", error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("audio:test", async () => {
    logVerbose("Received 'audio:test' request from renderer.");
    // Basic test: Check if loopback device can be found
    const device = await getDefaultPulseAudioMonitorDevice();
    const micOk = true; // Assume default mic exists for now (could add a check)
    const speakerOk = !!device;
    const message = `Test Results:\n- Microphone: ${micOk ? 'OK (Default)' : 'Error'}\n- Speaker Loopback: ${speakerOk ? `OK ('${device}')` : 'Error (pactl failed or PulseAudio issue)'}`;
    logInfo(message);

    // Also show current VAD threshold settings
    const thresholdInfo = `VAD Thresholds: Speech=${VAD_AMPLITUDE_THRESHOLD}, Silence=${VAD_SILENCE_THRESHOLD}`;
    logInfo(thresholdInfo);
    mainWindow.webContents.send("status:update", message); // Send detailed status
    mainWindow.webContents.send("status:update", thresholdInfo); // Send threshold info

    // Begin microphone level calibration
    if (micOk) {
      mainWindow.webContents.send("status:update", "Starting mic level calibration (5 seconds)...");

      // Create a temporary recorder to measure mic levels
      const tempRecorder = new AudioRecorder({
        program: 'rec',
        device: null, // Default microphone
        bits: 16,
        channels: 1,
        encoding: 'signed-integer',
        format: 'S16_LE',
        rate: 44100,
        type: 'wav',
        silence: 0
      });

      let maxAmplitude = 0;
      let minAmplitude = Infinity;
      let sampleCount = 0;
      let sumAmplitude = 0;

      // Start recording and collect amplitude data
      try {
        tempRecorder.start();
        const stream = tempRecorder.stream();

        // Process data chunks to analyze amplitude
        stream.on('data', (chunk) => {
          const samples = extractSamplesFromBuffer(chunk);
          const amplitude = calculateAmplitude(samples);

          maxAmplitude = Math.max(maxAmplitude, amplitude);
          if (amplitude > 0) minAmplitude = Math.min(minAmplitude, amplitude);
          sumAmplitude += amplitude;
          sampleCount++;

          // Update UI with current level
          mainWindow.webContents.send("status:update", `[MIC] Level: ${amplitude.toFixed(0)} (calibrating)`);
        });

        // Stop after 5 seconds and show results
        setTimeout(() => {
          try {
            tempRecorder.stop();
            const avgAmplitude = sumAmplitude / sampleCount;

            // Calculate recommended thresholds
            const recommendedThreshold = Math.max(200, Math.ceil(avgAmplitude * 2));
            const recommendedSilence = Math.max(100, Math.ceil(avgAmplitude));

            const calibrationResult =
              `Mic Calibration Results:\n` +
              `- Max level: ${maxAmplitude.toFixed(0)}\n` +
              `- Min level: ${minAmplitude === Infinity ? 'N/A' : minAmplitude.toFixed(0)}\n` +
              `- Avg level: ${avgAmplitude.toFixed(0)}\n` +
              `- Recommended thresholds: Speech=${recommendedThreshold}, Silence=${recommendedSilence}`;

            logInfo(calibrationResult);
            mainWindow.webContents.send("status:update", calibrationResult);
          } catch (err) {
            logError("Error stopping calibration recorder:", err);
          }
        }, 5000);
      } catch (err) {
        logError("Error starting calibration recorder:", err);
      }
    }

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
