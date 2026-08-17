# Arquitetura mobile

## Estado atual

O cliente móvel disponível é uma aplicação web responsiva servida pelo mesmo backend Express. Ele transforma um celular autorizado em fonte de GPS em primeiro plano, com consentimento explícito, fila offline em IndexedDB e envio em ordem pelo Socket.IO. Não é um aplicativo Android/iOS nativo e não promete funcionamento contínuo com tela bloqueada.

```text
Painel web autenticado ── cria convite temporário ──┐
                                                   v
Celular/PWA ── consentimento + GPS ── Socket.IO ── API única ── SQLite
                                                   ^
App nativo futuro ── credencial revogável ─────────┘
```

## Contrato de telemetria

Cada posição inclui identificador do dispositivo, sequência monotônica, latitude, longitude, precisão, velocidade, direção, altitude, instante de captura, fonte e indicação de captura offline. O servidor valida formato, autorização, frequência, consentimento e idempotência antes de persistir.

O GPS bruto é a fonte de verdade. Rotas planejadas, map matching e reconstruções de lacunas permanecem em estruturas separadas e nunca sobrescrevem a telemetria recebida.

## Segurança e ciclo de vida

- O convite por QR/código é temporário, escopado à sessão e não contém cookies da conta.
- O token fica no fragmento da URL, que não é enviado no request HTTP inicial.
- A permissão de localização só é solicitada após ação clara do usuário.
- Revogação ou encerramento chama `clearWatch()` e bloqueia novos envios.
- O painel não recebe dados do celular antes do consentimento.
- Credenciais permanentes por dispositivo, rotação e armazenamento seguro nativo ainda precisam ser implementados antes de produção.

## Aplicativo nativo planejado

O app Android/iOS deve reutilizar o mesmo backend e contrato, substituindo IndexedDB por armazenamento seguro nativo e adicionando uma credencial revogável por instalação. Trabalho em background exige serviço foreground no Android e modos/permissões compatíveis no iOS, com indicador visível, controle iniciar/parar, política de bateria e testes em aparelhos físicos.

Google Navigation SDK, login Google, notificações e publicação nas lojas dependem de projeto, credenciais, billing, identificadores de pacote, termos e decisões de produto. Esses itens não são considerados concluídos pela implementação web.

## Desenvolvimento local

Use `npm run dev` para a API e os clientes web. Configure `PUBLIC_URL` com um endereço HTTPS alcançável pelo telefone. O VS Code inclui tarefas para instalar, inicializar banco, desenvolver, testar e validar o predeploy. Para depuração, a configuração “RastroTack: servidor” inicia o backend Node; a configuração “RastroTack: anexar” conecta a um processo iniciado com inspector.
