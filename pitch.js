// Monophonic pitch detection (YIN) for live marking + score-based grading.
// Pure JS, runs in the browser on mic frames or a decoded recording buffer.
(function () {
  function yin(buf, sr) {
    const fmin = 70, fmax = 1700;
    const N = buf.length;
    const tauMax = Math.min(Math.floor(N / 2), Math.ceil(sr / fmin));
    const tauMin = Math.max(2, Math.floor(sr / fmax));
    const W = N - tauMax;
    let rms = 0;
    for (let i = 0; i < N; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / N);
    if (rms < 0.006) return { freq: 0, clarity: 0, rms };

    const d = new Float32Array(tauMax + 2);
    for (let tau = tauMin; tau <= tauMax; tau++) {
      let s = 0;
      for (let i = 0; i < W; i++) { const x = buf[i] - buf[i + tau]; s += x * x; }
      d[tau] = s;
    }
    const cmnd = new Float32Array(tauMax + 2);
    let run = 0;
    for (let tau = tauMin; tau <= tauMax; tau++) {
      run += d[tau];
      cmnd[tau] = d[tau] * (tau - tauMin + 1) / (run || 1);
    }
    const thr = 0.15;
    let tau = -1;
    for (let t = tauMin + 1; t < tauMax; t++) {
      if (cmnd[t] < thr) { while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t++; tau = t; break; }
    }
    if (tau === -1) {
      let mn = Infinity, mt = -1;
      for (let t = tauMin + 1; t < tauMax; t++) if (cmnd[t] < mn) { mn = cmnd[t]; mt = t; }
      if (mn > 0.4 || mt < 0) return { freq: 0, clarity: 0, rms };
      tau = mt;
    }
    const x0 = cmnd[tau - 1], x1 = cmnd[tau], x2 = cmnd[tau + 1] || x1;
    const a = (x0 + x2 - 2 * x1) / 2, b = (x2 - x0) / 2;
    let bt = tau; if (a) bt = tau - b / (2 * a);
    return { freq: sr / bt, clarity: Math.max(0, 1 - x1), rms };
  }

  const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);
  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  function midiToName(m) {
    const r = Math.round(m);
    return NAMES[(r % 12 + 12) % 12] + (Math.floor(r / 12) - 1);
  }
  // cents of `midiFloat` relative to an expected integer midi
  const centsFrom = (midiFloat, expectedMidi) => (midiFloat - expectedMidi) * 100;

  window.PitchDetector = { yin, freqToMidi, midiToName, centsFrom };
})();
