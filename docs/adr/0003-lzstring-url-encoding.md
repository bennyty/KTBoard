# Encode the full Plan as a single LZ-compressed URL blob

The app is offline-first with no server. The entire Plan (name, all Slides, all Objects, Tunnel markers) must be shareable via a URL that works in any medium — messaging apps, email, Discord — without a backend to store state. Encoding every field as individual query parameters produces URLs that exceed ~2 000 characters for a realistic 4–6 slide plan with a dozen objects per slide; messaging tools truncate or mangle these. We serialize the Plan as JSON, compress it with LZ-string, base64-encode the result, and store it as a single hash parameter (`#p=...`). A representative plan compresses to ~600–900 characters — well within any medium's limit.

## Versioning

The compact array leads with a numeric codec version (`[1, name, mapId, dropZoneId, slides]`) so a future change to the layout can keep decoding plans shared under older versions. On decode we read the version and dispatch to the matching body decoder; an unknown (future) version returns `null` rather than mis-decoding. Plans shared before versioning existed lead with the plan name (a string) rather than a number, and are detected and decoded as version 0 — those URLs keep working. To evolve the format, bump the version constant and add a decoder branch for the new shape, leaving older branches intact.

## Considered options

- **Readable query params** (`?m=volkus-1&dz=alpha&k0=...`). Debuggable but too long for realistic plans; rejected.
- **Server-side short link** (store the plan, share a UUID). Eliminated the offline-first requirement and added infrastructure; rejected.
- **LZ-string blob** (chosen). Self-contained, no server, survives all sharing media.

## Consequences

All existing URLs that use the old `#m=&dz=&k=` format will stop being parsed after this change. The old format encoded only a single tunnel chain; no Plans authored under the new format exist yet, so there is nothing to migrate. The new format is not human-readable in the address bar, which makes manual debugging harder — use `JSON.parse(LZString.decompressFromEncodedURIComponent(...))` in the browser console to inspect a shared URL.
