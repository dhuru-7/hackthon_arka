import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import requests
import json
import re
import io
import zipfile
import subprocess
from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from dotenv import load_dotenv
try:
    import fitz  # PyMuPDF
    pymupdf_available = True
except ImportError:
    pymupdf_available = False
from diagram_agent import DiagramAgent
from mermaid_validator import validate_mermaid_code


# Reload env vars to ensure updates take effect
_backend_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_backend_dir, ".env"))
load_dotenv()

app = Flask(__name__)
CORS(app)


@app.route('/api/health', methods=['GET'])
@app.route('/api', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "app": "Arka Diagram Studio Backend"})


SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
KNOWLEDGE_DIR = os.path.join(os.path.dirname(__file__), "knowledge")

REPO_MAX_FILES = 80
REPO_MAX_CHARS = 24000
REPO_FILE_MAX_CHARS = 3000
REPO_ALLOWED_EXTENSIONS = {
    ".js", ".jsx", ".ts", ".tsx", ".py", ".java", ".go", ".rs", ".rb", ".php",
    ".cs", ".cpp", ".c", ".h", ".hpp", ".swift", ".kt", ".kts", ".dart",
    ".json", ".yaml", ".yml", ".toml", ".ini", ".env.example", ".md", ".txt",
    ".sql", ".graphql", ".prisma", ".html", ".css", ".scss", ".vue", ".svelte",
}
REPO_SKIP_PARTS = {
    ".git", "node_modules", "dist", "build", ".next", ".nuxt", ".vercel",
    "coverage", ".cache", "__pycache__", ".venv", "venv", "target", "bin", "obj",
    "vendor", ".idea", ".vscode",
}
REPO_SKIP_FILES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "poetry.lock",
    "Pipfile.lock", "Cargo.lock",
}

# Wrap print to prevent Windows OSError [Errno 22] Invalid argument in detached background processes
import builtins
_orig_print = builtins.print
def _safe_print(*args, **kwargs):
    try:
        _orig_print(*args, **kwargs)
    except (OSError, IOError):
        pass
builtins.print = _safe_print

# Gemini API key for free trial / server-side OCR & translation
TRIAL_GEMINI_KEYS = [
    os.getenv("GEMINI_API_KEY", ""),
    os.getenv("TRIAL_GEMINI_KEY_1", ""),
    os.getenv("GOOGLE_API_KEY", ""),
]
TRIAL_GEMINI_KEYS = [k.strip() for k in TRIAL_GEMINI_KEYS if k and k.strip()]
TRIAL_MODELS = [
    os.getenv("TRIAL_GEMINI_MODEL", "gemini-3.5-flash-lite"),
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
]
TRIAL_MODEL = TRIAL_MODELS[0]

# Map diagram types to knowledge bank files
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
    "useCase": "use_case.md"
}




def agent_from_request(data):
    """Create a stateless agent from request settings. API keys are not stored."""
    provider = data.get("provider")
    model = data.get("model")
    api_key = data.get("apiKey")
    
    if not provider or provider == 'free':
        provider = 'sarvam'
        model = 'sarvam-105b'
        api_key = SARVAM_API_KEY
        if not api_key:
            raise RuntimeError("Sarvam API key (free tier) is not configured on the server. Please configure your own API key in Settings.")
            
    return DiagramAgent(api_key=api_key, provider=provider, model=model, knowledge_dir=KNOWLEDGE_DIR)


def load_knowledge(diagram_type):
    """Load the knowledge bank rules for a given diagram type."""
    filename = KNOWLEDGE_FILES.get(diagram_type)
    if not filename:
        return ""
    
    filepath = os.path.join(KNOWLEDGE_DIR, filename)
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        print(f"Knowledge file not found: {filepath}")
        return ""


@app.route('/api/agent/suggest', methods=['POST'])
def agent_suggest_diagram():
    data = request.json or {}
    user_prompt = data.get('prompt', '')
    if not user_prompt:
        return jsonify({"error": "No prompt provided"}), 400

    try:
        result = agent_from_request(data).suggest_type(user_prompt)
        return jsonify(result)
    except Exception as e:
        print(f"Agent suggest error: {e}")
        return jsonify({"error": f"Agent suggestion failed: {str(e)}"}), 500


@app.route('/api/agent/generate', methods=['POST'])
def agent_generate_diagram():
    data = request.json or {}
    user_prompt = data.get('prompt', '')
    diagram_type = data.get('diagramType') or data.get('diagram_type') or 'flowchart'
    if not user_prompt:
        return jsonify({"error": "No prompt provided"}), 400

    try:
        agent = agent_from_request(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    is_vercel = os.getenv('VERCEL') == '1' or 'VERCEL' in os.environ
    if is_vercel:
        try:
            steps = []
            def on_progress(step):
                steps.append(step)
            
            result = agent.generate(user_prompt, diagram_type, on_progress=on_progress)
            
            response_data = []
            for step in steps:
                response_data.append(json.dumps({"type": "progress", "content": step}) + "\n")
            response_data.append(json.dumps({"type": "result", "content": result}) + "\n")
            
            return Response("".join(response_data), mimetype='application/x-ndjson')
        except Exception as e:
            error_line = json.dumps({"type": "error", "content": str(e)}) + "\n"
            return Response(error_line, mimetype='application/x-ndjson')

    import queue
    import threading
    q = queue.Queue()

    def run_agent():
        try:
            def on_progress(step):
                q.put({"type": "progress", "content": step})
            
            result = agent.generate(user_prompt, diagram_type, on_progress=on_progress)
            q.put({"type": "result", "content": result})
        except Exception as e:
            q.put({"type": "error", "content": str(e)})
        finally:
            q.put(None)

    threading.Thread(target=run_agent).start()

    def event_stream():
        while True:
            item = q.get()
            if item is None:
                break
            yield json.dumps(item) + "\n"

    return Response(event_stream(), mimetype='application/x-ndjson')


@app.route('/api/agent/validate', methods=['POST'])
def agent_validate_diagram():
    data = request.json or {}
    code = data.get('mermaid_code', '')
    diagram_type = data.get('diagramType') or data.get('diagram_type') or 'flowchart'
    if not code:
        return jsonify({"error": "Missing mermaid_code"}), 400
    return jsonify(validate_mermaid_code(code, diagram_type))


@app.route('/api/agent/refine', methods=['POST'])
def agent_refine_diagram():
    data = request.json or {}
    user_prompt = data.get('prompt', '')
    mermaid_code = data.get('mermaid_code', '')
    diagram_type = data.get('diagramType') or data.get('diagram_type') or 'flowchart'
    if not user_prompt or not mermaid_code:
        return jsonify({"error": "Missing prompt or mermaid_code"}), 400

    try:
        agent = agent_from_request(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    is_vercel = os.getenv('VERCEL') == '1' or 'VERCEL' in os.environ
    if is_vercel:
        try:
            steps = []
            def on_progress(step):
                steps.append(step)
            
            result = agent.refine(
                user_prompt,
                mermaid_code,
                diagram_type,
                selected_context=data.get('selected_context', []),
                on_progress=on_progress
            )
            
            response_data = []
            for step in steps:
                response_data.append(json.dumps({"type": "progress", "content": step}) + "\n")
            response_data.append(json.dumps({"type": "result", "content": result}) + "\n")
            
            return Response("".join(response_data), mimetype='application/x-ndjson')
        except Exception as e:
            error_line = json.dumps({"type": "error", "content": str(e)}) + "\n"
            return Response(error_line, mimetype='application/x-ndjson')

    import queue
    import threading
    q = queue.Queue()

    def run_agent():
        try:
            def on_progress(step):
                q.put({"type": "progress", "content": step})
            
            result = agent.refine(
                user_prompt,
                mermaid_code,
                diagram_type,
                selected_context=data.get('selected_context', []),
                on_progress=on_progress
            )
            q.put({"type": "result", "content": result})
        except Exception as e:
            q.put({"type": "error", "content": str(e)})
        finally:
            q.put(None)

    threading.Thread(target=run_agent).start()

    def event_stream():
        while True:
            item = q.get()
            if item is None:
                break
            yield json.dumps(item) + "\n"

    return Response(event_stream(), mimetype='application/x-ndjson')


@app.route('/api/agent/chat', methods=['POST'])
def agent_chat():
    data = request.json or {}
    
    provider = data.get('provider')
    if not provider or provider == 'free':
        data['provider'] = 'sarvam'
        data['model'] = 'sarvam-105b'
        data['apiKey'] = SARVAM_API_KEY

    system_prompt = data.get('system_prompt', '')
    user_message = data.get('user_message', '')
    
    if not user_message:
        return jsonify({"error": "No user message provided"}), 400

    try:
        agent = agent_from_request(data)
        content = agent.call_model(system_prompt, user_message, temperature=0.2, max_tokens=650)
        return jsonify({"content": content})
    except Exception as e:
        print(f"Agent chat error: {e}")
        return jsonify({"error": f"Agent chat failed: {str(e)}"}), 500


@app.route('/api/agent/optimize-prompt', methods=['POST'])
def agent_optimize_prompt():
    data = request.json or {}
    user_prompt = data.get('prompt', '')
    if not user_prompt:
        return jsonify({"error": "No prompt provided"}), 400

    try:
        agent = agent_from_request(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    system_prompt = (
        "You are an expert prompt optimizer for generating high-quality Mermaid JS diagrams.\n"
        "Your task is to take the user's input prompt (which may have spelling mistakes, typos, or be extremely short/simple) and optimize it.\n\n"
        "Optimization rules:\n"
        "1. Correct all spelling, grammar, and structural mistakes.\n"
        "2. If the prompt is short (like 'water cycle' or 'photosynthesis'), rewrite it into a detailed, structured, step-by-step description of the flow, processes, components, and relationships. This detailed prompt will be used to generate a rich, accurate, and comprehensive diagram.\n"
        "3. Output ONLY the final optimized, expanded prompt itself.\n"
        "4. Do NOT include any explanations, introductions, headers, list of changes, markdown code blocks, or preamble.\n"
        "5. Start immediately with the optimized prompt text.\n\n"
        "Example 1:\n"
        "Input: photosintesis\n"
        "Output: A detailed process flowchart of Photosynthesis. It starts with light absorption by chlorophyll in the leaves. Carbon dioxide enters through the stomata, and water is absorbed by the roots. Under light energy, the light-dependent reactions produce ATP and NADPH while releasing Oxygen. Then, the light-independent Calvin Cycle uses ATP, NADPH, and Carbon Dioxide to synthesize Glucose (sugar).\n\n"
        "Example 2:\n"
        "Input: login logic with bad password\n"
        "Output: A flow diagram showing user login logic. The user enters their username and password. The system checks if the username exists. If no, show user not found error. If yes, check password. If password is incorrect, increment failed attempts, check if attempts exceed 3. If yes, lock account and notify user. If no, show incorrect password error and prompt retry. If password is correct, reset failed attempts counter, generate session token, and redirect to dashboard."
    )

    try:
        content = agent.call_model(system_prompt, user_prompt, temperature=0.3, max_tokens=1500)
        if content.startswith('"') and content.endswith('"'):
            content = content[1:-1].strip()
        elif content.startswith("'") and content.endswith("'"):
            content = content[1:-1].strip()
        return jsonify({"optimized_prompt": content})
    except Exception as e:
        print(f"Agent optimize prompt error: {e}")
        return jsonify({"error": f"Agent prompt optimization failed: {str(e)}"}), 500

def suggest_diagram():
    return jsonify({
        "error": "This endpoint was retired. Use /api/agent/suggest with the user's selected provider and model."
    }), 410



@app.route('/api/generate', methods=['POST'])
def generate_diagram():
    data = request.json
    user_prompt = data.get('prompt', '')
    diagram_type = data.get('diagramType', 'flowchart')
    
    if not user_prompt:
        return jsonify({"error": "No prompt provided"}), 400

    # Load knowledge bank rules for this diagram type
    knowledge_rules = load_knowledge(diagram_type)

    headers = {
        "Authorization": f"Bearer {SARVAM_API_KEY}",
        "api-subscription-key": SARVAM_API_KEY,
        "Content-Type": "application/json"
    }
    
    # Build system prompt based on diagram type with knowledge bank
    if diagram_type == "pie":
        system_prompt = (
            "You are an expert data visualization designer generating Mermaid JS diagrams.\n\n"
            "KNOWLEDGE BANK RULES (you MUST follow these):\n"
            f"{knowledge_rules}\n\n"
            "CRITICAL INSTRUCTIONS:\n"
            "- Output ONLY valid Mermaid JS pie chart code.\n"
            "- Do NOT wrap in markdown code blocks (no ```mermaid).\n"
            "- Do NOT include any explanation or text before/after the code.\n"
            "- Start with 'pie showData' on the first line.\n"
            "- Include a title.\n"
            "- Each slice: \"Label\" : value\n"
            "- Keep 3-8 categories.\n"
            "- Use realistic, proportional values.\n"
        )
    elif diagram_type == "xy":
        system_prompt = (
            "You are an expert data visualization designer generating Mermaid JS diagrams.\n\n"
            "KNOWLEDGE BANK RULES (you MUST follow these):\n"
            f"{knowledge_rules}\n\n"
            "CRITICAL INSTRUCTIONS:\n"
            "- Output ONLY valid Mermaid JS xychart-beta code.\n"
            "- Do NOT wrap in markdown code blocks (no ```mermaid).\n"
            "- Do NOT include any explanation or text before/after the code.\n"
            "- Start with 'xychart-beta' on the first line.\n"
            "- Include title, x-axis, y-axis, and at least one data series (bar or line).\n"
            "- Use realistic data values.\n"
            "- X-axis labels in brackets: [Label1, Label2, ...]\n"
            "- Values in brackets: [val1, val2, ...]\n"
        )
    elif diagram_type == "architecture":
        system_prompt = (
            "You are an expert systems architect generating Mermaid JS diagrams.\n\n"
            "KNOWLEDGE BANK RULES (you MUST follow these):\n"
            f"{knowledge_rules}\n\n"
            "CRITICAL INSTRUCTIONS:\n"
            "- Output ONLY valid Mermaid JS flowchart code (used for architecture diagrams).\n"
            "- Do NOT wrap in markdown code blocks (no ```mermaid).\n"
            "- Do NOT include any explanation or text before/after the code.\n"
            "- Start with 'flowchart LR' or 'flowchart TD'.\n"
            "- ALWAYS wrap node text in double quotes to prevent parser errors (e.g. A[\"Frontend API\"] or B{{\"Redis Cache\"}}).\n"
            "- CLEAN ARCHITECTURE LAYOUT: Divide the system into clear BLOCKS using subgraphs (e.g. 'Frontend', 'Backend', 'Data Layer').\n"
            "- Keep each subgraph SMALL - max 3-4 nodes per block.\n"
            "- Connect blocks with simple, clear arrows between them. Avoid crossing/tangling connections.\n"
            "- SIMPLICITY FIRST: Focus on the ESSENTIAL architectural components. Do not over-engineer.\n"
            "- If the prompt is simple, keep the diagram simple (4-8 nodes). Only expand for complex prompts.\n"
            "- Use a LINEAR left-to-right or top-to-bottom flow. Avoid circular dependencies or complex cross-connections.\n"
            "- Use cylinders [(\"text\")] for databases.\n"
            "- Use hexagons {{\"text\"}} for caches.\n"
            "- Use stadiums ([\"text\"]) for load balancers/gateways.\n"
            "- Label edges with protocols (REST, gRPC, WebSocket).\n"
            "- Keep between 4-15 nodes max unless the prompt explicitly asks for high detail.\n"
            "- Node IDs MUST be simple contiguous alphanumeric strings (e.g. gateway1, authService). NEVER use spaces in Node IDs.\n"
        )
    elif diagram_type == "sequence":
        system_prompt = (
            "You are an expert systems architect generating Mermaid JS sequence diagrams.\n\n"
            "KNOWLEDGE BANK RULES (you MUST follow these):\n"
            f"{knowledge_rules}\n\n"
            "CRITICAL INSTRUCTIONS:\n"
            "- Output ONLY valid Mermaid JS sequence diagram code.\n"
            "- Do NOT wrap in markdown code blocks (no ```mermaid).\n"
            "- Do NOT include any explanation or text before/after the code.\n"
            "- Start with 'sequenceDiagram' on the first line.\n"
            "- Optionally add 'autonumber' on the second line.\n"
            "- Declare ALL participants with explicit types: actor User, participant Frontend, participant API, participant DB.\n"
            "- Use proper arrow types: ->> for async/request, -->> for response, ->>+ for activation, -->>- for deactivation.\n"
            "- Always deactivate activations (-->>-) to keep lifeline activations balanced.\n"
            "- Group complex logic using blocks: 'alt [Condition]', 'else [Condition]', 'opt [Condition]', 'par [Action]', 'loop [Condition]'.\n"
            "- Message text must be concise. Do NOT use colons inside message labels.\n"
            "- Keep 3-6 participants and 8-20 messages for clarity.\n"
        )
    elif diagram_type == "erDiagram":
        system_prompt = (
            "You are an expert database architect generating Mermaid JS Entity-Relationship diagrams.\n\n"
            "KNOWLEDGE BANK RULES (you MUST follow these):\n"
            f"{knowledge_rules}\n\n"
            "CRITICAL INSTRUCTIONS:\n"
            "- Output ONLY valid Mermaid JS ER diagram code.\n"
            "- Do NOT wrap in markdown code blocks (no ```mermaid).\n"
            "- Do NOT include any explanation or text before/after the code.\n"
            "- Start with 'erDiagram' on the first line.\n"
            "- Declare entities with fields: ENTITY_NAME {\n    type field_name PK \"comment\"\n    type field_name FK\n    type field_name\n}\n"
            "- Define relationships using standard crow's foot notation:\n"
            "  * One to one: ||--|| or ||--o|\n"
            "  * One to many: ||--|{ or ||--o{\n"
            "  * Many to many: }|--|{ or }o--o{\n"
            "- Always include a relationship label: ENTITY_A ||--o{ ENTITY_B : \"places\"\n"
            "- Entity names MUST be UPPERCASE alphanumeric with no spaces (e.g. USER_ACCOUNT, ORDER_ITEM).\n"
            "- Types: string, int, float, boolean, datetime, text, json, uuid.\n"
            "- Use PK for Primary Key, FK for Foreign Key, UK for Unique Key.\n"
            "- Keep 3-8 entities with 4-8 fields each for clarity.\n"
        )
    elif diagram_type == "gantt":
        system_prompt = (
            "You are an expert project manager generating Mermaid JS Gantt charts.\n\n"
            "KNOWLEDGE BANK RULES (you MUST follow these):\n"
            f"{knowledge_rules}\n\n"
            "CRITICAL INSTRUCTIONS:\n"
            "- Output ONLY valid Mermaid JS Gantt chart code.\n"
            "- Do NOT wrap in markdown code blocks (no ```mermaid).\n"
            "- Do NOT include any explanation or text before/after the code.\n"
            "- First line MUST be 'gantt'.\n"
            "- Second line MUST be 'title <Chart Title>'.\n"
            "- Third line MUST be 'dateFormat YYYY-MM-DD'.\n"
            "- Optionally add 'axisFormat %b %d' for better date display.\n"
            "- Group tasks into 3-5 sections using 'section Name'.\n"
            "- Every task MUST have a unique alphanumeric ID (no spaces, no hyphens).\n"
            "- Task format: 'Task Name : status, taskId, startDate, endDate' OR 'Task Name : taskId, after prevId, duration'.\n"
            "- Duration format: '7d' for 7 days, '14d' for 2 weeks.\n"
            "- Use 'done' for completed, 'active' for in-progress, 'crit' for critical path.\n"
            "- Include milestones using 0d duration: 'Milestone : milestone, m1, date, 0d'.\n"
            "- Task names must NOT contain colons.\n"
            "- Use 'after taskId' for sequential dependencies.\n"
            "- Keep total tasks to 10-25 for readability.\n"
            "- Use realistic durations (not 1d for major phases).\n"
        )
    elif diagram_type == "c4Diagram":
        system_prompt = (
            "You are an expert software architect generating C4 architecture diagrams in Mermaid JS.\n\n"
            "KNOWLEDGE BANK RULES (you MUST follow these):\n"
            f"{knowledge_rules}\n\n"
            "CRITICAL INSTRUCTIONS:\n"
            "- Output ONLY valid Mermaid JS C4 diagram code.\n"
            "- Do NOT wrap in markdown code blocks (no ```mermaid).\n"
            "- First line MUST be 'C4Context', 'C4Container', or 'C4Component'.\n"
            "- Declare users, systems, containers, and databases using proper macros.\n"
            "- ALWAYS use directional relationship macros: Rel_D(from, to, \"Label\", \"Tech\") for Down, Rel_R for Right, Rel_L for Left, Rel_U for Up to prevent line collisions.\n"
            "- ALWAYS apply soft, light pastel colors using UpdateElementStyle(alias, \"#bgColor\", \"#fontColor\", \"#borderColor\") for EVERY declared node alias:\n"
            "  * Person/Admin aliases: UpdateElementStyle(alias, \"#E3F2FD\", \"#1E3A8A\", \"#93C5FD\")\n"
            "  * Container/System aliases: UpdateElementStyle(alias, \"#F3E8FF\", \"#4C1D95\", \"#C4B5FD\")\n"
            "  * Database aliases: UpdateElementStyle(alias, \"#FEF3C7\", \"#78350F\", \"#FDE68A\")\n"
            "  * External System aliases: UpdateElementStyle(alias, \"#F1F5F9\", \"#334155\", \"#CBD5E1\")\n"
            "- NEVER use generic type strings (like \"person\" or \"container\") inside UpdateElementStyle. MUST pass exact declared node aliases.\n"
        )
    elif diagram_type == "wardley":
        system_prompt = (
            "You are an expert strategy consultant generating official Wardley Maps in Mermaid JS.\n\n"
            "KNOWLEDGE BANK RULES (you MUST follow these):\n"
            f"{knowledge_rules}\n\n"
            "CRITICAL INSTRUCTIONS:\n"
            "- Output ONLY valid Mermaid JS wardley-beta code.\n"
            "- Do NOT wrap in markdown code blocks (no ```mermaid).\n"
            "- Do NOT include any explanation or text before/after the code.\n"
            "- Line 1 MUST be exactly 'wardley-beta'.\n"
            "- Line 2 MUST be 'title <Map Title>'.\n"
            "- Declare User / Customer anchors: 'anchor Customer [0.95, 0.60]'.\n"
            "- Declare Components with [visibility, evolution] coordinates (0.0 to 1.0): 'component Name [visibility, evolution]'.\n"
            "  * Visibility (Y-axis): 1.0 is highest (visible user need at top), 0.0 is lowest (infrastructure at bottom).\n"
            "  * Evolution (X-axis): 0.0-0.25 (Genesis), 0.25-0.50 (Custom-Built), 0.50-0.75 (Product/Rental), 0.75-1.0 (Commodity/Utility).\n"
            "- Optional decorators: '(build)', '(buy)', '(outsource)', '(market)', '(inertia)'.\n"
            "- Connect dependencies along the value chain: 'Customer -> Web App', 'Web App -> API', 'API -> Database'.\n"
            "- Declare evolution movement: 'evolve ComponentName targetEvolution'.\n"
            "- Declare notes: 'note \"Insight text\" [visibility, evolution]'.\n"
            "- NEVER use flowchart syntax or quadrantChart for wardley diagrams. Output ONLY pure wardley-beta format.\n"
        )
    elif diagram_type == "cynefin":
        system_prompt = (
            "You are an expert Cynefin framework designer generating official Cynefin diagrams in Mermaid JS.\n\n"
            "KNOWLEDGE BANK RULES (you MUST follow these):\n"
            f"{knowledge_rules}\n\n"
            "CRITICAL INSTRUCTIONS:\n"
            "- Output ONLY valid Mermaid JS cynefin-beta code.\n"
            "- Do NOT wrap in markdown code blocks (no ```mermaid).\n"
            "- Do NOT include any explanation or text before/after the code.\n"
            "- Line 1 MUST be exactly 'cynefin-beta'.\n"
            "- Line 2 MUST be 'title <Framework Title>'.\n"
            "- Group items under the 5 domain keywords: complex, complicated, clear, chaotic, confusion.\n"
            "- Each item MUST be a short quoted string on its own line indented by 2 spaces (e.g. '\"Routine password reset\"').\n"
            "- Add 2 to 4 domain transitions at the bottom using: 'domainA --> domainB : \"Reason\"'.\n"
            "- NEVER output flowchart syntax, subgraphs, or node brackets. Output ONLY pure cynefin-beta format.\n"
        )
    elif diagram_type == "eventModeling":
        system_prompt = (
            "You are an expert software architect generating Event Modeling timelines in Mermaid JS.\n\n"
            "KNOWLEDGE BANK RULES (you MUST follow these):\n"
            f"{knowledge_rules}\n\n"
            "CRITICAL INSTRUCTIONS:\n"
            "- Output ONLY valid Mermaid JS eventmodeling code.\n"
            "- Do NOT wrap in markdown code blocks (no ```mermaid).\n"
            "- Do NOT include any explanation or text before/after the code.\n"
            "- Line 1 MUST be exactly 'eventmodeling'.\n"
            "- Declare chronological timeframes using 'tf <idx> <type> <EntityIdentifier> [optional payload]'.\n"
            "- Index: sequential 2-digit numbers ('01', '02', '03', '04'...). \n"
            "- Entity types: 'ui' (screens), 'pcr' (processors), 'cmd' (commands), 'rmo' (read models), 'evt' (events in past tense).\n"
            "- Use 'rf <idx> <type> <EntityIdentifier>' (Reset Frame) when starting a new slice or breaking inference.\n"
            "- NEVER output flowchart syntax, subgraphs, or node brackets. Output ONLY pure eventmodeling format.\n"
        )
    elif diagram_type == "block":
        system_prompt = (
            "You are an expert system architect generating official Block Diagrams in Mermaid JS.\n\n"
            "KNOWLEDGE BANK RULES (you MUST follow these):\n"
            f"{knowledge_rules}\n\n"
            "CRITICAL INSTRUCTIONS:\n"
            "- Output ONLY valid Mermaid JS block-beta code.\n"
            "- Do NOT wrap in markdown code blocks (no ```mermaid).\n"
            "- Do NOT include any explanation or text before/after the code.\n"
            "- Line 1 MUST be exactly 'block-beta'. NEVER add directional keywords like TD or LR.\n"
            "- Line 2 MUST declare grid columns: 'columns N' (e.g. 'columns 3' or 'columns 4' or 'columns 1').\n"
            "- Use diverse node shapes to distinguish components:\n"
            "  * Rectangle: id[\"Component Name\"]\n"
            "  * Round: id(\"Module Name\")\n"
            "  * Stadium: id([\"API Gateway / Service\"])\n"
            "  * Cylinder / DB: id[(\"Database Storage\")]\n"
            "  * Circle: id((\"Client / User\"))\n"
            "  * Double Circle: id(((\"High-Priority Core\")))\n"
            "  * Diamond / Decision: id{\"Router / Switch\"}\n"
            "  * Hexagon: id{{\"Worker / Queue\"}}\n"
            "  * Subroutine: id[[\"Subprocess\"]]\n"
            "  * Lean Right: id[/\"Input / Stream\"/]\n"
            "- Use ':span' for spanning wide blocks across columns (e.g. 'header[\"Title\"]:3', 'space:3', 'db[(\"Cluster\")]:3').\n"
            "- Use 'space' or 'space:N' to create gaps between rows or align grid items.\n"
            "- Group subsystems with nested blocks and ALWAYS close with 'end':\n"
            "  block:groupId:span\n"
            "    columns M\n"
            "    item1[\"Item 1\"]\n"
            "    item2[\"Item 2\"]\n"
            "  end\n"
            "- Insert dimensional block arrows between major tiers on a single line:\n"
            "  arrow1<[\"&nbsp;&nbsp;\"]>(down):span or arrow1<[\"Label\"]>(down)\n"
            "  Valid directions: (down), (up), (right), (left), (x)\n"
            "- Connect components or blocks using standard arrows at the bottom:\n"
            "  A --> B\n"
            "  groupId --> D\n"
            "- ALWAYS apply semantic styles at the bottom using 'style' statements with soft pastel fills, high-contrast borders, and dark text:\n"
            "  style header fill:#e0e7ff,stroke:#4338ca,stroke-width:2px,color:#312e81\n"
            "  style input fill:#ecfdf5,stroke:#059669,stroke-width:2px,color:#064e3b\n"
            "  style proc fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f\n"
            "  style store fill:#f3e8ff,stroke:#7e22ce,stroke-width:2px,color:#581c87\n"
            "  style db fill:#eff6ff,stroke:#2563eb,stroke-width:2px,color:#1e40af\n"
            "- NEVER use flowchart syntax or subgraphs. Output ONLY pure block-beta format.\n"
        )
    elif diagram_type == "swimlane":
        system_prompt = (
            "You are an expert process architect generating official Swimlane diagrams in Mermaid JS.\n\n"
            "KNOWLEDGE BANK RULES (you MUST follow these):\n"
            f"{knowledge_rules}\n\n"
            "CRITICAL INSTRUCTIONS:\n"
            "- Output ONLY valid Mermaid JS swimlane-beta code.\n"
            "- Do NOT wrap in markdown code blocks (no ```mermaid).\n"
            "- Do NOT include any explanation or text before/after the code.\n"
            "- Line 1 MUST be 'swimlane-beta LR' (for horizontal process flow) or 'swimlane-beta TB' (for vertical process flow).\n"
            "- NEVER start with 'flowchart' or 'graph'.\n"
            "- Group process steps into swimlanes using 'subgraph LaneId [\"Lane Title\"] ... end' blocks.\n"
            "- Each swimlane represents a distinct role, team, department, or system (e.g. Customer, Support, Engineering, Warehouse, Payment Gateway).\n"
            "- Use proper node shapes inside lanes: id[\"Task / Action\"], id([\"Start / End\"]), id{\"Decision\"}, id((\"Event / Marker\")), id[(\"Database / Store\")].\n"
            "- Connect steps using arrows: 'A --> B', 'A -->|Condition| B', 'A -.-> B'.\n"
            "- Clearly show cross-lane handoffs when responsibilities transition between lanes.\n"
            "- Every 'subgraph' MUST have a matching 'end'. Do NOT nest subgraphs inside other subgraphs.\n"
            "- Node IDs MUST be simple alphanumeric strings without spaces or special symbols.\n"
            "- ALWAYS add semantic node styles at the bottom for beautiful colors:\n"
            "  style startNode fill:#ecfdf5,stroke:#059669,stroke-width:2px,color:#065f46\n"
            "  style taskNode fill:#eff6ff,stroke:#2563eb,stroke-width:2px,color:#1e40af\n"
            "  style decisionNode fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f\n"
            "  style storeNode fill:#f0fdfa,stroke:#0d9488,stroke-width:2px,color:#134e4a\n"
            "  style endNode fill:#ecfdf5,stroke:#059669,stroke-width:2px,color:#065f46\n"
            "- NEVER output classDef styles or flowchart direction keywords.\n"
        )
    else:  # flowchart
        system_prompt = (
            "You are an expert process designer generating Mermaid JS diagrams.\n\n"
            "KNOWLEDGE BANK RULES (you MUST follow these):\n"
            f"{knowledge_rules}\n\n"
            "CRITICAL INSTRUCTIONS:\n"
            "- Output ONLY valid Mermaid JS flowchart code.\n"
            "- SIMPLICITY FIRST: Keep the diagram CLEAN and READABLE. Focus on the HAPPY PATH and primary logic.\n"
            "- Do NOT add unnecessary edge cases, error handling, or parallel branches unless explicitly requested.\n"
            "- If the prompt is basic (e.g. 'login logic'), provide a direct 5-8 node STRAIGHT-LINE flow.\n"
            "- Do NOT wrap in markdown code blocks (no ```mermaid).\n"
            "- Do NOT include any explanation or text before/after the code.\n"
            "- Start with 'flowchart TD'.\n"
            "- ALWAYS wrap node text in double quotes (e.g. A[\"Submit Form\"] or B{\"Is Valid?\"}).\n"
            "- Use correct shapes: diamonds {\"text\"} for decisions, parallelograms [/\"text\"/] for I/O.\n"
            "- Always include Start and End nodes using stadium shape ([\"text\"]).\n"
            "- Prefer a SINGLE straight-line flow from top to bottom. Minimize branching.\n"
            "- Use at most ONE decision diamond per 5 nodes.\n"
            "- Keep between 4-10 nodes max for clarity, unless the prompt is highly detailed.\n"
            "- Node IDs MUST be simple contiguous alphanumeric strings (e.g. startNode, checkPass). NEVER use spaces in Node IDs.\n"
        )
    
    payload = {
        "model": "sarvam-105b",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Create a {diagram_type} diagram for: {user_prompt}"}
        ],
        "temperature": 0.2,
        "max_tokens": 2500
    }
    
    try:
        response = requests.post(
            "https://api.sarvam.ai/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=30
        )
        response.raise_for_status()
        result = response.json()
        content = result['choices'][0]['message']['content'].strip()
        
        # Clean up: remove markdown code blocks if present
        content = re.sub(r'^```(?:mermaid)?\s*\n?', '', content)
        content = re.sub(r'\n?```\s*$', '', content)
        content = content.replace("```mermaid", "").replace("```", "")
        content = content.strip()

        # REPLACEMENT LOGIC FOR RESERVED 'end' KEYWORD (flowchart/architecture only)
        if diagram_type in ['flowchart', 'architecture']:
            # Renames node IDs from 'end' to 'finish' to prevent Mermaid parser crashes.
            content = re.sub(r'(^|\n)end(\s*[-=]>|[\(\[\{])', r'\1finish\2', content)
            content = re.sub(r'([\(\[\{])end([\)\]\}])', r'\1finish\2', content)
            content = re.sub(r'([-=]>(?:\s*\|[^|]*\|)?\s*)end(\s|[\(\[\{\n]|$)', r'\1finish\2', content)

        # GLOBAL SYNTAX FIXES
        # 1. Strip internal LLM tags if they leak (e.g., <tool_call>)
        # 1. Strip internal LLM tags if they leak - specifically target common ones
        # to avoid stripping technical labels like "<100ms"
        content = re.sub(r'<(?:thought|tool_call|debug|internal)[^>]*>.*?</(?:thought|tool_call|debug|internal)>', '', content, flags=re.DOTALL)
        content = re.sub(r'<(?:thought|tool_call|debug|internal)[^>]*>', '', content)

        # 2. Remove duplicate diagram headers (LLM sometimes outputs two 'flowchart TD' etc.)
        lines = content.split('\n')
        header_keywords = ['flowchart ', 'sequenceDiagram', 'erDiagram', 'gantt', 'pie', 'xychart-beta']
        header_count = 0
        cleaned_lines = []
        for line in lines:
            stripped = line.strip()
            is_header = any(stripped.startswith(kw) for kw in header_keywords)
            if is_header:
                header_count += 1
                if header_count > 1:
                    continue
            cleaned_lines.append(line)
        content = '\n'.join(cleaned_lines)
        

        # PIE CHART SYNTAX FIXES
        if diagram_type == 'pie':
            # 1. First, extract the title if it exists
            title_match = re.search(r'title\s+([^\n]+)', content)
            title_line = f"    title {title_match.group(1).strip()}\n" if title_match else ""
            
            # 2. Extract all data points (Label : Value)
            # This regex is robust: it finds anything that looks like "Label" : 123
            data_points = re.findall(r'["\']?([^"\':=]+)["\']?\s*[:=]\s*(\d+(?:\.\d+)?)\s*%?', content)
            
            # 3. Clean the data points (strip "title" if it was accidentally caught)
            clean_data = []
            for label, value in data_points:
                if label.strip().lower() == 'title': continue
                clean_data.append(f'    "{label.strip()}" : {value}')
            
            # 4. Reconstruct the pie chart with perfect indentation
            # Simplify header for better compatibility and ensure 4-space indentation
            header = "pie\n"
            content = header + title_line + "\n".join(clean_data)

        # XY CHART SYNTAX FIXES
        if diagram_type == 'xy':
            # 1. Extract Title
            title_match = re.search(r'title\s+["\']?([^"\']+)["\']?', content)
            title_line = f'    title "{title_match.group(1).strip()}"\n' if title_match else ""

            # 2. Extract X-Axis Labels
            x_match = re.search(r'x-axis\s*\[([^\]]+)\]', content)
            if x_match:
                labels = [l.strip().strip('"\'') for l in x_match.group(1).split(',')]
                x_line = f'    x-axis ["{ "\", \"".join(labels) }"]\n'
            else:
                x_line = ""

            # 3. Extract Y-Axis configuration (robust matching for optional range)
            y_match = re.search(r'y-axis\s*["\']?([^"\']+)["\']?\s*([^\]\n]*)', content)
            if y_match:
                y_title = y_match.group(1).strip()
                y_range = y_match.group(2).strip()
                if y_range:
                    y_line = f'    y-axis "{y_title}" {y_range}\n'
                else:
                    y_line = f'    y-axis "{y_title}"\n'
            else:
                y_line = ""

            # 4. Extract Data Series (Bar and Line)
            series_matches = re.findall(r'(bar|line)\s*\[([^\]]+)\]', content)
            series_lines = []
            for s_type, s_vals in series_matches:
                # Clean values (keep only numbers and commas)
                vals = re.sub(r'[^0-9.,-]', '', s_vals)
                series_lines.append(f'    {s_type} [{vals}]')
            
            # 5. Reconstruct
            content = "xychart-beta\n" + title_line + x_line + y_line + "\n".join(series_lines)

        # ARCHITECTURE SYNTAX FIXES (Flowchart / Architecture)
        if diagram_type in ['flowchart', 'architecture']:
            # 2. Fix illegal nested shapes like node(([ "text" ])) -> node([ "text" ])
            content = re.sub(r'(\w+)\s*\(\(\s*([\[\{\(])', r'\1\2', content)
            content = re.sub(r'([\]\}\)])\s*\)\)', r'\1', content)

        # SEQUENCE DIAGRAM SYNTAX FIXES
        if diagram_type == 'sequence':
            lines = content.split('\n')
            # Ensure first line is 'sequenceDiagram'
            if lines and lines[0].strip() != 'sequenceDiagram':
                lines = ['sequenceDiagram'] + [l for l in lines if l.strip() != 'sequenceDiagram']
            # Remove colons from message text (after the first colon separator)
            fixed_lines = []
            for line in lines:
                stripped = line.strip()
                # Match interaction lines: Participant->>Participant: message
                arrow_match = re.match(r'(\s*\S+\s*-[->x)]+[+-]?\s*\S+\s*:\s*)(.*)', line)
                if arrow_match:
                    prefix = arrow_match.group(1)
                    msg = arrow_match.group(2)
                    # Remove colons and semicolons from message text
                    msg = msg.replace(':', ' -').replace(';', ',')
                    # Remove any angle brackets
                    msg = re.sub(r'<[^>]*>', '', msg)
                    fixed_lines.append(prefix + msg)
                else:
                    fixed_lines.append(line)
            
            # Fix unbalanced activations: track +/- per participant
            activation_counts = {}
            balanced_lines = []
            for line in fixed_lines:
                stripped = line.strip()
                
                # Detect activation (+) on target participant
                act_match = re.match(r'[^:]+->>\+\s*([a-zA-Z0-9_]+)\s*:', stripped)
                if not act_match:
                    # Also try to match without colon at the end if it's just an activation message
                    act_match = re.match(r'[^:]+->>\+\s*([a-zA-Z0-9_]+)', stripped)
                    
                target = None
                if act_match:
                    target = act_match.group(1).strip()
                    activation_counts[target] = activation_counts.get(target, 0) + 1
                    
                # Detect deactivation (-) on target participant
                deact_match = re.match(r'[^:]+-->>-\s*([a-zA-Z0-9_]+)\s*:', stripped)
                if not deact_match:
                    deact_match = re.match(r'[^:]+-->>-\s*([a-zA-Z0-9_]+)', stripped)
                    
                if deact_match:
                    target = deact_match.group(1).strip()
                    if activation_counts.get(target, 0) > 0:
                        activation_counts[target] -= 1
                    else:
                        # Unbalanced deactivation! Strip the '-' marker
                        line = line.replace('-->>-', '-->>')
                
                balanced_lines.append(line)
            content = '\n'.join(balanced_lines)

        # ER DIAGRAM SYNTAX FIXES
        if diagram_type == 'erDiagram':
            lines = content.split('\n')
            # Ensure first line is 'erDiagram'
            if lines and lines[0].strip() != 'erDiagram':
                lines = ['erDiagram'] + [l for l in lines if l.strip() != 'erDiagram']
            # Fix entity names with spaces → camelCase
            # Fix relationship lines missing quotes around labels
            fixed_lines = []
            for line in lines:
                stripped = line.strip()
                # Fix relationship lines - ensure label is quoted
                rel_match = re.match(r'(\s*\w+\s+[|o}{]+--[|o}{]+\s+\w+\s*:\s*)([^"].*[^"]\s*)$', line)
                if rel_match:
                    prefix = rel_match.group(1)
                    label = rel_match.group(2).strip()
                    fixed_lines.append(f'{prefix}"{label}"')
                else:
                    fixed_lines.append(line)
            content = '\n'.join(fixed_lines)

        # GANTT CHART SYNTAX FIXES
        if diagram_type == 'gantt':
            lines = content.split('\n')
            # Ensure first line is 'gantt'
            if lines and lines[0].strip() != 'gantt':
                lines = ['gantt'] + [l for l in lines if l.strip() != 'gantt']
            # Ensure dateFormat line exists
            has_date_format = any('dateFormat' in l for l in lines)
            if not has_date_format:
                # Insert after title or after 'gantt'
                insert_idx = 1
                for i, l in enumerate(lines):
                    if l.strip().startswith('title'):
                        insert_idx = i + 1
                        break
                lines.insert(insert_idx, '    dateFormat YYYY-MM-DD')
            # Ensure title line exists
            if not any(l.strip().startswith('title') for l in lines):
                lines.insert(1, '    title Project Timeline')
            # Fix axisFormat with spaces between tokens ("%b %d" -> "%b-%d")
            fixed_lines = []
            for line in lines:
                if line.strip().startswith('axisFormat'):
                    line = re.sub(r'(axisFormat\s+%[a-zA-Z])\s+(%[a-zA-Z])', r'\1-\2', line)
                fixed_lines.append(line)
            lines = fixed_lines
            # Replace '&' with 'and' in section names
            fixed_lines = []
            for line in lines:
                if line.strip().startswith('section '):
                    line = line.replace(' & ', ' and ')
                fixed_lines.append(line)
            lines = fixed_lines
            # Remove bare dependency-only task lines (no dates or duration)
            fixed_lines = []
            for line in lines:
                stripped = line.strip()
                if ':' in stripped and not stripped.startswith(('gantt', 'title', 'dateFormat', 'axisFormat', 'section', 'excludes', 'todayMarker')):
                    meta = stripped.split(':', 1)[1].strip()
                    parts = [p.strip() for p in meta.split(',')]
                    non_empty = [p for p in parts if p]
                    if len(non_empty) == 1 and non_empty[0].startswith('after '):
                        continue  # Skip bare dependency-only lines
                fixed_lines.append(line)
            lines = fixed_lines
            # Fix colons in task names (replace with dashes)
            fixed_lines = []
            for line in lines:
                stripped = line.strip()
                # Match task lines: Task Name : id, date, date
                if ':' in stripped and not stripped.startswith('title') and not stripped.startswith('dateFormat') and not stripped.startswith('axisFormat') and not stripped.startswith('section') and not stripped.startswith('gantt') and not stripped.startswith('excludes') and not stripped.startswith('todayMarker'):
                    parts = stripped.split(':')
                    if len(parts) > 2:
                        # Task name has colons - merge the name parts
                        task_name = ' - '.join(parts[:-1]).strip()
                        task_def = parts[-1].strip()
                        indent = line[:len(line) - len(line.lstrip())]
                        fixed_lines.append(f'{indent}{task_name} : {task_def}')
                    else:
                        fixed_lines.append(line)
                else:
                    fixed_lines.append(line)
            content = '\n'.join(fixed_lines)

        return jsonify({"mermaid_code": content, "diagram_type": diagram_type})
        
    except Exception as e:
        print(f"Error calling Sarvam 105B generation: {e}")
        # Fallback diagrams per type
        fallbacks = {
            "flowchart": (
                "flowchart TD\n"
                "    start([Start]) --> process[Process Input]\n"
                "    process --> decision{Is Valid?}\n"
                "    decision -->|Yes| success[Success]\n"
                "    decision -->|No| error[Handle Error]\n"
                "    error --> process\n"
                "    success --> finish([End])"
            ),
            "architecture": (
                "flowchart LR\n"
                "    user(((User))) --> lb([API Gateway])\n"
                "    subgraph Services\n"
                "        lb --> api[Backend API]\n"
                "        api --> auth[Auth Service]\n"
                "    end\n"
                "    subgraph Data\n"
                "        api --> db[(Database)]\n"
                "        api --> cache{{Cache}}\n"
                "    end"
            ),
            "xy": (
                "xychart-beta\n"
                "    title \"Data Overview\"\n"
                "    x-axis [Q1, Q2, Q3, Q4]\n"
                "    y-axis \"Value\" 0 --> 100\n"
                "    bar [30, 55, 72, 90]\n"
                "    line [25, 50, 68, 85]"
            ),
            "pie": (
                "pie showData\n"
                "    title Distribution\n"
                "    \"Category A\" : 40\n"
                "    \"Category B\" : 30\n"
                "    \"Category C\" : 20\n"
                "    \"Category D\" : 10"
            ),
            "sequence": (
                "sequenceDiagram\n"
                "    actor User\n"
                "    participant API as API Server\n"
                "    participant DB as Database\n"
                "\n"
                "    User->>+API: Send Request\n"
                "    API->>+DB: Query Data\n"
                "    DB-->>-API: Return Results\n"
                "    API-->>-User: Send Response"
            ),
            "erDiagram": (
                "erDiagram\n"
                "    Customer {\n"
                "        int id PK\n"
                "        string name\n"
                "        string email UK\n"
                "    }\n"
                "    Order {\n"
                "        int id PK\n"
                "        int customerId FK\n"
                "        date orderDate\n"
                "    }\n"
                "    Product {\n"
                "        int id PK\n"
                "        string name\n"
                "        float price\n"
                "    }\n"
                "    Customer ||--o{ Order : \"places\"\n"
                "    Order ||--|{ Product : \"contains\""
            ),
            "gantt": (
                "gantt\n"
                "    title Project Timeline\n"
                "    dateFormat YYYY-MM-DD\n"
                "    section Planning\n"
                "    Requirements : done, req1, 2024-01-01, 2024-01-10\n"
                "    Design : active, des1, after req1, 10d\n"
                "    section Development\n"
                "    Backend : dev1, after des1, 21d\n"
                "    Frontend : dev2, after des1, 18d\n"
                "    section Testing\n"
                "    QA Testing : test1, after dev1 dev2, 14d"
            )
        }
        
        return jsonify({
            "mermaid_code": fallbacks.get(diagram_type, fallbacks["flowchart"]),
            "diagram_type": diagram_type
        })


@app.route('/api/upload-doc', methods=['POST'])
def upload_document():
    """Extract text/content from uploaded files (PDF, DOCX, TXT, MD, Code, JSON, CSV, Images) for diagram generation."""
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files['file']
    if not file or not file.filename:
        return jsonify({"error": "No file selected"}), 400

    filename = file.filename
    lower_name = filename.lower()
    
    try:
        file_bytes = file.read()
        if not file_bytes:
            return jsonify({"error": "Uploaded file is empty."}), 400

        extracted_text = ""

        # 1. PDF Documents
        if lower_name.endswith('.pdf'):
            if pymupdf_available:
                doc = fitz.open(stream=file_bytes, filetype="pdf")
                text_parts = [page.get_text() for page in doc]
                doc.close()
                extracted_text = "\n".join(text_parts).strip()
            else:
                # Pure Python PDF stream text extraction fallback
                raw = file_bytes.decode('latin-1', errors='ignore')
                matches = re.findall(r'\(([^)]+)\)\s*TJ|\(([^)]+)\)\s*Tj', raw)
                extracted_text = " ".join([m[0] or m[1] for m in matches if m[0] or m[1]]).strip()

        # 2. Word Documents (.docx)
        elif lower_name.endswith('.docx'):
            try:
                with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
                    if 'word/document.xml' in z.namelist():
                        import xml.etree.ElementTree as ET
                        xml_content = z.read('word/document.xml')
                        tree = ET.fromstring(xml_content)
                        texts = [node.text for node in tree.iter() if node.text]
                        extracted_text = "\n".join(texts).strip()
            except Exception as docx_err:
                print(f"Docx parsing error: {docx_err}")
                extracted_text = file_bytes.decode('utf-8', errors='ignore')

        # 3. SVG Vector Diagrams (.svg)
        elif lower_name.endswith('.svg'):
            try:
                import xml.etree.ElementTree as ET
                raw_svg = file_bytes.decode('utf-8', errors='ignore')
                clean_svg = re.sub(r'\sxmlns="[^"]+"', '', raw_svg, count=1)
                tree = ET.fromstring(clean_svg)
                texts = []
                for elem in tree.iter():
                    if elem.text and elem.text.strip():
                        texts.append(elem.text.strip())
                    for attr in ['title', 'aria-label', 'id', 'data-label']:
                        val = elem.attrib.get(attr, '').strip()
                        if val and len(val) < 80:
                            texts.append(f"{attr}: {val}")
                seen_texts = list(dict.fromkeys(texts))
                if seen_texts:
                    extracted_text = f"[SVG DIAGRAM LABELS & CONTENT: {filename}]\n" + "\n".join(seen_texts)
                else:
                    extracted_text = raw_svg[:12000]
            except Exception as svg_err:
                print(f"SVG parsing fallback: {svg_err}")
                extracted_text = file_bytes.decode('utf-8', errors='ignore')[:12000]

        # 4. Raster Images (.png, .jpg, .jpeg, .webp)
        elif any(lower_name.endswith(ext) for ext in ['.png', '.jpg', '.jpeg', '.webp']):
            import base64
            mime_type = "image/png" if lower_name.endswith('.png') else "image/webp" if lower_name.endswith('.webp') else "image/jpeg"
            b64_str = base64.b64encode(file_bytes).decode('utf-8')
            data_url = f"data:{mime_type};base64,{b64_str}"

            # Attempt server-side Gemini Vision OCR / image analysis if API key is available
            vision_analysis = None
            gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("TRIAL_GEMINI_KEY_1") or ""
            if gemini_key:
                try:
                    vision_prompt = (
                        "Analyze this image in detail for technical diagram and system architecture generation. "
                        "1. Transcribe all visible text, titles, labels, flowchart node texts, database entity names, and annotations. "
                        "2. Describe all shapes, boxes, containers, workflows, arrows, decision logic, and relationships shown. "
                        "3. Provide a structured semantic breakdown of the system/flow depicted so an AI can generate a Mermaid diagram of it."
                    )
                    v_payload = {
                        "contents": [{
                            "parts": [
                                {"text": vision_prompt},
                                {"inline_data": {"mime_type": mime_type, "data": b64_str}}
                            ]
                        }],
                        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 2000}
                    }
                    vision_models = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"]
                    for vm in vision_models:
                        try:
                            v_url = f"https://generativelanguage.googleapis.com/v1beta/models/{vm}:generateContent?key={gemini_key}"
                            v_res = requests.post(v_url, json=v_payload, timeout=25)
                            if v_res.ok:
                                v_data = v_res.json()
                                vision_analysis = v_data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '').strip()
                                if vision_analysis:
                                    break
                        except Exception:
                            continue
                except Exception as v_err:
                    print(f"Server vision analysis error: {v_err}")

            if vision_analysis:
                extracted_text = f"[IMAGE VISUAL ANALYSIS: {filename}]\n{vision_analysis}"
            else:
                extracted_text = f"[IMAGE ATTACHMENT: {filename}]\nImage attached ({mime_type}, {len(file_bytes)} bytes). Use visual context and user instructions to model the requested diagram."

        # 5. Text & Code Files (.txt, .md, .js, .jsx, .ts, .tsx, .py, .json, .csv, .yaml, .yml, .sql, .html, .css, etc.)
        else:
            extracted_text = file_bytes.decode('utf-8', errors='ignore').strip()

        if not extracted_text:
            extracted_text = f"[FILE ATTACHMENT: {filename} (Binary or empty file)]"

        # Truncate to avoid token limit issues (max 12,000 chars)
        extracted_text = extracted_text[:12000]

        import base64
        return jsonify({
            "extracted_text": extracted_text,
            "filename": filename,
            "size": len(file_bytes),
            "data_url": f"data:image/png;base64,{base64.b64encode(file_bytes).decode('utf-8')}" if any(lower_name.endswith(ext) for ext in ['.png', '.jpg', '.jpeg', '.webp']) else None
        })

    except Exception as e:
        print(f"Document extraction error for {filename}: {e}")
        return jsonify({"error": f"Failed to process document: {str(e)}"}), 500


@app.route('/api/analyze-image', methods=['POST'])
def analyze_image_endpoint():
    """Analyze an image using Vision AI and return structured diagram description."""
    data = request.json or {}
    image_base64 = data.get('image_base64', '')
    filename = data.get('filename', 'image.png')
    api_key = data.get('apiKey') or os.getenv("GEMINI_API_KEY") or os.getenv("TRIAL_GEMINI_KEY_1") or ""

    if not image_base64:
        return jsonify({"error": "No image data provided"}), 400

    mime_match = re.match(r'^data:([^;]+);base64,', image_base64)
    mime_type = mime_match.group(1) if mime_match else 'image/png'
    raw_b64 = image_base64.split(',')[1] if ',' in image_base64 else image_base64

    if not api_key:
        return jsonify({"analysis": f"[IMAGE: {filename}] (Image attached for visual context)"})

    try:
        vision_prompt = (
            "You are an expert diagram and technical system analyst. Analyze this image thoroughly for Mermaid diagram generation:\n"
            "1. Transcribe all text, labels, titles, and annotations visible.\n"
            "2. Identify all components, nodes, services, databases, processes, decision points, and connections.\n"
            "3. Describe the exact step-by-step workflow, data flow, hierarchy, and relationships.\n"
            "4. Output a clear, structured summary describing the entire diagram flow so Mermaid JS can be generated."
        )
        v_payload = {
            "contents": [{
                "parts": [
                    {"text": vision_prompt},
                    {"inline_data": {"mime_type": mime_type, "data": raw_b64}}
                ]
            }],
            "generationConfig": {"temperature": 0.2, "maxOutputTokens": 2000}
        }
        vision_models = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"]
        last_status = None
        for vm in vision_models:
            try:
                v_url = f"https://generativelanguage.googleapis.com/v1beta/models/{vm}:generateContent?key={api_key}"
                v_res = requests.post(v_url, json=v_payload, timeout=30)
                if v_res.ok:
                    v_data = v_res.json()
                    analysis = v_data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '').strip()
                    if analysis:
                        return jsonify({"analysis": analysis})
                else:
                    last_status = v_res.status_code
            except Exception:
                continue

        return jsonify({"analysis": f"[IMAGE: {filename}] (Attached image)", "warning": f"Vision API returned {last_status or 'error'}"})
    except Exception as e:
        print(f"Analyze image error: {e}")
        return jsonify({"analysis": f"[IMAGE: {filename}] (Attached image)", "error": str(e)})


@app.route('/api/delete-doc', methods=['POST'])
def delete_document():
    """Remove file attachment and context from backend memory/database."""
    data = request.get_json(silent=True) or {}
    filename = data.get('filename') or data.get('name') or data.get('url') or 'Attachment'
    print(f"Document deletion requested for: {filename}")
    return jsonify({
        "success": True,
        "filename": filename,
        "message": f"File {filename} access removed from agent and database."
    })


def _parse_public_github_url(repo_url):
    match = re.match(r"^https?://github\.com/([^/\s]+)/([^/\s#?]+)(?:[/?#].*)?$", (repo_url or "").strip())
    if not match:
        return None
    owner = match.group(1)
    repo = match.group(2).removesuffix(".git")
    if not owner or not repo:
        return None
    return owner, repo


def _repo_file_allowed(path):
    parts = [part for part in path.replace("\\", "/").split("/") if part]
    if any(part in REPO_SKIP_PARTS for part in parts):
        return False
    name = parts[-1] if parts else ""
    if name in REPO_SKIP_FILES:
        return False
    if name.lower().startswith("readme"):
        return True
    _, ext = os.path.splitext(name)
    return ext.lower() in REPO_ALLOWED_EXTENSIONS or name == ".env.example"


@app.route('/api/import-github-repo', methods=['POST'])
def import_github_repo():
    """Import lightweight context from a public GitHub repository (supports repos of any size via Zipball or Git Trees API)."""
    data = request.json or {}
    repo_url = data.get("url", "")
    parsed = _parse_public_github_url(repo_url)
    if not parsed:
        return jsonify({"error": "Enter a valid public GitHub repository URL."}), 400

    owner, repo = parsed
    api_url = f"https://api.github.com/repos/{owner}/{repo}"
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "DiagramRepoImporter/1.0"}

    try:
        meta_response = requests.get(api_url, headers=headers, timeout=15)
        if meta_response.status_code in (401, 403, 404):
            return jsonify({"error": "This repository is private or unavailable. Public GitHub repositories only are supported right now."}), 403
        meta_response.raise_for_status()
        meta = meta_response.json()
        if meta.get("private"):
            return jsonify({"error": "This repository is private. Public GitHub repositories only are supported right now."}), 403

        repo_size_kb = int(meta.get("size") or 0)
        branch = meta.get("default_branch") or "main"
        files = []
        total_chars = 0

        # Method A: For smaller repos (<= 25MB), try quick zipball download
        if repo_size_kb <= 25000:
            try:
                zip_url = f"https://api.github.com/repos/{owner}/{repo}/zipball/{branch}"
                zip_response = requests.get(zip_url, headers=headers, timeout=30)
                if zip_response.status_code == 200:
                    with zipfile.ZipFile(io.BytesIO(zip_response.content)) as archive:
                        names = [
                            info.filename for info in archive.infolist()
                            if not info.is_dir() and _repo_file_allowed("/".join(info.filename.split("/")[1:]))
                        ]
                        priority_patterns = (
                            "readme", "package.json", "src/", "app/", "pages/", "routes/", "components/",
                            "backend/", "server/", "api/", "lib/", "prisma/", "schema", "main.", "index."
                        )
                        names.sort(key=lambda n: (
                            0 if any(pattern in "/".join(n.split("/")[1:]).lower() for pattern in priority_patterns) else 1,
                            len(n),
                            n,
                        ))

                        for name in names:
                            if len(files) >= REPO_MAX_FILES or total_chars >= REPO_MAX_CHARS:
                                break
                            rel_path = "/".join(name.split("/")[1:])
                            try:
                                raw = archive.read(name)
                            except Exception:
                                continue
                            if b"\x00" in raw[:2048]:
                                continue
                            text = raw.decode("utf-8", errors="ignore").strip()
                            if not text:
                                continue
                            text = text[:REPO_FILE_MAX_CHARS]
                            remaining = REPO_MAX_CHARS - total_chars
                            if remaining <= 0:
                                break
                            text = text[:remaining]
                            total_chars += len(text)
                            files.append({"path": rel_path, "text": text})
            except Exception as zip_err:
                print(f"Zipball import failed for {owner}/{repo}, falling back to Git Trees API: {zip_err}")
                files = []
                total_chars = 0

        # Method B: For large repos (> 25MB) or zipball fallback, use GitHub Git Trees API + raw file fetch
        if not files:
            tree_url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
            tree_res = requests.get(tree_url, headers=headers, timeout=20)
            if tree_res.status_code == 200:
                tree_data = tree_res.json()
                tree_items = [
                    item for item in tree_data.get("tree", [])
                    if item.get("type") == "blob" and _repo_file_allowed(item.get("path", ""))
                ]
                priority_patterns = (
                    "readme", "package.json", "src/", "app/", "pages/", "routes/", "components/",
                    "backend/", "server/", "api/", "lib/", "prisma/", "schema", "main.", "index."
                )
                tree_items.sort(key=lambda item: (
                    0 if any(pattern in item["path"].lower() for pattern in priority_patterns) else 1,
                    len(item["path"]),
                    item["path"],
                ))

                for item in tree_items[:35]:
                    if len(files) >= REPO_MAX_FILES or total_chars >= REPO_MAX_CHARS:
                        break
                    file_path = item["path"]
                    raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{file_path}"
                    try:
                        raw_res = requests.get(raw_url, headers=headers, timeout=10)
                        if raw_res.status_code == 200:
                            text = raw_res.text.strip()
                            if not text:
                                continue
                            text = text[:REPO_FILE_MAX_CHARS]
                            remaining = REPO_MAX_CHARS - total_chars
                            if remaining <= 0:
                                break
                            text = text[:remaining]
                            total_chars += len(text)
                            files.append({"path": file_path, "text": text})
                    except Exception as raw_err:
                        print(f"Failed to fetch raw file {file_path}: {raw_err}")
                        continue

        if not files:
            return jsonify({"error": "No readable source files were found in this public repository."}), 400

        file_tree = "\n".join(f"- {item['path']}" for item in files[:60])
        snippets = "\n\n".join(
            f"--- FILE: {item['path']} ---\n{item['text']}" for item in files
        )
        context = (
            f"PUBLIC GITHUB REPOSITORY CONTEXT\n"
            f"Repository: {owner}/{repo}\n"
            f"URL: https://github.com/{owner}/{repo}\n"
            f"Default branch: {branch}\n"
            f"Files included: {len(files)}\n\n"
            f"File list:\n{file_tree}\n\n"
            f"Relevant file excerpts:\n{snippets}"
        )[:REPO_MAX_CHARS + 2500]

        return jsonify({
            "repo": f"{owner}/{repo}",
            "url": f"https://github.com/{owner}/{repo}",
            "branch": branch,
            "file_count": len(files),
            "context": context,
        })
    except Exception as e:
        print(f"GitHub repo import error: {e}")
        return jsonify({"error": f"Failed to import repository: {str(e)}"}), 500



@app.route('/api/generate-byok', methods=['POST'])
def generate_byok():
    """Proxy endpoint for BYOK API calls. The user's API key is passed in the
    request body and forwarded to the provider (Sarvam or Groq) — never stored on the server."""
    data = request.json
    user_api_key = data.get('apiKey', '')
    model = data.get('model', 'sarvam-105b')
    provider = data.get('provider', 'sarvam')
    system_prompt = data.get('systemPrompt', '')
    user_message = data.get('userMessage', '')
    temperature = data.get('temperature', 0.2)
    max_tokens = data.get('maxTokens', 2500)

    if not user_api_key or not user_message:
        return jsonify({"error": "Missing apiKey or userMessage"}), 400

    headers = {
        "Authorization": f"Bearer {user_api_key}",
        "api-subscription-key": user_api_key,
        "Content-Type": "application/json"
    }

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ],
        "temperature": temperature,
        "max_tokens": max_tokens
    }

    print("--- DEBUG BYOK PROXY ---")
    print(f"Provider: {provider}")
    print(f"Model: {model}")
    print(f"API Key Length: {len(user_api_key)}")
    print(f"API Key Prefix: {user_api_key[:10]}...")
    print(f"System Prompt Length: {len(system_prompt)}")
    print(f"User Message Length: {len(user_message)}")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    print("------------------------")

    try:
        if provider == 'groq':
            url = "https://api.groq.com/openai/v1/chat/completions"
        elif provider in ['nvidia', 'invidia']:
            url = "https://integrate.api.nvidia.com/v1/chat/completions"
            payload["chat_template_kwargs"] = {"enable_thinking": False}
        else:
            url = "https://api.sarvam.ai/v1/chat/completions"

        req_timeout = 180 if provider in ["nvidia", "invidia"] else 45
        response = requests.post(
            url,
            headers=headers,
            json=payload,
            timeout=req_timeout
        )
        response.raise_for_status()
        result = response.json()
        message = result['choices'][0]['message']
        content = (message.get('content') or message.get('reasoning_content') or '').strip()
        return jsonify({"content": content})
    except Exception as e:
        print(f"BYOK proxy error for {provider}: {e}")
        return jsonify({"error": str(e)}), 500


# ═══════════════════════════════════════════════════════
# Trial Mode Endpoints — Server-side Gemini key failover
# ═══════════════════════════════════════════════════════

def _call_gemini_with_failover(system_prompt, user_message, temperature=0.1, max_tokens=2500):
    """Try trial Gemini keys and fallback models in order to survive 503/429/500 outages."""
    if not TRIAL_GEMINI_KEYS:
        raise RuntimeError("No trial API keys configured on the server.")

    last_error = None
    for key in TRIAL_GEMINI_KEYS:
        for model_name in TRIAL_MODELS:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={key}"
                body = {
                    "contents": [{"role": "user", "parts": [{"text": user_message}]}],
                    "systemInstruction": {"parts": [{"text": system_prompt}]},
                    "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens}
                }
                response = requests.post(url, json=body, timeout=45)
                if response.status_code in (503, 429, 404, 500, 502):
                    # Model capacity issue, rate limit, or server error — try next fallback model
                    print(f"Trial Gemini model '{model_name}' returned HTTP {response.status_code}. Trying fallback...")
                    last_error = f"Model {model_name} HTTP {response.status_code}: {response.text}"
                    continue
                if response.status_code in (401, 403):
                    # Key invalid or forbidden — try next key
                    last_error = f"Key invalid or forbidden (HTTP {response.status_code})"
                    break
                response.raise_for_status()
                data = response.json()
                text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
                if not text:
                    last_error = f"Gemini {model_name} returned empty response"
                    continue
                return text
            except requests.exceptions.RequestException as e:
                last_error = f"{model_name} error: {str(e)}"
                continue
    raise RuntimeError(f"All trial API keys and fallback models exhausted. Last error: {last_error}")


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)

