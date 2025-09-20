import { MatcherFeedResultType, type Matcher } from "./Matcher.js";
import { PNGMatcher } from "./matchers/PNGMatcher.js";
import { WebP1Matcher } from "./matchers/WebP1Matcher.js";
import { WebP2Matcher } from "./matchers/WebP2Matcher.js";
import { App1MarkerMatcher } from "./matchers/App1MarkerMatcher.js";
import { TransformHandler } from "./TransformHandler.js";

// const maxMarkerLength = Math.max(
//   exifMarker.length,
//   xmpMarker.length,
//   flirMarker.length
// );

type FileFormatMatchResult = "png" | "webp1" | "webp2" | "jpegOrTiff";
class GPSRemovalTransformer extends TransformStream {
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

  constructor(
    private readonly jpegOrTIFFGPSRemovingTransformer: JPEGOrTIFFGPSRemovingTransformHandler
  ) {
    super({
      transform: (chunk, controller) => {
        if (this.fileFormat) {
          return this.getSubTransformer().transform(chunk, controller);
        }

        // otherwise, we need to determine the file format
        let anyMatching = false;
        let matchedResult: FileFormatMatchResult | undefined;

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
          return;
        }

        if (anyMatching) {
          this.matchingChunks.push(chunk);
          return;
        }

        throw new Error("Unsupported image format");
      },
    });
  }

  getSubTransformer() {
    switch (this.fileFormat) {
      case "jpegOrTiff":
        return this.jpegOrTIFFGPSRemovingTransformer;
      default:
        throw new Error("Unsupported file format");
    }
  }
}

export class ExifTransformer extends GPSRemovalTransformer {
  constructor() {
    super(new JPEGOrTIFFGPSRemovingTransformHandler());
  }
}
class JPEGOrTIFFGPSRemovingTransformHandler extends TransformHandler {
  private readonly app1MarkerMatcher: App1MarkerMatcher;
  private state: "waitingForApp1Marker" | "app1MarkerFound" =
    "waitingForApp1Marker";
  private matchingChunks: Uint8Array[] = [];

  constructor() {
    super();

    this.app1MarkerMatcher = new App1MarkerMatcher();
  }

  override transform(
    chunk: Uint8Array,
    controller: TransformStreamDefaultController
  ) {
    switch (this.state) {
      case "waitingForApp1Marker": {
        const feedResult = this.app1MarkerMatcher.feed(chunk);

        switch (feedResult.type) {
          case MatcherFeedResultType.UNMATCHED:
            // let go any bytes before the marker
            if (this.matchingChunks.length > 0) {
              this.matchingChunks.forEach((chunk) => {
                controller.enqueue(chunk);
              });
              this.matchingChunks = [];
            }
            controller.enqueue(chunk);
            break;
          case MatcherFeedResultType.MATCHED:
            this.state = "app1MarkerFound";
            this.matchingChunks.push(chunk);
            break;
          case MatcherFeedResultType.MATCHING:
            this.matchingChunks.push(chunk);
            break;
          default:
            feedResult satisfies never;
        }
        break;
      }
      case "app1MarkerFound":
        break;
      default:
        this.state satisfies never;
    }
  }
}
