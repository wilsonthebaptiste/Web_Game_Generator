# Manual test checklist

Step-by-step checks for everything in `spec.md` §13 that automated tests can't prove: real
browsers, real devices, and realtime between players. Run it:

- on `dev` for the **Phase 4 exit gate**, and
- on the production site in **Phase 5**, with A and B, before tagging `v1.0.0`.

The full run takes about 45 minutes with three people (or one person with three browsers).
Sections are independent, so you can split them up. Each step says what to **do** and what you
should **see**. If what you see differs, it's a failure: note the step ID, take a screenshot, and
carry on.

Automated tests already cover scoring rules, payload validation, security rules, and expiry
(`npm test`, `npm run test:db`). Where a manual step repeats one, it's because the spec asks for
it in real browsers.

---

## Setup

- [ ] **App:** for `dev`, pull `main`, then `npm install` and `npm run dev`, and open
      http://localhost:5173. For a phone on the same Wi-Fi, run `npm run dev -- --host` and open
      the "Network" address it prints. For production, use the deployed URL.
- [ ] **Three separate identities.** Each browser profile is one player, so use:
  - **Ava** (host): Chrome, normal window
  - **Ben**: Chrome incognito window
  - **Cleo**: a different browser (Edge, Firefox, Safari) or a phone

  Two incognito tabs in the same browser share one identity, so don't use them for two players.

- [ ] **A fourth identity for late-join checks** (step E5): another browser profile or device.
- [ ] Keep DevTools (F12) handy in Ava's and Ben's windows. Steps marked 🔧 use it.

Names in this checklist are examples; use any names you like. Each browser can create at most
5 rooms an hour, which this run stays under; if you hit "Too many attempts", switch browser
profile.

---

## R. Room and lobby

| ID  | Do                                                                                                              | See                                                                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Ava: open the home page.                                                                                        | Product name, a short explanation, **Create a room** and **Join a room** forms, each with a labelled name field.                                                  |
| R2  | Ava: **Create a room** with the name `Ava`.                                                                     | "Creating room…" briefly, then the lobby with a 5-character room code, a join link with **Copy link**, and Ava in the player list with "★ Host" and "You" badges. |
| R3  | Ava: in a second tab, create another room and note its code, then close that tab.                               | The two codes are different. (Use the first room for the rest of the run.)                                                                                        |
| R4  | Ava: **Copy link**.                                                                                             | "Link copied. Send it to the other players." (or, if the browser blocks it, a message to copy it by hand).                                                        |
| R5  | Ben: open the link.                                                                                             | The join form with the code already filled in.                                                                                                                    |
| R6  | Ben: join as `Ben`.                                                                                             | Ben's lobby lists Ava ("★ Host") and Ben ("You"). **Ava's lobby shows Ben without a refresh.**                                                                    |
| R7  | Cleo: open the home page, type the code by hand in lower case with a space before and after it, join as `Cleo`. | Cleo joins the same room. All three lobbies show three players without a refresh.                                                                                 |
| R8  | Ben and Cleo: look at the lobby.                                                                                | No mode picker or **Start game** button; a "Waiting for host to start…" message instead.                                                                          |
| R9  | Ava: look at the lobby.                                                                                         | A mode picker and **Start game**.                                                                                                                                 |

### R-errors. Friendly errors (use the fourth identity or a new incognito window)

| ID  | Do                                                           | See                                                                              |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| RX1 | Create a room with an empty name.                            | An error under the name field; no room is created.                               |
| RX2 | Create a room with a 21-character name.                      | "Names must be 1–20 characters, without line breaks or tabs."                    |
| RX3 | Join with the code `AB`.                                     | "That doesn't look like a room code. Check it and try again."                    |
| RX4 | Join with a 5-character code nobody uses (e.g. `ZZZZZ`).     | "We couldn't find a room with that code."                                        |
| RX5 | Join Ava's room as `ava` (different case).                   | "Someone in this room already has that name. Try another one."                   |
| RX6 | Open `/room/ZZZZZ` directly.                                 | "Can't open this room", the reason, and a link to the home page. No "Try again". |
| RX7 | Open `/room/<Ava's code>` from a browser that hasn't joined. | Sent to the join form with the code filled in.                                   |
| RX8 | Open `/nothing-here`.                                        | "Page not found" and a link home.                                                |

### R-host. Host-only actions are blocked on the server too 🔧

| ID  | Do                                                                                                                                                                                                                                                                                                                                                                       | See                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| RH1 | Ava: start a 1-player room (a new room nobody joins).                                                                                                                                                                                                                                                                                                                    | **Start game** is disabled with "You need at least 2 players to start." |
| RH2 | Ben: DevTools → **Network**, refresh, find the `get_room_snapshot` request, right-click → **Copy** → **Copy as fetch**. Paste it into the **Console**, but before pressing Enter change `get_room_snapshot` to `end_game` and the body to `{"room_id":"<id>"}` (the room's `id` is in the snapshot response under `room`). Add `.then(r => r.json()).then(console.log)`. | The response says `NOT_HOST`. The game carries on for everyone.         |

---

## G. Gameplay (one round per mode)

Cleo plays the player who **doesn't answer** in every round, to check "No answer". Keep a note of
expected scores as you go.

### G1. Trivia

| ID    | Do                                                                                  | See                                                                                                                                                                                          |
| ----- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1.1  | Ava: choose **Trivia**, then **Start game**.                                        | All three browsers switch to the round without a refresh: "Round 1 of 10 · Trivia", the same question, and the same choices in the same order.                                               |
| G1.2  | 🔧 Ben: Network → the latest `get_room_snapshot` response. Search it for `correct`. | No correct answer anywhere in the response, and nobody else's answer.                                                                                                                        |
| G1.3  | Ben: pick a choice and **Submit answer**.                                           | "Answer submitted ✓ (you can change it until the host reveals)". The button now says **Update answer**.                                                                                      |
| G1.4  | Ben: double-click **Update answer** quickly.                                        | Saves once; no error.                                                                                                                                                                        |
| G1.5  | Ben: pick a different choice and **Update answer**.                                 | The confirmation stays; the new choice is selected.                                                                                                                                          |
| G1.6  | Ben: refresh the page.                                                              | Ben's latest choice is still selected and marked submitted.                                                                                                                                  |
| G1.7  | Ava: answer correctly. Cleo: don't answer.                                          | —                                                                                                                                                                                            |
| G1.8  | Ava: **Lock & reveal**.                                                             | All three browsers show Results without a refresh: the correct answer, Ben's **updated** choice, Cleo "No answer", each with ✓/✗ **and** the words Correct/Incorrect, and points this round. |
| G1.9  | Everyone: check the leaderboard.                                                    | Ava 1; Ben 1 or 0; Cleo 0. Each viewer's own row says "(you)". A "This round" column matches the points.                                                                                     |
| G1.10 | Ben: try to change his answer.                                                      | No answer form; the round is locked.                                                                                                                                                         |

**Double reveal** 🔧 (once, here):

| ID    | Do                                                                                                                                           | See                                         |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| G1.11 | Ava: Network → the `reveal_round` request → **Copy as fetch**, paste into the Console, add `.then(r => r.json()).then(console.log)`, run it. | The response says `ROUND_ALREADY_REVEALED`. |
| G1.12 | Ava: refresh.                                                                                                                                | Scores are unchanged.                       |

### G2. Word guessing

| ID   | Do                                                                                                                | See                                                                                                                               |
| ---- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| G2.1 | Ava: under "Mode for the next round" pick **Word guessing**, then **Next round**.                                 | All three browsers show "Round 2 of 10 · Word guessing" and the same clue.                                                        |
| G2.2 | Ava: type the right answer in mixed case with spaces before and after it (e.g. `PeNGuin` plus spaces) and submit. | Accepted with the submitted confirmation.                                                                                         |
| G2.3 | Ben: submit a blank guess (only spaces).                                                                          | A validation message; nothing is sent.                                                                                            |
| G2.4 | Ben: submit a wrong guess. Cleo: don't answer.                                                                    | —                                                                                                                                 |
| G2.5 | Ava: **Lock & reveal**.                                                                                           | The correct answer (and any accepted variants), Ava ✓ Correct +1 (case and spaces ignored), Ben ✗ Incorrect +0, Cleo "No answer". |
| G2.6 | Everyone: check the leaderboard.                                                                                  | Totals are round 1 + round 2 and match in all three browsers.                                                                     |

### G3. Social

| ID   | Do                                                                                                  | See                                                                                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G3.1 | Ava: pick **Social**, then **Next round**.                                                          | Everyone sees the same prompt and a list of players to vote for.                                                                                                |
| G3.2 | Ben: look for his own name in the list.                                                             | Not offered, unless the prompt allows self-votes.                                                                                                               |
| G3.3 | Ava and Ben: vote for the same person (Ben, or Ava if self-votes aren't allowed). Cleo: don't vote. | —                                                                                                                                                               |
| G3.4 | Ava: **Lock & reveal**.                                                                             | "Most votes: …", who each player voted for, Cleo "No answer". The player voted for gets +1 per vote; voters get nothing for voting. No Correct/Incorrect marks. |
| G3.5 | Everyone: check the leaderboard.                                                                    | Totals add up across all three rounds, in all three browsers.                                                                                                   |

### G4. Host controls

| ID   | Do                                                           | See                                                    |
| ---- | ------------------------------------------------------------ | ------------------------------------------------------ |
| G4.1 | Ava: double-click **Next round**.                            | Only one new round starts (Round 4, not 5).            |
| G4.2 | Ben and Cleo, on the results screen: look for host controls. | None; "Waiting for the host to start the next round…". |

---

## C. Refresh and reconnect

Do these during G2 or G3, or start another round for them.

| ID  | Do                                                                                      | See                                                                                                                       |
| --- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| C1  | Ben, mid-round after submitting: refresh.                                               | Same round, his answer still marked submitted, scores unchanged.                                                          |
| C2  | Cleo, on the results screen: refresh.                                                   | Same results and scores.                                                                                                  |
| C3  | Ben: turn Wi-Fi off (or DevTools → Network → **Offline**).                              | Within a few seconds a banner: "You're offline. The game will catch up when you reconnect."                               |
| C4  | Ava, while Ben is offline: reveal the round (or start the next one).                    | —                                                                                                                         |
| C5  | Ben: turn Wi-Fi back on.                                                                | The banner goes (it may say "Reconnecting…" for a moment), and Ben's screen catches up to what Ava did without a refresh. |
| C6  | Cleo on a phone: lock the screen, have Ava reveal or start a round, unlock after ~30 s. | Cleo's screen catches up within a couple of seconds.                                                                      |
| C7  | Ben: switch to another tab for a minute while Ava starts a round, then switch back.     | Ben sees the new round.                                                                                                   |
| C8  | Ben: close the tab, then reopen the room link.                                          | Back in the room as Ben (no join form), at the current state.                                                             |

---

## E. End game

| ID  | Do                                                                                                        | See                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| E1  | Ava: **End game**.                                                                                        | All three browsers show the final screen without a refresh: "Game over", the winner, and "Final scores" with "(you)" on each viewer's row. |
| E2  | Check the headline.                                                                                       | One top score: "🏆 Ava wins!" and "With N points." Tied top scores: "🏆 It's a tie!" naming **every** tied player.                         |
| E3  | Ben: refresh.                                                                                             | Still the final screen with the same scores.                                                                                               |
| E4  | Ben: **Create a new room**.                                                                               | The home page.                                                                                                                             |
| E5  | Fourth identity: open the finished room's link and try to join.                                           | "This game has ended."                                                                                                                     |
| E6  | **Tie:** in a new room, play one trivia round where Ava and Ben both answer correctly, then **End game**. | "🏆 It's a tie!" with "Ava and Ben share the top score with 1 point."                                                                      |
| E7  | **Joining mid-game:** in a room that has started, try to join from a new identity.                        | "This game has already started, so new players can't join."                                                                                |

---

## M. Mobile and accessibility

| ID  | Do                                                                                                                      | See                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| M1  | On a phone (or DevTools device toolbar at 375 px wide): go through home, lobby, a round, results, and the final screen. | Everything fits; no sideways scrolling; text is readable without zooming.                                |
| M2  | On the phone: tap every button, choice, and player option.                                                              | Easy to hit (no tiny targets); nothing hides under the keyboard when typing a name or guess.             |
| M3  | On desktop, keyboard only (Tab, Shift+Tab, arrows, Space, Enter): create a room, start a game, answer, reveal.          | Every control is reachable, a visible focus outline shows where you are, and Enter submits forms.        |
| M4  | Check the forms.                                                                                                        | Every input has a visible label (not only placeholder text).                                             |
| M5  | Look at results and the leaderboard in greyscale (or ignore colour).                                                    | Correctness is still clear (✓/✗ and words), "(you)" and "You" are text, and the host is marked in words. |
| M6  | Try one current browser of each kind you have: Chrome, Edge or Firefox, and Safari (desktop or iPhone).                 | The game works in each.                                                                                  |

---

## D. Delivery (Phase 5, production only)

| ID  | Do                                                         | See                                                                  |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| D1  | A teammate follows the README on a clean clone.            | The app runs without asking anyone for help, or the README is fixed. |
| D2  | `git grep -nE "sb_secret_                                  | service_role                                                         | SUPABASE_DB_PASSWORD"`on`main`. | No real keys or passwords (docs that only name the variables are fine). |
| D3  | Check the dashboards (Supabase, Cloudflare Pages, GitHub). | Only free plans in use.                                              |
| D4  | Run sections R, G, C, E, and M on the production URL.      | Same results as on `dev`.                                            |

---

## Spec §13 coverage

| Spec §13 item                                     | Checked by                                      |
| ------------------------------------------------- | ----------------------------------------------- |
| Create a room with a unique code                  | R2, R3                                          |
| Another browser or device can join                | R5–R7                                           |
| Invalid code gives a friendly error               | RX3, RX4, RX6                                   |
| Lobby lists update for everyone                   | R6, R7                                          |
| Host-only controls hidden, backend rejects others | R8, G4.2, RH2 (and `security.test.ts`)          |
| Host can choose each of the three modes           | G1.1, G2.1, G3.1                                |
| Everyone sees the same prompt                     | G1.1, G2.1, G3.1                                |
| Submit one answer and see confirmation            | G1.3, G1.4                                      |
| Edit before reveal, not after                     | G1.5, G1.10                                     |
| Others can't read unrevealed answers              | G1.2 (and `security.test.ts`)                   |
| Reveal applies the scoring rule                   | G1.8, G2.5, G3.4 (and `scoring.parity.test.ts`) |
| Refresh keeps room state and scores               | G1.6, C1, C2, E3                                |
| A round can't award points twice                  | G1.11, G1.12                                    |
| Scores carry across rounds                        | G2.6, G3.5                                      |
| Host can end the game                             | E1                                              |
| Final screen shows leaderboard and winner         | E1, E2                                          |
| Tied top scores show every winner                 | E6                                              |
| Works on desktop and mobile browsers              | M1, M6                                          |
| README works for a new developer                  | D1                                              |
| No secrets committed                              | D2                                              |
| Free tiers only                                   | D3                                              |
| Automated tests cover scoring and state rules     | `npm test`, `npm run test:db`                   |

Also from the spec (§4 Journey C, §5): reconnect (C3–C8), keyboard access and labels (M3, M4),
and not relying on colour (M5).

---

## Known limitations (not failures)

- **Identity lives in the browser.** Clearing site data or switching device makes you a new
  player, so you can't get back into a room you'd joined.
- **The host isn't replaced.** If the host leaves for good, the game can't continue.
- **No room size limit** (the spec makes capacity optional).
- **Expiry takes 12 hours,** so it isn't tested by hand; `security.test.ts` covers every action
  on an expired room. Rooms are deleted 24 hours after creation.
- **Ending the game during a round** leaves that round unscored.
- **Free plan pausing:** Supabase pauses a project after a week without use. If the site suddenly
  can't connect, check the dashboard before reporting a bug.

---

## Recording results

Copy this into the PR, issue, or chat where you report the run:

```text
Manual checklist run — <date>, <dev or production URL>, <who>
Browsers/devices: <e.g. Chrome 1xx, Firefox 1xx, iPhone Safari>
R  pass / fail: <IDs>
G  pass / fail: <IDs>
C  pass / fail: <IDs>
E  pass / fail: <IDs>
M  pass / fail: <IDs>
D  pass / fail: <IDs>   (production only)
Notes and screenshots: <...>
```
