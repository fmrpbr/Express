"use strict";
const { randomBytes, createHash } = require("node:crypto");
const { applyCommand, DomainError } = require("./domain");

function createCommandHandler(db, clock = Date.now) {
  return async (auth, command) => {
    if (!command || typeof command !== "object" || Buffer.byteLength(JSON.stringify(command)) > 12000)
      throw new DomainError("invalid-argument", "Operação inválida.");
    const context = {
      now: clock(), newId: db.ref("orders").push().key,
      token: randomBytes(32).toString("hex"),
      fingerprint: createHash("sha256").update(JSON.stringify(command)).digest("hex")
    };
    let response, rejected;
    // Callback não lança exceções: aborta e propaga a falha depois de o SDK encerrar a transação.
    const apply = current => {
      rejected = null;
      try {
        const applied = applyCommand(current || {}, auth, command, context);
        response = applied.result;
        return applied.state;
      } catch (error) { rejected = error; return undefined; }
    };
    // Pedido, índices, disponibilidade, histórico e recibo são confirmados juntos.
    // O primeiro callback do SDK pode não ter cache; o servidor resolve o conflito.
    await db.ref().transaction(current => current === null ? {} : apply(current), undefined, false);
    if (rejected) throw rejected;
    if (!response) {
      await db.ref().transaction(apply, undefined, false);
      if (rejected) throw rejected;
    }
    return response;
  };
}
module.exports = { createCommandHandler };
