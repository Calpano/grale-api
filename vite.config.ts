import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Builds/serves the reusable grale viewer: `GraleView.svelte` (a normal Svelte
// component) and `GraleElement.svelte`, which compiles to the `<grale-view>`
// custom element. `npm run dev` opens a small demo (viewer/main.ts) that renders
// examples/sample.out.json. The evaluation app lives in the separate grale-eval
// repo and imports these components from this package.
export default defineConfig({
  root: 'viewer',
  plugins: [
    svelte({
      dynamicCompileOptions({ filename }) {
        if (filename.includes('GraleElement')) return { customElement: true };
      },
    }),
  ],
  server: { fs: { allow: ['..'] } },
  build: { outDir: '../dist-viewer', emptyOutDir: true },
});
