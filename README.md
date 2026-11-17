# Ad Library Saver

A Chrome extension (Manifest V3) for the Meta Ad Library. As you scroll a competitor's ads, it saves each one into a database inside the extension. Jev ([TypeSafe](https://typesafe.ai) System One) then tags the format, the call to action and the funnel stage, and one button exports everything as a CSV.

This is not a Chrome Web Store extension. You load it unpacked, and tagging needs your own TypeSafe API key. Saving and CSV export work without one.

## Install (once per Chrome profile)

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and pick this folder (the one holding `manifest.json`).
3. Pin it from the puzzle-piece menu so the popup is one click away.
4. Open the extension's **options** ("Jev key and settings" in the popup) and paste your TypeSafe key.
5. Click **Test with an invented ad**. It should come back as `single_image / buy / conversion`.

Chrome extensions and their storage are per profile, so each Chrome profile needs its own Load unpacked and its own key.

After editing any file, click the reload arrow on the extension's card in `chrome://extensions`, then reload the Ad Library tab.

## Use

Browse the Ad Library as usual: a search, or an advertiser's page (`view_all_page_id=…`). Every card that comes at least halfway into view is saved, and a small badge on the card shows the result:

- **Saved**: stored, Jev queued
- **Saved · video · buy · conversion**: tagged
- **Already saved**: seen before (the record keeps its tags and gets a fresh `last_seen` date)
- **Saved · tag failed**: stored, but Jev errored. Use **Tag untagged and failed** in the popup.

The popup shows the totals, has two switches (save while scrolling, tag new ads with Jev) and has these buttons:

- **Export CSV**
- **Tag untagged and failed**
- **Retag all**, for after you change a question
- **Clear database**, which needs two clicks

## What Jev answers

The questions live in `questions.js`:

| Column | Shape | Values |
|---|---|---|
| `format` | choice | single_image, video, carousel, text_only, other |
| `cta` | choice | buy, learn, sign_up, contact_or_book, install, follow, none |
| `funnel_stage` | score 0 to 2 | awareness, consideration, conversion (`funnel_score` keeps the decimal for ranking) |

Each tag carries a confidence. Anything below 0.60 is named in `needs_check`. The confidence says how decisively Jev picked, not whether the pick is right.

Format is judged mainly from a media count the extension takes from the page ("1 video", "carousel of 9 cards", "opens an instant experience"). The copy is only used to break ties. CTA reads the button text first, then the end of the copy.

The questions were tested on three invented ads (3/3 on every question) and through the extension's own test button. Check a sample of real tags before relying on them.

Changing the wording of a question changes the answers. Never compare tags made with two different versions of `questions.js`: use **Retag all** after an edit.

## What leaves the computer

Jev receives five fields per ad:

- advertiser name
- ad copy
- headline
- CTA button text
- media count

It receives no images, URLs, cookies or history. Ad Library content is public. Turning off "Tag new ads with Jev" stops all sending, and saving carries on.

The key is held in `chrome.storage.local` in that Chrome profile, which is not synced. It is sent only to `api.typesafe.ai`. Cost is about $0.00003 per ad.

## CSV columns

| Group | Columns |
|---|---|
| Identifiers | `library_id`, `advertiser` |
| Jev tags | `format`, `cta`, `funnel_stage`, `funnel_score` |
| Tag confidence and status | the three `*_confidence` columns, `needs_check`, `tag_status`, `tag_error` |
| The ad | `copy`, `headline`, `cta_button`, `landing_url` (tracking parameters stripped) |
| Media | `videos`, `images`, `carousel`, `cards` |
| Running | `versions` ("N ads use this creative"), `status`, `started_running`, `stopped_running` |
| Links | `ad_url`, `page_url` |
| Context | `country`, `search_query`, `view_all_page_id` |
| Dates | `first_saved`, `last_seen`, `tagged_at` |

Other details:

- The file starts with a UTF-8 BOM so Excel shows emoji correctly.
- Cells that start with `=`, `+` or `@` get an apostrophe prefix so they can't run as formulas.
- Rows are sorted by advertiser, then by save time.

## Limits

- **English UI only.** Cards are found by their visible text ("Library ID", "Sponsored", "Started running on"), because Meta's class names are obfuscated and change. If Facebook is set to another language, nothing is saved.
- **Meta can change the page at any time.** If saves stop, check a card's text in DevTools against `parseCard` in `content.js`.
- **Only what has rendered is counted.** Lazy-loaded images below the fold are not counted. Carousels are caught by their per-card link blocks instead.
- **Multiple versions.** The extension saves the version on the card and records how many versions share it. It does not open "See summary details".
- **Restarted worker.** If Chrome stops the service worker mid-queue, untagged ads are picked up on the next browser start, or by **Tag untagged and failed**.

## Files

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest. Host access is limited to the Ad Library and `api.typesafe.ai` |
| `content.js`, `content.css` | Finds cards, parses them as they come into view, draws badges |
| `background.js` | IndexedDB database (`ad-library-saver` / `ads`, keyed by Library ID) and the Jev queue (3 at a time) |
| `questions.js` | The Jev questions and the 0.60 low-confidence line |
| `csv.js` | Column order and CSV escaping |
| `popup.*`, `options.*` | UI |

## Not affiliated

This project is not made, endorsed or supported by Meta Platforms or TypeSafe. Check that your use fits Meta's terms for the Ad Library.

## Licence

MIT. See [LICENSE](LICENSE).
