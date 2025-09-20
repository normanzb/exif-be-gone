import { hexToBytes } from "@noble/hashes/utils";

export const app1Marker = hexToBytes("ffe1");
export const exifMarker = hexToBytes("457869660000"); // Exif\0\0
export const pngMarker = hexToBytes("89504e470d0a1a0a"); // 211   P   N   G  \r  \n \032 \n
export const webp1Marker = hexToBytes("52494646"); // RIFF
export const webp2Marker = hexToBytes("57454250"); // WEBP
// const xmpMarker = utf8ToBytes("http://ns.adobe.com/xap");
// const flirMarker = utf8ToBytes("FLIR");
