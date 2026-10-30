import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, HandLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision'
import './tela1.css'
import {
  criarMusica,
  RITMOS,
  INSTRUMENTOS,
  ESCALAS,
  SONS_BASE,
  MAPA_PADRAO,
  listarArquivos,
  configurarArquivo,
} from './musica.js'

// ---- giro da mão: pitch + remixagem ----
const GIRO_LIMIAR = 55 // graus: girar além disso dispara a remixagem
const GIRO_SEGURAR_MS = 350 // tempo segurando o giro para confirmar
const GIRO_ESPERA_MS = 1400 // intervalo mínimo entre duas remixagens
const PITCH_MAX = 5 // semitons para cima/baixo conforme a inclinação média
const CATEGORIAS = {
  ritmo: { titulo: 'Padrão do ritmo', opcoes: RITMOS },
  instrumentos: { titulo: 'Instrumentos ativos', opcoes: INSTRUMENTOS },
  escala: { titulo: 'Escala / acorde', opcoes: ESCALAS },
}

// ---- mãos do painel: ordem visual dos dedos (índice 0 = polegar ... 4 = mindinho) ----
const NOMES_DEDOS = ['Polegar', 'Indicador', 'Médio', 'Anelar', 'Mindinho']
const ORDEM_MAOS = { esq: [4, 3, 2, 1, 0], dir: [0, 1, 2, 3, 4] } // polegares ficam virados para o centro
const ALTURA_DEDO = [64, 88, 100, 90, 70]
const MODOS_ARQUIVO = { uma: 'Uma vez', tempo: 'A cada tempo', compasso: 'A cada compasso' }

const COLUNAS = 380 // mais colunas = letras menores e mais nitidez (e mais pesado)
const PROPORCAO_CHAR = 0.6 // largura / altura do caractere (Courier New = 0.6em)

// do mais claro (vazio) ao mais denso: 70 níveis, bem mais nítido que poucos caracteres
const RAMPA =
  ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$'

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const MODELO_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite'

// ---- ajuste fino do efeito (0 a 1) ----
const OPACIDADE_ASCII = 0.9 // quanto o texto ASCII aparece (1 = bem forte)
// enquadramento da câmera:
// 'esticar' = ocupa a tela toda, sem zoom e sem bordas (deforma levemente se a proporção da janela for diferente)
// 'inteira' = quadro todo sem deformar, mas com faixas pretas
// 'cobrir'  = ocupa a tela toda sem deformar, mas corta as bordas (efeito de zoom)
const MODO_CAMERA = 'esticar'
const REMOVER_FUNDO = true // true = separa a pessoa do fundo (o fundo vira um caractere só)

// ---- suavidade visual ----
const FUNDO_IDX = 1 // caractere do fundo = RAMPA[1] ('.'): sempre o mesmo, sempre parado
const PISO_PESSOA = 0.3 // corpo/mãos nunca ficam mais "vazios" que isso (sempre diferentes do fundo)
const SUAVIDADE_BRILHO = 0.3 // 0 a 1: quanto menor, mais devagar o caractere muda (menos tremor)
const SUAVIDADE_CONTRASTE = 0.08 // quão devagar o contraste automático se ajusta
const SUAVIDADE_MASCARA = 0.35 // quão rápido a borda do corpo acompanha o movimento
const HISTERESE = 2 // o caractere só troca se o brilho mudar pelo menos esses níveis da rampa

// ---- desempenho automático ----
// O efeito começa na qualidade máxima (COLUNAS) e só reduz sozinho se o
// aparelho não estiver aguentando. Nunca sobe de novo, para não oscilar.
const NIVEIS_COLUNAS = [COLUNAS, 320, 260, 210, 170, 130, 100]
// false = o número de colunas nunca muda sozinho, então o tamanho das letras fica sempre igual.
// (true = reduz as colunas se o aparelho estiver lento, mas aí as letras crescem de repente)
const REDUZIR_QUALIDADE_SOZINHO = false
const LARGURA_MIN_CHAR = 2.5 // px: abaixo disso o caractere não é legível mesmo
const FPS_MIN_ALVO = 36 // se a tela cair abaixo disso, reduz a qualidade
const TRABALHO_MAX_MS = 18 // se o processamento de um frame passar disso, reduz
const INTERVALO_SEG_MIN = 33 // ms: a máscara é recalculada no máximo ~30x/s
const INTERVALO_SEG_MAX = 200 // ms: e no mínimo ~5x/s

const CODIGOS = Uint16Array.from(RAMPA, (c) => c.charCodeAt(0))
const decodificador = new TextDecoder('utf-16le')

const limitar = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v))

// ---- detecção das mãos ----
const MAOS_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
const INTERVALO_MAOS_MIN = 66 // ms: detecta as mãos no máximo ~15x/s
const INTERVALO_MAOS_MAX = 250
const DETECCOES_PARA_LIGAR = 3 // ~0,2 s com as duas mãos abertas liga o efeito
const DETECCOES_PARA_CONFIRMAR = 2 // ~0,15 s para confirmar punho fechado / mão reaberta
const FECHAMENTOS_PARA_DESLIGAR = 2 // abrir e fechar a mão 2 vezes desliga o efeito
const JANELA_FECHAMENTOS = 3500 // ms: tempo máximo para dar os 2 fechamentos
const DURACAO_ENTRADA = 700 // ms: tempo para a região ASCII entre as mãos aparecer
const DURACAO_SAIDA = 700 // ms: some do mesmo jeito
const ATRASO_ENTRADA = 100 // ms: pequena espera antes do ASCII começar a aparecer
// ---- região ASCII entre as mãos ----
// pontas dos dedos: polegar, indicador, médio, anelar, mindinho
const PONTAS = [4, 8, 12, 16, 20]
const SUAVIDADE_PONTOS = 0.5 // 0 a 1: quão rápido as linhas acompanham os dedos
const PRESENCA_MS = 400 // sem ver as duas mãos por mais que isso: a região some

// curva suave nas duas pontas (começa e termina devagar)
const suavizar = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t)

// [ponta, junta do meio] dos dedos indicador, médio, anelar e mindinho
const DEDOS = [
  [8, 6],
  [12, 10],
  [16, 14],
  [20, 18],
]

// mão aberta = os 4 dedos esticados (ponta bem mais longe do pulso que a junta)
// e o polegar afastado da palma
function maoAberta(pts, vw, vh) {
  const d = (a, b) => Math.hypot((a.x - b.x) * vw, (a.y - b.y) * vh)
  for (const [ponta, junta] of DEDOS) {
    if (d(pts[ponta], pts[0]) < d(pts[junta], pts[0]) * 1.1) return false
  }
  return d(pts[4], pts[17]) > d(pts[3], pts[17]) * 1.05
}

// estado de cada dedo: [polegar, indicador, médio, anelar, mindinho], true = levantado.
// Usa histerese (o dedo só muda de estado com folga) para não ficar piscando.
function dedosDaMao(pts, vw, vh, anterior) {
  const d = (a, b) =>
    Math.hypot((a.x - b.x) * vw, (a.y - b.y) * vh, ((a.z || 0) - (b.z || 0)) * vw)
  const razoes = [d(pts[4], pts[17]) / Math.max(1e-6, d(pts[3], pts[17]))] // polegar afastado da palma
  for (const [ponta, junta] of DEDOS) {
    razoes.push(d(pts[ponta], pts[0]) / Math.max(1e-6, d(pts[junta], pts[0])))
  }
  return razoes.map((r, i) => (anterior[i] ? r > 1.0 : r > 1.12))
}

const TODOS_ABERTOS = () => [true, true, true, true, true]
const AUSENCIA_MS = 1500 // mão fora da câmera por mais que isso: silencia as camadas dela

// ---- gravador (pista na parte de baixo) ----
const OPCOES_COMPASSOS = [1, 2, 4, 8]
const GRAV_VAZIA = { compassos: 4, gravando: false, reproduzindo: false, eventos: [] }

// transforma os eventos (dedo levantou / fechou) de um dedo em blocos [início, fim] em passos de 1/16
function blocosDoDedo(eventos, compassos, lado, dedo) {
  const n = compassos * 16
  const evs = eventos.filter((ev) => ev.lado === lado && ev.dedo === dedo).sort((a, b) => a.p - b.p)
  if (!evs.length) return []
  const blocos = []
  let ini = evs[evs.length - 1].sobe ? 0 : null // terminou ligado: já começa ligado no loop
  for (const ev of evs) {
    if (ev.sobe) {
      if (ini === null) ini = ev.p
    } else if (ini !== null) {
      blocos.push([ini, ev.p])
      ini = null
    }
  }
  if (ini !== null) blocos.push([ini, n])
  return blocos
}

function Tela1() {
  const videoRef = useRef(null)
  const preRef = useRef(null)
  const palcoRef = useRef(null)
  const buracoRef = useRef(null) // recorta a câmera onde o ASCII aparece
  const linhasRef = useRef(null) // linhas entre os dedos
  // true = o navegador ainda bloqueia o áudio (precisa de um toque/clique)
  const [somBloqueado, setSomBloqueado] = useState(false)
  // 'aguardando' | 'liberado' | 'negado'
  const [status, setStatus] = useState('aguardando')
  const [tentativa, setTentativa] = useState(0)
  // true = duas mãos abertas na câmera (efeito ASCII ligado)
  const [efeito, setEfeito] = useState(false)
  // remixagem escolhida no painel (ou pelo giro da mão)
  const [remix, setRemix] = useState({ ritmo: 'four', instrumentos: 'todos', escala: 'pentaMenor' })
  const [alvoGiro, setAlvoGiro] = useState('ritmo') // o que o giro da mão troca
  const [pitch, setPitch] = useState(0)
  const [giroFlash, setGiroFlash] = useState(0)
  const musicaRef = useRef(null)
  // som de cada dedo, dedo selecionado no painel e arquivos do computador
  const [mapa, setMapa] = useState(() => ({ esq: [...MAPA_PADRAO.esq], dir: [...MAPA_PADRAO.dir] }))
  const [dedoSel, setDedoSel] = useState({ lado: 'dir', dedo: 1 })
  const [arquivos, setArquivos] = useState(() => listarArquivos())
  const [erroSom, setErroSom] = useState('')
  // gravador: estado vindo da música + pista aberta (nomes dos dedos) ou compacta
  const [gravacao, setGravacao] = useState(GRAV_VAZIA)
  const [pistaAberta, setPistaAberta] = useState(false)
  const cabecoteRef = useRef(null)
  // por dedo: true = o som dele continua mesmo quando a mão sai da câmera
  const [manter, setManter] = useState(() => ({
    esq: [false, false, false, false, false],
    dir: [false, false, false, false, false],
  }))
  const manterRef = useRef(manter)
  manterRef.current = manter
  const mapaRef = useRef(mapa)
  mapaRef.current = mapa
  const remixRef = useRef(remix)
  const alvoGiroRef = useRef(alvoGiro)
  remixRef.current = remix
  alvoGiroRef.current = alvoGiro

  const escolher = (cat, chave) => {
    const novo = { ...remixRef.current, [cat]: chave }
    remixRef.current = novo
    setRemix(novo)
    musicaRef.current?.remixar(novo)
  }

  const nomeDoSom = (id, curto = false) => {
    if (SONS_BASE[id]) return curto ? SONS_BASE[id].curto : SONS_BASE[id].nome
    return arquivos.find((a) => a.id === id)?.nome ?? '—'
  }

  const trocarSom = (id) => {
    const { lado, dedo } = dedoSel
    const novo = { ...mapaRef.current, [lado]: mapaRef.current[lado].map((s, i) => (i === dedo ? id : s)) }
    mapaRef.current = novo
    setMapa(novo)
    musicaRef.current?.mapear(lado, dedo, id)
    musicaRef.current?.prever(id)
  }

  const adicionarArquivos = async (ev) => {
    const lista = Array.from(ev.target.files ?? [])
    ev.target.value = ''
    setErroSom('')
    for (const f of lista) {
      try {
        const novo = await musicaRef.current.carregarArquivo(f)
        setArquivos(listarArquivos())
        trocarSom(novo.id) // já coloca no dedo selecionado (o último arquivo escolhido fica nele)
      } catch (err) {
        console.error(err)
        setErroSom(`Não consegui abrir "${f.name}". Tente mp3, wav, ogg ou m4a.`)
      }
    }
  }

  const aplicarManter = (novo) => {
    manterRef.current = novo
    setManter(novo)
    musicaRef.current?.definirManter(novo)
  }

  // liga/desliga só o dedo selecionado no painel
  const alternarDedoManter = () => {
    const { lado, dedo } = dedoSel
    const atual = manterRef.current
    aplicarManter({ ...atual, [lado]: atual[lado].map((v, i) => (i === dedo ? !v : v)) })
  }

  // liga todos os 10 dedos (ou desliga todos, se já estiverem todos ligados)
  const todosManter = manter.esq.every(Boolean) && manter.dir.every(Boolean)
  const alternarTodosManter = () => {
    const v = !(manterRef.current.esq.every(Boolean) && manterRef.current.dir.every(Boolean))
    aplicarManter({ esq: Array(5).fill(v), dir: Array(5).fill(v) })
  }

  const mudarModo = (id, modo) => {
    configurarArquivo(id, { modo })
    setArquivos(listarArquivos())
  }

  // ---- gravador ----
  const alternarGravar = () => {
    const m = musicaRef.current
    if (!m) return
    if (gravacao.gravando) m.pararGravar()
    else m.gravar()
  }
  const alternarLoop = () => {
    const m = musicaRef.current
    if (!m) return
    if (gravacao.reproduzindo) m.pararLoop()
    else m.tocarLoop()
  }
  const limparGravacao = () => musicaRef.current?.limparGravacao()
  const mudarCompassos = (ev) => musicaRef.current?.definirCompassos(Number(ev.target.value))

  // 1) pede permissão da câmera
  useEffect(() => {
    let cancelado = false
    setStatus('aguardando')

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((s) => {
        s.getTracks().forEach((t) => t.stop()) // só testava a permissão
        if (!cancelado) setStatus('liberado')
      })
      .catch((e) => {
        console.error(e)
        if (!cancelado) setStatus('negado')
      })

    return () => {
      cancelado = true
    }
  }, [tentativa])

  // 2) liberado: abre a câmera, carrega o modelo de recorte e desenha o ASCII
  useEffect(() => {
    if (status !== 'liberado') return

    let stream = null
    let segmenter = null
    let modelo = 'carregando' // 'carregando' | 'ok' | 'falhou'
    let cancelado = false
    let raf = 0
    let ultimoTempo = -1

    // ---- mãos / ligar e desligar o efeito ----
    let maos = null
    let maosEstado = 'carregando' // 'carregando' | 'ok' | 'falhou'
    let ativo = false
    let positivos = 0
    let punhos = 0 // detecções seguidas com punho fechado
    let abertas = 0 // detecções seguidas sem punho
    let punhoContado = false // este fechamento já foi contado
    let estadoDedos = { esq: TODOS_ABERTOS(), dir: TODOS_ABERTOS() }
    let ultimaVista = { esq: 0, dir: 0 }
    let fechamentos = [] // instantes em que a mão fechou

    // ---- música ----
    const musica = criarMusica()
    musica.remixar(remixRef.current)
    musica.definirMapa(mapaRef.current)
    musica.definirManter(manterRef.current)
    musicaRef.current = musica
    musica.aoMudarGravacao(setGravacao)
    setGravacao(musica.obterGravacao())
    // ---- giro / cor ----
    let giroDesde = 0
    let giroSentido = 0
    let ultimoRemix = 0
    let pitchAtual = 0
    let centroAnterior = null
    let energia = 0 // quanto as mãos estão se mexendo
    let matiz = 200 // cor das letras (oklch hue)
    let corAplicada = ''
    let somBloq = false
    const destravar = () => musica.destravar()
    const EVENTOS_DESTRAVAR = ['pointerdown', 'keydown', 'touchstart']
    EVENTOS_DESTRAVAR.forEach((ev) => window.addEventListener(ev, destravar))
    let ultimaMao = -Infinity
    let intervaloMao = INTERVALO_MAOS_MIN
    let emaMao = 0
    setEfeito(false)

    // ---- região ASCII: polígono entre os dedos das duas mãos ----
    let alvoPontas = null // { esq: [5 pontos], dir: [5 pontos] } normalizados (0 a 1) no vídeo
    let pontosAtuais = null // 10 pontos suavizados (esq 0-4, dir 5-9)
    let ultimaDuasMaos = -Infinity
    let fatorMaos = 0 // 0 = mãos sumiram, 1 = mãos visíveis (fade da região)
    // 'desligado' | 'entrando' | 'ligado' | 'saindo'
    let fase = 'desligado'
    let progresso = 0 // 0 = sem ASCII, 1 = ASCII na tela toda (sobe na entrada, desce na saída)
    let esperaAte = 0 // só começa a entrar depois desse instante (atraso)
    let ultimoAnim = 0
    // tamanho da área da câmera (igual à janela, ou na proporção da câmera no modo 'inteira')
    let palcoW = window.innerWidth
    let palcoH = window.innerHeight
    let alfaEf = new Float32Array(0) // onda de entrada por célula (0 = ainda não chegou, 1 = chegou)
    let alvoMascara = new Float32Array(0) // máscara da pessoa mais recente (alfa caminha até ela)
    let semAlvo = true // true = a próxima máscara é aplicada direto, sem suavizar
    let idxPrev = new Uint8Array(0) // caractere anterior de cada célula (para a histerese)
    let lumNova = true // true = o próximo frame entra direto no brilho suavizado
    let loS = -1
    let hiS = -1

    const cvBuraco = buracoRef.current
    const cxBuraco = cvBuraco.getContext('2d', { willReadFrequently: true })
    const cvLinhas = linhasRef.current
    const cxLinhas = cvLinhas.getContext('2d')

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.imageSmoothingQuality = 'high'

    // buffers reaproveitados (nada é alocado a cada frame)
    let lum = new Float32Array(0)
    let alfa = new Float32Array(0)
    let alfaValida = false // false = precisa recalcular a máscara
    let codigos = new Uint16Array(0)
    let estiloAplicado = ''

    // ---- qualidade adaptativa ----
    let nivel = 0
    while (
      nivel < NIVEIS_COLUNAS.length - 1 &&
      NIVEIS_COLUNAS[nivel] * LARGURA_MIN_CHAR > window.innerWidth
    ) {
      nivel++
    }
    let colunas = NIVEIS_COLUNAS[nivel]
    let ultimoRaf = 0
    let emaDelta = 16
    let emaTrabalho = 0
    let quadrosDesdeAjuste = 0

    // ---- controle da segmentação (a parte mais pesada) ----
    let ultimaSeg = -Infinity
    let intervaloSeg = INTERVALO_SEG_MIN
    let emaSeg = 0
    let geoAtual = null

    // ---------- carrega o modelo que separa a pessoa do fundo ----------
    async function carregarModelo(vision) {
      try {
        const opcoes = (delegate) => ({
          baseOptions: { modelAssetPath: MODELO_URL, delegate },
          runningMode: 'VIDEO',
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        })
        try {
          segmenter = await ImageSegmenter.createFromOptions(vision, opcoes('GPU'))
        } catch {
          segmenter = await ImageSegmenter.createFromOptions(vision, opcoes('CPU'))
        }
        if (cancelado) {
          segmenter.close()
          segmenter = null
          return
        }
        modelo = 'ok'
      } catch (e) {
        console.error('Falha ao carregar o modelo de recorte:', e)
        modelo = 'falhou' // cai para o ASCII sem remover o fundo
      }
    }

    // ---------- carrega o modelo de mãos (e o de recorte, se estiver ligado) ----------
    async function carregarMaos(vision) {
      try {
        const opcoes = (delegate) => ({
          baseOptions: { modelAssetPath: MAOS_URL, delegate },
          runningMode: 'VIDEO',
          numHands: 2,
        })
        try {
          maos = await HandLandmarker.createFromOptions(vision, opcoes('GPU'))
        } catch {
          maos = await HandLandmarker.createFromOptions(vision, opcoes('CPU'))
        }
        if (cancelado) {
          maos.close()
          maos = null
          return
        }
        maosEstado = 'ok'
      } catch (e) {
        console.error('Falha ao carregar o modelo de mãos:', e)
        maosEstado = 'falhou'
      }
    }

    async function carregarModelos() {
      let vision
      try {
        vision = await FilesetResolver.forVisionTasks(WASM_URL)
      } catch (e) {
        console.error('Falha ao carregar o MediaPipe:', e)
        maosEstado = 'falhou'
        if (REMOVER_FUNDO) modelo = 'falhou'
        return
      }
      if (cancelado) return
      await carregarMaos(vision)
      if (cancelado) return
      if (REMOVER_FUNDO) await carregarModelo(vision)
    }

    // ---------- 2 mãos abertas ligam; com o efeito ligado, as mãos tocam a música ----------
    // ---------- e abrir/fechar a mão 2 vezes desliga ----------
    function detectarMaos(video) {
      if (maosEstado !== 'ok' || !maos) return
      const t = performance.now()
      if (t - ultimaMao < intervaloMao) return
      ultimaMao = t

      let duasAbertas = false
      let lm = []
      const vw = video.videoWidth
      const vh = video.videoHeight
      try {
        lm = maos.detectForVideo(video, t).landmarks || []
        if (lm.length >= 2) {
          // pontas dos dedos de cada mão (esquerda da tela = maior x no vídeo, que é espelhado)
          if (fase !== 'saindo') {
            const ord = [lm[0], lm[1]].sort((a, b) => b[0].x + b[9].x - (a[0].x + a[9].x))
            const pts = (m) => PONTAS.map((i) => ({ x: m[i].x, y: m[i].y }))
            alvoPontas = { esq: pts(ord[0]), dir: pts(ord[1]) }
            ultimaDuasMaos = t
          }
          const afastadas =
            Math.hypot((lm[0][0].x - lm[1][0].x) * vw, (lm[0][0].y - lm[1][0].y) * vh) >
            0.1 * vw // evita contar a mesma mão duas vezes
          duasAbertas = afastadas && maoAberta(lm[0], vw, vh) && maoAberta(lm[1], vw, vh)
        }
      } catch (e) {
        console.error(e)
        maosEstado = 'falhou'
        return
      }

      // a detecção nunca ocupa mais que ~1/3 do tempo
      const dur = performance.now() - t
      emaMao = emaMao === 0 ? dur : emaMao * 0.7 + dur * 0.3
      intervaloMao = limitar(emaMao * 3, INTERVALO_MAOS_MIN, INTERVALO_MAOS_MAX)

      // ----- efeito desligado: 2 mãos abertas ligam -----
      if (!ativo) {
        positivos = duasAbertas ? positivos + 1 : 0
        if (positivos >= DETECCOES_PARA_LIGAR) {
          ativo = true
          punhos = 0
          abertas = 0
          punhoContado = false
          fechamentos = []
          estadoDedos = { esq: TODOS_ABERTOS(), dir: TODOS_ABERTOS() }
          ultimaVista = { esq: t, dir: t }
          musica.soltar('esq')
          musica.soltar('dir')
          const agora = performance.now()
          if (fase === 'desligado') {
            esperaAte = agora + ATRASO_ENTRADA // atraso leve antes de começar
            setEfeito(true)
            musica.iniciar()
          } else {
            esperaAte = 0 // estava saindo: só inverte o sentido, sem espera
          }
          fase = 'entrando'
          ultimoAnim = agora
        }
        return
      }

      // ----- efeito ligado: cada dedo é uma camada sonora; a mão inteira muda o tom -----
      const infos = lm
        .map((m) => {
          const dx = (m[9].x - m[0].x) * vw
          const dy = (m[9].y - m[0].y) * vh
          return {
            pts: m,
            x: 1 - (m[0].x + m[9].x) / 2, // posição na tela (imagem espelhada)
            y: (m[0].y + m[9].y) / 2,
            // 0 = dedos para cima; positivo = inclinada para a direita da tela
            angulo: (Math.atan2(-dx, -dy) * 180) / Math.PI,
            punho: false,
          }
        })
        .sort((a, b) => a.x - b.x)

      // quem é a mão esquerda/direita da tela (se só há uma, vale o lado em que ela está)
      const maosLado = {}
      if (infos.length >= 2) {
        maosLado.esq = infos[0]
        maosLado.dir = infos[infos.length - 1]
      } else if (infos.length === 1) {
        maosLado[infos[0].x < 0.5 ? 'esq' : 'dir'] = infos[0]
      }

      for (const lado of ['esq', 'dir']) {
        const h = maosLado[lado]
        if (h) {
          ultimaVista[lado] = t
          estadoDedos[lado] = dedosDaMao(h.pts, vw, vh, estadoDedos[lado])
          h.punho = !estadoDedos[lado].slice(1).some(Boolean) // 4 dedos fechados
          musica.dedos(lado, estadoDedos[lado])
        } else if (t - ultimaVista[lado] > AUSENCIA_MS) {
          estadoDedos[lado] = TODOS_ABERTOS()
          musica.soltar(lado)
        }
      }
      musica.controlar({ esq: maosLado.esq, dir: maosLado.dir })

      // ----- movimento das mãos (muda a cor das letras) -----
      if (infos.length) {
        const cx = infos.reduce((a, h) => a + h.x, 0) / infos.length
        const cy = infos.reduce((a, h) => a + h.y, 0) / infos.length
        if (centroAnterior) {
          const mov = Math.hypot(cx - centroAnterior.x, cy - centroAnterior.y)
          energia = Math.min(1, energia * 0.8 + mov * 6)
        }
        centroAnterior = { x: cx, y: cy }
      }

      // ----- giro: inclinação média = pitch; giro forte = remixagem -----
      if (infos.length) {
        const ang = infos.reduce((a, h) => a + h.angulo, 0) / infos.length
        const semi = Math.round(limitar(ang / 60, -1, 1) * PITCH_MAX)
        if (semi !== pitchAtual) {
          pitchAtual = semi
          musica.transpor(semi)
          setPitch(semi)
        }
        const sentido = ang > GIRO_LIMIAR ? 1 : ang < -GIRO_LIMIAR ? -1 : 0
        if (sentido === 0) {
          giroSentido = 0
        } else if (sentido !== giroSentido) {
          giroSentido = sentido
          giroDesde = t
        } else if (t - giroDesde > GIRO_SEGURAR_MS && t - ultimoRemix > GIRO_ESPERA_MS) {
          ultimoRemix = t
          giroDesde = t
          const cat = alvoGiroRef.current
          const chaves = Object.keys(CATEGORIAS[cat].opcoes)
          const i = chaves.indexOf(remixRef.current[cat])
          escolher(cat, chaves[(i + sentido + chaves.length) % chaves.length])
          setGiroFlash((n) => n + 1)
        }
      }

      // ----- fechar a(s) mão(s) 2 vezes desliga (todas as mãos visíveis em punho) -----
      const punho = infos.length > 0 && infos.every((h) => h.punho)
      if (punho) {
        punhos++
        abertas = 0
      } else {
        abertas++
        punhos = 0
      }
      if (!punhoContado && punhos >= DETECCOES_PARA_CONFIRMAR) {
        punhoContado = true
        fechamentos.push(t)
        fechamentos = fechamentos.filter((x) => t - x <= JANELA_FECHAMENTOS)
        if (fechamentos.length >= FECHAMENTOS_PARA_DESLIGAR) {
          ativo = false
          positivos = 0
          fechamentos = []
          fase = 'saindo'
          ultimoAnim = performance.now()
        }
      } else if (punhoContado && abertas >= DETECCOES_PARA_CONFIRMAR) {
        punhoContado = false // mão reabriu: o próximo fechamento conta de novo
      }
    }

    // ---------- onda de entrada: o ASCII nasce nas mãos e se espalha ----------
    function ajustarPalco(video) {
      const ww = window.innerWidth
      const wh = window.innerHeight
      let w = ww
      let h = wh
      if (MODO_CAMERA === 'inteira') {
        const proporcao = video.videoWidth / video.videoHeight
        if (ww / wh > proporcao) w = Math.round(wh * proporcao)
        else h = Math.round(ww / proporcao)
      }
      if (w !== palcoW || h !== palcoH || palcoRef.current?.style.width === '') {
        palcoW = w
        palcoH = h
        const el = palcoRef.current
        if (el) {
          el.style.width = `${w}px`
          el.style.height = `${h}px`
        }
      }
    }

    // pontos suavizados, já em coordenadas de célula (imagem espelhada)
    function pontosCelula(geo) {
      if (!alvoPontas) return null
      const todos = [...alvoPontas.esq, ...alvoPontas.dir]
      if (!pontosAtuais) {
        pontosAtuais = todos.map((p) => ({ x: p.x, y: p.y }))
      } else {
        todos.forEach((p, i) => {
          pontosAtuais[i].x += (p.x - pontosAtuais[i].x) * SUAVIDADE_PONTOS
          pontosAtuais[i].y += (p.y - pontosAtuais[i].y) * SUAVIDADE_PONTOS
        })
      }
      const { linhas, sx, sy, sw, sh, vw, vh } = geo
      const c = pontosAtuais.map((p) => ({
        x: colunas * (1 - (p.x * vw - sx) / sw),
        y: ((p.y * vh - sy) / sh) * linhas,
      }))
      return { esq: c.slice(0, 5), dir: c.slice(5) }
    }

    // ASCII só aparece dentro do quadrado formado pelos polegares e indicadores
    // das duas mãos; fora dele fica a câmera normal
    function atualizarRegiao(fator, geo) {
      const { linhas } = geo
      const pontos = pontosCelula(geo)
      if (cvBuraco.width !== colunas || cvBuraco.height !== linhas) {
        cvBuraco.width = colunas
        cvBuraco.height = linhas
      }
      cxBuraco.clearRect(0, 0, colunas, linhas)
      if (pontos && fator > 0.001) {
        const { esq, dir } = pontos
        cxBuraco.globalAlpha = fator
        cxBuraco.fillStyle = '#000'
        cxBuraco.beginPath()
        // um único quadrado: polegar e indicador de cada mão são os 4 cantos
        cxBuraco.moveTo(esq[0].x, esq[0].y)
        cxBuraco.lineTo(esq[1].x, esq[1].y)
        cxBuraco.lineTo(dir[1].x, dir[1].y)
        cxBuraco.lineTo(dir[0].x, dir[0].y)
        cxBuraco.closePath()
        cxBuraco.fill()
        cxBuraco.globalAlpha = 1
        const dados = cxBuraco.getImageData(0, 0, colunas, linhas).data
        for (let k = 0; k < alfaEf.length; k++) alfaEf[k] = dados[k * 4 + 3] / 255
      } else {
        alfaEf.fill(0)
      }
      desenharLinhas(pontos, fator, linhas)
    }

    function desenharLinhas(pontos, fator, linhas) {
      const dpr = window.devicePixelRatio || 1
      const w = Math.round(palcoW * dpr)
      const h = Math.round(palcoH * dpr)
      if (cvLinhas.width !== w || cvLinhas.height !== h) {
        cvLinhas.width = w
        cvLinhas.height = h
      }
      cxLinhas.clearRect(0, 0, w, h)
      if (!pontos || fator <= 0.001) return
      const cw = (palcoW / colunas) * dpr
      const ch = (palcoH / linhas) * dpr
      const { esq, dir } = pontos
      cxLinhas.globalAlpha = fator
      cxLinhas.strokeStyle = '#fff'
      cxLinhas.fillStyle = '#fff'
      cxLinhas.lineWidth = 2 * dpr
      cxLinhas.lineJoin = 'round'
      cxLinhas.beginPath()
      // contorno do quadrado: polegar e indicador de cada mão
      cxLinhas.moveTo(esq[0].x * cw, esq[0].y * ch)
      cxLinhas.lineTo(esq[1].x * cw, esq[1].y * ch)
      cxLinhas.lineTo(dir[1].x * cw, dir[1].y * ch)
      cxLinhas.lineTo(dir[0].x * cw, dir[0].y * ch)
      cxLinhas.closePath()
      cxLinhas.stroke()
      for (const p of [esq[0], esq[1], dir[0], dir[1]]) {
        cxLinhas.beginPath()
        cxLinhas.arc(p.x * cw, p.y * ch, 3.5 * dpr, 0, Math.PI * 2)
        cxLinhas.fill()
      }
      cxLinhas.globalAlpha = 1
    }

    // ---------- transforma a máscara da pessoa em transparência por célula ----------
    function aplicarMascara(resultado) {
      const geo = geoAtual
      const m = resultado.confidenceMasks?.[0]
      if (!m) {
        alfa.fill(1)
        alvoMascara.fill(1)
        semAlvo = false
        alfaValida = true
        return
      }
      const mask = m.getAsFloat32Array()
      const mw = m.width
      const mh = m.height
      const { linhas, sx, sy, sw, sh, vw, vh } = geo

      for (let y = 0; y < linhas; y++) {
        const vy = sy + ((y + 0.5) / linhas) * sh
        const my = Math.min(mh - 1, Math.floor((vy / vh) * mh))
        const linhaMask = my * mw
        for (let x = 0; x < colunas; x++) {
          // a imagem foi espelhada, então espelhamos a posição na máscara
          const vx = sx + ((colunas - 1 - x + 0.5) / colunas) * sw
          const mx = Math.min(mw - 1, Math.floor((vx / vw) * mw))
          const pessoa = 1 - mask[linhaMask + mx] // máscara 0 = fundo
          const t = limitar((pessoa - 0.4) / 0.3)
          alvoMascara[y * colunas + x] = t * t * (3 - 2 * t)
        }
      }
      if (semAlvo) {
        alfa.set(alvoMascara)
        semAlvo = false
      }
      alfaValida = true
    }

    // ---------- converte um frame em texto ----------
    // fundo = sempre o mesmo caractere; pessoa = rampa de caracteres (sempre mais densa que o fundo)
    function renderizar(data, linhas, onda) {
      const pre = preRef.current
      if (!pre) return
      const total = colunas * linhas

      // brilho (preto e branco), suavizado no tempo para os caracteres não tremerem
      for (let k = 0, i = 0; k < total; k++, i += 4) {
        const l = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255
        lum[k] = lumNova ? l : lum[k] + (l - lum[k]) * SUAVIDADE_BRILHO
      }
      lumNova = false

      // auto-contraste: usa só as células da pessoa (percentis 2% e 98%)
      const BINS = 64
      const hist = new Uint32Array(BINS)
      let n = 0
      for (let k = 0; k < total; k++) {
        if (alfa[k] > 0.5) {
          hist[Math.min(BINS - 1, Math.floor(lum[k] * BINS))]++
          n++
        }
      }
      let lo = 0
      let hi = 1
      if (n > 0) {
        let acc = 0
        for (let b = 0; b < BINS; b++) {
          acc += hist[b]
          if (acc >= n * 0.02) {
            lo = b / BINS
            break
          }
        }
        acc = 0
        for (let b = BINS - 1; b >= 0; b--) {
          acc += hist[b]
          if (acc >= n * 0.02) {
            hi = (b + 1) / BINS
            break
          }
        }
        if (hi - lo < 0.1) hi = lo + 0.1
      }
      // o contraste também muda devagar (evita a tela inteira "respirar")
      if (loS < 0) {
        loS = lo
        hiS = hi
      } else {
        loS += (lo - loS) * SUAVIDADE_CONTRASTE
        hiS += (hi - hiS) * SUAVIDADE_CONTRASTE
      }
      const faixa = Math.max(0.1, hiS - loS)

      // monta o texto direto num buffer
      const tamanho = (colunas + 1) * linhas
      if (codigos.length !== tamanho) codigos = new Uint16Array(tamanho)
      const ultimo = RAMPA.length - 1
      let p = 0
      for (let y = 0; y < linhas; y++) {
        for (let x = 0; x < colunas; x++) {
          const k = y * colunas + x
          const w = onda ? onda[k] : 1
          const prev = idxPrev[k]
          let idx
          if (w < 0.02) {
            idx = 0 // a onda de entrada ainda não chegou aqui
          } else {
            // histerese: quem já era "pessoa" precisa de menos para continuar sendo
            const pessoa = alfa[k] > (prev >= 2 ? 0.35 : 0.65)
            if (!pessoa) {
              idx = w > 0.35 ? FUNDO_IDX : 0
            } else {
              let v = limitar((lum[k] - loS) / faixa)
              v = PISO_PESSOA + (1 - PISO_PESSOA) * Math.pow(v, 0.85)
              v *= w // fade suave na entrada/saída
              idx = Math.max(2, Math.min(ultimo, Math.floor(v * RAMPA.length)))
              // só troca de caractere se a mudança for grande o bastante
              if (prev >= 2 && Math.abs(idx - prev) < HISTERESE) idx = prev
            }
          }
          idxPrev[k] = idx
          codigos[p++] = CODIGOS[idx]
        }
        codigos[p++] = 10 // \n
      }
      const texto = decodificador.decode(codigos)

      // cor das letras muda levemente com o movimento das mãos
      energia *= 0.97
      matiz = (matiz + 0.15 + energia * 4) % 360
      const cor = `oklch(${(0.95 - energia * 0.1).toFixed(3)} ${(0.04 + energia * 0.1).toFixed(3)} ${matiz.toFixed(1)})`
      if (cor !== corAplicada) {
        corAplicada = cor
        pre.style.color = cor
      }

      // só mexe no estilo quando algo mudou (evita recalcular layout à toa)
      const estilo = `${palcoW}x${palcoH}x${colunas}x${linhas}`
      if (estilo !== estiloAplicado) {
        estiloAplicado = estilo
        pre.style.fontSize = `${palcoW / (colunas * PROPORCAO_CHAR)}px`
        pre.style.lineHeight = `${palcoH / linhas}px`
      }
      if (pre.firstChild) pre.firstChild.nodeValue = texto
      else pre.textContent = texto
    }

    // ---------- reduz a qualidade se o aparelho estiver sofrendo ----------
    function avaliarDesempenho(agora, trabalho) {
      const delta = agora - ultimoRaf
      ultimoRaf = agora
      quadrosDesdeAjuste++

      // ignora pausas (aba em segundo plano etc.)
      if (delta > 0 && delta < 500) emaDelta = emaDelta * 0.9 + delta * 0.1
      if (trabalho !== null) emaTrabalho = emaTrabalho * 0.9 + trabalho * 0.1

      if (!REDUZIR_QUALIDADE_SOZINHO) return // letras sempre do mesmo tamanho
      if (quadrosDesdeAjuste < 45) return
      if (nivel >= NIVEIS_COLUNAS.length - 1) return

      const lento = emaDelta > 1000 / FPS_MIN_ALVO || emaTrabalho > TRABALHO_MAX_MS
      if (lento) {
        nivel++
        colunas = NIVEIS_COLUNAS[nivel]
        quadrosDesdeAjuste = 0
        alfaValida = false // buffers mudam de tamanho: recalcula a máscara
        emaTrabalho = 0
        emaDelta = 16
      }
    }

    // ---------- loop principal ----------
    function desenhar(agora) {
      if (cancelado) return
      raf = requestAnimationFrame(desenhar)

      const video = videoRef.current
      const pre = preRef.current
      if (!video || !pre) return

      if (video.readyState < 2 || video.videoWidth === 0) return
      if (video.currentTime === ultimoTempo) {
        if (fase !== 'desligado') avaliarDesempenho(agora, null)
        return // frame novo só
      }
      ultimoTempo = video.currentTime

      ajustarPalco(video)
      detectarMaos(video)
      if (fase === 'desligado') return // aparece só a câmera normal

      if (modelo === 'carregando') {
        pre.style.fontSize = '16px'
        pre.style.lineHeight = '1.2'
        estiloAplicado = ''
        pre.textContent = '\n\n  carregando...'
        return
      }

      const t0 = performance.now()

      // avança a animação pelo tempo real: sobe na entrada, desce (inverso) na saída
      const dt = Math.min(100, t0 - ultimoAnim)
      ultimoAnim = t0
      if (fase === 'entrando' && t0 >= esperaAte) {
        progresso = Math.min(1, progresso + dt / DURACAO_ENTRADA)
      } else if (fase === 'saindo') {
        progresso = Math.max(0, progresso - dt / DURACAO_SAIDA)
      }

      // a música entra e sai junto com o ASCII (mesma curva)
      musica.nivel(suavizar(progresso))
      const bloqueado = !musica.pronto()
      if (bloqueado !== somBloq) {
        somBloq = bloqueado
        setSomBloqueado(bloqueado)
      }

      const largura = palcoW
      const altura = palcoH
      const linhas = Math.max(
        1,
        Math.round((colunas * PROPORCAO_CHAR * altura) / largura)
      )
      const total = colunas * linhas

      if (canvas.width !== colunas || canvas.height !== linhas) {
        canvas.width = colunas
        canvas.height = linhas
        ctx.imageSmoothingQuality = 'high'
      }
      if (lum.length !== total) {
        lum = new Float32Array(total)
        alfa = new Float32Array(total)
        alfaEf = new Float32Array(total)
        alvoMascara = new Float32Array(total)
        idxPrev = new Uint8Array(total)
        semAlvo = true
        lumNova = true
        alfaValida = false
      }

      // recorte "cover": preenche a tela sem distorcer
      const vw = video.videoWidth
      const vh = video.videoHeight
      const alvo = colunas / linhas
      let sw = vw
      let sh = vw / alvo
      if (sh > vh) {
        sh = vh
        sw = vh * alvo
      }
      let sx = (vw - sw) / 2
      let sy = (vh - sh) / 2
      if (MODO_CAMERA === 'esticar') {
        // usa o quadro inteiro da câmera, esticado para preencher a tela
        sx = 0
        sy = 0
        sw = vw
        sh = vh
      }
      geoAtual = { linhas, sx, sy, sw, sh, vw, vh }

      // desenha espelhado
      ctx.save()
      ctx.scale(-1, 1)
      ctx.drawImage(video, sx, sy, sw, sh, -colunas, 0, colunas, linhas)
      ctx.restore()

      const { data } = ctx.getImageData(0, 0, colunas, linhas)

      // a máscara muda devagar: recalcula só de tempos em tempos e reaproveita
      if (modelo === 'ok' && segmenter) {
        if (!alfaValida || t0 - ultimaSeg >= intervaloSeg) {
          try {
            segmenter.segmentForVideo(video, t0, aplicarMascara)
            const dur = performance.now() - t0
            emaSeg = emaSeg === 0 ? dur : emaSeg * 0.7 + dur * 0.3
            // a segmentação nunca ocupa mais que ~metade do tempo
            intervaloSeg = limitar(emaSeg * 2, INTERVALO_SEG_MIN, INTERVALO_SEG_MAX)
            ultimaSeg = t0
          } catch (e) {
            console.error(e)
            modelo = 'falhou'
          }
        }
      }
      if (!alfaValida) {
        alfa.fill(1)
        alvoMascara.fill(1)
        semAlvo = false
        alfaValida = true
      }
      if (modelo === 'ok') {
        // a borda do corpo caminha suavemente até a máscara nova (sem "pulos")
        for (let k = 0; k < total; k++) alfa[k] += (alvoMascara[k] - alfa[k]) * SUAVIDADE_MASCARA
      }

      // a região entre as mãos aparece/some junto com a entrada/saída e com as mãos na câmera
      const presente = fase === 'saindo' || t0 - ultimaDuasMaos < PRESENCA_MS
      fatorMaos = limitar(fatorMaos + ((presente ? 1 : -1) * dt) / 250)
      atualizarRegiao(suavizar(progresso) * fatorMaos, geoAtual)

      renderizar(data, linhas, alfaEf)

      if (fase === 'entrando' && progresso >= 1) {
        fase = 'ligado'
      } else if (fase === 'saindo' && progresso <= 0) {
        fase = 'desligado'
        alvoPontas = null
        pontosAtuais = null
        fatorMaos = 0
        cxLinhas.clearRect(0, 0, cvLinhas.width, cvLinhas.height)
        cxBuraco.clearRect(0, 0, cvBuraco.width, cvBuraco.height)
        musica.parar()
        musica.nivel(0)
        if (somBloq) {
          somBloq = false
          setSomBloqueado(false)
        }
        setEfeito(false)
      }
      avaliarDesempenho(agora, performance.now() - t0)
    }

    // ---------- inicia tudo ----------
    if (!REMOVER_FUNDO) modelo = 'desligado' // sem recorte: nem baixa nem roda o modelo
    carregarModelos()

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      .then((s) => {
        if (cancelado) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        videoRef.current.srcObject = s
        videoRef.current.play().catch(() => {})
        raf = requestAnimationFrame(desenhar)
      })
      .catch((e) => {
        console.error(e)
        if (!cancelado) setStatus('negado')
      })

    return () => {
      cancelado = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      segmenter?.close()
      maos?.close()
      EVENTOS_DESTRAVAR.forEach((ev) => window.removeEventListener(ev, destravar))
      musica.aoMudarGravacao(null)
      musica.fechar()
      musicaRef.current = null
    }
  }, [status])

  // cabeçote do gravador: acompanha a posição do loop sem re-renderizar a tela
  useEffect(() => {
    if (status !== 'liberado') return
    let raf = 0
    const volta = () => {
      const el = cabecoteRef.current
      const m = musicaRef.current
      if (el && m) {
        const pos = m.posicaoLoop()
        el.style.opacity = pos < 0 ? '0' : '1'
        if (pos >= 0) el.style.left = `${pos * 100}%`
      }
      raf = requestAnimationFrame(volta)
    }
    raf = requestAnimationFrame(volta)
    return () => cancelAnimationFrame(raf)
  }, [status])

  if (status === 'aguardando') {
    return (
      <div className="tela1 tela1-aviso">
        <p>Aceite o acesso à câmera no navegador para continuar.</p>
      </div>
    )
  }

  if (status === 'negado') {
    return (
      <div className="tela1 tela1-aviso">
        <p>O acesso à câmera foi bloqueado.</p>
        <p>Clique no cadeado na barra de endereço, permita a câmera e tente de novo.</p>
        <button onClick={() => setTentativa((n) => n + 1)}>Tentar novamente</button>
      </div>
    )
  }

  return (
    <div className="tela1">
      <div ref={palcoRef} className="tela1-palco">
      {/* a câmera normal fica sempre visível; o ASCII só aparece na região entre as mãos */}
      <video
        ref={videoRef}
        className="tela1-video-visivel"
        style={{ objectFit: MODO_CAMERA === 'esticar' ? 'fill' : 'cover' }}
        autoPlay
        playsInline
        muted
      />
      <canvas
        ref={buracoRef}
        className="tela1-buraco"
        style={{ display: efeito ? undefined : 'none' }}
      />
      <pre
        ref={preRef}
        className="tela1-ascii"
        style={{ opacity: OPACIDADE_ASCII, display: efeito ? undefined : 'none' }}
      />
      <canvas
        ref={linhasRef}
        className="tela1-linhas"
        style={{ display: efeito ? undefined : 'none' }}
      />
      </div>
      <aside className="remix-painel" aria-label="Opções de remixagem">
        <header className="remix-topo">
          <h2>Remixagem</h2>
          <span className={`remix-pitch${giroFlash % 2 ? ' pulso-a' : giroFlash ? ' pulso-b' : ''}`}>
            {pitch > 0 ? `+${pitch}` : pitch} st
          </span>
        </header>
        <section className="maos-secao">
          <h3 className="maos-titulo">Som de cada dedo</h3>
          <div className="maos">
            {['esq', 'dir'].map((lado) => (
              <div key={lado} className="mao">
                <div className="dedos">
                  {ORDEM_MAOS[lado].map((d) => (
                    <button
                      key={d}
                      className={`dedo${dedoSel.lado === lado && dedoSel.dedo === d ? ' sel' : ''}${d === 0 ? ' polegar' : ''}${manter[lado][d] ? ' mantido' : ''}`}
                      style={{ height: ALTURA_DEDO[d] }}
                      title={`${NOMES_DEDOS[d]}: ${nomeDoSom(mapa[lado][d])}`}
                      onClick={() => setDedoSel({ lado, dedo: d })}
                    >
                      <span>{nomeDoSom(mapa[lado][d], true)}</span>
                    </button>
                  ))}
                </div>
                <div className="palma">{lado === 'esq' ? 'Esquerda' : 'Direita'}</div>
              </div>
            ))}
          </div>
          <p className="remix-dica">
            Escolhendo: <b>{NOMES_DEDOS[dedoSel.dedo]}</b> da mão {dedoSel.lado === 'esq' ? 'esquerda' : 'direita'}
          </p>
          <div className="remix-opcoes">
            {Object.entries(SONS_BASE).map(([id, s]) => (
              <button
                key={id}
                className={mapa[dedoSel.lado][dedoSel.dedo] === id ? 'ativo' : ''}
                onClick={() => trocarSom(id)}
              >
                {s.nome}
              </button>
            ))}
            {arquivos.map((a) => (
              <button
                key={a.id}
                className={mapa[dedoSel.lado][dedoSel.dedo] === a.id ? 'ativo' : ''}
                onClick={() => trocarSom(a.id)}
                title={a.nome}
              >
                🎵 {a.nome.length > 16 ? a.nome.slice(0, 15) + '…' : a.nome}
              </button>
            ))}
          </div>
          <label className="som-arquivo">
            ＋ Som do computador…
            <input type="file" accept="audio/*" multiple onChange={adicionarArquivos} hidden />
          </label>
          {erroSom && <p className="som-erro">{erroSom}</p>}
          {arquivos.some((a) => a.id === mapa[dedoSel.lado][dedoSel.dedo]) && (
            <label className="som-modo">
              Como toca:
              <select
                value={arquivos.find((a) => a.id === mapa[dedoSel.lado][dedoSel.dedo]).modo}
                onChange={(ev) => mudarModo(mapa[dedoSel.lado][dedoSel.dedo], ev.target.value)}
              >
                {Object.entries(MODOS_ARQUIVO).map(([k, n]) => (
                  <option key={k} value={k}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="som-manter">
            <span>
              Este dedo continua sem aparecer
              <small>
                {NOMES_DEDOS[dedoSel.dedo]} da mão {dedoSel.lado === 'esq' ? 'esquerda' : 'direita'}
              </small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={manter[dedoSel.lado][dedoSel.dedo]}
              onChange={alternarDedoManter}
            />
          </label>
          <label className="som-manter">
            <span>
              Todos os dedos continuam
              <small>Liga ou desliga os 10 de uma vez</small>
            </span>
            <input type="checkbox" role="switch" checked={todosManter} onChange={alternarTodosManter} />
          </label>
        </section>
        <p className="remix-dica">Gire a mão para mudar o tom. Gire bem forte e segure para trocar:</p>
        <div className="remix-segmento" role="tablist">
          {Object.entries(CATEGORIAS).map(([cat, c]) => (
            <button
              key={cat}
              role="tab"
              aria-selected={alvoGiro === cat}
              className={alvoGiro === cat ? 'ativo' : ''}
              onClick={() => setAlvoGiro(cat)}
            >
              {cat === 'ritmo' ? 'Ritmo' : cat === 'instrumentos' ? 'Instrumentos' : 'Escala'}
            </button>
          ))}
        </div>
        {Object.entries(CATEGORIAS).map(([cat, c]) => (
          <section key={cat} className={`remix-grupo${alvoGiro === cat ? ' foco' : ''}`}>
            <h3>{c.titulo}</h3>
            <div className="remix-opcoes">
              {Object.entries(c.opcoes).map(([chave, o]) => (
                <button
                  key={chave}
                  className={remix[cat] === chave ? 'ativo' : ''}
                  onClick={() => escolher(cat, chave)}
                >
                  {o.nome}
                </button>
              ))}
            </div>
          </section>
        ))}
      </aside>
      <section className={`rec-barra${pistaAberta ? ' aberta' : ''}`} aria-label="Gravação">
        <div className="rec-controles">
          <button
            className={`rec-btn rec-gravar${gravacao.gravando ? ' ativo' : ''}`}
            onClick={alternarGravar}
            title={gravacao.gravando ? 'Parar de gravar' : 'Gravar'}
            aria-pressed={gravacao.gravando}
          >
            ●
          </button>
          <button
            className={`rec-btn${gravacao.reproduzindo ? ' ativo' : ''}`}
            onClick={alternarLoop}
            title={gravacao.reproduzindo ? 'Parar o loop' : 'Tocar o loop'}
            aria-pressed={gravacao.reproduzindo}
          >
            {gravacao.reproduzindo ? '■' : '▶'}
          </button>
          <button
            className="rec-btn"
            onClick={limparGravacao}
            disabled={!gravacao.eventos.length}
            title="Apagar a gravação"
          >
            ⌫
          </button>
          <label className="rec-compassos">
            Compassos
            <select value={gravacao.compassos} onChange={mudarCompassos}>
              {OPCOES_COMPASSOS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <span className="rec-estado">
            {gravacao.gravando
              ? efeito
                ? 'Gravando… levante e feche os dedos'
                : 'Gravando… abra as duas mãos para começar'
              : gravacao.reproduzindo
                ? 'Tocando em loop'
                : gravacao.eventos.length
                  ? 'Gravação pronta'
                  : 'Aperte ● e toque com os dedos'}
          </span>
          <button
            className="rec-btn rec-expandir"
            onClick={() => setPistaAberta((v) => !v)}
            title={pistaAberta ? 'Recolher pista' : 'Expandir pista'}
          >
            {pistaAberta ? '▾' : '▴'}
          </button>
        </div>
        <div className="rec-pista" style={{ '--n': gravacao.compassos }}>
          <div className="rec-rotulos">
            <div className="rec-regua-espaco" />
            {['esq', 'dir'].flatMap((lado) =>
              [0, 1, 2, 3, 4].map((d) => (
                <div key={lado + d} className="rec-rotulo">
                  {lado === 'esq' ? 'E' : 'D'} · {nomeDoSom(mapa[lado][d], true)}
                </div>
              ))
            )}
          </div>
          <div className="rec-trilhas">
            <div className="rec-regua">
              {Array.from({ length: gravacao.compassos }, (_, c) => (
                <span key={c} style={{ left: `${(c / gravacao.compassos) * 100}%` }}>
                  {c + 1}
                </span>
              ))}
            </div>
            {['esq', 'dir'].flatMap((lado) =>
              [0, 1, 2, 3, 4].map((d) => {
                const n = gravacao.compassos * 16
                const matiz = (lado === 'esq' ? d : d + 5) * 36
                return (
                  <div key={lado + d} className="rec-lane">
                    {blocosDoDedo(gravacao.eventos, gravacao.compassos, lado, d).map(([a, b], k) => (
                      <i
                        key={k}
                        className="rec-bloco"
                        style={{
                          left: `${(a / n) * 100}%`,
                          width: `${Math.max(0.8, ((b - a) / n) * 100)}%`,
                          background: `hsl(${matiz} 85% 68%)`,
                        }}
                      />
                    ))}
                  </div>
                )
              })
            )}
            <div ref={cabecoteRef} className="rec-cabecote" />
          </div>
        </div>
      </section>
      {efeito && somBloqueado && (
        <p className="tela1-dica">toque na tela para ativar o som</p>
      )}
    </div>
  )
}

export default Tela1