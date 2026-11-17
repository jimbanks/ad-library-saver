// The three questions Jev answers for every ad. Tested 2026-10-04 on invented
// ads (3/3 correct on every question). Wording matters: one word in the
// instructions can move an answer by 10 points, so never compare tags from
// two different versions of this file. If you change a question, bump
// QUESTIONS_VERSION and retag everything (popup → "Retag all").

export const QUESTIONS_VERSION = 1;

// Below this confidence a tag is kept but listed in the needs_check column.
export const LOW_CONFIDENCE = 0.6;

export const QUESTIONS = {
  format: {
    type: "choice",
    instructions: "What creative format is this Meta ad? Use `media` (counted from the page) as the main evidence and the copy only to break ties.",
    criteria: {
      single_image: "One static image",
      video: "A video",
      carousel: "Two or more swipeable images or cards",
      text_only: "No image or video, copy only",
      other: "Something else, such as an instant experience or a format the media field does not describe"
    }
  },
  cta: {
    type: "choice",
    instructions: "What does this ad ask the viewer to do next? Read `cta_button` first, then the end of `copy`.",
    criteria: {
      buy: "Buy or order now: shop, buy, order, get an offer or use a code",
      learn: "Find out more, read, watch or explore without a buying step",
      sign_up: "Sign up, subscribe, register, apply or join a list",
      contact_or_book: "Book, call, message, get a quote or get directions",
      install: "Download or install an app or play a game",
      follow: "Visit or follow a profile or page",
      none: "No clear next step"
    }
  },
  funnel: {
    type: "score",
    instructions: "Which funnel stage is this ad written for? Judge from what the copy assumes the viewer already knows and what it asks of them.",
    criteria: [
      "awareness: introduces the brand, a problem or a story to people who may not know it, with no hard ask",
      "consideration: compares, explains benefits or proves claims to people already weighing options",
      "conversion: pushes an immediate purchase or sign-up with an offer, urgency or a direct buy ask"
    ]
  }
};
