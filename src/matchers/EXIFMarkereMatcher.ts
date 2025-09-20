import { exifMarker } from "../constants.js";
import { Matcher } from "../Matcher.js";

export class App1MarkerMatcher extends Matcher {
  constructor() {
    super({ matcher: exifMarker });
  }
}
