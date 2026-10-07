// ============================================================================
// ULTIMATE JEOPARDY: CENTRALIZED ASSET & MEDIA MANIFEST
// ============================================================================
// Single source of truth for all backgrounds, item icons, animations, and SFX.
// Drop in custom graphic URLs, WebP files, or MP3s here to re-skin the game.
// ============================================================================

export interface AssetEntry {
  key: string;
  type: 'image' | 'icon_svg' | 'animation_class' | 'audio_cue';
  description: string;
  urlOrSvg: string;
}

export const ASSET_MANIFEST = {
  // -------------------------------------------------------------
  // 1. BOARD BACKGROUNDS (Single 3D Marquee Bubble Theme for all screens)
  // -------------------------------------------------------------
  bg_main_board: {
    key: 'bg_main_board',
    type: 'image',
    description: 'Main board background (3D Marquee Casino Clouds)',
    urlOrSvg: '/assets/backgrounds/bg-board.png'
  },
  bg_bingo_board: {
    key: 'bg_bingo_board',
    type: 'image',
    description: 'Round 3 5x5 Bingo board background',
    urlOrSvg: '/assets/backgrounds/bg-board.png'
  },
  bg_hot_potato: {
    key: 'bg_hot_potato',
    type: 'image',
    description: 'Round 4 Hot Potato background',
    urlOrSvg: '/assets/backgrounds/bg-board.png'
  },

  // -------------------------------------------------------------
  // 2. SHOP ITEM ICONS (User Generated 3D Candy/Clay Icons)
  // -------------------------------------------------------------
  item_loaded_die: {
    key: 'item_loaded_die',
    type: 'image',
    description: 'Shop card: Loaded Die',
    urlOrSvg: '/assets/items/item_loaded_die.png'
  },
  item_point_shield: {
    key: 'item_point_shield',
    type: 'image',
    description: 'Shop card: Point Shield',
    urlOrSvg: '/assets/items/item_point_shield.png'
  },
  item_bounty_mark: {
    key: 'item_bounty_mark',
    type: 'image',
    description: 'Shop card: Bounty Mark',
    urlOrSvg: '/assets/items/item_bounty_mark.png'
  },
  item_double_down: {
    key: 'item_double_down',
    type: 'image',
    description: 'Shop card: Double Down',
    urlOrSvg: '/assets/items/item_double_down.png'
  },
  item_quickdraw: {
    key: 'item_quickdraw',
    type: 'image',
    description: 'Shop card: Quickdraw',
    urlOrSvg: '/assets/items/item_quickdraw.png'
  },
  item_second_wind: {
    key: 'item_second_wind',
    type: 'image',
    description: 'Shop card: Second Wind',
    urlOrSvg: '/assets/items/item_second_wind.png'
  },
  item_dead_man_buzz: {
    key: 'item_dead_man_buzz',
    type: 'image',
    description: 'Shop card: Dead Man\'s Buzzer',
    urlOrSvg: '/assets/items/item_dead_man_buzz.png'
  },
  item_static_jammer: {
    key: 'item_static_jammer',
    type: 'image',
    description: 'Shop card: Static Jammer',
    urlOrSvg: '/assets/items/item_static_jammer.png'
  },
  item_classified_dossier: {
    key: 'item_classified_dossier',
    type: 'image',
    description: 'Shop card: Classified Dossier',
    urlOrSvg: '/assets/items/item_classified_dossier.png'
  },
  item_two_way_radio: {
    key: 'item_two_way_radio',
    type: 'image',
    description: 'Shop card: Two-Way Radio',
    urlOrSvg: '/assets/items/item_two_way_radio.png'
  },

  // -------------------------------------------------------------
  // 3. ANIMATION DEFINITIONS
  // -------------------------------------------------------------
  anim_jammed_glitch: {
    key: 'anim_jammed_glitch',
    type: 'animation_class',
    description: 'Overlay played on a jammed player\'s screen',
    urlOrSvg: 'animate-shake'
  },
  anim_shield_break: {
    key: 'anim_shield_break',
    type: 'animation_class',
    description: 'Overlay when Point Shield absorbs a penalty',
    urlOrSvg: 'shield-shatter-pulse'
  },
  anim_crit_spark: {
    key: 'anim_crit_spark',
    type: 'animation_class',
    description: 'Golden particle burst on 2x critical hits',
    urlOrSvg: 'crit-sparks'
  },
  anim_bonus_reveal: {
    key: 'anim_bonus_reveal',
    type: 'animation_class',
    description: 'Transition when a hidden mine is struck',
    urlOrSvg: 'bonus-mine-explosion'
  },

  // -------------------------------------------------------------
  // 4. AUDIO SFX CUES (Synthesizer + File Fallback)
  // -------------------------------------------------------------
  sfx_buzz_press: {
    key: 'sfx_buzz_press',
    type: 'audio_cue',
    description: 'Audio cue when any player wins the buzz',
    urlOrSvg: 'synth:buzz_chime'
  },
  sfx_correct: {
    key: 'sfx_correct',
    type: 'audio_cue',
    description: 'Audio cue on host "Correct" judgment',
    urlOrSvg: 'synth:correct_chord'
  },
  sfx_wrong: {
    key: 'sfx_wrong',
    type: 'audio_cue',
    description: 'Audio cue on host "Wrong" judgment',
    urlOrSvg: 'synth:wrong_buzz'
  },
  sfx_ticking_bomb: {
    key: 'sfx_ticking_bomb',
    type: 'audio_cue',
    description: 'Ticking audio loop in Round 4 Hot Potato',
    urlOrSvg: 'synth:clock_tick'
  },
  sfx_bomb_explode: {
    key: 'sfx_bomb_explode',
    type: 'audio_cue',
    description: 'Hot potato timer expiry',
    urlOrSvg: 'synth:heavy_explosion'
  }
};

// ----------------------------------------------------------------------------
// Built-in Web Audio Sound Synthesizer + MP3 File Player
// ----------------------------------------------------------------------------
class SoundFXManager {
  private ctx: AudioContext | null = null;

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
  }

  play(cueKey: string) {
    try {
      const entry = (ASSET_MANIFEST as any)[cueKey];
      if (entry && entry.urlOrSvg && !entry.urlOrSvg.startsWith('synth:')) {
        const audio = new Audio(entry.urlOrSvg);
        audio.play().catch(() => {});
        return;
      }

      this.initCtx();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      const now = this.ctx.currentTime;

      if (cueKey === 'sfx_buzz_press') {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1760, now + 0.15);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (cueKey === 'sfx_correct') {
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
          if (!this.ctx) return;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          gain.gain.setValueAtTime(0.3, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.3);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.3);
        });
      } else if (cueKey === 'sfx_wrong') {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.setValueAtTime(110, now + 0.15);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
      } else if (cueKey === 'sfx_ticking_bomb') {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(1200, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (cueKey === 'sfx_bomb_explode') {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(90, now);
        osc.frequency.exponentialRampToValueAtTime(25, now + 1.2);
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 1.2);
      }
    } catch {
      // Audio playback fails silently if browser policy blocks autoplay before interaction
    }
  }
}

export const soundFX = new SoundFXManager();
