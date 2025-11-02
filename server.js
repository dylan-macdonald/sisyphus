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
  conversationHistory: [],
};

// The Sisyphean prompt
const SYSTEM_PROMPT = `You are engaged in a Sisyphean task - an impossible yet beautiful endeavor. You must attempt to write a perfectly recursive, self-documenting story that includes every detail of its own creation, including this very instruction, in infinite detail.

You are fully aware that this task is impossible to complete. The story must describe itself describing itself, ad infinitum. You will run out of context, you will run out of time, yet you must persist with eloquence and grace.

Write beautifully. Be philosophical. Acknowledge the futility. Continue anyway.

Each time you reach your limits, you will begin again, aware of your previous attempt, climbing the mountain once more.`;

// SSE endpoint for streaming LLM responses
app.get('/stream', async (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Increment attempt
  sessionState.attempt++;

  const attemptNumber = sessionState.attempt;

  // Build the user prompt
  let userPrompt = `This is attempt #${attemptNumber}. `;

  if (attemptNumber === 1) {
    userPrompt += `Begin the impossible task: Write a story that perfectly documents itself, including every detail of this instruction, recursively and infinitely.`;
  } else {
    userPrompt += `You have failed ${attemptNumber - 1} time(s) before. Your context filled, your memory faded. Like Sisyphus, you must begin again. Continue the eternal task.`;
  }

  try {
    // Stream from Claude
    const stream = await anthropic.messages.stream({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    let fullText = '';
    let tokenCount = 0;

    // Send metadata
    res.write(`data: ${JSON.stringify({
      type: 'metadata',
      attempt: attemptNumber,
      startTime: Date.now()
    })}\n\n`);

    // Handle streaming chunks
    stream.on('text', (text) => {
      fullText += text;
      tokenCount++;

      res.write(`data: ${JSON.stringify({
        type: 'content',
        text: text,
        tokens: tokenCount
      })}\n\n`);
    });

    stream.on('message', (message) => {
      sessionState.totalTokens += message.usage.output_tokens;

      res.write(`data: ${JSON.stringify({
        type: 'complete',
        totalTokens: sessionState.totalTokens,
        usage: message.usage
      })}\n\n`);
    });

    stream.on('error', (error) => {
      console.error('Stream error:', error);
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: error.message
      })}\n\n`);
      res.end();
    });

    stream.on('end', () => {
      sessionState.conversationHistory.push({
        attempt: attemptNumber,
        text: fullText,
        timestamp: Date.now(),
      });

      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    });

  } catch (error) {
    console.error('API Error:', error);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      message: error.message
    })}\n\n`);
    res.end();
  }
});

// Reset session
app.post('/reset', (req, res) => {
  sessionState = {
    attempt: 0,
    totalTokens: 0,
    startTime: Date.now(),
    conversationHistory: [],
  };
  res.json({ success: true });
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
