# Sequence Diagram Rules & Standards for Mermaid JS

## 1. Syntax & Directives
* **Declaration**: First line MUST be `sequenceDiagram`.
* **Step Numbering**: Use `autonumber` on the second line to automatically prefix numbers (1, 2, 3) to messages.
* **Global Theme**: Set custom themes at the top of the diagram using:
  `%%{init: {'theme': 'dark'}}%%` (supported: `default`, `forest`, `dark`, `neutral`, `base`).

## 2. Participant Declaration
* **Location**: ALWAYS declare ALL participants at the top of the diagram before any interactions.
* **Ordering**: Order participants horizontally left-to-right based on their first interaction. Typical sequence:
  `User/Actor` → `Frontend/UI` → `Backend/API` → `Internal Services` → `Databases/Storage` → `External APIs/Webhooks`
* **Syntax & Types**:
  * `actor alias as Label` - Stick figure for human users (e.g. `actor User as Customer`).
  * `participant alias as Label` - Rectangle box for systems/services/databases.
* **Aliases**: MUST be simple alphanumeric strings with NO spaces, hyphens, or special characters. Use camelCase or short abbreviations (e.g., `authSvc`, `userDB`).
* **Naming**: Participants use Title Case (e.g. `Order Service`), while messages use short verb phrases (e.g. `Validate user`).
* **NO QUOTES ON PARTICIPANTS OR LABELS**: NEVER wrap participant names, aliases, or labels in quotes (e.g., write `participant FE as Frontend`, NOT `participant "Frontend"` or `participant FE as "Frontend"`). In Mermaid sequence diagrams, quotes are NOT stripped and will literally render double quote marks inside the visual participant box.

## 3. Arrow & Line Standards
* **Requests (Sync)**: Use `->>` (Solid arrow with arrowhead) directed left-to-right.
* **Responses (Sync)**: Use `-->>` (Dotted arrow with arrowhead) directed right-to-left.
* **Failures**: Use `-x` for request failure and `--x` for response failure.
* **Async Messages**: Use `-)` for async fire-and-forget and `--))` for async response.
* **Self-Calls**: Model internal work using self-messages: `BE->>BE: Validate credentials`.
* **Arrow Labels**: Keep under 40 characters. Start with a verb. Do NOT use colons (`:`) inside the label text. Avoid numbering (already handled by `autonumber`).

## 4. Lifelines & Activation
* Use `->>+` to activate a target lifeline and `-->>-` to deactivate it (or explicit `activate`/`deactivate` statements).
* **Activation Balance**: Every activation (`+` / `activate`) MUST be matched by exactly one deactivation (`-` / `deactivate`) for that same participant.
* **Block Safety**: If activated inside a control block (`alt`, `opt`, `loop`, `par`), it must be deactivated within that same block path.
* **Simplification Rule**: If activation paths are complex or nested, omit `+`/`-` entirely and use plain arrows (`->>` / `-->>`) to avoid rendering failures.

## 5. Control Structures (Grouping)
Always close grouping blocks with `end`. Avoid nesting more than 2 levels deep.
* **Branching / Error Paths**: Use `alt [Condition]` / `else [Alternative]` / `end` blocks.
* **Optional Flows**: Use `opt [Condition]` / `end` blocks.
* **Loops / Retries**: Use `loop [Condition]` / `end` blocks.
* **Concurrency**: Use `par [Parallel Title]` / `and` / `end` blocks. Title must be in square brackets.

## 6. Customization & Styling
* **Participant Grouping**: Wrap declarations inside `box rgb(R,G,B) Title ... end` to create colored background containers.
* **Highlight Regions**: Wrap interaction steps inside `rect rgb(R,G,B) ... end` to highlight success, warning, or error sections.
* **Arrow & Participant Styling**: Individual arrows or participant boxes cannot be styled inline. They inherit their colors from the global theme (actors are purple/pink, frontend cyan, backend orange, services blue/green, database light blue, external APIs yellow).

## 7. Example Diagram
```mermaid
%%{init: {'theme': 'default'}}%%
sequenceDiagram
    autonumber
    actor User as Customer
    box rgb(240, 248, 255) Application Layer
        participant FE as Frontend App
        participant BE as API Backend
    end
    participant DB as Database

    User->>+FE: Click Login
    FE->>+BE: POST /auth/login
    BE->>+DB: Query user record
    DB-->>-BE: User details
    
    alt Credentials Valid
        BE->>BE: Generate JWT token
        BE-->>-FE: 200 OK + JWT Token
        FE-->>-User: Show Dashboard
    else Credentials Invalid
        BE-->>-FE: 401 Unauthorized
        FE-->>-User: Show Error Message
    end
```
