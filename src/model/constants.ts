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

/**
 * Max gap between sequentially numbered Tunnel markers, measured
 * edge-to-edge (KT measures between closest points of markers).
 */
export const MAX_LINK_GAP_IN = 5

/** Centre-to-centre equivalent of MAX_LINK_GAP_IN for two 20mm markers. */
export const MAX_LINK_CENTER_TO_CENTER_IN = MAX_LINK_GAP_IN + 2 * MARKER_RADIUS_IN

/** Marker 0 candidates sit on the strip 10mm inside the drop zone's anchor edge. */
export const MARKER0_EDGE_INSET_IN = MARKER_RADIUS_IN

/** Objective coverage axis: the disk around an objective marker that must
 *  lie within COVERAGE_RANGE_IN of the TUNNEL. Radius = marker radius + 1"
 *  (i.e. the objective's control-range zone). */
export const COVERAGE_DISK_RADIUS_IN = OBJECTIVE_RADIUS_IN + 1
export const COVERAGE_RANGE_IN = 2

export const CHAIN_LENGTH = 5
