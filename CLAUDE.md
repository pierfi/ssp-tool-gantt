# CLAUDE.md

Contesto condiviso da ogni istanza di Claude che lavora su questo repo:
Claude Code (CLI, web/app) e claude.ai. Uso, comandi e moduli:
[README.md](README.md).

## Regole di lavoro

- Mai commit diretti su `main`: si lavora su un branch `feature/<nome>` e si
  entra con una PR, che l'utente rivede e mergia (merge commit, non squash).
  Finché il repo non ha un remote su GitHub, il merge lo fa l'utente in
  locale con `git merge --no-ff`.
- Un branch che vive a lungo si aggiorna con `git merge main`, mai con
  rebase o force push.
- In una sessione interattiva (CLI, web/app): prima di ogni commit mostrare
  le modifiche e aspettare l'ok.
- Commit piccoli e coerenti, build verde (`npm run build`) a ogni commit.

### Commit

```
<codice>: <descrizione> | <label>
```

- `<codice>`: il task. `GNT-NN` per le modifiche all'app (Team Planner),
  `WF-NN` per flusso di lavoro e manutenzione del repo; numeri progressivi
  per prefisso, il successivo si ricava da `git log`.
- `<descrizione>`: cosa fa il commit, in italiano.
- `<label>`: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`.
- Esempio: `GNT-01: Barra di avanzamento sulle epiche | feat`. Dopo la prima
  riga si può aggiungere un corpo con i dettagli.
- Niente righe di attribuzione (`Co-Authored-By`, `Claude-Session` o
  simili), né nei commit né nelle descrizioni delle PR.
- Mai il trattino lungo (U+2014): sempre `-`, nei commit e nelle PR.
