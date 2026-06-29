# Jester Depth Scene

Premium layered Pixi/WebGL scene built around the feminine jester character and her generated environment.

## Scope

This repository preview is scene-only:

- generated background layer
- generated transparent character layer
- generated foreground/depth layer
- Pixi camera, motion, lighting, particles, haze, floor contact, cloth/eye micro-motion, and responsive touch control
- GitHub Pages preview workflow

The API files are kept in the repository because they already existed and were explicitly preserved, but the browser preview imports only the scene renderer.

## Run Locally

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Visual Check

```bash
npm run visual:check
```

The visual check validates the scene canvas, camera rail, mobile touch smoothing, idle movement, contrast, floor anchoring, and generated effects. It does not test any removed UI.

## Generate Fresh Scene Assets

Requires `OPENAI_API_KEY` in `.env.local`.

```bash
npm run generate:images
```

Generated scene assets:

- `public/assets/jester-depth-background-4k.png`
- `public/assets/jester-feminine-character.png`
- `public/assets/jester-depth-foreground-4k.png`

## Scene Invariants

- The character remains grounded on the center floor circle.
- The viewpoint moves as a constrained scene camera, not as a character sliding through the room.
- Mobile touch uses relative drag with smoothing so the view does not teleport.
- Effects stay in the room, around the character, or under her feet; no overlay covers the scene.
- The render keeps deep purple contrast with orange and pistachio accents without washing the scene pale.
