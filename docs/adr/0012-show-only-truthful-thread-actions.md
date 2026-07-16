# Show only truthful thread actions

The v3 thread starts from the official assistant-ui registry component but exposes only actions implemented by the Pi runtime: copy, cancel, image attachment, supported native voice input, steer/follow-up submission, permission interactions, and thread rename. Message editing, regeneration, and branch controls are removed from this cut because displaying them without Pi history-replacement or fork semantics would create false affordances.
