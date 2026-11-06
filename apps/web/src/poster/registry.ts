import { cover, dump, film, grid, postcard, route } from "./templates/aesthetic";
import { booth, burst, cork, luggage, scrapbook, stickers, ticket, windows } from "./templates/funky";
import type { PosterTemplate } from "./types";

/** Every template, by how many photos it takes. New templates only need adding here; the brand tests pick them up. */
export const TEMPLATES: PosterTemplate[] = [route, postcard, luggage, windows, ticket, cover, booth, grid, burst, stickers, scrapbook, film, cork, dump];

export const PHOTO_COUNTS = [...new Set(TEMPLATES.map((t) => t.photos))].sort((a, b) => a - b);

/** The most photos any template takes. */
export const MAX_PHOTOS = Math.max(...PHOTO_COUNTS);

export function getTemplate(id: string): PosterTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]!;
}
