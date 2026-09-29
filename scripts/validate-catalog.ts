import { validateCatalog } from "./catalog-rules";
import { CONTENT_VERSION, contentHash, RULES_VERSION } from "@/content/index";

const errors = validateCatalog();
if (errors.length) {
  console.error(`Catalog validation failed (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`Catalog OK — ${CONTENT_VERSION}, ${RULES_VERSION}, hash ${contentHash()}`);
