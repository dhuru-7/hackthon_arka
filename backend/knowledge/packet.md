# Packet Diagram Rules & Standards for Mermaid JS

## Overview
Packet diagrams visualize network protocols, binary header layouts, packet framing, memory-mapped I/O fields, byte offsets, and bit boundaries (e.g. TCP/IP headers, IPv6 frames, UDP packets, DNS packets, WebSocket frames, Ethernet frames).

---

## Core Directives & Syntax (`packet-beta`) [DEFAULT]

1. **Header Line**: Line 1 MUST be exactly `packet-beta`.
2. **Optional Title**: Line 2 can define `title <Title Name>` (e.g. `title UDP Packet Header`).
3. **Bit Range Fields**:
   - Multi-bit range format: `<startBit>-<endBit>: "<Field Name>"` (e.g. `0-15: "Source Port (16 bits)"`)
   - Single-bit format: `<bit>: "<Flag Name>"` (e.g. `106: "URG"`)
4. **Contiguous & Non-Overlapping**:
   - Bit indices MUST start at `0` and increase sequentially without gaps or overlaps.
   - Example: `0-15` followed by `16-31`, `32-47`, `48-63`, `64-95`.
   - If a bit sequence is reserved or unused, declare it explicitly (e.g. `96-105: "Reserved (10b)"`).
5. **Double Quotes**: Enclose all field labels in double quotes.

---

## Standard Examples

### Example 1: UDP Packet Header
```mermaid
packet-beta
title UDP Packet
0-15: "Source Port"
16-31: "Destination Port"
32-47: "Length"
48-63: "Checksum"
64-95: "Data (variable length)"
```

### Example 2: IPv4 Header Layout
```mermaid
packet-beta
title IPv4 Header
0-3: "Version (4b)"
4-7: "IHL (4b)"
8-15: "Type of Service (8b)"
16-31: "Total Length (16 bits)"
32-47: "Identification (16 bits)"
48-50: "Flags (3b)"
51-63: "Fragment Offset (13b)"
64-71: "Time to Live (8b)"
72-79: "Protocol (8b)"
80-95: "Header Checksum (16 bits)"
96-127: "Source IP Address (32 bits)"
128-159: "Destination IP Address (32 bits)"
```

### Example 3: TCP Segment Header
```mermaid
packet-beta
title TCP Header
0-15: "Source Port (16 bits)"
16-31: "Destination Port (16 bits)"
32-63: "Sequence Number (32 bits)"
64-95: "Acknowledgment Number (32 bits)"
96-99: "Data Offset (4b)"
100-105: "Reserved (6b)"
106: "URG"
107: "ACK"
108: "PSH"
109: "RST"
110: "SYN"
111: "FIN"
112-127: "Window Size (16 bits)"
128-143: "Checksum (16 bits)"
144-159: "Urgent Pointer (16 bits)"
160-191: "Options & Padding (32 bits)"
```

---

## Best Practices
1. **Accurate Bit Boundaries**: Ensure fields align to 32-bit (or 64-bit) word rows whenever modeling standard protocols.
2. **Clear Field Labels**: Include both the field description and bit width in quotes.
3. **Continuous Indexing**: Never jump from bit 15 to bit 20 without declaring the bits in between.
