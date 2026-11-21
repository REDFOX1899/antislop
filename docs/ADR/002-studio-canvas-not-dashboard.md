# ADR-002: AntiSlop Studio (Live Creative Canvas IDE) Instead of a Metrics Dashboard

- **Status:** Accepted
- **Date:** 2026-11-21
- **Context:** The Gemini 4 NYC Hackathon Participant Guide explicitly bans *"Any project where a dashboard is the main feature."* Our earlier draft folder was named `/dashboard`.

## Decision
- Rename `/dashboard` to **`/studio`** (**AntiSlop Studio**).
- Design the interface around a **live, interactive creative canvas** occupying 65%+ of the viewport:
  - Direct live Vite HMR preview of the real React codebase being transformed.
  - Interactive **Circle-to-Tweak** overlay allowing a user or judge to draw directly on any UI region and speak/prompt a targeted aesthetic correction.
  - Interactive **Before / After wipe curtain** comparing baseline AI slop vs. refined output.
  - Tactile **Multimodal Taste Tray** (moodboard drag-drop, motion video upload, live webcam shutter for physical print/objects, voice mic).
  - Compact side rail showing live `gemini-decision-1` rubric telemetry, iteration convergence, and streaming model reasoning — strictly secondary to the live transformed app.

## Consequences
- Unmistakably a real-time multimodal creative frontend IDE, not a passive analytics dashboard.
- Studio UI itself must exemplify zero AI slop (clean editorial studio typography, crisp hairline borders, warm neutral canvas, no purple SaaS glow).
