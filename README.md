# 🎙️ Besprechung

Der digitale Treffpunkt für Trainer: ein **Sprachraum direkt im Browser**,
inklusive Bildschirm teilen — gedacht für die hybride Trainerversammlung, bei
der ein Teil im Raum sitzt und ein Teil zu Hause.

**➡️ [Besprechung öffnen](https://sc1911heiligenstadt.github.io/besprechung/)**

## Was drin ist

| Reiter | Wofür |
|---|---|
| **Besprechung** | Die Lobby und der Raum selbst — betreten, sprechen, teilen, chatten |
| **Info** | Was die App tut, die Änderungen und der Datenschutz-Hinweis |

## Was es kann

- **Sprechen und zuhören** im Browser, ohne Installation und ohne fremdes Konto.
  In der Lobby ist *Stummgeschaltet beitreten* vorausgewählt.
- **Bildschirm teilen**, etwa um eine Auswertung oder einen Plan zu zeigen —
  wahlweise im echten Vollbild. Auf dem iPhone geht das systembedingt nicht;
  Mikrofon und Zuhören funktionieren dort normal.
- **Chat** nebenher — flüchtig, siehe unten.
- **Hand heben**: eine Wortmeldung erscheint auf der eigenen Kachel und in einer
  Liste, die die Reihenfolge festhält.
- **Moderieren**: Teilnehmer stummschalten oder aus dem Raum entfernen.
- **Aufnahme mit Transkript** auf dem eigenen Gerät.

Das Konto-Foto aus der Tools-Übersicht erscheint auch hier.

## Zugang

Die Anmeldung läuft über die [Tools-Übersicht](https://sc1911heiligenstadt.github.io/ToolsUebersicht/) — dort einmal anmelden, danach ist dieses Werkzeug offen.

Weil nichts gespeichert wird, sind die Stufen hier anders geschnitten als sonst: **Sehen** heißt bereits mitmachen — den Raum betreten, sprechen, zuhören, Bildschirm teilen, chatten und die Hand heben. **Bearbeiten** kommt nur für die Moderation dazu: stummschalten, Teilnehmer entfernen, aufnehmen und transkribieren. Geprüft wird jede dieser Aktionen auf dem Server. Wer welche Stufe hat und ob das Werkzeug überhaupt sichtbar ist, legt die Tools-Übersicht fest. Der Reiter *Info* ist für alle sichtbar.

## Lokal starten

Über den Eintrag `besprechung` in `E:\.claude\launch.json` — der Server läuft dann auf `http://localhost:8788/`.

## Technik

Vanilla JavaScript ohne Build-Schritt — die Dateien werden so ausgeliefert, wie sie im Repo liegen. Veröffentlicht über GitHub Pages.

**Dieses Werkzeug speichert nichts.** Es gibt kein Dokument in der Nextcloud, keine Chatverläufe und keine Aufzeichnung auf einem Server. Die einzige Berührung mit dem Verein ist ein kurzlebiger Zugangsschlüssel für den Sprachraum; Bild, Ton und Chat laufen danach über einen externen Übertragungsdienst, für dessen Serverstandort wir keine Zusicherung machen können. Aufgezeichnet wird dort nichts. Der Chat ist flüchtig — wer später dazukommt, sieht das bisher Geschriebene nicht.

Eine Aufnahme und das daraus erzeugte Transkript entstehen **auf dem Gerät der aufnehmenden Person** und landen als Datei dort. Es wird kein Ton hochgeladen. Die Aufnahme läuft nur, solange dieser Tab offen bleibt.

Die Medien-Bibliothek wird erst geladen, wenn der Sprachraum wirklich betreten wird — beim Aufrufen der Seite kostet sie nichts.

---

Ein Werkzeug des 1. SC 1911 Heiligenstadt. Alle Werkzeuge auf einen Blick: [Tools-Übersicht](https://sc1911heiligenstadt.github.io/ToolsUebersicht/) · Erklärungen im [Toolbox Wiki](https://sc1911heiligenstadt.github.io/Vereinswiki/).
