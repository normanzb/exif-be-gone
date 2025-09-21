export function compareUint8Arrays(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((byte, index) => byte === b[index]);
}
