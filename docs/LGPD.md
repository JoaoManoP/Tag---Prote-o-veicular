# LGPD

Geolocalização e documentos são dados pessoais. O tratamento deve observar finalidade, necessidade, transparência, segurança, retenção e direitos do titular.

## Implementado

- Ação explícita para iniciar/parar compartilhamento.
- Registro de concessão e revogação do consentimento do GPS móvel.
- Isolamento dos dados por usuário.
- Área administrativa agregada sem exposição automática de coordenadas.
- Exportação autenticada e isolada dos dados do titular, sem hashes, tokens ou sessões.
- Exclusão autenticada e confirmada da conta, com cascata nos dados vinculados e trilha de auditoria sem manter a identidade do usuário excluído.
- Retenção configurável por `DATA_RETENTION_DAYS`; o valor `0` mantém a limpeza desativada até existir política aprovada.

## Pendente antes de produção completa

- Aprovar juridicamente as finalidades e os períodos antes de alterar `DATA_RETENTION_DAYS` em produção.
- Definir retenção específica para alertas e auditoria que não dependem da sessão de rastreamento.
- Processo para encarregado, incidentes e fornecedores externos.
- Avaliação específica para CNH, selfie e validação de identidade.
