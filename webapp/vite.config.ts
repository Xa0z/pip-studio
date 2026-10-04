import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  base: '/app/',
  build: {outDir: path.join(here, '../public/app'), emptyOutDir: true},
  server: {proxy: {'/api': 'http://localhost:3000'}},
});
