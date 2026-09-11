#!/usr/bin/env node
// Build + deploy a static frontend (admin / resident-web / landing) to S3, with
// an optional CloudFront invalidation. Targets + bucket/distribution names live
// in deploy/frontends.config.json — see deploy/README.md for setup.
//
// Usage:
//   node deploy/deploy-frontend.mjs <target> [options]
//   pnpm deploy:frontend <target> [options]
//
// Targets: admin | resident-web | landing
//
// Options:
//   --skip-build       Reuse the existing build output instead of rebuilding
//   --invalidate-cf    Also invalidate CloudFront after the sync (default: skip it —
//                       short-cached HTML/paths expire on their own within max-age)
//   --dry-run          Pass --dryrun to aws s3 sync; do everything else for real (build still runs)
//   --profile <name>   AWS CLI profile (overrides AWS_PROFILE env)
//   --bucket <name>    Override the bucket from config (e.g. for a staging bucket)

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: { ...process.env, ...(opts.env ?? {}) },
  });
  if (result.error) fail(`Failed to run "${cmd}": ${result.error.message}`);
  if (result.status !== 0) {
    fail(`"${cmd} ${args.join(" ")}" exited with code ${result.status}`);
  }
}

function parseArgs(argv) {
  const [target, ...rest] = argv;
  const opts = {
    target,
    skipBuild: false,
    invalidate: false,
    dryRun: false,
    profile: null,
    bucket: null,
  };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--skip-build") opts.skipBuild = true;
    else if (arg === "--invalidate-cf") opts.invalidate = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--profile") opts.profile = rest[++i];
    else if (arg === "--bucket") opts.bucket = rest[++i];
    else fail(`Unknown option: ${arg}`);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.target) {
    fail(
      "Usage: node deploy/deploy-frontend.mjs <admin|resident-web|landing> [--skip-build] [--invalidate-cf] [--dry-run] [--profile <name>] [--bucket <name>]"
    );
  }

  const configPath = path.join(REPO_ROOT, "deploy/frontends.config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const target = config[opts.target];

  if (!target) {
    fail(
      `Unknown target "${opts.target}". Valid targets: ${Object.keys(config)
        .filter((k) => !k.startsWith("_"))
        .join(", ")}`
    );
  }

  const bucket = opts.bucket ?? target.s3Bucket;
  if (!bucket || bucket.startsWith("CHANGE_ME")) {
    fail(
      `No S3 bucket configured for "${opts.target}". Set "s3Bucket" in deploy/frontends.config.json, or pass --bucket <name>.`
    );
  }

  const buildOutDir = path.join(REPO_ROOT, target.dir, target.buildDir);

  // 1. Build (unless reusing an existing output dir)
  if (!opts.skipBuild) {
    run("pnpm", ["--filter", target.workspace, "build"], {
      env: target.buildEnv ?? {},
    });
  } else {
    console.log(`\n(skipping build — reusing ${buildOutDir})`);
  }

  if (!existsSync(buildOutDir)) {
    fail(
      `Build output not found at ${buildOutDir}. Did the build succeed? (skip --skip-build to rebuild)`
    );
  }

  // 2. Sync everything with a short, must-revalidate cache — also handles
  //    deletes, so stale/renamed hashed chunks from previous builds are cleaned up.
  const awsBaseArgs = [];
  if (opts.profile) awsBaseArgs.push("--profile", opts.profile);
  if (target.region) awsBaseArgs.push("--region", target.region);

  const syncArgs = [
    "s3",
    "sync",
    buildOutDir,
    `s3://${bucket}`,
    "--delete",
    "--cache-control",
    "public, max-age=300, must-revalidate",
    ...awsBaseArgs,
  ];
  if (opts.dryRun) syncArgs.push("--dryrun");
  run("aws", syncArgs);

  // 3. Re-sync the immutable, content-hashed assets with a long cache lifetime
  //    (overwrites the cache-control metadata set on those objects in step 2).
  if (target.immutableInclude?.length) {
    const immutableArgs = ["s3", "sync", buildOutDir, `s3://${bucket}`, "--exclude", "*"];
    for (const pattern of target.immutableInclude) {
      immutableArgs.push("--include", pattern);
    }
    immutableArgs.push(
      "--cache-control",
      "public, max-age=31536000, immutable",
      ...awsBaseArgs
    );
    if (opts.dryRun) immutableArgs.push("--dryrun");
    run("aws", immutableArgs);
  }

  // 4. Invalidate CloudFront so the new deploy is visible immediately.
  if (opts.invalidate && target.cloudfrontDistributionId) {
    const paths = target.invalidatePaths?.length ? target.invalidatePaths : ["/*"];
    run("aws", [
      "cloudfront",
      "create-invalidation",
      "--distribution-id",
      target.cloudfrontDistributionId,
      "--paths",
      ...paths,
      ...awsBaseArgs,
    ]);
  } else if (opts.invalidate && !target.cloudfrontDistributionId) {
    console.log(
      `\n(no cloudfrontDistributionId configured for "${opts.target}" — skipping invalidation; the bucket was updated directly)`
    );
  } else {
    console.log(
      `\n(skipping CloudFront invalidation — pass --invalidate-cf to force it; short-cached HTML will pick up the change within its max-age)`
    );
  }

  console.log(`\n✔ Deployed ${opts.target} → s3://${bucket}\n`);
}

main();
