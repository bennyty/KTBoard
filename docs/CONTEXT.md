# Kill Team Board Planner

A pre-game planning tool for the Raveners faction in Kill Team 2024 Approved Ops. The user authors a Plan: a named, URL-shareable collection of Slides for a given killzone layout and drop zone. Each Slide is an independent board state showing Tunnel markers and placed Objects. The app also generates and ranks candidate Tunnel placements to seed the tunnel on any Slide.

## Language

### Markers and the TUNNEL

**Tunnel marker**:
One of five numbered 20mm-diameter tokens (0–4) the Raveners player places on the killzone floor. Markers may overlap each other but never overlap terrain.
_Avoid_: tunnel token, tunnel point, node

**TUNNEL** (all caps):
The geometric region formed by the placed Tunnel markers plus the 20mm-wide capsule between each pair of sequentially numbered markers (0↔1, 1↔2, …). A 40mm base is "on the TUNNEL" when it touches any marker or between-segment.
_Avoid_: tunnel network, tunnel path

**Tunnel chain**:
Informal term for the ordered sequence of placed markers (0, 1, 2, …). The resolved geometric object is the TUNNEL; the chain is the input that produces it.

### Raveners operatives

**Underground**:
The state of a Ravener operative set up beside the killzone rather than on it. While underground, the operative can perform only the Burrow action.

**Burrow** (1 AP action):
The unique Raveners action that either (a) places an underground operative on the TUNNEL with –2" Move that activation, or (b) removes a killzone operative back to the underground pool. Cannot be performed while carrying a marker.

**Unburrow**:
Informal term for case (a) of Burrow — placing an underground Ravener on the TUNNEL.
_Avoid_: deploy from tunnel, surface, pop up

### Killzone and terrain

**Killzone**:
The play area. Dimensions are per-killzone: Volkus 30″ × 22″; Gallowdark and Tomb World 23.858″ × 27.677″.

**Drop zone**:
A polygonal region of the killzone assigned to a player during deployment, always touching one killzone edge (its *anchor edge*). Marker 0 candidates lie on the 1D strip 10mm inside the anchor edge, intersected with the drop zone polygon. Each Annotated map carries two drop zones.
_Avoid_: deployment zone, deploy area, spawn area

**Terrain piece**:
A single named physical terrain object from the killzone's box, with a fixed footprint shape. Each piece has a unique letter identifier (e.g., "Stronghold A"); pieces of the same type may have different footprints.
_Avoid_: terrain feature, terrain blob, polygon

**Piece catalogue**:
The fixed set of Terrain pieces that belong to a Killzone, defined once and reused across every Layout. Volkus's catalogue is 11 pieces: Stronghold A & B, Large Ruin A & B, Small Ruin A & B, Heavy Rubble A & B, Light Rubble A & B & C.

**Stronghold**:
A Volkus-only Terrain piece type annotated as **two polygons**: an *outer-extent* polygon (wall ring — markers cannot overlap) and an *inner-floor* polygon (open floor inside the walls — markers may be placed). "Inside the stronghold" means inside the inner-floor polygon.

**Wall terrain**:
A KT terrain category that appears only in the close-quarters killzones (Gallowdark, Tomb World). The close-quarters rule lets both the TUNNEL geometry and the 5″ inter-marker measurement pass through Wall terrain.

**Hazardous area**:
A marked floor region present only on Bheta-Decima. Tunnel markers cannot be placed inside it; between-segments may span across it.

### Mission objectives

**Home objective**:
The objective marker positioned in or nearest the player's drop zone. The planner scores tunnels by their unburrow access to it.

**Center objective**:
The objective marker positioned at the centre of the killzone. The planner scores tunnels by how quickly they reach control range of it.

**Control range**:
The KT concept that an operative threatens everything within 1″ of its base edge. For a 40mm base versus a 40mm objective marker, the centre-to-centre threshold is **40mm + 1″** (≈ 2.574″).

**Strategic Gambit**:
A rule used during the Gambit step of the Strategy phase. Placing Tunnel markers 1–4 is a STRATEGIC GAMBIT — one placement per turning point, in the first four turning points.

**Crit Op** (Critical Operation):
A scoring mission objective in KT 2024 Approved Ops. Out of scope for MVP; the planner ignores Crit Op-driven scoring until v2.

### The app

**Annotation mode**:
The mode (used by the developer, not end users) in which a layout image is loaded, the pixel-to-inch transform is calibrated, and each piece in the killzone's catalogue is positioned and rotated on the image. Produces an Annotated map.

**Planning mode**:
The mode in which an end user authors a Plan. The board shows the current Slide. The sidebar has two tabs: **Plan tab** and **Tunnel tab** (the existing generator, weight tuning, and Tunnel candidate list). The Plan tab contains, top to bottom: tab controls, tool palette, an Object properties panel (visible only when an Object is selected), then the Slides list. Slides are listed vertically; each card shows the slide name, ↑ / ↓ reorder buttons, a duplicate button, and a delete button. Clicking a slide card makes it the active Slide.

**Tool palette**:
A set of tools in the Plan tab sidebar: Select, Circle, Rectangle, Arrow, Text. Selecting a placement tool and using its gesture places one Object, then the palette reverts automatically to Select. Single-clicking a placed Object selects it and shows its properties in the Plan tab.

Placement gestures:
- **Circle**: click-drag — radius snaps to nearest preset; bare click = 32mm.
- **Rectangle**: one continuous gesture — mousedown sets center, drag direction sets rotation (distance ignored), mouseup places. Size comes from the active preset, not the drag.
- **Arrow**: click-drag — mousedown = start point, mouseup = end point.
- **Text**: single click — places at click position.

**Layout**:
A specific arrangement of a Killzone's piece catalogue — each piece positioned at an (x, y) and rotation, plus the layout's drop zones and objective markers. MVP supports only **Volkus 1**.

**Annotated map**:
The persistent representation of one Layout: layout image + per-piece placement + drop zones + objective markers. Used as input to the renderer and scorer.

**Plan**:
A named collection of Slides for a given (Annotated map, drop zone) pair. Encodes the full gameplan for sharing via URL. Replaces the MVP definition (which was a single five-marker chain). A Plan carries a user-editable name and an ordered list of Slides.

**Plan lock**:
An ephemeral boolean (not URL-encoded) that prevents accidental edits. When locked, the tool palette and object interaction are disabled; slide navigation remains active. Defaults to locked whenever a Plan is loaded from a URL. The user toggles it via a single button in the Plan tab.

**Slide**:
An independent board state within a Plan. Each Slide carries a user-editable name (defaulting to "Slide N"), an optional set of Tunnel markers, and its own collection of Objects. Slides within a Plan share the same map and drop zone but are otherwise independent. A Slide can be duplicated to carry its Objects forward as the starting point for the next.
_Avoid_: frame, step, scene, page

**Object** (on a Slide):
Anything placed on the board beyond Tunnel markers. Objects are purely visual/planning aids — not rule-enforced. Four kinds:

- **Circle**: position, size (mm), color, label. Placed by click-drag — the drag radius snaps to the nearest preset size in mm: [20, 25, 28, 32, 40, 50, 60]. A click with no drag places a 32mm circle. Size is editable afterward.
- **Rectangle**: position, rotation, length (mm), width (mm), color, label. Placed via a two-part gesture (see Tool palette). Named presets set initial dimensions: Light Barricade (50×8mm), Heavy Barricade (40×15mm), Razor Wire (64×10mm), Mines (32×10mm), Ladder (15×3mm). Preset name becomes initial label. Dimensions editable afterward.
- **Arrow**: start position, end position, color, label. Placed by click-drag (mousedown = start, mouseup = end).
- **Text**: position, label.

Colors are drawn from a fixed palette: red, blue, yellow, green, white, black. Stored as a token, not a hex value.
_Avoid_: shape, token, overlay (too generic)

**Pixel-to-inch transform**:
The affine map between image pixel coordinates and killzone inches. Calibrated by clicking two opposite corners of the killzone rectangle and supplying its known dimensions; verified by overlaying a 1″ grid plus 32mm and 40mm circles. Correctness of this transform is the foundational soundness property of the whole tool.

**Tunnel candidate**:
A scored tunnel chain produced by the generator — the renamed `ScoredPlan`. Carries `markers`, `scores`, `wins`, but is not a Plan. The generator presents a ranked list of Tunnel candidates; the user picks one to load into the current Slide's tunnel.
_Avoid_: plan (reserved for the collection of slides), scored plan

### The MVP scorer

The scorer evaluates each candidate chain against six criteria. It supports two ranking strategies:

1. **Pareto front**: all candidates that no other candidate beats on every axis, k-medoid-sampled to ~6 diverse plans.
2. **Weighted sum**: normalized scores weighted by priority, presenting the top 5 highest-scoring candidates.

**Objective distance** *(higher = better)*: sum of sigmoid-scored distances from the TUNNEL to each objective. For each objective, the distance is measured to the nearest point in the 1″-disk around the objective center. The sigmoid is parameterized to give score ≈1 at distance 0, score ≈0.9 at control range (40mm + 1″), and taper to ≈0 at 10″. Incentivizes best-effort proximity to all objectives even when complete coverage is impossible. Weighted priority: 6.

**Forward reach** *(higher = better)*: max perpendicular distance from the drop zone's anchor edge to any Tunnel marker in the chain. Incentivizes pushing into the enemy half. Weighted priority: 5.

**Center objective access** *(lower = better)*: smallest N in {0…4} such that a 40mm base can be validly placed on the partial TUNNEL through markers 0…N with its centre within 40mm + 1″ of the centre objective. 5 if never reachable. Weighted priority: 4.

**Home objective unburrow** *(binary)*: 1 if the home objective can be reached from the TUNNEL within control range (40mm + 1″), else 0. Indicates whether unburrow-to-home is tactically viable. Weighted priority: 3.

**Objective coverage** *(higher = better)*: count of objective markers (any role) for which every point in the 1″-disk around the marker lies within 2″ of the TUNNEL. Weighted priority: 2.

**Zigzag** *(higher = better)*: count of *distinct* Terrain pieces whose footprint is crossed by at least one between-segment of the chain. Capped at score 1.0 if ≥5 pieces (practical maximum for well-planned tunnels). Binary per piece; each piece type contributes equally. Weighted priority: 1.
