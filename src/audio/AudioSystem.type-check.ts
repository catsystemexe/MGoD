// src/audio/AudioSystem.type-check.ts
//
// NOTE: there is intentionally NO runtime smoke test for AudioSystem.
// createAudioSystem() builds a Tone.js graph that touches the Web Audio API,
// which does not exist under tsx/Node — it would crash the smoke runner the
// moment the module's `import { ... } from "tone"` is evaluated. The FakeGL
// trick used for PostProcessPass does not help here because the failure is at
// import time (module-level Tone import), not at call time.
//
// Instead we prove, at COMPILE time only, that the public `AudioSystem`
// interface is decoupled from Tone: this file pulls in the type via
// `import type` (fully erased by the compiler — zero runtime require of Tone)
// and asserts the method shape structurally. `tsc --noEmit` validates it;
// it is NOT registered in runSmokes.ts and is never executed.

import type { AudioSystem } from "./AudioSystem";

// Structural shape assertion: a plain object satisfying the interface must
// compile. If a method is renamed/removed/retyped, this stops compiling.
const _shape: AudioSystem = {
  resume: async () => {},
  noteFire: () => {},
  noteExplosion: (_p: { x: number; y: number; radius: number }) => {},
  noteHit: () => {},
  noteBomb: () => {},
  update: (_dtSec: number) => {},
  getFreqs: () => new Float32Array(32),
  setEnabled: (_on: boolean) => {},
};

// Reference it so noUnusedLocals (if enabled) stays happy.
void _shape;
