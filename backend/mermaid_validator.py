import re


HEADER_BY_TYPE = {
    "flowchart": ("flowchart ", "graph "),
    "swimlane": ("swimlane-beta", "swimlane"),
    "architecture": ("flowchart ", "graph "),
    "sequence": ("sequenceDiagram", "flowchart ", "graph "),
    "classDiagram": ("classDiagram", "flowchart ", "graph "),
    "stateDiagram": ("stateDiagram-v2", "stateDiagram", "flowchart ", "graph "),
    "erDiagram": ("erDiagram", "flowchart ", "graph "),
    "userJourney": ("journey",),
    "gantt": ("gantt",),
    "pie": ("pie",),
    "quadrantChart": ("quadrantChart",),
    "requirementDiagram": ("requirementDiagram",),
    "gitGraph": ("gitGraph",),
    "c4Diagram": ("C4Context", "C4Container", "C4Component", "C4Dynamic"),
    "mindmap": ("mindmap",),
    "timeline": ("timeline",),
    "sankey": ("sankey-beta", "sankey"),
    "xy": ("xychart-beta",),
    "block": ("block-beta", "block"),
    "packet": ("packet-beta", "packet", "flowchart ", "graph "),
    "kanban": ("flowchart ", "graph ", "kanban"),
    "radar": ("radar-beta", "radar", "---"),
    "eventModeling": ("eventmodeling", "eventModeling"),
    "treemap": ("treemap-beta", "treemap", "flowchart ", "graph "),
    "venn": ("venn-beta", "venn", "flowchart ", "graph "),
    "ishikawa": ("ishikawa-beta", "ishikawa", "flowchart ", "graph "),
    "wardley": ("wardley-beta", "wardley"),
    "cynefin": ("cynefin-beta", "cynefin"),
    "treeView": ("flowchart ", "graph ", "mindmap", "treeView-beta", "treeview-beta", "treeView", "treeview"),
    "useCase": ("flowchart ", "graph ", "usecase-beta", "usecase", "usecaseDiagram"),
}


def _clean_state_diagram(content):
    if not content:
        return ""
    lines = []
    has_header = False
    for line in content.splitlines():
        trimmed = line.strip()
        if not trimmed:
            continue
        if trimmed.startswith("stateDiagram"):
            has_header = True
            lines.append("stateDiagram-v2")
            continue

        clean_l = re.sub(r"\[\*\]:::[a-zA-Z0-9_]+", "[*]", line)
        if re.match(r"^\s*class\s+\[\*\].*", clean_l):
            continue

        clean_l = re.sub(r"-->\s*\|([^|]+)\|\s*([a-zA-Z0-9_]+)", r"--> \2 : \1", clean_l)

        bracket_match = re.match(r"^\s*([a-zA-Z0-9_]+)\[([^\]]+)\]\s*$", clean_l)
        if bracket_match:
            clean_l = f'    state "{bracket_match.group(2).strip()}" as {bracket_match.group(1).strip()}'

        if trimmed.startswith("subgraph "):
            sg_name = trimmed.replace("subgraph ", "").strip().replace('"', '')
            clean_l = f"    state {sg_name} {{"
        elif trimmed == "end":
            clean_l = "    }"

        lines.append(clean_l)

    if not has_header:
        lines.insert(0, "stateDiagram-v2")
    return "\n".join(lines).strip()


def _clean_sequence(content):
    if not content:
        return ""

    # Check if this is actually a flowchart mistakenly labeled as sequence
    body_text = "\n".join([l for l in content.splitlines() if l.strip() != "sequenceDiagram"])
    is_flowchart_body = bool(re.search(r'\bsubgraph\b|:::[a-zA-Z_]|\(\[[^\]]+\]\)|\{\{[^\}]+\}\}|-->', body_text)) and not bool(re.search(r'->>|-->>|\bparticipant\b|\bactor\b', body_text))
    if is_flowchart_body:
        flow_dir = "LR" if "direction LR" in body_text or "flowchart LR" in content else "TD"
        return clean_mermaid_code(f"flowchart {flow_dir}\n" + body_text, "flowchart")

    lines = []
    has_header = False
    for line in content.splitlines():
        trimmed = line.strip()
        if not trimmed:
            continue
        if trimmed == "sequenceDiagram":
            has_header = True
            lines.append("sequenceDiagram")
            continue

        clean_l = line

        # (actor|participant) "Label" as Alias -> (actor|participant) Alias as Label
        rev_match = re.match(r'^(\s*)(actor|participant)\s+["\']([^"\']+)["\']\s+as\s+["\']?([A-Za-z0-9_]+)["\']?\s*$', clean_l, re.IGNORECASE)
        if rev_match:
            indent, kw, label, alias = rev_match.groups()
            clean_label = label.replace('"', '').replace("'", "").strip()
            lines.append(f"{indent}{kw} {alias} as {clean_label}")
            continue

        # (actor|participant) Alias as "Label" -> (actor|participant) Alias as Label
        std_match = re.match(r'^(\s*)(actor|participant)\s+["\']?([A-Za-z0-9_]+)["\']?\s+as\s+["\']([^"\']+)["\']\s*$', clean_l, re.IGNORECASE)
        if std_match:
            indent, kw, alias, label = std_match.groups()
            clean_label = label.replace('"', '').replace("'", "").strip()
            lines.append(f"{indent}{kw} {alias} as {clean_label}")
            continue

        # (actor|participant) "Label" -> (actor|participant) Label
        quote_only = re.match(r'^(\s*)(actor|participant)\s+["\']([^"\']+)["\']\s*$', clean_l, re.IGNORECASE)
        if quote_only:
            indent, kw, label = quote_only.groups()
            clean_label = label.replace('"', '').replace("'", "").strip()
            if ' ' in clean_label:
                alias = re.sub(r'[^A-Za-z0-9_]', '_', clean_label)
                lines.append(f"{indent}{kw} {alias} as {clean_label}")
            else:
                lines.append(f"{indent}{kw} {clean_label}")
            continue

        # Strip quotes around participant identifiers on interaction arrows
        clean_l = re.sub(r'(^|\s)["\']([A-Za-z0-9_]+)["\'](\s*-[->>x)]+)', r'\1\2\3', clean_l)
        clean_l = re.sub(r'(-[->>x)]+[+-]?\s*)["\']([A-Za-z0-9_]+)["\'](\s*:)', r'\1\2\3', clean_l)

        lines.append(clean_l)

    if not has_header:
        lines.insert(0, "sequenceDiagram")
    return "\n".join(lines).strip()



def clean_mermaid_code(content, diagram_type):
    """Normalize common LLM output mistakes without changing intent."""
    if not content:
        return ""

    content = content.strip()

    fenced_blocks = re.findall(r"```(?:mermaid)?\s*(.*?)```", content, flags=re.DOTALL | re.IGNORECASE)
    if fenced_blocks:
        content = fenced_blocks[-1].strip()
    else:
        header_pattern = r"(flowchart\s+(?:TD|LR|BT|RL)|flowchart-elk|graph\s+(?:TD|LR|BT|RL)|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie(?:\s+showData)?|quadrantChart|requirementDiagram|gitGraph|C4Context|C4Container|mindmap|timeline|sankey-beta|xychart-beta|block-beta|venn-beta|ishikawa-beta|treemap-beta|treeView-beta|treeview-beta|packet-beta|packet|wardley-beta|wardley|cynefin-beta|cynefin|eventmodeling|eventModeling|usecase-beta|usecase|usecaseDiagram|kanban|agentflow-beta|agentflow)"
        match = re.search(header_pattern, content)
        if match:
            content = content[match.start():].strip()

    content = re.sub(r"^```(?:mermaid)?\s*\n?", "", content.strip())
    content = re.sub(r"\n?```\s*$", "", content)
    content = content.replace("```mermaid", "").replace("```", "").strip()

    # Strip internal tags that sometimes leak from model outputs.
    content = re.sub(
        r"<(?:thought|think|tool_call|debug|internal)[^>]*>.*?</(?:thought|think|tool_call|debug|internal)>",
        "",
        content,
        flags=re.DOTALL,
    ).strip()

    header_keywords = [
        "flowchart ", "flowchart-elk", "graph ", "sequenceDiagram", "classDiagram", "stateDiagram-v2", "stateDiagram",
        "erDiagram", "journey", "gantt", "pie", "quadrantChart", "requirementDiagram", "gitGraph",
        "C4Context", "C4Container", "mindmap", "timeline", "sankey-beta", "xychart-beta", "block-beta", "venn-beta",
        "treeView-beta", "treeview-beta", "treeView", "treeview", "treemap-beta", "ishikawa-beta", "radar-beta",
        "packet-beta", "packet", "wardley-beta", "wardley", "cynefin-beta", "cynefin", "eventmodeling", "eventModeling",
        "usecase-beta", "usecase", "usecaseDiagram", "kanban", "agentflow-beta", "agentflow"
    ]
    header_count = 0
    cleaned_lines = []
    for line in content.splitlines():
        stripped = line.strip()
        is_header = any(stripped.startswith(keyword) for keyword in header_keywords)
        if is_header:
            header_count += 1
            if header_count > 1:
                continue
        cleaned_lines.append(line.rstrip())
    content = "\n".join(cleaned_lines).strip()

    if diagram_type == "stateDiagram" or content.startswith("stateDiagram"):
        content = _clean_state_diagram(content)

    if diagram_type == "sequence" or content.startswith("sequenceDiagram"):
        content = _clean_sequence(content)

    if diagram_type in ("flowchart", "architecture", "kanban", "useCase") or any(l.strip().startswith(("flowchart ", "graph ")) for l in content.splitlines()):
        content = _restore_flowchart_line_breaks(content)
        content = re.sub(r"(^|\n)end(\s*[-=]>|[\(\[\{])", r"\1finish\2", content)
        content = re.sub(r"([\(\[\{])end([\)\]\}])", r"\1finish\2", content)
        content = re.sub(r"([-=]>(?:\s*\|[^|]*\|)?\s*)end(\s|[\(\[\{\n]|$)", r"\1finish\2", content)
        content = re.sub(r"(\w+)\s*\(\(\s*([\[\{\(])", r"\1\2", content)
        content = re.sub(r"([\]\}\)])\s*\)\)", r"\1", content)
        content = re.sub(r"(?<!:)::([a-zA-Z_]\w*)", r":::\1", content)
        content = _trim_invalid_link_styles(content)

        # 1. Fix malformed parallelogram brackets [/"text"/]/]
        content = re.sub(r'(\[/[^/\n]+/[^\]\n]*\])/\]', r'\1', content)
        content = re.sub(r'(\[/[^/\n]+/[^\]\n]*)/\]', r'\1]', content)

        # 2. Fix triple-nested shape brackets ([("...")] or [(( "..."))]
        content = re.sub(r'\(\[\(\s*["\']?([^"\'\n]+)["\']?\s*\)\]\)', r'(["\1"])', content)
        content = re.sub(r'\[\(\[\s*["\']?([^"\'\n]+)["\']?\s*\]\)\]', r'(["\1"])', content)
        content = re.sub(r'\[\(\(\s*["\']?([^"\'\n]+)["\']?\s*\)\)\]', r'[("\1")]', content)
        content = re.sub(r'\(\(\[\s*["\']?([^"\'\n]+)["\']?\s*\]\)\)', r'(["\1"])', content)
        content = re.sub(r'\(\[\("([^"]*)"\)\)\]', r'(["\1"])', content)
        content = re.sub(r'\[\(\("([^"]*)"\)\)\]', r'(["\1"])', content)

        # 3. Fix unquoted guillemets in edge labels: |«include»| -> |"«include»"|
        content = re.sub(r'\|(«[^»|\n]+»)\|', r'|"\1"|', content)

        # 4. Fix quoted node declarations at start of line: "Task 5"["Define Scope"] -> Task_5["Define Scope"]
        content = re.sub(r'^[ \t]*["\']([A-Za-z0-9_ -]+)["\'](\s*\[)', lambda m: f'    {m.group(1).strip().replace(" ", "_")}{m.group(2)}', content, flags=re.MULTILINE)

        # 5. Fix quoted node IDs in connections: "Task 5" --> "Task 1" -> Task_5 --> Task_1
        def _clean_quoted_conn(m):
            src = m.group(1).strip().replace(" ", "_")
            arrow = m.group(2)
            dst = m.group(3).strip().replace(" ", "_")
            return f"{src} {arrow} {dst}"
        content = re.sub(r'["\']([A-Za-z0-9_ -]+)["\']\s*(-->|-\.->|==>|---|~~~)\s*["\']([A-Za-z0-9_ -]+)["\']', _clean_quoted_conn, content)
        content = re.sub(r'["\']([A-Za-z0-9_ -]+)["\']\s*(-->|-\.->|==>|---|~~~)', lambda m: f'{m.group(1).strip().replace(" ", "_")} {m.group(2)}', content)
        content = re.sub(r'(-->|-\.->|==>|---|~~~)\s*["\']([A-Za-z0-9_ -]+)["\']', lambda m: f'{m.group(1)} {m.group(2).strip().replace(" ", "_")}', content)

        # 6. Fix quoted node IDs in class statements: class "Task 5","Task 6" cardStyle; -> class Task_5,Task_6 cardStyle;
        def _clean_class_stmt(m):
            raw_items = m.group(1).split(",")
            cleaned_items = [it.strip().strip('"\'').replace(" ", "_") for it in raw_items if it.strip()]
            return f"class {','.join(cleaned_items)} {m.group(2)};"
        content = re.sub(r'class\s+([^\n;]+)\s+([A-Za-z0-9_-]+)\s*;?', _clean_class_stmt, content)

        # 7. Sanitize classDef and style statements (strip shadow:..., filter:..., rgba(...))
        sanitized_lines = []
        for l in content.splitlines():
            st = l.strip()
            if st.startswith(("classDef ", "style ")):
                l = re.sub(r',?\s*shadow:[^,;]+', '', l)
                l = re.sub(r',?\s*filter:[^,;]+', '', l)
                l = re.sub(r'rgba?\([^)]+\)', '#091e42', l)
                l = re.sub(r',\s*,', ',', l)
                l = re.sub(r'\s*,\s*;', ';', l)
                l = re.sub(r'(classDef\s+\w+\s*),', r'\1', l)
            sanitized_lines.append(l)
        content = "\n".join(sanitized_lines)


    if diagram_type == "sankey" or "sankey-beta" in content:
        lines = []
        for line in content.splitlines():
            stripped = line.strip()
            if stripped and not stripped.startswith("sankey-beta") and not stripped.startswith("---") and not stripped.startswith("config") and not stripped.startswith("theme:") and not stripped.startswith("%%"):
                # Strip double quotes from CSV columns: "A", "B", 120 -> A, B, 120
                parts = [p.strip().strip('"\'') for p in stripped.split(",")]
                if len(parts) >= 3:
                    lines.append(f"  {parts[0]}, {parts[1]}, {parts[2]}")
                else:
                    lines.append(line)
            else:
                lines.append(line)
        content = "\n".join(lines).strip()

    if diagram_type == "block" or content.startswith("block-beta") or content.startswith("block"):
        lines = [l.rstrip() for l in content.splitlines() if l.strip()]
        if lines:
            first = lines[0].strip()
            if first.startswith("block") and not first.startswith("block-beta"):
                lines[0] = "block-beta"
            elif not first.startswith("block-beta"):
                lines = ["block-beta"] + [l for l in lines if not l.strip().startswith("block-beta")]
            else:
                lines[0] = "block-beta"

            merged = []
            i = 0
            while i < len(lines):
                curr = lines[i]
                curr = re.sub(r"&(?:nbsp|#160);", " ", curr, flags=re.IGNORECASE)
                curr = re.sub(r"(fill|stroke|color):#([0-9a-fA-F]{3,8})[a-zA-Z]+", r"\1:#\2", curr)
                stripped_curr = curr.strip()
                if i < len(lines) - 1:
                    next_l = re.sub(r"&(?:nbsp|#160);", " ", lines[i + 1], flags=re.IGNORECASE)
                    stripped_next = next_l.strip()
                    if re.match(r"^[A-Za-z0-9_]+<.*>$", stripped_curr) and re.match(r"^\((?:down|up|right|left|x)\)(?::\d+)?$", stripped_next):
                        merged.append(f"    {stripped_curr}{stripped_next}")
                        i += 2
                        continue
                merged.append(curr)
                i += 1
            content = "\n".join(merged).strip()

    if diagram_type == "swimlane" or content.startswith("swimlane-beta") or content.startswith("swimlane"):
        lines = [l.rstrip() for l in content.splitlines() if l.strip()]
        if lines:
            first = lines[0].strip()
            if first.startswith("flowchart") or first.startswith("graph"):
                dir_match = re.search(r"\b(LR|RL|TB|BT|TD)\b", first, re.IGNORECASE)
                direction = dir_match.group(1).upper() if dir_match else "LR"
                lines[0] = f"swimlane-beta {direction}"
            elif first.startswith("swimlane") and not first.startswith("swimlane-beta"):
                dir_match = re.search(r"\b(LR|RL|TB|BT|TD)\b", first, re.IGNORECASE)
                direction = dir_match.group(1).upper() if dir_match else "LR"
                lines[0] = f"swimlane-beta {direction}"
            elif first.startswith("swimlane-beta"):
                if not re.search(r"\b(LR|RL|TB|BT|TD)\b", first, re.IGNORECASE):
                    lines[0] = "swimlane-beta LR"
            else:
                lines = ["swimlane-beta LR"] + [l for l in lines if not l.strip().startswith("swimlane-beta")]

            subgraph_depth = 0
            cleaned_lines = []
            for line in lines:
                stripped = line.strip()
                if stripped.startswith("subgraph ") or stripped == "subgraph":
                    subgraph_depth += 1
                elif stripped == "end":
                    if subgraph_depth > 0:
                        subgraph_depth -= 1
                cleaned_lines.append(line)
            while subgraph_depth > 0:
                cleaned_lines.append("end")
                subgraph_depth -= 1
            content = "\n".join(cleaned_lines).strip()

    if diagram_type == "sequence" or content.startswith("sequenceDiagram"):
        body_lines = [l for l in content.splitlines() if l.strip() != "sequenceDiagram"]
        body_text = "\n".join(body_lines)
        is_flowchart_body = bool(re.search(r'\bsubgraph\b|:::[a-zA-Z_]|\(\[[^\]]+\]\)|\{\{[^\}]+\}\}|-->', body_text)) and not bool(re.search(r'->>|-->>|\bparticipant\b|\bactor\b', body_text))
        if is_flowchart_body:
            flow_dir = "LR" if "direction LR" in body_text or "flowchart LR" in content else "TD"
            return clean_mermaid_code(f"flowchart {flow_dir}\n" + body_text, "flowchart")

        lines = content.splitlines()
        if lines and lines[0].strip() != "sequenceDiagram":
            lines = ["sequenceDiagram"] + [line for line in lines if line.strip() != "sequenceDiagram"]
        
        # 1. Normalize reversed participant/actor declarations: e.g. `actor "User" as U` -> `actor U as User`
        normalized_decl = []
        for line in lines:
            # Match `actor "Label" as Alias` or `participant "Label" as Alias`
            rev_match = re.match(r'^(\s*)(actor|participant)\s+["\']([^"\']+)["\']\s+as\s+([A-Za-z0-9_]+)\s*$', line, re.IGNORECASE)
            if rev_match:
                indent, keyword, label, alias = rev_match.groups()
                normalized_decl.append(f'{indent}{keyword} {alias} as {label}')
                continue
            
            # Match `actor Multi Word Label as Alias` where label has spaces
            multi_match = re.match(r'^(\s*)(actor|participant)\s+([A-Za-z0-9_]+(?:\s+[A-Za-z0-9_]+)+)\s+as\s+([A-Za-z0-9_]+)\s*$', line, re.IGNORECASE)
            if multi_match:
                indent, keyword, label, alias = multi_match.groups()
                normalized_decl.append(f'{indent}{keyword} {alias} as {label}')
                continue
                
            normalized_decl.append(line)
        lines = normalized_decl

        # 2. Check if activations are unbalanced or go negative
        balance = {}
        has_activation_error = False
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("activate "):
                parts = stripped.split()
                if len(parts) >= 2:
                    alias = parts[1].strip()
                    balance[alias] = balance.get(alias, 0) + 1
            elif stripped.startswith("deactivate "):
                parts = stripped.split()
                if len(parts) >= 2:
                    alias = parts[1].strip()
                    balance[alias] = balance.get(alias, 0) - 1
                    if balance.get(alias, 0) < 0:
                        has_activation_error = True
                        break
            elif ":" in stripped and re.search(r"->|-->", stripped):
                prefix = stripped.split(":", 1)[0]
                actors = re.split(r"-+>>?[+-]?", prefix)
                if len(actors) >= 2:
                    src = actors[0].strip()
                    dst = actors[-1].strip()
                    if "->>+" in prefix or "->+" in prefix:
                        balance[dst] = balance.get(dst, 0) + 1
                    if "-->>-" in prefix or "-->-" in prefix:
                        balance[src] = balance.get(src, 0) - 1
                        if balance.get(src, 0) < 0:
                            has_activation_error = True
                            break
        if not has_activation_error:
            for val in balance.values():
                if val != 0:
                    has_activation_error = True
                    break

        fixed = []
        for line in lines:
            # If there is an activation error, strip all + and - from arrows
            if has_activation_error:
                line = re.sub(r"(-+>>?)\+", r"\1", line)
                line = re.sub(r"(-+>>?)-", r"\1", line)
                if line.strip().startswith(("activate ", "deactivate ")):
                    continue

            # Strip outer quotes and illegal characters from message labels
            match = re.match(r"(\s*\S+\s*-[->>x)]+[+-]?\s*\S+\s*:\s*)(.*)", line)
            if match:
                prefix = match.group(1)
                message = match.group(2).strip()
                if (message.startswith('"') and message.endswith('"')) or (message.startswith("'") and message.endswith("'")):
                    message = message[1:-1].strip()
                message = re.sub(r"<[^>]*>", "", message)
                message = message.replace(":", " -").replace(";", ",")
                fixed.append(prefix + message[:90])
            else:
                fixed.append(line)
        content = "\n".join(fixed)

    if diagram_type == "erDiagram":
        lines = content.splitlines()
        body_lines = [l for l in lines if l.strip() != "erDiagram"]
        body_text = "\n".join(body_lines)
        has_flowchart_header = any(re.match(r'^\s*(flowchart|graph)\b', l) for l in body_lines)
        has_chen_flowchart = bool(re.search(r'\[["\w]|---|\bclassDef\b|\bsubgraph\b|\(\[[^\]]+\]\)', body_text)) and not bool(re.search(r'\|[|o}{]+--[|o}{]+\||\{\s*$', body_text))
        if has_flowchart_header or has_chen_flowchart:
            if not has_flowchart_header:
                body_text = "flowchart TD\n" + body_text
            return clean_mermaid_code(body_text, "flowchart")

        if lines and lines[0].strip() != "erDiagram":
            lines = ["erDiagram"] + [line for line in lines if line.strip() != "erDiagram"]

        # --- ER-specific cleaning passes ---
        # 1. Quote unquoted relationship labels
        fixed = []
        for line in lines:
            match = re.match(r'(\s*\w+\s+[|o}{]+--[|o}{]+\s+\w+\s*:\s*)([^"].*[^"]\s*)$', line)
            fixed.append(f'{match.group(1)}"{match.group(2).strip()}"' if match else line)
        lines = fixed

        # 2. Remove invalid `enum` blocks
        cleaned = []
        in_enum = False
        for line in lines:
            stripped = line.strip()
            if re.match(r'^enum\s+\w+\s*\{', stripped):
                in_enum = True
                continue
            if in_enum:
                if stripped == "}":
                    in_enum = False
                continue
            cleaned.append(line)
        lines = cleaned

        # 3. Deduplicate entity definitions — keep only the FIRST occurrence of each entity block
        deduped = []
        seen_entities = set()
        in_entity = False
        current_entity_name = None
        skip_block = False
        for line in lines:
            stripped = line.strip()
            entity_open = re.match(r'^([A-Za-z]\w*)\s*\{', stripped)
            if entity_open and not in_entity:
                in_entity = True
                current_entity_name = entity_open.group(1)
                if current_entity_name in seen_entities:
                    skip_block = True
                else:
                    seen_entities.add(current_entity_name)
                    skip_block = False
                    deduped.append(line)
                continue
            if in_entity:
                if stripped == "}":
                    in_entity = False
                    if not skip_block:
                        deduped.append(line)
                    skip_block = False
                else:
                    if not skip_block:
                        deduped.append(line)
                continue
            deduped.append(line)
        lines = deduped

        # 4. Deduplicate relationship lines (treat A->B and B->A with same pair as duplicates)
        rel_seen = set()
        deduped_rels = []
        for line in lines:
            stripped = line.strip()
            rel_match = re.match(r'^([A-Za-z]\w*)\s+[|o}{]+--[|o}{]+\s+([A-Za-z]\w+)', stripped)
            if rel_match:
                pair = tuple(sorted([rel_match.group(1), rel_match.group(2)]))
                if pair in rel_seen:
                    continue
                rel_seen.add(pair)
            deduped_rels.append(line)
        lines = deduped_rels

        # 5. Remove truncated/incomplete relationship lines
        final = []
        for line in lines:
            stripped = line.strip()
            # Detect lines like "Notification ||--" with no target entity
            if re.match(r'^[A-Za-z]\w*\s+[|o}{]+--\s*$', stripped):
                continue
            final.append(line)
        lines = final

        # 6. Remove relationships that reference enum entities (which were stripped)
        rel_final = []
        for line in lines:
            stripped = line.strip()
            rel_match = re.match(r'^([A-Za-z]\w*)\s+[|o}{]+--[|o}{]+\s+([A-Za-z]\w+)', stripped)
            if rel_match:
                # Skip relationships to entities that look like enums (common patterns)
                target = rel_match.group(2)
                if target.endswith("Status") or target.endswith("Method") or target == "Rating":
                    # Check if this entity was never defined
                    if target not in seen_entities:
                        continue
            rel_final.append(line)
        lines = rel_final

        content = "\n".join(lines)

    if diagram_type == "gantt":
        lines = content.splitlines()
        if lines and lines[0].strip() != "gantt":
            lines = ["gantt"] + [line for line in lines if line.strip() != "gantt"]
        if not any("dateFormat" in line for line in lines):
            insert_at = 1
            for idx, line in enumerate(lines):
                if line.strip().startswith("title"):
                    insert_at = idx + 1
                    break
            lines.insert(insert_at, "    dateFormat YYYY-MM-DD")

        # Ensure a title line exists
        if not any(line.strip().startswith("title") for line in lines):
            lines.insert(1, "    title Project Timeline")

        # Fix axisFormat with spaces between tokens (e.g., "%b %d" -> "%b-%d")
        fixed = []
        for line in lines:
            if line.strip().startswith("axisFormat"):
                # Replace space-separated format tokens with dash-separated
                line = re.sub(r'(axisFormat\s+%[a-zA-Z])\s+(%[a-zA-Z])', r'\1-\2', line)
            fixed.append(line)
        lines = fixed

        # Replace '&' with 'and' in section names
        fixed = []
        for line in lines:
            if line.strip().startswith("section "):
                line = line.replace(" & ", " and ")
            fixed.append(line)
        lines = fixed

        # Remove bare dependency-only task lines (e.g., "Task Name : after id1" with no duration/dates)
        fixed = []
        for line in lines:
            stripped = line.strip()
            if ":" in stripped and not stripped.startswith(("gantt", "title", "dateFormat", "axisFormat", "section", "excludes", "todayMarker")):
                meta = stripped.split(":", 1)[1].strip()
                parts = [p.strip() for p in meta.split(",")]
                # Check if line is ONLY "after id" with no date or duration
                non_empty = [p for p in parts if p]
                if len(non_empty) == 1 and non_empty[0].startswith("after "):
                    continue  # Skip bare dependency-only lines
            fixed.append(line)
        lines = fixed

        # Fix redundant explicit dates alongside 'after' dependency
        # Pattern: "Task : id, after prev, 2024-01-07, 2024-01-14" -> "Task : id, after prev, Nd"
        fixed = []
        date_re = re.compile(r'^\d{4}-\d{2}-\d{2}$')
        for line in lines:
            stripped = line.strip()
            if ":" in stripped and not stripped.startswith(("gantt", "title", "dateFormat", "axisFormat", "section", "excludes", "todayMarker")):
                meta = stripped.split(":", 1)[1].strip()
                parts = [p.strip() for p in meta.split(",")]
                has_after = any(p.startswith("after ") for p in parts)
                dates_found = [p for p in parts if date_re.match(p)]
                if has_after and len(dates_found) == 2:
                    # Convert two explicit dates to a duration
                    try:
                        from datetime import datetime
                        d1 = datetime.strptime(dates_found[0], "%Y-%m-%d")
                        d2 = datetime.strptime(dates_found[1], "%Y-%m-%d")
                        days = max((d2 - d1).days, 1)
                        # Rebuild the line without the two dates, adding duration
                        task_name = stripped.split(":", 1)[0].strip()
                        new_parts = [p for p in parts if not date_re.match(p)]
                        new_parts.append(f"{days}d")
                        indent = line[:len(line) - len(line.lstrip())]
                        fixed.append(f"{indent}{task_name} : {', '.join(new_parts)}")
                        continue
                    except (ValueError, ImportError):
                        pass
            fixed.append(line)
        lines = fixed

        content = "\n".join(lines)

    if diagram_type == "xy":
        lines = content.splitlines()
        if lines and lines[0].strip() != "xychart-beta":
            lines = ["xychart-beta"] + [line for line in lines if line.strip() != "xychart-beta"]
        
        fixed = []
        for line in lines:
            stripped = line.strip()
            # 1. Skip legend, annotate, grid lines
            if stripped.startswith(("legend ", "legend[", "annotate ", "grid ")):
                continue
            
            # 2. Fix x-axis labels (quote them if they contain spaces)
            if stripped.startswith("x-axis"):
                x_match = re.search(r'x-axis\s*\[([^\]]+)\]', line)
                if x_match:
                    raw_labels = x_match.group(1).split(',')
                    clean_labels = []
                    for lbl in raw_labels:
                        lbl_stripped = lbl.strip().strip('"\'')
                        clean_labels.append(f'"{lbl_stripped}"')
                    indent = line[:len(line) - len(line.lstrip())]
                    fixed.append(f'{indent}x-axis [{", ".join(clean_labels)}]')
                    continue
            
            # 3. Strip inline series labels (e.g. line [1, 2] "Math" -> line [1, 2])
            if stripped.startswith(("line ", "line[", "bar ", "bar[")):
                series_match = re.match(r'^(\s*(?:line|bar)\s*\[[^\]]+\])\s*["\']([^"\']+)["\']\s*$', line)
                if series_match:
                    fixed.append(series_match.group(1).rstrip())
                    continue
            
        content = "\n".join(fixed)

    if diagram_type == "quadrantChart":
        content = _clean_quadrant_chart(content)

    if diagram_type == "gitGraph":
        content = _clean_git_graph(content)

    if diagram_type == "pie":
        content = _clean_pie(content)

    if diagram_type == "ishikawa":
        content = _clean_ishikawa(content)

    if diagram_type == "requirementDiagram":
        content = _clean_requirement_diagram(content)

    if diagram_type == "c4Diagram":
        content = _clean_c4_diagram(content)

    if diagram_type == "mindmap":
        content = _clean_mindmap(content)

    if diagram_type == "timeline" or content.startswith("timeline"):
        content = _clean_timeline(content)

    if diagram_type == "block" or content.startswith(("block", "block-beta")):
        content = _clean_block(content)

    if diagram_type == "venn" or content.startswith(("venn", "venn-beta")):
        content = _clean_venn(content)

    if diagram_type == "radar" or content.startswith(("radar", "radar-beta")):
        content = _clean_radar(content)

    if diagram_type == "treemap" or content.startswith(("treemap", "treemap-beta")):
        content = _clean_treemap(content)

    if diagram_type == "xy" or content.startswith(("xychart", "xychart-beta")):
        content = _clean_xy(content)

    if diagram_type == "packet" or content.startswith(("packet", "packet-beta")):
        content = _clean_packet(content)

    if diagram_type == "treeView" or content.startswith(("treeView", "treeview", "treeView-beta", "treeview-beta")):
        content = _clean_treeview(content)

    if diagram_type == "eventModeling" or content.startswith(("eventmodeling", "eventModeling")):
        content = re.sub(r'`(?:json)?`\s*\{[^}]*\}', '', content)
        content = re.sub(r'^(tf|rf)\s+(\d+)\s+([a-z]+)\s+["\']([A-Za-z0-9_]+)["\']', r'\1 \2 \3 \4', content, flags=re.MULTILINE)

    return content.strip()


def _clean_git_graph(content):
    lines = [l.rstrip() for l in content.splitlines() if l.strip()]
    if not lines:
        return content

    if not lines[0].strip().startswith("gitGraph"):
        lines = ["gitGraph"] + [l for l in lines if not l.strip().startswith("gitGraph")]
    else:
        lines[0] = "gitGraph"

    created_branches = {"main"}
    current_branch = "main"
    seen_commit_ids = set()

    fixed = ["gitGraph"]

    for line in lines[1:]:
        stripped = line.strip()
        if not stripped:
            continue

        if stripped.startswith(("rebase", "delete branch", "delete ")):
            continue

        branch_match = re.match(r'^branch\s+([^\s]+)', stripped, re.IGNORECASE)
        if branch_match:
            b_name = branch_match.group(1)
            if b_name == "main":
                continue
            created_branches.add(b_name)
            current_branch = b_name
            fixed.append(f"    {stripped}")
            continue

        checkout_match = re.match(r'^checkout\s+([^\s]+)', stripped, re.IGNORECASE)
        if checkout_match:
            b_name = checkout_match.group(1)
            if b_name not in created_branches:
                fixed.append(f"    branch {b_name}")
                created_branches.add(b_name)
            if current_branch != b_name or (len(fixed) > 0 and fixed[-1].strip() != stripped):
                current_branch = b_name
                fixed.append(f"    {stripped}")
            continue

        merge_match = re.match(r'^merge\s+([^\s]+)', stripped, re.IGNORECASE)
        if merge_match:
            m_branch = merge_match.group(1)
            if m_branch == current_branch:
                continue
            if m_branch not in created_branches:
                fixed.append(f"    branch {m_branch}")
                created_branches.add(m_branch)
            fixed.append(f"    {stripped}")
            continue

        if stripped.startswith("commit"):
            id_match = re.search(r'id:\s*["\']([^"\']+)["\']', stripped, re.IGNORECASE)
            if id_match:
                commit_id = id_match.group(1)
                if commit_id in seen_commit_ids:
                    count = 2
                    new_id = f"{commit_id} ({count})"
                    while new_id in seen_commit_ids:
                        count += 1
                        new_id = f"{commit_id} ({count})"
                    seen_commit_ids.add(new_id)
                    updated_line = re.sub(r'id:\s*["\'][^"\']+["\']', f'id: "{new_id}"', stripped)
                    fixed.append(f"    {updated_line}")
                else:
                    seen_commit_ids.add(commit_id)
                    fixed.append(f"    {stripped}")
            else:
                fixed.append(f"    {stripped}")
            continue

        fixed.append(f"    {stripped}")

    return "\n".join(fixed)


def _clean_pie(content):
    lines = [l.rstrip() for l in content.splitlines() if l.strip()]
    if not lines:
        return content

    first = lines[0].strip()
    if not first.startswith("pie"):
        lines = ["pie showData"] + [l for l in lines if not l.strip().startswith("pie")]

    fixed = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        if stripped.startswith(("explode", "offset", "sliceOffset", "slice_offset")):
            continue

        if stripped.startswith(("pie", "title")):
            fixed.append(line)
            continue

        if ":" in stripped:
            parts = stripped.split(":", 1)
            raw_label = parts[0].strip().strip('"\'')
            raw_val = parts[1].strip()

            cleaned_val = re.sub(r'[\$,%]', '', raw_val)
            val_match = re.search(r'[-+]?\d+(?:\.\d+)?', cleaned_val)
            if val_match:
                final_val = val_match.group(0)
                fixed.append(f'    "{raw_label}" : {final_val}')
            else:
                fixed.append(line)
        else:
            fixed.append(line)

    return "\n".join(fixed)


def _clean_ishikawa(content):
    lines = [l.rstrip() for l in content.splitlines() if l.strip()]
    if not lines:
        return content

    first = lines[0].strip()
    if first.startswith("ishikawa") and not first.startswith("ishikawa-beta"):
        lines[0] = "ishikawa-beta"
    elif not first.startswith("ishikawa-beta") and not first.startswith("flowchart") and not first.startswith("graph"):
        lines = ["ishikawa-beta"] + lines

    return "\n".join(lines)


def _clean_treemap(content):
    lines = [l.rstrip() for l in content.splitlines() if l.strip()]
    if not lines:
        return content

    first = lines[0].strip()
    if first.startswith("treemap") and not first.startswith("treemap-beta"):
        lines[0] = "treemap-beta"
    elif not first.startswith("treemap-beta") and not first.startswith("flowchart") and not first.startswith("graph"):
        lines = ["treemap-beta"] + lines

    return "\n".join(lines)


def _clean_treeview(content):
    lines = [l.rstrip() for l in content.splitlines() if l.strip()]
    if not lines:
        return content

    first = lines[0].strip()

    # If it's explicitly a flowchart
    if first.startswith(("flowchart", "graph")):
        first = re.sub(r'^(flowchart|graph)\s+(TD|TB|BT|RL|LR)', r'flowchart LR', first)
        if not first.startswith("flowchart LR"):
            first = "flowchart LR"
        lines[0] = first
        return "\n".join(lines)

    # If it's a mindmap, convert to treeView-beta
    if first.startswith("mindmap"):
        cleaned = ["treeView-beta"]
        for raw_line in lines[1:]:
            stripped = raw_line.strip()
            if not stripped or stripped.startswith("%%"):
                continue
            indent_match = re.match(r"^(\s*)", raw_line)
            indent = indent_match.group(1) if indent_match else "  "
            label = re.sub(r"^[(\[{]+|[)\]}]+$", "", stripped).strip().strip('"\'')
            if label:
                cleaned.append(f'{indent}"{label}"')
        return "\n".join(cleaned)

    # Native directory tree format: ensure header is treeView-beta and entries are clean quoted strings
    cleaned = ["treeView-beta"]
    start_idx = 1 if first.startswith(("treeView-beta", "treeview-beta", "treeView", "treeview")) else 0
    for raw_line in lines[start_idx:]:
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("%%") or stripped.startswith("treeView") or stripped.startswith("treeview"):
            continue
        indent_match = re.match(r"^(\s*)", raw_line)
        indent = indent_match.group(1) if indent_match else "  "
        if not indent:
            indent = "  "
        # Clean bullets, angle brackets, quotes
        label = re.sub(r"^[-*•]\s+", "", stripped)
        label = label.strip().strip('"\'').replace("<", "").replace(">", "").strip()
        if not label:
            continue
        cleaned.append(f'{indent}"{label}"')

    return "\n".join(cleaned)


def _clean_requirement_diagram(content):
    lines = [l.rstrip() for l in content.splitlines() if l.strip()]
    if not lines:
        return content

    if not lines[0].strip().startswith("requirementDiagram"):
        lines = ["requirementDiagram"] + [l for l in lines if not l.strip().startswith("requirementDiagram")]

    fixed = ["requirementDiagram"]

    for line in lines[1:]:
        stripped = line.strip()
        if not stripped:
            continue

        single_req_match = re.match(r'^(requirement|functionalRequirement|performanceRequirement|interfaceRequirement|physicalRequirement|designConstraint)\s+([A-Za-z0-9_-]+)\s*:\s*(.*)$', stripped, re.IGNORECASE)
        if single_req_match:
            req_type = single_req_match.group(1)
            req_id_raw = single_req_match.group(2)
            req_text = single_req_match.group(3).strip('"\'')
            safe_name = re.sub(r'[^A-Za-z0-9_]', '_', req_id_raw.lower())
            fixed.append(f"    {req_type} {safe_name} {{")
            fixed.append(f"        id: {req_id_raw}")
            fixed.append(f'        text: "{req_text}"')
            fixed.append("        risk: Medium")
            fixed.append("        verifyMethod: Test")
            fixed.append("    }")
            continue

        flowchart_arrow_match = re.match(r'^([A-Za-z0-9_-]+)(?:\[([^\]]+)\])?\s*-->\s*([A-Za-z0-9_-]+)(?:\[([^\]]+)\])?$', stripped)
        if flowchart_arrow_match:
            src_id = flowchart_arrow_match.group(1)
            dst_id = flowchart_arrow_match.group(3)
            fixed.append(f"    {src_id} - contains -> {dst_id}")
            continue

        flowchart_node_match = re.match(r'^([A-Za-z0-9_-]+)\[([^\]]+)\]$', stripped)
        if flowchart_node_match:
            node_id = flowchart_node_match.group(1)
            node_text = flowchart_node_match.group(2)
            fixed.append(f"    requirement {node_id} {{")
            fixed.append(f"        id: {node_id}")
            fixed.append(f'        text: "{node_text}"')
            fixed.append("        risk: Medium")
            fixed.append("        verifyMethod: Test")
            fixed.append("    }")
            continue

        fixed.append(f"    {stripped}")

    return "\n".join(fixed)


def _clean_c4_diagram(content):
    lines = [l.rstrip() for l in content.splitlines() if l.strip()]
    if not lines:
        return content

    first = lines[0].strip()
    if first.startswith(("C4Context", "C4Container", "C4Component", "C4Dynamic")):
        fixed = []
        for line in lines:
            stripped = line.strip()
            arrow_match = re.match(r'^([A-Za-z0-9_-]+)\s*-\.?->\s*([A-Za-z0-9_-]+)(?:\s*:\s*(.*))?$', stripped)
            if arrow_match:
                src = arrow_match.group(1)
                dst = arrow_match.group(2)
                label = arrow_match.group(3) or "Interacts"
                fixed.append(f'    Rel({src}, {dst}, "{label.strip()}")')
            else:
                fixed.append(line)
        return "\n".join(fixed)

    fixed = ["C4Container", '    title "System Architecture Diagram"']
    declared_nodes = {}
    connections = []

    for line in lines[1:]:
        stripped = line.strip()
        if not stripped or stripped.startswith(("classDef", "style", "click")):
            continue

        def repl(match):
            alias = match.group(1)
            label = match.group(2) or match.group(3) or match.group(4) or alias
            declared_nodes[alias] = label
            return alias

        processed_line = re.sub(r'([A-Za-z0-9_-]+)(?:\(\s*["\']?([^"\']+)["\']?\s*\)|\[\s*["\']?([^"\']+)["\']?\s*\]|\(\[\s*["\']?([^"\']+)["\']?\s*\]\))', repl, stripped)

        conn_match = re.match(r'^([A-Za-z0-9_-]+)\s*-\.?->(?:\s*\|([^\|]+)\|)?\s*([A-Za-z0-9_-]+)$', processed_line)
        if conn_match:
            src = conn_match.group(1)
            label = conn_match.group(2) or "Interacts"
            dst = conn_match.group(3)
            connections.append((src, dst, label))
        else:
            alias = processed_line.split(":::")[0].strip()
            if alias and alias not in declared_nodes:
                declared_nodes[alias] = alias

    for alias, label in declared_nodes.items():
        label_lower = label.lower()
        if "user" in label_lower or "actor" in label_lower or "customer" in label_lower:
            fixed.append(f'    Person({alias}, "{label}", "User client")')
        elif "database" in label_lower or "db" in label_lower or "postgres" in label_lower or "redis" in label_lower:
            fixed.append(f'    ContainerDb({alias}, "{label}", "Data Store")')
        elif "web" in label_lower or "app" in label_lower or "frontend" in label_lower or "mobile" in label_lower:
            fixed.append(f'    Container({alias}, "{label}", "Client App")')
        else:
            fixed.append(f'    System({alias}, "{label}", "Software component")')

    for src, dst, label in connections:
        fixed.append(f'    Rel({src}, {dst}, "{label.strip()}")')

    return "\n".join(fixed)


def _clean_mindmap(content):
    lines = [l.rstrip() for l in content.splitlines() if l.strip()]
    if not lines:
        return content

    first = lines[0].strip()
    if not first.startswith("mindmap"):
        lines = ["mindmap"] + [l for l in lines if not l.strip().startswith("mindmap")]

    # Clean inverted shapes and malformed quotes on mindmap lines
    cleaned = [lines[0]]
    for line in lines[1:]:
        line_c = line
        # Fix line starting with stray ) or ') or "')
        # e.g., '        )"loadFromFile()"' -> '        "loadFromFile()"'
        line_c = re.sub(r'^(\s*)[\'"]?\)\s*["\']?([^"\']+)["\']?\s*$', r'\1"\2"', line_c)
        # e.g., '          \')"Choice 7: Terminate"\'' -> '          "Choice 7: Terminate"'
        line_c = re.sub(r"^(\s*)['\"]?\)\s*['\"]?([^'\"]+)['\"]?'?\s*$", r'\1"\2"', line_c)
        # Fix nested single quotes around double quotes: '        \'"employee.dat (rb)"\'' -> '        "employee.dat (rb)"'
        line_c = re.sub(r"^(\s*)'\"([^\"]+)\"'\s*$", r'\1"\2"', line_c)
        # Fix inverted cloud shape: )Binary File Handling( -> ("Binary File Handling")
        line_c = re.sub(r'\)([A-Za-z0-9_\s-]+)\(', r'("\1")', line_c)
        # Fix ))"MAX Limit Reached"(( -> (("MAX Limit Reached"))
        line_c = re.sub(r'\)\)(["\'][^"\']+["\'])\(\(', r'((\1))', line_c)
        cleaned.append(line_c)
    lines = cleaned

    has_arrows = any("-->" in l or "-.->" in l for l in lines)
    if not has_arrows:
        return "\n".join(lines)

    declared_nodes = {}
    adjacency = {}
    in_degrees = {}

    for line in lines[1:]:
        stripped = line.strip()
        if not stripped:
            continue

        def repl(match):
            alias = match.group(1)
            label = match.group(2) or match.group(3) or match.group(4) or alias
            declared_nodes[alias] = f"{alias}(({label}))"
            return alias

        processed_line = re.sub(r'([A-Za-z0-9_-]+)(?:\(\s*["\']?([^"\']+)["\']?\s*\)|\[\s*["\']?([^"\']+)["\']?\s*\]|\(\[\s*["\']?([^"\']+)["\']?\s*\]\))', repl, stripped)

        conn_match = re.match(r'^([A-Za-z0-9_-]+)\s*-\.?->\s*([A-Za-z0-9_-]+)$', processed_line)
        if conn_match:
            src = conn_match.group(1)
            dst = conn_match.group(2)
            if src not in adjacency:
                adjacency[src] = []
            adjacency[src].append(dst)
            in_degrees[dst] = in_degrees.get(dst, 0) + 1
            if src not in in_degrees:
                in_degrees[src] = 0
        else:
            alias = processed_line.strip()
            if alias and alias not in declared_nodes:
                declared_nodes[alias] = alias

    root = None
    for node, deg in in_degrees.items():
        if deg == 0:
            root = node
            break

    if not root:
        if adjacency:
            root = list(adjacency.keys())[0]
        elif declared_nodes:
            root = list(declared_nodes.keys())[0]

    if not root:
        return "\n".join(lines)

    fixed = ["mindmap"]
    visited = set()

    def dfs(node, depth):
        if node in visited:
            return
        visited.add(node)

        indent = "    " * depth
        label = declared_nodes.get(node, node)
        fixed.append(f"{indent}{label}")

        for child in adjacency.get(node, []):
            dfs(child, depth + 1)

    dfs(root, 1)

    for node in declared_nodes:
        if node not in visited:
            fixed.append(f"    {declared_nodes[node]}")

    return "\n".join(fixed)


def _clean_quadrant_chart(content):
    lines = [l.rstrip() for l in content.splitlines() if l.strip()]
    if not lines:
        return content

    if lines[0].strip() != "quadrantChart":
        lines = ["quadrantChart"] + [l for l in lines if l.strip() != "quadrantChart"]

    fixed = []
    current_quadrant = None
    quad_coords = {
        "quadrant-1": [0.75, 0.75],
        "quadrant-2": [0.25, 0.75],
        "quadrant-3": [0.25, 0.25],
        "quadrant-4": [0.75, 0.25]
    }

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        if stripped == "quadrantChart":
            fixed.append("quadrantChart")
            continue

        if stripped.startswith("x-axis-title"):
            val = stripped.replace("x-axis-title", "", 1).strip()
            fixed.append(f"    x-axis {val}")
            continue

        if stripped.startswith("y-axis-title"):
            val = stripped.replace("y-axis-title", "", 1).strip()
            fixed.append(f"    y-axis {val}")
            continue

        quad_match = re.match(r'^(quadrant-[1-4])(?:\s+(.*))?$', stripped, re.IGNORECASE)
        if quad_match:
            q_num = quad_match.group(1).lower()
            q_label = quad_match.group(2) or f"Quadrant {q_num[-1]}"
            q_label = re.sub(r'^title\s+', '', q_label, flags=re.IGNORECASE).strip()
            fixed.append(f"    {q_num} {q_label}")
            current_quadrant = q_num
            continue

        if stripped.startswith("title"):
            if current_quadrant is not None:
                continue
            fixed.append(f"    {stripped}")
            continue

        if stripped.startswith("x-axis") or stripped.startswith("y-axis"):
            fixed.append(f"    {stripped}")
            continue

        coord_match = re.search(r':\s*\[\s*([0-9\.]+)\s*,\s*([0-9\.]+)\s*\]', stripped)
        if coord_match:
            fixed.append(f"    {stripped}")
        else:
            cleaned_item = re.sub(r'^[<"\'\s]*([^>"\'\:]+)[>"\'\s]*', r'\1', stripped).strip()
            if cleaned_item and not cleaned_item.startswith(("title", "x-axis", "y-axis")):
                coords = quad_coords.get(current_quadrant, [0.5, 0.5])
                fixed.append(f'    "{cleaned_item}": [{coords[0]}, {coords[1]}]')

def _clean_timeline(content):
    lines = [l.rstrip() for l in content.splitlines() if l.strip()]
    if not lines:
        return content

    first = lines[0].strip()
    if not first.startswith("timeline"):
        lines = ["timeline"] + [l for l in lines if not l.strip().startswith("timeline")]

    result = []
    default_period_counter = 1
    for raw in lines:
        stripped = raw.strip()
        if stripped == "timeline" or stripped.startswith(("---", "config:", "%%")):
            result.append(raw)
            continue
        if stripped.startswith("title "):
            title_text = re.sub(r'^title\s+["\']?', '', stripped)
            title_text = re.sub(r'["\']?$', '', title_text)
            title_text = re.sub(r':+', ' - ', title_text).strip()
            result.append(f"    title {title_text}")
            continue
        if stripped.startswith("section "):
            sec_text = re.sub(r'^section\s+', '', stripped).replace('"', '').replace("'", '')
            sec_text = re.sub(r':+', ' - ', sec_text).strip()
            default_period_counter = 1
            result.append(f"    section {sec_text}")
            continue

        cleaned = re.sub(r'^[-*•]\s+', '', stripped)
        cleaned = re.sub(r'<[^>]+>', '', cleaned)
        cleaned = re.sub(r'-->>?|-->', ':', cleaned).strip()

        if not cleaned:
            continue

        if ":" in cleaned:
            parts = [p.strip() for p in cleaned.split(":") if p.strip()]
            if len(parts) == 1:
                result.append(f"        Phase {default_period_counter} : {parts[0]}")
                default_period_counter += 1
            else:
                period = parts[0]
                events = " : ".join(parts[1:])
                result.append(f"        {period} : {events}")
        else:
            result.append(f"        Milestone {default_period_counter} : {cleaned}")
            default_period_counter += 1

    return "\n".join(result)


def _clean_block(content):
    lines = [l.rstrip() for l in content.splitlines() if l.strip()]
    if not lines:
        return content
    first = lines[0].strip()
    if first.startswith("block") and not first.startswith("block-beta"):
        lines[0] = "block-beta"
    elif not first.startswith("block-beta"):
        lines = ["block-beta"] + [l for l in lines if not l.strip().startswith("block-beta")]
    else:
        lines[0] = "block-beta"

    # Merge split block arrows (e.g. `arrow<["..."]>\n(down)`) and decode HTML entities
    merged = []
    i = 0
    while i < len(lines):
        curr = lines[i]
        curr = re.sub(r"&(?:nbsp|#160);", " ", curr, flags=re.IGNORECASE)
        curr = re.sub(r"(fill|stroke|color):#([0-9a-fA-F]{3,8})[a-zA-Z]+", r"\1:#\2", curr)

        stripped_curr = curr.strip()
        if i < len(lines) - 1:
            next_line = re.sub(r"&(?:nbsp|#160);", " ", lines[i + 1], flags=re.IGNORECASE)
            stripped_next = next_line.strip()
            if re.match(r"^[A-Za-z0-9_]+<.*>$", stripped_curr) and re.match(r"^\((?:down|up|right|left|x)\)(?::\d+)?$", stripped_next):
                merged.append(f"    {stripped_curr}{stripped_next}")
                i += 2
                continue
        merged.append(curr)
        i += 1

    cleaned = []
    for l in merged:
        line_c = l
        # Quoted node IDs: "User" ["User"] -> User["User"]
        line_c = re.sub(r'["\']([A-Za-z0-9_-]+)["\'](\s*\[)', r'\1\2', line_c)
        line_c = re.sub(r'["\']([A-Za-z0-9_-]+)["\'](\s*[\(\{])', r'\1\2', line_c)
        # "LoginUI" ["Login Form"] --> "AuthService" ["Auth Service"]
        line_c = re.sub(r'["\']([A-Za-z0-9_-]+)["\']\s*(\[[^\]]+\])?\s*(-->|--)\s*["\']([A-Za-z0-9_-]+)["\']', r'\1\2 \3 \4', line_c)
        line_c = re.sub(r'["\']([A-Za-z0-9_-]+)["\']\s*(-->|--)', r'\1 \2', line_c)
        line_c = re.sub(r'(-->|--)\s*["\']([A-Za-z0-9_-]+)["\']', r'\1 \2', line_c)
        # "User" space "Database" -> User space Database
        line_c = re.sub(r'["\']([A-Za-z0-9_-]+)["\'](\s+space\b)', r'\1\2', line_c)
        line_c = re.sub(r'(\bspace\s+)["\']([A-Za-z0-9_-]+)["\']', r'\1\2', line_c)
        cleaned.append(line_c)

    return "\n".join(cleaned)


def _clean_venn(content):
    lines = [l.rstrip() for l in content.splitlines() if l.strip()]
    if not lines:
        return content
    first = lines[0].strip()
    if first.startswith("venn") and not first.startswith("venn-beta"):
        lines[0] = "venn-beta"
    elif not first.startswith("venn-beta"):
        lines = ["venn-beta"] + [l for l in lines if not l.strip().startswith("venn-beta")]
    return "\n".join(lines)


def _clean_xy(content):
    lines = [l.rstrip() for l in content.splitlines() if l.strip()]
    if not lines:
        return content
    first = lines[0].strip()
    if (first.startswith("xy") or first.startswith("xychart")) and not first.startswith("xychart-beta"):
        lines[0] = "xychart-beta"
    elif not first.startswith("xychart-beta"):
        lines = ["xychart-beta"] + [l for l in lines if not l.strip().startswith("xychart-beta")]
    return "\n".join(lines)


def _clean_packet(content):
    lines = [l.rstrip() for l in content.splitlines() if l.strip()]
    if not lines:
        return content
    first = lines[0].strip()
    if (first.startswith("packet") or first.startswith("packet-beta")) and not first.startswith("packet-beta"):
        lines[0] = "packet-beta"
    elif not first.startswith("packet-beta") and not first.startswith("flowchart") and not first.startswith("graph"):
        lines = ["packet-beta"] + [l for l in lines if not l.strip().startswith("packet-beta")]

    cleaned = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped == "packet-beta" or stripped.startswith("title ") or stripped.startswith("%%") or stripped.startswith("---"):
            cleaned.append(line)
            continue

        match = re.match(r"^(\d+(?:-\d+)?)\s*:\s*(.*)$", stripped)
        if match:
            bit_range = match.group(1)
            label = match.group(2).strip().strip('"\'')
            cleaned.append(f'  {bit_range}: "{label}"')
        else:
            cleaned.append(line)

    return "\n".join(cleaned)


def _clean_radar(content):
    lines = [l.rstrip() for l in content.splitlines() if l.strip()]
    if not lines:
        return content

    fm = []
    body = lines
    if lines[0].strip() == "---":
        end_idx = -1
        for idx, l in enumerate(lines[1:], start=1):
            if l.strip() == "---":
                end_idx = idx
                break
        if end_idx != -1:
            fm = lines[:end_idx + 1]
            body = lines[end_idx + 1:]

    if not body:
        return content

    first = body[0].strip()
    if first.startswith("radar") and not first.startswith("radar-beta"):
        body[0] = "radar-beta"
    elif not first.startswith("radar-beta"):
        body = ["radar-beta"] + [l for l in body if not l.strip().startswith("radar-beta")]

    return "\n".join(fm + body)


def _restore_flowchart_line_breaks(content):
    """Recover readable Mermaid when a model collapses a flowchart into one line."""
    text = re.sub(r"\s+", " ", content).strip() if "\n" not in content.strip() else content
    text = re.sub(r"^(flowchart\s+(?:TD|LR|BT|RL)|graph\s+(?:TD|LR|BT|RL))\s+", r"\1\n    ", text)
    text = re.sub(
        r"\s+(?=(?:[A-Za-z][A-Za-z0-9_]*\s*(?:[-.=]+[ox>]|<[-.=]+|---)|classDef\s+|linkStyle\s+|style\s+|class\s+|subgraph\s+|end\b))",
        "\n    ",
        text,
    )
    return "\n".join(line.rstrip() for line in text.splitlines())


def _trim_invalid_link_styles(content):
    lines = content.splitlines()
    edge_count = 0
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("linkStyle "):
            continue
        if re.search(r"[-.=]+[ox>]|<[-.=]+|---", stripped):
            edge_count += 1

    seen = set()
    cleaned = []
    for line in lines:
        match = re.match(r"\s*linkStyle\s+(\d+)\s+(.+?);?\s*$", line.strip())
        if match:
            idx = int(match.group(1))
            if idx >= edge_count or idx in seen:
                continue
            seen.add(idx)
            cleaned.append(f"    linkStyle {idx} {match.group(2).rstrip(';')};")
        else:
            cleaned.append(line)
    return "\n".join(cleaned)


def validate_mermaid_code(content, diagram_type):
    """Return static Mermaid validation issues with line numbers."""
    issues = []
    lines = content.splitlines() if content else []

    if not lines:
        return {
            "valid": False,
            "issues": [{"line": 1, "severity": "error", "message": "Diagram code is empty."}],
        }

    expected_headers = HEADER_BY_TYPE.get(diagram_type, HEADER_BY_TYPE["flowchart"])
    first = lines[0].strip()
    if not any(first.startswith(header) for header in expected_headers):
        issues.append({
            "line": 1,
            "severity": "error",
            "message": f"Expected the first line to start with one of: {', '.join(expected_headers)}.",
        })

    header_hits = []
    all_headers = ["flowchart ", "graph ", "sequenceDiagram", "erDiagram", "gantt", "pie", "xychart-beta"]
    for idx, line in enumerate(lines, start=1):
        if any(line.strip().startswith(header) for header in all_headers):
            header_hits.append(idx)
    if len(header_hits) > 1:
        for line_no in header_hits[1:]:
            issues.append({"line": line_no, "severity": "error", "message": "Duplicate diagram header."})

    is_flowchart = bool(lines and lines[0].strip().startswith(("flowchart ", "graph ")))
    if is_flowchart or diagram_type in ("flowchart", "architecture", "kanban", "useCase") or (diagram_type == "packet" and lines and (lines[0].strip().startswith("flowchart") or lines[0].strip().startswith("graph"))):
        _validate_flowchart(lines, issues)
    elif diagram_type == "swimlane":
        _validate_swimlane(lines, issues)
    elif diagram_type == "packet" or (lines and lines[0].strip().startswith("packet")):
        _validate_packet(lines, issues)
    elif diagram_type == "sequence":
        _validate_sequence(lines, issues)
    elif diagram_type == "erDiagram":
        _validate_er(lines, issues)
    elif diagram_type == "gantt":
        _validate_gantt(lines, issues)
    elif diagram_type == "pie":
        _validate_pie(lines, issues)
    elif diagram_type == "xy":
        _validate_xy(lines, issues)
    elif diagram_type == "radar":
        _validate_radar(lines, issues)
    elif diagram_type == "quadrantChart":
        _validate_quadrant_chart(lines, issues)
    elif diagram_type == "gitGraph":
        _validate_git_graph(lines, issues)
    elif diagram_type == "requirementDiagram":
        _validate_requirement_diagram(lines, issues)
    elif diagram_type == "c4Diagram":
        _validate_c4_diagram(lines, issues)
    elif diagram_type == "mindmap":
        _validate_mindmap(lines, issues)
    elif diagram_type == "timeline":
        _validate_timeline(lines, issues)
    elif diagram_type == "block":
        _validate_block(lines, issues)
    elif diagram_type == "ishikawa":
        _validate_ishikawa(lines, issues)
    elif diagram_type == "treemap":
        _validate_treemap(lines, issues)
    elif diagram_type == "wardley":
        _validate_wardley(lines, issues)
    elif diagram_type == "cynefin":
        _validate_cynefin(lines, issues)
    elif diagram_type == "eventModeling":
        _validate_event_modeling(lines, issues)

    return {"valid": not any(issue["severity"] == "error" for issue in issues), "issues": issues}


def format_issues_for_prompt(issues):
    if not issues:
        return "No static validation issues were found."
    return "\n".join(
        f"- line {issue['line']}: {issue['severity'].upper()} - {issue['message']}"
        for issue in issues
    )


def _validate_flowchart(lines, issues):
    node_def = re.compile(r"(^|[\s>|])([A-Za-z][A-Za-z0-9_]*)\s*[\[\(\{]")
    known_nodes = set()
    used_nodes = set()
    edge_lines = {}
    for idx, line in enumerate(lines, start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith(("flowchart ", "graph ", "subgraph ", "end", "style ", "classDef ", "class ")):
            continue
        if re.search(r"(^|\s)end(\s*[-=]>|[\(\[\{])", stripped):
            issues.append({"line": idx, "severity": "error", "message": "Reserved keyword 'end' is used as a node id."})
        if re.search(r"\[[^\"\]]*[,;:][^\"\]]*\]", stripped):
            issues.append({"line": idx, "severity": "warning", "message": "Label with punctuation should usually be wrapped in double quotes."})
        clean_line_head = stripped.split("[", 1)[0].split("(", 1)[0].split("{", 1)[0].strip()
        if re.search(r'^[A-Za-z][\w-]*\s+[A-Za-z][\w-]*', clean_line_head) and not any(clean_line_head.startswith(k) for k in ("subgraph", "classDef", "style", "class", "click", "direction")):
            issues.append({"line": idx, "severity": "error", "message": "Node id appears to contain a space."})
        for match in node_def.finditer(stripped):
            known_nodes.add(match.group(2))
        edge_source = re.sub(r":::[A-Za-z][A-Za-z0-9_]*", "", stripped)
        edge_match = re.search(r"([A-Za-z][A-Za-z0-9_]*)\s*[-.=]+[ox>]?", edge_source)
        if edge_match:
            used_nodes.add(edge_match.group(1))
        pair_match = re.search(r"([A-Za-z][A-Za-z0-9_]*)\s*[-.=]+[ox>]?(?:\|[^|]*\|)?\s*([A-Za-z][A-Za-z0-9_]*)", edge_source)
        if pair_match:
            pair = (pair_match.group(1), pair_match.group(2))
            if pair in edge_lines:
                issues.append({"line": idx, "severity": "warning", "message": f"Duplicate edge also appears on line {edge_lines[pair]}."})
            else:
                edge_lines[pair] = idx

    for node_id in sorted(used_nodes - known_nodes):
        if node_id not in {"style", "class"}:
            issues.append({"line": 1, "severity": "warning", "message": f"Node '{node_id}' is used before an explicit shape definition."})


def _validate_sequence(lines, issues):
    participants = set()
    balance = {}
    for idx, line in enumerate(lines, start=1):
        stripped = line.strip()
        match = re.match(r"(participant|actor)\s+([A-Za-z0-9_]+)", stripped)
        if match:
            participants.add(match.group(2))
        if stripped.startswith("activate "):
            parts = stripped.split()
            if len(parts) >= 2:
                alias = parts[1].strip()
                balance[alias] = balance.get(alias, 0) + 1
        elif stripped.startswith("deactivate "):
            parts = stripped.split()
            if len(parts) >= 2:
                alias = parts[1].strip()
                balance[alias] = balance.get(alias, 0) - 1
                if balance.get(alias, 0) < 0:
                    issues.append({"line": idx, "severity": "error", "message": f"Trying to deactivate inactive participant '{alias}'."})
        elif ":" in stripped and re.search(r"->|-->", stripped):
            prefix, message = stripped.split(":", 1)
            if ":" in message or "<" in message or ">" in message:
                issues.append({"line": idx, "severity": "error", "message": "Sequence message text contains a colon or angle bracket."})
            actors = re.split(r"-+>>?[+-]?", prefix)
            if len(actors) >= 2:
                src = actors[0].strip()
                dst = actors[-1].strip()
                for alias in (src, dst):
                    if alias and alias not in participants:
                        issues.append({"line": idx, "severity": "warning", "message": f"Participant '{alias}' was not declared at the top."})
                if "->>+" in prefix or "->+" in prefix:
                    balance[dst] = balance.get(dst, 0) + 1
                if "-->>-" in prefix or "-->-" in prefix:
                    balance[src] = balance.get(src, 0) - 1
                    if balance.get(src, 0) < 0:
                        issues.append({"line": idx, "severity": "error", "message": f"Trying to deactivate inactive participant '{src}'."})
    for alias, count in balance.items():
        if count != 0:
            issues.append({"line": 1, "severity": "error", "message": f"Activation markers for '{alias}' are unbalanced."})


def _validate_er(lines, issues):
    entity_defs = {}  # entity_name -> first line number
    entity_has_attrs = {}  # entity_name -> bool
    rel_pairs = {}  # sorted (A, B) pair -> first line number
    rel_count = 0
    in_entity = False
    current_entity = None
    current_entity_line = 0
    has_attrs = False

    for idx, line in enumerate(lines, start=1):
        stripped = line.strip()
        if not stripped or stripped in ("erDiagram", "{", "}"):
            if stripped == "}" and in_entity:
                entity_has_attrs[current_entity] = has_attrs
                if not has_attrs:
                    issues.append({"line": current_entity_line, "severity": "error", "message": f"Entity '{current_entity}' has no attributes. Add at least a primary key."})
                in_entity = False
            continue

        # Detect enum blocks (invalid syntax)
        if re.match(r'^enum\s+\w+\s*\{', stripped):
            issues.append({"line": idx, "severity": "error", "message": "Mermaid ER diagrams do not support 'enum' blocks. Use a string attribute instead."})
            continue

        # Detect entity opening
        entity_open = re.match(r'^([A-Za-z]\w*)\s*\{', stripped)
        if entity_open:
            entity_name = entity_open.group(1)
            in_entity = True
            current_entity = entity_name
            current_entity_line = idx
            has_attrs = False
            if not re.match(r'^[A-Z][A-Za-z0-9]*$', entity_name):
                issues.append({"line": idx, "severity": "error", "message": "ER entity names should be PascalCase without spaces."})
            if entity_name in entity_defs:
                issues.append({"line": idx, "severity": "error", "message": f"Duplicate entity definition for '{entity_name}' (first defined on line {entity_defs[entity_name]})."})
            else:
                entity_defs[entity_name] = idx
            continue

        # Inside an entity block — count attributes
        if in_entity:
            if stripped == "}":
                entity_has_attrs[current_entity] = has_attrs
                if not has_attrs and current_entity not in [e for e in entity_defs if entity_defs[e] != current_entity_line]:
                    issues.append({"line": current_entity_line, "severity": "error", "message": f"Entity '{current_entity}' has no attributes. Add at least a primary key."})
                in_entity = False
            else:
                has_attrs = True
            continue

        # Detect relationship lines
        rel_match = re.match(r'^([A-Za-z]\w*)\s+([|o}{]+--[|o}{]+)\s+([A-Za-z]\w+)\s*:', stripped)
        if rel_match:
            rel_count += 1
            src = rel_match.group(1)
            tgt = rel_match.group(3)

            # Check for quoted label
            if not re.search(r':\s*"[^"]+"$', stripped):
                issues.append({"line": idx, "severity": "error", "message": "ER relationship label must be quoted."})

            # Check for self-referencing
            if src == tgt:
                issues.append({"line": idx, "severity": "warning", "message": f"Self-referencing relationship on '{src}'. Ensure this is intentional (e.g., hierarchical data)."})

            # Check for duplicate relationship pairs (including bidirectional)
            pair = tuple(sorted([src, tgt]))
            if pair in rel_pairs:
                issues.append({"line": idx, "severity": "error", "message": f"Duplicate relationship between '{src}' and '{tgt}' (first on line {rel_pairs[pair]}). State each relationship only once."})
            else:
                rel_pairs[pair] = idx
            continue

        # Detect truncated relationship lines (no target entity)
        trunc_match = re.match(r'^[A-Za-z]\w*\s+[|o}{]+--\s*$', stripped)
        if trunc_match:
            issues.append({"line": idx, "severity": "error", "message": "Truncated relationship line — missing target entity and label."})
            continue

    # Check entity count
    if len(entity_defs) > 10:
        issues.append({"line": 1, "severity": "warning", "message": f"Diagram has {len(entity_defs)} entities. Keep to 10 or fewer for readability."})

    # Check relationship count
    if rel_count > 15:
        issues.append({"line": 1, "severity": "warning", "message": f"Diagram has {rel_count} relationships. Keep to 15 or fewer for readability."})


def _validate_gantt(lines, issues):
    if not any("dateFormat YYYY-MM-DD" in line for line in lines):
        issues.append({"line": 1, "severity": "error", "message": "Gantt chart must include dateFormat YYYY-MM-DD."})

    # Check for title
    if not any(line.strip().startswith("title") for line in lines):
        issues.append({"line": 1, "severity": "warning", "message": "Gantt chart should include a title line."})

    task_ids = set()
    section_count = 0

    def is_date(s):
        return bool(re.match(r'^\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?$', s))

    def is_duration(s):
        return bool(re.match(r'^\d+[wdhms]$', s))

    def is_dependency(s):
        return s.startswith('after ')

    def is_status(s):
        return s in {'done', 'active', 'crit', 'milestone'}

    for idx, line in enumerate(lines, start=1):
        stripped = line.strip()
        if not stripped or stripped == "gantt":
            continue

        # Check axisFormat for space-separated tokens
        if stripped.startswith("axisFormat"):
            fmt = stripped[len("axisFormat"):].strip()
            if re.search(r'%[a-zA-Z]\s+%[a-zA-Z]', fmt):
                issues.append({"line": idx, "severity": "error", "message": "axisFormat must not have spaces between format tokens. Use '%b-%d' instead of '%b %d'."})
            continue

        # Check section names for special characters
        if stripped.startswith("section "):
            section_count += 1
            section_name = stripped[len("section "):].strip()
            if "&" in section_name:
                issues.append({"line": idx, "severity": "warning", "message": f"Section name contains '&'. Use 'and' instead for compatibility."})
            continue

        if stripped.startswith(("title", "dateFormat", "excludes", "todayMarker")):
            continue

        # Everything below is a task line
        if ":" not in stripped:
            issues.append({"line": idx, "severity": "error", "message": "Gantt task line must contain a colon separating task name and metadata."})
            continue

        meta = stripped.split(":", 1)[1]
        parts = [part.strip() for part in meta.split(",")]
        non_empty_parts = [p for p in parts if p]

        # Check for bare dependency-only lines (no dates or duration)
        if len(non_empty_parts) == 1 and non_empty_parts[0].startswith("after "):
            issues.append({"line": idx, "severity": "error", "message": "Task has only a dependency and no duration or dates. Add a duration like '7d'."})
            continue

        # Check for redundant explicit dates alongside 'after' dependency
        has_after = any(p.startswith("after ") for p in parts)
        dates_found = [p for p in parts if is_date(p)]
        if has_after and len(dates_found) >= 2:
            issues.append({"line": idx, "severity": "warning", "message": "Task uses 'after' dependency with explicit start/end dates. Use duration instead (e.g., '14d')."})

        # Check task has at least dates or duration
        has_dates = len(dates_found) >= 1
        has_duration = any(is_duration(p) for p in parts)
        if not has_dates and not has_duration and not has_after:
            issues.append({"line": idx, "severity": "error", "message": "Task must have dates, a duration, or a dependency."})

        # Extract taskId (first part that is not status, date, duration, or dependency)
        task_id = None
        for part in parts:
            if not is_status(part) and not is_date(part) and not is_duration(part) and not is_dependency(part) and part:
                task_id = part
                break

        if task_id:
            if not re.match(r"^[A-Za-z][A-Za-z0-9_]*$", task_id):
                issues.append({"line": idx, "severity": "error", "message": f"Gantt task id '{task_id}' must be alphanumeric without spaces."})
            elif task_id in task_ids:
                issues.append({"line": idx, "severity": "error", "message": f"Duplicate Gantt task id '{task_id}'."})
            else:
                task_ids.add(task_id)

    # Check dependency IDs reference existing task IDs
    for idx, line in enumerate(lines, start=1):
        stripped = line.strip()
        if ":" not in stripped or stripped.startswith(("gantt", "title", "dateFormat", "axisFormat", "section", "excludes", "todayMarker")):
            continue
        meta = stripped.split(":", 1)[1]
        parts = [part.strip() for part in meta.split(",")]
        for part in parts:
            if part.startswith("after "):
                dep_ids = part[len("after "):].strip().split()
                for dep_id in dep_ids:
                    if dep_id and dep_id not in task_ids:
                        issues.append({"line": idx, "severity": "warning", "message": f"Dependency 'after {dep_id}' references unknown task id '{dep_id}'."})

    # Section count check
    if section_count > 8:
        issues.append({"line": 1, "severity": "warning", "message": f"Gantt chart has {section_count} sections. Keep to 6 or fewer for readability."})

    # Total task count check
    if len(task_ids) > 30:
        issues.append({"line": 1, "severity": "warning", "message": f"Gantt chart has {len(task_ids)} tasks. Keep to 25 or fewer for readability."})


def _validate_pie(lines, issues):
    slices = 0
    for idx, line in enumerate(lines, start=1):
        stripped = line.strip()
        if stripped.startswith('"'):
            slices += 1
            if not re.match(r'^"[^"]+"\s*:\s*\d+(\.\d+)?$', stripped):
                issues.append({"line": idx, "severity": "error", "message": 'Pie slices must use: "Label" : value.'})
    if slices < 2:
        issues.append({"line": 1, "severity": "warning", "message": "Pie chart should contain at least two slices."})


def _validate_xy(lines, issues):
    joined = "\n".join(lines)
    required = ["title", "x-axis", "y-axis"]
    for key in required:
        if key not in joined:
            issues.append({"line": 1, "severity": "error", "message": f"XY chart is missing '{key}'."})
    if "bar [" not in joined and "line [" not in joined:
        issues.append({"line": 1, "severity": "error", "message": "XY chart needs at least one bar or line data series."})

    x_labels_count = 0
    # Find x-axis labels count
    for idx, line in enumerate(lines, start=1):
        stripped = line.strip()
        if stripped.startswith("x-axis"):
            x_match = re.search(r'x-axis\s*\[([^\]]+)\]', stripped)
            if x_match:
                x_labels_count = len([lbl.strip() for lbl in x_match.group(1).split(',') if lbl.strip()])
            else:
                issues.append({"line": idx, "severity": "error", "message": "x-axis must define labels in square brackets, e.g. x-axis [Jan, Feb]"})

    for idx, line in enumerate(lines, start=1):
        stripped = line.strip()
        
        if stripped.startswith("legend"):
            issues.append({"line": idx, "severity": "error", "message": "legend is not supported in xychart-beta syntax. Omit the legend directive."})
            
        elif stripped.startswith("annotate"):
            issues.append({"line": idx, "severity": "error", "message": "annotate is not supported in xychart-beta syntax."})
            
        elif stripped.startswith("grid"):
            issues.append({"line": idx, "severity": "error", "message": "grid is not supported in xychart-beta syntax."})
            
        elif stripped.startswith(("line ", "line[", "bar ", "bar[")):
            # Check for inline series label
            series_match = re.match(r'^(line|bar)\s*\[([^\]]+)\]\s*["\']([^"\']+)["\']\s*$', stripped)
            if series_match:
                issues.append({"line": idx, "severity": "error", "message": f"Do not put inline labels like \"{series_match.group(3)}\" after {series_match.group(1)} series."})
            
            # Check data points count against x-axis labels count
            data_match = re.search(r'(?:line|bar)\s*\[([^\]]+)\]', stripped)
            if data_match:
                data_vals = [val.strip() for val in data_match.group(1).split(',') if val.strip()]
                if x_labels_count > 0 and len(data_vals) != x_labels_count:
                    issues.append({
                        "line": idx, 
                        "severity": "warning", 
                        "message": f"Data series has {len(data_vals)} values, but x-axis has {x_labels_count} categories. They must match."
                    })


def _validate_quadrant_chart(lines, issues):
    if len(lines) <= 1:
        issues.append({"line": 1, "severity": "error", "message": "Quadrant chart is empty. It must contain title, axes, quadrant labels, and plotted items."})
        return

    joined = "\n".join(lines)
    if "x-axis" not in joined and "x-axis-title" not in joined:
        issues.append({"line": 1, "severity": "warning", "message": "Quadrant chart is missing an x-axis definition (e.g. x-axis Low --> High)."})
    if "y-axis" not in joined and "y-axis-title" not in joined:
        issues.append({"line": 1, "severity": "warning", "message": "Quadrant chart is missing a y-axis definition (e.g. y-axis Low --> High)."})

    has_items = False
    for idx, line in enumerate(lines, start=1):
        stripped = line.strip()
        if stripped.startswith("x-axis-title"):
            issues.append({"line": idx, "severity": "error", "message": "Use 'x-axis <left> --> <right>' instead of 'x-axis-title'."})
        if stripped.startswith("y-axis-title"):
            issues.append({"line": idx, "severity": "error", "message": "Use 'y-axis <bottom> --> <top>' instead of 'y-axis-title'."})
        
        if ":" in stripped and not stripped.startswith(("title", "x-axis", "y-axis", "quadrant-")):
            has_items = True
            if not re.search(r':\s*\[\s*[0-9\.]+\s*,\s*[0-9\.]+\s*\]', stripped):
                issues.append({"line": idx, "severity": "error", "message": f"Quadrant chart item '{stripped}' must specify [x, y] coordinates, e.g. \"Item\": [0.8, 0.9]."})
        elif stripped and not stripped.startswith(("quadrantChart", "title", "x-axis", "y-axis", "quadrant-1", "quadrant-2", "quadrant-3", "quadrant-4")):
            issues.append({"line": idx, "severity": "error", "message": f"Invalid quadrantChart syntax line '{stripped}'. Items must specify [x, y] coordinates."})

    if not has_items:
        issues.append({"line": 1, "severity": "error", "message": "Quadrant chart contains no plotted items with [x, y] coordinates."})


def _validate_git_graph(lines, issues):
    if len(lines) <= 1:
        issues.append({"line": 1, "severity": "error", "message": "GitGraph diagram is empty. It must contain commits or branch operations."})
        return

    created_branches = {"main"}
    current_branch = "main"
    seen_commit_ids = set()

    for idx, line in enumerate(lines, start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("gitGraph"):
            continue

        if stripped.startswith(("rebase", "delete branch", "delete ")):
            issues.append({"line": idx, "severity": "error", "message": f"Directive '{stripped}' is unsupported by Mermaid gitGraph syntax."})
            continue

        branch_match = re.match(r'^branch\s+([^\s]+)', stripped, re.IGNORECASE)
        if branch_match:
            b_name = branch_match.group(1)
            if b_name == "main":
                issues.append({"line": idx, "severity": "error", "message": "Do not write 'branch main'. The 'main' branch exists by default."})
            created_branches.add(b_name)
            current_branch = b_name
            continue

        checkout_match = re.match(r'^checkout\s+([^\s]+)', stripped, re.IGNORECASE)
        if checkout_match:
            b_name = checkout_match.group(1)
            if b_name not in created_branches:
                issues.append({"line": idx, "severity": "error", "message": f"Cannot checkout branch '{b_name}' before creating it with 'branch {b_name}'."})
            current_branch = b_name
            continue

        merge_match = re.match(r'^merge\s+([^\s]+)', stripped, re.IGNORECASE)
        if merge_match:
            m_branch = merge_match.group(1)
            if m_branch == current_branch:
                issues.append({"line": idx, "severity": "error", "message": f"Cannot merge branch '{m_branch}' into itself."})
            if m_branch not in created_branches:
                issues.append({"line": idx, "severity": "error", "message": f"Cannot merge non-existent branch '{m_branch}'."})
            continue

        if stripped.startswith("commit"):
            id_match = re.search(r'id:\s*["\']([^"\']+)["\']', stripped, re.IGNORECASE)
            if id_match:
                commit_id = id_match.group(1)
                if commit_id in seen_commit_ids:
                    issues.append({"line": idx, "severity": "error", "message": f"Duplicate commit ID '{commit_id}'. Commit IDs must be globally unique."})
                seen_commit_ids.add(commit_id)
            continue


def _validate_requirement_diagram(lines, issues):
    if len(lines) <= 1:
        issues.append({"line": 1, "severity": "error", "message": "Requirement diagram is empty. Declare requirement blocks using curly braces {}."})
        return

    has_blocks = False
    for idx, line in enumerate(lines, start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("requirementDiagram"):
            continue

        if re.search(r'^\s*(?:requirement|functionalRequirement|performanceRequirement|interfaceRequirement|physicalRequirement|designConstraint|element)\s+[A-Za-z0-9_-]+\s*\{', stripped, re.IGNORECASE):
            has_blocks = True
            continue

        if re.search(r'-->', stripped):
            issues.append({"line": idx, "severity": "error", "message": "Do not use flowchart '-->' arrows. Use SysML arrows like '- contains ->', '- derives ->', '- satisfies ->', '- verifies ->'."})

        if re.search(r'^\s*[A-Za-z0-9_-]+\[[^\]]+\]', stripped):
            issues.append({"line": idx, "severity": "error", "message": "Do not use flowchart square brackets like 'A[Text]'. Declare requirements in SysML blocks using {}."})

    if not has_blocks:
        issues.append({"line": 1, "severity": "warning", "message": "Requirement diagram should declare requirement elements inside {} blocks."})


def _validate_c4_diagram(lines, issues):
    if len(lines) <= 1:
        issues.append({"line": 1, "severity": "error", "message": "C4 diagram is empty."})
        return

    first = lines[0].strip()
    if not first.startswith(("C4Context", "C4Container", "C4Component", "C4Dynamic")):
        issues.append({"line": 1, "severity": "error", "message": "C4 diagram must start with 'C4Context', 'C4Container', or 'C4Component'."})
        return

    has_elements = False
    for idx, line in enumerate(lines, start=1):
        stripped = line.strip()
        if not stripped or idx == 1:
            continue

        if re.search(r'\b(?:Person|Person_Ext|System|System_Ext|Container|ContainerDb|Component)\s*\(', stripped):
            has_elements = True
            continue

        if re.search(r'-->|-.->', stripped):
            issues.append({"line": idx, "severity": "error", "message": "Do not use flowchart arrow operators like '-->'. Use C4 'Rel' macro instead, e.g. Rel(user, system, 'Uses')."})

    if not has_elements:
        issues.append({"line": 1, "severity": "warning", "message": "C4 diagram should define components using proper macros like Person(), System(), or Container()."})


def _validate_mindmap(lines, issues):
    if len(lines) <= 1:
        issues.append({"line": 1, "severity": "error", "message": "Mindmap diagram is empty."})
        return

    first = lines[0].strip()
    if not first.startswith("mindmap"):
        issues.append({"line": 1, "severity": "error", "message": "Mindmap diagram must start with the 'mindmap' keyword."})
        return

    for idx, line in enumerate(lines, start=1):
        stripped = line.strip()
        if not stripped or idx == 1:
            continue

        if "-->" in stripped or "-.->" in stripped or "==>" in stripped:
            issues.append({"line": idx, "severity": "error", "message": "Mindmaps do not support flowchart connector arrows (-->). Hierarchy is defined purely by nested indentation."})


def _validate_timeline(lines, issues):
    if len(lines) <= 1:
        issues.append({"line": 1, "severity": "error", "message": "Timeline diagram is empty."})
        return

    first = lines[0].strip()
    if not first.startswith("timeline"):
        issues.append({"line": 1, "severity": "error", "message": "Timeline diagram must start with the 'timeline' keyword."})
        return

    has_period_or_event = False
    for idx, line in enumerate(lines, start=1):
        stripped = line.strip()
        if not stripped or idx == 1:
            continue
        if stripped.startswith(("title ", "section ", "%%")):
            continue
        if ":" in stripped:
            has_period_or_event = True
        if "-->" in stripped or "-.->" in stripped or "==>" in stripped:
            issues.append({"line": idx, "severity": "error", "message": "Timeline diagrams do not support connector arrows (-->). Use 'Period : Event' syntax."})

    if not has_period_or_event:
        issues.append({"line": 1, "severity": "error", "message": "Timeline diagram must contain at least one 'Period : Event' entry."})


def _validate_radar(lines, issues):
    if len(lines) <= 1:
        issues.append({"line": 1, "severity": "error", "message": "Radar chart is empty."})
        return

    body = lines
    if lines[0].strip() == "---":
        end_idx = -1
        for idx, l in enumerate(lines[1:], start=1):
            if l.strip() == "---":
                end_idx = idx
                break
        if end_idx != -1:
            body = lines[end_idx + 1:]

    if not body:
        issues.append({"line": 1, "severity": "error", "message": "Radar chart has no body content."})
        return

    first = body[0].strip()
    if not first.startswith("radar-beta") and not first.startswith("radar"):
        issues.append({"line": 1, "severity": "error", "message": "Radar chart must start with 'radar-beta'."})
        return

    has_axis = False
    has_curve = False
    for idx, line in enumerate(body, start=1):
        stripped = line.strip()
        if stripped.startswith("axis "):
            has_axis = True
        elif stripped.startswith("curve "):
            has_curve = True

    if not has_axis:
        issues.append({"line": 1, "severity": "error", "message": "Radar chart must define at least one 'axis' with evaluation dimensions."})
    if not has_curve:
        issues.append({"line": 1, "severity": "error", "message": "Radar chart must define at least one 'curve' with data series values."})


def _validate_block(lines, issues):
    if len(lines) <= 1:
        issues.append({"line": 1, "severity": "error", "message": "Block diagram is empty."})
        return

    first = lines[0].strip()
    if not first.startswith("block-beta") and not first.startswith("block"):
        issues.append({"line": 1, "severity": "error", "message": "Block diagram must start with 'block-beta'."})
        return

    if " TD" in first or " LR" in first:
        issues.append({"line": 1, "severity": "error", "message": "Block diagrams do not support 'TD' or 'LR' keywords. Use 'columns N' to control layout."})

    has_columns = False
    open_blocks = 0

    for idx, line in enumerate(lines, start=1):
        stripped = line.strip()
        if not stripped or idx == 1:
            continue

        if stripped.startswith("columns "):
            has_columns = True
        elif stripped.startswith("block:"):
            open_blocks += 1
        elif stripped == "end":
            open_blocks -= 1
            if open_blocks < 0:
                issues.append({"line": idx, "severity": "error", "message": "Unexpected 'end' statement without matching 'block:' group."})

    if not has_columns:
        issues.append({"line": 2, "severity": "warning", "message": "Block diagrams should declare 'columns N' (e.g. 'columns 3') to define the grid."})

    if open_blocks > 0:
        issues.append({"line": len(lines), "severity": "error", "message": f"Missing 'end' statement. {open_blocks} unclosed 'block:' group(s)."})


def _validate_ishikawa(lines, issues):
    if len(lines) <= 1:
        issues.append({"line": 1, "severity": "error", "message": "Ishikawa diagram is empty."})
        return

    first = lines[0].strip()
    if first.startswith("flowchart") or first.startswith("graph"):
        _validate_flowchart(lines, issues)
        return

    if not first.startswith("ishikawa-beta") and not first.startswith("ishikawa"):
        issues.append({"line": 1, "severity": "error", "message": "Ishikawa diagram must start with 'ishikawa-beta'."})
        return

    if len(lines) < 2 or not lines[1].strip():
        issues.append({"line": 2, "severity": "error", "message": "Ishikawa diagram must declare the main problem/effect statement on line 2."})


def _validate_treemap(lines, issues):
    if len(lines) <= 1:
        issues.append({"line": 1, "severity": "error", "message": "Treemap diagram is empty."})
        return

    first = lines[0].strip()
    if first.startswith("flowchart") or first.startswith("graph"):
        _validate_flowchart(lines, issues)
        return

    if not first.startswith("treemap-beta") and not first.startswith("treemap"):
        issues.append({"line": 1, "severity": "error", "message": "Treemap diagram must start with 'treemap-beta'."})
        return


def _validate_packet(lines, issues):
    if not lines:
        return
    first = lines[0].strip()
    if not first.startswith("packet-beta") and not first.startswith("packet"):
        issues.append({"line": 1, "severity": "error", "message": "Packet diagram must start with 'packet-beta'."})
        return

    for idx, line in enumerate(lines[1:], start=2):
        stripped = line.strip()
        if not stripped or stripped.startswith("title ") or stripped.startswith("%%") or stripped.startswith("---"):
            continue
        if not re.match(r"^\d+(?:-\d+)?\s*:\s*.*$", stripped):
            issues.append({"line": idx, "severity": "warning", "message": f"Invalid packet field syntax: '{stripped}'."})


def _validate_wardley(lines, issues):
    if not lines:
        return
    first = lines[0].strip()
    if not first.startswith("wardley-beta") and not first.startswith("wardley"):
        issues.append({"line": 1, "severity": "error", "message": "Wardley map must start with 'wardley-beta'."})
        return

    declared_nodes = set()
    for idx, line in enumerate(lines[1:], start=2):
        stripped = line.strip()
        if not stripped or stripped.startswith("title ") or stripped.startswith("%%") or stripped.startswith("---") or stripped.startswith("size ") or stripped.startswith("stages ") or stripped.startswith("annotations "):
            continue

        # Check anchor / component / pipeline / submap
        node_match = re.match(r"^(anchor|component|pipeline|submap)\s+(.+?)\s*\[\s*([\d\.\s,\-]+)\s*\](?:\s*(?:\(build\)|\(buy\)|\(outsource\)|\(market\)|\(inertia\)|label\s*\[.*?\]))*$", stripped)
        if node_match:
            node_type, name, coords_str = node_match.groups()
            name = name.strip()
            declared_nodes.add(name)
            coords = [c.strip() for c in coords_str.split(",") if c.strip()]
            for c in coords:
                try:
                    val = float(c)
                    if val < 0.0 or val > 1.0:
                        issues.append({"line": idx, "severity": "warning", "message": f"Coordinate {val} is outside [0.0, 1.0] range."})
                except ValueError:
                    issues.append({"line": idx, "severity": "error", "message": f"Invalid coordinate value '{c}'."})
            continue

        # Check evolve
        evolve_match = re.match(r"^evolve\s+(.+?)\s+([-+]?\d*\.?\d+)(?:\s+\[.*?\])?$", stripped)
        if evolve_match:
            evolve_name, target_evo = evolve_match.groups()
            try:
                val = float(target_evo)
                if val < 0.0 or val > 1.0:
                    issues.append({"line": idx, "severity": "warning", "message": f"Target evolution {val} is outside [0.0, 1.0] range."})
            except ValueError:
                issues.append({"line": idx, "severity": "error", "message": f"Invalid target evolution '{target_evo}'."})
            continue

        # Check note / annotation
        note_match = re.match(r'^(?:note\s+"(.*?)"|annotation\s+\d+)\s*\[\s*([\d\.\s,\-]+)\s*\](?:\s*.*)?$', stripped)
        if note_match:
            continue

        # Check link A -> B or A +> B etc.
        link_match = re.match(r"^(.+?)\s*(?:->|-->|-.->|\+>|\+<|\+<>|\+'-.*?'->|\+'-.*?'\+>)\s*(.+?)(?:;\s*.*)?$", stripped)
        if link_match:
            continue

        # If it doesn't match any known wardley syntax
        issues.append({"line": idx, "severity": "warning", "message": f"Unrecognized Wardley map line: '{stripped}'."})


def _validate_cynefin(lines, issues):
    if not lines:
        return
    first = lines[0].strip()
    if not first.startswith("cynefin-beta") and not first.startswith("cynefin"):
        issues.append({"line": 1, "severity": "error", "message": "Cynefin diagram must start with 'cynefin-beta'."})
        return

    valid_domains = {"complex", "complicated", "clear", "chaotic", "confusion"}
    current_domain = None

    for idx, line in enumerate(lines[1:], start=2):
        stripped = line.strip()
        if not stripped or stripped.startswith("title ") or stripped.startswith("%%") or stripped.startswith("---") or stripped.startswith("accTitle:") or stripped.startswith("accDescr:"):
            continue

        # Check domain declaration
        if stripped.lower() in valid_domains:
            current_domain = stripped.lower()
            continue

        # Check transition e.g. complex --> complicated : "text"
        transition_match = re.match(r"^([a-zA-Z]+)\s*-->\s*([a-zA-Z]+)(?:\s*:\s*.*)?$", stripped)
        if transition_match:
            from_d, to_d = transition_match.group(1).lower(), transition_match.group(2).lower()
            if from_d not in valid_domains:
                issues.append({"line": idx, "severity": "warning", "message": f"Unknown source domain '{from_d}' in transition."})
            if to_d not in valid_domains:
                issues.append({"line": idx, "severity": "warning", "message": f"Unknown target domain '{to_d}' in transition."})
            if from_d == to_d:
                issues.append({"line": idx, "severity": "warning", "message": f"Self-transition on '{from_d}' is ignored."})
            continue

        # Check quoted item label
        if re.match(r'^"[^"]+"$', stripped):
            if not current_domain:
                issues.append({"line": idx, "severity": "warning", "message": f"Item '{stripped}' defined before any domain keyword."})
            continue

        issues.append({"line": idx, "severity": "warning", "message": f"Unrecognized Cynefin line: '{stripped}'."})


def _validate_event_modeling(lines, issues):
    if not lines:
        return
    first = lines[0].strip()
    if not first.startswith("eventmodeling") and not first.startswith("eventModeling"):
        issues.append({"line": 1, "severity": "error", "message": "Event modeling diagram must start with 'eventmodeling'."})
        return

    valid_types = {
        "ui", "pcr", "processor", "cmd", "command",
        "rmo", "readmodel", "evt", "event"
    }

    seen_frames = set()

    for idx, line in enumerate(lines[1:], start=2):
        stripped = line.strip()
        if not stripped or stripped.startswith("%%") or stripped.startswith("---") or stripped.startswith("accTitle:") or stripped.startswith("accDescr:"):
            continue

        # Data block: data Name `json`{ ... } or data Name { ... }
        if re.match(r"^data\s+[a-zA-Z0-9_]+(?:\s+`?[a-zA-Z0-9]+`?)?\s*\{.*\}?$", stripped):
            continue

        # Frame: (tf|timeframe|rf|resetframe) <id> <type> <name> [payload]
        frame_match = re.match(r"^(tf|timeframe|rf|resetframe)\s+([a-zA-Z0-9_]+)\s+([a-zA-Z]+)\s+([a-zA-Z0-9_\.]+)(?:\s+(?:->>.*|`?[a-zA-Z0-9]*`?\{.*\}|\[\[.*\]\]))?$", stripped)
        if frame_match:
            frame_id = frame_match.group(2)
            ent_type = frame_match.group(3).lower()
            if ent_type not in valid_types:
                issues.append({"line": idx, "severity": "warning", "message": f"Unknown entity type '{ent_type}'. Valid types: ui, pcr/processor, cmd/command, rmo/readmodel, evt/event."})
            if frame_id in seen_frames:
                issues.append({"line": idx, "severity": "warning", "message": f"Duplicate timeframe index '{frame_id}'."})
            seen_frames.add(frame_id)
            continue

        issues.append({"line": idx, "severity": "warning", "message": f"Unrecognized Event Modeling line: '{stripped}'."})


def _validate_block(lines, issues):
    if not lines:
        return
    first = lines[0].strip()
    if not first.startswith("block-beta") and not first.startswith("block"):
        issues.append({"line": 1, "severity": "error", "message": "Block diagram must start with 'block-beta'."})
        return

    block_depth = 0
    has_columns = False

    for idx, line in enumerate(lines[1:], start=2):
        stripped = line.strip()
        if not stripped or stripped.startswith("%%") or stripped.startswith("---") or stripped.startswith("accTitle:") or stripped.startswith("accDescr:"):
            continue

        if stripped.startswith("columns "):
            has_columns = True
            continue

        if stripped.startswith("block:") or stripped == "block":
            block_depth += 1
            continue

        if stripped == "end":
            if block_depth <= 0:
                issues.append({"line": idx, "severity": "error", "message": "Unexpected 'end' without matching 'block:' group."})
            else:
                block_depth -= 1
            continue

    if block_depth > 0:
        issues.append({"line": len(lines), "severity": "error", "message": f"{block_depth} unclosed 'block:' group(s) missing 'end'."})


def _validate_swimlane(lines, issues):
    if not lines:
        return
    first = lines[0].strip()
    if not first.startswith("swimlane-beta") and not first.startswith("swimlane"):
        issues.append({"line": 1, "severity": "error", "message": "Swimlane diagram must start with 'swimlane-beta LR' or 'swimlane-beta TB'."})
        return

    subgraph_depth = 0
    for idx, line in enumerate(lines[1:], start=2):
        stripped = line.strip()
        if not stripped or stripped.startswith("%%") or stripped.startswith("---") or stripped.startswith("accTitle:") or stripped.startswith("accDescr:"):
            continue
        if stripped.startswith("subgraph ") or stripped == "subgraph":
            subgraph_depth += 1
            if subgraph_depth > 1:
                issues.append({"line": idx, "severity": "warning", "message": "Nested subgraphs are not recommended in swimlane diagrams."})
            continue
        if stripped == "end":
            if subgraph_depth <= 0:
                issues.append({"line": idx, "severity": "error", "message": "Unexpected 'end' without matching 'subgraph'."})
            else:
                subgraph_depth -= 1
            continue

    if subgraph_depth > 0:
        issues.append({"line": len(lines), "severity": "error", "message": f"{subgraph_depth} unclosed 'subgraph' lane(s) missing 'end'."})















