// Score-based grading + live mistake marking (client-side).
// Reuses the play-along cursor for timing: because the player follows the cursor,
// we know when each note should sound, so we grade each note's pitch, steadiness,
// vibrato and loudness from the mic — live (lamp) and in a summary at the end.
(function () {
  const $ = (id) => document.getElementById(id);
  const PD = () => window.PitchDetector;

  let ac = null, analyser = null, micStream = null, buf = null, loopId = null;
  let running = false, grading = false, currentIndex = -1, frames = {};

  const expForIndex = (i) => {
    const n = window.ScoreView.notes()[i];
    return n && !n.rest ? n.midi : null;
  };

  async function startMonitor() {
    const AC = window.AudioContext || window.webkitAudioContext;
    micStream = await navigator.mediaDevices.getUserMedia(
      { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    ac = new AC();
    const src = ac.createMediaStreamSource(micStream);
    analyser = ac.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    buf = new Float32Array(analyser.fftSize);
    running = true;
    loop();
  }

  function loop() {
    if (!running) return;
    analyser.getFloatTimeDomainData(buf);
    const r = PD().yin(buf, ac.sampleRate);
    let midiFloat = null;
    if (r.freq > 0 && r.clarity > 0.6) {
      midiFloat = PD().freqToMidi(r.freq);
      if (currentIndex >= 0)
        (frames[currentIndex] = frames[currentIndex] || []).push({ t: performance.now(), midi: midiFloat, rms: r.rms });
    }
    updateLamp(midiFloat, expForIndex(currentIndex));
    loopId = setTimeout(loop, 25);          // ~40 Hz so vibrato (4–8 Hz) resolves
  }

  function updateLamp(midiFloat, expMidi) {
    const lamp = $("liveLamp"), txt = $("liveReadout");
    if (!lamp) return;
    if (midiFloat == null) { lamp.style.background = "#3a4372"; if (txt) txt.textContent = "listening…"; return; }
    const name = PD().midiToName(midiFloat);
    if (expMidi == null) { lamp.style.background = "#6a74a8"; if (txt) txt.textContent = "you: " + name; return; }
    const cents = (midiFloat - expMidi) * 100, a = Math.abs(cents);
    lamp.style.background = a <= 35 ? "#2e9b57" : a <= 120 ? "#e0a021" : "#d64545";
    if (txt) txt.textContent = "want " + PD().midiToName(expMidi) + " · you " + name +
      " (" + (cents > 0 ? "+" : "") + Math.round(cents) + "¢)";
  }

  function stopMonitor() {
    running = false;
    if (loopId) clearTimeout(loopId);
    if (micStream) micStream.getTracks().forEach((t) => t.stop());
    if (ac) ac.close().catch(() => {});
  }

  const COL = { good: "#2e9b57", off: "#e0a021", wrong: "#d64545", missed: "#8a8f9c" };
  const LABEL = { good: "in tune", off: "out of tune", wrong: "wrong note", missed: "no sound" };

  // Per-note analysis: trims to the stable middle, removes stray octave frames,
  // then measures tuning, steadiness, vibrato and loudness.
  function analyzeNote(fr, expMidi) {
    if (!fr || fr.length < 3) return { verdict: "missed" };
    fr = fr.slice().sort((a, b) => a.t - b.t);
    const lo = Math.floor(fr.length * 0.15), hi = Math.ceil(fr.length * 0.85);
    let mid = fr.slice(lo, hi); if (mid.length < 3) mid = fr;
    const medRound = PD().median(mid.map((f) => Math.round(f.midi)));
    mid = mid.filter((f) => Math.abs(f.midi - medRound) < 7);        // drop octave/harmonic strays
    if (mid.length < 3) return { verdict: "missed" };
    const midis = mid.map((f) => f.midi);
    const medMidi = PD().median(midis);
    const cents = (medMidi - expMidi) * 100, a = Math.abs(cents);
    const verdict = a <= 35 ? "good" : (a <= 120 ? "off" : "wrong");
    const meanMidi = midis.reduce((s, x) => s + x, 0) / midis.length;
    const steady = Math.round(PD().std(midis) * 100);               // pitch jitter, cents
    const contour = mid.map((f) => ({ t: f.t, cents: (f.midi - meanMidi) * 100 }));
    const vib = PD().analyzeVibrato(contour);
    const loud = mid.reduce((s, f) => s + (f.rms || 0), 0) / mid.length;
    return { verdict, cents, steady, vib, loud };
  }

  function gradeAndRender() {
    const notes = window.ScoreView.notes();
    const sounding = notes.map((n, i) => ({ midi: n.midi, index: i })).filter((n) => n.midi != null);
    const res = sounding.map((n) => {
      const a = analyzeNote(frames[n.index], n.midi);
      return Object.assign({ midi: n.midi }, a);
    });
    renderReport(res);
  }

  function renderReport(res) {
    const box = $("gradeReport");
    if (!box) return;
    const n = res.length || 1;
    const c = { good: 0, off: 0, wrong: 0, missed: 0 };
    let signed = 0, signedN = 0, steadySum = 0, steadyN = 0;
    const played = res.filter((r) => r.verdict !== "missed");
    res.forEach((r) => {
      c[r.verdict]++;
      if (r.cents != null && (r.verdict === "good" || r.verdict === "off")) { signed += r.cents; signedN++; }
      if (r.steady != null && r.verdict !== "missed") { steadySum += r.steady; steadyN++; }
    });
    const inTune = Math.round((c.good / n) * 100);
    const avgSigned = signedN ? Math.round(signed / signedN) : 0;
    const avgSteady = steadyN ? Math.round(steadySum / steadyN) : 0;

    // vibrato across sustained notes
    const vibNotes = played.filter((r) => r.vib && r.vib.present);
    const vibRate = vibNotes.length ? (vibNotes.reduce((s, r) => s + r.vib.rateHz, 0) / vibNotes.length) : 0;
    const vibDepth = vibNotes.length ? Math.round(vibNotes.reduce((s, r) => s + r.vib.depthCents, 0) / vibNotes.length) : 0;
    const vibRateSpread = PD().std(vibNotes.map((r) => r.vib.rateHz));

    // dynamics: loudness range across notes, in dB relative to loudest
    const louds = played.map((r) => r.loud).filter((x) => x > 0);
    const maxLoud = Math.max.apply(null, louds.concat([1e-6]));
    const dbs = louds.map((x) => 20 * Math.log10(x / maxLoud));
    const dynRange = dbs.length ? Math.round(Math.max.apply(null, dbs) - Math.min.apply(null, dbs)) : 0;

    // ---- tips ----
    const tips = [];
    if (c.missed / n > 0.2) tips.push("Several notes didn’t sound clearly — slow the tempo and make each note speak before moving on.");
    if (c.wrong / n > 0.1) tips.push("Some wrong pitches — practice the passage slowly and check the notes/fingerings.");
    if (avgSigned < -12) tips.push("You trend flat (" + avgSigned + "¢ on average) — long tones against a drone will raise your pitch center.");
    else if (avgSigned > 12) tips.push("You trend sharp (+" + avgSigned + "¢ on average) — relax the air/embouchure and check against a drone.");
    if (avgSteady > 30) tips.push("Your pitch wobbles within notes (±" + avgSteady + "¢) — sustained long tones will steady it.");
    if (vibNotes.length >= 2 && vibRateSpread > 1.2) tips.push("Your vibrato speed is uneven — practice it in rhythm to the metronome (e.g. 4 pulses per beat).");
    if (played.length >= 4 && dynRange < 4) tips.push("Dynamics are quite flat — shape the phrase with a swell and taper to add musicality.");
    if (!tips.length) tips.push("Clean, musical run — keep it up. Nudge the tempo up and hold this accuracy.");

    const chips = res.map((r) => {
      const label = PD().midiToName(r.midi);
      const sub = r.verdict === "missed" ? "—" : (r.cents > 0 ? "+" : "") + Math.round(r.cents) + "¢";
      const vibMark = r.vib && r.vib.present ? '<i title="vibrato ' + r.vib.rateHz + ' Hz">∿</i>' : "";
      return '<span class="notechip" title="' + LABEL[r.verdict] + (r.steady != null ? " · ±" + r.steady + "¢ steady" : "") +
        '" style="background:' + COL[r.verdict] + '"><b>' + label + '</b><span>' + sub + " " + vibMark + "</span></span>";
    }).join("");

    const musicality =
      '<div class="grade-music"><b>Musicality</b><ul>' +
      "<li><b>Vibrato:</b> " + (vibNotes.length
        ? "on " + vibNotes.length + " of " + played.length + " notes, ~" + vibRate.toFixed(1) + " Hz, ±" + vibDepth + "¢ "
          + (vibRateSpread > 1.2 ? "(uneven speed)" : "(even)")
        : "none detected — add a steady, even vibrato on sustained notes") + "</li>" +
      "<li><b>Steadiness:</b> pitch held to ±" + avgSteady + "¢ within notes " +
        (avgSteady <= 20 ? "(very steady)" : avgSteady <= 35 ? "(fairly steady)" : "(wobbly)") + "</li>" +
      "<li><b>Dynamics:</b> " + (dynRange >= 4 ? "shaped, ~" + dynRange + " dB range across the phrase" : "flat, ~" + dynRange + " dB — try shaping the line") + "</li>" +
      "</ul></div>";

    box.hidden = false;
    box.innerHTML =
      '<div class="grade-head"><h4>Score-based results</h4>' +
      '<div class="grade-stats">' +
        '<span class="stat"><b>' + inTune + '%</b> in tune</span>' +
        '<span class="stat"><b>' + c.wrong + '</b> wrong</span>' +
        '<span class="stat"><b>' + c.missed + '</b> missed</span>' +
        '<span class="stat"><b>' + (avgSigned > 0 ? "+" : "") + avgSigned + '¢</b> avg tuning</span>' +
      '</div></div>' +
      '<div class="notechips">' + chips + '</div>' +
      musicality +
      '<div class="grade-tips"><b>What to work on</b><ul>' +
        tips.map((t) => "<li>" + t + "</li>").join("") + "</ul>" +
        '<p class="micro">Graded against your uploaded score. Green = in tune, amber = out of tune, ' +
        'red = wrong note, grey = didn’t sound; ∿ marks detected vibrato.</p></div>';
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---- wire into the play-along run ----
  window.addEventListener("resonance:playstart", () => {
    if (!grading) return;
    currentIndex = -1; frames = {};
    const box = $("gradeReport"); if (box) box.hidden = true;
    startMonitor().catch(() => {
      grading = false;
      const txt = $("liveReadout"); if (txt) txt.textContent = "Microphone blocked — allow mic access and try again.";
      window.PlayAlong.stop();
    });
  });
  window.addEventListener("resonance:cursor", (e) => { if (grading) currentIndex = e.detail.index; });
  window.addEventListener("resonance:playstop", () => {
    if (!grading) return;
    grading = false;
    stopMonitor();
    gradeAndRender();
  });

  function init() {
    const btn = $("gradeRun");
    if (!btn) return;
    btn.addEventListener("click", () => {
      if (!window.ScoreView.loaded()) return;
      grading = true;
      window.PlayAlong.start();
    });
    window.ScoreView.onLoad(() => { const row = $("graderow"); if (row) row.hidden = false; });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
