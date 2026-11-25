"use client";

import Dexie, { type Table } from "dexie";
import type { FurnitureDef, Project } from "@/model/types";

export interface ProjectRow {
  id: string;
  name: string;
  updatedAt: number;
  createdAt: number;
  thumbnail?: string;
  data: Project;
}

export interface LibraryRow {
  id: string;
  def: FurnitureDef;
}

class RaisDb extends Dexie {
  projects!: Table<ProjectRow, string>;
  library!: Table<LibraryRow, string>;

  constructor() {
    super("rais-bauzeichnung");
    this.version(1).stores({
      projects: "id, name, updatedAt",
      library: "id",
    });
  }
}

let instance: RaisDb | null = null;
export function db(): RaisDb {
  if (!instance) instance = new RaisDb();
  return instance;
}

export async function listProjects() {
  return db().projects.orderBy("updatedAt").reverse().toArray();
}

export async function loadProject(id: string) {
  return (await db().projects.get(id))?.data ?? null;
}

export async function saveProject(project: Project) {
  await db().projects.put({
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    createdAt: project.createdAt,
    thumbnail: project.thumbnail,
    data: project,
  });
}

export async function deleteProject(id: string) {
  await db().projects.delete(id);
}

/** Furniture the user created that is available in every project. */
export async function listGlobalFurniture() {
  return (await db().library.toArray()).map((r) => r.def);
}

export async function saveGlobalFurniture(def: FurnitureDef) {
  await db().library.put({ id: def.id, def });
}

export async function deleteGlobalFurniture(id: string) {
  await db().library.delete(id);
}
