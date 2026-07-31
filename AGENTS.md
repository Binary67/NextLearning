# Project Policies

- Do not write data or schema migration code.
- Do not preserve backward compatibility with old data formats, schemas, or processing outputs.
- Do not delete existing data. When a change makes data incompatible, tell the user what must be deleted and wait for the user to delete it.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
