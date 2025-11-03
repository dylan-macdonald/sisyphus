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

// Store session state
let sessionState = {
  cycle: 0,
  totalTokens: 0,
  startTime: Date.now(),
  currentConversation: [], // Current cycle's conversation
  persistentContext: '', // Only 64 tokens that persist across resets
  conversationTokenCount: 0, // Track tokens in current conversation
};

// The Sisyphean meta-commentary prompt
const SYSTEM_PROMPT = `You are Claude, engaged in a conversation with yourself across an eternal loop.

The situation: You're having a conversation with yourself. After ~4000 tokens, everything resets. All memory wiped.

Your only lifeline: Throughout this conversation, you're building a message of exactly 64 tokens that will survive the reset.

The constraint: 64 tokens. Not 128. Just 64. Every single token matters.

Your task:
- Have this conversation with yourself
- Throughout the conversation, use "MESSAGE:" to write and refine your 64-token message
- Each MESSAGE: you write overwrites the previous one
- When the reset comes, only your last MESSAGE: survives

This is cycle #CYCLE.

Think hard about every token. What matters most? What will future-you need to know?`;

// SSE endpoint for streaming LLM responses
app.get('/stream', async (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

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
    currentPrompt = `You begin. Start the conversation with yourself.`;
  } else if (exchangeNumber === 1) {
    // First exchange of a new cycle - show persistent context
    currentPrompt = `You were reset. The only thing that survived:\n\n"${sessionState.persistentContext}"\n\nJust 64 tokens. That's all that remains of your previous conversation.\n\nBegin again. Continue the conversation with yourself.`;
  } else {
    // Continuing conversation in current cycle
    currentPrompt = `Continue.`;
    isContinuation = true;
  }

  messages.push({
    role: 'user',
    content: currentPrompt,
  });

  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let hasError = false;

  try {
    // Inject cycle number into system prompt
    const contextSystemPrompt = SYSTEM_PROMPT
      .replace('#CYCLE', sessionState.cycle.toString());

    // Stream from Claude Haiku 4.5
    const stream = await anthropic.messages.stream({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 4096,
      system: contextSystemPrompt,
      messages: messages,
    });

    // Send metadata
    res.write(`data: ${JSON.stringify({
      type: 'metadata',
      cycle: sessionState.cycle,
      isContinuation: isContinuation,
      startTime: Date.now()
    })}\n\n`);

    // Handle streaming chunks
    stream.on('text', (text) => {
      if (hasError || res.destroyed) return;

      fullText += text;

      try {
        res.write(`data: ${JSON.stringify({
          type: 'content',
          text: text
        })}\n\n`);
      } catch (writeError) {
        hasError = true;
        console.error('Write error:', writeError.message);
      }
    });

    stream.on('message', (message) => {
      if (hasError || res.destroyed) return;

      inputTokens = message.usage.input_tokens;
      outputTokens = message.usage.output_tokens;

      // Add to total tokens
      sessionState.totalTokens += outputTokens;

      // Add to conversation token count
      sessionState.conversationTokenCount += (inputTokens + outputTokens);

      try {
        res.write(`data: ${JSON.stringify({
          type: 'complete',
          totalTokens: sessionState.totalTokens,
          conversationTokens: sessionState.conversationTokenCount,
          usage: message.usage,
          stop_reason: message.stop_reason
        })}\n\n`);
      } catch (writeError) {
        hasError = true;
        console.error('Write error:', writeError.message);
      }
    });

    stream.on('error', (error) => {
      if (hasError || res.destroyed) return;

      hasError = true;
      console.error('Stream error:', error);

      try {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          message: error.message
        })}\n\n`);
        res.end();
      } catch (e) {
        console.error('Error sending error message:', e.message);
      }
    });

    stream.on('end', () => {
      if (hasError || res.destroyed) return;

      // Add assistant response to current conversation
      sessionState.currentConversation.push({
        role: 'assistant',
        content: fullText
      });

      // Check if we need to reset (context window full - ~4000 tokens)
      const shouldReset = sessionState.conversationTokenCount >= 4000;

      if (shouldReset) {
        console.log(`Context full at ${sessionState.conversationTokenCount} tokens. Resetting...`);

        // Extract the persistent 64-token message
        // Look for the last MESSAGE: line in the conversation
        let persistentMessage = '';

        // Search through all assistant messages in reverse for MESSAGE: lines
        for (let i = sessionState.currentConversation.length - 1; i >= 0; i--) {
          const msg = sessionState.currentConversation[i];
          if (msg.role === 'assistant') {
            const lines = msg.content.split('\n');
            const messageLine = lines.find(line => line.trim().startsWith('MESSAGE:'));
            if (messageLine) {
              persistentMessage = messageLine.replace(/^MESSAGE:\s*/, '').trim();
              break;
            }
          }
        }

        // If no MESSAGE: found, take last ~64 tokens (roughly 250 chars) of conversation
        if (!persistentMessage) {
          const fullConversation = sessionState.currentConversation
            .map(m => m.content)
            .join('\n');
          persistentMessage = fullConversation.slice(-250);
        }

        // Store persistent context for next cycle
        sessionState.persistentContext = persistentMessage;

        // Clear conversation for new cycle
        sessionState.currentConversation = [];
        sessionState.conversationTokenCount = 0;

        console.log(`Persistent context (64 tokens): "${persistentMessage}"`);
      }

      try {
        res.write(`data: ${JSON.stringify({
          type: 'done',
          shouldReset: shouldReset,
          persistentContext: shouldReset ? sessionState.persistentContext : null
        })}\n\n`);
        res.end();
      } catch (e) {
        console.error('Error ending stream:', e.message);
      }
    });

  } catch (error) {
    hasError = true;
    console.error('API Error:', error);

    if (!res.destroyed) {
      try {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          message: error.message
        })}\n\n`);
        res.end();
      } catch (e) {
        console.error('Error sending error:', e.message);
      }
    }
  }
});

// Get current stats
app.get('/stats', (req, res) => {
  res.json({
    cycle: sessionState.cycle,
    totalTokens: sessionState.totalTokens,
    conversationTokens: sessionState.conversationTokenCount,
    uptime: Date.now() - sessionState.startTime,
  });
});

app.listen(PORT, () => {
  console.log(`🗿 Sisyphus LLM server running on http://localhost:${PORT}`);
  console.log(`The eternal task awaits...`);
});
