# Caizi Jiedi (猜字解底) Solver

A self-contained word-game solver for **猜字解底** (guess the hidden character, then the central answer). No install, no network, no account — open the page and type.

**Live demo:** [Qoder Sites](https://caizi-jiedi-f9d6h843g0z.qoder.zone/) · [GitHub Pages](https://c0sin3.github.io/caizi-jiedi/)

[简体中文 README](README.zh-CN.md)

## What it does

| Scenario | Input | Output |
| --- | --- | --- |
| ① Give hints | your own hidden character | a set of "unique-solution" hint-character pairs, with evidence words and competing candidates |
| ② Guess + solve | the shared character, your hidden character, and up to five opponents' two-character hints (leave unused rows blank) | hidden characters that can share the same central answer; plus a suggested answer, the answer candidates, and each opponent's candidates |

② gives you five opponent rows by default, and each row takes both hint characters in a single box; spaces are ignored automatically, and extra characters are trimmed to the first two with a note. It treats the central answer as a table-wide constraint: the answer must form a word with the shared character, your hidden character, and every opponent's hidden character. For each hint pair it first computes the usual candidates, then tries each one against the answer; **candidates that cannot solve an answer are hidden**. In the sample round, 141 raw candidates shrink to 19 that can solve, and the answer candidates shrink from 3 to 1. If no common-word answer can satisfy every hint group, it falls back to a few **suspected answers**, allowing up to two groups to miss and marking which ones.

## Practice mode

When nobody is around, switch to **Practice**: the tool deals a round with the same rules — shared character, your hidden character, and each opponent's two hint characters — and you fill the answer cards for the opponents' hidden characters and the central answer. A hidden character is worth +1 and the central answer +3, over five rounds; 3–6 players.

Every generated round is validated with the same solver logic: each hint pair must point to its true hidden character in the dictionary, and that answer must rank first; otherwise the round is regenerated, so every deal is solvable.

## How the game works

Each player has a hidden character and must write two hint characters that each form a two-character word with it (e.g. hidden 「节」, hints 「奏」「环」 → 节奏, 环节). Guess someone's character and both the guesser and the guessed player score +1; so the more "unique" your hints are, the easier others can guess you, and both sides benefit. Each round also has a shared character and a central answer: the central answer must form words with the shared character and with everyone's hidden characters; the shared character itself only needs to form a word with the central answer.

## Ranking rules

- **Guess + solve** candidates must form a two-character word with both hints and with one common answer; ranking compares the weakest link in the whole chain, then total word frequency.
- Answer candidates must form words with both the shared character and your hidden character, ranked by the weakest link.
- By default only words with frequency ≥30 are used. If strict mode finds no combination that can solve an answer, it relaxes to ≥5. When strict mode does have results, alternative answers that need rare pairings are folded below the results; open them to inspect. The "show rare candidates / rare answers" checkbox expands the full candidate lists and marks rare pairings.
- If no answer can satisfy every group even then, it ranks a few suspected answers by how many groups they match with common words, allows up to two groups to miss, and marks the misses; answers that only work through very low-frequency pairings rank lower.
- ①'s recommendations first exclude combinations that have real competitors, then rank by how common the evidence words are; you can switch to "more unique first", which pushes combinations with no competitors at all to the top.
- Hint characters are drawn only from common characters by default (top 2500 by character frequency), so it never suggests obscure characters nobody recognizes.

## Data

The dictionary holds **133,343** two-character words with frequencies: primarily the two-character list from [jieba](https://github.com/fxsjy/jieba) (MIT License), supplemented by [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict) (CC BY-SA 4.0), SUBTLEX-CH subtitle frequencies, and [THUOCL](https://github.com/thunlp/THUOCL) domain lists (aggregated via the rime-cloverpinyin dictionaries); new words have their frequencies calibrated to the jieba scale from SUBTLEX-CH. The whole list is embedded in `index.html`, so the page works fully offline and can also be opened directly as a local file.

## Notes

- The page follows the order of a round: give your own hints first, then use the shared character, your hidden character, and the opponents' hints to guess and solve; leave extra opponent rows blank.
- The interface follows the physical game: the central answer sits in a gold "?" tile that fills in when a base is found, and every opponent keeps one player color (blue, green, red, yellow, purple).
- Practice mode shares the same dictionary and decision logic as the solver, so every deal can be reasoned out with the solver's approach.
- Single file, no dependencies, no tracking, no requests of any kind.
- Candidates are merely characters that "make sense in the dictionary"; they are not guaranteed to be the one the other player had in mind — keep judging with the context.
