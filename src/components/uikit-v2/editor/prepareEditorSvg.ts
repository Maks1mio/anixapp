export function prepareEditorSvg(raw: string): string {
  return String(raw || '')
    .replace(/fill="#1[Bb]1[Ff]24"/g, 'fill="currentColor"')
    .replace(/stroke="#1[Bb]1[Ff]24"/g, 'stroke="currentColor"')
    .replace(/fill="#000000"/gi, 'fill="currentColor"')
    .replace(/stroke="#000000"/gi, 'stroke="currentColor"')
    .replace(/\sfill-opacity="0\.9"/g, '');
}
