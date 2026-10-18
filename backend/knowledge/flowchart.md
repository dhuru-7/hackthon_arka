# Flowchart Rules & Standards for Mermaid JS (Mermaid v12+)

## Syntax
- Always start with `flowchart TD` (top-down) or `flowchart LR` (left-right).
- Use `TD` for vertical flows, `LR` for horizontal flows.
- **Mermaid 12 Layout Engine**: In Mermaid 12, **ELK (Eclipse Layout Kernel)** is bundled directly and is the default layout engine (`layout: elk`), providing orthogonal edge routing, line hops, and straightened arrows with zero node overlaps. Legacy layout can be set via `%%{init: {"layout": "dagre"}}%%` or `flowchart-elk` header.
- **Mermaid 12 Look Options**: Supports `%%{init: {"look": "neo"}}%%` (elevated modern aesthetic), `%%{init: {"look": "handDrawn"}}%%` (rough sketch style), and `%%{init: {"look": "classic"}}%%`.
- **STRICT CODE-ONLY RULE**: The response must contain ONLY the raw Mermaid diagram syntax. Do NOT wrap the diagram in markdown code block fences (e.g., do not use ` ```mermaid ` or ` ``` `). Do NOT include any introductory text, concluding remarks, explanations, conversational comments, or warnings.

## Node Shape Standards & Semantic Guidelines

> **CRITICAL RULE — AVOID ALL-RECTANGLE MONOTONY**:
> Never generate a flowchart consisting solely of plain rectangular boxes `[text]`. A diagram where every node is a rectangle is unreadable and poor visual design. You **MUST** select the appropriate semantic shape that matches the real-world function of each node.

### 1. Shape Selection Rules & When to Use
- **Stadium / Pill** `([ "Text" ])` → **Start / Finish / Terminal Points**:
  - Use for the entry point (e.g. `([Start])`, `([User Lands on Page])`) and terminal endpoints (e.g. `([Completed])`, `([Exit])`).
- **Cloud** `id@{ shape: cloud, label: "External Cloud / 3rd-Party API" }` → **Cloud & External Services**:
  - Use whenever interacting with the Internet, cloud providers (AWS, GCP, Azure, Cloudflare), external APIs (Stripe, OpenAI, Twilio), or external SaaS systems.
- **Cylinder** `[( "Database / Storage" )]` → **Databases & Persistent Storage**:
  - Use for SQL/NoSQL databases, persistent data stores, disk files, Redis caches, or data warehouses.
- **Diamond / Rhombus** `{ "Decision / Check?" }` → **Decisions & Branching**:
  - Use for questions, conditionals, validation checks, status switches, or boolean branches (Yes/No, Approved/Rejected).
- **Parallelogram** `[/ "User Input / Form Submission" /]` → **Data Inputs**:
  - Use when the user enters input, uploads a file, submits a form, or when raw data enters the system.
- **Inverted Parallelogram** `[\ "Display Result / Render UI" \]` → **Data Outputs**:
  - Use when the system produces output, generates a report, or displays a screen/view.
- **Hexagon** `{{ "Preparation / Auth Check / Worker Loop" }}` → **Setup & Validation Routines**:
  - Use for authentication middleware, session initialization, batch looping, or scheduled cron routines.
- **Subroutine / Double-Border Box** `[[ "Sub-process / Module / Microservice" ]]` → **Predefined Processes**:
  - Use for reusable business logic, external sub-pipelines, microservice calls, or dedicated subroutines.
- **Asymmetric Flag** `> "Event / Alert / Webhook Trigger" ]` → **Events & Notifications**:
  - Use for incoming webhooks, message triggers, push alerts, or asynchronous events.
- **Document** `id@{ shape: doc, label: "PDF / Exported File / Report" }` → **Documents & Files**:
  - Use for exported invoices, contracts, log files, certificates, or downloadable documents.
- **Circle** `(( "Checkpoint / Step" ))` → **Junctions & Milestones**:
  - Use for milestone markers, connection points, or state merges.
- **Double Circle** `((( "Major Milestone / Target" )))` → **Critical Endpoints**:
  - Use for the primary high-value business objective or target goal.
- **Rectangle** `[ "Action Step" ]` → **Generic Actions**:
  - Use ONLY for generic internal computations or transformation steps where no specific shape above applies.

### 2. Strict Node ID Rules
- **Every node MUST have an explicit, alphanumeric node ID** preceding its shape definition (e.g. `startNode([Start])` or `checkAuth{Authenticated?}`).
- NEVER output bare shapes without an ID (e.g. do not write `([Start])` alone).
- Node IDs must be contiguous alphanumeric strings (e.g. `startNode`, `dbStore`, `apiCloud`). NEVER use spaces, hyphens, or keywords like `end`.
- ALWAYS double-quote the text inside shapes (e.g. `db[("PostgreSQL Orders")]`) to prevent syntax crashes from commas, colons, or apostrophes.
- **NEVER ATTACH `:::class` TO `@{ shape: ... }`**: Mermaid's `@{ ... }` shape syntax cannot take `:::class` directly after `}`. To style a shape-directive node, write `class nodeId className;` on a separate line.
- **NO STRAY PERIODS BEFORE CLASS**: Write `node[("DB")]:::class`, NEVER `node[("DB")].:::class`.
- **BALANCED SHAPE DELIMITERS**: Always use valid shape delimiters like `(["Stadium"])`, `(("Circle"))`, or `[["Subroutine"]]`. NEVER invent reversed brackets like `))text((`.

## Edge/Arrow Standards
- `-->` Solid arrow (standard sequential flow)
- `-.->` Dotted arrow (optional / asynchronous flow / event notification)
- `==>` Thick arrow (primary / critical happy path)
- `-->|label|` Labeled arrow (conditional branch label, e.g. `-->|Yes|`, `-->|Rejected|`)
- `---` Line without arrow (association)

## Semantic Node Coloring Rules
Color should represent semantics, not aesthetics. Use a consistent, low-saturation palette across all generated flowcharts. Do not color nodes arbitrarily or alternate colors just for visual appeal.

### Color Mapping Palette
- **Green** (Start, End, Success, Completion): Soft green fill, darker green border.
  - Class definition: `classDef greenNode fill:#e2f0d9,stroke:#385723,color:#000000;`
- **Blue** (Process, Action, Operation): Soft blue fill, darker blue border.
  - Class definition: `classDef blueNode fill:#ddebf7,stroke:#1f4e78,color:#000000;`
- **Yellow/Cream** (Decision points): Pale yellow/cream fill, gold/brown border.
  - Class definition: `classDef yellowNode fill:#fff2cc,stroke:#7f6000,color:#000000;`
- **Red** (Errors, Failures, Rollbacks, Cancellations, Escalations, Warnings): Soft red fill, darker red border.
  - Class definition: `classDef redNode fill:#fce4d6,stroke:#c65911,color:#000000;`
- **Gold/Purple** (Logging, Storage, External Services): Soft gold or purple fill.
  - Class definition: `classDef goldNode fill:#fff2cc,stroke:#d68a00,color:#000000;`
  - Class definition: `classDef purpleNode fill:#f3e8ff,stroke:#7e22ce,color:#000000;`

### Coloring Best Practices
1. **Low Saturation**: Always use muted, pastel colors (avoid neon, bright red, pure yellow, or bright blue) to maintain high readability.
2. **Borders & Fill**: Ensure borders are slightly darker than the fill (as defined in the classes above).
3. **Monochrome Arrows**: Keep connectors and arrowheads monochrome (black or dark gray). Do not style arrows with colors.
4. **Neutral Labels**: Decision labels (e.g., `Yes`, `No`, `Success`, `Failure` on arrows) must remain neutral (black/dark gray).
5. **Palette Limit**: Limit the palette to 4–6 semantic colors in a single diagram.
6. **Consistent Scanning**: Colors should improve visual scanning: follow the "happy path" (mostly blue/green), spot decisions (yellow), failures (red), and storage/external (gold/purple).

## Best Practices
1. Every flowchart MUST have a clear Start and End node.
2. Always label decision branches clearly (e.g., `-->|Yes|`, `-->|No|`).
3. **CRITICAL SYNTAX**: ALWAYS double-quote the text inside shapes to avoid parser crashes from commas/colons/apostrophes. Example: `A["User's Data, List"]`.
4. **NO MULTIPLE ARROWS**: Never draw multiple arrows extending in the exact same direction between two identical nodes.
5. **RESERVED KEYWORDS**: NEVER use the word `end` as a node ID (e.g., `end[Finish]`). This is a reserved Mermaid keyword for subgraphs and will crash the renderer. Use `finish`, `done`, or `endNode` instead.
6. **SIMPLICITY FIRST**: For basic prompts, aim for 6–12 well-structured nodes. Do not create unreadable massive wall-of-text charts.
7. **EDGE STYLING SYNTAX**: To style nodes, define classes via `classDef myClass fill:#HEX` and apply them as `nodeId:::myClass`.

## Production Example Demonstrating Diverse Shapes
```mermaid
flowchart TD
    startNode([ "User Submits Checkout Request" ]):::greenNode
    userInput[/ "Payment & Shipping Details" /]:::[blueNode]
    checkAuth{{ "Validate Active Session & Token" }}:::blueNode
    cloudGateway@{ shape: cloud, label: "Stripe Payment Cloud API" }:::purpleNode
    isPaid{ "Payment Approved?" }:::yellowNode
    dbStore[( "PostgreSQL Orders DB" )]:::goldNode
    invoiceDoc@{ shape: doc, label: "Tax Invoice PDF" }:::blueNode
    alertWebhook> "Send Fulfillment Webhook" ]:::blueNode
    errNotify[ "Display Error Message" ]:::redNode
    doneNode([ "Order Completed Successfully" ]):::greenNode

    startNode --> userInput
    userInput --> checkAuth
    checkAuth --> cloudGateway
    cloudGateway --> isPaid
    isPaid -->|Yes| dbStore
    isPaid -->|No| errNotify
    errNotify --> userInput
    dbStore --> invoiceDoc
    dbStore --> alertWebhook
    invoiceDoc --> doneNode
    alertWebhook --> doneNode

    classDef greenNode fill:#e2f0d9,stroke:#385723,color:#000000;
    classDef blueNode fill:#ddebf7,stroke:#1f4e78,color:#000000;
    classDef yellowNode fill:#fff2cc,stroke:#7f6000,color:#000000;
    classDef redNode fill:#fce4d6,stroke:#c65911,color:#000000;
    classDef goldNode fill:#fff2cc,stroke:#d68a00,color:#000000;
    classDef purpleNode fill:#f3e8ff,stroke:#7e22ce,color:#000000;
```

## Common Patterns
- **Linear Flow**: start → step1 → step2 → end
- **Decision Branch**: step → decision → yes_path / no_path → merge → continue
- **Loop**: step → check → (back to step if condition)
- **Parallel**: step → fork → path1 & path2 → join → continue

## Generation Order & Syntax Integrity
To ensure the highest quality rendering and avoid LLM syntax hallucinations, the generation must strictly adhere to the following guidelines:

### 1. Fixed Generation Order
Always generate the Mermaid document in this exact order:
1. Flowchart declaration (e.g., `flowchart TD`)
2. Node definitions
3. Edge/connection definitions
4. Subgraph blocks (if any)
5. Individual style commands (if any)
6. Class assignments (e.g., `class A greenNode`)
7. ClassDef definitions (always at the very end)
Never interleave these sections.

### 2. Syntax Completeness & Token Budget Awareness
- **Never Truncate Output**: Ensure the generated Mermaid code is complete. Never end the output in the middle of a node, edge, classDef, style, or subgraph. Before finishing generation, verify that every opened statement is fully closed.
- **Budget Awareness**: If the diagram approaches the maximum output length, simplify labels or merge repeated nodes instead of truncating the Mermaid code.
- **Never Generate Empty/Incomplete Statements**: Every style, classDef, linkStyle, or node declaration must be syntactically complete. Do not emit dangling or empty declarations (e.g., `classDef redNode fill:` or `style A`).

### 3. Declaration Uniqueness & Deduplication
- **Single classDef Rule**: Each classDef must be declared exactly once. Never redefine the same classDef multiple times (e.g. infinite duplicate declarations of `classDef redNode`). If a class already exists, reuse it.
- **Single Style & Identifier Rule**: A Mermaid identifier (classDef, subgraph name, style name) may only be declared once. Duplicate class definitions or style statements are forbidden.
- **Detect Runaway Repetition**: Detect repeated consecutive Mermaid statements. If an identical statement has already been emitted, do not emit it again.

### 4. Node & Label Design Guidelines
- **One Responsibility Per Node**: Break up long operations into sequential nodes (e.g., instead of one node doing `Reset Attempts, Generate Session, and Redirect`, use three separate nodes connected sequentially).
- **Label Length**: Limit node labels to approximately 3–8 words.
- **Label Escaping & Quotes**: Avoid unnecessary quotation marks inside node labels; prefer plain text labels whenever possible. However, if special characters like commas, colons, or apostrophes are present, double-quote the text to avoid parser crashes (e.g. `A["User's Data, List"]`).
- **Fixed Class Name Vocabulary**: Only use these exact class names for semantic coloring: `greenNode`, `blueNode`, `yellowNode`, `redNode`, `purpleNode`, `grayNode`, `goldNode`. Do not hallucinate variations like `greenNodes`, `green_node`, or `GreenNode`.
- **No Orphan Classes**: Never apply a class assignment (e.g., `class A greenNode` or `A:::greenNode`) without defining the corresponding `classDef` at the end of the file.

## Post-Generation Validation & Cleanup
Before returning the final Mermaid code, perform a rigorous self-linting/validation pass:

### Validation Checklist:
1. **Completion Check**: Verify that the Mermaid code is fully complete and did not end abruptly or get truncated.
2. **Node Reference Check**: Ensure every edge (e.g., `A --> B`) references nodes (`A` and `B`) that exist.
3. **No Duplicate Definitions**: Verify that `classDef` definitions, `style` statements, and duplicate lines are entirely removed/deduplicated.
4. **Subgraph Closure Check**: Verify that all opened subgraphs have a matching `end` keyword.
5. **No Reserved Keywords**: Check that no node ID uses the reserved keyword `end`.
6. **No Inline Edge Styling**: Check that edges are styled correctly (via `linkStyle` if needed) and not with incorrect inline styling.
7. **Render Readiness**: Confirm that the final Mermaid code compiles cleanly without parse errors.
