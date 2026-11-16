/* Mesmas regras de apresentação no navegador e no backend. Sem dados externos. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ExpressPayments = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function paymentState(order) {
    if (order.paid === true) return "confirmed"; // Preserva o histórico anterior à V2 financeira.
    return order.paymentStatus === "reported" ? "reported" : "pending";
  }
  function dayKey(value) {
    if (!Number.isFinite(Number(value)) || Number(value) <= 0) return "";
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(Number(value)));
    const get = name => parts.find(p => p.type === name).value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
  function completedDay(order) { return dayKey(order.completed || order.created); }
  function isOverdue(order, now = Date.now()) {
    const day = completedDay(order);
    return order.status === "done" && paymentState(order) !== "confirmed" && !!day && day < dayKey(now);
  }
  function summary(orders, now = Date.now()) {
    const done = orders.filter(o => o.status === "done");
    const result = { count: done.length, total: 0, received: 0, pending: 0, reported: 0, reportedCount: 0, overdue: 0, overdueCount: 0 };
    for (const order of done) {
      const cents = Math.round(Number(order.fee || 0) * 100);
      result.total += cents;
      if (paymentState(order) === "confirmed") result.received += cents;
      else {
        result.pending += cents;
        if (paymentState(order) === "reported") { result.reported += cents; result.reportedCount++; }
        if (isOverdue(order, now)) { result.overdue += cents; result.overdueCount++; }
      }
    }
    for (const field of ["total", "received", "pending", "reported", "overdue"]) result[field] /= 100;
    return result;
  }
  function normalizePix(input) {
    if (!input || typeof input !== "object") throw new Error("Informe os dados do Pix.");
    const type = input.type;
    const holder = typeof input.holder === "string" ? input.holder.trim().toLocaleUpperCase("pt-BR") : "";
    let key = typeof input.key === "string" ? input.key.trim() : "";
    if (!holder || holder.length > 120) throw new Error("Informe o nome do titular, com até 120 caracteres.");
    if (type === "cpf" || type === "cnpj") {
      if (!/^[\d.\-/ ]+$/.test(key)) throw new Error("Chave CPF/CNPJ inválida.");
      key = key.replace(/\D/g, "");
      if (key.length !== (type === "cpf" ? 11 : 14) || /^(\d)\1+$/.test(key)) throw new Error("Confira os dígitos da chave CPF/CNPJ.");
    } else if (type === "email") {
      key = key.toLowerCase();
      if (key.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) throw new Error("Informe um e-mail Pix válido.");
    } else if (type === "phone") {
      if (!/^\+?[\d ()-]+$/.test(key)) throw new Error("Telefone Pix inválido.");
      const international = key.startsWith("+");
      key = key.replace(/\D/g, "");
      if (!international && (key.length === 10 || key.length === 11)) key = "55" + key;
      key = "+" + key;
      if (!/^\+[1-9]\d{9,14}$/.test(key)) throw new Error("Informe o telefone Pix com DDD ou código do país.");
    } else if (type === "random") {
      key = key.toLowerCase();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(key)) throw new Error("Informe uma chave aleatória Pix válida.");
    } else throw new Error("Selecione o tipo da chave Pix.");
    return { type, key, holder };
  }
  return { paymentState, dayKey, completedDay, isOverdue, summary, normalizePix };
});
