import type {
  AlertRecord,
  AstronautOverview,
  CopilotResponse,
  KnowledgeCitation,
  KnowledgeDocument,
} from '../../shared/types.js';

export interface IndexedChunk {
  id: string;
  documentId: string;
  sourceTitle: string;
  sourceName: string;
  version: string;
  section: string;
  pageNumber: number | null;
  content: string;
}

const STOPWORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'of', 'to', 'in',
  'for', 'with', 'that', 'this', 'are', 'be', 'as', 'by', 'from', 'it', 'not',
  'does', 'do', 'what', 'why', 'how', 'when', 'where', 'can', 'should', 'was',
  'were', 'has', 'have', 'had', 'about', 'into', 'than', 'then', 'but', 'if',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9°_.-]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

export function chunkMarkdownDocument(
  documentId: string,
  sourceName: string,
  markdown: string
): {
  docMeta: Omit<KnowledgeDocument, 'chunkCount' | 'createdAt'>;
  chunks: IndexedChunk[];
} {
  const lines = markdown.split(/\r?\n/);
  let title = sourceName;
  let version = '1.0.0';
  let category = 'Reference';
  let currentPage: number | null = 1;
  let currentSection = 'Overview';
  let buffer: string[] = [];

  const chunks: IndexedChunk[] = [];

  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text.length < 30) {
      buffer = [];
      return;
    }
    chunks.push({
      id: `${documentId}-CHK-${String(chunks.length + 1).padStart(2, '0')}`,
      documentId,
      sourceTitle: title,
      sourceName,
      version,
      section: currentSection,
      pageNumber: currentPage,
      content: text,
    });
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ') && title === sourceName) {
      title = trimmed.slice(2).trim();
      continue;
    }
    const verMatch = trimmed.match(/Version:\s*([0-9.]+)/i);
    if (verMatch) {
      version = verMatch[1];
    }
    const catMatch = trimmed.match(/Category:\s*([^|]+)/i);
    if (catMatch) {
      category = catMatch[1].trim();
      continue;
    }
    const pageMatch = trimmed.match(/<!--\s*page:\s*(\d+)\s*-->/i);
    if (pageMatch) {
      flush();
      currentPage = Number(pageMatch[1]);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      flush();
      currentSection = trimmed.slice(3).trim();
      continue;
    }
    if (trimmed.length > 0) {
      buffer.push(trimmed);
    } else if (buffer.join(' ').length > 420) {
      flush();
    }
  }
  flush();

  return {
    docMeta: {
      id: documentId,
      title,
      sourceName,
      version,
      publishedDate: '2026-01-15',
      category,
      isBuiltin: true,
    },
    chunks,
  };
}

export function retrieveTopChunks(
  query: string,
  chunks: IndexedChunk[],
  topK = 4
): KnowledgeCitation[] {
  if (chunks.length === 0) return [];
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return [];

  // Build document frequency across local chunks (TF-IDF + cosine weighting)
  const docFreq = new Map<string, number>();
  const chunkTokensList = chunks.map((c) => {
    const toks = tokenize(`${c.section} ${c.sourceTitle} ${c.content}`);
    const unique = new Set(toks);
    for (const t of unique) {
      docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
    }
    return toks;
  });

  const N = chunks.length;
  const idf = (term: string) => Math.log(1 + (N + 1) / ((docFreq.get(term) ?? 0) + 1));

  // Query TF-IDF vector
  const qVec = new Map<string, number>();
  for (const t of qTokens) {
    qVec.set(t, (qVec.get(t) ?? 0) + idf(t));
  }
  const qNorm = Math.sqrt(Array.from(qVec.values()).reduce((s, v) => s + v * v, 0)) || 1;

  const scored = chunks.map((chunk, idx) => {
    const toks = chunkTokensList[idx];
    const tf = new Map<string, number>();
    for (const t of toks) {
      tf.set(t, (tf.get(t) ?? 0) + 1);
    }

    let dot = 0;
    let dNormSq = 0;
    for (const [term, count] of tf.entries()) {
      const weight = (1 + Math.log(count)) * idf(term);
      dNormSq += weight * weight;
      const qW = qVec.get(term);
      if (qW) {
        dot += weight * qW;
      }
    }

    // Small section-title exact bonus
    const sectionLower = chunk.section.toLowerCase();
    let titleBonus = 0;
    for (const qt of qTokens) {
      if (sectionLower.includes(qt)) titleBonus += 0.12;
    }

    const cosine = dot / ((Math.sqrt(dNormSq) || 1) * qNorm);
    const score = Number((cosine + titleBonus).toFixed(4));
    return { chunk, score };
  });

  return scored
    .filter((item) => item.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((item) => ({
      chunkId: item.chunk.id,
      documentId: item.chunk.documentId,
      sourceTitle: item.chunk.sourceTitle,
      sourceName: item.chunk.sourceName,
      section: item.chunk.section,
      pageNumber: item.chunk.pageNumber,
      version: item.chunk.version,
      excerpt: item.chunk.content.slice(0, 380) + (item.chunk.content.length > 380 ? '…' : ''),
      score: item.score,
    }));
}

export const COPILOT_SAFETY_NOTICE =
  'ASTROSAGE Copilot provides evidence-grounded information support. It does not provide medical diagnosis, treatment or autonomous mission-clearance decisions.';

export function buildDeterministicFallbackAnswer(
  question: string,
  overview: AstronautOverview,
  citations: KnowledgeCitation[],
  modeLabel: 'RETRIEVAL_FALLBACK' | 'OLLAMA_LOCAL' = 'RETRIEVAL_FALLBACK'
): CopilotResponse {
  const qLower = question.toLowerCase();
  const observations: string[] = [];
  const calculations: string[] = [];
  const uncertainties: string[] = [];
  const referencedIds: string[] = [];

  const { astronaut, mission, summary, alerts, baselines, recentHealthSeries, recentRadiation, recentEnvironment, recentSymptoms } =
    overview;

  observations.push(
    `Active context: ${astronaut.callsign} (${astronaut.name}) on ${mission.name} [${overview.activeScenario}].`
  );

  if (alerts.length > 0) {
    for (const alert of alerts.slice(0, 3)) {
      observations.push(`[${alert.severity}] ${alert.title} (Rule ${alert.ruleId} v${alert.ruleVersion}).`);
      calculations.push(`${alert.measuredSummary} | Baseline: ${alert.baselineSummary}`);
      if (alert.missingInformation) uncertainties.push(alert.missingInformation);
      referencedIds.push(alert.id, ...alert.triggeringRecordIds.slice(0, 3));
    }
  } else {
    observations.push('No active review flags are currently triggered for this crew profile.');
  }

  // Specific topic grounding
  if (qLower.includes('gray') || qLower.includes('sievert') || qLower.includes('radiation') || qLower.includes('exposure')) {
    const gyList = recentRadiation.filter((r) => r.unit.toLowerCase().includes('gy'));
    const svList = recentRadiation.filter((r) => r.unit.toLowerCase().includes('sv'));
    observations.push(
      `Dosimetry records: ${gyList.length} absorbed-dose record(s) in Gy/mGy and ${svList.length} effective/ambient-dose record(s) in Sv/mSv.`
    );
    for (const r of recentRadiation.slice(0, 3)) {
      referencedIds.push(r.id);
    }
    uncertainties.push(
      'Gray (Gy) and Sievert (Sv) remain strictly separate quantities. Temporal overlap with health readings does not establish causation.'
    );
  }

  if (qLower.includes('missing') || qLower.includes('unreliable') || qLower.includes('quality') || qLower.includes('fault')) {
    const faulty = recentHealthSeries.filter((r) => r.qualityStatus !== 'VALID');
    const faultyRad = recentRadiation.filter((r) => r.qualityStatus !== 'VALID');
    const allFaulty = [...faulty, ...faultyRad];
    if (allFaulty.length > 0) {
      for (const f of allFaulty.slice(0, 5)) {
        observations.push(`Record ${f.id} marked ${f.qualityStatus}: ${f.qualityNotes}`);
        referencedIds.push(f.id);
      }
    } else {
      observations.push('All currently loaded telemetry records passed quality checks (VALID).');
    }
  }

  if (qLower.includes('handover') || qLower.includes('summary') || qLower.includes('72-hour') || qLower.includes('summarise') || qLower.includes('summarize')) {
    const validHr = recentHealthSeries.filter((r) => r.metric === 'heart_rate' && r.qualityStatus === 'VALID' && r.value !== null);
    if (validHr.length > 0) {
      const vals = validHr.map((v) => v.value as number);
      const minHr = Math.min(...vals);
      const maxHr = Math.max(...vals);
      calculations.push(`Heart Rate (VALID n=${vals.length}): range ${minHr}–${maxHr} bpm; latest ${summary.latestHeartRate ?? 'N/A'} bpm.`);
    }
    const hrBaseline = baselines.find((b) => b.metric === 'heart_rate');
    if (hrBaseline && hrBaseline.isSufficient) {
      calculations.push(
        `Locked HR Baseline v${hrBaseline.baselineVersion}: mean ${hrBaseline.mean} bpm, SD ${hrBaseline.stdDev}, IQR ${hrBaseline.iqr} (n=${hrBaseline.sampleCount}).`
      );
    }
    if (recentSymptoms.length > 0) {
      observations.push(
        `Reported symptoms (${recentSymptoms.length}): ${recentSymptoms.map((s) => `${s.symptom} (${s.severityRating}/5)`).join(', ')}.`
      );
    }
    if (recentEnvironment.length > 0) {
      const co2 = recentEnvironment.filter((e) => e.metric === 'co2_mmhg' && e.value !== null);
      if (co2.length > 0) {
        const latestCo2 = co2[co2.length - 1];
        observations.push(`Latest cabin CO2: ${latestCo2.value} ${latestCo2.unit} (${latestCo2.location}).`);
      }
    }
  }

  // Check if evidence is insufficient for an unrelated out-of-scope query
  const isUnrelated =
    citations.length === 0 &&
    !qLower.includes('flag') &&
    !qLower.includes('alert') &&
    !qLower.includes('baseline') &&
    !qLower.includes('handover') &&
    !qLower.includes('record') &&
    !qLower.includes('missing') &&
    !qLower.includes('exposure') &&
    !qLower.includes('health');

  let answer = '';
  if (isUnrelated) {
    answer =
      'Insufficient local evidence: The locally indexed ASTROSAGE reference library and active SQLite mission telemetry do not contain verified records or protocol sections answering this question. No external sources were queried and no assumptions were fabricated.';
    uncertainties.push('No matching indexed reference chunks met the minimum local similarity threshold.');
  } else {
    const parts: string[] = [];
    parts.push(
      `Local Retrieval Summary (Deterministic — Local LLM Offline): Based on SQLite mission records for ${astronaut.callsign} (${overview.activeScenario}) and ${citations.length} retrieved reference excerpt(s):`
    );
    if (observations.length > 0) {
      parts.push(`\nRecorded Facts:\n• ${observations.join('\n• ')}`);
    }
    if (calculations.length > 0) {
      parts.push(`\nCalculated Comparisons:\n• ${calculations.join('\n• ')}`);
    }
    if (citations.length > 0) {
      parts.push(
        `\nReference Library Evidence:\n• ${citations
          .map((c) => `${c.sourceTitle} (${c.section}${c.pageNumber ? `, p.${c.pageNumber}` : ''}): "${c.excerpt.slice(0, 180)}…"`)
          .join('\n• ')}`
      );
    }
    if (uncertainties.length > 0) {
      parts.push(`\nUncertainties & Boundaries:\n• ${Array.from(new Set(uncertainties)).join('\n• ')}`);
    }
    answer = parts.join('\n');
  }

  return {
    id: `COP-${Date.now()}`,
    question,
    mode: modeLabel,
    modelName: null,
    answer,
    observations: Array.from(new Set(observations)),
    calculations: Array.from(new Set(calculations)),
    uncertainties: Array.from(new Set(uncertainties)),
    citations,
    referencedRecordIds: Array.from(new Set(referencedIds)),
    safetyNotice: COPILOT_SAFETY_NOTICE,
    timestamp: new Date().toISOString(),
  };
}

export async function checkOllamaAvailability(
  baseUrl: string,
  timeoutMs = 1500
): Promise<{ available: boolean; models: string[]; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      return { available: false, models: [], error: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as { models?: Array<{ name: string }> };
    const models = (json.models ?? []).map((m) => m.name);
    return { available: true, models };
  } catch (err) {
    return {
      available: false,
      models: [],
      error: err instanceof Error ? err.message : 'Local Ollama daemon unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function queryOllamaGrounded(
  baseUrl: string,
  model: string,
  question: string,
  overview: AstronautOverview,
  citations: KnowledgeCitation[],
  timeoutMs = 20000
): Promise<CopilotResponse> {
  const fallback = buildDeterministicFallbackAnswer(question, overview, citations, 'RETRIEVAL_FALLBACK');
  const ollamaCheck = await checkOllamaAvailability(baseUrl, 1200);
  if (!ollamaCheck.available) {
    return fallback;
  }

  const contextBlock = [
    `Crew: ${overview.astronaut.callsign} (${overview.astronaut.name}), Mission: ${overview.mission.name}, Scenario: ${overview.activeScenario}`,
    `Active Alerts (${overview.alerts.length}): ${overview.alerts
      .map((a) => `[${a.severity}] ${a.title} | ${a.whatHappened} | Measured: ${a.measuredSummary} | Baseline: ${a.baselineSummary}`)
      .join('\n') || 'None'}`,
    `Retrieved Reference Chunks (cite ONLY by exact Chunk ID):`,
    ...citations.map(
      (c) => `[${c.chunkId}] ${c.sourceTitle} | ${c.section} (p.${c.pageNumber ?? 'N/A'}): ${c.excerpt}`
    ),
  ].join('\n\n');

  const systemPrompt = [
    'You are ASTROSAGE Protocol Copilot, an offline decision-support assistant.',
    'STRICT RULES:',
    '1. Separate Recorded Observations, Calculated Results, and Uncertainties.',
    '2. Cite ONLY the provided Chunk IDs in brackets (e.g. [REF-BASE-01-CHK-02]). Never invent titles, pages, or rules.',
    '3. Never diagnose medical conditions, prescribe medications, clear astronauts for EVA, or claim temporal overlap proves causation.',
    '4. If evidence is insufficient, say so explicitly.',
  ].join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Context:\n${contextBlock}\n\nUser Question: ${question}` },
        ],
      }),
    });

    if (!res.ok) {
      return fallback;
    }
    const data = (await res.json()) as { message?: { content?: string } };
    const text = data.message?.content?.trim();
    if (!text) return fallback;

    // Validate citations strictly against retrieved chunk IDs
    const validChunkIds = new Set(citations.map((c) => c.chunkId));
    const citedInText = citations.filter((c) => text.includes(c.chunkId));

    return {
      ...fallback,
      mode: 'OLLAMA_LOCAL',
      modelName: model,
      answer: text,
      citations: citedInText.length > 0 ? citedInText : citations.filter((c) => validChunkIds.has(c.chunkId)),
    };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
