<svelte:options
  customElement={{
    tag: 'grale-view',
    props: {
      graph: { type: 'Object' },
      debug: { type: 'Boolean' },
      padding: { type: 'Number' },
      layersVisible: { type: 'Boolean', attribute: 'layers-visible' },
    },
  }}
/>

<script lang="ts">
  import GraleView from './GraleView.svelte';

  // Standalone web component: <grale-view> with a `graph` JSON property, a
  // boolean `debug` attribute, a numeric `padding`, and `layers-visible`
  // (initial state of the engine debug layers). Delegates rendering and
  // pan/zoom to the shared GraleView component. The granular overlay
  // categories are deliberately not attributes — they are interactive panel
  // state, toggled in the debug panel.
  let {
    graph = null,
    debug = false,
    padding = 24,
    layersVisible = true,
  }: { graph?: unknown; debug?: boolean; padding?: number; layersVisible?: boolean } = $props();
</script>

<GraleView {graph} {debug} {padding} {layersVisible} />

<style>
  :host {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
