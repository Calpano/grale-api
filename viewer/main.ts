import { mount } from 'svelte';
import GraleView from './GraleView.svelte';
import './GraleElement.svelte'; // side-effect: registers the <grale-view> custom element
import sample from '../examples/sample.out.json';

// Tiny demo of the reusable viewer: render a sample grale result. The full
// engine-comparison app lives in the grale-eval repo.
mount(GraleView, {
  target: document.getElementById('app')!,
  props: { graph: sample, debug: false },
});
