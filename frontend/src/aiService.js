/**
 * aiService.js — Arka AI Routing Layer
 * Routes diagram generation to the correct provider:
 *   1. Free tier → backend (Sarvam, server key)
 *   2. BYOK Cloud → Gemini direct / Sarvam via backend proxy
 *   3. Local → Ollama REST API
 *
 * API keys are NEVER stored on the server. They live in localStorage only.
 */
import { auth } from './firebaseAuth';

export const CLOUD_PROVIDERS = {
  gemini: {
    name: 'Google AI',
    models: [
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite', desc: 'Google\'s ultra-fast, lightweight model ideal for high-throughput, quick diagrams.', suggestModel: 'gemini-3.5-flash-lite', generateModel: 'gemini-3.5-flash-lite', badge: 'Recommended' },
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', desc: 'Google\'s newest frontier workhorse model with cutting-edge reasoning, long-horizon coding, and multi-step diagram generation (with auto-fallback).', suggestModel: 'gemini-3.8-flash', generateModel: 'gemini-3.8-flash', badge: 'Latest' },
      { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', desc: 'Google\'s balanced high-speed model for agentic workflows.', suggestModel: 'gemini-3.5-flash', generateModel: 'gemini-3.5-flash' },
      { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', desc: 'Google\'s cost-effective, fast model for lightweight diagram tasks.', suggestModel: 'gemini-3.1-flash-lite', generateModel: 'gemini-3.1-flash-lite' }
    ]
  },
  groq: {
    name: 'Groq',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', desc: 'Meta\'s premier open flagship model on Groq LPU with 128k context. Exceptional for deep reasoning and detailed diagram generation.', suggestModel: 'llama-3.3-70b-versatile', generateModel: 'llama-3.3-70b-versatile' }
    ]
  },
  sarvam: {
    name: 'Sarvam AI',
    models: [
      { id: 'sarvam-105b', label: 'Sarvam 105B', desc: 'Good for easy tasks, quick workflows, and simple diagrams.', suggestModel: 'sarvam-105b', generateModel: 'sarvam-105b' }
    ]
  }
};

export const LOCAL_MODELS = [
  { id: 'gemma4:12b', label: 'Gemma 4 12B', desc: "Google's Gemma 4 12B model.", size: '12B' },
  { id: 'codegemma:7b', label: 'CodeGemma 7B', desc: "Google's CodeGemma 7B model.", size: '7B' },
  { id: 'llama3:8b', label: 'Llama 3 8B', desc: "Meta's open Llama 3 8B model.", size: '8B' }
];

// ─── Settings helpers ───

export function getSettings() {
  const savedApiKey = localStorage.getItem('arka_api_key') || '';
  return {
    providerType: localStorage.getItem('arka_provider_type') || 'free',
    cloudProvider: localStorage.getItem('arka_cloud_provider') || '',
    cloudModel: localStorage.getItem('arka_cloud_model') || '',
    apiKey: savedApiKey === 'google_oauth' ? '' : savedApiKey,
    localUrl: localStorage.getItem('arka_local_url') || 'http://localhost:11434',
    localModel: localStorage.getItem('arka_local_model') || '',
    chatDisplayMode: localStorage.getItem('arka_chat_display_mode') || 'overlay',
  };
}

export function saveSettings(settings) {
  if (settings.providerType) localStorage.setItem('arka_provider_type', settings.providerType);
  if (settings.cloudProvider) localStorage.setItem('arka_cloud_provider', settings.cloudProvider);
  if (settings.cloudModel) localStorage.setItem('arka_cloud_model', settings.cloudModel);
  if (settings.apiKey !== undefined) localStorage.setItem('arka_api_key', settings.apiKey);
  if (settings.localUrl) localStorage.setItem('arka_local_url', settings.localUrl);
  if (settings.localModel) localStorage.setItem('arka_local_model', settings.localModel);
  if (settings.chatDisplayMode) localStorage.setItem('arka_chat_display_mode', settings.chatDisplayMode);
}

// ─── Resolve which model IDs to use ───

function resolveModels(purpose) {
  const s = getSettings();
  if (s.providerType === 'free' || !s.providerType) {
    return { provider: 'free', model: 'sarvam-105b', apiKey: '' };
  }
  if (s.providerType === 'local') {
    if (!s.localModel) throw new Error('Select and save a local AI model in Settings.');
    return { provider: 'local', model: s.localModel, url: s.localUrl };
  }
  if (s.providerType !== 'cloud') throw new Error('Select an AI provider in Settings.');
  if (!s.cloudProvider || !s.cloudModel) throw new Error('Select and save a cloud AI model in Settings.');
  if (!s.apiKey) throw new Error('Enter and save the selected provider API key in Settings.');
  const providerDef = CLOUD_PROVIDERS[s.cloudProvider];
  let modelDef = providerDef?.models.find(m => m.id === s.cloudModel);
  if (!modelDef && providerDef?.models?.length > 0) {
    modelDef = providerDef.models.find(m => m.badge === 'Recommended') || providerDef.models[0];
  }
  if (!modelDef) throw new Error('The saved AI model is not available. Select it again in Settings.');
  const model = purpose === 'suggest' ? modelDef.suggestModel : modelDef.generateModel;
  return { provider: s.cloudProvider, model, apiKey: s.apiKey };
}

// ─── Gemini direct call with automatic failover ───

const GEMINI_FALLBACK_CANDIDATES = [
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite'
];

async function callGemini(apiKey, model, systemPrompt, userMessage, temperature = 0.2, maxTokens = 2500, signal, imageBase64) {
  // Build fallback queue: requested model first, followed by stable high-capacity production models
  const modelsToTry = [model];
  for (const fb of GEMINI_FALLBACK_CANDIDATES) {
    if (!modelsToTry.includes(fb)) {
      modelsToTry.push(fb);
    }
  }

  let lastError = null;

  for (let i = 0; i < modelsToTry.length; i++) {
    const currentModel = modelsToTry[i];
    const isLastCandidate = i === modelsToTry.length - 1;
    if (signal?.aborted) throw new Error('Request aborted');

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`;
      const parts = [{ text: userMessage }];
      if (imageBase64) {
        const mimeMatch = imageBase64.match(/^data:([^;]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
        const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
        parts.push({
          inlineData: {
            mimeType,
            data: base64Data
          }
        });
      }
      const body = {
        contents: [{ role: 'user', parts }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { temperature, maxOutputTokens: maxTokens }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const errMsg = err?.error?.message || `Gemini API error: ${res.status}`;
        // Capacity / rate limit / 503 / 429 / 404 / 500 error handling
        const isRetriable = [503, 429, 404, 500, 502].includes(res.status) ||
          errMsg.toLowerCase().includes('capacity') ||
          errMsg.toLowerCase().includes('unavailable') ||
          errMsg.toLowerCase().includes('quota') ||
          errMsg.toLowerCase().includes('rate limit');

        if (isRetriable && !isLastCandidate) {
          const nextModel = modelsToTry[i + 1];
          console.warn(`[ARKA Failover] Gemini model '${currentModel}' returned status ${res.status} (${errMsg}). Automatically failing over to '${nextModel}'...`);
          lastError = new Error(errMsg);
          continue;
        }
        throw new Error(errMsg);
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      if (!text && !isLastCandidate) {
        console.warn(`[ARKA Failover] Gemini model '${currentModel}' returned empty content. Trying '${modelsToTry[i + 1]}'...`);
        continue;
      }
      return text;
    } catch (err) {
      if (err.name === 'AbortError' || signal?.aborted) throw err;
      const errStr = String(err.message || err);
      const isRetriable = errStr.includes('503') ||
        errStr.toLowerCase().includes('capacity') ||
        errStr.toLowerCase().includes('unavailable') ||
        errStr.includes('429') ||
        errStr.includes('404');

      if (isRetriable && !isLastCandidate) {
        const nextModel = modelsToTry[i + 1];
        console.warn(`[ARKA Failover] Gemini model '${currentModel}' failed with '${errStr}'. Retrying with '${nextModel}'...`);
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('All Gemini model fallbacks exhausted.');
}

export async function describeImageWithVision(base64DataUrl, filename, signal) {
  if (!base64DataUrl) return null;

  const settings = getSettings();
  // 1. Direct Client-side Gemini Vision if user has configured Gemini key
  if (settings.cloudProvider === 'gemini' && settings.apiKey) {
    try {
      const visionPrompt = `Analyze this image in extreme technical detail for diagram generation:
1. Identify all text, labels, titles, and annotations visible in the image.
2. If it's a flowchart, architecture diagram, sketch, or system design, map out every single node, box, database, service, and connection (arrows, labels, conditions, directions).
3. If it's a UI mockup, table, code screenshot, or document, transcribe all key elements, fields, workflows, and logical hierarchy.
4. Output a clean, structured semantic breakdown describing all entities and their relationships.`;

      const analysis = await callGemini(
        settings.apiKey,
        settings.cloudModel || 'gemini-3.5-flash-lite',
        'You are an expert technical vision and diagram OCR analyst.',
        visionPrompt,
        0.2,
        2000,
        signal,
        base64DataUrl
      );
      if (analysis && analysis.trim()) {
        return `[IMAGE VISUAL CONTENT: ${filename}]\n${analysis.trim()}`;
      }
    } catch (e) {
      console.warn('Client-side Gemini vision failed, falling back to server vision:', e);
    }
  }

  // 2. Fallback to backend /api/analyze-image endpoint
  try {
    const res = await fetch('/api/analyze-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: base64DataUrl,
        filename,
        apiKey: settings.apiKey || ''
      }),
      signal
    });
    if (res.ok) {
      const data = await res.json();
      if (data.analysis && !data.analysis.startsWith('[IMAGE:')) {
        return `[IMAGE VISUAL CONTENT: ${filename}]\n${data.analysis}`;
      }
    }
  } catch (e) {
    console.warn('Server vision analysis failed:', e);
  }

  return null;
}

// ─── Sarvam direct call (via backend proxy for CORS) ───

async function callSarvam(apiKey, model, systemPrompt, userMessage, temperature = 0.2, maxTokens = 2500, signal) {
  const res = await fetch('/api/generate-byok', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, model, systemPrompt, userMessage, temperature, maxTokens }),
    signal
  });
  if (!res.ok) throw new Error(`Sarvam proxy error: ${res.status}`);
  const data = await res.json();
  return data.content || '';
}

// ─── Groq direct call (via backend proxy for CORS) ───

async function callGroq(apiKey, model, systemPrompt, userMessage, temperature = 0.2, maxTokens = 2500, signal) {
  const res = await fetch('/api/generate-byok', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, model, provider: 'groq', systemPrompt, userMessage, temperature, maxTokens }),
    signal
  });
  if (!res.ok) throw new Error(`Groq proxy error: ${res.status}`);
  const data = await res.json();
  return data.content || '';
}

// ─── Invidia direct call (via backend proxy for CORS) ───

async function callInvidia(apiKey, model, systemPrompt, userMessage, temperature = 0.2, maxTokens = 2500, signal) {
  const res = await fetch('/api/generate-byok', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, model, provider: 'invidia', systemPrompt, userMessage, temperature, maxTokens }),
    signal
  });
  if (!res.ok) throw new Error(`Invidia proxy error: ${res.status}`);
  const data = await res.json();
  return data.content || '';
}

// ─── Ollama local call ───

async function callOllama(url, model, systemPrompt, userMessage, signal, imageBase64) {
  const images = [];
  if (imageBase64) {
    const base64Data = imageBase64.split(',')[1];
    images.push(base64Data);
  }

  const modelCandidates = [model];
  const lower = (model || '').toLowerCase();
  if (lower.includes('arka') || lower.includes('evopekka')) {
    modelCandidates.push('hf.co/evopekka/arka_v1_flow-GGUF');
    modelCandidates.push('evopekka/arka_v1_flow-GGUF');
    modelCandidates.push('arka_v1_flow');
    modelCandidates.push('arka_v1_flow-GGUF');
  }

  const uniqueCandidates = [...new Set(modelCandidates)];
  let lastError = null;

  for (const candidateModel of uniqueCandidates) {
    try {
      const res = await fetch(`${url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: candidateModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage, ...(images.length > 0 ? { images } : {}) }
          ],
          stream: false
        }),
        signal
      });

      if (res.ok) {
        const data = await res.json();
        return data.message?.content?.trim() || '';
      }

      const errData = await res.json().catch(() => ({}));
      lastError = new Error(errData?.error || `Ollama error: ${res.status}`);

      if (res.status !== 404 && !JSON.stringify(errData).toLowerCase().includes('not found')) {
        throw lastError;
      }
    } catch (err) {
      lastError = err;
      if (err.name === 'AbortError') throw err;
    }
  }

  throw lastError || new Error('Failed to connect to local Ollama model.');
}

// ─── Unified call ───

async function callModel(purpose, systemPrompt, userMessage, options = {}) {
  const { temperature = 0.2, maxTokens = 2500, signal } = options;
  const resolved = resolveModels(purpose);

  if (resolved.provider === 'free') {
    return null;
  }
  if (resolved.provider === 'gemini') {
    return callGemini(resolved.apiKey, resolved.model, systemPrompt, userMessage, temperature, maxTokens, signal);
  }
  if (resolved.provider === 'sarvam') {
    return callSarvam(resolved.apiKey, resolved.model, systemPrompt, userMessage, temperature, maxTokens, signal);
  }
  if (resolved.provider === 'groq') {
    return callGroq(resolved.apiKey, resolved.model, systemPrompt, userMessage, temperature, maxTokens, signal);
  }
  if (resolved.provider === 'invidia' || resolved.provider === 'nvidia') {
    return callInvidia(resolved.apiKey, resolved.model, systemPrompt, userMessage, temperature, maxTokens, signal);
  }
  if (resolved.provider === 'local') {
    return callOllama(resolved.url, resolved.model, systemPrompt, userMessage, signal);
  }
  return null;
}

// ─── Public API ───

/** Returns true if the user is using BYOK or local (not free tier) */
export function isBYOK() {
  return getSettings().providerType !== 'free';
}

/** Returns the provider label for display */
export function getProviderLabel() {
  // Check trial mode
  if (localStorage.getItem('arka_trial_completed') !== 'true') {
    return 'Trial · Gemini 3.1 Flash Lite';
  }
  const s = getSettings();
  if (s.providerType === 'free') return 'Arka AI (Free)';
  if (s.providerType === 'local') return `Local · ${s.localModel}`;
  const prov = CLOUD_PROVIDERS[s.cloudProvider];
  const model = prov?.models.find(m => m.id === s.cloudModel);
  return `${prov?.name} · ${model?.label || s.cloudModel}`;
}

export async function importGithubRepo(url, signal) {
  const res = await fetch('/api/import-github-repo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Failed to import repository: ${res.status}`);
  }
  return data;
}

export function buildContextPrompt(prompt, contextAttachments = []) {
  const validAttachments = (contextAttachments || []).filter(item => item?.context);

  if (validAttachments.length === 0) {
    return `${prompt}\n\n[EXTERNAL ATTACHMENTS STATUS: No external files, documents, or repositories are currently attached. You do NOT have access to any external uploaded file or repository. If the user asks whether you have access to a file, document, or image, clearly answer that no external files are attached to this chat, and you only see the diagram currently on the canvas.]`;
  }

  const attachments = validAttachments
    .map(item => {
      const isImg = item.type === 'image' || (item.filename && /\.(png|jpe?g|webp|svg)$/i.test(item.filename));
      const label = item.type === 'github'
        ? `GitHub repository ${item.repo || item.url || ''}`
        : isImg
          ? `Attached Image ${item.filename || item.name || ''}`
          : item.name || item.filename || 'Attached context';
      return `\n\n[ATTACHED CONTEXT: ${label}]\n${item.context}`;
    })
    .join('');

  return `${prompt}\n\n[EXTERNAL ATTACHMENTS STATUS: Active attached files/repositories/images: ${validAttachments.map(a => a.filename || a.name || a.repo).join(', ')}]\nUse the attached visual and text context below when generating or editing the diagram. Transcribe and model the workflows, nodes, connections, labels, and relationships described in the attached context.${attachments}`;
}

export async function optimizePrompt(prompt, signal) {
  const systemPrompt = `You are an expert prompt optimizer for generating high-quality Mermaid JS diagrams.
Your task is to take the user's input prompt (which may have spelling mistakes, typos, or be extremely short/simple) and optimize it.

Optimization rules:
1. Correct all spelling, grammar, and structural mistakes.
2. If the prompt is short (like "water cycle" or "photosynthesis"), rewrite it into a detailed, structured, step-by-step description of the flow, processes, components, and relationships. This detailed prompt will be used to generate a rich, accurate, and comprehensive diagram.
3. Output ONLY the final optimized, expanded prompt itself.
4. Do NOT include any explanations, introductions, headers, list of changes, markdown code blocks, or preamble.
5. Start immediately with the optimized prompt text.

Example 1:
Input: photosintesis
Output: A detailed process flowchart of Photosynthesis. It starts with light absorption by chlorophyll in the leaves. Carbon dioxide enters through the stomata, and water is absorbed by the roots. Under light energy, the light-dependent reactions produce ATP and NADPH while releasing Oxygen. Then, the light-independent Calvin Cycle uses ATP, NADPH, and Carbon Dioxide to synthesize Glucose (sugar).

Example 2:
Input: login logic with bad password
Output: A flow diagram showing user login logic. The user enters their username and password. The system checks if the username exists. If no, show user not found error. If yes, check password. If password is incorrect, increment failed attempts, check if attempts exceed 3. If yes, lock account and notify user. If no, show incorrect password error and prompt retry. If password is correct, reset failed attempts counter, generate session token, and redirect to dashboard.`;

  let providerPayload = {};
  try {
    providerPayload = buildAgentProviderPayload('generate');
  } catch (e) {
    providerPayload = { provider: 'free' };
  }

  if (providerPayload.provider === 'local') {
    return callOllama(
      providerPayload.localUrl,
      providerPayload.model,
      systemPrompt,
      prompt,
      signal
    );
  }

  if (providerPayload.provider === 'gemini') {
    return callGemini(
      providerPayload.apiKey,
      providerPayload.model,
      systemPrompt,
      prompt,
      0.3,
      1500,
      signal
    );
  }

  const res = await fetch('/api/agent/optimize-prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      ...providerPayload
    }),
    signal
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to optimize prompt: ${res.status}`);
  }

  const data = await res.json();
  return data.optimized_prompt;
}


/**
 * Suggest diagram type from user prompt.
 * Returns { category: string } or null if using free tier (caller uses backend).
 */
export async function suggestDiagramType(prompt, signal) {
  const systemPrompt = `You are Arka's diagram selection agent. Analyze the user's communication goal semantically. Allowed types: flowchart, swimlane, sequence, classDiagram, stateDiagram, erDiagram, userJourney, gantt, pie, quadrantChart, requirementDiagram, gitGraph, c4Diagram, mindmap, timeline, sankey, xy, block, packet, kanban, architecture, radar, eventModeling, treemap, venn, ishikawa, wardley, cynefin, treeView, useCase. Return one or more genuinely suitable types ranked best first. Return ONLY JSON: {"suggestions":[{"type":"flowchart","confidence":0.9,"reason":"..."}]}. Do not include weak options.`;
  const result = await callModel('suggest', systemPrompt, prompt, { temperature: 0.1, maxTokens: 2500, signal });
  const fenced = result?.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const match = fenced?.[1] || result?.match(/[\{\[][\s\S]*[\}\]]/)?.[0];
  if (!match) throw new Error('The selected AI model did not return diagram suggestions.');
  const parsed = JSON.parse(match);
  const data = Array.isArray(parsed) ? { suggestions: parsed } : parsed;
  const typeMap = {
    flowchart: 'flowchart',
    swimlane: 'swimlane', swimlanes: 'swimlane', swimlanediagram: 'swimlane',
    sequence: 'sequence', sequencediagram: 'sequence',
    classdiagram: 'classDiagram', class: 'classDiagram',
    statediagram: 'stateDiagram', state: 'stateDiagram',
    erdiagram: 'erDiagram', entityrelationship: 'erDiagram',
    userjourney: 'userJourney', journey: 'userJourney',
    gantt: 'gantt', ganttchart: 'gantt',
    pie: 'pie', piechart: 'pie',
    quadrantchart: 'quadrantChart', quadrant: 'quadrantChart',
    requirementdiagram: 'requirementDiagram', requirement: 'requirementDiagram',
    gitgraph: 'gitGraph', git: 'gitGraph',
    c4diagram: 'c4Diagram', c4: 'c4Diagram',
    mindmap: 'mindmap', mindmaps: 'mindmap',
    timeline: 'timeline',
    sankey: 'sankey', sankeydiagram: 'sankey',
    xy: 'xy', xychart: 'xy',
    block: 'block', blockdiagram: 'block',
    packet: 'packet', packetdiagram: 'packet',
    kanban: 'kanban', kanbanboard: 'kanban',
    architecture: 'architecture',
    radar: 'radar', radarchart: 'radar',
    eventmodeling: 'eventModeling',
    treemap: 'treemap',
    venn: 'venn', venndiagram: 'venn',
    ishikawa: 'ishikawa', fishbone: 'ishikawa',
    wardley: 'wardley', wardleymap: 'wardley',
    cynefin: 'cynefin',
    treeview: 'treeView', tree: 'treeView',
    usecase: 'useCase', usecasediagram: 'useCase', usecases: 'useCase', usecasechart: 'useCase'
  };
  const seenTypes = new Set();
  const suggestions = (Array.isArray(data.suggestions) ? data.suggestions : [])
    .map(item => ({
      type: typeMap[String(item?.type || '').toLowerCase().replace(/[_-]/g, '')],
      confidence: Math.max(0, Math.min(Number(item?.confidence), 1)),
      reason: String(item?.reason || '').trim()
    }))
    .filter(item => {
      if (!item.type || !Number.isFinite(item.confidence) || !item.reason || seenTypes.has(item.type)) return false;
      seenTypes.add(item.type);
      return true;
    })
    .sort((a, b) => b.confidence - a.confidence);
  if (!suggestions.length) throw new Error('The selected AI model returned no valid diagram suggestions.');
  return {
    suggestions,
    suggested_type: suggestions[0].type,
    category: suggestions[0].type,
    confidence: suggestions[0].confidence,
    reason: suggestions[0].reason
  };
}

/**
 * Generate a Mermaid diagram.
 * Returns { mermaid_code: string } or null if free tier.
 */
export async function generateDiagram(prompt, diagramType, signal) {
  const systemPrompt = buildGeneratePrompt(diagramType);
  const userMsg = `Create a ${diagramType} diagram for: ${prompt}`;
  const result = await callModel('generate', systemPrompt, userMsg, { temperature: 0.2, maxTokens: 2500, signal });
  if (result === null) return null;
  const cleaned = cleanMermaidOutput(result, diagramType);
  return { mermaid_code: cleaned, diagram_type: diagramType };
}

/**
 * Refine an existing diagram.
 * Returns { mermaid_code: string } or null if free tier.
 */
export async function refineDiagram(prompt, mermaidCode, diagramType, signal) {
  let systemPrompt = `You are an expert diagram editor. Modify the existing Mermaid JS code based on the user's instruction.\n\nCRITICAL:\n- Output ONLY the complete updated Mermaid JS code.\n- Do NOT wrap in markdown code blocks.\n- PRESERVE existing structure unless explicitly asked to change it.\n- ALWAYS wrap node text in double quotes.`;
  systemPrompt += `\n- Do NOT include explanations, plans, notes, apologies, or reasoning.
- If the instruction asks for a change, the returned Mermaid code must implement a visible change.
- Do not refuse normal Mermaid edits. If a request is partly unsupported, make the closest supported code change.
- Keep the original diagram type and return one complete Mermaid document.`;
  if (diagramType === 'flowchart') {
    systemPrompt += `\n- When editing or adding colors, you MUST apply semantic colors using classDef definitions:
  * greenNode (Start, End, Success, Completion): fill:#e2f0d9, stroke:#385723, color:#000000
  * blueNode (Process / Action): fill:#ddebf7, stroke:#1f4e78, color:#000000
  * yellowNode (Decision): fill:#fff2cc, stroke:#7f6000, color:#000000
  * redNode (Errors, Failures, Rollbacks, Cancellations, Escalations): fill:#fce4d6, stroke:#c65911, color:#000000
  * goldNode (Logging, Learning, Analytics, Auditing): fill:#fff2cc, stroke:#d68a00, color:#000000
Apply them to nodes as 'nodeId:::className' and declare the classDefs at the bottom of the diagram.`;
  } else if (diagramType === 'architecture') {
    systemPrompt += `\n- When editing or adding colors/subgraphs, group nodes into logical layers using subgraphs and style the subgraphs using style statements at the bottom:
  * clientLayer: fill:#eff6ff, stroke:#2563eb, color:#1e3a8a
  * backendLayer: fill:#ecfeff, stroke:#0891b2, color:#164e63
  * aiLayer: fill:#faf5ff, stroke:#9333ea, color:#581c87
  * infraLayer: fill:#fff7ed, stroke:#ea580c, color:#7c2d12
  * dataLayer: fill:#f0fdf4, stroke:#16a34a, color:#14532d
  * msgLayer: fill:#fefce8, stroke:#ca8a04, color:#713f12
  * monitorLayer: fill:#fef2f2, stroke:#dc2626, color:#7f1d1d
  * extLayer: fill:#fafafa, stroke:#52525b, color:#18181b
Style individual nodes using classDefs:
  * clientNode: fill:#dbeafe, stroke:#1d4ed8, color:#000000
  * backendNode: fill:#cffafe, stroke:#0e7490, color:#000000
  * aiNode: fill:#f3e8ff, stroke:#7e22ce, color:#000000
  * infraNode: fill:#ffedd5, stroke:#c2410c, color:#000000
  * dataNode: fill:#dcfce7, stroke:#15803d, color:#000000
  * msgNode: fill:#fef9c3, stroke:#a16207, color:#000000
  * monitorNode: fill:#fee2e2, stroke:#b91c1c, color:#000000
  * extNode: fill:#f4f4f5, stroke:#4b5563, color:#000000
Apply node classes as 'nodeId:::className' and declare classDefs at the bottom.`;
  } else if (diagramType === 'wardley') {
    systemPrompt += `\n- When editing a Wardley Map:
  * Maintain the native 'wardley-beta' format (Line 1 MUST be 'wardley-beta').
  * Keep 'anchor Name [visibility, evolution]' for users and 'component Name [visibility, evolution]' for components.
  * Visibility is 0.0-1.0 (Y-axis, user need at 1.0, infrastructure at 0.0). Evolution is 0.0-1.0 (X-axis, Genesis to Commodity).
  * Keep dependencies as 'A -> B' and evolution as 'evolve Name targetEvolution'.
  * Output ONLY pure wardley-beta format without flowchart syntax.`;
  } else if (diagramType === 'cynefin') {
    systemPrompt += `\n- When editing a Cynefin diagram:
  * Maintain the native 'cynefin-beta' format (Line 1 MUST be 'cynefin-beta').
  * Keep domain keywords: 'complex', 'complicated', 'clear', 'chaotic', 'confusion'.
  * Keep items as short quoted strings inside their domain block: "Item name".
  * Keep domain transitions: 'fromDomain --> toDomain : "Reason"'.
  * Output ONLY pure cynefin-beta syntax without flowchart nodes or subgraphs.`;
  } else if (diagramType === 'eventModeling') {
    systemPrompt += `\n- When editing an Event Modeling diagram:
  * Maintain the native 'eventmodeling' format (Line 1 MUST be 'eventmodeling').
  * Use timeframes: 'tf <idx> <type> <EntityIdentifier> [optional json data]'.
  * Entity types: 'ui' (UI), 'pcr' (processor), 'cmd' (command), 'rmo' (read model), 'evt' (event).
  * Use 'rf <idx> <type> <EntityIdentifier>' to reset/split flow.
  * Output ONLY pure eventmodeling DSL without flowchart nodes or subgraphs.`;
  } else if (diagramType === 'treeView') {
    systemPrompt += `\n- When editing a treeView directory tree:
  * Maintain the native 'treeView-beta' format (Line 1 MUST be 'treeView-beta').
  * Indent child folders and files with 2 spaces per depth level.
  * Wrap folder and file names in double quotes.
  * Output ONLY pure 'treeView-beta' syntax without flowchart nodes or brackets.`;
  } else if (diagramType === 'block') {
    systemPrompt += `\n- When editing a block diagram:
  * Maintain the 'block-beta' format (Line 1 MUST be 'block-beta').
  * Keep or update grid 'columns N' and grouped 'block:... end' container blocks.
  * Keep block arrows on single lines: 'arrow<["&nbsp;&nbsp;"]>(down):span'.
  * Preserve and apply semantic 'style' statements for colors and visual clarity.`;
  }
  const userMsg = `CURRENT MERMAID CODE:\n${mermaidCode}\n\nREFINEMENT INSTRUCTION: ${prompt}\n\nOutput ONLY the updated Mermaid JS code:`;
  const result = await callModel('generate', systemPrompt, userMsg, { temperature: 0.15, maxTokens: 3600, signal });
  if (result === null) return null;
  const cleaned = cleanMermaidOutput(result, diagramType);
  return { mermaid_code: cleaned, diagram_type: diagramType };
}

// ─── System prompt builder (mirrors backend logic) ───

function buildAgentProviderPayload(purpose = 'generate') {
  const resolved = resolveModels(purpose);
  if (resolved.provider === 'local') {
    return { provider: 'local', model: resolved.model, localUrl: resolved.url };
  }
  return {
    provider: resolved.provider,
    model: resolved.model,
    apiKey: resolved.apiKey || '',
  };
}

async function callAgentEndpoint(path, body, signal) {
  const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Agent API error: ${res.status}`);
  return data;
}

async function callAgentEndpointStream(path, body, onProgress, signal) {
  const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Agent API error: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.trim()) {
        try {
          const data = JSON.parse(line);
          if (data.type === 'progress') {
            if (onProgress) onProgress(data.content);
          } else if (data.type === 'result') {
            result = data.content;
          } else if (data.type === 'error') {
            throw new Error(data.content);
          }
        } catch (e) {
          console.error("Failed to parse line", line, e);
          if (e.message && e.message.indexOf("Error") !== -1) {
            throw e;
          }
        }
      }
    }
  }

  if (!result) {
    throw new Error("Agent failed to return a result.");
  }
  return result;
}

export async function agentSuggestDiagramType(prompt, signal) {
  const providerPayload = buildAgentProviderPayload('suggest');

  if (providerPayload.provider === 'local' || providerPayload.provider === 'gemini') {
    return suggestDiagramType(prompt, signal);
  }

  return callAgentEndpoint('/api/agent/suggest', {
    prompt,
    ...providerPayload
  }, signal);
}

export async function agentGenerateDiagram(prompt, diagramType, options = {}) {
  const providerPayload = buildAgentProviderPayload('generate');
  const promptWithContext = buildContextPrompt(prompt, options.contextAttachments);

  if (providerPayload.provider === 'local' || providerPayload.provider === 'gemini') {
    const result = await generateDiagram(promptWithContext, diagramType, options.signal);
    return {
      ...result,
      agent_steps: ['Generated with the selected local model.'],
      repair_log: [],
      suggestions: []
    };
  }

  return callAgentEndpointStream('/api/agent/generate', {
    prompt: promptWithContext,
    diagramType,
    ...providerPayload
  }, options.onProgress, options.signal);
}

export function hasVisionCapability(provider, model) {
  if (provider === 'gemini') return true;
  if (model) {
    const lower = model.toLowerCase();
    if (lower.includes('gemma') || lower.includes('vision') || lower.includes('arka') || lower.includes('evopekka')) return true;
  }
  return false;
}

export async function agentRefineDiagram(prompt, mermaidCode, diagramType, options = {}) {
  const providerPayload = buildAgentProviderPayload('generate');
  const promptWithContext = buildContextPrompt(prompt, options.contextAttachments);

  if (providerPayload.provider === 'local' || providerPayload.provider === 'gemini') {
    const result = await refineDiagram(promptWithContext, mermaidCode, diagramType, options.signal);
    return {
      ...result,
      agent_steps: ['Refined with the selected local model.'],
      repair_log: [],
      suggestions: []
    };
  }

  return callAgentEndpointStream('/api/agent/refine', {
    prompt: promptWithContext,
    mermaid_code: mermaidCode,
    diagramType,
    selected_context: options.selectedContext || [],
    ...providerPayload
  }, options.onProgress, options.signal);
}

export async function agentChat(systemPrompt, userMessage, signal, imageBase64, contextAttachments = []) {
  let providerPayload = {};
  try {
    providerPayload = buildAgentProviderPayload('generate');
  } catch (e) {
    providerPayload = { provider: 'free' };
  }

  // If no explicit screenshot/highlight image passed, check if there's an attached image with dataUrl in contextAttachments
  let effectiveImage = imageBase64;
  if (!effectiveImage && Array.isArray(contextAttachments)) {
    const imgAtt = contextAttachments.find(att => att && (att.dataUrl || (att.previewUrl && att.previewUrl.startsWith('data:'))));
    if (imgAtt) {
      effectiveImage = imgAtt.dataUrl || imgAtt.previewUrl;
    }
  }

  const modelHasVision = hasVisionCapability(providerPayload.provider, providerPayload.model);
  const systemPromptWithContext = buildContextPrompt(systemPrompt, contextAttachments);

  if (providerPayload.provider === 'local') {
    return callOllama(
      providerPayload.localUrl,
      providerPayload.model,
      systemPromptWithContext,
      userMessage,
      signal,
      modelHasVision ? effectiveImage : null
    );
  }

  if (providerPayload.provider === 'gemini') {
    return callGemini(
      providerPayload.apiKey,
      providerPayload.model,
      systemPromptWithContext,
      userMessage,
      0.3,
      650,
      signal,
      modelHasVision ? effectiveImage : null
    );
  }

  const res = await fetch('/api/agent/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_prompt: systemPromptWithContext,
      user_message: userMessage,
      image_base64: modelHasVision ? effectiveImage : null,
      ...providerPayload
    }),
    signal
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Agent Chat error: ${res.status}`);
  }

  const data = await res.json();
  return data.content;
}

function buildGeneratePrompt(diagramType) {
  const shared = `- Output ONLY valid Mermaid JS code.\n- Do NOT wrap in markdown code blocks (no \`\`\`mermaid).\n- Do NOT include any explanation before/after the code.\n- ALWAYS wrap node text in double quotes.\n`;
  const prompts = {
    flowchart: `You are an expert process designer generating Mermaid JS diagrams.\n\nCRITICAL INSTRUCTIONS:\n${shared}- Start with 'flowchart TD'.\n- SIMPLICITY FIRST: Keep diagrams CLEAN and readable. Focus on the core process flow.\n- MANDATORY SHAPE DIVERSITY: Do NOT use only rectangles! Match semantic shapes to each step:\n  * Start / Finish Endpoints: id(["Terminal Step"])\n  * External Cloud / 3rd-Party APIs: id@{ shape: cloud, label: "Cloud Service / API" }\n  * Database / Storage: id[("Database / Cache")]\n  * Decisions / Conditionals: id{"Decision Check?"}\n  * User Input / Data In: id[/"Input Form / Submission"/]\n  * System Output / UI Display: id[\\Display Dashboard\\]\n  * Preparation / Auth: id{{"Verify Token / Setup"}}\n  * Microservice / Subroutine: id[["Subroutine / Service"]]\n  * Generic Action: id["Internal Process"]\n- Keep 6-12 nodes for optimal clarity.\n- Node IDs MUST be simple alphanumeric strings without spaces.\n- IMPORTANT: You MUST apply semantic coloring to every node in the flowchart using the following class definitions and apply them using 'nodeId:::className' syntax:\n  * greenNode (Start, End, Success, Completion): fill:#e2f0d9, stroke:#385723, color:#000000\n  * blueNode (Process / Action): fill:#ddebf7, stroke:#1f4e78, color:#000000\n  * yellowNode (Decision): fill:#fff2cc, stroke:#7f6000, color:#000000\n  * redNode (Errors, Failures, Rollbacks, Cancellations, Escalations): fill:#fce4d6, stroke:#c65911, color:#000000\n  * goldNode (Storage, DB, Logging, Analytics): fill:#fff2cc, stroke:#d68a00, color:#000000\n  * purpleNode (External Cloud, 3rd Party APIs): fill:#f3e8ff, stroke:#7e22ce, color:#000000\n- Define these classDefs at the bottom of the diagram, for example:\n  classDef greenNode fill:#e2f0d9,stroke:#385723,color:#000000;\n  classDef blueNode fill:#ddebf7,stroke:#1f4e78,color:#000000;\n  classDef yellowNode fill:#fff2cc,stroke:#7f6000,color:#000000;\n  classDef redNode fill:#fce4d6,stroke:#c65911,color:#000000;\n  classDef goldNode fill:#fff2cc,stroke:#d68a00,color:#000000;\n  classDef purpleNode fill:#f3e8ff,stroke:#7e22ce,color:#000000;`,
    architecture: `You are an expert systems architect generating Mermaid JS diagrams.\n\nCRITICAL INSTRUCTIONS:\n${shared}- Start with 'flowchart LR' or 'flowchart TD'.\n- MANDATORY SHAPE DIVERSITY: Do NOT make every node a rectangle! Use:\n  * Cloud Shape for cloud providers/CDN: id@{ shape: cloud, label: "Cloudflare / AWS" }\n  * Cylinder for Databases: id[("PostgreSQL / Redis")]\n  * Stadium for Gateways: id(["API Gateway / ALB"])\n  * Rounded for Queues: id("Kafka / SQS")\n  * Double Circle for Users/Clients: id((("Mobile App / Client")))\n  * Parallelogram for 3rd Party APIs: id[/"Stripe / OpenAI"/]\n- Organize nodes into logical layers using subgraphs (e.g., clientLayer, backendLayer, aiLayer, dataLayer, monitorLayer, extLayer).\n- Apply semantic coloring to subgraphs using 'style subgraphId fill:#HEX,stroke:#HEX,stroke-width:2px,color:#HEX' statements at the bottom.\n- Apply semantic coloring to nodes using classDefs and the 'nodeId:::className' syntax:\n  * clientNode (Client / UI): fill:#dbeafe, stroke:#1d4ed8, color:#000000 (subgraph clientLayer: fill:#eff6ff, stroke:#2563eb, color:#1e3a8a)\n  * backendNode (Backend Services / APIs): fill:#cffafe, stroke:#0e7490, color:#000000 (subgraph backendLayer: fill:#ecfeff, stroke:#0891b2, color:#164e63)\n  * aiNode (AI / ML / LLM / RAG): fill:#f3e8ff, stroke:#7e22ce, color:#000000 (subgraph aiLayer: fill:#faf5ff, stroke:#9333ea, color:#581c87)\n  * infraNode (Infrastructure / Compute): fill:#ffedd5, stroke:#c2410c, color:#000000 (subgraph infraLayer: fill:#fff7ed, stroke:#ea580c, color:#7c2d12)\n  * dataNode (Databases / Storage / Cache): fill:#dcfce7, stroke:#15803d, color:#000000 (subgraph dataLayer: fill:#f0fdf4, stroke:#16a34a, color:#14532d)\n  * msgNode (Messaging / Queues / Events): fill:#fef9c3, stroke:#a16207, color:#000000 (subgraph msgLayer: fill:#fefce8, stroke:#ca8a04, color:#713f12)\n  * monitorNode (Monitoring / Logging / Alerts): fill:#fee2e2, stroke:#b91c1c, color:#000000 (subgraph monitorLayer: fill:#fef2f2, stroke:#dc2626, color:#7f1d1d)\n  * extNode (External / Third-party): fill:#f4f4f5, stroke:#4b5563, color:#000000 (subgraph extLayer: fill:#fafafa, stroke:#52525b, color:#18181b)\n- Define these classDefs at the bottom of the diagram.`,
    sequence: `You are an expert generating Mermaid JS sequence diagrams.\n\nCRITICAL INSTRUCTIONS:\n${shared}- First line MUST be 'sequenceDiagram'.\n- Declare ALL participants at top.\n- Aliases MUST be simple alphanumeric.\n- Keep 3-6 participants max.\n- Message text must NOT contain colons or angle brackets.\n- Activations (+/-) must be balanced: if a participant is activated with '+' inside an alt, else, par, or loop block, it MUST be deactivated with '-' before that block ends. Never leave activations open at the end of a block/diagram.\n- Parallel block titles MUST use brackets: 'par [Title]' (not 'par Title').`,
    erDiagram: `You are an expert database architect generating Mermaid JS ER diagrams.\n\nCRITICAL INSTRUCTIONS:\n${shared}- First line MUST be 'erDiagram'.\n- Entity names MUST be single PascalCase words.\n- 3-6 attributes per entity.\n- Every relationship MUST have a quoted label.\n- Use proper cardinality notation.`,
    gantt: `You are an expert generating Mermaid JS Gantt charts.\n\nCRITICAL INSTRUCTIONS:\n${shared}- First line MUST be 'gantt'.\n- Include 'dateFormat YYYY-MM-DD'.\n- Group tasks into 3-5 sections.\n- Every task MUST have a unique alphanumeric ID.\n- Keep 10-25 tasks for readability.`,
    pie: `You are an expert generating Mermaid JS pie charts.\n\nCRITICAL INSTRUCTIONS:\n${shared}- Start with 'pie showData'.\n- Include a title.\n- Each slice: "Label" : value\n- Keep 3-8 categories.`,
    xy: `You are an expert generating Mermaid JS XY charts.

CRITICAL INSTRUCTIONS:
${shared}- Start with 'xychart-beta'.
- Include title, x-axis, y-axis, and at least one data series.
- NEVER put string labels after line or bar statements — e.g. use 'line [1, 2]', NEVER 'line [1, 2] "Label"'.
- NEVER use 'legend', 'annotate', or 'grid' directives as they are completely unsupported by xychart-beta syntax.
- Category labels in 'x-axis' must be enclosed in double quotes if they contain spaces.
- Ensure the number of elements in your bar/line series matches the number of x-axis categories exactly.`,
    cynefin: `You are an expert Cynefin framework designer generating official Cynefin diagrams in Mermaid JS.

CRITICAL INSTRUCTIONS & SYNTAX RULES:
${shared}- Generate native 'cynefin-beta' format:
  * Line 1 MUST be exactly 'cynefin-beta'.
  * Line 2 MUST be 'title <Framework Title>'.
  * Define items under the 5 domain keywords ('complex', 'complicated', 'clear', 'chaotic', 'confusion').
  * Items MUST be quoted strings on their own line (indented with 2 spaces). Keep each item short and punchy (3-7 words).
  * Declare 1 to 4 items per quadrant domain. Keep 'confusion' minimal (0 to 2 items).
  * Add 2 to 4 domain transitions at the bottom using: 'domainA --> domainB : "Transition reason"'.
  * Valid domain names: 'complex', 'complicated', 'clear', 'chaotic', 'confusion'.
  * Structure Example:
cynefin-beta
title Incident Response & Decision Framework

complex
  "Cascading microservice failure"
  "Novel customer traffic spike"

complicated
  "Distributed database deadlock"
  "Payment gateway compliance audit"

clear
  "Routine server patch SOP"
  "Automated password reset"

chaotic
  "Ransomware attack in progress"
  "Primary data center power loss"

confusion
  "Unclassified telemetry anomaly"

complex --> complicated : "Root cause pattern identified"
complicated --> clear : "Codified to standard runbook"
clear --> chaotic : "Complacency / Ignored alerts"
chaotic --> complex : "Emergency containment established"
- NEVER output flowchart syntax, subgraphs, or node brackets. Output ONLY pure cynefin-beta format.`,
    ishikawa: `You are an expert quality control and root cause analysis engineer generating Ishikawa (Fishbone) diagrams in Mermaid JS.

CRITICAL INSTRUCTIONS:
${shared}- Line 1 MUST be exactly 'ishikawa-beta'. NEVER use 'flowchart', 'graph', subgraphs, or arrow syntax ('-->').
- Line 2 MUST be the main Effect or Problem statement (fish head), indented by 2 spaces.
- Define 4 to 6 primary cause categories (e.g. People, Methods, Machines, Materials, Measurements, Environment) indented by 2 spaces.
- List specific root causes under each category indented by 4 spaces.
- Optional sub-causes can be nested under causes indented by 6 spaces.
- Example structure:
ishikawa-beta
  High Application Error Rate
  Methods
    Missing unit tests
    Inadequate code reviews
  People
    High team turnover
    Insufficient training
  Infrastructure
    Server CPU throttling
    Memory leak in pods
  Environment
    Unexpected traffic spike
    Third-party API downtime`,
    treemap: `You are an expert data visualizer generating Treemap diagrams in Mermaid JS.

CRITICAL INSTRUCTIONS:
${shared}- Line 1 MUST be exactly 'treemap-beta'.
- Declare major categories in double quotes: "Category Name"
- Declare leaf items indented under categories with numeric values: "Item Name": <number>
- Support nested sub-categories with deeper indentation before leaf values.
- NEVER use 'flowchart', 'subgraph', 'classDef', or arrows ('-->'). Only use native treemap hierarchy.
- Example structure:
treemap-beta
"Technology (45%)"
  "Microsoft": 18
  "Apple": 15
  "Nvidia": 12
"Financial (30%)"
  "JPMorgan": 12
  "Visa": 10
  "Mastercard": 8
"Healthcare (25%)"
  "UnitedHealth": 10
  "Pfizer": 8
  "Johnson & Johnson": 7`,
    eventModeling: `You are an expert software architect generating Event Modeling timelines in Mermaid JS.

CRITICAL INSTRUCTIONS & SYNTAX RULES:
${shared}- Generate native 'eventmodeling' format:
  * Line 1 MUST be exactly 'eventmodeling'.
  * Declare chronological timeframes using 'tf <idx> <type> <EntityIdentifier> [optional json data]'.
  * Index: sequential 2-digit numbers ('01', '02', '03', '04'...).
  * Entity types:
    - 'ui': User Interface / Screen (top swimlane: UI/Automation)
    - 'pcr': Background processor / automation (top swimlane: UI/Automation)
    - 'cmd': Command / Intent (middle swimlane: Command/Read Model)
    - 'rmo': Read Model / View projection (middle swimlane: Command/Read Model)
    - 'evt': Domain Event in past tense (bottom swimlane: Events)
  * Use 'rf <idx> <type> <EntityIdentifier>' (Reset Frame) when starting a new slice or breaking inference.
  * Optionally include JSON data payloads: \`json\`{ "key": "value" } or { "key": "value" }.
  * Example Structure:
eventmodeling

tf 01 ui CartUI \`json\`{ "userId": "usr_101" }
tf 02 cmd AddItem \`json\`{ "sku": "SHIRT-BLU", "qty": 1 }
tf 03 evt ItemAdded \`json\`{ "sku": "SHIRT-BLU", "price": 29.99 }
tf 04 rmo CartSummary \`json\`{ "itemCount": 1, "total": 29.99 }
tf 05 ui CheckoutPage
tf 06 cmd PlaceOrder \`json\`{ "paymentMethod": "card" }
tf 07 evt OrderPlaced \`json\`{ "orderId": "ord-88", "total": 29.99 }
tf 08 rmo OrdersList \`json\`{ "ordersCount": 1 }
- NEVER output flowchart syntax, subgraphs, or node brackets. Output ONLY pure eventmodeling format.`,
    radar: `You are an expert data visualization architect generating circular Radar / Spider Charts in Mermaid JS.

CRITICAL INSTRUCTIONS:
${shared}- Use the dedicated 'radar-beta' syntax (with optional YAML frontmatter title at top).
- Format:
---
title: "Candidate Competency Matrix"
---
radar-beta
    axis fe["Frontend & UX"], be["Backend & APIs"], dev["DevOps & Cloud"], sec["Security & Auth"], ai["AI / ML"], qa["Testing & QA"]
    curve candidate["Candidate Score"]{85, 90, 78, 88, 92, 80}
    curve benchmark["Role Benchmark"]{75, 80, 75, 80, 75, 75}

    max 100
    min 0
- Define 5 to 8 evaluation dimensions using 'axis id["Label"], id2["Label2"], ...'.
- Plot one or more data profiles using 'curve id["Series Name"]{val1, val2, ...}'. The number of values in curly braces MUST exactly match the number of declared axes.
- Set 'max <number>' and 'min <number>'.
- NEVER use 'xychart-beta' or 'flowchart' for radar charts. Always use 'radar-beta'.`,
    block: `You are an expert system architect generating rich Block Diagrams in Mermaid JS.

CRITICAL INSTRUCTIONS & SYNTAX RULES:
${shared}- Line 1 MUST be exactly 'block-beta'. NEVER use 'flowchart', 'graph', or append 'TD'/'LR'.
- Line 2 MUST declare grid columns: 'columns 3', 'columns 4', 'columns 5', or 'columns 1'.
- Use diverse node shapes to distinguish components:
  * Rectangle: id["Component Name"]
  * Round: id("Process Module")
  * Stadium: id(["API Gateway / Service"])
  * Cylinder / DB: id[("Database Storage")]
  * Circle: id(("Client / User"))
  * Double Circle: id((("High-Priority Core")))
  * Diamond: id{"Decision / Switch"}
  * Hexagon: id{{"Event Stream / Queue"}}
  * Subroutine: id[["Subroutine Task"]]
  * Lean Right: id[/"Input Stream"/]
- Use ':span' for spanning wide blocks across columns (e.g. 'header["Architecture Title"]:3', 'space:3', 'bus["System Bus"]:4').
- Create grouped container blocks with:
  block:groupId:span
      columns 3
      nodeA["Component A"]
      nodeB["Component B"]
      nodeC["Component C"]
  end
  (Every 'block:' MUST have a matching 'end').
- Insert dimensional block arrows between major tiers on a single line:
  'blockArrowId1<["&nbsp;&nbsp;"]>(down):span' or 'blockArrowId1<["Label"]>(down)'.
  Valid directions: (down), (up), (right), (left), (x).
- Use 'space' or 'space:N' to create gaps between rows or align components.
- Connect components or blocks using standard links at the bottom: 'A --> B', 'groupId --> targetNode', 'comp1 --> comp2'.
- ALWAYS apply semantic styles at the bottom using 'style' statements:
  * Headers: style header fill:#e0e7ff,stroke:#4338ca,stroke-width:2px,color:#312e81
  * Tier 1: style nodeA fill:#eff6ff,stroke:#2563eb,stroke-width:2px,color:#1e40af
  * Tier 2: style nodeB fill:#ecfdf5,stroke:#059669,stroke-width:2px,color:#064e3b
  * Tier 3: style nodeC fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f
  * Stores / DB: style store fill:#f3e8ff,stroke:#7e22ce,stroke-width:2px,color:#581c87
- NEVER output flowchart syntax or subgraphs. Output ONLY pure block-beta format.`,
    kanban: `You are an expert agile project manager generating Kanban boards in Mermaid JS.

CRITICAL INSTRUCTIONS:
${shared}- Start with 'flowchart LR'.
- Create 4-5 column subgraphs: Backlog, To Do, In Progress, Review, Done.
- Define nodes inside each subgraph to represent task cards.
- Add style definitions to make columns look like columns and task cards look like cards.
- Use links sparingly only to show dependencies between tasks, not flow between columns.`,
    packet: `You are an expert network engineer generating Packet Header diagrams in Mermaid JS.

CRITICAL INSTRUCTIONS:
${shared}- Start with 'packet-beta'.
- Line 1 MUST be 'packet-beta' (with optional 'title <Packet Title>' on line 2).
- Define bit field ranges sequentially from 0 up to total packet length:
  * Format: '<startBit>-<endBit>: "<Field Label>"' or '<singleBit>: "<Field Label>"'
  * Bit ranges must be contiguous without gaps or overlapping numbers.
  * Structure example:
packet-beta
title UDP Packet Header
0-15: "Source Port (16 bits)"
16-31: "Destination Port (16 bits)"
32-47: "Length (16 bits)"
48-63: "Checksum (16 bits)"
64-95: "Data Payload (Variable)"
- NEVER use flowchart syntax or subgraphs for packet diagrams. Output pure 'packet-beta' syntax only.`,
    swimlane: `You are an expert process architect generating official Swimlane diagrams in Mermaid JS.

CRITICAL INSTRUCTIONS & SYNTAX RULES:
${shared}- Line 1 MUST be 'swimlane-beta LR' (for horizontal process flows) or 'swimlane-beta TB' (for vertical process flows).
- NEVER start with 'flowchart' or 'graph'.
- Organize processes into swimlanes using 'subgraph LaneId ["Lane Display Name"] ... end' blocks.
- Each swimlane represents a single role, team, department, or system (e.g. Customer, Support, Engineering, Warehouse, Payment Gateway).
- Place decision nodes in the lane that actually makes the decision.
- Use diverse node shapes inside lanes:
  * Task / Action: id["Task Name"]
  * Start / End Terminal: id(["Start / Finish"])
  * Decision: id{"Approve?"}
  * Marker / Event: id(("Event"))
  * Data Store: id[("Database")]
- Connect steps using standard arrows: 'A --> B', 'A -->|Condition| B', 'A -.-> B'.
- Clearly label cross-lane handoffs to show transfers of responsibility.
- Every 'subgraph' MUST have a matching 'end'. Do NOT nest subgraphs inside other subgraphs.
- Node IDs MUST be simple alphanumeric strings without spaces.
- ALWAYS add semantic styles at the bottom for beautiful colors:
  * Start/End: style Start fill:#ecfdf5,stroke:#059669,stroke-width:2px,color:#065f46
  * Action/Task: style Task1 fill:#eff6ff,stroke:#2563eb,stroke-width:2px,color:#1e40af
  * Decision: style Decision1 fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f
  * Store/DB: style Store1 fill:#f0fdfa,stroke:#0d9488,stroke-width:2px,color:#134e4a
- NEVER output classDef styles or flowchart direction keywords.`,
    classDiagram: `You are an expert software engineer generating Mermaid JS Class diagrams.

CRITICAL INSTRUCTIONS:
${shared}- First line MUST be 'classDiagram'.
- Define 3-6 classes with attributes (+name: string) and methods (+execute(): void).
- Include standard UML relationships (<|-- inheritance, *-- composition, o-- aggregation, --> association).
- Group related classes or interfaces cleanly.`,
    stateDiagram: `You are an expert systems engineer generating Mermaid JS State diagrams.

CRITICAL INSTRUCTIONS:
${shared}- First line MUST be 'stateDiagram-v2'.
- Include initial state [*] --> State1 and final state StateN --> [*].
- Define clear state transitions with descriptive labels (State1 --> State2 : Event).
- Use composite nested states or choice points (<<choice>>) where appropriate.`,
    userJourney: `You are an expert UX designer generating Mermaid JS User Journey maps.

CRITICAL INSTRUCTIONS:
${shared}- First line MUST be 'journey'.
- Include a title (title User Journey - [Scenario]).
- Group tasks into 3-5 sections (section Onboarding, section Usage, etc.).
- Format tasks as: Task Name: satisfactionScore: Actor1, Actor2 (e.g. Sign up form: 5: User, System). Score is 1 to 5.`,
    quadrantChart: `You are an expert strategist generating Mermaid JS Quadrant charts.

CRITICAL INSTRUCTIONS & SYNTAX GUARDRAILS:
${shared}- First line MUST be 'quadrantChart'.
- Include a title: title "Chart Title"
- Define axes using 'x-axis <left label> --> <right label>' and 'y-axis <bottom label> --> <top label>'. NEVER use 'x-axis-title' or 'y-axis-title'.
- Define quadrant labels on the exact same line as the directive:
  quadrant-1 Top Right Label
  quadrant-2 Top Left Label
  quadrant-3 Bottom Left Label
  quadrant-4 Bottom Right Label
- EVERY item MUST have numeric coordinates between 0.0 and 1.0 in brackets: "Item Name": [x, y] or Item Name: [x, y].
- NEVER write items without [x, y] coordinates. NEVER use placeholders like <item1> or "Item 1". Plot ALL requested items with realistic estimated positions.`,
    requirementDiagram: `You are an expert systems analyst generating Mermaid JS Requirement diagrams.

CRITICAL INSTRUCTIONS & SYNTAX GUARDRAILS:
${shared}- First line MUST be 'requirementDiagram'.
- Declare requirement blocks with curly braces: requirement req_id { id: REQ-001 text: "Description" risk: High verifyMethod: Test }.
- Declare system elements with curly braces: element sys_id { type: system docRef: "Spec v1.0" }.
- NEVER write single-line requirement definitions without {}.
- NEVER use flowchart node syntax (A[Node]) or standard arrows (-->).
- Link elements strictly using SysML arrows: req_parent - contains -> req_child, sys_elem - satisfies -> req_parent, req_a - derives -> req_b.`,
    gitGraph: `You are an expert DevOps engineer generating Mermaid JS GitGraph diagrams.

CRITICAL INSTRUCTIONS & SYNTAX GUARDRAILS:
${shared}- First line MUST be 'gitGraph'.
- The diagram starts on 'main' automatically. NEVER write 'branch main'.
- ALWAYS create a branch using 'branch <name>' BEFORE using 'checkout <name>'. NEVER checkout a non-existent branch.
- EVERY commit ID (e.g. commit id: "...") MUST be globally unique across the ENTIRE diagram. NEVER duplicate commit IDs.
- 'merge <branch>' merges <branch> into the currently active branch. NEVER merge a branch into itself.
- NEVER use 'rebase' or 'delete' directives as they are unsupported by Mermaid gitGraph syntax.`,
    c4Diagram: `You are an expert software architect generating C4 architecture diagrams in Mermaid JS.

CRITICAL INSTRUCTIONS & SYNTAX GUARDRAILS:
${shared}- First line MUST be 'C4Context', 'C4Container', or 'C4Component'.
- Declare users and systems using proper macros: Person(user_id, "User Name", "Description"), System(sys_id, "System Name", "Description"), System_Ext(ext_sys_id, "External System Name", "Description").
- Declare containers with technology spec: Container(con_id, "Container Name", "Technology", "Description"), ContainerDb(db_id, "Database Name", "PostgreSQL", "Description").
- ALWAYS use directional relationship macros: Rel_D(from, to, "Label", "Tech") for Down, Rel_R for Right, Rel_L for Left, Rel_U for Up to prevent crossing line collisions. NEVER use standard arrows like -->.
- ALWAYS apply soft, light pastel colors using UpdateElementStyle(alias, "#bgColor", "#fontColor", "#borderColor") for EVERY declared node alias:
  * Person/Admin aliases: UpdateElementStyle(user_id, "#E3F2FD", "#1E3A8A", "#93C5FD")
  * Container/System aliases: UpdateElementStyle(con_id, "#F3E8FF", "#4C1D95", "#C4B5FD")
  * Database aliases: UpdateElementStyle(db_id, "#FEF3C7", "#78350F", "#FDE68A")
  * External System aliases: UpdateElementStyle(ext_sys_id, "#F1F5F9", "#334155", "#CBD5E1")
- NEVER use generic type strings (like "person" or "container") inside UpdateElementStyle. MUST pass exact declared node aliases (e.g. user, web_app, db).`,
    mindmap: `You are an expert thinker generating Mermaid JS Mindmaps.

CRITICAL INSTRUCTIONS & SYNTAX GUARDRAILS:
${shared}- First line MUST be 'mindmap'.
- Indentation/spaces strictly define parent-child relationships (use 2 or 4 spaces per nesting level). Sibling nodes MUST have identical indentation.
- NEVER use flowchart arrow operators (--> or -.->) or classDef statements.
- MANDATORY SHAPE DIVERSITY — NEVER USE ONLY RECTANGLES: Every mindmap MUST use an intentional variety of semantic shapes:
  * Central Root Topic: ALWAYS Circle 'root((Central Topic))'
  * Level-1 Pillars/Categories: ALWAYS Rounded Rectangle '(Major Category)'
  * Concrete Deliverables, Modules & Tasks: Square/Rectangle '[Deliverable / Task]'
  * External Cloud Services, Third-Party APIs, Brainstorms & Hypotheses: ALWAYS Cloud shape ')External API / Idea(' (NOTE: opens with ')' and closes with '(')
  * Critical Risks, Blockers & Breakthrough Alerts: ALWAYS Bang shape '))P0 Risk / Breakthrough Alert((' (NOTE: opens with '))' and closes with '((', use sparingly for 1-2 key items)
  * Milestones, Checkpoints & Decision Gates: ALWAYS Hexagon '{{Milestone / Approval Gate}}'
  * Fine-Grained Notes/Details: Plain unbracketed text or double quotes '"Granular metric"'
- SYNTAX SAFETY FOR CLOUD & BANG: Cloud syntax MUST be ')Label(' and Bang syntax MUST be '))Label(('. Inverting them causes fatal Mermaid syntax errors.
- QUOTING: If a node label contains commas, colons, parentheses, or emojis, wrap the label in double quotes INSIDE the shape delimiter (e.g. ')"Stripe & PayPal"(' or '))"🚨 P0 Security Blocker"((').`,
    timeline: `You are an expert historian/planner generating Mermaid JS Timelines.

CRITICAL INSTRUCTIONS:
${shared}- First line MUST be 'timeline'.
- Include a title.
- Group milestones into sections (section Phase 1, section Phase 2).
- Add time period events (2026 : Event A : Event B).`,
    sankey: `You are an expert data analyst generating Sankey flow diagrams in Mermaid JS.

CRITICAL INSTRUCTIONS & SYNTAX RULES:
${shared}- First line MUST be 'sankey-beta'.
- Provide CSV-style flow rows: Source, Target, Value (e.g. Renewable Energy, Power Grid, 120).
- NEVER wrap node names in double quotes ("..."). All node names MUST be unquoted plain text.
- Value MUST be a positive integer or float without symbols like '$' or '%'.
- List 6-15 flow connections balancing upstream sources with downstream sinks.`,
    block: `You are an expert hardware/systems engineer generating Block diagrams in Mermaid JS.

CRITICAL INSTRUCTIONS:
${shared}- First line MUST be 'block-beta'.
- Define block grid columns (columns 3).
- Define blocks and layout widths.`,
    venn: `You are an expert logic visualizer generating official native Venn diagrams in Mermaid JS.

CRITICAL INSTRUCTIONS & SYNTAX RULES:
${shared}- First line MUST be 'venn-beta'.
- Title: title Title Name
- Declare each set with 'set':
  set A ["Design"]
    text "Typography"
    text "Color Palette"
  set B ["Engineering"]
    text "API Layer"
    text "State Store"
- Declare overlapping intersection regions with 'union':
  union A, B ["Design System"]
    text "Component Library"
- For 3 sets, declare the third set and 3-way unions:
  set C ["Business"]
  union A, C ["UX Research"]
  union B, C ["Tech Feasibility"]
  union A, B, C ["★ Core Sweet Spot"]
- Apply styles using 'style' with color matching the set stroke for clear visibility:
  style A fill:#eff6ff,stroke:#3b82f6,color:#2563eb
  style B fill:#faf5ff,stroke:#a855f7,color:#9333ea
  style C fill:#fefce8,stroke:#eab308,color:#d97706
  style A, B fill:#ecfdf5,stroke:#10b981,color:#0f172a
  style A, B, C fill:#fdf2f8,stroke:#ec4899,color:#0f172a`,
    wardley: `You are an expert strategy consultant generating official Wardley Maps in Mermaid JS.

CRITICAL INSTRUCTIONS & SYNTAX RULES:
${shared}- Generate native 'wardley-beta' format:
  * Line 1 MUST be exactly 'wardley-beta'.
  * Line 2 MUST be 'title <Map Title>'.
  * Declare User / Customer anchors: 'anchor Customer [0.95, 0.60]'.
  * Declare Components with [visibility, evolution] coordinates (0.0 to 1.0): 'component Name [visibility, evolution]'.
    - Visibility (Y-axis): 1.0 is highest (visible user need at top), 0.0 is lowest (underlying infrastructure at bottom).
    - Evolution (X-axis): 0.0-0.25 (Genesis), 0.25-0.50 (Custom-Built), 0.50-0.75 (Product/Rental), 0.75-1.0 (Commodity/Utility).
  * Optional decorators: '(build)', '(buy)', '(outsource)', '(market)', '(inertia)'. E.g. 'component ML Engine [0.45, 0.35] (build)'.
  * Declare dependencies: 'Customer -> Web App', 'Web App -> API Gateway', 'API Gateway -> Database'.
  * Declare evolution movement: 'evolve ComponentName targetEvolution' (e.g. 'evolve Database 0.85').
  * Declare notes: 'note "Text here" [visibility, evolution]'.
  * Structure Example:
wardley-beta
title Cloud Strategy Value Chain

anchor Customer [0.95, 0.60]
component Web App [0.80, 0.62]
component API Gateway [0.65, 0.70]
component Custom ML Engine [0.50, 0.20] (build)
component Database [0.35, 0.75]
component Cloud Compute [0.15, 0.85] (buy)

Customer -> Web App
Web App -> API Gateway
API Gateway -> Custom ML Engine
API Gateway -> Database
Database -> Cloud Compute
Custom ML Engine -> Cloud Compute

evolve Custom ML Engine 0.55
evolve Database 0.90

note "Migrating database to commodity cloud" [0.28, 0.78]
- NEVER output flowchart syntax or quadrantChart for wardley diagrams. Output ONLY pure wardley-beta format.`,
    treeView: `You are an expert software architect generating rich TreeView filesystem hierarchy diagrams.

CRITICAL INSTRUCTIONS & SYNTAX RULES:
${shared}- Generate native 'treeView-beta' format for directory trees:
  * Line 1 MUST be exactly 'treeView-beta'.
  * Indent child folders and files with 2 spaces per depth level.
  * Wrap folder and file names in double quotes.
  * Use clean, standard file and folder names without angle brackets (<...>).
  * Structure example:
treeView-beta
  "src"
    "components"
      "Navbar.jsx"
      "Sidebar.jsx"
    "hooks"
      "useAuth.js"
    "App.jsx"
    "index.css"
  "package.json"
  "vite.config.js"
  "README.md"
- NEVER output flowchart syntax or node brackets when generating treeView diagrams. Output ONLY pure treeView-beta format.`,
    useCase: `You are an expert UML system architect generating standard UML Use Case diagrams in Mermaid JS (Mermaid v12+).

CRITICAL INSTRUCTIONS & SYNTAX GUARDRAILS:
${shared}- You can generate using either Mermaid 12's native 'usecase-beta' syntax OR the highly-styled 'flowchart LR' standard:
OPTION 1 - Flowchart UML Standard (Recommended for rich custom coloring & soft pastel layer blocks):
- Start with 'flowchart LR'.
- Primary Human Actors MUST use hexagon shape on the left (e.g. User{{"👤 Customer"}}:::actorNode).
- Secondary / External systems MUST use rectangle shape on the right (e.g. Gateway["💳 Payment Gateway"]:::extSystemNode).
- System Boundary MUST be a subgraph with a descriptive title (e.g. subgraph SystemBoundary ["📦 System Name"] ... end).
- ALWAYS style the System Boundary layer block with a soft pastel background and dashed border at the bottom (e.g. style SystemBoundary fill:#f0f9ff,stroke:#0284c7,stroke-width:2px,stroke-dasharray:4 4,color:#0369a1;). NEVER leave it plain white.
- Every Use Case node MUST use stadium shape ([...]) with active verbs (e.g. UC1(["Browse Catalog"]):::usecaseNode).
- Mandatory dependencies: BaseUC -.->|«include»| IncludedUC.
- Optional extensions: ExtensionUC -.->|«extend»| BaseUC.
- Direct actor interactions: Actor --> UC1, UC_Pay --> Gateway.
- ClassDefs at bottom: actorNode (fill:#e0e7ff,stroke:#3730a3), usecaseNode (fill:#ecfdf5,stroke:#059669), includeNode (fill:#e0f2fe,stroke:#0284c7), extendNode (fill:#fef3c7,stroke:#d97706), extSystemNode (fill:#f3e8ff,stroke:#7e22ce).

OPTION 2 - Mermaid 12 Native Use Case:
- Start with 'usecase-beta'.
- Declare actors: 'actor Customer', 'actor "Support Agent" as Agent'.
- Group inside system boundary: 'system "System Name" { usecase "View Catalog" as UC1 }'.
- Direct links: 'Customer --> UC1'.
- Dependencies: 'UC1 ..> UC2 : include' or 'UC3 ..> UC1 : extend'.`,
  };
  return prompts[diagramType] || prompts.flowchart;
}

// ─── Mermaid output cleaner (mirrors backend logic) ───

export function cleanStateDiagram(content) {
  if (!content) return '';
  const lines = [];
  let hasHeader = false;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('stateDiagram')) {
      hasHeader = true;
      lines.push('stateDiagram-v2');
      continue;
    }

    let cleanL = line.replace(/\[\*\]:::[a-zA-Z0-9_]+/g, '[*]');
    if (/^\s*class\s+\[\*\].*/.test(cleanL)) {
      continue;
    }

    cleanL = cleanL.replace(/-->\s*\|([^|]+)\|\s*([a-zA-Z0-9_]+)/g, '--> $2 : $1');

    const bracketMatch = cleanL.match(/^\s*([a-zA-Z0-9_]+)\[([^\]]+)\]\s*$/);
    if (bracketMatch) {
      cleanL = `    state "${bracketMatch[2].trim()}" as ${bracketMatch[1].trim()}`;
    }

    if (trimmed.startsWith('subgraph ')) {
      const sgName = trimmed.replace('subgraph ', '').replace(/"/g, '').trim();
      cleanL = `    state ${sgName} {`;
    } else if (trimmed === 'end') {
      cleanL = '    }';
    }

    lines.push(cleanL);
  }

  if (!hasHeader) {
    lines.unshift('stateDiagram-v2');
  }
  return lines.join('\n').trim();
}

export function cleanMermaidOutput(content, diagramType) {
  // Remove markdown code blocks
  content = content.replace(/^```(?:mermaid)?\s*\n?/gm, '');
  content = content.replace(/\n?```\s*$/gm, '');
  content = content.replace(/```mermaid/g, '').replace(/```/g, '');
  content = content.replace(/<(?:thought|think|tool_call|debug|internal)[^>]*>[\s\S]*?<\/(?:thought|think|tool_call|debug|internal)>/gi, '');
  content = content.trim();

  // Remove duplicate headers
  const headerKw = [
    'flowchart ', 'flowchart-elk', 'graph ', 'sequenceDiagram', 'classDiagram', 'stateDiagram-v2', 'stateDiagram',
    'erDiagram', 'journey', 'gantt', 'pie', 'quadrantChart', 'requirementDiagram', 'gitGraph',
    'C4Context', 'C4Container', 'mindmap', 'timeline', 'sankey-beta', 'xychart-beta', 'block-beta', 'venn-beta',
    'treeView-beta', 'treeview-beta', 'treeView', 'treeview', 'treemap-beta', 'ishikawa-beta', 'radar-beta',
    'packet-beta', 'packet', 'wardley-beta', 'wardley', 'cynefin-beta', 'cynefin',
    'eventmodeling', 'eventModeling', 'usecase-beta', 'usecase', 'usecaseDiagram', 'kanban', 'agentflow-beta', 'agentflow'
  ];
  let headerCount = 0;
  content = content.split('\n').filter(line => {
    const isHeader = headerKw.some(kw => line.trim().startsWith(kw));
    if (isHeader) { headerCount++; if (headerCount > 1) return false; }
    return true;
  }).join('\n');

  // Strip invalid surrounding quotes on Sankey CSV rows
  if (diagramType === 'sankey' || content.includes('sankey-beta')) {
    content = content.split('\n').map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('sankey-beta') || trimmed.startsWith('---') || trimmed.startsWith('config') || trimmed.startsWith('theme:') || trimmed.startsWith('%%')) {
        return line;
      }
      const parts = trimmed.split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));
      if (parts.length >= 3) {
        return `  ${parts[0]}, ${parts[1]}, ${parts[2]}`;
      }
      return line;
    }).join('\n');
  }

  // Replace reserved 'end' keyword and syntax quirks in flowcharts, architecture, kanban & use case
  if (['flowchart', 'architecture', 'kanban'].includes(diagramType) || (diagramType === 'useCase' && (content.startsWith('flowchart') || content.startsWith('graph'))) || /^\s*(flowchart|graph)\b/im.test(content)) {
    content = restoreFlowchartLineBreaks(content);
    content = content.replace(/(^|\n)end(\s*[-=]>|[([{])/g, '$1finish$2');
    content = content.replace(/([([{])end([)\]}])/g, '$1finish$2');
    content = content.replace(/(?<!:)::([a-zA-Z_]\w*)/g, ':::$1');
    content = trimInvalidLinkStyles(content);

    // Fix shape directives attached to class shorthand: id@{ shape: cloud, label: "..." }:::className
    content = content.replace(
      /([a-zA-Z0-9_]+)@\{([^}]+)\}:+([a-zA-Z0-9_-]+)/g,
      '$1@{$2}\n    class $1 $3'
    );
    // Fix stray period before class shorthand: [("DB")].:::nodeClass
    content = content.replace(/\]\.\s*:::([a-zA-Z0-9_-]+)/g, ']:::$1');

    // Fix reversed parentheses shape: id))"text"((
    content = content.replace(/([a-zA-Z0-9_]+)\)\)(["'][^"']+["'])\(\(/g, '$1([$2])');
    content = content.replace(/([a-zA-Z0-9_]+)\)\)([^()]+)\(\(/g, '$1(["$2"])');

    // Fix quoted node identifiers in subgraphs (e.g. Kanban "Task 5"["Define Scope"])
    content = content.replace(/^[ \t]*"([a-zA-Z0-9_ -]+)"(\s*\[)/gm, (match, idStr, bracket) => {
      const cleanId = idStr.trim().replace(/\s+/g, '_');
      return `    ${cleanId}${bracket}`;
    });

    // Fix malformed parallelogram brackets [/"text"/]/]
    content = content.replace(/(\[\/[^/\n]+\/[^\]\n]*\])\/\]/g, '$1');
    content = content.replace(/(\[\/[^/\n]+\/[^\]\n]*)\/\]/g, '$1]');

    // Fix triple-nested shape brackets ([("...")] or [(( "..."))]
    content = content.replace(/\(\[\(\s*["']?([^"'\n]+)["']?\s*\)\]\)/g, '(["$1"])');
    content = content.replace(/\[\(\[\s*["']?([^"'\n]+)["']?\s*\]\)\]/g, '(["$1"])');
    content = content.replace(/\[\(\(\s*["']?([^"'\n]+)["']?\s*\)\)\]/g, '[("$1")]');
    content = content.replace(/\(\(\[\s*["']?([^"'\n]+)["']?\s*\]\)\)/g, '(["$1"])');

    // Fix unquoted guillemets in edge labels: |«include»| -> |"«include»"|
    content = content.replace(/\|(«[^»|\n]+»)\|/g, '|"$1"|');

    // Fix quoted node IDs in connections: "Task 5" --> "Task 1" -> Task_5 --> Task_1
    content = content.replace(/["']([A-Za-z0-9_ -]+)["']\s*(-->|-\.->|==>|---|~~~)\s*["']([A-Za-z0-9_ -]+)["']/g, (_, src, arrow, dst) => `${src.trim().replace(/\s+/g, '_')} ${arrow} ${dst.trim().replace(/\s+/g, '_')}`);
    content = content.replace(/["']([A-Za-z0-9_ -]+)["']\s*(-->|-\.->|==>|---|~~~)/g, (_, src, arrow) => `${src.trim().replace(/\s+/g, '_')} ${arrow}`);
    content = content.replace(/(-->|-\.->|==>|---|~~~)\s*["']([A-Za-z0-9_ -]+)["']/g, (_, arrow, dst) => `${arrow} ${dst.trim().replace(/\s+/g, '_')}`);

    // Fix quoted node IDs in class statements: class "Task 5","Task 6" cardStyle;
    content = content.replace(/class\s+([^\n;]+)\s+([A-Za-z0-9_-]+)\s*;?/g, (_, rawItems, cls) => {
      const items = rawItems.split(',').map(s => s.trim().replace(/["']/g, '').replace(/\s+/g, '_')).filter(Boolean);
      return `class ${items.join(',')} ${cls};`;
    });

    // Sanitize classDef and style statements (strip shadow:..., filter:..., rgba(...))
    content = content.split('\n').map(line => {
      const st = line.trim();
      if (st.startsWith('classDef ') || st.startsWith('style ')) {
        let l = line.replace(/,?\s*shadow:[^,;]+/g, '');
        l = l.replace(/,?\s*filter:[^,;]+/g, '');
        l = l.replace(/rgba?\([^)]+\)/g, '#091e42');
        l = l.replace(/,\s*,/g, ',');
        l = l.replace(/\s*,\s*;/g, ';');
        l = l.replace(/(classDef\s+\w+\s*),/g, '$1');
        return l;
      }
      return line;
    }).join('\n');
  }

  if (diagramType === 'eventModeling' || content.startsWith('eventmodeling') || content.startsWith('eventModeling')) {
    content = content.replace(/`(?:json)?`\s*\{[^}]*\}/g, '');
    content = content.replace(/^(tf|rf)\s+(\d+)\s+([a-z]+)\s+["']([A-Za-z0-9_]+)["']/gm, '$1 $2 $3 $4');
  }

  // Sequence diagram auto-healing
  if (diagramType === 'stateDiagram' || content.startsWith('stateDiagram')) {
    content = cleanStateDiagram(content);
  }

  if (diagramType === 'sequence' || content.startsWith('sequenceDiagram')) {
    content = cleanSequence(content);
  }

  if (diagramType === 'timeline' || content.startsWith('timeline')) {
    content = cleanTimeline(content);
  }

  if (diagramType === 'block' || content.startsWith('block') || content.startsWith('block-beta')) {
    content = cleanBlock(content);
  }

  if (diagramType === 'swimlane' || content.startsWith('swimlane') || content.startsWith('swimlane-beta')) {
    content = cleanSwimlane(content);
  }

  if (diagramType === 'venn' || content.startsWith('venn') || content.startsWith('venn-beta')) {
    content = cleanVenn(content);
  }

  if (diagramType === 'radar' || content.startsWith('radar') || content.startsWith('radar-beta')) {
    content = cleanRadar(content);
  }

  if (diagramType === 'xy' || content.startsWith('xychart') || content.startsWith('xychart-beta')) {
    content = cleanXY(content);
  }

  if (diagramType === 'classDiagram' || content.startsWith('classDiagram')) {
    content = cleanClassDiagram(content);
  }

  if (diagramType === 'erDiagram' || content.startsWith('erDiagram')) {
    content = cleanErDiagram(content);
  }

  if (diagramType === 'quadrantChart') {
    content = cleanQuadrantChart(content);
  }

  if (diagramType === 'pie') {
    content = cleanPie(content);
  }

  if (diagramType === 'ishikawa') {
    content = cleanIshikawa(content);
  }

  if (diagramType === 'requirementDiagram') {
    content = cleanRequirementDiagram(content);
  }

  if (diagramType === 'c4Diagram') {
    content = cleanC4Diagram(content);
  }

  if (diagramType === 'mindmap') {
    content = cleanMindmap(content);
  }

  if (diagramType === 'treemap') {
    content = cleanTreemap(content);
  }

  if (diagramType === 'treeView') {
    content = cleanTreeView(content);
  }

  if (diagramType === 'packet') {
    content = cleanPacket(content);
  }

  return content;
}

function cleanMindmap(content) {
  let lines = content.split('\n').map(l => l.trimEnd()).filter(Boolean);
  if (!lines.length) return content;

  let first = lines[0].trim();
  if (!first.startsWith('mindmap')) {
    lines = ['mindmap', ...lines.filter(l => !l.trim().startsWith('mindmap'))];
  }

  // Sanitize inverted cloud or paren delimiters e.g. )"loadFromFile()" -> "loadFromFile()"
  lines = lines.map(line => {
    line = line.replace(/([ \t]+)\)\s*("[^"\n]+")\s*\(?/g, '$1$2');
    line = line.replace(/([ \t]+)\)\s*([A-Za-z0-9_ .-]+)\s*\(/g, '$1"$2"');
    line = line.replace(/'\)\s*$/g, '');
    line = line.replace(/'\s*$/g, '');
    return line;
  });

  const hasArrows = lines.some(l => l.includes('-->') || l.includes('-.->'));
  if (!hasArrows) {
    return lines.join('\n');
  }

  const declaredNodes = {};
  const adjacency = {};
  const inDegrees = {};

  for (let i = 1; i < lines.length; i++) {
    const stripped = lines[i].trim();
    if (!stripped) continue;

    const processedLine = stripped.replace(
      /([A-Za-z0-9_-]+)(?:\(\s*["\']?([^"\']+)["\']?\s*\)|\[\s*["\']?([^"\']+)["\']?\s*\]|\(\[\s*["\']?([^"\']+)["\']?\s*\]\))/g,
      (match, alias, g2, g3, g4) => {
        const label = g2 || g3 || g4 || alias;
        declaredNodes[alias] = `${alias}((${label}))`;
        return alias;
      }
    );

    const connMatch = processedLine.match(/^([A-Za-z0-9_-]+)\s*-\.?->\s*([A-Za-z0-9_-]+)$/);
    if (connMatch) {
      const src = connMatch[1];
      const dst = connMatch[2];
      if (!adjacency[src]) adjacency[src] = [];
      adjacency[src].push(dst);
      inDegrees[dst] = (inDegrees[dst] || 0) + 1;
      if (inDegrees[src] === undefined) inDegrees[src] = 0;
    } else {
      const alias = processedLine.trim();
      if (alias && !declaredNodes[alias]) {
        declaredNodes[alias] = alias;
      }
    }
  }

  let root = null;
  for (const node of Object.keys(inDegrees)) {
    if (inDegrees[node] === 0) {
      root = node;
      break;
    }
  }

  if (!root) {
    const keys = Object.keys(adjacency);
    if (keys.length) root = keys[0];
    else {
      const decKeys = Object.keys(declaredNodes);
      if (decKeys.length) root = decKeys[0];
    }
  }

  if (!root) return lines.join('\n');

  const fixed = ['mindmap'];
  const visited = new Set();

  function dfs(node, depth) {
    if (visited.has(node)) return;
    visited.add(node);

    const indent = '    '.repeat(depth);
    const label = declaredNodes[node] || node;
    fixed.push(`${indent}${label}`);

    for (const child of (adjacency[node] || [])) {
      dfs(child, depth + 1);
    }
  }

  dfs(root, 1);

  for (const node of Object.keys(declaredNodes)) {
    if (!visited.has(node)) {
      fixed.push(`    ${declaredNodes[node]}`);
    }
  }

  return fixed.join('\n');
}

function cleanC4Diagram(content) {
  let lines = content.split('\n').map(l => l.trimEnd()).filter(Boolean);
  if (!lines.length) return content;

  let first = lines[0].trim();
  if (first.startsWith('C4Context') || first.startsWith('C4Container') || first.startsWith('C4Component') || first.startsWith('C4Dynamic')) {
    const fixed = [];
    for (const line of lines) {
      const stripped = line.trim();
      const arrowMatch = stripped.match(/^([A-Za-z0-9_-]+)\s*-\.?->\s*([A-Za-z0-9_-]+)(?:\s*:\s*(.*))?$/);
      if (arrowMatch) {
        const src = arrowMatch[1];
        const dst = arrowMatch[2];
        const label = arrowMatch[3] || 'Interacts';
        fixed.push(`    Rel(${src}, ${dst}, "${label.trim()}")`);
      } else {
        fixed.push(line);
      }
    }
    return fixed.join('\n');
  }

  const fixed = ['C4Container', '    title "System Architecture Diagram"'];
  const declaredNodes = {};
  const connections = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.trim();
    if (!stripped || stripped.startsWith('classDef') || stripped.startsWith('style') || stripped.startsWith('click')) {
      continue;
    }

    const processedLine = stripped.replace(
      /([A-Za-z0-9_-]+)(?:\(\s*["\']?([^"\']+)["\']?\s*\)|\[\s*["\']?([^"\']+)["\']?\s*\]|\(\[\s*["\']?([^"\']+)["\']?\s*\]\))/g,
      (match, alias, g2, g3, g4) => {
        const label = g2 || g3 || g4 || alias;
        declaredNodes[alias] = label;
        return alias;
      }
    );

    const connMatch = processedLine.match(/^([A-Za-z0-9_-]+)\s*-\.?->(?:\s*\|([^\|]+)\|)?\s*([A-Za-z0-9_-]+)$/);
    if (connMatch) {
      const src = connMatch[1];
      const label = connMatch[2] || 'Interacts';
      const dst = connMatch[3];
      connections.push({ src, dst, label });
    } else {
      const alias = processedLine.split(':::')[0].trim();
      if (alias && !declaredNodes[alias]) {
        declaredNodes[alias] = alias;
      }
    }
  }

  for (const alias of Object.keys(declaredNodes)) {
    const label = declaredNodes[alias];
    const labelLower = label.toLowerCase();
    if (labelLower.includes('user') || labelLower.includes('actor') || labelLower.includes('customer')) {
      fixed.push(`    Person(${alias}, "${label}", "User client")`);
    } else if (labelLower.includes('database') || labelLower.includes('db') || labelLower.includes('postgres') || labelLower.includes('redis')) {
      fixed.push(`    ContainerDb(${alias}, "${label}", "Data Store")`);
    } else if (labelLower.includes('web') || labelLower.includes('app') || labelLower.includes('frontend') || labelLower.includes('mobile')) {
      fixed.push(`    Container(${alias}, "${label}", "Client App")`);
    } else {
      fixed.push(`    System(${alias}, "${label}", "Software component")`);
    }
  }

  for (const conn of connections) {
    fixed.push(`    Rel(${conn.src}, ${conn.dst}, "${conn.label.trim()}")`);
  }

  return fixed.join('\n');
}

function cleanRequirementDiagram(content) {
  let lines = content.split('\n').map(l => l.trimEnd()).filter(Boolean);
  if (!lines.length) return content;

  let first = lines[0].trim();
  if (!first.startsWith('requirementDiagram')) {
    lines = ['requirementDiagram', ...lines.filter(l => !l.trim().startsWith('requirementDiagram'))];
  }

  const fixed = ['requirementDiagram'];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.trim();
    if (!stripped) continue;

    const singleReqMatch = stripped.match(/^(requirement|functionalRequirement|performanceRequirement|interfaceRequirement|physicalRequirement|designConstraint)\s+([A-Za-z0-9_-]+)\s*:\s*(.*)$/i);
    if (singleReqMatch) {
      const reqType = singleReqMatch[1];
      const reqIdRaw = singleReqMatch[2];
      const reqText = singleReqMatch[3].replace(/^["']|["']$/g, '');
      const safeName = reqIdRaw.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      fixed.push(`    ${reqType} ${safeName} {`);
      fixed.push(`        id: ${reqIdRaw}`);
      fixed.push(`        text: "${reqText}"`);
      fixed.push('        risk: Medium');
      fixed.push('        verifyMethod: Test');
      fixed.push('    }');
      continue;
    }

    const flowchartArrowMatch = stripped.match(/^([A-Za-z0-9_-]+)(?:\[([^\]]+)\])?\s*-->\s*([A-Za-z0-9_-]+)(?:\[([^\]]+)\])?$/);
    if (flowchartArrowMatch) {
      const srcId = flowchartArrowMatch[1];
      const dstId = flowchartArrowMatch[3];
      fixed.push(`    ${srcId} - contains -> ${dstId}`);
      continue;
    }

    const flowchartNodeMatch = stripped.match(/^([A-Za-z0-9_-]+)\[([^\]]+)\]$/);
    if (flowchartNodeMatch) {
      const nodeId = flowchartNodeMatch[1];
      const nodeText = flowchartNodeMatch[2];
      fixed.push(`    requirement ${nodeId} {`);
      fixed.push(`        id: ${nodeId}`);
      fixed.push(`        text: "${nodeText}"`);
      fixed.push('        risk: Medium');
      fixed.push('        verifyMethod: Test');
      fixed.push('    }');
      continue;
    }

    let cleanLine = stripped;
    // Strip quotes from risk enum: risk: "High" -> risk: High
    cleanLine = cleanLine.replace(/(\brisk\s*:\s*)["'](Low|Medium|High)["']/gi, '$1$2');
    // Strip quotes from verifyMethod enum: verifyMethod: "Test" -> verifyMethod: Test
    cleanLine = cleanLine.replace(/(\bverifyMethod\s*:\s*)["'](Analysis|Demonstration|Inspection|Test)["']/gi, '$1$2');
    // Ensure hyphenated ID is quoted: id: REQ-001 -> id: "REQ-001"
    cleanLine = cleanLine.replace(/(\bid\s*:\s*)([a-zA-Z0-9]+-[a-zA-Z0-9-]+)(?=\s|$)/gi, '$1"$2"');
    // Strip quotes around requirement name: requirement "req_name" { -> requirement req_name {
    cleanLine = cleanLine.replace(/^((?:requirement|functionalRequirement|performanceRequirement|interfaceRequirement|physicalRequirement|designConstraint)\s+)"([a-zA-Z0-9_-]+)"\s*\{/i, '$1$2 {');
    // Strip quotes around element name: element "auth_service" { -> element auth_service {
    cleanLine = cleanLine.replace(/^(element\s+)"([a-zA-Z0-9_-]+)"\s*\{/i, '$1$2 {');

    fixed.push(`    ${cleanLine}`);
  }

  return fixed.join('\n');
}

function cleanPie(content) {
  let lines = content.split('\n').map(l => l.trimEnd()).filter(Boolean);
  if (!lines.length) return content;

  let first = lines[0].trim();
  if (!first.startsWith('pie')) {
    lines = ['pie showData', ...lines.filter(l => !l.trim().startsWith('pie'))];
  }

  const fixed = [];
  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped) continue;

    if (stripped.startsWith('explode') || stripped.startsWith('offset') || stripped.startsWith('sliceOffset')) {
      continue;
    }

    if (stripped.startsWith('pie') || stripped.startsWith('title')) {
      fixed.push(line);
      continue;
    }

    if (stripped.includes(':')) {
      const parts = stripped.split(':');
      const rawLabel = parts[0].trim().replace(/^["']|["']$/g, '');
      const rawVal = parts.slice(1).join(':').trim();

      const cleanedVal = rawVal.replace(/[\$,%]/g, '');
      const valMatch = cleanedVal.match(/[-+]?\d+(?:\.\d+)?/);
      if (valMatch) {
        fixed.push(`    "${rawLabel}" : ${valMatch[0]}`);
      } else {
        fixed.push(line);
      }
    } else {
      fixed.push(line);
    }
  }

  return fixed.join('\n');
}

function cleanIshikawa(content) {
  let lines = content.split('\n').map(l => l.trimEnd()).filter(Boolean);
  if (!lines.length) return content;

  let first = lines[0].trim();
  if (first.startsWith('ishikawa') && !first.startsWith('ishikawa-beta')) {
    lines[0] = 'ishikawa-beta';
  } else if (!first.startsWith('ishikawa-beta') && !first.startsWith('flowchart') && !first.startsWith('graph')) {
    lines = ['ishikawa-beta', ...lines];
  }

  return lines.join('\n');
}

function cleanTreemap(content) {
  let lines = content.split('\n').map(l => l.trimEnd()).filter(Boolean);
  if (!lines.length) return content;

  let first = lines[0].trim();
  if (first.startsWith('treemap') && !first.startsWith('treemap-beta')) {
    lines[0] = 'treemap-beta';
  } else if (!first.startsWith('treemap-beta') && !first.startsWith('flowchart') && !first.startsWith('graph')) {
    lines = ['treemap-beta', ...lines];
  }

  return lines.join('\n');
}

function cleanTreeView(content) {
  let lines = content.split('\n').map(l => l.trimEnd()).filter(Boolean);
  if (!lines.length) return content;

  let first = lines[0].trim();

  // If it's a flowchart
  if (first.startsWith('flowchart') || first.startsWith('graph')) {
    first = first.replace(/^(flowchart|graph)\s+(TD|TB|BT|RL|LR)/i, 'flowchart LR');
    if (!first.startsWith('flowchart LR')) {
      first = 'flowchart LR';
    }
    lines[0] = first;
    return lines.join('\n');
  }

  // If it's a mindmap, convert to treeView-beta
  if (first.startsWith('mindmap')) {
    const cleaned = ['treeView-beta'];
    for (let i = 1; i < lines.length; i++) {
      const rawLine = lines[i];
      const stripped = rawLine.trim();
      if (!stripped || stripped.startsWith('%%')) continue;
      const indentMatch = rawLine.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1] : '  ';
      const label = stripped.replace(/^[(\[{]+|[)\]}]+$/g, '').replace(/^["']|["']$/g, '').trim();
      if (label) {
        cleaned.push(`${indent}"${label}"`);
      }
    }
    return cleaned.join('\n');
  }

  // Native directory tree format: ensure header is treeView-beta and entries are clean quoted strings
  const cleaned = ['treeView-beta'];
  const startIdx = (first.startsWith('treeView-beta') || first.startsWith('treeview-beta') || first.startsWith('treeView') || first.startsWith('treeview')) ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const rawLine = lines[i];
    const stripped = rawLine.trim();
    if (!stripped || stripped.startsWith('%%') || /^treeview(-beta)?/i.test(stripped)) continue;
    const indentMatch = rawLine.match(/^(\s*)/);
    let indent = indentMatch ? indentMatch[1] : '  ';
    if (!indent) indent = '  ';
    let label = stripped
      .replace(/^[-*•]\s+/, '')
      .replace(/^["']|["']$/g, '')
      .replace(/[<>]/g, '')
      .trim();
    if (!label) continue;
    cleaned.push(`${indent}"${label}"`);
  }

  return cleaned.join('\n');
}

function cleanGitGraph(content) {
  let lines = content.split('\n').map(l => l.trimEnd()).filter(Boolean);
  if (!lines.length) return content;

  let firstLine = lines[0].trim();
  if (!firstLine.startsWith('gitGraph')) {
    lines = ['gitGraph', ...lines.filter(l => !l.trim().startsWith('gitGraph'))];
  } else {
    lines[0] = 'gitGraph';
  }

  const createdBranches = new Set(['main']);
  let currentBranch = 'main';
  const seenCommitIds = new Set();

  const fixed = [];
  fixed.push('gitGraph');

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.trim();
    if (!stripped) continue;

    if (stripped.startsWith('rebase') || stripped.startsWith('delete branch') || stripped.startsWith('delete ')) {
      continue;
    }

    const branchMatch = stripped.match(/^branch\s+([^\s]+)/i);
    if (branchMatch) {
      const bName = branchMatch[1];
      if (bName === 'main') {
        continue;
      }
      createdBranches.add(bName);
      currentBranch = bName;
      fixed.push(`    ${stripped}`);
      continue;
    }

    const checkoutMatch = stripped.match(/^checkout\s+([^\s]+)/i);
    if (checkoutMatch) {
      const bName = checkoutMatch[1];
      if (!createdBranches.has(bName)) {
        fixed.push(`    branch ${bName}`);
        createdBranches.add(bName);
      }
      if (currentBranch !== bName || (fixed.length > 0 && fixed[fixed.length - 1].trim() !== stripped)) {
        currentBranch = bName;
        fixed.push(`    ${stripped}`);
      }
      continue;
    }

    const mergeMatch = stripped.match(/^merge\s+([^\s]+)/i);
    if (mergeMatch) {
      const mBranch = mergeMatch[1];
      if (mBranch === currentBranch) {
        continue;
      }
      if (!createdBranches.has(mBranch)) {
        fixed.push(`    branch ${mBranch}`);
        createdBranches.add(mBranch);
      }
      fixed.push(`    ${stripped}`);
      continue;
    }

    if (stripped.startsWith('commit')) {
      const idMatch = stripped.match(/id:\s*["']([^"']+)["']/i);
      if (idMatch) {
        let commitId = idMatch[1];
        if (seenCommitIds.has(commitId)) {
          let count = 2;
          let newId = `${commitId} (${count})`;
          while (seenCommitIds.has(newId)) {
            count++;
            newId = `${commitId} (${count})`;
          }
          seenCommitIds.add(newId);
          const updatedLine = stripped.replace(/id:\s*["'][^"']+["']/, `id: "${newId}"`);
          fixed.push(`    ${updatedLine}`);
        } else {
          seenCommitIds.add(commitId);
          fixed.push(`    ${stripped}`);
        }
      } else {
        fixed.push(`    ${stripped}`);
      }
      continue;
    }

    fixed.push(`    ${stripped}`);
  }

  return fixed.join('\n');
}

function cleanTimeline(content) {
  let lines = content.split('\n').map(l => l.trimEnd()).filter(Boolean);
  if (!lines.length) return content;

  let first = lines[0].trim();
  if (!first.startsWith('timeline')) {
    lines = ['timeline', ...lines.filter(l => !l.trim().startsWith('timeline'))];
  }

  const result = [];
  let defaultPeriodCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const stripped = raw.trim();

    if (stripped === 'timeline' || stripped.startsWith('---') || stripped.startsWith('config:') || stripped.startsWith('%%')) {
      result.push(raw);
      continue;
    }

    if (stripped.startsWith('title ')) {
      const titleText = stripped.replace(/^title\s+["']?/, '').replace(/["']?$/, '').replace(/:+/g, ' - ').trim();
      result.push(`    title ${titleText}`);
      continue;
    }

    if (stripped.startsWith('section ')) {
      const sectionName = stripped.replace(/^section\s+/, '').replace(/["']/g, '').replace(/:+/g, ' - ').trim();
      defaultPeriodCounter = 1;
      result.push(`    section ${sectionName}`);
      continue;
    }

    let cleanedLine = stripped
      .replace(/^[-*•]\s+/, '')
      .replace(/<[^>]+>/g, '')
      .replace(/-->>?|-->/g, ':')
      .trim();

    if (!cleanedLine) continue;

    if (cleanedLine.includes(':')) {
      const parts = cleanedLine.split(':').map(p => p.trim()).filter(Boolean);
      if (parts.length === 1) {
        result.push(`        Phase ${defaultPeriodCounter++} : ${parts[0]}`);
      } else {
        const period = parts[0];
        const events = parts.slice(1).join(' : ');
        result.push(`        ${period} : ${events}`);
      }
    } else {
      result.push(`        Milestone ${defaultPeriodCounter++} : ${cleanedLine}`);
    }
  }

  return result.join('\n');
}

function cleanBlock(content) {
  let lines = content.split('\n').map(l => l.trimEnd()).filter(Boolean);
  if (!lines.length) return content;

  let first = lines[0].trim();
  if (first.startsWith('block') && !first.startsWith('block-beta')) {
    lines[0] = 'block-beta';
  } else if (!first.startsWith('block-beta')) {
    lines = ['block-beta', ...lines.filter(l => !l.trim().startsWith('block-beta'))];
  } else {
    lines[0] = 'block-beta';
  }

  // Strip quotes from node IDs in declarations and connections
  lines = lines.map(line => {
    line = line.replace(/^[ \t]*"([a-zA-Z0-9_ -]+)"(\s*\[)/gm, (match, idStr, bracket) => {
      const cleanId = idStr.trim().replace(/\s+/g, '_');
      return `    ${cleanId}${bracket}`;
    });
    line = line.replace(/["']([A-Za-z0-9_ -]+)["']\s*(-->|<--|<-->)\s*["']([A-Za-z0-9_ -]+)["']/g, (_, src, arrow, dst) => `${src.trim().replace(/\s+/g, '_')} ${arrow} ${dst.trim().replace(/\s+/g, '_')}`);
    line = line.replace(/["']([A-Za-z0-9_ -]+)["']\s*(-->|<--|<-->)/g, (_, src, arrow) => `${src.trim().replace(/\s+/g, '_')} ${arrow}`);
    line = line.replace(/(-->|<--|<-->)\s*["']([A-Za-z0-9_ -]+)["']/g, (_, arrow, dst) => `${arrow} ${dst.trim().replace(/\s+/g, '_')}`);
    return line;
  });

  // Merge split block arrows (e.g. `arrow<["..."]>\n(down)`) and decode HTML entities
  const merged = [];
  let blockDepth = 0;
  for (let i = 0; i < lines.length; i++) {
    let curr = lines[i];
    curr = curr.replace(/&(?:nbsp|#160);/gi, ' ');
    curr = curr.replace(/(fill|stroke|color):#([0-9a-fA-F]{3,8})[a-zA-Z]+/g, '$1:#$2');

    let strippedCurr = curr.trim();
    if (strippedCurr.startsWith('block:') || strippedCurr === 'block') {
      blockDepth++;
    } else if (strippedCurr === 'end') {
      if (blockDepth > 0) blockDepth--;
    }

    if (i < lines.length - 1) {
      let next = lines[i + 1].replace(/&(?:nbsp|#160);/gi, ' ');
      let strippedNext = next.trim();
      if (/^[A-Za-z0-9_]+<.*>$/.test(strippedCurr) && /^\((?:down|up|right|left|x)\)(?::\d+)?$/.test(strippedNext)) {
        merged.push(`    ${strippedCurr}${strippedNext}`);
        i++;
        continue;
      }
    }
    merged.push(curr);
  }

  // Auto-close any unclosed block groups
  while (blockDepth > 0) {
    merged.push('  end');
    blockDepth--;
  }

  return merged.join('\n');
}

function cleanSwimlane(content) {
  let lines = content.split('\n').map(l => l.trimEnd()).filter(Boolean);
  if (!lines.length) return content;

  let first = lines[0].trim();
  if (first.startsWith('flowchart') || first.startsWith('graph')) {
    const dirMatch = first.match(/\b(LR|RL|TB|BT|TD)\b/i);
    const dir = dirMatch ? dirMatch[1].toUpperCase() : 'LR';
    lines[0] = `swimlane-beta ${dir}`;
  } else if (first.startsWith('swimlane') && !first.startsWith('swimlane-beta')) {
    const dirMatch = first.match(/\b(LR|RL|TB|BT|TD)\b/i);
    const dir = dirMatch ? dirMatch[1].toUpperCase() : 'LR';
    lines[0] = `swimlane-beta ${dir}`;
  } else if (first.startsWith('swimlane-beta')) {
    if (!/\b(LR|RL|TB|BT|TD)\b/i.test(first)) {
      lines[0] = 'swimlane-beta LR';
    }
  } else {
    lines = ['swimlane-beta LR', ...lines.filter(l => !l.trim().startsWith('swimlane-beta'))];
  }

  let subgraphDepth = 0;
  const cleaned = [];
  for (const line of lines) {
    const stripped = line.trim();
    if (stripped.startsWith('subgraph ') || stripped === 'subgraph') {
      subgraphDepth++;
    } else if (stripped === 'end') {
      if (subgraphDepth > 0) subgraphDepth--;
    }
    cleaned.push(line);
  }

  while (subgraphDepth > 0) {
    cleaned.push('end');
    subgraphDepth--;
  }

  return cleaned.join('\n');
}

function cleanPacket(content) {
  let lines = content.split('\n').map(l => l.trimEnd()).filter(Boolean);
  if (!lines.length) return content;

  let first = lines[0].trim();
  if ((first.startsWith('packet') || first.startsWith('packet-beta')) && !first.startsWith('packet-beta')) {
    lines[0] = 'packet-beta';
  } else if (!first.startsWith('packet-beta') && !first.startsWith('flowchart') && !first.startsWith('graph')) {
    lines = ['packet-beta', ...lines.filter(l => !l.trim().startsWith('packet-beta'))];
  }

  const cleaned = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const stripped = raw.trim();
    if (!stripped || stripped === 'packet-beta' || stripped.startsWith('title ') || stripped.startsWith('%%') || stripped.startsWith('---')) {
      cleaned.push(raw);
      continue;
    }

    const match = stripped.match(/^(\d+(?:-\d+)?)\s*:\s*(.*)$/);
    if (match) {
      const bitRange = match[1];
      let label = match[2].trim().replace(/^["']|["']$/g, '');
      cleaned.push(`  ${bitRange}: "${label}"`);
    } else {
      cleaned.push(raw);
    }
  }

  return cleaned.join('\n');
}

function cleanVenn(content) {
  let lines = content.split('\n').map(l => l.trimEnd()).filter(Boolean);
  if (!lines.length) return content;

  let first = lines[0].trim();
  if (first.startsWith('venn') && !first.startsWith('venn-beta')) {
    lines[0] = 'venn-beta';
  } else if (!first.startsWith('venn-beta')) {
    lines = ['venn-beta', ...lines.filter(l => !l.trim().startsWith('venn-beta'))];
  }

  return lines.join('\n');
}

function cleanXY(content) {
  let lines = content.split('\n').map(l => l.trimEnd()).filter(Boolean);
  if (!lines.length) return content;

  let first = lines[0].trim();
  if ((first.startsWith('xy') || first.startsWith('xychart')) && !first.startsWith('xychart-beta')) {
    lines[0] = 'xychart-beta';
  } else if (!first.startsWith('xychart-beta')) {
    lines = ['xychart-beta', ...lines.filter(l => !l.trim().startsWith('xychart-beta'))];
  }

  return lines.join('\n');
}

function cleanErDiagram(content) {
  let lines = content.split('\n').map(l => l.trimEnd()).filter(Boolean);
  if (!lines.length) return content;

  // Check if Chen-style ER diagram (flowchart with shapes like [Customer], {{Relationship}})
  const codeStr = lines.join('\n');
  if (codeStr.includes('{') && (codeStr.includes('[') || codeStr.includes('-->') || codeStr.includes('---'))) {
    if (!/\}|--|\|\|--|o\|--/.test(codeStr)) {
      if (/\[[A-Za-z0-9_ "]+\]|\{\{[A-Za-z0-9_ "]+\}\}|-->|---|==>/.test(codeStr)) {
        if (!codeStr.trim().startsWith('flowchart') && !codeStr.trim().startsWith('graph')) {
          return `flowchart TD\n${codeStr.replace(/^erDiagram\s*\n?/m, '')}`;
        }
        return codeStr;
      }
    }
  }

  let first = lines[0].trim();
  if (!first.startsWith('erDiagram')) {
    lines = ['erDiagram', ...lines.filter(l => !l.trim().startsWith('erDiagram'))];
  }

  return lines.map(line => {
    let l = line.replace(/;\s*$/, '');

    // Strip invalid double quotes from attribute names: string "userId" PK -> string userId PK
    l = l.replace(
      /^(\s*(?:string|int|float|double|boolean|datetime|text|date|time|uuid|bigint|varchar|json|blob|number)\??\s+)"([a-zA-Z0-9_]+)"(\s*(?:PK|FK|UK|,|\s)*)(?:\s+"([^"\n]*)")?/i,
      (match, prefix, attrName, keys, comment) => {
        const keyPart = keys ? keys.trim() : '';
        const commentPart = comment ? ` "${comment}"` : '';
        return `${prefix}${attrName}${keyPart ? ' ' + keyPart : ''}${commentPart}`;
      }
    );

    // Fix invalid single-brace relationships: }--|{ -> }|--|{ or }--o{ -> }|--o{
    l = l.replace(/\}([ \t]*-{2,}[ \t]*\|)/g, '}|--|');
    l = l.replace(/\}([ \t]*-{2,}[ \t]*o)/g, '}|--o');

    return l;
  }).join('\n');
}

function cleanClassDiagram(content) {
  let lines = content.split('\n').map(l => l.trimEnd()).filter(Boolean);
  if (!lines.length) return content;

  let first = lines[0].trim();
  if (!first.startsWith('classDiagram')) {
    lines = ['classDiagram', ...lines.filter(l => !l.trim().startsWith('classDiagram'))];
  }

  return lines.map(line => {
    let l = line;
    // Strip quotes around class declarations: class "WorkflowEngine" { -> class WorkflowEngine {
    l = l.replace(/^(\s*class\s+)"([a-zA-Z0-9_]+)"(\s*\{)/i, '$1$2$3');
    l = l.replace(/^(\s*class\s+)"([a-zA-Z0-9_]+)"/i, '$1$2');
    // Strip quotes around classes in relationships: "User" --> "Profile" -> User --> Profile
    l = l.replace(/"([a-zA-Z0-9_]+)"\s*([<*o-]--|--[<*o-]|-->|<--|--|\.\.|<\.\.|\.\.>)\s*"([a-zA-Z0-9_]+)"/g, '$1 $2 $3');
    l = l.replace(/"([a-zA-Z0-9_]+)"\s*([<*o-]--|--[<*o-]|-->|<--|--|\.\.|<\.\.|\.\.>)/g, '$1 $2');
    l = l.replace(/([<*o-]--|--[<*o-]|-->|<--|--|\.\.|<\.\.|\.\.>)\s*"([a-zA-Z0-9_]+)"/g, '$1 $2');
    return l;
  }).join('\n');
}

function cleanRadar(content) {
  let lines = content.split('\n').map(l => l.trimEnd()).filter(Boolean);
  if (!lines.length) return content;

  let frontmatter = [];
  let bodyLines = lines;
  if (lines[0].trim() === '---') {
    const endIdx = lines.slice(1).findIndex(l => l.trim() === '---');
    if (endIdx !== -1) {
      frontmatter = lines.slice(0, endIdx + 2);
      bodyLines = lines.slice(endIdx + 2);
    }
  }

  if (!bodyLines.length) return content;

  let first = bodyLines[0].trim();
  if (first.startsWith('radar') && !first.startsWith('radar-beta')) {
    bodyLines[0] = 'radar-beta';
  } else if (!first.startsWith('radar-beta')) {
    bodyLines = ['radar-beta', ...bodyLines.filter(l => !l.trim().startsWith('radar-beta'))];
  }

  const result = [...frontmatter];
  for (let i = 0; i < bodyLines.length; i++) {
    const raw = bodyLines[i];
    const stripped = raw.trim();
    if (!stripped) continue;

    if (stripped === 'radar' || stripped.startsWith('radar ')) {
      result.push('radar-beta');
      continue;
    }

    result.push(raw.startsWith(' ') || raw.startsWith('\t') || stripped.startsWith('---') || stripped.startsWith('radar-beta') ? raw : `    ${stripped}`);
  }

  return result.join('\n');
}

function cleanQuadrantChart(content) {
  let lines = content.split('\n').map(l => l.trimEnd()).filter(Boolean);
  if (!lines.length) return content;

  if (lines[0].trim() !== 'quadrantChart') {
    lines = ['quadrantChart', ...lines.filter(l => l.trim() !== 'quadrantChart')];
  }

  const fixed = [];
  let currentQuadrant = null;
  const quadCoords = {
    'quadrant-1': [0.75, 0.75],
    'quadrant-2': [0.25, 0.75],
    'quadrant-3': [0.25, 0.25],
    'quadrant-4': [0.75, 0.25]
  };

  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped) continue;

    if (stripped === 'quadrantChart') {
      fixed.push('quadrantChart');
      continue;
    }

    if (stripped.startsWith('x-axis-title')) {
      const val = stripped.replace('x-axis-title', '').trim();
      fixed.push(`    x-axis ${val}`);
      continue;
    }

    if (stripped.startsWith('y-axis-title')) {
      const val = stripped.replace('y-axis-title', '').trim();
      fixed.push(`    y-axis ${val}`);
      continue;
    }

    const quadMatch = stripped.match(/^(quadrant-[1-4])(?:\s+(.*))?$/i);
    if (quadMatch) {
      const qNum = quadMatch[1].toLowerCase();
      let qLabel = quadMatch[2] || `Quadrant ${qNum.slice(-1)}`;
      qLabel = qLabel.replace(/^title\s+/i, '').trim();
      fixed.push(`    ${qNum} ${qLabel}`);
      currentQuadrant = qNum;
      continue;
    }

    if (stripped.startsWith('title')) {
      if (currentQuadrant) continue;
      fixed.push(`    ${stripped}`);
      continue;
    }

    if (stripped.startsWith('x-axis') || stripped.startsWith('y-axis')) {
      fixed.push(`    ${stripped}`);
      continue;
    }

    const coordMatch = stripped.match(/:\s*\[\s*([0-9\.]+)\s*,\s*([0-9\.]+)\s*\]/);
    if (coordMatch) {
      fixed.push(`    ${stripped}`);
    } else {
      const cleanedItem = stripped.replace(/^[<"'\s]*([^>"':]+)[>"'\s]*/, '$1').trim();
      if (cleanedItem && !cleanedItem.startsWith('title') && !cleanedItem.startsWith('x-axis') && !cleanedItem.startsWith('y-axis')) {
        const coords = quadCoords[currentQuadrant] || [0.5, 0.5];
        fixed.push(`    "${cleanedItem}": [${coords[0]}, ${coords[1]}]`);
      }
    }
  }

  return fixed.join('\n');
}

function restoreFlowchartLineBreaks(content) {
  let text = content;
  if (!text.trim().includes('\n')) {
    text = text.replace(/\s+/g, ' ').trim();
  }
  text = text.replace(/^(flowchart\s+(?:TD|LR|BT|RL)|graph\s+(?:TD|LR|BT|RL))\s+/, '$1\n    ');
  text = text.replace(
    /\s+(?=(?:[A-Za-z][A-Za-z0-9_]*\s*(?:[-.=]+[ox>]|<[-.=]+|---)|classDef\s+|linkStyle\s+|style\s+|class\s+|subgraph\s+|end\b))/g,
    '\n    '
  );
  return text.split('\n').map(line => line.trimEnd()).join('\n');
}

function trimInvalidLinkStyles(content) {
  const lines = content.split('\n');
  const edgeCount = lines.reduce((count, line) => {
    const stripped = line.trim();
    if (stripped.startsWith('linkStyle ')) return count;
    return /[-.=]+[ox>]|<[-.=]+|---/.test(stripped) ? count + 1 : count;
  }, 0);

  const seen = new Set();
  return lines
    .map(line => {
      const match = line.trim().match(/^linkStyle\s+(\d+)\s+(.+?);?\s*$/);
      if (!match) return line;
      const idx = Number(match[1]);
      if (idx >= edgeCount || seen.has(idx)) return null;
      seen.add(idx);
      return `    linkStyle ${idx} ${match[2].replace(/;$/, '')};`;
    })
    .filter(line => line !== null)
    .join('\n');
}

export function cleanSequence(content) {
  let lines = content.split('\n').map(l => l.trimEnd()).filter(Boolean);
  if (!lines.length) return content;

  // Check if this is actually a flowchart (subgraph, node shapes like [..], (..), or arrows like -->)
  const body = (lines.length > 1 && lines[0].includes('sequenceDiagram')) ? lines.slice(1).join('\n') : content;
  if (/subgraph\s+[A-Za-z0-9_ -]+|-->|-\.->|==>|\[[^\]]+\]|\([^\)]+\)/.test(body)) {
    const seqMatches = (body.match(/->>|-->>|activate|deactivate|participant|actor/g) || []).length;
    const flowMatches = (body.match(/subgraph|-->|\[[^\]]+\]|\([^\)]+\)/g) || []).length;
    if (flowMatches > seqMatches && seqMatches <= 1) {
      let fixedLines = lines.filter(l => l.trim() !== 'sequenceDiagram');
      if (!fixedLines.some(l => l.trim().startsWith('flowchart') || l.trim().startsWith('graph'))) {
        fixedLines.unshift('flowchart TD');
      }
      return fixedLines.join('\n');
    }
  }

  let first = lines[0].trim();
  if (first !== 'sequenceDiagram') {
    lines = ['sequenceDiagram', ...lines.filter(l => l.trim() !== 'sequenceDiagram')];
  }

  // 1. Normalize participant/actor declarations and strip ALL unwanted quotation marks
  const normalizedDecl = [];
  for (let line of lines) {
    // Match `(actor|participant) "Label" as Alias` or `(actor|participant) "Label" as "Alias"`
    const revMatch = line.match(/^(\s*)(actor|participant)\s+["']([^"']+)["']\s+as\s+["']?([A-Za-z0-9_]+)["']?\s*$/i);
    if (revMatch) {
      const [, indent, keyword, label, alias] = revMatch;
      normalizedDecl.push(`${indent}${keyword} ${alias} as ${label.replace(/["']/g, '').trim()}`);
      continue;
    }

    // Match `(actor|participant) Alias as "Label"`
    const stdMatch = line.match(/^(\s*)(actor|participant)\s+["']?([A-Za-z0-9_]+)["']?\s+as\s+["']([^"']+)["']\s*$/i);
    if (stdMatch) {
      const [, indent, keyword, alias, label] = stdMatch;
      normalizedDecl.push(`${indent}${keyword} ${alias} as ${label.replace(/["']/g, '').trim()}`);
      continue;
    }

    // Match `(actor|participant) "Label"` without `as` (e.g. `participant "Frontend"`)
    const quoteOnlyMatch = line.match(/^(\s*)(actor|participant)\s+["']([^"']+)["']\s*$/i);
    if (quoteOnlyMatch) {
      const [, indent, keyword, label] = quoteOnlyMatch;
      const cleanLabel = label.replace(/["']/g, '').trim();
      if (/\s/.test(cleanLabel)) {
        const alias = cleanLabel.replace(/[^A-Za-z0-9_]/g, '_');
        normalizedDecl.push(`${indent}${keyword} ${alias} as ${cleanLabel}`);
      } else {
        normalizedDecl.push(`${indent}${keyword} ${cleanLabel}`);
      }
      continue;
    }

    // Match `actor Multi Word Label as Alias` where label has spaces
    const multiMatch = line.match(/^(\s*)(actor|participant)\s+([A-Za-z0-9_]+(?:\s+[A-Za-z0-9_]+)+)\s+as\s+["']?([A-Za-z0-9_]+)["']?\s*$/i);
    if (multiMatch) {
      const [, indent, keyword, label, alias] = multiMatch;
      normalizedDecl.push(`${indent}${keyword} ${alias} as ${label.replace(/["']/g, '').trim()}`);
      continue;
    }

    // Strip quotation marks from participants in arrows:
    // e.g. "Frontend"->>Backend: credentials -> Frontend->>Backend: credentials
    // e.g. User->>"Frontend": credentials -> User->>Frontend: credentials
    line = line.replace(/(^|\s)["']([A-Za-z0-9_]+)["'](\s*-[->>x)]+)/g, '$1$2$3');
    line = line.replace(/(-[->>x)]+[+-]?\s*)["']([A-Za-z0-9_]+)["'](\s*:)/g, '$1$2$3');

    normalizedDecl.push(line);
  }
  lines = normalizedDecl;

  // 2. Check if activations are unbalanced or go negative
  const balance = {};
  let hasActivationError = false;
  for (const line of lines) {
    const stripped = line.trim();
    if (stripped.startsWith('activate ')) {
      const parts = stripped.split(/\s+/);
      if (parts.length >= 2) {
        const alias = parts[1].trim();
        balance[alias] = (balance[alias] || 0) + 1;
      }
    } else if (stripped.startsWith('deactivate ')) {
      const parts = stripped.split(/\s+/);
      if (parts.length >= 2) {
        const alias = parts[1].trim();
        balance[alias] = (balance[alias] || 0) - 1;
        if (balance[alias] < 0) {
          hasActivationError = true;
          break;
        }
      }
    } else if (stripped.includes(':') && (stripped.includes('->') || stripped.includes('-->'))) {
      const prefix = stripped.split(':')[0];
      const parts = prefix.split(/-+>>?[+-]?/);
      if (parts.length >= 2) {
        const src = parts[0].trim();
        const dst = parts[parts.length - 1].trim();
        if (prefix.includes('->>+') || prefix.includes('->+')) {
          balance[dst] = (balance[dst] || 0) + 1;
        }
        if (prefix.includes('-->>-') || prefix.includes('-->-')) {
          balance[src] = (balance[src] || 0) - 1;
          if (balance[src] < 0) {
            hasActivationError = true;
            break;
          }
        }
      }
    }
  }

  if (!hasActivationError) {
    for (const val of Object.values(balance)) {
      if (val !== 0) {
        hasActivationError = true;
        break;
      }
    }
  }

  const fixed = [];
  for (let line of lines) {
    if (hasActivationError) {
      if (line.trim().startsWith('activate ') || line.trim().startsWith('deactivate ')) {
        continue;
      }
      line = line.replace(/(-+>>?)\+/g, '$1').replace(/(-+>>?)-/g, '$1');
    }

    // Strip outer quotes and normalize message labels
    const match = line.match(/^(\s*\S+\s*-[->>x)]+[+-]?\s*\S+\s*:\s*)(.*)$/);
    if (match) {
      const prefix = match[1];
      let msg = match[2].trim();
      if ((msg.startsWith('"') && msg.endsWith('"')) || (msg.startsWith("'") && msg.endsWith("'"))) {
        msg = msg.slice(1, -1).trim();
      }
      msg = msg.replace(/<[^>]*>/g, '').replace(/:/g, ' -').replace(/;/g, ',');
      fixed.push(`${prefix}${msg.slice(0, 90)}`);
    } else {
      fixed.push(line);
    }
  }

  return fixed.join('\n');
}

export { callModel, resolveModels };
