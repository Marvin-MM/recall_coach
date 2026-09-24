import type { CoachingMode } from "@/types/domain";

export type OnboardingStep = 1 | 2 | 3;
export type HomeTab = "practice" | "history";

/** Real notes from the previous session, shown when a new session starts from its detail view. */
export interface RecapSeed {
  fromTitle: string;
  items: string[];
}

export interface ChatSeed {
  sessionId: string;
  mode: CoachingMode;
  memoryEnabled: boolean;
  title: string;
  /** Reopen an unfinished session with its stored transcript. */
  restore?: boolean;
  recap?: RecapSeed;
}

export interface DetailSeed {
  sessionId: string;
  mode: CoachingMode;
  memoryEnabled: boolean;
  title: string;
  turnCount: number;
  createdAt: string;
}

export type WidgetView =
  | { name: "loading" }
  | { name: "signedOut" }
  | { name: "onboarding"; step: OnboardingStep }
  | { name: "home"; tab: HomeTab }
  | ({ name: "chat" } & ChatSeed)
  | {
      name: "summary";
      sessionId: string;
      mode: CoachingMode;
      memoryEnabled: boolean;
      title: string;
    }
  | ({ name: "detail" } & DetailSeed);

export interface WidgetState {
  open: boolean;
  view: WidgetView;
  inspectorOpen: boolean;
  settingsOpen: boolean;
}

export type WidgetAction =
  | { type: "open" }
  | { type: "close" }
  | { type: "toggle" }
  | { type: "signedOut" }
  | { type: "signedIn"; onboarded: boolean }
  | { type: "onboardingStep"; step: OnboardingStep }
  | { type: "onboarded" }
  | ({ type: "startChat" } & ChatSeed)
  | { type: "endChat" }
  | { type: "home"; tab?: HomeTab }
  | { type: "openDetail"; session: DetailSeed }
  | { type: "inspector"; open: boolean }
  | { type: "settings"; open: boolean };

export const initialWidgetState = (open = false): WidgetState => ({
  open,
  view: { name: "loading" },
  inspectorOpen: false,
  settingsOpen: false,
});

const home = (tab: HomeTab = "practice"): WidgetView => ({ name: "home", tab });

/**
 * Widget state machine:
 *   closed ⇄ open; loading → signedOut | onboarding(1..3) | home | chat (restored);
 *   home(practice|history) → chat → summary → home; home/summary → detail (read-only) → home | chat.
 * Invalid transitions are ignored (state returned unchanged).
 */
export function widgetReducer(state: WidgetState, action: WidgetAction): WidgetState {
  const overlaysClosed = { inspectorOpen: false, settingsOpen: false };
  switch (action.type) {
    case "open":
      return state.open ? state : { ...state, open: true };
    case "close":
      return state.open ? { ...state, open: false, ...overlaysClosed } : state;
    case "toggle":
      return state.open ? { ...state, open: false, ...overlaysClosed } : { ...state, open: true };
    case "signedOut":
      return { ...state, view: { name: "signedOut" }, ...overlaysClosed };
    case "signedIn":
      if (["chat", "summary", "detail"].includes(state.view.name)) return state;
      return {
        ...state,
        view: action.onboarded ? home() : { name: "onboarding", step: 1 },
      };
    case "onboardingStep":
      return state.view.name === "onboarding"
        ? { ...state, view: { name: "onboarding", step: action.step } }
        : state;
    case "onboarded":
      return state.view.name === "onboarding" ? { ...state, view: home() } : state;
    case "startChat": {
      if (!["home", "summary", "loading", "detail"].includes(state.view.name)) return state;
      const { type: _type, ...seed } = action;
      return { ...state, view: { name: "chat", ...seed } };
    }
    case "endChat":
      return state.view.name === "chat"
        ? {
            ...state,
            view: {
              name: "summary",
              sessionId: state.view.sessionId,
              mode: state.view.mode,
              memoryEnabled: state.view.memoryEnabled,
              title: state.view.title,
            },
          }
        : state;
    case "home":
      return state.view.name === "signedOut" || state.view.name === "onboarding"
        ? state
        : { ...state, view: home(action.tab) };
    case "openDetail":
      return state.view.name === "home" || state.view.name === "summary"
        ? { ...state, view: { name: "detail", ...action.session } }
        : state;
    case "inspector":
      return { ...state, inspectorOpen: action.open };
    case "settings":
      return { ...state, settingsOpen: action.open };
  }
}
