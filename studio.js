// Practice Studio: in-browser metronome + microphone recorder.
// The recorder hands its take to the existing analyzer (window.__recordedBlob).
(function () {
  const $ = (id) => document.getElementById(id);

  // ------------------------------ metronome ------------------------------
  // Web Audio look-ahead scheduler for rock-steady timing.
  const Metro = {
    ac: null, bpm: 90, beats: 4, next: 0, beat: 0, timer: null, running: false,
    onBeat: null, lookahead: 25, ahead: 0.12,
    _click(time, accent) {
      const ac = this.ac;
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = accent ? 1600 : 1000;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(0.6, time + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
      o.connect(g).connect(ac.destination);
      o.start(time); o.stop(time + 0.06);
    },
    _tick() {
      while (this.next < this.ac.currentTime + this.ahead) {
        const accent = (this.beat % this.beats) === 0;
        this._click(this.next, accent);
        if (this.onBeat) {
          const b = this.beat, when = (this.next - this.ac.currentTime) * 1000;
          setTimeout(() => { if (this.running && this.onBeat) this.onBeat(b, accent); }, Math.max(0, when));
        }
        this.next += 60 / this.bpm;
        this.beat++;
      }
      this.timer = setTimeout(() => this._tick(), this.lookahead);
    },
    start() {
      if (this.running) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ac = this.ac || new AC();
      this.ac.resume();
      this.running = true; this.beat = 0;
      this.next = this.ac.currentTime + 0.15;
      this._tick();
    },
    stop() {
      this.running = false;
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    },
  };
  window.Metro = Metro;

  function wireMetronome() {
    const btn = $("metroToggle"), tempo = $("metroTempo"), out = $("metroTempoOut"),
          beats = $("metroBeats"), dot = $("metroDot");
    if (!btn) return;
    const setBpm = () => { Metro.bpm = +tempo.value; out.textContent = tempo.value; };
    tempo.addEventListener("input", setBpm); setBpm();
    beats.addEventListener("change", () => { Metro.beats = +beats.value; });
    Metro.beats = +beats.value;
    Metro.onBeat = (b, accent) => {
      if (!dot) return;
      dot.classList.toggle("accent", accent);
      dot.classList.add("flash");
      setTimeout(() => dot.classList.remove("flash"), 90);
    };
    btn.addEventListener("click", () => {
      if (Metro.running) { Metro.stop(); btn.textContent = "Start metronome"; btn.classList.remove("on"); }
      else { Metro.start(); btn.textContent = "Stop"; btn.classList.add("on"); }
    });
  }

  // ------------------------------ recorder -------------------------------
  let rec = null, chunks = [], stream = null, startedAt = 0, timerId = null;

  function fmt(s) { const m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ":" + String(r).padStart(2, "0"); }

  function wireRecorder() {
    const btn = $("recToggle"), status = $("recStatus"), audio = $("recPlayback"),
          useBtn = $("recUse"), dot = $("recDot");
    if (!btn) return;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        status.textContent = "Microphone blocked. Allow mic access in your browser and try again.";
        return;
      }
      chunks = [];
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
        (m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || "";
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        window.__recordedBlob = blob;
        window.__recordedName = "my-recording";
        audio.src = URL.createObjectURL(blob);
        audio.hidden = false;
        if (useBtn) useBtn.hidden = false;
        status.textContent = "Recorded " + fmt((Date.now() - startedAt) / 1000) + ". Play it back, then analyze.";
        if (dot) dot.classList.remove("live");
      };
      rec.start();
      startedAt = Date.now();
      btn.textContent = "Stop recording";
      btn.classList.add("on");
      if (dot) dot.classList.add("live");
      status.textContent = "Recording… 0:00";
      timerId = setInterval(() => {
        status.textContent = "Recording… " + fmt((Date.now() - startedAt) / 1000);
      }, 500);
    }

    function stop() {
      if (rec && rec.state !== "inactive") rec.stop();
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (timerId) { clearInterval(timerId); timerId = null; }
      btn.textContent = "Record";
      btn.classList.remove("on");
    }

    btn.addEventListener("click", () => {
      if (rec && rec.state === "recording") stop(); else start();
    });

    if (useBtn) useBtn.addEventListener("click", () => {
      // Hand the take to the analyzer and jump there.
      const label = $("studentChosen");
      if (label) label.textContent = "Using your in-browser recording.";
      const target = document.getElementById("analyze");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function init() { wireMetronome(); wireRecorder(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
