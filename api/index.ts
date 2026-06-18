/**
 * grale API — JSON input/output types.
 *
 * The contract defined in `doc/graph-layout-api.adoc`: a graph layout engine
 * expressed as a JSON data format, a strict superset of the dagre serialised
 * JSON structure (`doc/dagre-js.adoc`). These are the types a layout engine
 * implements and is built against.
 */
export type { Point } from './geometry';
export type {
  Direction,
  Side,
  PortRef,
  MarkerDef,
  NodePositions,
  GraphLabel,
  NodeLabel,
  EdgeLabel,
  Warning,
  Diagnostics,
  DebugStyle,
  DebugLine,
  DebugCircle,
  DebugRect,
  DebugText,
  DebugShape,
  DebugLayer,
  DebugNode,
  Endpoint,
  HyperedgePointKind,
  HyperedgePoint,
  HyperedgeSegment,
  HyperedgeTree,
  HyperedgeLabel,
  Hyperedge,
  graleGraph,
  Layout,
} from './types';
