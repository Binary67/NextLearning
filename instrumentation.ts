import { config } from "dotenv";

/**
 * Next.js loads .env into process.env without overriding variables that are
 * already set (e.g. exported in the developer's shell profile). Re-apply the
 * project .env with override so the project configuration always wins.
 *
 * Note: this only reads `.env`; if `.env.local` or environment-specific files
 * are added later, they take precedence inside Next's own loading and would
 * be overwritten by this step. Remove this file when shell-exported values
 * are no longer used.
 */
export function register() {
  config({ override: true });
}
