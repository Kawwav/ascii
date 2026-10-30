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

const GIRO_LIMIAR = 55
const GIRO_SEGURAR_MS = 350
const GIRO_ESPERA_MS = 1400
const PITCH_MAX = 5
const CATEGORIAS = {
  ritmo: { titulo: 'Padrão do ritmo', opcoes: RITMOS },
  instrumentos: { titulo: 'Instrumentos ativos', opcoes: INSTRUMENTOS },
  escala: { titulo: 'Escala / acorde', opcoes: ESCALAS },
}

const NOMES_DEDOS = ['Polegar', 'Indicador', 'Médio', 'Anelar', 'Mindinho']
const ORDEM_MAOS = { esq: [4, 3, 2, 1, 0], dir: [0, 1, 2, 3, 4] }
const ALTURA_DEDO = [64, 88, 100, 90, 70]
const MODOS_ARQUIVO = { uma: 'Uma vez', tempo: 'A cada tempo', compasso: 'A cada compasso' }

const COLUNAS = 380
const PROPORCAO_CHAR = 0.6

const RAMPA =
  ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$'

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const MODELO_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite'

const OPACIDADE_ASCII = 0.9

const MODO_CAMERA = 'esticar'
const REMOVER_FUNDO = true

const FUNDO_IDX = 1
const PISO_PESSOA = 0.3
const SUAVIDADE_BRILHO = 0.3
const SUAVIDADE_CONTRASTE = 0.08
const SUAVIDADE_MASCARA = 0.35
const HISTERESE = 2

const NIVEIS_COLUNAS = [COLUNAS, 320, 260, 210, 170, 130, 100]

const REDUZIR_QUALIDADE_SOZINHO = false
const LARGURA_MIN_CHAR = 2.5
const FPS_MIN_ALVO = 36
const TRABALHO_MAX_MS = 18
const INTERVALO_SEG_MIN = 33
const INTERVALO_SEG_MAX = 200

const VOXEL_BX = 7
const VOXEL_BY = 4
const VOXEL_ALTURA_MIN = 0.35
const VOXEL_ALTURA_VAR = 1.4
const VOXEL_SUAVIDADE = 0.35

const CODIGOS = Uint16Array.from(RAMPA, (c) => c.charCodeAt(0))
const decodificador = new TextDecoder('utf-16le')

const limitar = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v))

const MAOS_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
const INTERVALO_MAOS_MIN = 66
const INTERVALO_MAOS_MAX = 250
const DETECCOES_PARA_LIGAR = 3
const DETECCOES_PARA_CONFIRMAR = 2
const FECHAMENTOS_PARA_DESLIGAR = 2
const JANELA_FECHAMENTOS = 3500
const DURACAO_ENTRADA = 700
const DURACAO_SAIDA = 700
const ATRASO_ENTRADA = 100

const PONTAS = [4, 8, 12, 16, 20]
const SUAVIDADE_PONTOS = 0.5
const PRESENCA_MS = 400

const suavizar = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t)

const DEDOS = [
  [8, 6],
  [12, 10],
  [16, 14],
  [20, 18],
]

function maoAberta(pts, vw, vh) {
  const d = (a, b) => Math.hypot((a.x - b.x) * vw, (a.y - b.y) * vh)
  for (const [ponta, junta] of DEDOS) {
    if (d(pts[ponta], pts[0]) < d(pts[junta], pts[0]) * 1.1) return false
  }
  return d(pts[4], pts[17]) > d(pts[3], pts[17]) * 1.05
}

function dedosDaMao(pts, vw, vh, anterior) {
  const d = (a, b) =>
    Math.hypot((a.x - b.x) * vw, (a.y - b.y) * vh, ((a.z || 0) - (b.z || 0)) * vw)
  const razoes = [d(pts[4], pts[17]) / Math.max(1e-6, d(pts[3], pts[17]))]
  for (const [ponta, junta] of DEDOS) {
    razoes.push(d(pts[ponta], pts[0]) / Math.max(1e-6, d(pts[junta], pts[0])))
  }
  return razoes.map((r, i) => (anterior[i] ? r > 1.0 : r > 1.12))
}

const TODOS_ABERTOS = () => [true, true, true, true, true]
const AUSENCIA_MS = 1500

const OPCOES_COMPASSOS = [1, 2, 4, 8]
const GRAV_VAZIA = { compassos: 4, gravando: false, reproduzindo: false, eventos: [] }

function blocosDoDedo(eventos, compassos, lado, dedo) {
  const n = compassos * 16
  const evs = eventos.filter((ev) => ev.lado === lado && ev.dedo === dedo).sort((a, b) => a.p - b.p)
  if (!evs.length) return []
  const blocos = []
  let ini = evs[evs.length - 1].sobe ? 0 : null
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
  const buracoRef = useRef(null)
  const linhasRef = useRef(null)
  const voxelRef = useRef(null)

  const [somBloqueado, setSomBloqueado] = useState(false)

  const [status, setStatus] = useState('aguardando')
  const [tentativa, setTentativa] = useState(0)

  const [efeito, setEfeito] = useState(false)

  const [estiloEfeito, setEstiloEfeito] = useState('ascii')
  const estiloRef = useRef('ascii')
  estiloRef.current = estiloEfeito

  const [remix, setRemix] = useState({ ritmo: 'four', instrumentos: 'todos', escala: 'pentaMenor' })
  const [alvoGiro, setAlvoGiro] = useState('ritmo')
  const [pitch, setPitch] = useState(0)
  const [giroFlash, setGiroFlash] = useState(0)
  const musicaRef = useRef(null)

  const [mapa, setMapa] = useState(() => ({ esq: [...MAPA_PADRAO.esq], dir: [...MAPA_PADRAO.dir] }))
  const [dedoSel, setDedoSel] = useState({ lado: 'dir', dedo: 1 })
  const [arquivos, setArquivos] = useState(() => listarArquivos())
  const [erroSom, setErroSom] = useState('')

  const [gravacao, setGravacao] = useState(GRAV_VAZIA)
  const [pistaAberta, setPistaAberta] = useState(false)
  const cabecoteRef = useRef(null)

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
        trocarSom(novo.id)
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

  const alternarDedoManter = () => {
    const { lado, dedo } = dedoSel
    const atual = manterRef.current
    aplicarManter({ ...atual, [lado]: atual[lado].map((v, i) => (i === dedo ? !v : v)) })
  }

  const todosManter = manter.esq.every(Boolean) && manter.dir.every(Boolean)
  const alternarTodosManter = () => {
    const v = !(manterRef.current.esq.every(Boolean) && manterRef.current.dir.every(Boolean))
    aplicarManter({ esq: Array(5).fill(v), dir: Array(5).fill(v) })
  }

  const mudarModo = (id, modo) => {
    configurarArquivo(id, { modo })
    setArquivos(listarArquivos())
  }

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

  useEffect(() => {
    let cancelado = false
    setStatus('aguardando')

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((s) => {
        s.getTracks().forEach((t) => t.stop())
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

  useEffect(() => {
    if (status !== 'liberado') return

    let stream = null
    let segmenter = null
    let modelo = 'carregando'
    let cancelado = false
    let raf = 0
    let ultimoTempo = -1

    let maos = null
    let maosEstado = 'carregando'
    let ativo = false
    let positivos = 0
    let punhos = 0
    let abertas = 0
    let punhoContado = false
    let estadoDedos = { esq: TODOS_ABERTOS(), dir: TODOS_ABERTOS() }
    let ultimaVista = { esq: 0, dir: 0 }
    let fechamentos = []

    const musica = criarMusica()
    musica.remixar(remixRef.current)
    musica.definirMapa(mapaRef.current)
    musica.definirManter(manterRef.current)
    musicaRef.current = musica
    musica.aoMudarGravacao(setGravacao)
    setGravacao(musica.obterGravacao())

    let giroDesde = 0
    let giroSentido = 0
    let ultimoRemix = 0
    let pitchAtual = 0
    let centroAnterior = null
    let energia = 0
    let matiz = 200
    let corAplicada = ''
    let somBloq = false
    const destravar = () => musica.destravar()
    const EVENTOS_DESTRAVAR = ['pointerdown', 'keydown', 'touchstart']
    EVENTOS_DESTRAVAR.forEach((ev) => window.addEventListener(ev, destravar))
    let ultimaMao = -Infinity
    let intervaloMao = INTERVALO_MAOS_MIN
    let emaMao = 0
    setEfeito(false)

    let alvoPontas = null
    let pontosAtuais = null
    let ultimaDuasMaos = -Infinity
    let fatorMaos = 0

    let fase = 'desligado'
    let progresso = 0
    let esperaAte = 0
    let ultimoAnim = 0

    let palcoW = window.innerWidth
    let palcoH = window.innerHeight
    let alfaEf = new Float32Array(0)
    let alvoMascara = new Float32Array(0)
    let semAlvo = true
    let idxPrev = new Uint8Array(0)
    let lumNova = true
    let loS = -1
    let hiS = -1

    const cvBuraco = buracoRef.current
    const cxBuraco = cvBuraco.getContext('2d', { willReadFrequently: true })
    const cvLinhas = linhasRef.current
    const cxLinhas = cvLinhas.getContext('2d')
    const cvVoxel = voxelRef.current
    const cxVoxel = cvVoxel.getContext('2d')
    let voxAltura = new Float32Array(0)

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.imageSmoothingQuality = 'high'

    let lum = new Float32Array(0)
    let alfa = new Float32Array(0)
    let alfaValida = false
    let codigos = new Uint16Array(0)
    let estiloAplicado = ''

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

    let ultimaSeg = -Infinity
    let intervaloSeg = INTERVALO_SEG_MIN
    let emaSeg = 0
    let geoAtual = null

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
        modelo = 'falhou'
      }
    }

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

          if (fase !== 'saindo') {
            const ord = [lm[0], lm[1]].sort((a, b) => b[0].x + b[9].x - (a[0].x + a[9].x))
            const pts = (m) => PONTAS.map((i) => ({ x: m[i].x, y: m[i].y }))
            alvoPontas = { esq: pts(ord[0]), dir: pts(ord[1]) }
            ultimaDuasMaos = t
          }
          const afastadas =
            Math.hypot((lm[0][0].x - lm[1][0].x) * vw, (lm[0][0].y - lm[1][0].y) * vh) >
            0.1 * vw
          duasAbertas = afastadas && maoAberta(lm[0], vw, vh) && maoAberta(lm[1], vw, vh)
        }
      } catch (e) {
        console.error(e)
        maosEstado = 'falhou'
        return
      }

      const dur = performance.now() - t
      emaMao = emaMao === 0 ? dur : emaMao * 0.7 + dur * 0.3
      intervaloMao = limitar(emaMao * 3, INTERVALO_MAOS_MIN, INTERVALO_MAOS_MAX)

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
            esperaAte = agora + ATRASO_ENTRADA
            setEfeito(true)
            musica.iniciar()
          } else {
            esperaAte = 0
          }
          fase = 'entrando'
          ultimoAnim = agora
        }
        return
      }

      const infos = lm
        .map((m) => {
          const dx = (m[9].x - m[0].x) * vw
          const dy = (m[9].y - m[0].y) * vh
          return {
            pts: m,
            x: 1 - (m[0].x + m[9].x) / 2,
            y: (m[0].y + m[9].y) / 2,

            angulo: (Math.atan2(-dx, -dy) * 180) / Math.PI,
            punho: false,
          }
        })
        .sort((a, b) => a.x - b.x)

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
          h.punho = !estadoDedos[lado].slice(1).some(Boolean)
          musica.dedos(lado, estadoDedos[lado])
        } else if (t - ultimaVista[lado] > AUSENCIA_MS) {
          estadoDedos[lado] = TODOS_ABERTOS()
          musica.soltar(lado)
        }
      }
      musica.controlar({ esq: maosLado.esq, dir: maosLado.dir })

      if (infos.length) {
        const cx = infos.reduce((a, h) => a + h.x, 0) / infos.length
        const cy = infos.reduce((a, h) => a + h.y, 0) / infos.length
        if (centroAnterior) {
          const mov = Math.hypot(cx - centroAnterior.x, cy - centroAnterior.y)
          energia = Math.min(1, energia * 0.8 + mov * 6)
        }
        centroAnterior = { x: cx, y: cy }
      }

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
        punhoContado = false
      }
    }

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

          const vx = sx + ((colunas - 1 - x + 0.5) / colunas) * sw
          const mx = Math.min(mw - 1, Math.floor((vx / vw) * mw))
          const pessoa = 1 - mask[linhaMask + mx]
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

    function desenharVoxel(data, linhas, onda, faixa) {
      const dpr = window.devicePixelRatio || 1
      const W = Math.round(palcoW * dpr)
      const H = Math.round(palcoH * dpr)
      if (cvVoxel.width !== W || cvVoxel.height !== H) {
        cvVoxel.width = W
        cvVoxel.height = H
      }
      cxVoxel.clearRect(0, 0, W, H)

      const nbx = Math.ceil(colunas / VOXEL_BX)
      const nby = Math.ceil(linhas / VOXEL_BY)
      if (voxAltura.length !== nbx * nby) voxAltura = new Float32Array(nbx * nby)
      const cw = (W / colunas) * VOXEL_BX
      const ch = (H / linhas) * VOXEL_BY
      const lado = Math.min(cw, ch)
      const prof = lado * 0.45
      cxVoxel.lineWidth = Math.max(1, dpr * 0.6)
      cxVoxel.strokeStyle = 'rgba(0,0,0,0.35)'
      cxVoxel.lineJoin = 'round'

      const tom = (r, g, b, f) =>
        `rgb(${Math.min(255, r * f) | 0},${Math.min(255, g * f) | 0},${Math.min(255, b * f) | 0})`

      for (let by = 0; by < nby; by++) {
        const y0 = by * VOXEL_BY
        const y1 = Math.min(linhas, y0 + VOXEL_BY)
        for (let bx = 0; bx < nbx; bx++) {
          const x0 = bx * VOXEL_BX
          const x1 = Math.min(colunas, x0 + VOXEL_BX)
          let r = 0
          let g = 0
          let b = 0
          let a = 0
          let w = 0
          let l = 0
          let n = 0
          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              const k = y * colunas + x
              const i = k * 4
              r += data[i]
              g += data[i + 1]
              b += data[i + 2]
              a += alfa[k]
              w += onda ? onda[k] : 1
              l += lum[k]
              n++
            }
          }
          r /= n
          g /= n
          b /= n
          a /= n
          w /= n
          l /= n
          const idx = by * nbx + bx
          if (w < 0.03) {
            voxAltura[idx] = 0
            continue
          }

          const pessoa = a > 0.5
          const v = limitar((l - loS) / faixa)
          const alvo = pessoa ? VOXEL_ALTURA_MIN + VOXEL_ALTURA_VAR * v : 0.12
          voxAltura[idx] += (alvo - voxAltura[idx]) * VOXEL_SUAVIDADE
          const h = voxAltura[idx] * lado * w
          const f = pessoa ? 1 : 0.3

          const px = bx * cw
          const pb = (by + 1) * ch
          const topo = pb - h

          cxVoxel.fillStyle = tom(r, g, b, f)
          cxVoxel.fillRect(px, topo, cw, h)
          cxVoxel.strokeRect(px, topo, cw, h)

          cxVoxel.fillStyle = tom(r, g, b, f * 1.3)
          cxVoxel.beginPath()
          cxVoxel.moveTo(px, topo)
          cxVoxel.lineTo(px + prof, topo - prof)
          cxVoxel.lineTo(px + cw + prof, topo - prof)
          cxVoxel.lineTo(px + cw, topo)
          cxVoxel.closePath()
          cxVoxel.fill()
          cxVoxel.stroke()

          cxVoxel.fillStyle = tom(r, g, b, f * 0.6)
          cxVoxel.beginPath()
          cxVoxel.moveTo(px + cw, topo)
          cxVoxel.lineTo(px + cw + prof, topo - prof)
          cxVoxel.lineTo(px + cw + prof, pb - prof)
          cxVoxel.lineTo(px + cw, pb)
          cxVoxel.closePath()
          cxVoxel.fill()
          cxVoxel.stroke()
        }
      }
    }

    function renderizar(data, linhas, onda) {
      const pre = preRef.current
      if (!pre) return
      const total = colunas * linhas

      for (let k = 0, i = 0; k < total; k++, i += 4) {
        const l = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255
        lum[k] = lumNova ? l : lum[k] + (l - lum[k]) * SUAVIDADE_BRILHO
      }
      lumNova = false

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

      if (loS < 0) {
        loS = lo
        hiS = hi
      } else {
        loS += (lo - loS) * SUAVIDADE_CONTRASTE
        hiS += (hi - hiS) * SUAVIDADE_CONTRASTE
      }
      const faixa = Math.max(0.1, hiS - loS)

      if (estiloRef.current === 'voxel') {
        desenharVoxel(data, linhas, onda, faixa)
        return
      }

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
            idx = 0
          } else {

            const pessoa = alfa[k] > (prev >= 2 ? 0.35 : 0.65)
            if (!pessoa) {
              idx = w > 0.35 ? FUNDO_IDX : 0
            } else {
              let v = limitar((lum[k] - loS) / faixa)
              v = PISO_PESSOA + (1 - PISO_PESSOA) * Math.pow(v, 0.85)
              v *= w
              idx = Math.max(2, Math.min(ultimo, Math.floor(v * RAMPA.length)))

              if (prev >= 2 && Math.abs(idx - prev) < HISTERESE) idx = prev
            }
          }
          idxPrev[k] = idx
          codigos[p++] = CODIGOS[idx]
        }
        codigos[p++] = 10
      }
      const texto = decodificador.decode(codigos)

      energia *= 0.97
      matiz = (matiz + 0.15 + energia * 4) % 360
      const cor = `oklch(${(0.95 - energia * 0.1).toFixed(3)} ${(0.04 + energia * 0.1).toFixed(3)} ${matiz.toFixed(1)})`
      if (cor !== corAplicada) {
        corAplicada = cor
        pre.style.color = cor
      }

      const estilo = `${palcoW}x${palcoH}x${colunas}x${linhas}`
      if (estilo !== estiloAplicado) {
        estiloAplicado = estilo
        pre.style.fontSize = `${palcoW / (colunas * PROPORCAO_CHAR)}px`
        pre.style.lineHeight = `${palcoH / linhas}px`
      }
      if (pre.firstChild) pre.firstChild.nodeValue = texto
      else pre.textContent = texto
    }

    function avaliarDesempenho(agora, trabalho) {
      const delta = agora - ultimoRaf
      ultimoRaf = agora
      quadrosDesdeAjuste++

      if (delta > 0 && delta < 500) emaDelta = emaDelta * 0.9 + delta * 0.1
      if (trabalho !== null) emaTrabalho = emaTrabalho * 0.9 + trabalho * 0.1

      if (!REDUZIR_QUALIDADE_SOZINHO) return
      if (quadrosDesdeAjuste < 45) return
      if (nivel >= NIVEIS_COLUNAS.length - 1) return

      const lento = emaDelta > 1000 / FPS_MIN_ALVO || emaTrabalho > TRABALHO_MAX_MS
      if (lento) {
        nivel++
        colunas = NIVEIS_COLUNAS[nivel]
        quadrosDesdeAjuste = 0
        alfaValida = false
        emaTrabalho = 0
        emaDelta = 16
      }
    }

    function desenhar(agora) {
      if (cancelado) return
      raf = requestAnimationFrame(desenhar)

      const video = videoRef.current
      const pre = preRef.current
      if (!video || !pre) return

      if (video.readyState < 2 || video.videoWidth === 0) return
      if (video.currentTime === ultimoTempo) {
        if (fase !== 'desligado') avaliarDesempenho(agora, null)
        return
      }
      ultimoTempo = video.currentTime

      ajustarPalco(video)
      detectarMaos(video)
      if (fase === 'desligado') return

      if (modelo === 'carregando') {
        pre.style.fontSize = '16px'
        pre.style.lineHeight = '1.2'
        estiloAplicado = ''
        pre.textContent = '\n\n  carregando...'
        return
      }

      const t0 = performance.now()

      const dt = Math.min(100, t0 - ultimoAnim)
      ultimoAnim = t0
      if (fase === 'entrando' && t0 >= esperaAte) {
        progresso = Math.min(1, progresso + dt / DURACAO_ENTRADA)
      } else if (fase === 'saindo') {
        progresso = Math.max(0, progresso - dt / DURACAO_SAIDA)
      }

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

        sx = 0
        sy = 0
        sw = vw
        sh = vh
      }
      geoAtual = { linhas, sx, sy, sw, sh, vw, vh }

      ctx.save()
      ctx.scale(-1, 1)
      ctx.drawImage(video, sx, sy, sw, sh, -colunas, 0, colunas, linhas)
      ctx.restore()

      const { data } = ctx.getImageData(0, 0, colunas, linhas)

      if (modelo === 'ok' && segmenter) {
        if (!alfaValida || t0 - ultimaSeg >= intervaloSeg) {
          try {
            segmenter.segmentForVideo(video, t0, aplicarMascara)
            const dur = performance.now() - t0
            emaSeg = emaSeg === 0 ? dur : emaSeg * 0.7 + dur * 0.3

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

        for (let k = 0; k < total; k++) alfa[k] += (alvoMascara[k] - alfa[k]) * SUAVIDADE_MASCARA
      }

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

    if (!REMOVER_FUNDO) modelo = 'desligado'
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
        style={{
          opacity: OPACIDADE_ASCII,
          display: efeito && estiloEfeito === 'ascii' ? undefined : 'none',
        }}
      />
      <canvas
        ref={voxelRef}
        className="tela1-voxel"
        style={{ display: efeito && estiloEfeito === 'voxel' ? undefined : 'none' }}
      />
      <canvas
        ref={linhasRef}
        className="tela1-linhas"
        style={{ display: efeito ? undefined : 'none' }}
      />
      </div>
      <div className="estilo-seletor" role="group" aria-label="Estilo do efeito">
        {[
          ['ascii', 'ASCII'],
          ['voxel', 'Voxel'],
        ].map(([chave, nome]) => (
          <button
            key={chave}
            className={estiloEfeito === chave ? 'ativo' : ''}
            aria-pressed={estiloEfeito === chave}
            onClick={() => setEstiloEfeito(chave)}
          >
            {nome}
          </button>
        ))}
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