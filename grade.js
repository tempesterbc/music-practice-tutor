// Score-based grading + live mistake marking (client-side).
// Reuses the play-along cursor for timing: because the player follows the cursor,
// we know when each note should sound, so we grade each note's pitch from the mic
// in real time (live lamp) and summarise at the end.
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
    if (r.freq > 0 && r.clarity > 0.5) {
      midiFloat = PD().freqToMidi(r.freq);
      if (currentIndex >= 0) (frames[currentIndex] = frames[currentIndex] || []).push(midiFloat);
    }
    updateLamp(midiFloat, expForIndex(currentIndex));
    loopId = setTimeout(loop, 55);
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

  function gradeAndRender() {
    const notes = window.ScoreView.notes();
    const sounding = notes.map((n, i) => ({ midi: n.midi, index: i })).filter((n) => n.midi != null);
    const res = sounding.map((n) => {
      const fr = (frames[n.index] || []).slice().sort((a, b) => a - b);
      if (fr.length < 2) return { midi: n.midi, verdict: "missed", cents: null, played: null };
      const med = fr[Math.floor(fr.length / 2)];
      const cents = (med - n.midi) * 100, a = Math.abs(cents);
      const verdict = a <= 35 ? "good" : (a <= 120 ? "off" : "wrong");
      return { midi: n.midi, verdict, cents, played: med };
    });
    renderReport(res);
  }

  function renderReport(res) {
    const box = $("gradeReport");
    if (!box) return;
    const n = res.length || 1;
    const c = { good: 0, off: 0, wrong: 0, missed: 0 };
    let signed = 0, signedN = 0;
    res.forEach((r) => {
      c[r.verdict]++;
      if (r.cents != null && (r.verdict === "good" || r.verdict === "off")) { signed += r.cents; signedN++; }
    });
    const inTune = Math.round((c.good / n) * 100);
    const avgSigned = signedN ? Math.round(signed / signedN) : 0;

    const tips = [];
    if (c.missed / n > 0.2) tips.push("Several notes didn't sound clearly — slow the tempo and make sure each note speaks before moving on.");
    if (c.wrong / n > 0.1) tips.push("Some wrong pitches — practice the passage slowly and check the notes/fingerings.");
    if (avgSigned < -12) tips.push("You trend flat — long tones against a drone or tuner will pull your pitch center up.");
    else if (avgSigned > 12) tips.push("You trend sharp — relax the air/embouchure and check with a drone.");
    if (c.off / n > 0.25 && Math.abs(avgSigned) <= 12) tips.push("Intonation wanders both directions — slow scales against a drone to lock each pitch.");
    if (!tips.length) tips.push("Clean run — keep it up. Push the tempo a notch and stay this accurate.");

    const chips = res.map((r, i) => {
      const label = PD().midiToName(r.midi);
      const sub = r.verdict === "missed" ? "—"
        : (r.cents > 0 ? "+" : "") + Math.round(r.cents) + "¢";
      return '<span class="notechip" title="' + LABEL[r.verdict] + '" style="background:' + COL[r.verdict] + '">' +
        '<b>' + label + '</b><span>' + sub + '</span></span>';
    }).join("");

    box.hidden = false;
    box.innerHTML =
      '<div class="grade-head"><h4>Score-based results</h4>' +
      '<div class="grade-stats">' +
        '<span class="stat"><b>' + inTune + '%</b> in tune</span>' +
        '<span class="stat"><b>' + c.wrong + '</b> wrong</span>' +
        '<span class="stat"><b>' + c.missed + '</b> missed</span>' +
        '<span class="stat"><b>' + (avgSigned > 0 ? "+" : "") + avgSigned + '¢</b> avg</span>' +
      '</div></div>' +
      '<div class="notechips">' + chips + '</div>' +
      '<div class="grade-tips"><b>What to work on</b><ul>' +
        tips.map((t) => "<li>" + t + "</li>").join("") + "</ul>" +
        '<p class="micro">Every note is graded against your uploaded score. Green = in tune, ' +
        'amber = out of tune, red = wrong note, grey = didn’t sound.</p></div>';
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---- wire into the play-along run ----
  window.addEventListener("resonance:playstart", () => {
    if (!grading) return;
    currentIndex = -1; frames = {};
    const box = $("gradeReport"); if (box) box.hidden = true;
    startMonitor().catch((e) => {
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
