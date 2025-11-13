const { Mistral } = require('@mistralai/mistralai');
require('dotenv').config();

class MistralApiManager {
  constructor() {
    // Load all available API keys
    this.apiKeys = [
      process.env.MISTRAL_API_KEY,
      process.env.MISTRAL_API_KEY_2,
    ].filter(key => key && key.trim().length > 0);

    // Free models available on Mistral AI
    // mistral-tiny: Free tier, fastest, good for simple tasks
    // mistral-small: Better quality, still fast
    // mistral-medium: Best quality
    this.defaultModel = process.env.MISTRAL_MODEL || 'mistral-small-latest'; // Free tier friendly
    
    this.currentKeyIndex = 0;
    this.keyUsageCount = new Map();
    this.keyLastReset = new Map();
    this.maxRequestsPerKey = 1000; // Mistral free tier typically has generous limits
    
    // Initialize usage tracking
    this.apiKeys.forEach((key, index) => {
      this.keyUsageCount.set(index, 0);
      this.keyLastReset.set(index, new Date());
    });

    console.log(`🔑 Mistral AI Manager initialized with ${this.apiKeys.length} API keys`);
    console.log(`🤖 Default Model: ${this.defaultModel}`);
  }

  /**
   * Get the current Mistral AI client with automatic key rotation
   */
  getClient() {
    const availableKeyIndex = this.getAvailableKeyIndex();
    
    if (availableKeyIndex === -1) {
      throw new Error('All API keys have exceeded their daily quota. Please wait for reset or add more keys.');
    }

    this.currentKeyIndex = availableKeyIndex;
    const apiKey = this.apiKeys[this.currentKeyIndex];
    
    return new Mistral({ apiKey: apiKey });
  }

  /**
   * Find an available API key that hasn't exceeded quota
   */
  getAvailableKeyIndex() {
    const now = new Date();
    
    for (let i = 0; i < this.apiKeys.length; i++) {
      const lastReset = this.keyLastReset.get(i);
      const usageCount = this.keyUsageCount.get(i);
      
      // Reset daily if 24 hours have passed
      if (now - lastReset >= 24 * 60 * 60 * 1000) {
        this.keyUsageCount.set(i, 0);
        this.keyLastReset.set(i, now);
      }
      
      // Check if key is available
      if (usageCount < this.maxRequestsPerKey) {
        return i;
      }
    }
    
    return -1; // No available keys
  }

  /**
   * Make a request with automatic retry and key rotation
   */
  async makeRequest(requestFunction, maxRetries = 3) {
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const client = this.getClient();
        
        // Execute the request with timeout
        const result = await Promise.race([
          requestFunction(client),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), 30000)
          )
        ]);

        // Increment usage count for successful request
        const currentUsage = this.keyUsageCount.get(this.currentKeyIndex);
        this.keyUsageCount.set(this.currentKeyIndex, currentUsage + 1);

        console.log(`✅ Mistral AI request successful (Key ${this.currentKeyIndex + 1}, Usage: ${currentUsage + 1}/${this.maxRequestsPerKey})`);

        return result;
      } catch (error) {
        lastError = error;
        
        // Check if it's a quota/rate limit error
        if (error.status === 429 || error.message?.includes('quota') || error.message?.includes('rate limit')) {
          // Mark current key as exhausted
          this.keyUsageCount.set(this.currentKeyIndex, this.maxRequestsPerKey);
          
          // Try next key
          const nextKeyIndex = this.getAvailableKeyIndex();
          if (nextKeyIndex === -1) {
            throw new Error('All API keys have exceeded their quota. Please wait for reset.');
          }
          
          console.log(`⚠️ Key ${this.currentKeyIndex + 1} quota exceeded, switching to key ${nextKeyIndex + 1}`);
          this.currentKeyIndex = nextKeyIndex;
          continue;
        }
        
        // For other errors, retry with exponential backoff
        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          console.log(`⚠️ Request failed, retrying in ${delay}ms... (Attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
    }

    throw lastError || new Error('Request failed after all retries');
  }

  /**
   * Generate content using Mistral AI
   */
  async generateContent(prompt, options = {}) {
    return this.makeRequest(async (client) => {
      const model = options.model || this.defaultModel;
      const messages = [
        {
          role: 'user',
          content: prompt
        }
      ];

      // If system prompt is provided, add it as a system message
      if (options.systemPrompt) {
        messages.unshift({
          role: 'system',
          content: options.systemPrompt
        });
      }

      const response = await client.chat.complete({
        model: model,
        messages: messages,
        maxTokens: options.maxTokens || 200, // Reduced for faster responses
        temperature: options.temperature || 0.7,
      });

      return response.choices[0]?.message?.content || '';
    });
  }

  /**
   * Get usage status for all keys
   */
  getUsageStatus() {
    return this.apiKeys.map((key, index) => {
      const usage = this.keyUsageCount.get(index) || 0;
      const lastReset = this.keyLastReset.get(index);
      const hoursUntilReset = 24 - ((new Date() - lastReset) / (1000 * 60 * 60));
      
      return {
        keyIndex: index + 1,
        usage,
        maxUsage: this.maxRequestsPerKey,
        available: usage < this.maxRequestsPerKey,
        hoursUntilReset: Math.max(0, hoursUntilReset),
        lastReset: lastReset.toISOString()
      };
    });
  }
}

// Export singleton instance
const mistralApiManager = new MistralApiManager();
module.exports = mistralApiManager;

