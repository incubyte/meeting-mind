const EventEmitter = require('events');
const AudioRecorder = require('node-audiorecorder');
const fs = require('fs');
const path = require('path');
const os = require('os');

class AudioCapture extends EventEmitter {
  constructor() {
    super();
    
    this.microphoneRecorder = null;
    this.systemAudioRecorder = null;
    this.testRecorder = null;
    this.isCapturingMicrophone = false;
    this.isCapturingSystemAudio = false;
    this.isTestRecording = false;
    this.testRecordingPath = null;
    
    // Create temporary directory for audio chunks if it doesn't exist
    this.tempDir = path.join(os.tmpdir(), 'meetingmind-audio');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
    
    // Configure audio recorder options
    this.recorderOptions = {
      program: 'sox',      // Recording program (sox, rec, arecord)
      device: null,        // Recording device (e.g. hw:0,0)
      bits: 16,            // Sample size (bits)
      channels: 1,         // Number of channels
      encoding: 'signed-integer',  // Encoding type
      format: 'S16_LE',    // Format type
      rate: 16000,         // Sample rate
      type: 'wav',         // File type
      silence: 0,          // Silence threshold
      thresholdStart: 0,   // Silence threshold to start recording
      thresholdStop: 0,    // Silence threshold to stop recording
      keepSilence: true    // Keep silence in recordings
    };
  }

  startMicrophoneCapture() {
    if (this.isCapturingMicrophone) return;
    
    console.log('Starting microphone capture...');
    
    try {
      // Create new audio recorder instance for microphone
      this.microphoneRecorder = new AudioRecorder(this.recorderOptions, {
        logger: console
      });
      
      // Handle microphone data
      this.microphoneRecorder.stream().on('data', (chunk) => {
        // Process audio data in small chunks
        this.emit('microphoneData', chunk);
        
        // Emit audio data for visualization
        this.emit('audioData', {
          source: 'microphone',
          audioData: this.processAudioDataForVisualization(chunk)
        });
      });
      
      this.isCapturingMicrophone = true;
      console.log('Microphone capture started successfully');
    } catch (error) {
      console.error('Failed to start microphone capture:', error);
    }
  }
  
  stopMicrophoneCapture() {
    if (!this.isCapturingMicrophone) return;
    
    console.log('Stopping microphone capture...');
    
    try {
      if (this.microphoneRecorder) {
        this.microphoneRecorder.stop();
        this.microphoneRecorder = null;
      }
      
      this.isCapturingMicrophone = false;
      console.log('Microphone capture stopped successfully');
    } catch (error) {
      console.error('Failed to stop microphone capture:', error);
    }
  }
  
  startSystemAudioCapture() {
    if (this.isCapturingSystemAudio) return;
    
    console.log('Starting system audio capture...');
    
    try {
      // NOTE: System audio capture is OS-specific and requires additional setup
      // The following is a placeholder for system audio capture implementation
      
      // Detect operating system
      const platform = process.platform;
      
      if (platform === 'win32') {
        // Windows implementation (WASAPI loopback)
        console.log('Windows system audio capture not yet implemented');
        // Would require native module or additional tools
      } else if (platform === 'darwin') {
        // macOS implementation (BlackHole)
        console.log('macOS system audio capture not yet implemented');
        // Would require BlackHole or similar virtual audio device
      } else if (platform === 'linux') {
        // Linux implementation (PulseAudio)
        console.log('Linux system audio capture not yet implemented');
        // Would use PulseAudio modules
      }
      
      // This is where we would initialize system audio capture
      // For now, just simulate with a timer that emits empty data
      this.systemAudioInterval = setInterval(() => {
        // This is a placeholder - in a real implementation, 
        // we would be getting actual audio data
        const dummyData = Buffer.from([0, 0, 0, 0]);
        this.emit('systemAudioData', dummyData);
        
        // Emit audio data for visualization
        this.emit('audioData', {
          source: 'system',
          audioData: this.processAudioDataForVisualization(dummyData)
        });
      }, 1000);
      
      this.isCapturingSystemAudio = true;
      console.log('System audio capture started (placeholder implementation)');
    } catch (error) {
      console.error('Failed to start system audio capture:', error);
    }
  }
  
  stopSystemAudioCapture() {
    if (!this.isCapturingSystemAudio) return;
    
    console.log('Stopping system audio capture...');
    
    try {
      // Clear the placeholder interval
      if (this.systemAudioInterval) {
        clearInterval(this.systemAudioInterval);
        this.systemAudioInterval = null;
      }
      
      // Actual system audio capture cleanup would go here
      
      this.isCapturingSystemAudio = false;
      console.log('System audio capture stopped successfully');
    } catch (error) {
      console.error('Failed to stop system audio capture:', error);
    }
  }

  startTestRecording() {
    if (this.isTestRecording) return;
    
    console.log('Starting test recording...');
    
    try {
      // Create a new test recording file
      this.testRecordingPath = path.join(this.tempDir, `test-recording-${Date.now()}.wav`);
      
      // Create new audio recorder instance for test recording
      this.testRecorder = new AudioRecorder(this.recorderOptions, {
        logger: console
      });
      
      // Create write stream for the test recording
      const writeStream = fs.createWriteStream(this.testRecordingPath);
      
      // Pipe the audio data to the file
      this.testRecorder.stream().pipe(writeStream);
      
      this.isTestRecording = true;
      console.log('Test recording started successfully');
    } catch (error) {
      console.error('Failed to start test recording:', error);
    }
  }
  
  stopTestRecording() {
    if (!this.isTestRecording) return;
    
    console.log('Stopping test recording...');
    
    try {
      if (this.testRecorder) {
        this.testRecorder.stop();
        this.testRecorder = null;
      }
      
      this.isTestRecording = false;
      console.log('Test recording stopped successfully');
    } catch (error) {
      console.error('Failed to stop test recording:', error);
    }
  }
  
  playTestRecording() {
    if (!this.testRecordingPath || !fs.existsSync(this.testRecordingPath)) {
      console.error('No test recording available to play');
      return;
    }
    
    console.log('Playing test recording...');
    
    try {
      // In a real implementation, we would use a proper audio playback library
      // For now, we'll just emit the file path
      this.emit('testRecordingReady', this.testRecordingPath);
    } catch (error) {
      console.error('Failed to play test recording:', error);
    }
  }

  processAudioDataForVisualization(audioData) {
    // Convert audio data to visualization data
    // This is a simple implementation that creates a bar graph
    const data = new Uint8Array(audioData);
    const samples = 64; // Number of bars in the visualization
    const blockSize = Math.floor(data.length / samples);
    const visualizationData = new Uint8Array(samples);
    
    for (let i = 0; i < samples; i++) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(data[i * blockSize + j]);
      }
      visualizationData[i] = sum / blockSize;
    }
    
    return visualizationData;
  }
}

module.exports = AudioCapture;