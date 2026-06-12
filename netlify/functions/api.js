const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const APIFY_API_TOKEN   = process.env.APIFY_API_TOKEN;
const MODEL = 'claude-sonnet-4-5';

// ── HELPERS ────────────────────────────────────────────────────────────────

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
      max_tokens: 1200,
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

// Generic JSON fetch with timeout
async function fetchJSON(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// ── VENUE → COORDINATES MAP ────────────────────────────────────────────────
const VENUE_COORDS = {
  dallas:      { lat: 32.7473,  lon: -97.0945,  name: 'AT&T Stadium · Dallas'      },
  newjersey:   { lat: 40.8135,  lon: -74.0745,  name: 'MetLife Stadium · New Jersey'},
  miami:       { lat: 25.9580,  lon: -80.2389,  name: 'Hard Rock Stadium · Miami'  },
  losangeles:  { lat: 34.0141,  lon: -118.2879, name: 'SoFi Stadium · Los Angeles' },
  houston:     { lat: 29.6847,  lon: -95.4107,  name: 'NRG Stadium · Houston'      },
  seattle:     { lat: 47.5952,  lon: -122.3316, name: 'Lumen Field · Seattle'      },
  sanfrancisco:{ lat: 37.4032,  lon: -121.9698, name: "Levi's Stadium · San Jose"  },
  kansascity:  { lat: 39.0489,  lon: -94.4839,  name: 'Arrowhead Stadium · Kansas City'},
  boston:      { lat: 42.0909,  lon: -71.2643,  name: 'Gillette Stadium · Boston'  },
  philadelphia:{ lat: 39.9008,  lon: -75.1675,  name: 'Lincoln Financial · Philadelphia'},
  atlanta:     { lat: 33.7554,  lon: -84.4008,  name: 'Mercedes-Benz Stadium · Atlanta'},
  vancouver:   { lat: 49.2769,  lon: -123.1116, name: 'BC Place · Vancouver'       },
  toronto:     { lat: 43.6333,  lon: -79.4189,  name: 'BMO Field · Toronto'        },
  guadalajara: { lat: 20.6597,  lon: -103.3496, name: 'Estadio Akron · Guadalajara'},
  monterrey:   { lat: 25.6694,  lon: -100.3099, name: 'Estadio BBVA · Monterrey'   },
  cdmx:        { lat: 19.3029,  lon: -99.1505,  name: 'Estadio Azteca · CDMX'      },
};

// ── ACTION: FIXTURES ───────────────────────────────────────────────────────
// Source: worldcup26.ir — free, no auth required
async function getFixtures() {
  try {
    const data = await fetchJSON('https://worldcup26.ir/get/games');
    // Normalize to our format
    const matches = (Array.isArray(data) ? data : data.games || data.matches || [])
      .slice(0, 48)
      .map(m => ({
        id:        m._id || m.id,
        home:      { name: m.home_team_name_en || m.home_team_name_fa || '' },
        away:      { name: m.away_team_name_en || m.away_team_name_fa || '' },
        homeScore: m.home_score ?? null,
        awayScore: m.away_score ?? null,
        status:    m.finished === 'TRUE' ? 'finished'
                 : (m.time_elapsed && m.time_elapsed !== 'notstarted') ? 'live'
                 : 'scheduled',
        date:      m.local_date || m.date || null,
        venue:     m.stadium_id ? 'Stadium ' + m.stadium_id : null,
        group:     m.group || null,
        matchday:  m.matchday || null,
        minute:    (m.time_elapsed && m.time_elapsed !== 'notstarted') ? m.time_elapsed : null,
      }));
    return { ok: true, matches };
  } catch (e) {
    return { ok: false, error: e.message, matches: [] };
  }
}

// ── ACTION: GROUPS ─────────────────────────────────────────────────────────
// Source: worldcup26.ir — crosses fixtures to resolve team names from IDs
async function getGroups() {
  try {
    // Fetch both in parallel
    const [groupData, fixtureData] = await Promise.all([
      fetchJSON('https://worldcup26.ir/get/groups'),
      fetchJSON('https://worldcup26.ir/get/games'),
    ]);

    // Build team_id → name map from fixtures
    const teamMap = {};
    const games = Array.isArray(fixtureData) ? fixtureData : fixtureData.games || [];
    games.forEach(g => {
      if (g.home_team_id && g.home_team_name_en) teamMap[String(g.home_team_id)] = g.home_team_name_en;
      if (g.away_team_id && g.away_team_name_en) teamMap[String(g.away_team_id)] = g.away_team_name_en;
    });

    const raw = Array.isArray(groupData) ? groupData : groupData.groups || [];
    const groups = raw.map(g => ({
      name:  g.name || g.group || g._id,
      teams: (g.teams || []).map(t => {
        const tid = String(t.team_id || t.id || '');
        const teamName = teamMap[tid] || tid;
        return {
          name:   teamName,
          flag:   t.flag || '',
          played: parseInt(t.mp  || t.played || 0),
          won:    parseInt(t.w   || t.won    || 0),
          drawn:  parseInt(t.d   || t.drawn  || 0),
          lost:   parseInt(t.l   || t.lost   || 0),
          gf:     parseInt(t.gf  || 0),
          ga:     parseInt(t.ga  || 0),
          gd:     parseInt(t.gd  || 0),
          points: parseInt(t.pts || t.points || 0),
        };
      }).sort((a, b) => b.points - a.points || b.gd - a.gd),
    }));
    // Sort groups alphabetically A→L
    groups.sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, groups };
  } catch (e) {
    return { ok: false, error: e.message, groups: [] };
  }
}

// ── ACTION: WEATHER ────────────────────────────────────────────────────────
// Source: Open-Meteo — free, no API key required
async function getWeather(venue) {
  const key   = (venue || 'dallas').toLowerCase().replace(/\s+/g, '');
  const coord = VENUE_COORDS[key] || VENUE_COORDS['dallas'];

  try {
    const url = `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${coord.lat}&longitude=${coord.lon}` +
      `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&temperature_unit=celsius&wind_speed_unit=kmh&timezone=auto&forecast_days=3`;

    const data = await fetchJSON(url);
    const c = data.current;
    const d = data.daily;

    // WMO weather code → simple label
    const wmoLabel = (code) => {
      if (code === 0)           return 'Despejado / Clear';
      if (code <= 3)            return 'Parcialmente nublado / Partly cloudy';
      if (code <= 48)           return 'Nublado / Cloudy';
      if (code <= 67)           return 'Lluvia / Rain';
      if (code <= 77)           return 'Nieve / Snow';
      if (code <= 82)           return 'Chubascos / Showers';
      if (code <= 99)           return 'Tormenta / Thunderstorm';
      return 'Variable';
    };

    // Betting alert logic
    const alerts = [];
    const tempC = c.temperature_2m;
    const humid = c.relative_humidity_2m;
    const wind  = c.wind_speed_10m;
    const rain  = d.precipitation_probability_max?.[0] ?? 0;

    if (tempC >= 35)      alerts.push({ type: 'hot',   es: '⚠ Calor extremo — favorece Under',          en: '⚠ Extreme heat — favors Under'         });
    if (humid >= 75)      alerts.push({ type: 'humid', es: '💧 Humedad alta — ritmo lento',               en: '💧 High humidity — slower pace'         });
    if (wind >= 20)       alerts.push({ type: 'wind',  es: '💨 Viento alto — afecta centros y disparos', en: '💨 High wind — affects crosses & shots' });
    if (rain >= 60)       alerts.push({ type: 'rain',  es: '🌧 Lluvia probable — campo pesado',           en: '🌧 Rain likely — heavy pitch'           });
    if (alerts.length === 0) alerts.push({ type: 'ok', es: '✓ Condiciones óptimas para el partido',      en: '✓ Optimal match conditions'             });

    return {
      ok: true,
      venue:    coord.name,
      current: {
        tempC:    Math.round(tempC),
        tempF:    Math.round(tempC * 9/5 + 32),
        humidity: humid,
        windKmh:  Math.round(wind),
        condition: wmoLabel(c.weather_code),
      },
      forecast: (d.temperature_2m_max || []).slice(0, 3).map((max, i) => ({
        tempMaxC: Math.round(max),
        tempMinC: Math.round(d.temperature_2m_min[i]),
        rainPct:  d.precipitation_probability_max[i],
      })),
      alerts,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── ACTION: MATCH ANALYSIS (existing Claude flow) ─────────────────────────
async function getMatchAnalysis(home, away, lang = 'es') {
  const system = lang === 'en'
    ? `You are an expert FIFA World Cup 2026 betting analyst.
       Return ONLY valid JSON with these exact keys:
       - summary: string (2-3 sentences narrative analysis)
       - picks: array of up to 4 objects with {market, recommendation, odds, ev, confidence}
         where odds is a decimal number string like "1.85", ev is a number like 8.5, confidence is 0-100
       - keyFactors: array of 4-6 strings
       - prediction: object with EXACTLY {score, note} where score MUST be "X-Y" number format e.g. {"score":"2-1","note":"Mexico wins at home"}`
    : `Eres un analista experto de apuestas para la Copa Mundial FIFA 2026.
       Responde SOLO con JSON válido con estas claves exactas:
       - summary: string (análisis narrativo de 2-3 oraciones)
       - picks: array de hasta 4 objetos con {market, recommendation, odds, ev, confidence}
         donde odds es decimal como "1.85", ev es número como 8.5, confidence es 0-100
       - keyFactors: array de 4-6 strings
       - prediction: objeto con EXACTAMENTE {score, note} donde score DEBE ser formato "X-Y" con números ej: {"score":"2-1","note":"México gana como local"}`;

  const user = lang === 'en'
    ? `Analyze the FIFA World Cup 2026 match: ${home} vs ${away}. Give betting recommendations with expected value and a score prediction.`
    : `Analiza el partido de Copa Mundial FIFA 2026: ${home} vs ${away}. Da recomendaciones de apuesta con valor esperado y una predicción de marcador.`;

  return await callClaude(system, user);
}

// ── ACTION: INJURIES ANALYSIS (Claude + web context) ──────────────────────
async function getInjuriesAnalysis(lang = 'es') {
  const system = lang === 'en'
    ? `You are a FIFA World Cup 2026 injury intelligence analyst.
       Return ONLY valid JSON: { updated: string, total: number, 
       players: [{name, team, teamFlag, club, injury, severity, marketImpact, bettingAngle}] }`
    : `Eres analista de bajas e impacto para la Copa Mundial FIFA 2026.
       Responde SOLO con JSON válido: { updated: string, total: number,
       players: [{name, team, teamFlag, club, injury, severity, marketImpact, bettingAngle}] }`;

  const user = lang === 'en'
    ? `List the confirmed player absences for the 2026 FIFA World Cup (June 2026). 
       For each player include the injury, severity (critical/high/medium), 
       and specific betting market impact.`
    : `Lista las bajas confirmadas para la Copa Mundial 2026 (junio 2026).
       Para cada jugador incluye la lesión, severidad (critical/high/medium) 
       e impacto concreto en mercados de apuestas.`;

  return await callClaude(system, user);
}

// ── MAIN HANDLER ───────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const params = event.queryStringParameters || {};
  const action = params.action || '';
  const lang   = params.lang   || 'es';

  try {
    let result;

    switch (action) {

      // ── FREE endpoints (no auth needed) ──
      case 'fixtures':
        result = await getFixtures();
        break;

      case 'groups':
        result = await getGroups();
        break;

      case 'weather':
        result = await getWeather(params.venue);
        break;

      // ── Premium endpoints (Claude) ──
      case 'analyze':
        if (!params.home || !params.away) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'home and away required' }) };
        }
        result = await getMatchAnalysis(params.home, params.away, lang);
        break;

      case 'injuries':
        result = await getInjuriesAnalysis(lang);
        break;

      default:
        return {
          statusCode: 400, headers,
          body: JSON.stringify({ error: `Unknown action: "${action}". Valid: fixtures, groups, weather, analyze, injuries` }),
        };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result),
    };

  } catch (err) {
    console.error(`[api.js] action=${action} error:`, err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
