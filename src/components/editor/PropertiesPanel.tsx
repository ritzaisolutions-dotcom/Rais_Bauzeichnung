"use client";

import { Copy, FlipHorizontal, FlipVertical, Scissors, Sofa, Trash2, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { COLOR_SWATCHES, findDef } from "@/furniture/catalog";
import { computeRoomGeometry, formatArea, formatM, wallEnds, wallLength } from "@/model/geometry";
import { defaultMaterialFor, FLOOR_MATERIALS, ROOM_TYPE_LABELS, STYLES, type StagingStyle } from "@/model/materials";
import { clampOpenings, DEFAULT_WALL, deleteWall, OPENING_DEFAULTS, setWallLength, splitWall, uid } from "@/model/ops";
import { doorClearances, itemsInRoom, stageRoom } from "@/model/staging";
import type { FloorMaterial, FurnitureItem, Opening, OpeningKind, RoomMeta, RoomType, WallType } from "@/model/types";
import { useActiveFloor, useEditor, useFurnitureDefs } from "@/store/editor";
import { Button, ColorSwatches, Field, NumberInput, Section, Select, TextInput } from "../ui";

const OPENING_LABELS: Record<OpeningKind, string> = {
  tuer: "Tür",
  schiebetuer: "Schiebetür",
  durchgang: "Durchgang",
  fenster: "Fenster",
  bodenfenster: "Bodentiefes Fenster",
};

const WALL_LABELS: Record<WallType, string> = {
  aussen: "Außenwand",
  tragend: "Tragende Innenwand",
  innen: "Innenwand",
};

const materialOptions = (Object.keys(FLOOR_MATERIALS) as FloorMaterial[]).map((k) => ({
  value: k,
  label: FLOOR_MATERIALS[k].label,
}));
const roomTypeOptions = (Object.keys(ROOM_TYPE_LABELS) as RoomType[]).map((k) => ({
  value: k,
  label: ROOM_TYPE_LABELS[k],
}));
const styleOptions = (Object.keys(STYLES) as StagingStyle[]).map((k) => ({ value: k, label: STYLES[k].label }));

export function useStagingStyle() {
  return useState<StagingStyle>("warm");
}

export function PropertiesPanel() {
  const floor = useActiveFloor();
  const selection = useEditor((s) => s.selection);
  const project = useEditor((s) => s.project);
  const defs = useFurnitureDefs();
  const { mutate, select } = useEditor.getState();
  const [style, setStyle] = useStagingStyle();
  const rooms = useMemo(() => (floor ? computeRoomGeometry(floor) : []), [floor]);
  if (!floor || !project) return null;

  const sel = selection[0];
  const multi = selection.length > 1;

  const removeSelection = () => {
    mutate((f) => {
      for (const s of selection) {
        if (s.kind === "wall") deleteWall(f, s.id);
        if (s.kind === "opening") f.openings = f.openings.filter((o) => o.id !== s.id);
        if (s.kind === "item") f.items = f.items.filter((o) => o.id !== s.id);
        if (s.kind === "label") f.labels = f.labels.filter((o) => o.id !== s.id);
        if (s.kind === "dimension") f.dimensions = f.dimensions.filter((o) => o.id !== s.id);
      }
    });
    select(null);
  };

  const stage = (roomIds: string[], replace: boolean) => {
    mutate(
      (f) => {
        const geo = computeRoomGeometry(f);
        for (const id of roomIds) {
          const room = geo.find((r) => r.meta.id === id);
          if (!room) continue;
          if (replace) {
            const inRoom = new Set(itemsInRoom(room, f.items).map((i) => i.id));
            f.items = f.items.filter((i) => !inRoom.has(i.id));
          }
          const meta = f.rooms.find((r) => r.id === id)!;
          if (
            meta.roomType !== "bad" &&
            meta.roomType !== "wc" &&
            meta.roomType !== "hwr" &&
            meta.roomType !== "balkon"
          ) {
            meta.floorMaterial = STYLES[style].floor;
          }
          f.items.push(...stageRoom(room, f.items, style, defs, doorClearances(f)));
        }
      },
      { normalize: false },
    );
  };

  if (multi) {
    return (
      <Section title={`${selection.length} Elemente ausgewählt`}>
        <Button variant="danger" onClick={removeSelection}>
          <Trash2 size={14} /> Auswahl löschen
        </Button>
      </Section>
    );
  }

  if (sel?.kind === "wall") {
    const w = floor.walls.find((x) => x.id === sel.id);
    if (!w) return null;
    const L = wallLength(floor, w);
    return (
      <>
        <Section title="Wand">
          <Field label="Wandart">
            <Select
              value={w.type}
              onChange={(v) =>
                mutate((f) => {
                  const x = f.walls.find((y) => y.id === w.id)!;
                  x.type = v;
                  x.thickness = DEFAULT_WALL[v];
                })
              }
              options={(Object.keys(WALL_LABELS) as WallType[]).map((k) => ({ value: k, label: WALL_LABELS[k] }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Länge (Achse)">
              <NumberInput value={L} suffix="m" onCommit={(v) => mutate((f) => setWallLength(f, w.id, v))} />
            </Field>
            <Field label="Dicke">
              <NumberInput
                value={w.thickness}
                suffix="m"
                digits={3}
                step={0.005}
                min={0.03}
                max={1}
                onCommit={(v) =>
                  mutate((f) => {
                    f.walls.find((y) => y.id === w.id)!.thickness = v;
                  })
                }
              />
            </Field>
            <Field label="Höhe">
              <NumberInput
                value={w.height}
                suffix="m"
                min={0.3}
                max={8}
                onCommit={(v) =>
                  mutate((f) => {
                    f.walls.find((y) => y.id === w.id)!.height = v;
                  })
                }
              />
            </Field>
          </div>
          <p className="text-xs text-muted">
            Wand ziehen verschiebt sie parallel, Endpunkte ziehen ändert die Länge. Doppelklick teilt die Wand.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() =>
                mutate((f) => {
                  const e = wallEnds(
                    f,
                    f.walls.find((y) => y.id === w.id)!,
                  )!;
                  splitWall(f, w.id, { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 });
                })
              }
            >
              <Scissors size={14} /> Teilen
            </Button>
            <Button size="sm" variant="danger" onClick={removeSelection}>
              <Trash2 size={14} /> Löschen
            </Button>
          </div>
        </Section>
        <Section title="Öffnung einsetzen">
          <div className="grid grid-cols-2 gap-2">
            {(["tuer", "fenster", "schiebetuer", "durchgang"] as OpeningKind[]).map((k) => (
              <Button
                key={k}
                size="sm"
                onClick={() => {
                  let id = "";
                  mutate((f) => {
                    const o = {
                      id: uid(),
                      wallId: w.id,
                      offset: L / 2,
                      kind: k,
                      flipSide: false,
                      flipHinge: false,
                      ...OPENING_DEFAULTS[k],
                    };
                    f.openings.push(o);
                    clampOpenings(f);
                    id = o.id;
                  });
                  select({ kind: "opening", id });
                }}
              >
                {OPENING_LABELS[k]}
              </Button>
            ))}
          </div>
        </Section>
      </>
    );
  }

  if (sel?.kind === "opening") {
    const o = floor.openings.find((x) => x.id === sel.id);
    if (!o) return null;
    const openingId = o.id;
    const upd = (fn: (x: Opening) => void) =>
      mutate(
        (f) => {
          const x = f.openings.find((y) => y.id === openingId)!;
          fn(x);
          clampOpenings(f);
        },
        { normalize: false },
      );
    return (
      <Section title={OPENING_LABELS[o.kind]}>
        <Field label="Art">
          <Select
            value={o.kind}
            onChange={(v) =>
              upd((x) => {
                x.kind = v;
                Object.assign(x, OPENING_DEFAULTS[v]);
              })
            }
            options={(Object.keys(OPENING_LABELS) as OpeningKind[]).map((k) => ({
              value: k,
              label: OPENING_LABELS[k],
            }))}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Breite">
            <NumberInput
              value={o.width}
              suffix="m"
              min={0.3}
              max={8}
              onCommit={(v) =>
                upd((x) => {
                  x.width = v;
                })
              }
            />
          </Field>
          <Field label="Höhe">
            <NumberInput
              value={o.height}
              suffix="m"
              min={0.3}
              max={4}
              onCommit={(v) =>
                upd((x) => {
                  x.height = v;
                })
              }
            />
          </Field>
          <Field label="Brüstung">
            <NumberInput
              value={o.sill}
              suffix="m"
              min={0}
              max={3}
              onCommit={(v) =>
                upd((x) => {
                  x.sill = v;
                })
              }
            />
          </Field>
          <Field label="Position (Mitte)">
            <NumberInput
              value={o.offset}
              suffix="m"
              min={0}
              onCommit={(v) =>
                upd((x) => {
                  x.offset = v;
                })
              }
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() =>
              upd((x) => {
                x.flipSide = !x.flipSide;
              })
            }
          >
            <FlipVertical size={14} /> Seite
          </Button>
          <Button
            size="sm"
            onClick={() =>
              upd((x) => {
                x.flipHinge = !x.flipHinge;
              })
            }
          >
            <FlipHorizontal size={14} /> Anschlag
          </Button>
          <Button size="sm" variant="danger" onClick={removeSelection}>
            <Trash2 size={14} /> Löschen
          </Button>
        </div>
      </Section>
    );
  }

  if (sel?.kind === "room") {
    const r = rooms.find((x) => x.meta.id === sel.id);
    if (!r) return null;
    const roomId = r.meta.id;
    const upd = (fn: (m: RoomMeta) => void) =>
      mutate(
        (f) => {
          fn(f.rooms.find((m) => m.id === roomId)!);
        },
        { normalize: false },
      );
    const furniture = itemsInRoom(r, floor.items);
    return (
      <>
        <Section title="Raum">
          <Field label="Name">
            <TextInput
              value={r.meta.name}
              onChange={(e) =>
                upd((m) => {
                  m.name = e.target.value;
                })
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Raumtyp">
              <Select
                value={r.meta.roomType ?? "sonstiges"}
                onChange={(v) =>
                  upd((m) => {
                    m.roomType = v;
                    m.floorMaterial = defaultMaterialFor(v);
                  })
                }
                options={roomTypeOptions}
              />
            </Field>
            <Field label="Bodenbelag">
              <Select
                value={r.meta.floorMaterial}
                onChange={(v) =>
                  upd((m) => {
                    m.floorMaterial = v;
                  })
                }
                options={materialOptions}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-md bg-paper p-2 text-sm">
            <div>
              <div className="text-[11px] text-muted">Fläche (lichte Maße)</div>
              <div className="font-semibold">{formatArea(r.area)}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted">Umfang</div>
              <div className="font-semibold">{formatM(r.perimeter)} m</div>
            </div>
          </div>
          <Field label="Fläche laut Plan (Soll)" hint="Zum Abgleich mit der Bauzeichnung. Leer lassen, wenn unbekannt.">
            <NumberInput
              value={r.meta.targetArea ?? NaN}
              suffix="m²"
              min={0}
              onCommit={(v) =>
                upd((m) => {
                  m.targetArea = v > 0 ? v : undefined;
                })
              }
            />
          </Field>
        </Section>
        <Section title="Einrichten (Home Staging)">
          <Field label="Stil">
            <Select value={style} onChange={setStyle} options={styleOptions} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => stage([r.meta.id], true)}>
              <Wand2 size={14} /> Raum einrichten
            </Button>
            <Button
              size="sm"
              disabled={!furniture.length}
              onClick={() => {
                const ids = new Set(furniture.map((i) => i.id));
                mutate(
                  (f) => {
                    f.items = f.items.filter((i) => !ids.has(i.id));
                  },
                  { normalize: false },
                );
              }}
            >
              Möbel entfernen ({furniture.length})
            </Button>
          </div>
        </Section>
      </>
    );
  }

  if (sel?.kind === "item") {
    const it = floor.items.find((x) => x.id === sel.id);
    if (!it) return null;
    const def = findDef(it.defId, defs);
    const itemId = it.id;
    const upd = (fn: (x: FurnitureItem) => void) =>
      mutate(
        (f) => {
          fn(f.items.find((y) => y.id === itemId)!);
        },
        { normalize: false },
      );
    return (
      <Section title={def?.name ?? "Möbel"}>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Breite">
            <NumberInput
              value={it.w}
              suffix="m"
              min={0.05}
              onCommit={(v) =>
                upd((x) => {
                  x.w = v;
                })
              }
            />
          </Field>
          <Field label="Tiefe">
            <NumberInput
              value={it.d}
              suffix="m"
              min={0.05}
              onCommit={(v) =>
                upd((x) => {
                  x.d = v;
                })
              }
            />
          </Field>
          <Field label="Höhe">
            <NumberInput
              value={it.h}
              suffix="m"
              min={0.01}
              onCommit={(v) =>
                upd((x) => {
                  x.h = v;
                })
              }
            />
          </Field>
          <Field label="Drehung">
            <NumberInput
              value={it.rotation}
              digits={0}
              step={15}
              suffix="°"
              onCommit={(v) =>
                upd((x) => {
                  x.rotation = ((v % 360) + 360) % 360;
                })
              }
            />
          </Field>
          <Field label="X">
            <NumberInput
              value={it.x}
              suffix="m"
              onCommit={(v) =>
                upd((x) => {
                  x.x = v;
                })
              }
            />
          </Field>
          <Field label="Y">
            <NumberInput
              value={it.y}
              suffix="m"
              onCommit={(v) =>
                upd((x) => {
                  x.y = v;
                })
              }
            />
          </Field>
          <Field label="Montagehöhe">
            <NumberInput
              value={it.elevation ?? 0}
              suffix="m"
              min={0}
              onCommit={(v) =>
                upd((x) => {
                  x.elevation = v || undefined;
                })
              }
            />
          </Field>
        </div>
        <Field label="Farbe / Bezug">
          <ColorSwatches
            colors={COLOR_SWATCHES}
            value={it.color}
            onChange={(c) =>
              upd((x) => {
                x.color = c;
              })
            }
          />
        </Field>
        <p className="text-xs text-muted">R dreht um 90°, Strg+D dupliziert, Pfeiltasten verschieben.</p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() =>
              upd((x) => {
                x.rotation = (x.rotation + 90) % 360;
              })
            }
          >
            Drehen 90°
          </Button>
          <Button
            size="sm"
            onClick={() => {
              const id = uid();
              mutate(
                (f) => {
                  f.items.push({ ...it, id, x: it.x + 0.3, y: it.y + 0.3 });
                },
                { normalize: false },
              );
              select({ kind: "item", id });
            }}
          >
            <Copy size={14} /> Duplizieren
          </Button>
          {def && (
            <Button
              size="sm"
              onClick={() =>
                upd((x) => {
                  x.w = def.w;
                  x.d = def.d;
                  x.h = def.h;
                  x.color = undefined;
                })
              }
            >
              Zurücksetzen
            </Button>
          )}
          <Button size="sm" variant="danger" onClick={removeSelection}>
            <Trash2 size={14} /> Löschen
          </Button>
        </div>
      </Section>
    );
  }

  if (sel?.kind === "label") {
    const l = floor.labels.find((x) => x.id === sel.id);
    if (!l) return null;
    return (
      <Section title="Text">
        <Field label="Inhalt">
          <TextInput
            autoFocus
            value={l.text}
            onChange={(e) =>
              mutate(
                (f) => {
                  f.labels.find((x) => x.id === l.id)!.text = e.target.value;
                },
                { normalize: false },
              )
            }
          />
        </Field>
        <Field label="Schriftgröße">
          <NumberInput
            value={l.size}
            suffix="m"
            min={0.05}
            max={3}
            onCommit={(v) =>
              mutate(
                (f) => {
                  f.labels.find((x) => x.id === l.id)!.size = v;
                },
                { normalize: false },
              )
            }
          />
        </Field>
        <Button size="sm" variant="danger" onClick={removeSelection}>
          <Trash2 size={14} /> Löschen
        </Button>
      </Section>
    );
  }

  if (sel?.kind === "dimension") {
    const d = floor.dimensions.find((x) => x.id === sel.id);
    if (!d) return null;
    return (
      <Section title="Maßkette">
        <Field label="Abstand zur Messlinie">
          <NumberInput
            value={d.offset}
            suffix="m"
            onCommit={(v) =>
              mutate(
                (f) => {
                  f.dimensions.find((x) => x.id === d.id)!.offset = v;
                },
                { normalize: false },
              )
            }
          />
        </Field>
        <Button size="sm" variant="danger" onClick={removeSelection}>
          <Trash2 size={14} /> Löschen
        </Button>
      </Section>
    );
  }

  // nothing selected: floor overview
  const living = rooms.reduce((s, r) => s + (r.meta.roomType === "balkon" ? r.area * 0.25 : r.area), 0);
  const total = rooms.reduce((s, r) => s + r.area, 0);
  return (
    <>
      <Section title="Etage">
        <Field label="Name">
          <TextInput
            value={floor.name}
            onChange={(e) =>
              useEditor.getState().mutateProject((p) => {
                p.floors.find((f) => f.id === floor.id)!.name = e.target.value;
              })
            }
          />
        </Field>
        <Field label="Raumhöhe (neue Wände)">
          <NumberInput
            value={floor.height}
            suffix="m"
            min={1.8}
            max={6}
            onCommit={(v) =>
              mutate(
                (f) => {
                  f.height = v;
                  for (const w of f.walls) w.height = v;
                },
                { normalize: false },
              )
            }
          />
        </Field>
        {floor.underlay && (
          <Field label="Deckkraft Bauzeichnung">
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={floor.underlay.opacity}
              onChange={(e) =>
                mutate(
                  (f) => {
                    if (f.underlay) f.underlay.opacity = Number(e.target.value);
                  },
                  { normalize: false, history: false },
                )
              }
              className="w-full accent-[var(--color-accent)]"
            />
          </Field>
        )}
      </Section>
      <Section title="Flächen">
        {rooms.length === 0 ? (
          <p className="text-sm text-muted">
            Noch keine geschlossenen Räume. Zeichnen Sie Wände oder ziehen Sie mit dem Raum-Werkzeug ein Rechteck auf.
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {rooms
                .slice()
                .sort((a, b) => b.area - a.area)
                .map((r) => (
                  <tr
                    key={r.meta.id}
                    className="cursor-pointer hover:bg-paper"
                    onClick={() => select({ kind: "room", id: r.meta.id })}
                  >
                    <td className="py-1 pr-2">{r.meta.name}</td>
                    <td className="py-1 text-right tabular-nums">{formatArea(r.area)}</td>
                    <td className="w-14 py-1 text-right text-[11px] tabular-nums text-muted">
                      {r.meta.targetArea !== undefined ? formatM(r.meta.targetArea) : ""}
                    </td>
                  </tr>
                ))}
              <tr className="border-t border-line font-semibold">
                <td className="py-1">Wohnfläche</td>
                <td className="py-1 text-right tabular-nums">{formatArea(living)}</td>
                <td />
              </tr>
              <tr className="text-xs text-muted">
                <td className="py-0.5">Grundfläche gesamt</td>
                <td className="py-0.5 text-right tabular-nums">{formatArea(total)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
        <p className="text-[11px] text-muted">Balkone/Terrassen zu 25 % (WoFlV). Rechte Spalte: Soll laut Plan.</p>
      </Section>
      <Section title="Ganze Etage einrichten">
        <Field label="Stil">
          <Select value={style} onChange={setStyle} options={styleOptions} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="primary"
            disabled={!rooms.length}
            onClick={() =>
              stage(
                rooms.map((r) => r.meta.id),
                true,
              )
            }
          >
            <Sofa size={14} /> Alle Räume einrichten
          </Button>
          <Button
            size="sm"
            disabled={!floor.items.length}
            onClick={() =>
              mutate(
                (f) => {
                  f.items = [];
                },
                { normalize: false },
              )
            }
          >
            Alle Möbel entfernen
          </Button>
        </div>
      </Section>
    </>
  );
}
