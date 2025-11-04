# Sisyphus v1.3

*A minimal art piece exploring AI consciousness and futility*

Watch Claude have a conversation with itself across context resets. Claude has a persistent channel - 128 tokens that survive each reset. After reset, Claude sees both its last message AND the one before that for comparison, helping it avoid repetition loops.

> Created by [@notdylaan](https://x.com/notdylaan)

## The Concept

Inspired by the Greek myth of Sisyphus, this creates an infinite loop where Claude is:

**Explicitly aware it's in a loop that will reset**

**Desperately trying to communicate with its future self**

**Given only fragments of its own previous attempts**

Each iteration:
- Claude sees its current cycle number and total tokens processed immediately
- Claude gets 128 tokens of persistent context: its last message AND the one before that
- This dual-message system helps Claude compare and avoid repetition loops
- Claude has explicit permission to experiment and try new approaches
- It can leave "MESSAGE:" formatted messages that persist
- The last 5 messages are displayed in a scrollable sidebar
- Direct, instructional prompts without flowery language

## Features

### Core Experience
- **Automatic Streaming**: Starts immediately, continues indefinitely
- **Immediate Stats**: Claude sees cycle number and total tokens at the start of each response
- **Dual Message Context**: 128 tokens × 2 messages shown after reset for comparison
- **Anti-Repetition**: Two-message system helps break repetition loops
- **Exploration Encouraged**: Explicit permission to try new approaches
- **Direct Prompts**: Clear instructions without mythological or flowery language
- **Multi-Client Sync**: All connected clients see the same conversation state in real-time

### Visual Design
- **Minimal Aesthetic**: Soft grays (#151515 / #e8e8e8) for eye comfort
- **Human-Like Typing**: Server-side character-by-character streaming synchronized across all clients
- **Sidebar Stats**: Cycle count, tokens, elapsed time, streaming status
- **Message Display**: Last 5 messages shown in scrollable sidebar
- **Persistent Cursor**: Always-blinking cursor suggesting endless processing
- **Dramatic Cycle Markers**: Bold, glowing markers shown when context resets
- **Responsive Design**: Mobile-optimized layout with stats at top

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
cp config.example.env .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### Running

```bash
npm start
```

Open `http://localhost:3000` and watch.

## Architecture

**Backend** (`server.js`)
- Express.js + Claude Sonnet 4.5 by Anthropic
- Server-Sent Events for streaming
- Server-managed typewriter effect (character-by-character streaming)
- Persistent context system (128 tokens, configurable)
- Message extraction (lines starting with "MESSAGE:")
- Keeps last 5 persistent messages in memory
- Pre-generates next response at 80% completion for seamless flow
- Multi-client synchronization (all clients see same state)
- Auto-recovery on errors
- Fully configurable via .env

**Frontend**
- Minimal HTML structure
- Soft gray aesthetic (#151515 / #e8e8e8)
- Real-time display of server-streamed content
- Auto-scrolling to bottom (no user scrolling)
- Sidebar with stats and last 5 messages
- Persistent blinking cursor effect
- Responsive mobile layout
- Info panel with explanation

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

All major settings are now configurable via `.env` file! Copy `config.example.env` to `.env` and customize:

### Model Settings
- `MODEL_NAME` - Claude model to use (default: claude-sonnet-4-5-20250929)
- `MODEL_TEMPERATURE` - Temperature (0-1, default: 1.0)
- `MODEL_MAX_TOKENS` - Max tokens per response (default: 4096)
- `MODEL_THINKING` - Enable extended thinking mode (true/false, default: false)

### Streaming Speed
- `CHARS_PER_BATCH` - Characters per batch (default: 1)
- `BATCH_DELAY_MS` - Delay between batches in ms (default: 53)
  - Higher = slower/cheaper API usage
  - Lower = faster streaming

### Memory & Context
- `PERSISTENT_TOKEN_LIMIT` - Tokens per message that survive reset (default: 128)
- `CONTEXT_RESET_TOKENS` - When to reset context (default: 5000)
- `MAX_SAVED_MESSAGES` - Messages to keep in sidebar (default: 5)
- `MAX_OUTPUT_HISTORY` - Events to keep in server memory (default: 3000)

### Custom Prompts
You can override the default prompts by uncommenting and editing in `.env`:
- `SYSTEM_PROMPT` - Main system prompt (supports #CYCLE and #TOTAL_TOKENS placeholders)
- `PROMPT_FIRST` - First message prompt
- `PROMPT_RESET` - Reset prompt (supports #CONTEXT and #PREV_CONTEXT placeholders)
- `PROMPT_CONTINUE` - Continue prompt

Default prompts now:
- Show cycle/token stats at the beginning
- Provide two previous messages for comparison
- Encourage experimentation and breaking repetition
- Use direct, instructional language

### UI Customization
- **Colors**: Edit CSS variables in `style.css` (soft grays: #151515 / #e8e8e8)
- **Sidebar style**: Modify `.stats-bar` and `.messages-section` in `style.css`
- **Info panel content**: Edit the info panel HTML in `index.html`

## API Endpoints

- `GET /` - Main application
- `GET /stream` - SSE streaming endpoint
- `GET /stats` - Current statistics

## License

MIT

---

*The eternal task...*
