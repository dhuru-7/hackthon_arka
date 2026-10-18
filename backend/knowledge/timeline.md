# Timeline Diagram Rules & Standards for Mermaid JS

## Overview
The `timeline` diagram type in Mermaid JS is designed to visualize chronological milestones, project roadmaps, historical events, and phased releases along an intuitive horizontal or grouped axis.

## Syntax & Core Directives
- **Directive**: Always begin with `timeline`.
- **Title**: Use `title "..."` to declare the timeline name.
- **Sections**: Group chronological events into eras or phases using `section Phase Name`.
- **Time Periods & Events**:
  - `Period : Event Description`
  - Multiple events under the same period: `Period : Event 1 : Event 2 : Event 3`
  - Wrapped descriptions on subsequent indented lines:
    ```
    Period : Event One
           : Event Two
    ```

## Standard Structure
```mermaid
timeline
    title Project Horizon Roadmap 2026
    section Discovery & Research
        Q1 2026 : User Persona Interviews : Competitive Landscape Audit
        Q2 2026 : Feasibility Prototype : Architecture Sign-off
    section Development & Beta
        Q3 2026 : Core Engine Alpha : Initial Test Flights
        Q4 2026 : Public Beta Launch : Performance Hardening
    section Scale & Enterprise
        2027 : Global Multi-region Deployment : Enterprise SSO & Compliance
```

## Best Practices
1. **CHRONOLOGICAL ORDERING**: Always list sections and time periods in strict chronological order (past to future or step 1 to step N).
2. **CONCISE EVENT TEXT**: Keep individual event labels crisp and informative (under 60 characters each).
3. **SECTION ORGANIZATION**: Divide the timeline into 3 to 6 logical sections (e.g. Quarters, Phases, Versions, Decades) to prevent overcrowding.
4. **CONSISTENT PERIOD LABELS**: Use a consistent date/time format across the timeline (e.g., all `YYYY`, all `Q1 YYYY`, or all `Sprint N`).
5. **MULTIPLE EVENTS PER MILESTONE**: Group concurrent events under a single time period using colons (`:`) rather than repeating the same period key.

## CRITICAL Anti-Patterns — NEVER DO THESE

### 1. NEVER Use HTML Tags or Line Breaks Inside Events
Do not insert `<br/>`, `<b>`, `<span>`, or other HTML elements inside timeline event text.
- **WRONG**:
  ```
  2026 : <b>Alpha Release</b><br/>Core features
  ```
- **CORRECT**:
  ```
  2026 : Alpha Release : Core features implemented
  ```

### 2. NEVER Use Arrow Connectors (`-->`, `->>`)
Timeline diagrams do not use node connection arrows. The progression is inferred from the chronological flow.
- **WRONG**:
  ```
  2024 --> 2025 --> 2026
  ```
- **CORRECT**:
  ```
  2024 : Launch Phase 1
  2025 : Expand Infrastructure
  2026 : Enterprise Scale
  ```

### 3. NEVER Use Colon as Part of Event Text Without Escaping
Colons (`:`) act as event delimiters. If your event title contains a colon, rephrase it or omit the literal colon.
- **WRONG**:
  ```
  2026 : Feature: Dark Mode
  ```
- **CORRECT**:
  ```
  2026 : Feature - Dark Mode
  ```

## Examples

### Example 1: Software Product Evolution
```mermaid
timeline
    title ARKA Diagram Engine Release History
    section Version 1.0 Foundations
        Jan 2026 : Initial Core Architecture : Mermaid DSL Parsing
        Feb 2026 : Canvas Zoom & Pan : SVG Rendering Engine
    section Version 2.0 AI Integration
        Mar 2026 : Gemini AI Assistant : Natural Language Prompting
        Apr 2026 : Multi-diagram Suggestion Engine : Realtime Error Healing
    section Version 3.0 Enterprise & Cloud
        May 2026 : GitHub Repository Import : Team Workspaces
        Jun 2026 : Edge Functions Integration : Realtime Collaboration
```

### Example 2: Startup Growth Journey
```mermaid
timeline
    title Company Milestones (2023 - 2026)
    section Inception
        2023 : Founded in Bengaluru : Seed Capital Raised ($500K)
    section Product-Market Fit
        2024 : 10,000 Active Developers : Series A Funding ($3M)
        2025 : Top Product on ProductHunt : 100K+ Generated Diagrams
    section Global Expansion
        2026 : US & Europe Enterprise Launch : SOC2 Type II Certification
```
