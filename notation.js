// Instrument-aware engraved notation, served as pre-rendered static SVGs.
// The SVGs are engraved offline with Verovio (the engine behind real notation
// sites) into notation/{family}-{kind}.svg, so they are professionally typeset
// and can never clip. This file just picks the right file per exercise + instrument.
(function () {
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
  const famOf = () => (INSTR[current] || INSTR["Concert (C)"]).fam;
  const capOf = () => (INSTR[current] || {}).cap || "";

  const KINDS = new Set(["overtone", "scale", "thirds", "chromatic",
                         "legato", "staccato", "slur2tongue2", "tongueslurtongue"]);

  function notationKind(name, category) {
    const s = ((name || "") + " " + (category || "")).toLowerCase().replace(/[–—]/g, "-");
    const has = (...w) => w.some((k) => s.includes(k));
    if (has("breath", "diaphrag", "straw", "terracing", "dynamic terrac")) return null;
    if (has("overtone", "lip slur", "lip flex", "lip-flex", "partial", "flute harmonic", "bugle")) return "overtone";
    if (s.includes("harmonic") && !s.includes("scale") && !s.includes("minor")) return "overtone";
    if (has("tongue-slur-tongue")) return "tongueslurtongue";
    if (has("slur") && has("tongue")) return "slur2tongue2";
    if (has("legato", "all-slur", "all slur", "slurred scale", "slur scale")) return "legato";
    if (has("staccato", "tonguing", "tongued", "detache", "détaché", "marcato", "accent")) return "staccato";
    if (has("chromatic")) return "chromatic";
    if (has("thirds", "in thirds", "broken thirds", "interval")) return "thirds";
    if (has("scale", "arpeggio", "hanon", "czerny", "five-finger", "five finger",
            "schradieck", "caged", "major", "minor", "mode", "pentatonic")) return "scale";
    return null;
  }

  function drawOne(el, kind) {
    if (!KINDS.has(kind)) return false;
    el.innerHTML = '<img class="vfimg" alt="' + kind + ' notation" loading="lazy" ' +
      'src="' + famOf() + '-' + kind + '.svg?v=2">';
    el.setAttribute("data-done", "1");
    return true;
  }

  function renderNotation(root) {
    (root || document).querySelectorAll(".vfwrap[data-vf]:not([data-done])")
      .forEach((el) => drawOne(el, el.getAttribute("data-vf")));
  }

  function setInstrument(name) { if (INSTR[name]) current = name; }

  window.notationKind = notationKind;
  window.renderNotation = renderNotation;
  window.Notation = {
    setInstrument, caption: capOf, instruments: () => Object.keys(INSTR), current: () => current,
  };
})();
