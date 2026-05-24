/**
 * Mock data for the 9 FM (Força Municipal) areas of CompStat Rio.
 *
 * Coordinates, polygons, factor lists and RELINT excerpts were chosen to be
 * representative of the real source CSVs / RELINTs in /dados and /relints,
 * but no field reflects an actual record — this is mocked data for the UI prototype.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seeded pseudo-random so the mock heat clouds stay stable across renders. */
function seededRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967295
  }
}

/** Generate `n` crime points around [lat, lng] with realistic clustering. */
function generateCrimePoints(seed, lat, lng, n, spread = 0.006) {
  const rand = seededRandom(seed)
  const pts = []
  // 3 clusters per area to create hotspots
  const clusters = [
    [lat + (rand() - 0.5) * spread * 1.4, lng + (rand() - 0.5) * spread * 1.4],
    [lat + (rand() - 0.5) * spread * 1.4, lng + (rand() - 0.5) * spread * 1.4],
    [lat + (rand() - 0.5) * spread * 1.4, lng + (rand() - 0.5) * spread * 1.4],
  ]
  for (let i = 0; i < n; i++) {
    const c = clusters[i % 3]
    // Gaussian-ish noise via box-muller approximation
    const u = rand(), v = rand()
    const g1 = Math.sqrt(-2 * Math.log(u || 0.0001)) * Math.cos(2 * Math.PI * v)
    const g2 = Math.sqrt(-2 * Math.log(u || 0.0001)) * Math.sin(2 * Math.PI * v)
    pts.push([
      c[0] + g1 * spread * 0.35,
      c[1] + g2 * spread * 0.35,
      0.4 + rand() * 0.6, // intensity 0.4–1.0
    ])
  }
  return pts
}

function generatePoints(seed, lat, lng, n, spread = 0.005) {
  const rand = seededRandom(seed)
  return Array.from({ length: n }, () => [
    lat + (rand() - 0.5) * spread,
    lng + (rand() - 0.5) * spread,
  ])
}

/**
 * Build temporal distributions with a configurable peak window.
 * peakStart / peakEnd are inclusive hours; peakDays is a Set of day indices (0=Sun).
 */
function buildTemporal(seed, peakHours, peakDays, baseOcc) {
  const rand = seededRandom(seed)
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const byDay = days.map((d, i) => ({
    day: d,
    Roubo: Math.round(baseOcc * (peakDays.includes(i) ? 1.5 : 0.7) * (0.8 + rand() * 0.4)),
    Furto: Math.round(baseOcc * 0.6 * (peakDays.includes(i) ? 1.3 : 0.8) * (0.8 + rand() * 0.4)),
  }))
  const byHour = Array.from({ length: 24 }, (_, h) => {
    const inPeak = h >= peakHours[0] && h <= peakHours[1]
    const morning = h >= 7 && h <= 9
    const factor = inPeak ? 2.0 : morning ? 1.2 : (h >= 0 && h <= 5) ? 0.25 : 0.7
    return {
      hour: `${String(h).padStart(2, '0')}h`,
      Roubo: Math.round(baseOcc * 0.4 * factor * (0.85 + rand() * 0.3)),
      Furto: Math.round(baseOcc * 0.25 * factor * (0.85 + rand() * 0.3)),
    }
  })
  return { byDay, byHour }
}

// ---------------------------------------------------------------------------
// Common urban-factor catalog (matches the real factor names in fatores_urbanos.csv)
// ---------------------------------------------------------------------------

const FACTORS = {
  veg_ilum:    { type: 'Vegetação encobrindo iluminação pública',    orgao: 'Comlurb',    category: 'Vegetação urbana' },
  veg_passeio: { type: 'Vegetação obstruindo a visibilidade do passeio', orgao: 'Comlurb', category: 'Vegetação urbana' },
  ilum_ped:    { type: 'Área mal iluminada com circulação de pedestres', orgao: 'RioLuz', category: 'Iluminação' },
  ilum_veic:   { type: 'Área mal iluminada com parada de veículos',  orgao: 'RioLuz',     category: 'Iluminação' },
  retencao:    { type: 'Ponto de retenção do tráfego',               orgao: 'CET-Rio',    category: 'Trânsito' },
  comercio:    { type: 'Comércio irregular obstruindo a visibilidade do passeio', orgao: 'SEOP', category: 'Obstrução' },
  estacion:    { type: 'Estacionamento irregular forçando pedestres à pista', orgao: 'SEOP', category: 'Trânsito' },
  moto:        { type: 'Motocicletas trafegando no passeio',         orgao: 'GM-Rio',     category: 'Trânsito' },
  calc_estr:   { type: 'Calçada estreita forçando pedestres à pista', orgao: 'Seconserva', category: 'Obstrução' },
  mob_aband:   { type: 'Mobiliário abandonado servindo de esconderijo', orgao: 'Seconserva', category: 'Refúgio' },
  vao:         { type: 'Vãos ou cavidades usados como esconderijo',  orgao: 'Seconserva', category: 'Refúgio' },
  psr:         { type: 'Pessoas em situação de rua',                 orgao: 'SMAS',       category: 'PSR' },
  drogas:      { type: 'Cena de uso de drogas',                      orgao: 'SMAS',       category: 'Drogas' },
  onibus:      { type: 'Ponto de ônibus com histórico de vandalismo', orgao: 'SMTR',      category: 'Ponto de ônibus' },
  lixo:        { type: 'Lixo/entulho forçando pedestres à pista',    orgao: 'Comlurb',    category: 'Limpeza' },
}

function makeFactor(key, lat, lng) {
  return { ...FACTORS[key], lat, lng }
}

// ---------------------------------------------------------------------------
// AREAS
// ---------------------------------------------------------------------------

export const AREAS = [
  // -----------------------------------------------------------------------
  // 1. METRÔ BOTAFOGO (rich data — primary demo area)
  // -----------------------------------------------------------------------
  {
    id: 'metro-botafogo',
    name: 'Metrô Botafogo — São Clemente — Voluntários da Pátria',
    shortName: 'Metrô Botafogo / São Clemente',
    aisp: 'AISP 6',
    bairro: 'Botafogo',
    center: [-22.9510, -43.1830],
    zoom: 16,
    polygon: [
      [-22.9485, -43.1862], [-22.9485, -43.1798],
      [-22.9540, -43.1798], [-22.9540, -43.1862],
    ],
    risk: 'critical',
    kpis: {
      ocorrencias_30d: 142,
      ocorrencias_var: 18,
      fatores_urbanos: 28,
      denuncias: 56,
      coincidencias: 4,
    },
    crimePoints: generateCrimePoints(11, -22.9510, -43.1830, 130, 0.005),
    urbanFactors: [
      makeFactor('comercio', -22.9508, -43.1840),
      makeFactor('comercio', -22.9512, -43.1836),
      makeFactor('veg_ilum', -22.9520, -43.1825),
      makeFactor('veg_ilum', -22.9524, -43.1822),
      makeFactor('veg_passeio', -22.9518, -43.1818),
      makeFactor('ilum_ped', -22.9527, -43.1819),
      makeFactor('ilum_ped', -22.9529, -43.1828),
      makeFactor('retencao', -22.9509, -43.1843),
      makeFactor('moto', -22.9515, -43.1838),
      makeFactor('moto', -22.9518, -43.1834),
      makeFactor('calc_estr', -22.9521, -43.1817),
      makeFactor('onibus', -22.9505, -43.1846),
      makeFactor('psr', -22.9532, -43.1830),
      makeFactor('drogas', -22.9533, -43.1828),
    ],
    cameras: generatePoints(12, -22.9510, -43.1830, 8, 0.004),
    temporal: buildTemporal(13, [17, 20], [2, 3, 4], 20),
    peakHours: '17h – 20h',
    peakDays: 'Quarta a Sexta',
    executiveSummary: [
      {
        q: 'O horário de pico de roubos coincide com a QMD atual da FM?',
        a: 'Parcialmente. O pico de roubos a transeunte ocorre entre 17h e 20h (38% do total), concentrado nos acessos ao Metrô Botafogo. A QMD atual prevê cobertura de 06h–18h, deixando descoberta a janela de 18h–22h, que registra 41% das ocorrências.',
        sources: ['Ocorrências', 'QMD FM'],
      },
      {
        q: 'Quais fatores urbanos se sobrepõem à mancha criminal?',
        a: 'Os pontos de maior incidência sobrepõem-se a 14 fatores: comércio irregular (4) e vegetação encobrindo iluminação (3) em São Clemente; calçada estreita e motocicletas no passeio nos acessos do metrô. 9 dos 14 fatores estão em raio de 60m de ocorrências dos últimos 30 dias.',
        sources: ['Ocorrências', 'Fatores Urbanos'],
      },
      {
        q: 'A dinâmica criminal sugere alteração do modelo de emprego?',
        a: 'Sim. RELINT 011/2026 e 24 denúncias do Disque Denúncia convergem para furto/roubo de celular por agentes a pé e em motocicleta, com fuga via Rua Bambina e Botafogo Praia Shopping. Recomenda-se reforço a pé nos acessos do metrô e dupla motorizada para perímetro da Bambina.',
        sources: ['RELINT', 'Disque Denúncia'],
      },
      {
        q: 'Há cobertura de câmeras nos hotspots identificados?',
        a: '2 dos 4 hotspots críticos não estão cobertos pelas 8 câmeras existentes — destaque para a esquina São Clemente × Real Grandeza e o trecho de mobiliário abandonado em Voluntários. Sugerido reposicionamento ou nova instalação.',
        sources: ['Ocorrências', 'Câmeras'],
      },
    ],
    dynamics: {
      modusOperandi: 'Furto e roubo de celular por agentes a pé e em motocicleta. Vítimas abordadas em momentos de distração — uso do aparelho ao sair da catraca, atravessando a Rua Bambina ou aguardando ônibus na Voluntários. Em 22% dos casos há simulação de empurrão para retirada do aparelho.',
      suspectProfile: 'Indivíduos jovens (18–28 anos), atuando sozinhos ou em dupla. Em 31 denúncias do Disque Denúncia foram reportadas duplas em motocicletas pretas/cinzas sem placa visível. Indícios de articulação com receptadores no entorno do Largo dos Leões.',
      escapeRoutes: 'Principais rotas de fuga: (1) Rua Bambina sentido Humaitá; (2) entrada do túnel Engenheiro Marques Porto; (3) Rua Mena Barreto sentido Praia de Botafogo. Acessos de motocicleta saindo do passeio em São Clemente × Real Grandeza.',
      receivingPoints: 'Concentração de denúncias sobre receptação no entorno do comércio do Largo dos Leões e em pontos transitórios nas imediações da estação do metrô. Identificados 3 pontos recorrentes em denúncias dos últimos 90 dias.',
      sources: { relints: 1, denuncias: 56, ocorrencias: 142 },
    },
    coincidences: [
      {
        id: 'COIN-001',
        location: 'Acesso A do Metrô Botafogo (R. São Clemente, 350)',
        crime: '18 roubos a transeunte em 30 dias, 70% com subtração de celular',
        factor: 'Comércio irregular obstruindo a visibilidade do passeio + Calçada estreita forçando pedestres à pista',
        timeWindow: 'Seg–Sex, 17h–20h (saída do expediente)',
        operationalGap: 'QMD atual cessa às 18h; sem câmera no acesso A',
        risk: 92,
      },
      {
        id: 'COIN-002',
        location: 'R. São Clemente × R. Real Grandeza',
        crime: '11 roubos em 30 dias, 4 com uso de motocicleta',
        factor: 'Vegetação encobrindo iluminação + Motocicletas trafegando no passeio',
        timeWindow: 'Qua–Sex, 19h–22h',
        operationalGap: 'Fora do polígono prioritário da QMD; sem cobertura motorizada',
        risk: 87,
      },
      {
        id: 'COIN-003',
        location: 'R. Voluntários da Pátria × R. Mena Barreto',
        crime: '9 roubos em 30 dias, vítimas saindo de bares à noite',
        factor: 'Mobiliário abandonado servindo de esconderijo + Área mal iluminada com circulação de pedestres',
        timeWindow: 'Qui–Sáb, 22h–02h',
        operationalGap: 'Janela noturna sem cobertura FM',
        risk: 81,
      },
      {
        id: 'COIN-004',
        location: 'Largo dos Leões (entorno)',
        crime: '6 ocorrências de furto a transeunte; 12 denúncias de receptação',
        factor: 'Pessoas em situação de rua + Cena de uso de drogas',
        timeWindow: 'Diurno e noturno',
        operationalGap: 'Demanda articulação SMAS + GM-Rio (atualmente desarticulada)',
        risk: 74,
      },
    ],
    actionPlan: [
      { responsible: 'FM', action: 'Estender cobertura a pé no acesso A do Metrô Botafogo até 22h', justification: 'Concentra 41% das ocorrências fora da QMD atual (COIN-001).', priority: 'alta' },
      { responsible: 'FM', action: 'Patrulha motorizada (moto) em São Clemente × Real Grandeza nas Qua–Sex 19h–22h', justification: 'Padrão de fuga em motocicleta identificado em 31 denúncias (COIN-002).', priority: 'alta' },
      { responsible: 'Comlurb', action: 'Poda em 3 pontos da R. São Clemente entre Voluntários e Real Grandeza', justification: 'Vegetação encobrindo 4 postes de iluminação na zona crítica (COIN-002).', priority: 'alta' },
      { responsible: 'RioLuz', action: 'Recuperar 5 luminárias inoperantes em Voluntários × Mena Barreto', justification: 'Janela noturna 22h–02h tem 9 roubos no trecho mal iluminado (COIN-003).', priority: 'alta' },
      { responsible: 'SEOP', action: 'Operação de fiscalização de comércio irregular no entorno do acesso A', justification: 'Comércio irregular reduz visibilidade no hotspot principal (COIN-001).', priority: 'média' },
      { responsible: 'Seconserva', action: 'Remoção de mobiliário abandonado em R. Mena Barreto', justification: 'Mobiliário identificado como esconderijo em 9 ocorrências (COIN-003).', priority: 'média' },
      { responsible: 'SMAS', action: 'Abordagem social no Largo dos Leões em conjunto com GM-Rio', justification: 'Convergência de PSR, drogas e receptação (COIN-004).', priority: 'média' },
      { responsible: 'GM-Rio', action: 'Reposicionar 2 câmeras: acesso A do metrô e R. Bambina', justification: '2 hotspots críticos sem cobertura de câmera.', priority: 'média' },
    ],
  },

  // -----------------------------------------------------------------------
  // 2. PRESIDENTE VARGAS — CAMPO DE SANTANA
  // -----------------------------------------------------------------------
  {
    id: 'presidente-vargas',
    name: 'Presidente Vargas — Campo de Santana — Central — Cinelândia',
    shortName: 'Pres. Vargas / Campo de Santana',
    aisp: 'AISP 5',
    bairro: 'Centro',
    center: [-22.9070, -43.1810],
    zoom: 15,
    polygon: [
      [-22.9035, -43.1860], [-22.9035, -43.1755],
      [-22.9110, -43.1755], [-22.9110, -43.1860],
    ],
    risk: 'critical',
    kpis: {
      ocorrencias_30d: 213,
      ocorrencias_var: 12,
      fatores_urbanos: 41,
      denuncias: 88,
      coincidencias: 5,
    },
    crimePoints: generateCrimePoints(21, -22.9070, -43.1810, 200, 0.007),
    urbanFactors: [
      makeFactor('psr', -22.9075, -43.1812),
      makeFactor('psr', -22.9078, -43.1810),
      makeFactor('psr', -22.9085, -43.1815),
      makeFactor('drogas', -22.9082, -43.1818),
      makeFactor('comercio', -22.9060, -43.1820),
      makeFactor('comercio', -22.9065, -43.1818),
      makeFactor('veg_ilum', -22.9088, -43.1805),
      makeFactor('ilum_ped', -22.9091, -43.1808),
      makeFactor('retencao', -22.9072, -43.1798),
      makeFactor('mob_aband', -22.9090, -43.1820),
      makeFactor('vao', -22.9089, -43.1822),
      makeFactor('onibus', -22.9068, -43.1790),
    ],
    cameras: generatePoints(22, -22.9070, -43.1810, 12, 0.005),
    temporal: buildTemporal(23, [16, 19], [1, 2, 3, 4, 5], 28),
    peakHours: '16h – 19h',
    peakDays: 'Segunda a Sexta',
    executiveSummary: [
      {
        q: 'Existe sobreposição entre PSR/uso de drogas e mancha criminal?',
        a: 'Sim. Campo de Santana concentra 67% das ocorrências da área e apresenta 5 fatores ativos de PSR e 2 de uso de drogas crônico. 38 denúncias do Disque Denúncia citam roubos cometidos por usuários no entorno.',
        sources: ['Ocorrências', 'Fatores Urbanos', 'Disque Denúncia'],
      },
      {
        q: 'A cobertura atual da FM atende o pico do comércio popular?',
        a: 'Não inteiramente. O pico das 16h–19h coincide com o fluxo de saída do comércio da Uruguaiana e R. Buenos Aires. A FM hoje cobre Cinelândia até 18h — recomenda-se prolongar até 20h e adicionar dupla a pé em Buenos Aires × Visconde do Rio Branco.',
        sources: ['Ocorrências', 'QMD FM'],
      },
      {
        q: 'Quais as principais rotas de fuga identificadas?',
        a: 'Convergência entre RELINT 017/2026 e denúncias aponta: (1) Travessa do Paço, (2) viaduto da Av. Pres. Vargas sentido Praça Onze, (3) entrada do Campo de Santana pelo portão da R. dos Andradas. Receptação no entorno da Praça Tiradentes.',
        sources: ['RELINT', 'Disque Denúncia'],
      },
    ],
    dynamics: {
      modusOperandi: 'Predomínio de furto qualificado a transeunte com destreza (carteira/celular). Roubos com simulação de aglomeração em pontos de retenção. À noite no Campo de Santana, abordagens com ameaça por usuários de drogas.',
      suspectProfile: 'Dois perfis distintos: (1) furtadores em duplas, jovens 18–25 anos, atuando em fluxos de pedestres do comércio; (2) usuários crônicos de drogas no Campo de Santana, atuando individualmente, predominantemente à noite.',
      escapeRoutes: 'Trav. do Paço, viaduto Pres. Vargas sentido Praça Onze, portão R. dos Andradas, ruas internas da Saara.',
      receivingPoints: 'Pontos recorrentes em torno da Praça Tiradentes e Saara; receptação reportada em 14 denúncias dos últimos 60 dias.',
      sources: { relints: 1, denuncias: 88, ocorrencias: 213 },
    },
    coincidences: [
      {
        id: 'COIN-101',
        location: 'Calçadão da Uruguaiana × R. Buenos Aires',
        crime: '34 furtos em 30 dias, 90% durante fluxo intenso de pedestres',
        factor: 'Comércio irregular + Calçada estreita + Ponto de retenção do tráfego',
        timeWindow: 'Seg–Sex, 16h–19h',
        operationalGap: 'Sem dupla a pé fixa no calçadão da Uruguaiana após 17h',
        risk: 95,
      },
      {
        id: 'COIN-102',
        location: 'Campo de Santana — entrada R. dos Andradas',
        crime: '21 roubos em 30 dias, predominância noturna',
        factor: 'PSR + Cena de uso de drogas crônica + Iluminação deficiente',
        timeWindow: 'Diariamente, 19h–01h',
        operationalGap: 'Sem cobertura noturna FM; SMAS sem agenda no local',
        risk: 91,
      },
      {
        id: 'COIN-103',
        location: 'Cinelândia — entorno da estação de metrô',
        crime: '15 roubos e 8 furtos em 30 dias',
        factor: 'Comércio irregular + Pontos de retenção do tráfego',
        timeWindow: 'Seg–Sex, 17h–21h',
        operationalGap: 'Cobertura FM atual termina 18h',
        risk: 84,
      },
      {
        id: 'COIN-104',
        location: 'R. Visconde do Rio Branco × Trav. do Paço',
        crime: '9 roubos com fuga por trav. do Paço',
        factor: 'Mobiliário abandonado + Vãos servindo de esconderijo',
        timeWindow: 'Qua–Sex, 18h–22h',
        operationalGap: 'Trav. do Paço fora do perímetro patrulhado',
        risk: 78,
      },
      {
        id: 'COIN-105',
        location: 'Praça Tiradentes',
        crime: '14 denúncias de receptação; 7 ocorrências de furto no entorno',
        factor: 'Comércio irregular + PSR',
        timeWindow: 'Diurno',
        operationalGap: 'SEOP sem operação programada para 30 dias',
        risk: 72,
      },
    ],
    actionPlan: [
      { responsible: 'FM', action: 'Reforço a pé no calçadão da Uruguaiana, dupla fixa 16h–20h', justification: 'Hotspot crítico no pico do comércio (COIN-101).', priority: 'alta' },
      { responsible: 'FM', action: 'Cobertura noturna no Campo de Santana em parceria com GM-Rio', justification: '21 roubos noturnos em 30 dias (COIN-102).', priority: 'alta' },
      { responsible: 'SMAS', action: 'Agenda dedicada de abordagem social no Campo de Santana', justification: 'Sobreposição PSR + drogas + roubo (COIN-102).', priority: 'alta' },
      { responsible: 'RioLuz', action: 'Recuperar iluminação no entorno do Campo de Santana (R. dos Andradas)', justification: 'Iluminação deficiente associada a 21 ocorrências (COIN-102).', priority: 'alta' },
      { responsible: 'SEOP', action: 'Operação de comércio irregular no calçadão da Uruguaiana e Praça Tiradentes', justification: 'Visibilidade comprometida no hotspot (COIN-101, COIN-105).', priority: 'média' },
      { responsible: 'Seconserva', action: 'Remoção de mobiliário e vedação de vãos em Trav. do Paço', justification: 'Vãos utilizados como esconderijo em 9 ocorrências (COIN-104).', priority: 'média' },
      { responsible: 'CET-Rio', action: 'Reavaliar pontos de retenção em Pres. Vargas × Uruguaiana', justification: 'Retenção favorece abordagens criminosas.', priority: 'baixa' },
    ],
  },

  // -----------------------------------------------------------------------
  // 3. RODOVIÁRIA — TERMINAL GENTILEZA — ESTAÇÃO LEOPOLDINA
  // -----------------------------------------------------------------------
  {
    id: 'rodoviaria-gentileza',
    name: 'Rodoviária — Terminal Gentileza — Estação Leopoldina',
    shortName: 'Rodoviária / Gentileza',
    aisp: 'AISP 5',
    bairro: 'São Cristóvão / Santo Cristo',
    center: [-22.8980, -43.2050],
    zoom: 15,
    polygon: [
      [-22.8945, -43.2090], [-22.8945, -43.2010],
      [-22.9015, -43.2010], [-22.9015, -43.2090],
    ],
    risk: 'high',
    kpis: {
      ocorrencias_30d: 98,
      ocorrencias_var: 7,
      fatores_urbanos: 19,
      denuncias: 41,
      coincidencias: 3,
    },
    crimePoints: generateCrimePoints(31, -22.8980, -43.2050, 90, 0.006),
    urbanFactors: [
      makeFactor('psr', -22.8985, -43.2055),
      makeFactor('psr', -22.8990, -43.2058),
      makeFactor('drogas', -22.8988, -43.2060),
      makeFactor('comercio', -22.8975, -43.2048),
      makeFactor('veg_ilum', -22.8995, -43.2045),
      makeFactor('ilum_ped', -22.8998, -43.2050),
      makeFactor('retencao', -22.8970, -43.2040),
      makeFactor('mob_aband', -22.9000, -43.2055),
      makeFactor('onibus', -22.8972, -43.2042),
    ],
    cameras: generatePoints(32, -22.8980, -43.2050, 6, 0.004),
    temporal: buildTemporal(33, [5, 8], [1, 2, 3, 4, 5], 14),
    peakHours: '05h – 08h e 18h – 21h',
    peakDays: 'Segunda a Sexta',
    executiveSummary: [
      {
        q: 'A entrada/saída de passageiros na Rodoviária está coberta?',
        a: 'Parcialmente. O pico matinal (05h–08h) está abaixo da capacidade FM. Recomenda-se dupla fixa no desembarque entre 05h e 09h.',
        sources: ['Ocorrências', 'QMD FM'],
      },
      {
        q: 'O Terminal Gentileza tem fatores ambientais críticos?',
        a: 'Sim — 4 fatores ativos: PSR no entorno, comércio irregular, iluminação deficiente no acesso lateral e mobiliário abandonado. 23 denúncias citam abordagens no acesso lateral.',
        sources: ['Fatores Urbanos', 'Disque Denúncia'],
      },
    ],
    dynamics: {
      modusOperandi: 'Furto a transeunte com destreza (mochilas e celulares) no desembarque da rodoviária. Roubos com ameaça verbal no entorno do Terminal Gentileza no período noturno.',
      suspectProfile: 'Indivíduos jovens em trios atuando no embarque/desembarque; agentes solitários, normalmente usuários de drogas, atuando no entorno do Gentileza à noite.',
      escapeRoutes: 'Av. Francisco Bicalho sentido Santo Cristo; entrada da comunidade adjacente; passagens da Leopoldina.',
      receivingPoints: 'Pontos transitórios próximos à Av. Brasil; 4 denúncias relatam venda no entorno da Praça da Bandeira.',
      sources: { relints: 1, denuncias: 41, ocorrencias: 98 },
    },
    coincidences: [
      {
        id: 'COIN-201',
        location: 'Desembarque da Rodoviária (acesso principal)',
        crime: '24 furtos em 30 dias, 80% no embarque/desembarque',
        factor: 'Comércio irregular + Ponto de retenção do tráfego',
        timeWindow: 'Seg–Sex, 05h–08h',
        operationalGap: 'Sem cobertura FM antes de 07h',
        risk: 88,
      },
      {
        id: 'COIN-202',
        location: 'Terminal Gentileza — acesso lateral',
        crime: '13 roubos em 30 dias, predominância 19h–22h',
        factor: 'PSR + Iluminação deficiente + Mobiliário abandonado',
        timeWindow: 'Diariamente, 19h–22h',
        operationalGap: 'Acesso lateral sem câmera; sem patrulha FM',
        risk: 83,
      },
      {
        id: 'COIN-203',
        location: 'Av. Francisco Bicalho × R. Equador',
        crime: '8 roubos com fuga em motocicleta',
        factor: 'Vegetação encobrindo iluminação + Motocicletas no passeio',
        timeWindow: 'Qui–Sex, 20h–23h',
        operationalGap: 'Fora do polígono FM atual',
        risk: 76,
      },
    ],
    actionPlan: [
      { responsible: 'FM', action: 'Dupla fixa no desembarque da Rodoviária 05h–09h', justification: 'Pico matinal sem cobertura (COIN-201).', priority: 'alta' },
      { responsible: 'FM', action: 'Patrulha noturna no acesso lateral do Gentileza', justification: '13 roubos noturnos no acesso (COIN-202).', priority: 'alta' },
      { responsible: 'RioLuz', action: 'Recuperar iluminação no acesso lateral do Gentileza', justification: 'Iluminação deficiente associada a 13 roubos (COIN-202).', priority: 'alta' },
      { responsible: 'Seconserva', action: 'Remoção de mobiliário abandonado no entorno', justification: 'Esconderijo identificado (COIN-202).', priority: 'média' },
      { responsible: 'SMAS', action: 'Abordagem social no entorno do Terminal Gentileza', justification: 'Concentração de PSR no hotspot (COIN-202).', priority: 'média' },
      { responsible: 'Comlurb', action: 'Poda em Francisco Bicalho × Equador', justification: 'Vegetação encobre iluminação (COIN-203).', priority: 'média' },
    ],
  },

  // -----------------------------------------------------------------------
  // 4. CAMPO GRANDE — ESTAÇÃO / CALÇADÃO
  // -----------------------------------------------------------------------
  {
    id: 'campo-grande',
    name: 'Campo Grande — Estação de Trem — Calçadão',
    shortName: 'Campo Grande',
    aisp: 'AISP 9',
    bairro: 'Campo Grande',
    center: [-22.9043, -43.5550],
    zoom: 16,
    polygon: [
      [-22.9020, -43.5580], [-22.9020, -43.5520],
      [-22.9070, -43.5520], [-22.9070, -43.5580],
    ],
    risk: 'high',
    kpis: {
      ocorrencias_30d: 116,
      ocorrencias_var: 22,
      fatores_urbanos: 24,
      denuncias: 62,
      coincidencias: 3,
    },
    crimePoints: generateCrimePoints(41, -22.9043, -43.5550, 110, 0.005),
    urbanFactors: [
      makeFactor('comercio', -22.9045, -43.5555),
      makeFactor('comercio', -22.9048, -43.5552),
      makeFactor('comercio', -22.9042, -43.5548),
      makeFactor('retencao', -22.9050, -43.5560),
      makeFactor('moto', -22.9046, -43.5554),
      makeFactor('calc_estr', -22.9038, -43.5545),
      makeFactor('onibus', -22.9055, -43.5562),
      makeFactor('veg_ilum', -22.9035, -43.5540),
    ],
    cameras: generatePoints(42, -22.9043, -43.5550, 7, 0.004),
    temporal: buildTemporal(43, [11, 14], [4, 5, 6], 18),
    peakHours: '11h – 14h e 17h – 19h',
    peakDays: 'Quinta a Sábado',
    executiveSummary: [
      {
        q: 'O Calçadão atende a cobertura adequada nos sábados?',
        a: 'Não. Sábado é o dia de maior incidência e a QMD atual reduz efetivo aos fins de semana. Recomenda-se reforço Sex–Sáb 11h–19h.',
        sources: ['Ocorrências', 'QMD FM'],
      },
      {
        q: 'Há padrão de uso de motocicleta?',
        a: 'Sim. 28 denúncias citam roubos por motociclistas no calçadão e em ruas adjacentes; cruzamento com fator urbano "motocicletas no passeio" reforça o padrão.',
        sources: ['Disque Denúncia', 'Fatores Urbanos'],
      },
    ],
    dynamics: {
      modusOperandi: 'Furto a transeunte e roubo de celular em alta densidade de fluxo comercial. Uso recorrente de motocicletas para abordagem rápida e fuga.',
      suspectProfile: 'Duplas em motocicleta sem placa visível; furtadores solitários atuando por destreza.',
      escapeRoutes: 'Ruas paralelas ao calçadão; entrada para a comunidade adjacente; estação de trem.',
      receivingPoints: 'Pontos no entorno do calçadão e na comunidade adjacente; receptação reportada em 11 denúncias.',
      sources: { relints: 1, denuncias: 62, ocorrencias: 116 },
    },
    coincidences: [
      {
        id: 'COIN-301',
        location: 'Calçadão Campo Grande — trecho central',
        crime: '28 furtos em 30 dias, pico Qui–Sáb',
        factor: 'Comércio irregular + Calçada estreita',
        timeWindow: 'Qui–Sáb, 11h–19h',
        operationalGap: 'Efetivo FM reduzido aos sábados',
        risk: 90,
      },
      {
        id: 'COIN-302',
        location: 'Esquina Estação de Trem × Calçadão',
        crime: '12 roubos com motocicleta em 30 dias',
        factor: 'Motocicletas trafegando no passeio + Ponto de retenção',
        timeWindow: 'Diariamente, 17h–20h',
        operationalGap: 'Sem dupla motorizada FM',
        risk: 82,
      },
      {
        id: 'COIN-303',
        location: 'Acesso à estação de trem (saída sul)',
        crime: '8 furtos em 30 dias',
        factor: 'Ponto de ônibus com histórico de vandalismo',
        timeWindow: 'Seg–Sex, 17h–20h',
        operationalGap: 'Sem câmera na saída sul',
        risk: 71,
      },
    ],
    actionPlan: [
      { responsible: 'FM', action: 'Reforço a pé Qui–Sáb 11h–19h no calçadão', justification: 'Pico de furto coincidente com fluxo comercial (COIN-301).', priority: 'alta' },
      { responsible: 'FM', action: 'Dupla motorizada na esquina da Estação 17h–20h', justification: 'Padrão de motocicleta (COIN-302).', priority: 'alta' },
      { responsible: 'GM-Rio', action: 'Fiscalização de motocicletas no passeio do calçadão', justification: 'Fator urbano e MO se sobrepõem (COIN-302).', priority: 'alta' },
      { responsible: 'SEOP', action: 'Fiscalização de comércio irregular no calçadão central', justification: 'Visibilidade comprometida no hotspot (COIN-301).', priority: 'média' },
      { responsible: 'Seconserva', action: 'Recuperar calçada estreita em trechos críticos', justification: 'Fator urbano associado ao MO (COIN-301).', priority: 'baixa' },
      { responsible: 'GM-Rio', action: 'Instalar câmera na saída sul da estação', justification: 'Hotspot sem cobertura (COIN-303).', priority: 'média' },
    ],
  },

  // -----------------------------------------------------------------------
  // 5. ESTAÇÕES SÃO FRANCISCO XAVIER — AFONSO PENA
  // -----------------------------------------------------------------------
  {
    id: 'sfx-afonso-pena',
    name: 'Estações São Francisco Xavier — Afonso Pena',
    shortName: 'SFX — Afonso Pena',
    aisp: 'AISP 6',
    bairro: 'Tijuca / Maracanã',
    center: [-22.9180, -43.2270],
    zoom: 16,
    polygon: [
      [-22.9155, -43.2300], [-22.9155, -43.2235],
      [-22.9210, -43.2235], [-22.9210, -43.2300],
    ],
    risk: 'high',
    kpis: {
      ocorrencias_30d: 87,
      ocorrencias_var: 9,
      fatores_urbanos: 17,
      denuncias: 35,
      coincidencias: 3,
    },
    crimePoints: generateCrimePoints(51, -22.9180, -43.2270, 85, 0.005),
    urbanFactors: [
      makeFactor('veg_ilum', -22.9185, -43.2275),
      makeFactor('ilum_ped', -22.9188, -43.2272),
      makeFactor('comercio', -22.9175, -43.2265),
      makeFactor('moto', -22.9182, -43.2268),
      makeFactor('retencao', -22.9178, -43.2280),
      makeFactor('mob_aband', -22.9192, -43.2278),
      makeFactor('onibus', -22.9170, -43.2260),
    ],
    cameras: generatePoints(52, -22.9180, -43.2270, 6, 0.004),
    temporal: buildTemporal(53, [17, 20], [1, 2, 3, 4, 5], 13),
    peakHours: '17h – 20h',
    peakDays: 'Segunda a Sexta',
    executiveSummary: [
      {
        q: 'O pico da Tijuca exige reforço noturno?',
        a: 'Sim. 60% das ocorrências entre 17h e 22h; QMD atual cessa às 19h.',
        sources: ['Ocorrências', 'QMD FM'],
      },
      {
        q: 'Há padrão de fuga via metrô?',
        a: '14 denúncias citam fuga pelas escadas do metrô — sugere articulação com a segurança do MetrôRio.',
        sources: ['Disque Denúncia'],
      },
    ],
    dynamics: {
      modusOperandi: 'Roubo de celular nos acessos das estações, com fuga pelas escadarias ou por motocicleta na Pereira Nunes.',
      suspectProfile: 'Indivíduos solitários atuando por destreza; duplas em motocicleta no entorno.',
      escapeRoutes: 'Escadarias do metrô; R. Pereira Nunes; R. Conde de Bonfim sentido Praça Saens Peña.',
      receivingPoints: 'Pontos no entorno da Praça Saens Peña; 6 denúncias de receptação.',
      sources: { relints: 1, denuncias: 35, ocorrencias: 87 },
    },
    coincidences: [
      {
        id: 'COIN-401',
        location: 'Acesso da Estação SFX (lado par)',
        crime: '17 roubos em 30 dias',
        factor: 'Vegetação encobrindo iluminação + Comércio irregular',
        timeWindow: 'Seg–Sex, 18h–21h',
        operationalGap: 'QMD encerra 19h',
        risk: 86,
      },
      {
        id: 'COIN-402',
        location: 'Acesso da Estação Afonso Pena',
        crime: '11 roubos em 30 dias',
        factor: 'Ponto de retenção + Motocicletas no passeio',
        timeWindow: 'Seg–Sex, 17h–19h',
        operationalGap: 'Sem dupla motorizada',
        risk: 79,
      },
      {
        id: 'COIN-403',
        location: 'R. Pereira Nunes',
        crime: '7 roubos com fuga em motocicleta',
        factor: 'Iluminação deficiente',
        timeWindow: 'Qui–Sex, 20h–22h',
        operationalGap: 'Fora do polígono FM',
        risk: 72,
      },
    ],
    actionPlan: [
      { responsible: 'FM', action: 'Estender cobertura SFX até 22h', justification: 'Pico noturno sem cobertura (COIN-401).', priority: 'alta' },
      { responsible: 'Comlurb', action: 'Poda no entorno do acesso da SFX', justification: 'Vegetação encobre 3 luminárias (COIN-401).', priority: 'alta' },
      { responsible: 'RioLuz', action: 'Recuperar iluminação na R. Pereira Nunes', justification: 'Hotspot noturno (COIN-403).', priority: 'média' },
      { responsible: 'GM-Rio', action: 'Patrulha motorizada Afonso Pena', justification: 'Padrão de motocicleta (COIN-402).', priority: 'média' },
      { responsible: 'SEOP', action: 'Fiscalização de comércio irregular no entorno da SFX', justification: 'Visibilidade comprometida (COIN-401).', priority: 'baixa' },
    ],
  },

  // -----------------------------------------------------------------------
  // 6. PRAIA DE BOTAFOGO — MARQUÊS DE ABRANTES
  // -----------------------------------------------------------------------
  {
    id: 'praia-botafogo',
    name: 'Praia de Botafogo — R. Marquês de Abrantes',
    shortName: 'Praia de Botafogo',
    aisp: 'AISP 2',
    bairro: 'Botafogo / Flamengo',
    center: [-22.9450, -43.1810],
    zoom: 16,
    polygon: [
      [-22.9425, -43.1840], [-22.9425, -43.1775],
      [-22.9475, -43.1775], [-22.9475, -43.1840],
    ],
    risk: 'medium',
    kpis: {
      ocorrencias_30d: 71,
      ocorrencias_var: -4,
      fatores_urbanos: 14,
      denuncias: 26,
      coincidencias: 2,
    },
    crimePoints: generateCrimePoints(61, -22.9450, -43.1810, 68, 0.005),
    urbanFactors: [
      makeFactor('veg_passeio', -22.9452, -43.1815),
      makeFactor('ilum_ped', -22.9458, -43.1820),
      makeFactor('comercio', -22.9445, -43.1808),
      makeFactor('moto', -22.9450, -43.1812),
      makeFactor('onibus', -22.9460, -43.1825),
    ],
    cameras: generatePoints(62, -22.9450, -43.1810, 8, 0.004),
    temporal: buildTemporal(63, [18, 22], [4, 5, 6], 10),
    peakHours: '18h – 22h',
    peakDays: 'Quinta a Sábado',
    executiveSummary: [
      {
        q: 'A queda recente é sustentável?',
        a: 'Tendência positiva (−4% em 30 dias), atribuída ao reforço em Marquês de Abrantes. Recomenda-se manter a QMD atual e monitorar deslocamento para Sorocaba.',
        sources: ['Ocorrências'],
      },
      {
        q: 'Há sinal de deslocamento para áreas adjacentes?',
        a: 'Sim — leve aumento em R. Sorocaba (+11%), sugerindo migração do crime. Sugerido patrulha leve no eixo Sorocaba–Voluntários.',
        sources: ['Ocorrências'],
      },
    ],
    dynamics: {
      modusOperandi: 'Roubo de celular noturno nos bares de Marquês de Abrantes; abordagens rápidas em Praia de Botafogo após saída de bares.',
      suspectProfile: 'Duplas em motocicleta atuando à noite; indivíduos solitários em vias menos movimentadas.',
      escapeRoutes: 'R. Sorocaba; R. Voluntários sentido São Clemente; Av. das Nações Unidas.',
      receivingPoints: 'Receptação no entorno do Largo dos Leões.',
      sources: { relints: 1, denuncias: 26, ocorrencias: 71 },
    },
    coincidences: [
      {
        id: 'COIN-501',
        location: 'R. Marquês de Abrantes — entorno dos bares',
        crime: '13 roubos em 30 dias',
        factor: 'Iluminação deficiente + Comércio irregular',
        timeWindow: 'Qui–Sáb, 21h–01h',
        operationalGap: 'QMD termina 22h',
        risk: 79,
      },
      {
        id: 'COIN-502',
        location: 'Praia de Botafogo (faixa de pedestres)',
        crime: '8 roubos em 30 dias',
        factor: 'Vegetação obstruindo visibilidade do passeio',
        timeWindow: 'Diariamente, 19h–22h',
        operationalGap: 'Sem cobertura específica no trecho',
        risk: 68,
      },
    ],
    actionPlan: [
      { responsible: 'FM', action: 'Estender cobertura Marquês de Abrantes Qui–Sáb até 01h', justification: 'Pico noturno (COIN-501).', priority: 'alta' },
      { responsible: 'RioLuz', action: 'Recuperar iluminação em Marquês de Abrantes', justification: 'Iluminação deficiente nos bares (COIN-501).', priority: 'alta' },
      { responsible: 'Comlurb', action: 'Poda em Praia de Botafogo', justification: 'Vegetação reduz visibilidade (COIN-502).', priority: 'média' },
      { responsible: 'FM', action: 'Patrulha leve no eixo Sorocaba–Voluntários', justification: 'Sinal de deslocamento do crime.', priority: 'média' },
    ],
  },

  // -----------------------------------------------------------------------
  // 7. JARDIM DE ALAH
  // -----------------------------------------------------------------------
  {
    id: 'jardim-alah',
    name: 'Jardim de Alah',
    shortName: 'Jardim de Alah',
    aisp: 'AISP 23',
    bairro: 'Ipanema / Leblon',
    center: [-22.9852, -43.2050],
    zoom: 16,
    polygon: [
      [-22.9830, -43.2080], [-22.9830, -43.2020],
      [-22.9875, -43.2020], [-22.9875, -43.2080],
    ],
    risk: 'medium',
    kpis: {
      ocorrencias_30d: 58,
      ocorrencias_var: 3,
      fatores_urbanos: 11,
      denuncias: 19,
      coincidencias: 2,
    },
    crimePoints: generateCrimePoints(71, -22.9852, -43.2050, 55, 0.004),
    urbanFactors: [
      makeFactor('veg_passeio', -22.9855, -43.2055),
      makeFactor('ilum_ped', -22.9858, -43.2050),
      makeFactor('mob_aband', -22.9860, -43.2058),
      makeFactor('moto', -22.9848, -43.2048),
    ],
    cameras: generatePoints(72, -22.9852, -43.2050, 5, 0.003),
    temporal: buildTemporal(73, [19, 22], [4, 5, 6], 8),
    peakHours: '19h – 22h',
    peakDays: 'Quinta a Sábado',
    executiveSummary: [
      {
        q: 'O parque do Jardim de Alah concentra ocorrências?',
        a: 'Sim. 60% das ocorrências dentro ou no perímetro imediato do parque, predominantemente após o anoitecer.',
        sources: ['Ocorrências'],
      },
      {
        q: 'Quais fatores ambientais merecem prioridade?',
        a: 'Vegetação densa em 3 pontos do parque e iluminação deficiente na ciclovia adjacente são os principais fatores associados a 17 ocorrências dos últimos 30 dias.',
        sources: ['Fatores Urbanos', 'Ocorrências'],
      },
    ],
    dynamics: {
      modusOperandi: 'Roubo de celular e bolsa em ciclistas e pedestres na ciclovia; abordagens individuais ou em dupla após o anoitecer.',
      suspectProfile: 'Indivíduos solitários a pé; eventual uso de bicicleta para fuga.',
      escapeRoutes: 'Túnel acapulco; Av. Visconde de Albuquerque; ruas internas do Leblon.',
      receivingPoints: 'Pontos transitórios em ruas adjacentes; 3 denúncias de receptação.',
      sources: { relints: 0, denuncias: 19, ocorrencias: 58 },
    },
    coincidences: [
      {
        id: 'COIN-601',
        location: 'Ciclovia Jardim de Alah — trecho central',
        crime: '14 roubos a ciclistas em 30 dias',
        factor: 'Vegetação obstruindo visibilidade + Iluminação deficiente',
        timeWindow: 'Qui–Sáb, 19h–23h',
        operationalGap: 'Sem patrulhamento da ciclovia após 20h',
        risk: 81,
      },
      {
        id: 'COIN-602',
        location: 'Parque do Jardim de Alah — entrada Av. Visconde de Albuquerque',
        crime: '7 roubos a transeunte em 30 dias',
        factor: 'Mobiliário abandonado servindo de esconderijo',
        timeWindow: 'Diariamente, 20h–23h',
        operationalGap: 'Sem cobertura específica do parque',
        risk: 69,
      },
    ],
    actionPlan: [
      { responsible: 'FM', action: 'Patrulhamento da ciclovia Qui–Sáb 19h–23h', justification: 'Pico de roubos a ciclistas (COIN-601).', priority: 'alta' },
      { responsible: 'Comlurb', action: 'Poda na ciclovia central do Jardim de Alah', justification: 'Vegetação compromete visibilidade (COIN-601).', priority: 'alta' },
      { responsible: 'RioLuz', action: 'Recuperar iluminação na ciclovia', justification: 'Iluminação associada a 14 roubos (COIN-601).', priority: 'alta' },
      { responsible: 'Seconserva', action: 'Remoção de mobiliário abandonado no parque', justification: 'Esconderijo identificado (COIN-602).', priority: 'média' },
    ],
  },

  // -----------------------------------------------------------------------
  // 8. BANGU — CALÇADÃO / BANGU SHOPPING
  // -----------------------------------------------------------------------
  {
    id: 'bangu-calcadao',
    name: 'Bangu — Calçadão / Bangu Shopping',
    shortName: 'Bangu',
    aisp: 'AISP 14',
    bairro: 'Bangu',
    center: [-22.8770, -43.4670],
    zoom: 16,
    polygon: [
      [-22.8745, -43.4700], [-22.8745, -43.4640],
      [-22.8795, -43.4640], [-22.8795, -43.4700],
    ],
    risk: 'high',
    kpis: {
      ocorrencias_30d: 94,
      ocorrencias_var: 15,
      fatores_urbanos: 18,
      denuncias: 39,
      coincidencias: 3,
    },
    crimePoints: generateCrimePoints(81, -22.8770, -43.4670, 90, 0.005),
    urbanFactors: [
      makeFactor('comercio', -22.8772, -43.4675),
      makeFactor('comercio', -22.8768, -43.4670),
      makeFactor('moto', -22.8770, -43.4672),
      makeFactor('retencao', -22.8775, -43.4680),
      makeFactor('calc_estr', -22.8765, -43.4665),
      makeFactor('onibus', -22.8780, -43.4685),
      makeFactor('veg_ilum', -22.8773, -43.4660),
    ],
    cameras: generatePoints(82, -22.8770, -43.4670, 6, 0.004),
    temporal: buildTemporal(83, [11, 14], [4, 5, 6], 14),
    peakHours: '11h – 14h e 17h – 19h',
    peakDays: 'Quinta a Sábado',
    executiveSummary: [
      {
        q: 'A entrada do Bangu Shopping concentra ocorrências?',
        a: 'Sim — 32% das ocorrências em raio de 100m da entrada; pico aos sábados à tarde.',
        sources: ['Ocorrências'],
      },
      {
        q: 'A FM cobre o pico do calçadão?',
        a: 'Parcialmente — efetivo reduzido aos sábados, justamente o dia de maior incidência.',
        sources: ['Ocorrências', 'QMD FM'],
      },
    ],
    dynamics: {
      modusOperandi: 'Furto a transeunte com destreza no calçadão e na entrada do shopping; uso de motocicleta em ruas adjacentes.',
      suspectProfile: 'Trios atuando no calçadão; duplas em motocicleta nas adjacências.',
      escapeRoutes: 'Comunidade adjacente; estação de trem de Bangu; ruas internas.',
      receivingPoints: 'Pontos no calçadão e em comércio informal adjacente.',
      sources: { relints: 0, denuncias: 39, ocorrencias: 94 },
    },
    coincidences: [
      {
        id: 'COIN-701',
        location: 'Calçadão de Bangu — trecho central',
        crime: '24 furtos em 30 dias, pico Sex–Sáb',
        factor: 'Comércio irregular + Calçada estreita',
        timeWindow: 'Sex–Sáb, 11h–18h',
        operationalGap: 'Efetivo reduzido aos sábados',
        risk: 88,
      },
      {
        id: 'COIN-702',
        location: 'Entrada Bangu Shopping (R. Catonho)',
        crime: '12 roubos em 30 dias',
        factor: 'Ponto de retenção + Motocicletas no passeio',
        timeWindow: 'Diariamente, 17h–20h',
        operationalGap: 'Sem patrulha motorizada FM',
        risk: 78,
      },
      {
        id: 'COIN-703',
        location: 'Saída da Estação de Trem de Bangu',
        crime: '8 furtos em 30 dias',
        factor: 'Ponto de ônibus com histórico de vandalismo',
        timeWindow: 'Seg–Sex, 17h–19h',
        operationalGap: 'Sem cobertura específica',
        risk: 70,
      },
    ],
    actionPlan: [
      { responsible: 'FM', action: 'Reforço Sex–Sáb no calçadão de Bangu', justification: 'Pico aos fins de semana (COIN-701).', priority: 'alta' },
      { responsible: 'FM', action: 'Patrulha motorizada na entrada do shopping', justification: 'Padrão de motocicleta (COIN-702).', priority: 'alta' },
      { responsible: 'SEOP', action: 'Operação de comércio irregular no calçadão central', justification: 'Visibilidade comprometida (COIN-701).', priority: 'média' },
      { responsible: 'Seconserva', action: 'Recuperar calçada estreita no calçadão', justification: 'Fator urbano associado ao MO (COIN-701).', priority: 'baixa' },
      { responsible: 'GM-Rio', action: 'Fiscalização de motocicletas no passeio', justification: 'Fator urbano associado (COIN-702).', priority: 'média' },
    ],
  },

  // -----------------------------------------------------------------------
  // 9. RUA LAURO MÜLLER — GENERAL SEVERIANO — VENCESLAU BRÁS
  // -----------------------------------------------------------------------
  {
    id: 'lauro-muller',
    name: 'R. Lauro Müller — Av. General Severiano — Av. Venceslau Brás',
    shortName: 'Lauro Müller / Severiano',
    aisp: 'AISP 2',
    bairro: 'Botafogo / Urca',
    center: [-22.9520, -43.1820],
    zoom: 16,
    polygon: [
      [-22.9498, -43.1850], [-22.9498, -43.1790],
      [-22.9545, -43.1790], [-22.9545, -43.1850],
    ],
    risk: 'medium',
    kpis: {
      ocorrencias_30d: 64,
      ocorrencias_var: 6,
      fatores_urbanos: 12,
      denuncias: 22,
      coincidencias: 2,
    },
    crimePoints: generateCrimePoints(91, -22.9520, -43.1820, 60, 0.005),
    urbanFactors: [
      makeFactor('comercio', -22.9518, -43.1825),
      makeFactor('veg_ilum', -22.9525, -43.1815),
      makeFactor('moto', -22.9520, -43.1820),
      makeFactor('retencao', -22.9522, -43.1830),
      makeFactor('onibus', -22.9530, -43.1820),
    ],
    cameras: generatePoints(92, -22.9520, -43.1820, 5, 0.004),
    temporal: buildTemporal(93, [12, 14], [1, 2, 3, 4, 5], 10),
    peakHours: '12h – 14h',
    peakDays: 'Segunda a Sexta',
    executiveSummary: [
      {
        q: 'A saída do almoço concentra ocorrências?',
        a: 'Sim — 45% das ocorrências entre 11h e 14h, próximas ao Shopping Rio Sul e à entrada da Urca.',
        sources: ['Ocorrências'],
      },
      {
        q: 'A QMD atual cobre o pico do almoço?',
        a: 'Cobre apenas parcialmente. Recomenda-se reforço a pé entre 11h30 e 14h30.',
        sources: ['Ocorrências', 'QMD FM'],
      },
    ],
    dynamics: {
      modusOperandi: 'Furto a transeunte por destreza no fluxo do horário do almoço; abordagens rápidas no entorno do Shopping Rio Sul.',
      suspectProfile: 'Indivíduos solitários atuando no fluxo de pedestres; eventual uso de motocicleta.',
      escapeRoutes: 'Túnel Pasmado; R. General Severiano sentido Botafogo; entrada do Shopping Rio Sul.',
      receivingPoints: 'Pontos transitórios no entorno; 4 denúncias de receptação.',
      sources: { relints: 1, denuncias: 22, ocorrencias: 64 },
    },
    coincidences: [
      {
        id: 'COIN-801',
        location: 'R. Lauro Müller — entrada Shopping Rio Sul',
        crime: '15 furtos em 30 dias',
        factor: 'Comércio irregular + Ponto de retenção',
        timeWindow: 'Seg–Sex, 11h30–14h30',
        operationalGap: 'Cobertura FM parcial no horário',
        risk: 80,
      },
      {
        id: 'COIN-802',
        location: 'Av. General Severiano',
        crime: '8 roubos em 30 dias com motocicleta',
        factor: 'Vegetação encobrindo iluminação + Motocicletas no passeio',
        timeWindow: 'Diariamente, 19h–22h',
        operationalGap: 'Sem patrulha motorizada noturna',
        risk: 71,
      },
    ],
    actionPlan: [
      { responsible: 'FM', action: 'Reforço a pé 11h30–14h30 em Lauro Müller', justification: 'Pico do almoço (COIN-801).', priority: 'alta' },
      { responsible: 'FM', action: 'Patrulha motorizada noturna em Gen. Severiano', justification: 'Padrão de motocicleta noturna (COIN-802).', priority: 'média' },
      { responsible: 'Comlurb', action: 'Poda em Gen. Severiano', justification: 'Vegetação encobre iluminação (COIN-802).', priority: 'média' },
      { responsible: 'SEOP', action: 'Fiscalização de comércio irregular na entrada do Rio Sul', justification: 'Visibilidade comprometida (COIN-801).', priority: 'baixa' },
    ],
  },
]

// Aggregate metric for the header overview
export const TOTAL_AREAS = AREAS.length
export const TOTAL_OCCURRENCES_30D = AREAS.reduce((s, a) => s + a.kpis.ocorrencias_30d, 0)
export const TOTAL_COINCIDENCES = AREAS.reduce((s, a) => s + a.kpis.coincidencias, 0)

export const DATA_SOURCES = [
  { id: 'ocorrencias',  label: 'Ocorrências Criminais', records: 24820, updated: '23/05/2026' },
  { id: 'disque',       label: 'Disque Denúncia',       records: 8214,  updated: '22/05/2026' },
  { id: 'fatores',      label: 'Fatores Urbanos',       records: 2104,  updated: '20/05/2026' },
  { id: 'relints',      label: 'RELINTs',               records: 8,     updated: '21/05/2026' },
  { id: 'poligonos',    label: 'Polígonos FM',          records: 9,     updated: '15/05/2026' },
]
