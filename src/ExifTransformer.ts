import { Seeker, SeekerFeedResultType } from "./Seeker.js";
import { Scanner } from "./transformHandlers/Scanner.js";
import {
  app1Marker,
  exifMarker,
  jpegMarker,
  pngMarker,
  webp1Marker,
  webp2Marker,
} from "./constants.js";
import { compareUint8Arrays } from "./utils.js";

type FileFormatMatchResult = "png" | "webp1" | "webp2" | "jpeg";
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

    this.jpegOrTIFFGPSRemovingTransformHandler.setRootTransform(this);
    this.fileFormatDeterminationTransformHandler.setRootTransform(this);
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
      case "jpeg":
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

export default ExifTransformer;

const maxFileFormatMarkerLength = Math.max(
  pngMarker.length,
  webp1Marker.length,
  webp2Marker.length
);

class FileFormatDeterminationTransformHandler extends Scanner {
  constructor() {
    super([{ name: "fileMarker", numOfBytes: maxFileFormatMarkerLength }]);
  }

  private _fileFormat: FileFormatMatchResult | undefined;
  get fileFormat() {
    return this._fileFormat;
  }
  set fileFormat(value: FileFormatMatchResult | undefined) {
    this._fileFormat = value;
  }

  onFileMarkerFound(
    chunks: Uint8Array[],
    controller: TransformStreamDefaultController
  ) {
    const potentialFileMarker = chunks[0];
    let fileMarkerLength = 0;

    if (
      compareUint8Arrays(
        potentialFileMarker.subarray(0, pngMarker.length),
        pngMarker
      )
    ) {
      this.fileFormat = "png";
      fileMarkerLength = pngMarker.length;
    } else if (
      compareUint8Arrays(
        potentialFileMarker.subarray(0, webp1Marker.length),
        webp1Marker
      )
    ) {
      this.fileFormat = "webp1";
      fileMarkerLength = webp1Marker.length;
    } else if (
      compareUint8Arrays(
        potentialFileMarker.subarray(0, webp2Marker.length),
        webp2Marker
      )
    ) {
      this.fileFormat = "webp2";
      fileMarkerLength = webp2Marker.length;
    } else if (
      compareUint8Arrays(
        potentialFileMarker.subarray(0, jpegMarker.length),
        jpegMarker
      )
    ) {
      this.fileFormat = "jpeg";
      fileMarkerLength = jpegMarker.length;
    } else {
      throw new Error("Unsupported file format");
    }

    const precedingBytes = potentialFileMarker.subarray(0, fileMarkerLength);
    const remainingBytes = potentialFileMarker.subarray(fileMarkerLength);

    controller.enqueue(precedingBytes);

    if (remainingBytes.length > 0) {
      this.transformComplete(remainingBytes, controller);
    }
  }
}

// class FileFormatDeterminationTransformHandler extends TransformHandler {
//   private matchingChunks: Uint8Array[] = [];
//   private seekers: Seeker[] = [
//     new Seeker({ matcher: pngMarker }),
//     new Seeker({ matcher: webp1Marker }),
//     new Seeker({ matcher: webp2Marker }),
//   ];

//   private _fileFormat: FileFormatMatchResult | undefined;
//   get fileFormat() {
//     return this._fileFormat;
//   }
//   set fileFormat(value: FileFormatMatchResult | undefined) {
//     this._fileFormat = value;
//     // this.pipingEnabled = !!value;
//   }

//   override handleTransform(
//     chunk: Uint8Array,
//     controller: TransformStreamDefaultController
//   ) {
//     let anyMatching = false;
//     let matchedResult: FileFormatMatchResult | undefined;
//     let remainingChunk: Uint8Array | undefined;

//     for (const matcher of this.seekers) {
//       const feedResult = matcher.feed(chunk);

//       if (feedResult.type === SeekerFeedResultType.MATCHED) {
//         if (matcher.matcher === pngMarker) {
//           matchedResult = "png";
//         } else if (matcher.matcher === webp1Marker) {
//           matchedResult = "webp1";
//         } else if (matcher.matcher === webp2Marker) {
//           matchedResult = "webp2";
//         } else {
//           matchedResult = "jpegOrTiff";
//         }
//         remainingChunk = feedResult.remainingChunk;
//         break;
//       }

//       if (feedResult.type === SeekerFeedResultType.MATCHING) {
//         anyMatching = true;
//       }
//     }

//     if (matchedResult) {
//       this.matchingChunks.forEach((pendingChunk) => {
//         controller.enqueue(pendingChunk);
//       });
//       controller.enqueue(chunk);
//       this.matchingChunks = [];
//       this.fileFormat = matchedResult;
//       if (remainingChunk && remainingChunk.length > 0) {
//         this.transformComplete(remainingChunk, controller);
//       }
//       return;
//     }

//     if (anyMatching) {
//       this.matchingChunks.push(chunk);
//       return;
//     }

//     console.log("anyMatching", anyMatching, "matchedResult", matchedResult);

//     throw new Error("Unsupported image format");
//   }
// }
class JPEGOrTIFFGPSRemovingTransformHandler extends Scanner {
  app1RemainingBytes: Uint8Array | undefined;
  constructor() {
    super([
      { name: "app1Marker", seeker: { matcher: app1Marker } },
      { name: "app1RemainingBytes", numOfBytes: 2 },
      { name: "allRemainingBytes", numOfBytes: "maxNumOfBytes" },
      // { name: "exifMarker", seeker: { matcher: exifMarker } },
    ]);
  }

  onApp1MarkerFound() {}

  onApp1RemainingBytesFound(chunks: Uint8Array[]) {
    const app1RemainingBytes = chunks[0];
    this.app1RemainingBytes = app1RemainingBytes;

    const remainingLength = new DataView(app1RemainingBytes.buffer).getUint16(
      0
    );

    return {
      // nextSpecPreceedingBytesBehavior: "skip" as const,
      maxNumOfBytes: remainingLength - 2,
    };
  }

  onAllRemainingBytesFound(
    unenqueuedChunks: Uint8Array[],
    controller: TransformStreamDefaultController
  ) {
    const matchedBytes = unenqueuedChunks[0];
    const exifMarkerSeeker = new Seeker({ matcher: exifMarker });
    const seekResult = exifMarkerSeeker.feed(matchedBytes);

    if (seekResult.type !== SeekerFeedResultType.MATCHED) {
      controller.enqueue(matchedBytes);
    }
  }

  // onAllRemainingBytesError(
  //   _: string,
  //   unenqueuedChunks: Uint8Array[],
  //   controller: TransformStreamDefaultController
  // ) {
  //   controller.enqueue(app1Marker);
  //   controller.enqueue(this.remainingBytes);
  //   unenqueuedChunks.forEach((chunk) => {
  //     controller.enqueue(chunk);
  //   });
  // }
}
