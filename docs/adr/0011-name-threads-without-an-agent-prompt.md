# Name threads without an agent prompt

V3 derives a thread's initial title deterministically from its first user message, permits manual renaming, and mirrors the result to Pi with `set_session_name`. LLM title generation and the thread-naming tool are removed so thread-list usability does not preserve a hidden backend prompting pipeline.
