# Use an empty app-managed directory for Chats

Pi sessions created without a user-selected workspace run in an isolated directory under TIA Studio's user-data area. The app creates no `SOUL.md`, `MEMORY.md`, `IDENTITY.md`, prompt files, or other preboot content there; skill-loading policy is separate future work and must not reintroduce an application-side context preloader during this harness refactor.
