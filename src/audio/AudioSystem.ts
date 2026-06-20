// src/audio/AudioSystem.ts
//
// Audio Reality Layer — v1, synth-only (no asset files).
//
// This is an OUTPUT concern (like Graphics/renderer), NOT a deterministic sim
// system, so it lives in src/audio/ — deliberately OUTSIDE src/game/systems/
// so the Node smoke runner never transitively imports Tone.js (which touches
// the Web Audio API and would crash under tsx/Node).
//
// Feeding model: callback intent queue, NOT Phase.Audio events[]. The EventBus
// is single-owner + per-phase-drain, and no EventType is owned by Phase.Audio,
// so an audio system in that phase would receive an empty events[]. Instead the
// note*() methods are invoked from the same createGame hooks that already drive
// the VFX ring buffers (onExplosion / onHitSpark / onSpawnProjectile / bomb).
//
// All note*() are no-ops until resume() runs (first user gesture -> Tone.start()
// + graph build), so callbacks firing before audio is armed are harmless.

import {
  start,
  now,
  getDestination,
  Gain,
  Analyser,
  Synth,
  PolySynth,
  Distortion,
} from "tone";

// The public shape is intentionally Tone-free so it can be referenced from
// Node-safe places via `import type` (see AudioSystem.type-check.ts).
export interface AudioSystem {
  /** First user gesture: Tone.start() + build the synth graph. Idempotent. */
  resume(): Promise<void>;

  // ---- intent inputs (called from createGame hooks, NOT from events[]) ----
  /** Short high-pitched "pew" on primary fire. */
  noteFire(): void;
  /** Low "boom" on explosion. */
  noteExplosion(p: { x: number; y: number; radius: number }): void;
  /** Mid "click" on projectile hit. */
  noteHit(): void;
  /** Sweeping "whoosh" on bomb consume. */
  noteBomb(): void;

  /** Per-frame pump (envelope/analyser advance). Tone self-schedules, so v1 no-op. */
  update(dtSec: number): void;

  /** FFT magnitude bins (length 32) for visuals; zeros until ready. */
  getFreqs(): Float32Array;

  /** Mute toggle (M hotkey), parallel to the __CM_FX__ FX toggle. */
  setEnabled(on: boolean): void;
}

const FFT_SIZE = 32;

class ToneAudioSystem implements AudioSystem {
  private ready = false;
  private starting = false;

  // graph nodes (created in resume())
  private master: Gain | null = null;
  private analyser: Analyser | null = null;
  private fireSynth: PolySynth | null = null;
  private hitSynth: PolySynth | null = null;
  private explosionSynth: Synth | null = null;
  private bombSynth: Synth | null = null;

  // reused output buffer so getFreqs() does not allocate per call
  private readonly freqBuf = new Float32Array(FFT_SIZE);

  async resume(): Promise<void> {
    if (this.ready || this.starting) return;
    this.starting = true;
    try {
      await start(); // resumes the AudioContext (must follow a user gesture)

      // master -> analyser -> destination. Analyser is a pass-through tap, so
      // audio still reaches the speakers while getFreqs() can read the FFT.
      this.master = new Gain(0.5);
      this.analyser = new Analyser("fft", FFT_SIZE);
      this.master.connect(this.analyser);
      this.analyser.connect(getDestination());

      // FIRE — bright triangle blip; PolySynth so rapid fire overlaps cleanly.
      // Routed directly to destination (bypasses analyser) so shooting doesn't
      // spike the FFT that drives atmospheric FX.
      this.fireSynth = new PolySynth(Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.03 },
        volume: -10,
      }).toDestination();

      // HIT — short square "tick"; also poly for rapid hits.
      this.hitSynth = new PolySynth(Synth, {
        oscillator: { type: "square" },
        envelope: { attack: 0.001, decay: 0.025, sustain: 0, release: 0.01 },
        volume: -14,
      }).connect(this.master);

      // EXPLOSION — low sine boom through distortion for grit. Mono is fine.
      const dist = new Distortion(0.4).connect(this.master);
      this.explosionSynth = new Synth({
        oscillator: { type: "sine" },
        envelope: { attack: 0.005, decay: 0.18, sustain: 0, release: 0.05 },
        volume: -4,
      }).connect(dist);

      // BOMB — mono synth we pitch-slide for a downward "whoosh".
      this.bombSynth = new Synth({
        oscillator: { type: "sawtooth" },
        envelope: { attack: 0.01, decay: 0.28, sustain: 0, release: 0.05 },
        volume: -8,
      }).connect(this.master);

      this.ready = true;
    } finally {
      this.starting = false;
    }
  }

  noteFire(): void {
    if (!this.ready || !this.fireSynth) return;
    // ~880Hz (A5), ~50ms
    this.fireSynth.triggerAttackRelease("A5", 0.05);
  }

  noteExplosion(_p: { x: number; y: number; radius: number }): void {
    if (!this.ready || !this.explosionSynth) return;
    // ~80Hz boom, ~200ms
    this.explosionSynth.triggerAttackRelease(80, 0.2);
  }

  noteHit(): void {
    if (!this.ready || !this.hitSynth) return;
    // ~440Hz (A4) click, ~30ms
    this.hitSynth.triggerAttackRelease("A4", 0.03);
  }

  noteBomb(): void {
    if (!this.ready || !this.bombSynth) return;
    // Downward pitch sweep 600Hz -> 60Hz over ~300ms = "whoosh".
    const t = now();
    const s = this.bombSynth;
    s.triggerAttack(600, t);
    s.frequency.rampTo(60, 0.3, t);
    s.triggerRelease(t + 0.3);
  }

  update(_dtSec: number): void {
    // Tone schedules its own envelopes on the audio clock; nothing to advance.
  }

  getFreqs(): Float32Array {
    if (!this.ready || !this.analyser) {
      // SILENCE sentinel: -140 dB (not 0!). 0 dB is MAX loudness, which would
      // make audio-reactive consumers blast at full when audio is inactive.
      // Normalization (db+100)/100 clamps -140 -> 0 = silence.
      this.freqBuf.fill(-140);
      return this.freqBuf;
    }
    const v = this.analyser.getValue() as Float32Array;
    this.freqBuf.set(v.subarray(0, FFT_SIZE));
    return this.freqBuf;
  }

  setEnabled(on: boolean): void {
    getDestination().mute = !on;
  }
}

export function createAudioSystem(): AudioSystem {
  return new ToneAudioSystem();
}
