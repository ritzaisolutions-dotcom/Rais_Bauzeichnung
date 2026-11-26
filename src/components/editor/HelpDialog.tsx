"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { Button, Dialog } from "../ui";

const SHORTCUTS: [string, string][] = [
  ["V / H", "Auswählen / Verschieben der Ansicht"],
  ["W", "Wand zeichnen (Länge tippen + Enter, Doppelklick beendet)"],
  ["Q", "Raum als Rechteck aufziehen"],
  ["T / F", "Tür / Fenster setzen"],
  ["M / X", "Bemaßung / Text"],
  ["Umschalt + Ziehen", "Rahmenauswahl"],
  ["Umschalt + Klick", "Zur Auswahl hinzufügen"],
  ["Strg + C / X / V", "Kopieren / Ausschneiden / Einfügen, auch auf andere Etagen"],
  ["Strg + D", "Auswahl duplizieren"],
  ["Strg + Z / Strg + Umschalt + Z", "Rückgängig / Wiederholen"],
  ["Entf", "Auswahl löschen"],
  ["Pfeiltasten", "Auswahl um 5 cm verschieben (mit Umschalt 50 cm)"],
  ["R", "Möbel um 90° drehen (mit Umschalt 15°)"],
  ["Alt beim Ziehen", "Ohne Fangen (frei platzieren)"],
  ["Leertaste + Ziehen", "Ansicht verschieben"],
  ["Esc", "Werkzeug beenden"],
  ["?", "Diese Hilfe"],
];

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Tastenkürzel und Bedienung">
      <div className="space-y-4 text-sm">
        <table className="w-full">
          <tbody>
            {SHORTCUTS.map(([k, t]) => (
              <tr key={k} className="border-b border-line/60">
                <td className="whitespace-nowrap py-1.5 pr-4 font-mono text-xs">{k}</td>
                <td className="py-1.5">{t}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted">
          Möbel docken beim Ziehen mit der Rückseite an Wände an. Rot umrandete Möbel überschneiden eine Wand oder ein
          anderes Möbelstück. Beim Nachzeichnen fangen Klicks an den Wänden der Bauzeichnung (türkis gestrichelt).
        </p>
        <div className="flex justify-end">
          <Button onClick={onClose}>Schließen</Button>
        </div>
      </div>
    </Dialog>
  );
}

const INTRO_KEY = "rais.introSeen";

const readSeen = () => {
  try {
    return localStorage.getItem(INTRO_KEY) === "1";
  } catch {
    return true;
  }
};

/** Short first-run guide; does not block the editor. */
export function IntroCard({ onHelp }: { onHelp: () => void }) {
  const [seen, setSeen] = useState(readSeen);
  if (seen) return null;
  const close = () => {
    try {
      localStorage.setItem(INTRO_KEY, "1");
    } catch {
      // private mode: show again next time
    }
    setSeen(true);
  };
  return (
    <div
      className="absolute bottom-3 left-3 z-20 w-80 rounded-xl border border-line bg-panel p-4 text-sm shadow-xl"
      data-testid="intro"
    >
      <div className="mb-2 flex items-start justify-between">
        <span className="font-semibold">So geht es los</span>
        <button type="button" aria-label="Schließen" onClick={close}>
          <X size={16} />
        </button>
      </div>
      <ol className="list-decimal space-y-1 pl-4 text-muted">
        <li>„Bauzeichnung“ öffnet ein PDF oder Bild, die KI erkennt Wände und Räume.</li>
        <li>Wände mit W nachzeichnen oder Räume mit Q aufziehen; Flächen erscheinen sofort.</li>
        <li>Möbel aus der Bibliothek ziehen oder „Alle Räume einrichten“.</li>
        <li>„Präsentation“ und 3D zeigen das Ergebnis, „Export“ speichert es.</li>
      </ol>
      <div className="mt-3 flex justify-between">
        <Button size="sm" variant="ghost" onClick={onHelp}>
          Alle Tastenkürzel (?)
        </Button>
        <Button size="sm" variant="primary" onClick={close}>
          Verstanden
        </Button>
      </div>
    </div>
  );
}
