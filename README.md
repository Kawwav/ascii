# ascii

Oi! Esse projeto nasceu de uma ideia meio maluca: e se a sua câmera virasse um instrumento musical e suas mãos fossem os controles?

O ascii é um app que abre a sua webcam, transforma uma parte da imagem em letrinhas (arte ASCII) e deixa você tocar música eletrônica pesada só mexendo os dedos no ar. Sem teclado, sem mouse, sem nenhum arquivo de áudio por trás dos sons. Tudo é gerado na hora, direto no navegador.

Você pode testar agora mesmo aqui: https://kawwav.github.io/ascii/

## Como funciona na prática

Tudo começa com um gesto simples.

1. Libere o acesso à câmera quando o navegador pedir.
2. Abra as duas mãos na frente da câmera e espere um instante.
3. Pronto! Entre as suas mãos aparece um quadrado onde a imagem vira texto, e a música começa a ficar à sua disposição.

Para desligar, é só fechar o punho duas vezes seguidas.

## Cada dedo é um som

Aqui está a parte mais divertida. São 10 dedos, então são 10 camadas sonoras.

Quando você levanta um dedo, aquela camada entra na música. Quando você fecha o dedo, ela some. Além disso, cada levantada dispara um efeito de subida (tipo um riser ou um rolo de bateria) e cada fechada dispara um efeito de descida. É como se você estivesse mixando ao vivo com as mãos.

O som de cada dedo começa assim:

Mão esquerda: polegar toca o bumbo gabber, indicador toca o baixo 808, médio toca caixa com palma, anelar toca hi hat e mindinho toca prato.

Mão direita: polegar toca um stab de rave, indicador toca um lead serrilhado, médio toca hoover, anelar toca acid 303 e mindinho toca percussão.

Mas você manda no jogo. No painel do lado direito da tela, é só clicar em um dedo e escolher outro som para ele. Tem 16 sons prontos, de kick, clap e rumble até stab house e hats em 16 avos.

## Quer usar o seu próprio som?

Dá para fazer isso também. Use o botão "Som do computador" no painel e escolha um arquivo mp3, wav, ogg ou m4a. Ele vai parar direto no dedo que você deixou selecionado.

Cada arquivo pode tocar de três jeitos: uma vez a cada vez que você levanta o dedo, repetindo a cada tempo, ou repetindo a cada compasso.

## Mexa a mão inteira, não só os dedos

Os dedos não são a única coisa que importa. O app também presta atenção no resto da mão.

Inclinar as mãos muda o tom da música em até 5 semitons para cima ou para baixo. A nota do baixo muda conforme você inclina a mão esquerda, e o arpejo da mão direita sobe e desce pela escala. Subir as mãos deixa os hi hats mais brilhantes e o som mais aberto, com mais eco.

Se você girar a mão bem forte e segurar por um instante, o app troca algo na música: o padrão do ritmo, os instrumentos ativos ou a escala. Você escolhe no painel qual dessas três coisas o giro deve trocar.

## Os estilos de ritmo

A música roda a 172 BPM, com cara de hardcore. Os padrões disponíveis são Gabber, Frenchcore, Uptempo, Hardstyle e Terror.

Nas escalas, você pode alternar entre pentatônica menor, pentatônica maior, dórico, frígio, blues e acorde maj7. Todas soam bem juntas, então é difícil errar.

## Um gravador estilo FL Studio

Lá embaixo da tela tem uma barra de gravação. Aperte o botão vermelho e mexa os dedos: o app registra cada vez que você levantou ou fechou um dedo, encaixando tudo certinho no tempo (em fusas de 1/16).

Depois é só dar play e a sua criação fica tocando em loop, de 1, 2, 4 ou 8 compassos, até com as mãos fora da câmera. Dá para gravar uma camada por cima da outra e ir construindo a música aos poucos. Se quiser expandir a barra, dá para ver uma pista para cada dedo, com o nome do som e os blocos coloridos do que foi gravado.

Tem também um interruptor para manter o som de um dedo tocando mesmo quando a mão sai da câmera, ou de todos os dedos de uma vez.

## Como rodar no seu computador

Você precisa ter o Node instalado (versão 20.19 ou mais nova) e uma webcam.

```bash
git clone https://github.com/Kawwav/ascii.git
cd ascii
npm install
npm run dev
```

Depois abra o endereço que o terminal mostrar, normalmente http://localhost:5173, e libere a câmera.

Outros comandos úteis:

```bash
npm run build     # gera a versão final na pasta dist
npm run preview   # testa essa versão final localmente
npm run lint      # confere o código
npm run deploy    # publica no GitHub Pages
```

## Do que ele é feito

React 19 com Vite, para a interface e o carregamento rápido.

MediaPipe Tasks Vision, do Google, para reconhecer as mãos e separar você do fundo da imagem.

Web Audio API, para gerar todos os sons do zero com osciladores, ruído, filtros e distorção. Não existe nenhum sample dentro do projeto.

Canvas e texto puro, para desenhar o efeito ASCII.

## Dicas para funcionar melhor

Use um lugar bem iluminado. A detecção das mãos fica muito mais firme com boa luz.

Deixe as duas mãos inteiras dentro do quadro da câmera, com a palma virada para ela.

Se o som não tocar, clique ou toque na tela uma vez. Os navegadores só liberam o áudio depois de uma interação.

O app usa modelos que são baixados na hora, então precisa de internet na primeira vez que abrir.

Funciona melhor em computador, em navegadores como Chrome, Edge ou Firefox.

## Um recado final

Esse é um projeto feito por diversão e por curiosidade. Se você testar, brincar, quebrar ou tiver ideias novas de sons e gestos, vai ser um prazer ler. Abra uma issue ou mande um pull request, qualquer ajuda é muito bem vinda.

Agora levanta essas mãos e faz barulho!
