// Small synth hooked to the event bus. Swap this file without touching the sim.
import { events } from "./events.js";

export function createAudio() {
  let ctx = null;
  let master = null;
  let on = true;
  let live = false;

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, gain, slide) {
    if (!on || !live) return;
    const a = ac();
    if (!a) return;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, a.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), a.currentTime + dur);
    g.gain.setValueAtTime(gain, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    o.connect(g);
    g.connect(master);
    o.start();
    o.stop(a.currentTime + dur + 0.02);
  }

  function noise(dur, gain, hp) {
    if (!on || !live) return;
    const a = ac();
    if (!a) return;
    const n = 2 * Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, n, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buf;
    const filter = a.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = hp || 400;
    const g = a.createGain();
    g.gain.setValueAtTime(gain, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start();
  }

  events.on("attack_start", (e) => {
    noise(0.08, e.weight === "heavy" ? 0.18 : 0.1, 900);
    tone(180, 0.06, "triangle", 0.05, 0.6);
  });
  events.on("hit", (e) => {
    if (e.parried || e.blocked && e.damage === 0 && !e.clash) return;
    if (e.clash) { tone(520, 0.08, "square", 0.06, 0.5); return; }
    const heavy = e.weight === "heavy" || e.weight === "super";
    noise(heavy ? 0.16 : 0.08, heavy ? 0.28 : 0.16, heavy ? 180 : 500);
    tone(heavy ? 90 : 160, heavy ? 0.18 : 0.08, "sine", heavy ? 0.16 : 0.08, 0.45);
  });
  events.on("block", () => { tone(640, 0.05, "square", 0.05, 0.7); noise(0.04, 0.06, 2000); });
  events.on("parry", () => { tone(880, 0.12, "square", 0.08, 1.4); tone(1320, 0.14, "sine", 0.05, 1); });
  events.on("dash", () => noise(0.1, 0.1, 600));
  events.on("land", () => noise(0.07, 0.08, 200));
  events.on("launch", () => tone(220, 0.12, "sawtooth", 0.04, 1.8));
  events.on("wall_bounce", () => { noise(0.1, 0.14, 250); tone(110, 0.1, "sine", 0.08, 0.6); });
  events.on("ground_bounce", () => { noise(0.12, 0.16, 180); tone(80, 0.14, "sine", 0.1, 0.5); });
  events.on("throw", () => noise(0.12, 0.12, 300));
  events.on("projectile_fire", () => tone(420, 0.16, "sawtooth", 0.05, 0.4));
  events.on("super_start", () => { noise(0.4, 0.2, 120); tone(70, 0.5, "sine", 0.12, 0.5); });
  events.on("super_hit", () => { noise(0.2, 0.22, 200); tone(50, 0.2, "sine", 0.14, 0.4); });
  events.on("ko", () => { noise(0.45, 0.3, 100); tone(60, 0.4, "sine", 0.16, 0.3); });

  return {
    unlock: () => ac(),
    setLive(v) { live = v; },
    toggle() {
      on = !on;
      if (master) master.gain.value = on ? 0.35 : 0;
      return on;
    },
    get on() { return on; },
  };
}
