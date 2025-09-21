export abstract class TransformHandler {
  private _rootTransform?: (
    chunk: Uint8Array,
    controller: TransformStreamDefaultController
  ) => void;

  get rootTransform() {
    return this._rootTransform;
  }

  constructor() {}

  setRootTransform(
    transformStream: TransformStream & {
      transform: (
        chunk: Uint8Array,
        controller: TransformStreamDefaultController
      ) => void;
    }
  ) {
    this._rootTransform = transformStream.transform.bind(transformStream);
  }

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
