export function hasD1Binding(db) {
  return Boolean(db && typeof db.prepare === "function" && typeof db.exec === "function");
}
