// Web Audio API 16-Bit FM & PCM Chiptune Synthesizer Engine

import { loadAudioTrackBlobs, saveAudioTrackBlob, removeAudioTrackBlob } from './audioStore';

/**
 * Backoff between manifest-fetch retries, in ms. A flaky first request used
 * to leave the game silently stuck on the synth fallback for the rest of the
 * session — nothing else ever re-triggers the fetch, so one dropped request
 * on a bad connection was permanent until a full page reload.
 */
const MANIFEST_RETRY_DELAYS_MS = [500, 1500, 4000];

export type BgmTrack =
  | 'INTRO'
  | 'CHAR_SELECT'
  | 'STAGE1'
  | 'STAGE1_BOSS'
  | 'NEON_BEAT'
  | 'SUBURBAN_GRAY'
  | 'SACRED_METAL';

class SoundEngine {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;
  public musicEnabled: boolean = true;
  public volume: number = 0.5;

  private bgmInterval: number | null = null;
  private bgmStep: number = 0;
  private currentTrack: string | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private isAutoSuspended: boolean = false;

  /**
   * Autoplay policy: until the first user gesture, the browser refuses both
   * `HTMLAudioElement.play()` and the AudioContext. Without tracking this, the
   * track requested on page load failed silently and was never retried.
   */
  private hasUserGesture: boolean = false;
  private unlockArmed: boolean = false;
  private unlockListeners: Set<() => void> = new Set();

  constructor() {
    this.restorePersistedTracks();
    if (typeof window !== 'undefined') {
      this.armUnlock();
      window.addEventListener('pagehide', () => this.suspendAudio());
      window.addEventListener('beforeunload', () => this.stopAll());

      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => this.handleVisibilityOrFocusChange());
      }
    }
  }

  /** Has the browser released audio playback yet? */
  public isAudioUnlocked(): boolean {
    return this.hasUserGesture;
  }

  /**
   * Notifies changes to the lock state. Built for `useSyncExternalStore`: the
   * UI has to react to state that lives outside the React cycle.
   * Returns the unsubscribe function.
   */
  public subscribeUnlock(listener: () => void): () => void {
    this.unlockListeners.add(listener);
    return () => {
      this.unlockListeners.delete(listener);
    };
  }

  private setUserGesture(value: boolean) {
    if (this.hasUserGesture === value) return;
    this.hasUserGesture = value;
    this.unlockListeners.forEach((listener) => listener());
  }

  /**
   * Waits for the first user gesture to unlock audio and resume the pending
   * track. Idempotent: re-arming after a block does not duplicate listeners.
   */
  private armUnlock() {
    if (typeof window === 'undefined' || this.unlockArmed) return;
    this.unlockArmed = true;

    const events = ['pointerdown', 'keydown', 'touchstart'] as const;

    const unlock = () => {
      events.forEach((evt) => window.removeEventListener(evt, unlock, true));
      this.unlockArmed = false;
      this.initCtx();

      const pending = this.lastRequestedTrack as BgmTrack | null;

      // Must precede playback: `playBgm` bails out early while the gesture
      // flag is unset.
      this.setUserGesture(true);

      if (pending && this.musicEnabled) {
        this.playBgm(pending, true);
      }
    };

    // Capture phase: runs before the application's own handlers, so the gesture
    // that changes screens already finds audio unlocked.
    events.forEach((evt) => window.addEventListener(evt, unlock, true));
  }

  /**
   * Fetches and validates the audio manifest, retrying on failure with
   * backoff (`MANIFEST_RETRY_DELAYS_MS`). Returns null once retries are
   * exhausted — the caller falls back to the synth, same as before.
   */
  private async fetchAudioManifest(attempt: number = 0): Promise<{ files: string[] } | null> {
    try {
      const res = await fetch('/audio/manifest.json');
      if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
      const data = await res.json();
      if (!data || !Array.isArray(data.files)) throw new Error('malformed manifest');
      return data;
    } catch {
      if (attempt >= MANIFEST_RETRY_DELAYS_MS.length) return null;
      await new Promise((resolve) => setTimeout(resolve, MANIFEST_RETRY_DELAYS_MS[attempt]));
      return this.fetchAudioManifest(attempt + 1);
    }
  }

  private async restorePersistedTracks() {
    try {
      // 1. Tracks placed in public/audio/, published through the static manifest
      if (typeof window !== 'undefined') {
        this.fetchAudioManifest().then((data) => {
          if (data && data.files.length > 0) {
            const files: string[] = data.files;

            // Helper to find file by keyword
            const findFile = (keywords: string[]) =>
              files.find((f) => keywords.some((kw) => f.toLowerCase().includes(kw)));

            const introFile = findFile(['intro', 'title', 'main', 'theme', '01']) || files[0];
            const selectFile = findFile(['select', 'char', 'roster', 'menu', '02']) || files[1] || files[0];
            const stage1File = findFile(['stage1', 'stage_1', 'street', 'city', 'brawl', '03']) || files[2] || files[0];
            const bossFile = findFile(['boss', 'mech', 'apex', 'fight', '04']) || files[3] || files[0];

            if (introFile && !this.customTrackNames['INTRO']) {
              this.syncTrackAliases('INTRO', `/audio/${introFile}`, introFile);
            }
            if (selectFile && !this.customTrackNames['CHAR_SELECT']) {
              this.syncTrackAliases('CHAR_SELECT', `/audio/${selectFile}`, selectFile);
            }
            if (stage1File && !this.customTrackNames['STAGE1']) {
              this.syncTrackAliases('STAGE1', `/audio/${stage1File}`, stage1File);
            }
            if (bossFile && !this.customTrackNames['STAGE1_BOSS']) {
              this.syncTrackAliases('STAGE1_BOSS', `/audio/${bossFile}`, bossFile);
            }

            this.refreshActiveTrack();
          }
        });
      }

      // 2. Check IndexedDB in browser for files uploaded via Jukebox Modal
      const persisted = await loadAudioTrackBlobs();
      let restoredCount = 0;
      Object.entries(persisted).forEach(([trackId, data]) => {
        this.syncTrackAliases(trackId, data.url, data.name);
        restoredCount++;
      });

      if (restoredCount > 0) {
        this.refreshActiveTrack();
      }
    } catch {
      // ignore
    }
  }

  /**
   * Switches to the real file if the active track has just gained one.
   *
   * Restoration is asynchronous and almost always finishes after the title
   * screen has already called `playBgm('INTRO')` — without this the synth keeps
   * playing until the next screen change and the user's file is never heard.
   */
  private refreshActiveTrack() {
    if (!this.musicEnabled) return;

    const active = this.currentTrack || this.lastRequestedTrack;
    if (!active || !this.customTrackUrls[active]) return;

    // A file is already playing: do not interrupt it.
    if (this.activeAudioElement && !this.activeAudioElement.paused) return;

    this.playBgm(active as BgmTrack, true);
  }

  private handleVisibilityOrFocusChange() {
    const isHidden = typeof document !== 'undefined' && (document.hidden || document.visibilityState === 'hidden');

    if (isHidden) {
      this.suspendAudio();
    } else {
      this.resumeAudio();
    }
  }

  public suspendAudio() {
    this.isAutoSuspended = true;
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => {});
    }
  }

  public resumeAudio() {
    this.isAutoSuspended = false;
    const isHidden = typeof document !== 'undefined' && (document.hidden || document.visibilityState === 'hidden');
    if (!isHidden && (this.enabled || this.musicEnabled) && this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public stopAll() {
    this.stopBgm();
    if (this.ctx) {
      try {
        this.ctx.suspend().catch(() => {});
      } catch {
        // ignore
      }
    }
  }

  public initCtx() {
    this.isAutoSuspended = false;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.createNoiseBuffer();
      }
    }
    const isHidden = typeof document !== 'undefined' && (document.hidden || document.visibilityState === 'hidden');
    if (!isHidden && this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private createNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 0.5; // 0.5s of noise
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  private createPanner(pan: number = 0): AudioNode {
    if (!this.ctx) return this.ctx as unknown as AudioNode;
    if (this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), this.ctx.currentTime);
      return panner;
    }
    // Fallback gain node if stereo panner is not supported
    return this.ctx.createGain();
  }

  public calculatePan(x: number, cameraX: number, canvasWidth: number = 800): number {
    const screenX = x - cameraX;
    const relativeX = screenX / canvasWidth; // 0 to 1
    return (relativeX - 0.5) * 1.5; // -0.75 to +0.75
  }

  private lastRequestedTrack: string | null = null;
  private synthBgmGain: GainNode | null = null;

  public setEnabled(sound: boolean, music: boolean, currentTrack?: string) {
    this.enabled = sound;
    const wasMusicEnabled = this.musicEnabled;
    this.musicEnabled = music;

    if (sound || music) {
      this.initCtx();
    }

    if (!music) {
      this.pauseBgm();
    } else if (music) {
      const trackToPlay = (currentTrack || this.currentTrack || this.lastRequestedTrack || 'INTRO') as any;
      if (!wasMusicEnabled || !this.activeAudioElement || this.activeAudioElement.paused) {
        this.playBgm(trackToPlay, true);
      }
    }
  }

  // --- RETRO ARCADE UI & GAMEPLAY SOUND EFFECTS ---

  public playCoin() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [987.77, 1318.51]; // B5 -> E6 classic arcade coin chime
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);

      gain.gain.setValueAtTime(0.3 * this.volume, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.25);
    });
  }

  public playSelect() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.setValueAtTime(880, now + 0.04);

    gain.gain.setValueAtTime(0.25 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playStart() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + idx * 0.05);

      gain.gain.setValueAtTime(0.25 * this.volume, now + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.05 + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.14);
    });
  }

  public playPunch(pan: number = 0) {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const panner = this.createPanner(pan);

    // FM Modulated Impact Carrier
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'square';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.09);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.exponentialRampToValueAtTime(100, now + 0.09);

    gain.gain.setValueAtTime(0.45 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.09);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);

    // Sub-Bass Thud Layer
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(120, now);
    subOsc.frequency.exponentialRampToValueAtTime(25, now + 0.1);

    subGain.gain.setValueAtTime(0.5 * this.volume, now);
    subGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    subOsc.connect(subGain);
    subGain.connect(panner);
    subOsc.start(now);
    subOsc.stop(now + 0.1);
  }

  public playKick(pan: number = 0) {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const panner = this.createPanner(pan);

    // Chunky Low-Frequency 16-Bit Kick
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + 0.14);

    gain.gain.setValueAtTime(0.55 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.14);

    // Kick Noise Snap Layer
    if (this.noiseBuffer) {
      const noiseSource = this.ctx.createBufferSource();
      const noiseFilter = this.ctx.createBiquadFilter();
      const noiseGain = this.ctx.createGain();

      noiseSource.buffer = this.noiseBuffer;
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(800, now);

      noiseGain.gain.setValueAtTime(0.3 * this.volume, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(panner);

      noiseSource.start(now);
      noiseSource.stop(now + 0.04);
    }
  }

  public playSpecial(pan: number = 0) {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const panner = this.createPanner(pan);
    const notes = [196.00, 293.66, 392.00, 587.33, 783.99, 1174.66];

    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const subOsc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      subOsc.type = 'square';

      const startTime = now + idx * 0.035;
      osc.frequency.setValueAtTime(freq, startTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.8, startTime + 0.12);

      subOsc.frequency.setValueAtTime(freq * 0.5, startTime);

      gain.gain.setValueAtTime(0.3 * this.volume, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.12);

      osc.connect(gain);
      subOsc.connect(gain);
      gain.connect(panner);
      panner.connect(this.ctx.destination);

      osc.start(startTime);
      subOsc.start(startTime);
      osc.stop(startTime + 0.13);
      subOsc.stop(startTime + 0.13);
    });
  }

  public playBlock(pan: number = 0) {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const panner = this.createPanner(pan);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);

    gain.gain.setValueAtTime(0.4 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playDash(pan: number = 0) {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const panner = this.createPanner(pan);

    if (this.noiseBuffer) {
      const source = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      source.buffer = this.noiseBuffer;
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, now);
      filter.frequency.exponentialRampToValueAtTime(300, now + 0.1);

      gain.gain.setValueAtTime(0.25 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(panner);
      panner.connect(this.ctx.destination);

      source.start(now);
      source.stop(now + 0.1);
    }
  }

  public playBite(pan: number = 0) {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const panner = this.createPanner(pan);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.linearRampToValueAtTime(90, now + 0.16);

    gain.gain.setValueAtTime(0.5 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.16);

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playHeal() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const chord = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    chord.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.05);

      gain.gain.setValueAtTime(0.35 * this.volume, now + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.05 + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.16);
    });
  }

  public playHitHurt(pan: number = 0) {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const panner = this.createPanner(pan);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + 0.16);

    gain.gain.setValueAtTime(0.45 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.16);

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playBossAlarm() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(960, now + i * 0.18);
      osc.frequency.setValueAtTime(480, now + i * 0.18 + 0.09);

      gain.gain.setValueAtTime(0.35 * this.volume, now + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.18 + 0.16);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.18);
      osc.stop(now + i * 0.18 + 0.17);
    }
  }

  public playStageClear() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const fanfare = [
      { f: 523.25, t: 0, d: 0.15 },
      { f: 659.25, t: 0.14, d: 0.15 },
      { f: 783.99, t: 0.28, d: 0.15 },
      { f: 1046.50, t: 0.42, d: 0.50 },
    ];
    fanfare.forEach((n) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const subOsc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      subOsc.type = 'sawtooth';

      osc.frequency.setValueAtTime(n.f, now + n.t);
      subOsc.frequency.setValueAtTime(n.f * 0.5, now + n.t);

      gain.gain.setValueAtTime(0.4 * this.volume, now + n.t);
      gain.gain.exponentialRampToValueAtTime(0.01, now + n.t + n.d);

      osc.connect(gain);
      subOsc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + n.t);
      subOsc.start(now + n.t);
      osc.stop(now + n.t + n.d);
      subOsc.stop(now + n.t + n.d);
    });
  }

  // --- 16-BIT & CUSTOM AUDIO BGM SEQUENCER ENGINE ---

  private activeAudioElement: HTMLAudioElement | null = null;
  private audioInstances: HTMLAudioElement[] = [];
  private playbackToken: number = 0;

  private customTrackUrls: Record<string, string> = {};

  private customTrackNames: Record<string, string> = {};

  private syncTrackAliases(track: string, url: string, name?: string) {
    if (url) {
      this.customTrackUrls[track] = url;
    } else {
      delete this.customTrackUrls[track];
    }

    if (name !== undefined) {
      if (name) this.customTrackNames[track] = name;
      else delete this.customTrackNames[track];
    }

    const aliasMap: Record<string, string> = {
      STAGE1: 'NEON_BEAT',
      NEON_BEAT: 'STAGE1',
      STAGE1_BOSS: 'SACRED_METAL',
      SACRED_METAL: 'STAGE1_BOSS',
    };

    const targetAlias = aliasMap[track];
    if (targetAlias) {
      if (url) {
        this.customTrackUrls[targetAlias] = url;
      } else {
        delete this.customTrackUrls[targetAlias];
      }
      if (name) this.customTrackNames[targetAlias] = name;
      else if (name === '') delete this.customTrackNames[targetAlias];
    }
  }

  public setCustomTrackUrl(track: string, url: string, name?: string) {
    this.syncTrackAliases(track, url, name);
    if (this.currentTrack === track || this.lastRequestedTrack === track) {
      this.playBgm(track as any, true);
    }
  }

  public async setCustomTrackBlob(track: string, file: Blob | File, name: string) {
    const objectUrl = URL.createObjectURL(file);
    this.syncTrackAliases(track, objectUrl, name);
    await saveAudioTrackBlob(track, file, name);
    if (
      this.currentTrack === track ||
      this.lastRequestedTrack === track ||
      (track === 'STAGE1' && (this.currentTrack === 'NEON_BEAT' || this.lastRequestedTrack === 'NEON_BEAT')) ||
      (track === 'STAGE1_BOSS' && (this.currentTrack === 'SACRED_METAL' || this.lastRequestedTrack === 'SACRED_METAL'))
    ) {
      this.playBgm((this.currentTrack || track) as any, true);
    }
  }

  public async resetCustomTrack(track: string) {
    delete this.customTrackNames[track];
    delete this.customTrackUrls[track];
    this.syncTrackAliases(track, '', '');
    await removeAudioTrackBlob(track);
    if (this.currentTrack === track || this.lastRequestedTrack === track) {
      this.stopBgm();
      this.playSynthBgm(track as any);
    }
  }

  public getCustomTrackName(track: string): string | null {
    return this.customTrackNames[track] || null;
  }

  public getActiveTrack(): string | null {
    return this.currentTrack || this.lastRequestedTrack;
  }

  public isCustomTrackActive(track: string): boolean {
    return !!(
      (this.currentTrack === track || this.lastRequestedTrack === track) &&
      this.activeAudioElement &&
      !this.activeAudioElement.paused
    );
  }

  public playBgm(track: BgmTrack, forceRestart: boolean = false) {
    this.lastRequestedTrack = track;

    if (!this.musicEnabled) {
      this.pauseBgm();
      return;
    }

    // Do not bail out optimistically: Chrome grants autoplay to sites the user
    // has engaged with before. Attempt playback and only defer if the browser
    // actually refuses — bailing here means the permission can never be used.

    // Guard: Avoid restarting if this track is ALREADY playing actively
    if (!forceRestart && this.currentTrack === track) {
      const isAudioPlaying = this.activeAudioElement && !this.activeAudioElement.paused;
      const isSynthPlaying = this.bgmInterval !== null;
      if (isAudioPlaying || isSynthPlaying) {
        return;
      }
    }

    this.stopBgm(); // Stops everything instantly and increments playbackToken
    const currentToken = this.playbackToken;
    this.currentTrack = track;
    this.initCtx();

    // Try HTML5 Audio file playback first
    const audioUrl = this.customTrackUrls[track];
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.loop = true;
      audio.volume = Math.max(0, Math.min(1, this.volume));

      this.audioInstances.push(audio);
      this.activeAudioElement = audio;

      audio
        .play()
        .then(() => {
          // If a new track or stop call occurred while loading, pause immediately
          if (this.playbackToken !== currentToken || !this.musicEnabled) {
            try {
              audio.pause();
              audio.currentTime = 0;
            } catch {
              // ignore
            }
            return;
          }

          this.setUserGesture(true);
        })
        .catch((err: unknown) => {
          if (this.playbackToken !== currentToken) return;

          const isAutoplayBlocked = (err as { name?: string } | null)?.name === 'NotAllowedError';
          if (isAutoplayBlocked) {
            this.hasUserGesture = false;
            this.activeAudioElement = null;
            this.armUnlock();
            return;
          }

          this.activeAudioElement = null;
          this.playSynthBgm(track, currentToken);
        });
      return;
    }

    // Fallback directly to synth if no URL configured
    this.playSynthBgm(track, currentToken);
  }

  private playSynthBgm(theme: BgmTrack, token?: number) {
    if (token !== undefined && this.playbackToken !== token) {
      return;
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.setUserGesture(false);
      this.armUnlock();
      return;
    }

    if (this.bgmInterval !== null) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }

    if (this.ctx) {
      try {
        this.synthBgmGain = this.ctx.createGain();
        this.synthBgmGain.gain.setValueAtTime(1, this.ctx.currentTime);
        this.synthBgmGain.connect(this.ctx.destination);
      } catch {
        this.synthBgmGain = null;
      }
    }

    let bassNotes: number[] = [];
    let leadNotes: number[] = [];
    let chordNotes: number[] = [];
    let speedMs = 180;

    if (theme === 'INTRO') {
      bassNotes = [87.31, 87.31, 110, 87.31, 98, 87.31, 110, 130.81];
      leadNotes = [349.23, 0, 440, 523.25, 659.25, 523.25, 440, 392];
      chordNotes = [174.61, 220, 261.63, 174.61, 220, 261.63, 293.66, 220];
      speedMs = 210;
    } else if (theme === 'CHAR_SELECT') {
      bassNotes = [110, 130.81, 146.83, 110, 164.81, 146.83, 130.81, 110];
      leadNotes = [523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 523.25, 440];
      chordNotes = [220, 261.63, 293.66, 329.63, 293.66, 261.63, 220, 196];
      speedMs = 140;
    } else if (theme === 'STAGE1' || theme === 'NEON_BEAT') {
      bassNotes = [110, 110, 146.83, 110, 130.81, 110, 164.81, 146.83];
      leadNotes = [440, 523.25, 659.25, 587.33, 659.25, 783.99, 659.25, 523.25];
      chordNotes = [220, 261.63, 329.63, 293.66, 329.63, 392, 329.63, 261.63];
      speedMs = 135;
    } else if (theme === 'STAGE1_BOSS' || theme === 'SACRED_METAL') {
      bassNotes = [73.42, 73.42, 82.41, 73.42, 87.31, 82.41, 98, 87.31];
      leadNotes = [293.66, 349.23, 392, 440, 523.25, 440, 392, 349.23];
      chordNotes = [146.83, 174.61, 196, 220, 261.63, 220, 196, 174.61];
      speedMs = 115;
    } else if (theme === 'SUBURBAN_GRAY') {
      bassNotes = [98, 98, 123.47, 98, 110, 98, 130.81, 98];
      leadNotes = [392, 440, 392, 0, 493.88, 440, 392, 329.63];
      chordNotes = [196, 220, 246.94, 196, 220, 246.94, 261.63, 220];
      speedMs = 170;
    }

    const outputDest = this.synthBgmGain || (this.ctx ? this.ctx.destination : null);
    if (!outputDest) return;

    this.bgmStep = 0;
    this.bgmInterval = window.setInterval(() => {
      if (token !== undefined && this.playbackToken !== token) {
        if (this.bgmInterval !== null) {
          clearInterval(this.bgmInterval);
          this.bgmInterval = null;
        }
        return;
      }

      const isHidden = typeof document !== 'undefined' && (document.hidden || document.visibilityState === 'hidden');
      if (!this.musicEnabled || !this.ctx || this.isAutoSuspended || isHidden) return;
      const now = this.ctx.currentTime;
      const dest = this.synthBgmGain || this.ctx.destination;

      // Voice 1: Bassline
      const bassFreq = bassNotes[this.bgmStep % bassNotes.length];
      if (bassFreq > 0) {
        const osc = this.ctx.createOscillator();
        const subOsc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        subOsc.type = 'sine';

        osc.frequency.setValueAtTime(bassFreq, now);
        subOsc.frequency.setValueAtTime(bassFreq * 0.5, now);

        gain.gain.setValueAtTime(0.14 * this.volume, now);
        gain.gain.exponentialRampToValueAtTime(0.005, now + 0.12);

        osc.connect(gain);
        subOsc.connect(gain);
        gain.connect(dest);

        osc.start(now);
        subOsc.start(now);
        osc.stop(now + 0.13);
        subOsc.stop(now + 0.13);
      }

      // Voice 2: Harmony/Chord Pad
      const chordFreq = chordNotes[this.bgmStep % chordNotes.length];
      if (chordFreq > 0 && this.bgmStep % 2 === 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(chordFreq, now);

        gain.gain.setValueAtTime(0.08 * this.volume, now);
        gain.gain.exponentialRampToValueAtTime(0.005, now + 0.22);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(now);
        osc.stop(now + 0.23);
      }

      // Voice 3: Lead Melody
      const leadFreq = leadNotes[this.bgmStep % leadNotes.length];
      if (leadFreq > 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(leadFreq, now);

        gain.gain.setValueAtTime(0.12 * this.volume, now);
        gain.gain.exponentialRampToValueAtTime(0.005, now + 0.10);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(now);
        osc.stop(now + 0.11);
      }

      // Voice 4: Drum Percussion
      const step4 = this.bgmStep % 4;
      if (step4 === 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.08);

        gain.gain.setValueAtTime(0.25 * this.volume, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

        osc.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (step4 === 2 && this.noiseBuffer) {
        const source = this.ctx.createBufferSource();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        source.buffer = this.noiseBuffer;
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(1000, now);

        gain.gain.setValueAtTime(0.18 * this.volume, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.07);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(dest);

        source.start(now);
        source.stop(now + 0.07);
      } else if (this.noiseBuffer) {
        const source = this.ctx.createBufferSource();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        source.buffer = this.noiseBuffer;
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(7000, now);

        gain.gain.setValueAtTime(0.06 * this.volume, now);
        gain.gain.exponentialRampToValueAtTime(0.005, now + 0.03);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(dest);

        source.start(now);
        source.stop(now + 0.03);
      }

      this.bgmStep++;
    }, speedMs);
  }

  public pauseBgm() {
    this.stopBgm(false);
  }

  public stopBgm(resetCurrentTrack: boolean = true) {
    this.playbackToken++;

    // Immediately mute and disconnect synth output for instant silence
    if (this.synthBgmGain && this.ctx) {
      try {
        this.synthBgmGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.synthBgmGain.disconnect();
      } catch {
        // ignore
      }
      this.synthBgmGain = null;
    }

    if (this.bgmInterval !== null) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }

    if (this.audioInstances.length > 0) {
      this.audioInstances.forEach((audio) => {
        try {
          audio.volume = 0;
          audio.pause();
          audio.currentTime = 0;
        } catch {
          // ignore
        }
      });
      this.audioInstances = [];
    }

    if (this.activeAudioElement) {
      try {
        this.activeAudioElement.volume = 0;
        this.activeAudioElement.pause();
        this.activeAudioElement.currentTime = 0;
      } catch {
        // ignore
      }
      this.activeAudioElement = null;
    }

    if (resetCurrentTrack) {
      this.currentTrack = null;
    }
  }
}

export const sound = new SoundEngine();

