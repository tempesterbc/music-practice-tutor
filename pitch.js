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

  function median(arr) {
    if (!arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function std(arr) {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
    return Math.sqrt(arr.reduce((s, x) => s + (x - mean) * (x - mean), 0) / arr.length);
  }

  // Detect vibrato from a note's pitch contour.
  // pts: [{t (ms), cents}] where cents is deviation around the note's own mean.
  // Returns {present, rateHz, depthCents, strength}. Vibrato band 3.5–8.5 Hz.
  function analyzeVibrato(pts) {
    const none = { present: false, rateHz: 0, depthCents: 0, strength: 0 };
    if (pts.length < 8) return none;
    const t0 = pts[0].t, span = pts[pts.length - 1].t - t0;
    if (span < 300) return none;                       // need a sustained note
    const dt = 20, n = Math.floor(span / dt);
    if (n < 10) return none;
    // resample onto a uniform grid
    const y = new Float64Array(n);
    let j = 0;
    for (let k = 0; k < n; k++) {
      const tt = t0 + k * dt;
      while (j < pts.length - 1 && pts[j + 1].t < tt) j++;
      const a = pts[j], b = pts[Math.min(j + 1, pts.length - 1)];
      const f = b.t > a.t ? (tt - a.t) / (b.t - a.t) : 0;
      y[k] = a.cents + (b.cents - a.cents) * f;
    }
    // detrend with a moving average (~120 ms) to remove slow pitch drift
    const win = Math.max(2, Math.round(120 / dt));
    const de = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      let s = 0, c = 0;
      for (let m = -win; m <= win; m++) { const i = k + m; if (i >= 0 && i < n) { s += y[i]; c++; } }
      de[k] = y[k] - s / c;
    }
    let norm = 0; for (let k = 0; k < n; k++) norm += de[k] * de[k];
    if (norm < 1e-6) return none;
    const fmin = 3.5, fmax = 8.5;
    const lagMin = Math.max(1, Math.round(1000 / fmax / dt));
    const lagMax = Math.round(1000 / fmin / dt);
    let best = -1, bestVal = 0;
    for (let lag = lagMin; lag <= lagMax; lag++) {
      let s = 0; for (let k = 0; k + lag < n; k++) s += de[k] * de[k + lag];
      const v = s / norm;
      if (v > bestVal) { bestVal = v; best = lag; }
    }
    const rateHz = best > 0 ? 1000 / (best * dt) : 0;
    const depth = Math.sqrt(norm / n) * Math.SQRT2;      // approx amplitude in cents
    const present = bestVal > 0.35 && depth > 8;
    return { present, rateHz: +rateHz.toFixed(1), depthCents: Math.round(depth), strength: +bestVal.toFixed(2) };
  }

  window.PitchDetector = { yin, freqToMidi, midiToName, centsFrom, median, std, analyzeVibrato };
})();
