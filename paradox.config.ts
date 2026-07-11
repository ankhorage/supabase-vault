import { defineParadoxConfig } from "@ankhorage/paradox";

export default defineParadoxConfig({
  mode: "write",

  docs: {
    title: "@ankhorage/supabase-vault",
    description:
      "Server-only Supabase Vault adapter for Ankhorage secret-store contracts and protected migrations.",
  },

  package: {
    root: ".",
    entrypoints: ["src/index.ts", "src/migration.ts"],
  },

  output: {
    dir: "./paradox",
  },
});
