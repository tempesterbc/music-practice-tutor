// Sheet-music upload + engraved rendering.
// Renders MusicXML (.xml/.musicxml/.mxl) with OpenSheetMusicDisplay, and parses
// the notes ourselves (reliable) into an expected-note list used by play-along
// and score-based analysis. MIDI (.mid) is parsed to notes via @tonejs/midi.
(function () {
  const $ = (id) => document.getElementById(id);
  const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  let osmd = null;
  let notes = [];          // [{rest, midi, t, dur}]  t & dur in quarter-note units
  let title = "";
  const listeners = [];

  window.ScoreView = {
    notes: () => notes,
    osmd: () => osmd,
    title: () => title,
    loaded: () => notes.length > 0,
    onLoad: (fn) => listeners.push(fn),
    loadFile: (f) => loadFile(f),
  };

  // ---- MusicXML -> note list (single melodic line; handles rests, chords, alter) ----
  function xmlToNotes(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    const out = [];
    const part = doc.getElementsByTagName("part")[0];
    if (!part) return out;
    let divisions = 1, t = 0;
    const work = doc.getElementsByTagName("work-title")[0];
    title = work ? work.textContent.trim() : "";
    for (const m of part.getElementsByTagName("measure")) {
      const dv = m.querySelector("attributes > divisions");
      if (dv) divisions = +dv.textContent || divisions;
      for (const n of m.getElementsByTagName("note")) {
        const durEl = n.getElementsByTagName("duration")[0];
        const durQ = durEl ? (+durEl.textContent) / divisions : 0;
        const isChord = n.getElementsByTagName("chord").length > 0;
        if (isChord) continue;                       // keep the top/first line only
        const isRest = n.getElementsByTagName("rest").length > 0;
        if (isRest) { out.push({ rest: true, midi: null, t, dur: durQ }); t += durQ; continue; }
        const p = n.getElementsByTagName("pitch")[0];
        if (!p) { t += durQ; continue; }
        const step = p.getElementsByTagName("step")[0].textContent.trim();
        const oct = +p.getElementsByTagName("octave")[0].textContent;
        const alterEl = p.getElementsByTagName("alter")[0];
        const alter = alterEl ? +alterEl.textContent : 0;
        const midi = 12 * (oct + 1) + STEP[step] + alter;
        out.push({ rest: false, midi, t, dur: durQ });
        t += durQ;
      }
    }
    return out;
  }

  async function unzipMxl(file) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    let path = null;
    const cont = zip.file("META-INF/container.xml");
    if (cont) {
      const c = await cont.async("string");
      const d = new DOMParser().parseFromString(c, "application/xml");
      const rf = d.querySelector("rootfile");
      if (rf) path = rf.getAttribute("full-path");
    }
    if (!path || !zip.file(path)) {
      path = Object.keys(zip.files).find((f) => /\.(xml|musicxml)$/i.test(f) && !/^META-INF/i.test(f));
    }
    return zip.file(path).async("string");
  }

  async function midiToNotes(file) {
    const Midi = window.Midi || (window["@tonejs/midi"] && window["@tonejs/midi"].Midi);
    if (!Midi) throw new Error("MIDI reader not loaded");
    const midi = new Midi(await file.arrayBuffer());
    const ppqTempo = midi.header.tempos[0] ? midi.header.tempos[0].bpm : 120;
    // pick the track with the most notes
    let track = midi.tracks.reduce((a, b) => (b.notes.length > a.notes.length ? b : a), midi.tracks[0]);
    const secPerQuarter = 60 / ppqTempo;
    const arr = (track ? track.notes : []).map((n) => ({
      rest: false, midi: n.midi, t: n.time / secPerQuarter, dur: n.duration / secPerQuarter,
    })).sort((a, b) => a.t - b.t);
    title = (track && track.name) || file.name;
    return arr;
  }

  function ensureOSMD() {
    if (osmd) return osmd;
    const OSMD = window.opensheetmusicdisplay && window.opensheetmusicdisplay.OpenSheetMusicDisplay;
    if (!OSMD) return null;
    osmd = new OSMD($("score"), { autoResize: true, backend: "svg", drawingParameters: "compacttight" });
    return osmd;
  }

  async function loadFile(file) {
    const status = $("scoreStatus");
    const name = (file.name || "").toLowerCase();
    status.textContent = "Reading " + file.name + "…";
    try {
      if (name.endsWith(".mid") || name.endsWith(".midi")) {
        notes = await midiToNotes(file);
        $("score").innerHTML =
          '<p class="micro" style="color:#333;margin:8px">MIDI loaded — ' +
          notes.filter((n) => !n.rest).length +
          ' notes read for play-along and analysis. (Upload MusicXML to also see the engraved score.)</p>';
      } else {
        const xml = name.endsWith(".mxl") ? await unzipMxl(file) : await file.text();
        notes = xmlToNotes(xml);
        const o = ensureOSMD();
        if (o) { await o.load(xml); o.render(); o.cursor.show(); o.cursor.reset(); }
      }
      const nNotes = notes.filter((n) => !n.rest).length;
      status.textContent = (title ? "“" + title + "” — " : "") + nNotes + " notes ready. Set a tempo, then Play along or record.";
      listeners.forEach((fn) => { try { fn(notes); } catch (e) {} });
    } catch (e) {
      status.textContent = "Couldn't read that file: " + e.message + ". Try exporting MusicXML (.musicxml) from MuseScore.";
      notes = [];
    }
  }

  function init() {
    const inp = $("scoreFile");
    if (!inp) return;
    inp.addEventListener("change", (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
