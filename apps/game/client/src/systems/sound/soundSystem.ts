import * as THREE from "three";

export type SoundCategory = "music" | "sfx";

interface LoadedSound {
  buffer: AudioBuffer;
  category: SoundCategory;
  volume: number;
}

interface ActiveMusic {
  source: AudioBufferSourceNode;
  gain: GainNode;
  key: string;
}

const FADE_DURATION = 1.5;
const STORAGE_KEY = "slimesurfers.audioSettings";

interface StoredAudioSettings {
  muted?: Partial<Record<SoundCategory, boolean>>;
  volumes?: Partial<Record<SoundCategory, number>>;
}

export class SoundSystem {
  private ctx: AudioContext | null = null;
  private readonly masterGain: { music: GainNode | null; sfx: GainNode | null } = {
    music: null,
    sfx: null,
  };
  private readonly listener = new THREE.AudioListener();
  private readonly loaded = new Map<string, LoadedSound>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly sfxLastPlayedMs = new Map<string, number>();
  private activeMusic: ActiveMusic | null = null;
  private volumes = { music: 0.75, sfx: 0.5 };
  private muted = { music: false, sfx: false };

  constructor() {
    this.loadSettings();
  }

  // Call once after the first user interaction to unlock the AudioContext.
  resume(): void {
    if (!this.ctx) this.init();
    else void this.ctx.resume();
  }

  private init(): void {
    this.ctx = new AudioContext();
    const music = this.ctx.createGain();
    const sfx = this.ctx.createGain();
    music.gain.value = this.getEffectiveVolume("music");
    sfx.gain.value = this.getEffectiveVolume("sfx");
    music.connect(this.ctx.destination);
    sfx.connect(this.ctx.destination);
    this.masterGain.music = music;
    this.masterGain.sfx = sfx;
    void this.ctx.resume();
  }

  getListener(): THREE.AudioListener {
    return this.listener;
  }

  // Preload a sound asset. Safe to call multiple times for the same key.
  preload(key: string, url: string, category: SoundCategory, volume = 1): Promise<void> {
    if (this.loaded.has(key)) return Promise.resolve();
    if (this.pending.has(key)) return this.pending.get(key)!;

    const promise = (async () => {
      try {
        const ctx = this.ensureContext();
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
        const arrayBuffer = await res.arrayBuffer();
        const buffer = await ctx.decodeAudioData(arrayBuffer);
        this.loaded.set(key, { buffer, category, volume });
      } catch (err) {
        console.error(`[SoundSystem] Failed to preload "${key}" (${url}):`, err);
      } finally {
        this.pending.delete(key);
      }
    })();

    this.pending.set(key, promise);
    return promise;
  }

  // Play a one-shot SFX. Pass cooldownMs to throttle repeats (e.g. for auto-fire weapons).
  playSfx(
    key: string,
    options: { volume?: number; playbackRate?: number; cooldownMs?: number } = {},
  ): void {
    if (options.cooldownMs !== undefined) {
      const last = this.sfxLastPlayedMs.get(key) ?? -Infinity;
      if (performance.now() - last < options.cooldownMs) return;
      this.sfxLastPlayedMs.set(key, performance.now());
    }
    const sound = this.loaded.get(key);
    if (!sound) {
      console.warn(`[SoundSystem] Cannot play SFX "${key}": not loaded.`);
      return;
    }
    if (sound.category !== "sfx") return;
    const ctx = this.ensureContext();
    const gain = ctx.createGain();
    gain.gain.value = (options.volume ?? 1.0) * sound.volume;
    gain.connect(this.masterGain.sfx!);
    const source = ctx.createBufferSource();
    source.buffer = sound.buffer;
    source.playbackRate.value = options.playbackRate ?? 1;
    source.connect(gain);
    source.start();
  }

  // Play a spatially positioned SFX at a world position.
  playSfxAt(
    key: string,
    position: THREE.Vector3,
    options: { volume?: number; refDistance?: number; cooldownMs?: number } = {},
  ): void {
    if (options.cooldownMs !== undefined) {
      const last = this.sfxLastPlayedMs.get(key) ?? -Infinity;
      if (performance.now() - last < options.cooldownMs) return;
      this.sfxLastPlayedMs.set(key, performance.now());
    }
    const sound = this.loaded.get(key);
    if (!sound) {
      console.warn(`[SoundSystem] Cannot play SFX at "${key}": not loaded.`);
      return;
    }
    if (sound.category !== "sfx") return;
    const ctx = this.ensureContext();
    const gain = ctx.createGain();
    gain.gain.value = (options.volume ?? 1.0) * sound.volume;
    const panner = ctx.createPanner();

    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = options.refDistance ?? 10;
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;
    panner.connect(gain);
    gain.connect(this.masterGain.sfx!);
    const source = ctx.createBufferSource();
    source.buffer = sound.buffer;
    source.connect(panner);
    source.start();
  }

  // Crossfade to a new music track. Pass null to stop music.
  playMusic(key: string | null, options: { loop?: boolean; fadeDuration?: number } = {}): void {
    if (this.activeMusic?.key === key && key !== null) return;

    const fade = options.fadeDuration ?? FADE_DURATION;
    this.fadeOutCurrentMusic(fade);

    if (!key) return;
    const sound = this.loaded.get(key);
    if (!sound) {
      console.warn(`[SoundSystem] Cannot play music "${key}": not loaded.`);
      return;
    }
    if (sound.category !== "music") {
      console.warn(`[SoundSystem] Cannot play music "${key}": wrong category "${sound.category}".`);
      return;
    }

    const ctx = this.ensureContext();
    const gain = ctx.createGain();
    const initialVolume = sound.volume;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(initialVolume, ctx.currentTime + fade);
    gain.connect(this.masterGain.music!);

    const source = ctx.createBufferSource();
    source.buffer = sound.buffer;
    source.loop = options.loop ?? true;
    source.connect(gain);
    source.start();

    this.activeMusic = { source, gain, key };
  }

  stopMusic(fadeDuration = FADE_DURATION): void {
    this.fadeOutCurrentMusic(fadeDuration);
  }

  // Update the 3D listener position/orientation to match the camera each frame.
  updateListener(camera: THREE.Camera): void {
    if (!this.ctx) return;
    const pos = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const up = new THREE.Vector3();
    camera.getWorldPosition(pos);
    camera.getWorldDirection(forward);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);

    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = pos.x;
      l.positionY.value = pos.y;
      l.positionZ.value = pos.z;
      l.forwardX.value = forward.x;
      l.forwardY.value = forward.y;
      l.forwardZ.value = forward.z;
      l.upX.value = up.x;
      l.upY.value = up.y;
      l.upZ.value = up.z;
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  setVolume(category: SoundCategory, value: number): void {
    this.volumes[category] = Math.max(0, Math.min(1, value));
    this.applyVolume(category);
    this.saveSettings();
  }

  getVolume(category: SoundCategory): number {
    return this.volumes[category];
  }

  setMuted(category: SoundCategory, muted: boolean): void {
    this.muted[category] = muted;
    this.applyVolume(category);
    this.saveSettings();
  }

  isMuted(category: SoundCategory): boolean {
    return this.muted[category];
  }

  isLoaded(key: string): boolean {
    return this.loaded.has(key);
  }

  private fadeOutCurrentMusic(duration: number): void {
    if (!this.activeMusic || !this.ctx) return;
    const { source, gain } = this.activeMusic;
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + duration);
    source.stop(now + duration);
    this.activeMusic = null;
  }

  private applyVolume(category: SoundCategory): void {
    const node = this.masterGain[category];
    if (node) node.gain.value = this.getEffectiveVolume(category);
  }

  private getEffectiveVolume(category: SoundCategory): number {
    return this.muted[category] ? 0 : this.volumes[category];
  }

  private loadSettings(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredAudioSettings;
      this.applyStoredVolume("music", parsed.volumes?.music);
      this.applyStoredVolume("sfx", parsed.volumes?.sfx);
      this.muted.music = parsed.muted?.music ?? this.muted.music;
      this.muted.sfx = parsed.muted?.sfx ?? this.muted.sfx;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  private applyStoredVolume(category: SoundCategory, value: unknown): void {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    this.volumes[category] = Math.max(0, Math.min(1, value));
  }

  private saveSettings(): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        muted: this.muted,
        volumes: this.volumes,
      }),
    );
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) this.init();
    return this.ctx!;
  }

  dispose(): void {
    this.activeMusic?.source.stop();
    this.activeMusic = null;
    void this.ctx?.close();
    this.ctx = null;
    this.loaded.clear();
    this.pending.clear();
  }
}
