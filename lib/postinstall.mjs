// Called from the project's own "postinstall" script:
//   node -e "import('@przemeq25/agent-workflow/postinstall').catch(()=>{})"
// It regenerates the tool adapters after every install and never fails the install
// (production installs without dev dependencies simply skip it).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { syncProject } from "./sync.mjs";

const root = process.env.INIT_CWD ?? process.cwd();
// Skipped when the project has no .agents/ (e.g. a deploy upload that excludes it) or on request.
if (
	process.env.AGENT_WORKFLOW_SKIP_POSTINSTALL !== "1" &&
	existsSync(join(root, ".agents"))
) {
	try {
		syncProject(root, { quiet: false });
	} catch (e) {
		console.warn(`[agent-workflow] sync skipped: ${e.message}`);
	}
}
