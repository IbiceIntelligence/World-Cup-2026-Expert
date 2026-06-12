const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-5';

async function callClaude(system, user) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
  const data = await res.json();
  const text = data.content?.[0]?.text || '{}';
  const clean = text.replace(/```json\n?|```/g, '').trim();
  return JSON.parse(clean);
}

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { action, lang = 'es', match, analyses } = body;
  const isEs = lang === 'es';

  try {
    let result;

    // ── ANALYZE MATCH ────────────────────────────────────────────
    if (action === 'analyze-match') {
      const m = match;
      const system = isEs
        ? 'Eres un analista experto en apuestas deportivas del Mundial FIFA 2026. Responde SOLO con JSON válido, sin texto adicional ni backticks.'
        : 'You are an expert FIFA World Cup 2026 sports betting analyst. Respond ONLY with valid JSON, no extra text or backticks.';

      const user = isEs
        ? `Analiza el partido: ${m.home} vs ${m.away} (${m.stage}, ${m.time}).
Odds actuales: Local ${m.odds?.home || 2.1} | Empate ${m.odds?.draw || 3.3} | Visitante ${m.odds?.away || 3.5}.
Forma reciente: ${m.home} [${(m.form?.home || []).join(',')}] | ${m.away} [${(m.form?.away || []).join(',')}].
Devuelve exactamente este JSON:
{
  "matchId": "${m.id}",
  "home": "${m.home}",
  "away": "${m.away}",
  "prediction": {
    "bear": { "label": "Escenario bajista", "prob": 25, "desc": "descripción breve del escenario pesimista" },
    "base": { "label": "Escenario base", "prob": 50, "desc": "descripción breve del escenario más probable" },
    "bull": { "label": "Escenario alcista", "prob": 25, "desc": "descripción breve del escenario optimista" }
  },
  "recommendedBet": {
    "market": "nombre del mercado (ej: 1X2, Over/Under 2.5, BTTS)",
    "selection": "selección recomendada",
    "odds_decimal": 2.10,
    "odds_american": "+110",
    "stake": "2u",
    "edge": "+8.5%",
    "confidence": "HIGH",
    "valueFlag": true
  },
  "keyFactors": ["Factor clave 1", "Factor clave 2", "Factor clave 3"],
  "xgAnalysis": "Análisis xG breve y concreto",
  "lineMovement": "Movimiento de línea breve"
}`
        : `Analyze the match: ${m.home} vs ${m.away} (${m.stage}, ${m.time}).
Current odds: Home ${m.odds?.home || 2.1} | Draw ${m.odds?.draw || 3.3} | Away ${m.odds?.away || 3.5}.
Recent form: ${m.home} [${(m.form?.home || []).join(',')}] | ${m.away} [${(m.form?.away || []).join(',')}].
Return exactly this JSON:
{
  "matchId": "${m.id}",
  "home": "${m.home}",
  "away": "${m.away}",
  "prediction": {
    "bear": { "label": "Bear scenario", "prob": 25, "desc": "brief bear case description" },
    "base": { "label": "Base scenario", "prob": 50, "desc": "brief most likely description" },
    "bull": { "label": "Bull scenario", "prob": 25, "desc": "brief bull case description" }
  },
  "recommendedBet": {
    "market": "market name (e.g. 1X2, Over/Under 2.5, BTTS)",
    "selection": "recommended selection",
    "odds_decimal": 2.10,
    "odds_american": "+110",
    "stake": "2u",
    "edge": "+8.5%",
    "confidence": "HIGH",
    "valueFlag": true
  },
  "keyFactors": ["Key factor 1", "Key factor 2", "Key factor 3"],
  "xgAnalysis": "Brief concrete xG analysis",
  "lineMovement": "Brief line movement note"
}`;

      result = await callClaude(system, user);
    }

    // ── GENERATE SUMMARY ─────────────────────────────────────────
    else if (action === 'generate-summary') {
      const matchList = (analyses || [])
        .map(a => `${a.home} vs ${a.away}: ${a.recommendedBet?.selection} @ ${a.recommendedBet?.odds_decimal} (${a.recommendedBet?.confidence})`)
        .join('\n');

      const system = isEs
        ? 'Eres un analista senior de apuestas deportivas del Mundial FIFA 2026. Responde SOLO con JSON válido, sin texto adicional ni backticks.'
        : 'You are a senior FIFA World Cup 2026 betting analyst. Respond ONLY with valid JSON, no extra text or backticks.';

      const user = isEs
        ? `Basado en estos análisis de partidos:\n${matchList}\n\nDevuelve exactamente este JSON:
{
  "marketInsights": "Resumen ejecutivo de 2-3 oraciones sobre el mercado de hoy y las mejores oportunidades de valor.",
  "topPicks": [
    { "rank": 1, "match": "Equipo A vs Equipo B", "bet": "descripción apuesta", "odds_decimal": 2.10, "confidence": "HIGH", "stake": "2u", "expectedValue": "+12%" },
    { "rank": 2, "match": "Equipo C vs Equipo D", "bet": "descripción apuesta", "odds_decimal": 1.85, "confidence": "MEDIUM", "stake": "1.5u", "expectedValue": "+7%" },
    { "rank": 3, "match": "Equipo E vs Equipo F", "bet": "descripción apuesta", "odds_decimal": 3.20, "confidence": "MEDIUM", "stake": "1u", "expectedValue": "+15%" }
  ]
}`
        : `Based on these match analyses:\n${matchList}\n\nReturn exactly this JSON:
{
  "marketInsights": "2-3 sentence executive summary of today's market and best value opportunities.",
  "topPicks": [
    { "rank": 1, "match": "Team A vs Team B", "bet": "bet description", "odds_decimal": 2.10, "confidence": "HIGH", "stake": "2u", "expectedValue": "+12%" },
    { "rank": 2, "match": "Team C vs Team D", "bet": "bet description", "odds_decimal": 1.85, "confidence": "MEDIUM", "stake": "1.5u", "expectedValue": "+7%" },
    { "rank": 3, "match": "Team E vs Team F", "bet": "bet description", "odds_decimal": 3.20, "confidence": "MEDIUM", "stake": "1u", "expectedValue": "+15%" }
  ]
}`;

      result = await callClaude(system, user);
    }

    // ── GET NEWS ─────────────────────────────────────────────────
    else if (action === 'get-news') {
      const system = isEs
        ? 'Eres un periodista especializado en el Mundial FIFA 2026. Responde SOLO con JSON válido, sin texto adicional ni backticks.'
        : 'You are a FIFA World Cup 2026 specialist journalist. Respond ONLY with valid JSON, no extra text or backticks.';

      const user = isEs
        ? `Genera 4 noticias recientes y relevantes del Mundial FIFA 2026 que está en curso (junio 2026). Devuelve exactamente este JSON:
{
  "data": [
    { "title": "Titular noticia 1", "summary": "Resumen breve de 1-2 oraciones.", "category": "Resultados", "time": "Hace 2 horas" },
    { "title": "Titular noticia 2", "summary": "Resumen breve de 1-2 oraciones.", "category": "Lesiones", "time": "Hace 4 horas" },
    { "title": "Titular noticia 3", "summary": "Resumen breve de 1-2 oraciones.", "category": "Análisis", "time": "Hace 6 horas" },
    { "title": "Titular noticia 4", "summary": "Resumen breve de 1-2 oraciones.", "category": "Estadísticas", "time": "Hace 8 horas" }
  ]
}`
        : `Generate 4 recent relevant news items from the ongoing FIFA World Cup 2026 (June 2026). Return exactly this JSON:
{
  "data": [
    { "title": "News headline 1", "summary": "Brief 1-2 sentence summary.", "category": "Results", "time": "2 hours ago" },
    { "title": "News headline 2", "summary": "Brief 1-2 sentence summary.", "category": "Injuries", "time": "4 hours ago" },
    { "title": "News headline 3", "summary": "Brief 1-2 sentence summary.", "category": "Analysis", "time": "6 hours ago" },
    { "title": "News headline 4", "summary": "Brief 1-2 sentence summary.", "category": "Stats", "time": "8 hours ago" }
  ]
}`;

      result = await callClaude(system, user);
    }

    else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown action: ${action}` }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (err) {
    console.error('Function error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
