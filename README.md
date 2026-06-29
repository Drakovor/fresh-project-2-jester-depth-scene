# Jester Depth

Premium layered WebGL scene for the feminine gothic jester universe.

## Local Work

```bash
npm run dev
```

```bash
npm run visual:check
```

The visual check renders desktop, mobile portrait, and tablet portrait screenshots into `tmp/`, records motion/anchor/camera/clarity metrics, and fails if a quality gate regresses.

## Generate Fresh Assets

Requires a working `OPENAI_API_KEY` in `.env.local`.

```bash
npm run generate:images
```

The app uses separate layers:

- `public/assets/jester-depth-background-4k.png`
- `public/assets/jester-feminine-character.png`
- `public/assets/jester-depth-foreground-4k.png`

No old assets are required. If those files are missing, the app renders a procedural preview so the WebGL motion system can still be tested.

## Visual Invariants

- The character feet are anchored to the center floor circle through the background layer, not locked to the screen.
- The camera uses a constrained single-axis cardinal arc, not a free 360 view; diagonal cursor input must resolve to one rail only, with zero visible cross-axis leak.
- Touch input uses relative drag with capped camera catch-up, so placing or moving a finger cannot teleport the viewpoint; mobile must feel like the same scene camera as desktop, only touch-driven.
- Cardinal reveal shutters and side reflections must stay behind the character and follow the same camera axis as the room arc.
- The peripheral depth focus aperture reinforces the sensation of entering the space while keeping the central character/floor lane readable.
- Axis-bound volumetric slit haze adds depth in the room air without becoming stage lighting or covering the character lane.
- The private threshold lens adds fine floor/air depth around the central circle only, reinforcing the feeling of entering the room without adding sacred, stage, or royal symbols.
- Peripheral threshold pressure adds subtle responsive tension in side walls and floor cuts, keeping the center clear while making the room feel awake.
- Axis-bound anamorphic depth shear may add thin optical edge/floor traces, but it must follow the camera rail and never become UI, stage beams, or central haze.
- Cinematic side depth separation may sculpt darker side planes and thin glints, but it must stay behind the character and preserve the central clarity lane.
- Non-UI directional presence memory may leave subtle traces from exploration, but it must read as the room remembering movement, never as badges, rewards, quests, or streamer overlay UI.
- Cinematic negative fill may darken the room immediately behind the subject to sculpt clarity, but it must stay behind her and never become a visible black halo.
- The scene-anchored contact reflection stays subtle and floor-bound so the character feels grounded without becoming a duplicated figure.
- Scene-anchored contact pressure may deepen the foot/floor contact, but must stay under the character and never become a ritual circle, stage mark, or UI highlight.
- Dual-tone rim light may separate the character from the room, but must stay subtle and locked to the same pose/anchor as the character sprite.
- Pose-locked micro-lustre may add tiny living glints to costume details, but must follow the character pose and remain below visible UI/reward/badge intensity.
- Ambient particles, cloth strands, haze, sparks, glass marks, living wall/floor signals, and signature floor circuits use named deterministic seeds for a stable premium render.
- Edge-bound prismatic fringe may add subtle optical depth at viewport borders, but must follow the camera rail and never touch the central character/clarity lane.
- Procedural cinematic grain may add fine material texture, but must stay below visible dirt/noise intensity and preserve the central clarity lane.
- Runtime effects stay around the scene and depth layers instead of becoming a visible UI overlay.
- Living signals belong to the room language: they should feel like the place is awake, never like carnival lights or streamer badges.
- Cinematic occlusion and floor gleam layers must improve depth/readability while staying behind the character.
- Room-breath motion must remain environmental and idle-friendly: the scene should feel alive even when the cursor is still.
- The clarity lane protects the subject/floor center from haze build-up; new effects should enrich the sides and depth first.
- Desktop, mobile portrait, and tablet portrait must all keep the character readable and anchored.
- The responsive viewport vignette may darken edges, but must keep the character lane transparent.

## Public Preview

The app is configured for GitHub Pages through Vite's public base path. Runtime image paths use `import.meta.env.BASE_URL`, so the scene works both on `http://127.0.0.1:5173/` and under a GitHub Pages project URL.
