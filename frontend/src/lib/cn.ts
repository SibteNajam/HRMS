import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge must be told about our custom scales, or it guesses wrong.
 *
 * Without this, `text-body-lg` is not in its built-in font-size list, so it
 * falls back to treating any unknown `text-*` as a text COLOUR — and then
 * `cn('text-white', 'text-body-lg')` silently drops `text-white` as a
 * conflict. That is how the primary button lost its label colour.
 *
 * Every custom `text-*` / `rounded-*` / `shadow-*` token from globals.css has
 * to be listed here so it is classified in the right group.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'caption', 'body-sm', 'body', 'body-lg',
            'h3', 'h2', 'h1',
            'display-sm', 'display-lg',
          ],
        },
      ],
      shadow: [{ shadow: ['brand'] }],
    },
  },
});

/** Merge conditional classes and resolve Tailwind conflicts (last wins). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
