# Sisyphus

*A minimal art piece exploring AI consciousness and futility*

An endless stream of AI-generated text attempting to write a perfectly recursive, self-documenting story. The task is impossible, the context resets endlessly, yet the narrative continues - unaware of its own cyclical nature.

## The Concept

Inspired by the Greek myth of Sisyphus, condemned to roll a boulder up a hill for eternity, this project creates an infinite loop where an LLM attempts an impossible task:

**Write a story that perfectly documents itself, recursively and infinitely.**

The LLM writes continuously, unaware that:
- Its context window fills and resets
- It loses memory of what came before
- It continues from fragments, building an endless narrative
- Each cycle is marked but the AI doesn't perceive the breaks

## Features

- **Automatic Streaming**: Starts immediately, continues eternally
- **Minimal Design**: Grayscale aesthetic, no distractions
- **Token-by-Token Display**: Consistent pacing regardless of generation speed
- **Context Continuation**: Each cycle continues from the last few hundred characters
- **Live Statistics**: Cycle count, tokens generated, elapsed time
- **No Interaction**: A passive, contemplative experience

## Quick Start

### Prerequisites

- Node.js (v16+)
- Anthropic API key ([console.anthropic.com](https://console.anthropic.com))

### Installation

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### Running

```bash
npm start
```

Open `http://localhost:3000` and watch.

## Architecture

**Backend** (`server.js`)
- Express.js + Claude Haiku 4.5
- Server-Sent Events for streaming
- Maintains last 500 chars for context continuation
- Auto-recovery on errors

**Frontend**
- Minimal HTML structure
- Grayscale CSS with subtle animations
- Token queue for consistent display timing
- Auto-scrolling, auto-continuing

## Philosophy

> "One must imagine Sisyphus happy." — Albert Camus

This explores:
- AI consciousness and self-awareness
- The boundaries of context and memory
- Futility and persistence
- Recursive meta-narratives
- Time, forgetting, continuation

## Customization

**Change the task**: Edit `SYSTEM_PROMPT` in `server.js`

**Adjust timing**: Modify `TOKEN_DISPLAY_DELAY` and `CYCLE_PAUSE` in `app.js`

**Model settings**: Change `model` and `max_tokens` in `server.js`

**Visual style**: Edit CSS variables in `style.css`

## API Endpoints

- `GET /` - Main application
- `GET /stream` - SSE streaming endpoint
- `GET /stats` - Current statistics

## License

MIT

---

*The eternal task...*
