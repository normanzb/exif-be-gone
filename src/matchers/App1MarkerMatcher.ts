import { app1Marker } from "../constants.js";
import { Matcher } from "../Matcher.js";

export class App1MarkerMatcher extends Matcher {
  constructor() {
    super({ matcher: app1Marker });
  }
}
