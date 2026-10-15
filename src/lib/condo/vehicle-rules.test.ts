import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizePlate,
  normalizeUnit,
  canReviewVehicles,
  canConsultVehicles,
  vehicleInput,
} from "./vehicle-rules.ts";

test("normaliza placas antigas e Mercosul sem aceitar placas inválidas", () => {
  assert.equal(normalizePlate("abc-1234"), "ABC1234");
  assert.equal(normalizePlate(" abc 1d23 "), "ABC1D23");
  for (const plate of ["ABC123", "AB12345", "ABC1DD3", "ABC12345", "ABC@1234"]) {
    assert.equal(
      vehicleInput.safeParse({ plate, model: "Honda Civic", color: "Prata" }).success,
      false,
      plate,
    );
  }
});
test("a vaga pertence à unidade e não depende de maiúsculas, espaços ou pontuação", () => {
  assert.equal(normalizeUnit(" Bloco A - 101 "), normalizeUnit("bloco a 101"));
  assert.equal(normalizeUnit("Blóco A 101"), "BLOCOA101");
  assert.notEqual(normalizeUnit("Bloco A 101"), normalizeUnit("Bloco B 101"));
});
test("somente admin e síndico analisam; portaria também consulta; morador não consulta terceiros", () => {
  for (const role of ["user", "porteiro", "admin", "sindico"] as const) {
    assert.equal(canReviewVehicles(role), role === "admin" || role === "sindico");
    assert.equal(canConsultVehicles(role), role !== "user");
  }
});
