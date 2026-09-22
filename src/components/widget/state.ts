import type { CoachingMode } from "@/types/domain";

export type OnboardingStep = 1 | 2 | 3;

export type WidgetView =
  | { name: "loading" }
  | { name: "signedOut" }
  | { name: "onboarding"; step: OnboardingStep }
  | { name: "home" }
  | { name: "chat"; sessionId: string; mode: CoachingMode; memoryEnabled: boolean; title: string }
  | {
      name: "summary";
      sessionId: string;
      mode: CoachingMode;
      memoryEnabled: boolean;
      title: string;
    };

export interface WidgetState {
  open: boolean;
  view: WidgetView;
  inspectorOpen: boolean;
}

export type WidgetAction =
  | { type: "open" }
  | { type: "close" }
  | { type: "toggle" }
  | { type: "signedOut" }
  | { type: "signedIn"; onboarded: boolean }
  | { type: "onboardingStep"; step: OnboardingStep }
  | { type: "onboarded" }
  | {
      type: "startChat";
      sessionId: string;
      mode: CoachingMode;
      memoryEnabled: boolean;
      title: string;
    }
  | { type: "endChat" }
  | { type: "home" }
  | { type: "inspector"; open: boolean };

export const initialWidgetState = (open = false): WidgetState => ({
  open,
  view: { name: "loading" },
  inspectorOpen: false,
});

/**
 * Widget state machine:
 *   closed ⇄ open; loading → signedOut | onboarding(1..3) | home;
 *   home → chat(sessionId) → summary → home.
 * Invalid transitions are ignored (state returned unchanged).
 */
export function widgetReducer(state: WidgetState, action: WidgetAction): WidgetState {
  switch (action.type) {
    case "open":
      return state.open ? state : { ...state, open: true };
    case "close":
      return state.open ? { ...state, open: false, inspectorOpen: false } : state;
    case "toggle":
      return state.open
        ? { ...state, open: false, inspectorOpen: false }
        : { ...state, open: true };
    case "signedOut":
      return { ...state, view: { name: "signedOut" }, inspectorOpen: false };
    case "signedIn":
      if (state.view.name === "chat" || state.view.name === "summary") return state;
      return {
        ...state,
        view: action.onboarded ? { name: "home" } : { name: "onboarding", step: 1 },
      };
    case "onboardingStep":
      return state.view.name === "onboarding"
        ? { ...state, view: { name: "onboarding", step: action.step } }
        : state;
    case "onboarded":
      return state.view.name === "onboarding" ? { ...state, view: { name: "home" } } : state;
    case "startChat":
      if (
        state.view.name !== "home" &&
        state.view.name !== "summary" &&
        state.view.name !== "loading"
      )
        return state;
      return {
        ...state,
        view: {
          name: "chat",
          sessionId: action.sessionId,
          mode: action.mode,
          memoryEnabled: action.memoryEnabled,
          title: action.title,
        },
      };
    case "endChat":
      return state.view.name === "chat"
        ? { ...state, view: { ...state.view, name: "summary" } }
        : state;
    case "home":
      return state.view.name === "signedOut" || state.view.name === "onboarding"
        ? state
        : { ...state, view: { name: "home" } };
    case "inspector":
      return { ...state, inspectorOpen: action.open };
  }
}
