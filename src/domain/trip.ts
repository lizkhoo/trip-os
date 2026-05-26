import { z } from 'zod';

export const TripSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  home_timezone: z.string().min(1),
  cover_image_uri: z.string().optional().nullable(),
});

export const TripInputSchema = TripSchema.omit({ id: true });

export type Trip = z.infer<typeof TripSchema>;
export type TripInput = z.infer<typeof TripInputSchema>;
