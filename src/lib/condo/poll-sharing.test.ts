import assert from "node:assert/strict";
import { test } from "node:test";
import {
  pollShare,
  pollIdFromSearch,
  loginDestination,
  loginContextQuery,
} from "./poll-sharing.ts";

const id = "71c1f40b-99f4-4553-832f-0c801a12f167";
test("group share has no resident token and opens recipient selection", () => {
  const share = pollShare({
    id,
    title: "Piscina & salão: sim ou não?",
    origin: "https://quati.example/path",
  });
  assert.equal(share.url, `https://quati.example/login?enquete=${id}`);
  const whatsapp = new URL(share.whatsappUrl);
  assert.equal(whatsapp.origin + whatsapp.pathname, "https://wa.me/");
  assert.deepEqual([...whatsapp.searchParams.keys()], ["text"]);
  assert.equal(whatsapp.searchParams.get("text"), share.message);
  assert.ok(share.message.includes("Piscina & salão: sim ou não?"));
  assert.ok(share.message.includes(share.url));
  assert.ok(!share.message.includes("/votar/"));
});
test("share rejects unsafe origins and invalid poll IDs", () => {
  for (const origin of ["javascript:alert(1)", "file:///tmp/a", "https://user:secret@example.com"])
    assert.throws(() => pollShare({ id, title: "Pergunta", origin }));
  assert.throws(() =>
    pollShare({ id: "../painel", title: "Pergunta", origin: "https://quati.example" }),
  );
});
test("login only returns to validated internal destinations", () => {
  assert.equal(pollIdFromSearch(id), id);
  for (const value of ["//evil.example", "../painel", [id], undefined, "<script>"])
    assert.equal(pollIdFromSearch(value), undefined);
  assert.equal(loginDestination({ enquete: id }), `/enquetes/${id}`);
  assert.equal(loginDestination({ enquete: "//evil.example" }), "/painel");
  const convite = "a".repeat(64);
  assert.equal(loginDestination({ convite, enquete: id }), `/convite/${convite}`);
  assert.equal(loginContextQuery({ enquete: id }), `enquete=${id}`);
  assert.equal(loginContextQuery({ convite, enquete: id }), `convite=${convite}`);
  assert.equal(loginContextQuery({ enquete: "https://evil.example" }), "");
});
