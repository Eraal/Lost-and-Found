declare module 'jsqr' {
  export interface QRCodeLocation {
    topLeftCorner: { x: number; y: number }
    topRightCorner: { x: number; y: number }
    bottomLeftCorner: { x: number; y: number }
    bottomRightCorner: { x: number; y: number }
  }
  export interface QRCode {
    binaryData: Uint8ClampedArray
    data: string
    chunks?: unknown[]
    version?: number
    location: QRCodeLocation
  }
  interface Options {
    inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst'
  }
  function jsQR(data: Uint8ClampedArray, width: number, height: number, options?: Options): QRCode | null
  export default jsQR
}
