import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/kit/vite';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      // Opções do adaptador Vercel, se necessário
      // Por exemplo:
      // edge: false,
      // split: false,
    })
  },
  preprocess: vitePreprocess()
};

export default config;