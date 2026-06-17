# Encode the full Plan as a single LZ-compressed URL blob

The app is offline-first with no server. The entire Plan (name, all Slides, all Objects, Tunnel markers) must be shareable via a URL that works in any medium — messaging apps, email, Discord — without a backend to store state. Encoding every field as individual query parameters produces URLs that exceed ~2 000 characters for a realistic 4–6 slide plan with a dozen objects per slide; messaging tools truncate or mangle these. We serialize the Plan as JSON, compress it with LZ-string, base64-encode the result, and store it as a single hash parameter (`#p=...`). A representative plan compresses to ~600–900 characters — well within any medium's limit.

## Considered options

- **Readable query params** (`?m=volkus-1&dz=alpha&k0=...`). Debuggable but too long for realistic plans; rejected.
- **Server-side short link** (store the plan, share a UUID). Eliminated the offline-first requirement and added infrastructure; rejected.
- **LZ-string blob** (chosen). Self-contained, no server, survives all sharing media.

## Consequences

All existing URLs that use the old `#m=&dz=&k=` format will stop being parsed after this change. The old format encoded only a single tunnel chain; no Plans authored under the new format exist yet, so there is nothing to migrate. The new format is not human-readable in the address bar, which makes manual debugging harder — use `JSON.parse(LZString.decompressFromEncodedURIComponent(...))` in the browser console to inspect a shared URL.
