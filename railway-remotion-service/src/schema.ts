import { z } from "zod";

export const compositionSchema = z.object({
  specPath: z.string().optional(),
  specData: z.any().optional(),
});
