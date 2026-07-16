# Let Pi name threads with an explicit tool

V3 exposes `nameTheThread` as an explicit Pi tool. Pi calls it after the first substantive user request and may call it again when the task meaningfully changes. The tool persists the title, mirrors it to Pi with `setSessionName`, and publishes a session metadata event so the thread list updates immediately. The renderer does not expose manual thread-name inputs, including for an empty thread.
