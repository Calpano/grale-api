/**
 * grale rendering — turn a result graph into an SVG string.
 *
 * Framework-agnostic and DOM-free, so it backs both the `grale-to-svg` CLI and
 * the Svelte `<grale-view>` web component from one implementation.
 */
export { renderSvg } from './svg.js';
export type { RenderOptions } from './svg.js';
