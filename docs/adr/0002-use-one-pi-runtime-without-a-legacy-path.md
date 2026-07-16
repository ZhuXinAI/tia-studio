# Use one Pi runtime without a legacy path

TIA Studio v3 routes desktop chat, channel messages, and automations through one application-owned Pi runtime contract. The Mastra implementation, compatibility feature flags, prompting pipeline, and other abandoned adapters are removed instead of maintained in parallel, because a dual-runtime cutover would preserve the exact complexity the major refactor is intended to eliminate.
