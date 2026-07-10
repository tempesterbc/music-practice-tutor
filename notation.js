// Engraved music notation for note-chart + articulation exercises (VexFlow, MIT).
// Instrument-aware: picks clef, register and a transposition caption so the charts
// are right for the player's instrument. We generate the notation ourselves, so
// there are no image-licensing issues.
(function () {
  // ---- instrument families: clef + register-appropriate note sets ----
  const FAMILY = {
    treble: {
      clef: "treble",
      overtone: [["c/3"], ["c/4"], ["g/4"], ["c/5"], ["e/5"], ["g/5"]],
      onums: [1, 2, 3, 4, 5, 6],
      scale: ["c/4", "d/4", "e/4", "f/4", "g/4", "a/4", "b/4", "c/5"],
      thirds: [["c/4", "e/4"], ["d/4", "f/4"], ["e/4", "g/4"], ["f/4", "a/4"], ["g/4", "b/4"], ["a/4", "c/5"]],
      chromatic: [["c/4"], ["c#/4"], ["d/4"], ["d#/4"], ["e/4"], ["f/4"], ["f#/4"], ["g/4"]],
      artic: ["c/4", "d/4", "e/4", "f/4", "g/4", "a/4", "b/4", "c/5"],
    },
    bass: {
      clef: "bass",
      overtone: [["bb/1"], ["bb/2"], ["f/3"], ["bb/3"], ["d/4"], ["f/4"], ["ab/4"], ["bb/4"]],
      onums: [1, 2, 3, 4, 5, 6, 7, 8],
      scale: ["c/3", "d/3", "e/3", "f/3", "g/3", "a/3", "b/3", "c/4"],
      thirds: [["c/3", "e/3"], ["d/3", "f/3"], ["e/3", "g/3"], ["f/3", "a/3"], ["g/3", "b/3"], ["a/3", "c/4"]],
      chromatic: [["c/3"], ["c#/3"], ["d/3"], ["d#/3"], ["e/3"], ["f/3"], ["f#/3"], ["g/3"]],
      artic: ["c/3", "d/3", "e/3", "f/3", "g/3", "a/3", "b/3", "c/4"],
    },
  };
  const INSTR = {
    "Concert (C)": { fam: "treble", cap: "" },
    "Flute": { fam: "treble", cap: "Concert pitch (C instrument)." },
    "Oboe": { fam: "treble", cap: "Concert pitch (C instrument)." },
    "Violin": { fam: "treble", cap: "Concert pitch (C instrument)." },
    "B♭ Clarinet": { fam: "treble", cap: "B♭ instrument — you read this; it sounds a whole step lower." },
    "B♭ Trumpet": { fam: "treble", cap: "B♭ instrument — you read this; it sounds a whole step lower." },
    "Alto Sax (E♭)": { fam: "treble", cap: "E♭ instrument — you read this; it sounds a major 6th lower." },
    "Horn (F)": { fam: "treble", cap: "F instrument — you read this; it sounds a perfect 5th lower." },
    "Bassoon": { fam: "bass", cap: "Concert pitch (bass clef)." },
    "Trombone / Low brass": { fam: "bass", cap: "Concert pitch (bass clef)." },
  };
  let current = "Concert (C)";
  const famOf = () => FAMILY[(INSTR[current] || INSTR["Concert (C)"]).fam];
  const capOf = () => (INSTR[current] || {}).cap || "";

  // articulation patterns over an 8-note scale run
  const ART = {
    legato: { slurs: [[0, 7]], staccato: [] },
    staccato: { slurs: [], staccato: [0, 1, 2, 3, 4, 5, 6, 7] },
    slur2tongue2: { slurs: [[0, 1], [4, 5]], staccato: [2, 3, 6, 7] },
    tongueslurtongue: { slurs: [[1, 2], [5, 6]], staccato: [0, 3, 4, 7] },
  };

  // ---- which exercises get notation, and which kind ----
  function notationKind(name, category) {
    const s = ((name || "") + " " + (category || "")).toLowerCase();
    const has = (...w) => w.some((k) => s.includes(k));
    // breath / dynamics keep their schematic diagram
    if (has("breath", "diaphrag", "straw", "terracing", "dynamic terrac")) return null;
    // overtone / lip work first (so "lip slurs" isn't caught by the slur rule)
    if (has("overtone", "lip slur", "lip flex", "lip-flex", "partial", "flute harmonic", "bugle"))
      return "overtone";
    if (s.includes("harmonic") && !s.includes("scale") && !s.includes("minor")) return "overtone";
    // articulation patterns
    if (has("tongue-slur-tongue", "tongue slur tongue")) return "tongueslurtongue";
    if (has("slur") && has("tongue")) return "slur2tongue2";
    if (has("legato", "all-slur", "all slur", "slurred scale", "slur scale")) return "legato";
    if (has("staccato", "tonguing", "tongued", "detache", "détaché", "marcato", "accent")) return "staccato";
    // note charts
    if (has("chromatic")) return "chromatic";
    if (has("thirds", "in thirds", "broken thirds", "interval")) return "thirds";
    if (has("scale", "arpeggio", "hanon", "czerny", "five-finger", "five finger",
            "schradieck", "caged", "major", "minor", "mode", "pentatonic")) return "scale";
    return null;
  }

  function keyAccidental(k) { return k[1] === "b" ? "b" : k[1] === "#" ? "#" : null; }

  function drawChart(el, kind, fam) {
    const VF = Vex.Flow;
    const spec = kind === "overtone" ? { keys: fam.overtone, nums: fam.onums, h: fam.clef === "bass" ? 132 : 120 }
      : kind === "scale" ? { keys: fam.scale.map((k) => [k]), h: 116 }
      : kind === "thirds" ? { keys: fam.thirds, h: 116 }
      : kind === "chromatic" ? { keys: fam.chromatic, h: 116 } : null;
    if (!spec) return false;
    const W = Math.max(200, el.clientWidth || 260), H = spec.h;
    const r = new VF.Renderer(el, VF.Renderer.Backends.SVG); r.resize(W, H);
    const ctx = r.getContext();
    const stave = new VF.Stave(2, 14, W - 8); stave.addClef(fam.clef); stave.setContext(ctx).draw();
    const notes = spec.keys.map((keys, i) => {
      const n = new VF.StaveNote({ clef: fam.clef, keys: keys, duration: "q" });
      keys.forEach((k, ki) => { const acc = keyAccidental(k); if (acc) n.addModifier(new VF.Accidental(acc), ki); });
      if (spec.nums) {
        const a = new VF.Annotation(String(spec.nums[i]));
        a.setVerticalJustification(VF.Annotation.VerticalJustify.TOP);
        n.addModifier(a, 0);
      }
      return n;
    });
    VF.Formatter.FormatAndDraw(ctx, stave, notes);
    return true;
  }

  function drawArtic(el, kind, fam) {
    const VF = Vex.Flow;
    const pat = ART[kind]; if (!pat) return false;
    const W = Math.max(200, el.clientWidth || 260), H = 112;
    const r = new VF.Renderer(el, VF.Renderer.Backends.SVG); r.resize(W, H);
    const ctx = r.getContext();
    const stave = new VF.Stave(2, 18, W - 8); stave.addClef(fam.clef).setContext(ctx).draw();
    const notes = fam.artic.map((k) => new VF.StaveNote({ clef: fam.clef, keys: [k], duration: "8" }));
    pat.staccato.forEach((i) => notes[i].addModifier(new VF.Articulation("a.").setPosition(3), 0));
    const beams = VF.Beam.generateBeams(notes);
    VF.Formatter.FormatAndDraw(ctx, stave, notes);
    beams.forEach((b) => b.setContext(ctx).draw());
    pat.slurs.forEach(([a, b]) => { new VF.Curve(notes[a], notes[b], {}).setContext(ctx).draw(); });
    return true;
  }

  function drawOne(el, kind) {
    if (!window.Vex || !window.Vex.Flow) return false;
    el.innerHTML = "";
    const fam = famOf();
    let ok;
    if (ART[kind]) ok = drawArtic(el, kind, fam);
    else ok = drawChart(el, kind, fam);
    if (!ok) return false;
    const svg = el.querySelector("svg");
    if (svg) { svg.style.width = "100%"; svg.style.height = "auto"; svg.removeAttribute("height"); }
    el.setAttribute("data-done", "1");
    return true;
  }

  function renderNotation(root) {
    const scope = root || document;
    scope.querySelectorAll(".vfwrap[data-vf]:not([data-done])").forEach((el) => drawOne(el, el.getAttribute("data-vf")));
  }

  function setInstrument(name) { if (INSTR[name]) current = name; }

  window.notationKind = notationKind;
  window.renderNotation = renderNotation;
  window.Notation = {
    setInstrument, caption: capOf, instruments: () => Object.keys(INSTR), current: () => current,
  };
})();
