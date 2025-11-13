/**
 * Diagnostic script to check Gemini API status
 * Run this to verify API keys and check for quota issues
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function checkGeminiAPI() {
  console.log('🔍 Checking Gemini API Status...\n');
  
  const apiKeys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4
  ].filter(key => key && key !== 'your-second-api-key-here' && key !== 'your-third-api-key-here' && key !== 'your-fourth-api-key-here');

  console.log(`📊 Found ${apiKeys.length} API key(s)\n`);

  if (apiKeys.length === 0) {
    console.error('❌ No API keys found in environment variables!');
    console.log('Please set GEMINI_API_KEY in your .env file');
    return;
  }

  for (let i = 0; i < apiKeys.length; i++) {
    const apiKey = apiKeys[i];
    const keyNumber = i + 1;
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔑 Testing API Key ${keyNumber}...`);
    console.log(`Key: ${apiKey.substring(0, 20)}...${apiKey.substring(apiKey.length - 10)}`);
    console.log(`${'='.repeat(60)}\n`);

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      
      // Try different model names to find the correct one
      const modelNames = ['gemini-1.5-flash-latest', 'gemini-1.5-flash', 'gemini-pro', 'gemini-pro-latest'];
      let model = null;
      let workingModelName = null;
      
      for (const modelName of modelNames) {
        try {
          console.log(`   Trying model: ${modelName}...`);
          model = genAI.getGenerativeModel({ 
            model: modelName,
            generationConfig: {
              maxOutputTokens: 100,
              temperature: 0.7,
            }
          });
          
          // Quick test to see if model works
          const testResult = await model.generateContent('test');
          await testResult.response;
          workingModelName = modelName;
          console.log(`   ✅ Model ${modelName} is available!`);
          break;
        } catch (modelError) {
          console.log(`   ❌ Model ${modelName} not available: ${modelError.message.substring(0, 80)}...`);
          continue;
        }
      }
      
      if (!model || !workingModelName) {
        throw new Error('No working model found. Tried: ' + modelNames.join(', '));
      }
      
      // Now use the working model for the actual test
      model = genAI.getGenerativeModel({ 
        model: workingModelName,
        generationConfig: {
          maxOutputTokens: 100,
          temperature: 0.7,
        }
      });

      console.log('📤 Sending test request...');
      const startTime = Date.now();
      
      const result = await model.generateContent('Say "API test successful" in French');
      const response = await result.response;
      const text = response.text();
      
      const duration = Date.now() - startTime;
      
      console.log(`✅ API Key ${keyNumber} is WORKING!`);
      console.log(`⏱️  Response time: ${duration}ms`);
      console.log(`📝 Response: ${text.substring(0, 100)}...`);
      console.log(`✅ Status: ACTIVE\n`);

    } catch (error) {
      console.error(`❌ API Key ${keyNumber} FAILED!`);
      console.error(`Error Type: ${error.constructor.name}`);
      console.error(`Error Message: ${error.message}`);
      
      if (error.status === 429 || error.statusCode === 429 || error.code === 429) {
        console.error(`🚨 QUOTA EXCEEDED - This API key has reached its quota limit`);
        console.error(`   Status: ${error.status || error.statusCode || error.code}`);
        console.error(`   Message: ${error.message}`);
      } else if (error.status === 400 || error.statusCode === 400 || error.code === 400) {
        console.error(`🚨 BAD REQUEST - API key may be invalid or request format is wrong`);
        console.error(`   Status: ${error.status || error.statusCode || error.code}`);
        console.error(`   Message: ${error.message}`);
      } else if (error.status === 403 || error.statusCode === 403 || error.code === 403) {
        console.error(`🚨 FORBIDDEN - API key does not have required permissions`);
        console.error(`   Status: ${error.status || error.statusCode || error.code}`);
        console.error(`   Message: ${error.message}`);
      } else {
        console.error(`🚨 UNKNOWN ERROR`);
        console.error(`   Status: ${error.status || error.statusCode || error.code || 'N/A'}`);
        console.error(`   Code: ${error.code || 'N/A'}`);
        console.error(`   Message: ${error.message}`);
        if (error.response) {
          console.error(`   Response:`, error.response);
        }
      }
      console.log('');
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 Summary:');
  console.log(`   Total Keys: ${apiKeys.length}`);
  console.log(`   Check the results above to see which keys are working`);
  console.log(`${'='.repeat(60)}\n`);
}

// Run the check
checkGeminiAPI().catch(console.error);

