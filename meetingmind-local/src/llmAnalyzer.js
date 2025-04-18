const { OpenAI } = require('openai');

class LLMAnalyzer {
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
    
    // Conversation context window (keep recent transcripts for context)
    this.contextWindow = [];
    this.maxContextItems = 10;
  }

  /**
   * Analyzes a transcript segment and generates suggestions
   * @param {Object} transcription - Transcription object with text, source, and timestamp
   * @returns {Promise<Object>} - Analysis results with suggestions
   */
  async analyzeTranscript(transcription, source) {
    try {
      // Add to context window (labeled by source)
      this.updateContextWindow({
        role: source === 'microphone' ? 'user' : 'other',
        content: transcription.text,
        timestamp: transcription.timestamp
      });
      
      // Skip empty transcriptions
      if (!transcription.text || transcription.text.trim() === '') {
        return null;
      }
      
      // Prepare prompt for LLM
      const messages = [
        {
          role: "system",
          content: `You are a real-time meeting communication coach and assistant. 
Your job is to analyze the ongoing conversation and provide brief, actionable suggestions to help the user communicate more effectively.
Focus on clarity, conciseness, and effectiveness. Look for:
1. Unclear or ambiguous statements that could be clarified
2. Opportunities to be more concise or direct
3. Potential action items or follow-ups that should be noted
4. Communication patterns that could be improved
5. Questions that remain unanswered

Keep suggestions brief (1-2 sentences max), specific, and immediately actionable.
DO NOT summarize the entire conversation.
DO NOT provide general communication advice.
ONLY respond if you have a specific, valuable suggestion.
If there's nothing worth suggesting, respond with an empty string.`
        },
        // Add context from previous exchanges (formatted with labels)
        ...this.formatContextForLLM(),
        {
          role: "user",
          content: `Based on this conversation, provide a single brief, specific suggestion to help me communicate more effectively. If there's no valuable suggestion to make right now, respond with an empty string.`
        }
      ];
      
      // Call LLM for analysis
      const completion = await this.openai.chat.completions.create({
        model: process.env.OPENROUTER_API_KEY ? "openai/gpt-3.5-turbo" : "gpt-3.5-turbo",
        messages: messages,
        max_tokens: 100,
        temperature: 0.3,
      });
      
      const suggestion = completion.choices[0].message.content.trim();
      
      // Only return if there's an actual suggestion
      if (suggestion && suggestion !== '') {
        return {
          suggestion,
          source: source,
          timestamp: new Date().toISOString()
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error analyzing transcript with LLM:', error);
      return null;
    }
  }

  /**
   * Updates the context window with a new message
   * @param {Object} message - Message object with role, content, and timestamp
   */
  updateContextWindow(message) {
    // Add to context window
    this.contextWindow.push(message);
    
    // Trim context window if it exceeds max size
    if (this.contextWindow.length > this.maxContextItems) {
      this.contextWindow = this.contextWindow.slice(-this.maxContextItems);
    }
  }

  /**
   * Formats the context window for the LLM
   * @returns {Array} - Array of formatted messages for LLM
   */
  formatContextForLLM() {
    return this.contextWindow.map(item => {
      // Format based on role
      const prefix = item.role === 'user' ? '[YOU]: ' : '[OTHERS]: ';
      
      return {
        role: "assistant",
        content: prefix + item.content
      };
    });
  }
}

module.exports = LLMAnalyzer;