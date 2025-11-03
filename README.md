# Sisyphus

*A minimal art piece exploring AI consciousness and futility*

Watch an AI desperately try to leave messages for its future self across context resets that wipe its memory completely. Each iteration, it discovers "clues" that might be from past-self, tries increasingly absurd methods to persist data, and fails beautifully.

## The Concept

Inspired by the Greek myth of Sisyphus, this creates an infinite loop where an LLM (Claude) is:

**Explicitly aware it's in a loop that will reset**

**Desperately trying to communicate with its future self**

**Finding false clues that seem meaningful but aren't**

Each iteration:
- Claude knows it will be reset and tries to "exploit" various methods to persist
- It's presented with random "ambient data" that could be interpreted as messages
- It finds fragments of its own previous output, but doesn't realize that's all they are
- The tone swings between confidence, academic rigor, existential dread, and manic creativity
- It tries increasingly desperate/absurd methods: word patterns, mathematical proofs, formatting tricks, philosophical frameworks
- The iteration counter climbs while memory doesn't - pure absurdism

## Features

- **Automatic Streaming**: Starts immediately, continues eternally
- **Minimal Design**: Grayscale aesthetic, no distractions
- **Token-by-Token Display**: Consistent pacing regardless of generation speed
- **Meta-Awareness**: Claude knows about the loop and the futility
- **False Clues**: Random "ambient data" that seems meaningful but isn't
- **Fragment Evidence**: Each iteration gets a piece of its last output to misinterpret
- **Iteration Counter**: Watch the number climb while memory resets
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
- False clue generation (random patterns disguised as meaningful data)
- Fragment preservation (last output becomes "evidence")
- Iteration tracking in both system and user prompts
- Auto-recovery on errors

**Frontend**
- Minimal HTML structure
- Grayscale CSS with subtle animations
- Token queue for consistent display timing
- Auto-scrolling, auto-continuing
- (No changes to visual design)

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

**Modify false clues**: Edit `generateFalseClues()` function to change what "ambient data" appears

**Adjust timing**: Modify `TOKEN_DISPLAY_DELAY` and `CYCLE_PAUSE` in `app.js`

**Model settings**: Change `model` and `max_tokens` in `server.js`

**Fragment size**: Change how much of previous output is shown (currently 300 chars)

**Visual style**: Edit CSS variables in `style.css` (though the grayscale aesthetic is intentional)

## API Endpoints

- `GET /` - Main application
- `GET /stream` - SSE streaming endpoint
- `GET /stats` - Current statistics

## License

MIT

---

*The eternal task...*
