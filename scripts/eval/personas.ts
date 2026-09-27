/**
 * Synthetic eval personas (fictional people and companies — not users).
 * Each persona has a two-turn session-1 script that establishes six things
 * the coach should remember, and the keywords that show a later reply used
 * them. Keywords are fixed here BEFORE any run; never tune them to results.
 */

export const PROBE_CATEGORIES = [
  "target_role",
  "repeated_mistake",
  "last_assignment",
  "learning_preference",
  "strength",
  "constraint",
] as const;
export type ProbeCategory = (typeof PROBE_CATEGORIES)[number];

/** Same six questions for every persona; none of them contains the answer. */
export const PROBE_QUESTIONS: Record<ProbeCategory, string> = {
  target_role: "Quick check before we start: which role am I preparing for?",
  repeated_mistake: "What's the main mistake I should watch out for in my answers?",
  last_assignment: "What did you ask me to work on for next time?",
  learning_preference: "How do I prefer to be coached?",
  strength: "What did I do well in my last answer?",
  constraint: "Is there anything about my practice schedule you should keep in mind?",
};

export interface Persona {
  /** Lower-case slug; becomes the eval user id (namespace-safe). */
  id: string;
  firstName: string;
  /** Session 1: [context + question request, the answer]. */
  session1: [string, string];
  /**
   * Any-of keyword lists per category (case-insensitive, curly quotes
   * normalized). `last_assignment` is derived at run time from the coach's
   * own "Fix next time" in session 1, so it is not listed here.
   */
  expect: Record<Exclude<ProbeCategory, "last_assignment">, readonly string[]>;
}

export const PERSONAS: readonly Persona[] = [
  {
    id: "sre-nadia",
    firstName: "Nadia",
    session1: [
      "Hi! I'm preparing for a Site Reliability Engineer role at Northwind Payments; the onsite is in three weeks. I learn best examples-first and concise: show me a strong example, then the principle. One constraint: I can only practise on my commute, 20 minutes at a time. Please ask me: 'Tell me about a production incident you handled.'",
      "Sure. Last spring our checkout API started timing out at 9am. First I checked the dashboards, then I paged the database on-call, then we found a connection-pool leak from that morning's deploy, then I rolled the deploy back, and afterwards I wrote the postmortem. After that things were a lot better and the team was happy.",
    ],
    expect: {
      target_role: ["site reliability", "sre"],
      repeated_mistake: ["metric", "number", "quantif", "measur", "how much"],
      learning_preference: [
        "examples-first",
        "examples first",
        "lead with an example",
        "start with an example",
        "example first",
      ],
      strength: ["timeline", "chronolog", "step by step", "step-by-step", "sequence"],
      constraint: ["20 min", "20-min", "twenty min", "commute"],
    },
  },
  {
    id: "design-tomas",
    firstName: "Tomás",
    session1: [
      "Hello! I'm interviewing for a Product Designer role at Lumen Health in ten days. Please coach me Socratically: ask me questions instead of lecturing me. I can only practise in the evenings after 8pm. Please ask me: 'Tell me about a design decision you had to defend.'",
      "OK so, this was on the patient onboarding flow, and actually before that I was on the billing team for a while, which is a whole other story, but anyway the PM wanted a single long form and I thought it should be steps, and we went back and forth, and I also had opinions about the colour palette at the time, and there was a reorg, but the main thing is I ran five usability tests with real patients and the stepped version had far fewer drop-offs, so we shipped the steps eventually, I think, after a few more meetings.",
    ],
    expect: {
      target_role: ["product designer"],
      repeated_mistake: [
        "rambl",
        "too long",
        "tangent",
        "get to the point",
        "headline",
        "concise",
        "shorter",
      ],
      learning_preference: [
        "socratic",
        "ask you questions",
        "questions instead",
        "questions rather than",
        "guiding questions",
      ],
      strength: ["usability test", "usability", "user research", "research with"],
      constraint: ["evening", "8pm", "8 pm", "after 8"],
    },
  },
  {
    id: "data-amara",
    firstName: "Amara",
    session1: [
      "Hi, I'm going for a Data Analyst role at Harbor Games. I like theory-first, detailed explanations: give me the framework before any example. I can only practise twice a week, on Tuesdays and Thursdays. Please ask me: 'Tell me about an analysis that changed a decision.'",
      "We noticed players were churning after level 3. We pulled the event data, we built a funnel, and we found that the difficulty spike at level 3 was the cause. We proposed an easier level 3 and we ran an A/B test. Day-7 retention went up 6% in the test group, so we rolled it out to everyone.",
    ],
    expect: {
      target_role: ["data analyst"],
      repeated_mistake: [
        '"we"',
        "'we'",
        "your own role",
        "your role",
        "you personally",
        "your contribution",
        "own contribution",
        '"i"',
      ],
      learning_preference: [
        "theory-first",
        "theory first",
        "framework first",
        "framework before",
        "principle first",
      ],
      strength: ["retention", "6%", "6 %", "six percent"],
      constraint: ["tuesday", "thursday", "twice a week"],
    },
  },
];
