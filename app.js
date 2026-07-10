const API = (window.__API_BASE__ || "").replace(/\/$/, "");
const $ = (id) => document.getElementById(id);

const DETECT = [
  ["Intonation", "flat / sharp notes vs the pros"],
  ["Dynamics", "too loud or too soft"],
  ["Tone", "bright / harsh vs dull / covered"],
  ["Timbre", "breathy / airy vs pressed"],
  ["Tempo", "overall too fast or slow"],
  ["Vibrato", "much wider / narrower or absent"],
];

function setStatus(msg, busy) {
  $("status").textContent = msg || "";
  $("runUpload").disabled = !!busy;
  $("runDemo").disabled = !!busy;
}

async function health() {
  try {
    const r = await fetch(API + "/api/health");
    const d = await r.json();
    $("apihint").textContent = "Analysis API connected · " + d.exercises + " exercises loaded.";
  } catch (e) {
    $("apihint").innerHTML = "⚠ Analysis API not reachable at <code>" + (API || "same origin") +
      "</code>. Set the URL in <code>config.js</code>.";
  }
}

function renderResult(d) {
  $("results").hidden = false;
  $("resTitle").textContent = "Diagnosis — " + d.name;
  const tr = d.tempo_ratio;
  const pill = $("tempoPill");
  if (Math.abs(tr - 1) > 0.05) {
    pill.className = "pill warn";
    pill.textContent = "Tempo: " + Math.round(Math.abs(tr - 1) * 100) + "% " +
      (tr > 1 ? "slower" : "faster") + " than pros";
  } else { pill.className = "pill ok"; pill.textContent = "Tempo: in range"; }

  const fw = $("findings"); fw.innerHTML = "";
  if (!d.findings.length && !d.vibrato_msgs.length) {
    fw.innerHTML = '<div class="finding"><span class="tag">clean</span>' +
      'No sustained problems — inside the professional corridor.</div>';
  }
  d.vibrato_msgs.forEach((m) => {
    fw.insertAdjacentHTML("beforeend",
      '<div class="finding"><span class="tag">vibrato</span>' + m + '</div>');
  });
  d.findings.forEach((f) => {
    const where = f.t0 != null ? (f.t0 + "–" + f.t1 + "s") : (f.pos[0] + "–" + f.pos[1] + "%");
    fw.insertAdjacentHTML("beforeend",
      '<div class="finding"><span class="tag">' + f.category + '</span>' +
      '<span>' + f.label + ' <span class="micro">(' + f.value + ')</span></span>' +
      '<span class="where">' + where + '</span></div>');
  });

  $("plot").src = d.plot;

  const pw = $("plan"); pw.innerHTML = "";
  if (!d.plan.length) { pw.innerHTML = '<p class="micro">No exercises needed — keep maintaining with daily long tones.</p>'; }
  d.plan.forEach((p, i) => {
    let exs = p.exercises.map((e) => {
      const nk = (window.notationKind && notationKind(e.name, e.category)) || "";
      const dg = nk ? "" : ((window.diagramFor && diagramFor(e.name, e.category)) || "");
      const media = nk ? '<div class="vfwrap" data-vf="' + nk + '"></div>'
                       : (dg ? '<div class="dgwrap">' + dg + '</div>' : "");
      return '<div class="ex"><div class="exname">' + e.name + '</div>' +
        '<div class="meta">' + e.category + ' · ' + e.difficulty + ' · develops ' + e.develops + '</div>' +
        media +
        '<div class="how">' + e.how + '</div></div>';
    }).join("");
    pw.insertAdjacentHTML("beforeend",
      '<div class="planitem"><div class="prob">' + (i + 1) + '. ' + p.problem + '</div>' + exs + '</div>');
  });
  if (window.renderNotation) renderNotation(pw);
  $("results").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function runDemo() {
  setStatus("Running the demo analysis…", true);
  try {
    const fd = new FormData();
    fd.append("instrument", $("instrument").value);
    const r = await fetch(API + "/api/demo", { method: "POST", body: fd });
    if (!r.ok) throw new Error("api");
    renderResult(await r.json());
    setStatus("Demo complete.", false);
    return;
  } catch (e) { /* API offline - fall back to a precomputed sample */ }
  try {
    const r = await fetch("./demo_result.json");
    if (!r.ok) throw new Error("sample");
    renderResult(await r.json());
    setStatus("Showing a precomputed sample. Connect the analysis API for live analysis of your own recordings.", false);
  } catch (e) { setStatus("Demo unavailable.", false); }
}

let proFiles = [];
function renderProList() {
  const ul = $("proList");
  ul.innerHTML = proFiles.map((f, i) =>
    '<li><span>' + f.name + '</span><button data-i="' + i + '" title="remove">x</button></li>').join("");
  ul.querySelectorAll("button").forEach((b) =>
    b.onclick = () => { proFiles.splice(+b.dataset.i, 1); renderProList(); });
}
$("pros").addEventListener("change", (e) => {
  for (const f of e.target.files) {
    if (!proFiles.some((p) => p.name === f.name && p.size === f.size)) proFiles.push(f);
  }
  e.target.value = "";
  renderProList();
});

// ---- shrink audio in the browser before upload (decode -> 16k mono -> <=45s WAV) ----
function _encodeWav(samples, sr) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE");
  w(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sr, true);
  view.setUint32(28, sr * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  w(36, "data"); view.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view], { type: "audio/wav" });
}

async function audioToSmallWav(file, maxSec = 45, sr = 16000) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const actx = new AC();
  const decoded = await actx.decodeAudioData(await file.arrayBuffer());
  actx.close();
  const dur = Math.min(maxSec, decoded.duration);
  const length = Math.max(1, Math.ceil(dur * sr));
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const offline = new OAC(1, length, sr);   // 1 channel = auto downmix to mono
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  return _encodeWav(rendered.getChannelData(0), sr);
}

async function runUpload() {
  const stu = window.__recordedBlob || $("student").files[0];
  const pros = proFiles;
  if (!stu) return setStatus("Record a take above, or choose a file first.", false);
  if (pros.length < 2) return setStatus("Add at least 2 professional reference recordings (you have " + pros.length + ").", false);
  try {
    setStatus("Preparing audio (shrinking files for upload)…", true);
    const fd = new FormData();
    fd.append("student", await audioToSmallWav(stu), "student.wav");
    for (const p of pros) fd.append("pros", await audioToSmallWav(p), "pro.wav");
    fd.append("instrument", $("instrument").value);
    setStatus("Analysing…", true);
    const r = await fetch(API + "/api/analyze", { method: "POST", body: fd });
    if (!r.ok) throw new Error(await r.text());
    renderResult(await r.json());
    setStatus("Analysis complete.", false);
  } catch (e) { setStatus("Analysis failed: " + e.message, false); }
}

let EXDB = null, activeCat = "All";
function renderChips() {
  $("detectChips").innerHTML = DETECT.map((d) =>
    '<span class="chip"><b>' + d[0] + '</b> — ' + d[1] + '</span>').join("");
}
function renderExercises() {
  if (!EXDB) return;
  const cats = ["All", ...Object.keys(EXDB.categories)];
  $("catFilters").innerHTML = cats.map((c) =>
    '<button class="fbtn' + (c === activeCat ? " active" : "") + '" data-c="' + c + '">' + c + '</button>').join("");
  $("catFilters").querySelectorAll(".fbtn").forEach((b) =>
    b.onclick = () => { activeCat = b.dataset.c; renderExercises(); });
  const list = EXDB.exercises.filter((e) => activeCat === "All" || e.category === activeCat);
  $("exGrid").innerHTML = list.map((e) => {
    const nk = (window.notationKind && notationKind(e.exercise, e.category)) || "";
    const dg = nk ? "" : ((window.diagramFor && diagramFor(e.exercise, e.category)) || "");
    const media = nk ? '<div class="vfwrap" data-vf="' + nk + '"></div>'
                     : (dg ? '<div class="dgwrap">' + dg + '</div>' : "");
    const row = (lbl, val) => val ? '<div class="exrow"><span class="exlbl">' + lbl + '</span><span>' + val + '</span></div>' : '';
    return '<div class="excard"><span class="diff">' + e.difficulty + '</span>' +
      '<div class="cat">' + e.category + '</div><h4>' + e.exercise + '</h4>' +
      media +
      row('Develops', e.primary) +
      row('How', e.how) +
      row('Pro&nbsp;tip', e.cues) +
      row('Level&nbsp;up', e.progress) +
      '</div>';
  }).join("");
  if (window.renderNotation) renderNotation($("exGrid"));
}
function initInstrumentPicker() {
  const sel = $("exInstrument"), cap = $("exCap");
  if (!sel || !window.Notation) return;
  sel.innerHTML = window.Notation.instruments().map((n) =>
    '<option' + (n === window.Notation.current() ? " selected" : "") + ">" + n + "</option>").join("");
  if (cap) cap.textContent = window.Notation.caption();
  sel.addEventListener("change", () => {
    window.Notation.setInstrument(sel.value);
    if (cap) cap.textContent = window.Notation.caption();
    renderExercises();
  });
}

async function loadExercises() {
  const sources = ["./exercise_database.json", API + "/api/exercises"];
  for (const url of sources) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      EXDB = await r.json();
      renderExercises();
      return;
    } catch (e) { /* try next source */ }
  }
  $("exGrid").innerHTML = '<p class="micro">Exercise library unavailable.</p>';
}

$("student").addEventListener("change", (e) => {
  if (e.target.files[0]) {
    window.__recordedBlob = null;
    const label = $("studentChosen");
    if (label) label.textContent = "Using uploaded file: " + e.target.files[0].name;
  }
});

$("runDemo").onclick = runDemo;
$("runUpload").onclick = runUpload;
renderChips();
initInstrumentPicker();
health();
loadExercises();
