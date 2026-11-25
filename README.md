# Rais Bauzeichnung

Grundriss-Editor im Browser: Bauzeichnungen (PDF/Bild) importieren, per KI oder von Hand in einen bearbeitbaren Grundriss übertragen, Wände und Räume nachjustieren, Flächen prüfen und die Wohnung in 2D und 3D mit Möbeln einrichten (Home Staging).

## Funktionen

- **Projekte & Etagen**: mehrere Projekte, mehrere Etagen pro Projekt, lokal im Browser gespeichert (IndexedDB), Export/Import als `.rais.json`.
- **2D-Editor**: Wände zeichnen (Fangen an Ecken, Wände, 45°/90°, Ausrichtungslinien, Länge eintippen), Raum-Rechteck, Türen, Fenster, Schiebetüren, Durchgänge, Maßketten, Texte. Wände parallel verschieben, Endpunkte ziehen, teilen, Dicke/Höhe/Art ändern. Kreuzende Wände werden automatisch geteilt.
- **Räume & Flächen**: Räume entstehen automatisch aus geschlossenen Wänden. Fläche nach lichten Maßen, Umfang, Soll-Fläche laut Plan mit Abweichungsanzeige, Wohnfläche (Balkon/Terrasse zu 25 %), CSV-Flächenliste.
- **Bauzeichnung importieren**: PDF oder Bild als Unterlage. Bei Architekten-PDFs werden Maßstab (z. B. 1:100), Raumnamen und Flächen aus dem Textlayer gelesen. Kalibrieren über eine bekannte Strecke. „Raumnamen übernehmen“ beschriftet nachgezeichnete Räume.
- **KI-Erkennung**: Claude erkennt Wände, Öffnungen und Räume auf der Bauzeichnung und legt einen bearbeitbaren Entwurf an.
- **Möbel**: rund 45 parametrische Möbel (Wohnen, Schlafen, Essen, Küche, Bad, Arbeiten, Deko, Außen) mit 2D-Symbol und 3D-Modell, Farben/Bezüge, Maße anpassbar. **Eigene Möbel** aus Bauteilen (Quader, Zylinder, Kugel, Kegel) mit Live-Vorschau anlegen, pro Projekt oder global.
- **Home Staging**: Räume oder die ganze Etage automatisch passend zum Raumtyp einrichten, in vier Stilen; Türbereiche bleiben frei.
- **3D**: Umschauen, Draufsicht mit angeschnittenen Wänden (Präsentationsplan), Rundgang (WASD). Möbel direkt in 3D verschieben.
- **Präsentationsansicht 2D**: Bodenbeläge, Schatten, Raumschilder.
- **KI-Assistent**: Chat, der den Plan über Werkzeuge ändert („Mach das Schlafzimmer 50 cm breiter“, „Richte das Wohnzimmer skandinavisch ein“). Jede KI-Runde ist ein Rückgängig-Schritt.
- **Export**: PNG, SVG, Drucken/PDF, 3D-Bild, 3D-Modell (GLB), Flächenliste (CSV), Projektdatei.

## Entwicklung

```bash
npm install          # kopiert auch den pdf.js-Worker nach public/
npm run dev          # http://localhost:3000
npm test             # Unit-Tests (Geometrie, Staging, KI-Werkzeuge)
npm run test:e2e     # Playwright (baut und startet auf Port 3021)
npm run lint
npm run typecheck
npm run build
```

Für den PDF-Import-Test eine Bauzeichnung als `tests/fixtures/bauzeichnung-beispiel.pdf` ablegen (wird nicht eingecheckt).

### Umgebungsvariablen

| Variable | Zweck |
| --- | --- |
| `ANTHROPIC_API_KEY` | Server-Key für KI-Erkennung und Assistent. Ohne Key melden beide eine klare Fehlermeldung. |

Alternativ kann im Assistenten (Schlüssel-Symbol) ein eigener Key hinterlegt werden. Er bleibt im Browser und wird als `x-anthropic-key` an die eigenen API-Routen geschickt, die ihn statt des Server-Keys verwenden (vorbereitet für Kunden-Dashboards mit eigenem Key).

## Architektur

- `src/model/` – reines TypeScript ohne React: Datenmodell (`types.ts`), Geometrie und Raumerkennung (`geometry.ts`, planare Flächen des Wandgraphen, Innenmaß per Polygon-Inset), Bearbeitungsoperationen (`ops.ts`), Wandstücke für 2D/3D (`walls.ts`), Staging (`staging.ts`), Materialien (`materials.ts`).
- `src/store/editor.ts` – Zustand (zustand + immer) mit Undo/Redo über unveränderliche Projekt-Snapshots.
- `src/components/plan/` – SVG-Planansicht mit allen Werkzeugen.
- `src/components/three/` – 3D-Szene (react-three-fiber).
- `src/components/editor/` – Oberfläche: Werkzeugleiste, Bibliothek, Eigenschaften, Import, KI-Chat.
- `src/ai/` – Werkzeugdefinitionen und deren Ausführung im Browser, Umwandlung der KI-Erkennung.
- `src/app/api/ai/` – `import` (Vision-Erkennung) und `chat` (eine Assistenten-Runde). Die Unterhaltung und das Ausführen der Werkzeuge laufen im Browser, weil der Plan dort liegt; der Server hält nur den Key.

Koordinaten sind Meter, x nach rechts, y nach unten. Wände sind durch ihre Achse definiert.
