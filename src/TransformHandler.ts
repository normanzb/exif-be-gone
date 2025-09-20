export abstract class TransformHandler {
  public rootTransform?: (
    chunk: Uint8Array,
    controller: TransformStreamDefaultController
  ) => void;

  constructor() {}

  transform(
    chunk: Uint8Array,
    controller: TransformStreamDefaultController
  ): void {
    if (!this.rootTransform) {
      throw new Error("Parent transform stream is not set");
    }

    return this.handleTransform(chunk, controller);
  }

  transformComplete(
    chunk: Uint8Array,
    controller: TransformStreamDefaultController
  ) {
    if (!this.rootTransform) {
      throw new Error("Parent transform stream is not set");
    }

    return this.rootTransform(chunk, controller);
  }

  abstract handleTransform(
    chunk: Uint8Array,
    controller: TransformStreamDefaultController
  ): void;
}
