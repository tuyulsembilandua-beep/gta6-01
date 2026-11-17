// Solmar Heat — all sound is synthesised with WebAudio: no audio files,
// no network. Engine hum, sirens, gunshots, crashes, pickups and UI blips.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let enabled = true;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Engine: a low sawtooth whose pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a sine that wails between two tones.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!enabled || muted || !ensure()) return;
    try {
      if (ctx.state === 'suspended') void ctx.resume();
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  function noise(dur, vol, filterFreq) {
    if (!enabled || muted || !ensure()) return;
    try {
      if (ctx.state === 'suspended') void ctx.resume();
      const t = ctx.currentTime;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(t);
    } catch {
      // See above.
    }
  }

  return {
    unlock() {
      ensure();
    },
    setMuted(v) {
      muted = v;
      if (master) master.gain.value = v ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    shoot() {
      noise(0.12, 0.5, 2400);
      tone(180, 0.08, 'square', 0.18, 60);
    },
    enemyShoot() {
      noise(0.1, 0.3, 1800);
    },
    melee() {
      noise(0.08, 0.3, 900);
    },
    crash(strength) {
      noise(0.25, Math.min(0.7, 0.2 + strength * 0.4), 500);
      tone(70, 0.2, 'sine', 0.35, 40);
    },
    pickup() {
      tone(660, 0.09, 'sine', 0.3);
      setTimeout(() => tone(990, 0.12, 'sine', 0.3), 70);
    },
    cash() {
      tone(880, 0.08, 'triangle', 0.3);
      setTimeout(() => tone(1174, 0.1, 'triangle', 0.3), 80);
      setTimeout(() => tone(1568, 0.16, 'triangle', 0.3), 160);
    },
    missionStart() {
      tone(523, 0.12, 'triangle', 0.3);
      setTimeout(() => tone(659, 0.12, 'triangle', 0.3), 110);
      setTimeout(() => tone(784, 0.2, 'triangle', 0.3), 220);
    },
    fail() {
      tone(320, 0.25, 'sawtooth', 0.25, 140);
    },
    uiClick() {
      tone(520, 0.05, 'square', 0.12);
    },
    wantedUp() {
      tone(440, 0.14, 'square', 0.22, 660);
    },
    // Called every frame: engine pitch follows speed, siren wails while wanted.
    update(dt, speedRatio, wanted) {
      if (!ctx) return;
      sirenTimer += dt;
      if (engineGain) {
        const target = speedRatio > 0.02 ? 0.05 + speedRatio * 0.075 : 0;
        engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
        engineOsc.frequency.setTargetAtTime(52 + speedRatio * 150, ctx.currentTime, 0.1);
      }
      if (sirenGain) {
        if (wanted > 0) {
          sirenGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.2);
          const f = 620 + 260 * Math.sin(sirenTimer * 4.2);
          sirenOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.05);
        } else {
          sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        }
      }
    },
  };
}
