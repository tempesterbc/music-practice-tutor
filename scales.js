// Scale explorer: engraves any scale in any key with the correct key signature,
// transposed for the chosen instrument. Uses Verovio (professional engraver) in
// the browser, so there is no fixed image set — every key/scale is real notation.
(function () {
  const $ = (id) => document.getElementById(id);

  // instrument -> clef, transposition interval (written = concert + iv semitones)
  const INSTR = {
    "Concert (C)": { clef: "treble", iv: 0, tag: "" },
    "Flute": { clef: "treble", iv: 0, tag: "C instrument" },
    "Oboe": { clef: "treble", iv: 0, tag: "C instrument" },
    "Violin": { clef: "treble", iv: 0, tag: "C instrument" },
    "B♭ Clarinet": { clef: "treble", iv: 2, tag: "B♭ — sounds a whole step lower" },
    "B♭ Trumpet": { clef: "treble", iv: 2, tag: "B♭ — sounds a whole step lower" },
    "Tenor Sax (B♭)": { clef: "treble", iv: 2, tag: "B♭ — sounds a step + octave lower" },
    "Alto Sax (E♭)": { clef: "treble", iv: 9, tag: "E♭ — sounds a major 6th lower" },
    "Horn (F)": { clef: "treble", iv: 7, tag: "F — sounds a perfect 5th lower" },
    "Bassoon": { clef: "bass", iv: 0, tag: "C instrument" },
    "Trombone / Low brass": { clef: "bass", iv: 0, tag: "C instrument" },
  };

  const PC_LABEL = { 0: "C", 1: "D♭", 2: "D", 3: "E♭", 4: "E", 5: "F", 6: "G♭", 7: "G", 8: "A♭", 9: "A", 10: "B♭", 11: "B" };
  const MAJ_NAME = { 0: "C", 1: "Db", 2: "D", 3: "Eb", 4: "E", 5: "F", 6: "Gb", 7: "G", 8: "Ab", 9: "A", 10: "Bb", 11: "B" };
  const MAJ_FIFTHS = { "Cb": -7, "Gb": -6, "Db": -5, "Ab": -4, "Eb": -3, "Bb": -2, "F": -1, "C": 0, "G": 1, "D": 2, "A": 3, "E": 4, "B": 5, "F#": 6, "C#": 7 };
  const MIN_NAME = { 0: "C", 1: "C#", 2: "D", 3: "Eb", 4: "E", 5: "F", 6: "F#", 7: "G", 8: "G#", 9: "A", 10: "Bb", 11: "B" };
  const MIN_FIFTHS = { "C": -3, "C#": 4, "D": -1, "Eb": -6, "E": 1, "F": -4, "F#": 3, "G": -2, "G#": 5, "A": 0, "Bb": -5, "B": 2 };

  const LET = ["C", "D", "E", "F", "G", "A", "B"];
  const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
  const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];

  const TYPES = ["Major", "Natural minor", "Harmonic minor", "Melodic minor", "Chromatic"];
  const isMinor = (t) => t.indexOf("minor") >= 0;

  // preset scale SETS — the requirements essentially every district/all-state
  // audition draws from. Circle-of-fifths order.
  const CIRCLE = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
  const set = (type) => CIRCLE.map((pc) => ({ pc, type }));
  const PRESETS = {
    "— none (pick manually) —": null,
    "All 12 major scales": set("Major"),
    "All natural minor scales": set("Natural minor"),
    "All harmonic minor scales": set("Harmonic minor"),
    "All melodic minor scales": set("Melodic minor"),
    "Chromatic scale": [{ pc: 0, type: "Chromatic" }],
    "Full audition set (12 majors + chromatic)": set("Major").concat([{ pc: 0, type: "Chromatic" }]),
    "Majors + all 3 minor forms (48)": set("Major").concat(set("Natural minor"), set("Harmonic minor"), set("Melodic minor")),
  };
  let presetItems = null, presetIdx = 0;

  function keysigAlter(fifths) {
    const m = {};
    if (fifths > 0) SHARP_ORDER.slice(0, fifths).forEach((l) => (m[l] = 1));
    else if (fifths < 0) FLAT_ORDER.slice(0, -fifths).forEach((l) => (m[l] = -1));
    return m;
  }

  // diatonic scale (major-shaped) from a tonic letter + key signature, ascending 1 octave
  function diatonic(tonicLetter, fifths, startOct) {
    const alt = keysigAlter(fifths);
    const ti = LET.indexOf(tonicLetter);
    const notes = [];
    let o = startOct;
    for (let i = 0; i <= 7; i++) {
      const li = (ti + i) % 7;
      if (i > 0 && li === 0) o++;
      notes.push({ step: LET[li], oct: o, alter: alt[LET[li]] || 0 });
    }
    return notes;
  }

  function chromatic(startOct) {
    const seq = [["C", 0], ["C", 1], ["D", 0], ["D", 1], ["E", 0], ["F", 0], ["F", 1], ["G", 0], ["G", 1], ["A", 0], ["A", 1], ["B", 0], ["C", 0]];
    return seq.map(([s, a], i) => ({ step: s, alter: a, oct: startOct + (i === 12 ? 1 : 0) }));
  }

  // build the scale for a WRITTEN pitch-class + type
  function buildScale(writtenPc, type, clef) {
    const startOct = clef === "bass" ? 3 : 4;
    if (type === "Chromatic") return { notes: chromatic(startOct), fifths: 0, name: PC_LABEL[writtenPc] + " chromatic" };
    if (!isMinor(type)) {
      const name = MAJ_NAME[writtenPc], fifths = MAJ_FIFTHS[name];
      return { notes: diatonic(name[0], fifths, startOct), fifths, name: name.replace("b", "♭").replace("#", "♯") + " major" };
    }
    const name = MIN_NAME[writtenPc], fifths = MIN_FIFTHS[name];
    const notes = diatonic(name[0], fifths, startOct);           // natural minor
    if (type === "Harmonic minor") notes[6].alter += 1;
    if (type === "Melodic minor") { notes[5].alter += 1; notes[6].alter += 1; }
    const disp = name.replace("b", "♭").replace("#", "♯") + " " + type.toLowerCase();
    return { notes, fifths, name: disp };
  }

  function noteXML(n) {
    const alter = n.alter ? `<alter>${n.alter}</alter>` : "";
    return `<note><pitch><step>${n.step}</step>${alter}<octave>${n.oct}</octave></pitch>` +
      `<duration>2</duration><voice>1</voice><type>quarter</type></note>`;
  }
  function scoreXML(clef, fifths, notes) {
    const clefXML = clef === "bass" ? "<sign>F</sign><line>4</line>" : "<sign>G</sign><line>2</line>";
    const per = 4;
    let measures = "", i = 0, m = 1;
    while (i < notes.length) {
      const grp = notes.slice(i, i + per);
      const attrs = i === 0
        ? `<attributes><divisions>2</divisions><key><fifths>${fifths}</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef>${clefXML}</clef></attributes>`
        : "";
      measures += `<measure number="${m}">${attrs}${grp.map(noteXML).join("")}</measure>`;
      i += per; m++;
    }
    return `<?xml version="1.0"?><score-partwise version="3.1"><part-list><score-part id="P1">` +
      `<part-name></part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
  }

  // ---- Verovio (browser) ----
  let tk = null;
  function loadVerovio() {
    return new Promise((resolve) => {
      // The toolkit function exists before the WASM runtime is ready, so poll by
      // actually trying to construct it; it throws until the runtime is initialized.
      const tryMake = () => {
        if (window.verovio && typeof window.verovio.toolkit === "function") {
          try {
            const t = new verovio.toolkit();
            t.setOptions({ adjustPageHeight: true, breaks: "none", scale: 40, footer: "none", header: "none",
              pageMarginTop: 8, pageMarginBottom: 8, pageMarginLeft: 8, pageMarginRight: 8 });
            tk = t;
            return resolve(true);
          } catch (e) { /* runtime not ready yet — keep polling */ }
        }
        setTimeout(tryMake, 150);
      };
      if (!document.getElementById("verovio-cdn")) {
        const s = document.createElement("script");
        s.id = "verovio-cdn";
        s.src = "https://cdn.jsdelivr.net/npm/verovio@4.3.1/dist/verovio-toolkit-wasm.js";
        document.head.appendChild(s);
      }
      tryMake();
    });
  }

  function render() {
    if (!tk) return;
    const inst = INSTR[$("scInstrument").value] || INSTR["Concert (C)"];
    let concertPc, type;
    if (presetItems) {
      const it = presetItems[presetIdx];
      concertPc = it.pc; type = it.type;
      if ($("scKey")) $("scKey").value = it.pc;
      if ($("scType")) $("scType").value = it.type;
      $("scCount").textContent = "Scale " + (presetIdx + 1) + " of " + presetItems.length;
    } else {
      concertPc = +$("scKey").value;
      type = $("scType").value;
    }
    const writtenPc = (concertPc + inst.iv) % 12;
    const sc = buildScale(writtenPc, type, inst.clef);
    const xml = scoreXML(inst.clef, sc.fifths, sc.notes);
    tk.loadData(xml);
    const svg = tk.renderToSVG(1);          // already sized (width/height in px)
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const box = $("scScore");
    if (box._url) URL.revokeObjectURL(box._url);
    box._url = url;
    box.innerHTML = '<img alt="' + sc.name + '" style="display:block;width:100%;height:auto;max-height:180px" src="' + url + '">';
    const cap = $("scCap");
    if (inst.iv === 0) cap.textContent = sc.name + " — concert pitch.";
    else cap.textContent = "Written " + sc.name + " for " + $("scInstrument").value +
      " (" + inst.tag + "). Concert key: " + PC_LABEL[concertPc] + (isMinor(type) ? " minor" : " major") + ".";
  }

  async function init() {
    const si = $("scInstrument"), sk = $("scKey"), st = $("scType");
    if (!si) return;
    si.innerHTML = Object.keys(INSTR).map((n) => `<option>${n}</option>`).join("");
    sk.innerHTML = Object.keys(PC_LABEL).map((pc) => `<option value="${pc}">${PC_LABEL[pc]}</option>`).join("");
    st.innerHTML = TYPES.map((t) => `<option>${t}</option>`).join("");
    const sp = $("scPreset");
    if (sp) sp.innerHTML = Object.keys(PRESETS).map((n) => `<option>${n}</option>`).join("");
    si.addEventListener("change", render);   // instrument change keeps the preset, just transposes
    const exitPreset = () => { presetItems = null; if (sp) sp.value = Object.keys(PRESETS)[0]; if ($("scStep")) $("scStep").hidden = true; render(); };
    [sk, st].forEach((el) => el.addEventListener("change", exitPreset));
    if (sp) sp.addEventListener("change", () => {
      presetItems = PRESETS[sp.value]; presetIdx = 0;
      if ($("scStep")) $("scStep").hidden = !presetItems;
      render();
    });
    const step = (d) => { if (presetItems) { presetIdx = (presetIdx + d + presetItems.length) % presetItems.length; render(); } };
    if ($("scPrev")) $("scPrev").addEventListener("click", () => step(-1));
    if ($("scNext")) $("scNext").addEventListener("click", () => step(1));
    $("scScore").innerHTML = '<p class="micro" style="color:#333;margin:8px">Loading the engraver…</p>';
    await loadVerovio();
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
