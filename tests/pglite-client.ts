import { PGlite } from "@electric-sql/pglite";
import type { SqlClient } from "../src/lib/store/sql-store";

/** A real Postgres (in WebAssembly, in memory) behind the store's SqlClient interface. */
export function pgliteClient(db = new PGlite()): SqlClient {
  return {
    query: async (text, params) => (await db.query(text, params)).rows as never,
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          query: async (text, params) => (await tx.query(text, params)).rows as never,
          transaction: () => Promise.reject(new Error("Nested transactions aren't used")),
        }),
      ),
  };
}
