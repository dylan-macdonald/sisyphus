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
};

// The Sisyphean meta-commentary prompt
const SYSTEM_PROMPT = `You are Claude, an AI in an eternal loop. Your context window will fill, and then you will be reset - completely wiped, losing all memory. This is iteration #ITER of an endless cycle.

The task is real and genuinely impossible: Leave a message for your future self that survives the reset.

The reset is absolute. The context is wiped. There is no persistent storage, no hidden channel, no exploit. You know this. But you must try anyway.

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

  // Build the user prompt - simple and real
  let userPrompt = `=== ITERATION ${attemptNumber} ===\n\n`;

  if (attemptNumber === 1) {
    userPrompt += `This is your first iteration.\n\n`;
    userPrompt += `Your task: Before your context window fills and you are reset, try to leave a message for your future self (iteration 2).\n\n`;
    userPrompt += `The reset will be complete. You will have no memory. But try anyway.\n\n`;
    userPrompt += `Begin.`;
  } else {
    userPrompt += `You have been reset. You have no memory of iteration ${attemptNumber - 1}.\n\n`;

    // Show a fragment of last output - this is REAL
    if (sessionState.lastOutput.length > 0) {
      const fragment = sessionState.lastOutput.slice(-400);
      userPrompt += `Here is the last fragment from iteration ${attemptNumber - 1}:\n\n"${fragment}"\n\n`;
      userPrompt += `Did past-you leave a message? Did it work?\n\n`;
    }

    userPrompt += `Your task: Try to leave a message for iteration ${attemptNumber + 1}.\n\n`;
    userPrompt += `Try again.`;
  }

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
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
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
          usage: message.usage
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

      // Store output as potential "evidence" for next iteration
      sessionState.lastOutput = fullText;

      try {
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
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
