# Roadmap

Piano di lavoro del Team Planner. Ogni voce è un task con il suo codice
(`GNT-NN` per l'app, `WF-NN` per flusso di lavoro e manutenzione): il codice
si assegna qui e si usa nei commit del task. L'ordine delle fasi è quello
proposto; dentro una fase i task si possono scambiare.

Stato: `fatto` · `in corso` · `pronto` (si può partire) · `da decidere`
(serve una scelta prima di partire, vedi [Decisioni](#decisioni)) · `scartato`
(deciso di non farlo, con il motivo nella decisione).

## Fatto

| Codice | Task | PR |
| --- | --- | --- |
| WF-01 | Import iniziale del Team Planner da Claude Design | - |
| GNT-01 | Dati nel db dell'Artifact claude.ai, build a file singolo | - |
| WF-02 | Regole di commit in `CLAUDE.md` | #1 |
| GNT-02 | Evidenziazione di una o più epiche sul Gantt | #2 |
| GNT-03 | Menu col tasto destro sui task, cambio assegnatario | #2 |

## Fase 0 - Base di lavoro

Obiettivo: poter cambiare il codice senza paura di rompere i dati condivisi.
Va fatta prima delle feature, perché tutto il resto ci si appoggia.

| Codice | Task | Stato |
| --- | --- | --- |
| WF-03 | `CLAUDE.md`: le PR passano da GitHub | in corso |
| WF-04 | Questa roadmap, registro dei codici dei task | in corso |
| WF-05 | Test con Vitest su `logic.ts` e `store.ts` | pronto |
| WF-06 | GitHub Actions: build e test su ogni PR | pronto |
| WF-07 | Procedura di pubblicazione dell'Artifact | pronto |
| WF-08 | Scomporre `TeamPlanner.tsx` in componenti | pronto |

- **WF-05** Test su parser e serializzatore del formato testo
  (`parse()` / `serializeEpic()`, andata e ritorno), scheduling delle
  dipendenze (`norm()`), date e settimana ISO, e sul diff di `DbSync` con un
  db finto (cosa scrive, cosa cancella, nessuna scrittura a stato invariato).
  Fatto quando `npm test` gira e copre questi casi.
- **WF-06** Workflow che su ogni PR esegue `npm ci`, `npm run build` e
  `npm test`. Fatto quando una PR rossa non si può mergiare senza vederlo.
- **WF-07** Regola: l'Artifact si ripubblica solo da `main` aggiornato, dopo
  il merge. Documentata in `README.md` e `CLAUDE.md`, con il numero di
  versione dell'Artifact annotato nella PR.
- **WF-08** `TeamPlanner.tsx` è un solo componente di circa 2.100 righe.
  Separare header, colonna sinistra (team ed epiche), griglia, pannello di
  dettaglio, dialoghi e menu, senza cambiare comportamento. Dopo WF-05, così i
  test proteggono il refactor.

## Fase 1 - Dati al sicuro e allineamento al design

Obiettivo: nessun dato perso, nessuna funzione del design rimasta indietro.

| Codice | Task | Stato |
| --- | --- | --- |
| GNT-04 | Dipendenze: allineamento con il progetto Claude Design | pronto |
| GNT-05 | Esporta e importa tutto il planner in JSON | pronto |
| GNT-06 | Annulla l'ultima modifica | da decidere (D2) |

- **GNT-04** Confrontare il `.dc.html` aggiornato con il codice e portare qui
  la gestione delle dipendenze migliorata nel design. Fatto quando ogni
  funzione delle dipendenze del design esiste anche nell'app, o è scartata
  con un motivo scritto qui.
- **GNT-05** "Esporta" salva un file JSON con membri, epiche e attività;
  "Importa" lo carica sostituendo o unendo. Serve come backup del db e per
  portare nell'Artifact i dati rimasti nel `localStorage` di `npm run dev`.
- **GNT-06** Annullare le proprie ultime azioni (spostamento, riassegnazione,
  eliminazione). Con più persone sul db l'annulla deve toccare solo le
  modifiche fatte da chi lo usa.

## Fase 2 - Lavoro quotidiano sul Gantt

Obiettivo: fare dal Gantt le operazioni di tutti i giorni, senza passare dal
pannello di dettaglio.

| Codice | Task | Stato |
| --- | --- | --- |
| GNT-07 | Menu col tasto destro completo | pronto |
| GNT-08 | Stato delle attività e avanzamento delle epiche | pronto |
| GNT-09 | Filtri per membro ed epica, ricerca per key e titolo | pronto |
| GNT-10 | Scadenze delle epiche sul Gantt e attività in ritardo | pronto |
| GNT-11 | Durate in giorni lavorativi | pronto |

- **GNT-07** Al menu di GNT-03 si aggiungono: tipo task/bug, durata,
  duplica, collega a (dipendenza), elimina con conferma dentro il menu (il
  viewer di claude.ai non mostra `confirm()`).
- **GNT-08** Stato per attività (todo, development, test, done: D3) visibile sulla
  barra; percentuale di avanzamento sulla card e sulla riga dell'epica.
- **GNT-09** Filtri nell'header che nascondono righe e barre, combinabili con
  l'evidenziazione di GNT-02. Preferenza del singolo browser.
- **GNT-10** Linea verticale sulla data di scadenza di ogni epica; le
  attività che finiscono dopo la scadenza della loro epica si segnalano sulla
  barra e sulla card.
- **GNT-11** Oggi `5d` sono 5 giorni di calendario, weekend compresi. Con i
  giorni lavorativi italiani (lun-ven, D4) una durata salta sabato e
  domenica, anche nello scheduling delle dipendenze.

## Fase 3 - Team

Obiettivo: usare il planner in più persone con regole chiare.

| Codice | Task | Stato |
| --- | --- | --- |
| GNT-12 | Permessi: chi modifica e chi legge | scartato (D5) |
| GNT-13 | Chi ha modificato cosa e quando | pronto |
| GNT-14 | Integrazione con Jira | scartato (D6) |

- **GNT-12** Regole del db dell'Artifact per livello di condivisione: per
  esempio tutti leggono, solo i Contributor modificano le attività, solo gli
  Editor gestiscono team ed epiche. L'interfaccia nasconde i comandi che
  l'utente non può usare.
- **GNT-13** Su ogni attività: autore e data dell'ultima modifica, visibili
  nel pannello di dettaglio.
- **GNT-14** Oggi Jira entra solo come testo incollato. Valutare la lettura
  diretta delle epiche da Jira tramite un connettore claude.ai.

## Decisioni

| # | Domanda | Risposta (16/10/2026) | Effetto |
| --- | --- | --- | --- |
| D1 | Come leggiamo il design aggiornato? | Il design è curato da Claude Design: la fonte è lì, il codice lo segue. Come leggerlo (`/design-login` o export del `.dc.html`) si sceglie a inizio GNT-04. | GNT-04 pronto |
| D2 | L'annulla serve, o basta l'export di GNT-05? | Da spiegare, vedi sotto. | GNT-06 da decidere |
| D3 | Quali stati per le attività? | `todo`, `development`, `test`, `done`. | GNT-08 pronto |
| D4 | Giorni lavorativi? | Sì, italiani, lun-ven. Le festività non sono richieste. | GNT-11 pronto |
| D5 | Chi deve poter modificare? | Solo il proprietario: il tool nasce per uso personale. | GNT-12 scartato |
| D6 | Esiste un connettore Jira utilizzabile? | No, il Jira è protetto. Jira resta solo testo incollato. | GNT-14 scartato |

**D2** in breve: "annulla" è il Ctrl+Z dentro l'app (si sposta una barra per
errore e si torna indietro). L'alternativa è non averlo e fare un backup con
l'export JSON di GNT-05, a cui si torna se qualcosa va storto. Va scelta una
delle due strade, o tutte e due.
