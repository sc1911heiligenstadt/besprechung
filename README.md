# 🎙️ Besprechung

Der digitale Treffpunkt für Trainer: ein **Sprachraum direkt im Browser**,
inklusive Bildschirm teilen — gedacht für die hybride Trainerversammlung, bei
der ein Teil im Raum sitzt und ein Teil zu Hause.

**➡️ [Besprechung öffnen](https://sc1911heiligenstadt.github.io/besprechung/)**

## Was es kann

- **Sprechen und zuhören** im Browser, ohne Installation und ohne fremdes Konto.
- **Bildschirm teilen**, etwa um eine Auswertung oder einen Plan zu zeigen.
- **Chat** nebenher — flüchtig, siehe unten.
- **Aufnahme mit Transkript** auf dem eigenen Gerät.

Das Konto-Foto aus der Tools-Übersicht erscheint auch hier.

## Zugang

Die Anmeldung läuft über die [Tools-Übersicht](https://sc1911heiligenstadt.github.io/ToolsUebersicht/) — dort einmal anmelden, danach ist dieses Werkzeug offen.

Dieses Werkzeug kennt keine Bearbeitungs-Stufen, weil es nichts speichert: Wer Zugriff hat, betritt den Sprachraum und kann Bildschirm und Ton teilen. Ob das Werkzeug überhaupt sichtbar ist, legt die Tools-Übersicht fest.

## Lokal starten

Über den Eintrag `besprechung` in `E:\.claude\launch.json` — der Server läuft dann auf `http://localhost:8788/`.

## Technik

Vanilla JavaScript ohne Build-Schritt — die Dateien werden so ausgeliefert, wie sie im Repo liegen. Veröffentlicht über GitHub Pages.

**Dieses Werkzeug speichert nichts.** Es gibt kein Dokument in der Nextcloud, keine Chatverläufe und keine Aufzeichnung auf einem Server. Die einzige Server-Berührung ist ein kurzlebiger Zugangsschlüssel für den Sprachraum; Ton und Bild laufen danach direkt über den Medien-Dienst. Der Chat ist flüchtig — wer später dazukommt, sieht das bisher Geschriebene nicht.

Eine Aufnahme und das daraus erzeugte Transkript entstehen **auf dem Gerät der aufnehmenden Person** und landen als Datei dort. Es wird kein Ton hochgeladen. Die Aufnahme läuft nur, solange dieser Tab offen bleibt.

Die Medien-Bibliothek wird erst geladen, wenn der Sprachraum wirklich betreten wird — beim Aufrufen der Seite kostet sie nichts.

---

Ein Werkzeug des 1. SC 1911 Heiligenstadt. Alle Werkzeuge auf einen Blick: [Tools-Übersicht](https://sc1911heiligenstadt.github.io/ToolsUebersicht/) · Erklärungen im [Toolbox Wiki](https://sc1911heiligenstadt.github.io/Vereinswiki/).
