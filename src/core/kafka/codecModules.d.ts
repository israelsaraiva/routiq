declare module 'snappyjs' {
  export function compress(data: Uint8Array | ArrayBuffer): Uint8Array;
  export function uncompress(data: Uint8Array | ArrayBuffer): Uint8Array;
}

declare module 'lz4js' {
  export function compress(data: Uint8Array, maxSize?: number): Uint8Array;
  export function decompress(data: Uint8Array, maxSize?: number): Uint8Array;
}
