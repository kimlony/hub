import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateMockMallOrders } from "../src/channels/mockMall/MockMallOrderGenerator.js";

const options = readOptions(process.argv.slice(2));
const output = path.resolve(options.output ?? "../mock-fixtures/demo-orders.json");
const orders = positiveInteger(options.orders, 10_000);
const seed = options.seed ?? "demo-fixture-001";
const mallKey = options.mallKey ?? "mock-mall-001";

const result = generateMockMallOrders({ page: 1, size: orders, totalCount: orders, seed, mallKey });
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({
  fixtureVersion: 1,
  generatedBy: "hub-worker mock:fixture",
  seed,
  orders: result.orders
}, null, 2));

process.stdout.write(`Generated ${result.orders.length} Mock Mall orders: ${output}\n`);

function readOptions(args: string[]): Record<string, string> {
  const options: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (key?.startsWith("--") && value) {
      options[key.slice(2)] = value;
    }
  }
  return options;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
