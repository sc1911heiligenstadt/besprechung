// ------------------------------------------------------------------
// Besprechung — LiveKit-Sprach-/Screenshare-Client.
// Zustandslos: kein Nextcloud-Speicher. Ablauf = anmelden (Gateway) →
// Token holen (db.js/fetchLivekitToken) → LiveKit-Room verbinden → reden
// und optional Bildschirm teilen. Vorbild-Look: die übrigen Gateway-Apps.
// ------------------------------------------------------------------

// Die LiveKit-Bibliothek hängt bewusst NICHT fest im <head>: sie kostet 90 KB und
// wird in der Lobby überhaupt nicht gebraucht — erst beim Betreten des Raums.
// Geladen wird deshalb in joinRoom(), gleiche Überlegung wie beim Nutzerfoto, das
// auch erst in enterRoomUI() geholt wird.
//
// ⚠️ Deshalb `let` statt `const`, und deshalb ist LK in der Lobby null. Alle
// übrigen Verwendungsstellen (LK.RoomEvent, LK.Track.Source…) laufen ausschließlich
// nach einem erfolgreichen Beitritt — wer eine neue außerhalb des Raums einbaut,
// muss vorher selbst laden.
let LK = null;

let liveKitLadevorgang = null;
function ladeLiveKit() {
  if (window.LivekitClient) { LK = window.LivekitClient; return Promise.resolve(); }
  if (liveKitLadevorgang) return liveKitLadevorgang;
  liveKitLadevorgang = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/livekit-client@2/dist/livekit-client.umd.min.js";
    s.onload = () => {
      LK = window.LivekitClient || null;
      if (!LK) { liveKitLadevorgang = null; reject(new Error("Video-Bibliothek geladen, aber nicht nutzbar — bitte neu laden.")); return; }
      resolve();
    };
    s.onerror = () => {
      liveKitLadevorgang = null; // nächster Versuch darf es erneut probieren
      reject(new Error("Video-Bibliothek konnte nicht geladen werden — Internetverbindung prüfen."));
    };
    document.head.appendChild(s);
  });
  return liveKitLadevorgang;
}

let me = null;            // { username, vorname, nachname, canEdit, ... } vom Gateway
let isModerator = false;  // = me.canEdit (Bearbeiter-Gruppen der Besprechung) → darf kicken/stummschalten
let room = null;          // aktive LivekitClient.Room-Instanz (oder null)
const speaking = new Set(); // Identities, die gerade sprechen
let stageTrack = null;    // aktuell auf der Bühne gezeigter ScreenShare-Track
let stageSid = null;      // dessen trackSid (Doppel-Attach vermeiden)
let stageWatchdog = null; // siehe startStageWatchdog() -- Selbstheilung bei unsauber beendetem Screenshare
// Aufnahme (lokal im Browser via MediaRecorder — kein Server/Egress)
let recorder = null;       // MediaRecorder oder null
let recChunks = [];
let recMimeType = "";
let recAudioCtx = null;    // AudioContext zum Mischen aller Stimmen
let recDest = null;        // MediaStreamAudioDestinationNode (Ergebnis des Mix)
let recSources = new Map(); // key -> MediaStreamAudioSourceNode (Dedupe/Cleanup)
let remoteRecordingBy = null; // Anzeigename, falls ein ANDERER gerade aufnimmt
let remoteRecordingId = null; // dessen identity (Banner sauber entfernen bei Disconnect)
let recCanvas = null;      // Canvas, auf das der geteilte Bildschirm gemalt wird (Aufnahme-Bild)
let recCanvasCtx = null;
let recCanvasStream = null; // captureStream() des Canvas -> stabiler Video-Track für die Aufnahme
let recSourceVideo = null; // internes <video>, spielt den aktuellen Screenshare-Track (Quelle fürs Canvas)
let recSourceTrackId = null;
let recRafId = null;
// Chat + Wortmeldungen. Beides läuft über LiveKit-Data-Messages (canPublishData
// steckt schon im Token) — kein Server, kein Worker, nichts wird gespeichert.
let chatOpen = false;
let unreadChat = 0;         // ungelesene Nachrichten, solange das Panel zu ist
let chatToastTimer = null;
let handRaised = false;     // eigene Hand oben?
let handRaisedAt = 0;       // Zeitpunkt des Hebens -> Reihenfolge der Meldungen
const hands = new Map();    // identity -> { ts, name }
// Transkription (lokal, nachträglich via Whisper/transformers.js — kein Server/Egress)
let wantTranscript = false;     // Moderator-Toggle: beim Stoppen zusätzlich transkribieren
let lastRecordingBlob = null;   // letzte fertige Aufnahme (für nachträgliches Transkribieren im Speicher gehalten)
let transformersMod = null;     // gecachtes transformers.js-Modul (lazy von jsDelivr geladen)
let whisperPipe = null;         // gecachte ASR-Pipeline (Modell einmalig geladen)
let transcribing = false;       // läuft gerade eine Transkription?

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const connectScreen = $("connect-screen");
const appShell = $("app-shell");
const lobby = $("lobby");
const roomView = $("room");
const controls = $("controls");
const grid = $("participant-grid");
const stageEl = $("stage");
const stageLabel = $("stage-label");
const btnStageFs = $("btn-stage-fullscreen");
const audioSink = $("audio-sink");
const btnJoin = $("btn-join");
const btnMic = $("btn-mic");
const btnScreen = $("btn-screen");
const btnLeave = $("btn-leave");
const btnAudioUnlock = $("btn-audio-unlock");
const joinMutedCb = $("join-muted");
const roomCount = $("room-count");
const saveStatus = $("save-status");
const btnRecord = $("btn-record");
const recBanner = $("rec-banner");
const recBannerText = $("rec-banner-text");
const btnTranscribe = $("btn-transcribe");
const transcribeStatus = $("transcribe-status");
const transcribeStatusText = $("transcribe-status-text");
const btnHand = $("btn-hand");
const handQueue = $("hand-queue");
const btnChat = $("btn-chat");
const chatPanel = $("chat-panel");
const chatLog = $("chat-log");
const chatForm = $("chat-form");
const chatInput = $("chat-input");
const chatBadge = $("chat-badge");
const chatToast = $("chat-toast");

const screenSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);

// ------------------------------------------------------------------
// Init / Auth
// ------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", init);

async function init() {
  setupTabs();
  setupVersionBadge();
  setupStaticButtons();
  if (!screenSupported) {
    btnScreen.disabled = true;
    btnScreen.title = "Bildschirm teilen wird auf diesem Gerät/Browser nicht unterstützt (z. B. iPhone/iPad).";
  }
  if (!getSessionToken()) { showConnect(); return; }
  try {
    me = await fetchMe();
    isModerator = !!me.canEdit;
    showAppShell();
  } catch (e) {
    if (e instanceof NotLoggedInError) showConnect();
    else showConnect(e.message || String(e));
  }
}

function showConnect(errMsg) {
  connectScreen.style.display = "";
  appShell.style.display = "none";
  if (errMsg) $("cloud-error").textContent = errMsg;
}

function showAppShell() {
  connectScreen.style.display = "none";
  appShell.style.display = "";
  $("header-user").textContent = displayName(me);
  $("lobby-title").textContent = ROOM_LABEL;
  lobby.classList.remove("hidden");
  roomView.classList.add("hidden");
  controls.classList.add("hidden");
}

// ------------------------------------------------------------------
// Statische Buttons / Version-Badge / Changelog
// ------------------------------------------------------------------
function setupStaticButtons() {
  btnJoin.addEventListener("click", joinRoom);
  btnMic.addEventListener("click", toggleMic);
  btnScreen.addEventListener("click", toggleScreen);
  btnLeave.addEventListener("click", leaveRoom);
  btnRecord.addEventListener("click", toggleRecording);
  btnTranscribe.addEventListener("click", toggleTranscribeWish);
  btnAudioUnlock.addEventListener("click", unlockAudio);
  btnStageFs.addEventListener("click", toggleStageFullscreen);
  document.addEventListener("fullscreenchange", updateStageFullscreenUI);
  document.addEventListener("webkitfullscreenchange", updateStageFullscreenUI);
  btnHand.addEventListener("click", toggleOwnHand);
  btnChat.addEventListener("click", toggleChat);
  $("btn-chat-close").addEventListener("click", closeChat);
  chatForm.addEventListener("submit", onChatSubmit);
  chatToast.addEventListener("click", openChat);
  window.addEventListener("resize", updateChatOffset);
  window.addEventListener("beforeunload", () => { if (room) { try { room.disconnect(); } catch (_) {} } });
}

function activateTab(name) {
  document.querySelectorAll("nav button[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab-section").forEach((s) => s.classList.toggle("active", s.id === "tab-" + name));
}

function setupTabs() {
  document.querySelectorAll("nav button[data-tab]").forEach((b) => {
    b.addEventListener("click", () => activateTab(b.dataset.tab));
  });
}

function setupVersionBadge() {
  const v2 = $("version-badge-2");
  if (v2) v2.textContent = "v" + APP_VERSION;
  renderChangelog();
}

function renderChangelog() {
  const box = $("changelog-list");
  box.innerHTML = "";
  APP_CHANGELOG.forEach((entry) => {
    const wrap = document.createElement("div");
    wrap.className = "changelog-entry";
    const v = document.createElement("div");
    v.className = "cv";
    v.textContent = "Version " + entry.version;
    wrap.appendChild(v);
    entry.groups.forEach((g) => {
      const gEl = document.createElement("div");
      gEl.className = "changelog-group";
      const t = document.createElement("div");
      t.className = "cg-title";
      t.textContent = g.title;
      gEl.appendChild(t);
      const ul = document.createElement("ul");
      ul.className = "cg-items";
      g.items.forEach((it) => {
        const li = document.createElement("li");
        li.textContent = it;
        ul.appendChild(li);
      });
      gEl.appendChild(ul);
      wrap.appendChild(gEl);
    });
    box.appendChild(wrap);
  });
}

// ------------------------------------------------------------------
// Raum betreten / verlassen
// ------------------------------------------------------------------
async function joinRoom() {
  setLobbyError("");
  btnJoin.disabled = true;
  btnJoin.textContent = "Verbinde…";
  try {
    // Erst hier die 90 KB Video-Bibliothek holen. Ein Fehlschlag landet im catch
    // unten und damit in setLobbyError — genau dort, wo vorher der Vorab-Check
    // seine Meldung hinschrieb.
    await ladeLiveKit();
    const info = await fetchLivekitToken(ROOM_NAME);
    if (!info || !info.token || !info.url) throw new Error("Ungültige Token-Antwort vom Server.");
    room = new LK.Room({ adaptiveStream: true, dynacast: true });
    wireRoomEvents(room);
    await room.connect(info.url, info.token);

    // Mikro standardmäßig an (außer „stumm beitreten"). Im Kontext des
    // Button-Klicks — hier fragt der Browser nach Mikrofon-Erlaubnis.
    if (!joinMutedCb.checked) {
      try { await room.localParticipant.setMicrophoneEnabled(true); }
      catch (micErr) { flashStatus("Mikrofon nicht freigegeben — du hörst nur zu.", "is-error"); }
    }
    try { await room.startAudio(); } catch (_) {}

    enterRoomUI();
  } catch (e) {
    setLobbyError(e.message || String(e));
    if (room) { try { await room.disconnect(); } catch (_) {} }
    room = null;
  } finally {
    btnJoin.disabled = false;
    btnJoin.textContent = "🎙️ Raum betreten";
  }
}

async function leaveRoom() {
  // Läuft eine Aufnahme, sauber stoppen (informiert die anderen + lädt die
  // Datei runter), bevor die Verbindung getrennt wird.
  if (recorder) stopRecording();
  if (room) { try { await room.disconnect(); } catch (_) {} }
  // UI-Reset passiert im Disconnected-Event (onLeft).
}

function enterRoomUI() {
  lobby.classList.add("hidden");
  roomView.classList.remove("hidden");
  controls.classList.remove("hidden");
  resetChatAndHands();
  updateChatOffset();
  updateControls();
  updateAudioUnlock();
  updateRecordingUI();
  renderParticipants();
  renderStage();
  // Erst hier, nicht schon in der Lobby: wer die Seite offen liegen lässt, ohne
  // je beizutreten, soll den Abruf gar nicht auslösen.
  ladeNutzerfotoVersionen();
}

function onLeft() {
  // Lief noch eine Aufnahme (z.B. Verbindung hart abgerissen), sichern:
  // recorder.stop() -> onstop lädt die bisherige Aufnahme runter + räumt den Mix auf.
  if (recorder && recorder.state !== "inactive") { try { recorder.stop(); } catch (_) {} }
  recorder = null;
  remoteRecordingBy = null;
  remoteRecordingId = null;
  room = null;
  speaking.clear();
  clearStage();
  resetChatAndHands();
  grid.innerHTML = "";
  audioSink.innerHTML = "";
  nutzerfotosLeeren();
  lobby.classList.remove("hidden");
  roomView.classList.add("hidden");
  controls.classList.add("hidden");
  updateRecordingUI();
}

// ------------------------------------------------------------------
// LiveKit-Events
// ------------------------------------------------------------------
function wireRoomEvents(r) {
  const E = LK.RoomEvent;
  r.on(E.ParticipantConnected, onParticipantConnected)
   .on(E.ParticipantDisconnected, onParticipantDisconnected)
   .on(E.DataReceived, onDataReceived)
   .on(E.TrackSubscribed, onTrackSubscribed)
   .on(E.TrackUnsubscribed, onTrackUnsubscribed)
   .on(E.LocalTrackPublished, () => { renderStage(); renderParticipants(); updateControls(); refreshRecMix(); })
   .on(E.LocalTrackUnpublished, () => { renderStage(); renderParticipants(); updateControls(); })
   .on(E.TrackMuted, renderParticipants)
   .on(E.TrackUnmuted, renderParticipants)
   .on(E.ActiveSpeakersChanged, onActiveSpeakers)
   .on(E.AudioPlaybackStatusChanged, updateAudioUnlock)
   .on(E.Disconnected, onLeft);
}

function onTrackSubscribed(track, publication, participant) {
  if (track.kind === LK.Track.Kind.Audio) {
    const el = track.attach();
    el.autoplay = true;
    audioSink.appendChild(el);
    refreshRecMix(); // neu erschienene Stimme in eine laufende Aufnahme aufnehmen
  } else if (publication.source === LK.Track.Source.ScreenShare) {
    renderStage();
  }
  renderParticipants();
}

function onTrackUnsubscribed(track, publication) {
  track.detach().forEach((el) => el.remove());
  if (publication.source === LK.Track.Source.ScreenShare) renderStage();
  renderParticipants();
}

function onActiveSpeakers(speakers) {
  speaking.clear();
  speakers.forEach((p) => speaking.add(p.identity));
  document.querySelectorAll(".tile").forEach((t) => {
    t.classList.toggle("speaking", speaking.has(t.dataset.identity));
  });
}

// ------------------------------------------------------------------
// Rendern: Teilnehmer-Kacheln
// ------------------------------------------------------------------
function participants() {
  if (!room) return [];
  return [room.localParticipant, ...room.remoteParticipants.values()];
}

function renderParticipants() {
  if (!room) return;
  const list = participants();
  roomCount.textContent = list.length === 1 ? "Nur du im Raum" : list.length + " im Raum";
  grid.innerHTML = "";
  list.forEach((p) => grid.appendChild(tileFor(p)));
}

function tileFor(p) {
  const isLocal = room && p === room.localParticipant;
  const name = displayNameOf(p);
  const micOn = p.isMicrophoneEnabled;
  const sharing = p.isScreenShareEnabled;

  const tile = document.createElement("div");
  tile.className = "tile" + (speaking.has(p.identity) ? " speaking" : "");
  tile.dataset.identity = p.identity;

  const mic = document.createElement("div");
  mic.className = "tile-mic";
  mic.textContent = micOn ? "🎙️" : "🔇";
  mic.title = micOn ? "Mikrofon an" : "Stummgeschaltet";
  tile.appendChild(mic);

  if (hands.has(p.identity)) {
    const hand = document.createElement("div");
    hand.className = "tile-hand";
    hand.title = "hat sich gemeldet";
    hand.appendChild(document.createTextNode("✋"));
    const nr = document.createElement("span");
    nr.className = "hand-nr";
    nr.textContent = String(handPosition(p.identity));
    hand.appendChild(nr);
    tile.appendChild(hand);
  }

  const avatar = document.createElement("div");
  avatar.className = "tile-avatar";
  // ⚠️ backgroundColor, NICHT die Kurzform background: avatarFotoAnwenden() setzt
  // gleich darauf backgroundImage. Die Kurzform würde das Bild wieder wegräumen.
  avatar.style.backgroundColor = avatarColor(p.identity);
  avatar.textContent = initials(name);
  // Ersetzt die Initialen durch das Konto-Foto, sofern es eines gibt.
  avatarFotoAnwenden(avatar, p.identity);
  tile.appendChild(avatar);

  const nm = document.createElement("div");
  nm.className = "tile-name";
  nm.appendChild(document.createTextNode(name));
  if (isLocal) {
    const you = document.createElement("span");
    you.className = "tile-you";
    you.textContent = "Du";
    nm.appendChild(you);
  }
  tile.appendChild(nm);

  if (sharing) {
    const sh = document.createElement("div");
    sh.className = "tile-sharing";
    sh.textContent = "🖥️ teilt Bildschirm";
    tile.appendChild(sh);
  }

  // Moderations-Aktionen: nur für Bearbeiter (me.canEdit) und nur auf fremden
  // Kacheln. Die eigentliche Berechtigung wird serverseitig nochmal geprüft
  // (admin-worker.js resolveEditPermission) — diese Buttons sind reine UI.
  if (isModerator && !isLocal) {
    const modBar = document.createElement("div");
    modBar.className = "tile-mod";

    const muteBtn = document.createElement("button");
    muteBtn.type = "button";
    muteBtn.className = "tile-mod-btn";
    muteBtn.textContent = "🔇 Stumm";
    muteBtn.title = micOn ? "Diesen Teilnehmer stummschalten" : "Bereits stummgeschaltet";
    muteBtn.disabled = !micOn;
    muteBtn.addEventListener("click", () => moderatorMute(p));
    modBar.appendChild(muteBtn);

    const kickBtn = document.createElement("button");
    kickBtn.type = "button";
    kickBtn.className = "tile-mod-btn danger";
    kickBtn.textContent = "🚪 Entfernen";
    kickBtn.title = "Diesen Teilnehmer aus dem Raum entfernen";
    kickBtn.addEventListener("click", () => moderatorKick(p));
    modBar.appendChild(kickBtn);

    tile.appendChild(modBar);
  }
  return tile;
}

// ------------------------------------------------------------------
// Moderation (nur Bearbeiter) — kicken / stummschalten. Beides läuft über den
// Worker (LiveKit-Server-API), NIE direkt vom Client: der Worker prüft die
// Berechtigung erneut und hält als Einziger den API-Secret. Das Ergebnis
// (Teilnehmer weg / Track stumm) kommt als normales LiveKit-Event zurück und
// aktualisiert die Kacheln von selbst — kein manuelles Neu-Rendern nötig.
// ------------------------------------------------------------------
async function moderatorMute(p) {
  const pub = p.getTrackPublication(LK.Track.Source.Microphone);
  const sid = pub && pub.trackSid;
  if (!sid) { flashStatus(displayNameOf(p) + " ist bereits stumm.", "is-ok"); return; }
  try {
    await livekitMute(ROOM_NAME, p.identity, sid);
    flashStatus(displayNameOf(p) + " stummgeschaltet.", "is-ok");
  } catch (e) {
    flashStatus("Stummschalten fehlgeschlagen" + (e && e.message ? ": " + e.message : ""), "is-error");
  }
}

async function moderatorKick(p) {
  if (!confirm(displayNameOf(p) + " aus dem Raum entfernen?")) return;
  try {
    await livekitKick(ROOM_NAME, p.identity);
    flashStatus(displayNameOf(p) + " entfernt.", "is-ok");
  } catch (e) {
    flashStatus("Entfernen fehlgeschlagen" + (e && e.message ? ": " + e.message : ""), "is-error");
  }
}

// ------------------------------------------------------------------
// Rendern: Screenshare-Bühne
// ------------------------------------------------------------------
function findScreenShare() {
  for (const p of participants()) {
    const pub = p.getTrackPublication ? p.getTrackPublication(LK.Track.Source.ScreenShare) : null;
    if (pub && pub.track) return { pub, track: pub.track, name: displayNameOf(p) };
  }
  return null;
}

function renderStage() {
  const share = findScreenShare();
  if (!share || !isTrackAlive(share.track)) { clearStage(); return; }
  if (share.pub.trackSid === stageSid) return; // schon angezeigt
  clearStage();
  const video = share.track.attach();
  video.muted = true;
  video.playsInline = true;
  stageEl.insertBefore(video, stageLabel);
  stageLabel.textContent = "🖥️ Bildschirm von " + share.name;
  stageEl.classList.remove("hidden");
  // Geteilter Bildschirm ist jetzt das Wichtigste auf der Seite: Bühne raus aus
  // der schmalen Spalte, Teilnehmer-Kacheln treten zurück (Styles in style.css).
  stageEl.classList.add("stage-wide");
  grid.classList.add("compact");
  stageTrack = share.track;
  stageSid = share.pub.trackSid;
  startStageWatchdog();
}

// Erkennt ein Track-Objekt, dessen zugrundeliegender MediaStreamTrack bereits
// (still, ohne LiveKit-Event) beendet ist -- der Fall auf manchen Mobil-
// Browsern, siehe attachNativeStopWatcher().
function isTrackAlive(track) {
  const mst = track && track.mediaStreamTrack;
  return !!mst && mst.readyState === "live";
}

// Sicherheitsnetz gegen genau den Fall, den attachNativeStopWatcher() beim
// TEILENDEN abfängt, aber aus Sicht der ZUSCHAUENDEN: prüft alle paar
// Sekunden, ob der aktuell auf der Bühne gezeigte Track noch lebt, und räumt
// sonst selbst auf, statt dauerhaft ein eingefrorenes/schwarzes Bild zu zeigen.
function startStageWatchdog() {
  stopStageWatchdog();
  stageWatchdog = setInterval(() => {
    if (stageTrack && !isTrackAlive(stageTrack)) renderStage();
  }, 3000);
}

function stopStageWatchdog() {
  if (stageWatchdog) { clearInterval(stageWatchdog); stageWatchdog = null; }
}

function clearStage() {
  stopStageWatchdog();
  // Läuft gerade Vollbild auf der Bühne, muss es hier enden -- sonst starrt der
  // Zuschauer nach dem Ende der Freigabe auf eine schwarze Vollbildfläche, aus
  // der er sich erst per Esc befreien muss.
  if (fullscreenElement() === stageEl) exitStageFullscreen();
  if (stageTrack) { try { stageTrack.detach().forEach((el) => el.remove()); } catch (_) {} }
  stageEl.querySelectorAll("video").forEach((v) => v.remove());
  stageEl.classList.add("hidden");
  stageEl.classList.remove("stage-wide");
  grid.classList.remove("compact");
  stageLabel.textContent = "";
  stageTrack = null;
  stageSid = null;
}

// ------------------------------------------------------------------
// Vollbild der Bühne
// ------------------------------------------------------------------
// Größer wird die Bühne schon von selbst, sobald jemand teilt (.stage-wide).
// Dieser Knopf geht den Schritt weiter ins echte Browser-Vollbild. iOS-Safari
// kennt die Fullscreen-API auf normalen Elementen nicht -- dort kann nur das
// <video> selbst per webkitEnterFullscreen, deshalb der Fallback.
function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function toggleStageFullscreen() {
  if (fullscreenElement()) { exitStageFullscreen(); return; }
  const req = stageEl.requestFullscreen || stageEl.webkitRequestFullscreen;
  if (req) {
    try {
      Promise.resolve(req.call(stageEl)).catch(() => flashStatus("Vollbild wurde vom Browser abgelehnt", "is-error"));
      return;
    } catch (_) { /* unten weiterprobieren */ }
  }
  const video = stageEl.querySelector("video");
  if (video && video.webkitEnterFullscreen) {
    try { video.webkitEnterFullscreen(); return; } catch (_) {}
  }
  flashStatus("Vollbild wird auf diesem Gerät nicht unterstützt", "is-error");
}

function exitStageFullscreen() {
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  if (!exit) return;
  try { Promise.resolve(exit.call(document)).catch(() => {}); } catch (_) {}
}

function updateStageFullscreenUI() {
  const on = fullscreenElement() === stageEl;
  btnStageFs.textContent = on ? "⤡" : "⛶";
  btnStageFs.title = on ? "Vollbild beenden (Esc)" : "Vollbild";
  btnStageFs.setAttribute("aria-label", btnStageFs.title);
}

// ------------------------------------------------------------------
// Wortmeldungen (Hand heben)
// ------------------------------------------------------------------
// Läuft wie das Aufnahme-Banner über LiveKit-Data-Messages: kein Server, kein
// gespeicherter Zustand. Die Reihenfolge steckt im Zeitstempel des Hebens.
function publishJson(obj) {
  if (!room) return;
  try {
    room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(obj)), { reliable: true });
  } catch (_) {}
}

function handOrder() {
  return [...hands.entries()]
    .sort((a, b) => (a[1].ts - b[1].ts) || String(a[1].name).localeCompare(String(b[1].name)))
    .map(([identity, info], i) => ({ identity: identity, name: info.name, nr: i + 1 }));
}

function handPosition(identity) {
  const found = handOrder().find((h) => h.identity === identity);
  return found ? found.nr : 0;
}

function toggleOwnHand() {
  if (!room) return;
  setOwnHand(!handRaised);
}

function setOwnHand(raised) {
  if (!room) return;
  handRaised = !!raised;
  handRaisedAt = handRaised ? Date.now() : 0;
  const id = room.localParticipant.identity;
  if (handRaised) hands.set(id, { ts: handRaisedAt, name: displayName(me) });
  else hands.delete(id);
  publishJson({ t: "hand", raised: handRaised, ts: handRaisedAt });
  updateHandButton();
  renderHands();
}

function updateHandButton() {
  btnHand.classList.toggle("active", handRaised);
  $("hand-label").textContent = handRaised ? "Hand senken" : "Hand heben";
}

// Moderatoren dürfen fremde Meldungen abhaken, nachdem jemand dran war. Das ist
// bewusst nur eine Data-Message (wie das Aufnahme-Banner) -- serverseitig
// erzwungen sind weiterhin nur Stummschalten und Entfernen.
function lowerHandOf(identity) {
  hands.delete(identity);
  publishJson({ t: "hand-lower", target: identity });
  renderHands();
}

function renderHands() {
  const order = handOrder();
  handQueue.innerHTML = "";
  if (!order.length) {
    handQueue.classList.add("hidden");
    renderParticipants();
    return;
  }
  const title = document.createElement("span");
  title.className = "hand-queue-title";
  title.textContent = order.length === 1 ? "✋ Wortmeldung:" : "✋ Wortmeldungen:";
  handQueue.appendChild(title);
  order.forEach((h) => {
    const chip = document.createElement("span");
    chip.className = "hand-chip";
    const nr = document.createElement("span");
    nr.className = "hand-nr";
    nr.textContent = h.nr + ".";
    chip.appendChild(nr);
    chip.appendChild(document.createTextNode(h.name));
    const selbst = !!room && h.identity === room.localParticipant.identity;
    if (isModerator || selbst) {
      const x = document.createElement("button");
      x.type = "button";
      x.className = "hand-chip-lower";
      x.textContent = "✕";
      x.title = selbst ? "Eigene Wortmeldung zurückziehen" : "Wortmeldung erledigt";
      x.addEventListener("click", () => (selbst ? setOwnHand(false) : lowerHandOf(h.identity)));
      chip.appendChild(x);
    }
    handQueue.appendChild(chip);
  });
  handQueue.classList.remove("hidden");
  renderParticipants();
}

// ------------------------------------------------------------------
// Chat (flüchtig -- gedacht für alle, die gerade kein Mikrofon haben)
// ------------------------------------------------------------------
function toggleChat() { if (chatOpen) closeChat(); else openChat(); }

function openChat() {
  chatOpen = true;
  document.body.classList.add("chat-open");
  chatPanel.classList.remove("hidden");
  hideChatToast();
  unreadChat = 0;
  updateChatBadge();
  updateChatOffset();
  scrollChatToEnd();
  try { chatInput.focus(); } catch (_) {}
}

function closeChat() {
  chatOpen = false;
  document.body.classList.remove("chat-open");
  chatPanel.classList.add("hidden");
}

function onChatSubmit(e) {
  e.preventDefault();
  const text = chatInput.value.trim().slice(0, 500);
  if (!text || !room) return;
  publishJson({ t: "chat", text: text });
  appendChatMessage(displayName(me), text, true); // die eigene Nachricht kommt nicht zurück
  chatInput.value = "";
}

function receiveChatMessage(name, text) {
  const clean = text.slice(0, 500);
  if (!clean.trim()) return;
  appendChatMessage(name, clean, false);
  if (!chatOpen) {
    unreadChat++;
    updateChatBadge();
    showChatToast(name, clean);
  }
}

function appendChatMessage(name, text, own) {
  const platzhalter = chatLog.querySelector(".chat-empty");
  if (platzhalter) platzhalter.remove();

  const wrap = document.createElement("div");
  wrap.className = "chat-msg" + (own ? " is-own" : "");

  const head = document.createElement("div");
  head.className = "chat-msg-head";
  const who = document.createElement("span");
  who.textContent = own ? "Du" : name;
  const when = document.createElement("span");
  when.textContent = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  head.appendChild(who);
  head.appendChild(when);

  const body = document.createElement("div");
  body.className = "chat-msg-text";
  body.textContent = text; // textContent, nicht innerHTML -- fremder Text darf hier nichts bauen

  wrap.appendChild(head);
  wrap.appendChild(body);
  chatLog.appendChild(wrap);
  scrollChatToEnd();
}

function scrollChatToEnd() { chatLog.scrollTop = chatLog.scrollHeight; }

function updateChatBadge() {
  chatBadge.textContent = unreadChat > 9 ? "9+" : String(unreadChat);
  chatBadge.classList.toggle("hidden", unreadChat === 0);
}

function showChatToast(name, text) {
  chatToast.innerHTML = "";
  const who = document.createElement("span");
  who.className = "chat-toast-name";
  who.textContent = name;
  const body = document.createElement("span");
  body.textContent = text.length > 120 ? text.slice(0, 120) + " …" : text;
  chatToast.appendChild(who);
  chatToast.appendChild(body);
  chatToast.classList.remove("hidden");
  if (chatToastTimer) clearTimeout(chatToastTimer);
  chatToastTimer = setTimeout(hideChatToast, 6000);
}

function hideChatToast() {
  if (chatToastTimer) { clearTimeout(chatToastTimer); chatToastTimer = null; }
  chatToast.classList.add("hidden");
}

// Header und Steuerleiste brechen je nach Fensterbreite um -- zwischen die
// beiden muss die Chat-Spalte passen, deshalb wird gemessen statt geraten.
function updateChatOffset() {
  const header = document.querySelector("header");
  const nav = document.querySelector("nav");
  const oben = (header ? header.getBoundingClientRect().height : 0) + (nav ? nav.getBoundingClientRect().height : 0);
  const unten = controls.classList.contains("hidden") ? 0 : controls.getBoundingClientRect().height;
  document.documentElement.style.setProperty("--chat-top", Math.round(oben) + "px");
  document.documentElement.style.setProperty("--chat-bottom", Math.round(unten) + "px");
}

function renderChatEmpty() {
  chatLog.innerHTML = "";
  const p = document.createElement("p");
  p.className = "chat-empty";
  p.textContent = "Noch keine Nachrichten.";
  chatLog.appendChild(p);
}

// Beim Betreten und beim Verlassen: nichts aus einer alten Sitzung stehen lassen.
function resetChatAndHands() {
  hands.clear();
  handRaised = false;
  handRaisedAt = 0;
  updateHandButton();
  renderHands();
  closeChat();
  renderChatEmpty();
  unreadChat = 0;
  updateChatBadge();
  hideChatToast();
}

// ------------------------------------------------------------------
// Steuerung
// ------------------------------------------------------------------
async function toggleMic() {
  if (!room) return;
  const on = room.localParticipant.isMicrophoneEnabled;
  try {
    await room.localParticipant.setMicrophoneEnabled(!on);
  } catch (e) {
    flashStatus("Mikrofon-Zugriff nötig, um zu sprechen.", "is-error");
  }
  updateControls();
  renderParticipants();
}

async function toggleScreen() {
  if (!room || !screenSupported) return;
  const on = room.localParticipant.isScreenShareEnabled;
  try {
    await room.localParticipant.setScreenShareEnabled(!on, { audio: true });
    if (!on) attachNativeStopWatcher();
  } catch (e) {
    // Nutzer hat die Auswahl abgebrochen o. Ä. — kein harter Fehler.
  }
  updateControls();
  renderStage();
}

// Manche mobilen Browser feuern beim Sperren des Displays oder Wegwischen des
// geteilten Tabs kein sauberes LiveKit-Unpublish aus (bekannte Schwachstelle
// von getDisplayMedia auf Mobilgeräten) -- das native "ended"-Event des
// Browser-eigenen Freigabe-Streams fängt genau diesen Fall zusätzlich ab und
// beendet das Teilen sauber, statt dass es bei anderen als Leiche stehen bleibt.
function attachNativeStopWatcher() {
  const pub = room.localParticipant.getTrackPublication(LK.Track.Source.ScreenShare);
  const mst = pub && pub.track && pub.track.mediaStreamTrack;
  if (!mst) return;
  mst.addEventListener("ended", () => {
    if (room && room.localParticipant.isScreenShareEnabled) {
      room.localParticipant.setScreenShareEnabled(false).catch(() => {});
    }
    updateControls();
    renderStage();
  }, { once: true });
}

function updateControls() {
  if (!room) return;
  const micOn = room.localParticipant.isMicrophoneEnabled;
  $("mic-icon").textContent = micOn ? "🎙️" : "🔇";
  $("mic-label").textContent = micOn ? "Mikro an" : "Stumm";
  btnMic.classList.toggle("is-muted", !micOn);

  const sharing = room.localParticipant.isScreenShareEnabled;
  $("screen-label").textContent = sharing ? "Teilen beenden" : "Bildschirm teilen";
  btnScreen.classList.toggle("active", sharing);
}

function updateAudioUnlock() {
  const locked = room && room.canPlaybackAudio === false;
  btnAudioUnlock.classList.toggle("hidden", !locked);
}

async function unlockAudio() {
  if (room) { try { await room.startAudio(); } catch (_) {} }
  updateAudioUnlock();
}

// ------------------------------------------------------------------
// Aufnahme — lokal im Browser (MediaRecorder), rein clientseitig: kein
// Server, kein LiveKit-Egress. Mischt alle Stimmen (Web Audio) und nimmt,
// falls beim Start jemand teilt, den geteilten Bildschirm mit auf. Nur für
// Bearbeiter (isModerator). Alle im Raum werden per Data-Message sichtbar
// informiert, dass aufgenommen wird (Transparenz/Einwilligung).
// ------------------------------------------------------------------
const recordingSupported = typeof window.MediaRecorder !== "undefined" &&
  !!(window.AudioContext || window.webkitAudioContext);
// Transkription braucht WebAssembly + Offline-Audio-Dekodierung (Resampling auf 16 kHz).
const transcribeSupported = typeof WebAssembly !== "undefined" &&
  !!(window.AudioContext || window.webkitAudioContext) &&
  !!(window.OfflineAudioContext || window.webkitOfflineAudioContext);

function pickRecMime(hasVideo) {
  const cands = hasVideo
    ? ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const c of cands) { try { if (MediaRecorder.isTypeSupported(c)) return c; } catch (_) {} }
  return "";
}

async function toggleRecording() {
  if (recorder) stopRecording();
  else await startRecording();
}

async function startRecording() {
  if (!room || recorder || !recordingSupported) return;
  if (!confirm("Alle Teilnehmer werden sichtbar darüber informiert, dass aufgenommen wird. Die Aufnahme wird auf deinem Gerät gespeichert. Jetzt starten?")) return;
  try {
    recAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    recDest = recAudioCtx.createMediaStreamDestination();
    recSources = new Map();
    if (recAudioCtx.state === "suspended") { try { await recAudioCtx.resume(); } catch (_) {} }
    participants().forEach(addParticipantAudioToMix);

    // Bild immer über ein Canvas aufnehmen (nicht den Screenshare-Track direkt):
    // ein fremder/dynamischer Track wird von MediaRecorder oft NICHT erfasst
    // (genau das Symptom "nur Ton"). Das Canvas malt den geteilten Bildschirm
    // kontinuierlich ab und liefert einen stabilen, lokalen Video-Track — und
    // nimmt so auch erst NACH dem Start gestartetes Teilen automatisch mit.
    const tracks = recDest.stream.getAudioTracks().slice();
    let mimeType = pickRecMime(true);
    if (mimeType) {
      const canvasTrack = startCanvasVideo();
      if (canvasTrack) tracks.push(canvasTrack);
      else mimeType = pickRecMime(false); // captureStream nicht verfügbar -> nur Ton
    } else {
      mimeType = pickRecMime(false); // Browser kann kein Video aufnehmen -> nur Ton
    }
    if (!mimeType) { flashStatus("Aufnahme-Format wird von diesem Browser nicht unterstützt.", "is-error"); stopRecMix(); return; }

    recChunks = [];
    recMimeType = mimeType;
    recorder = new MediaRecorder(new MediaStream(tracks), { mimeType });
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
    recorder.onstop = finishRecordingDownload;
    recorder.start(1000);
    broadcastRecording(true);
    updateRecordingUI();
    flashStatus(mimeType.indexOf("video") === 0 ? "Aufnahme läuft (Ton + Bild)." : "Aufnahme läuft (nur Ton).", "is-ok");
  } catch (e) {
    flashStatus("Aufnahme konnte nicht gestartet werden" + (e && e.message ? ": " + e.message : ""), "is-error");
    stopRecMix();
    recorder = null;
    updateRecordingUI();
  }
}

function stopRecording() {
  if (recorder && recorder.state !== "inactive") { try { recorder.stop(); } catch (_) {} } // onstop -> Download
  recorder = null;
  broadcastRecording(false);
  updateRecordingUI();
  flashStatus("Aufnahme beendet — Datei wird heruntergeladen.", "is-ok");
}

function recStamp() {
  return new Date().toISOString().slice(0, 16).replace("T", "_").replace(/:/g, "-");
}

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => { try { URL.revokeObjectURL(a.href); } catch (_) {} }, 15000);
}

function finishRecordingDownload() {
  const chunks = recChunks; recChunks = [];
  stopRecMix();
  if (!chunks.length) return;
  const blob = new Blob(chunks, { type: recMimeType || "application/octet-stream" });
  const ext = recMimeType.indexOf("mp4") >= 0 ? "mp4" : recMimeType.indexOf("ogg") >= 0 ? "ogg" : "webm";
  const stamp = recStamp();
  lastRecordingBlob = blob;   // für nachträgliches Transkribieren im Speicher halten
  downloadBlob(blob, "Besprechung_" + stamp + "." + ext);
  // Transkript ist Opt-in (Moderator-Toggle) — es lädt ein Sprachmodell nach und dauert.
  if (wantTranscript && transcribeSupported) transcribeRecording(blob, stamp);
}

// ------------------------------------------------------------------
// Transkription — lokal, nachträglich (Whisper via transformers.js).
// Läuft komplett im Browser: der fertige Aufnahme-Blob (enthält den Ton
// ALLER Teilnehmer, siehe recDest-Mix) wird auf 16 kHz Mono dekodiert und
// durch Whisper geschickt. Kein Server/Egress — nur das Sprachmodell wird
// einmalig vom selben CDN wie LiveKit (jsDelivr) geladen und danach vom
// Browser gecacht. Ergebnis: .txt (mit Zeitmarken) + .vtt (Untertitel).
// ------------------------------------------------------------------
const WHISPER_CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2";
const WHISPER_MODEL = "Xenova/whisper-base";  // mehrsprachig, quantisiert ~80 MB, für Deutsch ausreichend

function toggleTranscribeWish() {
  if (transcribing) return;
  wantTranscript = !wantTranscript;
  updateRecordingUI();
  if (wantTranscript && lastRecordingBlob && !recorder) {
    // Toggle erst NACH einer Aufnahme aktiviert -> die letzte gleich transkribieren.
    transcribeRecording(lastRecordingBlob, recStamp());
  } else {
    flashStatus(wantTranscript
      ? "Transkript aktiv: nach dem Stoppen wird ein Textprotokoll erstellt."
      : "Transkript deaktiviert.", "is-ok");
  }
}

function setTranscribeStatus(msg) {
  if (!transcribeStatus) return;
  if (msg == null) { transcribeStatus.classList.add("hidden"); return; }
  transcribeStatusText.textContent = msg;
  transcribeStatus.classList.remove("hidden");
}

async function loadTransformers() {
  if (transformersMod) return transformersMod;
  transformersMod = await import(/* @vite-ignore */ WHISPER_CDN + "/dist/transformers.min.js");
  return transformersMod;
}

async function getWhisper() {
  if (whisperPipe) return whisperPipe;
  const t = await loadTransformers();
  if (t.env) { t.env.allowLocalModels = false; }   // nur Remote-Modell, kein Selbst-Hosting nötig
  whisperPipe = await t.pipeline("automatic-speech-recognition", WHISPER_MODEL, {
    dtype: "q8",   // quantisiert: ~80 MB statt ~290 MB fp32 (v3 lädt sonst die vollen Gewichte)
    progress_callback: (p) => {
      if (p && p.status === "progress" && typeof p.progress === "number") {
        setTranscribeStatus("Sprachmodell wird geladen … " + Math.round(p.progress) + "%");
      }
    },
  });
  return whisperPipe;
}

// Dekodiert den Aufnahme-Blob und rendert ihn per OfflineAudioContext auf
// 16 kHz Mono (das erwartet Whisper) — robust auch wenn der Browser die
// Ziel-Samplerate beim decodeAudioData ignoriert.
async function decodeTo16kMono(blob) {
  const arr = await blob.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  const tmp = new AC();
  let decoded;
  try { decoded = await tmp.decodeAudioData(arr); }
  finally { try { tmp.close(); } catch (_) {} }
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const frames = Math.max(1, Math.ceil(decoded.duration * 16000));
  const off = new OAC(1, frames, 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);   // Float32Array @ 16 kHz mono
}

async function transcribeRecording(blob, stamp) {
  if (transcribing || !blob) return;
  transcribing = true;
  updateRecordingUI();
  try {
    setTranscribeStatus("Sprachmodell wird geladen …");
    const asr = await getWhisper();
    setTranscribeStatus("Ton wird vorbereitet …");
    const pcm = await decodeTo16kMono(blob);
    setTranscribeStatus("Transkription läuft … (das kann einige Minuten dauern)");
    const out = await asr(pcm, {
      language: "german",
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
    });
    const chunks = (out && out.chunks && out.chunks.length)
      ? out.chunks
      : [{ timestamp: [0, null], text: (out && out.text) || "" }];
    const base = "Besprechung_" + stamp;
    downloadBlob(new Blob([buildTranscriptTxt(chunks, stamp)], { type: "text/plain;charset=utf-8" }), base + ".txt");
    downloadBlob(new Blob([buildTranscriptVtt(chunks)], { type: "text/vtt;charset=utf-8" }), base + ".vtt");
    setTranscribeStatus(null);
    flashStatus("Transkript erstellt — .txt und .vtt wurden heruntergeladen.", "is-ok");
  } catch (e) {
    setTranscribeStatus(null);
    flashStatus("Transkription fehlgeschlagen" + (e && e.message ? ": " + e.message : ""), "is-error");
  } finally {
    transcribing = false;
    updateRecordingUI();
  }
}

function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return (h ? pad(h) + ":" : "") + pad(m) + ":" + pad(s);
}
function fmtVtt(sec) {
  sec = Math.max(0, sec || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec - Math.floor(sec)) * 1000);
  const pad = (n, l) => String(n).padStart(l, "0");
  return pad(h, 2) + ":" + pad(m, 2) + ":" + pad(s, 2) + "." + pad(ms, 3);
}
function buildTranscriptTxt(chunks, stamp) {
  const head = "Besprechung – Transkript (" + stamp.replace("_", " ") + ")\n" +
    "Automatisch erstellt, lokal im Browser. Bitte gegenlesen.\n" +
    "".padEnd(48, "-") + "\n\n";
  const body = chunks
    .map((c) => "[" + fmtClock(c.timestamp && c.timestamp[0]) + "] " + String(c.text || "").trim())
    .filter((l) => l.replace(/\[[^\]]*\]\s*/, "").length)
    .join("\n");
  return head + body + "\n";
}
function buildTranscriptVtt(chunks) {
  let out = "WEBVTT\n\n";
  let idx = 1;
  for (const c of chunks) {
    const text = String(c.text || "").trim();
    if (!text) continue;
    const start = c.timestamp && c.timestamp[0] != null ? c.timestamp[0] : 0;
    const end = c.timestamp && c.timestamp[1] != null ? c.timestamp[1] : start + 2;
    out += (idx++) + "\n" + fmtVtt(start) + " --> " + fmtVtt(end) + "\n" + text + "\n\n";
  }
  return out;
}

function addTrackToMix(mst, key) {
  if (!recAudioCtx || !mst) return;
  const existing = recSources.get(key);
  if (existing) {
    if (existing._mstId === mst.id) return;      // exakt dieser Track ist schon im Mix
    try { existing.disconnect(); } catch (_) {}   // alter Track (z.B. von vor dem mute) -> ersetzen
    recSources.delete(key);
  }
  try {
    const src = recAudioCtx.createMediaStreamSource(new MediaStream([mst]));
    src.connect(recDest);
    src._mstId = mst.id;
    recSources.set(key, src);
  } catch (_) {}
}

function addParticipantAudioToMix(p) {
  const mic = p.getTrackPublication(LK.Track.Source.Microphone);
  if (mic && mic.track && mic.track.mediaStreamTrack) addTrackToMix(mic.track.mediaStreamTrack, "mic:" + p.identity);
  const sha = p.getTrackPublication(LK.Track.Source.ScreenShareAudio);
  if (sha && sha.track && sha.track.mediaStreamTrack) addTrackToMix(sha.track.mediaStreamTrack, "sha:" + p.identity);
}

// Zieht einen bereits laufenden Aufnahme-Mix auf den aktuellen Teilnehmerstand
// nach. Ohne das landet nur, wer beim Aufnahmestart schon ein aktives Mikro hatte,
// im Ton -- später hinzugekommene Teilnehmer, erst danach eingeschaltete Mikros und
// mute+unmute (= technisch ein neuer Track) würden sonst stumm fehlen. addTrackToMix
// ist idempotent bzw. ersetzt geänderte Tracks, daher gefahrlos wiederholbar.
function refreshRecMix() {
  if (!recorder || !recAudioCtx) return;
  participants().forEach(addParticipantAudioToMix);
}

function currentScreenShareVideoTrack() {
  const share = findScreenShare();
  const mst = share && share.track && share.track.mediaStreamTrack;
  return mst && mst.readyState === "live" ? mst : null;
}

// Canvas-Video für die Aufnahme: malt den aktuell geteilten Bildschirm
// kontinuierlich ab (oder einen Platzhalter, wenn keiner teilt) und liefert
// per captureStream einen stabilen Video-Track. Dieser "Umweg" ist der Grund,
// warum jetzt auch fremde/später gestartete Screenshares im Video landen.
function startCanvasVideo() {
  recCanvas = document.createElement("canvas");
  recCanvas.width = 1280;
  recCanvas.height = 720;
  recCanvasCtx = recCanvas.getContext("2d", { alpha: false });
  recSourceVideo = document.createElement("video");
  recSourceVideo.muted = true;
  recSourceVideo.playsInline = true;
  recSourceTrackId = null;
  drawRecFrame();
  if (typeof recCanvas.captureStream !== "function") return null;
  recCanvasStream = recCanvas.captureStream(15);
  return recCanvasStream.getVideoTracks()[0] || null;
}

function drawRecFrame() {
  const ctx = recCanvasCtx;
  if (!ctx) return;
  const W = recCanvas.width, H = recCanvas.height;
  const mst = currentScreenShareVideoTrack();
  ctx.fillStyle = "#10131a";
  ctx.fillRect(0, 0, W, H);
  if (mst) {
    if (recSourceTrackId !== mst.id) {
      try { recSourceVideo.srcObject = new MediaStream([mst]); recSourceVideo.play().catch(() => {}); } catch (_) {}
      recSourceTrackId = mst.id;
    }
    const vw = recSourceVideo.videoWidth, vh = recSourceVideo.videoHeight;
    if (vw && vh) {
      const scale = Math.min(W / vw, H / vh);
      const dw = vw * scale, dh = vh * scale;
      try { ctx.drawImage(recSourceVideo, (W - dw) / 2, (H - dh) / 2, dw, dh); } catch (_) {}
    }
  } else {
    recSourceTrackId = null;
    ctx.fillStyle = "#8a93a6";
    ctx.font = "600 30px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Besprechung läuft – kein geteilter Bildschirm", W / 2, H / 2);
  }
  recRafId = requestAnimationFrame(drawRecFrame);
}

function stopCanvasVideo() {
  if (recRafId) { cancelAnimationFrame(recRafId); recRafId = null; }
  if (recCanvasStream) { recCanvasStream.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} }); recCanvasStream = null; }
  if (recSourceVideo) { try { recSourceVideo.srcObject = null; } catch (_) {} recSourceVideo = null; }
  recCanvas = null; recCanvasCtx = null; recSourceTrackId = null;
}

// Räumt Audio-Mix UND Canvas-Video auf.
function stopRecMix() {
  stopCanvasVideo();
  if (recSources) { recSources.forEach((s) => { try { s.disconnect(); } catch (_) {} }); recSources = new Map(); }
  if (recAudioCtx) { try { recAudioCtx.close(); } catch (_) {} recAudioCtx = null; }
  recDest = null;
}

// Data-Message an alle: "ich nehme (nicht mehr) auf" — treibt das Banner bei
// den anderen. Braucht canPublishData (im Token gesetzt).
function broadcastRecording(active) {
  if (!room) return;
  try {
    const data = new TextEncoder().encode(JSON.stringify({ t: "rec", active: !!active, by: displayName(me) }));
    room.localParticipant.publishData(data, { reliable: true });
  } catch (_) {}
}

function onDataReceived(payload, participant) {
  try {
    const msg = JSON.parse(new TextDecoder().decode(payload));
    if (!msg) return;
    if (msg.t === "rec") {
      remoteRecordingBy = msg.active ? (msg.by || "Jemand") : null;
      remoteRecordingId = msg.active && participant ? participant.identity : null;
      updateRecordingUI();
    } else if (msg.t === "chat" && participant) {
      receiveChatMessage(displayNameOf(participant), String(msg.text == null ? "" : msg.text));
    } else if (msg.t === "hand" && participant) {
      if (msg.raised) {
        hands.set(participant.identity, {
          ts: Number(msg.ts) || Date.now(),
          name: displayNameOf(participant)
        });
      } else {
        hands.delete(participant.identity);
      }
      renderHands();
    } else if (msg.t === "hand-lower") {
      // Ein Moderator hat eine Hand gesenkt. Betrifft es die eigene, hier auch
      // den eigenen Zustand nachziehen, sonst zeigt der Knopf weiter "senken".
      if (room && msg.target === room.localParticipant.identity) {
        handRaised = false;
        handRaisedAt = 0;
        updateHandButton();
      }
      hands.delete(msg.target);
      renderHands();
    }
  } catch (_) {}
}

function onParticipantConnected() {
  renderParticipants();
  // Wer nach dem Betreten dazukommt, steht noch nicht in den geladenen
  // Foto-Ständen — sonst bliebe er als Einziger bei seinen Initialen.
  fotoVersionenNachziehen();
  if (recorder) broadcastRecording(true); // neu Hinzugekommene über die laufende Aufnahme informieren
  // Wer neu dazukommt, kennt die bereits erhobenen Hände nicht (Data-Messages
  // haben keinen Verlauf). Also meldet jeder mit erhobener Hand sich erneut --
  // mit dem URSPRÜNGLICHEN Zeitstempel, damit die Reihenfolge stimmt.
  if (handRaised) publishJson({ t: "hand", raised: true, ts: handRaisedAt });
}

function onParticipantDisconnected(p) {
  // Verlässt der Aufnehmende hart (ohne "stop"-Nachricht), Banner trotzdem entfernen.
  if (p && remoteRecordingId && p.identity === remoteRecordingId) {
    remoteRecordingBy = null;
    remoteRecordingId = null;
  }
  if (p && hands.delete(p.identity)) renderHands();
  renderParticipants();
  updateRecordingUI();
}

function updateRecordingUI() {
  const amRecording = !!recorder;
  btnRecord.classList.toggle("hidden", !(isModerator && recordingSupported));
  btnRecord.classList.toggle("recording", amRecording);
  $("rec-icon").textContent = amRecording ? "⏹" : "⏺";
  $("rec-label").textContent = amRecording ? "Stoppen" : "Aufnehmen";
  // Transkript-Toggle: nur für Moderatoren, nur wo Aufnahme + Whisper laufen können.
  btnTranscribe.classList.toggle("hidden", !(isModerator && recordingSupported && transcribeSupported));
  btnTranscribe.classList.toggle("active", wantTranscript);
  btnTranscribe.disabled = transcribing;
  $("transcribe-label").textContent = wantTranscript ? "Transkript: an" : "Transkript";
  const activeBy = amRecording ? "dir" : remoteRecordingBy;
  if (activeBy) {
    recBannerText.textContent = "Aufnahme läuft" + (activeBy === "dir" ? "" : " (durch " + activeBy + ")");
    recBanner.classList.remove("hidden");
  } else {
    recBanner.classList.add("hidden");
  }
}

// ------------------------------------------------------------------
// Helfer
// ------------------------------------------------------------------
function displayName(u) {
  if (!u) return "";
  const n = [u.vorname, u.nachname].filter(Boolean).join(" ").trim();
  return n || prettify(u.username || "");
}
function displayNameOf(p) {
  return p.name || prettify(p.identity || "");
}
function prettify(id) {
  return String(id).replace(/[._]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}
function initials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}
// ------------------------------------------------------------------
// Nutzerfotos auf den Kacheln (seit 2026-08-04)
// ------------------------------------------------------------------
//
// Zeigt das Bild, das jeder in der Tools-Übersicht unter "Mein Foto" hinterlegt
// hat. Der Join läuft über die LiveKit-Identity — die IST der Gateway-Username
// (handleLivekitToken setzt sie so). Wer kein Bild hat, behält seine Initialen.
//
// ⚠️ Case-insensitiv verglichen: das Gateway liefert Namen mal groß, mal klein.
// Gleiche Vorsichtsmaßnahme wie myPlayerId() im Kadermanager.
let nutzerfotoVersionen = {};

// "<nutzername>@<version>" -> Objekt-URL. Die Version MUSS im Schlüssel stehen:
// sonst bliebe nach dem Hinterlegen eines neuen Bildes das alte im Cache hängen.
const nutzerfotoBlobs = new Map();

// Läuft gerade ein Abruf für diesen Schlüssel? Ohne das startet jedes
// renderParticipants() einen neuen — und die Funktion läuft bei jedem
// Stummschalten, jeder Wortmeldung und jeder Chatnachricht erneut.
const nutzerfotoLaeuft = new Set();

let fotoNachladeTimer = null;

function fotoVersionFuer(identity) {
  if (!identity) return null;
  const gesucht = String(identity).toLowerCase();
  for (const name in nutzerfotoVersionen) {
    if (name.toLowerCase() === gesucht) return nutzerfotoVersionen[name] || null;
  }
  return null;
}

// Best effort: antwortet der Worker nicht, bleibt es bei den Initialen. Ein
// fehlendes Bild darf eine laufende Besprechung nie stören.
async function ladeNutzerfotoVersionen() {
  try {
    nutzerfotoVersionen = await fetchNutzerfotoVersionen();
    renderParticipants();
  } catch (_) { /* Initialen bleiben */ }
}

// Neuzugänge sammeln und in EINEM Aufruf nachziehen. Bei einer Trainerversammlung
// treten schnell hintereinander viele Leute ein — ein Aufruf je Person wäre eine
// Anfragenflut für eine Auskunft, die ohnehin alle Konten auf einmal liefert.
function fotoVersionenNachziehen() {
  if (fotoNachladeTimer) return;
  fotoNachladeTimer = setTimeout(() => {
    fotoNachladeTimer = null;
    if (room) ladeNutzerfotoVersionen();
  }, 1500);
}

// Setzt das Bild auf einen fertig gebauten Avatar. Der Aufrufer hat die Initialen
// schon gesetzt — bleibt es dabei, ist nichts verloren.
function avatarFotoAnwenden(avatar, identity) {
  const version = fotoVersionFuer(identity);
  if (!version) return;
  const schluessel = identity + "@" + version;
  avatar.dataset.fotoFor = schluessel;

  const fertig = nutzerfotoBlobs.get(schluessel);
  if (fertig) { avatarBildSetzen(avatar, fertig); return; }
  if (nutzerfotoLaeuft.has(schluessel)) return;

  nutzerfotoLaeuft.add(schluessel);
  gatewayFetchNutzerfoto(identity)
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      nutzerfotoBlobs.set(schluessel, url);
      // ⚠️ Nach dem await ist die Kachel meist eine ANDERE: renderParticipants()
      // baut das Raster bei jedem Ereignis komplett neu auf. Deshalb über den
      // Schlüssel neu suchen statt das alte Element festzuhalten. Bewusst per
      // Vergleich statt Attribut-Selektor + CSS.escape — das gibt es auf den
      // älteren iOS-Geräten der Flotte nicht überall, und es sind nie mehr als
      // eine Handvoll Kacheln.
      document.querySelectorAll(".tile-avatar").forEach((el) => {
        if (el.dataset.fotoFor === schluessel) avatarBildSetzen(el, url);
      });
    })
    .catch(() => { /* Initialen bleiben stehen */ })
    .finally(() => nutzerfotoLaeuft.delete(schluessel));
}

function avatarBildSetzen(avatar, url) {
  avatar.textContent = "";
  avatar.classList.add("has-foto");
  avatar.style.backgroundImage = 'url("' + url + '")';
}

// Beim Verlassen aufräumen: eine Objekt-URL bleibt sonst gültig, solange der Tab
// offen ist — auch für den Nächsten, der sich an diesem Gerät anmeldet.
function nutzerfotosLeeren() {
  nutzerfotoBlobs.forEach((url) => URL.revokeObjectURL(url));
  nutzerfotoBlobs.clear();
  nutzerfotoLaeuft.clear();
  nutzerfotoVersionen = {};
  if (fotoNachladeTimer) { clearTimeout(fotoNachladeTimer); fotoNachladeTimer = null; }
}

const AVATAR_COLORS = ["#1a56a0", "#2d8c4e", "#c9941f", "#8e44ad", "#c0392b", "#16a085", "#d35400", "#2c3e50"];
function avatarColor(id) {
  let h = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function setLobbyError(msg) { $("lobby-error").textContent = msg || ""; }
let statusTimer = null;
function flashStatus(msg, cls) {
  saveStatus.textContent = msg;
  saveStatus.className = "header-status " + (cls || "");
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { saveStatus.textContent = ""; saveStatus.className = "header-status"; }, 4000);
}
