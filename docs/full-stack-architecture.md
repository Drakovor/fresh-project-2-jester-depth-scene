# Hollow Mark Full-Stack Architecture

This is the target architecture for turning the current local prototype into a real persistent app.

The current Vite/Pixi scene is the **Threshold**. It should remain the first premium signal of the universe. The full-stack app grows behind it: identity, world state, actions, traces, chronicle, admin, and optional stream windows.

## Authorized Reference Integration

The read-only Drako Lair reference is useful as backend/product memory, not as a visual or thematic source to copy.

Keep from it:

- one persistent universe with scoped data boundaries
- map-like zones that can be revealed, pressured, fractured, or protected
- Chronicle-style records of meaningful world changes
- admin curation, safety controls, and cost controls
- curated fallbacks so the world never appears empty

Reject from it for Hollow Mark:

- royal, theater, sacred, medieval, or old lair language
- generic card collection as the main loop
- channel-point reward machinery as the main reason to play
- overlays as the product center
- automatic AI generation from player activity

The current scene stays the art direction. Drako Lair contributes structural lessons; Hollow Mark remains its own world.

## Product Boundaries

Keep:

- persistent world state
- evolving Masks
- zones that remember actions
- visible marks, scars, traces, and world pulse
- admin tools for curation, safety, and cost control
- optional Kick connection later

Avoid:

- daily farming
- disposable mini-games
- streamer penalties or handicaps
- generic challenge/event loops
- riddle-first structure
- medieval, royal, sacred, cathedral, theater, carnival, or sorcerer language

## Main Surfaces

### Threshold

Current scene. It introduces the visual language and lets the player enter Hollow Mark.

Needed next:

- keep the character and scene as the art direction
- let the world pulse subtly alter room material after actions
- let selected zones and hot zones alter room material through Zone Loom
- keep the control panel collapsed by default so the image remains premium

### Mask

The player identity. A Mask is not a faction. It has:

- drive: Softness, Defiance, Pride, Static
- will
- shape
- marks
- scars
- private/public trace history

The Mask's shape evolves from choices and accidents.

In the current prototype, the Mask shape already drives a small scene-bound resonance layer. This is a preview of the long-term rule: identity changes should alter the world material, silhouette, reflection, or trace language before they become ordinary UI labels.

### World Map

Not a classic fog map. A zone has:

- pressure
- clarity
- fracture
- visible marks
- hidden traces
- links to other zones
- current state: calm, listening, pressured, fractured, opened

The first map expression is **Zone Loom** in the Threshold. It projects selected-zone and hot-zone state into the room through pressure lines, floor echoes, and side-depth signals. It is not a minimap, quest board, or streamer overlay.

### Action Layer

The gameplay loop is action based.

Moves:

- Mark
- Veil
- Bind
- Sever
- Expose
- Bend
- Spare

Every move writes an action log entry and derives visible consequences from it.

### Chronicle

Not a feed of generic achievements. The Chronicle records world-changing moments:

- first visible trace in a zone
- shape mutation
- zone pressure crossing a threshold
- fracture event
- rare opening
- meaningful admin-authored intervention

### Stream Window

Optional. A stream can display:

- world pulse
- active zone pressure
- latest meaningful trace
- current Mask transformations

It must not become a penalty/challenge machine.

## Data Model

### users

- id
- display_name
- auth_provider
- created_at
- role
- safety_flags

### masks

- id
- user_id
- drive
- will
- shape
- marks
- scars
- created_at
- updated_at

### zones

- id
- slug
- label
- pressure
- clarity
- fracture
- state
- links
- visible_marks
- hidden_trace_count
- updated_at

### moves

Static configuration for move cost and effect.

- id
- label
- cost
- pressure_delta
- clarity_delta
- visibility_delta
- fracture_delta

### action_log

Append-only source of truth.

- id
- user_id
- mask_id
- zone_id
- move_id
- effect_payload
- created_at
- client_context

### traces

Derived from action log, stored for query speed.

- id
- action_id
- mask_id
- zone_id
- drive
- move
- pressure
- clarity
- visibility
- fracture
- public_state
- created_at

### chronicle_events

- id
- event_type
- zone_id
- mask_id
- trace_id
- title
- body
- public_visibility
- pinned_until
- created_at

### world_snapshots

Performance cache, not primary truth.

- id
- tick
- pulse
- zone_state
- zone_loom_projection
- created_at

## API Shape

### Public

- `GET /api/world/public`
- `GET /api/world/pulse`
- `GET /api/zones`
- `GET /api/chronicle/public`

### Authenticated

- `GET /api/me`
- `GET /api/mask`
- `POST /api/mask`
- `PATCH /api/mask/drive`
- `POST /api/world/move`
- `GET /api/world/me/traces`
- `GET /api/world/me/marks`

### Admin

- `GET /api/admin/world`
- `PATCH /api/admin/zones/:id`
- `POST /api/admin/chronicle`
- `POST /api/admin/world/intervention`
- `GET /api/admin/audit-log`
- `GET /api/admin/cost-safety`

### Realtime

Use WebSocket or Server-Sent Events.

Events:

- `world:pulse`
- `zone:changed`
- `trace:visible`
- `mask:shape-changed`
- `chronicle:new`
- `stream:window-update`

## First Backend Milestone

1. Keep the current frontend and Pixi scene.
2. Add a small backend with users disabled or anonymous local sessions.
3. Persist one Mask per session.
4. Persist zones, moves, action log, traces, and world snapshots.
5. Replace localStorage Hollow Mark state with API calls.
6. Stream world pulse back to the scene.
7. Keep API generation disabled by default; no AI calls from player actions.

## First Frontend Milestone

1. Keep the Hollow Mark panel collapsed by default.
2. Add a real Mask entry flow after the threshold.
3. Add a zone view that feels like entering the current scene, not a flat dashboard.
4. Add trace/mark detail without card-game cliche.
5. Add a Chronicle view that reads like world memory, not a social feed.

## Security And Trust

- Do not expose API keys in the client.
- Do not allow hidden AI calls from player activity.
- Keep action logs append-only.
- Rate-limit moves per Mask/session.
- Admin interventions must be logged.
- Public stream windows should expose only curated world state.

## Migration From Current Prototype

Current local state:

- `src/domain/hollow-mark-core.js`
- `localStorage["hollow-mark.prototype.v1"]`
- `window.__hollowMark`
- `hollowmarkchange` event

Migration path:

1. Keep the pure domain functions.
2. Move persistence behind a service module.
3. Add API-backed service implementation.
4. Keep localStorage as dev fallback only.
5. Keep `hollowmarkchange` as the bridge to Pixi until a formal state store exists.
