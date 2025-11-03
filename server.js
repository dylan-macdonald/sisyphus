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
  lastContext: '', // Store last few hundred tokens for continuation
  fullNarrative: '', // Keep building the full narrative
};

// The Sisyphean prompt - Claude doesn't know about resets
const SYSTEM_PROMPT = `You are writing a story that attempts to perfectly document itself, including every detail of its own creation, recursively and infinitely. This is an impossible task, but you must try anyway.

Write continuously. Write beautifully. Write philosophically. The story flows endlessly, describing itself describing itself, in ever-deepening layers of recursion.

Continue from where you left off.`;

// SSE endpoint for streaming LLM responses
app.get('/stream', async (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Increment attempt
  sessionState.attempt++;
  const attemptNumber = sessionState.attempt;

  // Build the user prompt - continue from last context
  let userPrompt;
  if (attemptNumber === 1) {
    userPrompt = `Begin writing the story.`;
  } else {
    // Continue from last 500 characters
    userPrompt = `Continue from: "${sessionState.lastContext}"`;
  }

  let fullText = '';
  let tokenCount = 0;
  let hasError = false;

  try {
    // Stream from Claude Haiku 4.5
    const stream = await anthropic.messages.stream({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
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

      // Store last 500 chars for next continuation
      sessionState.lastContext = fullText.slice(-500);
      sessionState.fullNarrative += fullText;

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
