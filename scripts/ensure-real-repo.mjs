#!/usr/bin/env node

/**
 * Ensure a pinned third-party repo is shallow-cloned into a gitignored path
 * for isolated real-repo verification. Never vendors source into git.
 */

import { spawnSync } from "node:child_process";
import { access, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

/** @typedef {{ name: string, url: string, sha: string, dirname: string }} RealRepoPin */

/** @type {RealRepoPin} */
export const REALWORLD_EXPRESS = {
  name: "gothinkster/node-express-realworld-example-app",
  url: "https://github.com/gothinkster/node-express-realworld-example-app.git",
  // Pinned 2026-08-02 — tip of master at plan rung-1 kickoff.
  sha: "30b68e1e881462b2f4164ea09ab4c4f5699c7b0b",
  dirname: "node-express-realworld",
};

/** @type {RealRepoPin} */
export const NEXTJS_SAAS_STARTER = {
  name: "nextjs/saas-starter",
  url: "https://github.com/nextjs/saas-starter.git",
  // Pinned 2026-08-02 — tip of main at plan rung-2 real-repo kickoff.
  sha: "6e33e58b1e553a41fe22e6b941a7229a002de361",
  dirname: "nextjs-saas-starter",
};

/** @type {RealRepoPin} */
export const FASTAPI_REALWORLD = {
  name: "nsidnev/fastapi-realworld-example-app",
  url: "https://github.com/nsidnev/fastapi-realworld-example-app.git",
  // Pinned 2026-08-02 — tip of master at plan rung-3 real-repo kickoff.
  sha: "029eb7781c60d5f563ee8990a0cbfb79b244538c",
  dirname: "fastapi-realworld",
};

/** @type {RealRepoPin} */
export const HACKATHON_STARTER = {
  name: "sahat/hackathon-starter",
  url: "https://github.com/sahat/hackathon-starter.git",
  // Pinned 2026-08-02 — tip of master at plan rung-4 Mongo real-repo kickoff.
  sha: "d20161b9e81e817d38b3633e08349f327b01d974",
  dirname: "hackathon-starter",
};

/** @type {RealRepoPin} */
export const SWAGGER_PETSTORE = {
  name: "swagger-api/swagger-petstore",
  url: "https://github.com/swagger-api/swagger-petstore.git",
  // Pinned 2026-08-02 — tip of master at plan rung-5 OpenAPI real-repo kickoff.
  sha: "8f0dd286987880b4af7bce552aca3813166f3049",
  dirname: "swagger-petstore",
};

/** @type {RealRepoPin} */
export const GRAPHQL_CLIENT_EXAMPLE_SERVER = {
  name: "zth/graphql-client-example-server",
  url: "https://github.com/zth/graphql-client-example-server.git",
  // Pinned 2026-08-02 — tip of master at plan rung-6 GraphQL real-repo kickoff.
  sha: "814f2ba089368c29f433dc395fe169ae52740a46",
  dirname: "graphql-client-example-server",
};

/** @type {RealRepoPin} */
export const EXAMPLE_VOTING_APP = {
  name: "dockersamples/example-voting-app",
  url: "https://github.com/dockersamples/example-voting-app.git",
  // Pinned 2026-08-02 — tip of main at plan rung-7 Docker/Compose real-repo kickoff.
  sha: "63e9150ca17af4ed05880d4245e486481f73fcb4",
  dirname: "example-voting-app",
};

/** @type {RealRepoPin} */
export const TERRAFORM_AWS_VPC = {
  name: "terraform-aws-modules/terraform-aws-vpc",
  url: "https://github.com/terraform-aws-modules/terraform-aws-vpc.git",
  // Pinned 2026-08-02 — tip of master at plan rung-8 Terraform real-repo kickoff.
  sha: "3ffbd46fb1c7733e1b34d8666893280454e27436",
  dirname: "terraform-aws-vpc",
};

/** @type {RealRepoPin} */
export const MICROSERVICES_DEMO = {
  name: "GoogleCloudPlatform/microservices-demo",
  url: "https://github.com/GoogleCloudPlatform/microservices-demo.git",
  // Pinned 2026-08-02 — tip of main at plan rung-9 Kubernetes real-repo kickoff.
  sha: "9a4616e77f0f9cbcbecaf27d711c38890dda1404",
  dirname: "microservices-demo",
};

/** @type {RealRepoPin} */
export const HELM_EXAMPLES = {
  name: "helm/examples",
  url: "https://github.com/helm/examples.git",
  // Pinned 2026-08-02 — tip of main at plan rung-10 Helm real-repo kickoff.
  sha: "4888ba8fb8180dd0c36d1e84c1fcafc6efd81532",
  dirname: "helm-examples",
};

/** @type {RealRepoPin} */
export const PODINFO = {
  name: "stefanprodan/podinfo",
  url: "https://github.com/stefanprodan/podinfo.git",
  // Pinned 2026-08-02 — tip of master at plan rung-11 Kustomize real-repo kickoff.
  sha: "eec06d1ea459af4cb4e10e806f8be7c7bd58b361",
  dirname: "podinfo",
};

export const REAL_REPO_ROOT = path.join(repoRoot, ".underdelta-real");

function git(args, cwd, opts = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
  if (result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    const stdout = (result.stdout || "").trim();
    throw new Error(
      `git ${args.join(" ")} failed (exit ${result.status}): ${stderr || stdout || "(no output)"}`,
    );
  }
  return (result.stdout || "").trim();
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {RealRepoPin} pin
 * @returns {Promise<string>} absolute path to the checked-out clone
 */
export async function ensureRealRepo(pin) {
  await mkdir(REAL_REPO_ROOT, { recursive: true });
  const dest = path.join(REAL_REPO_ROOT, pin.dirname);

  if (await exists(path.join(dest, ".git"))) {
    try {
      const head = git(["rev-parse", "HEAD"], dest);
      if (head === pin.sha) {
        return dest;
      }
    } catch {
      // Corrupt / incomplete clone — recreate below.
    }
    await rm(dest, { recursive: true, force: true });
  } else if (await exists(dest)) {
    await rm(dest, { recursive: true, force: true });
  }

  await mkdir(dest, { recursive: true });
  git(["init"], dest);
  git(["remote", "add", "origin", pin.url], dest);
  // Depth-1 fetch of the exact pin keeps the cache small and stable.
  git(["fetch", "--depth", "1", "origin", pin.sha], dest);
  git(["checkout", "--force", "FETCH_HEAD"], dest);
  const head = git(["rev-parse", "HEAD"], dest);
  if (head !== pin.sha) {
    throw new Error(
      `expected ${pin.name} at ${pin.sha}, checked out ${head}`,
    );
  }
  return dest;
}

const PINS_BY_NAME = {
  [REALWORLD_EXPRESS.dirname]: REALWORLD_EXPRESS,
  realworld: REALWORLD_EXPRESS,
  [NEXTJS_SAAS_STARTER.dirname]: NEXTJS_SAAS_STARTER,
  "saas-starter": NEXTJS_SAAS_STARTER,
  nextjs: NEXTJS_SAAS_STARTER,
  [FASTAPI_REALWORLD.dirname]: FASTAPI_REALWORLD,
  fastapi: FASTAPI_REALWORLD,
  "fastapi-realworld": FASTAPI_REALWORLD,
  [HACKATHON_STARTER.dirname]: HACKATHON_STARTER,
  hackathon: HACKATHON_STARTER,
  "hackathon-starter": HACKATHON_STARTER,
  mongo: HACKATHON_STARTER,
  [SWAGGER_PETSTORE.dirname]: SWAGGER_PETSTORE,
  petstore: SWAGGER_PETSTORE,
  "swagger-petstore": SWAGGER_PETSTORE,
  openapi: SWAGGER_PETSTORE,
  [GRAPHQL_CLIENT_EXAMPLE_SERVER.dirname]: GRAPHQL_CLIENT_EXAMPLE_SERVER,
  graphql: GRAPHQL_CLIENT_EXAMPLE_SERVER,
  "graphql-client-example-server": GRAPHQL_CLIENT_EXAMPLE_SERVER,
  "gql-server": GRAPHQL_CLIENT_EXAMPLE_SERVER,
  [EXAMPLE_VOTING_APP.dirname]: EXAMPLE_VOTING_APP,
  voting: EXAMPLE_VOTING_APP,
  "voting-app": EXAMPLE_VOTING_APP,
  "example-voting-app": EXAMPLE_VOTING_APP,
  docker: EXAMPLE_VOTING_APP,
  [TERRAFORM_AWS_VPC.dirname]: TERRAFORM_AWS_VPC,
  vpc: TERRAFORM_AWS_VPC,
  "terraform-aws-vpc": TERRAFORM_AWS_VPC,
  terraform: TERRAFORM_AWS_VPC,
  [MICROSERVICES_DEMO.dirname]: MICROSERVICES_DEMO,
  "microservices-demo": MICROSERVICES_DEMO,
  boutique: MICROSERVICES_DEMO,
  "online-boutique": MICROSERVICES_DEMO,
  kubernetes: MICROSERVICES_DEMO,
  k8s: MICROSERVICES_DEMO,
  [HELM_EXAMPLES.dirname]: HELM_EXAMPLES,
  "helm-examples": HELM_EXAMPLES,
  helm: HELM_EXAMPLES,
  "hello-world": HELM_EXAMPLES,
  [PODINFO.dirname]: PODINFO,
  podinfo: PODINFO,
  kustomize: PODINFO,
  overlays: PODINFO,
};

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const requested = process.argv[2];
  const pins = requested
    ? [PINS_BY_NAME[requested]].filter(Boolean)
    : [
        REALWORLD_EXPRESS,
        NEXTJS_SAAS_STARTER,
        FASTAPI_REALWORLD,
        HACKATHON_STARTER,
        SWAGGER_PETSTORE,
        GRAPHQL_CLIENT_EXAMPLE_SERVER,
        EXAMPLE_VOTING_APP,
        TERRAFORM_AWS_VPC,
        MICROSERVICES_DEMO,
        HELM_EXAMPLES,
        PODINFO,
      ];
  if (requested && pins.length === 0) {
    throw new Error(
      `unknown real-repo pin '${requested}'; known: ${Object.keys(PINS_BY_NAME).join(", ")}`,
    );
  }
  for (const pin of pins) {
    const dest = await ensureRealRepo(pin);
    console.log(`Real repo ready: ${dest} @ ${pin.sha}`);
  }
}
