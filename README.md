# RastroTack

Plataforma web demonstrativa de rastreamento e proteção veicular. Nesta etapa, um celular autorizado funciona como tag temporária; uma futura tag física permanece apenas como possibilidade arquitetural, sem hardware ou integração real implementados.

O produto nunca promete localização absolutamente exata. O painel diferencia posição medida pelo GPS, posição simulada, posição antiga, última posição conhecida, posição suspeita, trecho medido, trecho estimado e rota planejada.

## Arquitetura

O projeto é um monólito modular local:

- `public/`: painel, autenticação, página móvel e áreas restritas em HTML, CSS e JavaScript.
- `server/server.js`: composição HTTP, REST e Socket.IO.
- `server/auth.js`: validação de cadastro e autenticação.
- `server/authorization.js`: funções `USER`, `ADMIN` e `DEVELOPER`.
- `server/telemetry.js`: contrato, validação, Haversine, precisão e anomalias.
- `server/providers/`: adaptadores substituíveis de rotas e dispositivos.
- `server/database.js` e `server/migrations.js`: SQLite e migrações incrementais.
- `tests/`: testes de integração e regras críticas.

Dados persistentes ficam no SQLite. Memória e `localStorage` são usados somente para presença de sockets, estado transitório da interface e fila offline do próprio aparelho.

## Tecnologias

- Node.js 20 ou superior
- Express e Socket.IO
- SQLite com `better-sqlite3`
- HTML5, CSS3 e JavaScript moderno
- Leaflet e OpenStreetMap
- OSRM para rotas e Nominatim para geocodificação
- Bcrypt, Helmet e rate limiting
- Node Test Runner e Supertest

## Instalação no VS Code

1. Instale o Node.js 20 ou mais recente.
2. Abra a pasta do projeto no VS Code.
3. Abra o terminal integrado.
4. Execute:

```bash
npm install
copy .env.example .env
npm run db:init
npm start
```

Abra `http://localhost:3000`. Durante o desenvolvimento, `npm run dev` reinicia o servidor quando o código muda.

## Variáveis de ambiente

Consulte `.env.example`:

- `NODE_ENV`: `development` ou `production`.
- `HOST`: interface de rede; o padrão é `0.0.0.0`.
- `PORT`: porta HTTP; o padrão é `3000`.
- `PUBLIC_URL`: URL usada no QR Code.
- `SESSION_SECRET`: segredo longo e aleatório, obrigatório em produção.
- `SESSION_TTL_MINUTES`: duração da sessão de rastreamento.
- `DATA_RETENTION_DAYS`: retenção de sessões encerradas.
- `DATABASE_PATH`: caminho opcional do SQLite.

Nunca coloque valores reais de segredo no repositório.

## Conta e permissões

Todo cadastro público recebe exclusivamente a função `USER`. Alterar HTML, corpo da requisição, cookie ou `localStorage` não concede privilégios.

Funções disponíveis:

- `USER`: próprios veículos, sessões, viagens e posições.
- `ADMIN`: indicadores operacionais agregados, sem acesso automático a coordenadas ou documentos.
- `DEVELOPER`: Laboratório restrito com dados fictícios.

Para atribuir uma função em desenvolvimento local:

```bash
npm run role:set -- usuario@exemplo.com DEVELOPER
```

Também são aceitos `USER` e `ADMIN`. A operação é local, exige acesso ao computador e gera auditoria no banco.

## Conectar um celular

1. Configure `PUBLIC_URL` com um endereço que o celular consiga abrir.
2. Selecione e salve um veículo.
3. Crie uma sessão e leia o QR Code.
4. No celular, leia finalidade, duração e aviso de privacidade.
5. Toque em **Iniciar compartilhamento**.
6. Autorize o GPS no navegador.

O GPS não é solicitado antes do clique. Parar o compartilhamento executa `clearWatch()` e revoga o consentimento ativo. Encerrar ou expirar a sessão também bloqueia novos envios.

## HTTPS e rede local

Geolocalização no navegador exige contexto seguro, normalmente HTTPS, exceto em `localhost`. Um endereço HTTP da rede local pode ser bloqueado pelo Android ou iOS.

Para testar na mesma rede:

1. Descubra o IPv4 do computador com `ipconfig`.
2. Configure `PUBLIC_URL`, por exemplo `http://192.168.1.10:3000`.
3. Libere a porta somente na rede privada quando o Windows solicitar.
4. Prefira um túnel HTTPS confiável para o celular.

Não exponha diretamente o servidor de desenvolvimento na internet.

## Rastreamento e contrato da telemetria

Fontes aceitas nesta etapa:

- `mobile-gps`: celular com consentimento registrado.
- `simulation`: simulador do proprietário ou Laboratório.

`physical-tag` permanece bloqueado até existir autenticação criptográfica de dispositivo.

Cada mensagem inclui dispositivo, horário, coordenadas, precisão, velocidade, direção, altitude, origem e sequência. O backend rejeita mensagens malformadas, grandes, antigas, futuras, duplicadas, fora de ordem ou frequentes demais.

Um salto fisicamente improvável não é corrigido silenciosamente: a coordenada original é preservada e marcada como suspeita com o motivo.

Classificação de precisão:

- Excelente: até 10 metros.
- Boa: acima de 10 e até 30 metros.
- Regular: acima de 30 e até 100 metros.
- Baixa: acima de 100 metros.

Seis casas decimais não significam precisão física de centímetros.

## GPS, comunicação e última posição

GPS/GNSS calcula a posição no dispositivo. O satélite não envia a coordenada diretamente ao site. O celular ou uma futura tag precisa transmitir o dado ao servidor.

Sem comunicação, o servidor conhece somente a última posição recebida. O painel mostra a idade dessa posição e não deve chamar uma posição antiga de localização atual.

Android e iOS podem suspender o navegador quando a tela é bloqueada ou o site fica em segundo plano.

## Fila offline e trechos estimados

Durante uma queda, o navegador continua coletando quando permitido e guarda no máximo 5.000 pontos no aparelho. Ao reconectar, envia os pontos em ordem e o servidor aplica validação de sequência e duplicação.

Pontos GPS offline aceitos continuam sendo percurso medido. Quando não existem pontos intermediários suficientes, o painel pode consultar rotas possíveis e apresentar uma reconstrução explicitamente estimada. Uma alternativa nunca é silenciosamente declarada como trajeto real.

## Veículos, consumo e autonomia

Há exemplos demonstrativos de Fiat Argo, Chevrolet Onix, Hyundai HB20, Toyota Corolla e Honda CG 160, além de preenchimento manual. A placa é opcional.

O consumo é uma estimativa baseada em distância e eficiência configurada. O custo usa o preço informado do combustível. Trânsito, relevo, carga, pneus, manutenção, combustível, ar-condicionado e condução alteram o resultado.

O sistema não lê o tanque. Uma leitura real dependeria de integração autorizada com veículo, telemetria embarcada ou OBD-II.

## Planejamento de viagem

A busca usa Nominatim e as alternativas rodoviárias usam OSRM por meio de um `RouteProvider`. Os serviços públicos não possuem SLA para o produto. Trânsito, pedágios e limites de velocidade não estão disponíveis na implementação atual e aparecem como dependências futuras, nunca como valores inventados.

## Laboratório

O Laboratório exige a função `DEVELOPER` no servidor. `LAB-DEMO` é apenas um rótulo visual, não uma autenticação.

Atualmente ele oferece validação segura de mensagens fictícias e informações sanitizadas do ambiente. Não aceita documentos reais nem habilita a futura tag física. Simulações avançadas, identidade fictícia e gamificação permanecem incrementos futuros.

Gamificação futura deverá usar somente condução responsável e dados confiáveis. Velocidade real, chegada em primeiro lugar ou localização de terceiros nunca poderão aumentar a chance de vitória.

## Administração

A área `ADMIN` é separada do Laboratório e mostra somente indicadores agregados. Acesso excepcional futuro a dados sensíveis exigirá justificativa, duração limitada, menor privilégio e auditoria.

## Privacidade e LGPD

- Nenhum rastreamento oculto.
- Consentimento explícito antes do GPS.
- Propriedade validada no backend.
- Retenção mínima configurável.
- Exclusão do histórico da sessão.
- Sem coordenadas completas em logs comuns.
- Sem consulta de proprietário por placa.
- Sem documentos reais no Laboratório.
- HTTPS e WSS obrigatórios em produção.

Antes de uso real, a política de retenção, bases legais, atendimento a titulares e resposta a incidentes precisam de validação jurídica e operacional.

## Erros comuns

- **Permissão negada:** habilite a localização para o navegador e inicie novamente.
- **GPS desativado:** ative os serviços de localização do aparelho.
- **Timeout:** vá para um local com melhor recepção e tente novamente.
- **Falta de HTTPS:** use `localhost` ou disponibilize uma URL HTTPS confiável.
- **Sessão expirada:** crie uma nova sessão no painel.
- **Rota indisponível:** confirme a conexão; OSRM e Nominatim podem estar indisponíveis.

## Uso em pen drive

O código pode ser copiado, mas `node_modules`, `.env` e o banco não devem ser versionados. No novo computador, instale o Node.js, execute `npm install`, copie um `.env` local e inicialize o banco. Trate qualquer banco copiado como dado pessoal protegido.

## Qualidade

```bash
npm run lint
npm test
npm run build
```

O build atual valida a sintaxe porque o frontend é estático e não possui etapa de empacotamento.

## Próximos passos para a tag física

O adaptador `TrackerDeviceProvider` prepara a troca da origem sem definir hardware. Possibilidades futuras incluem GNSS, microcontrolador, LTE-M/NB-IoT/4G, SIM/eSIM, bateria protegida, identidade criptográfica, firmware assinado, armazenamento offline e atualização segura. Nada disso está implementado ou homologado nesta demonstração.
