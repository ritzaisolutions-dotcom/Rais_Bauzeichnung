"use client";

import { CloudUpload, Copy, FileUp, FolderOpen, LayoutGrid, LogOut, Plus, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  deleteProject,
  isCloud,
  listProjects,
  loadProject,
  localOnlyProjects,
  migrateToCloud,
  saveProject,
  type ProjectSummary,
} from "@/lib/storage";
import { readProjectFile } from "@/lib/exports";
import { uid } from "@/model/ops";
import { createProject } from "@/model/project";
import { Button, Dialog, Field, TextInput } from "../ui";

const timestamp = () => Date.now();

export function ProjectList() {
  const router = useRouter();
  const [rows, setRows] = useState<ProjectSummary[] | null>(null);
  const [cloud, setCloud] = useState(false);
  const [localCount, setLocalCount] = useState(0);
  const [migrating, setMigrating] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<"leer" | "beispiel" | "import">("leer");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const list = await listProjects();
    const c = await isCloud();
    return { list, cloud: c, local: c ? (await localOnlyProjects()).length : 0 };
  };
  const apply = (r: Awaited<ReturnType<typeof load>>) => {
    setRows(r.list);
    setCloud(r.cloud);
    setLocalCount(r.local);
  };
  const fail = (e: unknown) => {
    setRows((r) => r ?? []);
    setError(e instanceof Error ? e.message : "Die Projekte konnten nicht geladen werden.");
  };
  const refresh = () => load().then(apply, fail);
  useEffect(() => {
    load().then(apply, fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
  }, []);

  const create = async () => {
    const p = createProject(name.trim() || "Neues Projekt", template === "beispiel" ? "beispiel" : "leer");
    try {
      await saveProject(p);
    } catch (e) {
      setCreating(false);
      return fail(e);
    }
    router.push(`/project/${p.id}${template === "import" ? "?import=1" : ""}`);
  };

  const duplicate = async (row: ProjectSummary) => {
    const stamp = timestamp();
    const data = await loadProject(row.id).catch(() => null);
    if (!data) return setError("Das Projekt konnte nicht geladen werden.");
    const copy = {
      ...structuredClone(data),
      id: uid(),
      name: `${row.name} (Kopie)`,
      createdAt: stamp,
      updatedAt: stamp,
    };
    await saveProject(copy).catch(fail);
    await refresh();
  };

  const importFile = async (f: File) => {
    try {
      const p = await readProjectFile(f);
      p.id = uid();
      p.updatedAt = timestamp();
      await saveProject(p);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import fehlgeschlagen.");
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white">
              <LayoutGrid size={18} />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Rais Bauzeichnung</h1>
              <p className="text-xs text-muted">Grundrisse erstellen, bearbeiten und in 2D und 3D einrichten</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              title="Abmelden"
              onClick={async () => {
                await fetch("/api/logout", { method: "POST" });
                router.replace("/login");
              }}
            >
              <LogOut size={15} />
            </Button>
            <Button onClick={() => fileRef.current?.click()}>
              <Upload size={15} /> <span className="hidden sm:inline">Projektdatei öffnen</span>
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setName("");
                setTemplate("leer");
                setCreating(true);
              }}
              data-testid="new-project"
            >
              <Plus size={15} /> Neues Projekt
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {localCount > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent-soft/40 p-3 text-sm">
            <span>
              In diesem Browser liegen {localCount} {localCount === 1 ? "Projekt" : "Projekte"}, die noch nicht in der
              Cloud gespeichert sind.
            </span>
            <Button
              variant="primary"
              disabled={!!migrating}
              onClick={async () => {
                setMigrating("0");
                try {
                  await migrateToCloud((d, t) => setMigrating(`${d}/${t}`));
                } catch (e) {
                  fail(e);
                }
                setMigrating(null);
                await refresh();
              }}
            >
              <CloudUpload size={15} />{" "}
              {migrating ? `Übernehme … ${migrating}` : "Lokale Projekte in die Cloud übernehmen"}
            </Button>
          </div>
        )}
        {rows === null ? (
          <p className="text-muted">Lädt …</p>
        ) : rows.length === 0 ? (
          <div className="mx-auto max-w-xl rounded-2xl border border-line bg-panel p-8 text-center">
            <h2 className="text-xl font-semibold">Willkommen</h2>
            <p className="mt-2 text-muted">
              Importieren Sie eine Bauzeichnung (PDF oder Bild) und lassen Sie Wände, Türen und Räume erkennen, oder
              zeichnen Sie einen Grundriss von Grund auf. Danach richten Sie ihn mit Möbeln ein, in 2D und 3D.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  setName("Mein erster Grundriss");
                  setTemplate("import");
                  setCreating(true);
                }}
              >
                <FileUp size={15} /> Mit Bauzeichnung starten
              </Button>
              <Button
                onClick={() => {
                  setName("Beispielwohnung");
                  setTemplate("beispiel");
                  setCreating(true);
                }}
              >
                Beispielwohnung öffnen
              </Button>
            </div>
            <p className="mt-6 text-xs text-muted">
              {cloud
                ? "Projekte werden in der Cloud gespeichert und sind von jedem Gerät mit dem Passwort erreichbar."
                : "Alle Projekte werden lokal in diesem Browser gespeichert. Über „Export → Projektdatei“ sichern oder weitergeben."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <div
                key={r.id}
                className="group overflow-hidden rounded-xl border border-line bg-panel transition hover:shadow-md"
              >
                <Link href={`/project/${r.id}`} className="block">
                  <div className="flex h-44 items-center justify-center bg-[#f4f2ed]">
                    {r.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.thumbnail} alt="" className="h-full w-full object-contain p-3" />
                    ) : (
                      <FolderOpen size={36} className="text-line" />
                    )}
                  </div>
                  <div className="px-4 pt-3">
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-xs text-muted">
                      {r.floors} {r.floors === 1 ? "Etage" : "Etagen"} · geändert{" "}
                      {new Date(r.updatedAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}
                    </div>
                  </div>
                </Link>
                <div className="flex justify-end gap-1 px-3 pb-3">
                  <Button size="sm" variant="ghost" onClick={() => void duplicate(r)} title="Duplizieren">
                    <Copy size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Löschen"
                    onClick={async () => {
                      if (!window.confirm(`Projekt „${r.name}“ endgültig löschen?`)) return;
                      await deleteProject(r.id).catch(fail);
                      await refresh();
                    }}
                  >
                    <Trash2 size={14} className="text-red-700" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <Dialog open={creating} onClose={() => setCreating(false)} title="Neues Projekt">
        <div className="space-y-4">
          <Field label="Projektname">
            <TextInput
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Musterstraße 12, 1. OG"
              onKeyDown={(e) => e.key === "Enter" && void create()}
              data-testid="project-name"
            />
          </Field>
          <div className="grid gap-2">
            {(
              [
                ["import", "Mit Bauzeichnung starten", "PDF oder Bild importieren, per KI erkennen oder nachzeichnen."],
                ["leer", "Leerer Grundriss", "Von Grund auf mit Wand- und Raumwerkzeug zeichnen."],
                ["beispiel", "Beispielwohnung", "3-Zimmer-Wohnung zum Ausprobieren aller Funktionen."],
              ] as const
            ).map(([id, title, text]) => (
              <label
                key={id}
                className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${template === id ? "border-accent bg-accent-soft/40" : "border-line"}`}
              >
                <input
                  type="radio"
                  name="tpl"
                  checked={template === id}
                  onChange={() => setTemplate(id)}
                  className="mt-1 accent-[var(--color-accent)]"
                />
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="block text-xs text-muted">{text}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setCreating(false)}>Abbrechen</Button>
            <Button variant="primary" onClick={() => void create()} data-testid="create-project">
              Anlegen
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
