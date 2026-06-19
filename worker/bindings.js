export function hasD1Binding(db) {
  return Boolean(db && typeof db.prepare === "function");
}

export async function executeD1Schema(db, sql) {
  const statements = sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.prepare(statement).run();
  }
}
