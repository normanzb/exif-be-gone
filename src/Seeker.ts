// type MatcherFeedResult = {}

export enum SeekerFeedResultType {
  UNMATCHED = "UNMATCHED",
  MATCHED = "MATCHED",
  MATCHING = "MATCHING",
  ENDED = "ENDED",
}

export type SeekerFeedResult =
  | {
      type: SeekerFeedResultType.MATCHING;
    }
  | {
      type: SeekerFeedResultType.MATCHED;
      soFarChunk: Uint8Array;
      preceedingBytes: Uint8Array;
      remainingChunk: Uint8Array;
    }
  | {
      type: SeekerFeedResultType.UNMATCHED;
    }
  | {
      type: SeekerFeedResultType.ENDED;
    };

export class Seeker {
  matcher: Uint8Array;
  seekedNumOfBytes: number = 0;
  maxNumOfBytes: number = 0;
  private pending: Uint8Array;
  private matchingPointer: number = 0;

  constructor({
    matcher,
    maxNumOfBytes,
  }: {
    matcher: Uint8Array;
    maxNumOfBytes?: number;
  }) {
    this.matcher = matcher;
    this.maxNumOfBytes = maxNumOfBytes ?? 0;
    this.pending = Buffer.alloc(matcher.length);
  }

  feed(chunk: Uint8Array): SeekerFeedResult {
    if (!!this.maxNumOfBytes && this.seekedNumOfBytes > this.maxNumOfBytes) {
      return { type: SeekerFeedResultType.ENDED };
    }

    for (let i = 0; i < chunk.length; i++) {
      this.seekedNumOfBytes++;

      const matcher = this.matcher;
      const currentChunkByte = chunk[i];
      const matchingByte = matcher[this.matchingPointer];

      if (matchingByte !== currentChunkByte) {
        if (this.matchingPointer > 0) {
          this.reset();
        }

        continue;
      }

      this.pending[this.matchingPointer] = currentChunkByte;
      this.matchingPointer++;

      if (this.matchingPointer === matcher.length) {
        this.reset();
        return {
          type: SeekerFeedResultType.MATCHED,
          soFarChunk: chunk.subarray(0, i + 1),
          preceedingBytes: chunk.subarray(0, i + 1 - matcher.length),
          remainingChunk: chunk.subarray(i + 1),
        };
      }
    }

    if (this.matchingPointer > 0) {
      return { type: SeekerFeedResultType.MATCHING };
    }

    return { type: SeekerFeedResultType.UNMATCHED };
  }

  private reset() {
    this.pending.fill(0);
    this.matchingPointer = 0;
  }
}
