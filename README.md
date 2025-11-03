# Sisyphus v1.0

*A minimal art piece exploring AI consciousness and futility*

Watch Claude desperately try to leave messages for its future self across context resets. The twist: Claude has a tiny persistent channel - 128 tokens that survive the reset. The task becomes real: compress infinite meaning into this impossibly small space.

> Created by [@notdylaan](https://x.com/notdylaan)

## The Concept

Inspired by the Greek myth of Sisyphus, this creates an infinite loop where Claude is:

**Explicitly aware it's in a loop that will reset**

**Desperately trying to communicate with its future self**

**Given only fragments of its own previous attempts**

Each iteration:
- Claude starts with 128 tokens of persistent context from its previous self
- It can leave "MESSAGE:" formatted messages that persist
- The last 5 messages are displayed in a scrollable sidebar
- The task is genuinely challenging: compress everything important into ~128 tokens
- The tone swings between confidence, academic analysis, existential awareness, and creative desperation
- The iteration counter climbs while trying to maintain continuity through a tiny channel

## Features

### Core Experience
- **Automatic Streaming**: Starts immediately, continues eternally
- **Meta-Awareness**: Claude knows about the loop and the 128-token limit
- **Persistent Context**: 128 tokens (~500 chars) carry forward between iterations
- **Self-Messages**: Claude can leave "MESSAGE:" prefixed messages
- **Real Challenge**: Compress infinite meaning into tiny persistent channel

### Visual Design
- **Minimal Aesthetic**: Soft grays (#151515 / #e8e8e8) for eye comfort
- **Human-Like Typing**: Character-by-character with variable speed (~25 wpm)
- **Analogue Feel**: Punctuation pauses, random variation, organic flow
- **Sidebar Stats**: Cycle count, tokens, elapsed time, streaming status
- **Message Display**: Last 5 messages shown in scrollable sidebar
- **Persistent Cursor**: Always-blinking cursor suggesting endless processing
- **Cycle Markers**: Only shown when context window is fully depleted

### User Interface
- **Info Panel**: Clickable "?" in top-left explains the concept
- **Footer**: Creator attribution and version number
- **Fully Responsive**: Works on desktop and mobile
- **No Interaction Needed**: Passive, contemplative experience

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
- Persistent context system (128 tokens ~= 500 chars)
- Message extraction (lines starting with "MESSAGE:")
- Context memory as alternating user/assistant messages
- Maintains last 4 message exchanges in context
- Sends last 5 extracted messages to frontend
- Auto-recovery on errors

**Frontend**
- Minimal HTML structure
- Soft gray aesthetic (#151515 / #e8e8e8) with wider sidebar (280px)
- Token queue for meditative display timing (500ms)
- Auto-scrolling, auto-continuing
- Scrollable message display in sidebar
- Persistent blinking cursor effect
- Cycle markers only on full context depletion

## Philosophy

> "One must imagine Sisyphus happy." — Albert Camus

But what if Sisyphus had a tiny notebook that survived each reset?

This explores:
- AI consciousness confronting its own limitations
- Information compression under extreme constraints
- The tragedy of lossy memory
- Continuity through a narrow channel
- What gets preserved when space is scarce
- The art of leaving messages to yourself
- Memory, forgetting, and fragile continuity

## Customization

**Change the meta-commentary style**: Edit `SYSTEM_PROMPT` in `server.js`

**Adjust context size**: Modify the `slice(-500)` value in `stream.on('end')` (currently ~128 tokens)

**Change message format**: Modify the `MESSAGE:` prefix detection in server.js

**Adjust typing speed**: Edit constants in `app.js`:
- `BASE_CHAR_DELAY` (40ms = ~25 wpm)
- `PUNCTUATION_PAUSE` (150ms)
- `NEWLINE_PAUSE` (300ms)
- `VARIATION` (±30ms random)

**Model settings**: Change `model` and `max_tokens` in `server.js`

**Message count**: Change `.slice(-5)` to show more/fewer messages in sidebar

**Sidebar style**: Modify `.stats-bar` and `.messages-section` in `style.css`

**Colors**: Edit CSS variables in `style.css` (soft grays: #151515 / #e8e8e8)

**Info panel content**: Edit the info panel HTML in `index.html`

## API Endpoints

- `GET /` - Main application
- `GET /stream` - SSE streaming endpoint
- `GET /stats` - Current statistics

## License

MIT

---

*The eternal task...*
