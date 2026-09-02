const APP_VERSION = "1.0";

// Fester Hauptraum. Die Besprechung kennt bewusst nur EINEN Raum. Mehrere
// „Kanäle" ließen sich später ergänzen, indem man hier mehrere Räume anbietet
// und den Namen an fetchLivekitToken(room) durchreicht — die Server-Aktion
// nimmt ihn schon entgegen.
const ROOM_NAME = "besprechung";
const ROOM_LABEL = "Besprechung";

const APP_CHANGELOG = [
  {
    version: "1.0",
    groups: [
      {
        title: "Besprechung",
        items: [
          "Sprach-Treffpunkt für Trainer: eintreten, reden, zuhören — direkt im Browser, ohne Zusatz-App.",
          "Zeigt an, wer im Raum ist und wer gerade spricht. Trägt von wenigen Trainern bis zur ganzen hybriden Versammlung.",
          "In der Lobby ist „Stummgeschaltet beitreten“ vorausgewählt — man kommt leise in den Raum und schaltet das Mikrofon frei, wenn man sprechen will.",
          "Wer in der Tools-Übersicht unter „Mein Konto“ → „Mein Foto“ ein Bild hinterlegt hat, wird damit angezeigt; sonst bleibt es bei den Initialen in der gewohnten Farbe. Es muss also niemand etwas tun, und eine Änderung ist beim nächsten Betreten zu sehen.",
          "Im Kopfbereich gibt es bewusst kein „Zurück zum Dashboard“: die Besprechung öffnet sich in einem eigenen Tab, das Dashboard bleibt daneben stehen. So reißt kein Fehlklick jemanden mitten aus dem Gespräch oder einer laufenden Aufnahme. Zum Beenden gibt es „Verlassen“."
        ]
      },
      {
        title: "Bildschirm teilen",
        items: [
          "Ein Klick, und der eigene Monitor erscheint bei allen anderen groß auf der Bühne.",
          "Die Bühne nutzt dabei die volle Fensterbreite und -höhe statt der schmalen Spalte in der Mitte.",
          "Der Knopf oben rechts auf der Bühne schaltet echtes Vollbild ein — beenden mit demselben Knopf oder mit Esc. Endet die Freigabe im Vollbild, schließt sich das Vollbild von selbst.",
          "Während geteilt wird, rücken die Teilnehmerkacheln zusammen und werden kleiner. Wer spricht, bleibt am grünen Rahmen erkennbar.",
          "Auf dem iPhone lässt sich der Bildschirm systembedingt nicht teilen; Mikrofon und Zuhören funktionieren dort normal."
        ]
      },
      {
        title: "Chat und Wortmeldung",
        items: [
          "Der Knopf in der Steuerleiste öffnet einen Chat für alle im Raum — gedacht für alle, die gerade kein Mikrofon haben oder sich lieber schriftlich melden.",
          "Der Chat klappt rechts auf, der geteilte Bildschirm rückt zur Seite statt überdeckt zu werden. Kommt eine Nachricht bei geschlossenem Chat, erscheinen eine Vorschau und ein Zähler am Knopf.",
          "Nachrichten sind flüchtig: sie bleiben nur während der Besprechung sichtbar und werden nirgends gespeichert. Wer später dazukommt, sieht das bisher Geschriebene nicht.",
          "Der Knopf „Hand heben“ zeigt allen, dass man etwas sagen möchte — auf der eigenen Kachel und in einer Liste über den Teilnehmern. Die Liste hält die Reihenfolge der Meldungen fest, damit niemand übersehen wird.",
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
          "Die einzige Berührung mit dem Verein ist der kurzlebige Zugangsschlüssel für den Raum.",
          "Bild, Ton und Chat laufen während der Besprechung über einen externen Übertragungsdienst — anders ginge es nicht, sonst müsste jeder an jeden senden. Für dessen Serverstandort können wir keine Zusicherung machen. Aufgezeichnet wird dort nichts.",
          "Eine Aufnahme, die jemand selbst startet, bleibt auf dessen Gerät. Es wird kein Ton hochgeladen."
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
