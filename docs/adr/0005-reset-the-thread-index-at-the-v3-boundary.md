# Reset the thread index at the v3 boundary

The v3 database migration deletes existing thread records together with their Mastra-backed message history. Retaining assistant-linked thread titles as empty shells would misrepresent them as resumable Pi work and require compatibility logic in the new schema; the existing thread-list interface remains, but it contains only newly created Pi threads.
