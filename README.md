# Rastreon — Plataforma de Rastreamento Veicular

Demonstração web de uma central de rastreamento com autenticação, banco SQLite, planejamento rodoviário, alternativas, comparação entre rota planejada e realizada, reconstrução explícita de lacunas offline e compartilhamento consentido da localização de um celular.

## Requisitos e execução

- Node.js 20 ou mais recente
- Visual Studio Code (recomendado)

```bash
cd rastreador-simulador
npm install
copy .env.example .env
npm run db:init
npm start
```

Abra `http://localhost:3000`. Para desenvolvimento com reinício automático, use `npm run dev`. Para executar os testes, use `npm test`.

## Login, API e banco de dados

- Ao abrir o site, crie uma conta demo ou entre com uma conta existente.
- Senhas são armazenadas como hash bcrypt; nunca em texto puro.
- A sessão utiliza cookie `HttpOnly`, `SameSite=Lax` e expira após 24 horas. Em produção/HTTPS, o cookie também usa `Secure`.
- Usuários, sessões, veículos, viagens, posições e interrupções ficam no SQLite em `data/rastreon.sqlite` por padrão.
- Cada sessão de rastreamento pertence ao usuário autenticado. Outro usuário recebe resposta de recurso inexistente.
- O endpoint `GET /api/health` confirma o estado da API e do banco.
- `npm run db:init` cria ou atualiza as tabelas sem apagar dados.

Configure um `SESSION_SECRET` longo e aleatório no `.env`. Sem ele, o desenvolvimento usa um segredo temporário e os logins deixam de valer quando o servidor reinicia. Em `NODE_ENV=production`, o servidor não inicia sem o segredo.

## Acesso pela rede local

O servidor escuta em `0.0.0.0` por padrão. Descubra o IPv4 do computador com `ipconfig` e acesse de outro aparelho na mesma rede usando, por exemplo, `http://192.168.1.10:3000`. Configure `PUBLIC_URL` com esse endereço para o QR Code apontar para o celular.

O firewall do Windows pode solicitar autorização para a porta 3000. Acesso público pela internet requer hospedagem, HTTPS, domínio e proxy reverso; não exponha diretamente o servidor de desenvolvimento.

## Usar com um celular real

1. O celular e o computador precisam conseguir acessar o mesmo servidor.
2. Defina `PUBLIC_URL` no `.env` com a URL que o celular abrirá.
3. Geolocalização em navegadores exige **contexto seguro (HTTPS)**, exceto em `localhost`. Para testar em outro aparelho, publique o servidor com HTTPS ou use um túnel HTTPS confiável.
4. Crie a sessão no painel, escaneie o QR Code e toque em **Iniciar compartilhamento** no celular. A permissão só é solicitada nesse momento.

## Comportamento e privacidade

- Nenhuma localização é capturada antes do consentimento explícito no celular.
- O botão de parar chama `clearWatch()` e interrompe o rastreamento.
- Se o painel encerrar a sessão, o celular também interrompe o rastreamento.
- O Socket.IO tenta se reconectar automaticamente após uma queda de internet.
- O círculo no mapa e a telemetria usam `coords.accuracy`; seis casas decimais não representam garantia de precisão física.
- O consumo de combustível é somente uma estimativa: distância percorrida dividida pela eficiência em km/L configurada no painel. Não há leitura do veículo.
- O cache em memória mantém até 10.000 posições por sessão; o histórico completo é persistido no SQLite.

## Viagem Inteligente

- A busca de cidades, bairros e endereços usa Nominatim/OpenStreetMap através do servidor.
- Distância e duração planejadas vêm de rotas rodoviárias do OSRM; não são calculadas em linha reta.
- Clique em uma alternativa cinza no mapa para promovê-la a rota principal.
- O celular mantém pontos GPS em uma fila estruturada no `IndexedDB` durante uma queda. A reconexão envia lotes em ordem e remove somente as sequências confirmadas pelo servidor.
- A combinação de sessão e número de sequência é idempotente: reenviar o mesmo ponto não duplica a posição persistida.
- Três ou mais pontos GPS locais formam um trecho confirmado. Sem pontos suficientes, o painel consulta rotas possíveis e apresenta a mais plausível como reconstrução estimada, com alternativas visíveis.
- Reconstruções são guardadas separadamente em `route_gaps` e `reconstruction_candidates`; nunca substituem os pontos GPS originais.
- Cada candidato registra confiança, classificação e os componentes usados na pontuação: tempo, direção, velocidade, proximidade da rota planejada e plausibilidade de distância.
- A interface identifica o resultado como **rota provável**, com alternativas e percentual de confiança. Map matching permanece uma abstração indisponível por padrão e não modifica a telemetria bruta.
- Horários autorizados são persistidos por veículo com dias da semana, intervalo e timezone, incluindo regras que atravessam a meia-noite.
- Movimento fora da regra cria alerta interno `OUTSIDE_ALLOWED_TIME` somente com velocidade e precisão aceitáveis. Um cooldown evita alertas repetidos; não há envio real de SMS, WhatsApp ou push.
- Áreas de cobertura circulares são escolhidas pelo usuário. Precisão ruim gera estado pendente; saída exige leituras consecutivas e usa histerese/cooldown.
- O painel oferece cenários demonstrativos de percurso, queda offline, saída da área e movimento fora do horário.
- Ranking e conquistas são opcionais. A pontuação considera viagens concluídas, continuidade, configurações de proteção e qualidade do GPS; velocidade não gera pontos.
- A referência de endpoints está em `docs/API.md` e a preparação para aplicativo/tag física em `docs/MOBILE_ROADMAP.md`.
- Os modelos pré-carregados são referências demonstrativas baseadas no PBE Veicular/Inmetro e devem ser conferidos para ano e versão. A opção manual permanece disponível.
- Não é realizada consulta de proprietário por placa.
- Os planos são apenas visuais e não contêm pagamento.

## Estrutura

O Express serve os arquivos de `public/`, faz proxy controlado para geocodificação/roteamento e mantém sessões temporárias. O dashboard usa Haversine apenas entre coordenadas GPS para medir o percurso realizado; a distância rodoviária planejada sempre vem do roteador. `mobile.js` controla `watchPosition()`, consentimento e fila offline.

## Provedores de geocodificação e rotas

- A geocodificação usa um adaptador do Nominatim. A consulta é enviada somente quando o usuário pressiona Enter, sem autocomplete contínuo.
- `ROUTE_PROVIDER=osrm` é o padrão e não exige chave.
- `ROUTE_PROVIDER=google` usa a Google Routes API pelo backend e exige `GOOGLE_MAPS_API_KEY` no `.env`.
- A chave do Google nunca é enviada ao HTML, ao JavaScript público ou a um iframe.
- Rotas do Google podem considerar trânsito e `TWO_WHEELER`; disponibilidade, cobrança e cobertura dependem da configuração da conta Google Maps Platform.
- Pedágios e campos não oferecidos pelo provider são apresentados como indisponíveis, nunca estimados silenciosamente.
