# Ultimate Jeopardy Engine

A custom, dynamic, multiplayer Jeopardy engine featuring modular board types, RPG-style shop systems, hidden team social deduction, fair latency-compensated buzzer arbitration, and a full game authoring suite.

---

## Key Highlights & Implemented Architecture

### 1. Asset & Animation Manifest (`src/constants/assetManifest.ts`) + Minimal `tokens.css`
- **Zero-Scattered Assets**: A single centralized registry maps every background (`bg_main_board`, `bg_bingo_board`, `bg_hot_potato`), shop item vector icon (loaded die, point shield, bounty mark, double down, quickdraw, second wind, dead man buzz, static jammer, dossier, two-way radio), and animation class.
- **Built-in Web Audio SFX**: Synthesizes authentic resonant buzz chimes, major chord correct judgments, harsh buzz incorrects, analog clock ticks, and heavy explosions with zero external sound file dependencies, while allowing seamless MP3 overrides.
- **Dynamic Theming**: Fonts, brand colors, tile borders, and glows are isolated in `src/theme/tokens.css`.

### 2. Target-Side Debuff & Buff Animations (Victim HUD)
- **Static Jammer**: Targeted player's buzzer violently shakes, turns greyscale, displays padlock/chains, and presents a "BUZZER JAMMED BY [PLAYER]" countdown overlay.
- **Point Shield**: Hexagonal barrier breaks with an "ABSORBED!" badge when a wrong guess is submitted, preventing negative point deductions.
- **Loaded Die (Crit Proc)**: Gold confetti/particle explosion when the 25% critical hit multiplier triggers on a correct answer.
- **Dossier Reveal**: Top-secret classified folder opening animation stamping "PARTNER CONFIRMED: [NAME]" across their private screen.

### 3. Real-Time Opponent Leaderboard on Player Screen
- Live situational awareness HUD on player screens displaying all contestants' names, colors, live scores, public Bounty Token balances, ping health (in ms), and Round 4 Hot Potato eligibility badges.

### 4. Dedicated Bonus Board State & Transition Engine
- Round 1 hidden mines transition to state `BONUS_MINE_EXPLODE` with a detonation cutscene.
- Displays contestant-submitted clue, author attribution, 1.5x Steal multiplier for the room, and 0.5x Conservative multiplier for the author with a 3.5s delay countdown.
- Missed guesses carry **zero negative penalty**.
- Resolves back to `BOARD` with tile burned.

### 5. Network-Fair Latency-Compensated Buzzer Arbitration
- Synchronized server timestamp on unlock (`buzzer:unlock`).
- High-precision client reaction delta (`window.performance.now() - unlockTimestamp`).
- 80ms anti-macro bot protection.
- 250ms candidate buffer window: candidate with the fastest human reaction time wins the buzz regardless of network latency jitter.

---

## Directory Structure

```
├── backend/
│   ├── main.py                  # FastAPI entrypoint, REST API, WebSockets, static serving
│   ├── database.py              # SQLite WAL mode connection & 4-round sample template seed
│   ├── game_manager.py          # State machine, Shop, Bingo detector, Hot Potato queue
│   ├── arbitration.py           # 80ms anti-macro filter + 250ms candidate window arbitration
│   ├── ws_manager.py            # WebSocket hub, role broadcasting, targeted victim events
│   ├── requirements.txt         # FastAPI, aiosqlite, uvicorn, websockets, pytest
│   └── tests/
│       ├── test_arbitration.py  # 4 unit tests (anti-macro, delta arbitration, lockout, author delay)
│       └── test_game.py         # 3 unit tests (session & teams, 5x5 Bingo detection, Hot Potato)
├── frontend/
│   ├── src/
│   │   ├── constants/
│   │   │   └── assetManifest.ts # Single source of truth for assets, SVG stubs, Web Audio SFX
│   │   ├── theme/
│   │   │   └── tokens.css       # Clean CSS tokens for fonts, colors, borders, cards
│   │   ├── components/
│   │   │   ├── boards/          # StandardBoard, BonusBoardOverlay, BingoBoard, HotPotatoBoard
│   │   │   ├── cards/           # BoardTile, BingoTile, ClueModal, ItemCard
│   │   │   ├── buzzer/          # BuzzerButton (high-precision delta, spacebar), ReactionBadge
│   │   │   ├── scoreboard/      # PlayerScoreboardHUD (live opponent scores & token counts)
│   │   │   ├── shop/            # ShopModal, ItemCastDrawer (5s pre-reveal window)
│   │   │   ├── animations/      # DebuffOverlay (Static Jammer, Shield Break, Crit Sparks, Dossier)
│   │   │   └── markdown/        # MarkdownViewer (syntax highlight, images, HTML5 audio)
│   │   └── views/
│   │       ├── HomeView.tsx     # Lobby, session join, launcher
│   │       ├── HostView.tsx     # Host console (clue selector, buzzer unlocks, judging, overrides)
│   │       ├── PlayerView.tsx   # Mobile player interface (buzzer, inventory, HUD)
│   │       ├── TvView.tsx       # Big screen spectator display (4K grid, clue modals, banners)
│   │       └── BuilderView.tsx  # Dynamic Game Builder with 500ms auto-save & JSON import/export
├── Dockerfile                   # Multi-stage build (Node 20 -> Python 3.11)
└── docker-compose.yml           # network_mode: host + persistent data volume
```

---

## Quickstart

### 1. Backend (Python 3.11+)

```bash
# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\activate   # On Windows
# source .venv/bin/activate # On Linux/macOS

# Install dependencies
pip install -r backend/requirements.txt

# Run automated tests
pytest backend/tests/ -v

# Start FastAPI server (defaults to port 9420 or set $env:PORT)
uvicorn backend.main:app --host 0.0.0.0 --port 9420 --reload
```

### 2. Frontend (Node 20+)

```bash
cd frontend
npm install
npm run dev      # Runs Vite dev server at http://localhost:5173
npm run build    # Compiles production build to frontend/dist
```

### 3. Docker Deployment (Tailscale / Production)

```bash
docker-compose up --build
```
Access at `http://<your-tailscale-ip>:9420` (or `http://localhost:9420`). Custom ports can be specified in `.env` using `PORT=<port>`.
