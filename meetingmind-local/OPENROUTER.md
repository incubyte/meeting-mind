# Using OpenRouter with MeetingMind-Local

## Overview

MeetingMind-Local supports using OpenRouter as an alternative to the OpenAI API for the language model component. OpenRouter provides access to a variety of models, potentially at lower costs and with different capabilities.

## Setup for OpenRouter

1. Sign up for an account at [OpenRouter](https://openrouter.ai)
2. Generate an API key in your OpenRouter dashboard
3. Add the API key to your `.env` file:
   ```
   OPENROUTER_API_KEY=your_openrouter_api_key_here
   ```

## Important Limitations

### Speech-to-Text Functionality

OpenRouter does not currently support the Whisper API for speech-to-text functionality. 

**If you only provide an OpenRouter API key:**
- The LLM suggestion feature will work properly
- The speech-to-text functionality will fail

**Solutions:**
1. **Recommended:** Provide both API keys in your `.env` file:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   OPENROUTER_API_KEY=your_openrouter_api_key_here
   ```
   This will use:
   - OpenAI for speech-to-text (Whisper API)
   - OpenRouter for LLM suggestions

2. **Alternative:** Implement a different speech-to-text solution:
   - Use a local Whisper model
   - Integrate a different speech-to-text service

## Model Selection

When using OpenRouter, you can choose from a variety of models. The default model in MeetingMind-Local is set to "openai/gpt-3.5-turbo", but you can change this by editing the `llmAnalyzer.js` file.

Example models available via OpenRouter:
- "openai/gpt-3.5-turbo"
- "openai/gpt-4"
- "anthropic/claude-3-opus-20240229"
- "anthropic/claude-3-sonnet-20240229"
- "anthropic/claude-3-haiku-20240307"
- "google/gemini-pro"
- "meta-llama/llama-3-70b-instruct"

## Cost Considerations

Using OpenRouter can potentially reduce costs, especially for the LLM component. However, remember that:

1. If using both OpenAI and OpenRouter, you'll be billed by both services
2. OpenRouter pricing varies by model selection
3. Usage is tracked separately in each service's dashboard

## Troubleshooting

If you encounter issues with OpenRouter:

1. Verify your API key is correct
2. Check that you've included the required headers (already set up in the code)
3. Confirm the model you're requesting is available on OpenRouter
4. Check the OpenRouter status page for any service disruptions