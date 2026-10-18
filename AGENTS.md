# AGENTS.md

## Hackathon Architecture: Firebase & Flask

This project is configured as a standalone, zero-friction AI diagramming studio:

- **Firebase Project:** `soup-97c76` (Cloud Firestore)
- **Identity:** Anonymous guest session with persistent local device storage ID via [`frontend/src/firebaseAuth.js`](file:///d:/arkadiagrams/frontend/src/firebaseAuth.js).
- **Database:** **Cloud Firestore**:
  - `/diagrams/{diagramId}`: Diagram prompts, generated Mermaid DSL, titles, types, timestamps, and MySpace save state (`is_myspace_saved`).
- **Backend:** Lightweight Python Flask backend handling agentic diagram generation, validation, multimodal analysis, and prompt optimization.
- **Security Rules:** Open read/write rules for hackathon development.
