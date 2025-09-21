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
}
