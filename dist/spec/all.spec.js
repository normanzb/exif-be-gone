import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import streamBuffers from "stream-buffers";
import ExifTransformer from "../index.js";
describe("Exif be gone", () => {
    describe("stripping exif data", () => {
        it("should strip data", () => {
            return new Promise((resolve, reject) => {
                const writer = new streamBuffers.WritableStreamBuffer();
                createReadStream("Canon_40D.jpg")
                    .pipe(new ExifTransformer())
                    .pipe(writer)
                    .on("finish", () => {
                    try {
                        const contents = writer.getContents();
                        assert(contents, "Writer contents should not be null");
                        assert.equal(contents.length, 5480);
                        resolve();
                    }
                    catch (error) {
                        reject(error);
                    }
                })
                    .on("error", reject);
            });
        });
        it("should still strip with partial chunks", () => {
            return new Promise((resolve, reject) => {
                const writer = new streamBuffers.WritableStreamBuffer();
                const lengthBuf = Buffer.allocUnsafe(2);
                lengthBuf.writeInt16BE(8, 0);
                const readable = Readable.from([
                    Buffer.from("ff", "hex"),
                    Buffer.from("e1", "hex"),
                    lengthBuf,
                    Buffer.from("457869", "hex"),
                    Buffer.from("660000", "hex"),
                    Buffer.from("0001020304050607", "hex"),
                    Buffer.from("08090a0b0c0d0e0f", "hex"),
                    Buffer.from("0001020304050607", "hex"),
                    Buffer.from("08090a0b0c0d0e0f", "hex"),
                ]);
                readable
                    .pipe(new ExifTransformer())
                    .pipe(writer)
                    .on("finish", () => {
                    try {
                        const output = writer.getContents();
                        assert(output, "Writer output should not be null");
                        assert.equal(output.length, 32);
                        resolve();
                    }
                    catch (error) {
                        reject(error);
                    }
                })
                    .on("error", reject);
            });
        });
    });
});
