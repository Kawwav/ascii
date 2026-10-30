// Música eletrônica gerada na hora com a Web Audio API (nenhum arquivo de áudio).
//
// Cada DEDO é uma camada sonora (10 no total):
// HARDCORE / GABBER: bumbo distorcido e pesado, baixo ao contrário, stabs de rave e hoover.
//   mão esquerda (da tela): polegar = bumbo gabber | indicador = baixo (offbeat) | médio = caixa+palma
//                           anelar = hi-hat  | mindinho = hat aberto + prato
//   mão direita  (da tela): polegar = stab de rave | indicador = lead serrilhado | médio = hoover
//                           anelar = acid 303 | mindinho = percussão (tons e rim)
// Tudo começa mudo: cada camada só entra quando o dedo dela é LEVANTADO (depois de
// ter estado fechado) e fica muda de novo quando o dedo fecha.
// Ao LEVANTAR um dedo dispara um efeito (subida); ao FECHAR dispara outro (descida).
// Além disso, a inclinação e a altura das mãos mudam o tom (nota do baixo, arpejo, brilho).
//
// GRAVADOR (estilo FL Studio): grava quando cada dedo é levantado/fechado, quantizado em 1/16,
// e repete em loop (1, 2, 4 ou 8 compassos), mesmo com as mãos fora da câmera.

// false = ao ligar o efeito tudo começa mudo (dedos já levantados não tocam até serem fechados e levantados de novo)
// true  = dedos já levantados ao ligar começam tocando
const COMECAM_LIGADAS = false

const BPM = 172
const PASSO = 60 / BPM / 4 // duração de 1/16 de compasso, em segundos

// escala: lá menor pentatônica (qualquer combinação soa bem junta)
const PENTATONICA = [0, 3, 5, 7, 10]
const BASE_BAIXO = 33 // lá 1
const BASE_LEAD = 57 // lá 3

// passos (0 a 15) do compasso em que cada camada toca
const BAIXO = { 2: 0, 6: 0, 10: 0, 11: 7, 14: 3 } // passo -> semitons acima da raiz
const ARPEJO = [0, 2, 4, 5, 4, 2, 3, 1] // graus da escala (1 nota a cada 1/8)
const HOOVER_PASSOS = [0, 3, 6, 10, 14]
const HOOVER_GRAUS = [0, 2, 0, 3, 4]
const STAB_PASSOS = [0, 3, 6, 10]
const ACID_PASSOS = { 0: 0, 3: 0, 6: 12, 7: 0, 10: 3, 12: 5, 14: 7, 15: 12 }
const PERC_PASSOS = { 3: 0, 6: 3, 9: 5, 11: 0, 14: 7 } // passo -> semitons do tom

// transposição global (semitons) controlada pelo giro das mãos
let TRANSP = 0
const mtof = (m) => 440 * Math.pow(2, (m - 69 + TRANSP) / 12)

// ---------------------------------------------------------------- remixagem
export const RITMOS = {
  four: { nome: 'Gabber', bumbo: [0, 4, 8, 12], caixa: [4, 12], hats: 'oitavos', baixo: { 2: 0, 6: 0, 10: 0, 14: 0 } },
  break: { nome: 'Frenchcore', bumbo: [0, 2, 4, 6, 8, 10, 12, 14], caixa: [4, 12], hats: 'oitavos', baixo: { 1: 0, 3: 0, 5: 0, 7: 0, 9: 0, 11: 0, 13: 0, 15: 0 } },
  trap: { nome: 'Uptempo', bumbo: [0, 4, 8, 10, 12, 14], caixa: [4, 12], hats: 'rolos', baixo: { 2: 0, 6: 0, 10: 3, 14: 7 } },
  reggaeton: { nome: 'Hardstyle', bumbo: [0, 4, 8, 12], caixa: [4, 12], hats: 'oitavos', baixo: { 2: 0, 3: 0, 6: 0, 7: 0, 10: 0, 11: 0, 14: 0, 15: 0 } },
  half: { nome: 'Terror', bumbo: [0, 3, 6, 8, 11, 14], caixa: [4, 12, 15], hats: 'quartos', baixo: { 2: 0, 5: 3, 10: 0, 13: 5 } },
}
export const INSTRUMENTOS = {
  todos: { nome: 'Todos', esq: [1, 1, 1, 1, 1], dir: [1, 1, 1, 1, 1] },
  batida: { nome: 'Só batida', esq: [1, 1, 1, 1, 1], dir: [0, 0, 0, 0, 1] },
  melodico: { nome: 'Melódico', esq: [0, 1, 0, 0, 0], dir: [1, 1, 1, 1, 0] },
  minimal: { nome: 'Minimal', esq: [1, 1, 0, 1, 0], dir: [0, 0, 1, 0, 0] },
  ambient: { nome: 'Ambiente', esq: [0, 0, 0, 0, 1], dir: [1, 0, 1, 0, 0] },
}
export const ESCALAS = {
  pentaMenor: { nome: 'Pentatônica menor', notas: [0, 3, 5, 7, 10], acorde: [0, 7, 15] },
  pentaMaior: { nome: 'Pentatônica maior', notas: [0, 2, 4, 7, 9], acorde: [0, 7, 16] },
  dorico: { nome: 'Dórico', notas: [0, 2, 3, 5, 7, 9, 10], acorde: [0, 10, 15, 19] },
  frigio: { nome: 'Frígio', notas: [0, 1, 3, 5, 7, 8, 10], acorde: [0, 1, 7, 15] },
  blues: { nome: 'Blues', notas: [0, 3, 5, 6, 7, 10], acorde: [0, 10, 15, 18] },
  maior7: { nome: 'Acorde maj7', notas: [0, 4, 7, 11], acorde: [0, 4, 11, 19] },
}
// ---------------------------------------------------------------- sons dos dedos
// Cada dedo toca UM som, escolhido pelo painel. Pode ser um som do app ou um arquivo do computador.
export const SONS_BASE = {
  bumbo: { nome: 'Bumbo gabber', curto: 'Bumbo' },
  baixo: { nome: 'Baixo 808', curto: 'Baixo' },
  caixa: { nome: 'Caixa + palma', curto: 'Caixa' },
  hat: { nome: 'Hi-hat', curto: 'Hi-hat' },
  prato: { nome: 'Hat aberto + prato', curto: 'Prato' },
  stab: { nome: 'Stab de rave', curto: 'Stab' },
  lead: { nome: 'Lead serrilhado', curto: 'Lead' },
  hoover: { nome: 'Hoover', curto: 'Hoover' },
  acid: { nome: 'Acid 303', curto: 'Acid' },
  perc: { nome: 'Percussão', curto: 'Perc' },
  kick: { nome: 'Kick', curto: 'Kick' },
  clap: { nome: 'Clap', curto: 'Clap' },
  hats: { nome: 'Hats (16 avos)', curto: 'Hats' },
  openhat: { nome: 'Open hat', curto: 'Open hat' },
  rumble: { nome: 'Rumble', curto: 'Rumble' },
  stab2: { nome: 'Stab house', curto: 'Stab 2' },
}
// ordem dos dedos: polegar, indicador, médio, anelar, mindinho

export const VOLUMES_PADRAO = {
  bumbo: 1,
  baixo: 1,
  caixa: 1,
  hat: 1,
  prato: 1,
  stab: 1,
  lead: 1,
  hoover: 1,
  acid: 1,
  perc: 1,
  kick: 1,
  clap: 1,
  hats: 1,
  openhat: 1,
  rumble: 1,
  stab2: 1,
  arquivos: 1,
}

export const MAPA_PADRAO = {
  esq: ['bumbo', 'baixo', 'caixa', 'hat', 'prato'],
  dir: ['stab', 'lead', 'hoover', 'acid', 'perc'],
}
// modos de um arquivo de áudio: 'uma' = toca ao levantar o dedo | 'tempo' = repete a cada tempo
// | 'compasso' = repete a cada compasso (em todos, fechar o dedo para o som)
const SONS_ARQUIVO = {} // id -> { nome, buffer, modo }
let contadorArquivo = 0
export const listarArquivos = () =>
  Object.entries(SONS_ARQUIVO).map(([id, a]) => ({ id, nome: a.nome, modo: a.modo }))
export const configurarArquivo = (id, op) => {
  if (SONS_ARQUIVO[id]) Object.assign(SONS_ARQUIVO[id], op)
}

const remix = { ritmo: 'four', instrumentos: 'todos', escala: 'pentaMenor' }
let PENTATONICA_ATUAL = ESCALAS.pentaMenor.notas
const limitar = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v))
// grau da escala -> semitons (passa de oitava a cada 5 graus)
const grau = (g) => {
  const n = PENTATONICA_ATUAL.length
  return 12 * Math.floor(g / n) + PENTATONICA_ATUAL[((g % n) + n) % n]
}

export function criarMusica() {
  let ctx = null
  let mestre = null
  let saturador = null
  let saturaBumbo = null
  let filtroLead = null
  let enviaEco = null
  let ruido = null
  let timer = 0
  const canais = {}
  const volumes = { ...VOLUMES_PADRAO }
  let proximo = 0
  let passo = 0
  let tocando = false
  // por dedo: true = o som dele continua tocando mesmo quando a mão sai da câmera
  const manter = { esq: [false, false, false, false, false], dir: [false, false, false, false, false] }

  // posição física dos dedos (true = levantado); null = mão ainda não vista
  const ativas = { esq: null, dir: null }
  // camadas que estão realmente tocando (um dedo levantado a liga, um dedo fechado a desliga)
  const camada = { esq: [false, false, false, false, false], dir: [false, false, false, false, false] }
  // som de cada dedo (pode ser trocado pelo painel)
  let mapa = { esq: [...MAPA_PADRAO.esq], dir: [...MAPA_PADRAO.dir] }
  // arquivos de áudio tocando agora (um por dedo)
  const fontes = { esq: [null, null, null, null, null], dir: [null, null, null, null, null] }
  let previaAte = 0
  let fontePrevia = null
  const ultimoEfeito = { esq: [0, 0, 0, 0, 0], dir: [0, 0, 0, 0, 0] }
  // ---- gravador ----
  // eventos: { p: passo (0 a compassos*16-1), v: volta em que foi gravado, lado, dedo, sobe }
  const grav = { compassos: 4, eventos: [], gravando: false, reproduzindo: false }
  // camadas ligadas pela gravação (separadas das que vêm das mãos ao vivo)
  const camadaG = { esq: [false, false, false, false, false], dir: [false, false, false, false, false] }
  let aoMudarGrav = null
  const on = (lado, i) =>
    (camada[lado][i] || (grav.reproduzindo && camadaG[lado][i])) && INSTRUMENTOS[remix.instrumentos][lado][i] === 1

  // estado controlado pela inclinação/altura das mãos
  const e = { raiz: BASE_BAIXO, desloc: 0, hat: 0.5, brilho: 0.5 }

  function montar() {
    if (ctx) return
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    ctx = new AC()

    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -22
    comp.ratio.value = 12
    comp.attack.value = 0.002
    comp.release.value = 0.12
    comp.connect(ctx.destination)

    mestre = ctx.createGain()
    mestre.gain.value = 0
    mestre.connect(comp)

    // canais individuais da mesa de som (mixer)
    for (const id of [...Object.keys(SONS_BASE), 'arquivos']) {
      const g = ctx.createGain()
      g.gain.value = volumes[id] !== undefined ? volumes[id] : 1
      g.connect(mestre)
      canais[id] = g
    }

    // eco (delay pontuado) usado por lead e hoover
    const eco = ctx.createDelay(1)
    eco.delayTime.value = (60 / BPM) * 0.75
    const realimenta = ctx.createGain()
    realimenta.gain.value = 0.38
    const abafa = ctx.createBiquadFilter()
    abafa.type = 'lowpass'
    abafa.frequency.value = 2800
    enviaEco = ctx.createGain()
    enviaEco.gain.value = 0.25
    enviaEco.connect(eco)
    eco.connect(abafa)
    abafa.connect(realimenta)
    realimenta.connect(eco)
    abafa.connect(mestre)

    // lead passa por um filtro compartilhado (a mão direita abre e fecha)
    filtroLead = ctx.createBiquadFilter()
    filtroLead.type = 'lowpass'
    filtroLead.Q.value = 6
    filtroLead.frequency.value = 1500
    filtroLead.connect(canais.lead)
    filtroLead.connect(enviaEco)

    // saturação do 808 (deixa o grave "gordo")
    saturador = ctx.createWaveShaper()
    const curva = new Float32Array(1024)
    for (let i = 0; i < curva.length; i++) {
      const x = (i / (curva.length - 1)) * 2 - 1
      curva[i] = Math.tanh(6 * x)
    }
    saturador.curve = curva
    const saidaBaixo = ctx.createGain()
    saidaBaixo.gain.value = 0.5
    saturador.connect(saidaBaixo)
    saidaBaixo.connect(canais.baixo)

    // distorção pesada do bumbo gabber (clipping forte)
    saturaBumbo = ctx.createWaveShaper()
    const curvaBumbo = new Float32Array(1024)
    for (let i = 0; i < curvaBumbo.length; i++) {
      const x = (i / (curvaBumbo.length - 1)) * 2 - 1
      curvaBumbo[i] = Math.max(-1, Math.min(1, Math.tanh(14 * x) * 1.1))
    }
    saturaBumbo.curve = curvaBumbo
    const saidaBumbo = ctx.createGain()
    saidaBumbo.gain.value = 0.75
    saturaBumbo.connect(saidaBumbo)
    saidaBumbo.connect(canais.bumbo)

    // ruído branco reaproveitado por hi-hat, palma, prato e efeitos
    ruido = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const d = ruido.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }

  // ---------------------------------------------------------------- blocos básicos

  // envelope: sobe rápido e cai exponencialmente
  function envelope(g, t, pico, ataque, queda) {
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(pico, t + ataque)
    g.gain.exponentialRampToValueAtTime(0.0001, t + ataque + queda)
  }

  function rajada(t, tipo, freq, q, pico, ataque, queda, destino = mestre) {
    const s = ctx.createBufferSource()
    s.buffer = ruido
    const f = ctx.createBiquadFilter()
    f.type = tipo
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    envelope(g, t, pico, ataque, queda)
    s.connect(f)
    f.connect(g)
    g.connect(destino)
    s.start(t, Math.random() * 1.5)
    s.stop(t + ataque + queda + 0.05)
  }

  // oscilador cuja frequência varre de f0 até f1 (lasers, quedas, subidas)
  function varrer(t, tipo, f0, f1, dur, pico, destino = mestre) {
    const o = ctx.createOscillator()
    o.type = tipo
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(f1, t + dur)
    const g = ctx.createGain()
    envelope(g, t, pico, 0.01, dur)
    o.connect(g)
    g.connect(destino)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  // sopro de ruído com filtro varrendo: subindo = "riser", descendo = "downlifter"
  function sopro(t, subindo, dur, pico, grave = 300, agudo = 7000) {
    const s = ctx.createBufferSource()
    s.buffer = ruido
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 1.2
    f.frequency.setValueAtTime(subindo ? grave : agudo, t)
    f.frequency.exponentialRampToValueAtTime(subindo ? agudo : grave, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(subindo ? 0.0001 : pico, t)
    g.gain.exponentialRampToValueAtTime(subindo ? pico : 0.0001, t + dur)
    if (subindo) g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05)
    s.connect(f)
    f.connect(g)
    g.connect(mestre)
    s.start(t, Math.random() * 1.0)
    s.stop(t + dur + 0.1)
  }

  // repete uma batida acelerando (rolo de caixa, rolo de hat...)
  function rolo(t, n, total, voz) {
    for (let k = 0; k < n; k++) {
      const quando = total * (1 - Math.pow(1 - k / n, 1.6))
      voz(t + quando, 0.35 + 0.65 * (k / n))
    }
  }

  // sequência rápida de notas subindo ou descendo pela escala
  function corrida(t, voz, subindo, n, espaco, base) {
    for (let k = 0; k < n; k++) {
      const g = base + (subindo ? k : n - 1 - k)
      voz(t + k * espaco, grau(g))
    }
  }

  // ---------------------------------------------------------------- vozes

  // bumbo gabber: queda de tom rápida + distorção pesada + estalo no ataque
  function bumbo(t) {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(330, t)
    o.frequency.exponentialRampToValueAtTime(58, t + 0.07)
    o.frequency.exponentialRampToValueAtTime(40, t + 0.3)
    envelope(g, t, 1.6, 0.002, 0.3)
    o.connect(g)
    g.connect(saturaBumbo)
    o.start(t)
    o.stop(t + 0.4)
    rajada(t, 'highpass', 2500, 0.7, 0.35, 0.001, 0.012, canais.bumbo) // clique do ataque
  }

  function baixo808(t, midi, dur) {
    const f = mtof(midi)
    const g = ctx.createGain()
    envelope(g, t, 1, 0.01, dur)
    g.connect(saturador)
    for (const tipo of ['sine', 'triangle']) {
      const o = ctx.createOscillator()
      o.type = tipo
      // o 808 começa mais agudo e "desce" até a nota
      o.frequency.setValueAtTime(f * 1.6, t)
      o.frequency.exponentialRampToValueAtTime(f, t + 0.06)
      const og = ctx.createGain()
      og.gain.value = tipo === 'sine' ? 0.8 : 0.25
      o.connect(og)
      og.connect(g)
      o.start(t)
      o.stop(t + dur + 0.1)
    }
  }

  // 808 que desliza de uma nota para outra
  function deslizeBaixo(t, de, ate, dur) {
    const g = ctx.createGain()
    envelope(g, t, 1, 0.02, dur)
    g.connect(saturador)
    for (const tipo of ['sine', 'triangle']) {
      const o = ctx.createOscillator()
      o.type = tipo
      o.frequency.setValueAtTime(mtof(de), t)
      o.frequency.exponentialRampToValueAtTime(mtof(ate), t + dur * 0.8)
      const og = ctx.createGain()
      og.gain.value = tipo === 'sine' ? 0.8 : 0.25
      o.connect(og)
      og.connect(g)
      o.start(t)
      o.stop(t + dur + 0.1)
    }
  }

  function hat(t, aberto, vel, canal = canais.hat) {
    const freq = 5500 + e.hat * 5000
    rajada(t, 'highpass', freq, 0.7, vel, 0.001, aberto ? 0.26 : 0.045, canal)
  }

  function palmas(t) {
    for (const k of [0, 0.013, 0.027]) {
      rajada(t + k, 'bandpass', 1600, 1.2, 0.3, 0.002, k === 0.027 ? 0.16 : 0.02, canais.caixa)
    }
  }

  function caixa(t, vel = 1) {
    rajada(t, 'bandpass', 1900, 0.8, 0.3 * vel, 0.002, 0.14, canais.caixa)
    varrer(t, 'sine', 210, 120, 0.1, 0.22 * vel, canais.caixa)
  }

  function prato(t, pico = 0.16) {
    rajada(t, 'highpass', 4500, 0.5, pico, 0.004, 1.7, canais.prato)
  }

  function lead(t, midi, dur) {
    const g = ctx.createGain()
    envelope(g, t, 0.06, 0.004, dur)
    g.connect(filtroLead)
    for (const detune of [-22, 0, 22]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.detune.value = detune
      o.frequency.value = mtof(midi)
      o.connect(g)
      o.start(t)
      o.stop(t + dur + 0.05)
    }
  }

  // hoover: sons de rave gritados (3 serras desafinadas que caem de tom)
  function hoover(t, midi, dur = 0.3) {
    const f = mtof(midi)
    const filtro = ctx.createBiquadFilter()
    filtro.type = 'lowpass'
    filtro.Q.value = 5
    filtro.frequency.setValueAtTime(5000, t)
    filtro.frequency.exponentialRampToValueAtTime(900, t + dur)
    const g = ctx.createGain()
    envelope(g, t, 0.09, 0.005, dur)
    filtro.connect(g)
    g.connect(canais.hoover)
    g.connect(enviaEco)
    for (const detune of [-30, 0, 30]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.detune.value = detune
      o.frequency.setValueAtTime(f * 1.5, t)
      o.frequency.exponentialRampToValueAtTime(f, t + 0.08)
      o.connect(filtro)
      o.start(t)
      o.stop(t + dur + 0.05)
    }
  }

  // baixo "acid" (estilo 303): serra + filtro ressonante com envelope
  function acid(t, midi, dur, de = null) {
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    if (de !== null) {
      o.frequency.setValueAtTime(mtof(de), t)
      o.frequency.exponentialRampToValueAtTime(mtof(midi), t + dur * 0.7)
    } else {
      o.frequency.value = mtof(midi)
    }
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.Q.value = 11
    const base = 300 + e.brilho * 900
    f.frequency.setValueAtTime(base, t)
    f.frequency.exponentialRampToValueAtTime(base * 5, t + 0.01)
    f.frequency.exponentialRampToValueAtTime(base, t + dur)
    const g = ctx.createGain()
    envelope(g, t, 0.1, 0.004, dur)
    o.connect(f)
    f.connect(g)
    g.connect(canais.acid)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  // stab de rave: acorde curto, serrilhado e brilhante
  function pad(t, midi) {
    const filtro = ctx.createBiquadFilter()
    filtro.type = 'lowpass'
    filtro.Q.value = 4
    filtro.frequency.setValueAtTime(4500, t)
    filtro.frequency.exponentialRampToValueAtTime(500, t + PASSO * 2.5)
    const g = ctx.createGain()
    envelope(g, t, 0.13, 0.002, PASSO * 2.5)
    filtro.connect(g)
    g.connect(canais.stab)
    g.connect(enviaEco)
    for (const semitons of ESCALAS[remix.escala].acorde) {
      for (const detune of [-14, 14]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.detune.value = detune
        o.frequency.value = mtof(midi + semitons)
        o.connect(filtro)
        o.start(t)
        o.stop(t + PASSO * 2.5 + 0.1)
      }
    }
  }

  // batida de acorde brilhante (efeito)
  function acordeBrilho(t, midi) {
    const filtro = ctx.createBiquadFilter()
    filtro.type = 'lowpass'
    filtro.frequency.setValueAtTime(5000, t)
    filtro.frequency.exponentialRampToValueAtTime(500, t + 1.2)
    const g = ctx.createGain()
    envelope(g, t, 0.1, 0.01, 1.3)
    filtro.connect(g)
    g.connect(canais.stab)
    g.connect(enviaEco)
    for (const semitons of [0, 7, 12, 15, 19]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.detune.value = (Math.random() - 0.5) * 16
      o.frequency.value = mtof(midi + semitons)
      o.connect(filtro)
      o.start(t)
      o.stop(t + 1.4)
    }
  }

  // tambor afinado (tom/conga)
  function tom(t, midi, vel = 0.25) {
    const f = mtof(midi)
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(f * 1.8, t)
    o.frequency.exponentialRampToValueAtTime(f, t + 0.09)
    envelope(g, t, vel, 0.002, 0.28)
    o.connect(g)
    g.connect(canais.perc)
    o.start(t)
    o.stop(t + 0.35)
    rajada(t, 'bandpass', 2500, 2, vel * 0.3, 0.001, 0.02, canais.perc)
  }

  // ---------------------------------------------------------------- vozes extras

  // kick limpo e socado (house/techno): queda de tom + clique curto
  function kick(t) {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(190, t)
    o.frequency.exponentialRampToValueAtTime(52, t + 0.09)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.35)
    envelope(g, t, 1.2, 0.002, 0.38)
    o.connect(g)
    g.connect(canais.kick)
    o.start(t)
    o.stop(t + 0.45)
    rajada(t, 'highpass', 3000, 0.7, 0.25, 0.001, 0.01, canais.kick)
  }

  // clap: 3 estalos rápidos + cauda
  function clap(t, vel = 1) {
    for (const k of [0, 0.011, 0.022]) {
      rajada(t + k, 'bandpass', 1300, 1.4, 0.32 * vel, 0.001, 0.015, canais.clap)
    }
    rajada(t + 0.033, 'bandpass', 1100, 1.1, 0.34 * vel, 0.002, 0.22, canais.clap)
  }

  // hat aberto: chiado longo
  function hatAberto(t, vel = 0.16) {
    rajada(t, 'highpass', 6500 + e.hat * 4000, 0.6, vel, 0.002, 0.3, canais.openhat)
  }

  // rumble: grave rouco que "respira" entre os kicks
  function rumble(t, dur) {
    const filtro = ctx.createBiquadFilter()
    filtro.type = 'lowpass'
    filtro.Q.value = 3
    filtro.frequency.setValueAtTime(240, t)
    filtro.frequency.exponentialRampToValueAtTime(70, t + dur)
    const g = ctx.createGain()
    envelope(g, t, 0.7, 0.012, dur)
    filtro.connect(g)
    g.connect(canais.rumble)
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(mtof(e.raiz) * 1.4, t)
    o.frequency.exponentialRampToValueAtTime(mtof(e.raiz), t + 0.05)
    o.connect(filtro)
    o.start(t)
    o.stop(t + dur + 0.05)
    rajada(t, 'lowpass', 130, 1, 0.45, 0.01, dur, canais.rumble)
  }

  // stab house: acorde curto e seco (quadrada + serra)
  function stabHouse(t, midi) {
    const filtro = ctx.createBiquadFilter()
    filtro.type = 'lowpass'
    filtro.Q.value = 3
    filtro.frequency.setValueAtTime(3800, t)
    filtro.frequency.exponentialRampToValueAtTime(600, t + 0.18)
    const g = ctx.createGain()
    envelope(g, t, 0.1, 0.002, 0.2)
    filtro.connect(g)
    g.connect(canais.stab2)
    g.connect(enviaEco)
    for (const semitons of ESCALAS[remix.escala].acorde) {
      for (const tipo of ['square', 'sawtooth']) {
        const o = ctx.createOscillator()
        o.type = tipo
        o.frequency.value = mtof(midi + semitons)
        o.connect(filtro)
        o.start(t)
        o.stop(t + 0.28)
      }
    }
  }

  // ---------------------------------------------------------------- arquivos de áudio

  function pararFonte(lado, dedo) {
    const f = fontes[lado][dedo]
    if (!f || !ctx) return
    fontes[lado][dedo] = null
    try {
      f.g.gain.cancelScheduledValues(ctx.currentTime)
      f.g.gain.setTargetAtTime(0, ctx.currentTime, 0.02)
      f.src.stop(ctx.currentTime + 0.12)
    } catch {
      /* já tinha parado */
    }
  }

  function tocarArquivo(t, id, lado, dedo) {
    const a = SONS_ARQUIVO[id]
    if (!a || !ctx) return
    pararFonte(lado, dedo)
    const src = ctx.createBufferSource()
    src.buffer = a.buffer
    const g = ctx.createGain()
    g.gain.value = 0.9
    src.connect(g)
    g.connect(canais.arquivos || mestre)
    src.start(t)
    fontes[lado][dedo] = { src, g }
  }

  // ---------------------------------------------------------------- sons do app
  // cada som tem: passo (o que toca em cada 1/16 enquanto o dedo está levantado),
  // subir (efeito ao levantar o dedo) e descer (efeito ao fechar o dedo)

  const SONS = {
    bumbo: {
      passo: (i, p, c, t, R) => {
        // no último compasso de cada 4, o bumbo vira um rolo de colcheias rápidas
        const rolo4 = c % 4 === 3 && p >= 12
        if (rolo4 || R.bumbo.includes(p)) bumbo(t)
      },
      // sobe = riser + impacto | fecha = queda de grave
      subir: (t) => {
        sopro(t, true, 0.5, 0.22)
        bumbo(t + 0.5)
        varrer(t + 0.5, 'sine', 90, 30, 0.9, 1)
      },
      descer: (t) => varrer(t, 'sine', 120, 24, 0.9, 0.9),
    },
    baixo: {
      passo: (i, p, c, t, R) => {
        if (p in R.baixo) baixo808(t, e.raiz + R.baixo[p], PASSO * 3)
      },
      // sobe = 808 desliza para cima | fecha = desliza para baixo
      subir: (t) => deslizeBaixo(t, e.raiz, e.raiz + 12, 0.5),
      descer: (t) => deslizeBaixo(t, e.raiz + 12, e.raiz - 5, 0.6),
    },
    caixa: {
      passo: (i, p, c, t, R) => {
        if (R.caixa.includes(p)) {
          palmas(t)
          caixa(t, 0.8)
        }
      },
      // sobe = rolo de caixa | fecha = palma gigante com cauda
      subir: (t) => rolo(t, 10, 0.7, (tt, v) => caixa(tt, v)),
      descer: (t) => {
        rajada(t, 'bandpass', 1600, 1, 0.45, 0.003, 0.8)
        rajada(t, 'highpass', 3000, 0.5, 0.12, 0.003, 0.7)
      },
    },
    hat: {
      passo: (i, p, c, t, R) => {
        if (R.hats === 'quartos') {
          if (p % 4 === 0) hat(t, false, 0.09)
        } else if (R.hats === 'rolos' && (p === 6 || p === 14)) {
          rolo(t, 4, PASSO * 0.9, (tt, v) => hat(tt, false, 0.04 + 0.05 * v))
        } else hat(t, false, p % 4 === 0 ? 0.1 : p % 2 === 1 ? 0.045 : 0.075)
      },
      // sobe = rolo de hi-hat | fecha = 3 hats decrescendo
      subir: (t) => rolo(t, 14, 0.6, (tt, v) => hat(tt, false, 0.04 + 0.14 * v)),
      descer: (t) => [0, 0.05, 0.1].forEach((k, j) => hat(t + k, false, 0.14 - 0.04 * j)),
    },
    prato: {
      passo: (i, p, c, t) => {
        if (p % 4 === 2) hat(t, true, 0.14)
        if (i % 128 === 0) prato(t)
      },
      // sobe = prato de ataque | fecha = prato ao contrário
      subir: (t) => prato(t, 0.22),
      descer: (t) => {
        sopro(t, true, 0.8, 0.16, 2000, 9000)
        hat(t + 0.8, true, 0.15)
      },
    },
    stab: {
      passo: (i, p, c, t) => {
        if (STAB_PASSOS.includes(p)) pad(t, e.raiz + 24)
      },
      // sobe = acorde brilhante | fecha = rumble grave
      subir: (t) => acordeBrilho(t, e.raiz + 24),
      descer: (t) => {
        varrer(t, 'sine', 70, 28, 1.4, 0.6)
        rajada(t, 'lowpass', 160, 1, 0.4, 0.05, 1.4)
      },
    },
    lead: {
      passo: (i, p, c, t) => {
        if (p % 2 === 0) {
          const g = ARPEJO[(i / 2) % ARPEJO.length] + e.desloc
          lead(t, BASE_LEAD + grau(g), PASSO * 1.8)
        }
      },
      // sobe = corrida do arpejo para cima | fecha = para baixo
      subir: (t) =>
        corrida(t, (tt, s) => lead(tt, BASE_LEAD + s, PASSO * 1.2), true, 8, PASSO * 0.75, e.desloc),
      descer: (t) =>
        corrida(t, (tt, s) => lead(tt, BASE_LEAD + s, PASSO * 1.2), false, 8, PASSO * 0.75, e.desloc),
    },
    hoover: {
      passo: (i, p, c, t) => {
        const k = HOOVER_PASSOS.indexOf(p)
        if (k >= 0) hoover(t, BASE_LEAD + grau(HOOVER_GRAUS[k] + e.desloc + (c % 2) * 2), PASSO * 2.5)
      },
      // sobe = hoovers subindo | fecha = hoovers descendo
      subir: (t) => corrida(t, (tt, s) => hoover(tt, BASE_LEAD + s, 0.25), true, 6, 0.06, e.desloc),
      descer: (t) => corrida(t, (tt, s) => hoover(tt, BASE_LEAD + s, 0.25), false, 6, 0.06, e.desloc),
    },
    acid: {
      passo: (i, p, c, t) => {
        if (p in ACID_PASSOS) acid(t, e.raiz + 12 + ACID_PASSOS[p], PASSO * 0.9)
      },
      // sobe = acid desliza abrindo o filtro | fecha = desliza fechando
      subir: (t) => acid(t, e.raiz + 36, 0.6, e.raiz + 12),
      descer: (t) => acid(t, e.raiz + 12, 0.6, e.raiz + 36),
    },
    perc: {
      passo: (i, p, c, t) => {
        if (p in PERC_PASSOS) tom(t, 50 + PERC_PASSOS[p])
        if (p === 15) rajada(t, 'bandpass', 3200, 3, 0.18, 0.001, 0.03, canais.perc) // rim
      },
      // sobe = laser subindo | fecha = laser caindo + tom
      subir: (t) => varrer(t, 'square', 250, 3500, 0.22, 0.07, canais.perc),
      descer: (t) => {
        varrer(t, 'square', 3500, 250, 0.22, 0.07, canais.perc)
        tom(t + 0.2, 50, 0.3)
      },
    },
    kick: {
      passo: (i, p, c, t, R) => {
        if (R.bumbo.includes(p)) kick(t)
      },
      // sobe = rolo de kicks + impacto | fecha = queda de grave
      subir: (t) => {
        rolo(t, 6, 0.4, (tt) => kick(tt))
        kick(t + 0.45)
      },
      descer: (t) => varrer(t, 'sine', 140, 30, 0.5, 0.8, canais.kick),
    },
    clap: {
      passo: (i, p, c, t, R) => {
        if (R.caixa.includes(p)) clap(t)
      },
      // sobe = rolo de claps | fecha = clap com cauda
      subir: (t) => rolo(t, 8, 0.5, (tt, v) => clap(tt, v)),
      descer: (t) => {
        clap(t)
        rajada(t + 0.04, 'bandpass', 1200, 1, 0.2, 0.003, 0.6, canais.clap)
      },
    },
    hats: {
      passo: (i, p, c, t) => {
        hat(t, false, p % 4 === 0 ? 0.11 : p % 4 === 2 ? 0.03 : p % 2 === 1 ? 0.05 : 0.08, canais.hats)
      },
      // sobe = rolo de hats | fecha = 3 hats decrescendo
      subir: (t) => rolo(t, 12, 0.5, (tt, v) => hat(tt, false, 0.04 + 0.12 * v, canais.hats)),
      descer: (t) => [0, 0.05, 0.1].forEach((k, j) => hat(t + k, false, 0.13 - 0.04 * j, canais.hats)),
    },
    openhat: {
      passo: (i, p, c, t) => {
        if (p % 4 === 2) hatAberto(t)
      },
      // sobe = hat aberto forte | fecha = chiado subindo + hat aberto
      subir: (t) => hatAberto(t, 0.24),
      descer: (t) => {
        sopro(t, true, 0.5, 0.14, 3000, 10000)
        hatAberto(t + 0.5, 0.2)
      },
    },
    rumble: {
      passo: (i, p, c, t) => {
        if (p % 4 === 2) rumble(t, PASSO * 2.2)
      },
      // sobe = grave subindo + rumble longo | fecha = queda de grave
      subir: (t) => {
        sopro(t, true, 0.8, 0.2, 60, 600)
        rumble(t + 0.8, 1.2)
      },
      descer: (t) => varrer(t, 'sine', 80, 22, 1.2, 0.6, canais.rumble),
    },
    stab2: {
      passo: (i, p, c, t) => {
        if ([2, 6, 10, 13].includes(p)) stabHouse(t, e.raiz + 24)
      },
      // sobe = 3 stabs subindo | fecha = stab grave + queda
      subir: (t) => [0, 3, 7].forEach((s, j) => stabHouse(t + j * 0.14, e.raiz + 24 + s)),
      descer: (t) => {
        stabHouse(t, e.raiz + 12)
        varrer(t, 'sine', 120, 40, 0.5, 0.3, canais.stab2)
      },
    },
  }

  // efeito de subida/descida do dedo, seja som do app ou arquivo
  function efeitoDo(lado, dedo) {
    const id = mapa[lado][dedo]
    if (SONS[id]) return SONS[id]
    return {
      subir: (t) => tocarArquivo(t, id, lado, dedo),
      descer: () => pararFonte(lado, dedo),
    }
  }

  // ---------------------------------------------------------------- sequenciador

  function tocarPasso(i, t) {
    const p = i % 16
    const compasso = Math.floor(i / 16)
    const R = RITMOS[remix.ritmo]

    // repete o que foi gravado (liga/desliga camadas e dispara os efeitos dos dedos)
    if (grav.reproduzindo && grav.eventos.length) {
      const n = grav.compassos * 16
      const pos = i % n
      const volta = Math.floor(i / n)
      for (const ev of grav.eventos) {
        if (ev.p !== pos || ev.v === volta) continue // o que acabou de ser gravado já tocou ao vivo
        camadaG[ev.lado][ev.dedo] = ev.sobe
        const fx = efeitoDo(ev.lado, ev.dedo)
        if (ev.sobe) fx.subir(t)
        else fx.descer(t)
      }
    }

    for (const lado of ['esq', 'dir']) {
      for (let d = 0; d < 5; d++) {
        if (!on(lado, d)) continue
        const id = mapa[lado][d]
        if (SONS[id]) {
          SONS[id].passo(i, p, compasso, t, R)
        } else {
          const modo = SONS_ARQUIVO[id]?.modo
          if ((modo === 'tempo' && p % 4 === 0) || (modo === 'compasso' && p === 0)) {
            tocarArquivo(t, id, lado, d)
          }
        }
      }
    }
  }

  // agenda as notas um pouco à frente (relógio do áudio é bem mais preciso que o do JS)
  function agendar() {
    if (!ctx) return
    while (proximo < ctx.currentTime + 0.15) {
      tocarPasso(passo, proximo)
      proximo += PASSO
      passo++
    }
  }

  // ---------------------------------------------------------------- relógio e gravador

  function ligarRelogio() {
    if (!ctx || timer) return
    for (const ev of grav.eventos) ev.v = -1
    passo = 0
    proximo = ctx.currentTime + 0.1
    timer = setInterval(agendar, 25)
  }

  // o relógio só para quando nem o efeito nem o loop gravado estão tocando
  function desligarRelogio() {
    if (tocando || grav.reproduzindo) return
    clearInterval(timer)
    timer = 0
  }

  // passo (inteiro) do loop que está tocando agora
  function passoAtual() {
    const n = grav.compassos * 16
    const s = Math.floor(passo - (proximo - ctx.currentTime) / PASSO)
    return ((s % n) + n) % n
  }

  const avisar = () => {
    if (aoMudarGrav) aoMudarGrav(instantaneo())
  }

  function instantaneo() {
    return {
      compassos: grav.compassos,
      gravando: grav.gravando,
      reproduzindo: grav.reproduzindo,
      eventos: grav.eventos.map((ev) => ({ ...ev })),
    }
  }

  function registrar(lado, dedo, sobe) {
    if (!grav.gravando || !ctx || !timer) return
    const n = grav.compassos * 16
    const bruto = Math.round(passo - (proximo - ctx.currentTime) / PASSO) // quantiza em 1/16
    grav.eventos.push({ p: ((bruto % n) + n) % n, v: Math.floor(bruto / n), lado, dedo, sobe })
    avisar()
  }

  // estado de cada camada gravada no ponto atual do loop
  function recalcularCamadaG() {
    const pos = ctx && timer ? passoAtual() : 0
    for (const lado of ['esq', 'dir']) {
      for (let d = 0; d < 5; d++) {
        const evs = grav.eventos.filter((ev) => ev.lado === lado && ev.dedo === d).sort((a, b) => a.p - b.p)
        if (!evs.length) {
          camadaG[lado][d] = false
          continue
        }
        const antes = evs.filter((ev) => ev.p <= pos)
        camadaG[lado][d] = (antes.length ? antes[antes.length - 1] : evs[evs.length - 1]).sobe
      }
    }
  }

  function iniciarLoop() {
    grav.reproduzindo = true
    ligarRelogio()
    recalcularCamadaG()
  }

  return {
    // precisa ser chamado dentro de um clique/toque/tecla (política dos navegadores)
    destravar() {
      montar()
      if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {})
    },

    pronto() {
      return !!ctx && ctx.state === 'running'
    },

    iniciar() {
      montar()
      if (!ctx) return
      if (ctx.state !== 'running') ctx.resume().catch(() => {})
      if (tocando) return
      tocando = true
      for (const lado of ['esq', 'dir']) {
        ativas[lado] = null
        camada[lado] = [false, false, false, false, false]
      }
      ligarRelogio()
    },

    parar() {
      tocando = false
      if (grav.gravando) {
        grav.gravando = false
        avisar()
      }
      for (const lado of ['esq', 'dir']) for (let d = 0; d < 5; d++) pararFonte(lado, d)
      desligarRelogio()
    },

        // controle de volume individual da mesa de som (0 a 1.5)
    definirVolume(id, valor) {
      const v = Math.max(0, Math.min(1.5, Number(valor) || 0))
      volumes[id] = v
      if (canais[id] && ctx) {
        canais[id].gain.setTargetAtTime(v, ctx.currentTime, 0.015)
      }
    },

    definirVolumes(novos) {
      if (!novos) return
      for (const [id, v] of Object.entries(novos)) {
        this.definirVolume(id, v)
      }
    },

    obterVolumes() {
      return { ...volumes }
    },

    // volume geral (0 a 1); a tela liga isso ao progresso da animação
    nivel(v) {
      if (!mestre) return
      const previa = performance.now() < previaAte
      // o loop gravado toca no volume cheio, mesmo com o efeito de câmera desligado
      mestre.gain.value = (previa || grav.reproduzindo ? Math.max(limitar(v), 1) : limitar(v)) * 0.85
    },

    // estados: 5 booleans (polegar, indicador, médio, anelar, mindinho): true = dedo levantado.
    // A 1ª chamada de cada mão só registra onde estão os dedos (tudo mudo, sem efeitos).
    // Depois, levantar um dedo liga a camada dele e dispara o efeito de subida;
    // fechar desliga a camada e dispara o efeito de descida.
    dedos(lado, estados) {
      const anterior = ativas[lado]
      ativas[lado] = estados.slice()
      if (!anterior) {
        // mão voltou para a câmera: os dedos mantidos continuam como estavam
        camada[lado] = camada[lado].map((v, i) => (manter[lado][i] ? v : COMECAM_LIGADAS ? estados[i] : false))
        return
      }
      const agora = performance.now()
      const t = ctx ? ctx.currentTime + 0.02 : 0
      let disparados = 0
      for (let i = 0; i < 5; i++) {
        if (estados[i] === anterior[i]) continue
        camada[lado][i] = estados[i] // liga/desliga a camada na hora
        registrar(lado, i, estados[i])
        if (!estados[i]) pararFonte(lado, i) // dedo fechado: para o arquivo de áudio
        if (!ctx || disparados >= 3) continue
        if (agora - ultimoEfeito[lado][i] < 300) continue // evita repetir se o dedo tremer
        ultimoEfeito[lado][i] = agora
        const fx = efeitoDo(lado, i)
        if (estados[i]) fx.subir(t)
        else fx.descer(t)
        disparados++
      }
    },

    // a mão saiu da câmera: silencia as camadas dela (sem efeitos)
    soltar(lado) {
      ativas[lado] = null
      for (let d = 0; d < 5; d++) {
        if (manter[lado][d]) continue // dedo mantido: continua tocando (inclusive arquivo de áudio)
        if (camada[lado][d]) registrar(lado, d, false)
        camada[lado][d] = false
        pararFonte(lado, d)
      }
    },

    // quais dedos continuam tocando sem aparecer: { esq: [5 booleans], dir: [5 booleans] }
    definirManter(novo) {
      for (const lado of ['esq', 'dir']) {
        for (let d = 0; d < 5; d++) {
          manter[lado][d] = !!novo[lado][d]
          // dedo que deixou de ser mantido e cuja mão não está na câmera: silencia na hora
          if (!manter[lado][d] && !ativas[lado]) {
            camada[lado][d] = false
            pararFonte(lado, d)
          }
        }
      }
    },

    // esq/dir: { angulo (graus, 0 = dedos para cima), y (0 topo a 1 base) }
    controlar({ esq, dir }) {
      if (!ctx) return
      if (esq) {
        // inclinar a mão esquerda troca a nota do baixo 808 (e do acid/pad)
        const idx = Math.round(limitar((esq.angulo + 60) / 120) * (PENTATONICA_ATUAL.length - 1))
        e.raiz = BASE_BAIXO + PENTATONICA_ATUAL[idx]
        // mão mais alta = hi-hats mais brilhantes
        e.hat = limitar((0.85 - esq.y) / 0.6)
      }
      if (dir) {
        // inclinar a mão direita sobe/desce o arpejo e os hoovers pela escala
        e.desloc = Math.round(limitar((dir.angulo + 60) / 120) * 8) - 3
        // mão mais alta = som mais aberto e mais eco
        e.brilho = limitar((0.85 - dir.y) / 0.6)
        const agora = ctx.currentTime
        filtroLead.frequency.setTargetAtTime(500 + Math.pow(e.brilho, 1.6) * 6500, agora, 0.08)
        enviaEco.gain.setTargetAtTime(0.1 + e.brilho * 0.4, agora, 0.1)
      }
    },

    // remixagem: { ritmo?, instrumentos?, escala? }
    remixar(op) {
      Object.assign(remix, op)
      PENTATONICA_ATUAL = ESCALAS[remix.escala].notas
    },

    // define qual som cada dedo toca: { esq: [5 ids], dir: [5 ids] }
    definirMapa(novo) {
      for (const lado of ['esq', 'dir']) {
        for (let d = 0; d < 5; d++) pararFonte(lado, d)
        mapa[lado] = novo[lado].slice()
      }
    },

    // troca o som de um dedo
    mapear(lado, dedo, id) {
      pararFonte(lado, dedo)
      mapa[lado][dedo] = id
    },

    // carrega um arquivo de áudio do computador (mp3, wav, ogg, m4a...)
    async carregarArquivo(arquivo) {
      montar()
      if (!ctx) throw new Error('Este navegador não suporta áudio.')
      const dados = await arquivo.arrayBuffer()
      const buffer = await ctx.decodeAudioData(dados)
      const id = 'arq:' + ++contadorArquivo
      const nome = arquivo.name.replace(/\.[^.]+$/, '')
      SONS_ARQUIVO[id] = { nome, buffer, modo: 'uma' }
      return { id, nome, modo: 'uma' }
    },

    // toca o som uma vez para ouvir como ele é (funciona mesmo com o efeito desligado)
    prever(id) {
      montar()
      if (!ctx) return
      if (ctx.state !== 'running') ctx.resume().catch(() => {})
      previaAte = performance.now() + 1800
      if (mestre) mestre.gain.value = 0.85
      const t = ctx.currentTime + 0.03
      if (fontePrevia) {
        try {
          fontePrevia.stop()
        } catch {
          /* já tinha parado */
        }
        fontePrevia = null
      }
      if (SONS[id]) {
        // som do app: toca um trecho curto do próprio padrão
        SONS[id].subir(t)
      } else if (SONS_ARQUIVO[id]) {
        const src = ctx.createBufferSource()
        src.buffer = SONS_ARQUIVO[id].buffer
        const g = ctx.createGain()
        g.gain.value = 0.9
        src.connect(g)
        g.connect(mestre)
        src.start(t)
        src.stop(t + 4) // pré-escuta de no máximo 4 s
        fontePrevia = src
      }
    },

    // pitch global em semitons (giro das mãos)
    transpor(semitons) {
      TRANSP = semitons
    },

    // ---------------- gravador ----------------
    aoMudarGravacao(fn) {
      aoMudarGrav = fn
    },

    obterGravacao: instantaneo,

    // começa a gravar (o loop passa a tocar junto, para gravar por cima)
    gravar() {
      montar()
      if (!ctx) return
      if (ctx.state !== 'running') ctx.resume().catch(() => {})
      if (grav.gravando) return
      if (!grav.reproduzindo) iniciarLoop()
      grav.gravando = true
      // dedos que já estão levantados entram na gravação a partir daqui
      for (const lado of ['esq', 'dir']) {
        for (let d = 0; d < 5; d++) if (camada[lado][d]) registrar(lado, d, true)
      }
      avisar()
    },

    pararGravar() {
      if (!grav.gravando) return
      grav.gravando = false
      avisar()
    },

    // toca o que foi gravado, em loop
    tocarLoop() {
      montar()
      if (!ctx) return
      if (ctx.state !== 'running') ctx.resume().catch(() => {})
      if (!grav.reproduzindo) iniciarLoop()
      avisar()
    },

    pararLoop() {
      grav.gravando = false
      grav.reproduzindo = false
      for (const lado of ['esq', 'dir']) {
        for (let d = 0; d < 5; d++) {
          camadaG[lado][d] = false
          if (!camada[lado][d]) pararFonte(lado, d)
        }
      }
      desligarRelogio()
      avisar()
    },

    limparGravacao() {
      grav.eventos = []
      for (const lado of ['esq', 'dir']) camadaG[lado] = [false, false, false, false, false]
      for (const lado of ['esq', 'dir']) {
        for (let d = 0; d < 5; d++) if (!camada[lado][d]) pararFonte(lado, d)
      }
      avisar()
    },

    definirCompassos(n) {
      const novo = [1, 2, 4, 8].includes(n) ? n : 4
      grav.compassos = novo
      grav.eventos = grav.eventos.filter((ev) => ev.p < novo * 16)
      for (const ev of grav.eventos) ev.v = -1
      if (grav.reproduzindo) recalcularCamadaG()
      avisar()
    },

    // posição do loop de 0 a 1 (-1 = não está tocando)
    posicaoLoop() {
      if (!ctx || !timer || !grav.reproduzindo) return -1
      const n = grav.compassos * 16
      const s = passo - (proximo - ctx.currentTime) / PASSO
      return (((s % n) + n) % n) / n
    },

    fechar() {
      tocando = false
      grav.reproduzindo = false
      grav.gravando = false
      clearInterval(timer)
      timer = 0
      if (ctx) ctx.close().catch(() => {})
      ctx = null
    },
  }
}