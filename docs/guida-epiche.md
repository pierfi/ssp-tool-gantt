# Guida: importare e modificare le epiche

Questa guida descrive **esattamente** come il Team Planner interpreta il testo
che incolli, sia nella finestra **Incolla epica** sia nel modal **edit** di una
card epica.

---

## Indice

1. [I tre modi per inserire lavoro](#1-i-tre-modi-per-inserire-lavoro)
2. [Il formato testo](#2-il-formato-testo)
3. [Incolla epica — import in blocco](#3-incolla-epica--import-in-blocco)
4. [edit — modificare un'epica esistente](#4-edit--modificare-unepica-esistente)
5. [Date](#5-date)
6. [Dipendenze](#6-dipendenze)
7. [Riferimento rapido della sintassi](#7-riferimento-rapido-della-sintassi)
8. [Esempi pronti](#8-esempi-pronti)

---

## 1. I tre modi per inserire lavoro

| Azione | Dove | Effetto |
| --- | --- | --- |
| **Incolla epica** | pulsante nero in alto a destra | Analizza un blocco di testo e **aggiunge** epiche e attività a quelle esistenti |
| **edit** | pulsante su ogni card epica (colonna sinistra) | Riapre **quella** epica come testo; salvando, sincronizza le attività (crea / aggiorna / elimina) |
| **+ task** / **+ Attività senza epica** | card epica / fondo colonna | Crea una riga vuota (`Nuova attività`, 7 o 3 giorni) e apre il pannello di dettaglio per compilarla a mano |

> `Incolla epica` **non sostituisce** nulla: se premi *Importa* due volte con lo
> stesso testo ottieni attività doppie. Per correggere un'epica già presente usa
> **edit**.

---

## 2. Il formato testo

Il testo è una sequenza di righe. Le righe vuote sono ignorate. L'ordine conta:
ogni riga attività appartiene all'ultima riga `epic:` incontrata sopra di essa.

### 2.1 Riga epica

```
epic: SSP-1234 titolo dell'epica
```

- La parola chiave è `epic` seguita da `:` **oppure** `-`.
- Subito dopo, una **key** opzionale in stile Jira (`LETTERE-numero`, es.
  `SSP-1234`); il resto è il **titolo**.
- Senza key va bene comunque: `epic: python end of life` → titolo, key vuota.

Metadati dell'epica (in righe separate, **dopo** la riga `epic:`, in qualsiasi
punto del blocco di quell'epica):

```
due date: 2026-10-16
start: 2026-09-07
```

- `due date:` → data di scadenza mostrata nella card e nella riga epica.
- `start:` → data da cui far partire le attività dell'epica che **non** hanno una
  data propria (vedi §3).

### 2.2 Riga attività

Una riga è un'attività se comincia con:

- un trattino / asterisco / bullet: `- ...`, `* ...`, `• ...`
- un prefisso di tipo: `task: ...`, `bug: ...`, `story: ...`, `sub-task: ...`
- direttamente una key Jira: `SSP-1235 ...`

Struttura tipica:

```
- task: SSP-1235 lambda 001 @piero 5d >2026-09-14
```

Ordine dei pezzi libero; il parser estrae e rimuove i metadati, il resto diventa
`key` + `titolo`.

| Pezzo | Sintassi | Default | Note |
| --- | --- | --- | --- |
| **key** | `SSP-1235` a inizio testo (dopo il prefisso) | vuota | serve al match in *edit* (§4). **Dagliela sempre.** |
| **titolo** | testo libero rimanente | la key, o l'intera riga | i separatori iniziali `· | -` vengono ripuliti |
| **assegnatario** | `@nome` | nessuno | match sul nome membro (case-insensitive); se non esiste **viene creato** — dettagli in §3 (import) e §4 (edit) |
| **durata** | `5d` oppure `5g` (anche `5 d`) | `7` giorni | 1–2 cifre; minimo 1 |
| **data inizio** | `>2026-09-14` oppure `start:2026-09-14` / `start=...` **sulla stessa riga** | vedi §3 | **solo formato ISO `AAAA-MM-GG`** qui; ha priorità sul posizionamento automatico |

### 2.3 Tipo: task o bug

- `bug: ...` come prefisso → **bug**.
- La parola `bug` presente nel testo della riga → **bug**.
- Export Jira: una colonna finale `Task` / `Bug` / `Story` (preceduta da 2+ spazi
  o da un tab) viene letta per il tipo e poi **scartata** dal titolo.
- Tutto il resto → **task**.

I bug si distinguono a colpo d'occhio: pallino rosso sulla barra e colore caldo.

### 2.4 Righe prima della prima `epic:`

Le attività scritte **prima** di qualunque riga `epic:` diventano **attività
standalone** (senza epica) — comode per bug, supporto, piccoli sviluppi.

---

## 3. Incolla epica — import in blocco

Esempio completo:

```
epic: SSP-1234 python end of life eol
- task: SSP-1235 lambda 001 @piero 5d
- task: SSP-1236 lambda 006 @giorgia 5d
- task: SSP-1237 lambda 012 @ilaria 10d >2026-10-05
start: 2026-09-07
due date: 2026-10-16
```

**Come vengono posizionate le attività:**

1. Ogni epica nuova riceve una **tinta** libera dalla palette.
2. Punto di partenza (`cursor`) = **lunedì della settimana prossima**.
3. Per un'epica con `start:` → le sue attività partono da lì; altrimenti dal
   `cursor`.
4. Le attività **senza** `>data` di una stessa epica vengono **concatenate**:
   ognuna inizia dove finisce la precedente.
5. Un'attività **con** `>data` inizia esattamente in quella data (e da lì riparte
   la concatenazione delle successive).
6. Le attività standalone partono anch'esse dal lunedì prossimo, concatenate tra
   loro.

**Assegnatari:** `@nome` viene confrontato con i membri esistenti (senza
distinzione maiuscole/minuscole). Se il nome non c'è, **viene creato un nuovo
membro** con l'iniziale maiuscola e una tinta assegnata d'ufficio.

**Dipendenze:** l'import **non** crea vincoli "deve iniziare dopo". Il
posizionamento è solo sequenziale nel tempo. I vincoli si creano dopo, con la
maniglia ⇢ (§6).

**Export Jira:** puoi incollare direttamente un elenco esportato. Ogni riga che
inizia con `-` o con una key (`SSP-123 …`) diventa un'attività. La **colonna
finale** `Task` / `Bug` / `Story` viene rimossa (il tipo `Bug` è comunque
onorato). Le **altre colonne** separate da 2+ spazi o tab (stato, ecc.) **non**
vengono scartate: finiscono nel titolo unite da ` · `.

```
SSP-9001   Refactor modulo auth      In Progress   Story
SSP-9002   NPE durante il login      To Do         Bug
```

diventa `SSP-9001 — Refactor modulo auth · In Progress` (task) e
`SSP-9002 — NPE durante il login · To Do` (bug). Per un titolo pulito incolla
solo `key + titolo`, o riscrivi le righe come `- SSP-9001 titolo @nome 5d`.

---

## 4. edit — modificare un'epica esistente

Il pulsante **edit** su una card epica apre un modal con l'epica **già
serializzata** in questo formato:

```
epic: SSP-1234 python end of life eol
due date: 2026-10-16

- task: SSP-1235 lambda 001 @piero 7d >2026-09-07
- task: SSP-1236 lambda 006 @giorgia 7d >2026-09-14
```

Modifichi il testo e premi **Applica**. La sincronizzazione funziona così:

| Nel testo | Risultato |
| --- | --- |
| Riga con una **key già presente** nell'epica | L'attività esistente viene **aggiornata**; `id` e **dipendenze si conservano** |
| Riga **nuova** (key non presente, o senza key) | Viene **creata** una nuova attività |
| Attività dell'epica la cui key **non compare più** nel testo | Viene **eliminata**; la sua key viene anche rimossa dalle dipendenze delle altre attività |
| Riga `epic:` (la prima nel testo) | Aggiorna key / titolo / `due date` dell'epica (solo i campi non vuoti) |

**Campi delle righe attività in edit:**

- **`@nome` omesso** → l'assegnatario attuale resta invariato. Se lo metti, vale
  la stessa risoluzione dell'import (match per nome, `-` interpretato come
  spazio, altrimenti creazione del membro).
- **durata** (`5d`) → aggiornata; default 1 se assente e attività nuova.
- **`>data` omessa** → per un'attività esistente si mantiene la sua data; per una
  nuova si usa il `cursor` concatenato (parte da `start:` dell'epica, o dalla
  prima data esistente, e avanza attività dopo attività).
- **`>data` presente** → forza quella data di inizio.
- Impostare il tipo qui lo "blocca": non verrà più cambiato in automatico dalla
  parola `bug`.

> **Dai sempre una key alle attività.** Una riga senza key non può essere
> ri-agganciata: a ogni *Applica* viene trattata come nuova, quindi ricreata con
> un nuovo `id` e **perde le dipendenze**.

Se l'attività attualmente selezionata nel pannello di dettaglio viene eliminata
da un *Applica*, la selezione si chiude.

---

## 5. Date

Ci sono due contesti diversi:

**Righe a sé** `start:` e `due date:` — accettano più formati:

| Scrivi | Interpretazione |
| --- | --- |
| `2026-09-07` | ISO, anno-mese-giorno (anche `2026-9-7`) |
| `07/09/2026` | **giorno prima**: 7 settembre 2026 |
| `7.9.26` | giorno-mese-anno a 2 cifre → `2026-09-07` |
| `7-9-2026` | idem, con trattini |
| qualsiasi altra cosa | data ignorata (stringa vuota) |

La notazione con `/` `.` `-` è **europea (giorno/mese)**, non americana.

**Inline su una riga attività** (`>DATA`, `start:DATA`) — **solo ISO
`AAAA-MM-GG`**. `>07/09/2026` non viene riconosciuto e la data resta vuota; usa
`>2026-09-07`.

---

## 6. Dipendenze ("deve iniziare dopo")

Non si esprimono nel testo. Si gestiscono sulla timeline e nel pannello:

- **Creare:** clicca la maniglia **⇢** sulla barra "predecessore" (entra in
  modalità collegamento, la barra si evidenzia), poi clicca la barra
  "successore". Ri-clic sulla stessa ⇢ annulla la modalità.
- **Rimuovere:** seleziona il successore → pannello di dettaglio → sezione
  **Deve iniziare dopo** → `×` sulla voce.
- **Effetto:** lo scheduler ripassa i vincoli (fino a 6 iterazioni) e sposta in
  avanti l'inizio di un'attività finché non parte al più presto alla fine di
  tutti i suoi predecessori. Trascinare o accorciare un predecessore ricalcola le
  successive.
- Le frecce a gomito si nascondono con il toggle **dipendenze** nell'header.

Le dipendenze sopravvivono alle modifiche via **edit** finché l'attività
mantiene la sua **key**.

---

## 7. Riferimento rapido della sintassi

```
epic: KEY titolo                     riga epica (KEY opzionale)
due date: 2026-10-16                 scadenza dell'epica corrente
start: 2026-09-07                    inizio di default per le attività dell'epica

- task: KEY titolo @nome 5d >DATA    attività (task)
- bug:  KEY titolo @nome 3d          attività (bug)
- KEY titolo …                       attività, tipo dedotto
KEY titolo …                         attività (riga che inizia con una key)

@nome      assegnatario  (creato se non esiste)
5d / 5g    durata in giorni (default 7)
>DATA      / start:DATA  inizio esplicito sulla riga dell'attività — solo ISO AAAA-MM-GG
```

---

## 8. Esempi pronti

### Nuova epica, tre attività a catena

```
epic: SSP-1400 osservabilità
- task: SSP-1401 metriche base @piero 5d
- task: SSP-1402 dashboard @giorgia 4d
- task: SSP-1403 alerting @piero 3d
start: 2026-09-21
```

`SSP-1401` parte il 21/09, `SSP-1402` alla sua fine, `SSP-1403` a seguire.

### Attività con inizio fissato in mezzo

```
epic: SSP-1500 migrazione db
- task: SSP-1501 export dati @ilaria 6d
- task: SSP-1502 finestra di switch @ilaria 1d >2026-10-12
- task: SSP-1503 verifica @giorgia 3d
```

`SSP-1502` è ancorata al 12/10; `SSP-1503` riparte dal 13/10.

### Bug standalone (prima di qualsiasi epica)

```
- bug: SSP-2001 crash all'avvio @piero 2d
- SSP-2002 timeout upload @giorgia 1d
epic: SSP-1600 …
```

### Rinominare un'attività e riassegnarla (in *edit*)

Da:

```
- task: SSP-1401 metriche base @piero 5d >2026-09-21
```

a:

```
- task: SSP-1401 metriche RED @giorgia 5d >2026-09-21
```

Stessa key → stessa attività, stesse dipendenze; cambiano solo titolo e
assegnatario.
