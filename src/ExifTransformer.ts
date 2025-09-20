import { MatcherFeedResultType, type Matcher } from "./Matcher.js";
import { PNGMatcher } from "./matchers/PNGMatcher.js";
import { WebP1Matcher } from "./matchers/WebP1Matcher.js";
import { WebP2Matcher } from "./matchers/WebP2Matcher.js";
import { App1MarkerMatcher } from "./matchers/App1MarkerMatcher.js";
import { TransformHandler } from "./TransformHandler.js";
import { Scanner } from "./transformHandlers/Scanner.js";

// const maxMarkerLength = Math.max(
//   exifMarker.length,
//   xmpMarker.length,
//   flirMarker.length
// );

type FileFormatMatchResult = "png" | "webp1" | "webp2" | "jpegOrTiff";
class SensitiveDataRemovalTransformer extends TransformStream {
  constructor(
    private readonly jpegOrTIFFGPSRemovingTransformHandler: JPEGOrTIFFGPSRemovingTransformHandler,
    private readonly fileFormatDeterminationTransformHandler: FileFormatDeterminationTransformHandler
  ) {
    super({
      transform: (chunk, controller) => {
        return this.transform(chunk, controller);
      },
    });

    this.jpegOrTIFFGPSRemovingTransformHandler.rootTransform = this.transform;
    this.fileFormatDeterminationTransformHandler.rootTransform = this.transform;
  }

  transform(chunk: Uint8Array, controller: TransformStreamDefaultController) {
    // if the file format is determined, we can use the sub transformer
    if (this.fileFormatDeterminationTransformHandler.fileFormat) {
      return this.getFileSpecificTransformHandler().transform(
        chunk,
        controller
      );
    }

    // otherwise, we need to determine the file format
    return this.fileFormatDeterminationTransformHandler.transform(
      chunk,
      controller
    );
  }

  getFileSpecificTransformHandler() {
    switch (this.fileFormatDeterminationTransformHandler.fileFormat) {
      case "jpegOrTiff":
        return this.jpegOrTIFFGPSRemovingTransformHandler;
      default:
        throw new Error("Unsupported file format");
    }
  }
}

export class ExifTransformer extends SensitiveDataRemovalTransformer {
  constructor() {
    super(
      new JPEGOrTIFFGPSRemovingTransformHandler(),
      new FileFormatDeterminationTransformHandler()
    );
  }
}

class FileFormatDeterminationTransformHandler extends TransformHandler {
  private matchingChunks: Uint8Array[] = [];
  private matchers: Matcher[] = [
    new PNGMatcher(),
    new WebP1Matcher(),
    new WebP2Matcher(),
  ];

  private _fileFormat: FileFormatMatchResult | undefined;
  get fileFormat() {
    return this._fileFormat;
  }
  set fileFormat(value: FileFormatMatchResult | undefined) {
    this._fileFormat = value;
    // this.pipingEnabled = !!value;
  }

  override handleTransform(
    chunk: Uint8Array,
    controller: TransformStreamDefaultController
  ) {
    let anyMatching = false;
    let matchedResult: FileFormatMatchResult | undefined;
    let remainingChunk: Uint8Array | undefined;

    for (const matcher of this.matchers) {
      const feedResult = matcher.feed(chunk);

      if (feedResult.type === MatcherFeedResultType.MATCHED) {
        if (matcher instanceof PNGMatcher) {
          matchedResult = "png";
        } else if (matcher instanceof WebP1Matcher) {
          matchedResult = "webp1";
        } else if (matcher instanceof WebP2Matcher) {
          matchedResult = "webp2";
        } else {
          matchedResult = "jpegOrTiff";
        }
        remainingChunk = feedResult.remainingChunk;
        break;
      }

      if (feedResult.type === MatcherFeedResultType.MATCHING) {
        anyMatching = true;
      }
    }

    if (matchedResult) {
      this.matchingChunks.forEach((pendingChunk) => {
        controller.enqueue(pendingChunk);
      });
      controller.enqueue(chunk);
      this.matchingChunks = [];
      this.fileFormat = matchedResult;
      if (remainingChunk && remainingChunk.length > 0) {
        this.transformComplete(remainingChunk, controller);
      }
      return;
    }

    if (anyMatching) {
      this.matchingChunks.push(chunk);
      return;
    }

    throw new Error("Unsupported image format");
  }
}
class JPEGOrTIFFGPSRemovingTransformHandler extends Scanner<
  [
    { name: "app1Marker"; matcher: App1MarkerMatcher },
    { name: "app1RemainingBytes"; numOfBytes: 2 }
  ]
> {
  constructor() {
    super([
      { name: "app1Marker", matcher: new App1MarkerMatcher() },
      { name: "app1RemainingBytes", numOfBytes: 2 },
    ]);
  }
}
