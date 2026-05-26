import { z } from 'zod';

export const LocationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  address: z.string().optional().nullable(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  geocode_query: z.string().min(1),
  place_id: z.string().optional().nullable(),
  timezone: z.string().min(1),
});

export const LocationInputSchema = LocationSchema.omit({ id: true });

export type Location = z.infer<typeof LocationSchema>;
export type LocationInput = z.infer<typeof LocationInputSchema>;
