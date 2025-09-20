// type MatcherFeedResult = {}

export enum MatcherFeedResultType {
  UNMATCHED = "UNMATCHED",
  MATCHED = "MATCHED",
  MATCHING = "MATCHING",
}

export type MatcherFeedResult =
  | {
      type: MatcherFeedResultType.MATCHING;
    }
  | {
      type: MatcherFeedResultType.MATCHED;
      remainingChunk: Uint8Array;
    }
  | {
      type: MatcherFeedResultType.UNMATCHED;
    };

export abstract class Matcher {
  matcher: Uint8Array;
  private pending: Uint8Array;
  private matchingPointer: number = 0;

  constructor({ matcher }: { matcher: Uint8Array }) {
    this.matcher = matcher;
    this.pending = Buffer.alloc(matcher.length);
  }

  feed(chunk: Uint8Array): MatcherFeedResult {
    for (let i = 0; i < chunk.length; i++) {
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
          type: MatcherFeedResultType.MATCHED,
          remainingChunk: chunk.subarray(i + 1),
        };
      }
    }

    if (this.matchingPointer > 0) {
      return { type: MatcherFeedResultType.MATCHING };
    }

    return { type: MatcherFeedResultType.UNMATCHED };
  }

  private reset() {
    this.pending.fill(0);
    this.matchingPointer = 0;
  }
}
