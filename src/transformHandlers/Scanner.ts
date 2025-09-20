import { Matcher, MatcherFeedResultType } from "../Matcher.js";
import { TransformHandler } from "../TransformHandler.js";

// utility types
type DistributiveMerge<T, M> = T extends infer U ? U & M : never;
// type KeysToObject<T extends string, V = unknown> = {
//   [K in T]: V;
// };
// type ToScannerEventMap<T extends BaseScannerSpec> = KeysToObject<
//   T extends BaseScannerSpec ? T["name"] : never,
//   () => void
// >;
// type Test1 = ToScannerEventMap<
//   [
//     { name: "name1"; matcher: Matcher },
//     { name: "name2"; bytes: number }
//   ][number]
// >;

// ToScannerEventMap<TScannerSpecUnionArray[number]>

// scanner types
type BaseScannerSpec = { name: string };
type ScannerSpecUnion = DistributiveMerge<
  { matcher: Matcher } | { numOfBytes: number },
  BaseScannerSpec
>;

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
  TScannerSpecUnionArray extends ScannerSpecUnion[]
> extends TransformHandler {
  [key: `on${Capitalize<string>}`]: (
    chunk: Uint8Array,
    controller: TransformStreamDefaultController
  ) => void;

  private specIndex = 0;

  constructor(public readonly specs: TScannerSpecUnionArray) {
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

    const cappedSpecName = ("on" +
      (spec.name.slice(0, 1).toUpperCase() +
        spec.name.slice(1))) as `on${Capitalize<string>}`;

    if ("matcher" in spec) {
      const result = spec.matcher.feed(chunk);
      const resultType = result.type;
      switch (resultType) {
        case MatcherFeedResultType.MATCHED:
          {
            this.specIndex++;
            if (cappedSpecName in this) {
              this[cappedSpecName](spec.matcher.matcher, controller);
            }

            if (result.remainingChunk.length > 0) {
              this.transformComplete(result.remainingChunk, controller);
            }
          }
          break;
        case MatcherFeedResultType.MATCHING:
          break;
        case MatcherFeedResultType.UNMATCHED:
          controller.enqueue(chunk);
          break;
        default:
          resultType satisfies never;
      }

      return;
    }

    if ("numOfBytes" in spec) {
      const numOfBytes = spec.numOfBytes;
      const slicedChunk = chunk.subarray(0, numOfBytes);

      if (cappedSpecName in this) {
        this[cappedSpecName](slicedChunk, controller);
      }

      const remainingChunk = chunk.subarray(numOfBytes);

      if (remainingChunk.length > 0) {
        this.transformComplete(remainingChunk, controller);
      }
    }

    throw new Error("Invalid spec");
  }
}
