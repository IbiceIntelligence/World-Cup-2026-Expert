const ANTHROPIC_API_KEY = process.env.ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY;
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
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
  const data = await res.json();
  const text = data.content?.[0]?.text || '{}';
  // Strip markdown fences and find JSON object
  let clean = text.replace(/```json\n?|```/g, '').trim();
  // If Claude added text before/after JSON, extract just the JSON object
  const jsonStart = clean.indexOf('{');
  const jsonEnd = clean.lastIndexOf('}');
  if (jsonStart >= 0 && jsonEnd >= 0) {
    clean = clean.slice(jsonStart, jsonEnd + 1);
  }
  try {
    return JSON.parse(clean);
  } catch(e) {
    // Return partial result rather than throwing
    return { error: 'parse_error', raw: clean.slice(0, 200) };
  }
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
// Source: Apify actors — trovevault + kindly_bolt
// ── FIXTURES — Official WC2026 schedule as primary, Apify async as enhancement
// The official schedule is always available instantly. Apify runs async separately.
let OFFICIAL_MATCHES = [
    // ── JUN 11 ──
    { id:'m01', home:{name:'Mexico'},       away:{name:'South Africa'},          date:'06/11/2026 15:00', group:'A', status:'finished', homeScore:2, awayScore:0 },
    { id:'m02', home:{name:'South Korea'},  away:{name:'Czech Republic'},        date:'06/11/2026 22:00', group:'A', status:'finished', homeScore:2, awayScore:1 },
    // ── JUN 12 ──
    { id:'m03', home:{name:'Canada'},       away:{name:'Bosnia and Herzegovina'},date:'06/12/2026 15:00', group:'B', status:'finished', homeScore:1, awayScore:1 },
    { id:'m04', home:{name:'United States'},away:{name:'Paraguay'},              date:'06/12/2026 21:00', group:'D', status:'finished', homeScore:4, awayScore:1 },
    // ── JUN 13 ──
    { id:'m05', home:{name:'Qatar'},        away:{name:'Switzerland'},           date:'06/13/2026 15:00', group:'B', status:'finished', homeScore:1, awayScore:1 },
    { id:'m06', home:{name:'Brazil'},       away:{name:'Morocco'},               date:'06/13/2026 18:00', group:'C', status:'finished', homeScore:1, awayScore:1 },
    { id:'m07', home:{name:'Haiti'},        away:{name:'Scotland'},              date:'06/13/2026 21:00', group:'C', status:'finished', homeScore:0, awayScore:1 },
    // ── JUN 14 ──
    { id:'m08', home:{name:'Australia'},    away:{name:'Turkey'},                date:'06/14/2026 00:00', group:'D', status:'finished', homeScore:2, awayScore:0 },
    { id:'m09', home:{name:'Germany'},      away:{name:'Curaçao'},               date:'06/14/2026 13:00', group:'E', status:'finished', homeScore:7, awayScore:1 },
    { id:'m10', home:{name:'Netherlands'}, away:{name:'Japan'},                  date:'06/14/2026 16:00', group:'F', status:'finished', homeScore:2, awayScore:2 },
    { id:'m11', home:{name:'Ivory Coast'}, away:{name:'Ecuador'},                date:'06/14/2026 19:00', group:'E', status:'scheduled', homeScore:null, awayScore:null },
    { id:'m12', home:{name:'Sweden'},       away:{name:'Tunisia'},               date:'06/14/2026 22:00', group:'F', status:'scheduled', homeScore:null, awayScore:null },
    // ── JUN 15 ──
    { id:'m13', home:{name:'Spain'},        away:{name:'Cape Verde'},            date:'06/15/2026 12:00', group:'H', status:'scheduled', homeScore:null, awayScore:null },
    { id:'m14', home:{name:'Belgium'},      away:{name:'Egypt'},                 date:'06/15/2026 15:00', group:'G', status:'scheduled', homeScore:null, awayScore:null },
    { id:'m15', home:{name:'Saudi Arabia'},away:{name:'Uruguay'},                date:'06/15/2026 18:00', group:'H', status:'scheduled', homeScore:null, awayScore:null },
    { id:'m16', home:{name:'Iran'},         away:{name:'New Zealand'},           date:'06/15/2026 21:00', group:'G', status:'scheduled', homeScore:null, awayScore:null },
    // ── JUN 16 ──
    { id:'m17', home:{name:'France'},       away:{name:'Senegal'},               date:'06/16/2026 15:00', group:'I', status:'scheduled', homeScore:null, awayScore:null },
    { id:'m18', home:{name:'Iraq'},         away:{name:'Norway'},                date:'06/16/2026 18:00', group:'I', status:'scheduled', homeScore:null, awayScore:null },
    { id:'m19', home:{name:'Argentina'},    away:{name:'Algeria'},               date:'06/16/2026 21:00', group:'J', status:'scheduled', homeScore:null, awayScore:null },
    // ── JUN 17 ──
    { id:'m20', home:{name:'Austria'},      away:{name:'Jordan'},                date:'06/17/2026 00:00', group:'J', status:'scheduled', homeScore:null, awayScore:null },
    { id:'m21', home:{name:'Portugal'},     away:{name:'Democratic Republic of the Congo'}, date:'06/17/2026 13:00', group:'K', status:'scheduled', homeScore:null, awayScore:null },
    { id:'m22', home:{name:'England'},      away:{name:'Croatia'},               date:'06/17/2026 16:00', group:'L', status:'scheduled', homeScore:null, awayScore:null },
    { id:'m23', home:{name:'Ghana'},        away:{name:'Panama'},                date:'06/17/2026 19:00', group:'L', status:'scheduled', homeScore:null, awayScore:null },
    { id:'m24', home:{name:'Uzbekistan'},   away:{name:'Colombia'},              date:'06/17/2026 22:00', group:'K', status:'scheduled', homeScore:null, awayScore:null },
    // ── JUN 18 ──
    { id:'m25', home:{name:'Czech Republic'},away:{name:'South Africa'},         date:'06/18/2026 12:00', group:'A', status:'scheduled', homeScore:null, awayScore:null },
    { id:'m26', home:{name:'Switzerland'}, away:{name:'Bosnia and Herzegovina'}, date:'06/18/2026 15:00', group:'B', status:'scheduled', homeScore:null, awayScore:null },
    { id:'m27', home:{name:'Canada'},       away:{name:'Qatar'},                 date:'06/18/2026 18:00', group:'B', status:'scheduled', homeScore:null, awayScore:null },
    { id:'m28', home:{name:'Mexico'},       away:{name:'South Korea'},           date:'06/18/2026 22:00', group:'A', status:'scheduled', homeScore:null, awayScore:null },
    // ── JUN 19 ──
    { id:'m29', home:{name:'United States'},away:{name:'Australia'},             date:'06/19/2026 15:00', group:'D', status:'scheduled', homeScore:null, awayScore:null },
    { id:'m30', home:{name:'Scotland'},     away:{name:'Morocco'},               date:'06/19/2026 18:00', group:'C', status:'scheduled', homeScore:null, awayScore:null },
    { id:'m31', home:{name:'Brazil'},       away:{name:'Haiti'},                 date:'06/19/2026 21:00', group:'C', status:'scheduled', homeScore:null, awayScore:null },
    // ── JUN 20 ──
    { id:'m32', home:{name:'Turkey'},       away:{name:'Paraguay'},              date:'06/20/2026 00:00', group:'D', status:'scheduled', homeScore:null, awayScore:null },
    { id:'m33', home:{name:'Netherlands'}, away:{name:'Sweden'},                 date:'06/20/2026 13:00', group:'F', status:'scheduled', homeScore:null, awayScore:null },
    { id:'m34', home:{name:'Germany'},      away:{name:'Ivory Coast'},           date:'06/20/2026 16:00', group:'E', status:'scheduled', homeScore:null, awayScore:null },
    { id:'m35', home:{name:'Ecuador'},      away:{name:'Curaçao'},               date:'06/20/2026 20:00', group:'E', status:'scheduled', homeScore:null, awayScore:null },
    // ── JUN 21 ──
    { id:'m36', home:{name:'Tunisia'},      away:{name:'Japan'},                 date:'06/21/2026 00:00', group:'F', status:'scheduled', homeScore:null, awayScore:null },
    { id:'m37', home:{name:'Spain'},        away:{name:'Saudi Arabia'},          date:'06/21/2026 12:00', group:'H', status:'scheduled', homeScore:null, awayScore:null },
    { id:'m38', home:{name:'Belgium'},      away:{name:'Iran'},                  date:'06/21/2026 15:00', group:'G', status:'scheduled', homeScore:null, awayScore:null },
    { id:'m39', home:{name:'Uruguay'},      away:{name:'Cape Verde'},            date:'06/21/2026 18:00', group:'H', status:'scheduled', homeScore:null, awayScore:null },
    { id:'m40', home:{name:'New Zealand'}, away:{name:'Egypt'},                  date:'06/21/2026 21:00', group:'G', status:'scheduled', homeScore:null, awayScore:null },
  
  ]

async function getFixtures() {

  // Try to get live scores from Apify asynchronously (non-blocking)
  // If Apify has live data, merge scores into our schedule
  try {
    if (APIFY_API_TOKEN) {
      const liveData = await Promise.race([
        runApifyActor('trovevault/world-cup-results-tables', {
          year: '2026', stage: 'group', includeMatches: true,
          includeGroupTables: false, maxMatches: 104,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
      ]);

      if (Array.isArray(liveData) && liveData.length > 0) {
        // Merge live scores into official schedule
        liveData.forEach(live => {
          const homeName = live.homeTeam || live.home_team || live.team_home || '';
          const awayName = live.awayTeam || live.away_team || live.team_away || '';
          const match = OFFICIAL_MATCHES.find(m =>
            m.home.name === homeName && m.away.name === awayName
          );
          if (match) {
            const hs = live.homeScore ?? live.home_score ?? live.score_home ?? null;
            const as = live.awayScore ?? live.away_score ?? live.score_away ?? null;
            if (hs !== null) match.homeScore = parseInt(hs);
            if (as !== null) match.awayScore = parseInt(as);
            const isFinished = live.status === 'finished' || live.finished === true;
            const isLive = live.status === 'live' || live.live === true;
            if (isFinished) match.status = 'finished';
            else if (isLive) { match.status = 'live'; match.minute = live.minute || live.elapsed || null; }
          }
        });
      }
    }
  } catch(e1) {
    // trovevault failed — try kindly_bolt as fallback
    try {
      if (APIFY_API_TOKEN) {
        const items2 = await Promise.race([
          runApifyActor('kindly_bolt/wc2026-actors', { include_results: true, language: 'en' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
        ]);
        if (Array.isArray(items2) && items2.length > 0) {
          items2.forEach(live => {
            const homeName = live.team_home || live.homeTeam || '';
            const awayName = live.team_away || live.awayTeam || '';
            const match = OFFICIAL_MATCHES.find(m => m.home.name === homeName && m.away.name === awayName);
            if (match && (live.status === 'finished' || live.status === 'live')) {
              const hs = live.score_home ?? live.homeScore ?? null;
              const as = live.score_away ?? live.awayScore ?? null;
              if (hs !== null) match.homeScore = parseInt(hs);
              if (as !== null) match.awayScore = parseInt(as);
              match.status = live.status;
              if (live.status === 'live') match.minute = live.minute || null;
            }
          });
        }
      }
    } catch(e2) {
      // Both Apify actors failed — use official schedule
    }

  }
  return { ok: true, matches: OFFICIAL_MATCHES };
}

// ── GROUPS — calculated from official match schedule ─────────────────────
async function getGroups() {
  try {
    // Base table — all 48 teams in their groups (0 stats until they play)
    const BASE_GROUPS = {
      A: ['Mexico','South Korea','Czech Republic','South Africa'],
      B: ['Canada','Switzerland','Qatar','Bosnia and Herzegovina'],
      C: ['Brazil','Scotland','Morocco','Haiti'],
      D: ['United States','Australia','Turkey','Paraguay'],
      E: ['Germany','Ivory Coast','Ecuador','Curaçao'],
      F: ['Netherlands','Japan','Sweden','Tunisia'],
      G: ['Belgium','Iran','New Zealand','Egypt'],
      H: ['Spain','Uruguay','Saudi Arabia','Cape Verde'],
      I: ['France','Norway','Senegal','Iraq'],
      J: ['Argentina','Austria','Algeria','Jordan'],
      K: ['Portugal','Colombia','Uzbekistan','Democratic Republic of the Congo'],
      L: ['England','Croatia','Ghana','Panama'],
    };

    // Init all teams with 0 stats
    const groupMap = {};
    Object.entries(BASE_GROUPS).forEach(([g, teams]) => {
      groupMap[g] = {};
      teams.forEach(name => {
        groupMap[g][name] = { name, played:0, won:0, drawn:0, lost:0, gf:0, ga:0, gd:0, points:0 };
      });
    });

    // Apply results from fixtures
    const fixturesResult = await getFixtures();
    const matches = fixturesResult.matches || [];
    matches.forEach(m => {
      if (!m.group) return;
      const g = m.group.toUpperCase();
      if (!groupMap[g]) return;
      const home = m.home.name;
      const away = m.away.name;
      // Init if team not in base (shouldn't happen but safety)
      if (!groupMap[g][home]) groupMap[g][home] = { name:home, played:0, won:0, drawn:0, lost:0, gf:0, ga:0, gd:0, points:0 };
      if (!groupMap[g][away]) groupMap[g][away] = { name:away, played:0, won:0, drawn:0, lost:0, gf:0, ga:0, gd:0, points:0 };

      if (m.status === 'finished' || m.status === 'live') {
        const hs = parseInt(m.homeScore) || 0;
        const as = parseInt(m.awayScore) || 0;
        groupMap[g][home].played++; groupMap[g][home].gf += hs; groupMap[g][home].ga += as; groupMap[g][home].gd += (hs-as);
        groupMap[g][away].played++; groupMap[g][away].gf += as; groupMap[g][away].ga += hs; groupMap[g][away].gd += (as-hs);
        if (hs > as)       { groupMap[g][home].won++;   groupMap[g][home].points += 3; groupMap[g][away].lost++; }
        else if (hs < as)  { groupMap[g][away].won++;   groupMap[g][away].points += 3; groupMap[g][home].lost++; }
        else               { groupMap[g][home].drawn++; groupMap[g][home].points += 1; groupMap[g][away].drawn++; groupMap[g][away].points += 1; }
      }
    });

    const groups = Object.entries(groupMap)
      .map(([name, teamsObj]) => ({
        name,
        teams: Object.values(teamsObj).sort((a,b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf),
      }))
      .sort((a,b) => a.name.localeCompare(b.name));

    return { ok: true, groups };
  } catch(e) {
    return { ok: false, error: e.message, groups: [] };
  }
}

// ── APIFY ACTOR RUNNER (async helper for live score enrichment) ───────────
async function runApifyActor(actorId, inputData) {
  if (!APIFY_API_TOKEN) throw new Error('No token');
  const runRes = await fetchJSON(
    `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/runs?token=${APIFY_API_TOKEN}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inputData) }
  );
  const runId = runRes?.data?.id;
  if (!runId) throw new Error('No run ID');
  // Poll max 3 times (9 seconds)
  for (let i = 0; i < 3; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const st = await fetchJSON(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_TOKEN}`);
    if (st?.data?.status === 'SUCCEEDED') {
      const items = await fetchJSON(`https://api.apify.com/v2/datasets/${st.data.defaultDatasetId}/items?token=${APIFY_API_TOKEN}&limit=200`);
      return Array.isArray(items) ? items : [];
    }
    if (['FAILED','ABORTED','TIMED-OUT'].includes(st?.data?.status)) throw new Error('Actor failed');
  }
  throw new Error('timeout');
}


// ── ACTION: MATCH ANALYSIS — worldcup-betting-expert skill ───────────────
async function getMatchAnalysis(home, away, lang = 'es') {
  const isES = lang !== 'en';

  // ── Build context from our live data ─────────────────────────────────────
  // 1. Find the match in OFFICIAL_MATCHES
  const match = OFFICIAL_MATCHES.find(m =>
    m.home.name === home && m.away.name === away
  );

  // 2. Build group standings context
  const groupLetter = match?.group || '';
  const groupTeams = groupLetter ? Object.entries({
    A: ['Mexico','South Korea','Czech Republic','South Africa'],
    B: ['Canada','Switzerland','Qatar','Bosnia and Herzegovina'],
    C: ['Brazil','Scotland','Morocco','Haiti'],
    D: ['United States','Australia','Turkey','Paraguay'],
    E: ['Germany','Ivory Coast','Ecuador','Curaçao'],
    F: ['Netherlands','Japan','Sweden','Tunisia'],
    G: ['Belgium','Iran','New Zealand','Egypt'],
    H: ['Spain','Uruguay','Saudi Arabia','Cape Verde'],
    I: ['France','Norway','Senegal','Iraq'],
    J: ['Argentina','Austria','Algeria','Jordan'],
    K: ['Portugal','Colombia','Uzbekistan','Democratic Republic of the Congo'],
    L: ['England','Croatia','Ghana','Panama'],
  }[groupLetter] || []) : [];

  // 3. Calculate current group standings from OFFICIAL_MATCHES
  const groupStandings = {};
  groupTeams.forEach(t => { groupStandings[t] = {p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0}; });
  OFFICIAL_MATCHES.filter(m => m.group === groupLetter && (m.status==='finished'||m.status==='live'))
    .forEach(m => {
      const hs = parseInt(m.homeScore)||0, as = parseInt(m.awayScore)||0;
      if (groupStandings[m.home.name]) {
        groupStandings[m.home.name].p++;
        groupStandings[m.home.name].gf += hs;
        groupStandings[m.home.name].ga += as;
        if (hs>as) { groupStandings[m.home.name].w++; groupStandings[m.home.name].pts+=3; }
        else if (hs===as) { groupStandings[m.home.name].d++; groupStandings[m.home.name].pts+=1; }
        else groupStandings[m.home.name].l++;
      }
      if (groupStandings[m.away.name]) {
        groupStandings[m.away.name].p++;
        groupStandings[m.away.name].gf += as;
        groupStandings[m.away.name].ga += hs;
        if (as>hs) { groupStandings[m.away.name].w++; groupStandings[m.away.name].pts+=3; }
        else if (as===hs) { groupStandings[m.away.name].d++; groupStandings[m.away.name].pts+=1; }
        else groupStandings[m.away.name].l++;
      }
    });

  const standingsStr = Object.entries(groupStandings)
    .sort((a,b) => b[1].pts - a[1].pts)
    .map(([t,s]) => `${t}: ${s.pts}pts ${s.p}PJ ${s.w}W ${s.d}D ${s.l}L ${s.gf}-${s.ga}`)
    .join(' | ');

  // 4. Odds context — Claude uses its own knowledge of WC2026 odds
  // (Apify odds actors run async separately to avoid timeout)
  const oddsContext = 'Use your knowledge of current WC2026 market odds for this match. Apply implied probability calculation.';

  // 5. Match context string
  const matchStatus = match ? `${match.status}${match.status==='live' ? ' ('+match.minute+"')" : ''}` : 'scheduled';
  const scoreCtx = (match?.status==='finished'||match?.status==='live')
    ? `Current score: ${match.homeScore}-${match.awayScore}` : 'Not started';
  const venue = match?.venue || 'World Cup 2026 venue';
  const stage = `Group ${groupLetter} — FIFA World Cup 2026`;

  // ── System prompt with full skill framework ───────────────────────────────
  const system = isES
    ? `Eres el worldcup-betting-expert de IBICE Intelligence para FIFA World Cup 2026.

FRAMEWORK ANÁLISIS (worldcup-betting-expert skill):
1. VALUE BET: Prob implícita = 1/cuota decimal. Edge = Tu prob − Prob implícita. 💎 si Edge +5%+
2. MODELO xG: Usa promedios de clasificación. Compara con línea Over/Under del mercado.
3. H2H Y FORMA: Últimos 5 H2H + últimos 5 partidos cada equipo. Presión fase de grupos.
4. HÁNDICAP ASIÁTICO: Si el favorito domina en xG, evalúa si justifica el hándicap.
5. MOVIMIENTO DE LÍNEA: Cuotas bajando = dinero sharp. Steam tardío = señal más confiable. 🔥
6. CROWD WISDOM: Probabilidades implícitas del mercado como referencia.

RESPONDE SOLO JSON VÁLIDO — sin markdown, sin texto extra:
{"summary":"⚡ Pick Rápido: [la mejor apuesta en 1 línea]. [1 oración de análisis]. ⚠️ Solo fines informativos.","picks":[{"market":"string","recommendation":"string 💎 o 🔥 si aplica","odds":"decimal","odds_american":"string","ev":número,"confidence":número}],"keyFactors":["factor con dato concreto x3"],"xgAnalysis":"xG estimado ambos equipos y comparación con línea O/U","lineMovement":"señal sharp money o N/A","prediction":{"score":"X-Y","note":"razón en 1 oración"}}`
    : `You are the worldcup-betting-expert for IBICE Intelligence, FIFA World Cup 2026.

ANALYSIS FRAMEWORK (worldcup-betting-expert skill):
1. VALUE BET: Implied prob = 1/decimal odds. Edge = Your prob − Implied prob. 💎 if Edge +5%+
2. xG MODEL: Use qualifying campaign averages. Compare to bookmaker Over/Under line.
3. H2H & FORM: Last 5 H2H + last 5 each team. Group stage tournament pressure.
4. ASIAN HANDICAP: If favorite dominates xG, evaluate if handicap line has value.
5. LINE MOVEMENT: Odds shortening fast = sharp money. Late steam = most reliable signal. 🔥
6. CROWD WISDOM: Market-implied probabilities as reference.

REPLY ONLY VALID JSON — no markdown, no extra text:
{"summary":"⚡ Quick Pick: [best bet in 1 line]. [1 sentence analysis]. ⚠️ For informational purposes only.","picks":[{"market":"string","recommendation":"string 💎 or 🔥 if applies","odds":"decimal","odds_american":"string","ev":number,"confidence":number}],"keyFactors":["factor with concrete data x3"],"xgAnalysis":"estimated xG both teams and O/U comparison","lineMovement":"sharp money signal or N/A","prediction":{"score":"X-Y","note":"reason in 1 sentence"}}`;

  const user = isES
    ? `PARTIDO: ${home} vs ${away}
COMPETICIÓN: ${stage}
ESTADO: ${matchStatus} | ${scoreCtx}
SEDE: ${venue}
TABLA GRUPO ${groupLetter}: ${standingsStr}
ODDS EN MERCADO: ${oddsContext}

Genera el análisis completo con picks de valor, xG estimado, señales sharp y predicción de marcador. JSON únicamente.`
    : `MATCH: ${home} vs ${away}
COMPETITION: ${stage}
STATUS: ${matchStatus} | ${scoreCtx}
VENUE: ${venue}
GROUP ${groupLetter} TABLE: ${standingsStr}
MARKET ODDS: ${oddsContext}

Generate full analysis with value picks, estimated xG, sharp signals and score prediction. JSON only.`;

  try {
    const result = await callClaude(system, user);

    // Auto-correct prediction score consistency
    if (result.picks && result.picks.length > 0 && result.prediction?.score) {
      const parts = result.prediction.score.split('-');
      if (parts.length === 2) {
        const topPick = (result.picks[0].recommendation || '').toLowerCase();
        const awayWin = topPick.includes(away.toLowerCase()) || topPick.includes('away') || topPick.includes('visitante');
        if (awayWin && parseInt(parts[0]) > parseInt(parts[1])) {
          result.prediction.score = parts[1] + '-' + parts[0];
        }
      }
    }
    return result;
  } catch(e) {
    return { error: e.message };
  }
}


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

// ── ACTION: WORLD CUP NEWS ────────────────────────────────────────────────────
// ── Parse RSS feed → articles array ──────────────────────────
async function parseRSS(url, sourceLabel, tagDefault) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error('RSS fetch failed');
    const xml = await res.text();
    clearTimeout(timeout);
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 8) {
      const block = match[1];
      const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                     block.match(/<title>(.*?)<\/title>/))?.[1]?.trim();
      const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/))?.[1]?.trim();
      const url = (block.match(/<link>(.*?)<\/link>/) ||
                   block.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/))?.[1]?.trim();
      // Also grab description for better tag classification
      const desc = ((block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
                     block.match(/<description>(.*?)<\/description>/))?.[1] || '')
                     .replace(/<[^>]+>/g, '').trim().substring(0, 200);
      if (!title || title.length < 5) continue;
      // Combined text for classification
      const fullText = title + ' ' + desc;
      let timeAgo = 'Recently';
      if (pubDate) {
        const diff = Math.floor((Date.now() - new Date(pubDate).getTime()) / 60000);
        if (diff < 60) timeAgo = diff + ' min ago';
        else if (diff < 1440) timeAgo = Math.floor(diff/60) + ' hours ago';
        else timeAgo = Math.floor(diff/1440) + ' days ago';
      }
      // Classify tag — bilingual ES+EN keywords
      let tag = 'PREVIEW';
      const t = (fullText || title).toLowerCase();

      // INJURY — physical injuries only
      if (/injur|ruled out|out for|misses|sidelined|won.t feature|fitness concern|lesion|sin jugar por lesion|descartado por lesion|se pierde por|acl|ligamento|rotura|desgarro|esguince|fractura|operado|cirugia|muscular|tobillo|rodilla|hamstring/.test(t))
        tag = 'INJURY';

      // BAJA — absences: visa denied, suspension, ban, expulsion (not injury)
      else if (/denied entry|neg.* la visa|visa negada|no pudo viajar|le neg.*visa|sin visa|visa denegada|suspendido|sancionado|expulsado|banned|suspension|sanction|expelled|red card suspension|cumple sancion|baja por sancion|descartado por sancion|veto|inhabilitado/.test(t))
        tag = 'BAJA';

      // RESULT — match results, scores
      else if (/beats |beat |defeat|wins |won |victory|equalis|equaliz|thrash|clinch|gana |gano |vencio|derrota|empat|logra|logro|consigue|primer punto|primer gol|debut con|estrena con|[0-9]-[0-9]|[0-9] a [0-9]|saca la casta|avanza|clasifica/.test(t))
        tag = 'RESULT';

      // ODDS — betting markets
      else if (/odds|betting|favorite|favourite|wager| bet |moneyline|cuotas|apuesta|favorito|cotiza|momio|casas de apuesta|apuestas deportivas/.test(t))
        tag = 'ODDS';

      // LINEUP — team selections
      else if (/lineup|line-up|starting xi|starting eleven|squad named|confirmed team|alineaci|convocatoria|once inicial|titulares|jugara de inicio|lista de convocados|once confirmado/.test(t))
        tag = 'LINEUP';

      // ADMIN — FIFA decisions, rules, controversies, VAR, format changes
      else if (/fifa decision|var |regla|nueva regla|formato|sede|estadio|escandalo|polemica|polemic|controversy|banned stadium|relocat|cambio de sede|sancion fifa|cas |tribunal|arbitraje administrativo|hidratacion|pausa|expansion|48 equipos/.test(t))
        tag = 'ADMIN';
      items.push({ title, tag, source: sourceLabel, timeAgo, url: url || null });
    }
    return items;
  } catch(e) {
    clearTimeout(timeout);
    return [];
  }
}


// ── WEATHER — Open-Meteo (free, no key) ──────────────────────────────────
async function getWeather(venue) {
  const key = (venue || 'dallas').toLowerCase().replace(/[^a-z]/g,'');
  const coord = VENUE_COORDS[key] || VENUE_COORDS['dallas'];
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coord.lat}&longitude=${coord.lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=celsius&wind_speed_unit=kmh&timezone=auto&forecast_days=3`;
    const data = await fetchJSON(url);
    const c = data.current;
    const d = data.daily;
    const alerts = [];
    if (c.temperature_2m >= 35) alerts.push({ type:'hot',   es:'⚠ Calor extremo — favorece Under', en:'⚠ Extreme heat — favors Under' });
    if (c.relative_humidity_2m >= 75) alerts.push({ type:'humid', es:'💧 Humedad alta — ritmo lento', en:'💧 High humidity — slower pace' });
    if (c.wind_speed_10m >= 20) alerts.push({ type:'wind',  es:'💨 Viento alto — afecta centros', en:'💨 High wind — affects crosses' });
    if ((d.precipitation_probability_max?.[0]||0) >= 60) alerts.push({ type:'rain', es:'🌧 Lluvia probable', en:'🌧 Rain likely' });
    if (!alerts.length) alerts.push({ type:'ok', es:'✓ Condiciones óptimas', en:'✓ Optimal conditions' });
    return {
      ok: true, venue: coord.name,
      current: { tempC: Math.round(c.temperature_2m), tempF: Math.round(c.temperature_2m*9/5+32), humidity: c.relative_humidity_2m, windKmh: Math.round(c.wind_speed_10m) },
      forecast: (d.temperature_2m_max||[]).slice(0,3).map((max,i) => ({ tempMaxC:Math.round(max), tempMinC:Math.round(d.temperature_2m_min[i]), rainPct:d.precipitation_probability_max[i] })),
      alerts,
    };
  } catch(e) { return { ok:false, error:e.message }; }
}

async function getWorldCupNews(lang) {
  const articles = [];
  const isES = lang === 'es';

  // STRICT language separation — no mixing
  const RSS_EN = [
    { url: 'https://www.espn.com/espn/rss/soccer/news',       source: 'ESPN FC'     },
    { url: 'https://feeds.bbci.co.uk/sport/football/rss.xml', source: 'BBC Sport'   },
    { url: 'https://www.skysports.com/rss/12040',              source: 'Sky Sports'  },
    { url: 'https://www.goal.com/feeds/en/news',               source: 'Goal.com'    },
  ];

  const RSS_ES = [
    // ESPN Deportes — fútbol en español, cobertura del Mundial
    { url: 'https://espndeportes.espn.com/espndeportes/rss/futbol/news',                   source: 'ESPN Deportes' },
    // AS.com — diario deportivo español, sección fútbol internacional
    { url: 'https://feeds.as.com/mrss-s/pages/as/site/as.com/section/futbol/subsection/internacional/', source: 'AS.com' },
    // Marca — fútbol internacional
    { url: 'https://e00-marca.uecdn.es/rss/futbol/futbol-internacional.xml',               source: 'Marca'         },
    // Récord México — cobertura del Mundial desde México
    { url: 'https://www.record.com.mx/rss/futbol-internacional.xml',                       source: 'Récord'        },
    // Olé Argentina — fútbol internacional desde Argentina
    { url: 'https://www.ole.com.ar/rss/futbol-internacional.xml',                          source: 'Olé'           },
    // FutbolRed Colombia — fútbol internacional
    { url: 'https://www.futbolred.com/rss/futbol-internacional.xml',                       source: 'FutbolRed'     },
    // TyC Sports Argentina — RSS general deportes
    { url: 'https://www.tycsports.com/rss/',                                               source: 'TyC Sports'    },
    // El Tiempo Colombia — deportes
    { url: 'https://www.eltiempo.com/rss/deportes_futbol-internacional.xml',               source: 'El Tiempo'     },
  ];

  const sources = isES ? RSS_ES : RSS_EN;

  const results = await Promise.allSettled(
    sources.map(s => parseRSS(s.url, s.source, 'PREVIEW'))
  );

  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value.length) {
      articles.push(...r.value);
    }
  });

  // Deduplicate
  const seen = new Set();
  const unique = articles.filter(a => {
    const key = a.title.slice(0, 50).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // WC articles first, then other football — for ES only show football/soccer topics
  const wcFirst = unique.filter(a =>
    /world cup|mundial|fifa|wc2026|2026|copa del mundo|copa mundial/i.test(a.title)
  );
  const footballOther = unique.filter(a =>
    !/world cup|mundial|fifa|wc2026|2026|copa del mundo|copa mundial/i.test(a.title)
  );

  const final = [...wcFirst, ...footballOther].slice(0, 8);

  if (final.length > 0) {
    return { ok: true, source: 'rss', articles: final };
  }

  return { ok: false, source: 'none', articles: [], error: 'All RSS sources unavailable.' };
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

      case 'news':
        result = await getWorldCupNews(lang);
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
