# CLAUDE.md

Floor-plan editor (2D/3D, home staging) for German-speaking clients. Next.js 16 App Router, React 19, Tailwind 4, zustand + immer, react-three-fiber, pdf.js, Anthropic SDK. All visible copy is German (Sie-Form).

This Next.js version has breaking changes; read the guide under `node_modules/next/dist/docs/` before writing Next-specific code. `next lint` no longer exists: use `npm run lint` (ESLint CLI).

## Commands

```bash
npm run dev | build | lint | typecheck
npm test                 # vitest, src/**/*.test.ts
npm run test:e2e         # playwright, builds and serves on :3021
```

## Rules

- Geometry and editing logic live in `src/model/` as plain TypeScript and are unit-tested; keep React out of it. Change the floor only through `useEditor.getState().mutate(...)` so undo, autosave and room re-detection (`normalizeFloor`) keep working. Continuous drags call `checkpoint()` once, then `mutate(..., { history: false })`.
- Rooms are derived from walls; `RoomMeta` is bound to a face by its anchor point. Do not store room polygons.
- Furniture models are data (`src/furniture/catalog.ts`, footprint-relative parts) used for both the 2D symbol and the 3D model.
- AI: the model is `claude-opus-5-5` with server-side fallbacks (`src/ai/server.ts`). Tools are defined in `src/ai/tools.ts` and executed in the browser by `src/ai/execute.ts`; validate inputs with the zod schemas there. Route files may only export route handlers and config.
- Never commit customer drawings (`tests/fixtures/*.pdf` is ignored).
