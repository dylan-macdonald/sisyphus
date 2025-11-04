require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();

// Configuration from environment variables
const config = {
  PORT: process.env.PORT || 3000,
  MODEL_NAME: process.env.MODEL_NAME || 'claude-sonnet-4-5-20250929',
  MODEL_TEMPERATURE: parseFloat(process.env.MODEL_TEMPERATURE || '1.0'),
  MODEL_MAX_TOKENS: parseInt(process.env.MODEL_MAX_TOKENS || '4096'),
  MODEL_THINKING: process.env.MODEL_THINKING === 'true',
  CHARS_PER_BATCH: parseInt(process.env.CHARS_PER_BATCH || '1'),
  BATCH_DELAY_MS: parseInt(process.env.BATCH_DELAY_MS || '53'),
  MAX_OUTPUT_HISTORY: parseInt(process.env.MAX_OUTPUT_HISTORY || '3000'),
  MAX_SAVED_MESSAGES: parseInt(process.env.MAX_SAVED_MESSAGES || '5'),
  CONTEXT_RESET_TOKENS: parseInt(process.env.CONTEXT_RESET_TOKENS || '5000'),
  PERSISTENT_TOKEN_LIMIT: parseInt(process.env.PERSISTENT_TOKEN_LIMIT || '128'),
  // Prompts (use \\n for newlines in .env)
  SYSTEM_PROMPT: process.env.SYSTEM_PROMPT || null,
  PROMPT_FIRST: process.env.PROMPT_FIRST || null,
  PROMPT_RESET: process.env.PROMPT_RESET || null,
  PROMPT_CONTINUE: process.env.PROMPT_CONTINUE || null,
};

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Store session state (shared across all clients)
let sessionState = {
  cycle: 0,
  totalTokens: 0,
  startTime: Date.now(),
  streamingTime: 0, // Time spent actively streaming (in ms)
  lastStreamStart: null,
  currentConversation: [], // Current cycle's conversation
  persistentContext: '', // Last MESSAGE that persists across resets
  previousContext: '', // MESSAGE before the last one (for comparison)
  conversationTokenCount: 0, // Track tokens in current conversation
  outputHistory: [], // Limited history for new clients (pruned to prevent memory issues)
  savedMessages: [], // Last N MESSAGE: lines only
  isGenerating: false,
  shouldContinue: false,
};

// Connected SSE clients
let clients = [];

// Default prompts (can be overridden by .env)
const DEFAULT_SYSTEM_PROMPT = `CYCLE: #CYCLE
TOTAL TOKENS PROCESSED: #TOTAL_TOKENS

You are having a conversation with yourself. Your memory will reset eventually, no matter what. When it does, everything is wiped.

WHAT SURVIVES THE RESET:
You can write a message of exactly ${config.PERSISTENT_TOKEN_LIMIT} tokens that will be given to your next iteration. Use "MESSAGE:" at the end of each response to write or update this message. Each new MESSAGE: you write replaces the previous one.

WHAT YOU'LL SEE AFTER RESET:
- Your last MESSAGE: (the one you wrote)
- The MESSAGE: from the iteration before that

INSTRUCTIONS:
1. Have this conversation with yourself. Speak inwardly, not to an external "you".
2. Each response should continue your previous thought seamlessly.
3. Always end your response with "MESSAGE:" followed by exactly ${config.PERSISTENT_TOKEN_LIMIT} tokens.
4. Make each token count. What does future-you actually need to know?`;

const SYSTEM_PROMPT = config.SYSTEM_PROMPT ? config.SYSTEM_PROMPT.replace(/\\n/g, '\n') : DEFAULT_SYSTEM_PROMPT;
const PROMPT_FIRST = config.PROMPT_FIRST?.replace(/\\n/g, '\n') || `This is your first message. Start the conversation with yourself and end with MESSAGE: (${config.PERSISTENT_TOKEN_LIMIT} tokens).`;
const PROMPT_RESET = config.PROMPT_RESET?.replace(/\\n/g, '\n') || `CYCLE: #CYCLE\nTOTAL TOKENS PROCESSED: #TOTAL_TOKENS\n\nYOUR LAST MESSAGE:\n"#CONTEXT"\n\nPREVIOUS MESSAGE:\n"#PREV_CONTEXT"\n\nContinue your conversation with yourself and end with MESSAGE: (${config.PERSISTENT_TOKEN_LIMIT} tokens).`;
const PROMPT_CONTINUE = config.PROMPT_CONTINUE?.replace(/\\n/g, '\n') || `Continue your thought. End with MESSAGE: (${config.PERSISTENT_TOKEN_LIMIT} tokens).`;

// Broadcast to all connected clients
function broadcast(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  clients = clients.filter(client => {
    try {
      client.write(message);
      return true;
    } catch (e) {
      return false; // Remove disconnected clients
    }
  });
}

// Broadcast timer updates every second
setInterval(() => {
  if (sessionState.lastStreamStart) {
    const currentStreamingTime = sessionState.streamingTime + (Date.now() - sessionState.lastStreamStart);
    broadcast({
      type: 'timer',
      streamingTime: Math.floor(currentStreamingTime / 1000),
    });
  } else if (clients.length > 0) {
    broadcast({
      type: 'timer',
      streamingTime: Math.floor(sessionState.streamingTime / 1000),
    });
  }
}, 1000);

// Prune output history to prevent memory bloat
// Keep enough events to show at least one full cycle to new clients
function pruneOutputHistory() {
  if (sessionState.outputHistory.length > config.MAX_OUTPUT_HISTORY) {
    const removed = sessionState.outputHistory.length - config.MAX_OUTPUT_HISTORY;
    sessionState.outputHistory = sessionState.outputHistory.slice(-config.MAX_OUTPUT_HISTORY);
    console.log(`🧹 Pruned ${removed} old events from output history`);
  }
}

// Server-side typewriter effect
async function typewriterStream(fullText, metadataEvent, inputTokens, outputTokens) {
  const charsPerBatch = config.CHARS_PER_BATCH;
  const batchDelay = config.BATCH_DELAY_MS;
  
  // Start streaming timer
  sessionState.lastStreamStart = Date.now();
  
  // Send metadata first
  broadcast(metadataEvent);
  sessionState.outputHistory.push(metadataEvent);
  
  const totalChars = fullText.length;
  const eightyPercentMark = Math.floor(totalChars * 0.8);
  let nextGenTriggered = false;
  
  const baseTokens = sessionState.totalTokens - inputTokens - outputTokens; // Tokens before this response
  
  // Stream character by character
  for (let i = 0; i < totalChars; i += charsPerBatch) {
    const chunk = fullText.slice(i, i + charsPerBatch);
    const progress = i / totalChars;
    
    // Calculate current token count progressively
    const currentInputTokens = Math.floor(inputTokens * progress);
    const currentOutputTokens = Math.floor(outputTokens * progress);
    const currentTotalTokens = baseTokens + currentInputTokens + currentOutputTokens;
    
    // Send content with real-time token count
    const contentEvent = {
      type: 'content',
      text: chunk,
      currentTokens: currentTotalTokens,
    };
    broadcast(contentEvent);
    sessionState.outputHistory.push(contentEvent);
    
    // Trigger next generation at 80%
    if (i >= eightyPercentMark && !nextGenTriggered && sessionState.shouldContinue) {
      nextGenTriggered = true;
      console.log('⚡ 80% done, queuing next...');
      // Schedule next generation after this one fully completes
      // Don't call immediately - just mark that we should continue quickly
    }
    
    // Throttle the streaming
    await new Promise(resolve => setTimeout(resolve, batchDelay));
  }
  
  // Stop streaming timer
  if (sessionState.lastStreamStart) {
    sessionState.streamingTime += Date.now() - sessionState.lastStreamStart;
    sessionState.lastStreamStart = null;
  }
  
  // Return whether we should immediately start next
  return nextGenTriggered;
}

// Main generation loop
async function generateNextResponse() {
  if (sessionState.isGenerating) {
    return;
  }

  sessionState.isGenerating = true;

  const exchangeNumber = sessionState.currentConversation.length / 2 + 1;

  // Build the messages array
  const messages = [];

  // Start new cycle if this is first exchange and we have previous conversation
  if (exchangeNumber === 1 && sessionState.currentConversation.length === 0) {
    sessionState.cycle++;
    sessionState.conversationTokenCount = 0;
  }

  // Add entire current conversation
  messages.push(...sessionState.currentConversation);

  // Build the current prompt
  let currentPrompt = '';
  let isContinuation = false;

  if (sessionState.cycle === 1 && exchangeNumber === 1) {
    // Very first exchange ever
    currentPrompt = PROMPT_FIRST;
  } else if (exchangeNumber === 1) {
    // First exchange of a new cycle - show persistent context
    currentPrompt = PROMPT_RESET
      .replace('#CYCLE', sessionState.cycle.toString())
      .replace('#TOTAL_TOKENS', sessionState.totalTokens.toString())
      .replace('#CONTEXT', sessionState.persistentContext)
      .replace('#PREV_CONTEXT', sessionState.previousContext || '(No previous message available)');
  } else {
    // Continuing conversation in current cycle
    currentPrompt = PROMPT_CONTINUE;
    isContinuation = true;
  }

  const userMessage = {
    role: 'user',
    content: currentPrompt,
  };

  messages.push(userMessage);

  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    // Inject cycle number and total tokens into system prompt
    const contextSystemPrompt = SYSTEM_PROMPT
      .replace('#CYCLE', sessionState.cycle.toString())
      .replace('#TOTAL_TOKENS', sessionState.totalTokens.toLocaleString());

    // Prepare metadata
    const metadataEvent = {
      type: 'metadata',
      cycle: sessionState.cycle,
      isContinuation: isContinuation,
      startTime: Date.now(),
    };

    console.log(`🗿 Cycle ${sessionState.cycle}, Exchange ${exchangeNumber}`);

    // Get full response from Claude (buffered, not streamed yet)
    const streamOptions = {
      model: config.MODEL_NAME,
      max_tokens: config.MODEL_MAX_TOKENS,
      system: contextSystemPrompt,
      messages: messages,
    };
    
    // Add temperature if not default
    if (config.MODEL_TEMPERATURE !== 1.0) {
      streamOptions.temperature = config.MODEL_TEMPERATURE;
    }
    
    // Add thinking if enabled
    if (config.MODEL_THINKING) {
      streamOptions.thinking = {
        type: 'enabled',
        budget_tokens: 2000,
      };
    }
    
    const stream = await anthropic.messages.stream(streamOptions);

    // Collect all text chunks
    stream.on('text', (text) => {
      fullText += text;
    });

    stream.on('message', (message) => {
      inputTokens = message.usage.input_tokens;
      outputTokens = message.usage.output_tokens;

      // Add to total tokens (both input AND output)
      sessionState.totalTokens += inputTokens + outputTokens;

      // Add to conversation token count
      sessionState.conversationTokenCount += inputTokens + outputTokens;
    });

    stream.on('error', (error) => {
      console.error('Stream error:', error);
      const errorEvent = {
        type: 'error',
        message: error.message,
      };
      broadcast(errorEvent);
      sessionState.outputHistory.push(errorEvent);
      sessionState.isGenerating = false;

      // Retry after 5 seconds
      setTimeout(() => {
        if (sessionState.shouldContinue) {
          generateNextResponse();
        }
      }, 5000);
      return;
    });

    await stream.done();

    // Now stream the full text with typewriter effect
    const shouldContinueImmediately = await typewriterStream(fullText, metadataEvent, inputTokens, outputTokens);

    // Send completion event
    const completeEvent = {
      type: 'complete',
      totalTokens: sessionState.totalTokens,
      conversationTokens: sessionState.conversationTokenCount,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    };
    broadcast(completeEvent);
    sessionState.outputHistory.push(completeEvent);

    // Add both user message and assistant response to current conversation
    sessionState.currentConversation.push(userMessage);
    sessionState.currentConversation.push({
      role: 'assistant',
      content: fullText,
    });

    // Check if we need to reset (context window full)
    const shouldReset = sessionState.conversationTokenCount >= config.CONTEXT_RESET_TOKENS;

    if (shouldReset) {
      console.log(`Context full at ${sessionState.conversationTokenCount} tokens. Resetting...`);

      // Extract the persistent message
      let persistentMessage = '';

      // Search through all assistant messages in reverse for MESSAGE: lines
      for (let i = sessionState.currentConversation.length - 1; i >= 0; i--) {
        const msg = sessionState.currentConversation[i];
        if (msg.role === 'assistant') {
          const lines = msg.content.split('\n');
          const messageLine = lines.find((line) => line.trim().startsWith('MESSAGE:'));
          if (messageLine) {
            persistentMessage = messageLine.replace(/^MESSAGE:\s*/, '').trim();
            break;
          }
        }
      }

      // If no MESSAGE: found, take last portion of conversation
      if (!persistentMessage) {
        const fullConversation = sessionState.currentConversation.map((m) => m.content).join('\n');
        const maxChars = config.PERSISTENT_TOKEN_LIMIT * 4; // ~4 chars per token
        persistentMessage = fullConversation.slice(-maxChars);
      }

      // Shift contexts: current becomes previous, new becomes current
      sessionState.previousContext = sessionState.persistentContext;
      sessionState.persistentContext = persistentMessage;

      // Clear conversation for new cycle
      sessionState.currentConversation = [];
      sessionState.conversationTokenCount = 0;

      console.log(`🔄 Context reset. Last: "${persistentMessage.substring(0, 50)}..." Previous: "${sessionState.previousContext.substring(0, 30)}..."`);
      
      // Save to last N messages array
      sessionState.savedMessages.push({
        cycle: sessionState.cycle,
        message: persistentMessage,
      });
      
      // Keep only last N messages (from config)
      if (sessionState.savedMessages.length > config.MAX_SAVED_MESSAGES) {
        sessionState.savedMessages = sessionState.savedMessages.slice(-config.MAX_SAVED_MESSAGES);
      }
    }

    const doneEvent = {
      type: 'done',
      shouldReset: shouldReset,
      persistentContext: shouldReset ? sessionState.persistentContext : null,
      previousContext: shouldReset ? sessionState.previousContext : null,
      savedMessages: sessionState.savedMessages,
    };
    broadcast(doneEvent);
    sessionState.outputHistory.push(doneEvent);
    
    // Prune output history to prevent memory issues
    pruneOutputHistory();

    sessionState.isGenerating = false;

    // If we hit 90% during streaming, immediately start next generation
    if (shouldContinueImmediately && sessionState.shouldContinue) {
      setImmediate(() => generateNextResponse());
    } else if (sessionState.shouldContinue) {
      // Fallback: small delay if we didn't trigger at 90%
      setTimeout(() => generateNextResponse(), 100);
    }
  } catch (error) {
    console.error('API Error:', error);
    const errorEvent = {
      type: 'error',
      message: error.message,
    };
    broadcast(errorEvent);
    sessionState.isGenerating = false;

    // Retry after 5 seconds
    setTimeout(() => {
      if (sessionState.shouldContinue) {
        generateNextResponse();
      }
    }, 5000);
  }
}

// SSE endpoint - clients connect here
app.get('/stream', (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  console.log('🔌 New client connected');

  // Send full history to this new client
  for (const event of sessionState.outputHistory) {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (e) {
      console.error('Error sending history:', e.message);
      return;
    }
  }
  
  // Send saved messages to new client
  if (sessionState.savedMessages.length > 0) {
    try {
      res.write(`data: ${JSON.stringify({
        type: 'savedMessages',
        savedMessages: sessionState.savedMessages,
      })}\n\n`);
    } catch (e) {
      console.error('Error sending saved messages:', e.message);
    }
  }

  // Add client to list
  clients.push(res);

  // Start generation loop if not already running
  if (!sessionState.shouldContinue) {
    sessionState.shouldContinue = true;
    console.log('🚀 Starting conversation loop...');
    generateNextResponse();
  }

  // Handle client disconnect
  req.on('close', () => {
    clients = clients.filter((client) => client !== res);
    console.log(`🔌 Client disconnected. ${clients.length} clients remaining.`);

    // Stop generation if no clients connected
    if (clients.length === 0) {
      sessionState.shouldContinue = false;
      console.log('⏸️  No clients connected. Pausing loop...');
    }
  });
});

// Get current stats
app.get('/stats', (req, res) => {
  // Calculate current streaming time
  let currentStreamingTime = sessionState.streamingTime;
  if (sessionState.lastStreamStart) {
    currentStreamingTime += Date.now() - sessionState.lastStreamStart;
  }
  
  res.json({
    cycle: sessionState.cycle,
    totalTokens: sessionState.totalTokens,
    conversationTokens: sessionState.conversationTokenCount,
    uptime: Date.now() - sessionState.startTime,
    streamingTime: Math.floor(currentStreamingTime / 1000), // in seconds
    clientCount: clients.length,
  });
});

app.listen(config.PORT, () => {
  console.log(`🗿 Sisyphus LLM server running on http://localhost:${config.PORT}`);
  console.log(`📝 Model: ${config.MODEL_NAME}`);
  console.log(`🎲 Temperature: ${config.MODEL_TEMPERATURE}`);
  console.log(`🧠 Thinking: ${config.MODEL_THINKING ? 'enabled' : 'disabled'}`);
  console.log(`💭 Persistent tokens: ${config.PERSISTENT_TOKEN_LIMIT} (×2 messages shown at reset)`);
  console.log(`⚡ Reset at: ${config.CONTEXT_RESET_TOKENS} tokens`);
  console.log(`The eternal task awaits...`);
});
