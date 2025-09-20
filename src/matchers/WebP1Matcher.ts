import { webp1Marker } from "../constants.js";
import { Matcher } from "../Matcher.js";

export class WebP1Matcher extends Matcher {
  constructor() {
    super({ matcher: webp1Marker });
  }
}
