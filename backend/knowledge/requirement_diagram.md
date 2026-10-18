# Requirement Diagram Rules & Standards for Mermaid JS (Mermaid v12+)

## Syntax Overview
Mermaid `requirementDiagram` visualizes SysML requirements, system elements, and their relationships (containment, derivation, verification, satisfaction, refinement, traceability). In Mermaid 12, **ELK layout** powers clean routing for complex requirements trees and traceability matrices. Supports `look: "neo"` and `look: "handDrawn"`.

## Official Structure & Syntax
```mermaid
requirementDiagram

    requirement req_main {
        id: REQ-001
        text: "Manage Library Operations"
        risk: High
        verifyMethod: Test
    }

    functionalRequirement req_books {
        id: REQ-002
        text: "Manage Books catalog and inventory"
        risk: Medium
        verifyMethod: Inspection
    }

    performanceRequirement req_perf {
        id: NFR-001
        text: "Response time must be under 2 seconds"
        risk: Low
        verifyMethod: Analysis
    }

    element sys_core {
        type: system
        docRef: "System Architecture Specification v1.0"
    }

    %% Relationships
    req_main - contains -> req_books
    req_main - contains -> req_perf
    sys_core - satisfies -> req_main
```

## Mandatory Directives & Rules

1. **Header Line**:
   - The first line MUST be `requirementDiagram`.

2. **Requirement Block Declaration**:
   - Block names (e.g. `req_main`, `req_books`) MUST be valid alphanumeric identifiers without spaces or special characters.
   - Requirement types:
     - `requirement <name> { ... }`
     - `functionalRequirement <name> { ... }`
     - `performanceRequirement <name> { ... }`
     - `interfaceRequirement <name> { ... }`
     - `physicalRequirement <name> { ... }`
     - `designConstraint <name> { ... }`
   - Attributes inside `{}`:
     - `id: "<unique_id>"` (always quote IDs containing hyphens, e.g. `id: "REQ-001"`)
     - `text: "<description text>"` (must be in double quotes)
     - `risk: High` | `Medium` | `Low` (CRITICAL: NEVER quote risk values. Write `risk: High`, NOT `risk: "High"`)
     - `verifyMethod: Analysis` | `Inspection` | `Test` | `Demonstration` (CRITICAL: NEVER quote verifyMethod values. Write `verifyMethod: Test`, NOT `verifyMethod: "Test"`)

3. **Element Block Declaration**:
   - `element <name> { ... }`
   - Attributes inside `{}`:
     - `type: <element_type>` (e.g. `type: system`, `type: module`, `type: simulation`)
     - `docRef: "<reference>"`

4. **Relationship Syntax**:
   - Relationships MUST use SysML dash arrows:
     - `<src_name> - contains -> <dst_name>`
     - `<src_name> - derives -> <dst_name>`
     - `<src_name> - satisfies -> <dst_name>`
     - `<src_name> - verifies -> <dst_name>`
     - `<src_name> - refines -> <dst_name>`
     - `<src_name> - traces -> <dst_name>`

## Anti-Patterns & Common Errors — NEVER DO THESE:

### 1. NEVER Use Flowchart Node Syntax
- **WRONG**:
  ```mermaid
  requirementDiagram
      A[Library Operations] --> B[Manage Books]
      R1[Requirement]
  ```
- **CORRECT**:
  ```mermaid
  requirementDiagram
      requirement req_ops {
          id: REQ-001
          text: "Library Operations"
          risk: High
          verifyMethod: Test
      }
      functionalRequirement req_books {
          id: REQ-002
          text: "Manage Books"
          risk: Medium
          verifyMethod: Test
      }
      req_ops - contains -> req_books
  ```

### 2. NEVER Write Single-Line Unblocked Requirements
- **WRONG**:
  ```
  requirement REQ-001: Provide Online Food Ordering
  ```
- **CORRECT**:
  ```
  requirement req_ordering {
      id: REQ-001
      text: "Provide Online Food Ordering"
      risk: High
      verifyMethod: Test
  }
  ```

### 3. NEVER Use Standard Flowchart `-->` Arrows
- **WRONG**:
  ```
  req_main --> req_books
  ```
- **CORRECT**:
  ```
  req_main - contains -> req_books
  ```

## Comprehensive Example - Food Delivery System
```mermaid
requirementDiagram

    requirement req_food {
        id: REQ-001
        text: "Provide Online Food Ordering"
        risk: High
        verifyMethod: Test
    }

    functionalRequirement req_reg {
        id: REQ-002
        text: "User Registration and Authentication"
        risk: Medium
        verifyMethod: Test
    }

    functionalRequirement req_pay {
        id: REQ-003
        text: "Payment Processing Integration"
        risk: High
        verifyMethod: Inspection
    }

    performanceRequirement req_avail {
        id: NFR-001
        text: "99.9% System Availability"
        risk: Low
        verifyMethod: Analysis
    }

    element sys_backend {
        type: system
        docRef: "Food Delivery Spec v2"
    }

    req_food - contains -> req_reg
    req_food - contains -> req_pay
    req_food - derives -> req_avail
    sys_backend - satisfies -> req_food
```
