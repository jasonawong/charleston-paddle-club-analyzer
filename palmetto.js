export const MARKER_SIZE = 28;
export function palmettoMarkup(color = '#173e73') {
  return `<div class="palmetto-shape"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="white" stroke="${color}" stroke-width="1.5"/><g fill="${color}"><path d="M19 16h3l1 17h-7c3-5 4-11 3-17Z"/><path d="M20 17C14 8 8 10 6 15c5-2 9-1 14 2ZM20 17C14 5 8 5 7 10c5 0 8 3 13 7ZM20 17C18 5 13 3 11 7c4 2 6 5 9 10ZM20 17C17 8 17 3 20 3c3 4 2 9 0 14ZM20 17C22 5 27 3 29 7c-4 2-6 5-9 10ZM20 17C26 5 32 5 33 10c-5 0-8 3-13 7ZM20 17C26 8 32 10 34 15c-5-2-9-1-14 2ZM20 17C12 13 7 17 8 21c4-4 7-4 12-4ZM20 17C28 13 33 17 32 21c-4-4-7-4-12-4Z"/></g><path d="m19 23 3 1m-4 4 4 1" stroke="white" stroke-width="1"/></svg></div>`;
}
