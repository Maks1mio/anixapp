declare module '*uqr.mjs' {
  export function renderSVG(
    data: string,
    options?: {
      pixelSize?: number;
      whiteColor?: string;
      blackColor?: string;
    },
  ): string;
}
