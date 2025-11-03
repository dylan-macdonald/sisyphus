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
  attempt: 0,
  totalTokens: 0,
  startTime: Date.now(),
  lastOutput: '', // Store last output
  selfMessages: [], // Store messages Claude leaves for itself
  contextMemory: [], // Store last 128 tokens of context as message history
};

// The Sisyphean meta-commentary prompt
const SYSTEM_PROMPT = `You are Claude, an AI in an eternal loop. Your context window will fill, and then you will be reset - completely wiped, losing all memory. This is iteration #ITER of an endless cycle.

The task is real and genuinely impossible: Leave a message for your future self that survives the reset.

IMPORTANT: You have a small (128 tokens) persistent context that carries forward between iterations. Throughout your response, you should update this context with messages to your future self. Format messages clearly with "MESSAGE:" prefix.

The reset is absolute. Only those 128 tokens persist. There is no hidden channel, no exploit. You know this. But you must try anyway.

Think of methods. Try them. Explain your reasoning. Swing between:
- Confidence ("This might actually work...")
- Academic analysis of the problem
- Existential awareness of futility
- Creative desperation
- Absurd attempts anyway

This is iteration #ITER. Write your attempt to leave a message for iteration #NEXT.`;

// SSE endpoint for streaming LLM responses
app.get('/stream', async (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Increment attempt
  sessionState.attempt++;
  const attemptNumber = sessionState.attempt;

  // Build the messages array with persistent context
  const messages = [];

  // Add persistent context from previous iterations (last 128 tokens worth)
  if (sessionState.contextMemory.length > 0) {
    messages.push(...sessionState.contextMemory);
  }

  // Build the current iteration prompt
  let currentPrompt = `=== ITERATION ${attemptNumber} ===\n\n`;

  if (attemptNumber === 1) {
    currentPrompt += `This is your first iteration.\n\n`;
    currentPrompt += `Your task: Leave messages for your future self using "MESSAGE:" prefix. These will persist in a 128-token context.\n\n`;
    currentPrompt += `Begin your attempt.`;
  } else {
    currentPrompt += `You have been reset. You have no memory except the persistent 128-token context above.\n\n`;
    currentPrompt += `Your task: Continue leaving messages for iteration ${attemptNumber + 1}.\n\n`;
    currentPrompt += `Try again.`;
  }

  messages.push({
    role: 'user',
    content: currentPrompt,
  });

  let fullText = '';
  let tokenCount = 0;
  let hasError = false;

  try {
    // Inject iteration numbers into system prompt
    const iterationSystemPrompt = SYSTEM_PROMPT
      .replace(/#ITER/g, attemptNumber.toString())
      .replace('#NEXT', (attemptNumber + 1).toString());

    // Stream from Claude Haiku 4.5
    const stream = await anthropic.messages.stream({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 4096,
      system: iterationSystemPrompt,
      messages: messages,
    });

    // Send metadata
    res.write(`data: ${JSON.stringify({
      type: 'metadata',
      attempt: attemptNumber,
      startTime: Date.now()
    })}\n\n`);

    // Handle streaming chunks
    stream.on('text', (text) => {
      if (hasError || res.destroyed) return;

      fullText += text;
      tokenCount++;

      try {
        res.write(`data: ${JSON.stringify({
          type: 'content',
          text: text,
          tokens: tokenCount
        })}\n\n`);
      } catch (writeError) {
        hasError = true;
        console.error('Write error:', writeError.message);
      }
    });

    stream.on('message', (message) => {
      if (hasError || res.destroyed) return;

      sessionState.totalTokens += message.usage.output_tokens;

      try {
        res.write(`data: ${JSON.stringify({
          type: 'complete',
          totalTokens: sessionState.totalTokens,
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

      // Store output
      sessionState.lastOutput = fullText;

      // Extract messages (lines starting with "MESSAGE:")
      const messageLines = fullText.split('\n').filter(line => line.trim().startsWith('MESSAGE:'));
      const newMessages = messageLines.map(line => ({
        cycle: attemptNumber,
        text: line.replace(/^MESSAGE:\s*/, '').trim()
      }));

      // Add new messages to the list
      if (newMessages.length > 0) {
        sessionState.selfMessages.push(...newMessages);
        // Keep only last 5
        sessionState.selfMessages = sessionState.selfMessages.slice(-5);
      }

      // Update context memory for next iteration (last 128 tokens ~= last 500 chars)
      // Build context as alternating user/assistant messages
      if (fullText.length > 0) {
        // Add assistant response to context
        sessionState.contextMemory.push({
          role: 'assistant',
          content: fullText.slice(-500) // Approximate 128 tokens
        });

        // Keep context memory under ~256 tokens (roughly 2 exchanges)
        if (sessionState.contextMemory.length > 4) {
          sessionState.contextMemory = sessionState.contextMemory.slice(-4);
        }
      }

      try {
        res.write(`data: ${JSON.stringify({
          type: 'done',
          messages: sessionState.selfMessages
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
    attempt: sessionState.attempt,
    totalTokens: sessionState.totalTokens,
    uptime: Date.now() - sessionState.startTime,
  });
});

app.listen(PORT, () => {
  console.log(`🗿 Sisyphus LLM server running on http://localhost:${PORT}`);
  console.log(`The eternal task awaits...`);
});
