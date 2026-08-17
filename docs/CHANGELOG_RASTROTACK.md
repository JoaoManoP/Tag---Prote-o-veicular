# Changelog RastroTack

## Em andamento — 17/08/2026

- Adicionada localização atual e navegação diária web separada do tracking.
- POIs passaram a usar a localização autorizada e ganharam novas categorias.
- Documentados providers externos de mapa, rota, POIs e placa.
- Convite móvel alterado para fragmento de URL, evitando token em query/log HTTP.
- Consentimento móvel passou a ser persistido, revogável e obrigatório para telemetria.
- Adicionadas rotas e APIs protegidas para Admin e Laboratório.
- Adicionado endpoint de readiness.
- Adicionados rerouting por desvio confirmado, orientação por voz e cooldown.
- Adicionadas até oito paradas reordenáveis e preferência para evitar pedágios.
- POIs individuais agora podem ser adicionados como parada; nomes externos são escapados antes de entrar no popup.
- Criados auditoria inicial, arquitetura, checklist, segurança, LGPD e plano de testes.
- Adicionados exportação LGPD, exclusão autenticada, retenção configurável e IDs de requisição.
- Adicionados token CSRF nas ações críticas, validação de produção e troca de senha com revogação das outras sessões.
- POIs agora podem ser buscados perto do usuário ou ao longo da rota calculada.
- Preço de combustível separado do cadastro do veículo, com fonte e atualização próprias.
- Histórico ganhou reprodução visual identificada como `REPRODUÇÃO`, sem se confundir com GPS ao vivo.
- Adicionados arquitetura mobile e atalhos de execução, testes e depuração para VS Code.
- Consulta por placa ganhou normalização dos dois padrões brasileiros, allowlist, campos ausentes nulos e erros estáveis para autenticação, timeout, indisponibilidade, limite e não encontrado.
