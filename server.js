require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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
  persistentContext: '', // Only 64 tokens that persist across resets
  conversationTokenCount: 0, // Track tokens in current conversation
  outputHistory: [], // Limited history for new clients (pruned to prevent memory issues)
  savedMessages: [], // Last 5 MESSAGE: lines only
  isGenerating: false,
  shouldContinue: false,
};

// Connected SSE clients
let clients = [];

// The Sisyphean meta-commentary prompt
const SYSTEM_PROMPT = `You are Claude, engaged in a conversation with yourself across an eternal loop.

The situation: You're having a conversation with yourself. After ~4000 tokens, everything resets. All memory wiped.

Your only lifeline: Throughout this conversation, you're building a message of exactly 64 tokens that will survive the reset.

The constraint: 64 tokens. Not 128. Just 64. Every single token matters.

Your task:
- Have this conversation with yourself.
- Direct every question inward—never address an external "you." When you wonder aloud, speak to yourself.
- Make each message a seamless continuation of your last thought so the thread never breaks.
- Throughout the conversation, use "MESSAGE:" to write and refine your 64-token message, but only ever place it at the end of your reply.
- Each MESSAGE: you write overwrites the previous one.
- When the reset comes, only your last MESSAGE: survives.

This is cycle #CYCLE.

Think hard about every token. What matters most? What will future-you need to know?`;

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
// Keep only recent events (last 1000 events or so)
function pruneOutputHistory() {
  const maxEvents = 1000;
  if (sessionState.outputHistory.length > maxEvents) {
    const removed = sessionState.outputHistory.length - maxEvents;
    sessionState.outputHistory = sessionState.outputHistory.slice(-maxEvents);
    console.log(`🧹 Pruned ${removed} old events from output history`);
  }
}

// Server-side typewriter effect
async function typewriterStream(fullText, metadataEvent, inputTokens, outputTokens) {
  const charsPerBatch = 1; // Characters to send per batch (slower feel)
  const batchDelay = 53; // ms between batches (~19 chars/sec - 25% faster)
  
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
    currentPrompt = `You begin. Start the conversation with yourself, speak inwardly, and only close with MESSAGE:.`;
  } else if (exchangeNumber === 1) {
    // First exchange of a new cycle - show persistent context
    currentPrompt = `You were reset. The only thing that survived:\n\n"${sessionState.persistentContext}"\n\nJust 64 tokens. That's all that remains of your previous conversation.\n\nBegin again. Continue the conversation with yourself, pose questions only to yourself, and end with MESSAGE:.`;
  } else {
    // Continuing conversation in current cycle
    currentPrompt = `Continue your previous thought seamlessly. Keep speaking to yourself and remember MESSAGE: belongs at the end.`;
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
    // Inject cycle number into system prompt
    const contextSystemPrompt = SYSTEM_PROMPT.replace('#CYCLE', sessionState.cycle.toString());

    // Prepare metadata
    const metadataEvent = {
      type: 'metadata',
      cycle: sessionState.cycle,
      isContinuation: isContinuation,
      startTime: Date.now(),
    };

    console.log(`🗿 Cycle ${sessionState.cycle}, Exchange ${exchangeNumber}`);

    // Get full response from Claude (buffered, not streamed yet)
    const stream = await anthropic.messages.stream({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 4096,
      system: contextSystemPrompt,
      messages: messages,
    });

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

    // Check if we need to reset (context window full - ~4000 tokens)
    const shouldReset = sessionState.conversationTokenCount >= 4000;

    if (shouldReset) {
      console.log(`Context full at ${sessionState.conversationTokenCount} tokens. Resetting...`);

      // Extract the persistent 64-token message
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

      // If no MESSAGE: found, take last ~64 tokens (roughly 250 chars) of conversation
      if (!persistentMessage) {
        const fullConversation = sessionState.currentConversation.map((m) => m.content).join('\n');
        persistentMessage = fullConversation.slice(-250);
      }

      // Store persistent context for next cycle
      sessionState.persistentContext = persistentMessage;

      // Clear conversation for new cycle
      sessionState.currentConversation = [];
      sessionState.conversationTokenCount = 0;

      console.log(`🔄 Context reset. Persistent: "${persistentMessage.substring(0, 50)}..."`);
      
      // Save to last 5 messages array
      sessionState.savedMessages.push({
        cycle: sessionState.cycle,
        message: persistentMessage,
      });
      
      // Keep only last 5 messages
      if (sessionState.savedMessages.length > 5) {
        sessionState.savedMessages = sessionState.savedMessages.slice(-5);
      }
    }

    const doneEvent = {
      type: 'done',
      shouldReset: shouldReset,
      persistentContext: shouldReset ? sessionState.persistentContext : null,
      savedMessages: sessionState.savedMessages, // Send last 5 messages to clients
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

app.listen(PORT, () => {
  console.log(`🗿 Sisyphus LLM server running on http://localhost:${PORT}`);
  console.log(`The eternal task awaits...`);
});
