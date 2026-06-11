# ⚽ IBICE World Cup Intelligence 2026

> **Infraestructura compleja. Decisiones claras.** / **Complex infrastructure. Clear decisions.**

Plataforma de predicciones y análisis de apuestas para la Copa Mundial FIFA 2026, impulsada por inteligencia artificial aplicada y datos en tiempo real de 40+ casas de apuestas.

---

## Stack Técnico

- `index.html` — Frontend completo (single file, zero build step)
- `netlify/functions/api.js` — Proxy serverless (evita CORS, maneja Apify + Claude)
- `netlify.toml` — Configuración de Netlify
- APIs: Anthropic Claude Sonnet + Apify Actors

---

## Despliegue en Netlify

### 1. Subir a GitHub

```bash
git init
git add .
git commit -m "feat: IBICE World Cup Intelligence 2026"
git remote add origin https://github.com/TU_USER/ibice-worldcup.git
git push -u origin main
```

### 2. Conectar con Netlify

1. Ir a [netlify.com](https://netlify.com) → "Add new site" → "Import an existing project"
2. Seleccionar el repo de GitHub
3. Build settings:
   - **Build command:** *(dejar vacío)*
   - **Publish directory:** `.`
4. Click **"Deploy site"**

### 3. Variables de Entorno (OBLIGATORIO)

En Netlify → Site configuration → Environment variables:

| Variable | Descripción | Dónde obtener |
|----------|-------------|----------------|
| `ANTHROPIC_KEY` | API key de Anthropic | [console.anthropic.com](https://console.anthropic.com) |
| `APIFY_TOKEN` | Token de Apify | [console.apify.com](https://console.apify.com) → Settings → API |
| `FOOTBALL_DATA_TOKEN` | Opcional — football-data.org | [football-data.org](https://www.football-data.org) (free) |

> **Nota:** Si no hay `APIFY_TOKEN`, la app usa el fallback de OpenFootball (datos estáticos). El análisis AI funciona siempre que haya `ANTHROPIC_KEY`.

---

## Actores de Apify Utilizados

| Actor | Propósito | Tier |
|-------|-----------|------|
| `trovevault/world-cup-results-tables` | Fixtures y resultados WC2026 | Gratuito |
| `scrapemint/sports-odds-scraper` | Odds multi-book (DraftKings, Pinnacle, FanDuel) | Gratuito |
| `crawlerbros/espn-news` | Noticias e informes de lesiones | Gratuito |
| `george.the.developer/google-news-monitor` | Breaking news Copa Mundial | Gratuito |
| `kindly_bolt/wc2026-actors` | Estructura completa del torneo | Gratuito |

---

## Funcionalidades

- **Toggle idioma ES/EN** — bilingual completo
- **Toggle modo oscuro/claro** — con etiqueta de texto visible
- **Ticker animado** — datos en vivo en la parte superior
- **Partidos del día** — con odds en tiempo real y formulario de equipos
- **Análisis AI** — escenarios Bear/Base/Bull para cada partido
- **Top Picks** — con valor esperado y clasificación de confianza
- **Tabla de grupos** — actualizada con resultados en vivo
- **Noticias** — del día de la Copa Mundial
- **Mi Pronóstico** (FAB) — portafolio personal guardado en localStorage
- **Compartir en WhatsApp** — aparece después de generar el reporte
- **Estados shimmer** — sin texto "Cargando...", skeletons elegantes
- **Fallbacks** — la app funciona aunque falle Apify

---

## Estructura de Archivos

```
ibice-worldcup/
├── index.html                    # Frontend completo
├── netlify/
│   └── functions/
│       └── api.js                # Proxy serverless
├── netlify.toml                  # Configuración Netlify
└── README.md
```

---

## Modelo Claude

El análisis usa `claude-sonnet-4-5` con el sistema de prompts del **worldcup-betting-expert skill**:
- Bear / Base / Bull scenarios
- Value bet detection con Edge = Probabilidad propia − Probabilidad implícita
- Modelos xG con datos de partidos de clasificación
- Señales de movimiento de línea (sharp money)
- Handicap asiático para matchups desequilibrados

---

## Disclaimer

Las apuestas deportivas implican riesgo financiero. Este análisis es únicamente para fines informativos y de entretenimiento. No constituye asesoría financiera. Apuesta de manera responsable y solo lo que puedas permitirte perder. Verifica las leyes locales. +18.

---

**IBICE Group** · Infraestructura compleja. Decisiones claras.  
[ibicegroup.com](https://ibicegroup.com)
