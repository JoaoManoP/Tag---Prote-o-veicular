# Backup da aparência (comunidade, carrossel e pinos) — 02/09/2026

Cópia dos arquivos visuais antes do redesenho de 03/09/2026. O mesmo estado
está marcado no git pela tag `aparencia-2026-09-02`.

## Como voltar à aparência antiga

Opção rápida (só os arquivos visuais):

```powershell
Copy-Item frontend/web/backup-aparencia-2026-09-02/css/*.css frontend/web/css/ -Force
Copy-Item frontend/web/backup-aparencia-2026-09-02/js/platform-features.js frontend/web/js/ -Force
Copy-Item frontend/web/backup-aparencia-2026-09-02/index.html frontend/web/index.html -Force
```

Opção completa (todo o código como estava):

```powershell
git checkout aparencia-2026-09-02 -- frontend/web
```

Depois, recarregue o painel com Ctrl+F5.
