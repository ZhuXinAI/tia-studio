# Keep provider configuration app-owned

TIA Studio remains the source of truth for provider credentials and model selection and passes only the selected provider's required environment and model choice to Pi. Pi owns execution, but its auth files do not become renderer-managed application state; AI SDK model factories and provider clients are removed when Pi replaces their runtime responsibilities.
