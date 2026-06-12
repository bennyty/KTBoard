# Kill Team Tunnel Planner

A pre-game planning tool for the Raveners faction in Kill Team 2024 Approved Ops. The user picks an annotated killzone layout and drop zone; the app generates and ranks candidate placements of the five Tunnel markers and lets the user drag-and-drop to refine.

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
The mode in which an end user picks an Annotated map and a drop zone, the app generates and Pareto-ranks five-marker chains, and drag-and-drop refinement is available.

**Layout**:
A specific arrangement of a Killzone's piece catalogue — each piece positioned at an (x, y) and rotation, plus the layout's drop zones and objective markers. MVP supports only **Volkus 1**.

**Annotated map**:
The persistent representation of one Layout: layout image + per-piece placement + drop zones + objective markers. Used as input to the renderer and scorer.

**Plan**:
The artifact produced in Planning mode for a given (Annotated map, drop zone) pair. In MVP, a Plan is just the five Tunnel marker positions plus a reference to the map ID; post-MVP it also carries up to ~100 user-added Shapes.

**Shape** (post-MVP):
A user-drawn circle, arrow, or short text overlay on a Plan, used as a visual reasoning aid (threat zones, hypothetical operative placements, notes). Not rule-enforced.

**Pixel-to-inch transform**:
The affine map between image pixel coordinates and killzone inches. Calibrated by clicking two opposite corners of the killzone rectangle and supplying its known dimensions; verified by overlaying a 1″ grid plus 32mm and 40mm circles. Correctness of this transform is the foundational soundness property of the whole tool.

### The MVP scorer

The scorer evaluates each candidate chain against five soft criteria. Output is the Pareto front, k-medoid-sampled down to 6 presented plans.

**Zigzag** *(higher = better)*: count of *distinct* Terrain pieces whose footprint is crossed by at least one between-segment of the chain. Binary per piece; each piece type contributes equally.

**Center objective access** *(lower = better)*: smallest N in {0…4} such that a 40mm base can be validly placed on the partial TUNNEL through markers 0…N with its centre within 40mm + 1″ of the centre objective. 5 if never reachable.

**Objective coverage** *(higher = better)*: count of objective markers (any role) for which every point in the 1″-disk around the marker lies within 2″ of the TUNNEL.

**Home objective unburrow** *(lower = better)*: minimum distance from the home objective's centre to the centre of any valid 40mm base placement on the TUNNEL (base touches TUNNEL, doesn't overlap terrain, wholly within killzone). 0 means the base centre is exactly on the home obj; ≤ 40mm + 1″ means control range is achievable.

**Forward reach** *(higher = better)*: max perpendicular distance from the drop zone's anchor edge to any Tunnel marker in the chain.
