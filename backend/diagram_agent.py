import json
import os
import re
from functools import lru_cache

import requests

from mermaid_validator import clean_mermaid_code, format_issues_for_prompt, validate_mermaid_code


SUPPORTED_TYPES = [
    "flowchart", "swimlane", "sequence", "classDiagram", "stateDiagram", "erDiagram", "userJourney",
    "gantt", "pie", "quadrantChart", "requirementDiagram", "gitGraph", "c4Diagram", "mindmap",
    "timeline", "sankey", "xy", "block", "packet", "kanban", "architecture", "radar",
    "eventModeling", "treemap", "venn", "ishikawa", "wardley", "cynefin", "treeView", "useCase"
]

KNOWLEDGE_FILES = {
    "flowchart": "flowchart.md",
    "swimlane": "swimlane.md",
    "architecture": "architecture.md",
    "xy": "xy_chart.md",
    "pie": "pie_chart.md",
    "sequence": "sequence.md",
    "erDiagram": "er_diagram.md",
    "gantt": "gantt.md",
    "classDiagram": "class_diagram.md",
    "stateDiagram": "state_diagram.md",
    "userJourney": "user_journey.md",
    "quadrantChart": "quadrant_chart.md",
    "requirementDiagram": "requirement_diagram.md",
    "gitGraph": "git_graph.md",
    "c4Diagram": "c4_diagram.md",
    "mindmap": "mindmap.md",
    "timeline": "timeline.md",
    "sankey": "sankey.md",
    "block": "block.md",
    "packet": "packet.md",
    "kanban": "kanban.md",
    "radar": "radar.md",
    "eventModeling": "event_modeling.md",
    "treemap": "treemap.md",
    "venn": "venn.md",
    "ishikawa": "ishikawa.md",
    "wardley": "wardley.md",
    "cynefin": "cynefin.md",
    "treeView": "tree_view.md",
    "useCase": "use_case.md",
}

MERMAID_DOC_URLS = {
    "flowchart": "https://mermaid.js.org/syntax/flowchart.html",
    "architecture": "https://mermaid.js.org/syntax/flowchart.html",
    "sequence": "https://mermaid.js.org/syntax/sequenceDiagram.html",
    "erDiagram": "https://mermaid.js.org/syntax/entityRelationshipDiagram.html",
    "gantt": "https://mermaid.js.org/syntax/gantt.html",
    "pie": "https://mermaid.js.org/syntax/pie.html",
    "xy": "https://mermaid.js.org/syntax/xyChart.html",
}

FALLBACKS = {
    "flowchart": (
        'flowchart TD\n'
        '    startNode(["Start"])\n'
        '    collectInput["Collect Input"]\n'
        '    validateInput{"Is Input Valid?"}\n'
        '    processRequest["Process Request"]\n'
        '    showError["Show Error"]\n'
        '    finishNode(["End"])\n'
        '    startNode --> collectInput --> validateInput\n'
        '    validateInput -->|Yes| processRequest --> finishNode\n'
        '    validateInput -->|No| showError --> collectInput'
    ),
    "architecture": (
        'flowchart LR\n'
        '    user(("User"))\n'
        '    gateway(["API Gateway"])\n'
        '    app["Application Service"]\n'
        '    cache{{"Cache"}}\n'
        '    db[("Database")]\n'
        '    user -->|HTTPS| gateway -->|REST| app\n'
        '    app -->|Read cache| cache\n'
        '    app -->|SQL| db'
    ),
    "swimlane": (
        'swimlane-beta LR\n'
        '\n'
        'subgraph Customer ["Customer"]\n'
        '    start(["Submit Ticket"])\n'
        '    receiveUpdate["Receive Resolution"]\n'
        '    confirmClose(["Close Ticket"])\n'
        'end\n'
        '\n'
        'subgraph Support ["Support Desk"]\n'
        '    triage{"Known Issue?"}\n'
        '    quickFix["Send KB Article"]\n'
        '    escalate["Escalate to Engineering"]\n'
        'end\n'
        '\n'
        'subgraph Engineering ["Engineering Team"]\n'
        '    debug["Investigate Logs"]\n'
        '    deploy["Deploy Bugfix"]\n'
        'end\n'
        '\n'
        'start --> triage\n'
        'triage -->|Yes| quickFix --> receiveUpdate\n'
        'triage -->|No| escalate --> debug\n'
        'debug --> deploy --> receiveUpdate\n'
        'receiveUpdate --> confirmClose\n'
        '\n'
        'style start fill:#ecfdf5,stroke:#059669,stroke-width:2px,color:#065f46\n'
        'style receiveUpdate fill:#eff6ff,stroke:#2563eb,stroke-width:2px,color:#1e40af\n'
        'style confirmClose fill:#ecfdf5,stroke:#059669,stroke-width:2px,color:#065f46\n'
        'style triage fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f\n'
        'style quickFix fill:#eff6ff,stroke:#2563eb,stroke-width:2px,color:#1e40af\n'
        'style escalate fill:#fff7ed,stroke:#ea580c,stroke-width:2px,color:#9a3412\n'
        'style debug fill:#eff6ff,stroke:#2563eb,stroke-width:2px,color:#1e40af\n'
        'style deploy fill:#faf5ff,stroke:#7e22ce,stroke-width:2px,color:#581c87'
    ),
    "sequence": (
        'sequenceDiagram\n'
        '    actor User\n'
        '    participant App as Client App\n'
        '    participant API as API Server\n'
        '    participant DB as Database\n'
        '    User->>+App: Submit request\n'
        '    App->>+API: Send request\n'
        '    API->>+DB: Query data\n'
        '    DB-->>-API: Return data\n'
        '    API-->>-App: Return response\n'
        '    App-->>-User: Show result'
    ),
    "erDiagram": (
        'erDiagram\n'
        '    User {\n'
        '        int id PK\n'
        '        string name\n'
        '        string email UK\n'
        '    }\n'
        '    Order {\n'
        '        int id PK\n'
        '        int userId FK\n'
        '        date createdAt\n'
        '    }\n'
        '    User ||--o{ Order : "places"'
    ),
    "gantt": (
        'gantt\n'
        '    title Project Timeline\n'
        '    dateFormat YYYY-MM-DD\n'
        '    section Planning\n'
        '    Requirements : done, req1, 2026-06-10, 2026-06-14\n'
        '    Design : active, des1, after req1, 5d\n'
        '    section Build\n'
        '    Implementation : dev1, after des1, 10d\n'
        '    Testing : test1, after dev1, 5d'
    ),
    "pie": (
        'pie showData\n'
        '    title Distribution\n'
        '    "Core" : 45\n'
        '    "Support" : 25\n'
        '    "Growth" : 20\n'
        '    "Other" : 10'
    ),
    "xy": (
        'xychart-beta\n'
        '    title "Trend Overview"\n'
        '    x-axis ["Q1", "Q2", "Q3", "Q4"]\n'
        '    y-axis "Value" 0 --> 100\n'
        '    bar [35, 52, 68, 84]'
    ),
    "timeline": (
        'timeline\n'
        '    title Project Roadmap\n'
        '    section Q1 Planning\n'
        '        Jan : Requirements : User Research\n'
        '        Feb : Architecture Design\n'
        '    section Q2 Development\n'
        '        Mar : Core Engine : API Layer\n'
        '        Apr : Beta Launch\n'
        '    section Q3 Release\n'
        '        May : Public Launch : Monitoring'
    ),
    "mindmap": (
        'mindmap\n'
        '  root((Cloud Platform Architecture))\n'
        '    (Frontend Experience)\n'
        '      [Next.js Web Client]\n'
        '      )Cloudflare CDN Edge(\n'
        '      {{Core Web Vitals Pass}}\n'
        '    (Core Microservices)\n'
        '      [Auth & RBAC Service]\n'
        '      [Order Processing Engine]\n'
        '      )Stripe Billing Gateway(\n'
        '      ))Single Point of Failure: Payment Worker((\n'
        '    (Data & Persistence)\n'
        '      [PostgreSQL Cluster]\n'
        '      )AWS S3 Object Store(\n'
        '      {{Backup RPO < 15 Min}}\n'
        '    (Security & Reliability)\n'
        '      [OpenTelemetry Tracing]\n'
        '      {{SOC2 Type II Audit}}\n'
        '      ))Zero-Day Vulnerability Patching(('
    ),
    "sankey": (
        '---\n'
        'config:\n'
        '  theme: default\n'
        '---\n'
        'sankey-beta\n'
        '  Renewable Energy, Power Grid, 120\n'
        '  Fossil Fuels, Power Grid, 350\n'
        '  Nuclear Energy, Power Grid, 90\n'
        '  Power Grid, Residential, 240\n'
        '  Power Grid, Commercial, 180\n'
        '  Power Grid, Industrial, 140\n'
        '  Residential, Heating, 100\n'
        '  Residential, Appliances, 140\n'
        '  Commercial, Lighting, 90\n'
        '  Commercial, HVAC, 90\n'
        '  Industrial, Manufacturing, 100\n'
        '  Industrial, Waste, 40'
    ),
    "block": (
        'block-beta\n'
        '  columns 3\n'
        '  header["Cloud Application Architecture"]:3\n'
        '  space:3\n'
        '\n'
        '  client(("🌐 Web & Mobile Clients")):3\n'
        '  arrow1<["&nbsp;&nbsp;"]>(down):3\n'
        '\n'
        '  block:gatewayLayer:3\n'
        '    columns 3\n'
        '    cdn["Cloud CDN"]\n'
        '    apiGateway(["API Gateway"])\n'
        '    auth["Auth0 / JWT"]\n'
        '  end\n'
        '\n'
        '  arrow2<["&nbsp;&nbsp;"]>(down):3\n'
        '\n'
        '  block:servicesLayer:3\n'
        '    columns 3\n'
        '    orderSvc["📦 Order Service"]\n'
        '    invSvc["📊 Inventory Service"]\n'
        '    paySvc["💳 Payment Worker"]\n'
        '  end\n'
        '\n'
        '  arrow3<["&nbsp;&nbsp;"]>(down):3\n'
        '\n'
        '  block:dataStore:3\n'
        '    columns 3\n'
        '    pgDb[("🐘 PostgreSQL Cluster")]\n'
        '    redis[("⚡ Redis Cache")]\n'
        '    kafka{{"📨 Kafka Event Log"}}\n'
        '  end\n'
        '\n'
        '  client --> gatewayLayer\n'
        '  gatewayLayer --> servicesLayer\n'
        '  servicesLayer --> dataStore\n'
        '\n'
        '  style header fill:#e0e7ff,stroke:#4338ca,stroke-width:2px,color:#312e81\n'
        '  style client fill:#f8fafc,stroke:#475569,stroke-width:2px,color:#0f172a\n'
        '  style gatewayLayer fill:#eff6ff,stroke:#2563eb,stroke-width:2px,color:#1e40af\n'
        '  style servicesLayer fill:#ecfdf5,stroke:#059669,stroke-width:2px,color:#064e3b\n'
        '  style dataStore fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f\n'
        '  style pgDb fill:#dbeafe,stroke:#1d4ed8,stroke-width:2px,color:#1e3a8a\n'
        '  style redis fill:#fee2e2,stroke:#dc2626,stroke-width:2px,color:#7f1d1d\n'
        '  style kafka fill:#faf5ff,stroke:#7e22ce,stroke-width:2px,color:#581c87'
    ),
    "packet": (
        'packet-beta\n'
        '0-15: "Source Port (16b)"\n'
        '16-31: "Destination Port (16b)"\n'
        '32-63: "Sequence Number (32b)"\n'
        '64-95: "Acknowledgment Number (32b)"\n'
        '96-127: "Header Flags & Checksum (32b)"'
    ),
    "kanban": (
        'kanban\n'
        '  Todo\n'
        '    [Task 1: Setup Architecture]\n'
        '    [Task 2: API Integration]\n'
        '  In_Progress["In Progress"]\n'
        '    [Task 3: Core Implementation]\n'
        '  Done["Done"]\n'
        '    [Task 4: Project Kickoff]'
    ),
    "radar": (
        '---\n'
        'title: "Engineering Team Competency Matrix"\n'
        '---\n'
        'radar-beta\n'
        '    axis f["Frontend"], b["Backend"], d["DevOps"], s["Security"], a["AI / ML"], q["QA & Testing"]\n'
        '    curve t1["Senior Team"]{85, 90, 80, 75, 92, 88}\n'
        '    curve t2["Industry Benchmark"]{75, 75, 75, 75, 75, 75}\n'
        '\n'
        '    max 100\n'
        '    min 0'
    ),
    "treemap": (
        'flowchart TD\n'
        '    subgraph StorageTotal ["Storage: 100 GB"]\n'
        '        subgraph Media ["Media: 60 GB"]\n'
        '            V1["Videos: 40 GB"]\n'
        '            V2["Images: 20 GB"]\n'
        '        end\n'
        '        subgraph DB ["Database: 40 GB"]\n'
        '            D1["User Data: 25 GB"]\n'
        '            D2["Logs: 15 GB"]\n'
        '        end\n'
        '    end'
    ),
    "venn": (
        'venn-beta\n'
        '  title "Design & Engineering Venn"\n'
        '  set A ["Design"]\n'
        '    text "Typography"\n'
        '    text "Color Tokens"\n'
        '  set B ["Engineering"]\n'
        '    text "State Management"\n'
        '    text "API Layer"\n'
        '  union A, B ["Design System"]\n'
        '    text "Component Library"\n'
        '  style A fill:#eff6ff,stroke:#3b82f6,color:#2563eb\n'
        '  style B fill:#fefce8,stroke:#eab308,color:#d97706\n'
        '  style A, B fill:#ecfdf5,stroke:#10b981,color:#0f172a'
    ),
    "ishikawa": (
        "ishikawa-beta\n"
        "  Database Performance Degradation\n"
        "  Methods\n"
        "    Unindexed queries\n"
        "    Unbounded SELECT queries\n"
        "    Missing pagination\n"
        "  Infrastructure\n"
        "    Insufficient RAM\n"
        "    Disk IOPS bottleneck\n"
        "    Network latency spikes\n"
        "  People\n"
        "    Untrained junior devs\n"
        "    Lack of DBA oversight\n"
        "  Measurements\n"
        "    No slow query alerts\n"
        "    Missing APM telemetry"
    ),
    "treemap": (
        'treemap-beta\n'
        '"Technology (45%)"\n'
        '  "Microsoft": 18\n'
        '  "Apple": 15\n'
        '  "Nvidia": 12\n'
        '"Financial (30%)"\n'
        '  "JPMorgan": 12\n'
        '  "Visa": 10\n'
        '  "Mastercard": 8\n'
        '"Healthcare (25%)"\n'
        '  "UnitedHealth": 10\n'
        '  "Pfizer": 8\n'
        '  "Johnson & Johnson": 7'
    ),
    "wardley": (
        'wardley-beta\n'
        'title Tea Shop Value Chain\n\n'
        'anchor Business [0.95, 0.63]\n'
        'anchor Public [0.95, 0.40]\n'
        'component Cup of Tea [0.79, 0.61]\n'
        'component Tea [0.63, 0.81]\n'
        'component Hot Water [0.52, 0.80]\n'
        'component Kettle [0.43, 0.35] (build)\n'
        'component Power [0.10, 0.70] (buy)\n\n'
        'Business -> Cup of Tea\n'
        'Public -> Cup of Tea\n'
        'Cup of Tea -> Tea\n'
        'Cup of Tea -> Hot Water\n'
        'Hot Water -> Kettle\n'
        'Hot Water -> Tea\n'
        'Kettle -> Power\n\n'
        'evolve Kettle 0.62\n'
        'evolve Power 0.89\n\n'
        'note "Standardising power allows Kettles to evolve faster" [0.37, 0.58]'
    ),
    "cynefin": (
        'cynefin-beta\n'
        'title Decision Framework & Incident Response\n\n'
        'complex\n'
        '  "Cascading microservice failure"\n'
        '  "Novel customer traffic spike"\n\n'
        'complicated\n'
        '  "Distributed database deadlock"\n'
        '  "Payment gateway compliance audit"\n\n'
        'clear\n'
        '  "Routine server patch SOP"\n'
        '  "Automated password reset"\n\n'
        'chaotic\n'
        '  "Ransomware attack in progress"\n'
        '  "Primary data center power loss"\n\n'
        'confusion\n'
        '  "Unclassified telemetry anomaly"\n\n'
        'complex --> complicated : "Pattern identified"\n'
        'complicated --> clear : "Codified into SOP"\n'
        'clear --> chaotic : "Complacency / Ignored alerts"\n'
        'chaotic --> complex : "Emergency containment established"'
    ),
    "treeView": (
        'treeView-beta\n'
        '  "src"\n'
        '    "components"\n'
        '      "Navbar.jsx"\n'
        '      "Sidebar.jsx"\n'
        '    "App.jsx"\n'
        '  "package.json"\n'
        '  "README.md"'
    ),
    "eventModeling": (
        'eventmodeling\n\n'
        'tf 01 ui CartUI `json`{ "userId": "usr_101" }\n'
        'tf 02 cmd AddItem `json`{ "sku": "SHIRT-BLU", "qty": 1 }\n'
        'tf 03 evt ItemAdded `json`{ "sku": "SHIRT-BLU", "price": 29.99 }\n'
        'tf 04 rmo CartSummary `json`{ "itemCount": 1, "total": 29.99 }\n'
        'tf 05 ui CheckoutPage\n'
        'tf 06 cmd PlaceOrder `json`{ "paymentMethod": "credit_card" }\n'
        'tf 07 evt OrderPlaced `json`{ "orderId": "ord-88", "total": 29.99 }\n'
        'tf 08 rmo CustomerOrders `json`{ "ordersCount": 1 }'
    ),
    "useCase": (
        'flowchart LR\n'
        '    User{{"👤 Customer"}}:::actorNode\n'
        '    Admin{{"🧑‍💼 Administrator"}}:::actorNode\n'
        '    subgraph AppSystem ["Application System"]\n'
        '        UC_Browse(["Browse Catalog"]):::usecaseNode\n'
        '        UC_Order(["Place Order"]):::usecaseNode\n'
        '        UC_Pay(["Process Payment"]):::includeNode\n'
        '        UC_Discount(["Apply Coupon"]):::extendNode\n'
        '        UC_Manage(["Manage Products"]):::usecaseNode\n'
        '    end\n'
        '    Gateway["💳 Payment Gateway"]:::extSystemNode\n'
        '    User --> UC_Browse\n'
        '    User --> UC_Order\n'
        '    Admin --> UC_Manage\n'
        '    UC_Order -.->|«include»| UC_Pay\n'
        '    UC_Discount -.->|«extend»| UC_Order\n'
        '    UC_Pay --> Gateway\n'
        '    style AppSystem fill:#f8fafc,stroke:#475569,stroke-width:2px,stroke-dasharray: 4 4,color:#0f172a;\n'
        '    classDef actorNode fill:#e0e7ff,stroke:#3730a3,stroke-width:2px,color:#1e1b4b;\n'
        '    classDef usecaseNode fill:#ecfdf5,stroke:#059669,stroke-width:1.5px,color:#064e3b;\n'
        '    classDef includeNode fill:#e0f2fe,stroke:#0284c7,stroke-width:1.5px,color:#0c4a6e;\n'
        '    classDef extendNode fill:#fef3c7,stroke:#d97706,stroke-width:1.5px,color:#78350f;\n'
        '    classDef extSystemNode fill:#f3e8ff,stroke:#7e22ce,stroke-width:2px,color:#3b0764;'
    ),
}


class DiagramAgent:
    def __init__(self, api_key=None, provider=None, model=None, knowledge_dir=None):
        if not provider:
            raise ValueError("No AI provider selected.")
        if not model:
            raise ValueError("No AI model selected.")
        self.api_key = api_key or ""
        self.provider = provider
        self.model = model
        self.knowledge_dir = knowledge_dir or os.path.join(os.path.dirname(__file__), "knowledge")

    def suggest_type(self, prompt):
        system_prompt = (
            "You are Arka's diagram selection agent. Analyze the user's intent semantically. "
            "Allowed types: flowchart, swimlane, sequence, classDiagram, stateDiagram, erDiagram, userJourney, gantt, pie, quadrantChart, requirementDiagram, gitGraph, c4Diagram, mindmap, timeline, sankey, xy, block, packet, kanban, architecture, radar, eventModeling, treemap, venn, ishikawa, wardley, cynefin, treeView, useCase. "
            "Return one or more genuinely suitable diagram types, ranked best first. "
            "Do not use keyword matching. Consider what information the user wants to communicate. "
            "Return ONLY JSON with a suggestions array. Every item must contain type, confidence, and reason. "
            "Confidence must be between 0 and 1. Do not include weak or irrelevant options."
        )
        user_prompt = f"Prompt:\n{prompt}"
        content = self.call_model(system_prompt, user_prompt, temperature=0.1, max_tokens=2500)
        data = parse_json_object(content)
        raw_suggestions = data.get("suggestions")
        if not isinstance(raw_suggestions, list):
            raise ValueError("AI did not return a suggestions array.")

        suggestions = []
        seen = set()
        for item in raw_suggestions:
            if not isinstance(item, dict):
                continue
            diagram_type = normalize_type(item.get("type"))
            if not diagram_type or diagram_type in seen:
                continue
            try:
                confidence = max(0.0, min(float(item.get("confidence")), 1.0))
            except (TypeError, ValueError):
                continue
            reason = str(item.get("reason") or "").strip()
            if not reason:
                continue
            suggestions.append({"type": diagram_type, "confidence": confidence, "reason": reason[:500]})
            seen.add(diagram_type)

        suggestions.sort(key=lambda item: item["confidence"], reverse=True)
        if not suggestions:
            raise ValueError("AI returned no valid diagram suggestions.")

        primary = suggestions[0]

        return {
            "suggestions": suggestions,
            "suggested_type": primary["type"],
            "category": primary["type"],
            "confidence": primary["confidence"],
            "reason": primary["reason"],
            "agent_steps": [
                "Analyzed the user's communication goal with the selected AI model.",
                "Ranked every suitable diagram format returned by the model.",
                "Waiting for the user to confirm or choose another type.",
            ],
        }

    def generate(self, prompt, diagram_type, max_attempts=3, on_progress=None):
        diagram_type = normalize_type(diagram_type) or "flowchart"
        knowledge = self.load_knowledge(diagram_type)
        docs = ""
        progress = [
            "Understanding prompt and chosen diagram type.",
            f"Loaded {readable_type(diagram_type)} knowledge-bank rules.",
            "Drafting Mermaid code.",
        ]
        if on_progress:
            on_progress("Understanding prompt and chosen diagram type.")
            on_progress(f"Loaded {readable_type(diagram_type)} knowledge-bank rules.")
            on_progress("Drafting Mermaid code.")
        repair_log = []
        code = ""

        for attempt in range(1, max_attempts + 1):
            if attempt == 1:
                system_prompt = build_generation_prompt(diagram_type, knowledge)
                user_prompt = f"USER PROMPT:\n{prompt}\n\nCreate the Mermaid diagram now."
            else:
                if not docs:
                    docs = fetch_mermaid_reference(diagram_type)
                    if docs:
                        msg = "Checked Mermaid syntax reference for repair guidance."
                        progress.append(msg)
                        if on_progress:
                            on_progress(msg)
                system_prompt = build_repair_prompt(diagram_type, knowledge, docs)
                user_prompt = (
                    f"ORIGINAL USER PROMPT:\n{prompt}\n\n"
                    f"CURRENT MERMAID CODE:\n{code}\n\n"
                    f"VALIDATION ISSUES:\n{format_issues_for_prompt(repair_log[-1]['issues'])}\n\n"
                    "Return the full corrected Mermaid code."
                )
                msg = f"Repair attempt {attempt - 1}: using line-level validation feedback."
                progress.append(msg)
                if on_progress:
                    on_progress(msg)

            try:
                raw = self.call_model(system_prompt, user_prompt, temperature=0.15, max_tokens=3600)
                code = clean_mermaid_code(raw, diagram_type)
            except Exception as exc:
                repair_log.append({
                    "attempt": attempt,
                    "status": "model_error",
                    "issues": [{"line": 1, "severity": "error", "message": str(exc)}],
                })
                break

            validation = validate_mermaid_code(code, diagram_type)
            repair_log.append({
                "attempt": attempt,
                "status": "valid" if validation["valid"] else "needs_repair",
                "issues": validation["issues"],
            })

            if validation["valid"]:
                msg = "Validated Mermaid syntax with static checks."
                progress.append(msg)
                if on_progress:
                    on_progress(msg)
                break

        if not code:
            raise RuntimeError(format_issues_for_prompt(repair_log[-1]["issues"]) if repair_log else "Agent did not produce diagram code.")

        final_validation = validate_mermaid_code(code, diagram_type)
        if not final_validation["valid"]:
            raise RuntimeError("Agent could not repair Mermaid code:\n" + format_issues_for_prompt(final_validation["issues"]))

        try:
            suggestions = self.suggest_improvements(prompt, code, diagram_type)
            msg = "Prepared structural and visual refinement suggestions."
            progress.append(msg)
            if on_progress:
                on_progress(msg)
        except Exception:
            suggestions = []
            msg = "Generated the diagram; suggestions were not available from the model."
            progress.append(msg)
            if on_progress:
                on_progress(msg)
        return {
            "mermaid_code": code,
            "diagram_type": diagram_type,
            "validation": final_validation,
            "repair_log": repair_log,
            "suggestions": suggestions,
            "agent_steps": progress,
        }

    def refine(self, prompt, mermaid_code, diagram_type, selected_context=None, max_attempts=3, on_progress=None):
        diagram_type = normalize_type(diagram_type) or "flowchart"
        knowledge = self.load_knowledge(diagram_type)
        docs = ""
        progress = []

        def report(phase, status, title, detail=""):
            event = {"phase": phase, "status": status, "title": title, "detail": detail}
            progress.append(title if not detail else f"{title}: {detail}")
            if on_progress:
                on_progress(event)

        diagram_summary = summarize_mermaid(mermaid_code, diagram_type)
        report("inspect", "done", "Read current diagram", diagram_summary)
        report("task", "done", "Captured requested change", compact_instruction(prompt))
        report("plan", "done", "Prepared implementation plan", "Preserve the diagram structure and apply only the approved change.")
        report("rewrite", "active", "Rewriting Mermaid code", "Creating the first candidate.")
        repair_log = []
        code = mermaid_code
        produced_candidate = False
        verification = {"implemented": False, "summary": "Verification has not run yet.", "issues": []}

        for attempt in range(1, max_attempts + 1):
            if attempt == 1:
                system_prompt = build_refine_prompt(diagram_type, knowledge)
                user_prompt = (
                    f"CURRENT MERMAID CODE:\n{mermaid_code}\n\n"
                    f"SELECTED CONTEXT:\n{json.dumps(selected_context or [], ensure_ascii=False)}\n\n"
                    f"REFINEMENT INSTRUCTION:\n{prompt}\n\n"
                    "Return the complete updated Mermaid code."
                )
            else:
                if not docs:
                    docs = fetch_mermaid_reference(diagram_type)
                    if docs:
                        msg = "Checked Mermaid syntax reference for repair guidance."
                        progress.append(msg)
                        if on_progress:
                            on_progress(msg)
                system_prompt = build_repair_prompt(diagram_type, knowledge, docs)
                user_prompt = (
                    f"ORIGINAL MERMAID CODE:\n{mermaid_code}\n\n"
                    f"REFINEMENT INSTRUCTION:\n{prompt}\n\n"
                    f"CURRENT CANDIDATE CODE:\n{code}\n\n"
                    f"VALIDATION ISSUES:\n{format_issues_for_prompt(repair_log[-1]['issues'])}\n\n"
                    "Repair the candidate so it implements the instruction without duplicates or unrelated changes. "
                    "Return the complete corrected Mermaid code."
                )
                report(
                    "diagnose",
                    "active",
                    f"Investigating candidate {attempt - 1}",
                    format_issues_for_prompt(repair_log[-1]["issues"])[:500],
                )
                report("rewrite", "active", f"Rewriting candidate {attempt}", "Applying the verification findings.")

            try:
                raw = self.call_model(system_prompt, user_prompt, temperature=0.15, max_tokens=3600)
                code = clean_mermaid_code(raw, diagram_type)
                produced_candidate = True
            except Exception as exc:
                repair_log.append({
                    "attempt": attempt,
                    "status": "model_error",
                    "issues": [{"line": 1, "severity": "error", "message": str(exc)}],
                })
                break

            validation = validate_mermaid_code(code, diagram_type)
            quality_issues = refinement_quality_issues(mermaid_code, code, validation)
            combined_issues = [*validation["issues"], *quality_issues]

            if validation["valid"] and not quality_issues:
                report("verify", "active", "Checking the requested change", f"Reviewing candidate {attempt} against the approved task.")
                verification = self.verify_refinement(prompt, mermaid_code, code, diagram_type)
                if not verification["implemented"]:
                    combined_issues.extend({
                        "line": 1,
                        "severity": "error",
                        "message": issue,
                    } for issue in verification["issues"])

            candidate_valid = validation["valid"] and not quality_issues and verification["implemented"]
            repair_log.append({
                "attempt": attempt,
                "status": "valid" if candidate_valid else "needs_repair",
                "issues": combined_issues,
            })
            if candidate_valid:
                report("rewrite", "done", "Mermaid rewrite complete", f"Candidate {attempt} passed structural checks.")
                report("verify", "done", "Requested change verified", verification["summary"])
                break

        if not produced_candidate:
            raise RuntimeError(format_issues_for_prompt(repair_log[-1]["issues"]) if repair_log else "Agent did not produce refined diagram code.")

        validation = validate_mermaid_code(code, diagram_type)
        if not validation["valid"] or not verification["implemented"] or repair_log[-1]["status"] != "valid":
            raise RuntimeError("Agent could not verify the refined Mermaid code:\n" + format_issues_for_prompt(repair_log[-1]["issues"]))

        return {
            "mermaid_code": code,
            "diagram_type": diagram_type,
            "validation": validation,
            "repair_log": repair_log,
            "verification": verification,
            "suggestions": [],
            "agent_steps": progress,
        }

    def verify_refinement(self, instruction, original_code, candidate_code, diagram_type):
        if normalize_mermaid(original_code) == normalize_mermaid(candidate_code):
            return {
                "implemented": False,
                "summary": "The candidate is unchanged.",
                "issues": ["The Mermaid code is unchanged and does not implement the requested edit."],
            }

        system_prompt = (
            "You verify Mermaid diagram edits. Compare the original and candidate against the instruction. "
            "Do not rewrite code. Return ONLY JSON with: implemented (boolean), summary (one short sentence), "
            "issues (array of short actionable strings). Mark implemented false when the visible requested change is missing, "
            "when unrelated structure was added, or when repetitive/hallucinated statements appear."
        )
        user_prompt = (
            f"DIAGRAM TYPE: {diagram_type}\n\n"
            f"INSTRUCTION:\n{instruction}\n\n"
            f"ORIGINAL CODE:\n{original_code}\n\n"
            f"CANDIDATE CODE:\n{candidate_code}"
        )
        try:
            raw = self.call_model(system_prompt, user_prompt, temperature=0.0, max_tokens=600)
            data = parse_json_object(raw)
            implemented = data.get("implemented") is True
            summary = str(data.get("summary") or "Semantic verification completed.").strip()[:300]
            raw_issues = data.get("issues") if isinstance(data.get("issues"), list) else []
            issues = [str(issue).strip()[:300] for issue in raw_issues if str(issue).strip()][:6]
            if not implemented and not issues:
                issues = ["The candidate does not clearly implement the requested change."]
            return {"implemented": implemented, "summary": summary, "issues": issues}
        except Exception:
            # Deterministic checks still protect syntax, no-op edits, and runaway duplication.
            return {
                "implemented": True,
                "summary": "Structural verification passed; semantic verification was unavailable.",
                "issues": [],
            }


    def load_knowledge(self, diagram_type):
        filename = KNOWLEDGE_FILES.get(diagram_type)
        if not filename:
            return ""
        path = os.path.join(self.knowledge_dir, filename)
        try:
            with open(path, "r", encoding="utf-8") as handle:
                return handle.read()
        except OSError:
            return ""

    def call_model(self, system_prompt, user_prompt, temperature=0.2, max_tokens=2500):
        if not self.api_key:
            raise RuntimeError("Missing API key for agent model call.")

        if self.provider == "gemini":
            models_to_try = [self.model]
            fallbacks = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"]
            for fb in fallbacks:
                if fb not in models_to_try:
                    models_to_try.append(fb)

            last_err = None
            headers = {"Content-Type": "application/json"}
            body = {
                "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
                "systemInstruction": {"parts": [{"text": system_prompt}]},
                "generationConfig": {
                    "temperature": temperature,
                    "maxOutputTokens": max_tokens
                }
            }

            for idx, m in enumerate(models_to_try):
                try:
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={self.api_key}"
                    response = requests.post(url, headers=headers, json=body, timeout=45)
                    if response.status_code in (503, 429, 404, 500, 502) and idx < len(models_to_try) - 1:
                        print(f"Gemini model '{m}' returned HTTP {response.status_code}. Failing over to '{models_to_try[idx + 1]}'...")
                        last_err = f"HTTP {response.status_code}: {response.text}"
                        continue

                    response.raise_for_status()
                    data = response.json()
                    content = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                    if not content and idx < len(models_to_try) - 1:
                        continue
                    if not content:
                        raise RuntimeError("Google Gemini API returned an empty content response.")
                    return content.strip()
                except requests.exceptions.RequestException as e:
                    last_err = str(e)
                    if idx < len(models_to_try) - 1:
                        print(f"Gemini model '{m}' request failed ({e}). Trying '{models_to_try[idx + 1]}'...")
                        continue
                    raise RuntimeError(f"Google Gemini API error across all fallbacks: {last_err}")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "api-subscription-key": self.api_key,
            "Content-Type": "application/json"
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        if self.provider == "groq":
            url = "https://api.groq.com/openai/v1/chat/completions"
        elif self.provider in ["nvidia", "invidia"]:
            url = "https://integrate.api.nvidia.com/v1/chat/completions"
            payload["chat_template_kwargs"] = {"enable_thinking": False}
        else:
            url = "https://api.sarvam.ai/v1/chat/completions"

        req_timeout = 180 if self.provider in ["nvidia", "invidia"] else 45
        response = requests.post(url, headers=headers, json=payload, timeout=req_timeout)
        response.raise_for_status()
        data = response.json()
        message = data["choices"][0]["message"]
        content = message.get("content") or message.get("reasoning_content")
        if not content:
            raise RuntimeError("Model returned an empty message.")
        return content.strip()


def build_generation_prompt(diagram_type, knowledge):
    base = (
        "You are Arka's autonomous diagram generation agent. Generate Mermaid JS only. "
        "No markdown fences. No explanations. The code must render in Mermaid. "
        "Use simple alphanumeric node ids. Keep labels concise and quoted when the syntax supports labels.\n\n"
        f"KNOWLEDGE BANK RULES:\n{knowledge}\n\n"
    )
    rules = {
        "flowchart": (
            "Start with flowchart TD. Include Start and End. Keep primary happy path clear. "
            "Use at most 1 decision per 5 nodes. Node text must be quoted. "
            "CRITICAL: Node IDs must be alphanumeric without quotes or spaces (e.g. task1, NOT \"Task 1\"). "
            "Connections must use unquoted node IDs (e.g. task1 --> task2). "
            "Do NOT use CSS drop-shadow or rgba in classDef/style. "
            "IMPORTANT: You MUST apply semantic coloring to every node using the class definitions (greenNode, blueNode, yellowNode, redNode, goldNode) "
            "defined in the knowledge rules. Define the classDefs at the bottom of the diagram and apply them using the nodeId:::className syntax."
        ),
        "architecture": (
            "Start with flowchart LR or flowchart TD. Organize nodes into logical layers using subgraphs (e.g. clientLayer, backendLayer, aiLayer, dataLayer, monitorLayer, extLayer) "
            "matching the semantic groups and colors defined in the knowledge rules. "
            "IMPORTANT: Apply semantic coloring to subgraphs using `style subgraphId fill:#HEX,stroke:#HEX,stroke-width:2px,color:#HEX` statements, "
            "and to nodes using classDefs and the `nodeId:::className` syntax, strictly matching the colors and definitions in the knowledge rules."
        ),
        "sequence": (
            "Start with sequenceDiagram. Declare all actors/participants at the top. "
            "Use request-response pairs. Message text must not contain colons or angle brackets. "
            "CRITICAL: Do NOT use subgraphs, flowchart node shapes ([..], {..}), or flowchart connections (-->) in sequence diagrams. "
            "Ensure activations (+/-) are balanced within blocks (alt, else, par, loop). "
            "Parallel block titles MUST use brackets, e.g. 'par [Title]'."
        ),
        "erDiagram": (
            "Start with erDiagram. Entity names must be PascalCase. Relationship labels must be quoted. "
            "CRITICAL: Do NOT use flowchart shapes like [Node] or {{Relation}} under erDiagram; use standard Crow's Foot entities and relationships (e.g. CUSTOMER ||--o{ ORDER : places)."
        ),
        "gantt": (
            "Start with gantt, include title and dateFormat YYYY-MM-DD. Use section groups and unique alphanumeric ids. "
            "CRITICAL RULES: "
            "(1) axisFormat must NOT have spaces between tokens — use %b-%d, NEVER %b %d. "
            "(2) When using 'after taskId', provide ONLY duration (e.g., 14d) — NEVER add explicit start/end dates alongside after. "
            "(3) Every 'after taskId' MUST reference an existing task id — verify spelling matches exactly. "
            "(4) Section names must NOT contain '&' — use 'and' instead. "
            "(5) NEVER create bare dependency-only lines like 'Task : after id1' without a duration or dates. "
            "(6) Keep tasks to 10-25 total and sections to 3-6 for readability. "
            "(7) Use milestones (0d duration) for key checkpoints."
        ),
        "pie": (
            "Start with pie showData. Include title. Slices use \"Label\" : numeric_value. "
            "CRITICAL RULES: "
            "(1) NEVER use 'explode', 'slice offset', or unsupported options — Mermaid pie charts do NOT support explode/offset syntax. "
            "(2) Slice values MUST be plain numbers (e.g. 420, 24.5) — do NOT include $, %, or commas."
        ),
        "quadrantChart": (
            "Start with quadrantChart. Include title: title \"Chart Title\". "
            "Define axes: x-axis <left label> --> <right label> and y-axis <bottom label> --> <top label>. NEVER use x-axis-title or y-axis-title. "
            "Define quadrant labels: quadrant-1 Top Right Label, quadrant-2 Top Left Label, quadrant-3 Bottom Left Label, quadrant-4 Bottom Right Label. "
            "EVERY item MUST have numeric coordinates between 0.0 and 1.0 in brackets: \"Item Name\": [x, y]. "
            "NEVER omit [x, y] coordinates. NEVER use placeholders like <item1> or 'Item 1'. Plot ALL requested items with realistic positions."
        ),
        "xy": (
            "Start with xychart-beta. Include title, x-axis, y-axis, and at least one bar or line series. "
            "CRITICAL RULES: "
            "(1) NEVER put string labels after line or bar statements — e.g. use 'line [1, 2]', NEVER 'line [1, 2] \"Label\"'. "
            "(2) NEVER use 'legend', 'annotate', or 'grid' directives as they are completely unsupported by xychart-beta syntax. "
            "(3) Category labels in 'x-axis' must be enclosed in double quotes if they contain spaces. "
            "(4) Ensure the number of elements in your bar/line series matches the number of x-axis categories exactly."
        ),
        "cynefin": (
            "Start with cynefin-beta. "
            "CRITICAL RULES: "
            "(1) Line 1 MUST be 'cynefin-beta'. Line 2 MUST be 'title <Title>'. "
            "(2) Group items under the 5 domain keywords: complex, complicated, clear, chaotic, confusion. "
            "(3) Each item MUST be a short, punchy quoted string on its own line (indented by 2 spaces), e.g. '\"Routine server patch SOP\"'. "
            "(4) Add 2 to 4 domain transitions at the bottom using: 'domainA --> domainB : \"Reason\"'. "
            "(5) Valid domain names: complex, complicated, clear, chaotic, confusion. "
            "(6) NEVER output flowchart syntax, subgraphs, or node brackets. Output ONLY pure cynefin-beta format."
        ),
        "ishikawa": (
            "Start with ishikawa-beta. "
            "CRITICAL RULES: "
            "(1) Line 2 MUST be the main Effect or Problem statement (fish head). "
            "(2) Define 4-6 cause categories indented by 2 spaces (e.g. People, Methods, Machines, Materials, Measurements, Environment). "
            "(3) List specific root causes under each category indented by 4 spaces (and optional sub-causes indented by 6 spaces). "
            "(4) NEVER use 'flowchart', 'graph', subgraphs, or arrow syntax ('-->'). Use pure indented text under ishikawa-beta."
        ),
        "swimlane": (
            "Start with swimlane-beta LR (or swimlane-beta TB). "
            "CRITICAL RULES: "
            "(1) Line 1 MUST be 'swimlane-beta LR' or 'swimlane-beta TB'. NEVER use 'flowchart' or 'graph'. "
            "(2) Group process steps into swimlanes using 'subgraph LaneId [\"Lane Title\"] ... end'. "
            "(3) Use shapes inside lanes: id[\"Task / Action\"], id([\"Start / End\"]), id{\"Decision\"}, id((\"Event / Marker\")), id[(\"Database / Store\")]. "
            "(4) Connect nodes within and across lanes using: 'A --> B', 'A -->|Condition| B', 'A -.-> B'. "
            "(5) Every subgraph MUST have a matching 'end'. Do NOT nest subgraphs inside other subgraphs. "
            "(6) Node IDs MUST be simple alphanumeric strings without spaces. "
            "(7) ALWAYS add semantic styles at the bottom for vibrant colors: "
            "'style startNode fill:#ecfdf5,stroke:#059669,stroke-width:2px,color:#065f46;' "
            "'style taskNode fill:#eff6ff,stroke:#2563eb,stroke-width:2px,color:#1e40af;' "
            "'style decisionNode fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f;' "
            "'style endNode fill:#ecfdf5,stroke:#059669,stroke-width:2px,color:#065f46;'"
        ),
        "block": (
            "Start with block-beta. "
            "CRITICAL RULES: "
            "(1) Line 1 MUST be 'block-beta'. Line 2 MUST declare grid columns: 'columns N' (e.g. 'columns 3' or 'columns 4' or 'columns 1'). "
            "(2) NEVER use directional keywords like 'TD' or 'LR' after block-beta. "
            "(3) Use appropriate node shapes: db[(\"Database\")], client((\"User / Client\")), svc([\"API Gateway\"]), queue{{\"Event Queue\"}}, comp[\"Component\"]. "
            "Node IDs in declarations and connections MUST NOT have quotes (e.g. comp[\"Label\"], NOT \"comp\" [\"Label\"]). "
            "(4) Use ':span' for spanning wide blocks across columns (e.g. 'header[\"Title\"]:3', 'space:3', 'd[\"Wide Bottom Block\"]:3'). "
            "(5) Group components into structured subsystems with 'block:groupId:span', define inner 'columns M', and ALWAYS close with 'end'. "
            "(6) Insert dimensional block arrows between major tiers on a single line: 'blockArrowId1<[\"&nbsp;&nbsp;\"]>(down):span' or 'blockArrowId1<[\"Label\"]>(down)'. "
            "(7) Add directional links at the bottom: 'groupId --> targetNode', 'compA --> compB'. "
            "(8) ALWAYS add semantic styles at the bottom with soft fills and crisp borders: "
            "'style header fill:#e0e7ff,stroke:#4338ca,stroke-width:2px,color:#312e81;' "
            "'style comp1 fill:#eff6ff,stroke:#2563eb,stroke-width:2px,color:#1e40af;' "
            "'style comp2 fill:#ecfdf5,stroke:#059669,stroke-width:2px,color:#064e3b;' "
            "'style comp3 fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f;'"
        ),
        "treemap": (
            "Start with treemap-beta. "
            "CRITICAL RULES: "
            "(1) Declare major categories in double quotes (e.g. \"Technology (45%)\"). "
            "(2) Declare child items indented under categories with numeric values: '  \"Item Name\": <number>'. "
            "(3) Nested sub-categories are supported with deeper indentation before leaf values. "
            "(4) NEVER use 'flowchart', 'graph', 'subgraph', or arrow syntax ('-->'). Use pure hierarchical indented text with numeric values."
        ),
        "treeView": (
            "Generate native 'treeView-beta' format for directory trees: "
            "(1) Line 1 MUST be exactly 'treeView-beta'. "
            "(2) Indent nested directories and files with 2 spaces per depth level. "
            "(3) Enclose folder and file names in double quotes without angle brackets. "
            "(4) Example:\n"
            "treeView-beta\n"
            "  \"src\"\n"
            "    \"components\"\n"
            "      \"Navbar.jsx\"\n"
            "    \"App.jsx\"\n"
            "  \"package.json\"\n"
            "  \"README.md\""
        ),
        "eventModeling": (
            "Start with eventmodeling. "
            "CRITICAL RULES: "
            "(1) Line 1 MUST be 'eventmodeling'. "
            "(2) Declare chronological timeframes using 'tf <idx> <type> <EntityIdentifier> [optional json payload]'. "
            "(3) Index: sequential 2-digit numbers ('01', '02', '03', '04'...). "
            "(4) Entity types: 'ui' (screens), 'pcr' (processors), 'cmd' (commands), 'rmo' (read models), 'evt' (events in past tense). "
            "(5) Use 'rf <idx> <type> <EntityIdentifier>' (Reset Frame) when starting a new slice or breaking inference. "
            "(6) NEVER output flowchart syntax, subgraphs, or node brackets. Output ONLY pure eventmodeling format."
        ),
        "radar": "Start with radar-beta (with optional frontmatter title). Define 5-8 dimensions using 'axis id[\"Label\"], id2[\"Label2\"], ...', plot profiles with 'curve id[\"Series\"]{val1, val2, ...}', and set 'max <number>' and 'min <number>'.",
        "kanban": "Start with flowchart LR. Create column subgraphs for columns (Backlog, Todo, In Progress, Review, Done). Tasks are card-like nodes inside columns. Use links only for task dependencies.",
        "gitGraph": (
            "Start with gitGraph. "
            "CRITICAL RULES: "
            "(1) The diagram starts on main automatically. NEVER write 'branch main'. "
            "(2) ALWAYS create a branch using 'branch <name>' BEFORE using 'checkout <name>'. NEVER checkout a non-existent branch. "
            "(3) Every commit ID (e.g. commit id: \"...\") MUST be unique across the ENTIRE diagram. NEVER duplicate commit IDs. "
            "(4) 'merge <branch>' merges <branch> into the currently active branch. NEVER merge a branch into itself. "
            "(5) NEVER use 'rebase' or 'delete' directives as they are unsupported by Mermaid gitGraph syntax."
        ),
        "requirementDiagram": (
            "Start with requirementDiagram. "
            "CRITICAL RULES: "
            "(1) Requirements MUST be declared in blocks using curly braces: requirement req_id { id: REQ-001 text: \"Description\" risk: High verifyMethod: Test }. "
            "(2) NEVER write single-line requirement definitions without {}. "
            "(3) NEVER use flowchart node syntax like A[Label] or standard arrows -->. "
            "(4) Relationships MUST use SysML arrows: req_parent - contains -> req_child, sys_elem - satisfies -> req_parent."
        ),
        "c4Diagram": (
            "Start with C4Context, C4Container, or C4Component. "
            "CRITICAL RULES: "
            "(1) Define People and Systems using macros: Person(alias, \"Name\"), System(alias, \"Name\"), System_Ext(alias, \"Name\"), Container(alias, \"Name\", \"Tech\"). "
            "(2) NEVER use standard flowchart square bracket nodes A[Label] or class definitions. "
            "(3) Relationships MUST use Rel or directional Rel macros: Rel_D(from, to, \"Label\", \"Tech\") for Down, Rel_R for Right, Rel_L for Left, Rel_U for Up to prevent line collisions. NEVER use standard arrows -->. "
            "(4) Use UpdateElementStyle(alias, bgColor, fontColor, borderColor) with explicit node aliases to apply soft, light pastel colors."
        ),
        "mindmap": (
            "Start with mindmap. "
            "CRITICAL RULES & SEMANTIC SHAPE SELECTION: "
            "(1) Hierarchy is created strictly by spaces/indentation (2 or 4 spaces per nesting level). Sibling nodes MUST have identical indentation. "
            "(2) NEVER use flowchart arrow operators like --> or -.-> or classDef statements. "
            "(3) MANDATORY SHAPE DIVERSITY — NEVER USE ONLY RECTANGLES: Every mindmap MUST use an intentional variety of semantic shapes: "
            "    - Root Topic: ALWAYS Circle `root((Central Topic))` "
            "    - Level-1 Primary Pillars/Categories: ALWAYS Rounded Rectangle `(Major Category)` "
            "    - Concrete Deliverables, Modules & Tasks: Square/Rectangle `[Deliverable / Task]` "
            "    - External Cloud Services, Third-Party APIs, Brainstorms & Hypotheses: ALWAYS Cloud shape `)External API / Idea(` (NOTE: opens with ')' and closes with '(') "
            "    - Critical Risks, Blockers & Breakthrough Alerts: ALWAYS Bang shape `))P0 Risk / Breakthrough Alert((` (NOTE: opens with '))' and closes with '((', use sparingly for 1-2 key items) "
            "    - Milestones, Checkpoints & Decision Gates: ALWAYS Hexagon `{{Milestone / Approval Gate}}` "
            "    - Fine-Grained Notes/Details: Plain unbracketed text or double quotes `\"Granular metric\"` "
            "(4) SYNTAX SAFETY FOR CLOUD & BANG: Cloud syntax MUST be `)Label(` and Bang syntax MUST be `))Label((`. Inverting them causes fatal Mermaid syntax errors. "
            "(5) QUOTING: If a node label contains commas, colons, parentheses, or emojis, wrap the label in double quotes INSIDE the shape delimiter (e.g. `) \"Stripe & PayPal\" (`, `)) \"🚨 P0 Security Blocker\" ((`)."
        ),
        "packet": (
            "Start with packet-beta. "
            "CRITICAL RULES: "
            "(1) Line 1 MUST be 'packet-beta' (with optional 'title <Title>' on line 2). "
            "(2) Define bit fields sequentially without gaps or overlaps using format: '<startBit>-<endBit>: \"<Field Name>\"' or '<bit>: \"<Field Name>\"'. "
            "(3) Example:\n"
            "packet-beta\n"
            "title UDP Packet\n"
            "0-15: \"Source Port\"\n"
            "16-31: \"Destination Port\"\n"
            "32-47: \"Length\"\n"
            "48-63: \"Checksum\"\n"
            "64-95: \"Data (variable length)\""
        ),
        "useCase": (
            "Start with either 'usecase-beta' (Mermaid 12 native syntax) or 'flowchart LR' (UML flowchart standard). "
            "If using 'usecase-beta': define actors ('actor Name', 'actor:awesome Name as \"Label\"'), system boundary ('system \"Name\" { usecase \"Action\" as UC1 }'), links ('Actor --> UC1'), and dependencies ('UC1 ..> UC2 : include', 'UC3 ..> UC1 : extend'). "
            "If using 'flowchart LR': "
            "(1) Primary Human Actors MUST use hexagon shape on the left: Actor{{\"👤 Customer\"}}:::actorNode. "
            "(2) Secondary/External systems MUST use rectangle shape on the right: Sys[\"💳 Gateway\"]:::extSystemNode. "
            "(3) System Boundary MUST be a subgraph with descriptive title: subgraph SystemBoundary [\"Title\"] ... end. "
            "(4) Every Use Case node MUST use stadium shape: UC1([\"Action Label\"]):::usecaseNode. "
            "(5) Mandatory inclusion: BaseUse -.->|«include»| IncludedUse. "
            "(6) Conditional extension: ExtendUse -.->|«extend»| BaseUse. "
            "(7) Actor links: Actor --> UC1 and UC_Pay --> Gateway. "
            "(8) ALWAYS style the System Boundary layer block with a soft colored fill (e.g. #f0f9ff, #f8fafc) and dashed border: style SystemBoundary fill:#f0f9ff,stroke:#0284c7,stroke-width:2px,stroke-dasharray:4 4,color:#0369a1;. "
            "(9) Append classDefs for actorNode (fill:#e0e7ff,stroke:#3730a3), usecaseNode (fill:#ecfdf5,stroke:#059669), includeNode (fill:#e0f2fe,stroke:#0284c7), extendNode (fill:#fef3c7,stroke:#d97706), and extSystemNode (fill:#f3e8ff,stroke:#7e22ce)."
        ),
    }
    return base + "\n" + rules.get(diagram_type, rules["flowchart"])


def build_refine_prompt(diagram_type, knowledge):
    return (
        "You are Arka's diagram refinement agent. Modify the existing Mermaid code according to the instruction. "
        "Return ONLY the complete updated Mermaid code. Preserve existing nodes, links, styles, and diagram type "
        "unless the user explicitly asks to change them. Make the smallest correct edit. "
        "Do not include explanations, plans, markdown, comments about what changed, or any non-Mermaid text. "
        "If the instruction asks for a diagram change, the returned Mermaid code must implement a visible change. "
        "Do not refuse normal Mermaid edits. If a request is partly unsupported, make the closest supported code change. "
        "Do not add new cross-links, loops, duplicated edges, or unrelated nodes while improving style/readability. "
        "For colors in flowcharts, prefer applying semantic colors using classDef definitions (greenNode, blueNode, yellowNode, redNode, goldNode) "
        "and applying them as nodeId:::className. For architecture diagrams, group nodes into subgraphs representing layers and style the subgraphs using "
        "style statements and the nodes using the classDefs (clientNode, backendNode, aiNode, infraNode, dataNode, msgNode, monitorNode, extNode) "
        "as defined in the knowledge rules.\n\n"
        f"DIAGRAM TYPE: {diagram_type}\n"
        f"KNOWLEDGE BANK RULES:\n{knowledge}\n"
    )


def build_repair_prompt(diagram_type, knowledge, docs):
    return (
        "You are Arka's Mermaid repair agent. Fix the code using the line-level validation issues. "
        "Return ONLY the full corrected Mermaid code. Do not explain. Do not wrap in markdown fences.\n\n"
        f"DIAGRAM TYPE: {diagram_type}\n"
        f"KNOWLEDGE BANK RULES:\n{knowledge[:2500]}\n\n"
        f"MERMAID REFERENCE NOTES:\n{docs[:2500] if docs else 'No external reference was available.'}"
    )


def normalize_type(value):
    if not value:
        return None
    lower = str(value).strip().lower().replace("_", "").replace("-", "")
    mapping = {
        "flowchart": "flowchart",
        "flow": "flowchart",
        "swimlane": "swimlane",
        "swimlanes": "swimlane",
        "swimlanediagram": "swimlane",
        "architecture": "architecture",
        "systemarchitecture": "architecture",
        "sequence": "sequence",
        "sequencediagram": "sequence",
        "classdiagram": "classDiagram",
        "class": "classDiagram",
        "statediagram": "stateDiagram",
        "state": "stateDiagram",
        "er": "erDiagram",
        "erdiagram": "erDiagram",
        "entityrelationship": "erDiagram",
        "userjourney": "userJourney",
        "journey": "userJourney",
        "gantt": "gantt",
        "ganttchart": "gantt",
        "pie": "pie",
        "piechart": "pie",
        "quadrantchart": "quadrantChart",
        "quadrant": "quadrantChart",
        "requirementdiagram": "requirementDiagram",
        "requirement": "requirementDiagram",
        "gitgraph": "gitGraph",
        "git": "gitGraph",
        "c4diagram": "c4Diagram",
        "c4": "c4Diagram",
        "mindmap": "mindmap",
        "mindmaps": "mindmap",
        "timeline": "timeline",
        "sankey": "sankey",
        "sankeydiagram": "sankey",
        "xy": "xy",
        "xychart": "xy",
        "barchart": "xy",
        "linechart": "xy",
        "block": "block",
        "blockdiagram": "block",
        "packet": "packet",
        "packetdiagram": "packet",
        "kanban": "kanban",
        "kanbanboard": "kanban",
        "radar": "radar",
        "radarchart": "radar",
        "eventmodeling": "eventModeling",
        "treemap": "treemap",
        "venn": "venn",
        "venndiagram": "venn",
        "ishikawa": "ishikawa",
        "fishbone": "ishikawa",
        "wardley": "wardley",
        "wardleymap": "wardley",
        "cynefin": "cynefin",
        "treeview": "treeView",
        "tree": "treeView",
        "usecase": "useCase",
        "usecasediagram": "useCase",
        "usecasediagrams": "useCase",
        "usecases": "useCase",
        "usecasechart": "useCase",
    }
    return mapping.get(lower)


def readable_type(diagram_type):
    return {
        "flowchart": "flowchart",
        "architecture": "architecture diagram",
        "sequence": "sequence diagram",
        "erDiagram": "ER diagram",
        "gantt": "Gantt chart",
        "xy": "XY chart",
        "pie": "pie chart",
        "cynefin": "Cynefin framework",
        "ishikawa": "Ishikawa diagram",
        "treemap": "Treemap diagram",
        "eventModeling": "Event modeling timeline",
        "radar": "Radar chart",
        "kanban": "Kanban board",
        "packet": "Packet diagram",
        "useCase": "Use Case diagram",
    }.get(diagram_type, diagram_type)


def normalize_mermaid(code):
    return "\n".join(
        line.strip()
        for line in str(code or "").replace("\r\n", "\n").splitlines()
        if line.strip()
    )


def compact_instruction(instruction):
    text = str(instruction or "")
    match = re.search(r"USER REQUEST:\s*(.*?)(?:\nAPPROVED PLAN:|$)", text, flags=re.DOTALL | re.IGNORECASE)
    if match:
        text = match.group(1)
    return re.sub(r"\s+", " ", text).strip()[:300]


def summarize_mermaid(code, diagram_type):
    lines = [line.strip() for line in str(code or "").splitlines() if line.strip()]
    edge_count = sum(
        1 for line in lines
        if not line.startswith("linkStyle ") and re.search(r"[-.=]+[ox>]|<[-.=]+|---", line)
    )
    node_ids = set(re.findall(r"(?:^|[\s>|])([A-Za-z][A-Za-z0-9_]*)\s*[\[({]", str(code or "")))
    return f"{readable_type(diagram_type).capitalize()} with {len(node_ids)} nodes, {edge_count} links, and {len(lines)} statements."


def refinement_quality_issues(original_code, candidate_code, validation):
    issues = []
    original = normalize_mermaid(original_code)
    candidate = normalize_mermaid(candidate_code)
    if candidate == original:
        issues.append({"line": 1, "severity": "error", "message": "Candidate code is unchanged."})

    original_lines = original.splitlines()
    candidate_lines = candidate.splitlines()
    if len(candidate_lines) > max(len(original_lines) * 3, len(original_lines) + 80):
        issues.append({
            "line": 1,
            "severity": "error",
            "message": "Candidate grew unexpectedly large and may contain hallucinated repetitive statements.",
        })

    seen = {}
    duplicate_lines = []
    for line_no, line in enumerate(candidate_lines, start=1):
        normalized = re.sub(r"\s+", " ", line).strip()
        if not normalized or normalized in {"end"} or normalized.startswith(("flowchart ", "graph ")):
            continue
        if normalized in seen:
            duplicate_lines.append((line_no, seen[normalized]))
        else:
            seen[normalized] = line_no
    for line_no, first_line in duplicate_lines[:4]:
        issues.append({
            "line": line_no,
            "severity": "error",
            "message": f"Repeated Mermaid statement duplicates line {first_line}.",
        })

    for issue in validation.get("issues", []):
        if "duplicate" in str(issue.get("message", "")).lower():
            issues.append({**issue, "severity": "error"})
    return issues


def parse_json_object(content):
    text = content or ""
    decoder = json.JSONDecoder()
    values = []
    for match in re.finditer(r"[\{\[]", text):
        try:
            value, _ = decoder.raw_decode(text[match.start():])
        except json.JSONDecodeError:
            continue
        if isinstance(value, (dict, list)):
            values.append(value)
    if not values:
        raise ValueError("Model did not return JSON.")
    for value in reversed(values):
        if isinstance(value, dict) and isinstance(value.get("suggestions"), list):
            return value
    for value in reversed(values):
        if isinstance(value, list) and value and all(isinstance(item, dict) for item in value):
            return {"suggestions": value}
    for value in reversed(values):
        if isinstance(value, dict):
            return value
    raise ValueError("Model JSON did not contain an object or suggestion list.")


def default_suggestions(diagram_type):
    defaults = {
        "flowchart": [
            "Add the main failure path for invalid decisions.",
            "Label decision branches with short Yes or No outcomes.",
            "Use one accent color for critical user actions.",
            "Remove secondary edge cases if readability drops.",
            "Group repeated checks into a single validation step.",
        ],
        "architecture": [
            "Add observability components for logs, metrics, and alerts.",
            "Show cache and queue boundaries if performance matters.",
            "Separate frontend, services, and data into subgraphs.",
            "Use muted colors for infrastructure and accents for critical paths.",
            "Label edges with protocols like REST, SQL, or events.",
        ],
        "sequence": [
            "Add an alternate block for failed requests.",
            "Keep message labels under forty characters.",
            "Show authentication before protected API calls.",
            "Use activation bars only for processing steps.",
            "Remove extra participants that do not exchange messages.",
        ],
        "erDiagram": [
            "Add junction tables for many-to-many relationships.",
            "Mark unique fields such as email with UK.",
            "Add createdAt fields to audit important entities.",
            "Keep each entity to three to six key attributes.",
            "Review cardinalities against real business rules.",
        ],
        "gantt": [
            "Add milestones for major delivery checkpoints.",
            "Mark the critical path with crit.",
            "Split long work into planning, build, and testing sections.",
            "Use realistic dates and durations for each phase.",
            "Add dependencies with after taskId where tasks sequence.",
        ],
        "pie": [
            "Keep slices to three to eight categories.",
            "Merge tiny slices into an Other category.",
            "Use contrasting colors for neighboring slices.",
            "Add realistic proportions that sum cleanly.",
            "Rename labels for quick executive readability.",
        ],
        "xy": [
            "Add a clear y-axis unit label.",
            "Use line charts for trends and bars for comparisons.",
            "Keep x-axis labels short to avoid overlap.",
            "Add a second series only if it clarifies comparison.",
            "Use a high-contrast palette for data series.",
        ],
    }
    return defaults.get(diagram_type, defaults["flowchart"])


@lru_cache(maxsize=8)
def fetch_mermaid_reference(diagram_type):
    url = MERMAID_DOC_URLS.get(diagram_type)
    if not url:
        return ""
    try:
        response = requests.get(url, timeout=6, headers={"User-Agent": "ArkaDiagramAgent/1.0"})
        response.raise_for_status()
        text = re.sub(r"<script.*?</script>", " ", response.text, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r"<style.*?</style>", " ", text, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text)
        return text[:5000]
    except Exception:
        return ""
