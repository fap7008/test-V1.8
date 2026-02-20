/**
 * Decode HTML entities in IIIF manifest files after they're downloaded
 */

import { readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&#x26;": "&",
};

/**
 * Decode numeric HTML entities like &#123; and &#x1A;
 */
function decodeNumericEntity(match: string): string {
  const isHex = match.startsWith("&#x") || match.startsWith("&#X");
  const numStr = isHex ? match.slice(3, -1) : match.slice(2, -1);
  const num = parseInt(numStr, isHex ? 16 : 10);
  return String.fromCharCode(num);
}

/**
 * Decode all HTML entities in a string
 */
export function decodeEntities(text: string): string {
  let result = text;

  // Replace named entities
  Object.entries(ENTITY_MAP).forEach(([entity, char]) => {
    result = result.replace(
      new RegExp(entity.replace(/[&;]/g, "\\$&"), "g"),
      char
    );
  });

  // Replace numeric entities (&#123; and &#x1A;)
  result = result.replace(/&#(?:x[0-9A-Fa-f]+|[0-9]+);/g, decodeNumericEntity);

  return result;
}

/**
 * Recursively decode entities in objects and strings
 */
function decodeObjectEntities(obj: unknown): unknown {
  if (typeof obj === "string") {
    return decodeEntities(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => decodeObjectEntities(item));
  }

  if (obj !== null && typeof obj === "object") {
    const decoded: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      decoded[key] = decodeObjectEntities(value);
    }
    return decoded;
  }

  return obj;
}

/**
 * Process and decode all manifest files in the cache directory
 */
export async function decodeManifestEntities(
  cacheDir: string = ".cache/iiif/manifests"
): Promise<void> {
  try {
    const files = await readdir(cacheDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    if (jsonFiles.length === 0) {
      console.log("[canopy] No manifest files to decode");
      return;
    }

    console.log(
      `[canopy] Decoding HTML entities in ${jsonFiles.length} manifest files...`
    );

    let processed = 0;
    let errors = 0;

    for (const file of jsonFiles) {
      const filePath = join(cacheDir, file);

      try {
        const content = await readFile(filePath, "utf8");
        const data = JSON.parse(content);
        const decoded = decodeObjectEntities(data);

        await writeFile(filePath, JSON.stringify(decoded, null, 2) + "\n", "utf8");
        processed++;
      } catch (error) {
        console.error(
          `[canopy] Error decoding ${file}: ${error instanceof Error ? error.message : String(error)}`
        );
        errors++;
      }
    }

    console.log(
      `[canopy] Entity decoding complete: ${processed} files processed${
        errors > 0 ? `, ${errors} errors` : ""
      }`
    );
  } catch (error) {
    console.error(
      `[canopy] Failed to decode manifest entities: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}
