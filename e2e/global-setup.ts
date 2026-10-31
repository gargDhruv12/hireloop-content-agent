import { rmSync } from "node:fs";

/** Every run starts with no saved packs. */
export default function globalSetup() {
  rmSync(".data-e2e", { recursive: true, force: true });
}
