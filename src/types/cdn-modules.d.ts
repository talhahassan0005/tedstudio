/**
 * Type declarations for modules loaded from a CDN at runtime via
 * `import(/* webpackIgnore: true *​/ '<url>')`.
 *
 * These never go through webpack or node_modules — the browser fetches them
 * natively — so TypeScript needs to be told what they export.
 */

declare module 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm' {
  export interface BackgroundRemovalConfig {
    /** Called while the model/WASM downloads and while inference runs. */
    progress?: (key: string, current: number, total: number) => void;
    model?: 'isnet' | 'isnet_fp16' | 'isnet_quint8';
    output?: {
      format?: 'image/png' | 'image/jpeg' | 'image/webp';
      quality?: number;
    };
  }

  export function removeBackground(
    source: string | Blob | ArrayBuffer | ImageData,
    config?: BackgroundRemovalConfig,
  ): Promise<Blob>;
}

declare module 'ffprobe-static' {
  const ffprobeStatic: { path: string } | null;
  export default ffprobeStatic;
}
