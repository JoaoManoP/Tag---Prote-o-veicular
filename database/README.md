# Banco de dados

Esta pasta concentra toda a persistencia da aplicacao.

- `database.js`: conexao SQLite e schema principal.
- `migrations.js`: evolucao controlada do schema.
- `init-database.js`: inicializacao e aplicacao das migrations.
- `backup-database.js`: backup consistente com verificacao de integridade.
- `data/`: banco ativo e arquivos privados gerados em runtime (nao versionados).
- `backups/`: copias verificadas do SQLite (nao versionadas).
- `reference-assets/`: imagens, vídeos, capturas e especificações visuais preservadas.

Por padrao, a aplicacao usa `database/data/rastreon.sqlite`. Use `DATABASE_PATH` apenas quando for necessario apontar para outro arquivo.
