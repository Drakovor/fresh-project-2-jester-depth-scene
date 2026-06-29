# Jester Depth

Premium layered WebGL scene for the feminine gothic jester universe.

## Product Direction

The current product concept is [Hollow Mark](docs/hollow-mark-game-concept.md): an ambitious persistent world-game, not a small streamer widget. The scene remains the visual threshold, while the app direction moves toward Masks, zones, moves, traces, visible marks, and world consequences that can grow into a full-stack game.

Planning references:

- [Research Notes](docs/research-notes.md)
- [Full-Stack Architecture](docs/full-stack-architecture.md)

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

- Product gameplay must stay readable: mystery should create hunger, not boredom. A player must always understand what they can do, what risk it carries, and what changed afterward.
- Hollow Mark is allowed to have visible marks, rewards, and status, but they must be consequences of meaningful play inside the world, not generic badges, streaks, points, streamer challenge tokens, or routine chores.
- The presence dock is the first app shell element: it may let a visitor tune a presence state, but it must stay compact, dark, and non-streamer, never a generic gamification bar.
- Threshold state may translate a chosen presence into atmosphere, but it must stay personal and material, never routine points, rank, streaks, quests, or farming loops.
- Presence state persistence may remember the visitor's chosen tone locally, but it must remain a versioned universe state, not analytics, scoring, tracking, or hidden progression.
- The character feet are anchored to the center floor circle through the background layer, not locked to the screen.
- The camera uses a constrained single-axis cardinal arc, not a free 360 view; diagonal cursor input must resolve to one rail only, with zero visible cross-axis leak.
- Touch input uses relative drag with capped camera catch-up, so placing or moving a finger cannot teleport the viewpoint; mobile must feel like the same scene camera as desktop, only touch-driven.
- Cardinal reveal shutters and side reflections must stay behind the character and follow the same camera axis as the room arc.
- Peripheral interference may add dark moire tension to side architecture, but must stay off the central character lane and never read as streamer glitch, party lighting, or UI feedback.
- The peripheral depth focus aperture reinforces the sensation of entering the space while keeping the central character/floor lane readable.
- Axis-bound volumetric slit haze adds depth in the room air without becoming stage lighting or covering the character lane.
- Living glass refraction may subtly bend only the architecture and light layers, never the character or floor anchor.
- The private threshold lens adds fine floor/air depth around the central circle only, reinforcing the feeling of entering the room without adding sacred, stage, or royal symbols.
- Peripheral threshold pressure adds subtle responsive tension in side walls and floor cuts, keeping the center clear while making the room feel awake.
- Axis-bound anamorphic depth shear may add thin optical edge/floor traces, but it must follow the camera rail and never become UI, stage beams, or central haze.
- Cinematic side depth separation may sculpt darker side planes and thin glints, but it must stay behind the character and preserve the central clarity lane.
- Architectural crease occlusion may deepen wall/floor/ceiling joints with negative fill, but must protect the character lane and never become a black halo, stage mark, or pale overlay.
- Directional contrast occlusion may deepen side walls, ceiling, and floor edges, but it must stay behind the character and never wash the room into pale haze.
- Non-UI directional presence memory may leave subtle traces from exploration, but it must read as the room remembering movement, never as routine quests or streamer overlay UI.
- Hollow Mark world traces may reveal consequence pressure after player moves, but they must stay diegetic, behind the character, and dark enough to preserve the premium scene clarity.
- Pose-locked Mask resonance may reveal evolving Mask shape, drive, fracture, and visibility as dark contour/reflection language, but it must stay anchored to the scene/subject pose and never become a badge, popup reward, pale glow, or character movement.
- Cinematic negative fill may darken the room immediately behind the subject to sculpt clarity, but it must stay behind her and never become a visible black halo.
- The scene-anchored contact reflection stays subtle and floor-bound so the character feels grounded without becoming a duplicated figure.
- Scene-anchored contact pressure may deepen the foot/floor contact, but must stay under the character and never become a ritual circle, stage mark, or UI highlight.
- Scene-anchored surface resonance may add wet/specular floor material and subtle private tension, but it must keep a dark contrast base and never wash the scene pale.
- Black-glass caustics may add low floor iridescence and refracted tension, but it must stay under/around the character and never become a ritual circle, generic reward glow, or party light.
- Dual-tone rim light may separate the character from the room, but must stay subtle and locked to the same pose/anchor as the character sprite.
- Pose-locked micro-lustre may add tiny living glints to costume details, but must follow the character pose and remain below generic UI/reward-callout intensity.
- Ambient particles, cloth strands, haze, sparks, glass marks, living wall/floor signals, and signature floor circuits use named deterministic seeds for a stable premium render.
- Edge-bound prismatic fringe may add subtle optical depth at viewport borders, but must follow the camera rail and never touch the central character/clarity lane.
- Procedural cinematic grain may add fine material texture, but must stay below visible dirt/noise intensity and preserve the central clarity lane.
- Subtle contrast/chroma grading may preserve deep purple, orange, and pistachio richness, but it must not crush the character or lift blacks into grey haze.
- Runtime effects stay around the scene and depth layers instead of becoming a visible UI overlay.
- Living signals belong to the room language: they should feel like the place is awake, never like carnival lights or generic streamer status stickers.
- Cinematic occlusion and floor gleam layers must improve depth/readability while staying behind the character.
- Room-breath motion must remain environmental and idle-friendly: the scene should feel alive even when the cursor is still.
- The clarity lane protects the subject/floor center from haze build-up; new effects should enrich the sides and depth first.
- Desktop, mobile portrait, and tablet portrait must all keep the character readable and anchored.
- The responsive viewport vignette may darken edges, but must keep the character lane transparent.

## Public Preview

The app is configured for GitHub Pages through Vite's public base path. Runtime image paths use `import.meta.env.BASE_URL`, so the scene works both on `http://127.0.0.1:5173/` and under a GitHub Pages project URL.
