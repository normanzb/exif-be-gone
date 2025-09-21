import { SeekerFeedResultType, type Seeker } from "./Seeker.js";
import { PNGSeeker } from "./seekers/PNGSeeker.js";
import { WebP1Seeker } from "./seekers/WebP1Seeker.js";
import { WebP2Seeker } from "./seekers/WebP2Seeker.js";
import { App1MarkerSeeker } from "./seekers/App1MarkerSeeker.js";
import { TransformHandler } from "./TransformHandler.js";

// const maxMarkerLength = Math.max(
//   exifMarker.length,
//   xmpMarker.length,
//   flirMarker.length
// );

type FileFormatMatchResult = "png" | "webp1" | "webp2" | "jpegOrTiff";
class GPSRemovalTransformer extends TransformStream {
  private matchingChunks: Uint8Array[] = [];
  private matchers: Seeker[] = [
    new PNGSeeker(),
    new WebP1Seeker(),
    new WebP2Seeker(),
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

          if (feedResult.type === SeekerFeedResultType.MATCHED) {
            if (matcher instanceof PNGSeeker) {
              matchedResult = "png";
            } else if (matcher instanceof WebP1Seeker) {
              matchedResult = "webp1";
            } else if (matcher instanceof WebP2Seeker) {
              matchedResult = "webp2";
            } else {
              matchedResult = "jpegOrTiff";
            }
            break;
          }

          if (feedResult.type === SeekerFeedResultType.MATCHING) {
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
  private readonly app1MarkerMatcher: App1MarkerSeeker;
  private state: "waitingForApp1Marker" | "app1MarkerFound" =
    "waitingForApp1Marker";
  private matchingChunks: Uint8Array[] = [];

  constructor() {
    super();

    this.app1MarkerMatcher = new App1MarkerSeeker();
  }

  override transform(
    chunk: Uint8Array,
    controller: TransformStreamDefaultController
  ) {
    switch (this.state) {
      case "waitingForApp1Marker": {
        const feedResult = this.app1MarkerMatcher.feed(chunk);

        switch (feedResult.type) {
          case SeekerFeedResultType.UNMATCHED:
            // let go any bytes before the marker
            if (this.matchingChunks.length > 0) {
              this.matchingChunks.forEach((chunk) => {
                controller.enqueue(chunk);
              });
              this.matchingChunks = [];
            }
            controller.enqueue(chunk);
            break;
          case SeekerFeedResultType.MATCHED:
            this.state = "app1MarkerFound";
            this.matchingChunks.push(chunk);
            break;
          case SeekerFeedResultType.MATCHING:
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
