# Caizi Jiedi (猜字解底) Solver

A self-contained word-game solver for **猜字解底** (guess the hidden character, then the central answer). No install, no network, no account — open the page and type.

**Live demo:** [GitHub Pages](https://c0sin3.github.io/caizi-jiedi/)

[简体中文 README](README.zh-CN.md)

## What it does

| Scenario | Input | Output |
| --- | --- | --- |
| ① Guess | the two hint characters someone gave you | possible hidden characters, ranked by confidence, with word-formation evidence |
| ② Give hints | your own hidden character | a set of "unique-solution" hint-character pairs, with evidence words and competing candidates |
| ③ Solve the answer | the shared character + everyone's hidden characters | candidates for the central answer |

① accepts several groups at once, handy for computing while you watch a multi-player game at the table.

## How the game works

Each player has a hidden character and must write two hint characters that each form a two-character word with it (e.g. hidden 「节」, hints 「奏」「环」 → 节奏, 环节). Guess someone's character and both the guesser and the guessed player score +1; so the more "unique" your hints are, the easier others can guess you, and both sides benefit. Each round also has a shared character and a central answer: the central answer must form words with everyone's hidden characters and with the shared character, and guessing it is worth +3.

## Ranking rules

- A **candidate** must form a two-character word with every hint character; comparison goes by the "weakest word frequency" (min) first, then by the total word frequency.
- Candidates with a word frequency below 30 are collapsed by default and marked "rare combination" — most are obscure dictionary pairings.
- ②'s recommendations first exclude combinations that have real competitors, then rank by how common the evidence words are; you can switch to "more unique first", which pushes combinations with no competitors at all to the top.
- Hint characters are drawn only from common characters by default (top 2500 by character frequency), so it never suggests obscure characters nobody recognizes.

## Data

The dictionary is the two-character word list from [jieba](https://github.com/fxsjy/jieba) (MIT License), 114,134 entries with word frequencies. The whole list is embedded in `index.html`, so the page works fully offline and can also be opened directly as a local file.

## Notes

- Single file, no dependencies, no tracking, no requests of any kind.
- Candidates are merely characters that "make sense in the dictionary"; they are not guaranteed to be the one the other player had in mind — keep judging with the context.
