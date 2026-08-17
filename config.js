const APP_VERSION = "1.0";

// Fester Hauptraum. Die Besprechung kennt bewusst nur EINEN Raum. Mehrere
// „Kanäle" ließen sich später ergänzen, indem man hier mehrere Räume anbietet
// und den Namen an fetchLivekitToken(room) durchreicht — die Server-Aktion
// nimmt ihn schon entgegen.
const ROOM_NAME = "besprechung";
const ROOM_LABEL = "Besprechung";

const APP_CHANGELOG = [
  {
    version: "1.1",
    groups: [
      {
        title: "Startet schneller",
        items: [
          "Die Video-Bibliothek wird erst geladen, wenn du den Raum wirklich betrittst. Vorher kam sie bei jedem Öffnen der Seite mit — das waren 90 KB, auch wenn man nur nachschauen wollte, ob schon jemand da ist.",
          "Am Ablauf ändert sich nichts: „Raum betreten“ lädt sie automatisch nach. Klappt das nicht, steht der Grund wie bisher direkt unter dem Knopf."
        ]
      }
    ]
  },
  {
    version: "1.0",
    groups: [
      {
        title: "Besprechung",
        items: [
          "Sprach-Treffpunkt für Trainer: eintreten, reden, zuhören — direkt im Browser, ohne Zusatz-App.",
          "Zeigt an, wer im Raum ist und wer gerade spricht. Trägt von wenigen Trainern bis zur ganzen hybriden Versammlung.",
          "In der Lobby ist „Stummgeschaltet beitreten“ vorausgewählt — man kommt leise in den Raum und schaltet das Mikrofon frei, wenn man sprechen will.",
          "Im Kopfbereich gibt es bewusst kein „Zurück zum Dashboard“: die Besprechung öffnet sich in einem eigenen Tab, das Dashboard bleibt daneben stehen. So reißt kein Fehlklick jemanden mitten aus dem Gespräch oder einer laufenden Aufnahme. Zum Beenden gibt es „Verlassen“."
        ]
      },
      {
        title: "Foto auf der Teilnehmerkachel",
        items: [
          "Wer in der Tools-Übersicht unter „Mein Konto“ ein Foto hinterlegt hat, wird hier damit angezeigt — an der Stelle, an der sonst die Initialen stehen.",
          "Ohne hinterlegtes Bild bleibt es bei den Initialen in der gewohnten Farbe. Es muss also niemand etwas tun.",
          "Das Bild pflegt jeder selbst in der Tools-Übersicht unter „Mein Konto“ → „Mein Foto“. Eine Änderung dort ist beim nächsten Betreten der Besprechung zu sehen."
        ]
      },
      {
        title: "Bildschirm teilen",
        items: [
          "Ein Klick, und der eigene Monitor erscheint bei allen anderen groß auf der Bühne.",
          "Die Bühne nutzt dabei die volle Fensterbreite und -höhe statt der schmalen Spalte in der Mitte.",
          "Der Knopf oben rechts auf der Bühne schaltet echtes Vollbild ein — beenden mit demselben Knopf oder mit Esc.",
          "Während geteilt wird, rücken die Teilnehmerkacheln zusammen und werden kleiner. Wer spricht, bleibt am grünen Rahmen erkennbar.",
          "Endet die Freigabe im Vollbild, schließt sich das Vollbild von selbst.",
          "Auf dem iPhone lässt sich der Bildschirm systembedingt nicht teilen; Mikrofon und Zuhören funktionieren dort normal."
        ]
      },
      {
        title: "Chat",
        items: [
          "Der Knopf in der Steuerleiste öffnet einen Chat für alle im Raum — gedacht für alle, die gerade kein Mikrofon haben oder sich lieber schriftlich melden.",
          "Der Chat klappt rechts auf, der geteilte Bildschirm rückt zur Seite statt überdeckt zu werden.",
          "Kommt eine Nachricht bei geschlossenem Chat, erscheinen eine Vorschau und ein Zähler am Knopf.",
          "Nachrichten sind flüchtig: sie bleiben nur während der Besprechung sichtbar und werden nirgends gespeichert. Wer später dazukommt, sieht das bisher Geschriebene nicht."
        ]
      },
      {
        title: "Wortmeldung",
        items: [
          "Der Knopf „Hand heben“ zeigt allen, dass man etwas sagen möchte — auf der eigenen Kachel und in einer Liste über den Teilnehmern.",
          "Die Liste hält die Reihenfolge der Meldungen fest, damit niemand übersehen wird.",
          "Die eigene Meldung nimmt derselbe Knopf zurück; Moderatoren können eine erledigte Wortmeldung abhaken."
        ]
      },
      {
        title: "Moderation",
        items: [
          "Bearbeiter können Teilnehmer stummschalten oder aus dem Raum entfernen. Die Knöpfe sitzen direkt auf der jeweiligen Teilnehmerkachel.",
          "Geprüft wird jede dieser Aktionen auf dem Server; die Knöpfe allein sind nur Anzeige."
        ]
      },
      {
        title: "Aufnahme und Transkript",
        items: [
          "Bearbeiter können die Besprechung im Browser aufnehmen — den Ton aller Teilnehmer und den geteilten Bildschirm. Die Datei landet am Ende auf dem eigenen Gerät.",
          "Während einer Aufnahme sehen alle Teilnehmer einen deutlichen Hinweis.",
          "Aus einer Aufnahme lässt sich ein Transkript erzeugen: vor dem Stoppen „Transkript“ einschalten, danach entstehen eine Textdatei mit Zeitmarken und eine Untertiteldatei.",
          "Die Transkription läuft vollständig im eigenen Browser. Ein Sprachmodell wird beim ersten Mal einmalig geladen, der Ton verlässt das Gerät nicht.",
          "Die Aufnahme läuft nur, solange der Tab offen ist. Wer den Raum verlässt oder den Tab schließt, beendet sie.",
          "Es gibt keine Sprecher-Trennung: das Transkript ist durchlaufender Text und als Grundlage zum Gegenlesen gedacht, nicht als wörtliches Protokoll."
        ]
      },
      {
        title: "Nichts wird gespeichert",
        items: [
          "Die Besprechung legt bewusst nichts dauerhaft ab: keinen Chatverlauf, keine Aufzeichnung auf dem Server, keine Teilnehmerliste.",
          "Die einzige Server-Berührung ist der Eintritt in den Raum. Danach läuft der Ton direkt zwischen den Teilnehmern und dem Verteilserver."
        ]
      },
      {
        title: "Bedienung am Handy",
        items: [
          "Die Reiterleiste bricht am Handy um, statt seitlich aus dem Bild zu laufen — auch die hinteren Reiter sind auf schmalen Bildschirmen erreichbar.",
          "Eingabefelder sind mindestens 16 Pixel groß, damit der iPhone-Browser beim Antippen nicht ungefragt in die Seite hineinzoomt und verschoben stehen bleibt.",
          "Die Steuerleiste hält am unteren Rand Abstand zum Bedienbalken neuerer iPhones."
        ]
      },
      {
        title: "Wer darf was",
        items: [
          "Sehen: den Raum betreten, sprechen, zuhören, Bildschirm teilen, chatten und die Hand heben.",
          "Bearbeiten: zusätzlich moderieren — stummschalten, entfernen — sowie aufnehmen und transkribieren.",
          "Der Reiter „Info“ ist für alle sichtbar."
        ]
      }
    ]
  }
];
