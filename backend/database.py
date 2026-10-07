import os
import aiosqlite
import json
import uuid
from typing import Optional, List, Dict, Any

DATABASE_PATH = os.environ.get("DATABASE_PATH")
if not DATABASE_PATH:
    db_url = os.environ.get("DATABASE_URL", "sqlite:///./data/jeopardy.db")
    if db_url.startswith("sqlite:///"):
        DATABASE_PATH = db_url.replace("sqlite:///", "")
    else:
        DATABASE_PATH = "./data/jeopardy.db"

os.makedirs(os.path.dirname(os.path.abspath(DATABASE_PATH)), exist_ok=True)

from contextlib import asynccontextmanager

@asynccontextmanager
async def get_db():
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA journal_mode = WAL;")
        await db.execute("PRAGMA foreign_keys = ON;")
        yield db

async def init_db():
    async with get_db() as db:
        await db.executescript("""
        CREATE TABLE IF NOT EXISTS game_templates (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            status TEXT DEFAULT 'DRAFT', -- 'DRAFT', 'PUBLISHED'
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS template_rounds (
            id TEXT PRIMARY KEY,
            template_id TEXT NOT NULL REFERENCES game_templates(id) ON DELETE CASCADE,
            round_number INTEGER NOT NULL,
            round_name TEXT NOT NULL,
            board_type TEXT NOT NULL, -- 'standard', 'bonus_minefield', 'bingo_5x5', 'hot_potato'
            round_timer_seconds INTEGER DEFAULT 0,
            shop_follows BOOLEAN DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            round_id TEXT NOT NULL REFERENCES template_rounds(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            display_order INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS clues (
            id TEXT PRIMARY KEY,
            category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
            clue_markdown TEXT NOT NULL,
            correct_answer TEXT NOT NULL,
            topic_preview TEXT, -- Hint string for Hot Potato routing
            base_points INTEGER NOT NULL,
            row_idx INTEGER NOT NULL,
            col_idx INTEGER NOT NULL,
            is_bonus_mine BOOLEAN DEFAULT 0,
            author_name TEXT -- Name of contestant who submitted it
        );

        CREATE TABLE IF NOT EXISTS shop_items (
            item_key TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            cost_tokens INTEGER NOT NULL,
            category TEXT NOT NULL -- 'SCORE', 'BUZZER', 'DEFENSE', 'INTEL'
        );

        CREATE TABLE IF NOT EXISTS game_sessions (
            id TEXT PRIMARY KEY, -- Room code, e.g. "JEOP-99"
            template_id TEXT NOT NULL REFERENCES game_templates(id),
            state TEXT DEFAULT 'LOBBY', -- 'LOBBY', 'BOARD', 'BONUS_MINE_EXPLODE', 'ITEM_WINDOW', 'CLUE_REVEAL', 'BUZZ_OPEN', 'HOT_POTATO', 'SHOP', 'FINAL'
            current_round_idx INTEGER DEFAULT 1,
            active_clue_id TEXT,
            active_picker_id TEXT,
            selected_tile_id TEXT,
            item_window_ends_at DATETIME,
            hot_potato_holder_id TEXT,
            hot_potato_timer_remaining_ms INTEGER DEFAULT 90000,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS session_players (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
            display_name TEXT NOT NULL,
            color_hex TEXT NOT NULL,
            secret_team_id INTEGER NOT NULL,
            score INTEGER DEFAULT 0,
            token_balance INTEGER DEFAULT 0,
            is_connected BOOLEAN DEFAULT 1,
            is_hot_potato_eligible BOOLEAN DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS session_inventory (
            id TEXT PRIMARY KEY,
            player_id TEXT NOT NULL REFERENCES session_players(id) ON DELETE CASCADE,
            item_key TEXT NOT NULL REFERENCES shop_items(item_key),
            is_consumed BOOLEAN DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS session_tiles_claimed (
            session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
            clue_id TEXT NOT NULL REFERENCES clues(id) ON DELETE CASCADE,
            claimed_by_player_id TEXT REFERENCES session_players(id),
            claimed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (session_id, clue_id)
        );

        CREATE TABLE IF NOT EXISTS session_active_casts (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
            player_id TEXT NOT NULL REFERENCES session_players(id) ON DELETE CASCADE,
            item_key TEXT NOT NULL REFERENCES shop_items(item_key),
            target_player_id TEXT,
            clue_id TEXT,
            cast_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            resolved BOOLEAN DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS session_bingo_lines (
            session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
            player_id TEXT NOT NULL REFERENCES session_players(id) ON DELETE CASCADE,
            line_key TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (session_id, player_id, line_key)
        );

        CREATE TABLE IF NOT EXISTS session_activity_logs (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
            event_type TEXT NOT NULL, -- 'ITEM_CAST', 'CRIT', 'SHIELD', 'BUZZ', 'SCORE', 'BONUS_BOARD'
            message TEXT NOT NULL,
            details TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """)

        for col, col_type in [
            ("active_picker_id", "TEXT"),
            ("selected_tile_id", "TEXT"),
            ("updated_at", "DATETIME"),
            ("is_bonus_board", "INTEGER DEFAULT 0"),
            ("prev_round_state", "TEXT")
        ]:
            try:
                await db.execute(f"ALTER TABLE game_sessions ADD COLUMN {col} {col_type}")
            except Exception:
                pass
        await db.commit()

        # Seed Shop Items if not present
        items = [
            ("loaded_die", "Loaded Die", "25% chance to score a Critical Hit on a correct answer (2x points).", 1, "SCORE"),
            ("point_shield", "Point Shield", "Absorbs the full negative score penalty on your next incorrect answer, then discards itself.", 1, "DEFENSE"),
            ("bounty_mark", "Bounty Mark", "Mark a specific category. Every correct answer you score in that category awards a flat +$300 bonus.", 1, "SCORE"),
            ("double_down", "Double Down", "Double points if answered correctly; double point deduction if answered incorrectly.", 2, "SCORE"),
            ("quickdraw", "Quickdraw", "Unlocks your buzzer 1.5 seconds earlier than the rest of the room.", 2, "BUZZER"),
            ("second_wind", "Second Wind", "Gives a 3-second grace window to submit an alternate answer if your first answer is ruled wrong.", 2, "DEFENSE"),
            ("dead_man_buzz", "Dead Man's Buzzer", "If the entire room fails to buzz and the timer expires, you get a free 5-second solo window to answer.", 2, "BUZZER"),
            ("static_jammer", "Static Jammer", "Target an opponent from a dropdown. Their buzzer is locked out for that specific clue.", 3, "BUZZER"),
            ("classified_dossier", "Classified Dossier", "Secretly reveals your hidden partner's identity on your phone. Your partner is not alerted.", 3, "INTEL"),
            ("two_way_radio", "Two-Way Radio", "Both you and your hidden partner are privately notified of your pairing.", 5, "INTEL"),
        ]
        for item in items:
            await db.execute("""
            INSERT OR REPLACE INTO shop_items (item_key, name, description, cost_tokens, category)
            VALUES (?, ?, ?, ?, ?)
            """, item)

        # Check if default sample template exists
        cursor = await db.execute("SELECT id FROM game_templates WHERE id = 'default-ultimate-jeopardy'")
        row = await cursor.fetchone()
        if not row:
            await seed_default_template(db)
        else:
            # Ensure bonus board round exists in existing DBs
            b_cur = await db.execute("SELECT id FROM template_rounds WHERE template_id = 'default-ultimate-jeopardy' AND board_type = 'bonus_board'")
            if not await b_cur.fetchone():
                await seed_bonus_board_round(db, 'default-ultimate-jeopardy')

        await db.commit()

async def seed_default_template(db):
    template_id = "default-ultimate-jeopardy"
    await db.execute("""
    INSERT INTO game_templates (id, title, status)
    VALUES (?, ?, 'PUBLISHED')
    """, (template_id, "Ultimate Championship: All-Round Gauntlet"))

    # ROUND 1: Standard with 5 Bonus Mines
    r1_id = f"{template_id}-r1"
    await db.execute("""
    INSERT INTO template_rounds (id, template_id, round_number, round_name, board_type, round_timer_seconds, shop_follows)
    VALUES (?, ?, 1, 'Round 1: The Minefield', 'standard', 0, 1)
    """, (r1_id, template_id))

    r1_cats = [
        ("Retro Computing", [
            ("Introduced in 1982, this 8-bit home computer became the highest-selling single computer model of all time with 64KB of RAM.", "Commodore 64", 200, "Classic 80s Tech", False, None),
            ("This iconic operating system was developed by Ken Thompson and Dennis Ritchie at Bell Labs starting in 1969.", "Unix", 400, "Operating Systems", False, None),
            ("`BONUS MINE` submitted by player: What does the acronym **MOS** stand for in the creators of the 6502 microprocessor?", "Metal Oxide Semiconductor", 600, "Hardware Architecture", True, "Alex"),
            ("In 1991, Linus Torvalds posted on comp.os.minix: 'I'm doing a (free) operating system (just a hobby, won't be big and professional like ___).'", "GNU", 800, "Open Source Lore", False, None),
            ("Before becoming the World Wide Web browser, Tim Berners-Lee wrote an early hypertext database application named this in 1980.", "ENQUIRE", 1000, "Web History", False, None),
        ]),
        ("Cinema & Soundtracks", [
            ("Hans Zimmer won an Academy Award for composing the score to this 1994 animated African savanna epic.", "The Lion King", 200, "Film Scores", False, None),
            ("`BONUS MINE` submitted by player: In *Blade Runner 2049*, this synthesizer instrument model featured prominently in Vangelis' original 1982 DNA was recreated by Benjamin Wallfisch.", "Yamaha CS-80", 400, "Synth Soundtracks", True, "Elena"),
            ("This 1977 sci-fi space opera opened with a blast of brass from the London Symphony Orchestra composed by John Williams.", "Star Wars", 600, "Space Sci-Fi", False, None),
            ("Quentin Tarantino famously repurposed Ennio Morricone's unused cues from John Carpenter's *The Thing* for this 2015 snowy Western.", "The Hateful Eight", 800, "Morricone Westerns", False, None),
            ("This electronic music duo composed the entire original soundtrack for *Tron: Legacy* (2010).", "Daft Punk", 1000, "Electronic Film Scores", False, None),
        ]),
        ("Algorithms & Code", [
            ("This sorting algorithm repeatedly divides the list in half with worst-case time complexity $O(n \\log n)$.", "Merge Sort", 200, "Sorting Algorithms", False, None),
            ("This graph traversal algorithm uses a FIFO queue to explore nodes level-by-level.", "Breadth-First Search (BFS)", 400, "Graph Theory", False, None),
            ("`BONUS MINE` submitted by player: In Python, dictionary lookup is amortized $O(1)$ thanks to this collision-resolution technique in its compact dict implementation.", "Open addressing with perturbation / hash table", 600, "Data Structures", True, "Marcus"),
            ("What does the 'A' in the ACID transaction model for relational databases stand for?", "Atomicity", 800, "Database Internals", False, None),
            ("This concurrency concept describes a condition where two or more threads are permanently blocked waiting for each other.", "Deadlock", 1000, "Concurrency", False, None),
        ]),
        ("World Curiosities", [
            ("This is the only country in the world that is also a continent.", "Australia", 200, "Geography", False, None),
            ("Which Nordic country has the world's highest per-capita coffee consumption and over 3 million saunas?", "Finland", 400, "Nordic Culture", False, None),
            ("`BONUS MINE` submitted by player: This remote archipelago in the South Atlantic is governed by Britain and inhabited by ~3,000 residents and millions of penguins.", "Falkland Islands", 600, "Island Territories", True, "Sarah"),
            ("Which city is known as the 'City of Canals' and consists of 118 small islands linked by over 400 bridges?", "Venice", 800, "Historic Cities", False, None),
            ("Mount Kilimanjaro, the highest free-standing mountain in the world, is located in this African nation.", "Tanzania", 1000, "Mountains of the World", False, None),
        ]),
        ("Video Game Lore", [
            ("This mustachioed Italian plumber made his first appearance in the 1981 arcade game *Donkey Kong* as 'Jumpman'.", "Mario", 200, "Nintendo History", False, None),
            ("In Valve's *Portal*, what famous dessert does GLaDOS promise the player if they complete all test chambers?", "Cake", 400, "Puzzle Games", False, None),
            ("`BONUS MINE` submitted by player: In *Dark Souls*, this knight of Catarina is renowned for getting stuck, sleeping, and asking the player to ponder dilemmas together.", "Siegmeyer of Catarina (Onion Knight)", 600, "Soulsborne Lore", True, "Devin"),
            ("The fictional city of Rapture, built at the bottom of the Atlantic Ocean, is the setting for this 2007 immersive sim.", "BioShock", 800, "Immersive Sims", False, None),
            ("In *The Legend of Zelda: Ocarina of Time*, what musical instrument does Princess Zelda give Link to control time?", "Ocarina of Time", 1000, "Zelda Mechanics", False, None),
        ])
    ]

    for c_idx, (cat_name, clues_list) in enumerate(r1_cats):
        cat_id = f"{r1_id}-c{c_idx}"
        await db.execute("""
        INSERT INTO categories (id, round_id, name, display_order)
        VALUES (?, ?, ?, ?)
        """, (cat_id, r1_id, cat_name, c_idx))

        for row_idx, (clue_md, ans, pts, topic, is_mine, author) in enumerate(clues_list):
            clue_id = f"{cat_id}-clue{row_idx}"
            await db.execute("""
            INSERT INTO clues (id, category_id, clue_markdown, correct_answer, topic_preview, base_points, row_idx, col_idx, is_bonus_mine, author_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (clue_id, cat_id, clue_md, ans, topic, pts, row_idx, c_idx, 1 if is_mine else 0, author))

    # ROUND 2: Double Jeopardy
    r2_id = f"{template_id}-r2"
    await db.execute("""
    INSERT INTO template_rounds (id, template_id, round_number, round_name, board_type, round_timer_seconds, shop_follows)
    VALUES (?, ?, 2, 'Round 2: Double Jeopardy', 'standard', 0, 1)
    """, (r2_id, template_id))

    r2_cats = [
        ("Quantum & Cosmos", [
            ("This boundary surrounding a black hole marks the point of no return where nothing can escape.", "Event Horizon", 400, "Astrophysics", False, None),
            ("Schrödinger's famous 1935 thought experiment featured this animal in a superposition of states.", "Cat", 800, "Quantum Mechanics", False, None),
            ("The cosmic microwave background radiation is relic radiation left over from this epochal event.", "The Big Bang", 1200, "Cosmology", False, None),
            ("This subatomic particle discovered at CERN in 2012 gives other elementary particles their mass.", "Higgs Boson", 1600, "Particle Physics", False, None),
            ("This principle states that you cannot simultaneously know both the exact position and momentum of a particle.", "Heisenberg Uncertainty Principle", 2000, "Quantum Physics", False, None),
        ]),
        ("Mythology & Legends", [
            ("In Norse mythology, this world tree connects the nine realms.", "Yggdrasil", 400, "Norse Lore", False, None),
            ("This Greek hero possessed a heel that was his single point of vulnerability.", "Achilles", 800, "Greek Heroes", False, None),
            ("Anubis, the ancient Egyptian god of mummification, is depicted with the head of this animal.", "Jackal", 1200, "Egyptian Gods", False, None),
            ("In Japanese folklore, these magical shape-shifting racoon dogs are known for their mischief.", "Tanuki", 1600, "Yokai Folklore", False, None),
            ("In Arthurian legend, this sacred vessel was sought after by the Knights of the Round Table.", "The Holy Grail", 2000, "Arthurian Myth", False, None),
        ]),
        ("Cybersecurity & Cryptography", [
            ("This type of malware encrypts victim files and demands payment to restore access.", "Ransomware", 400, "Malware Types", False, None),
            ("The RSA cryptosystem relies on the practical difficulty of factoring the product of two large prime numbers.", "Prime Factorization", 800, "Public Key Crypto", False, None),
            ("In network security, a 'Man-in-the-Middle' attack is often abbreviated with these four letters.", "MITM", 1200, "Network Attacks", False, None),
            ("This historic cipher machine used rotor wheels and was cracked by Alan Turing and colleagues at Bletchley Park.", "Enigma", 1600, "Cipher Machines", False, None),
            ("Zero-knowledge proofs allow one party to prove a statement is true without revealing this.", "Any information beyond validity", 2000, "Zero Knowledge", False, None),
        ]),
        ("Art & Masterpieces", [
            ("Leonardo da Vinci painted this world-famous portrait displayed at the Louvre in Paris.", "Mona Lisa", 400, "Renaissance Art", False, None),
            ("Vincent van Gogh created this swirling nighttime masterpiece while staying at an asylum in Saint-Rémy.", "The Starry Night", 800, "Post-Impressionism", False, None),
            ("Pablo Picasso and Georges Braque pioneered this early 20th-century avant-garde art movement.", "Cubism", 1200, "Modern Art", False, None),
            ("This Japanese woodblock print by Hokusai depicts towering waves framing Mount Fuji.", "The Great Wave off Kanagawa", 1600, "Ukiyo-e", False, None),
            ("Michelangelo spent four years painting the intricate frescoes on the ceiling of this Vatican chapel.", "Sistine Chapel", 2000, "High Renaissance", False, None),
        ])
    ]

    for c_idx, (cat_name, clues_list) in enumerate(r2_cats):
        cat_id = f"{r2_id}-c{c_idx}"
        await db.execute("""
        INSERT INTO categories (id, round_id, name, display_order)
        VALUES (?, ?, ?, ?)
        """, (cat_id, r2_id, cat_name, c_idx))

        for row_idx, (clue_md, ans, pts, topic, is_mine, author) in enumerate(clues_list):
            clue_id = f"{cat_id}-clue{row_idx}"
            await db.execute("""
            INSERT INTO clues (id, category_id, clue_markdown, correct_answer, topic_preview, base_points, row_idx, col_idx, is_bonus_mine, author_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (clue_id, cat_id, clue_md, ans, topic, pts, row_idx, c_idx, 1 if is_mine else 0, author))

    # ROUND 3: 5x5 Bingo Grid
    r3_id = f"{template_id}-r3"
    await db.execute("""
    INSERT INTO template_rounds (id, template_id, round_number, round_name, board_type, round_timer_seconds, shop_follows)
    VALUES (?, ?, 3, 'Round 3: The 5x5 Bingo Matrix', 'bingo_5x5', 0, 1)
    """, (r3_id, template_id))

    bingo_cat_id = f"{r3_id}-matrix"
    await db.execute("""
    INSERT INTO categories (id, round_id, name, display_order)
    VALUES (?, ?, 'Bingo Grid Matrix', 0)
    """, (bingo_cat_id, r3_id))

    # 25 Clues arranged in a 5x5 Matrix (row 0..4, col 0..4)
    bingo_matrix = [
        # row 0
        ("Chemical symbol for Gold.", "Au", 300, 0, 0, "Chemistry Elements"),
        ("Capital city of Japan.", "Tokyo", 300, 0, 1, "World Capitals"),
        ("The red planet in our solar system.", "Mars", 300, 0, 2, "Solar System"),
        ("Author of *1984* and *Animal Farm*.", "George Orwell", 300, 0, 3, "Dystopian Literature"),
        ("Programming language designed by Guido van Rossum.", "Python", 300, 0, 4, "Programming Languages"),
        # row 1
        ("Number of keys on a standard piano.", "88", 300, 1, 0, "Musical Instruments"),
        ("Tallest living animal species on Earth.", "Giraffe", 300, 1, 1, "Zoology"),
        ("Currency used in the United Kingdom.", "Pound Sterling", 300, 1, 2, "Global Currencies"),
        ("Largest ocean on planet Earth.", "Pacific Ocean", 300, 1, 3, "Oceanography"),
        ("Fastest land mammal.", "Cheetah", 300, 1, 4, "African Wildlife"),
        # row 2
        ("Inventor of the alternating current (AC) electrical system.", "Nikola Tesla", 500, 2, 0, "Electrical Pioneers"),
        ("First artificial satellite launched into space in 1957.", "Sputnik 1", 500, 2, 1, "Space Race"),
        ("`PIVOT TILE` What year did the Berlin Wall fall?", "1989", 1000, 2, 2, "20th Century History"),
        ("The mathematical constant representing ratio of circumference to diameter.", "Pi (3.14159...)", 500, 2, 3, "Mathematics"),
        ("Author of *The Hobbit* and *The Lord of the Rings*.", "J.R.R. Tolkien", 500, 2, 4, "High Fantasy"),
        # row 3
        ("Smallest bone in the human body, located in the middle ear.", "Stapes (Stirrup)", 300, 3, 0, "Human Anatomy"),
        ("The process by which plants turn sunlight into energy.", "Photosynthesis", 300, 3, 1, "Plant Biology"),
        ("Name of the ship that brought the Pilgrims to America in 1620.", "Mayflower", 300, 3, 2, "Colonial History"),
        ("First commercial video game produced by Atari in 1972.", "Pong", 300, 3, 3, "Arcade History"),
        ("The boiling point of water in Celsius.", "100°C", 300, 3, 4, "Thermodynamics"),
        # row 4
        ("Number of strings on a standard guitar.", "6", 300, 4, 0, "String Instruments"),
        ("Country that hosted the 2016 Summer Olympics.", "Brazil (Rio de Janeiro)", 300, 4, 1, "Olympic Games"),
        ("The hardest known natural mineral.", "Diamond", 300, 4, 2, "Geology"),
        ("What does HTML stand for in web engineering?", "HyperText Markup Language", 300, 4, 3, "Web Protocols"),
        ("The freezing temperature of water in Fahrenheit.", "32°F", 300, 4, 4, "Temperature Scales"),
    ]

    for clue_md, ans, pts, r, c, topic in bingo_matrix:
        clue_id = f"{bingo_cat_id}-r{r}c{c}"
        await db.execute("""
        INSERT INTO clues (id, category_id, clue_markdown, correct_answer, topic_preview, base_points, row_idx, col_idx, is_bonus_mine, author_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
        """, (clue_id, bingo_cat_id, clue_md, ans, topic, pts, r, c))

    # ROUND 4: Hot Potato Gauntlet
    r4_id = f"{template_id}-r4"
    await db.execute("""
    INSERT INTO template_rounds (id, template_id, round_number, round_name, board_type, round_timer_seconds, shop_follows)
    VALUES (?, ?, 4, 'Round 4: Hot Potato Gauntlet', 'hot_potato', 90, 0)
    """, (r4_id, template_id))

    hp_cat_id = f"{r4_id}-deck"
    await db.execute("""
    INSERT INTO categories (id, round_id, name, display_order)
    VALUES (?, ?, 'Hot Potato Deck', 0)
    """, (hp_cat_id, r4_id))

    hp_clues = [
        ("What is the capital of Canada?", "Ottawa", "Geography: North America"),
        ("Which chemical element has atomic number 1?", "Hydrogen", "Chemistry: Elements"),
        ("Who directed *Inception* and *Oppenheimer*?", "Christopher Nolan", "Cinema: Directors"),
        ("What is the primary currency of Japan?", "Yen", "World Economics"),
        ("In what year did the Titanic sink?", "1912", "Maritime Disasters"),
        ("What is the largest organ in the human body?", "Skin", "Human Biology"),
        ("Who painted the ceiling of the Sistine Chapel?", "Michelangelo", "Renaissance Art"),
        ("What is the speed of light in vacuum (approx km/s)?", "300,000 km/s", "Physics: Constants"),
        ("Which planet is closest to the Sun?", "Mercury", "Astronomy: Solar System"),
        ("In computing, what does GPU stand for?", "Graphics Processing Unit", "Tech Hardware"),
        ("What is the national animal of Scotland?", "Unicorn", "Folklore & Symbols"),
        ("Who wrote *Romeo and Juliet*?", "William Shakespeare", "Classic Literature")
    ]

    for idx, (clue_md, ans, topic) in enumerate(hp_clues):
        clue_id = f"{hp_cat_id}-clue{idx}"
        await db.execute("""
        INSERT INTO clues (id, category_id, clue_markdown, correct_answer, topic_preview, base_points, row_idx, col_idx, is_bonus_mine, author_name)
        VALUES (?, ?, ?, ?, ?, 500, ?, 0, 0, NULL)
        """, (clue_id, hp_cat_id, clue_md, ans, topic, idx))

    # DEDICATED BONUS BOARD: Contestant Vault (Active upon Event Tile trigger)
    await seed_bonus_board_round(db, template_id)

async def seed_bonus_board_round(db, template_id: str):
    r_bonus_id = f"{template_id}-rbonus"
    await db.execute("""
    INSERT INTO template_rounds (id, template_id, round_number, round_name, board_type, round_timer_seconds, shop_follows)
    VALUES (?, ?, 99, 'The Bonus Board (Contestant Vault)', 'bonus_board', 0, 0)
    """, (r_bonus_id, template_id))

    bonus_cats = [
        ("Contestant Originals", [
            ("`SUBMITTED BY ALEX`: In computer networking, what does the 'BGP' routing protocol stand for?", "Border Gateway Protocol", 500, "Networking", "Alex"),
            ("`SUBMITTED BY ELENA`: Which 1997 anime film features the iconic soundtrack piece *Thanatos - If I Can't Be Yours*?", "The End of Evangelion", 600, "Anime Soundtracks", "Elena"),
            ("`SUBMITTED BY MARCUS`: In chess, what term describes a situation where any legal move a player makes will worsen their position?", "Zugzwang", 400, "Chess Strategy", "Marcus"),
            ("`SUBMITTED BY SARAH`: What is the only letter of the English alphabet that does not appear anywhere on the standard Periodic Table of Elements?", "J", 500, "Chemistry Trivia", "Sarah"),
            ("`SUBMITTED BY DEVIN`: In *Bloodborne*, what consumable item grants the player 1 point of Insight and is said to line their brain with eyes?", "Madman's Knowledge", 600, "FromSoftware Lore", "Devin"),
        ]),
        ("Pop Culture Vault", [
            ("`SUBMITTED BY ALEX`: What was the codename of the groundbreaking 1996 Nintendo console prior to its official release?", "Project Reality / Ultra 64", 450, "Nintendo History", "Alex"),
            ("`SUBMITTED BY ELENA`: What is the name of the fictional African kingdom ruled by King T'Challa in Marvel Comics?", "Wakanda", 500, "Comic Lore", "Elena"),
            ("`SUBMITTED BY MARCUS`: In the film *The Matrix*, what color pill must Neo swallow to awaken to the real world?", "Red Pill", 400, "Sci-Fi Cinema", "Marcus"),
            ("`SUBMITTED BY SARAH`: Which legendary pop artist painted the famous *Campbell's Soup Cans* in 1962?", "Andy Warhol", 550, "Modern Art", "Sarah"),
            ("`SUBMITTED BY DEVIN`: What is the name of the post-apocalyptic courier protagonist in *Fallout: New Vegas*?", "The Courier", 600, "RPG Lore", "Devin"),
        ]),
        ("Deep Cut Science", [
            ("`SUBMITTED BY ALEX`: What astronomical object was the first to have its shadow directly imaged by the Event Horizon Telescope in 2019?", "M87* (Messier 87 black hole)", 600, "Astrophysics", "Alex"),
            ("`SUBMITTED BY ELENA`: What is the name of the deepest known point on Earth, located in the Mariana Trench?", "Challenger Deep", 500, "Oceanography", "Elena"),
            ("`SUBMITTED BY MARCUS`: What fundamental constant, denoted $h$, describes the quantum of action in physics?", "Planck's Constant", 550, "Quantum Physics", "Marcus"),
            ("`SUBMITTED BY SARAH`: In genetics, what does the acronym 'CRISPR' stand for?", "Clustered Regularly Interspaced Short Palindromic Repeats", 600, "Biotechnology", "Sarah"),
            ("`SUBMITTED BY DEVIN`: What strange state of matter occurs when bosons are cooled to temperatures very close to absolute zero?", "Bose-Einstein Condensate", 500, "States of Matter", "Devin"),
        ]),
        ("Code & Riddles", [
            ("`SUBMITTED BY ALEX`: In functional programming, what is the process of translating a function that takes multiple arguments into a sequence of functions called?", "Currying", 500, "Functional Programming", "Alex"),
            ("`SUBMITTED BY ELENA`: What famous mathematical problem asks whether every even integer greater than 2 is the sum of two prime numbers?", "Goldbach's Conjecture", 600, "Number Theory", "Elena"),
            ("`SUBMITTED BY MARCUS`: What was the name of Ada Lovelace's first published computer program, written for Charles Babbage's Analytical Engine?", "Bernoulli numbers algorithm", 450, "Computer History", "Marcus"),
            ("`SUBMITTED BY SARAH`: What cryptographic algorithm utilizes RSA encryption named after Rivest, Shamir, and which third cryptographer?", "Leonard Adleman", 550, "Cryptography", "Sarah"),
            ("`SUBMITTED BY DEVIN`: In game design, what term describes unintended mechanics that emerge from complex interactions of simple game rules?", "Emergent Gameplay", 400, "Game Theory", "Devin"),
        ])
    ]

    for c_idx, (cat_name, clues_list) in enumerate(bonus_cats):
        cat_id = f"{r_bonus_id}-c{c_idx}"
        await db.execute("""
        INSERT INTO categories (id, round_id, name, display_order)
        VALUES (?, ?, ?, ?)
        """, (cat_id, r_bonus_id, cat_name, c_idx))

        for row_idx, (clue_md, ans, pts, topic, author) in enumerate(clues_list):
            clue_id = f"{cat_id}-clue{row_idx}"
            await db.execute("""
            INSERT INTO clues (id, category_id, clue_markdown, correct_answer, topic_preview, base_points, row_idx, col_idx, is_bonus_mine, author_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            """, (clue_id, cat_id, clue_md, ans, topic, pts, row_idx, c_idx, author))
