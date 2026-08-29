# Banco de dados

Esta pasta concentra a conexão SQLite, as migrações e os comandos de inicialização e backup.

- `data/`: banco ativo, documentos privados e uploads locais.
- `backups/`: cópias verificadas do banco.
- `legacy-data/`: dados antigos preservados durante migrações de diretório.

Esses três diretórios contêm dados de runtime e permanecem fora do Git.
