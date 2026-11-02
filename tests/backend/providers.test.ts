import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { PropertyDetails } from "../../src/server/domain/types";
import { createDraftGenerator } from "../../src/server/domain/listing-service";
import { ChatListingProvider } from "../../src/server/integration/chat-provider";
import { CodexListingProvider } from "../../src/server/integration/codex-provider";

const input: { propertyId: string; details: PropertyDetails } = {
  propertyId: "demo-001",
  details: {
    location: "London, UK",
    beds: 2,
    baths: 1,
    sizeSqm: 74,
    amenities: ["balcony", "lift", "storage"],
  },
};
const description =
  "This property in London, UK has two bedrooms, one bathroom and a floor area of 74 square metres. It also has a balcony, lift and storage.";

test("chat adapter sends the allowlisted schema request over HTTP and validates its response through the service", async () => {
  let received: unknown;
  let authorization: string | undefined;
  const server = createServer(async (request, response) => {
    authorization = request.headers.authorization;
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    received = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify({ description }) },
          },
        ],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing test listener");
    const provider = new ChatListingProvider({
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      model: "test-model",
      apiKey: "test-only-key",
      timeoutMs: 1000,
    });
    assert.deepEqual(
      await createDraftGenerator(provider).generate(input.details),
      {
        description,
      },
    );
    assert.equal(authorization, "Bearer test-only-key");
    const payload = JSON.stringify(received);
    assert.equal(payload.includes("demo-001"), false);
    assert.equal(payload.includes("json_schema"), true);
    assert.equal(payload.includes("propertyFacts"), true);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

async function withFakeCodex(
  script: string,
  run: (binary: string, directory: string) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "fieldnotes-adapter-test-"));
  const binary = join(directory, "codex-test");
  await writeFile(binary, `#!${process.execPath}\n${script}`, { mode: 0o700 });
  await chmod(binary, 0o700);
  try {
    await run(binary, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("Codex adapter uses stdin and isolated read-only argv, cleans temp files and keeps secret stderr private", async () => {
  await withFakeCodex(
    `
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
let prompt = '';
process.stdin.on('data', chunk => prompt += chunk);
process.stdin.on('end', () => {
  const report = { args, cwd: process.cwd(), prompt, inheritedApiSecret: process.env.AI_API_KEY };
  fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], JSON.stringify({description: ${JSON.stringify(description)}}));
  fs.writeFileSync(path.join(__dirname, 'report.json'), JSON.stringify(report));
  process.stdout.write(JSON.stringify({type:'turn.completed'}) + '\\n');
  process.stderr.write('private account information');
});`,
    async (binary, directory) => {
      const reportPath = join(directory, "report.json");
      const prior = process.env.AI_API_KEY;
      process.env.AI_API_KEY = "must-not-inherit";
      try {
        const provider = new CodexListingProvider({ binary, timeoutMs: 1000 });
        assert.deepEqual(
          await createDraftGenerator(provider).generate(input.details),
          {
            description,
          },
        );
        const report = JSON.parse(await readFile(reportPath, "utf8"));
        assert.equal(report.args.includes("--ignore-user-config"), true);
        assert.equal(report.args.includes("read-only"), true);
        assert.equal(report.args.includes("--ephemeral"), true);
        assert.equal(report.args.includes("shell_tool"), true);
        assert.equal(report.args.includes("-"), true);
        assert.equal(report.inheritedApiSecret, undefined);
        assert.equal(report.prompt.includes("propertyFacts"), true);
        await assert.rejects(readFile(join(report.cwd, "draft.json")), {
          code: "ENOENT",
        });
      } finally {
        if (prior === undefined) delete process.env.AI_API_KEY;
        else process.env.AI_API_KEY = prior;
        await rm(reportPath, { force: true });
      }
    },
  );
});

test("Codex adapter kills timed-out processes and reports a safe timeout", async () => {
  await withFakeCodex("setInterval(() => {}, 1000);", async (binary) => {
    const provider = new CodexListingProvider({ binary, timeoutMs: 1000 });
    await assert.rejects(
      createDraftGenerator(provider).generate(input.details),
      {
        code: "AI_TIMEOUT",
        status: 504,
      },
    );
  });
});

test("Codex adapter rejects unexpected tool events even when final JSON looks valid", async () => {
  await withFakeCodex(
    `
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], JSON.stringify({description: ${JSON.stringify(description)}}));
process.stdout.write(JSON.stringify({type:'item.completed', item:{type:'command_execution'}}) + '\\n');
`,
    async (binary) => {
      const provider = new CodexListingProvider({ binary, timeoutMs: 1000 });
      await assert.rejects(
        createDraftGenerator(provider).generate(input.details),
        {
          code: "AI_UNAVAILABLE",
        },
      );
    },
  );
});
