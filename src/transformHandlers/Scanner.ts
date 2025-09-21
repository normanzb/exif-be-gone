import { Seeker, SeekerFeedResultType } from "../Seeker.js";
import { TransformHandler } from "../TransformHandler.js";

// utility types
type DistributiveMerge<T, M> = T extends infer U ? U & M : never;

// scanner types
type BaseScannerSpec = { name: string };
type ScannerSpecUnion = DistributiveMerge<
  | { seeker: { matcher: Uint8Array; maxNumOfBytes?: number } }
  | { numOfBytes: number | "maxNumOfBytes" },
  BaseScannerSpec
>;

type ScannerInstantiatedSpecSeeker = {
  seeker: Seeker;
  unenqueuedChunks: Uint8Array[];
};
type ScannerInstantiatedSpecNumOfBytes = {
  numOfBytes: number | "maxNumOfBytes";
  collectedBytes: Uint8Array;
  collectedNumOfBytes: number;
  unenqueuedChunks: Uint8Array[];
};
type ScannerInstantiatedSpec = DistributiveMerge<
  ScannerInstantiatedSpecSeeker | ScannerInstantiatedSpecNumOfBytes,
  BaseScannerSpec
>;

export type UnmatchedBehavior = "enqueue" | "skip";

/**
 * Abstract base class for scanning and processing data streams based on specifications.
 *
 * The Scanner processes incoming data chunks according to a sequence of specifications.
 * Each specification can either:
 * - Match specific byte patterns using a Matcher
 * - Process a fixed number of bytes
 *
 * When a specification is satisfied, the scanner calls the corresponding event handler
 * method (e.g., `onHeader` for a spec named "header") and moves to the next specification.
 *
 * @template TScannerSpecUnionArray - Array of scanner specifications
 *
 * @example
 * ```typescript
 * class MyScanner extends Scanner<[
 *   { name: "header", matcher: new HeaderMatcher() },
 *   { name: "body", numOfBytes: 1024 }
 * ]> {
 *   onHeader(chunk: Uint8Array, controller: TransformStreamDefaultController) {
 *     // Handle header match
 *   }
 *
 *   onBody(chunk: Uint8Array, controller: TransformStreamDefaultController) {
 *     // Handle body bytes
 *   }
 * }
 * ```
 */
export abstract class Scanner<
  TScannerSpecUnionArray extends ScannerSpecUnion[] = ScannerSpecUnion[]
> extends TransformHandler {
  [key: `on${Capitalize<string>}Found`]: (
    unenqueuedChunks: Uint8Array[],
    controller: TransformStreamDefaultController
  ) => {
    nextSpecPreceedingBytesBehavior?: UnmatchedBehavior;
    maxNumOfBytes?: number;
  } | void;

  [key: `on${Capitalize<string>}Error`]: (
    error: "seekerEnded",
    unenqueuedChunks: Uint8Array[],
    controller: TransformStreamDefaultController
  ) => void;

  private specIndex = 0;
  private currentPreceedingBytesBehavior: UnmatchedBehavior = "enqueue";
  private currentMaxNumOfBytes: number = 0;
  private instantiatedSpecs: ScannerInstantiatedSpec[] = [];

  constructor(readonly specs: TScannerSpecUnionArray) {
    super();
  }

  handleTransform(
    chunk: Uint8Array,
    controller: TransformStreamDefaultController
  ) {
    const spec = this.specs[this.specIndex];

    if (!spec) {
      controller.enqueue(chunk);
      return;
    }

    if ("seeker" in spec) {
      const currentInstantiatedSpec = this.instantiatedSpecs[this.specIndex];
      const instantiatedSpec =
        !!currentInstantiatedSpec && "seeker" in currentInstantiatedSpec
          ? currentInstantiatedSpec
          : ({
              name: spec.name,
              seeker: new Seeker({
                ...spec.seeker,
                ...{ maxNumOfBytes: this.currentMaxNumOfBytes },
              }),
              unenqueuedChunks: [],
            } satisfies ScannerInstantiatedSpecSeeker & BaseScannerSpec);

      this.instantiatedSpecs[this.specIndex] = instantiatedSpec;

      const result = instantiatedSpec.seeker.feed(chunk);
      const resultType = result.type;
      switch (resultType) {
        case SeekerFeedResultType.MATCHED:
          {
            switch (this.currentPreceedingBytesBehavior) {
              case "enqueue":
                controller.enqueue(result.preceedingBytes);
                break;
              case "skip":
                instantiatedSpec.unenqueuedChunks.push(result.preceedingBytes);
                break;
              default:
                this.currentPreceedingBytesBehavior satisfies never;
            }

            this.callSpecFoundAndAdvanceSpec(
              instantiatedSpec.unenqueuedChunks,
              controller
            );

            if (result.remainingChunk.length > 0) {
              this.transformComplete(result.remainingChunk, controller);
            }
          }
          break;
        case SeekerFeedResultType.MATCHING:
          switch (this.currentPreceedingBytesBehavior) {
            case "enqueue":
              controller.enqueue(chunk);
              break;
            case "skip":
              instantiatedSpec.unenqueuedChunks.push(chunk);
              break;
            default:
              this.currentPreceedingBytesBehavior satisfies never;
          }
          break;
        case SeekerFeedResultType.UNMATCHED:
          switch (this.currentPreceedingBytesBehavior) {
            case "enqueue":
              controller.enqueue(chunk);
              break;
            case "skip":
              instantiatedSpec.unenqueuedChunks.push(chunk);
              break;
            default:
              this.currentPreceedingBytesBehavior satisfies never;
          }
          break;
        case SeekerFeedResultType.ENDED:
          instantiatedSpec.unenqueuedChunks.push(chunk);
          this.callSpecError(
            "seekerEnded",
            instantiatedSpec.unenqueuedChunks,
            controller
          );
          break;
        default:
          resultType satisfies never;
      }

      return;
    }

    if ("numOfBytes" in spec) {
      const numOfBytes =
        typeof spec.numOfBytes === "number"
          ? spec.numOfBytes
          : this.currentMaxNumOfBytes;

      const currentInstantiatedSpec = this.instantiatedSpecs[this.specIndex];
      const instantiatedSpec =
        !!currentInstantiatedSpec && "numOfBytes" in currentInstantiatedSpec
          ? currentInstantiatedSpec
          : ({
              name: spec.name,
              numOfBytes: spec.numOfBytes,
              collectedBytes: new Uint8Array(numOfBytes),
              collectedNumOfBytes: 0,
              unenqueuedChunks: [],
            } satisfies ScannerInstantiatedSpecNumOfBytes & BaseScannerSpec);

      const numOfBytesToCollect =
        numOfBytes - instantiatedSpec.collectedNumOfBytes;

      const soFarChunk = chunk.subarray(0, numOfBytesToCollect);
      instantiatedSpec.collectedBytes.set(
        soFarChunk,
        instantiatedSpec.collectedNumOfBytes
      );
      instantiatedSpec.collectedNumOfBytes += soFarChunk.length;

      if (instantiatedSpec.collectedNumOfBytes === numOfBytes) {
        this.callSpecFoundAndAdvanceSpec(
          [instantiatedSpec.collectedBytes],
          controller
        );
        const remainingChunk = chunk.subarray(numOfBytesToCollect);
        if (remainingChunk.length > 0) {
          this.transformComplete(remainingChunk, controller);
        }
      }

      return;
    }

    throw new Error("Invalid spec");
  }

  reset() {
    this.specIndex = 0;
    this.currentPreceedingBytesBehavior = "enqueue";
    this.currentMaxNumOfBytes = 0;
    this.instantiatedSpecs = [];
  }

  private callSpecFoundAndAdvanceSpec(
    unenequeuedChunks: Uint8Array[],
    controller: TransformStreamDefaultController
  ) {
    const spec = this.specs[this.specIndex];
    if (!spec) {
      throw new Error("No current spec");
    }

    const cappedSpecName = ("on" +
      (spec.name.slice(0, 1).toUpperCase() +
        spec.name.slice(1) +
        "Found")) as `on${Capitalize<string>}Found`;

    if (cappedSpecName in this) {
      const { nextSpecPreceedingBytesBehavior, maxNumOfBytes } =
        this[cappedSpecName](unenequeuedChunks, controller) ?? {};

      this.currentPreceedingBytesBehavior =
        nextSpecPreceedingBytesBehavior ?? "enqueue";
      this.currentMaxNumOfBytes = maxNumOfBytes ?? 0;
    }

    this.specIndex++;
  }

  private callSpecError(
    error: "seekerEnded",
    unenequeuedChunks: Uint8Array[],
    controller: TransformStreamDefaultController
  ) {
    const spec = this.specs[this.specIndex];
    if (!spec) {
      throw new Error("No current spec");
    }
    const cappedSpecName = ("on" +
      (spec.name.slice(0, 1).toUpperCase() +
        spec.name.slice(1) +
        "NotFound")) as `on${Capitalize<string>}Error`;
    if (cappedSpecName in this) {
      this[cappedSpecName](error, unenequeuedChunks, controller);
    }
  }
}
