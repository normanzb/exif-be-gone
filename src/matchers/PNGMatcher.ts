import { pngMarker } from "../constants.js";
import { Matcher } from "../Matcher.js";

export class PNGMatcher extends Matcher {
  constructor() {
    super({ matcher: pngMarker });
  }
}
