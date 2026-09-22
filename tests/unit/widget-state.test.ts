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
    expect(widgetReducer(s, { type: "signedIn", onboarded: true }).view).toEqual({ name: "home" });
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
    expect(s.view).toEqual({ name: "home" });
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
