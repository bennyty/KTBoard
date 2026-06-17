# No undo / redo in the Plan editor

The Plan editor (placing Objects, dragging Tunnel markers, renaming Slides, reordering Slides) has no undo stack. This is a deliberate omission, not an oversight. Every mutation type — object placement, drag, property edit, slide duplication, deletion — would need to flow through a command pattern to make undo safe; that is a large, pervasive surface area for a tool where the primary safety net already exists in the data model: duplicate a Slide before making changes you might want to revert, and the previous state is preserved as a sibling Slide. The live URL also means a user can paste a previous URL to recover an earlier state if they saved or bookmarked it.

If usage reveals undo is strongly missed, add it then — but add it properly with a command registry, not as a bolted-on hack.
