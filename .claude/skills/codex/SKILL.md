---
name: codex
description: Trabalho em conjunto Claude + Codex (extensão do VS Code). Use SOMENTE quando o usuário pedir explicitamente ("com o Codex", "em conjunto", "/codex", "os dois"). Nunca acione o Codex por conta própria.
---

# Parceria Claude + Codex

## Regra de ouro (economia de tokens)
- O Codex só entra quando o usuário pedir explicitamente na mensagem atual. Sem pedido, trabalhe sozinho.
- Uma chamada por etapa. Prompts objetivos, em PT-BR, com escopo (arquivos/diff) e formato de resposta pedidos.

## Onde o Codex "mora"
A extensão do VS Code e a linha de comando compartilham o mesmo histórico (`~/.codex/sessions`).
Toda chamada feita pelo wrapper vira uma conversa visível no painel do Codex do VS Code, e toda
conversa que o usuário abre no painel pode ser lida e continuada pelo Claude.

## Como chamar
Wrapper: `scripts/codex.ps1` (resolve o binário da extensão sozinho; grava a resposta em `.codex-out/<timestamp>-<modo>.md`).

```powershell
.\scripts\codex.ps1 list                                    # conversas recentes (id, nome)
.\scripts\codex.ps1 read [-Session <id>]                    # última pergunta/resposta de uma conversa (sem gastar tokens)
.\scripts\codex.ps1 ask -Prompt "..."                       # nova conversa, read-only
.\scripts\codex.ps1 resume -Prompt "..." [-Session <id>]    # continua uma conversa (inclusive aberta no painel)
.\scripts\codex.ps1 review -Uncommitted | -Base <sha> | -Commit <sha>
.\scripts\codex.ps1 implement -Prompt "..."                 # pode editar (workspace-write)
# opções: -Config 'model_reasoning_effort="high"'  -Model <nome>
```
Prompts longos: gravar em arquivo e passar `-Prompt (Get-Content arquivo -Raw)`.
Depois da chamada, leia o `.md` em `.codex-out/` (ou use `read`) e cite os achados dele no relatório.

## Dois jeitos de trabalhar
1. **Claude dirige**: Claude chama `ask`/`review`/`implement`; o usuário acompanha no painel do Codex e pode responder por lá; Claude continua com `resume`.
2. **Usuário dirige o Codex no painel**: o usuário conversa com o Codex no VS Code; Claude usa `list` + `read` para pegar o resultado e `resume -Session <id>` para mandar perguntas de acompanhamento na mesma conversa.

## Protocolo simétrico
Ambos implementam e ambos revisam.

### Revisão conjunta
1. Baseline (`npm run lint`, `npm test`; `npm run check` em `frontend/mobile`).
2. Revisão Claude, independente, sem ler a do Codex antes.
3. Revisão Codex em paralelo (`review` ou `ask` read-only) sobre o mesmo escopo.
4. Cruzamento: verifique cada achado do Codex no código (Confirmado/Refutado). Envie os seus ao Codex (`resume`) para ele confirmar ou contestar.
5. Relatório único: tabela com arquivo, achado, severidade, quem apontou (Claude/Codex/ambos), status. Não aplique correções sem o usuário escolher.

### Implementação conjunta
1. Divida a tarefa em partes com fronteiras claras (arquivos diferentes).
2. Codex implementa a parte dele via `implement` (de preferência em `git worktree` separado).
3. Claude implementa a parte dele.
4. Cada lado revisa a parte do outro (`review -Uncommitted` para o Codex revisar o Claude; Claude lê o diff do Codex).
5. Testes. Commit só se o usuário pedir.

## Divergências
Quando Claude e Codex discordarem, mostre os dois argumentos ao usuário e recomende um lado com justificativa. Não esconda o desacordo.
