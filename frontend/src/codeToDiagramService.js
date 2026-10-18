/**
 * codeToDiagramService.js — Code-to-Diagram Ingestion & Deterministic Parsers
 * 
 * Supports zero-prompt deterministic diagram generation for:
 * - SQL DDL (CREATE TABLE -> Mermaid erDiagram)
 * - Prisma Schema (schema.prisma -> Mermaid erDiagram)
 * - Docker Compose (docker-compose.yml -> Mermaid Flowchart/Architecture)
 * - OpenAPI / Swagger (route and sequence suggestions)
 */

export const DATABASE_SUGGESTIONS = [
  {
    id: 'db_er',
    label: 'Entity Relationship (ER)',
    icon: '📊',
    diagramType: 'erDiagram',
    prompt: 'Generate an Entity Relationship (ER) diagram mapping all tables, primary keys, foreign keys, and cardinalities.'
  },
  {
    id: 'db_crud_flow',
    label: 'Data Flow & CRUD Pipeline',
    icon: '🔄',
    diagramType: 'flowchart',
    prompt: 'Map out the end-to-end data flow and CRUD pipeline showing how records are created, queried, updated, and deleted across related entities.'
  },
  {
    id: 'db_domain_class',
    label: 'Domain Class Model',
    icon: '🏛️',
    diagramType: 'classDiagram',
    prompt: 'Create an object-oriented Domain Model Class Diagram showing entities, their attributes, and relationships.'
  },
  {
    id: 'db_bottleneck_audit',
    label: 'Schema Bottlenecks & Audit',
    icon: '🔍',
    diagramType: 'mindmap',
    prompt: 'Analyze this database schema for potential performance bottlenecks, missing indexes, orphaned tables, and relationship complexity.'
  }
];

export const DOCKER_SUGGESTIONS = [
  {
    id: 'infra_architecture',
    label: 'Service Architecture Topology',
    icon: '🏗️',
    diagramType: 'architecture',
    prompt: 'Create a multi-tier service architecture topology diagram mapping out all containers, databases, caches, web servers, and external ports.'
  },
  {
    id: 'infra_network_routing',
    label: 'Network & Port Routing',
    icon: '🌐',
    diagramType: 'flowchart',
    prompt: 'Map out container network topology, port forwarding, ingress gateways, and internal service communication channels.'
  },
  {
    id: 'infra_startup_deps',
    label: 'Startup Dependency Chain',
    icon: '⚙️',
    diagramType: 'sequence',
    prompt: 'Visualize the container startup order, healthcheck dependencies, and service initialization flow.'
  },
  {
    id: 'infra_volumes_storage',
    label: 'Volumes & Persistent Storage',
    icon: '📦',
    diagramType: 'flowchart',
    prompt: 'Map out persistent Docker volume mounts, host bind mounts, data directories, and shared file stores.'
  }
];

export const OPENAPI_SUGGESTIONS = [
  {
    id: 'api_sequence',
    label: 'API Request / Response Flow',
    icon: '🔌',
    diagramType: 'sequence',
    prompt: 'Generate an API sequence diagram showing the request-response lifecycle between the client, API gateway, and downstream handlers.'
  },
  {
    id: 'api_route_tree',
    label: 'Endpoint Route Hierarchy',
    icon: '🗺️',
    diagramType: 'treeView',
    prompt: 'Generate an organized endpoint route hierarchy diagram grouping all API routes, HTTP methods (GET, POST, PUT, DELETE), and path parameters.'
  },
  {
    id: 'api_auth_flow',
    label: 'Auth & Token Security Flow',
    icon: '🔐',
    diagramType: 'sequence',
    prompt: 'Map out the authentication and authorization security flow (JWT Bearer, OAuth2, or API key validation).'
  },
  {
    id: 'api_data_models',
    label: 'Request / Response Schemas',
    icon: '📑',
    diagramType: 'classDiagram',
    prompt: 'Create a schema model diagram illustrating the request payload structures, data types, and HTTP response schemas.'
  }
];

export const GENERAL_CODE_SUGGESTIONS = [
  {
    id: 'code_architecture',
    label: 'Component Architecture',
    icon: '🏗️',
    diagramType: 'architecture',
    prompt: 'Analyze this code structure and generate an architecture diagram showing the module organization and imports.'
  },
  {
    id: 'code_logic_flow',
    label: 'Execution Logic Flowchart',
    icon: '🔄',
    diagramType: 'flowchart',
    prompt: 'Generate a step-by-step logic flowchart illustrating the control flow, branching conditions, and execution path of this code.'
  },
  {
    id: 'code_class_model',
    label: 'Class & Object Model',
    icon: '🏛️',
    diagramType: 'classDiagram',
    prompt: 'Generate a class diagram showing object structures, classes, functions, interfaces, and data models defined in this file.'
  },
  {
    id: 'code_sequence',
    label: 'Function Call Sequence',
    icon: '⚡',
    diagramType: 'sequence',
    prompt: 'Create a function call sequence diagram showing how methods and asynchronous tasks interact during execution.'
  }
];

/**
 * Detect code type from filename or content keywords
 * Returns: 'sql' | 'prisma' | 'docker' | 'openapi' | 'code' | null
 */
export function detectCodeType(filename = '', content = '') {
  const lowerName = (filename || '').toLowerCase();
  const lowerContent = (content || '').toLowerCase();

  // 1. Prisma Schema
  if (lowerName.endsWith('.prisma') || (lowerContent.includes('model ') && lowerContent.includes('@id'))) {
    return 'prisma';
  }

  // 2. SQL DDL
  if (lowerName.endsWith('.sql') || (lowerContent.includes('create table') && lowerContent.includes('('))) {
    return 'sql';
  }

  // 3. Docker Compose
  if (
    lowerName.includes('docker-compose') ||
    lowerName.includes('compose.yml') ||
    lowerName.includes('compose.yaml') ||
    (lowerContent.includes('services:') && (lowerContent.includes('image:') || lowerContent.includes('build:')))
  ) {
    return 'docker';
  }

  // 4. OpenAPI / Swagger
  if (
    lowerName.includes('openapi') ||
    lowerName.includes('swagger') ||
    lowerContent.includes('"openapi"') ||
    lowerContent.includes('openapi:') ||
    lowerContent.includes('"swagger"')
  ) {
    return 'openapi';
  }

  // 5. General programming code
  if (/\.(ts|tsx|js|jsx|py|go|rs|java|cpp|c|cs|php|rb)$/i.test(lowerName)) {
    return 'code';
  }

  return null;
}

/**
 * Get the 4 appropriate suggestions for a detected code type
 */
export function getCodeSuggestions(codeType) {
  switch (codeType) {
    case 'sql':
    case 'prisma':
      return DATABASE_SUGGESTIONS;
    case 'docker':
      return DOCKER_SUGGESTIONS;
    case 'openapi':
      return OPENAPI_SUGGESTIONS;
    case 'code':
      return GENERAL_CODE_SUGGESTIONS;
    default:
      return GENERAL_CODE_SUGGESTIONS;
  }
}

/**
 * Deterministic SQL DDL to Mermaid erDiagram Parser
 */
export function parseSqlToEr(sqlContent) {
  if (!sqlContent || typeof sqlContent !== 'string') return null;

  // Clean comments and normalize
  const cleanSql = sqlContent
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();

  const tables = {};
  const relationships = [];

  // Match CREATE TABLE statements
  const createTableRegex = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+[`"']?([a-zA-Z0-9_]+)[`"']?\s*\(([\s\S]*?)\)(?:;|$)/gi;
  let match;

  while ((match = createTableRegex.exec(cleanSql)) !== null) {
    const tableName = match[1];
    const body = match[2];
    tables[tableName] = { columns: [] };

    // Split body into comma-separated lines (ignoring commas inside parentheses)
    const lines = [];
    let currentLine = '';
    let parenDepth = 0;

    for (let i = 0; i < body.length; i++) {
      const char = body[i];
      if (char === '(') parenDepth++;
      else if (char === ')') parenDepth--;

      if (char === ',' && parenDepth === 0) {
        if (currentLine.trim()) lines.push(currentLine.trim());
        currentLine = '';
      } else {
        currentLine += char;
      }
    }
    if (currentLine.trim()) lines.push(currentLine.trim());

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Check for standalone FOREIGN KEY constraints
      const fkMatch = line.match(/FOREIGN\s+KEY\s*\([`"']?([a-zA-Z0-9_]+)[`"']?\)\s*REFERENCES\s+[`"']?([a-zA-Z0-9_]+)[`"']?\s*\([`"']?([a-zA-Z0-9_]+)[`"']?\)/i);
      if (fkMatch) {
        const sourceCol = fkMatch[1];
        const targetTable = fkMatch[2];
        const targetCol = fkMatch[3];
        relationships.push({
          from: targetTable,
          to: tableName,
          label: sourceCol,
          type: '||--o{'
        });
        // Mark column as FK
        const colObj = tables[tableName].columns.find(c => c.name.toLowerCase() === sourceCol.toLowerCase());
        if (colObj) colObj.isFk = true;
        continue;
      }

      // Check for standalone PRIMARY KEY constraint
      const pkMatch = line.match(/^PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (pkMatch) {
        const pkCols = pkMatch[1].split(',').map(c => c.replace(/[`"'\s]/g, '').toLowerCase());
        tables[tableName].columns.forEach(c => {
          if (pkCols.includes(c.name.toLowerCase())) c.isPk = true;
        });
        continue;
      }

      // Check for other table constraints (UNIQUE, CHECK, CONSTRAINT)
      if (/^(CONSTRAINT|CHECK|UNIQUE|KEY|INDEX)\b/i.test(line)) {
        continue;
      }

      // Regular Column definition: [name] [type] [constraints...]
      const colTokens = line.split(/\s+/);
      if (colTokens.length >= 2) {
        const colName = colTokens[0].replace(/[`"']/g, '');
        let colType = colTokens[1].replace(/\(.*\)/, '').toLowerCase();

        // Map common SQL types to clean Mermaid ER types
        if (/int|serial|bigint|smallint/i.test(colType)) colType = 'int';
        else if (/char|text|varchar|uuid/i.test(colType)) colType = 'string';
        else if (/bool/i.test(colType)) colType = 'boolean';
        else if (/date|time/i.test(colType)) colType = 'datetime';
        else if (/float|double|decimal|numeric/i.test(colType)) colType = 'float';
        else if (/json/i.test(colType)) colType = 'json';

        const isPk = /PRIMARY\s+KEY/i.test(line);
        const isFk = /REFERENCES/i.test(line);

        // Check for inline REFERENCES
        const inlineFkMatch = line.match(/REFERENCES\s+[`"']?([a-zA-Z0-9_]+)[`"']?\s*\([`"']?([a-zA-Z0-9_]+)[`"']?\)/i);
        if (inlineFkMatch) {
          relationships.push({
            from: inlineFkMatch[1],
            to: tableName,
            label: colName,
            type: '||--o{'
          });
        }

        tables[tableName].columns.push({
          name: colName,
          type: colType,
          isPk,
          isFk
        });
      }
    }
  }

  const tableNames = Object.keys(tables);
  if (tableNames.length === 0) return null;

  // Build Mermaid erDiagram code
  let mermaid = 'erDiagram\n';

  // Output relationships
  const seenRel = new Set();
  for (const rel of relationships) {
    const key = `${rel.from}-${rel.to}-${rel.label}`;
    if (!seenRel.has(key)) {
      seenRel.add(key);
      mermaid += `    ${rel.from} ${rel.type} ${rel.to} : "${rel.label}"\n`;
    }
  }

  // Output tables & columns
  for (const [tName, data] of Object.entries(tables)) {
    mermaid += `    ${tName} {\n`;
    if (data.columns.length === 0) {
      mermaid += `        int id PK\n`;
    } else {
      for (const col of data.columns) {
        const keyTag = col.isPk ? 'PK' : col.isFk ? 'FK' : '';
        mermaid += `        ${col.type} ${col.name} ${keyTag}`.trimEnd() + '\n';
      }
    }
    mermaid += `    }\n`;
  }

  return mermaid.trim();
}

/**
 * Deterministic Prisma Schema to Mermaid erDiagram Parser
 */
export function parsePrismaToEr(prismaContent) {
  if (!prismaContent || typeof prismaContent !== 'string') return null;

  const cleanPrisma = prismaContent.replace(/\/\/.*$/gm, '').trim();
  const models = {};
  const relationships = [];

  const modelRegex = /model\s+([a-zA-Z0-9_]+)\s*\{([\s\S]*?)\}/g;
  let match;

  while ((match = modelRegex.exec(cleanPrisma)) !== null) {
    const modelName = match[1];
    const body = match[2];
    models[modelName] = { fields: [] };

    const lines = body.split('\n').map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
      if (line.startsWith('@@')) continue; // Skip model-level directives (@@map, @@id, etc.)

      const tokens = line.split(/\s+/);
      if (tokens.length >= 2) {
        const fieldName = tokens[0];
        let fieldType = tokens[1].replace(/[?!]/g, '');

        const isId = line.includes('@id');
        const isRelation = line.includes('@relation') || /^[A-Z]/.test(fieldType);

        const PRISMA_SCALARS = new Set(['String', 'Boolean', 'Int', 'BigInt', 'Float', 'Decimal', 'DateTime', 'Json', 'Bytes', 'Unsupported']);

        // Check if fieldType is another model (Relation)
        if (fieldType.endsWith('[]')) {
          const targetModel = fieldType.slice(0, -2);
          relationships.push({
            from: modelName,
            to: targetModel,
            label: fieldName,
            type: '||--o{'
          });
          continue;
        } else if (!PRISMA_SCALARS.has(fieldType) && /^[A-Z]/.test(fieldType)) {
          // Direct model reference
          const relMatch = line.match(/@relation\([^)]*fields:\s*\[([^\]]+)\][^)]*references:\s*\[([^\]]+)\]/);
          if (relMatch) {
            relationships.push({
              from: fieldType,
              to: modelName,
              label: relMatch[1].trim(),
              type: '||--o{'
            });
          }
          continue;
        }

        // Map Prisma primitive types to ER diagram types
        if (/Int|BigInt/i.test(fieldType)) fieldType = 'int';
        else if (/String/i.test(fieldType)) fieldType = 'string';
        else if (/Boolean/i.test(fieldType)) fieldType = 'boolean';
        else if (/DateTime/i.test(fieldType)) fieldType = 'datetime';
        else if (/Float|Decimal/i.test(fieldType)) fieldType = 'float';
        else if (/Json/i.test(fieldType)) fieldType = 'json';

        models[modelName].fields.push({
          name: fieldName,
          type: fieldType,
          isId
        });
      }
    }
  }

  const modelNames = Object.keys(models);
  if (modelNames.length === 0) return null;

  let mermaid = 'erDiagram\n';

  // Relationships
  const seenRel = new Set();
  for (const rel of relationships) {
    const key = `${rel.from}-${rel.to}`;
    if (!seenRel.has(key)) {
      seenRel.add(key);
      mermaid += `    ${rel.from} ${rel.type} ${rel.to} : "${rel.label}"\n`;
    }
  }

  // Model definitions
  for (const [mName, data] of Object.entries(models)) {
    mermaid += `    ${mName} {\n`;
    if (data.fields.length === 0) {
      mermaid += `        int id PK\n`;
    } else {
      for (const f of data.fields) {
        const keyTag = f.isId ? 'PK' : '';
        mermaid += `        ${f.type} ${f.name} ${keyTag}`.trimEnd() + '\n';
      }
    }
    mermaid += `    }\n`;
  }

  return mermaid.trim();
}

/**
 * Deterministic Docker Compose to Mermaid Architecture / Flowchart Parser
 */
export function parseDockerComposeToArchitecture(yamlContent) {
  if (!yamlContent || typeof yamlContent !== 'string') return null;

  const lines = yamlContent.split('\n');
  const services = {};
  let inServices = false;
  let currentService = null;
  let currentIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = rawLine.search(/\S/);

    if (trimmed === 'services:') {
      inServices = true;
      continue;
    }

    if (inServices) {
      // If indent goes back to 0, services block ended
      if (indent === 0 && !trimmed.startsWith('services:')) {
        inServices = false;
        break;
      }

      // Top-level service declaration (indent ~ 2)
      if (indent === 2 && trimmed.endsWith(':')) {
        currentService = trimmed.replace(/:$/, '').replace(/['"]/g, '');
        services[currentService] = { image: '', ports: [], dependsOn: [] };
        continue;
      }

      if (currentService && indent >= 4) {
        if (trimmed.startsWith('image:')) {
          services[currentService].image = trimmed.replace('image:', '').trim().replace(/['"]/g, '');
        } else if (trimmed.startsWith('depends_on:')) {
          // Can be list on subsequent lines
          let j = i + 1;
          while (j < lines.length) {
            const nextTrim = lines[j].trim();
            const nextIndent = lines[j].search(/\S/);
            if (nextIndent > indent && nextTrim.startsWith('-')) {
              const dep = nextTrim.replace(/^-\s*/, '').replace(/['"]/g, '').trim();
              if (dep) services[currentService].dependsOn.push(dep);
              j++;
            } else {
              break;
            }
          }
        } else if (trimmed.startsWith('ports:')) {
          let j = i + 1;
          while (j < lines.length) {
            const nextTrim = lines[j].trim();
            const nextIndent = lines[j].search(/\S/);
            if (nextIndent > indent && nextTrim.startsWith('-')) {
              const port = nextTrim.replace(/^-\s*/, '').replace(/['"]/g, '').trim();
              if (port) services[currentService].ports.push(port);
              j++;
            } else {
              break;
            }
          }
        }
      }
    }
  }

  const serviceNames = Object.keys(services);
  if (serviceNames.length === 0) return null;

  let mermaid = 'flowchart TD\n';
  mermaid += '    subgraph Docker ["Docker Compose Topology"]\n';

  for (const [name, s] of Object.entries(services)) {
    const isDb = /db|postgres|mysql|mongo|redis|mariadb/i.test(name) || /postgres|mysql|mongo|redis/i.test(s.image);
    const labelParts = [`<strong>${name}</strong>`];
    if (s.image) labelParts.push(`image: ${s.image}`);
    if (s.ports.length > 0) labelParts.push(`port: ${s.ports[0]}`);

    const label = labelParts.join('<br/>');
    if (isDb) {
      mermaid += `        ${name}[("${label}")]\n`;
    } else {
      mermaid += `        ${name}["${label}"]\n`;
    }
  }

  mermaid += '    end\n\n';

  // Add dependency arrows
  for (const [name, s] of Object.entries(services)) {
    for (const dep of s.dependsOn) {
      if (services[dep]) {
        mermaid += `    ${name} -->|depends_on| ${dep}\n`;
      }
    }
  }

  return mermaid.trim();
}

/**
 * High-level router that attempts deterministic parsing when appropriate
 */
export function tryDeterministicParse(targetDiagramType, content, filename = '') {
  if (!content) return null;

  const detected = detectCodeType(filename, content);

  try {
    if ((detected === 'sql' || filename.endsWith('.sql')) && targetDiagramType === 'erDiagram') {
      return parseSqlToEr(content);
    }

    if ((detected === 'prisma' || filename.endsWith('.prisma')) && targetDiagramType === 'erDiagram') {
      return parsePrismaToEr(content);
    }

    if (
      (detected === 'docker' || filename.includes('compose')) &&
      (targetDiagramType === 'architecture' || targetDiagramType === 'flowchart')
    ) {
      return parseDockerComposeToArchitecture(content);
    }
  } catch (err) {
    console.warn('[Deterministic Parser] Error while parsing code to diagram:', err);
  }

  return null;
}
