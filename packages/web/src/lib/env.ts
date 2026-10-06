import { env } from 'cloudflare:workers';
import type { AppEnv } from './auth';
export const appEnv = () => env as unknown as AppEnv;
