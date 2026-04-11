# Gemini Scientist Hooks

This directory contains Gemini CLI hook configurations for scientist agents (Feynman, Einstein, etc.).

## Structure

- `common.json`: Default hooks applied to all Gemini-based scientist sessions if no specific hook is found.
- `<scientist-name>.json`: Scientist-specific hooks (e.g., `feynman.json`). Resolution is case-insensitive.

## Why this structure?

The `scientist-hooks/` directory is dedicated to hook configurations for scientist agents managed by the AI Traffic Control dashboard. 

By moving the configuration out of the special `.gemini` directory and pointing `GEMINI_CLI_SYSTEM_SETTINGS_PATH` to it during session spawn, we ensure that:
1. Scientists pick up the correct telemetry and behavior hooks.
2. Developers running `gemini` in the project root do NOT accidentally pick up these hooks, as the Gemini CLI ignores this directory by default.
