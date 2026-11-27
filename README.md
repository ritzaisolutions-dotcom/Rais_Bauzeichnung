# Rais Bauzeichnung

Interner Grundriss-Editor im Browser: Bauzeichnungen (PDF, DXF, Bild) importieren, per KI, automatischer Wanderkennung oder von Hand in einen bearbeitbaren Grundriss übertragen, Flächen nach WoFlV prüfen und die Wohnung in 2D und 3D einrichten (Home Staging). Ergebnisse gehen als maßstäblicher PDF-Plan, DXF, Präsentationsbild, fotorealistisches Bild oder Nur-Lese-Link an Kunden.

## Funktionen

**Projekte und Zugang**
- Optionaler Passwortschutz: Ist `APP_PASSWORD` gesetzt, schützt ein gemeinsames Passwort App und API; ohne die Variable ist die App offen. Teilen-Links (`/teilen/…`) sind immer ohne Passwort lesbar und lassen sich zurückziehen.
- Projekte liegen in Supabase (wenn konfiguriert) oder im Browser (IndexedDB). „Lokale Projekte in die Cloud übernehmen“ zieht Browser-Projekte um. Speichern mit Konfliktprüfung, Bauzeichnungen und 3D-Modelle als eigene Assets.
- Mehrere Etagen, Projektdatei `.rais.json` zum Sichern und Weitergeben.

**Grundriss**
- Wände (Fangen an Ecken, Wänden, 45°/90°, Länge eintippen), Raum-Rechteck, Türen, Fenster, Schiebetüren, Durchgänge, Maßketten, Texte. Wandarten Außen, Tragend, Innen, Geländer.
- Räume entstehen automatisch aus geschlossenen Wänden. Fläche nach lichten Maßen, Soll-Fläche laut Plan, **Wohnfläche nach WoFlV** (Balkon/Terrasse 25 %, unter Dachschrägen 1–2 m zur Hälfte, unter 1 m nicht).
- Dachschräge pro Wand (Kniestock, Neigung) mit 1-m/2-m-Linien im Plan und Schrägdecke in 3D.
- Komfort: Rahmenauswahl (Umschalt + Ziehen), Kopieren/Einfügen auch zwischen Etagen (Strg+C/V/D), Möbel docken an Wände an, Überschneidungen werden rot markiert, Tastenkürzel-Hilfe mit `?`.

**Bauzeichnung importieren**
- PDF (Maßstab, Raumnamen und Flächen aus dem Textlayer), PNG/JPG, **DXF** (maßstäblich, Einheiten mm/cm/m, Blöcke). DWG nur nach Umwandlung in DXF.
- Nachzeichnen mit Fangen an den Wänden der Zeichnung (Wanddicke wird übernommen).
- **Wände ableiten (ohne KI)**: erkennt Wandachsen, Ecken, T-Stöße, Türen und Fenster.
- **KI-Erkennung** (Claude): Ausschnitt wählen, Ergebnis erst als Vorschau mit Flächenabgleich, dann übernehmen, hinzufügen oder verwerfen. Das Bild wird dafür an Anthropic übermittelt.

**Einrichten und Darstellung**
- Rund 60 Möbel und Bauteile: fotorealistische CC0-Modelle (Poly Haven), eigene detaillierte Modelle, Treppen, Stützen, Schornstein, Heizkörper, Leuchten. Eigene Möbel aus Bauteilen oder als **GLB-Upload**.
- Home Staging pro Raum oder Etage in vier Stilen, inklusive offener Wohnküche.
- 2D-Präsentationsplan mit gerenderten Draufsichten (dauerhaft im Browser zwischengespeichert).
- 3D: Umschauen, Draufsicht mit Schnitt, Rundgang (WASD), Tageszeit-Regler mit Abendlicht, Wandfarben und Fliesen pro Raum, mehrere Etagen übereinander.
- **Fotorealistisches Bild** per Pathtracing (Full HD/4K, bis 1000 Durchgänge).

**Export**
- Maßstäblicher **PDF-Plan** (A4/A3, 1:50/1:100/1:200) mit Plankopf, Logo, Maßstabsleiste, Nordpfeil und Flächentabelle.
- **DXF** (R12, mm, Layer für Wände, Öffnungen, Räume, Möbel, Maße), PNG, SVG, 3D-Render, GLB, Flächenliste (CSV), Projektdatei.

**KI-Assistent**: Chat, der den Plan über Werkzeuge ändert („Mach das Schlafzimmer 50 cm breiter“, „Richte das Wohnzimmer skandinavisch ein“). Jede Runde ist ein Rückgängig-Schritt.

## Betrieb (Vercel)

### Umgebungsvariablen

| Variable | Pflicht | Zweck |
| --- | --- | --- |
| `APP_PASSWORD` | nein | Gemeinsames Passwort. Ohne Wert ist die App ohne Anmeldung nutzbar. |
| `APP_SESSION_SECRET` | nein | Schlüssel für das Anmelde-Cookie (30 Tage). Ohne Wert wird er aus dem Passwort abgeleitet; ein Passwortwechsel meldet dann alle ab. |
| `SUPABASE_URL` | für Cloud | z. B. `https://qdywaenmojdxhfxqbvun.supabase.co`. Ohne URL und Key speichert jeder Browser lokal. |
| `SUPABASE_SECRET_KEY` | für Cloud | Secret Key (`sb_secret_…`) aus Supabase → Project Settings → API Keys. Nur serverseitig. |
| `ANTHROPIC_API_KEY` | für KI | Claude-Key für KI-Erkennung und Assistent. Ohne Key melden beide eine klare Fehlermeldung. |
| `AI_DAILY_LIMIT` | nein | KI-Anfragen pro Tag und Server-Instanz (Standard 300); zusätzlich 20 pro Minute und IP. |
| `LOGIN_RATE_LIMIT` | nein | Anmeldeversuche pro Minute und IP (Standard 8). |

Nach Änderungen auf Vercel neu deployen. Im Assistenten kann außerdem ein eigener Claude-Key hinterlegt werden; er bleibt im Browser und wird nur an die eigenen API-Routen geschickt.

### Supabase

Tabellen `rais_projects`, `rais_assets`, `rais_shares` im Projekt „Ritz AI Solutions“. Row Level Security ist an, es gibt bewusst **keine** Policies: Zugriff nur über die Server-Routen mit dem Secret Key. Andere Tabellen des Projekts werden nicht angefasst.

### Fehlerprotokoll

Fehler im Browser gehen an `/api/log` und stehen im Vercel-Log (`"source":"client"`). Meldungen werden gekürzt, URLs ohne Abfrage und Teilen-Token gespeichert, höchstens 10 je Seitenaufruf. Kein Drittanbieter.

## Entwicklung

```bash
npm install          # kopiert auch den pdf.js-Worker nach public/
npm run dev          # http://localhost:3000
npm test             # Unit-Tests (Geometrie, WoFlV, DXF, PDF-Layout, Staging, KI-Werkzeuge …)
npm run test:e2e     # Playwright: baut, startet auf Port 3021 mit Test-Passwort
npm run lint
npm run typecheck
npm run build
```

- Eigene Bauzeichnungen für Tests als `tests/fixtures/*.pdf` ablegen; sie werden nicht eingecheckt.
- Screenshot-Vergleiche (`tests/visual.spec.ts`) nach gewollten Darstellungsänderungen neu erzeugen: `npx playwright test tests/visual.spec.ts --update-snapshots`.
- Firefox und WebKit laufen mit `PW_ALL_BROWSERS=1 npm run test:e2e`, sofern installiert.
- Pathtracing und Draufsichten brauchen WebGL; in Headless-Chrome ohne GPU sind sie sehr langsam.

### 3D-Modelle aktualisieren

`node scripts/fetch-models.mjs` lädt die gelisteten CC0-Modelle von Poly Haven, komprimiert sie und schreibt `public/models/*.glb` sowie `src/furniture/models.generated.json`. Neue Modelle: Asset-ID in `MODELS` eintragen, Skript ausführen, in `src/furniture/catalog.ts` mit `modelPiece(...)` aufnehmen (`rotY` dreht die Vorderseite in den Raum). Nach Änderungen am Sprite-Renderer `RENDER_VERSION` in `src/components/three/sprites.ts` erhöhen.

## Architektur

- `src/model/` – reines TypeScript ohne React: Datenmodell, Geometrie und Raumerkennung, Bearbeitungsoperationen, Staging, WoFlV (`woflv.ts`), Wände aus Zeichnungen (`wallsFromAxes.ts`), Bearbeiten (`editing.ts`).
- `src/store/editor.ts` – Zustand (zustand + immer) mit Undo/Redo, Nur-Lese-Modus für Teilen-Links.
- `src/components/plan/` – SVG-Planansicht mit allen Werkzeugen.
- `src/components/three/` – 3D-Szene, Möbel-Builder, Draufsicht-Renderer.
- `src/components/editor/` – Oberfläche: Werkzeuge, Bibliothek, Eigenschaften, Import, Exporte, KI-Chat.
- `src/lib/` – Speicher (`storage.ts` Cloud/Browser, `cloud/server.ts`), Login (`auth.ts`, `src/proxy.ts`), Import (`planImport.ts`, `dxf.ts`, `underlayLines.ts`), Exporte (`exports.ts`, `pdfExport.ts`, `pathTrace.ts`).
- `src/ai/`, `src/app/api/ai/` – KI-Erkennung und Assistent; die Unterhaltung und die Werkzeuge laufen im Browser, der Server hält nur den Key.

Koordinaten sind Meter, x nach rechts, y nach unten. Wände sind durch ihre Achse definiert.
