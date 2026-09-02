// Zugang über das zentrale ToolsUebersicht-Login-Gateway — gleiches Muster wie
// die anderen Gateway-Apps (Vorbild E:\abwesenheitskalender\db.js), aber
// ZUSTANDSLOS: die Besprechung speichert nichts in Nextcloud (kein
// dav-load/dav-save). Die einzige Server-Aufgabe ist, dem eingeloggten &
// berechtigten Trainer ein kurzlebiges LiveKit-Zugangstoken auszustellen
// (Aktion "livekit-token" im admin-worker.js). Der LiveKit-API-Secret bleibt
// dabei serverseitig — der Client bekommt nur das fertige, signierte Token.
const GATEWAY_URL = "https://landingpage.michel-brunner.workers.dev";
const TOKEN_STORAGE_KEY = "tu_session_token";
const GATEWAY_APP_ID = "besprechung";

class NotLoggedInError extends Error {
  constructor(message) {
    super(message || "Nicht angemeldet");
    this.name = "NotLoggedInError";
  }
}

function getSessionToken() {
  try { return localStorage.getItem(TOKEN_STORAGE_KEY); } catch (_) { return null; }
}

async function gatewayRequest(payload) {
  const token = getSessionToken();
  if (!token) throw new NotLoggedInError();
  const resp = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify(payload)
  });
  if (resp.status === 401) throw new NotLoggedInError("Sitzung abgelaufen");
  if (resp.status === 403) throw new Error("Kein Zugriff auf diese Besprechung.");
  if (!resp.ok) {
    let detail = "";
    try { const b = await resp.json(); if (b && b.error) detail = ": " + b.error; } catch (_) {}
    throw new Error(`Gateway-Fehler (HTTP ${resp.status})${detail}`);
  }
  return resp.json();
}

// Liefert {username, isAdmin, groupIds, vorname, nachname, canEdit} der eingeloggten Person.
async function fetchMe() {
  return gatewayRequest({ action: "me", app: GATEWAY_APP_ID });
}

// Fordert ein LiveKit-Access-Token für den angegebenen Raum an. Liefert
// { token, url, identity, name }:
//   token    – signiertes LiveKit-JWT (gültig wenige Stunden)
//   url      – wss://…​.livekit.cloud-Adresse der LiveKit-Cloud (aus Worker-Secret,
//              nicht im Client hartkodiert)
//   identity – eindeutige Teilnehmer-ID (= Gateway-Username)
//   name     – Anzeigename für die Teilnehmer-Kachel
async function fetchLivekitToken(room) {
  return gatewayRequest({ action: "livekit-token", app: GATEWAY_APP_ID, room });
}

// ---------- Nutzerfotos aus "Mein Konto" ----------
//
// Die Kacheln zeigen das Bild, das jeder in der Tools-Übersicht unter "Mein Foto"
// hinterlegt hat. Beides sind bestehende Gateway-Aktionen — hier ist KEIN
// Worker-Redeploy nötig, die Besprechung bleibt weiterhin zustandslos.
//
// ⚠️ Bewusst NICHT über dav-file-get: das Foto gehört zum Konto, nicht zu dieser
// App. Gleiche Begründung wie im Kadermanager (E:\kadermanager\db.js).

// Alle Foto-Stände in EINEM Aufruf: {username: fotoVersion}. Liest im Worker nur
// nutzer.json, keine einzige Bilddatei — deshalb billig genug, um ihn beim
// Betreten und bei Neuzugängen zu wiederholen.
async function fetchNutzerfotoVersionen() {
  const body = await gatewayRequest({ action: "nutzerfoto-versionen" });
  return (body && body.versionen && typeof body.versionen === "object") ? body.versionen : {};
}

// Ein einzelnes Bild. Der Abruf verlangt den Token, ein schlichtes <img src="…">
// geht deshalb nicht — die Bytes müssen geholt und als Objekt-URL eingehängt werden.
async function gatewayFetchNutzerfoto(username) {
  const token = getSessionToken();
  if (!token) throw new NotLoggedInError();
  const resp = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ action: "nutzerfoto-get", username })
  });
  if (resp.status === 401) throw new NotLoggedInError("Sitzung abgelaufen");
  if (!resp.ok) throw new Error("Foto nicht abrufbar (HTTP " + resp.status + ")");
  return resp.blob();
}

// Moderations-Aktionen (nur Bearbeiter). Der Worker prüft die Berechtigung
// (resolveEditPermission) und führt den eigentlichen LiveKit-Server-Befehl
// aus — der Client stößt ihn nur an.
async function livekitKick(room, identity) {
  return gatewayRequest({ action: "livekit-kick", app: GATEWAY_APP_ID, room, identity });
}
async function livekitMute(room, identity, trackSid) {
  return gatewayRequest({ action: "livekit-mute", app: GATEWAY_APP_ID, room, identity, trackSid });
}
