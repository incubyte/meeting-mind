const fs = require('fs');
const path = require('path');
const os = require('os');
const { OpenAI } = require('openai');

class SpeechToText {
  constructor() {
    // Initialize OpenAI client with OpenRouter compatibility
    this.openai = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENROUTER_API_KEY ? "https://openrouter.ai/api/v1" : undefined,
      defaultHeaders: process.env.OPENROUTER_API_KEY ? {
        "HTTP-Referer": "http://localhost:3000", // Required for OpenRouter
        "X-Title": "MeetingMind-Local"           // Optional, for OpenRouter analytics
      } : {}
    });
    
    // Buffer to accumulate audio for each source
    this.buffers = {
      microphone: [],
      system: []
    };
    
    // Tracking last transcription time
    this.lastTranscriptionTime = {
      microphone: Date.now(),
      system: Date.now()
    };
    
    // Minimum time between transcriptions (ms)
    this.transcriptionInterval = 3000;
    
    // Temporary directory for audio files
    this.tempDir = path.join(os.tmpdir(), 'meetingmind-audio');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Accumulates audio data and periodically transcribes it
   * @param {Buffer} audioData - Raw audio data
   * @param {string} source - Source of the audio ('microphone' or 'system')
   * @returns {Promise<string|null>} - Transcription or null if not transcribed
   */
  async transcribe(audioData, source) {
    // Add data to the appropriate buffer
    this.buffers[source].push(audioData);
    
    const currentTime = Date.now();
    const timeSinceLastTranscription = currentTime - this.lastTranscriptionTime[source];
    
    // Only transcribe if enough time has passed
    if (timeSinceLastTranscription < this.transcriptionInterval) {
      return null;
    }
    
    // Update last transcription time
    this.lastTranscriptionTime[source] = currentTime;
    
    // Combine buffers into a single audio chunk
    const combinedBuffer = Buffer.concat(this.buffers[source]);
    
    // Reset buffer
    this.buffers[source] = [];
    
    // If buffer is too small, skip transcription
    if (combinedBuffer.length < 1000) {
      return null;
    }
    
    try {
      // Save combined buffer to a temporary file
      const tempFilePath = path.join(this.tempDir, `${source}-${Date.now()}.wav`);
      fs.writeFileSync(tempFilePath, combinedBuffer);
      
      // Use OpenAI Whisper API for speech-to-text
      const transcription = await this.transcribeWithWhisper(tempFilePath, source);
      
      // Clean up temporary file
      try {
        fs.unlinkSync(tempFilePath);
      } catch (err) {
        console.error('Error deleting temporary file:', err);
      }
      
      if (transcription && transcription.trim()) {
        console.log(`[${source}] Transcription:`, transcription);
        return {
          text: transcription,
          source: source,
          timestamp: new Date().toISOString()
        };
      }
      
      return null;
    } catch (error) {
      console.error(`Error transcribing ${source} audio:`, error);
      return null;
    }
  }

  /**
   * Transcribes an audio file using Whisper API
   * @param {string} filePath - Path to audio file
   * @param {string} source - Source of the audio
   * @returns {Promise<string>} - Transcribed text
   */
  async transcribeWithWhisper(filePath, source) {
    try {
      // Note: Currently OpenRouter doesn't support Whisper API directly
      // This will fallback to OpenAI's Whisper API, even when using OpenRouter for the LLM
      // If using OpenRouter for everything, you may need to choose a different STT provider
      const response = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: "whisper-1",
        language: "en",
      });
      
      return response.text;
    } catch (error) {
      console.error('Error with Whisper API:', error);
      
      // Log a special message for OpenRouter users
      if (process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY) {
        console.error('NOTE: OpenRouter doesn\'t currently support the Whisper API. You need to provide an OpenAI API key for speech-to-text functionality.');
      }
      
      return '';
    }
  }
}

module.exports = SpeechToText;