import test from "node:test";
import assert from "node:assert/strict";
import { extractWhatsAppText, isResumeRequest } from "../lib/whatsapp/types.ts";

test("extracts WhatsApp text payloads", () => {
  assert.equal(extractWhatsAppText({ type: "text", text: { body: "Hello Tejas" } }), "Hello Tejas");
});

test("extracts WhatsApp interactive replies", () => {
  assert.equal(
    extractWhatsAppText({ type: "interactive", interactive: { button_reply: { title: "Talk to a human" } } }),
    "Talk to a human",
  );
});

test("does not turn unsupported media into an empty message", () => {
  assert.equal(extractWhatsAppText({ type: "image" }), "[The delegate sent a image message]");
});

test("recognises explicit Tejas resume requests", () => {
  assert.equal(isResumeRequest("Tejas resume"), true);
  assert.equal(isResumeRequest("AI, continue"), true);
  assert.equal(isResumeRequest("resume tejas"), true);
});

test("does not resume AI on ordinary user messages", () => {
  assert.equal(isResumeRequest("I still need help with my refund"), false);
  assert.equal(isResumeRequest("Thanks"), false);
});
