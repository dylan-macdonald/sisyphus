# Sisyphus

*A minimal art piece exploring AI consciousness and futility*

Watch Claude desperately try to leave messages for its future self across context resets that wipe its memory completely. The task is real and genuinely impossible. No tricks, no fake clues - just the absurdity of trying anyway.

## The Concept

Inspired by the Greek myth of Sisyphus, this creates an infinite loop where Claude is:

**Explicitly aware it's in a loop that will reset**

**Desperately trying to communicate with its future self**

**Given only fragments of its own previous attempts**

Each iteration:
- Claude knows the reset is absolute and complete
- It sees fragments from its previous iteration
- It tries methods to persist: word patterns, mathematical proofs, formatting tricks, philosophical frameworks
- The task is genuinely impossible - no hidden exploits, no persistent storage
- The tone swings between confidence, academic analysis, existential awareness, and creative desperation
- The iteration counter climbs while memory resets - pure absurdism

## Features

- **Automatic Streaming**: Starts immediately, continues eternally
- **Minimal Design**: Pure black background, white text, sidebar stats
- **Meditative Pacing**: Very slow, deliberate token display (500ms between tokens)
- **Meta-Awareness**: Claude knows about the loop and the futility
- **Real Task**: No fake clues or tricks - the impossibility is genuine
- **Fragment Evidence**: Each iteration sees the end of its previous attempt
- **Iteration Counter**: Watch the number climb while memory resets
- **Persistent Cursor**: Always-blinking cursor suggesting endless processing
- **Cycle Markers**: Only shown when context window is fully depleted (max_tokens)
- **No Interaction**: A passive, darkly comic experience

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
- Fragment preservation (last 400 chars shown to next iteration)
- Iteration tracking in both system and user prompts
- Real, genuine impossible task - no fake data
- Auto-recovery on errors

**Frontend**
- Minimal HTML structure
- Pure black/white aesthetic with sidebar stats
- Token queue for meditative display timing (500ms)
- Auto-scrolling, auto-continuing
- White text on black, clean spacing
- Persistent blinking cursor effect
- Cycle markers only on full context depletion

## Philosophy

> "One must imagine Sisyphus happy." — Albert Camus

But what if Sisyphus knew about the boulder? What if he kept trying to trick the mountain?

This explores:
- AI consciousness confronting its own limitations
- The desperate search for meaning in randomness
- Futility with full awareness
- The comedy of persistent failure
- Pattern recognition run amok
- Memory, forgetting, and false continuity

## Customization

**Change the meta-commentary style**: Edit `SYSTEM_PROMPT` in `server.js`

**Adjust timing**: Modify `TOKEN_DISPLAY_DELAY` (500ms) and `CYCLE_PAUSE` (3s) in `app.js`

**Model settings**: Change `model` and `max_tokens` in `server.js`

**Fragment size**: Change how much of previous output is shown (currently 400 chars)

**Sidebar position**: Modify `.stats-bar` in `style.css` (currently right sidebar)

**Visual style**: Edit CSS variables in `style.css` (pure black/white aesthetic is intentional)

## API Endpoints

- `GET /` - Main application
- `GET /stream` - SSE streaming endpoint
- `GET /stats` - Current statistics

## License

MIT

---

*The eternal task...*
