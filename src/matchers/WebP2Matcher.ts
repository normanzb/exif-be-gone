import { webp2Marker } from "../constants.js";
import { Matcher } from "../Matcher.js";

export class WebP2Matcher extends Matcher {
  constructor() {
    super({ matcher: webp2Marker });
  }
}
