# Treemap Diagram Rules & Standards for Mermaid JS

## Overview
Mermaid JS natively supports official Treemap charts using the `treemap-beta` diagram type. Treemaps display hierarchical data as a set of nested, proportionally sized rectangles tiled according to their numeric values.

## Syntax & Core Structure

```mermaid
treemap-beta
"Category 1"
  "Leaf 1.1": 15
  "Leaf 1.2": 25
"Category 2"
  "Sub-Category 2.1"
    "Leaf 2.1.1": 30
    "Leaf 2.1.2": 10
  "Leaf 2.2": 20
```

---

## Mandatory Directives & Rules

1. **Header Line**:
   - Line 1 MUST be exactly `treemap-beta`.
   - **NEVER** use `flowchart TD`, `graph`, `subgraph`, or `mindmap`.

2. **Categories & Sections**:
   - Declare category and section names enclosed in double quotes (e.g. `"Technology"`, `"Financial Sector"`).

3. **Leaf Nodes & Values**:
   - Declare child leaf items indented under their respective category.
   - Leaf items MUST specify a numeric value after a colon: `"Item Label": <number>` (e.g. `"Apple": 15`, `"Microservices": 45`).

4. **Multi-level Hierarchy**:
   - Support nested sub-categories by adding an extra indentation level before declaring leaves with numeric values.

5. **No Flowchart Syntax**:
   - **NEVER** use node brackets (`[...]`), `-->`, `classDef`, `style`, or `subgraph`.
   - Treemaps rely purely on indented strings with `: <number>` leaf weights.

---

## Realistic Examples

### Example 1: Investment Portfolio Allocation
```mermaid
treemap-beta
"Technology Sector (45%)"
  "Microsoft": 18
  "Apple": 15
  "Nvidia": 12
"Financial Sector (30%)"
  "JPMorgan Chase": 12
  "Visa": 10
  "Mastercard": 8
"Healthcare Sector (25%)"
  "UnitedHealth": 10
  "Pfizer": 8
  "Johnson & Johnson": 7
```

### Example 2: Cloud Infrastructure Cost Breakdown
```mermaid
treemap-beta
"Compute Resources"
  "Kubernetes EKS Clusters": 450
  "Serverless Lambda Workers": 180
  "Batch GPU Instances": 320
"Storage & Data"
  "PostgreSQL Multi-AZ DB": 280
  "Amazon S3 Asset Bucket": 120
  "Redis Cache Cluster": 90
"Networking & Edge"
  "CloudFront CDN": 110
  "NAT Gateway & Egress": 80
```
