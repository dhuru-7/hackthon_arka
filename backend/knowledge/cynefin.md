# Cynefin Framework Rules & Standards for Mermaid JS (cynefin-beta)

## Overview
The Cynefin framework is a sense-making framework created by Dave Snowden that categorizes problems and operating environments into five complexity domains to guide effective leadership and decision-making responses.

In Mermaid (v11.16.0+), Cynefin diagrams are natively supported via the `cynefin-beta` diagram type.

---

## 1. The Five Domains of Cynefin

| Domain | Location | Nature of Cause & Effect | Decision Model | Practice Type | Typical Situations |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Complex** | Top-Left | Only understood in retrospect | **Probe → Sense → Respond** | Emergent Practices | Novel innovation, R&D, market shifts, cultural changes |
| **Complicated** | Top-Right | Discoverable through expertise | **Sense → Analyse → Respond** | Good Practices | Technical architecture, performance tuning, compliance audits |
| **Clear** | Bottom-Right | Obvious, direct, predictable | **Sense → Categorise → Respond** | Best Practices | Runbooks, routine checklists, password resets, standard releases |
| **Chaotic** | Bottom-Left | No perceivable cause and effect | **Act → Sense → Respond** | Novel Practices | Outages, zero-day vulnerabilities, disaster recovery |
| **Confusion** | Center Ellipse | State of unknown domain / disorder | **Identify & Categorize** | Clarification | Ambiguous alerts, unclassified incidents, disputed scope |

> **Visual Feature**: Cynefin renders a signature organic wavy boundary between ordered (Clear, Complicated) and unordered (Complex, Chaotic) halves, with a distinctive "cliff" between Clear and Chaotic representing the risk of complacency leading to sudden collapse.

---

## 2. Mermaid Syntax & Structure

### A. Declaration & Title
Line 1 MUST be `cynefin-beta`:
```mermaid
cynefin-beta
title Decision Framework for Enterprise AI Platform
```

### B. Defining Domain Items
Items are quoted strings listed inside each domain block (indented with 2 spaces or placed on new lines):
```
complex
  "Conversational multi-agent workflows"
  "Novel prompt routing algorithms"

complicated
  "Distributed vector index optimization"
  "High-throughput token caching"

clear
  "Automated CI/CD smoke test run"
  "SSL certificate rotation SOP"

chaotic
  "Critical security key leakage"
  "Complete data center network blackout"

confusion
  "Unreproducible intermittent latency spike"
```

### C. Transitions Between Domains
Transitions represent the movement or evolution of challenges over time using `-->` and optional quoted labels:
```
complex --> complicated : "Pattern identified"
complicated --> clear : "Codified into standard runbook"
clear --> chaotic : "Complacency"
chaotic --> complex : "Stabilized & controlled"
```

---

## 3. Canonical Examples

### Example 1: Software Engineering & Incident Management
```mermaid
cynefin-beta
title Incident Response & Engineering Decisions

complex
  "Microservices cascading failures"
  "User behavioral anomaly"

complicated
  "Database deadlock debugging"
  "PCI-DSS compliance audit"

clear
  "Routine server patch application"
  "Automated password reset"

chaotic
  "Live ransomware attack"
  "Production primary database loss"

confusion
  "Uncategorized anomaly alert"

complex --> complicated : "Root cause pattern identified"
complicated --> clear : "Codified to automated runbook"
clear --> chaotic : "Complacency / Ignored warnings"
chaotic --> complex : "Emergency containment established"
```

### Example 2: Product Strategy & Organization
```mermaid
cynefin-beta
title Product Innovation & Strategy

complex
  "Exploring generative AI UX models"
  "Customer retention experiments"

complicated
  "Billing integration with Stripe"
  "Multi-region data replication"

clear
  "Standard user signup flow"
  "Help center knowledge base"

chaotic
  "Sudden regulatory ban"
  "Competitor surprise hostile pivot"

complex --> complicated : "Feature-market fit proven"
clear --> chaotic : "Technical debt collapse"
```

---

## 4. Best Practices
1. **Concise Items**: Keep item strings punchy (3 to 7 words). Long walls of text clutter the quadrant canvas.
2. **Balanced Domain Distribution**: Place 1 to 4 items in the quadrant domains (`complex`, `complicated`, `clear`, `chaotic`).
3. **Sparse Confusion Center**: The central Confusion ellipse is designed for 0 to 2 items representing unresolved ambiguity.
4. **Meaningful Transitions**: Include 2 to 4 key transitions showing dynamics (e.g. innovation moving from Complex to Complicated to Clear, or complacency slipping from Clear to Chaotic).

---

## 5. CRITICAL Anti-Patterns — NEVER DO THESE
1. **NEVER use `flowchart LR` or `flowchart TB` or subgraphs for Cynefin diagrams**. Always use native `cynefin-beta`.
2. **NEVER use custom node IDs or bracket shapes** like `C1["..."]` or `subgraph CLEAR ... end`.
3. **NEVER output long wall-of-text paragraphs inside items**. Use short, descriptive quoted labels.
4. **ONLY use the 5 official domain keywords**: `complex`, `complicated`, `clear`, `chaotic`, `confusion`.
