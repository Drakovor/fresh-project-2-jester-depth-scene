# Research Notes

This file keeps the external research anchors used for Hollow Mark decisions. It is not a mood board and does not authorize copying another product.

## Sources Checked

- Self-Determination Theory: https://selfdeterminationtheory.org/theory/
- MDA game design framework: https://users.cs.northwestern.edu/~hunicke/MDA.pdf
- MDN WebGL best practices: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
- MDN canvas compositing reference: https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation
- Henry Jenkins on game design as spatial/environmental storytelling: https://web.mit.edu/~21fms/People/henry3/games%26narrative.html

## Product Takeaways

- Player attachment should come from agency, competence, and social meaning, not from routine streaks or empty rewards.
- The rules must be readable even when the atmosphere is strange. Mystery is an aesthetic pressure, not an excuse for unclear interaction.
- Mechanics should create dynamics that produce emotion: a Mask changes because a player acted, risked, exposed, protected, or fractured something.
- Stream integration should be a window into the world state, not the reason the world exists.

## Visual Takeaways

- Diegetic feedback is preferred: traces, pressure, and marks should appear as room material, floor reflection, wall signal, or Mask change.
- Additive light must stay controlled and dark-biased. It should make edges and material feel alive without lifting blacks into pale haze.
- The main scene remains a layered 2.5D threshold. New effects must stay behind the character lane unless they are explicitly part of the Mask.
- Motion should provide life at idle, but changes caused by player actions should be slower, heavier, and more consequential than cursor feedback.

## Applied This Pass

- Added a code-generated Hollow Mark world-trace layer driven by world tick, visible trace count, pressure, clarity, and fracture.
- The layer is inactive by default and becomes visible only after world actions.
- The layer draws pressure veins, witness nodes, and floor memory into the scene instead of showing a HUD effect.
- Visual gates now verify the new layer's mode, axis lock, energy, and alpha range.

## Applied Mask Resonance Pass

- Used the authorized Drako Lair reference only for structural lessons: persistent universe state, zones, chronicle, admin safety, and cost-control boundaries.
- Kept Hollow Mark separate from Drako Lair's older royal/theater/card/overlay patterns.
- Exposed Mask shape from the app shell to the Pixi renderer so player identity can affect scene material.
- Added a pose-locked, scene-bound Mask resonance layer behind the character. It responds to drive, silhouette, surface, visibility, fracture, trace count, and world tick without moving the character or making the room pale.
- Visual gates now verify Mask resonance mode, drive, silhouette, visibility, and alpha range.

## Applied Zone Loom Pass

- Added a world-zone state projection so every zone can expose pressure, clarity, fracture, visible trace count, state, and intensity.
- Added a code-generated Zone Loom layer that renders selected zones and hot zones as room-material pressure lines rather than a flat minimap or streamer overlay.
- Zone selection now changes the scene signal before any move is committed; committing a move increases trace/world pressure in the same scene language.
- The visual check now verifies Zone Loom mode, active zone, zone state, alpha, intensity, hot-zone count, and a real selected-zone move.
