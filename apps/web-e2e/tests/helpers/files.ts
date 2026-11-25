/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** A file for Playwright's setFiles or a CDP drag. */
export type TUploadFile = { name: string; mimeType: string; buffer: Buffer };

export const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
// a valid 1×1 PNG
export const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

export function pdfFile(name: string): TUploadFile {
  return { name, mimeType: "application/pdf", buffer: PDF };
}

export function pngFile(name: string): TUploadFile {
  return { name, mimeType: "image/png", buffer: PNG };
}
