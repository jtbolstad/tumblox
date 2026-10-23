import { z } from 'zod';
import { BLOCK_IDS } from './blocks';
import { TOOL_IDS } from './tools';

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

export const goalSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('toppleGems') }),
  z.object({ type: z.literal('scoreTarget'), target: z.number().positive() }),
  z.object({ type: z.literal('clearBoard') }),
  /** pull `remove` blocks out of the tower with the grab tool without it collapsing */
  z.object({ type: z.literal('jenga'), remove: z.number().int().positive() }),
]);

export const levelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  theme: z.string().default('meadow'),
  tool: z.enum(TOOL_IDS).default('ball'),
  throws: z.number().int().positive(),
  goal: goalSchema,
  medals: z
    .object({ bronze: z.number(), silver: z.number(), gold: z.number() })
    .refine((m) => m.bronze <= m.silver && m.silver <= m.gold, 'medal thresholds must ascend'),
  /** pedestal the structure stands on; blocks that drop below its top count as fallen */
  platform: z
    .object({ size: z.tuple([z.number().positive(), z.number().positive()]), top: z.number().min(1) })
    .default({
      size: [6, 6],
      top: 1,
    }),
  /** floor areas that multiply points of blocks that come to rest in them (pos y ignored) */
  zones: z
    .array(
      z.object({
        multiplier: z.number().min(2),
        pos: vec3,
        size: z.tuple([z.number().positive(), z.number().positive()]),
      }),
    )
    .default([]),
  blocks: z
    .array(
      z.object({
        type: z.enum(BLOCK_IDS),
        /** centre, relative to the platform top (y = 0.5 sits a unit block on it) */
        pos: vec3,
        size: vec3.default([1, 1, 1]),
        /** rotation around the vertical axis, radians */
        rot: z.number().default(0),
      }),
    )
    .min(1)
    .max(300), // cap so a shared or hand-made level cannot freeze a phone
});

export type Level = z.infer<typeof levelSchema>;
export type Goal = z.infer<typeof goalSchema>;
export type LevelBlock = Level['blocks'][number];

/** Validate untrusted level JSON (files, editor, share links). Throws a readable error. */
export function parseLevel(data: unknown): Level {
  const res = levelSchema.safeParse(data);
  if (!res.success) {
    throw new Error(`Invalid level: ${z.prettifyError(res.error)}`);
  }
  return res.data;
}

/** All bundled levels, ordered by file name (01-..., 02-...). */
export function loadBundledLevels(): Level[] {
  const files = import.meta.glob('./levels/*.json', { eager: true, import: 'default' });
  return Object.keys(files)
    .sort()
    .map((path) => parseLevel(files[path]));
}
