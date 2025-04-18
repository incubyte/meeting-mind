import * as fs from "node:fs";
import * as path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import AudioRecorder from "node-audiorecorder";

const execPromise = promisify(exec);

// --- Configuration ---
const MICROPHONE_DEVICE_ID = null;
const RECORDING_DURATION_SECONDS = 30;
const VERBOSE_LOGGING = true;
// --- End Configuration ---

function logVerbose(...args) {
  if (VERBOSE_LOGGING) {
    console.log("[VERBOSE]", ...args);
  }
}

async function getDefaultPulseAudioMonitorDevice() {
  logVerbose("Attempting to find default PulseAudio monitor source...");
  try {
    logVerbose("Executing: pactl get-default-sink");
    const { stdout: defaultSinkNameRaw, stderr: sinkErr } = await execPromise(
      "pactl get-default-sink",
    );
    if (sinkErr) {
      console.warn(
        "[WARN] Stderr while getting default sink:",
        sinkErr.trim(),
      );
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
    console.log(
      `[INFO] Successfully determined speaker loopback device: ${monitorDeviceName}`,
    );
    return monitorDeviceName;
  } catch (error) {
    console.error(
      "[ERROR] Failed to automatically detect PulseAudio monitor source.",
    );
    console.error("[ERROR] Details:", error.message);
    if (error.stderr) {
      console.error("[ERROR] Stderr:", error.stderr.trim());
    }
    if (error.stdout) {
      console.error("[ERROR] Stdout:", error.stdout.trim());
    }
    console.error(
      "[ERROR] Please ensure 'pactl' command is available and PulseAudio is configured correctly, or manually specify the loopback device ID.",
    );
    return null;
  }
}

async function runRecording() {
  console.log("[INFO] Starting concurrent recording script...");
  logVerbose(`Verbose logging enabled: ${VERBOSE_LOGGING}`);
  logVerbose(`Recording duration set to: ${RECORDING_DURATION_SECONDS} seconds`);

  const speakerLoopbackDevice = await getDefaultPulseAudioMonitorDevice();

  if (!speakerLoopbackDevice) {
    console.error(
      "[FATAL] Exiting script: Unable to determine speaker loopback device.",
    );
    process.exit(1);
  }

  const micOptions = {
    program: `rec`,
    device: MICROPHONE_DEVICE_ID,
    bits: 16,
    channels: 1,
    encoding: `signed-integer`,
    format: `S16_LE`,
    rate: 44100,
    type: `wav`,
    silence: 0
  };
  logVerbose("Microphone recorder options:", JSON.stringify(micOptions));

  const speakerOptions = {
    program: `rec`,
    device: speakerLoopbackDevice,
    bits: 16,
    channels: 2,
    encoding: `signed-integer`,
    format: `S16_LE`,
    rate: 44100,
    type: `wav`,
    silence: 0
  };
  logVerbose("Speaker recorder options:", JSON.stringify(speakerOptions));

  logVerbose("Creating Microphone AudioRecorder instance...");
  const micRecorder = new AudioRecorder(micOptions, VERBOSE_LOGGING ? console : undefined);
  logVerbose("Creating Speaker AudioRecorder instance...");
  const speakerRecorder = new AudioRecorder(speakerOptions, VERBOSE_LOGGING ? console : undefined);

  const timestamp = Date.now();
  const micFileName = path.join(".", `microphone-output-${timestamp}.wav`);
  const speakerFileName = path.join(".", `speaker-output-${timestamp}.wav`);

  logVerbose(`Microphone output file path: ${micFileName}`);
  logVerbose(`Speaker output file path: ${speakerFileName}`);

  console.log(`[INFO] Writing microphone audio to: ${micFileName}`);
  const micFileStream = fs.createWriteStream(micFileName, {
    encoding: "binary",
  });
  logVerbose("Created microphone file write stream.");

  console.log(`[INFO] Writing speaker audio to: ${speakerFileName}`);
  const speakerFileStream = fs.createWriteStream(speakerFileName, {
    encoding: "binary",
  });
  logVerbose("Created speaker file write stream.");

  // --- Start Recording FIRST ---
  console.log("[INFO] Attempting to start both recordings...");
  let micStartSuccess = false;
  let speakerStartSuccess = false;

  try {
    logVerbose("Calling micRecorder.start()...");
    micRecorder.start();
    console.log("[INFO] Microphone recording started successfully.");
    micStartSuccess = true;
  } catch (err) {
    console.error("[ERROR] Failed to start microphone recorder:", err);
  }

  try {
    logVerbose("Calling speakerRecorder.start()...");
    speakerRecorder.start();
    console.log("[INFO] Speaker recording started successfully.");
    speakerStartSuccess = true;
  } catch (err) {
    console.error("[ERROR] Failed to start speaker recorder:", err);
  }

  // --- Setup Streams and Events AFTER Starting ---
  if (micStartSuccess) {
    logVerbose("Setting up microphone stream piping and event listeners...");
    const micStream = micRecorder.stream(); // Get stream now
    if (micStream) {
      micStream
        .on("error", (err) => {
          console.error("[FATAL] Microphone Recorder Stream Error:", err);
        })
        .on("close", (code) => {
          console.warn(`[WARN] Microphone recording process exited (Code: ${code})`);
        })
        .on("end", () => {
          logVerbose("Microphone recorder stream ended.");
        })
        .pipe(micFileStream)
        .on("finish", () => {
          console.log(`[INFO] Microphone file stream finished writing.`);
          logVerbose(`Finished writing to ${micFileName}`);
        });
    } else {
      console.error(
        "[ERROR] Failed to get microphone stream even after start was called.",
      );
    }
  } else {
    logVerbose("Skipping microphone stream setup due to start failure.");
    // Close the file stream if the recorder didn't start
    micFileStream.end();
  }

  if (speakerStartSuccess) {
    logVerbose("Setting up speaker stream piping and event listeners...");
    const speakerStream = speakerRecorder.stream(); // Get stream now
    if (speakerStream) {
      speakerStream
        .on("error", (err) => {
          console.error("[FATAL] Speaker Recorder Stream Error:", err);
        })
        .on("close", (code) => {
          console.warn(`[WARN] Speaker recording process exited (Code: ${code})`);
        })
        .on("end", () => {
          logVerbose("Speaker recorder stream ended.");
        })
        .pipe(speakerFileStream)
        .on("finish", () => {
          console.log(`[INFO] Speaker file stream finished writing.`);
          logVerbose(`Finished writing to ${speakerFileName}`);
        });
    } else {
      console.error(
        "[ERROR] Failed to get speaker stream even after start was called.",
      );
    }
  } else {
    logVerbose("Skipping speaker stream setup due to start failure.");
    // Close the file stream if the recorder didn't start
    speakerFileStream.end();
  }

  // Only schedule stop if at least one recorder started
  if (micStartSuccess || speakerStartSuccess) {
    console.log(
      `[INFO] Recording initiated. Will stop after ${RECORDING_DURATION_SECONDS} seconds...`,
    );
    const timeoutId = setTimeout(() => {
      console.log(
        `[INFO] ${RECORDING_DURATION_SECONDS} seconds elapsed. Stopping recordings...`,
      );
      if (micStartSuccess) {
        try {
          logVerbose("Calling micRecorder.stop()...");
          micRecorder.stop();
          logVerbose("Microphone stop command sent.");
        } catch (err) {
          console.error(
            "[ERROR] Error sending stop command to mic recorder:",
            err,
          );
        }
      }
      if (speakerStartSuccess) {
        try {
          logVerbose("Calling speakerRecorder.stop()...");
          speakerRecorder.stop();
          logVerbose("Speaker stop command sent.");
        } catch (err) {
          console.error(
            "[ERROR] Error sending stop command to speaker recorder:",
            err,
          );
        }
      }
    }, RECORDING_DURATION_SECONDS * 1000);
    logVerbose(`Stop timer scheduled with ID: ${timeoutId}`);
  } else {
    console.warn("[WARN] No recorders were started successfully. Exiting timer setup.");
  }
}

runRecording().catch((error) => {
  console.error("[FATAL] Unhandled error in runRecording:", error);
  process.exit(1);
});
