import { defineRpcContract } from '@get-bb/plugin-sdk';
import * as z from 'zod/mini';
import en from 'zod/v4/locales/en.js';

z.config(en());

const snapshot = z.object({
  id: z.uuid(),
  repository: z.string(),
  createdAt: z.int().check(z.minimum(0)),
});

export type SavedMarket = z.infer<typeof snapshot>;

export const rpcContract = defineRpcContract({
  listSnapshots: {
    input: z.null(),
    output: z.object({
      configured: z.boolean(),
      snapshots: z.array(snapshot).check(z.maxLength(10)),
    }),
  },
  capture: {
    input: z.strictObject({
      repository: z.optional(z.string().check(z.trim(), z.maxLength(256))),
      search: z.optional(z.string().check(z.trim(), z.maxLength(256))),
      maxPages: z._default(z.int().check(z.minimum(1), z.maximum(100)), 10),
      demo: z._default(z.boolean(), false),
    }),
    output: snapshot,
  },
});
