/**
 * Geometry primitive for the grale API.
 *
 * A point is a plain `{ x, y }` object, never a class. Coordinates are CSS
 * pixels with the origin at the top-left (grale API §"Determinism &
 * coordinate model"). Node `x`/`y` denote the node *centre*.
 *
 * A consuming layout engine built against these types can alias `Point` to
 * its own point type (e.g. `Pt`); the shape is identical.
 */
export interface Point {
  x: number;
  y: number;
}
