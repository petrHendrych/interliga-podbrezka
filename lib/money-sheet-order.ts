export function sheetOrder<T>(
  isOwn: (row: T) => boolean,
  isOpen: (row: T) => boolean,
  name: (row: T) => string,
  locale: string,
): (a: T, b: T) => number {
  return (a, b) => Number(isOwn(b)) - Number(isOwn(a))
    || Number(isOpen(b)) - Number(isOpen(a))
    || name(a).localeCompare(name(b), locale);
}
