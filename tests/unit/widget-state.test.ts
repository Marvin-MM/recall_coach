import { describe, expect, it } from "vitest";
import { initialWidgetState, type WidgetState, widgetReducer } from "@/components/widget/state";

const chat = {
  type: "startChat",
  sessionId: "s1",
  mode: "drill",
  memoryEnabled: true,
  title: "Drill · 22 Sep",
} as const;

describe("widgetReducer", () => {
  it("opens, closes and toggles", () => {
    let s = initialWidgetState();
    s = widgetReducer(s, { type: "open" });
    expect(s.open).toBe(true);
    s = widgetReducer({ ...s, inspectorOpen: true }, { type: "close" });
    expect(s).toMatchObject({ open: false, inspectorOpen: false });
    expect(widgetReducer(s, { type: "toggle" }).open).toBe(true);
  });

  it("routes sign-in to onboarding or home", () => {
    const s = initialWidgetState(true);
    expect(widgetReducer(s, { type: "signedIn", onboarded: false }).view).toEqual({
      name: "onboarding",
      step: 1,
    });
    expect(widgetReducer(s, { type: "signedIn", onboarded: true }).view).toEqual({
      name: "home",
      tab: "practice",
    });
  });

  it("walks the full flow: onboarding → home → chat → summary → home", () => {
    let s: WidgetState = widgetReducer(initialWidgetState(true), {
      type: "signedIn",
      onboarded: false,
    });
    s = widgetReducer(s, { type: "onboardingStep", step: 3 });
    expect(s.view).toEqual({ name: "onboarding", step: 3 });
    s = widgetReducer(s, { type: "onboarded" });
    s = widgetReducer(s, chat);
    expect(s.view).toMatchObject({ name: "chat", sessionId: "s1" });
    s = widgetReducer(s, { type: "endChat" });
    expect(s.view).toMatchObject({ name: "summary", sessionId: "s1" });
    s = widgetReducer(s, { type: "home" });
    expect(s.view).toEqual({ name: "home", tab: "practice" });
  });

  it("restores an unfinished session straight from loading", () => {
    const s = widgetReducer(initialWidgetState(true), { ...chat, restore: true });
    expect(s.view).toMatchObject({ name: "chat", sessionId: "s1", restore: true });
  });

  it("history: home(history) → detail (read-only) → back to history, or a new session with a recap", () => {
    const detail = {
      sessionId: "old",
      mode: "mock_interview",
      memoryEnabled: true,
      title: "Mock interview · 20 Sep",
      turnCount: 4,
      createdAt: "2026-09-20T10:00:00.000Z",
    } as const;
    let s = widgetReducer(initialWidgetState(true), { type: "signedIn", onboarded: true });
    s = widgetReducer(s, { type: "home", tab: "history" });
    expect(s.view).toEqual({ name: "home", tab: "history" });
    s = widgetReducer(s, { type: "openDetail", session: detail });
    expect(s.view).toMatchObject({ name: "detail", sessionId: "old", turnCount: 4 });
    expect(widgetReducer(s, { type: "home", tab: "history" }).view).toEqual({
      name: "home",
      tab: "history",
    });
    const recap = { fromTitle: detail.title, items: ["The user skipped the Result."] };
    s = widgetReducer(s, { ...chat, sessionId: "new", recap });
    expect(s.view).toMatchObject({ name: "chat", sessionId: "new", recap });
    // A detail view can't be opened from inside a chat.
    expect(widgetReducer(s, { type: "openDetail", session: detail })).toBe(s);
  });

  it("closing the panel closes both overlays", () => {
    const s = { ...initialWidgetState(true), inspectorOpen: true, settingsOpen: true };
    expect(widgetReducer(s, { type: "close" })).toMatchObject({
      open: false,
      inspectorOpen: false,
      settingsOpen: false,
    });
    expect(
      widgetReducer(initialWidgetState(true), { type: "settings", open: true }).settingsOpen,
    ).toBe(true);
  });

  it("ignores invalid transitions", () => {
    const signedOut = widgetReducer(initialWidgetState(true), { type: "signedOut" });
    expect(widgetReducer(signedOut, chat)).toBe(signedOut);
    expect(widgetReducer(signedOut, { type: "home" })).toBe(signedOut);
    expect(widgetReducer(signedOut, { type: "endChat" })).toBe(signedOut);
    const inChat = widgetReducer(
      widgetReducer(initialWidgetState(true), { type: "signedIn", onboarded: true }),
      chat,
    );
    expect(widgetReducer(inChat, { type: "signedIn", onboarded: true })).toBe(inChat);
  });
});
