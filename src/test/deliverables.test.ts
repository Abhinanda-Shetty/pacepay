import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { extractDocxText, extractSourceArchive, inspectDeliverables } from "@/lib/deliverables.server";

describe("deliverable inspection", () => {
  it("extracts the actual DOCX body text", () => {
    const docx = zipSync({ "word/document.xml": strToU8("<w:document><w:body><w:p><w:r><w:t>Checkout flow implemented</w:t></w:r></w:p></w:body></w:document>") });
    expect(extractDocxText(docx)).toContain("Checkout flow implemented");
  });

  it("reads source files from ZIP archives and excludes dependencies", () => {
    const archive = zipSync({
      "project/src/app.ts": strToU8("export const verified = true;"),
      "project/node_modules/pkg/index.js": strToU8("secret dependency"),
    });
    const result = extractSourceArchive(archive);
    expect(result.text).toContain("export const verified = true;");
    expect(result.text).not.toContain("secret dependency");
  });

  it("rejects a fake PDF instead of trusting its filename", async () => {
    const result = await inspectDeliverables({ files: ["project/milestone/fake.pdf"], urls: [], download: async () => strToU8("not a pdf") });
    expect(result.inspections[0]!.status).toBe("UNABLE_TO_INSPECT");
    expect(result.inspections[0]!.detail).toContain("valid PDF header");
  });

  it("blocks local website URLs from server-side fetching", async () => {
    const result = await inspectDeliverables({ files: [], urls: ["http://127.0.0.1/private"], download: async () => strToU8("") });
    expect(result.inspections[0]!.status).toBe("UNABLE_TO_INSPECT");
    expect(result.inspections[0]!.detail).toContain("Private or local URLs");
  });
});
