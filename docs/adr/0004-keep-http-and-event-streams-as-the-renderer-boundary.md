# Keep HTTP and event streams as the renderer boundary

TIA Studio v3 retains its authenticated local HTTP and SSE renderer transport and replaces the implementation behind it with the application-owned Agent Runtime. A new preload IPC agent bridge would duplicate an already working boundary and break browser annotation mode; embedded Pi SDK sessions, provider credentials, and Pi-specific objects remain exclusively in Electron main.
