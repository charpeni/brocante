import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

const commitSha = process.env.CF_COMMIT_SHA || process.env.GITHUB_SHA || '';
const buildSha = /^[a-f0-9]{40}$/i.test(commitSha) ? commitSha.toLowerCase() : '';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({ imageService: 'passthrough' }),
  integrations: [react()],
  session: false,
  devToolbar: { enabled: false },
  vite: {
    define: {
      'import.meta.env.PUBLIC_BUILD_SHA': JSON.stringify(buildSha),
    },
  },
});
