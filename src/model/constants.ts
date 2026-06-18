export const IN_PER_MM = 1 / 25.4

/** Tunnel marker: 20mm diameter token. */
export const MARKER_RADIUS_IN = 10 * IN_PER_MM

/** Ravener operative base: 40mm. */
export const BASE_RADIUS_IN = 20 * IN_PER_MM

/** Objective marker: 40mm. */
export const OBJECTIVE_RADIUS_IN = 20 * IN_PER_MM

export const CONTROL_RANGE_IN = 1

/**
 * Centre-to-centre threshold for a 40mm base to be in control range of a
 * 40mm objective marker: 40mm + 1" (≈ 2.574").
 */
export const CONTROL_CENTER_TO_CENTER_IN = 40 * IN_PER_MM + CONTROL_RANGE_IN

/** Centre-to-centre is the same thing as wholly within 5" for two identical 20mm markers. */
export const MAX_LINK_CENTER_TO_CENTER_IN = 5

export const MIN_LINK_CENTER_TO_CENTER_IN = 4.5

/** Marker 0 candidates sit on the strip 10mm inside the drop zone's anchor edge. */
export const MARKER0_EDGE_INSET_IN = MARKER_RADIUS_IN

/** Objective coverage axis: the disk around an objective marker that must
 *  lie within COVERAGE_RANGE_IN of the TUNNEL. Radius = marker radius + 1"
 *  (i.e. the objective's control-range zone). */
export const COVERAGE_DISK_RADIUS_IN = OBJECTIVE_RADIUS_IN + 1
export const COVERAGE_RANGE_IN = 2

/** Reach aura (outline): every point within a Ravener's base diameter + 1" of
 *  the TUNNEL. Distance measured from the tunnel region (see distToTunnel). */
export const UNBURROW_CONTROL_RANGE_IN = 2 * BASE_RADIUS_IN + CONTROL_RANGE_IN

export const CHAIN_LENGTH = 5

/**
 * Objective distance axis: a logistic proximity score per objective,
 *   score(d) = 1 / (1 + e^(K · (d − MID)))
 * where d is the distance (in) from the objective centre to the TUNNEL.
 * Calibrated for a gradual falloff: d=0 → ≈0.98, d=control range → ≈0.90,
 * d=6" → ≈0.45, d=10" → ≈0.05. Both constants are tunable.
 */
export const OBJ_DISTANCE_SIGMOID_K = 0.7
export const OBJ_DISTANCE_SIGMOID_MID = 5.7

/** Objectives on a layout (Volkus 1 has 3); caps objective-distance & coverage. */
export const OBJECTIVE_COUNT_MAX = 3

/** Zigzag practical maximum: crossing ≥5 pieces normalises to a full score. */
export const ZIGZAG_CAP = 5

/** Circle Object placement snaps the dragged radius to the nearest of these. */
export const CIRCLE_PRESET_SIZES_MM = [20, 25, 28, 32, 40, 50, 60] as const

/** Diameter used for a Circle placed with a bare click (no drag). */
export const CIRCLE_DEFAULT_SIZE_MM = 32

/** Named Rectangle presets (in-game equipment footprints), length × width in mm. */
export const RECT_PRESETS = [
  { name: 'Light Barricade', lengthMm: 50, widthMm: 8 },
  { name: 'Heavy Barricade', lengthMm: 40, widthMm: 15 },
  { name: 'Razor Wire', lengthMm: 64, widthMm: 10 },
  { name: 'Mines', lengthMm: 32, widthMm: 10 },
  { name: 'Ladder', lengthMm: 15, widthMm: 3 },
] as const
