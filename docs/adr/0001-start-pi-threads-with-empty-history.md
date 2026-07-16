# Start Pi threads with empty history

TIA Studio v3 treats the move from Mastra to Pi as a clean agent-history boundary. Existing Mastra messages are not migrated or exposed through a compatibility reader; Pi threads begin with empty Pi history so the retired runtime and its persistence model can be removed completely.
