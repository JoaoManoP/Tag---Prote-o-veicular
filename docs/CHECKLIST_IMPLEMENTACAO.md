# Checklist de implementação

Legenda: `[ ]` não iniciado, `[~]` em andamento, `[x]` validado, `[!]` bloqueado, `[-]` removido.

- [x] Fase 0 — auditoria inicial e inventário da stack.
- [x] Fase 1 — segurança crítica, consentimento, CSRF e direitos LGPD validados localmente.
- [x] Fase 2 — build, infraestrutura local, autenticação, troca de senha, readiness e backup validados.
- [x] Fase 3 — HUD responsivo sem redesign radical.
- [x] Fase 4 — provider de mapa com fallback.
- [x] Fase 5 — endereço, CEP e geocodificação.
- [~] Fase 6 — rotas; paradas, evitar pedágios e rerouting implementados, ainda aguardando teste GPS físico.
- [x] Fase 7 — GPS web, sessão móvel, fila offline e WebSocket.
- [x] Fase 8 — marcador 2D, heading, interpolação e follow.
- [x] Fase 9 — cerco circular/poligonal, persistência e histerese.
- [~] Fase 10 — modo viagem com voz e rerouting; falta validação física/background nativo.
- [x] Fase 11 — POIs próximos, corredor de rota e inclusão como parada validados.
- [~] Fase 12 — radares/lombadas/pedágios; cobertura externa incompleta.
- [~] Fase 13 — arquitetura, normalização, segurança e testes simulados da placa concluídos; teste real aguarda credencial do provider.
- [x] Fase 14 — eficiência/consumo e valor referencial FIPE por código integrados com fontes explícitas.
- [!] Fase 15 — Google Login aguardando credenciais e decisão de produto.
- [ ] Fase 16 — CNH/documentos.
- [!] Fase 17 — aplicativo mobile nativo ainda não criado.
- [!] Fase 18 — background GPS depende de app e permissões Android/iOS.
- [!] Fase 19 — Navigation SDK depende de projeto Google/billing/app.
- [ ] Fase 20 — IA GPS; somente após fontes estruturadas estarem estáveis.
- [ ] Fase 21 — modo voo opcional.
- [x] Fase 22 — hardening local, configuração fail-fast, request IDs, backup e proxy versionado.
- [!] Fase 23 — deploy VPS aguardando acesso e auditoria do ambiente real.
- [~] Fase 24 — auditoria automatizada local aprovada; validações visual, física e de produção ainda bloqueadas.

Entregas transversais: preço de combustível está separado do veículo; o histórico possui modo de reprodução claramente rotulado; arquitetura mobile e tarefas do VS Code foram documentadas.
