import assert from "node:assert/strict";
import test from "node:test";
import { createParticipantToken, verifyParticipantToken } from "./participant-token.js";

test("participant token is server-signed and bound to the approved embed origin", () => {
  const token = createParticipantToken("https://awards.example", "server-secret", "07583680-ef0e-4bde-9082-c205bf7c7b8c");
  assert.deepEqual(verifyParticipantToken(token.participantToken, "server-secret"), {
    participantId: token.participantId,
    embedderOrigin: "https://awards.example",
  });
  assert.equal(verifyParticipantToken(token.participantToken, "other-secret"), null);
  assert.equal(verifyParticipantToken(`${token.participantToken}tampered`, "server-secret"), null);
  assert.equal(verifyParticipantToken("invalid", "server-secret"), null);
});
