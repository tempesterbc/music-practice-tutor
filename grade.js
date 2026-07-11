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

    // ---- register-dependent intonation + worst offenders ----
    const pitched = played.filter((r) => r.cents != null).slice().sort((a, b) => a.midi - b.midi);
    let regNote = "";
    if (pitched.length >= 4) {
      const h = pitched.slice(Math.ceil(pitched.length / 2)), l = pitched.slice(0, Math.floor(pitched.length / 2));
      const hi = h.reduce((s, r) => s + r.cents, 0) / h.length, lo = l.reduce((s, r) => s + r.cents, 0) / l.length;
      if (hi - lo < -12) regNote = "flat"; else if (hi - lo > 12) regNote = "sharp";
    }
    const worst = pitched.slice().sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents)).slice(0, 3)
      .map((r) => PD().midiToName(r.midi) + " (" + (r.cents > 0 ? "+" : "") + Math.round(r.cents) + "¢)");

    // ---- severity per area (0..100), then rank + weight the schedule ----
    const clamp = (x) => Math.max(0, Math.min(100, Math.round(x)));
    const sev = {
      accuracy: clamp(((c.wrong + c.missed) / n) * 140),
      tuning: clamp((100 - inTune) * 0.55 + Math.abs(avgSigned) * 1.6 + Math.max(0, avgSteady - 15) * 0.8),
      tone: clamp(Math.max(0, avgSteady - 18) * 2.4),
      vibrato: clamp(vibNotes.length >= 2 && vibRateSpread > 1.2 ? 45 + vibRateSpread * 10
        : (played.length >= 4 && vibNotes.length === 0 ? 16 : 0)),
      dynamics: clamp(played.length >= 4 && dynRange < 5 ? (5 - dynRange) * 14 : 0),
    };
    const AREA = {
      accuracy: { title: "Note accuracy",
        say: c.missed > c.wrong ? c.missed + " note(s) didn't speak clearly." : c.wrong + " wrong pitch(es) slipped in.",
        fix: "Take it well under tempo so every note is right before you add speed — accuracy first, speed second.",
        ex: [["Tempo Ramp (Slow-to-Fast Reps)", "3 perfect reps slow, then +5 BPM; drop back the moment it's messy."],
             ["Daily Sight-Reading", "5 min, eyes ahead, don't stop to fix."]] },
      tuning: { title: "Intonation" + (regNote ? " (runs " + regNote + " up high)" : ""),
        say: "Only " + inTune + "% of notes landed in tune" + (avgSigned ? ", averaging " + (avgSigned > 0 ? "+" : "") + avgSigned + "¢ " + (avgSigned > 0 ? "sharp" : "flat") : "") + (worst.length ? ". Worst: " + worst.join(", ") : "") + ".",
        fix: regNote === "flat" ? "You drop flat as you climb — keep the air fast and supported into the upper register instead of letting it thin."
          : regNote === "sharp" ? "You creep sharp up high — ease the embouchure/air pressure as you ascend."
          : "Center each pitch by ear against a fixed reference until the beating stops.",
        ex: [["Long Tones with Tuner/Drone", "hold each scale degree against a drone until it locks; learn which notes tend off."],
             ["Slow Scales with Drone", "tune every note to the drone before moving on."]] },
      tone: { title: "Tone steadiness",
        say: "Your pitch wavers ±" + avgSteady + "¢ within notes — the tone isn't settling.",
        fix: "Keep the airstream perfectly constant — one long, unbroken line of air through each note.",
        ex: [["Long Tones", "8+ beats dead steady: same pitch, volume and colour to the release."],
             ["Crescendo–Decrescendo Long Tones", "swell pp–f–pp keeping pitch and tone unchanged."]] },
      vibrato: { title: "Vibrato control",
        say: vibNotes.length ? "Vibrato speed is uneven (~" + vibRate.toFixed(1) + " Hz, spread ±" + vibRateSpread.toFixed(1) + ")." : "Little or no vibrato on sustained notes.",
        fix: "Train vibrato in strict rhythm so it's even in width and speed, centred on the pitch (dip below, return).",
        ex: [["Vibrato Isolation Drills (Knocking Motion)", "2, then 3, then 4 even pulses per beat to a metronome."]] },
      dynamics: { title: "Dynamics & shaping",
        say: "The line is dynamically flat (~" + dynRange + " dB) — even and unshaped.",
        fix: "Give each phrase a direction: grow toward a high point and taper the ends.",
        ex: [["Messa di Voce", "swell pp–f–pp on one note with rock-steady pitch."],
             ["Expressive Phrasing (Shape & Direction)", "pick the phrase's peak and shape toward it."]] },
    };
    let ranked = Object.keys(AREA).map((k) => ({ k, sev: sev[k] || 0 })).filter((a) => a.sev >= 15)
      .sort((a, b) => b.sev - a.sev).slice(0, 3);
    let planHTML;
    if (!ranked.length) {
      planHTML = '<div class="coach-area"><div class="coach-h"><span class="pri ok">On track</span>' +
        '<b>Clean, musical run</b></div><p class="coach-fix">Nothing major to fix — nice work. Push the tempo a ' +
        'notch and focus on musical shaping.</p><div class="coach-ex"><b>Cantabile Etudes (Singing Style)</b> — ' +
        'play a slow melody as if you were singing the words.</div></div>';
    } else {
      const sum = ranked.reduce((s, a) => s + a.sev, 0);
      ranked.forEach((a) => (a.min = Math.max(4, Math.round(20 * a.sev / sum))));
      planHTML = ranked.map((a, i) => {
        const A = AREA[a.k];
        const exs = A.ex.map((e) => '<div class="coach-ex"><b>' + e[0] + '</b> — ' + e[1] + '</div>').join("");
        return '<div class="coach-area"><div class="coach-h"><span class="pri p' + (i + 1) + '">Priority ' + (i + 1) + '</span>' +
          '<b>' + A.title + '</b><span class="coach-min">~' + a.min + ' min</span></div>' +
          '<p class="coach-say">' + A.say + '</p><p class="coach-fix">' + A.fix + '</p>' + exs + '</div>';
      }).join("");
    }

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
      '<div class="coach"><h4>Your adaptive practice plan</h4>' +
        '<p class="micro">Prescribed from this take — the areas that need it most get the most time.</p>' +
        planHTML + '</div>' +
        '<p class="micro" style="margin-top:8px">Graded against your uploaded score. Green = in tune, ' +
        'amber = out of tune, red = wrong note, grey = didn’t sound; ∿ marks detected vibrato.</p>';
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
